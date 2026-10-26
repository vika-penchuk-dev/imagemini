import type { EnhanceSettings } from "./image-core"
export function resizeRgba(source: Uint8ClampedArray, srcW: number, srcH: number, dstW: number, dstH: number, onProgress?: (progress: number) => void): Uint8ClampedArray
export function enhanceRgba(source: Uint8ClampedArray, width: number, height: number, settings: EnhanceSettings): Uint8ClampedArray
