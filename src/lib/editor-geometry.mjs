const EDITOR_CURSOR_COLORS = {
  white: "#ffffff",
  red: "#ef4444",
  blue: "#3b82f6",
  black: "#111827",
  yellow: "#facc15",
}

export function editorCursorColor(color) {
  return EDITOR_CURSOR_COLORS[color] ?? EDITOR_CURSOR_COLORS.yellow
}

export function editorSelectionStroke(color) {
  return {
    stroke: editorCursorColor(color),
    outline: color === "white" || color === "yellow" ? "#111827" : "#ffffff",
  }
}

export function polygonPreviewPoints(points, hover, active) {
  if (active) return hover ? [...points, hover] : points
  return points.length > 2 ? [...points, points[0]] : points
}

export function zoomScrollOffset(currentZoom, nextZoom, rect, scrollLeft, scrollTop, clientX, clientY) {
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
  const ratio = nextZoom / currentZoom
  return {
    left: Math.max(0, (scrollLeft + x) * ratio - x),
    top: Math.max(0, (scrollTop + y) * ratio - y),
  }
}

export function shouldActivateSpacePan(keyCode, targetInfo = {}) {
  if (keyCode !== "Space" || targetInfo.isContentEditable || targetInfo.inControl) return false
  return !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes((targetInfo.tagName ?? "").toUpperCase())
}

export function editorCursorCss(color) {
  const fill = editorCursorColor(color)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M21 3 6 18l-3 4 4-2L22 5z" fill="${fill}" stroke="#111827" stroke-width="4" stroke-linejoin="round"/><path d="M21 3 6 18l-3 4 4-2L22 5z" fill="${fill}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 22 6 18" stroke="#111827" stroke-width="1.2"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 22, crosshair`
}

export function pointerToImagePoint(clientX, clientY, rect, imageWidth, imageHeight) {
  return {
    x: Math.max(0, Math.min(imageWidth - 1, ((clientX - rect.left) / rect.width) * imageWidth)),
    y: Math.max(0, Math.min(imageHeight - 1, ((clientY - rect.top) / rect.height) * imageHeight)),
  }
}

export function imageFitScale(imageWidth, imageHeight, viewportWidth, viewportHeight) {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1
  return Math.min(1, viewportWidth / imageWidth, viewportHeight / imageHeight)
}

export function editorViewportLayout(imageWidth, imageHeight, viewportWidth, viewportHeight, zoom, offsetX = 0, offsetY = 0) {
  const width = Math.max(0, imageWidth * zoom)
  const height = Math.max(0, imageHeight * zoom)
  return {
    left: Math.max(0, (viewportWidth - width) / 2) + offsetX,
    top: Math.max(0, (viewportHeight - height) / 2) + offsetY,
    width,
    height,
  }
}

export function editorViewportZoomOffset(layout, currentZoom, nextZoom, viewportRect, clientX, clientY) {
  const anchorX = clientX - viewportRect.left
  const anchorY = clientY - viewportRect.top
  const imageX = (anchorX - layout.left) / currentZoom
  const imageY = (anchorY - layout.top) / currentZoom
  const width = layout.width / currentZoom * nextZoom
  const height = layout.height / currentZoom * nextZoom
  return {
    x: anchorX - imageX * nextZoom - Math.max(0, (viewportRect.width - width) / 2),
    y: anchorY - imageY * nextZoom - Math.max(0, (viewportRect.height - height) / 2),
  }
}

export function nextEditorZoom(current, direction, minimum = 0.25, maximum = 16) {
  const next = current * (direction >= 0 ? 1.25 : 1 / 1.25)
  return Math.max(minimum, Math.min(maximum, Math.round(next * 10000) / 10000))
}

export function shouldClosePolygon(clientX, clientY, firstClientX, firstClientY, doubleClick = false, threshold = 14) {
  return doubleClick || Math.hypot(clientX - firstClientX, clientY - firstClientY) <= threshold
}

export function getEdgePanDelta(position, start, end, margin = 56, maximum = 18) {
  if (position < start + margin) return -maximum * Math.min(1, (start + margin - position) / margin)
  if (position > end - margin) return maximum * Math.min(1, (position - (end - margin)) / margin)
  return 0
}

export function layerLocalToImagePoint(point, layer) {
  const dx = (point.x - layer.width / 2) * layer.scale * (layer.flipX ? -1 : 1)
  const dy = (point.y - layer.height / 2) * layer.scale * (layer.flipY ? -1 : 1)
  const radians = layer.angle * Math.PI / 180
  return {
    x: layer.x + layer.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: layer.y + layer.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

export function imageToLayerLocalPoint(point, layer) {
  const dx = point.x - layer.x - layer.width / 2
  const dy = point.y - layer.y - layer.height / 2
  const radians = -layer.angle * Math.PI / 180
  const flipX = layer.flipX ? -1 : 1
  const flipY = layer.flipY ? -1 : 1
  return {
    x: (dx * Math.cos(radians) - dy * Math.sin(radians)) / (layer.scale * flipX) + layer.width / 2,
    y: (dx * Math.sin(radians) + dy * Math.cos(radians)) / (layer.scale * flipY) + layer.height / 2,
  }
}

export function isPointInLayer(point, layer, tolerance = 0) {
  const local = imageToLayerLocalPoint(point, layer)
  return local.x >= -tolerance && local.y >= -tolerance && local.x <= layer.width + tolerance && local.y <= layer.height + tolerance
}

export function layerHandleAt(point, corners, tolerance) {
  return corners.findIndex((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) <= tolerance)
}

export function moveLayerBy(layer, dx, dy) {
  return { ...layer, x: layer.x + dx, y: layer.y + dy }
}

export function eraseLayerAlpha(rgba, width, height, centerX, centerY, radius, softness, opacity, mode = "soft") {
  if (!Number.isInteger(width) || !Number.isInteger(height) || rgba.length !== width * height * 4) {
    throw new Error("Layer dimensions do not match")
  }
  const result = new Uint8ClampedArray(rgba)
  const extent = Math.ceil(radius)
  for (let y = Math.max(0, Math.floor(centerY - extent)); y <= Math.min(height - 1, Math.ceil(centerY + extent)); y++) {
    for (let x = Math.max(0, Math.floor(centerX - extent)); x <= Math.min(width - 1, Math.ceil(centerX + extent)); x++) {
      const distance = Math.hypot(x - centerX, y - centerY)
      if (distance > radius) continue
      const edge = mode === "hard" ? 1 : Math.max(0, Math.min(1, (radius - distance) / Math.max(1, radius * (softness / 100))))
      const smooth = edge * edge * (3 - 2 * edge)
      const index = (y * width + x) * 4 + 3
      result[index] = Math.round(result[index] * (1 - smooth * (opacity / 100)))
    }
  }
  return result
}

export function editorBrushDiameterOnScreen(diameter, zoom) {
  return Math.max(0, diameter * zoom)
}

export function canvasExportDimensions(canvas) {
  return { width: canvas.width, height: canvas.height }
}
