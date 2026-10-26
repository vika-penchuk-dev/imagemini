const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function integerRect(x, y, w, h) {
  return { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) }
}

export function moveCropRect(rect, dx, dy, boundsWidth, boundsHeight) {
  return integerRect(
    clamp(rect.x + dx, 0, boundsWidth - rect.w),
    clamp(rect.y + dy, 0, boundsHeight - rect.h),
    rect.w,
    rect.h
  )
}

export function resizeCropRect(rect, handle, dx, dy, boundsWidth, boundsHeight, ratio = null) {
  const west = handle.includes("w")
  const east = handle.includes("e")
  const north = handle.includes("n")
  const south = handle.includes("s")
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.w
  const bottom = rect.y + rect.h

  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
    const nextLeft = west ? clamp(left + dx, 0, right - 1) : left
    const nextRight = east ? clamp(right + dx, nextLeft + 1, boundsWidth) : right
    const nextTop = north ? clamp(top + dy, 0, bottom - 1) : top
    const nextBottom = south ? clamp(bottom + dy, nextTop + 1, boundsHeight) : bottom
    return integerRect(nextLeft, nextTop, nextRight - nextLeft, nextBottom - nextTop)
  }

  if ((west || east) && (north || south)) {
    const requestedWidth = west ? rect.w - dx : rect.w + dx
    const requestedHeight = north ? rect.h - dy : rect.h + dy
    const widthDriven = Math.abs(requestedWidth - rect.w) >= Math.abs(requestedHeight - rect.h) * ratio
    const desiredWidth = widthDriven ? requestedWidth : requestedHeight * ratio
    const maxWidth = Math.min(
      west ? right : boundsWidth - left,
      (north ? bottom : boundsHeight - top) * ratio
    )
    const width = clamp(desiredWidth, 1, maxWidth)
    const height = width / ratio
    return integerRect(west ? right - width : left, north ? bottom - height : top, width, height)
  }

  if (west || east) {
    const centerY = top + rect.h / 2
    const requestedWidth = west ? rect.w - dx : rect.w + dx
    const maxHeight = Math.min(centerY, boundsHeight - centerY) * 2
    const width = clamp(requestedWidth, 1, Math.min(west ? right : boundsWidth - left, maxHeight * ratio))
    const height = width / ratio
    return integerRect(west ? right - width : left, centerY - height / 2, width, height)
  }

  if (north || south) {
    const centerX = left + rect.w / 2
    const requestedHeight = north ? rect.h - dy : rect.h + dy
    const maxWidth = Math.min(centerX, boundsWidth - centerX) * 2
    const height = clamp(requestedHeight, 1, Math.min(north ? bottom : boundsHeight - top, maxWidth / ratio))
    const width = height * ratio
    return integerRect(centerX - width / 2, north ? bottom - height : top, width, height)
  }

  return integerRect(left, top, rect.w, rect.h)
}

function mapRect(rect, mapPoint) {
  const points = [
    mapPoint(rect.x, rect.y),
    mapPoint(rect.x + rect.w, rect.y),
    mapPoint(rect.x, rect.y + rect.h),
    mapPoint(rect.x + rect.w, rect.y + rect.h),
  ]
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return integerRect(left, top, Math.max(...xs) - left, Math.max(...ys) - top)
}

function normalizedRotation(rotate) {
  return ((rotate % 360) + 360) % 360
}

export function cropSourceToWorkspace(rect, width, height, rotate, flipH, flipV) {
  const angle = normalizedRotation(rotate)
  return mapRect(rect, (x, y) => {
    const flippedX = flipH ? width - x : x
    const flippedY = flipV ? height - y : y
    if (angle === 90) return [height - flippedY, flippedX]
    if (angle === 180) return [width - flippedX, height - flippedY]
    if (angle === 270) return [flippedY, width - flippedX]
    return [flippedX, flippedY]
  })
}

export function cropWorkspaceToSource(rect, width, height, rotate, flipH, flipV) {
  const angle = normalizedRotation(rotate)
  return mapRect(rect, (x, y) => {
    let sourceX = x
    let sourceY = y
    if (angle === 90) [sourceX, sourceY] = [y, height - x]
    else if (angle === 180) [sourceX, sourceY] = [width - x, height - y]
    else if (angle === 270) [sourceX, sourceY] = [width - y, x]
    if (flipH) sourceX = width - sourceX
    if (flipV) sourceY = height - sourceY
    return [sourceX, sourceY]
  })
}
