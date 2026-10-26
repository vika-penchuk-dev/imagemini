import type { EnhanceSettings } from "./image-core"

type ProcessOptions =
  | { kind: "resize"; targetWidth: number; targetHeight: number }
  | { kind: "enhance"; settings: EnhanceSettings }

export function processCanvasInWorker(
  source: HTMLCanvasElement,
  options: ProcessOptions,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<HTMLCanvasElement> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))
  const width = source.width
  const height = source.height
  const pixels = source.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data
  const buffer = pixels.buffer

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./image-processing.worker.ts", import.meta.url), { type: "module" })
    const cleanup = () => {
      signal?.removeEventListener("abort", abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", abort, { once: true })
    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || "Image processing worker failed"))
    }
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: number; pixels?: ArrayBuffer; error?: string }>) => {
      if (event.data.type === "progress") {
        onProgress?.(event.data.progress ?? 0)
        return
      }
      cleanup()
      if (event.data.type === "error" || !event.data.pixels) {
        reject(new Error(event.data.error || "Image processing failed"))
        return
      }
      const targetWidth = options.kind === "resize" ? options.targetWidth : width
      const targetHeight = options.kind === "resize" ? options.targetHeight : height
      const output = document.createElement("canvas")
      output.width = targetWidth
      output.height = targetHeight
      const ctx = output.getContext("2d")!
      const imageData = ctx.createImageData(targetWidth, targetHeight)
      imageData.data.set(new Uint8ClampedArray(event.data.pixels))
      ctx.putImageData(imageData, 0, 0)
      resolve(output)
    }
    const request = { ...options, width, height, pixels: buffer }
    worker.postMessage(request, [buffer])
  })
}
