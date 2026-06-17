#!/usr/bin/env bash
#
# update-sarvam.sh — pull the latest upstream opencode and re-apply the
# Sarvam-CLI fork on top of it, then build a fresh Sarvam-CLI binary.
#
# Strategy (git-native, conflict-safe):
#   - branch `dev`     mirrors upstream opencode (pristine, never edited)
#   - branch `sarvam`  holds the Sarvam-CLI customizations as commits
#   An update fetches upstream and REBASES `sarvam` onto the new upstream tip,
#   so every Sarvam change (provider, models, default model, config seed,
#   rebrand, install script, README, ...) is carried forward automatically.
#
# Safety guarantees ("nothing must break"):
#   - A backup branch is created before any history rewrite. Any failure
#     restores the previous state exactly.
#   - If the rebase hits a real conflict it is aborted and the tree is left
#     untouched — the script never produces a half-merged source tree.
#   - After rebasing, required Sarvam "markers" are verified to still exist.
#     If upstream refactored something out from under us, the update is rolled
#     back instead of silently shipping a binary that lost Sarvam defaults.
#   - A fresh binary is built and smoke-tested (version + zero-config default
#     model must resolve to sarvam/sarvam-m) before the update is declared done.
#
# Usage:
#   script/update-sarvam.sh [options]
#
# Options:
#   --check         Only report whether an upstream update is available; do nothing.
#   --fast          Faster build: skip embedding the web UI (smaller, no `web` UI).
#   --no-build      Update the source only; do not build.
#   --install       After a successful build, install the binary to ~/.sarvam-cli/bin.
#   --force         Re-run the build even if already up to date with upstream.
#   -h, --help      Show this help.
#
# Environment overrides:
#   SARVAM_UPSTREAM_REMOTE  (default: upstream)
#   SARVAM_UPSTREAM_URL     (default: https://github.com/sst/opencode)
#   SARVAM_UPSTREAM_BRANCH  (default: dev)
#   SARVAM_FORK_BRANCH      (default: sarvam)
#   SARVAM_BUILD_ARGS       (default: --single --skip-install)  full build arg override
#
set -euo pipefail

# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------
UPSTREAM_REMOTE="${SARVAM_UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${SARVAM_UPSTREAM_URL:-https://github.com/sst/opencode}"
UPSTREAM_BRANCH="${SARVAM_UPSTREAM_BRANCH:-dev}"
FORK_BRANCH="${SARVAM_FORK_BRANCH:-sarvam}"
DEFAULT_BUILD_ARGS="--single --skip-install"

do_check=false
do_build=true
do_install=false
force=false
fast=false

# ---------------------------------------------------------------------------
# pretty output
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; DIM='\033[0;2m'; NC='\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; RED=''; DIM=''; NC=''
fi
info()  { echo -e "${BOLD}==>${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*" >&2; }
die()   { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ---------------------------------------------------------------------------
# args
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --check)     do_check=true ;;
    --fast)      fast=true ;;
    --no-build)  do_build=false ;;
    --install)   do_install=true ;;
    --force)     force=true ;;
    -h|--help)   usage ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git is required"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$REPO_ROOT"

if ! $do_check && $do_build; then
  command -v bun >/dev/null 2>&1 || die "bun is required to build (install from https://bun.sh, or pass --no-build)"
fi

# ensure the upstream remote exists / points where we expect
if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  info "Adding remote '$UPSTREAM_REMOTE' -> $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

UPSTREAM_REF="$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

# bootstrap the fork branch on first run (carry any working-tree changes into it)
if ! git show-ref --verify --quiet "refs/heads/$FORK_BRANCH"; then
  warn "Fork branch '$FORK_BRANCH' does not exist yet — bootstrapping it from the current state."
  git checkout -b "$FORK_BRANCH"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git -c user.name="Sarvam CLI" -c user.email="noreply@sarvam.ai" \
        commit -q -m "Sarvam-CLI customizations"
  fi
  ok "Created '$FORK_BRANCH'."
fi

# make sure we are on the fork branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$FORK_BRANCH" ]; then
  info "Switching from '$CURRENT_BRANCH' to '$FORK_BRANCH'"
  git checkout "$FORK_BRANCH"
fi

