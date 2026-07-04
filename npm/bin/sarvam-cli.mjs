#!/usr/bin/env node
// Thin launcher: execs the platform-native Sarvam CLI binary that install.mjs
// downloaded into ./native during postinstall.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))
const native = path.join(dir, "native", process.platform === "win32" ? "sarvam-cli.exe" : "sarvam-cli")

if (!existsSync(native)) {
  console.error(
    "sarvam-cli: native binary not found. Reinstall with `npm install -g sarvam-cli`, " +
      "or grab a release binary from https://github.com/prashlkam/Sarvam-CLI/releases",
  )
  process.exit(1)
}

const result = spawnSync(native, process.argv.slice(2), { stdio: "inherit" })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 0)
