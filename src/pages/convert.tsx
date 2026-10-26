import * as React from "react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel, ProcessingStatus } from "@/components/work-image"
import {
  compressCanvas,
  extForFormat,
  flattenOnBackground,
  hasAlphaChannel,
  type OutputFormat,
  OUTPUT_FORMATS,
} from "@/lib/image-core"
import { downloadBlob, formatLabel, withSuffix } from "@/lib/image-job"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CompareSlider, StatRow } from "@/components/compare"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { formatBytesLocalized } from "@/lib/image-core"
import { useDebouncedPreview } from "@/hooks/use-preview"
import { HintButton } from "@/components/compare"

export function ConvertPage() {
  const { t, lang, settings, setSettings } = useApp()
  const { image } = useWorkImage()
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)
  const [bgChoice, setBgChoice] = React.useState<"white" | "black" | "custom">("white")
  const [customColor, setCustomColor] = React.useState(settings.bgColor)
  React.useEffect(() => {
    setFormat(settings.lastFormat)
    setBgChoice("white")
    setCustomColor(settings.bgColor)
  }, [image?.id])
  const key = image ? JSON.stringify([image.id, format, bgChoice, customColor, settings.lastQuality]) : null
  const { result, busy, error } = useDebouncedPreview(key, async (signal) => {
    if (!image) throw new Error(t.errors.decodeFailed)
    let source = image.canvas
    if (format === "image/jpeg" && await hasAlphaChannel(source)) {
      const color = bgChoice === "white" ? "#ffffff" : bgChoice === "black" ? "#000000" : customColor
      source = flattenOnBackground(source, color)
    }
    const blob = await compressCanvas(source, format, settings.lastQuality / 100, signal)
    setSettings({ lastFormat: format, bgColor: customColor })
    return { blob, format, width: source.width, height: source.height }
  })
  const current = result?.key === key ? result : null
  const delta = current && image ? current.blob.size - image.size : 0

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.convert.title}</h1>
        <p className="text-muted-foreground">{t.convert.desc}</p>
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
              <CardTitle className="flex items-center gap-1">{t.convert.targetFormat}<HintButton label={t.convert.targetFormat}>{t.help.format}</HintButton></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={format}
                onValueChange={(v) => setFormat(v as OutputFormat)}
              >
                {OUTPUT_FORMATS.map((f) => (
                  <Label
                    key={f}
                    className="flex items-center gap-3 rounded-lg border p-3 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={f} />
                    {formatLabel(f)}
                  </Label>
                ))}
              </RadioGroup>

              {format === "image/jpeg" && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">{t.convert.bgColor}</span>
                  <RadioGroup
                    value={bgChoice}
                    onValueChange={(v) => setBgChoice(v as typeof bgChoice)}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {(
                        [
                          ["white", t.convert.white],
                          ["black", t.convert.black],
                          ["custom", t.convert.custom],
                        ] as [typeof bgChoice, string][]
                      ).map(([value, label]) => (
                        <Label key={value} className="flex items-center gap-2 font-normal">
                          <RadioGroupItem value={value} />
                          {label}
                        </Label>
                      ))}
                      {bgChoice === "custom" && (
                        <Input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          className="h-9 w-16 p-1"
                        />
                      )}
                    </div>
                  </RadioGroup>
                </div>
              )}

            </CardContent>
          </Card>

          {current && image && (
            <Card>
              <CardHeader>
                <CardTitle>{t.common.result}</CardTitle>
                <CardDescription>
                  {delta <= 0
                    ? `−${formatBytesLocalized(-delta, lang)}`
                    : `+${formatBytesLocalized(delta, lang)} (${t.common.notLarger})`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatRow
                  items={[
                    {
                      label: t.common.size,
                      value: `${formatBytesLocalized(image.size, lang)} → ${formatBytesLocalized(current.blob.size, lang)}`,
                      accent: delta <= 0,
                    },
                    {
                      label: t.common.format,
                      value: `${formatLabel(image.mime)} → ${formatLabel(format)}`,
                    },
                    {
                      label: t.common.dimensions,
                      value: `${current.width}×${current.height}`,
                    },
                  ]}
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadBlob(current.blob, withSuffix(image.name, "_converted", extForFormat(current.format)))
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
