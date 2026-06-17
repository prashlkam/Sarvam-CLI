<p align="center">Sarvam CLI</p>
<p align="center">An AI coding agent for the terminal, powered by Sarvam AI by default.</p>
<p align="center"><sub>A fork of <a href="https://opencode.ai">opencode</a>, rebranded and preconfigured for Sarvam AI.</sub></p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![Sarvam CLI Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### Build from source

```bash
# Install dependencies (requires Bun)
bun install

# Build the single-file binary for your platform
bun run --cwd packages/opencode script/build.ts --single

# The binary is emitted to:
#   packages/opencode/dist/<platform>/bin/sarvam-cli
```

Install it onto your PATH with the bundled script:

```bash
./install --binary packages/opencode/dist/*/bin/sarvam-cli
```

This copies the binary to `$HOME/.sarvam-cli/bin` and adds it to your PATH.

### Quick start

Sarvam CLI defaults to Sarvam AI. Provide a key one of two ways:

```bash
# Option 1: environment variable
export SARVAM_API_KEY=sk_...

# Option 2: interactive login (stores the key locally)
sarvam-cli auth login        # choose "Sarvam AI"

# then, in any project:
cd <project>
sarvam-cli                   # launches the TUI (alias: sarvam)
```

Get an API key at https://dashboard.sarvam.ai. The default model is
`sarvam/sarvam-m`; `sarvam/sarvam-30b` and `sarvam/sarvam-105b` are also
available. All of opencode's other providers remain selectable via
`sarvam-cli auth login`.

### Agents

Sarvam CLI includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

Sarvam CLI is a fork of opencode and shares its configuration model. For general
configuration, [**see the upstream opencode docs**](https://opencode.ai/docs).
The Sarvam-specific defaults (provider, models, paths) are documented in
[plan.md](./plan.md).

### Credits

Sarvam CLI is built on top of [opencode](https://opencode.ai), the open source AI
coding agent. All credit for the underlying agent goes to the opencode team; this
fork only rebrands it and bakes in Sarvam AI as the default provider.
