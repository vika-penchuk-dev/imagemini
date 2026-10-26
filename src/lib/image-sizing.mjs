export function computeUpscaleSize(width, height, factor) {
  if (![1.5, 2, 3, 4].includes(factor)) {
    throw new RangeError("Unsupported upscale factor")
  }
  return {
    width: Math.round(width * factor),
    height: Math.round(height * factor),
  }
}

export function clampSliderValue(value, min, max, step = 1) {
  if (!Number.isFinite(value)) return min
  const clamped = Math.min(max, Math.max(min, value))
  const quantized = min + Math.round((clamped - min) / step) * step
  return Number(Math.min(max, Math.max(min, quantized)).toFixed(5))
}

