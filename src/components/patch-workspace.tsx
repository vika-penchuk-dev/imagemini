import * as React from "react"
import { Columns2, Download, Eraser, Hand, Hexagon, Minus, MousePointer2, Plus, Redo2, RotateCcw, Scan, Square, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useApp } from "@/lib/app-context"
import { compressCanvas, extForFormat, type OutputFormat } from "@/lib/image-core"
import { downloadBlob, withSuffix } from "@/lib/image-job"
import { MAX_PATCH_AREA } from "@/lib/patch.mjs"
import type { WorkImage } from "@/components/work-image"
import { useEditorSession } from "@/components/editor-session"
import { EditorCursorPicker, useEditorCursor, useSpacePan } from "@/components/editor-cursor"
import { EditorViewport } from "@/components/editor-viewport"
import { IconTooltipButton } from "@/components/icon-tooltip-button"
import { drawEditorCanvasBase } from "@/lib/editor-canvas.mjs"
import { editorSelectionStroke, getEdgePanDelta, imageFitScale, nextEditorZoom, polygonPreviewPoints, shouldClosePolygon } from "@/lib/editor-geometry.mjs"

type Point = { x: number; y: number }
type Mode = "lasso" | "polygon" | "rectangle" | null
type Shape = { kind: Exclude<Mode, null>; points: Point[] } | null
type Preview = { dx: number; dy: number }
type PatchMode = "one-tone" | "texture"
const MAX_PATCH_IMAGE_PIXELS = 8_000_000

function copyCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas")
  copy.width = source.width
  copy.height = source.height
  copy.getContext("2d")!.drawImage(source, 0, 0)
  return copy
}

function smoothPath(points: Point[]) {
  if (points.length < 3) return ""
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    d += ` Q ${a.x} ${a.y} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`
  }
  const last = points[points.length - 1], first = points[0]
  return `${d} Q ${last.x} ${last.y} ${(last.x + first.x) / 2} ${(last.y + first.y) / 2} Z`
}

function shapePath(shape: Shape) {
  if (!shape || shape.points.length < 2) return ""
  if (shape.kind === "lasso") return smoothPath(shape.points)
  if (shape.kind === "polygon") return `M ${shape.points.map(({ x, y }) => `${x} ${y}`).join(" L ")} Z`
  const [a, b] = [shape.points[0], shape.points[shape.points.length - 1]]
  return `M ${a.x} ${a.y} H ${b.x} V ${b.y} H ${a.x} Z`
}

function drawLasso(context: CanvasRenderingContext2D, points: Point[]) {
  context.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    context.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2)
  }
  const last = points[points.length - 1], first = points[0]
  context.quadraticCurveTo(last.x, last.y, (last.x + first.x) / 2, (last.y + first.y) / 2)
  context.closePath()
}

