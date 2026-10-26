import test from "node:test"
import assert from "node:assert/strict"
import { inpaintRgba } from "../src/lib/inpainting.mjs"

test("inpainting leaves all unmasked pixels unchanged", () => {
  const rgba = Uint8ClampedArray.from([
    10, 20, 30, 255, 80, 90, 100, 255,
    120, 130, 140, 255, 200, 210, 220, 255,
  ])
  const result = inpaintRgba(rgba, Uint8Array.from([0, 1, 0, 0]), 2, 2)
  assert.deepEqual([...result.slice(0, 4)], [...rgba.slice(0, 4)])
  assert.deepEqual([...result.slice(8)], [...rgba.slice(8)])
})

test("inpainting reconstructs selected pixels from neighboring colors", () => {
  const rgba = Uint8ClampedArray.from([
    100, 40, 20, 255, 100, 40, 20, 255, 100, 40, 20, 255,
    100, 40, 20, 255, 0, 0, 0, 255, 100, 40, 20, 255,
    100, 40, 20, 255, 100, 40, 20, 255, 100, 40, 20, 255,
  ])
  const result = inpaintRgba(rgba, Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]), 3, 3)
  assert.deepEqual([...result.slice(16, 20)], [100, 40, 20, 255])
})

test("inpainting rejects dimensions that do not match the buffers", () => {
  assert.throws(() => inpaintRgba(new Uint8ClampedArray(8), new Uint8Array(1), 1, 1), /dimensions/i)
})
