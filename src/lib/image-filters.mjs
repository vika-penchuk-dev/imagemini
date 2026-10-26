const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function denoiseRgba(source, width, height, strength) {
  if (!strength) return new Uint8ClampedArray(source)
  const result = new Uint8ClampedArray(source)
  const amount = clamp(strength / 100, 0, 1)
  const samples = [[], [], []]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = (y * width + x) * 4
      if (!source[center + 3]) continue
      for (const values of samples) values.length = 0
      for (let dy = -2; dy <= 2; dy++) {
        const sy = y + dy
        if (sy < 0 || sy >= height) continue
        for (let dx = -2; dx <= 2; dx++) {
          const sx = x + dx
          if (sx < 0 || sx >= width) continue
          const i = (sy * width + sx) * 4
          if (!source[i + 3]) continue
          for (let c = 0; c < 3; c++) samples[c].push(source[i + c])
        }
      }
      for (let c = 0; c < 3; c++) {
        const values = samples[c]
        values.sort((a, b) => a - b)
        const filtered = values[Math.floor(values.length / 2)]
        result[center + c] = source[center + c] * (1 - amount) + filtered * amount
      }
    }
  }
  return result
}

export function sharpenRgba(source, width, height, strength) {
  const result = new Uint8ClampedArray(source)
  const amount = clamp(strength / 100, 0, 1) * 0.65
  if (!amount) return result
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        let blur = 0
        let weight = 0
        let localMin = 255
        let localMax = 0
        for (let dy = -1; dy <= 1; dy++) {
          const sy = clamp(y + dy, 0, height - 1)
          for (let dx = -1; dx <= 1; dx++) {
            const sx = clamp(x + dx, 0, width - 1)
            const value = source[(sy * width + sx) * 4 + c]
            const w = kernel[(dy + 1) * 3 + dx + 1]
            blur += value * w
            weight += w
            localMin = Math.min(localMin, value)
            localMax = Math.max(localMax, value)
          }
        }
        const original = source[i + c]
        const highPass = original - blur / weight
        const thresholded = Math.abs(highPass) < 3 ? 0 : highPass
        result[i + c] = clamp(original + thresholded * amount, localMin, localMax)
      }
    }
  }
  return result
}
