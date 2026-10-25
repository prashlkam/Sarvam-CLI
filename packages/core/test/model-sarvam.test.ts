import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Location } from "@opencode/core/location"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { SARVAM_DEFAULT_MODEL_ID, SARVAM_PROVIDER_ID } from "@opencode/util/sarvam"
import { AbsolutePath } from "@opencode/core/schema"
import { location } from "./fixture/location"
import { it } from "./lib/effect"

const ref = location({ directory: AbsolutePath.make("test") })
const layer = AppNodeBuilder.build(
  LayerNode.group([Provider.node, Model.node]),
  [Location.node.replace(Layer.succeed(Location.Service, Location.Service.of(ref)))],
)

const sarvam = Provider.ID.make(SARVAM_PROVIDER_ID)
const other = Provider.ID.make("other")
const small = Model.ID.make(SARVAM_DEFAULT_MODEL_ID)
const large = Model.ID.make("sarvam-105b")
const newest = Model.ID.make("newest")

// Registers sarvam-m/sarvam-105b plus a rival provider whose model is the most
// recently released, so catalog ordering alone would never pick Sarvam.
const seed = Effect.fn(function* () {
  const providers = yield* Provider.Service
  yield* providers.transform((editor) => {
    editor.update(sarvam, () => {})
    editor.models.update(sarvam, small, (model) => {
      model.time.released = 1000
    })
    editor.models.update(sarvam, large, (model) => {
      model.time.released = 2000
    })
    editor.update(other, () => {})
    editor.models.update(other, newest, (model) => {
      model.time.released = 3000
    })
  })
})

it.effect("getModel falls back to a sibling Sarvam model when the requested id is missing", () =>
  Effect.gen(function* () {
    yield* seed()
    const models = yield* Model.Service
    const model = yield* models.get(sarvam, Model.ID.make("sarvam-nonexistent"))
    expect(String(model?.providerID)).toBe(SARVAM_PROVIDER_ID)
    expect(["sarvam-m", "sarvam-30b", "sarvam-105b"]).toContain(String(model?.id))
  }).pipe(Effect.provide(layer)),
)

it.effect("getModel still misses for a non-Sarvam provider", () =>
  Effect.gen(function* () {
    yield* seed()
    const models = yield* Model.Service
    expect(yield* models.get(other, Model.ID.make("nonexistent"))).toBeUndefined()
  }).pipe(Effect.provide(layer)),
)

it.effect("small model for Sarvam is sarvam-m", () =>
  Effect.gen(function* () {
    yield* seed()
    const models = yield* Model.Service
    expect(String((yield* models.small(sarvam))?.id)).toBe(SARVAM_DEFAULT_MODEL_ID)
  }).pipe(Effect.provide(layer)),
)

it.effect("default model prefers sarvam-m over newer catalog entries", () =>
  Effect.gen(function* () {
    yield* seed()
    const models = yield* Model.Service
    // Ordering would put `newest` first; Sarvam is the zero-config floor.
    expect((yield* models.all())[0]?.id).toBe(newest)
    expect(String((yield* models.default())?.id)).toBe(SARVAM_DEFAULT_MODEL_ID)
  }).pipe(Effect.provide(layer)),
)

it.effect("an explicitly configured default still wins over Sarvam", () =>
  Effect.gen(function* () {
    yield* seed()
    const models = yield* Model.Service
    yield* models.transform((editor) => editor.default.set(other, newest))
    expect((yield* models.default())?.id).toBe(newest)
  }).pipe(Effect.provide(layer)),
)
