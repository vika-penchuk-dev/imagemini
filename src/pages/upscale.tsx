import * as React from "react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel, ProcessingStatus } from "@/components/work-image"
import {
  canvasToBlob,
  fitsCanvas,
  extForFormat,
  type OutputFormat,
} from "@/lib/image-core"
import { computeUpscaleSize } from "@/lib/image-sizing.mjs"
import { downloadBlob, withSuffix } from "@/lib/image-job"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CompareSlider, StatRow } from "@/components/compare"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { HintButton } from "@/components/compare"
import { useDebouncedPreview } from "@/hooks/use-preview"
import { formatBytesLocalized } from "@/lib/image-core"
import { processCanvasInWorker } from "@/lib/image-processing"

const SCALES = [1.5, 2, 3, 4] as const

export function UpscalePage() {
  const { t, lang } = useApp()
  const { image } = useWorkImage()
  const [scale, setScale] = React.useState<number>(2)
  const [progress, setProgress] = React.useState(0)
  React.useEffect(() => { setScale(2); setProgress(0) }, [image?.id])
  const key = image ? JSON.stringify([image.id, scale]) : null
  const { result, busy, error } = useDebouncedPreview(key, async (signal) => {
    if (!image) throw new Error(t.errors.decodeFailed)
    setProgress(0)
    await new Promise((r) => setTimeout(r, 30))
    const { width: dstW, height: dstH } = computeUpscaleSize(image.width, image.height, scale)
    if (!fitsCanvas(dstW, dstH)) {
      throw new Error(t.errors.outputTooLarge)
    }
    const upscaled = await processCanvasInWorker(image.canvas, { kind: "resize", targetWidth: dstW, targetHeight: dstH }, signal, setProgress)
    setProgress(1)
    const format: OutputFormat = "image/png"
    const blob = await canvasToBlob(upscaled, format, 1)
    const exported = await createImageBitmap(blob)
    const actualWidth = exported.width
    const actualHeight = exported.height
    exported.close()
    if (actualWidth !== dstW || actualHeight !== dstH) {
      throw new Error(t.errors.exportDimensionsMismatch)
    }
    return { blob, width: actualWidth, height: actualHeight }
  }, 350)
  const current = result?.key === key ? result : null

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.upscale.title}</h1>
        <p className="text-muted-foreground">{t.upscale.desc}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {current && image ? (
            <CompareSlider
              beforeSrc={image.objectUrl}
              afterSrc={current.url}
              beforeLabel={t.common.before}
              afterLabel={t.common.after}
              lang={lang}
            />
          ) : (
            <ImagePanel>{image && busy && <ProcessingStatus label={t.common.processing} />}</ImagePanel>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t.common.previewError}: {error}</p>}
        </div>

        <div className="tool-panel-stack">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1">{t.upscale.scale}<HintButton label={t.upscale.scale}>{t.help.scale}</HintButton></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={String(scale)}
                onValueChange={(v) => setScale(Number(v))}
                className="flex gap-2"
              >
                {SCALES.map((s) => (
                  <Label
                    key={s}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border p-2 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={String(s)} className="sr-only" />
                    {s}×
                  </Label>
                ))}
              </RadioGroup>

              {busy && (
                <div className="space-y-2"><Progress value={progress * 100} aria-label={t.common.processing} /><ProcessingStatus label={t.common.processing} /></div>
              )}

            </CardContent>
          </Card>

          {current && image && (
            <Card>
              <CardHeader>
                <CardTitle>{t.common.result}</CardTitle>
                <CardDescription>
                  {lang === "ru" ? "Увеличено" : "Upscaled"} {scale}×
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatRow
                  items={[
                    {
                      label: t.common.size,
                      value: formatBytesLocalized(current.blob.size, lang),
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
                      withSuffix(image.name, `_${scale}x`, extForFormat("image/png"))
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
