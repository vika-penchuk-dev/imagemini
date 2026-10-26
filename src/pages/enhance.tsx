import * as React from "react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel, ProcessingStatus } from "@/components/work-image"
import {
  canvasToBlob,
  drawToCanvas,
  DEFAULT_ENHANCE,
  ENHANCE_PRESETS,
  OUTPUT_FORMATS,
  type OutputFormat,
  extForFormat,
  flattenOnBackground,
  formatBytesLocalized,
  type EnhanceSettings,
} from "@/lib/image-core"
import { downloadBlob, formatLabel, withSuffix } from "@/lib/image-job"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CompareSlider, ParameterSlider } from "@/components/compare"
import { useDebouncedPreview } from "@/hooks/use-preview"
import { processCanvasInWorker } from "@/lib/image-processing"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SettingHint } from "@/components/setting-hint"

const PRESET_LABEL_KEYS: Record<string, keyof ReturnType<typeof useApp>["t"]["enhance"]> = {
  photo: "presetPhoto",
  screenshot: "presetScreenshot",
  document: "presetDocument",
  text: "presetText",
  soft: "presetSoft",
  crisp: "presetCrisp",
  auto: "presetAuto",
}
const PRESET_HELP_KEYS: Record<string, keyof ReturnType<typeof useApp>["t"]["enhance"]> = {
  photo: "presetPhotoHelp", screenshot: "presetScreenshotHelp", document: "presetDocumentHelp",
  text: "presetTextHelp", soft: "presetSoftHelp", crisp: "presetCrispHelp", auto: "presetAutoHelp",
}

