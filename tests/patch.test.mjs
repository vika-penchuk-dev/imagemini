import test from "node:test"
import assert from "node:assert/strict"
import { applyPatchRgba, MAX_PATCH_AREA } from "../src/lib/patch.mjs"

function image(width, height, color = [0, 0, 0, 255]) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) rgba.set(color, i)
  return rgba
}

test("patch samples the translated donor and leaves pixels outside the selection unchanged", () => {
  const width = 24, height = 10, rgba = image(width, height)
  const mask = new Uint8Array(width * height)
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) mask[y * width + x] = 255
  for (let y = 2; y <= 6; y++) for (let x = 15; x <= 19; x++) rgba.set([200, 20, 40, 255], (y * width + x) * 4)
  const result = applyPatchRgba(rgba, mask, width, height, 13, 0, 1)
  const center = (4 * width + 4) * 4
  assert.ok(result[center] > 100)
  assert.equal(result[center + 3], 255)
  assert.deepEqual([...result.slice((1 * width + 1) * 4, (1 * width + 1) * 4 + 4)], [...rgba.slice((1 * width + 1) * 4, (1 * width + 1) * 4 + 4)])
})

test("patch feathers the selected boundary", () => {
  const width = 14, height = 10, rgba = image(width, height)
  const mask = new Uint8Array(width * height)
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) mask[y * width + x] = 255
  for (let y = 2; y <= 6; y++) for (let x = 5; x <= 9; x++) rgba.set([200, 0, 0, 255], (y * width + x) * 4)
  const result = applyPatchRgba(rgba, mask, width, height, 3, 0, 4)
  const edge = result[(4 * width + 2) * 4]
  const center = result[(4 * width + 4) * 4]
  assert.ok(edge > 0 && edge < center)
})

test("patch matches donor color toward the nearby target", () => {
  const width = 32, height = 16, rgba = image(width, height)
  const mask = new Uint8Array(width * height)
  for (let y = 5; y <= 9; y++) for (let x = 3; x <= 7; x++) mask[y * width + x] = 255
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    rgba.set(x < 12 ? [80, 100, 120, 255] : [180, 160, 140, 255], i)
  }
  for (let y = 5; y <= 9; y++) for (let x = 15; x <= 19; x++) rgba.set([220, 210, 200, 255], (y * width + x) * 4)

  const result = applyPatchRgba(rgba, mask, width, height, 12, 0)
  const center = (7 * width + 5) * 4
  const matchedDistance = [80, 100, 120].reduce((sum, target, channel) => sum + (result[center + channel] - target) ** 2, 0)
  const donorDistance = [220, 210, 200].reduce((sum, donor, channel) => sum + (donor - [80, 100, 120][channel]) ** 2, 0)
  assert.ok(matchedDistance < donorDistance, `matched color should be closer to target (${matchedDistance} vs ${donorDistance})`)
  assert.equal(result[center + 3], 255)
})

test("one-tone patch uses the local flat target color without donor color casts", () => {
  const width = 24, height = 12, rgba = image(width, height, [178, 174, 169, 255])
  const mask = new Uint8Array(width * height)
  for (let y = 3; y <= 7; y++) for (let x = 2; x <= 6; x++) mask[y * width + x] = 255
  for (let y = 3; y <= 7; y++) for (let x = 14; x <= 18; x++) rgba.set([20, 220, 30, 255], (y * width + x) * 4)

  const result = applyPatchRgba(rgba, mask, width, height, 12, 0, undefined, "one-tone")
  const center = (5 * width + 4) * 4
  assert.deepEqual([...result.slice(center, center + 3)], [178, 174, 169])
})

test("one-tone patch fills toward a non-uniform destination tone instead of brightening the donor", () => {
  const width = 32, height = 16, rgba = image(width, height)
  const mask = new Uint8Array(width * height)
  for (let y = 5; y <= 9; y++) for (let x = 3; x <= 7; x++) mask[y * width + x] = 255
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = 110 + x * 5
    rgba.set([value, value + 8, value + 14, 255], (y * width + x) * 4)
  }
  for (let y = 5; y <= 9; y++) for (let x = 15; x <= 19; x++) rgba.set([12, 42, 24, 255], (y * width + x) * 4)

  const result = applyPatchRgba(rgba, mask, width, height, 12, 0, undefined, "one-tone")
  const center = (7 * width + 5) * 4
  assert.ok(result[center] > 80 && result[center] < 180, `fill should follow destination tone (${result[center]})`)
  assert.ok(result[center + 1] - result[center] > 4, "destination color cast should be retained")
  assert.ok(result[center] - result[center + 2] < 0, "destination color should not inherit the green donor cast")
})

test("reapplying a one-tone patch does not progressively change its pixels", () => {
  const width = 24, height = 12, rgba = image(width, height, [178, 174, 169, 255])
  const mask = new Uint8Array(width * height)
  for (let y = 3; y <= 7; y++) for (let x = 2; x <= 6; x++) mask[y * width + x] = 255
  for (let y = 3; y <= 7; y++) for (let x = 2; x <= 6; x++) rgba.set([30, 30, 30, 255], (y * width + x) * 4)
  for (let y = 3; y <= 7; y++) for (let x = 14; x <= 18; x++) rgba.set([20, 220, 30, 255], (y * width + x) * 4)

  const once = applyPatchRgba(rgba, mask, width, height, 12, 0, 4, "one-tone")
  const twice = applyPatchRgba(once, mask, width, height, 12, 0, 4, "one-tone")
  assert.deepEqual(twice, once)
})

