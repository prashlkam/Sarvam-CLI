import type { ModelsDev } from "./models-dev"

// Sarvam AI is baked in as a zero-config default provider. It speaks the
// OpenAI-compatible surface at /v1 (Authorization: Bearer sk_...), so it rides
// the existing @ai-sdk/openai-compatible loader. models.dev has no Sarvam
// entry, so limits are specified manually here — keep them easy to update.
export const SARVAM_PROVIDER_ID = "sarvam"
export const SARVAM_DEFAULT_MODEL_ID = "sarvam-m"
export const SARVAM_ENV_KEY = "SARVAM_API_KEY"

export const SarvamProvider: ModelsDev.Provider = {
  id: SARVAM_PROVIDER_ID,
  name: "Sarvam AI",
  api: "https://api.sarvam.ai/v1",
  npm: "@ai-sdk/openai-compatible",
  env: [SARVAM_ENV_KEY],
  models: {
    "sarvam-m": {
      id: "sarvam-m",
      name: "Sarvam M",
      release_date: "2025-05-23",
      attachment: false,
      reasoning: false,
      temperature: true,
      tool_call: true,
      limit: { context: 8192, output: 4096 },
      modalities: { input: ["text"], output: ["text"] },
    },
    "sarvam-30b": {
      id: "sarvam-30b",
      name: "Sarvam 30B",
      release_date: "2025-05-23",
      attachment: false,
      reasoning: false,
      temperature: true,
      tool_call: true,
      limit: { context: 65536, output: 8192 },
      modalities: { input: ["text"], output: ["text"] },
    },
    "sarvam-105b": {
      id: "sarvam-105b",
      name: "Sarvam 105B",
      release_date: "2025-05-23",
      attachment: false,
      reasoning: false,
      temperature: true,
      tool_call: true,
      limit: { context: 131072, output: 16384 },
      modalities: { input: ["text"], output: ["text"] },
    },
  },
}

// Merge Sarvam into a models.dev catalog record so it is always present
// regardless of network/cache state. Sarvam takes precedence over any upstream
// entry of the same id.
export function withSarvam(
  catalog: Record<string, ModelsDev.Provider>,
): Record<string, ModelsDev.Provider> {
  return { ...catalog, [SARVAM_PROVIDER_ID]: SarvamProvider }
}
