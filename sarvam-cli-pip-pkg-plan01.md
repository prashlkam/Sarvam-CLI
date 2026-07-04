# Sarvam-CLI pip Package — Implementation Plan (v1)

Goal: `pip install sarvam-cli` gives users the `sarvam-cli` and `sarvam` commands,
exactly like the npm wrapper (`npm install -g sarvam-cli`) does today. The Python
package must stay a **thin wrapper** — the real product is the platform-native
binary published to GitHub Releases by `.github/workflows/release.yml`; the pip
package's only job is to fetch and launch it.

This plan mirrors the npm design in `npm/` (package.json + install.mjs +
bin/sarvam-cli.mjs) and reuses the same release assets, versioning scheme, and
CI trigger. Nothing about the release workflow's binary-build phase changes.

---

## 0. Key design decision: how the binary gets to the user

npm has a `postinstall` hook, so `install.mjs` downloads the binary at install
time. **pip has no reliable equivalent** — `setup.py` install hooks don't run
for wheels (the modern default), and PEP 517/518 builds actively discourage
network access at install time. Three viable strategies:

| Strategy | How | Pros | Cons |
|---|---|---|---|
| A. **Lazy download on first run** (recommended) | Pure-Python wheel; the entry point checks for the cached binary and downloads it on first invocation | One universal wheel; identical to how the npm wrapper degrades gracefully; no build matrix; works with wheels, pipx, uv | First run needs network + a short wait; corporate proxies may need env-var support |
| B. Platform-specific wheels with binary embedded | CI builds one wheel per platform (`manylinux_x86_64`, `macosx_arm64`, `win_amd64`, …) with the ~170 MB binary inside | Fully offline after install; instant first run | 5+ wheels × ~55 MB compressed each per release; PyPI default project quota (10 GB) burns fast; must request size-limit increases (PyPI hard-caps files at 100 MB — **the binary may not even fit**) |
| C. sdist with custom build backend that downloads during install | Custom PEP 517 backend fetches binary in `build_wheel` | Feels like npm postinstall | Fragile, breaks under `--no-build-isolation`, offline mirrors, and most corporate setups; widely considered an anti-pattern |

**Decision: Strategy A (lazy download on first run).** PyPI's 100 MB per-file
limit makes Strategy B a non-starter for a ~170 MB binary without an approved
exception, and Strategy C is fragile. Strategy A also matches precedent from
tools like `playwright` (downloads browsers on demand) and `maturin`-adjacent
launchers.

Consequence to document in the README: the first `sarvam-cli` invocation
downloads ~55 MB from GitHub Releases; subsequent runs are instant.

---

## 1. Package layout

New top-level directory `pip/` (sibling of `npm/`, same role):

```
pip/
├── pyproject.toml          # all metadata; hatchling or setuptools backend
├── README.md               # PyPI-facing readme (short; links to repo)
├── LICENSE                 # MIT, copied from repo root at build time or vendored
└── src/
    └── sarvam_cli/
        ├── __init__.py     # __version__ = "X.Y.Z" (single source, patched by CI)
        ├── __main__.py     # enables `python -m sarvam_cli`
        ├── cli.py          # entry point: ensure_binary() then exec
        └── download.py     # platform detection + GitHub Release fetch + cache
```

### pyproject.toml essentials

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "sarvam-cli"
version = "1.17.13"                  # kept in lockstep with npm/package.json — CI patches it
description = "Sarvam CLI — an AI coding agent for the terminal, powered by Sarvam AI. A fork of opencode."
readme = "README.md"
license = "MIT"
requires-python = ">=3.9"
authors = [{ name = "Prashanth Kamath" }]
keywords = ["cli", "ai", "coding-assistant", "sarvam", "opencode"]
classifiers = [
  "Environment :: Console",
  "Intended Audience :: Developers",
  "Operating System :: POSIX :: Linux",
  "Operating System :: MacOS",
  "Operating System :: Microsoft :: Windows",
  "Programming Language :: Python :: 3",
]

[project.urls]
Homepage = "https://github.com/prashlkam/Sarvam-CLI"
Repository = "https://github.com/prashlkam/Sarvam-CLI"
Issues = "https://github.com/prashlkam/Sarvam-CLI/issues"