export function PatchWorkspace({ image }: { image: WorkImage }) {
  const { t, settings } = useApp()
  const { original, canvas: sharedCanvas, commit, undo, redo, reset: resetSession, canUndo, canRedo, registerPending, resetVersion, hasPendingExcept, viewportZoom: zoom, viewportFit, setViewportZoom, fitViewport } = useEditorSession()
  const [current, setCurrent] = React.useState(sharedCanvas)
  const [mode, setMode] = React.useState<Mode>("lasso")
  const [patchMode, setPatchMode] = React.useState<PatchMode>("texture")
  const [shape, setShape] = React.useState<Shape>(null)
  const [drawing, setDrawing] = React.useState<Shape>(null)
  const [polygonHover, setPolygonHover] = React.useState<Point | null>(null)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [hand, setHand] = React.useState(false)
  const spaceHand = useSpacePan()
  const { color: cursorColor, cursorStyle } = useEditorCursor()
  const [showOriginal, setShowOriginal] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)
  const displayRef = React.useRef<HTMLCanvasElement>(null)
  const viewRef = React.useRef<HTMLDivElement>(null)
  const maskRef = React.useRef<HTMLCanvasElement>(null)
  const currentRef = React.useRef(current)
  const drawingRef = React.useRef<Shape>(null)
  const dragRef = React.useRef<{ start: Point; preview: Preview } | null>(null)
  const strokeRef = React.useRef<Point[] | null>(null)
  const previewTimer = React.useRef<number | null>(null)
  const handRef = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const edgePointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const edgeFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const next = sharedCanvas
    currentRef.current = next
    setCurrent(next)
    const mask = maskRef.current
    if (mask) { mask.width = next.width; mask.height = next.height; mask.getContext("2d")!.clearRect(0, 0, next.width, next.height) }
    setShape(null); setDrawing(null); drawingRef.current = null; setPolygonHover(null)
    setPreview(null); setMode("lasso"); setShowOriginal(false); setError("")
  }, [image.id])

  React.useEffect(() => {
    currentRef.current = sharedCanvas
    setCurrent(sharedCanvas)
    const mask = maskRef.current
    if (mask && (mask.width !== sharedCanvas.width || mask.height !== sharedCanvas.height)) {
      mask.width = sharedCanvas.width; mask.height = sharedCanvas.height
      setShape(null); setDrawing(null); drawingRef.current = null; setPolygonHover(null); setPreview(null)
    }
  }, [sharedCanvas])

  React.useEffect(() => {
    registerPending("patch", !!(shape || drawing || preview))
    return () => registerPending("patch", false)
  }, [shape, drawing, preview, registerPending])

  React.useEffect(() => {
    const canvas = displayRef.current
    if (!canvas) return
    if (canvas.width !== current.width || canvas.height !== current.height) {
      canvas.width = current.width; canvas.height = current.height
    }
    const context = canvas.getContext("2d")!
    drawEditorCanvasBase(context, showOriginal ? original : current)
    if (preview && !showOriginal) {
      const donor = document.createElement("canvas")
      donor.width = current.width; donor.height = current.height
      const donorContext = donor.getContext("2d")!
      donorContext.drawImage(current, -preview.dx, -preview.dy)
      donorContext.globalCompositeOperation = "destination-in"
      donorContext.drawImage(maskRef.current!, 0, 0)
      context.globalAlpha = 0.8
      context.drawImage(donor, 0, 0)
      context.globalAlpha = 1
    }
  }, [current, preview, showOriginal, original])

  React.useEffect(() => () => { if (previewTimer.current !== null) window.clearTimeout(previewTimer.current) }, [])
  React.useEffect(() => () => stopEdgePan(), [])

  const getPointAt = (clientX: number, clientY: number, canvas: HTMLCanvasElement): Point => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(current.width - 1, ((clientX - rect.left) / rect.width) * current.width)),
      y: Math.max(0, Math.min(current.height - 1, ((clientY - rect.top) / rect.height) * current.height)),
    }
  }
  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => getPointAt(event.clientX, event.clientY, event.currentTarget)

  const restore = (next: HTMLCanvasElement) => {
    currentRef.current = next
    setCurrent(next)
  }

  const finishPolygon = (points: Point[]) => {
    if (points.length < 3) return
    stopEdgePan()
    const mask = maskRef.current!, context = mask.getContext("2d")!
    context.clearRect(0, 0, mask.width, mask.height)
    context.fillStyle = "white"; context.beginPath(); context.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y)
    context.closePath(); context.fill()
    const selected: Shape = { kind: "polygon", points }
    setShape(selected); setDrawing(null); drawingRef.current = null; setPolygonHover(null)
    setMode(null); setError("")
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
      const pointer = edgePointerRef.current, view = viewRef.current, canvas = displayRef.current
      const polygon = drawingRef.current?.kind === "polygon"
      const freehand = !!strokeRef.current && !!drawingRef.current
      if (!pointer || !view || !canvas || (!polygon && !freehand)) return
      const rect = view.getBoundingClientRect()
      const dx = getEdgePanDelta(pointer.x, rect.left, rect.right)
      const dy = getEdgePanDelta(pointer.y, rect.top, rect.bottom)
      if (!dx && !dy) return
      view.scrollLeft += dx; view.scrollTop += dy
      const point = getPointAt(pointer.x, pointer.y, canvas)
      if (polygon) setPolygonHover(point)
      else if (strokeRef.current && drawingRef.current) {
        strokeRef.current.push(point)
        const next: Shape = { ...drawingRef.current, points: [...strokeRef.current] }
        drawingRef.current = next; setDrawing(next)
      }
      edgeFrameRef.current = window.requestAnimationFrame(step)
    }
    edgeFrameRef.current = window.requestAnimationFrame(step)
  }

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy || showOriginal) return
    if ((hand || spaceHand) && viewRef.current) {
      handRef.current = { x: event.clientX, y: event.clientY, left: viewRef.current.scrollLeft, top: viewRef.current.scrollTop }
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return
    }
    const point = getPoint(event), mask = maskRef.current!
    if (mode === "polygon") {
      const active = drawingRef.current
      if (!active) {
        mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height)
        setShape(null); setPreview(null); setError("")
        const next: Shape = { kind: "polygon", points: [point] }
        drawingRef.current = next; setDrawing(next); setPolygonHover(point)
      } else if (active.kind === "polygon") {
        const first = active.points[0], rect = event.currentTarget.getBoundingClientRect()
        const firstX = rect.left + first.x / current.width * rect.width
        const firstY = rect.top + first.y / current.height * rect.height
        if (shouldClosePolygon(event.clientX, event.clientY, firstX, firstY, event.detail > 1)) finishPolygon(active.points)
        else {
          const next: Shape = { kind: "polygon", points: [...active.points, point] }
          drawingRef.current = next; setDrawing(next); setPolygonHover(point)
        }
      }
      event.preventDefault(); return
    }
    if (!mode && shape) {
      const x = Math.round(point.x), y = Math.round(point.y)
      const alpha = mask.getContext("2d")!.getImageData(x, y, 1, 1).data[3]
      if (alpha) {
        dragRef.current = { start: point, preview: { dx: 0, dy: 0 } }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
        return
      }
      setError(t.edit.patchStartInside)
      return
    }
    if (!mode) return
    mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height)
    const next: Shape = { kind: mode, points: [point] }
    drawingRef.current = next
    setDrawing(next); strokeRef.current = [point]
    setShape(null); setPreview(null); setError("")
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (handRef.current && viewRef.current) {
      viewRef.current.scrollLeft = handRef.current.left - (event.clientX - handRef.current.x)
      viewRef.current.scrollTop = handRef.current.top - (event.clientY - handRef.current.y)
      return
    }
    if (dragRef.current) {
      const point = getPoint(event), start = dragRef.current.start
      const next = { dx: point.x - start.x, dy: point.y - start.y }
      dragRef.current.preview = next
      if (previewTimer.current === null) {
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null
          if (dragRef.current) setPreview(dragRef.current.preview)
        }, 45)
      }
      event.preventDefault()
      return
    }
    if (drawingRef.current?.kind === "polygon") {
      scheduleEdgePan(event.clientX, event.clientY)
      setPolygonHover(getPoint(event)); event.preventDefault(); return
    }
    const points = strokeRef.current
    if (!points || !drawingRef.current) return
    scheduleEdgePan(event.clientX, event.clientY)
    const point = getPoint(event)
    points.push(point)
    const next: Shape = { ...drawingRef.current, points: [...points] }
    drawingRef.current = next
    setDrawing(next)
    event.preventDefault()
  }

  const applyPatch = async (offset: Preview) => {
    const maskCanvas = maskRef.current!
    const maskPixels = maskCanvas.getContext("2d")!.getImageData(0, 0, current.width, current.height)
    const mask = new Uint8Array(current.width * current.height)
    let count = 0
    for (let i = 0; i < mask.length; i++) { mask[i] = maskPixels.data[i * 4 + 3]; if (mask[i]) count++ }
    if (!count) { setError(t.edit.selectionEmpty); return }
    if (count > MAX_PATCH_AREA) { setError(t.edit.patchTooLarge); return }

    setBusy(true); setError("")
    const rgba = currentRef.current.getContext("2d")!.getImageData(0, 0, current.width, current.height)
    const worker = new Worker(new URL("../lib/patch.worker.ts", import.meta.url), { type: "module" })
    const result = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ result?: Uint8ClampedArray; error?: string }>) => {
        worker.terminate()
        if (event.data.error) reject(new Error(event.data.error))
        else resolve(event.data.result!)
      }
      worker.onerror = () => { worker.terminate(); reject(new Error(t.edit.patchError)) }
      worker.postMessage({
        rgba: rgba.data, mask, width: current.width, height: current.height,
        offsetX: Math.round(offset.dx), offsetY: Math.round(offset.dy), mode: patchMode,
      }, [rgba.data.buffer])
    }).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : ""
      setError(message.includes("too large") ? t.edit.patchTooLarge : message.includes("outside") ? t.edit.patchDonorBounds : t.edit.patchError)
      return null
    }).finally(() => setBusy(false))
    if (!result) return
    const next = copyCanvas(currentRef.current)
    const data = next.getContext("2d")!.createImageData(next.width, next.height)
    data.data.set(result); next.getContext("2d")!.putImageData(data, 0, 0)
    commit(next)
    restore(next)
    setPreview(null); setDrawing(null); drawingRef.current = null; setShape(null); strokeRef.current = null
    maskCanvas.getContext("2d")!.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    setMode("lasso")
  }

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (handRef.current) { handRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return }
    const drag = dragRef.current
    if (drag) {
      dragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      const point = getPoint(event)
      const finalOffset = { dx: point.x - drag.start.x, dy: point.y - drag.start.y }
      if (Math.abs(finalOffset.dx) + Math.abs(finalOffset.dy) < 1) { setPreview(null); return }
      setPreview(finalOffset)
      void applyPatch(finalOffset)
      return
    }
    const active = drawingRef.current
    if (!active) return
    if (active.kind === "polygon") return
    stopEdgePan()
    const points = [...(strokeRef.current ?? active.points)]
    if (active.kind === "rectangle") points.push(getPoint(event))
    const mask = maskRef.current!, context = mask.getContext("2d")!
    context.fillStyle = "white"; context.beginPath()
    if (active.kind === "rectangle") {
      const [a, b] = [points[0], points[points.length - 1]]
      context.rect(a.x, a.y, b.x - a.x, b.y - a.y)
    } else if (points.length > 2) drawLasso(context, points)
    if (points.length > 2 || active.kind === "rectangle") context.fill()
    const selected: Shape = points.length > 2 || active.kind === "rectangle" ? { kind: active.kind, points } : null
    setShape(selected); setDrawing(null); drawingRef.current = null; strokeRef.current = null; setPolygonHover(null)
    setMode(null); setError(selected ? "" : t.edit.selectionEmpty)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const clearSelection = () => {
    stopEdgePan()
    const mask = maskRef.current!
    mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height)
    setShape(null); setDrawing(null); drawingRef.current = null; setPolygonHover(null); setPreview(null); setMode(null); setError("")
  }

  React.useEffect(() => {
    if (mode !== "polygon" || drawing?.kind !== "polygon") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return
      if (event.key === "Escape") {
        stopEdgePan()
        maskRef.current?.getContext("2d")?.clearRect(0, 0, current.width, current.height)
        setDrawing(null); drawingRef.current = null; setPolygonHover(null); setMode(null); event.preventDefault()
      } else if (event.key === "Backspace" || event.key === "Delete") {
        const points = (drawingRef.current?.points ?? []).slice(0, -1)
        const next: Shape = points.length ? { kind: "polygon", points } : null
        drawingRef.current = next; setDrawing(next); setPolygonHover(points.at(-1) ?? null); event.preventDefault()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mode, drawing, current.width, current.height])

  React.useEffect(() => {
    if (!resetVersion) return
    clearSelection(); setShowOriginal(false); setError("")
  }, [resetVersion])

  const reset = () => {
    if ((canUndo || hasPendingExcept("reset")) && !window.confirm(t.edit.resetConfirm)) return
    resetSession()
    clearSelection(); setShowOriginal(false); setError("")
  }
  const download = async () => {
    setBusy(true)
    try {
      const blob = await compressCanvas(currentRef.current, format, settings.lastQuality / 100)
      downloadBlob(blob, withSuffix(image.name, "_patched", extForFormat(format)))
    } catch { setError(t.edit.patchError) }
    finally { setBusy(false) }
  }

  if (image.width * image.height > MAX_PATCH_IMAGE_PIXELS) {
    return <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">{t.edit.retouchTooLarge}</p>
  }

  const visibleShape = drawing ?? shape
  const path = shapePath(visibleShape)
  const selectionStroke = editorSelectionStroke(cursorColor)
  const drawingPath = drawing?.kind === "polygon"
    ? `M ${polygonPreviewPoints(drawing.points, polygonHover, true).map(({ x, y }) => `${x} ${y}`).join(" L ")}`
    : path
  const donorPath = preview && shape ? (() => {
    const translated = { ...shape, points: shape.points.map(({ x, y }) => ({ x: x + preview.dx, y: y + preview.dy })) }
    return shapePath(translated)
  })() : ""

  return <section className="grid min-h-[calc(100vh-12rem)] min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_248px]" aria-label={t.edit.retouch}>
    <EditorViewport viewportRef={viewRef} imageWidth={current.width} imageHeight={current.height} zoom={zoom} onZoom={setViewportZoom} fit={viewportFit} onFit={fitViewport} handMode={hand || spaceHand}>
        <canvas ref={displayRef} width={current.width} height={current.height} tabIndex={0} className="block touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ width: current.width * zoom, height: current.height * zoom, imageRendering: zoom >= 4 ? "pixelated" : "auto", cursor: hand || spaceHand ? "grab" : cursorStyle }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label={t.edit.retouch} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${current.width} ${current.height}`} preserveAspectRatio="none" aria-hidden="true">
          {drawingPath && <><path d={drawingPath} fill="none" stroke={selectionStroke.outline} strokeWidth="3" strokeDasharray="7 5" /><path d={drawingPath} fill="none" stroke={selectionStroke.stroke} strokeWidth="1.6" strokeDasharray="7 5"><animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1s" repeatCount="indefinite" /></path></>}
          {donorPath && <path d={donorPath} fill="rgba(34,211,238,.08)" stroke="#0891b2" strokeWidth="2" strokeDasharray="8 5" />}
        </svg>
        <canvas ref={maskRef} width={current.width} height={current.height} className="hidden" aria-hidden="true" />
    </EditorViewport>
    <aside className="min-w-0 space-y-2 overflow-y-auto rounded-lg border p-2 lg:max-h-[calc(100vh-12rem)]">
      <p className="text-sm text-muted-foreground">{t.edit.patchHelp}</p>
      <EditorCursorPicker />
      <div className="grid grid-cols-2 gap-1.5 [&>button]:h-auto [&>button]:min-h-9 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:px-2 [&>button]:text-xs" role="group" aria-label={t.edit.retouch}>
        {(["one-tone", "texture"] as const).map((value) => <Button key={value} variant={patchMode === value ? "default" : "outline"} aria-pressed={patchMode === value} title={value === "one-tone" ? t.edit.patchModeOneToneHelp : t.edit.patchModeTextureHelp} onClick={() => setPatchMode(value)}>{value === "one-tone" ? t.edit.patchModeOneTone : t.edit.patchModeTexture}</Button>)}
      </div>
      <div className="grid grid-cols-2 gap-1.5 [&>button]:h-auto [&>button]:min-h-9 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:px-2 [&>button]:text-xs">
        <Button variant={mode === "lasso" || (!mode && !shape) ? "default" : "outline"} title={t.edit.lassoHelp} disabled={busy} onClick={() => { clearSelection(); setMode("lasso") }}><MousePointer2 className="size-4" />{t.edit.lasso}</Button>
        <Button variant={mode === "polygon" ? "default" : "outline"} title={t.edit.polygonLassoHelp} disabled={busy} onClick={() => { clearSelection(); setMode("polygon") }}><Hexagon className="size-4" />{t.edit.polygonLasso}</Button>
        <Button variant={mode === "rectangle" ? "default" : "outline"} title={t.edit.rectangleHelp} disabled={busy} onClick={() => { clearSelection(); setMode("rectangle") }}><Square className="size-4" />{t.edit.rectangle}</Button>
        <Button variant="outline" disabled={!shape || busy} onClick={clearSelection}><Eraser className="size-4" />{t.edit.clearSelection}</Button>
        <IconTooltipButton label={t.edit.undo} variant="outline" onClick={undo} disabled={busy || !canUndo}><Undo2 className="size-4" /></IconTooltipButton>
        <IconTooltipButton label={t.edit.redo} variant="outline" onClick={redo} disabled={busy || !canRedo}><Redo2 className="size-4" /></IconTooltipButton>
        <Button variant={hand ? "default" : "outline"} onClick={() => setHand((value) => !value)}><Hand className="size-4" />{t.edit.handTool}</Button>
        <IconTooltipButton label={t.common.reset} variant="outline" onClick={reset} disabled={busy}><RotateCcw className="size-4" /></IconTooltipButton>
        <IconTooltipButton label={showOriginal ? t.edit.showResult : t.edit.compare} variant={showOriginal ? "default" : "outline"} disabled={busy} onClick={() => setShowOriginal(!showOriginal)}><Columns2 className="size-4" /></IconTooltipButton>
      </div>
      <div className="grid grid-cols-3 gap-1"><IconTooltipButton label={t.edit.zoomOut} variant="outline" onClick={() => setViewportZoom(nextEditorZoom(zoom, -1))}><Minus className="size-4" /></IconTooltipButton><IconTooltipButton label={t.edit.zoomFit} variant="outline" onClick={() => fitViewport(imageFitScale(current.width, current.height, viewRef.current?.clientWidth ?? 0, viewRef.current?.clientHeight ?? 0))}><Scan className="size-4" /></IconTooltipButton><IconTooltipButton label={t.edit.zoomIn} variant="outline" onClick={() => setViewportZoom(nextEditorZoom(zoom, 1))}><Plus className="size-4" /></IconTooltipButton></div>
      <div className="grid grid-cols-3 gap-1">{[2, 4, 8].map((value) => <Button key={value} size="sm" variant={zoom === value ? "default" : "outline"} onClick={() => setViewportZoom(value)}>{value * 100}%</Button>)}</div>
      <div className="flex items-center gap-2"><Label htmlFor="patch-zoom" className="text-xs">{t.edit.zoom}: {Math.round(zoom * 100)}%</Label><input id="patch-zoom" type="range" min="25" max="1600" step="1" value={Math.round(zoom * 100)} onChange={(event) => setViewportZoom(Number(event.target.value) / 100)} className="w-full accent-primary" /></div>
      <p className="text-xs text-muted-foreground">{t.edit.patchDragHint}</p>
      <div className="flex gap-2"><select aria-label={t.common.format} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option></select><Button onClick={() => void download()} disabled={busy}><Download className="size-4" />{t.common.download}</Button></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{busy && <span role="status" className="text-sm text-muted-foreground">{t.common.processing}</span>}
    </aside>
  </section>
}
