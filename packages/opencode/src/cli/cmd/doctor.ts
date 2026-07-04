import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { Auth } from "../../auth"
import {
  SARVAM_PROVIDER_ID,
  SARVAM_ENV_KEY,
  SarvamProvider,
} from "@opencode-ai/core/sarvam"
import { ProviderV2 } from "@opencode-ai/core/provider"

const pass = (label: string) => UI.println(UI.Style.TEXT_SUCCESS + "  ✓ " + UI.Style.TEXT_NORMAL + label)
const warn = (label: string) => UI.println(UI.Style.TEXT_WARNING + "  ! " + UI.Style.TEXT_NORMAL + label)
const failMark = (label: string) => UI.println(UI.Style.TEXT_DANGER + "  ✗ " + UI.Style.TEXT_NORMAL + label)

export const DoctorCommand = effectCmd({
  command: "doctor",
  aliases: ["check"],
  describe: "diagnose your Sarvam CLI setup (API key, connectivity, resolved models)",
  handler: Effect.fn("Cli.doctor")(function* (_args) {
    UI.empty()
    UI.println(UI.Style.TEXT_NORMAL_BOLD + "Sarvam CLI doctor" + UI.Style.TEXT_NORMAL)
    UI.empty()

    let healthy = true

    // 1. API key — env var takes precedence over stored auth.
    const authSvc = yield* Auth.Service
    const stored = yield* Effect.orDie(authSvc.get(SARVAM_PROVIDER_ID))
    const envKey = process.env[SARVAM_ENV_KEY]
    const key = envKey ?? (stored?.type === "api" ? stored.key : undefined)

    if (envKey) {
      pass(`${SARVAM_ENV_KEY} is set (environment)`)
    } else if (stored?.type === "api") {
      pass(`Sarvam credential found (stored via \`sarvam-cli auth login\`)`)
    } else {
      healthy = false
      failMark(
        `No Sarvam API key. Set ${SARVAM_ENV_KEY}=sk_... or run \`sarvam-cli auth login\`.`,
      )
    }

    // 2. Live endpoint ping — a lightweight authenticated GET /models.
    if (key) {
      const ping = yield* Effect.promise(async () => {
        try {
          const res = await fetch(`${SarvamProvider.api}/models`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10_000),
          })
          return { kind: "status" as const, status: res.status }
        } catch (e) {
          return { kind: "network" as const, message: e instanceof Error ? e.message : String(e) }
        }
      })

      if (ping.kind === "network") {
        healthy = false
        failMark(`Could not reach ${SarvamProvider.api} (${ping.message})`)
      } else if (ping.status >= 200 && ping.status < 300) {
        pass(`Endpoint reachable and key accepted (${SarvamProvider.api})`)
      } else if (ping.status === 401 || ping.status === 403) {
        healthy = false
        failMark(`Sarvam rejected the key (HTTP ${ping.status}) — check that it is valid`)
      } else {
        healthy = false
        failMark(`Endpoint returned HTTP ${ping.status} from ${SarvamProvider.api}`)
      }
    } else {
      warn("Skipping endpoint ping (no key to test)")
    }

    // 3. Resolved models — exactly what will run.
    const { Provider } = yield* Effect.promise(() => import("@/provider/provider"))
    const provider = yield* Provider.Service

    const def = yield* provider
      .defaultModel()
      .pipe(Effect.catch((e) => Effect.succeed({ error: e._tag } as const)))
    if ("error" in def) {
      healthy = false
      failMark(`Could not resolve a default model: ${def.error}`)
    } else {
      pass(`Default model: ${def.providerID}/${def.modelID}`)
    }

    const small = yield* provider.getSmallModel(ProviderV2.ID.make(SARVAM_PROVIDER_ID))
    if (small) {
      pass(`Small model: ${SARVAM_PROVIDER_ID}/${small.id}`)
    } else {
      warn("No small model resolved for Sarvam")
    }

    UI.empty()
    if (!healthy) {
      return yield* fail("Some checks failed — see above.")
    }
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + "All checks passed." + UI.Style.TEXT_NORMAL)
  }),
})
