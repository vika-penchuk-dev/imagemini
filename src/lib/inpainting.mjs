export const MAX_INPAINT_AREA = 262_144

/**
 * Fills a selected region with a local harmonic estimate. Works best for small
 * defects and thin objects; it does not invent texture hidden behind an object.
 */
export function inpaintRgba(rgba, mask, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4 || mask.length !== width * height) {
    throw new Error("Image and mask dimensions do not match")
  }

  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const x = i % width
    const y = Math.floor(i / width)
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  if (right < 0) return new Uint8ClampedArray(rgba)
  left = Math.max(0, left - 1)
  top = Math.max(0, top - 1)
  right = Math.min(width - 1, right + 1)
  bottom = Math.min(height - 1, bottom + 1)
  const area = (right - left + 1) * (bottom - top + 1)
  if (area > MAX_INPAINT_AREA) throw new Error("Selected area is too large to restore")

  const result = new Uint8ClampedArray(rgba)
  const previous = new Float32Array(area * 4)
  const next = new Float32Array(area * 4)
  const selected = new Uint8Array(area)
  const localWidth = right - left + 1
  const localHeight = bottom - top + 1
  for (let y = 0; y < localHeight; y++) {
    for (let x = 0; x < localWidth; x++) {
      const local = y * localWidth + x
      const global = (top + y) * width + left + x
      selected[local] = mask[global] ? 1 : 0
      previous.set(rgba.subarray(global * 4, global * 4 + 4), local * 4)
    }
  }

  // Relax the masked pixels toward their four-connected neighborhood.
  for (let pass = 0; pass < 96; pass++) {
    next.set(previous)
    for (let y = 0; y < localHeight; y++) {
      for (let x = 0; x < localWidth; x++) {
        const index = y * localWidth + x
        if (!selected[index]) continue
        let count = 0
        const sum = [0, 0, 0, 0]
        for (const neighbor of [index - 1, index + 1, index - localWidth, index + localWidth]) {
          if (neighbor < 0 || neighbor >= area) continue
          if ((neighbor === index - 1 && x === 0) || (neighbor === index + 1 && x === localWidth - 1)) continue
          if ((neighbor === index - localWidth && y === 0) || (neighbor === index + localWidth && y === localHeight - 1)) continue
          for (let channel = 0; channel < 4; channel++) sum[channel] += previous[neighbor * 4 + channel]
          count++
        }
        if (!count) continue
        for (let channel = 0; channel < 4; channel++) next[index * 4 + channel] = sum[channel] / count
      }
    }
    previous.set(next)
  }

  for (let y = 0; y < localHeight; y++) {
    for (let x = 0; x < localWidth; x++) {
      const local = y * localWidth + x
      if (!selected[local]) continue
      const global = (top + y) * width + left + x
      for (let channel = 0; channel < 4; channel++) result[global * 4 + channel] = previous[local * 4 + channel]
    }
  }
  return result
}
