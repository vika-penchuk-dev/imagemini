import { denoiseRgba, sharpenRgba } from "./image-filters.mjs"
import { optimizePng } from "./png-optimizer.mjs"

export const ACCEPTED_INPUT =
  ".jpg,.jpeg,.png,.webp,.bmp,.gif,.avif,.tiff,.tif,.heic,.heif,.svg,.ico,image/*"

export type OutputFormat = "image/jpeg" | "image/png" | "image/webp"

export const OUTPUT_FORMATS: OutputFormat[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
]

export function extForFormat(format: OutputFormat): string {
  switch (format) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`
}

export function formatBytesLocalized(bytes: number, lang: "ru" | "en"): string {
  const units =
    lang === "ru" ? ["Б", "КБ", "МБ"] : ["B", "KB", "MB"]
  if (bytes < 1024) return `${bytes} ${units[0]}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${units[1]}`
  return `${(bytes / (1024 * 1024)).toFixed(2)} ${units[2]}`
}

// Browser canvas limits (conservative across engines)
export const MAX_CANVAS_AREA = 268_435_456 // 16384^2
export const MAX_CANVAS_DIMENSION = 32_768

export function fitsCanvas(w: number, h: number): boolean {
  return (
    w > 0 &&
    h > 0 &&
    w * h <= MAX_CANVAS_AREA &&
    w <= MAX_CANVAS_DIMENSION &&
    h <= MAX_CANVAS_DIMENSION
  )
}

export function suggestScaleDown(w: number, h: number): number {
  const area = w * h
  if (area <= MAX_CANVAS_AREA) return 1
  return Math.sqrt(MAX_CANVAS_AREA / area)
}

export interface LoadedBitmap {
  bitmap: ImageBitmap | HTMLImageElement
  width: number
  height: number
}

export async function decodeToBitmap(
  blob: Blob
): Promise<LoadedBitmap> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      })
      return { bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () =>
        reject(new Error("Не удалось декодировать изображение / Cannot decode image"))
      el.src = url
    })
    return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    // keep URL alive while img is in use; revoke on next GC tick
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

export async function blobToSvgSanitized(blob: Blob): Promise<Blob> {
  const text = await blob.text()
  // Strip scripts, event handlers and external references
  let cleaned = text
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
  if (!/<svg[\s>]/i.test(cleaned)) {
    throw new Error("Файл не является корректным SVG / Not a valid SVG file")
  }
  return new Blob([cleaned], { type: "image/svg+xml" })
}

export async function decodeSvgToBitmap(
  blob: Blob
): Promise<LoadedBitmap> {
  const sanitized = await blobToSvgSanitized(blob)
  const url = URL.createObjectURL(sanitized)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Не удалось декодировать SVG / Cannot decode SVG"))
      el.src = url
    })
    const width = img.naturalWidth || 1024
    const height = img.naturalHeight || 1024
    const scale = Math.min(1, 8192 / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0, w, h)
    const outBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("SVG rasterize failed"))), "image/png")
    )
    const bitmap = await createImageBitmap(outBlob)
    return { bitmap, width: w, height: h }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

export function drawToCanvas(
  bitmap: CanvasImageSource,
  width: number,
  height: number,
  transform?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  if (transform) {
    transform(ctx, width, height)
  } else {
    ctx.drawImage(bitmap, 0, 0, width, height)
  }
  return canvas
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Кодирование не удалось / Encoding failed"))
      },
      format,
      quality
    )
  })
}

export function compressCanvas(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number,
  signal?: AbortSignal
): Promise<Blob> {
  if (format === "image/png") {
    return canvasToBlob(canvas, format, 1).then((blob) => optimizePng(blob, quality * 100, signal))
  }
  return canvasToBlob(canvas, format, quality).then((blob) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    return blob
  })
}

// High-quality stepped downscale to avoid aliasing on large reductions
export function steppedDrawToCanvas(
  bitmap: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): HTMLCanvasElement {
  let curW = srcW
  let curH = srcH
  let source: CanvasImageSource = bitmap
  let canvas: HTMLCanvasElement | null = null
  while (curW / 2 > dstW && curH / 2 > dstH) {
    curW = Math.max(dstW, Math.floor(curW / 2))
    curH = Math.max(dstH, Math.floor(curH / 2))
    canvas = document.createElement("canvas")
    canvas.width = curW
    canvas.height = curH
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(source, 0, 0, curW, curH)
    source = canvas
  }
  return drawToCanvas(source, dstW, dstH)
}

export interface ResizeOptions {
  mode: "exact" | "percent" | "longSide" | "preset" | "scale"
  width?: number
  height?: number
  percent?: number
  longSide?: number
  preset?: number
  scale?: number
  keepAspect: boolean
  dontEnlarge: boolean
}

export function computeTargetSize(
  srcW: number,
  srcH: number,
  opts: ResizeOptions
): { w: number; h: number } {
  let w = srcW
  let h = srcH
  switch (opts.mode) {
    case "exact": {
      if (opts.keepAspect) {
        const rw = (opts.width ?? srcW) / srcW
        const rh = (opts.height ?? srcH) / srcH
        const r = Math.min(rw, rh)
        w = Math.round(srcW * r)
        h = Math.round(srcH * r)
      } else {
        w = opts.width ?? srcW
        h = opts.height ?? srcH
      }
      break
    }
    case "percent": {
      const p = (opts.percent ?? 100) / 100
      w = Math.round(srcW * p)
      h = Math.round(srcH * p)
      break
    }
    case "longSide": {
      const target = opts.longSide ?? srcW
      if (srcW >= srcH) {
        w = target
        h = Math.round((srcH / srcW) * target)
      } else {
        h = target
        w = Math.round((srcW / srcH) * target)
      }
      break
    }
    case "preset": {
      const target = opts.preset ?? 1024
      if (srcW >= srcH) {
        w = target
        h = Math.round((srcH / srcW) * target)
      } else {
        h = target
        w = Math.round((srcW / srcH) * target)
      }
      break
    }
    case "scale": {
      const scale = opts.scale ?? 2
      w = Math.round(srcW * scale)
      h = Math.round(srcH * scale)
      break
    }
  }
  if (opts.dontEnlarge) {
    const scale = Math.min(1, w / srcW, h / srcH)
    w = Math.round(srcW * scale)
    h = Math.round(srcH * scale)
  }
  w = Math.max(1, w)
  h = Math.max(1, h)
  return { w, h }
}

export interface EnhanceSettings {
  brightness: number // -100..100
  contrast: number // -100..100
  saturation: number // -100..100
  gamma: number // 0.2..3 (1 = neutral)
  sharpen: number // 0..100
  denoise: number // 0..100
}

export const DEFAULT_ENHANCE: EnhanceSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  gamma: 1,
  sharpen: 0,
  denoise: 0,
}

export interface EnhancePreset {
  id: string
  settings: Partial<EnhanceSettings>
}

export const ENHANCE_PRESETS: EnhancePreset[] = [
  { id: "photo", settings: { sharpen: 25, saturation: 8, contrast: 8 } },
  { id: "screenshot", settings: { sharpen: 45, contrast: 15, denoise: 15 } },
  { id: "document", settings: { sharpen: 35, contrast: 30, brightness: 5, saturation: -40 } },
  { id: "text", settings: { sharpen: 55, contrast: 35, saturation: -60 } },
  { id: "soft", settings: { sharpen: 10, brightness: 3 } },
  { id: "crisp", settings: { sharpen: 40, contrast: 18, denoise: 10, saturation: 5 } },
  { id: "auto", settings: { sharpen: 30, contrast: 12, denoise: 12, saturation: 6 } },
]

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function buildLookup(brightness: number, contrast: number, gamma: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  const b = (brightness / 100) * 64
  const c = 1 + contrast / 100
  for (let i = 0; i < 256; i++) {
    let v = i + b
    v = (v - 128) * c + 128
    v = 255 * Math.pow(clamp(v, 0, 255) / 255, 1 / gamma)
    lut[i] = clamp(Math.round(v), 0, 255)
  }
  return lut
}

export interface EditTransform {
  rotate: number // degrees: 0 | 90 | 180 | 270 (free angle supported)
  flipH: boolean
  flipV: boolean
  crop: { x: number; y: number; w: number; h: number } | null // in source pixels
}

export const DEFAULT_TRANSFORM: EditTransform = {
  rotate: 0,
  flipH: false,
  flipV: false,
  crop: null,
}

export function applyTransformToCanvas(
  source: HTMLCanvasElement,
  t: EditTransform
): HTMLCanvasElement {
  let work = source
  if (t.crop) {
    const c = t.crop
    const cw = Math.max(1, Math.min(c.w, source.width - c.x))
    const ch = Math.max(1, Math.min(c.h, source.height - c.y))
    const cropped = document.createElement("canvas")
    cropped.width = cw
    cropped.height = ch
    cropped.getContext("2d")!.drawImage(source, c.x, c.y, cw, ch, 0, 0, cw, ch)
    work = cropped
  }
  const rad = (t.rotate * Math.PI) / 180
  const swap = Math.abs(Math.sin(rad)) > 0.001
  const w = swap ? work.height : work.width
  const h = swap ? work.width : work.height
  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  const ctx = out.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.translate(w / 2, h / 2)
  ctx.rotate(rad)
  ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1)
  ctx.drawImage(work, -work.width / 2, -work.height / 2)
  return out
}

export interface EnhanceOptions {
  composite?: boolean // also composite onto background color (for jpeg export)
  background?: string
}

export async function enhanceImageData(
  source: HTMLCanvasElement,
  settings: EnhanceSettings
): Promise<HTMLCanvasElement> {
  const w = source.width
  const h = source.height
  const ctx = source.getContext("2d", { willReadFrequently: true })!
  let data = ctx.getImageData(0, 0, w, h)

  // 1. Brightness/contrast/gamma via LUT
  if (settings.brightness !== 0 || settings.contrast !== 0 || settings.gamma !== 1) {
    const lut = buildLookup(settings.brightness, settings.contrast, settings.gamma)
    const d = data.data
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]]
      d[i + 1] = lut[d[i + 1]]
      d[i + 2] = lut[d[i + 2]]
    }
  }

  // 2. Saturation
  if (settings.saturation !== 0) {
    const s = 1 + settings.saturation / 100
    const d = data.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      d[i] = clamp(gray + (d[i] - gray) * s, 0, 255)
      d[i + 1] = clamp(gray + (d[i + 1] - gray) * s, 0, 255)
      d[i + 2] = clamp(gray + (d[i + 2] - gray) * s, 0, 255)
    }
  }

  // 3. Edge-preserving 5x5 median denoise
  if (settings.denoise > 0) {
    data.data.set(denoiseRgba(data.data, w, h, settings.denoise))
  }

  // 4. Thresholded unsharp mask bounded by local pixel values to avoid halos
  if (settings.sharpen > 0) {
    data.data.set(sharpenRgba(data.data, w, h, settings.sharpen))
  }

  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  out.getContext("2d")!.putImageData(data, 0, 0)
  return out
}

// Lanczos resampling in a worker-friendly pure-JS form (separable 3-lobe)
export function lanczosKernel(x: number, a = 3): number {
  if (x === 0) return 1
  if (x < -a || x > a) return 0
  const px = Math.PI * x
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px)
}

export function lanczosResize(
  source: HTMLCanvasElement,
  dstW: number,
  dstH: number,
  onProgress?: (p: number) => void
): HTMLCanvasElement {
  const srcW = source.width
  const srcH = source.height
  const sctx = source.getContext("2d", { willReadFrequently: true })!
  const src = sctx.getImageData(0, 0, srcW, srcH).data

  const filterScaleX = Math.max(1, srcW / dstW)
  const filterScaleY = Math.max(1, srcH / dstH)

  // horizontal pass
  const tmp = new Float32Array(dstW * srcH * 4)
  const xSupport = Math.ceil(3 * filterScaleX)
  const xWeights: { start: number; weights: number[] }[] = []
  for (let dx = 0; dx < dstW; dx++) {
    const center = (dx + 0.5) * (srcW / dstW) - 0.5
    const start = Math.floor(center) - xSupport + 1
    const weights: number[] = []
    let sum = 0
    for (let i = 0; i < xSupport * 2; i++) {
      const sx = start + i
      const wgt = lanczosKernel((sx - center) / filterScaleX)
      weights.push(wgt)
      sum += wgt
    }
    for (let i = 0; i < weights.length; i++) weights[i] /= sum
    xWeights.push({ start, weights })
  }
  for (let y = 0; y < srcH; y++) {
    for (let dx = 0; dx < dstW; dx++) {
      const { start, weights } = xWeights[dx]
      let r = 0, g = 0, b = 0, a = 0
      for (let i = 0; i < weights.length; i++) {
        const sx = clamp(start + i, 0, srcW - 1)
        const si = (y * srcW + sx) * 4
        const wt = weights[i]
        r += src[si] * wt
        g += src[si + 1] * wt
        b += src[si + 2] * wt
        a += src[si + 3] * wt
      }
      const ti = (y * dstW + dx) * 4
      tmp[ti] = r; tmp[ti + 1] = g; tmp[ti + 2] = b; tmp[ti + 3] = a
    }
    if (onProgress && y % 64 === 0) onProgress((y / srcH) * 0.5)
  }

  // vertical pass
  const out = document.createElement("canvas")
  out.width = dstW
  out.height = dstH
  const octx = out.getContext("2d")!
  const outData = octx.createImageData(dstW, dstH)
  const od = outData.data
  const ySupport = Math.ceil(3 * filterScaleY)
  for (let dy = 0; dy < dstH; dy++) {
    const center = (dy + 0.5) * (srcH / dstH) - 0.5
    const start = Math.floor(center) - ySupport + 1
    const weights: number[] = []
    let sum = 0
    for (let i = 0; i < ySupport * 2; i++) {
      const sy = start + i
      const wgt = lanczosKernel((sy - center) / filterScaleY)
      weights.push(wgt)
      sum += wgt
    }
    for (let i = 0; i < weights.length; i++) weights[i] /= sum
    for (let dx = 0; dx < dstW; dx++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let i = 0; i < weights.length; i++) {
        const sy = clamp(start + i, 0, srcH - 1)
        const ti = (sy * dstW + dx) * 4
        const wt = weights[i]
        r += tmp[ti] * wt
        g += tmp[ti + 1] * wt
        b += tmp[ti + 2] * wt
        a += tmp[ti + 3] * wt
      }
      const oi = (dy * dstW + dx) * 4
      od[oi] = clamp(r, 0, 255)
      od[oi + 1] = clamp(g, 0, 255)
      od[oi + 2] = clamp(b, 0, 255)
      od[oi + 3] = clamp(a, 0, 255)
    }
    if (onProgress && dy % 32 === 0) onProgress(0.5 + (dy / dstH) * 0.5)
  }
  octx.putImageData(outData, 0, 0)
  return out
}

export function flattenOnBackground(
  source: HTMLCanvasElement,
  color: string
): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext("2d")!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(source, 0, 0)
  return out
}

export function hasAlphaChannel(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 255) return true
  }
  return false
}

export function getBaseName(name: string): string {
  const idx = name.lastIndexOf(".")
  return idx > 0 ? name.slice(0, idx) : name
}
