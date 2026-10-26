import test from "node:test"
import assert from "node:assert/strict"
import { createEditorHistory, createStrokeHistory } from "../src/lib/editor-history.mjs"
import { canvasExportDimensions, eraseLayerAlpha, getEdgePanDelta, imageFitScale, imageToLayerLocalPoint, layerLocalToImagePoint, nextEditorZoom, pointerToImagePoint, shouldClosePolygon } from "../src/lib/editor-geometry.mjs"

test("pointer coordinates map correctly through zoomed and panned canvas bounds", () => {
  assert.deepEqual(pointerToImagePoint(250, 150, { left: 100, top: 50, width: 300, height: 200 }, 600, 400), { x: 300, y: 200 })
})

test("cursor palette color and hotspot stay on the pencil tip", async () => {
  const cursor = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof cursor.editorCursorColor, "function")
  assert.equal(typeof cursor.editorCursorCss, "function")
  if (typeof cursor.editorCursorColor !== "function" || typeof cursor.editorCursorCss !== "function") return

  for (const [name, hex] of [["white", "#ffffff"], ["red", "#ef4444"], ["blue", "#3b82f6"], ["black", "#111827"], ["yellow", "#facc15"]]) {
    const css = cursor.editorCursorCss(name)
    const dataUrl = css.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1]
    assert.ok(dataUrl, `${name} cursor has an SVG data URL`)
    assert.match(css, /\) 3 22, crosshair$/)
    assert.match(decodeURIComponent(dataUrl), new RegExp(`fill="${hex}"`))
    assert.equal(cursor.editorCursorColor(name), hex)
  }
})

test("selection line uses the selected cursor color with a contrasting outline", async () => {
  const cursor = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof cursor.editorSelectionStroke, "function")
  if (typeof cursor.editorSelectionStroke !== "function") return
  assert.deepEqual(cursor.editorSelectionStroke("red"), { stroke: "#ef4444", outline: "#ffffff" })
  assert.deepEqual(cursor.editorSelectionStroke("white"), { stroke: "#ffffff", outline: "#111827" })
  assert.deepEqual(cursor.editorSelectionStroke("yellow"), { stroke: "#facc15", outline: "#111827" })
})

test("completed polygon preview closes without following the pointer", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.polygonPreviewPoints, "function")
  if (typeof geometry.polygonPreviewPoints !== "function") return
  const points = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }]
  assert.deepEqual(geometry.polygonPreviewPoints(points, { x: 60, y: 60 }, true), [...points, { x: 60, y: 60 }])
  assert.deepEqual(geometry.polygonPreviewPoints(points, null, false), [...points, points[0]])
})

test("layer hit testing follows transformed bounds and detects resize handles", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.isPointInLayer, "function")
  assert.equal(typeof geometry.layerHandleAt, "function")
  if (typeof geometry.isPointInLayer !== "function" || typeof geometry.layerHandleAt !== "function") return
  const layer = { x: 20, y: 30, width: 80, height: 40, scale: 1.5, angle: 35, flipX: true, flipY: false }
  const inside = layerLocalToImagePoint({ x: 20, y: 10 }, layer)
  const outside = layerLocalToImagePoint({ x: -10, y: 10 }, layer)
  assert.equal(geometry.isPointInLayer(inside, layer), true)
  assert.equal(geometry.isPointInLayer(outside, layer), false)
  const corners = [{ x: 12, y: 18 }, { x: 112, y: 18 }, { x: 112, y: 78 }, { x: 12, y: 78 }]
  assert.equal(geometry.layerHandleAt({ x: 15, y: 21 }, corners, 5), 0)
  assert.equal(geometry.layerHandleAt({ x: 50, y: 45 }, corners, 5), -1)
})

test("Alt-wheel zoom preserves the source point beneath the pointer", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.zoomScrollOffset, "function")
  if (typeof geometry.zoomScrollOffset !== "function") return
  const rect = { left: 100, top: 50, width: 500, height: 300 }
  const before = { left: 300, top: 200 }
  const after = geometry.zoomScrollOffset(2, 4, rect, before.left, before.top, 200, 100)
  assert.equal((before.left + 100) / 2, (after.left + 100) / 4)
  assert.equal((before.top + 50) / 2, (after.top + 50) / 4)
  assert.deepEqual(after, { left: 700, top: 450 })
})

