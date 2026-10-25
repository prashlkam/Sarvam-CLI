# Sarvam CLI (pip wrapper)

Sarvam CLI — an AI coding agent for the terminal, powered by Sarvam AI. A fork
of [opencode](https://github.com/sst/opencode).

This package is a thin launcher: the first time you run `sarvam-cli` it
downloads the platform-native binary (~55 MB) for your OS/architecture from
the matching [GitHub Release](https://github.com/prashlkam/Sarvam-CLI/releases)
and caches it under `~/.cache/sarvam-cli` (or `%LOCALAPPDATA%\sarvam-cli` on
Windows). Subsequent runs start instantly.

## Install

```bash
# pipx (recommended — this is an application, not a library)
pipx install sarvam-cli-app

# or plain pip
pip install sarvam-cli-app
```

Both the `sarvam-cli` and `sarvam` commands are installed.

> **Note:** the npm package (`npm install -g sarvam-cli`) is an equivalent
> wrapper over the same binary — install one or the other, not both.

## Usage

```bash
sarvam-cli            # start the agent in the current directory
sarvam-cli --version
```

- Supported platforms: linux-x64, linux-arm64 (glibc and musl), darwin-x64,
  darwin-arm64, windows-x64.
- Set `SARVAM_CLI_BINARY=/path/to/sarvam-cli` to skip the download and use your
  own binary (air-gapped installs, local builds).
- Corporate proxy? The standard `HTTPS_PROXY` environment variable is honored.

Project home: https://github.com/prashlkam/Sarvam-CLI