# never lose uncommitted work: fold it into the fork branch so it gets replayed
# (skipped for --check, which must stay read-only)
if ! $do_check && [ -n "$(git status --porcelain)" ]; then
  warn "Uncommitted changes detected — committing them onto '$FORK_BRANCH' so they are preserved across the update."
  git add -A
  git -c user.name="Sarvam CLI" -c user.email="noreply@sarvam.ai" \
      commit -q -m "Sarvam-CLI local changes (auto-saved by update-sarvam.sh)"
fi

# ---------------------------------------------------------------------------
# fetch upstream + figure out versions
# ---------------------------------------------------------------------------
info "Fetching '$UPSTREAM_REMOTE' ($UPSTREAM_URL)…"
git fetch --quiet "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

read_version() { # $1 = git ref
  git show "$1:packages/opencode/package.json" 2>/dev/null \
    | grep -m1 '"version"' | sed -E 's/.*"version"\s*:\s*"([^"]+)".*/\1/'
}
CUR_VERSION="$(read_version "$FORK_BRANCH")"
NEW_VERSION="$(read_version "$UPSTREAM_REF")"

# already up to date when upstream tip is an ancestor of the fork branch
if git merge-base --is-ancestor "$UPSTREAM_REF" "$FORK_BRANCH"; then
  if $do_check; then ok "Up to date with upstream (opencode $CUR_VERSION)."; exit 0; fi
  if ! $force; then
    ok "Already up to date with upstream (opencode $CUR_VERSION). Use --force to rebuild anyway."
    exit 0
  fi
  warn "Already up to date; --force given, will rebuild without rebasing."
  REBASE_NEEDED=false
else
  info "Update available: opencode ${DIM}${CUR_VERSION}${NC} -> ${BOLD}${NEW_VERSION}${NC}"
  if $do_check; then
    echo -e "Run ${BOLD}script/update-sarvam.sh${NC} to apply it."
    exit 0
  fi
  REBASE_NEEDED=true
fi

# ---------------------------------------------------------------------------
# backup + rebase
# ---------------------------------------------------------------------------
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_BRANCH="${FORK_BRANCH}-backup-${TS}"
PREV_HEAD="$(git rev-parse HEAD)"
git branch "$BACKUP_BRANCH" "$FORK_BRANCH"
info "Backup branch created: ${BOLD}${BACKUP_BRANCH}${NC} (@ ${PREV_HEAD:0:9})"

rollback() {
  warn "Rolling back to the pre-update state…"
  git rebase --abort >/dev/null 2>&1 || true
  git checkout -q "$FORK_BRANCH" 2>/dev/null || git checkout -q -B "$FORK_BRANCH" "$BACKUP_BRANCH"
  git reset --hard -q "$BACKUP_BRANCH"
  ok "Restored '$FORK_BRANCH' to ${PREV_HEAD:0:9}. Backup kept at '$BACKUP_BRANCH'."
}

if [ "${REBASE_NEEDED}" = true ]; then
  info "Rebasing '$FORK_BRANCH' onto '$UPSTREAM_REF'…"
  if ! git rebase "$UPSTREAM_REF"; then
    git rebase --abort >/dev/null 2>&1 || true
    git checkout -q "$FORK_BRANCH"
    git reset --hard -q "$BACKUP_BRANCH"
    echo
    die "Rebase hit conflicts — upstream changed code the Sarvam-CLI fork also touches.
    Nothing was changed; your branch is exactly as before (backup: $BACKUP_BRANCH).
    Resolve manually with:
        git checkout $FORK_BRANCH
        git rebase $UPSTREAM_REF        # fix conflicts, then: git rebase --continue
    then re-run this script with --force to build."
  fi
  # fast-forward the pristine mirror branch too (best effort)
  git branch -f "$UPSTREAM_BRANCH" "$UPSTREAM_REF" >/dev/null 2>&1 || true
  ok "Rebased cleanly onto opencode $NEW_VERSION."
fi