test("Space pan ignores text entry and controls but accepts the canvas", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.shouldActivateSpacePan, "function")
  if (typeof geometry.shouldActivateSpacePan !== "function") return
  assert.equal(geometry.shouldActivateSpacePan("Space", { tagName: "CANVAS" }), true)
  assert.equal(geometry.shouldActivateSpacePan("Space", { tagName: "INPUT" }), false)
  assert.equal(geometry.shouldActivateSpacePan("Space", { tagName: "TEXTAREA" }), false)
  assert.equal(geometry.shouldActivateSpacePan("Space", { tagName: "BUTTON" }), false)
  assert.equal(geometry.shouldActivateSpacePan("Enter", { tagName: "CANVAS" }), false)
})

test("dragging a temporary layer changes only its position and keeps source pixels separate", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.moveLayerBy, "function")
  if (typeof geometry.moveLayerBy !== "function") return
  const source = { pixels: [1, 2, 3] }
  const layerCanvas = { pixels: [9, 9, 9] }
  const layer = { canvas: layerCanvas, source, x: 40, y: 25, scale: 1, angle: 0, opacity: 100 }
  const moved = geometry.moveLayerBy(layer, 12, -7)
  assert.equal(moved.canvas, layerCanvas)
  assert.equal(moved.source, source)
  assert.deepEqual([moved.x, moved.y], [52, 18])
  assert.deepEqual(source.pixels, [1, 2, 3])
})

test("pointer maps to the same source pixel at 100, 200, 400, and 800 percent", () => {
  for (const zoom of [1, 2, 4, 8]) {
    const rect = { left: 120, top: 70, width: 300 * zoom, height: 200 * zoom }
    assert.deepEqual(pointerToImagePoint(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, 600, 400), { x: 300, y: 200 })
  }
})

test("editor zoom changes smoothly and stays within pixel-level limits", () => {
  assert.equal(nextEditorZoom(1, 1), 1.25)
  assert.equal(nextEditorZoom(16, 1), 16)
  assert.equal(nextEditorZoom(0.25, -1), 0.25)
})

test("polygon closes by a nearby first point or double click", () => {
  assert.equal(shouldClosePolygon(108, 103, 100, 100), true)
  assert.equal(shouldClosePolygon(130, 100, 100, 100), false)
  assert.equal(shouldClosePolygon(130, 100, 100, 100, true), true)
})

test("edge auto-pan returns a smooth signed delta and stays idle away from edges", () => {
  assert.equal(getEdgePanDelta(50, 100, 500), -18)
  assert.equal(getEdgePanDelta(550, 100, 500), 18)
  assert.equal(getEdgePanDelta(300, 100, 500), 0)
  assert.ok(getEdgePanDelta(105, 100, 500) < 0)
  assert.ok(getEdgePanDelta(105, 100, 500) > -18)
})

test("image fit scale keeps the whole image within the available viewport", () => {
  assert.equal(imageFitScale(2400, 1600, 900, 600), 0.375)
  assert.equal(imageFitScale(100, 80, 900, 600), 1)
})

test("shared viewport layout uses source pixels at 100 percent and centers small images", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.editorViewportLayout, "function")
  if (typeof geometry.editorViewportLayout !== "function") return
  assert.deepEqual(geometry.editorViewportLayout(640, 480, 900, 600, 1), { left: 130, top: 60, width: 640, height: 480 })
  assert.deepEqual(geometry.editorViewportLayout(640, 480, 900, 600, 2), { left: 0, top: 0, width: 1280, height: 960 })
})

