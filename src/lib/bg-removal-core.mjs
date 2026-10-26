const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

export function imageDataToInputTensor(imageData) {
  const { width, height, data } = imageData
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error("Image dimensions do not match RGBA data")
  }
  const plane = width * height
  const tensor = new Float32Array(plane * 3)
  for (let pixel = 0; pixel < plane; pixel++) {
    const offset = pixel * 4
    for (let channel = 0; channel < 3; channel++) {
      tensor[channel * plane + pixel] = (data[offset + channel] / 255 - MEAN[channel]) / STD[channel]
    }
  }
  return tensor
}

export function logitsToAlpha(logits, width, height, outputWidth, outputHeight) {
  if (logits.length !== width * height || !width || !height || !outputWidth || !outputHeight) {
    throw new Error("Logit dimensions do not match the output mask")
  }
  const alpha = new Uint8ClampedArray(outputWidth * outputHeight)
  const at = (x, y) => {
    const value = logits[y * width + x]
    return 1 / (1 + Math.exp(-Math.max(-80, Math.min(80, value))))
  }
  for (let y = 0; y < outputHeight; y++) {
    const sy = outputHeight === 1 ? 0 : y * (height - 1) / (outputHeight - 1)
    const y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0
    for (let x = 0; x < outputWidth; x++) {
      const sx = outputWidth === 1 ? 0 : x * (width - 1) / (outputWidth - 1)
      const x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0
      const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx
      const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx
      alpha[y * outputWidth + x] = (top * (1 - fy) + bottom * fy) * 255
    }
  }
  return alpha
}

export function decontaminateEdges(rgba, alpha, width, height) {
  if (rgba.length !== width * height * 4 || alpha.length !== width * height) {
    throw new Error("Edge buffers do not match image dimensions")
  }
  const result = new Uint8ClampedArray(rgba)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const coverage = alpha[pixel] / 255
      if (coverage < 0.25 || coverage > 0.995) continue
      let r = 0, g = 0, b = 0, count = 0
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if ((!dx && !dy) || dx * dx + dy * dy > 16) continue
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const neighbor = ny * width + nx
          if (alpha[neighbor] > 12) continue
          const offset = neighbor * 4
          r += rgba[offset]
          g += rgba[offset + 1]
          b += rgba[offset + 2]
          count++
        }
      }
      if (!count) continue
      const background = [r / count, g / count, b / count]
      if (Math.min(...background) < 210 || Math.max(...background) - Math.min(...background) > 40) continue
      const offset = pixel * 4
      for (let channel = 0; channel < 3; channel++) {
        result[offset + channel] = Math.max(0, Math.min(255,
          (rgba[offset + channel] - background[channel] * (1 - coverage)) / coverage))
      }
    }
  }
  return result
}