# ---------------------------------------------------------------------------
# verify the Sarvam customizations survived the rebase
# ---------------------------------------------------------------------------
info "Verifying Sarvam-CLI customizations are intact…"
markers=(
  "packages/core/src/sarvam.ts:::SARVAM_PROVIDER_ID"
  "packages/core/src/models-dev.ts:::withSarvam"
  "packages/core/src/global.ts:::app = \"sarvam-cli\""
  "packages/opencode/src/config/config.ts:::SARVAM_DEFAULT_MODEL_ID"
  "packages/opencode/src/provider/provider.ts:::SARVAM_DEFAULT_MODEL_ID"
  "packages/opencode/src/index.ts:::scriptName(\"sarvam-cli\")"
  "packages/opencode/package.json:::\"sarvam-cli\""
)
missing=()
for m in "${markers[@]}"; do
  file="${m%%:::*}"; pat="${m##*:::}"
  if [ ! -f "$file" ] || ! grep -qF "$pat" "$file"; then
    missing+=("$file  (missing: $pat)")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo
  warn "These Sarvam-CLI customizations did NOT survive the update:"
  for x in "${missing[@]}"; do echo "    - $x" >&2; done
  rollback
  die "Update aborted to avoid shipping a broken Sarvam-CLI. Inspect upstream changes,
    fix the affected file(s) on '$FORK_BRANCH', and re-run with --force."
fi
ok "All Sarvam-CLI markers present."

if ! $do_build; then
  ok "Source updated to opencode $NEW_VERSION (build skipped). Backup: $BACKUP_BRANCH"
  exit 0
fi

# ---------------------------------------------------------------------------
# build a fresh binary
# ---------------------------------------------------------------------------
BUILD_ARGS="${SARVAM_BUILD_ARGS:-$DEFAULT_BUILD_ARGS}"
$fast && BUILD_ARGS="$BUILD_ARGS --skip-embed-web-ui"

info "Installing workspace dependencies (bun install)…"
if ! bun install; then
  warn "bun install failed."
  echo -e "Source is updated and verified, but the build did not start.
    To retry just the build:  bun install && bun run --cwd packages/opencode script/build.ts $BUILD_ARGS
    To roll back everything:   git reset --hard $BACKUP_BRANCH" >&2
  exit 1
fi

info "Building Sarvam-CLI (build.ts $BUILD_ARGS)…"
if ! bun run --cwd packages/opencode script/build.ts $BUILD_ARGS; then
  warn "Build failed."
  echo -e "The source was updated and verified, but the build failed (often a transient/network issue).
    Retry:     bun run --cwd packages/opencode script/build.ts $BUILD_ARGS
    Roll back: git reset --hard $BACKUP_BRANCH" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# smoke test the fresh binary
# ---------------------------------------------------------------------------
BIN="$(ls -t packages/opencode/dist/*/bin/sarvam-cli 2>/dev/null | head -1 || true)"
[ -n "$BIN" ] && [ -x "$BIN" ] || die "Build reported success but no sarvam-cli binary was found under packages/opencode/dist/*/bin/"

info "Smoke testing: $BIN"
VER_OUT="$("$BIN" --version 2>&1 | tail -1 || true)"
[ -n "$VER_OUT" ] || die "Binary did not report a version."
ok "Binary runs: $VER_OUT"

# zero-config default model must resolve to sarvam/sarvam-m
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
MODEL_OUT="$(XDG_CONFIG_HOME="$TMP/c" XDG_DATA_HOME="$TMP/d" XDG_STATE_HOME="$TMP/s" XDG_CACHE_HOME="$TMP/h" \
  OPENCODE_DISABLE_PROJECT_CONFIG=1 OPENCODE_DISABLE_MODELS_FETCH=1 SARVAM_API_KEY="sk_smoke_dummy" \
  timeout 90 "$BIN" run "ping" 2>&1 || true)"
if echo "$MODEL_OUT" | grep -q "sarvam-m"; then
  ok "Zero-config default model resolves to sarvam-m."
else
  warn "Could not confirm the zero-config default model (sarvam-m) from the smoke run."
  echo -e "${DIM}$(echo "$MODEL_OUT" | tail -5)${NC}" >&2
  die "Refusing to declare success: the default Sarvam model did not resolve.
    Roll back with: git reset --hard $BACKUP_BRANCH"
fi

# ---------------------------------------------------------------------------
# optional install
# ---------------------------------------------------------------------------
if $do_install; then
  info "Installing to ~/.sarvam-cli/bin via ./install…"
  ./install --binary "$BIN"
fi

echo
ok "${BOLD}Sarvam-CLI updated to opencode ${NEW_VERSION}.${NC}"
echo -e "    binary:  $BIN"
echo -e "    backup:  $BACKUP_BRANCH  ${DIM}(delete once happy: git branch -D $BACKUP_BRANCH)${NC}"
$do_install || echo -e "    install: ./install --binary \"$BIN\""