[project.scripts]
sarvam-cli = "sarvam_cli.cli:main"
sarvam = "sarvam_cli.cli:main"
```

Notes:
- **Zero runtime dependencies.** Use only stdlib (`urllib.request`, `tarfile`,
  `zipfile`, `platform`, `subprocess`, `os`). This keeps installs instant and
  avoids dependency conflicts in users' environments.
- PyPI project name `sarvam-cli`, import package `sarvam_cli` (PEP 503
  normalization means `pip install sarvam-cli` and `sarvam_cli` are the same
  project name — no conflict).
- `requires-python = ">=3.9"` — nothing in the wrapper needs newer.

---

## 2. download.py — port of npm/install.mjs

Reimplement `npm/install.mjs`'s logic 1:1 in Python. The GitHub Release assets
and naming scheme are already fixed by the release workflow, so this module
must match them exactly:

- `REPO = "prashlkam/Sarvam-CLI"`
- Asset names: `opencode-{platform}-{arch}{variant}{libc}{ext}` where
  - platform: `linux` / `darwin` / `windows` (`sys.platform` → map `win32`→`windows`)
  - arch: `x64` / `arm64` (`platform.machine()` → map `x86_64`/`AMD64`→`x64`, `aarch64`/`arm64`→`arm64`)
  - variant: `""` then `"-baseline"` fallback (x64 only)
  - libc: `"-musl"` on musl Linux (detect via `/etc/alpine-release` or absence of glibc in `platform.libc_ver()` / probing `ldd --version`)
  - ext: `.tar.gz` (linux) / `.zip` (darwin, windows)
- Supported set: `linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64`
  — error with a clear message otherwise.
- Download URL: `https://github.com/{REPO}/releases/download/v{__version__}/{asset}`
- Extract with `tarfile`/`zipfile` (stdlib — do NOT shell out to `tar` like the
  mjs version does; Python doesn't need to). Use `tarfile.data_filter` when
  available (Python ≥3.12 or backport behavior) to be safe against path traversal.
- Binary inside the archive: `sarvam-cli` / `sarvam-cli.exe`.

### Cache location (differs from npm — must be user-writable)

npm puts the binary inside the package dir; pip site-packages may be
root-owned (system Python) so **do not write into the package directory**.
Cache instead under:

- Linux/macOS: `${XDG_CACHE_HOME:-~/.cache}/sarvam-cli/v{version}/sarvam-cli`
- Windows: `%LOCALAPPDATA%\sarvam-cli\v{version}\sarvam-cli.exe`

Versioned subdirectory ⇒ upgrading the pip package automatically triggers a
fresh download; old versions can be cleaned opportunistically (delete sibling
`v*` dirs after a successful download).

Download hygiene:
- Download to a temp file in the same directory, then `os.replace()` into place
  (atomic; safe against concurrent first-runs).
- `chmod 0o755` on POSIX.
- Honor `SARVAM_CLI_BINARY` env var as an override path (power users / air-gapped
  installs) — check it before cache.
- Optional: verify against `checksums.txt` from the same release (the workflow
  already uploads it) — nice-to-have, include if trivial.

---

## 3. cli.py — port of npm/bin/sarvam-cli.mjs

```
main():
  1. binary = ensure_binary()        # from download.py; downloads on miss with a
     # one-line progress message to stderr ("sarvam-cli: downloading native binary vX.Y.Z…")
  2. POSIX: os.execv(binary, [binary] + sys.argv[1:])   # replace process — signals,
     # exit codes, and TTY behavior pass through exactly like the npm spawnSync approach but cleaner
     Windows: subprocess.run([binary] + sys.argv[1:]); sys.exit(returncode)
     # (no execv on Windows — emulate npm wrapper's spawnSync there)
  3. On download failure: print the same style of actionable error the npm
     wrapper prints (reinstall hint + releases URL) and exit 1.
```

`__main__.py` is just `from .cli import main; main()`.

---

## 4. Local build & test procedure (the pip analog of what we did for npm)

1. **Build**: `cd pip && python -m build` (needs `pip install build`) → produces
   `dist/sarvam_cli-1.17.13-py3-none-any.whl` + sdist. Universal wheel, ~10 KB.
2. **Inspect** (analog of `tar -tzf` on the npm tarball):
   `unzip -l dist/*.whl` — confirm only the `sarvam_cli/` package + metadata,
   no stray files.
3. **Lint/quality**:
   - `python -m compileall src/` (syntax),
   - `ruff check src/` (fast, zero-config linting; dev-only tool, not a dependency),
   - `twine check dist/*` (validates metadata renders on PyPI — the pip analog
     of the `npm publish --dry-run` sanity pass).
4. **Install locally**: `pipx install dist/*.whl` (or
   `pip install --user dist/*.whl`). pipx is the recommended install method to
   document, since this is an application, not a library.
5. **Smoke test**:
   - `sarvam-cli --version` → first run downloads from the v1.17.13 GitHub
     Release (which exists now), then prints the version;
   - second run is instant (cache hit);
   - `sarvam --version` (alias) works;
   - `SARVAM_CLI_BINARY=/path/to/local/build sarvam-cli --version` bypasses download
     (test with `packages/opencode/dist/opencode-linux-x64/bin/sarvam-cli`).
6. **Uninstall/reinstall** round-trip to confirm no leftovers break anything.

Lesson learned from the npm round: the npm package's first failure was assets
missing from the artifact (`files` array). The pip equivalent failure mode is
the wheel missing the package (bad `[tool.hatch.build]` config or wrong src
layout) — step 2 exists specifically to catch that before any install attempt.

---

## 5. Publishing to PyPI

### One-time setup (manual, in browser)
1. Create account on https://pypi.org (and https://test.pypi.org for rehearsal).
2. Enable 2FA (PyPI **requires** it for new-project uploads; authenticator app,
   same TOTP flow as npm — no hardware key needed).
3. Create an **API token**: pypi.org → Account settings → API tokens →
   initially scoped "entire account" (needed for a first-ever upload of a new
   project), then after first publish, replace with a token scoped to just
   `sarvam-cli`. Tokens start with `pypi-`.

### Rehearsal (recommended once)
```bash
twine upload --repository testpypi dist/*
pipx install --index-url https://test.pypi.org/simple/ sarvam-cli
```

### Real publish (manual path)
```bash
cd pip
python -m build
twine check dist/*
twine upload dist/*        # username: __token__, password: pypi-...
```

Publish **both** the wheel and the sdist.

### Ordering constraint (learned the hard way with npm)
Publish to PyPI only **after** the matching `vX.Y.Z` GitHub Release exists with
binaries attached — otherwise first-run download fails for everyone. Since
v1.17.13's release is already built, 1.17.13 can be the first PyPI version.

---

## 6. CI integration — extend .github/workflows/release.yml

Add a `publish-pypi` job mirroring the existing `publish-npm` job:

- `needs: release`, same repo guard (`github.repository == 'prashlkam/Sarvam-CLI'`).
- Guard on a `PYPI_TOKEN` secret existing (self-skip otherwise, same pattern as
  the NPM_TOKEN guard, so releases don't fail before PyPI is configured).
- Steps: setup-python (3.12) → patch version from tag into `pip/pyproject.toml`
  **and** `src/sarvam_cli/__init__.py` (same `${GITHUB_REF_NAME#v}` scheme) →
  `pip install build twine` → `python -m build` → `twine check` →
  `twine upload` with `TWINE_USERNAME=__token__`, `TWINE_PASSWORD=${{ secrets.PYPI_TOKEN }}`.
- **Better alternative once the project exists on PyPI**: switch to [Trusted
  Publishing](https://docs.pypi.org/trusted-publishers/) (OIDC) — no long-lived
  secret at all, configured on PyPI's side to trust this repo+workflow. Plan:
  use the token for the first release, then migrate to trusted publishing and
  delete the token. This is strictly better than the npm token situation.

Version single-sourcing rule: git tag `vX.Y.Z` is the source of truth; CI stamps
it into npm/package.json (already done) and pip/pyproject.toml + __init__.py
(new). Committed values just need to be reasonable defaults.

---

## 7. Documentation updates

- README.md install section gains:
  ```bash
  # pipx (recommended for Python users)
  pipx install sarvam-cli
  # or plain pip
  pip install sarvam-cli
  ```
  plus a note about the first-run binary download and the `SARVAM_CLI_BINARY`
  override.
- Note the npm and pip packages are equivalent wrappers over the same binary —
  install either, not both (both register `sarvam`/`sarvam-cli` on PATH; last
  one installed wins, harmlessly, but it's confusing).

---

## 8. Execution checklist (ordered)

1. [ ] Scaffold `pip/` directory: pyproject.toml, src layout, README, LICENSE.
2. [ ] Implement `download.py` (platform detect, asset candidates, fetch,
       extract, cache, atomic install, env override).
3. [ ] Implement `cli.py` + `__main__.py` entry points.
4. [ ] Local: build wheel, inspect contents, ruff + twine check.
5. [ ] Local smoke test via `SARVAM_CLI_BINARY` override (no network needed).
6. [ ] Local end-to-end test: pipx install the wheel, let it really download
       from the v1.17.13 GitHub Release, run `--version` twice (cold/warm).
7. [ ] PyPI account + 2FA + token (user action, browser).
8. [ ] (Optional) TestPyPI rehearsal.
9. [ ] `twine upload` of 1.17.13 (wheel + sdist).
10. [ ] Post-publish verify from a clean venv/machine: `pipx install sarvam-cli && sarvam-cli --version`.
11. [ ] Add `publish-pypi` job to release.yml with PYPI_TOKEN guard; commit.
12. [ ] After first CI-driven release: configure PyPI Trusted Publishing,
        switch the job to it, revoke the token.
13. [ ] README install-section update (fold into the planned single README pass
        from short-term-improvement-plan.md if that hasn't landed yet).
14. [ ] Add `pip/dist/` and `pip/**/__pycache__/` to .gitignore.

## Risks / open questions

- **musl detection in Python** is less clean than in Node (no
  `process.report`); `ldd --version` probing or checking `platform.libc_ver()`
  plus `/etc/alpine-release` covers practical cases. Acceptable: default to
  glibc asset, fall back to `-musl` candidate on extraction/exec failure.
- **PyPI name availability**: `sarvam-cli` must be unclaimed on PyPI — verify
  early (`pip index versions sarvam-cli` or check pypi.org/project/sarvam-cli)
  before building everything around the name. If taken, fallback name decision
  needed (e.g. `sarvam-cli-app`) — affects step 1.
- **Windows execv semantics**: subprocess relay means Ctrl+C handling needs
  care (ignore SIGINT in the parent while the child runs) — small, known fix.
- **Corporate proxies**: stdlib `urllib` honors `HTTPS_PROXY` env var by
  default — document it; no code needed.
