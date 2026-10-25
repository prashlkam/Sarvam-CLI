// Sarvam AI is baked in as a zero-config default provider. It speaks the
// OpenAI-compatible surface at /v1 (Authorization: Bearer sk_...), so it rides
// the existing openai-compatible loader. models.dev has no Sarvam entry, so
// limits are specified manually here — keep them easy to update.
export const SARVAM_PROVIDER_ID = "sarvam"
export const SARVAM_DEFAULT_MODEL_ID = "sarvam-m"
export const SARVAM_ENV_KEY = "SARVAM_API_KEY"
export const SARVAM_API_URL = "https://api.sarvam.ai/v1"
export const SARVAM_DASHBOARD_URL = "https://dashboard.sarvam.ai"

// Sibling-model fallback order. When a requested Sarvam model id is missing
// from the resolved catalog, resolution walks this chain (smallest → largest)
// and returns the first sibling that exists, so an agentic loop degrades to a
// valid model instead of crashing mid-task.
export const SARVAM_FALLBACK_CHAIN = ["sarvam-m", "sarvam-30b", "sarvam-105b"] as const

// models.dev-shaped source entry. ModelsDev.normalize turns this into the
// internal Provider/Model snapshot through exactly the same path as every
// upstream catalog entry, so Sarvam picks up native-package resolution,
// env-key integration registration and variant handling for free.
export const SarvamCatalog = {
  id: SARVAM_PROVIDER_ID,
  name: "Sarvam AI",
  api: SARVAM_API_URL,
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
} as const

export * as Sarvam from "./sarvam.js"

