import { enhanceRgba, resizeRgba } from "./image-worker-algorithms.mjs"
import type { EnhanceSettings } from "./image-core"

type Request = {
  kind: "resize" | "enhance"
  pixels: ArrayBuffer
  width: number
  height: number
  targetWidth?: number
  targetHeight?: number
  settings?: EnhanceSettings
}

type WorkerScope = {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
scope.onmessage = ({ data }) => {
  try {
    const source = new Uint8ClampedArray(data.pixels)
    const pixels = data.kind === "resize"
      ? resizeRgba(source, data.width, data.height, data.targetWidth!, data.targetHeight!, (progress) => {
          scope.postMessage({ type: "progress", progress })
        })
      : enhanceRgba(source, data.width, data.height, data.settings!)
    scope.postMessage({ type: "done", pixels: pixels.buffer }, [pixels.buffer])
  } catch (error) {
    scope.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) })
  }
}
