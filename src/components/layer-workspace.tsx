import * as React from "react"
import { Columns2, Copy, Download, Eraser, Hand, Hexagon, Minus, Plus, Redo2, Scan, Square, Undo2, Waves } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useApp } from "@/lib/app-context"
import { useEditorSession } from "@/components/editor-session"
import type { WorkImage } from "@/components/work-image"
import { compressCanvas, extForFormat, type OutputFormat } from "@/lib/image-core"
import { downloadBlob, withSuffix } from "@/lib/image-job"
import { editorBrushDiameterOnScreen, editorSelectionStroke, getEdgePanDelta, imageFitScale, imageToLayerLocalPoint, isPointInLayer, layerHandleAt, layerLocalToImagePoint, moveLayerBy, nextEditorZoom, pointerToImagePoint, polygonPreviewPoints, shouldClosePolygon } from "@/lib/editor-geometry.mjs"
import { EditorCursorPicker, useEditorCursor, useSpacePan } from "@/components/editor-cursor"
import { EditorViewport } from "@/components/editor-viewport"
import { IconTooltipButton } from "@/components/icon-tooltip-button"
import { SettingHint } from "@/components/setting-hint"
import { createStrokeHistory } from "@/lib/editor-history.mjs"
import { drawEditorCanvasBase } from "@/lib/editor-canvas.mjs"

type Point = { x: number; y: number }
type Selection = { kind: "lasso" | "polygon" | "rectangle"; points: Point[] } | null
type Layer = { canvas: HTMLCanvasElement; x: number; y: number; scale: number; angle: number; flipX: boolean; flipY: boolean; opacity: number }
const layerGeometry = (layer: Layer) => ({ ...layer, width: layer.canvas.width, height: layer.canvas.height })
type Drag = { mode: "move" | "scale"; point: Point; x: number; y: number; scale: number; distance: number; handle: number }
const MAX_LAYER_IMAGE_PIXELS = 8_000_000

function copyCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas")
  copy.width = source.width; copy.height = source.height
  copy.getContext("2d")!.drawImage(source, 0, 0)
  return copy
}

function closePath(context: CanvasRenderingContext2D, points: Point[]) {
  context.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y)
  context.closePath()
}

