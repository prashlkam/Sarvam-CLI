#!/usr/bin/env bash
#
# archive-release.sh — package the binaries built by packages/cli/script/build.ts
# into the release archives that the Sarvam-CLI installers expect.
#
# Upstream opencode 2.x split building from publishing: build.ts only writes
# per-target binaries into packages/cli/dist/<target>/bin/, and publish.ts
# archives them for npm/AUR/Homebrew. This fork ships GitHub Release assets
# instead, so it does its own archiving here.
#
# Naming contract (consumed by ./install, npm/install.mjs and
# pip/src/sarvam_cli/download.py — change all four together):
#
#   asset:  opencode-<os>-<arch>[-baseline][-musl].tar.gz   (linux)
#           opencode-<os>-<arch>[-baseline].zip             (darwin/windows)
#   member: sarvam-cli  (sarvam-cli.exe on windows), at the archive root
#
# build.ts names its output directories cli-<os>-<arch>…; the `opencode-` asset
# prefix is upstream's target naming, kept so the installers' candidate lists
# stay valid.
#
# Usage:
#   script/archive-release.sh [--dist <dir>] [--out <dir>]
#
#   --dist  directory holding the per-target build output
#           (default: packages/cli/dist)
#   --out   directory to write archives and checksums.txt into
#           (default: same as --dist)
set -euo pipefail

DIST="packages/cli/dist"
OUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dist) DIST="${2:?--dist needs a directory}"; shift 2 ;;
    --out)  OUT="${2:?--out needs a directory}"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }
[ -d "$DIST" ] || { echo "No build output at $DIST — run the build first." >&2; exit 1; }

OUT="${OUT:-$DIST}"
mkdir -p "$OUT"
DIST_ABS="$(cd "$DIST" && pwd)"
OUT_ABS="$(cd "$OUT" && pwd)"

count=0
for dir in "$DIST_ABS"/cli-*; do
  [ -d "$dir/bin" ] || continue
  target="$(basename "$dir")"
  # cli-linux-x64-musl -> linux-x64-musl
  suffix="${target#cli-}"
  # Windows is the only target that carries an extension.
  case "$suffix" in
    windows-*) member="sarvam-cli.exe" ;;
    *)         member="sarvam-cli" ;;
  esac
  [ -f "$dir/bin/$member" ] || { echo "Missing $member in $dir/bin" >&2; exit 1; }
  [ -s "$dir/bin/$member" ] || { echo "Empty binary: $dir/bin/$member" >&2; exit 1; }
  chmod 755 "$dir/bin/$member"

  case "$suffix" in
    linux-*)
      asset="opencode-${suffix}.tar.gz"
      # Fixed ownership and timestamps so re-runs produce identical archives.
      tar --mtime=@0 --owner=0 --group=0 --numeric-owner \
          -czf "$OUT_ABS/$asset" -C "$dir/bin" "$member"
      ;;
    *)
      command -v zip >/dev/null 2>&1 || { echo "zip is required for $suffix" >&2; exit 1; }
      asset="opencode-${suffix}.zip"
      rm -f "$OUT_ABS/$asset"
      (cd "$dir/bin" && zip -X -q "$OUT_ABS/$asset" "$member")
      ;;
  esac
  echo "archived $asset"
  count=$((count + 1))
done

[ "$count" -gt 0 ] || { echo "No cli-* target directories found in $DIST_ABS" >&2; exit 1; }

cd "$OUT_ABS"
# shellcheck disable=SC2035
sha256sum opencode-*.tar.gz opencode-*.zip 2>/dev/null | sed 's#\./##' > checksums.txt
echo "wrote $OUT_ABS/checksums.txt ($count archive(s))"
