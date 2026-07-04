# Sarvam-CLI — Short-Term Improvement Plan

Five improvements, **ordered so no feature has to be redone** to reach the final
outcome. Nothing here is implemented yet; this is the plan only.

### The ordering principle (why this order)

In a naive "easiest-first" order the README work lands first — but the README's
badges and links point at things that don't exist yet (the npm package, the release
workflow, the model table, the `doctor` command). Finalizing it first forces a
second visit once those land. So:

- **All README edits are consolidated into one final pass (Feature 5).** Every other
  feature *defers* its README change to that pass instead of editing `README.md`
  itself. This is the single biggest source of avoided rework — `README.md` is
  written exactly once, against final reality.
- Features that **produce destinations** the README points to (the package, the
  release, the model table, the doctor command) all come **before** that final pass.
- Among the independent features, ties are broken by ease (easy → hard).

**Implementation order:** 1 Trim translations → 2 Model defaults + fallback →
3 `doctor` command → 4 Release + package → 5 README consolidation (last).

Each feature is touched once; nothing is revisited.

### Quick reference (verified against the current tree)

- README + 21 translations: `README.md`, `README.<lang>.md` at repo root.
- Locale auto-sync workflow: `.github/workflows/docs-locale-sync.yml` (regenerates
  translations).
- Baked-in Sarvam provider + models: `packages/core/src/sarvam.ts`.
- Default-model / small-model resolution (fallback logic): `packages/opencode/src/provider/provider.ts`
  (`getSmallModel`, `defaultModel`).
- CLI command registration: `packages/opencode/src/cli/cmd/` + wired in
  `packages/opencode/src/index.ts` (`.command(XCommand)`).
- Binary build: `bun run --cwd packages/opencode script/build.ts --single`.
- Package manifest: `packages/opencode/package.json` (currently `"name": "opencode"`,
  `"private": true`, `bin` → `sarvam-cli`/`sarvam`).
- Upstream release pipeline: `.github/workflows/publish.yml` — gated
  `if: github.repository == 'anomalyco/opencode'`, so it does **not** run on this fork.

---

## 1. Trim the inherited translated READMEs  *(first — easy, unblocks the README pass)*

**Why first:** it's the only file-level cleanup the final README pass depends on —
deleting the stale translations *now* means the consolidated README edit later writes
into the final kept set only (no editing files that get deleted, no re-mirroring).
It's also self-contained (file deletions + one workflow change) and touches no code.

**Current state:** 21 translations at repo root (`ar, bn, br, bs, da, de, es, fr,
gr, it, ja, ko, no, pl, ru, th, tr, uk, vi, zh, zht`), all upstream's and drifting
from the Sarvam rebrand.

**Plan:**
1. **Delete** the non-kept translations (or move them to `docs/i18n-upstream/` with a
   one-line "upstream opencode translation — may be stale" banner if outright deletion
   feels heavy-handed).
2. **Keep** `README.md` (English). Optionally **add** `README.hi.md` (Hindi/Indic)
   later for sovereign-AI positioning — note this is an *add*, not a keep (no
   `README.hi.md` exists today); deferrable.
3. **Disable/adjust `docs-locale-sync.yml`** in the **same change** — otherwise it
   regenerates the deleted files on its next run and undoes this work. Either remove
   the workflow or restrict its language matrix to the kept set.
4. **Do not touch the README language-switcher block here** — that edit is part of the
   consolidated README pass (Feature 5), so `README.md` stays untouched until then.

**Files:** delete `README.<lang>.md` (20 files), edit/remove
`.github/workflows/docs-locale-sync.yml`.

**Acceptance:** only the kept translation files remain; locale-sync no longer recreates
the deleted ones. (`README.md` itself is intentionally unchanged at this stage.)

