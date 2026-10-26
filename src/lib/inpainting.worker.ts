import { inpaintRgba } from "./inpainting.mjs"

self.addEventListener("message", (event: MessageEvent<{
  rgba: Uint8ClampedArray
  mask: Uint8Array
  width: number
  height: number
}>) => {
  try {
    const result = inpaintRgba(event.data.rgba, event.data.mask, event.data.width, event.data.height)
    self.postMessage({ result }, { transfer: [result.buffer] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Processing failed" })
  }
})
