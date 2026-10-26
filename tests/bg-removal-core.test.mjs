import test from "node:test"
import assert from "node:assert/strict"
import { imageDataToInputTensor, logitsToAlpha, decontaminateEdges } from "../src/lib/bg-removal-core.mjs"

test("preprocesses RGB bytes to normalized NCHW float32", () => {
  const image = { width: 2, height: 1, data: Uint8ClampedArray.from([255, 0, 127, 255, 0, 255, 255, 255]) }
  const input = imageDataToInputTensor(image)
  assert.equal(input.length, 6)
  assert.ok(Math.abs(input[0] - (1 - 0.485) / 0.229) < 1e-6)
  assert.ok(Math.abs(input[1] - (0 - 0.485) / 0.229) < 1e-6)
  assert.ok(Math.abs(input[2] - (0 - 0.456) / 0.224) < 1e-6)
  assert.ok(Math.abs(input[3] - (1 - 0.456) / 0.224) < 1e-6)
  assert.ok(Math.abs(input[4] - (127 / 255 - 0.406) / 0.225) < 1e-6)
  assert.ok(Math.abs(input[5] - (1 - 0.406) / 0.225) < 1e-6)
})

test("converts logits to sigmoid alpha and preserves requested dimensions", () => {
  const alpha = logitsToAlpha(Float32Array.from([-100, 100, 100, -100]), 2, 2, 3, 3)
  assert.equal(alpha.length, 9)
  assert.equal(alpha[0], 0)
  assert.equal(alpha[2], 255)
  assert.equal(alpha[6], 255)
  assert.equal(alpha[8], 0)
})

test("rejects model input buffers that are not four-channel image data", () => {
  assert.throws(() => imageDataToInputTensor({ width: 1, height: 1, data: new Uint8Array(3) }), /dimensions/i)
})

test("removes a white matte from a semi-transparent red edge", () => {
  const rgba = new Uint8ClampedArray(3 * 3 * 4)
  const alpha = new Uint8ClampedArray(3 * 3)
  for (let i = 0; i < 9; i++) {
    rgba.set([255, 255, 255, 255], i * 4)
  }
  rgba.set([255, 128, 128, 255], 4 * 4)
  alpha[4] = 128
  alpha[3] = alpha[5] = 255
  const result = decontaminateEdges(rgba, alpha, 3, 3)
  assert.ok(result[17] < 8)
  assert.ok(result[18] < 8)
  assert.equal(result[19], 255)
  assert.deepEqual([...result.slice(0, 4)], [...rgba.slice(0, 4)])
  assert.deepEqual([...result.slice(20, 24)], [...rgba.slice(20, 24)])
})
