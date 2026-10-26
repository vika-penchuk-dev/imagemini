export const MAX_PATCH_AREA = 1_048_576

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function fitBoundaryPlane(rgba, mask, width, height, left, top, right, bottom, fallback) {
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2
  const scale = Math.max(1, right - left + 1, bottom - top + 1) / 2
  const matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const values = Array.from({ length: 3 }, () => [0, 0, 0])
  const minima = [255, 255, 255], maxima = [0, 0, 0]
  let samples = 0

  for (let y = Math.max(0, top - 1); y <= Math.min(height - 1, bottom + 1); y++) {
    for (let x = Math.max(0, left - 1); x <= Math.min(width - 1, right + 1); x++) {
      const index = y * width + x
      if (mask[index]) continue
      const adjacent = (x > 0 && mask[index - 1]) || (x + 1 < width && mask[index + 1]) ||
        (y > 0 && mask[index - width]) || (y + 1 < height && mask[index + width])
      if (!adjacent) continue

      const u = (x - centerX) / scale, v = (y - centerY) / scale
      const features = [1, u, v]
      for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
        matrix[row * 3 + column] += features[row] * features[column]
      }
      const pixel = index * 4
      for (let channel = 0; channel < 3; channel++) {
        const color = rgba[pixel + channel]
        for (let row = 0; row < 3; row++) values[channel][row] += features[row] * color
        minima[channel] = Math.min(minima[channel], color)
        maxima[channel] = Math.max(maxima[channel], color)
      }
      samples++
    }
  }

  if (samples < 3) return null
  const solve = (rightHandSide) => {
    const rows = Array.from({ length: 3 }, (_, row) => [matrix[row * 3], matrix[row * 3 + 1], matrix[row * 3 + 2], rightHandSide[row]])
    for (let column = 0; column < 3; column++) {
      let pivot = column
      for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
      if (Math.abs(rows[pivot][column]) < 1e-8) return null
      ;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
      const divisor = rows[column][column]
      for (let item = column; item < 4; item++) rows[column][item] /= divisor
      for (let row = 0; row < 3; row++) {
        if (row === column) continue
        const factor = rows[row][column]
        for (let item = column; item < 4; item++) rows[row][item] -= factor * rows[column][item]
      }
    }
    return rows.map((row) => row[3])
  }
  const coefficients = values.map((channelValues, channel) => solve(channelValues) ?? [fallback[channel], 0, 0])

  return (channel, x, y) => {
    const u = (x - centerX) / scale, v = (y - centerY) / scale
    const [offset, slopeX, slopeY] = coefficients[channel]
    return clamp(offset + slopeX * u + slopeY * v, minima[channel], maxima[channel])
  }
}

