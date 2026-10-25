# Plan: Build `sarvam-cli` — a Sarvam-AI-default fork of opencode

## Context

We want a coding-agent CLI that is **feature-identical to [opencode](https://github.com/sst/opencode)** but ships **Sarvam AI as the default provider/model** out of the box, branded as **`sarvam-cli`**. The empty working directory `/home/prashanth/Documents/Projects/Sarvam-CLI` will hold the fork.

Decisions locked with the user:
- **Full fork + rebrand** — new binary name `sarvam-cli` (alias `sarvam`), new banner/logo, package names, repo URLs, install script, docs.
- **Keep all ~75 providers**, but Sarvam is the zero-config default and the first `auth login` option.
- **Auth: both** interactive `auth login` (stores `sk_` key in `auth.json`) **and** `SARVAM_API_KEY` env var.
- **Default model: `sarvam-m`** (currently GA 24B); `sarvam-30b`/`sarvam-105b` remain selectable.

### What makes this tractable
opencode already supports OpenAI-compatible providers via `@ai-sdk/openai-compatible` and config like:
```json
{ "provider": { "sarvam": { "npm": "@ai-sdk/openai-compatible",
  "options": { "baseURL": "https://api.sarvam.ai/v1", "apiKey": "{env:SARVAM_API_KEY}" },
  "models": { "sarvam-m": { "name": "Sarvam M" } } } },
  "model": "sarvam/sarvam-m" }
```
So functionally, Sarvam integration is a known-good path. The fork work is (a) **baking that in as the compiled-in default** so it works with zero user config, (b) **adding Sarvam to the bundled provider/auth registry**, and (c) **rebranding**.

### Key Sarvam facts (verify during impl)
- Base URL: `https://api.sarvam.ai/v1` (OpenAI-compatible `/chat/completions`).
- Key format `sk_xxx`.
- **Auth header ambiguity**: Sarvam's native REST API uses an `api-subscription-key` header, while the `/v1` OpenAI-compatible surface is documented to work with the OpenAI SDK (i.e. `Authorization: Bearer`). `@ai-sdk/openai-compatible` sends Bearer by default. **First impl step = confirm which header `/v1` accepts** (curl test). If it needs the custom header, pass it via provider `options.headers` / a small custom fetch — see Step 5.
- Models: `sarvam-m` (legacy 24B), `sarvam-30b` (64K ctx), `sarvam-105b` (128K ctx). Tool-calling + streaming support must be verified per model (Step 5).

---

## Phase 0 — Fork & bootstrap

1. Clone upstream and re-point origin:
   ```bash
   git clone https://github.com/sst/opencode .
   git remote rename origin upstream
   # later: git remote add origin <your sarvam-cli repo>
   ```
2. Install toolchain: **Bun** (JS/TS runtime + package manager) and **Go** (for the TUI package). `bun install`.
3. Baseline build to confirm a clean upstream build before changes:
   ```bash
   bun run build   # or the turbo build task; confirm exact script in package.json
   ```
   Record the working build/run commands — they're the regression baseline.

> **Keep upstream as `upstream` remote** so we can rebase the fork on new opencode releases. Concentrate changes in as few files as possible to minimize merge pain (see "Maintainability" below).

---

## Phase 1 — Bake in Sarvam as a bundled provider

Goal: `sarvam` provider + its models exist in the compiled binary without any user config, and appear in `auth login`.

Critical files (confirm exact paths after clone — names below are from opencode's documented layout):
- `packages/opencode/src/provider/provider.ts` — provider registry, bundled providers, **default-model selection / fallback logic**.
- `packages/opencode/src/provider/models.ts` (or wherever the models.dev catalog is merged) — model metadata (context/output limits).
- `packages/opencode/src/auth/` — auth methods + the `auth login` provider list.
- `packages/opencode/src/config/` — config schema + defaults.

Steps:
4. **Register a bundled `sarvam` provider** alongside the existing bundled providers, equivalent to the JSON above:
   - `npm`: `@ai-sdk/openai-compatible`
   - `baseURL`: `https://api.sarvam.ai/v1`
   - models `sarvam-m` (default), `sarvam-30b`, `sarvam-105b` with `limit.context` = 16k?/64k/128k and a conservative `limit.output` (verify real values; models.dev likely has no Sarvam entry, so **specify limits manually**).
5. **Auth header**: confirm `/v1` accepts `Authorization: Bearer sk_...` via:
   ```bash
   curl https://api.sarvam.ai/v1/chat/completions -H "Authorization: Bearer $SARVAM_API_KEY" \
     -H 'content-type: application/json' \
     -d '{"model":"sarvam-m","messages":[{"role":"user","content":"hi"}]}'
   ```
   - If Bearer works → nothing extra.
   - If it needs `api-subscription-key` → set it through provider `options.headers` (or a custom `fetch`/loader, following how other special providers register a custom loader in `provider.ts`).
6. **Sarvam in `auth login`**: add an API-key auth entry so `sarvam-cli auth login` lists **Sarvam first**, prompts for the `sk_` key, and writes it to `~/.local/share/sarvam-cli/auth.json` (path changes with rebrand, Phase 3).
7. **`SARVAM_API_KEY` env var**: ensure the provider's `apiKey` resolves from `auth.json` OR `SARVAM_API_KEY`. Mirror how an existing provider (e.g. OpenAI's `OPENAI_API_KEY`) is wired so both paths work.

---

## Phase 2 — Make Sarvam the default model

8. In `provider.ts` (default/fallback selection): when no `model` is configured and credentials resolve, **prefer `sarvam/sarvam-m`**. Implement as an explicit fallback constant rather than relying on provider ordering, so it's robust.
9. Ship a **default config** baked into the binary (or written on first run) setting:
   ```json
   { "model": "sarvam/sarvam-m", "small_model": "sarvam/sarvam-m" }
   ```
   Point `small_model` (title generation etc.) at a Sarvam model too, so no Anthropic/OpenAI key is implicitly required.
10. **First-run UX**: if no Sarvam credential is found, the welcome/onboarding flow should guide the user to `sarvam-cli auth login` (Sarvam) or set `SARVAM_API_KEY` — instead of opencode's default Anthropic prompt. Locate the onboarding/`tui` "no auth" path and update copy + default selection.

---

## Phase 3 — Rebrand opencode → sarvam-cli

Treat this as a systematic find/replace plus asset swaps. **Audit with grep first**, then change deliberately (don't blind-replace inside vendored deps or upstream URLs we still need).

11. **Binary / package names**:
    - Root + `packages/*/package.json`: rename packages (e.g. `opencode` → `sarvam-cli`), set `bin` to `sarvam-cli` with an alias `sarvam`.
    - Update the Go TUI module path/name and any embedded program name in `packages/tui`.
12. **Branding strings & assets**:
    - ASCII logo / startup banner (in the TUI Go code) → `sarvam-cli` art.
    - User-facing strings: help text, version string, `--help`, error messages mentioning "opencode".
    - Theme default optional (keep upstream themes).
13. **Config/state paths** (rename so it doesn't collide with a real opencode install):
    - Config dir `~/.config/opencode/` → `~/.config/sarvam-cli/`.
    - Data/auth dir `~/.local/share/opencode/` → `~/.local/share/sarvam-cli/`.
    - Env vars like `OPENCODE_CONFIG` → `SARVAM_CODE_CONFIG` (keep schema field names internal).
    - Config filename `opencode.json` → `sarvam-cli.json` (decide: also accept `opencode.json` for familiarity? default = no, clean break).
14. **Schema URL / docs URLs**: `$schema` `https://opencode.ai/config.json` → your hosted schema (or keep upstream temporarily; note as TODO).
15. **Repo + distribution**:
    - `README`, docs site references, install script (`curl ... | bash`), Homebrew/AUR/npm publish names → `sarvam-cli`.
    - GitHub Actions / release workflows: rename artifacts and release binaries to `sarvam-cli`.
16. **Maintainability**: keep Sarvam-specific additions in clearly-named new files where possible (e.g. a `sarvam` block in `provider.ts`, a `defaults.sarvam.ts`) and keep rebrand changes mechanical, so future `git rebase upstream/main` conflicts stay small.

---

## Phase 4 — Verification (end-to-end)

17. **Build** the rebranded binary cleanly (Bun build + Go TUI build); confirm `sarvam-cli --version` and `sarvam --version`.
18. **Zero-config smoke test**: in a fresh HOME, set `SARVAM_API_KEY`, run `sarvam-cli` in a scratch repo, confirm it auto-selects `sarvam/sarvam-m` and completes a simple "create a file" task (tool-calling works).
19. **Auth login path**: `sarvam-cli auth login` → Sarvam listed first → paste `sk_` key → key lands in `~/.local/share/sarvam-cli/auth.json` → a prompt succeeds with no env var set.
20. **Streaming + tools**: verify token streaming renders in the TUI and that file-edit/bash tools execute (this confirms `@ai-sdk/openai-compatible` + Sarvam tool-calling). Repeat for `sarvam-30b`/`sarvam-105b` if your account has them.
21. **Other providers intact**: `sarvam-cli auth login` with Anthropic/OpenAI still works and `model` override switches providers — confirms "keep all providers".
22. **No path collisions**: confirm sarvam-cli never reads/writes opencode's `~/.config/opencode` or `~/.local/share/opencode`.
23. **Regression**: run upstream's existing test suite (`bun test` / turbo test — confirm command) and fix any breaks introduced by rebrand/default changes.

---

## Risks / open items
- **Auth header**: the single biggest unknown — resolved in Step 5. Everything else assumes a working `/v1` Bearer call.
- **Tool/function calling on Sarvam**: opencode is agentic and depends on reliable tool-calling. If `sarvam-m` tool-calling is weak/unsupported, the agent loop may misbehave; validate early in Step 20 and document supported models.
- **models.dev has no Sarvam entry** → we hard-code model limits; keep them easy to update.
- **Schema hosting**: `$schema` URL and docs site are out of scope for a local build; tracked as TODO in Step 14.
- **License/attribution**: opencode's license terms for forks/rebrands must be respected (retain LICENSE, add NOTICE of derivation). Confirm before publishing.
