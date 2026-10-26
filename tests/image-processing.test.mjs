import test from "node:test"
import assert from "node:assert/strict"
import { unzlibSync, zlibSync } from "fflate"
import { optimizePng } from "../src/lib/png-optimizer.mjs"
import { denoiseRgba, sharpenRgba } from "../src/lib/image-filters.mjs"
import { createLatestTaskGate } from "../src/lib/preview-gate.mjs"
import { clampSliderValue, computeUpscaleSize } from "../src/lib/image-sizing.mjs"
import { resizeRgba, enhanceRgba } from "../src/lib/image-worker-algorithms.mjs"

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type)
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  typeBytes.copy(out, 4)
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4)
  return out
}

function makePng(width, height, raw, level) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(raw, { level })),
    chunk("IEND", new Uint8Array()),
  ])
}

function readIdat(bytes) {
  const data = Buffer.from(bytes)
  const parts = []
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset)
    const type = data.toString("ascii", offset + 4, offset + 8)
    if (type === "IDAT") parts.push(data.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
    if (type === "IEND") break
  }
  return Buffer.concat(parts)
}

test("PNG optimizer preserves every decoded scanline byte and creates valid chunks", async () => {
  const width = 64
  const height = 64
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4
      raw[i] = x < width / 2 ? 30 : 220
      raw[i + 1] = y * 3
      raw[i + 2] = 90
      raw[i + 3] = x % 3 ? 255 : 120
    }
  }
  const original = makePng(width, height, raw, 0)
  const result = await optimizePng(new Blob([original], { type: "image/png" }), 88)
  const optimized = new Uint8Array(await result.arrayBuffer())
  assert.deepEqual(unzlibSync(readIdat(optimized)), raw)
  assert.equal(Buffer.from(optimized).readUInt32BE(8), 13)
  assert.equal(result.type, "image/png")
})

test("PNG quality maps to distinct real compression levels", async () => {
  const width = 96
  const height = 96
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 73 + (i >> 3) * 17) & 255
  const input = new Blob([makePng(width, height, raw, 0)], { type: "image/png" })
  const light = await optimizePng(input, 7)
  const strong = await optimizePng(input, 88)
  assert.notEqual(light.size, strong.size)
  assert.deepEqual(unzlibSync(readIdat(new Uint8Array(await light.arrayBuffer()))), raw)
  assert.deepEqual(unzlibSync(readIdat(new Uint8Array(await strong.arrayBuffer()))), raw)
})

test("edge-preserving denoise removes an isolated pixel without moving a strong edge", () => {
  const width = 7
  const height = 7
  const input = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = x < 3 ? 40 : 220
      const i = (y * width + x) * 4
      input.set([value, value, value, 255], i)
    }
  }
  input.set([255, 255, 255, 255], (3 * width + 1) * 4)
  const output = denoiseRgba(input, width, height, 100)
  assert.equal(output[(3 * width + 1) * 4], 40)
  assert.equal(output[(3 * width + 2) * 4], 40)
  assert.equal(output[(3 * width + 3) * 4], 220)
})

test("sharpening bounds edge overshoot and leaves alpha unchanged", () => {
  const input = new Uint8ClampedArray(5 * 3 * 4)
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 5; x++) {
      const value = x < 2 ? 20 : 220
      input.set([value, value, value, x === 2 ? 80 : 255], (y * 5 + x) * 4)
    }
  }
  const output = sharpenRgba(input, 5, 3, 80)
  for (let i = 0; i < output.length; i += 4) {
    assert.ok(output[i] >= 20 && output[i] <= 220)
    assert.equal(output[i + 3], input[i + 3])
  }
})

test("preview gate rejects a result after newer settings have started", () => {
  const gate = createLatestTaskGate()
  const oldTask = gate.next()
  const currentTask = gate.next()
  assert.equal(gate.isCurrent(oldTask), false)
  assert.equal(gate.isCurrent(currentTask), true)
})

test("preview gate invalidates pending work when its source image is cleared", () => {
  const gate = createLatestTaskGate()
  const pending = gate.next()
  gate.invalidate()
  assert.equal(gate.isCurrent(pending), false)
})

test("upscale target dimensions stay exact for supported factors and orientations", () => {
  assert.deepEqual(
    [1.5, 2, 3, 4].map((factor) => computeUpscaleSize(1122, 1402, factor)),
    [
      { width: 1683, height: 2103 },
      { width: 2244, height: 2804 },
      { width: 3366, height: 4206 },
      { width: 4488, height: 5608 },
    ]
  )
  assert.deepEqual(computeUpscaleSize(1402, 1122, 1.5), { width: 2103, height: 1683 })
})

test("numeric slider values clamp to bounds and respect the configured step", () => {
  assert.equal(clampSliderValue(120, -100, 100), 100)
  assert.equal(clampSliderValue(-120, -100, 100), -100)
  assert.equal(clampSliderValue(1.54, 0.2, 3, 0.05), 1.55)
  assert.equal(clampSliderValue(Number.NaN, 0.2, 3, 0.05), 0.2)
})

test("worker Lanczos keeps requested dimensions and preserves constant color", () => {
  const input = new Uint8ClampedArray(2 * 2 * 4)
  for (let i = 0; i < input.length; i += 4) input.set([80, 120, 200, 255], i)
  const output = resizeRgba(input, 2, 2, 6, 4)
  assert.equal(output.length, 6 * 4 * 4)
  for (let i = 0; i < output.length; i += 4) {
    assert.deepEqual([...output.slice(i, i + 4)], [80, 120, 200, 255])
  }
})

test("worker enhancement leaves neutral settings unchanged", () => {
  const input = new Uint8ClampedArray([10, 20, 30, 40, 90, 80, 70, 60])
  const output = enhanceRgba(input, 2, 1, {
    brightness: 0, contrast: 0, saturation: 0, gamma: 1, sharpen: 0, denoise: 0,
  })
  assert.deepEqual([...output], [...input])
})
