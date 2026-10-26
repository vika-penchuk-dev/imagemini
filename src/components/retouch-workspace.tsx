import * as React from "react"
import { Brush, Eraser, Undo2, Redo2, RotateCcw, Download, MousePointer2, Square, Scissors, Copy, Move, X } from "lucide-react"
import { useApp } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { downloadBlob, withSuffix } from "@/lib/image-job"
import { compressCanvas, extForFormat, type OutputFormat } from "@/lib/image-core"
import { MAX_INPAINT_AREA } from "@/lib/inpainting.mjs"
import type { WorkImage } from "@/components/work-image"

type Tool = "select" | "erase" | "clone" | "lasso" | "rectangle" | null
type Point = { x: number; y: number }
type HistoryState = { image: HTMLCanvasElement; mask: HTMLCanvasElement }
type FloatingLayer = { canvas: HTMLCanvasElement; x: number; y: number; scale: number; angle: number; flipX: boolean; flipY: boolean; mode: "copy" | "move"; base?: HTMLCanvasElement }
const MAX_RETOUCH_IMAGE_PIXELS = 8_000_000
const MAX_HISTORY_BYTES = 64 * 1024 * 1024

function copyCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas")
  copy.width = source.width
  copy.height = source.height
  copy.getContext("2d")!.drawImage(source, 0, 0)
  return copy
}

function initialCanvas(source: HTMLCanvasElement) {
  if (source.width * source.height <= MAX_RETOUCH_IMAGE_PIXELS) return copyCanvas(source)
  return document.createElement("canvas")
}

function traceClosedPath(context: CanvasRenderingContext2D, points: Point[]) {
  context.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], point = points[i]
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) / 2, (previous.y + point.y) / 2)
  }
  const last = points[points.length - 1], first = points[0]
  context.quadraticCurveTo(last.x, last.y, (last.x + first.x) / 2, (last.y + first.y) / 2)
  context.closePath()
}

