import { unzlib, zlib } from "fflate"

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type)
  const chunk = new Uint8Array(data.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)))
  return chunk
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function runWorker(callback, data, options, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"))
    let settled = false
    let terminate = () => {}
    const abort = () => {
      if (settled) return
      settled = true
      terminate()
      reject(new DOMException("Aborted", "AbortError"))
    }
    const finish = (error, result) => {
      if (settled) return
      settled = true
      signal?.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolve(result)
    }
    signal?.addEventListener("abort", abort, { once: true })
    terminate = callback(data, options, finish)
  })
}

export async function optimizePng(blob, quality, signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
  const input = new Uint8Array(await blob.arrayBuffer())
  if (input.length < 20 || !SIGNATURE.every((byte, i) => input[i] === byte)) {
    throw new Error("Invalid PNG")
  }

  const chunks = []
  const idat = []
  let idatOffset = -1
  let idatLength = 0
  let ended = false
  for (let offset = 8; offset + 12 <= input.length;) {
    const view = new DataView(input.buffer, input.byteOffset + offset)
    const length = view.getUint32(0)
    const end = offset + 12 + length
    if (end > input.length) throw new Error("Invalid PNG chunk")
    const type = new TextDecoder().decode(input.subarray(offset + 4, offset + 8))
    const chunk = input.subarray(offset, end)
    if (type === "IDAT") {
      if (idatOffset < 0) idatOffset = chunks.length
      idat.push(input.subarray(offset + 8, end - 4))
      idatLength += length
    } else {
      chunks.push(chunk)
    }
    offset = end
    if (type === "IEND") {
      ended = true
      if (offset !== input.length) throw new Error("Unexpected bytes after PNG end")
      break
    }
  }
  if (!ended || idatOffset < 0) throw new Error("Incomplete PNG")

  const pixels = await runWorker(unzlib, concat(idat), { consume: true }, signal)
  const level = Math.max(0, Math.min(9, Math.round((quality / 100) * 9)))
  const compressed = await runWorker(zlib, pixels, { level, consume: true }, signal)
  if (compressed.length >= idatLength) return new Blob([input], { type: "image/png" })

  chunks.splice(idatOffset, 0, makeChunk("IDAT", compressed))
  const output = concat([SIGNATURE, ...chunks])
  return new Blob([output], { type: "image/png" })
}