test("shared viewport zoom remains uniform and preserves the source pixel under the pointer", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.editorViewportLayout, "function")
  assert.equal(typeof geometry.editorViewportZoomOffset, "function")
  if (typeof geometry.editorViewportLayout !== "function" || typeof geometry.editorViewportZoomOffset !== "function") return
  const viewport = { left: 100, top: 50, width: 900, height: 600 }
  const beforeLayout = geometry.editorViewportLayout(1200, 800, viewport.width, viewport.height, 1, -100, -70)
  const offset = geometry.editorViewportZoomOffset(beforeLayout, 1, 2, viewport, 400, 250)
  const afterLayout = geometry.editorViewportLayout(1200, 800, viewport.width, viewport.height, 2, offset.x, offset.y)
  const beforePixel = { x: (400 - viewport.left - beforeLayout.left) / beforeLayout.width * 1200, y: (250 - viewport.top - beforeLayout.top) / beforeLayout.height * 800 }
  const afterPixel = { x: (400 - viewport.left - afterLayout.left) / afterLayout.width * 1200, y: (250 - viewport.top - afterLayout.top) / afterLayout.height * 800 }
  assert.ok(Math.abs(beforePixel.x - afterPixel.x) < 1e-8)
  assert.ok(Math.abs(beforePixel.y - afterPixel.y) < 1e-8)
  assert.equal(afterLayout.width / 1200, afterLayout.height / 800)
})

test("layer transforms and their inverse preserve points after scale, rotation and reflection", () => {
  const layer = { x: 20, y: 30, width: 80, height: 40, scale: 1.5, angle: 35, flipX: true, flipY: false }
  const original = { x: 14, y: 9 }
  const imagePoint = layerLocalToImagePoint(original, layer)
  const restored = imageToLayerLocalPoint(imagePoint, layer)
  assert.ok(Math.abs(restored.x - original.x) < 1e-8)
  assert.ok(Math.abs(restored.y - original.y) < 1e-8)
})

test("soft eraser changes only layer alpha and leaves the source buffer untouched", () => {
  const rgba = new Uint8ClampedArray(5 * 5 * 4).fill(255)
  const erased = eraseLayerAlpha(rgba, 5, 5, 2, 2, 2, 75, 50)
  const center = (2 * 5 + 2) * 4
  assert.ok(erased[center + 3] < 255)
  assert.equal(erased[center], 255)
  assert.equal(rgba[center + 3], 255)
  assert.equal(erased[3], 255)
})

test("hard eraser fully clears covered alpha at full strength and preserves RGB", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  const pixels = new Uint8ClampedArray([20, 40, 60, 255, 90, 80, 70, 200, 3, 4, 5, 255])
  assert.equal(typeof geometry.eraseLayerAlpha, "function")
  const erased = geometry.eraseLayerAlpha(pixels, 3, 1, 1, 0, 0.6, 0, 100, "hard")
  assert.deepEqual([...erased], [20, 40, 60, 255, 90, 80, 70, 0, 3, 4, 5, 255])
  assert.deepEqual([...pixels], [20, 40, 60, 255, 90, 80, 70, 200, 3, 4, 5, 255])
})

test("eraser cursor diameter follows document zoom", async () => {
  const geometry = await import("../src/lib/editor-geometry.mjs")
  assert.equal(typeof geometry.editorBrushDiameterOnScreen, "function")
  if (typeof geometry.editorBrushDiameterOnScreen !== "function") return
  assert.equal(geometry.editorBrushDiameterOnScreen(32, 1), 32)
  assert.equal(geometry.editorBrushDiameterOnScreen(32, 2), 64)
  assert.equal(geometry.editorBrushDiameterOnScreen(32, 0.5), 16)
})

test("a completed eraser stroke creates exactly one undo entry", () => {
  const history = createStrokeHistory(4)
  history.begin("before")
  history.update("stroke-1")
  history.update("stroke-2")
  history.finish("after")
  assert.equal(history.undo("after"), "before")
  assert.equal(history.canUndo, false)
  assert.equal(history.redo("before"), "after")
})

test("export dimensions use the current canvas resolution", () => {
  assert.deepEqual(canvasExportDimensions({ width: 1122, height: 1402 }), { width: 1122, height: 1402 })
})

test("one editor history undoes and redoes edits made by different tools", () => {
  const history = createEditorHistory(4)
  let image = "original"
  history.push(image); image = "patched"
  history.push(image); image = "layer-applied"
  image = history.undo(image)
  assert.equal(image, "patched")
  image = history.undo(image)
  assert.equal(image, "original")
  image = history.redo(image)
  assert.equal(image, "patched")
  assert.equal(history.canUndo, true)
})
