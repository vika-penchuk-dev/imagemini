import * as React from "react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel, ProcessingStatus } from "@/components/work-image"
import {
  compressCanvas,
  extForFormat,
  flattenOnBackground,
  hasAlphaChannel,
  OUTPUT_FORMATS,
  type OutputFormat,
  formatBytesLocalized,
} from "@/lib/image-core"
import { downloadBlob, formatLabel, withSuffix } from "@/lib/image-job"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { QualitySlider, CompareSlider, StatRow, HintButton } from "@/components/compare"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebouncedPreview } from "@/hooks/use-preview"

type Mode = "maxQuality" | "balanced" | "maxCompress" | "manual" | "sharpText"
const MODE_QUALITY: Record<Exclude<Mode, "manual">, number> = {
  maxQuality: 95,
  balanced: 80,
  maxCompress: 50,
  sharpText: 88,
}
const PNG_EFFORT: Record<Exclude<Mode, "manual">, number> = {
  maxQuality: 50,
  balanced: 80,
  maxCompress: 100,
  sharpText: 88,
}

export function CompressPage() {
  const { t, lang, settings, setSettings } = useApp()
  const { image } = useWorkImage()
  const [mode, setMode] = React.useState<Mode>(settings.compressMode)
  const [quality, setQuality] = React.useState(settings.lastQuality)
  const initialFormat: OutputFormat = image?.mime === "image/png" || image?.mime === "image/webp" ? image.mime : "image/jpeg"
  const [format, setFormat] = React.useState<OutputFormat>(initialFormat)
  React.useEffect(() => {
    setMode(settings.compressMode)
    setQuality(settings.lastQuality)
    setFormat(image?.mime === "image/png" || image?.mime === "image/webp" ? image.mime : "image/jpeg")
  }, [image?.id])
  const effectiveQuality = mode === "manual" ? quality : format === "image/png" ? PNG_EFFORT[mode] : MODE_QUALITY[mode]
  const key = image ? JSON.stringify([image.id, mode, effectiveQuality, format, settings.bgColor]) : null

  const { result, busy, error } = useDebouncedPreview(key, async (signal) => {
    if (!image) throw new Error(t.errors.decodeFailed)
    let source = image.canvas
    if (format === "image/jpeg" && await hasAlphaChannel(source)) {
      source = flattenOnBackground(source, settings.bgColor)
    }
    const blob = await compressCanvas(source, format, effectiveQuality / 100, signal)
    setSettings({ lastQuality: effectiveQuality, compressMode: mode, lastFormat: format })
    return { blob, format, width: source.width, height: source.height }
  })
  const current = result?.key === key ? result : null
  const delta = current && image ? current.blob.size - image.size : 0
  const savedPct = current && image ? ((image.size - current.blob.size) / image.size) * 100 : 0

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.compress.title}</h1>
        <p className="text-muted-foreground">{t.compress.desc}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {current && image ? (
            <CompareSlider beforeSrc={image.objectUrl} afterSrc={current.url} beforeLabel={t.common.before} afterLabel={t.common.after} lang={lang} />
          ) : (
            <ImagePanel>{image && busy && <ProcessingStatus label={t.common.processing} />}</ImagePanel>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t.common.previewError}: {error}</p>}
        </div>

        <div className="tool-panel-stack">
          <Card>
            <CardHeader><CardTitle>{t.compress.mode}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
                {([
                  ["maxQuality", t.compress.maxQuality],
                  ["balanced", t.compress.balanced],
                  ["maxCompress", t.compress.maxCompress],
                  ["sharpText", t.compress.sharpText],
                  ["manual", t.compress.manual],
                ] as [Mode, string][]).map(([value, label]) => (
                  <Label key={value} className="flex items-center gap-3 rounded-lg border p-3 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
                    <RadioGroupItem value={value} />{label}
                  </Label>
                ))}
              </RadioGroup>

              {mode === "manual" && (
                <QualitySlider value={quality} onChange={setQuality} label={format === "image/png" ? t.compress.compressionLevel : t.common.quality} resetValue={80} help={format === "image/png" ? t.help.pngQuality : t.help.quality} resetLabel={t.common.reset} />
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1"><Label>{t.common.selectFormat}</Label><HintButton label={t.common.selectFormat}>{t.help.format}</HintButton></div>
                <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OUTPUT_FORMATS.map((f) => <SelectItem key={f} value={f}>{formatLabel(f)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {format === "image/png" && <p className="text-xs text-muted-foreground">{t.compress.pngNote}</p>}
            </CardContent>
          </Card>

          {current && image && (
            <Card>
              <CardHeader>
                <CardTitle>{t.common.result}</CardTitle>
                <CardDescription className={delta > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
                  {delta > 0 ? `${t.compress.larger}: +${formatBytesLocalized(delta, lang)}` : `${t.common.saving}: ${savedPct.toFixed(1)}%`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatRow items={[
                  { label: t.common.size, value: `${formatBytesLocalized(image.size, lang)} → ${formatBytesLocalized(current.blob.size, lang)}`, accent: delta <= 0 },
                  { label: t.common.format, value: `${formatLabel(image.mime)} → ${formatLabel(current.format)}` },
                  { label: t.common.dimensions, value: `${current.width}×${current.height}` },
                ]} />
                {format === "image/png" && delta > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadBlob(image.file, image.name)}
                  >
                    {t.compress.keepOriginal}
                  </Button>
                )}
                <Button className="w-full" disabled={busy} onClick={() => downloadBlob(current.blob, withSuffix(image.name, "_compressed", extForFormat(current.format)))}>{t.common.download}</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