test("one-tone fill follows the destination gradient at the selection boundary", () => {
  const width = 40, height = 40, rgba = image(width, height)
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set([100 + x * 2, 100 + y, 140, 255], (y * width + x) * 4)
  for (let y = 8; y <= 31; y++) for (let x = 8; x <= 31; x++) { mask[y * width + x] = 255; rgba.set([0, 0, 0, 255], (y * width + x) * 4) }

  const result = applyPatchRgba(rgba, mask, width, height, 0, 0, undefined, "one-tone")
  const edge = (20 * width + 8) * 4, outside = (20 * width + 7) * 4
  assert.ok(Math.abs(result[edge] - result[outside]) < 8, `red channel should meet the outside gradient (${result[edge]} vs ${result[outside]})`)
  assert.ok(Math.abs(result[edge + 1] - result[outside + 1]) < 8, `green channel should meet the outside gradient (${result[edge + 1]} vs ${result[outside + 1]})`)
})

test("one-tone reconstructs a broad smooth illumination gradient from its boundary", () => {
  const patchWidth = 180, patchHeight = 120, width = patchWidth + 20, height = patchHeight + 20
  const rgba = image(width, height), mask = new Uint8Array(width * height)
  const expected = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = 60 + x * 0.35 + y * 0.22
    expected[y * width + x] = value
    rgba.set([value, value + 8, value + 18, 255], (y * width + x) * 4)
  }
  for (let y = 10; y < 10 + patchHeight; y++) for (let x = 10; x < 10 + patchWidth; x++) {
    mask[y * width + x] = 255
    rgba.set([230, 40, 20, 255], (y * width + x) * 4)
  }

  const result = applyPatchRgba(rgba, mask, width, height, 0, 0, undefined, "one-tone")
  let absoluteError = 0, count = 0
  for (let y = 10; y < 10 + patchHeight; y++) for (let x = 10; x < 10 + patchWidth; x++) {
    absoluteError += Math.abs(result[(y * width + x) * 4] - expected[y * width + x])
    count++
  }
  assert.ok(absoluteError / count < 1, `average illumination error should stay below 1 level (${absoluteError / count})`)
})

test("texture output stays pixel-stable for a woven donor and softened selection edge", () => {
  const width = 26, height = 16, rgba = image(width, height, [120, 124, 128, 255])
  const mask = new Uint8Array(width * height)
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) mask[y * width + x] = 255
  for (let y = 4; y <= 9; y++) for (let x = 15; x <= 20; x++) {
    const value = (x + y) % 2 ? 40 : 200
    rgba.set([value, value - 12, value + 12, 255], (y * width + x) * 4)
  }

  const result = applyPatchRgba(rgba, mask, width, height, 12, 0, 4, "texture")
  const pixel = (x, y) => [...result.slice((y * width + x) * 4, (y * width + x) * 4 + 4)]
  assert.deepEqual(pixel(3, 6), [98, 102, 106, 255])
  assert.deepEqual(pixel(4, 6), [164, 168, 172, 255])
  assert.deepEqual(pixel(5, 6), [76, 80, 84, 255])
  assert.deepEqual(pixel(8, 6), [142, 146, 150, 255])
})

test("texture patch preserves high-frequency donor detail", () => {
  const width = 24, height = 12, rgba = image(width, height, [120, 120, 120, 255])
  const mask = new Uint8Array(width * height)
  for (let y = 3; y <= 7; y++) for (let x = 2; x <= 6; x++) mask[y * width + x] = 255
  for (let y = 3; y <= 7; y++) for (let x = 14; x <= 18; x++) {
    const color = (x + y) % 2 ? 30 : 220
    rgba.set([color, color, color, 255], (y * width + x) * 4)
  }

  const result = applyPatchRgba(rgba, mask, width, height, 12, 0, undefined, "texture")
  const dark = result[(4 * width + 3) * 4], light = result[(4 * width + 4) * 4]
  assert.ok(Math.abs(light - dark) > 100, `donor texture detail should remain visible (${dark} vs ${light})`)
})

test("texture patch reduces donor contrast to match the destination texture", () => {
  const width = 40, height = 16, rgba = image(width, height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = (x + y) % 2 ? 100 : 140
    rgba.set([value, value, value, 255], (y * width + x) * 4)
  }
  const mask = new Uint8Array(width * height)
  for (let y = 3; y <= 11; y++) for (let x = 2; x <= 10; x++) mask[y * width + x] = 255
  for (let y = 3; y <= 11; y++) for (let x = 18; x <= 26; x++) {
    const value = (x + y) % 2 ? 10 : 230
    rgba.set([value, value, value, 255], (y * width + x) * 4)
  }

  const result = applyPatchRgba(rgba, mask, width, height, 16, 0, undefined, "texture")
  const dark = result[(7 * width + 6) * 4], light = result[(7 * width + 7) * 4]
  assert.ok(Math.abs(light - dark) < 100, `donor contrast should be reduced to fit destination (${dark} vs ${light})`)
  assert.ok(Math.abs(light - dark) > 40, "wicker-like detail should still be recognizable")
})

test("patch rejects a donor region outside the image and oversized selections", () => {
  const width = 8, height = 8, rgba = image(width, height), mask = new Uint8Array(width * height)
  mask[3 * width + 3] = 255
  assert.throws(() => applyPatchRgba(rgba, mask, width, height, 5, 0), /outside/i)

  const largeWidth = 1025, largeHeight = 1025
  const largeMask = new Uint8Array(largeWidth * largeHeight).fill(1)
  assert.ok(largeWidth * largeHeight > MAX_PATCH_AREA)
  assert.throws(() => applyPatchRgba(new Uint8ClampedArray(largeWidth * largeHeight * 4), largeMask, largeWidth, largeHeight, 0, 0), /too large/i)
})
