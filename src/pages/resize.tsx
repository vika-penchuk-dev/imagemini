import * as React from "react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel, ProcessingStatus } from "@/components/work-image"
import {
  compressCanvas,
  computeTargetSize,
  fitsCanvas,
  extForFormat,
  steppedDrawToCanvas,
  flattenOnBackground,
  hasAlphaChannel,
  type OutputFormat,
  type ResizeOptions,
} from "@/lib/image-core"
import { downloadBlob, formatLabel, withSuffix } from "@/lib/image-job"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CompareSlider, StatRow, HintButton } from "@/components/compare"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedPreview } from "@/hooks/use-preview"
import { formatBytesLocalized } from "@/lib/image-core"
import { processCanvasInWorker } from "@/lib/image-processing"

const PRESETS = [800, 1024, 1280, 1920]

export function ResizePage() {
  const { t, lang, settings, setSettings } = useApp()
  const { image } = useWorkImage()
  const [mode, setMode] = React.useState<ResizeOptions["mode"]>("exact")
  const [width, setWidth] = React.useState("0")
  const [height, setHeight] = React.useState("0")
  const [percent, setPercent] = React.useState("50")
  const [longSide, setLongSide] = React.useState("1024")
  const [preset, setPreset] = React.useState("1024")
  const [scale, setScale] = React.useState(2)
  const [keepAspect, setKeepAspect] = React.useState(settings.keepAspect)
  const [dontEnlarge, setDontEnlarge] = React.useState(settings.dontEnlarge)
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)

  React.useEffect(() => {
    setMode("exact")
    setPercent("50")
    setPreset("1024")
    setScale(2)
    setKeepAspect(settings.keepAspect)
    setDontEnlarge(settings.dontEnlarge)
    setFormat(settings.lastFormat)
    if (image) {
      setWidth(String(image.width))
      setHeight(String(image.height))
      setLongSide(String(Math.max(image.width, image.height)))
    } else {
      setWidth("0")
      setHeight("0")
      setLongSide("1024")
    }
  }, [image?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const target = image ? computeTargetSize(image.width, image.height, {
    mode,
    width: parseInt(width) || image.width,
    height: parseInt(height) || image.height,
    percent: parseFloat(percent) || 100,
    longSide: parseInt(longSide) || image.width,
    preset: parseInt(preset),
    scale,
    keepAspect,
    dontEnlarge: mode === "scale" ? false : dontEnlarge,
  }) : null
  const key = image && target ? JSON.stringify([image.id, mode, target.w, target.h, keepAspect, dontEnlarge, format, settings.lastQuality, settings.bgColor]) : null
  const { result, busy, error } = useDebouncedPreview(key, async (signal) => {
    if (!image || !target) throw new Error(t.errors.decodeFailed)
    if (!fitsCanvas(target.w, target.h)) throw new Error(t.errors.outputTooLarge)
    const isDownscale = target.w < image.width
    const canvas = isDownscale
      ? steppedDrawToCanvas(image.canvas, image.width, image.height, target.w, target.h)
      : await processCanvasInWorker(image.canvas, { kind: "resize", targetWidth: target.w, targetHeight: target.h }, signal)
    let source = canvas
    if (format === "image/jpeg" && await hasAlphaChannel(source)) source = flattenOnBackground(source, settings.bgColor)
    const blob = await compressCanvas(source, format, settings.lastQuality / 100, signal)
    const exported = await createImageBitmap(blob)
    const actualWidth = exported.width
    const actualHeight = exported.height
    exported.close()
    if (actualWidth !== target.w || actualHeight !== target.h) throw new Error(t.errors.exportDimensionsMismatch)
    setSettings({ keepAspect, dontEnlarge, lastFormat: format })
    return { blob, width: actualWidth, height: actualHeight }
  })
  const current = result?.key === key ? result : null

  if (!image || !target) {
    return <div className="space-y-6"><header><h1 className="text-2xl font-bold tracking-tight">{t.resize.title}</h1><p className="text-muted-foreground">{t.resize.desc}</p></header><ImagePanel /></div>
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.resize.title}</h1>
        <p className="text-muted-foreground">{t.resize.desc}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {current ? (
            <CompareSlider
              beforeSrc={image.objectUrl}
              afterSrc={current.url}
              beforeLabel={t.common.before}
              afterLabel={t.common.after}
              lang={lang}
            />
          ) : (
            <ImagePanel>{busy && <ProcessingStatus label={t.common.processing} />}</ImagePanel>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t.common.previewError}: {error}</p>}
        </div>

        <div className="tool-panel-stack">
          <Card>
            <CardHeader>
              <CardTitle>{t.resize.mode}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={mode} onValueChange={(v) => setMode(v as ResizeOptions["mode"])}>
                <SelectTrigger className="w-full" aria-label={t.resize.mode}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">{t.resize.exact}</SelectItem>
                  <SelectItem value="percent">{t.resize.percent}</SelectItem>
                  <SelectItem value="longSide">{t.resize.longSide}</SelectItem>
                  <SelectItem value="preset">{t.resize.preset}</SelectItem>
                  <SelectItem value="scale">{t.resize.scale}</SelectItem>
                </SelectContent>
              </Select>

              {mode === "scale" && (
                <div className="space-y-2">
                  <RadioGroup value={String(scale)} onValueChange={(value) => setScale(Number(value))} className="grid grid-cols-4 gap-2">
                    {[1.5, 2, 3, 4].map((factor) => (
                      <Label key={factor} className="flex items-center justify-center rounded-md border p-2 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
                        <RadioGroupItem value={String(factor)} className="sr-only" />{factor}×
                      </Label>
                    ))}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">{t.resize.upscaleNote}</p>
                </div>
              )}

              {mode === "exact" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="r-width">{t.common.width}</Label>
                    <Input
                      id="r-width"
                      type="number"
                      min={1}
                      value={width}
                      onChange={(e) => {
                        setWidth(e.target.value)
                        if (keepAspect) {
                          const w = parseInt(e.target.value)
                          if (w > 0 && image.width > 0) {
                            setHeight(String(Math.round((image.height / image.width) * w)))
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="r-height">{t.common.height}</Label>
                    <Input
                      id="r-height"
                      type="number"
                      min={1}
                      value={height}
                      onChange={(e) => {
                        setHeight(e.target.value)
                        if (keepAspect) {
                          const h = parseInt(e.target.value)
                          if (h > 0 && image.height > 0) {
                            setWidth(String(Math.round((image.width / image.height) * h)))
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {mode === "percent" && (
                <div className="space-y-1.5">
                  <Label htmlFor="r-percent">%</Label>
                  <Input
                    id="r-percent"
                    type="number"
                    min={1}
                    max={1000}
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                  />
                </div>
              )}

              {mode === "longSide" && (
                <div className="space-y-1.5">
                  <Label htmlFor="r-long">{t.resize.longSide}</Label>
                  <Input
                    id="r-long"
                    type="number"
                    min={1}
                    value={longSide}
                    onChange={(e) => setLongSide(e.target.value)}
                  />
                </div>
              )}

              {mode === "preset" && (
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger className="w-full" aria-label={t.resize.preset}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {p} px
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                    checked={keepAspect}
                    onCheckedChange={(v) => setKeepAspect(v === true)}
                  disabled={mode === "scale"}
                  />
                  {t.resize.keepAspect}
                </Label>
                {mode !== "scale" && (
                  <Label className="flex items-center gap-2 font-normal">
                    <Checkbox checked={dontEnlarge} onCheckedChange={(v) => setDontEnlarge(v === true)} />
                    {t.resize.dontEnlarge}
                  </Label>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">{t.common.format}<HintButton label={t.common.format}>{t.help.format}</HintButton></Label>
                <Select
                  value={format}
                  onValueChange={(v) => setFormat(v as OutputFormat)}
                >
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

              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t.resize.resultSize}: </span>
                <span className="font-medium tabular-nums">
                  {target.w}×{target.h}
                </span>
              </div>

            </CardContent>
          </Card>

          {current && (
            <Card>
              <CardHeader>
                <CardTitle>{t.common.result}</CardTitle>
                <CardDescription>
                  {formatLabel(format)} · {formatBytesLocalized(current.blob.size, lang)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatRow
                  items={[
                    {
                      label: t.common.size,
                      value: `${formatBytesLocalized(image.size, lang)} → ${formatBytesLocalized(current.blob.size, lang)}`,
                    },
                    {
                      label: t.common.dimensions,
                      value: `${image.width}×${image.height} → ${current.width}×${current.height}`,
                    },
                  ]}
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadBlob(
                      current.blob,
                      withSuffix(image.name, "_resized", extForFormat(format))
                    )
                  }
                  disabled={busy}
                >
                  {t.common.download}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