**Effort:** ~20–30 min. **Risk:** low (don't forget the workflow).

---

## 2. Pin model defaults + add graceful fallback  *(code + a deferred doc table)*

**Why second:** independent of everything else, medium difficulty, and it produces
the runtime behaviour + the numbers the README model table (Feature 5) will document.
The code lands here; the table is written once, later.

**Current state:**
- `packages/core/src/sarvam.ts` defines three models with `limit.context` /
  `limit.output`, **no `family`** field, no cost/use metadata:
  - `sarvam-m`  — context 8192,  output 4096  (default)
  - `sarvam-30b` — context 65536, output 8192
  - `sarvam-105b` — context 131072, output 16384
- Resolution in `provider.ts`: `defaultModel` prefers `sarvam/sarvam-m`; `getSmallModel`
  early-returns `sarvam-m` for the Sarvam provider. **No explicit fallback** if a
  requested model id is missing from the catalog — an agentic loop can fail mid-task.

**Plan (code only — the README table is deferred to Feature 5):**
1. **Defaults:** confirm/pin the default chain in one place and document it *in code*
   (comment near the Sarvam branches): `cfg.model` → recent → baked-in `sarvam-m` →
   generic ordering (already implemented in `defaultModel`).
2. **Graceful fallback:** when a requested Sarvam model id isn't in the resolved
   catalog, fall back to a sibling Sarvam model (e.g. `sarvam-m` → `sarvam-30b` →
   `sarvam-105b`) with a single user-visible warning instead of a hard failure.
   Implement as a small Sarvam-scoped helper near the existing branches in
   `provider.ts` so other providers are unaffected.
3. **Metadata (optional):** if useful, add recommended-use/cost fields to the model
   entries in `sarvam.ts` so the Feature 5 table can be generated from one source.
4. Add a focused test: missing model id → returns a valid Sarvam model, warns once.

**Files:** `packages/opencode/src/provider/provider.ts` (fallback helper),
`packages/core/src/sarvam.ts` (optional metadata/comment), a test. **No `README.md`
edit here.**

**Acceptance:** requesting an unavailable Sarvam model resolves to a sibling with a
single warning rather than crashing; existing smoke-test still resolves default to
`sarvam-m`.

**Effort:** ~half a day. **Risk:** medium — touches resolution; cover with the test.

---

## 3. `sarvam-cli doctor` / `--check` quickstart validator  *(new command, deferred quickstart doc)*

**Why third:** self-contained new command, medium-hard, and it must exist before the
README Quick start can recommend it (that recommendation is written once, in Feature 5).
Placed after Feature 2 so `doctor` can also surface the resolved model using the now-
hardened resolution logic.

**Current state:** first-run failures are dominated by a bad/missing `SARVAM_API_KEY`
and nothing validates the key or reports the resolved model. Command pattern is
established: see `cli/cmd/providers.ts` / `models.ts`, registered in `src/index.ts`.

**Plan:**
1. Add `packages/opencode/src/cli/cmd/doctor.ts` exporting `DoctorCommand` (yargs
   `cmd`/`effectCmd` pattern, like neighbouring commands).
2. Report ✓/✗ for each:
   - `SARVAM_API_KEY` present (env or stored auth via `Auth`).
   - Live ping to the Sarvam endpoint (`SarvamProvider.api` = `https://api.sarvam.ai/v1`)
     — a lightweight authenticated request to confirm the key works, distinguishing
     401/403 from network errors.
   - Resolved default model + small model (reuse `Provider.defaultModel` /
     `getSmallModel`) so the user sees exactly what will run.
3. Exit non-zero on failure (scriptable in CI / first-run setup).
4. Register `DoctorCommand` in `src/index.ts`; decide whether to also expose a
   top-level `--check` alias.
5. **Defer** the README Quick start mention to Feature 5 (no `README.md` edit here).

**Files:** new `packages/opencode/src/cli/cmd/doctor.ts`, edit `src/index.ts`; reuse
`auth`, `sarvam.ts`, `provider.ts`. **No `README.md` edit here.**

**Acceptance:** `sarvam-cli doctor` with a valid key prints key OK + endpoint reachable
+ resolved model, exits 0; bad/missing key prints a precise diagnosis, exits non-zero.

**Effort:** ~1 day. **Risk:** medium — keep the live ping defensive (timeout, clear
error taxonomy).

---

## 4. Publish a tagged Release + installable package  *(produces the destinations the README points to)*

**Why fourth:** hardest item, and it must come **before** the README pass because the
README's npm badge, build-status badge, and install instructions point at artifacts
this feature creates. Doing it before Feature 5 means those links are written once,
already valid — no placeholder-then-real revisit.

**Current state:**
- No GitHub Releases; install is build-from-source only.
- `packages/opencode/package.json` is `"name": "opencode"` + `"private": true` —
  **both block npm publishing.**
- Upstream `publish.yml` is gated to `anomalyco/opencode` and far more complex than
  this fork needs; don't reuse it wholesale.

**Plan (ship 4a Release first, 4b npm second — both before Feature 5):**

**4a. GitHub Release with prebuilt single-file binaries:**
1. New `.github/workflows/release.yml`, triggered on tag push (`v*`), gated to
   `github.repository == 'prashlkam/Sarvam-CLI'`.
2. Matrix-build the single-file binary per platform (`linux-x64`, `linux-arm64`,
   `darwin-x64`, `darwin-arm64`, `windows-x64` as `script/build.ts --single`
   supports); run the smoke-test on native runners where possible.
3. `gh release create <tag>` with binaries + checksums attached.
4. Decide the fork's tag/versioning scheme (track upstream `opencode-1.17.11` vs
   independent `v0.1.0`) and document it next to `script/update-sarvam.sh` so each
   upstream bump cuts a release.