export function RetouchWorkspace({ image }: { image: WorkImage }) {
  const { t, settings } = useApp()
  const [current, setCurrent] = React.useState(() => initialCanvas(image.canvas))
  const [tool, setTool] = React.useState<Tool>("select")
  const [size, setSize] = React.useState(36)
  const [hardness, setHardness] = React.useState(60)
  const [opacity, setOpacity] = React.useState(75)
  const [zoom, setZoom] = React.useState(1)
  const [cloneSource, setCloneSource] = React.useState<Point | null>(null)
  const [version, setVersion] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)
  const [shape, setShape] = React.useState<{ kind: "lasso" | "rectangle"; points: Point[] } | null>(null)
  const [floating, setFloating] = React.useState<FloatingLayer | null>(null)
  const [showOriginal, setShowOriginal] = React.useState(false)
  const [dashOffset, setDashOffset] = React.useState(0)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const strokeRef = React.useRef<{ start: Point; previous: Point; source: Point; points: Point[] } | null>(null)
  const layerDragRef = React.useRef<{ point: Point; x: number; y: number } | null>(null)
  const undoRef = React.useRef<HistoryState[]>([])
  const redoRef = React.useRef<HistoryState[]>([])
  const currentRef = React.useRef(current)

  React.useEffect(() => {
    const next = initialCanvas(image.canvas)
    currentRef.current = next
    setCurrent(next)
    undoRef.current = []
    redoRef.current = []
    setCloneSource(null)
    setFloating(null)
    setShape(null)
    setShowOriginal(false)
    if (maskCanvasRef.current) {
      maskCanvasRef.current.width = next.width
      maskCanvasRef.current.height = next.height
      maskCanvasRef.current.getContext("2d")!.clearRect(0, 0, next.width, next.height)
    }
    setVersion((value) => value + 1)
  }, [image.id])

  React.useEffect(() => {
    const display = canvasRef.current
    if (!display) return
    if (display.width !== current.width || display.height !== current.height) {
      display.width = current.width
      display.height = current.height
    }
    const context = display.getContext("2d")!
    context.clearRect(0, 0, display.width, display.height)
    context.drawImage(showOriginal ? image.canvas : floating?.base ?? current, 0, 0)
    const mask = maskCanvasRef.current
    if (mask && !showOriginal) {
      const tint = document.createElement("canvas")
      tint.width = mask.width
      tint.height = mask.height
      const tintContext = tint.getContext("2d")!
      tintContext.fillStyle = "rgba(37, 99, 235, .28)"
      tintContext.fillRect(0, 0, tint.width, tint.height)
      tintContext.globalCompositeOperation = "destination-in"
      tintContext.drawImage(mask, 0, 0)
      context.drawImage(tint, 0, 0)
    }
    if (floating && !showOriginal) {
      context.save()
      context.translate(floating.x + floating.canvas.width / 2, floating.y + floating.canvas.height / 2)
      context.rotate(floating.angle * Math.PI / 180)
      context.scale(floating.scale * (floating.flipX ? -1 : 1), floating.scale * (floating.flipY ? -1 : 1))
      context.drawImage(floating.canvas, -floating.canvas.width / 2, -floating.canvas.height / 2)
      context.restore()
    }
    if (strokeRef.current?.points.length && (tool === "lasso" || tool === "rectangle")) {
      const points = strokeRef.current.points
      context.save()
      context.strokeStyle = "#2563eb"
      context.lineWidth = Math.max(1.5, current.width / display.clientWidth)
      context.setLineDash([8, 5])
      context.beginPath()
      if (tool === "rectangle") {
        const a = points[0], b = points[points.length - 1]
        context.rect(a.x, a.y, b.x - a.x, b.y - a.y)
      } else {
        context.moveTo(points[0].x, points[0].y)
        points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      }
      context.stroke()
      context.restore()
    }
    if (shape && !showOriginal) {
      const points = shape.points
      context.save()
      context.beginPath()
      if (shape.kind === "rectangle") {
        const a = points[0], b = points[points.length - 1]
        context.rect(a.x, a.y, b.x - a.x, b.y - a.y)
      } else if (points.length > 2) {
        traceClosedPath(context, points)
      }
      context.lineWidth = Math.max(1.25, current.width / Math.max(1, display.clientWidth))
      context.setLineDash([7, 5])
      context.lineDashOffset = dashOffset
      context.strokeStyle = "white"
      context.stroke()
      context.lineDashOffset = dashOffset + 6
      context.strokeStyle = "#111827"
      context.stroke()
      context.restore()
    }
  }, [current, version, floating, showOriginal, image.canvas, tool, shape, dashOffset])

  React.useEffect(() => {
    if (!shape) return
    const timer = window.setInterval(() => setDashOffset((value) => (value + 1) % 24), 80)
    return () => window.clearInterval(timer)
  }, [shape])

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(current.width - 1, ((event.clientX - rect.left) / rect.width) * current.width)),
      y: Math.max(0, Math.min(current.height - 1, ((event.clientY - rect.top) / rect.height) * current.height)),
    }
  }

  const captureState = (): HistoryState => ({ image: copyCanvas(currentRef.current), mask: copyCanvas(maskCanvasRef.current!) })

  const remember = () => {
    const limit = Math.max(1, Math.min(20, Math.floor(MAX_HISTORY_BYTES / (current.width * current.height * 8))))
    undoRef.current = [...undoRef.current, captureState()].slice(-limit)
    redoRef.current = []
  }

  const restore = (state: HistoryState) => {
    currentRef.current = state.image
    setCurrent(state.image)
    const mask = maskCanvasRef.current!
    mask.width = state.mask.width
    mask.height = state.mask.height
    const maskContext = mask.getContext("2d")!
    maskContext.clearRect(0, 0, mask.width, mask.height)
    maskContext.drawImage(state.mask, 0, 0)
    setVersion((value) => value + 1)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return
    const point = getPoint(event)
    if (floating && !tool && !event.altKey) {
      layerDragRef.current = { point, x: floating.x, y: floating.y }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }
    if (event.altKey) {
      setCloneSource(point)
      setTool("clone")
      setError("")
      return
    }
    if (!tool) return
    if (tool === "clone" && !cloneSource) {
      setError(t.edit.cloneSourceMissing)
      return
    }
    remember()
    const source = cloneSource ?? point
    if (tool === "lasso" || tool === "rectangle") {
      maskCanvasRef.current!.getContext("2d")!.clearRect(0, 0, current.width, current.height)
      setShape(null)
    } else if (tool === "select" || tool === "erase") {
      setShape(null)
    }
    strokeRef.current = { start: point, previous: point, source, points: [point] }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool !== "clone" && tool !== "lasso" && tool !== "rectangle") {
      const mask = maskCanvasRef.current!
      const context = mask.getContext("2d")!
      context.save()
      context.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over"
      context.fillStyle = "white"
      context.strokeStyle = "white"
      context.lineWidth = size
      context.lineCap = "round"
      context.lineJoin = "round"
      context.beginPath()
      context.moveTo(point.x, point.y)
      context.lineTo(point.x + 0.01, point.y + 0.01)
      context.stroke()
      context.restore()
      setVersion((value) => value + 1)
    }
    event.preventDefault()
  }

  const cloneStamp = (target: Point, stroke: { start: Point; source: Point }) => {
    const radius = Math.max(1, size / 2)
    const diameter = Math.ceil(radius * 2)
    const stamp = document.createElement("canvas")
    stamp.width = diameter
    stamp.height = diameter
    const stampContext = stamp.getContext("2d")!
    const sample = {
      x: stroke.source.x + target.x - stroke.start.x,
      y: stroke.source.y + target.y - stroke.start.y,
    }
    stampContext.drawImage(currentRef.current, sample.x - radius, sample.y - radius, diameter, diameter, 0, 0, diameter, diameter)
    stampContext.globalCompositeOperation = "destination-in"
    const gradient = stampContext.createRadialGradient(radius, radius, radius * hardness / 100, radius, radius, radius)
    gradient.addColorStop(0, "rgba(0,0,0,1)")
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    stampContext.fillStyle = gradient
    stampContext.fillRect(0, 0, diameter, diameter)
    const context = currentRef.current.getContext("2d")!
    context.globalAlpha = opacity / 100
    context.drawImage(stamp, target.x - radius, target.y - radius)
    context.globalAlpha = 1
  }

  const getSelection = () => {
    const maskCanvas = maskCanvasRef.current!
    const pixels = maskCanvas.getContext("2d")!.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    const mask = new Uint8Array(maskCanvas.width * maskCanvas.height)
    let left = maskCanvas.width, top = maskCanvas.height, right = -1, bottom = -1, count = 0
    for (let i = 0; i < mask.length; i++) {
      if (!pixels.data[i * 4 + 3]) continue
      mask[i] = 1
      count++
      const x = i % maskCanvas.width, y = Math.floor(i / maskCanvas.width)
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    return { mask, count, left, top, right, bottom }
  }

  const runInpaint = (mask: Uint8Array) => new Promise<Uint8ClampedArray>((resolve, reject) => {
    const worker = new Worker(new URL("../lib/inpainting.worker.ts", import.meta.url), { type: "module" })
    const rgba = currentRef.current.getContext("2d")!.getImageData(0, 0, current.width, current.height)
    worker.onmessage = (event: MessageEvent<{ result?: Uint8ClampedArray; error?: string }>) => {
      worker.terminate()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.result!)
    }
    worker.onerror = () => { worker.terminate(); reject(new Error(t.edit.retouchError)) }
    worker.postMessage({ rgba: rgba.data, mask, width: current.width, height: current.height }, [rgba.data.buffer])
  })

  const makeFloating = async (mode: "copy" | "move") => {
    if (busy || floating) return
    const selection = getSelection()
    if (!selection.count) { setError(t.edit.selectionEmpty); return }
    if (mode === "move" && selection.count > MAX_INPAINT_AREA) { setError(t.edit.restoreTooLarge); return }
    const width = selection.right - selection.left + 1, height = selection.bottom - selection.top + 1
    const fragment = document.createElement("canvas")
    fragment.width = width; fragment.height = height
    const fragmentContext = fragment.getContext("2d")!
    fragmentContext.drawImage(currentRef.current, selection.left, selection.top, width, height, 0, 0, width, height)
    const cropMask = document.createElement("canvas")
    cropMask.width = width; cropMask.height = height
    cropMask.getContext("2d")!.putImageData(maskCanvasRef.current!.getContext("2d")!.getImageData(selection.left, selection.top, width, height), 0, 0)
    fragmentContext.globalCompositeOperation = "destination-in"
    fragmentContext.drawImage(cropMask, 0, 0)
    let base: HTMLCanvasElement | undefined
    if (mode === "move") {
      setBusy(true); setError("")
      try {
        const rgba = await runInpaint(selection.mask)
        base = copyCanvas(currentRef.current)
        const data = base.getContext("2d")!.createImageData(base.width, base.height)
        data.data.set(rgba); base.getContext("2d")!.putImageData(data, 0, 0)
      } catch {
        setError(t.edit.retouchError); setBusy(false); return
      }
      setBusy(false)
    }
    setFloating({ canvas: fragment, x: selection.left, y: selection.top, scale: 1, angle: 0, flipX: false, flipY: false, mode, base })
    setTool(null)
  }

  const applyFloating = () => {
    if (!floating) return
    remember()
    const result = copyCanvas(floating.base ?? currentRef.current)
    const context = result.getContext("2d")!
    context.translate(floating.x + floating.canvas.width / 2, floating.y + floating.canvas.height / 2)
    context.rotate(floating.angle * Math.PI / 180)
    context.scale(floating.scale * (floating.flipX ? -1 : 1), floating.scale * (floating.flipY ? -1 : 1))
    context.drawImage(floating.canvas, -floating.canvas.width / 2, -floating.canvas.height / 2)
    const mask = document.createElement("canvas"); mask.width = result.width; mask.height = result.height
    setFloating(null); setShape(null)
    restore({ image: result, mask })
    setTool("lasso")
  }

  const cutSelection = () => {
    const { mask, count } = getSelection()
    if (!count) { setError(t.edit.selectionEmpty); return }
    remember()
    const result = copyCanvas(currentRef.current)
    const pixels = result.getContext("2d")!.getImageData(0, 0, result.width, result.height)
    const coverage = maskCanvasRef.current!.getContext("2d")!.getImageData(0, 0, result.width, result.height).data
    for (let i = 0; i < mask.length; i++) {
      const alpha = coverage[i * 4 + 3]
      if (alpha) pixels.data[i * 4 + 3] = Math.round(pixels.data[i * 4 + 3] * (1 - alpha / 255))
    }
    result.getContext("2d")!.putImageData(pixels, 0, 0)
    const empty = document.createElement("canvas"); empty.width = result.width; empty.height = result.height
    restore({ image: result, mask: empty }); setShape(null); setError("")
  }

  const clearSelection = () => {
    const mask = maskCanvasRef.current!
    mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height)
    setShape(null); setFloating(null); setVersion((value) => value + 1); setError("")
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (layerDragRef.current && floating) {
      const point = getPoint(event), drag = layerDragRef.current
      setFloating({ ...floating, x: drag.x + point.x - drag.point.x, y: drag.y + point.y - drag.point.y })
      event.preventDefault()
      return
    }
    const stroke = strokeRef.current
    if (!stroke) return
    const point = getPoint(event)
    if (tool === "clone") {
      cloneStamp(point, stroke)
    } else if (tool === "select" || tool === "erase") {
      const context = maskCanvasRef.current!.getContext("2d")!
      context.save()
      context.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over"
      context.strokeStyle = "white"
      context.lineWidth = size
      context.lineCap = "round"
      context.lineJoin = "round"
      context.beginPath()
      context.moveTo(stroke.previous.x, stroke.previous.y)
      context.lineTo(point.x, point.y)
      context.stroke()
      context.restore()
    } else if (tool === "lasso" || tool === "rectangle") {
      stroke.points.push(point)
    }
    stroke.previous = point
    setVersion((value) => value + 1)
    event.preventDefault()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (layerDragRef.current) {
      layerDragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }
    const stroke = strokeRef.current
    if (stroke && (tool === "lasso" || tool === "rectangle")) {
      const points = [...stroke.points]
      if (tool === "rectangle") points.push(getPoint(event))
      const mask = maskCanvasRef.current!
      const context = mask.getContext("2d")!
      context.fillStyle = "white"
      context.beginPath()
      if (tool === "rectangle") {
        const a = points[0], b = points[points.length - 1]
        context.rect(a.x, a.y, b.x - a.x, b.y - a.y)
      } else if (points.length > 2) {
        traceClosedPath(context, points)
      }
      if (points.length > 2 || tool === "rectangle") context.fill()
      setShape({ kind: tool, points })
    }
    strokeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setVersion((value) => value + 1)
  }

  const removeSelected = async () => {
    if (current.width * current.height > 16_777_216) {
      setError(t.errors.tooLarge)
      return
    }
    const maskCanvas = maskCanvasRef.current!
    const { mask, count } = getSelection()
    if (!count) {
      setError(t.edit.selectionEmpty)
      return
    }
    if (count > MAX_INPAINT_AREA) {
      setError(t.edit.restoreTooLarge)
      return
    }
    remember()
    setBusy(true)
    setError("")
    const output = await runInpaint(mask).catch((cause: unknown) => {
      setError(cause instanceof Error && cause.message.includes("too large") ? t.edit.restoreTooLarge : t.edit.retouchError)
      return null
    }).finally(() => setBusy(false))
    if (!output) return
    const result = copyCanvas(currentRef.current)
    const imageData = result.getContext("2d")!.createImageData(result.width, result.height)
    imageData.data.set(output)
    result.getContext("2d")!.putImageData(imageData, 0, 0)
    maskCanvas.getContext("2d")!.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    setShape(null)
    restore({ image: result, mask: copyCanvas(maskCanvas) })
  }

  const undo = () => {
    const previous = undoRef.current.pop()
    if (!previous) return
    redoRef.current.push(captureState())
    restore(previous)
  }
  const redo = () => {
    const next = redoRef.current.pop()
    if (!next) return
    undoRef.current.push(captureState())
    restore(next)
  }
  const reset = () => {
    const original = copyCanvas(image.canvas)
    const mask = document.createElement("canvas")
    mask.width = original.width
    mask.height = original.height
    restore({ image: original, mask })
    undoRef.current = []
    redoRef.current = []
    setCloneSource(null)
    setVersion((value) => value + 1)
    setError("")
  }

  const download = async () => {
    setBusy(true)
    try {
      const blob = await compressCanvas(currentRef.current, format, settings.lastQuality / 100)
      downloadBlob(blob, withSuffix(image.name, "_retouched", extForFormat(format)))
    } catch {
      setError(t.edit.retouchError)
    } finally {
      setBusy(false)
    }
  }

  const brushControls: { label: string; value: number; setter: React.Dispatch<React.SetStateAction<number>>; min: number; max: number }[] = [
    { label: t.edit.brushSize, value: size, setter: setSize, min: 4, max: 160 },
    { label: t.edit.brushHardness, value: hardness, setter: setHardness, min: 10, max: 100 },
    { label: t.edit.brushOpacity, value: opacity, setter: setOpacity, min: 10, max: 100 },
  ]

  if (image.width * image.height > MAX_RETOUCH_IMAGE_PIXELS) {
    return <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">{t.edit.retouchTooLarge}</p>
  }

  return (
    <section className="space-y-4" aria-label={t.edit.retouch}>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{t.edit.retouchHelp}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant={tool === "lasso" ? "default" : "outline"} size="sm" title={t.edit.lassoHelp} onClick={() => { setTool(tool === "lasso" ? null : "lasso"); setFloating(null) }}><MousePointer2 className="size-4" />{t.edit.lasso}</Button>
        <Button variant={tool === "rectangle" ? "default" : "outline"} size="sm" title={t.edit.rectangleHelp} onClick={() => { setTool(tool === "rectangle" ? null : "rectangle"); setFloating(null) }}><Square className="size-4" />{t.edit.rectangle}</Button>
        <Button variant={tool === "select" ? "default" : "outline"} size="sm" title={t.edit.selectionBrush} onClick={() => setTool(tool === "select" ? null : "select")}><Brush className="size-4" />{t.edit.selectionBrush}</Button>
        <Button variant={tool === "erase" ? "default" : "outline"} size="sm" title={t.edit.selectionEraser} onClick={() => setTool(tool === "erase" ? null : "erase")}><Eraser className="size-4" />{t.edit.selectionEraser}</Button>
        <Button variant={tool === "clone" ? "default" : "outline"} size="sm" title={t.edit.cloneBrush} onClick={() => setTool(tool === "clone" ? null : "clone")}><Brush className="size-4" />{t.edit.cloneBrush}</Button>
        <Button variant="outline" size="sm" title={t.edit.copyHelp} onClick={() => void makeFloating("copy")} disabled={busy || !!floating}><Copy className="size-4" />{t.edit.copySelection}</Button>
        <Button variant="outline" size="sm" title={t.edit.moveHelp} onClick={() => void makeFloating("move")} disabled={busy || !!floating}><Move className="size-4" />{t.edit.moveSelection}</Button>
        <Button variant="outline" size="sm" title={t.edit.cutHelp} onClick={cutSelection} disabled={busy || !!floating}><Scissors className="size-4" />{t.edit.cutSelection}</Button>
        <Button variant="destructive" size="sm" title={t.edit.removeHelp} onClick={() => void removeSelected()} disabled={busy || !!floating}>{t.edit.removeObjects}</Button>
        <Button variant="ghost" size="sm" title={t.edit.clearHelp} onClick={clearSelection} disabled={busy}><X className="size-4" />{t.edit.clearSelection}</Button>
      </div>
      {floating && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <span className="text-sm font-medium">{floating.mode === "copy" ? t.edit.copySelection : t.edit.moveSelection}: {t.edit.dragLayer}</span>
        <Label className="text-xs">{t.edit.layerScale}: {Math.round(floating.scale * 100)}%</Label>
        <input aria-label={t.edit.layerScale} type="range" min="25" max="300" value={Math.round(floating.scale * 100)} onChange={(event) => setFloating({ ...floating, scale: Number(event.target.value) / 100 })} className="w-28 accent-primary" />
        <Label className="text-xs">{t.edit.layerRotate}: {floating.angle}°</Label>
        <input aria-label={t.edit.layerRotate} type="range" min="-180" max="180" value={floating.angle} onChange={(event) => setFloating({ ...floating, angle: Number(event.target.value) })} className="w-28 accent-primary" />
        <Button variant="outline" size="sm" onClick={() => setFloating({ ...floating, flipX: !floating.flipX })}>{t.edit.flipH}</Button>
        <Button variant="outline" size="sm" onClick={() => setFloating({ ...floating, flipY: !floating.flipY })}>{t.edit.flipV}</Button>
        <Button size="sm" onClick={applyFloating} disabled={busy}>{t.common.apply}</Button>
        <Button variant="outline" size="sm" onClick={() => setFloating(null)} disabled={busy}>{t.common.cancel}</Button>
      </div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {brushControls.map(({ label, value, setter, min, max }) => (
          <div className="space-y-1" key={label}>
            <Label className="text-xs">{label}: {value}{label === t.edit.brushSize ? " px" : "%"}</Label>
            <input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => setter(Number(event.target.value))} className="w-full accent-primary" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="retouch-zoom" className="text-xs">{t.edit.zoom}: {Math.round(zoom * 100)}%</Label>
        <input id="retouch-zoom" type="range" min="1" max="4" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-32 accent-primary" />
        <Button variant="outline" size="sm" onClick={undo} disabled={busy || !undoRef.current.length}><Undo2 className="size-4" />{t.edit.undo}</Button>
        <Button variant="outline" size="sm" onClick={redo} disabled={busy || !redoRef.current.length}><Redo2 className="size-4" />{t.edit.redo}</Button>
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy}><RotateCcw className="size-4" />{t.common.reset}</Button>
        <Button variant={showOriginal ? "default" : "outline"} size="sm" onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? t.edit.showResult : t.edit.compare}</Button>
        <span className="text-xs text-muted-foreground">{cloneSource ? t.edit.cloneSourceReady : t.edit.cloneSource}</span>
      </div>
      <div className="overflow-auto rounded-lg border bg-checkerboard p-2">
        <div className="min-w-full text-center">
          <canvas
            ref={canvasRef}
            className={`inline-block max-w-none touch-none ${tool || floating ? "cursor-crosshair" : "cursor-default"}`}
            style={{ width: `${zoom * 100}%`, height: "auto" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={t.edit.retouch}
          />
          <canvas ref={maskCanvasRef} width={current.width} height={current.height} className="hidden" aria-hidden="true" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t.common.format} className="h-9 rounded-md border bg-background px-3 text-sm" value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}>
          <option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option>
        </select>
        <Button onClick={() => void download()} disabled={busy}><Download className="size-4" />{t.common.download}</Button>
        {busy && <span role="status" className="text-sm text-muted-foreground">{t.common.processing}</span>}
      </div>
    </section>
  )
}
