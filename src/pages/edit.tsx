import * as React from "react"
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Undo2,
  Redo2,
  Hand,
  Minus,
  Plus,
  Columns2,
  Scan,
} from "lucide-react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel, ProcessingStatus } from "@/components/work-image"
import {
  applyTransformToCanvas,
  compressCanvas,
  DEFAULT_TRANSFORM,
  extForFormat,
  type OutputFormat,
} from "@/lib/image-core"
import { downloadBlob, withSuffix } from "@/lib/image-job"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HintButton } from "@/components/compare"
import { IconTooltipButton } from "@/components/icon-tooltip-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedPreview } from "@/hooks/use-preview"
import { PatchWorkspace } from "@/components/patch-workspace"
import { LayerWorkspace } from "@/components/layer-workspace"
import { EditorSessionProvider, useEditorSession } from "@/components/editor-session"
import { EditorViewport } from "@/components/editor-viewport"
import { useSpacePan } from "@/components/editor-cursor"
import { imageFitScale, nextEditorZoom } from "@/lib/editor-geometry.mjs"
import { drawEditorCanvasBase } from "@/lib/editor-canvas.mjs"
import { editorResetButtonLabel } from "@/lib/editor-ui-copy.mjs"
import {
  moveCropRect,
  resizeCropRect,
  type CropRect,
} from "@/lib/crop-geometry.mjs"

type AspectKey = "free" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16"

const ASPECTS: { key: AspectKey; ratio: number | null }[] = [
  { key: "free", ratio: null },
  { key: "1:1", ratio: 1 },
  { key: "4:3", ratio: 4 / 3 },
  { key: "3:4", ratio: 3 / 4 },
  { key: "16:9", ratio: 16 / 9 },
  { key: "9:16", ratio: 9 / 16 },
]

export function EditPage() {
  const { image } = useWorkImage()
  const { t } = useApp()
  if (!image) return <div className="space-y-6"><header><h1 className="text-2xl font-bold tracking-tight">{t.edit.title}</h1><p className="text-muted-foreground">{t.edit.desc}</p></header><ImagePanel /></div>
  return <EditorSessionProvider image={image}><EditWorkspace image={image} /></EditorSessionProvider>
}