5. Update `./install` to optionally **download a released binary** instead of building.

**4b. npm package:**
1. Pick + verify a scoped name (e.g. `@sarvam-cli/cli` or `sarvam-cli`) — **decision +
   npm-org needed.**
2. Flip `packages/opencode/package.json` (`name`, remove `private`, set
   `publishConfig`, ensure `bin` ships the built binary) or add a thin wrapper package;
   keep `bin` names `sarvam-cli`/`sarvam`.
3. Add an npm-publish job to `release.yml` using `NPM_TOKEN`; verify `npm i -g <name>`
   and `bunx <name>` both work.

**Files:** new `.github/workflows/release.yml`, `packages/opencode/package.json`,
`./install`; repo secret `NPM_TOKEN`, org/name decision. **README install/badge text
is deferred to Feature 5.**

**Acceptance:** pushing a tag produces a Release with per-platform binaries; `npm i -g
<name>` / `bunx <name>` install a working `sarvam-cli` whose default resolves to
`sarvam-m`.

**Effort:** 4a ~1 day; 4b ~1 day + npm-org setup. **Risk:** high — external artifacts,
secrets, cross-platform builds, ongoing per-bump maintenance.

---

## 5. README consolidation pass  *(last — every destination now exists, so it's done once)*

**Why last:** this is the *only* place `README.md` is edited. By now the kept
translation set (Feature 1), the model numbers + fallback behaviour (Feature 2), the
`doctor` command (Feature 3), and the published package + release (Feature 4) all
exist — so every badge, link, and instruction is written against final reality and
never needs a second pass.

**Everything that earlier features deferred, done here in one edit:**
1. **Badges / identity links** (currently all upstream):
   - Discord badge → Sarvam's support channel (or remove if none exists yet).
   - npm badge → the real published package from Feature 4b.
   - Build-status badge → the real `prashlkam/Sarvam-CLI` `release.yml` from Feature 4a.
   - Screenshot CTA → the fork repo / a Sarvam page, not `opencode.ai`.
   - Keep the explicit "fork of opencode" credit line + Credits section (provenance
     stays honest); keep `opencode.ai/docs` links but clearly labelled "upstream docs".
2. **Language switcher** → list only the kept languages from Feature 1.
3. **Models table** → context window, max output, recommended use, cost, sourced from
   the `sarvam.ts` numbers/metadata pinned in Feature 2; repoint the Documentation
   section here (replacing the current `plan.md` pointer).
4. **Quick start** → recommend `sarvam-cli doctor` (Feature 3) as the first step.
5. **Install section** → document the released-binary download + `npm i -g <name>` /
   `bunx <name>` from Feature 4, alongside the existing build-from-source path.

**Files:** `README.md` (+ mirror the minimal changes into any kept translation).

**Acceptance:** every badge/CTA resolves to a Sarvam-owned (or explicitly-labelled
upstream) destination; switcher matches the kept set; model table, doctor quickstart,
and npm/release install instructions are all present and accurate — with no item left
pointing at a not-yet-existing destination.

**Effort:** ~45 min (pure docs, but comprehensive). **Risk:** none.

---

## Dependency summary

```
1 Trim translations ─┐
2 Model fallback ─────┤
3 doctor command ─────┼──→ 5 README consolidation (last, single pass)
4 Release + npm ──────┘
```

Features 1–4 are mutually independent (orderable by ease: 1 easy → 4 hardest) and each
*produces* something the README will reference. Holding **all** README edits to
Feature 5 is what guarantees no feature is implemented twice.