export function EnhancePage() {
  const { t, lang } = useApp()
  const { image } = useWorkImage()
  const [current, setCurrent] = React.useState<EnhanceSettings>({ ...DEFAULT_ENHANCE })
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null)
  const [format, setFormat] = React.useState<OutputFormat>("image/png")
  const [exporting, setExporting] = React.useState(false)
  const [exportSize, setExportSize] = React.useState<{ key: string; bytes: number } | null>(null)
  const [exportError, setExportError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setCurrent({ ...DEFAULT_ENHANCE })
    setSelectedPreset(null)
    setFormat("image/png")
  }, [image?.id])

  const applyPreset = (id: string) => {
    const preset = ENHANCE_PRESETS.find((p) => p.id === id)
    if (selectedPreset === id) {
      setCurrent({ ...DEFAULT_ENHANCE })
      setSelectedPreset(null)
    } else if (preset) {
      setCurrent({ ...DEFAULT_ENHANCE, ...preset.settings })
      setSelectedPreset(id)
    }
  }

  const key = image ? JSON.stringify([image.id, current, format]) : null
  const currentKeyRef = React.useRef(key)
  currentKeyRef.current = key
  React.useEffect(() => {
    setExportSize(null)
    setExportError(null)
  }, [key])
  const { result, busy, error } = useDebouncedPreview(key, async (signal) => {
    if (!image) throw new Error(t.errors.decodeFailed)
    const previewScale = Math.min(1, 1200 / Math.max(image.width, image.height))
    const previewSource = previewScale < 1
      ? drawToCanvas(image.canvas, Math.max(1, Math.round(image.width * previewScale)), Math.max(1, Math.round(image.height * previewScale)))
      : image.canvas
    const enhanced = await processCanvasInWorker(previewSource, { kind: "enhance", settings: current }, signal)
    const output = format === "image/jpeg" ? flattenOnBackground(enhanced, "#ffffff") : enhanced
    return { blob: await canvasToBlob(output, format, 1), format }
  })
  const preview = result?.key === key ? result : null

  const prepareDownload = async () => {
    if (!image || !key || exporting) return
    const requestedKey = key
    setExporting(true)
    setExportError(null)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    try {
      const canvas = await processCanvasInWorker(image.canvas, { kind: "enhance", settings: current })
      const output = format === "image/jpeg" ? flattenOnBackground(canvas, "#ffffff") : canvas
      const blob = await canvasToBlob(output, format, 1)
      const decoded = await createImageBitmap(blob)
      const valid = decoded.width === image.width && decoded.height === image.height
      decoded.close()
      if (currentKeyRef.current !== requestedKey) return
      if (!valid) throw new Error(t.errors.exportDimensionsMismatch)
      downloadBlob(blob, withSuffix(image.name, "_enhanced", extForFormat(format)))
      setExportSize({ key: requestedKey, bytes: blob.size })
    } catch (err) {
      if (currentKeyRef.current === requestedKey) {
        setExportError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setExporting(false)
    }
  }

  const sliders: { key: keyof EnhanceSettings; label: string; min: number; max: number; step?: number; help: string }[] = [
    { key: "sharpen", label: t.enhance.sharpen, min: 0, max: 100, help: t.help.sharpen },
    { key: "denoise", label: t.enhance.denoise, min: 0, max: 100, help: t.help.denoise },
    { key: "brightness", label: t.enhance.brightness, min: -100, max: 100, help: t.help.brightness },
    { key: "contrast", label: t.enhance.contrast, min: -100, max: 100, help: t.help.contrast },
    { key: "saturation", label: t.enhance.saturation, min: -100, max: 100, help: t.help.saturation },
    { key: "gamma", label: t.enhance.gamma, min: 0.2, max: 3, step: 0.05, help: t.help.gamma },
  ]

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.enhance.title}</h1>
        <p className="text-muted-foreground">{t.enhance.desc}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {preview && image ? (
            <CompareSlider
              beforeSrc={image.objectUrl}
              afterSrc={preview.url}
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
              <CardTitle className="flex items-center gap-1">{t.enhance.presets}<SettingHint label={t.enhance.presets}>{ENHANCE_PRESETS.map((p) => <span key={p.id} className="block"><strong>{t.enhance[PRESET_LABEL_KEYS[p.id]]}:</strong> {t.enhance[PRESET_HELP_KEYS[p.id]]}</span>)}</SettingHint></CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {ENHANCE_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  variant={selectedPreset === p.id ? "default" : "outline"}
                  size="sm"
                  aria-pressed={selectedPreset === p.id}
                  onClick={() => applyPreset(p.id)}
                >
                  {t.enhance[PRESET_LABEL_KEYS[p.id]]}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.enhance.strength}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sliders.map((s) => (
                <ParameterSlider key={s.key} value={current[s.key]} onChange={(value) => { setSelectedPreset(null); setCurrent((prev) => ({ ...prev, [s.key]: value })) }} label={s.label} min={s.min} max={s.max} step={s.step} resetValue={DEFAULT_ENHANCE[s.key]} help={s.help} resetLabel={t.common.reset} />
              ))}

              <div className="space-y-1.5">
                <Label>{t.common.selectFormat}</Label>
                <Select value={format} onValueChange={(value) => setFormat(value as OutputFormat)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{OUTPUT_FORMATS.map((value) => <SelectItem key={value} value={value}>{formatLabel(value)}</SelectItem>)}</SelectContent>
                </Select>
                {format === "image/jpeg" && <p className="text-xs text-muted-foreground">{t.enhance.jpegNote}</p>}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setCurrent({ ...DEFAULT_ENHANCE }); setSelectedPreset(null) }}
                >
                  {t.common.reset}
                </Button>
              </div>
            </CardContent>
          </Card>

          {image && (
            <Card>
              <CardContent className="pt-0">
                <Button
                  className="w-full"
                  onClick={() => void prepareDownload()}
                  disabled={busy || exporting}
                >
                  {exporting ? t.common.preparingFile : `${t.common.download} ${formatLabel(format)}`}
                </Button>
                {exporting && <p role="status" className="mt-2 text-center text-xs text-muted-foreground">{t.common.preparingFile}</p>}
                {exportSize?.key === key && <p className="mt-2 text-center text-xs text-muted-foreground">{t.common.size}: {formatBytesLocalized(exportSize.bytes, lang)}</p>}
                {exportError && <p role="alert" className="mt-2 text-sm text-destructive">{exportError}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