function EditWorkspace({ image }: { image: NonNullable<ReturnType<typeof useWorkImage>["image"]> }) {
  const { t, settings, lang } = useApp()
  const session = useEditorSession()
  const { canvas: editCanvas, viewportZoom: viewZoom, viewportFit, setViewportZoom, fitViewport } = session
  const [aspect, setAspect] = React.useState<AspectKey>("free")
  const [showComparison, setShowComparison] = React.useState(false)
  const [cropEditing, setCropEditing] = React.useState(false)
  const [cropError, setCropError] = React.useState("")
  const [cropInput, setCropInput] = React.useState({ x: 0, y: 0, w: 0, h: 0 })
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)
  const [handMode, setHandMode] = React.useState(false)
  const spaceHand = useSpacePan()
  const [editorMode, setEditorMode] = React.useState<"transform" | "patch" | "layers">("transform")
  const cropCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const viewRef = React.useRef<HTMLDivElement>(null)
  const panRef = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const cropGestureRef = React.useRef<{
    handle: string
    startX: number
    startY: number
    rect: CropRect
  } | null>(null)

  React.useEffect(() => {
    session.registerPending("crop", cropEditing)
    return () => session.registerPending("crop", false)
  }, [cropEditing, session.registerPending])

  const cropBounds = { width: editCanvas.width, height: editCanvas.height }

  React.useEffect(() => {
    setShowComparison(false)
    setCropEditing(false)
    setCropError("")
    setCropInput({ x: 0, y: 0, w: 0, h: 0 })
    setFormat(settings.lastFormat)
    setEditorMode("transform")
    setHandMode(false)
  }, [image?.id])

  React.useEffect(() => {
    const canvas = cropCanvasRef.current
    if (!cropEditing || !canvas) return
    const workspace = editCanvas
    canvas.width = workspace.width
    canvas.height = workspace.height
    const context = canvas.getContext("2d")!
    drawEditorCanvasBase(context, workspace)
  }, [cropEditing, editCanvas])

  const applyRotate = (deg: number) => {
    if (session.hasPendingExcept("transform")) { setCropError(t.edit.finishPending); return }
    setCropEditing(false)
    setCropInput({ x: 0, y: 0, w: 0, h: 0 })
    session.commit(applyTransformToCanvas(editCanvas, { ...DEFAULT_TRANSFORM, rotate: deg }))
  }

  const applyFlip = (axis: "h" | "v") => {
    if (session.hasPendingExcept("transform")) { setCropError(t.edit.finishPending); return }
    setCropEditing(false)
    setCropInput({ x: 0, y: 0, w: 0, h: 0 })
    session.commit(applyTransformToCanvas(editCanvas, { ...DEFAULT_TRANSFORM, flipH: axis === "h", flipV: axis === "v" }))
  }

  const beginCrop = () => {
    if (!image) return
    const selection = cropInput.w > 0 && cropInput.h > 0 ? cropInput : { x: 0, y: 0, w: cropBounds.width, h: cropBounds.height }
    setCropInput(selection)
    setCropError("")
    setCropEditing(true)
    setShowComparison(false)
  }

  const applyCrop = () => {
    if (session.hasPendingExcept("crop")) { setCropError(t.edit.finishPending); return }
    if (!image) return
    const c = {
      x: Math.round(cropInput.x),
      y: Math.round(cropInput.y),
      w: Math.round(cropInput.w),
      h: Math.round(cropInput.h),
    }
    if (c.x < 0 || c.y < 0 || c.w < 1 || c.h < 1 || c.x + c.w > cropBounds.width || c.y + c.h > cropBounds.height) {
      setCropError(t.edit.cropInvalid)
      return
    }
    session.commit(applyTransformToCanvas(editCanvas, { ...DEFAULT_TRANSFORM, crop: c }))
    setCropError("")
    setCropEditing(false)
    setCropInput({ x: 0, y: 0, w: 0, h: 0 })
  }

  const resetAll = () => {
    if ((session.canUndo || session.hasPendingExcept("reset")) && !window.confirm(t.edit.resetConfirm)) return
    session.reset()
    setCropInput({ x: 0, y: 0, w: 0, h: 0 })
    setCropEditing(false)
    setCropError("")
  }

  const pointerToCropCoordinates = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = cropCanvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: ((event.clientX - rect.left) / rect.width) * cropBounds.width,
      y: ((event.clientY - rect.top) / rect.height) * cropBounds.height,
    }
  }

  const onCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const handle = target.closest<HTMLElement>("[data-crop-handle]")?.dataset.cropHandle
    if (!handle) return
    const point = pointerToCropCoordinates(event)
    cropGestureRef.current = { handle, startX: point.x, startY: point.y, rect: { ...cropInput } }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = cropGestureRef.current
    if (!gesture) return
    const point = pointerToCropCoordinates(event)
    const dx = point.x - gesture.startX
    const dy = point.y - gesture.startY
    if (gesture.handle === "move") {
      setCropInput(moveCropRect(gesture.rect, dx, dy, cropBounds.width, cropBounds.height))
    } else {
      setCropInput(resizeCropRect(
        gesture.rect,
        gesture.handle,
        dx,
        dy,
        cropBounds.width,
        cropBounds.height,
        ASPECTS.find((item) => item.key === aspect)?.ratio
      ))
    }
  }

  const onCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    cropGestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onViewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(handMode || spaceHand) || cropEditing || !viewRef.current) return
    panRef.current = { x: event.clientX, y: event.clientY, left: viewRef.current.scrollLeft, top: viewRef.current.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const onViewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || !viewRef.current) return
    viewRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x)
    viewRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y)
  }
  const onViewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    panRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const key = JSON.stringify([image.id, session.version, format, settings.lastQuality])
  const { result, busy, error } = useDebouncedPreview(key, async (signal) => {
    return { blob: await compressCanvas(editCanvas, format, settings.lastQuality / 100, signal), width: editCanvas.width, height: editCanvas.height }
  })
  const current = result?.key === key ? result : null
  const workingImage = React.useMemo(() => ({ ...image, canvas: editCanvas, width: editCanvas.width, height: editCanvas.height }), [image, editCanvas])

  return (
    <div className="space-y-6">
      <header className="shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t.edit.title}</h1>
            <p className="text-muted-foreground">{t.edit.desc}</p>
          </div>
        </div>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label={t.edit.title}>
        {([ ["patch", t.edit.editorTabPatch], ["layers", t.edit.editorTabLayers], ["transform", t.edit.editorTabTransform] ] as const).map(([key, label]) => <Button key={key} variant={editorMode === key ? "default" : "outline"} aria-pressed={editorMode === key} onClick={() => setEditorMode(key)}>{label}</Button>)}
        <Button variant="ghost" className="ml-auto" onClick={resetAll}>{editorResetButtonLabel(lang)}</Button>
      </nav>

      <div className={editorMode === "patch" ? "" : "hidden"}>
        <PatchWorkspace image={workingImage} />
      </div>
      <div className={editorMode === "layers" ? "" : "hidden"}>
        <LayerWorkspace image={workingImage} />
      </div>
      <div className={`grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_248px] ${editorMode === "transform" ? "" : "hidden"}`}>
        <EditorViewport viewportRef={viewRef} imageWidth={cropEditing ? editCanvas.width : current?.width ?? editCanvas.width} imageHeight={cropEditing ? editCanvas.height : current?.height ?? editCanvas.height} zoom={viewZoom} onZoom={setViewportZoom} fit={viewportFit} onFit={fitViewport} handMode={handMode || spaceHand} onPointerDown={onViewPointerDown} onPointerMove={onViewPointerMove} onPointerUp={onViewPointerUp} onPointerCancel={onViewPointerUp} className={`relative h-[calc(100vh-12rem)] min-h-64 overflow-auto rounded-lg border ${handMode || spaceHand ? "cursor-grab" : ""}`}>
          {cropEditing ? (
            <div className="relative touch-none select-none" style={{ width: editCanvas.width * viewZoom, height: editCanvas.height * viewZoom }}>
                <canvas
                  ref={cropCanvasRef}
                  className="block object-contain"
                  style={{ width: editCanvas.width * viewZoom, height: editCanvas.height * viewZoom, imageRendering: viewZoom >= 4 ? "pixelated" : "auto" }}
                  aria-label={t.edit.cropWorkspace}
                />
                {cropInput.w > 0 && cropInput.h > 0 && (
                  <div
                    data-crop-handle="move"
                    className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.48)] touch-none"
                    style={{
                      left: `${(cropInput.x / cropBounds.width) * 100}%`,
                      top: `${(cropInput.y / cropBounds.height) * 100}%`,
                      width: `${(cropInput.w / cropBounds.width) * 100}%`,
                      height: `${(cropInput.h / cropBounds.height) * 100}%`,
                    }}
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                    onPointerCancel={onCropPointerUp}
                    aria-label={t.edit.cropWorkspace}
                  >
                    {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => {
                      const position: Record<string, string> = {
                        nw: "-left-1.5 -top-1.5",
                        n: "left-1/2 -top-1.5 -translate-x-1/2",
                        ne: "-right-1.5 -top-1.5",
                        e: "-right-1.5 top-1/2 -translate-y-1/2",
                        se: "-bottom-1.5 -right-1.5",
                        s: "-bottom-1.5 left-1/2 -translate-x-1/2",
                        sw: "-bottom-1.5 -left-1.5",
                        w: "-left-1.5 top-1/2 -translate-y-1/2",
                      }
                      return (
                        <span
                          key={handle}
                          data-crop-handle={handle}
                          aria-hidden="true"
                          className={`absolute size-3 rounded-sm border border-neutral-900 bg-white ${position[handle]} ${handle.length === 1 && handle !== "n" && handle !== "s" ? "cursor-ew-resize" : handle === "n" || handle === "s" ? "cursor-ns-resize" : "cursor-nwse-resize"}`}
                        />
                      )
                    })}
                  </div>
                )}
            </div>
          ) : current ? (
            showComparison ? (
              <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2">
                {[{ src: image.objectUrl, label: t.common.before }, { src: current.url, label: t.common.after }].map(({ src, label }) => (
                  <figure key={label} className="m-0 min-w-0 space-y-2">
                    <img src={src} alt={label} className="mx-auto block max-h-[65vh] max-w-full object-contain" />
                    <figcaption className="text-center text-sm text-muted-foreground">{label}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <img src={current.url} alt={t.common.result} className="block object-contain" style={{ width: current.width * viewZoom, height: current.height * viewZoom, imageRendering: viewZoom >= 4 ? "pixelated" : "auto" }} />
            )
          ) : (
            <ImagePanel>{busy && <ProcessingStatus label={t.common.processing} />}</ImagePanel>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t.common.previewError}: {error}</p>}
        </EditorViewport>

        <div className="tool-panel-stack">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                {t.edit.rotate}
                <IconTooltipButton variant={showComparison ? "secondary" : "outline"} label={showComparison ? t.edit.showResult : t.edit.compare} onClick={() => setShowComparison((value) => !value)} disabled={!current}><Columns2 className="size-4" /></IconTooltipButton>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-1">
                <IconTooltipButton label={t.edit.zoomOut} variant="outline" onClick={() => setViewportZoom(nextEditorZoom(viewZoom, -1))}><Minus className="size-4" /></IconTooltipButton>
                <IconTooltipButton label={t.edit.zoomFit} variant="outline" onClick={() => fitViewport(imageFitScale(editCanvas.width, editCanvas.height, viewRef.current?.clientWidth ?? 0, viewRef.current?.clientHeight ?? 0))}><Scan className="size-4" /></IconTooltipButton>
                <IconTooltipButton label={t.edit.zoomIn} variant="outline" onClick={() => setViewportZoom(nextEditorZoom(viewZoom, 1))}><Plus className="size-4" /></IconTooltipButton>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => setViewportZoom(2)}>200%</Button>
              <div className="flex items-center gap-2"><Label htmlFor="editor-zoom" className="text-xs">{t.edit.zoom}: {Math.round(viewZoom * 100)}%</Label><input id="editor-zoom" type="range" min="25" max="1600" step="1" value={Math.round(viewZoom * 100)} onChange={(event) => setViewportZoom(Number(event.target.value) / 100)} className="w-full accent-primary" /></div>
              <Button variant={handMode ? "default" : "outline"} className="w-full" onClick={() => setHandMode((value) => !value)}><Hand className="size-4" />{t.edit.handTool}</Button>
              <div className="grid grid-cols-4 gap-2">
                <Button variant="outline" size="sm" onClick={() => applyRotate(-90)} aria-label="Rotate left">
                  <RotateCcw className="size-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyRotate(90)} aria-label="Rotate right">
                  <RotateCw className="size-4" />
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => applyFlip("h")}
                  aria-label={t.edit.flipH}
                >
                  <FlipHorizontal className="size-4" />
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => applyFlip("v")}
                  aria-label={t.edit.flipV}
                >
                  <FlipVertical className="size-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <IconTooltipButton label={t.edit.undo} variant="outline" onClick={session.undo} disabled={!session.canUndo}><Undo2 className="size-4" /></IconTooltipButton>
                <IconTooltipButton label={t.edit.redo} variant="outline" onClick={session.redo} disabled={!session.canRedo}><Redo2 className="size-4" /></IconTooltipButton>
                <IconTooltipButton label={editorResetButtonLabel(lang)} variant="ghost" onClick={resetAll} className="ml-auto"><RotateCcw className="size-4" /></IconTooltipButton>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.edit.crop}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {ASPECTS.map((a) => (
                  <Button
                    key={a.key}
                    variant={aspect === a.key ? "default" : "outline"}
                    size="xs"
                    onClick={() => {
                      setAspect(a.key)
                      if (image) {
                        let w = cropBounds.width
                        let h = cropBounds.height
                        if (a.ratio) {
                          if (w / h > a.ratio) w = Math.round(h * a.ratio)
                          else h = Math.round(w / a.ratio)
                        }
                        setCropInput({
                          x: Math.round((cropBounds.width - w) / 2),
                          y: Math.round((cropBounds.height - h) / 2),
                          w,
                          h,
                        })
                        setCropEditing(true)
                        setCropError("")
                        setShowComparison(false)
                      }
                    }}
                  >
                    {a.key === "free" ? t.edit.free : a.key}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["x", "X"],
                    ["y", "Y"],
                    ["w", t.common.width],
                    ["h", t.common.height],
                  ] as ["x" | "y" | "w" | "h", string][]
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min={key === "w" || key === "h" ? 1 : 0}
                      max={key === "x" || key === "w" ? cropBounds.width : cropBounds.height}
                      className="h-8"
                      value={cropInput[key] || ""}
                      onChange={(e) =>
                        setCropInput((prev) => ({
                          ...prev,
                          [key]: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={cropEditing ? applyCrop : beginCrop}
              >
                {cropEditing ? t.common.apply : t.edit.adjustCrop}
              </Button>
              {cropEditing && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setCropEditing(false)}>
                  {t.common.reset}
                </Button>
              )}
              {cropError && <p role="alert" className="text-xs text-destructive">{cropError}</p>}
              {cropEditing && <p className="text-xs text-muted-foreground">{t.edit.cropInstruction}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">{t.common.format}<HintButton label={t.common.format}>{t.help.format}</HintButton></Label>
                <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                  <SelectTrigger className="w-full" aria-label={t.common.format}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image/jpeg">JPEG</SelectItem>
                    <SelectItem value="image/png">PNG</SelectItem>
                    <SelectItem value="image/webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {current && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    downloadBlob(
                      current.blob,
                      withSuffix(image.name, "_edited", extForFormat(format))
                    )
                  }
                  disabled={busy}
                >
                  {t.common.download}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
