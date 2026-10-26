export function editorFontStack(fontFamily) {
  const name = fontFamily || "system-ui"
  const fallback = /^(Georgia|Times New Roman)$/i.test(name) ? "serif"
    : /^(Courier New|monospace)$/i.test(name) ? "monospace"
      : "sans-serif"
  return `${JSON.stringify(name)}, ${fallback}`
}

export function drawTextLayers(context, layers) {
  for (const layer of layers) {
    if (!layer.text) continue
    context.save()
    context.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100))
    context.fillStyle = layer.color
    context.textBaseline = "top"
    context.font = `${layer.italic ? "italic " : ""}${layer.bold ? "bold " : ""}${layer.fontSize}px ${editorFontStack(layer.fontFamily)}`
    context.translate(layer.x, layer.y)
    context.rotate(layer.angle * Math.PI / 180)
    layer.text.split("\n").forEach((line, index) => context.fillText(line, 0, index * layer.fontSize * 1.2))
    context.restore()
  }
}

export function compositeCanvasWithText(source, layers) {
  const output = document.createElement("canvas")
  output.width = source.width
  output.height = source.height
  const context = output.getContext("2d")
  if (!context) throw new Error("2D canvas context is unavailable")
  context.drawImage(source, 0, 0)
  drawTextLayers(context, layers)
  return output
}

function normalizeAngle(angle) {
  let normalized = ((angle + 180) % 360 + 360) % 360 - 180
  if (Object.is(normalized, -0)) normalized = 0
  return normalized
}

export function transformTextLayers(layers, transform) {
  const crop = transform.crop ?? { x: 0, y: 0, w: transform.sourceWidth, h: transform.sourceHeight }
  const width = crop.w
  const height = crop.h
  const radians = transform.rotate * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const swaps = Math.abs(Math.sin(radians)) > 0.001
  const rotatedWidth = swaps ? height : width
  const rotatedHeight = swaps ? width : height
  return layers.map((layer) => {
    const x = layer.x - crop.x
    const y = layer.y - crop.y
    const dx = x - width / 2
    const dy = y - height / 2
    let nextX = rotatedWidth / 2 + dx * cosine - dy * sine
    let nextY = rotatedHeight / 2 + dx * sine + dy * cosine
    let angle = layer.angle + transform.rotate
    if (transform.flipH) {
      nextX = rotatedWidth - nextX
      angle = 180 - angle
    }
    if (transform.flipV) {
      nextY = rotatedHeight - nextY
      angle = -angle
    }
    return { ...layer, x: nextX, y: nextY, angle: normalizeAngle(angle) }
  })
}
