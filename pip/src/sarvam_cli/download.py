"""Fetch the platform-native Sarvam CLI binary from GitHub Releases.

Python port of npm/install.mjs. Asset names and the release layout are fixed
by .github/workflows/release.yml, so the candidate scheme here must match it:
opencode-{platform}-{arch}{variant}{libc}{ext}.

Unlike the npm wrapper (which writes into the package dir at postinstall),
the binary is cached in a user-writable directory because site-packages may
be root-owned.
"""

import hashlib
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
import zipfile

from . import __version__

REPO = "prashlkam/Sarvam-CLI"
SUPPORTED = {"linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "windows-x64"}


class DownloadError(Exception):
    pass


def _os_name():
    if sys.platform.startswith("linux"):
        return "linux"
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform in ("win32", "cygwin"):
        return "windows"
    return sys.platform


def _arch():
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        return "x64"
    if machine in ("aarch64", "arm64"):
        return "arm64"
    return machine


def _is_musl():
    if _os_name() != "linux":
        return False
    if os.path.exists("/etc/alpine-release"):
        return True
    try:
        proc = subprocess.run(
            ["ldd", "--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        return "musl" in proc.stdout.lower()
    except OSError:
        return False


def _binary_name():
    return "sarvam-cli.exe" if _os_name() == "windows" else "sarvam-cli"


def _cache_dir():
    if _os_name() == "windows":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local")
    else:
        base = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    return os.path.join(base, "sarvam-cli")


def _candidates(os_name, arch):
    ext = ".tar.gz" if os_name == "linux" else ".zip"
    variants = ["", "-baseline"] if arch == "x64" else [""]
    libcs = ["-musl"] if os_name == "linux" and _is_musl() else [""]
    return [
        "opencode-{}-{}{}{}{}".format(os_name, arch, variant, libc, ext)
        for libc in libcs
        for variant in variants
    ]


def _fetch_checksums():
    """Return {asset_name: sha256} from the release's checksums.txt, or {} if unavailable."""
    url = "https://github.com/{}/releases/download/v{}/checksums.txt".format(REPO, __version__)
    try:
        with urllib.request.urlopen(url, timeout=30) as res:
            text = res.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError):
        return {}
    sums = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2:
            sums[parts[1]] = parts[0]
    return sums


def _extract_binary(archive_path, tmp_dir):
    """Extract the archive into tmp_dir and return the path to the binary, or None."""
    if archive_path.endswith(".tar.gz"):
        with tarfile.open(archive_path, "r:gz") as tf:
            try:
                tf.extractall(tmp_dir, filter="data")
            except TypeError:  # Python < 3.12: no filter= kwarg
                tf.extractall(tmp_dir)
    else:
        with zipfile.ZipFile(archive_path) as zf:
            zf.extractall(tmp_dir)
    binary = _binary_name()
    for root, _dirs, files in os.walk(tmp_dir):
        if binary in files:
            return os.path.join(root, binary)
    return None


def _try_download(asset, dest, checksums):
    url = "https://github.com/{}/releases/download/v{}/{}".format(REPO, __version__, asset)
    tmp_dir = tempfile.mkdtemp(prefix="sarvam-cli-")
    try:
        archive_path = os.path.join(tmp_dir, asset)
        try:
            with urllib.request.urlopen(url, timeout=60) as res, open(archive_path, "wb") as out:
                shutil.copyfileobj(res, out)
        except (urllib.error.URLError, OSError):
            return False

        expected = checksums.get(asset)
        if expected:
            digest = hashlib.sha256()
            with open(archive_path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                print("sarvam-cli: checksum mismatch for {}, skipping".format(asset), file=sys.stderr)
                return False

        found = _extract_binary(archive_path, tmp_dir)
        if not found:
            return False

        dest_dir = os.path.dirname(dest)
        os.makedirs(dest_dir, exist_ok=True)
        # Stage next to the destination so os.replace() is atomic (same filesystem),
        # which keeps concurrent first-runs from seeing a half-written binary.
        fd, staged = tempfile.mkstemp(prefix=".sarvam-cli-", dir=dest_dir)
        os.close(fd)
        shutil.move(found, staged)
        if _os_name() != "windows":
            os.chmod(staged, 0o755)
        os.replace(staged, dest)
        return True
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _cleanup_old_versions(cache_root, current):
    try:
        entries = os.listdir(cache_root)
    except OSError:
        return
    for entry in entries:
        if entry.startswith("v") and entry != current:
            shutil.rmtree(os.path.join(cache_root, entry), ignore_errors=True)


def ensure_binary():
    """Return the path to the native binary, downloading it on first run."""
    override = os.environ.get("SARVAM_CLI_BINARY")
    if override:
        if not os.path.exists(override):
            raise DownloadError("SARVAM_CLI_BINARY points to a missing file: {}".format(override))
        return override

    cache_root = _cache_dir()
    version_dir = "v{}".format(__version__)
    dest = os.path.join(cache_root, version_dir, _binary_name())
    if os.path.exists(dest):
        return dest

    os_name, arch = _os_name(), _arch()
    if "{}-{}".format(os_name, arch) not in SUPPORTED:
        raise DownloadError(
            "unsupported platform {}-{}. "
            "See https://github.com/{}/releases".format(os_name, arch, REPO)
        )

    print(
        "sarvam-cli: downloading native binary v{} (first run only)...".format(__version__),
        file=sys.stderr,
    )
    checksums = _fetch_checksums()
    for asset in _candidates(os_name, arch):
        if _try_download(asset, dest, checksums):
            _cleanup_old_versions(cache_root, version_dir)
            return dest

    raise DownloadError(
        "could not download a binary for {}-{} (v{}). "
        "Check your network (HTTPS_PROXY is honored), or download manually from "
        "https://github.com/{}/releases and point SARVAM_CLI_BINARY at it.".format(
            os_name, arch, __version__, REPO
        )
    )