export function LayerWorkspace({ image }: { image: WorkImage }) {
  const { t, settings } = useApp()
  const session = useEditorSession()
  const { canvas, original, commit, undo, redo, canUndo, canRedo, registerPending, resetVersion, viewportZoom: zoom, viewportFit, setViewportZoom, fitViewport } = session
  const [tool, setTool] = React.useState<"lasso" | "polygon" | "rectangle" | "eraser" | null>("lasso")
  const [selection, setSelection] = React.useState<Selection>(null)
  const [drawing, setDrawing] = React.useState<Selection>(null)
  const [polygonHover, setPolygonHover] = React.useState<Point | null>(null)
  const [layer, setLayer] = React.useState<Layer | null>(null)
  const [hand, setHand] = React.useState(false)
  const spaceHand = useSpacePan()
  const { color: cursorColor, cursorStyle } = useEditorCursor()
  const [showOriginal, setShowOriginal] = React.useState(false)
  const [brushSize, setBrushSize] = React.useState(32)
  const [softness, setSoftness] = React.useState(75)
  const [eraserOpacity, setEraserOpacity] = React.useState(20)
  const [eraserMode, setEraserMode] = React.useState<"soft" | "hard">("soft")
  const [eraserPointer, setEraserPointer] = React.useState<Point | null>(null)
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const viewRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const layerDisplayRef = React.useRef<HTMLCanvasElement>(null)
  const maskRef = React.useRef<HTMLCanvasElement>(null)
  const drawRef = React.useRef<{ start: Point; points: Point[]; last: Point } | null>(null)
  const dragRef = React.useRef<Drag | null>(null)
  const handRef = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const edgePointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const edgeFrameRef = React.useRef<number | null>(null)
  const layerHistoryRef = React.useRef(createStrokeHistory<HTMLCanvasElement>())

  React.useEffect(() => {
    registerPending("layers", !!(selection || drawing || layer))
    return () => registerPending("layers", false)
  }, [selection, drawing, layer, registerPending])

  React.useEffect(() => {
    if (!resetVersion) return
    stopEdgePan()
    setSelection(null); setDrawing(null); setPolygonHover(null); setLayer(null); setShowOriginal(false); setTool("lasso")
    layerHistoryRef.current.clear()
  }, [resetVersion])

  React.useEffect(() => {
    const display = canvasRef.current
    if (!display) return
    if (display.width !== canvas.width || display.height !== canvas.height) {
      display.width = canvas.width; display.height = canvas.height
    }
    const context = display.getContext("2d")!
    drawEditorCanvasBase(context, showOriginal ? original : canvas)
  }, [canvas, original, showOriginal])

  React.useEffect(() => {
    const display = layerDisplayRef.current
    if (!display || !layer || showOriginal) return
    if (display.width !== layer.canvas.width || display.height !== layer.canvas.height) {
      display.width = layer.canvas.width; display.height = layer.canvas.height
    }
    const context = display.getContext("2d")!
    context.clearRect(0, 0, display.width, display.height)
    context.drawImage(layer.canvas, 0, 0)
  }, [layer, showOriginal])
  React.useEffect(() => () => stopEdgePan(), [])

  const getPointAt = (clientX: number, clientY: number, display: HTMLCanvasElement) =>
    pointerToImagePoint(clientX, clientY, display.getBoundingClientRect(), canvas.width, canvas.height)
  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => getPointAt(event.clientX, event.clientY, event.currentTarget)

  const getLayerCorners = (value: Layer) => [
    { x: 0, y: 0 }, { x: value.canvas.width, y: 0 },
    { x: value.canvas.width, y: value.canvas.height }, { x: 0, y: value.canvas.height },
  ].map((point) => layerLocalToImagePoint(point, layerGeometry(value)))

  const startLayer = () => {
    const maskCanvas = maskRef.current!
    const pixels = maskCanvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1, count = 0
    for (let i = 0; i < canvas.width * canvas.height; i++) {
      if (!pixels[i * 4 + 3]) continue
      const x = i % canvas.width, y = Math.floor(i / canvas.width)
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); count++
    }
    if (!count) { setError(t.edit.layerNoSelection); return }
    const width = right - left + 1, height = bottom - top + 1
    const fragment = document.createElement("canvas")
    fragment.width = width; fragment.height = height
    const fragmentContext = fragment.getContext("2d")!
    fragmentContext.drawImage(canvas, left, top, width, height, 0, 0, width, height)
    fragmentContext.globalCompositeOperation = "destination-in"
    fragmentContext.drawImage(maskCanvas, -left, -top)
    layerHistoryRef.current.clear()
    setLayer({ canvas: fragment, x: left, y: top, scale: 1, angle: 0, flipX: false, flipY: false, opacity: 100 })
    setTool(null); setError("")
  }

  const finishPolygon = (points: Point[]) => {
    if (points.length < 3) return
    stopEdgePan(); drawRef.current = null
    const mask = maskRef.current!, context = mask.getContext("2d")!
    context.clearRect(0, 0, mask.width, mask.height)
    context.fillStyle = "white"; context.beginPath(); closePath(context, points); context.fill()
    setSelection({ kind: "polygon", points }); setDrawing(null); setPolygonHover(null); setTool(null); setError("")
  }

  const activateTool = (next: typeof tool) => {
    stopEdgePan()
    if (drawRef.current) {
      maskRef.current?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
      drawRef.current = null
      setDrawing(null)
      setPolygonHover(null)
    }
    setTool(next)
    setHand(false)
  }

  const stopEdgePan = () => {
    edgePointerRef.current = null
    if (edgeFrameRef.current !== null) window.cancelAnimationFrame(edgeFrameRef.current)
    edgeFrameRef.current = null
  }
  const scheduleEdgePan = (clientX: number, clientY: number) => {
    edgePointerRef.current = { x: clientX, y: clientY }
    if (edgeFrameRef.current !== null) return
    const step = () => {
      edgeFrameRef.current = null
      const pointer = edgePointerRef.current, view = viewRef.current, display = canvasRef.current, stroke = drawRef.current
      if (!pointer || !view || !display || !stroke || (tool !== "polygon" && tool !== "lasso" && tool !== "rectangle")) return
      const rect = view.getBoundingClientRect()
      const dx = getEdgePanDelta(pointer.x, rect.left, rect.right)
      const dy = getEdgePanDelta(pointer.y, rect.top, rect.bottom)
      if (!dx && !dy) return
      view.scrollLeft += dx; view.scrollTop += dy
      const point = getPointAt(pointer.x, pointer.y, display)
      if (tool === "polygon") setPolygonHover(point)
      else if (tool === "rectangle") setDrawing({ kind: "rectangle", points: [stroke.start, point] })
      else {
        stroke.points.push(point); stroke.last = point
        setDrawing({ kind: "lasso", points: [...stroke.points] })
      }
      edgeFrameRef.current = window.requestAnimationFrame(step)
    }
    edgeFrameRef.current = window.requestAnimationFrame(step)
  }

  const erase = (point: Point, previous = point) => {
    if (!layer) return
    const geometry = layerGeometry(layer)
    const local = imageToLayerLocalPoint(point, geometry)
    const localPrevious = imageToLayerLocalPoint(previous, geometry)
    const context = layer.canvas.getContext("2d")!
    const radius = brushSize / (2 * layer.scale)
    const stepCount = Math.max(1, Math.ceil(Math.hypot(local.x - localPrevious.x, local.y - localPrevious.y) / Math.max(1, radius * 0.35)))
    context.save(); context.globalCompositeOperation = "destination-out"; context.globalAlpha = eraserOpacity / 100
    for (let step = 0; step <= stepCount; step++) {
      const x = localPrevious.x + (local.x - localPrevious.x) * step / stepCount
      const y = localPrevious.y + (local.y - localPrevious.y) * step / stepCount
      if (eraserMode === "hard") context.fillStyle = "black"
      else {
        const gradient = context.createRadialGradient(x, y, radius * (1 - softness / 100), x, y, radius)
        gradient.addColorStop(0, "rgba(0,0,0,1)"); gradient.addColorStop(1, "rgba(0,0,0,0)")
        context.fillStyle = gradient
      }
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill()
    }
    context.restore()
    setLayer({ ...layer, canvas: layer.canvas })
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return
    if (hand || spaceHand) {
      const view = viewRef.current!
      handRef.current = { x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop }
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return
    }
    const point = getPoint(event)
    if (layer && !tool) {
      const corners = getLayerCorners(layer)
      const threshold = Math.max(8, canvas.width / Math.max(1, event.currentTarget.clientWidth) * 14)
      const handle = layerHandleAt(point, corners, threshold)
      if (handle < 0 && !isPointInLayer(point, layerGeometry(layer))) return
      const center = { x: layer.x + layer.canvas.width / 2, y: layer.y + layer.canvas.height / 2 }
      const distance = Math.hypot(point.x - center.x, point.y - center.y)
      dragRef.current = { mode: handle >= 0 ? "scale" : "move", point, x: layer.x, y: layer.y, scale: layer.scale, distance: Math.max(1, distance), handle }
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return
    }
    if (tool === "eraser" && layer) {
      layerHistoryRef.current.begin(copyCanvas(layer.canvas))
      setEraserPointer(point)
      erase(point); drawRef.current = { start: point, points: [], last: point }
    } else if (tool === "polygon") {
      const active = drawRef.current
      if (!active) {
        maskRef.current!.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
        setSelection(null); setError("")
        drawRef.current = { start: point, points: [point], last: point }
        setDrawing({ kind: "polygon", points: [point] }); setPolygonHover(point)
      } else {
        const first = active.points[0], rect = event.currentTarget.getBoundingClientRect()
        const firstX = rect.left + first.x / canvas.width * rect.width
        const firstY = rect.top + first.y / canvas.height * rect.height
        if (shouldClosePolygon(event.clientX, event.clientY, firstX, firstY, event.detail > 1)) finishPolygon(active.points)
        else {
          active.points.push(point); active.last = point
          setDrawing({ kind: "polygon", points: [...active.points] }); setPolygonHover(point)
        }
      }
      event.preventDefault(); return
    } else if (tool === "lasso" || tool === "rectangle") {
      maskRef.current!.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
      setSelection(null)
      drawRef.current = { start: point, points: [point], last: point }
    }
    if (tool) { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (handRef.current && viewRef.current) {
      const drag = handRef.current
      viewRef.current.scrollLeft = drag.left - (event.clientX - drag.x)
      viewRef.current.scrollTop = drag.top - (event.clientY - drag.y)
      return
    }
    const point = getPoint(event)
    if (tool === "eraser") setEraserPointer(point)
    const drag = dragRef.current
    if (drag && layer) {
      if (drag.mode === "move") setLayer(moveLayerBy({ ...layer, x: drag.x, y: drag.y }, point.x - drag.point.x, point.y - drag.point.y))
      else {
        const center = { x: drag.x + layer.canvas.width / 2, y: drag.y + layer.canvas.height / 2 }
        const scale = Math.max(0.1, Math.min(8, drag.scale * Math.hypot(point.x - center.x, point.y - center.y) / drag.distance))
        setLayer({ ...layer, scale })
      }
      return
    }
    const stroke = drawRef.current
    if (tool === "polygon" && stroke) {
      scheduleEdgePan(event.clientX, event.clientY)
      setPolygonHover(getPoint(event)); return
    }
    if (!stroke) return
    if (tool === "eraser" && layer) erase(point, stroke.last)
    else if (tool === "lasso" || tool === "rectangle") {
      scheduleEdgePan(event.clientX, event.clientY)
      const currentPoint = getPoint(event)
      if (tool === "lasso") { stroke.points.push(currentPoint); stroke.last = currentPoint; setDrawing({ kind: tool, points: [...stroke.points] }) }
      else { stroke.last = currentPoint; setDrawing({ kind: tool, points: [stroke.start, currentPoint] }) }
    }
    if (tool === "eraser") stroke.last = point
    event.preventDefault()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (handRef.current) { handRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return }
    if (dragRef.current) { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return }
    if (tool === "polygon") return
    stopEdgePan()
    if (tool === "eraser") layerHistoryRef.current.finish()
    const stroke = drawRef.current
    if (stroke && (tool === "lasso" || tool === "rectangle")) {
      const points = [...stroke.points, getPoint(event)]
      const mask = maskRef.current!, context = mask.getContext("2d")!
      context.fillStyle = "white"; context.beginPath()
      if (tool === "rectangle") context.rect(stroke.start.x, stroke.start.y, points.at(-1)!.x - stroke.start.x, points.at(-1)!.y - stroke.start.y)
      else if (points.length > 2) closePath(context, points)
      if (points.length > 2 || tool === "rectangle") context.fill()
      const selected: Selection = points.length > 2 || tool === "rectangle" ? { kind: tool, points } : null
      setSelection(selected); setDrawing(null); setTool(null)
    }
    drawRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  React.useEffect(() => {
    if (tool !== "polygon" || drawing?.kind !== "polygon") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return
      if (event.key === "Escape") {
        stopEdgePan()
        maskRef.current?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
        drawRef.current = null; setDrawing(null); setPolygonHover(null); setTool(null); event.preventDefault()
      } else if (event.key === "Backspace" || event.key === "Delete") {
        const points = (drawRef.current?.points ?? []).slice(0, -1)
        drawRef.current = points.length ? { start: points[0], points, last: points.at(-1)! } : null
        setDrawing(points.length ? { kind: "polygon", points } : null); setPolygonHover(points.at(-1) ?? null); event.preventDefault()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [tool, drawing, canvas.width, canvas.height])

  const applyLayer = () => {
    if (!layer) return
    const next = copyCanvas(canvas), context = next.getContext("2d")!
    context.save(); context.translate(layer.x + layer.canvas.width / 2, layer.y + layer.canvas.height / 2)
    context.rotate(layer.angle * Math.PI / 180); context.scale(layer.scale * (layer.flipX ? -1 : 1), layer.scale * (layer.flipY ? -1 : 1))
    context.globalAlpha = layer.opacity / 100
    context.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2); context.restore()
    commit(next); setLayer(null); setSelection(null); setTool("lasso"); layerHistoryRef.current.clear()
    maskRef.current?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
  }

  const undoAction = () => {
    if (layer && layerHistoryRef.current.canUndo) {
      const previous = layerHistoryRef.current.undo(copyCanvas(layer.canvas))!
      setLayer({ ...layer, canvas: previous }); return
    }
    undo()
  }
  const redoAction = () => {
    if (layer && layerHistoryRef.current.canRedo) {
      setLayer({ ...layer, canvas: layerHistoryRef.current.redo(copyCanvas(layer.canvas))! }); return
    }
    redo()
  }
  const download = async () => {
    setBusy(true)
    try {
      const blob = await compressCanvas(canvas, format, settings.lastQuality / 100)
      downloadBlob(blob, withSuffix(image.name, "_edited", extForFormat(format)))
    } catch { setError(t.edit.retouchError) }
    finally { setBusy(false) }
  }

  if (canvas.width * canvas.height > MAX_LAYER_IMAGE_PIXELS) return <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">{t.edit.retouchTooLarge}</p>
  const corners = layer ? getLayerCorners(layer) : []
  const selectionStroke = editorSelectionStroke(cursorColor)
  const visibleSelection = drawing ?? selection
  const selectionPoints = visibleSelection ? visibleSelection.kind === "rectangle"
    ? (() => { const a = visibleSelection.points[0], b = visibleSelection.points.at(-1)!; return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a] })()
    : visibleSelection.kind === "polygon" && drawing
      ? polygonPreviewPoints(visibleSelection.points, polygonHover, true)
      : [...visibleSelection.points, visibleSelection.points[0]] : []
  return <section className="grid min-h-[calc(100vh-12rem)] min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_248px]" aria-label={t.edit.editorTabLayers}>
    <EditorViewport viewportRef={viewRef} imageWidth={canvas.width} imageHeight={canvas.height} zoom={zoom} onZoom={setViewportZoom} fit={viewportFit} onFit={fitViewport} handMode={hand || spaceHand}>
        <canvas ref={canvasRef} width={canvas.width} height={canvas.height} tabIndex={0} className="block touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ width: canvas.width * zoom, height: canvas.height * zoom, imageRendering: zoom >= 4 ? "pixelated" : "auto", cursor: hand || spaceHand ? "grab" : tool === "eraser" ? "none" : tool || layer ? cursorStyle : "default" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label={t.edit.editorTabLayers} />
        {visibleSelection && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvas.width} ${canvas.height}`} preserveAspectRatio="none"><polyline points={selectionPoints.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={selectionStroke.outline} strokeWidth={Math.max(2, canvas.width / Math.max(1, canvasRef.current?.clientWidth ?? 1) * 3)} strokeDasharray="7 5" /><polyline points={selectionPoints.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={selectionStroke.stroke} strokeWidth={Math.max(1, canvas.width / Math.max(1, canvasRef.current?.clientWidth ?? 1))} strokeDasharray="7 5" /></svg>}
        {layer && !showOriginal && <canvas ref={layerDisplayRef} width={layer.canvas.width} height={layer.canvas.height} className="pointer-events-none absolute" style={{ left: `${(layer.x + layer.canvas.width / 2) / canvas.width * 100}%`, top: `${(layer.y + layer.canvas.height / 2) / canvas.height * 100}%`, width: `${layer.canvas.width / canvas.width * 100}%`, transform: `translate(-50%, -50%) rotate(${layer.angle}deg) scale(${layer.scale * (layer.flipX ? -1 : 1)}, ${layer.scale * (layer.flipY ? -1 : 1)})`, opacity: layer.opacity / 100 }} />}
        {layer && !showOriginal && <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${canvas.width} ${canvas.height}`} preserveAspectRatio="none">
          <polygon points={corners.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth={Math.max(1, canvas.width / canvasRef.current!.clientWidth * 2)} />
          {corners.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={Math.max(4, canvas.width / canvasRef.current!.clientWidth * 5)} fill="white" stroke="#2563eb" strokeWidth={Math.max(1, canvas.width / canvasRef.current!.clientWidth)} />)}
        </svg>}
        {tool === "eraser" && layer && eraserPointer && <div aria-hidden="true" data-eraser-mode={eraserMode} className={`pointer-events-none absolute z-10 rounded-full border-2 border-white shadow-[0_0_0_1px_#111827] ${eraserMode === "soft" ? "border-dashed" : "border-solid"}`} style={{ left: `${eraserPointer.x / canvas.width * 100}%`, top: `${eraserPointer.y / canvas.height * 100}%`, width: editorBrushDiameterOnScreen(brushSize, zoom), height: editorBrushDiameterOnScreen(brushSize, zoom), transform: "translate(-50%, -50%)" }} />}
        <canvas ref={maskRef} width={canvas.width} height={canvas.height} className="hidden" aria-hidden="true" />
    </EditorViewport>
    <aside className="min-w-0 space-y-2 overflow-y-auto rounded-lg border p-2 lg:max-h-[calc(100vh-12rem)]">
      <p className="text-sm text-muted-foreground">{t.edit.layerHelp}</p>
      <EditorCursorPicker />
      <div className="grid grid-cols-2 gap-1.5 [&>button]:h-auto [&>button]:min-h-9 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:px-2 [&>button]:text-xs">
        <Button variant={tool === "lasso" ? "default" : "outline"} title={t.edit.lassoHelp} onClick={() => activateTool("lasso")}>{t.edit.lasso}</Button>
        <Button variant={tool === "polygon" ? "default" : "outline"} title={t.edit.polygonLassoHelp} onClick={() => activateTool("polygon")}><Hexagon className="size-4" />{t.edit.polygonLasso}</Button>
        <Button variant={tool === "rectangle" ? "default" : "outline"} onClick={() => activateTool("rectangle")}>{t.edit.rectangle}</Button>
        <Button variant={hand ? "default" : "outline"} title={t.edit.handTool} onClick={() => { activateTool(null); setHand((value) => !value) }}><Hand className="size-4" />{t.edit.handTool}</Button>
        <Button variant="outline" onClick={startLayer} disabled={!selection || !!layer}><Copy className="size-4" />{t.edit.layerCopy}</Button>
      </div>
      {layer && <div className="space-y-2 rounded-md bg-muted/40 p-2">
        <p role="status" className="text-xs text-muted-foreground">{t.edit.layerMoveHint}</p>
        <div className="flex gap-1.5">
          <IconTooltipButton label={t.edit.layerEraser} description={t.edit.layerEraserSoftHelp} className="size-9 shrink-0" variant={tool === "eraser" && eraserMode === "soft" ? "default" : "outline"} aria-pressed={tool === "eraser" && eraserMode === "soft"} onClick={() => { setEraserMode("soft"); activateTool(tool === "eraser" && eraserMode === "soft" ? null : "eraser") }}><span className="relative"><Eraser className="size-4" /><Waves className="absolute -right-1 -bottom-1 size-2.5 rounded-sm bg-background" /></span></IconTooltipButton>
          <IconTooltipButton label={t.edit.layerHardEraser} description={t.edit.layerEraserHardHelp} className="size-9 shrink-0" variant={tool === "eraser" && eraserMode === "hard" ? "default" : "outline"} aria-pressed={tool === "eraser" && eraserMode === "hard"} onClick={() => { setEraserMode("hard"); activateTool(tool === "eraser" && eraserMode === "hard" ? null : "eraser") }}><span className="relative"><Eraser className="size-4" /><Square className="absolute -right-1 -bottom-1 size-2 rounded-sm bg-background" /></span></IconTooltipButton>
        </div>
        {([ [t.edit.layerBrushSize, t.edit.layerBrushSizeHelp, brushSize, setBrushSize, 4, 240], [t.edit.layerSoftness, t.edit.layerSoftnessHelp, softness, setSoftness, 0, 100], [t.edit.layerOpacity, t.edit.layerOpacityHelp, layer.opacity, (value: number) => setLayer({ ...layer, opacity: value }), 0, 100], [t.edit.layerEraserOpacity, t.edit.layerEraserOpacityHelp, eraserOpacity, setEraserOpacity, 0, 100] ] as const).filter(([label]) => label !== t.edit.layerSoftness || eraserMode === "soft").map(([label, help, value, setter, min, max]) => <div key={label} className="space-y-1">
          <Label className="flex items-center gap-1 text-xs">{label}: {value}{label === t.edit.layerBrushSize ? " px" : "%"}<SettingHint label={label}>{help}</SettingHint></Label>
          <input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => setter(Number(event.target.value))} className="w-full accent-primary" />
        </div>)}
        <div className="space-y-1"><Label className="flex items-center gap-1 text-xs">{t.edit.layerScale}: {Math.round(layer.scale * 100)}%<SettingHint label={t.edit.layerScale}>{t.edit.layerScaleHelp}</SettingHint></Label><input aria-label={t.edit.layerScale} type="range" min="10" max="800" value={Math.round(layer.scale * 100)} onChange={(event) => setLayer({ ...layer, scale: Number(event.target.value) / 100 })} className="w-full accent-primary" /></div>
        <div className="space-y-1"><Label className="flex items-center gap-1 text-xs">{t.edit.layerRotate}: {layer.angle}°<SettingHint label={t.edit.layerRotate}>{t.edit.layerRotateHelp}</SettingHint></Label><input aria-label={t.edit.layerRotate} type="range" min="-180" max="180" value={layer.angle} onChange={(event) => setLayer({ ...layer, angle: Number(event.target.value) })} className="w-full accent-primary" /></div>
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setLayer({ ...layer, flipX: !layer.flipX })}>{t.edit.flipH}</Button><Button variant="outline" onClick={() => setLayer({ ...layer, flipY: !layer.flipY })}>{t.edit.flipV}</Button></div>
        <Button className="w-full" onClick={applyLayer}>{t.edit.layerApply}</Button><Button className="w-full" variant="outline" onClick={() => { setLayer(null); layerHistoryRef.current.clear() }}>{t.edit.layerCancel}</Button>
      </div>}
      <div className="grid grid-cols-2 gap-2">
        <IconTooltipButton label={t.edit.undo} variant="outline" onClick={undoAction} disabled={!canUndo && !layerHistoryRef.current.canUndo}><Undo2 className="size-4" /></IconTooltipButton>
        <IconTooltipButton label={t.edit.redo} variant="outline" onClick={redoAction} disabled={!canRedo && !layerHistoryRef.current.canRedo}><Redo2 className="size-4" /></IconTooltipButton>
        <IconTooltipButton label={showOriginal ? t.edit.showResult : t.edit.compare} variant={showOriginal ? "default" : "outline"} className="col-span-2 w-full" onClick={() => setShowOriginal((value) => !value)}><Columns2 className="size-4" /></IconTooltipButton>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Button size="sm" variant="outline" aria-label={t.edit.zoomOut} onClick={() => setViewportZoom(nextEditorZoom(zoom, -1))}><Minus className="size-4" /></Button>
        <IconTooltipButton label={t.edit.zoomFit} variant="outline" onClick={() => fitViewport(imageFitScale(canvas.width, canvas.height, viewRef.current?.clientWidth ?? 0, viewRef.current?.clientHeight ?? 0))}><Scan className="size-4" /></IconTooltipButton>
        <Button size="sm" variant="outline" aria-label={t.edit.zoomIn} onClick={() => setViewportZoom(nextEditorZoom(zoom, 1))}><Plus className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-3 gap-1">{[2, 4, 8].map((value) => <Button key={value} size="sm" variant={zoom === value ? "default" : "outline"} onClick={() => setViewportZoom(value)}>{value * 100}%</Button>)}</div>
      <div className="flex items-center gap-2"><Label htmlFor="layer-zoom" className="text-xs">{t.edit.zoom}: {Math.round(zoom * 100)}%</Label><input id="layer-zoom" type="range" min="25" max="1600" step="1" value={Math.round(zoom * 100)} onChange={(event) => setViewportZoom(Number(event.target.value) / 100)} className="w-full accent-primary" /></div>
      <div className="flex gap-2"><select aria-label={t.common.format} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select><Button onClick={() => void download()} disabled={busy || !!layer}><Download className="size-4" />{t.common.download}</Button></div>
      {busy && <span role="status" className="text-sm text-muted-foreground">{t.common.processing}</span>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </aside>
  </section>
}
