<p align="center">Sarvam CLI</p>
<p align="center">An AI coding agent for the terminal, powered by Sarvam AI by default.</p>
<p align="center"><sub>A fork of <a href="https://opencode.ai">opencode</a>, rebranded and preconfigured for Sarvam AI.</sub></p>
<p align="center">
  <a href="https://www.npmjs.com/package/sarvam-cli"><img alt="npm" src="https://img.shields.io/npm/v/sarvam-cli?style=flat-square" /></a>
  <a href="https://github.com/prashlkam/Sarvam-CLI/actions/workflows/release.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/prashlkam/Sarvam-CLI/release.yml?style=flat-square" /></a>
</p>

[![Sarvam CLI Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/prashlkam/Sarvam-CLI)

---

### Install

```bash
# npm (installs the sarvam-cli / sarvam commands globally)
npm install -g sarvam-cli

# or run without installing
bunx sarvam-cli
```

Or download a prebuilt binary from the [latest release](https://github.com/prashlkam/Sarvam-CLI/releases):

```bash
# Downloads the right binary for your platform and adds it to your PATH
curl -fsSL https://raw.githubusercontent.com/prashlkam/Sarvam-CLI/main/install | bash

# Pin a specific version
curl -fsSL https://raw.githubusercontent.com/prashlkam/Sarvam-CLI/main/install | bash -s -- --version 1.17.11
```

### Quick start

Sarvam CLI defaults to Sarvam AI. Provide a key one of two ways:

```bash
# Option 1: environment variable
export SARVAM_API_KEY=sk_...

# Option 2: interactive login (stores the key locally)
sarvam-cli auth login        # choose "Sarvam AI"
```

Then verify everything is wired up before you start:

```bash
sarvam-cli doctor            # checks your API key, endpoint connectivity, and resolved models
```

Once `doctor` is green, launch it in any project:

```bash
cd <project>
sarvam-cli                   # launches the TUI (alias: sarvam)
```

Get an API key at https://dashboard.sarvam.ai.

### Models

Sarvam CLI bakes in the Sarvam AI provider so it works with zero configuration.
The default model is `sarvam/sarvam-m`. If a requested Sarvam model is
unavailable, resolution gracefully falls back to a sibling
(`sarvam-m` → `sarvam-30b` → `sarvam-105b`) instead of failing mid-task.

| Model          | Context | Max output | Recommended use                                   |
| -------------- | ------- | ---------- | ------------------------------------------------- |
| `sarvam-m`     | 8K      | 4K         | Fast everyday coding (default)                    |
| `sarvam-30b`   | 64K     | 8K         | Larger context, balanced speed and capability     |
| `sarvam-105b`  | 128K    | 16K        | Largest context, most capable for complex tasks   |

Pricing is listed on the [Sarvam dashboard](https://dashboard.sarvam.ai). All of
opencode's other providers remain selectable via `sarvam-cli auth login`.

### Agents

Sarvam CLI includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents) (upstream docs).

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

### Documentation

Sarvam CLI is a fork of opencode and shares its configuration model. For general
configuration, [**see the upstream opencode docs**](https://opencode.ai/docs).
The Sarvam-specific defaults (provider, models, paths) are documented in
[plan.md](./plan.md) and summarized in the [Models](#models) table above.

### Credits

Sarvam CLI is built on top of [opencode](https://opencode.ai), the open source AI
coding agent. All credit for the underlying agent goes to the opencode team; this
fork only rebrands it and bakes in Sarvam AI as the default provider.
