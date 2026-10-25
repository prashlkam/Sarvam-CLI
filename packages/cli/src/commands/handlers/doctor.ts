import { Effect } from "effect"
import { EOL } from "node:os"
import color from "picocolors"
import { SARVAM_API_URL, SARVAM_DEFAULT_MODEL_ID, SARVAM_ENV_KEY, SARVAM_PROVIDER_ID } from "@opencode/util/sarvam"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { createClient, loadIntegrations, location, request } from "./auth/shared"
import { errorMessage } from "../../util/error"

const write = (line: string) => process.stdout.write(line + EOL)
const pass = (label: string) => write(color.green("  ✓ ") + label)
const warn = (label: string) => write(color.yellow("  ! ") + label)
const fail = (label: string) => write(color.red("  ✗ ") + label)

export default Runtime.handler(
  Commands.commands.doctor,
  Effect.fn("cli.doctor")(function* () {
    write("")
    write(color.bold("Sarvam CLI doctor"))
    write("")

    let healthy = true

    const client = yield* createClient()
    const integrations = yield* loadIntegrations(client)
    const sarvam = integrations.find((integration) => integration.id === SARVAM_PROVIDER_ID)

    // 1. API key. The stored credential never leaves the server, so the
    // environment variable is the only key this process can read.
    const envKey = process.env[SARVAM_ENV_KEY]
    const stored = sarvam?.connections.find((connection) => connection.type === "credential")
    if (envKey) {
      pass(`${SARVAM_ENV_KEY} is set (environment)`)
    } else if (stored) {
      pass(`Sarvam credential found (stored via \`sarvam-cli auth login\`)`)
    } else {
      healthy = false
      fail(`No Sarvam API key. Set ${SARVAM_ENV_KEY}=sk_... or run \`sarvam-cli auth login\`.`)
    }

    // 2. Live endpoint ping — a lightweight authenticated GET /models.
    if (envKey) {
      const ping = yield* Effect.promise(async () => {
        try {
          const res = await fetch(`${SARVAM_API_URL}/models`, {
            headers: { Authorization: `Bearer ${envKey}` },
            signal: AbortSignal.timeout(10_000),
          })
          return { kind: "status" as const, status: res.status }
        } catch (e) {
          return { kind: "network" as const, message: errorMessage(e) }
        }
      })

      if (ping.kind === "network") {
        healthy = false
        fail(`Could not reach ${SARVAM_API_URL} (${ping.message})`)
      } else if (ping.status >= 200 && ping.status < 300) {
        pass(`Endpoint reachable and key accepted (${SARVAM_API_URL})`)
      } else if (ping.status === 401 || ping.status === 403) {
        healthy = false
        fail(`Sarvam rejected the key (HTTP ${ping.status}) — check that it is valid`)
      } else {
        healthy = false
        fail(`Endpoint returned HTTP ${ping.status} from ${SARVAM_API_URL}`)
      }
    } else if (stored) {
      warn("Skipping endpoint ping (the stored key stays on the server)")
    } else {
      warn("Skipping endpoint ping (no key to test)")
    }

    // 3. Resolved models — exactly what will run.
    const def = yield* request((signal) => client.model.default({ location }, { signal })).pipe(
      Effect.map((response) => response.data),
      Effect.catch((error) => Effect.succeed({ error: errorMessage(error) } as const)),
    )
    if (def && "error" in def) {
      healthy = false
      fail(`Could not resolve a default model: ${def.error}`)
    } else if (!def) {
      healthy = false
      fail("Could not resolve a default model: none available")
    } else {
      pass(`Default model: ${def.providerID}/${def.id}`)
    }

    const models = yield* request((signal) => client.model.list({ location }, { signal })).pipe(
      Effect.map((response) => response.data),
      Effect.orElseSucceed(() => []),
    )
    const small = models.find(
      (model) => model.providerID === SARVAM_PROVIDER_ID && model.id === SARVAM_DEFAULT_MODEL_ID,
    )
    if (small) {
      pass(`Small model: ${SARVAM_PROVIDER_ID}/${small.id}`)
    } else {
      warn("No small model resolved for Sarvam")
    }

    write("")
    if (!healthy) {
      write(color.red("Some checks failed — see above."))
      process.exitCode = 1
      return
    }
    write(color.green(color.bold("All checks passed.")))
  }),
)
