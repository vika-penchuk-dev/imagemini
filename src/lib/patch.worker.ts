import { applyPatchRgba } from "./patch.mjs"

self.addEventListener("message", (event: MessageEvent<{
  rgba: Uint8ClampedArray
  mask: Uint8Array
  width: number
  height: number
  offsetX: number
  offsetY: number
  mode: "one-tone" | "texture"
}>) => {
  try {
    const { rgba, mask, width, height, offsetX, offsetY, mode } = event.data
    const result = applyPatchRgba(rgba, mask, width, height, offsetX, offsetY, undefined, mode)
    self.postMessage({ result }, { transfer: [result.buffer] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Patch could not be applied" })
  }
})