/** Fills a mask from its surrounding tone or a matched donor texture. */
export function applyPatchRgba(rgba, mask, width, height, offsetX, offsetY, feather = 12, mode = "texture") {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4 || mask.length !== width * height) {
    throw new Error("Image and mask dimensions do not match")
  }
  if (!Number.isInteger(offsetX) || !Number.isInteger(offsetY)) throw new Error("Patch offset must use whole pixels")

  let left = width, top = height, right = -1, bottom = -1
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const x = i % width, y = Math.floor(i / width)
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < 0) return new Uint8ClampedArray(rgba)
  const patchWidth = right - left + 1, patchHeight = bottom - top + 1
  if (patchWidth * patchHeight > MAX_PATCH_AREA) throw new Error("Selected area is too large")
  if (left + offsetX < 0 || top + offsetY < 0 || right + offsetX >= width || bottom + offsetY >= height) {
    throw new Error("Donor area is outside the image")
  }

  const radius = clamp(Math.round(Math.min(feather, Math.max(1, Math.min(patchWidth, patchHeight) / 3))), 1, 16)
  const localWidth = patchWidth + 2, localHeight = patchHeight + 2
  const localLeft = left - 1, localTop = top - 1
  const localMask = new Uint8Array(localWidth * localHeight)
  const distance = new Float32Array(localMask.length)
  for (let y = 0; y < localHeight; y++) {
    for (let x = 0; x < localWidth; x++) {
      const gx = localLeft + x, gy = localTop + y
      const value = gx >= 0 && gx < width && gy >= 0 && gy < height ? mask[gy * width + gx] : 0
      localMask[y * localWidth + x] = value
    }
  }
  for (let y = 1; y < localHeight - 1; y++) for (let x = 1; x < localWidth - 1; x++) {
    const i = y * localWidth + x
    if (!localMask[i]) continue
    const edge = !localMask[i - 1] || !localMask[i + 1] || !localMask[i - localWidth] || !localMask[i + localWidth]
    distance[i] = edge ? 1 : radius + 1
  }
  for (let i = 0; i < localMask.length; i++) {
    if (localMask[i] && !distance[i]) distance[i] = 1
    }
  const diagonal = Math.SQRT2
  for (let y = 0; y < localHeight; y++) for (let x = 0; x < localWidth; x++) {
    const i = y * localWidth + x
    if (!localMask[i]) continue
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1)
    if (y) distance[i] = Math.min(distance[i], distance[i - localWidth] + 1)
    if (x && y) distance[i] = Math.min(distance[i], distance[i - localWidth - 1] + diagonal)
    if (x + 1 < localWidth && y) distance[i] = Math.min(distance[i], distance[i - localWidth + 1] + diagonal)
  }
  for (let y = localHeight - 1; y >= 0; y--) for (let x = localWidth - 1; x >= 0; x--) {
    const i = y * localWidth + x
    if (!localMask[i]) continue
    if (x + 1 < localWidth) distance[i] = Math.min(distance[i], distance[i + 1] + 1)
    if (y + 1 < localHeight) distance[i] = Math.min(distance[i], distance[i + localWidth] + 1)
    if (x + 1 < localWidth && y + 1 < localHeight) distance[i] = Math.min(distance[i], distance[i + localWidth + 1] + diagonal)
    if (x && y + 1 < localHeight) distance[i] = Math.min(distance[i], distance[i + localWidth - 1] + diagonal)
  }

  const targetMean = [0, 0, 0], donorMean = [0, 0, 0]
  const targetSquare = [0, 0, 0], donorSquare = [0, 0, 0]
  let targetSamples = 0, donorSamples = 0
  for (let y = Math.max(0, top - 6); y <= Math.min(height - 1, bottom + 6); y++) {
    for (let x = Math.max(0, left - 6); x <= Math.min(width - 1, right + 6); x++) {
      const i = y * width + x
      if (mask[i]) continue
      const target = i * 4
      for (let c = 0; c < 3; c++) {
        const targetValue = rgba[target + c]
        targetMean[c] += targetValue
        targetSquare[c] += targetValue * targetValue
      }
      targetSamples++
    }
  }
  if (mode !== "one-tone") for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (!mask[y * width + x]) continue
    const sx = x + offsetX, sy = y + offsetY, sourceIndex = sy * width + sx
    if (mask[sourceIndex]) continue
    const source = sourceIndex * 4
    for (let c = 0; c < 3; c++) {
      const donorValue = rgba[source + c]
      donorMean[c] += donorValue
      donorSquare[c] += donorValue * donorValue
    }
    donorSamples++
  }
  const mean = (sum, count) => sum.map((value) => count ? value / count : 0)
  const targetAverage = mean(targetMean, targetSamples), donorAverage = mean(donorMean, donorSamples)
  const channelGain = targetMean.map((value, channel) => {
    const targetVariance = targetSquare[channel] / Math.max(1, targetSamples) - (value / Math.max(1, targetSamples)) ** 2
    const donorVariance = donorSquare[channel] / Math.max(1, donorSamples) - (donorMean[channel] / Math.max(1, donorSamples)) ** 2
    const targetDeviation = Math.sqrt(Math.max(0, targetVariance))
    const minimumGain = targetDeviation < 8 ? 0.55 : 0.25
    return clamp(targetDeviation / Math.max(8, Math.sqrt(Math.max(0, donorVariance))), minimumGain, 1.35)
  })
  const oneTone = mode === "one-tone"
  const result = new Uint8ClampedArray(rgba)

  if (oneTone) {
    const boundaryPlane = fitBoundaryPlane(rgba, mask, width, height, left, top, right, bottom, targetAverage)
    const previous = new Float32Array(localMask.length * 3)
    const next = new Float32Array(localMask.length * 3)
    for (let y = 0; y < localHeight; y++) for (let x = 0; x < localWidth; x++) {
      const local = y * localWidth + x, gx = localLeft + x, gy = localTop + y
      const pixel = (gy * width + gx) * 4
      for (let c = 0; c < 3; c++) {
        previous[local * 3 + c] = localMask[local]
          ? boundaryPlane ? boundaryPlane(c, gx, gy) : targetAverage[c]
          : (gx >= 0 && gx < width && gy >= 0 && gy < height ? rgba[pixel + c] : targetAverage[c])
      }
    }
    // The boundary plane carries broad illumination gradients; relaxation softens local deviations.
    for (let pass = 0; pass < Math.min(96, Math.max(radius * 4, Math.min(patchWidth, patchHeight) * 4)); pass++) {
      next.set(previous)
      for (let y = 0; y < localHeight; y++) for (let x = 0; x < localWidth; x++) {
        const local = y * localWidth + x
        if (!localMask[local]) continue
        for (let c = 0; c < 3; c++) {
          let sum = 0, count = 0
          if (x) { sum += previous[(local - 1) * 3 + c]; count++ }
          if (x + 1 < localWidth) { sum += previous[(local + 1) * 3 + c]; count++ }
          if (y) { sum += previous[(local - localWidth) * 3 + c]; count++ }
          if (y + 1 < localHeight) { sum += previous[(local + localWidth) * 3 + c]; count++ }
          next[local * 3 + c] = sum / count
        }
      }
      previous.set(next)
    }
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const i = y * width + x
      if (!mask[i]) continue
      const local = (y - localTop) * localWidth + x - localLeft, target = i * 4
      for (let c = 0; c < 3; c++) result[target + c] = previous[local * 3 + c]
    }
    return result
  }

  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const i = y * width + x, coverage = mask[i]
    if (!coverage) continue
    const localIndex = (y - localTop) * localWidth + x - localLeft
    const edgeProgress = clamp(distance[localIndex] / radius, 0, 1)
    const softEdge = edgeProgress * edgeProgress * (3 - 2 * edgeProgress)
    const alpha = Math.min(coverage / 255, softEdge)
    const source = ((y + offsetY) * width + x + offsetX) * 4, target = i * 4
    for (let c = 0; c < 3; c++) {
      const colorOffset = clamp(targetAverage[c] - donorAverage[c], -80, 80)
      const matched = clamp(rgba[source + c] + colorOffset + (rgba[source + c] - donorAverage[c]) * (channelGain[c] - 1), 0, 255)
      result[target + c] = rgba[target + c] * (1 - alpha) + matched * alpha
    }
  }
  return result
}
