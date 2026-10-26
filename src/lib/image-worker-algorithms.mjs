import { denoiseRgba, sharpenRgba } from "./image-filters.mjs"

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function lanczos(x, lobes = 3) {
  if (x === 0) return 1
  if (x < -lobes || x > lobes) return 0
  const px = Math.PI * x
  return (lobes * Math.sin(px) * Math.sin(px / lobes)) / (px * px)
}

export function resizeRgba(source, srcW, srcH, dstW, dstH, onProgress) {
  const filterScaleX = Math.max(1, srcW / dstW)
  const filterScaleY = Math.max(1, srcH / dstH)
  const tmp = new Float32Array(dstW * srcH * 4)
  const xSupport = Math.ceil(3 * filterScaleX)
  const xWeights = []
  for (let dx = 0; dx < dstW; dx++) {
    const center = (dx + 0.5) * (srcW / dstW) - 0.5
    const start = Math.floor(center) - xSupport + 1
    const weights = []
    let sum = 0
    for (let i = 0; i < xSupport * 2; i++) {
      const weight = lanczos((start + i - center) / filterScaleX)
      weights.push(weight)
      sum += weight
    }
    xWeights.push({ start, weights: weights.map((weight) => weight / sum) })
  }
  for (let y = 0; y < srcH; y++) {
    for (let dx = 0; dx < dstW; dx++) {
      const { start, weights } = xWeights[dx]
      let r = 0, g = 0, b = 0, a = 0
      for (let i = 0; i < weights.length; i++) {
        const sx = clamp(start + i, 0, srcW - 1)
        const sourceIndex = (y * srcW + sx) * 4
        const weight = weights[i]
        r += source[sourceIndex] * weight
        g += source[sourceIndex + 1] * weight
        b += source[sourceIndex + 2] * weight
        a += source[sourceIndex + 3] * weight
      }
      const targetIndex = (y * dstW + dx) * 4
      tmp[targetIndex] = r
      tmp[targetIndex + 1] = g
      tmp[targetIndex + 2] = b
      tmp[targetIndex + 3] = a
    }
    if (onProgress && y % 64 === 0) onProgress((y / srcH) * 0.5)
  }

  const output = new Uint8ClampedArray(dstW * dstH * 4)
  const ySupport = Math.ceil(3 * filterScaleY)
  for (let dy = 0; dy < dstH; dy++) {
    const center = (dy + 0.5) * (srcH / dstH) - 0.5
    const start = Math.floor(center) - ySupport + 1
    const weights = []
    let sum = 0
    for (let i = 0; i < ySupport * 2; i++) {
      const weight = lanczos((start + i - center) / filterScaleY)
      weights.push(weight)
      sum += weight
    }
    for (let i = 0; i < weights.length; i++) weights[i] /= sum
    for (let dx = 0; dx < dstW; dx++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let i = 0; i < weights.length; i++) {
        const sy = clamp(start + i, 0, srcH - 1)
        const sourceIndex = (sy * dstW + dx) * 4
        const weight = weights[i]
        r += tmp[sourceIndex] * weight
        g += tmp[sourceIndex + 1] * weight
        b += tmp[sourceIndex + 2] * weight
        a += tmp[sourceIndex + 3] * weight
      }
      const targetIndex = (dy * dstW + dx) * 4
      output[targetIndex] = clamp(r, 0, 255)
      output[targetIndex + 1] = clamp(g, 0, 255)
      output[targetIndex + 2] = clamp(b, 0, 255)
      output[targetIndex + 3] = clamp(a, 0, 255)
    }
    if (onProgress && dy % 32 === 0) onProgress(0.5 + (dy / dstH) * 0.5)
  }
  return output
}

export function enhanceRgba(source, width, height, settings) {
  const output = new Uint8ClampedArray(source)
  if (settings.brightness !== 0 || settings.contrast !== 0 || settings.gamma !== 1) {
    const lut = new Uint8ClampedArray(256)
    const brightness = (settings.brightness / 100) * 64
    const contrast = 1 + settings.contrast / 100
    for (let i = 0; i < 256; i++) {
      let value = i + brightness
      value = (value - 128) * contrast + 128
      value = 255 * Math.pow(clamp(value, 0, 255) / 255, 1 / settings.gamma)
      lut[i] = clamp(Math.round(value), 0, 255)
    }
    for (let i = 0; i < output.length; i += 4) {
      output[i] = lut[output[i]]
      output[i + 1] = lut[output[i + 1]]
      output[i + 2] = lut[output[i + 2]]
    }
  }
  if (settings.saturation !== 0) {
    const saturation = 1 + settings.saturation / 100
    for (let i = 0; i < output.length; i += 4) {
      const gray = 0.299 * output[i] + 0.587 * output[i + 1] + 0.114 * output[i + 2]
      output[i] = clamp(gray + (output[i] - gray) * saturation, 0, 255)
      output[i + 1] = clamp(gray + (output[i + 1] - gray) * saturation, 0, 255)
      output[i + 2] = clamp(gray + (output[i + 2] - gray) * saturation, 0, 255)
    }
  }
  if (settings.denoise > 0) output.set(denoiseRgba(output, width, height, settings.denoise))
  if (settings.sharpen > 0) output.set(sharpenRgba(output, width, height, settings.sharpen))
  return output
}
