#!/usr/bin/env node
// postinstall: download the platform-native Sarvam CLI binary for this package
// version from the matching GitHub Release and place it at ./bin/native.
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs"
import { createWriteStream } from "node:fs"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO = "prashlkam/Sarvam-CLI"
const dir = path.dirname(fileURLToPath(import.meta.url))

// Skip when running inside the monorepo checkout (a sibling packages/ dir means
// this is the dev tree, not a published install — there is no release to fetch).
if (existsSync(path.join(dir, "packages")) || existsSync(path.join(dir, "..", "packages"))) {
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"))
const version = pkg.version
if (!version || version === "0.0.0") {
  console.error("sarvam-cli: unresolved package version; skipping binary download.")
  process.exit(0)
}

const platform = process.platform === "win32" ? "windows" : process.platform
const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch

const supported = new Set(["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "windows-x64"])
if (!supported.has(`${platform}-${arch}`)) {
  console.error(`sarvam-cli: unsupported platform ${platform}-${arch}.`)
  process.exit(0)
}

const isMusl = (() => {
  if (platform !== "linux") return false
  if (existsSync("/etc/alpine-release")) return true
  try {
    return !process.report?.getReport()?.header?.glibcVersionRuntime
  } catch {
    return false
  }
})()

const ext = platform === "linux" ? ".tar.gz" : ".zip"
// Try the fastest/most-specific archive first, then fall back gracefully.
const variants = arch === "x64" ? ["", "-baseline"] : [""]
const libcs = platform === "linux" ? (isMusl ? ["-musl"] : [""]) : [""]
const candidates = []
for (const libc of libcs) {
  for (const v of variants) {
    candidates.push(`opencode-${platform}-${arch}${v}${libc}${ext}`)
  }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "sarvam-cli-"))
const nativeDir = path.join(dir, "bin", "native")

async function tryDownload(archive) {
  const url = `https://github.com/${REPO}/releases/download/v${version}/${archive}`
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) return false
  const archivePath = path.join(tmp, archive)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archivePath))
  const args = archive.endsWith(".tar.gz") ? ["-xzf", archivePath, "-C", tmp] : ["-xf", archivePath, "-C", tmp]
  const extract = spawnSync("tar", args, { stdio: "inherit" })
  if (extract.status !== 0) return false
  const binName = platform === "windows" ? "sarvam-cli.exe" : "sarvam-cli"
  const found = readdirSync(tmp).includes(binName) ? path.join(tmp, binName) : null
  if (!found) return false
  mkdirSync(nativeDir, { recursive: true })
  const dest = path.join(nativeDir, binName)
  renameSync(found, dest)
  if (platform !== "windows") chmodSync(dest, 0o755)
  return true
}

try {
  let ok = false
  for (const archive of candidates) {
    if (await tryDownload(archive)) {
      ok = true
      break
    }
  }
  if (!ok) {
    console.error(
      `sarvam-cli: could not download a binary for ${platform}-${arch} (v${version}). ` +
        `See https://github.com/${REPO}/releases`,
    )
    process.exit(1)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
