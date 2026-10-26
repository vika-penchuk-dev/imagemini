import { useApp } from "@/lib/app-context"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { QualitySlider, HintButton } from "@/components/compare"
import { formatLabel } from "@/lib/image-job"
import type { OutputFormat } from "@/lib/image-core"

export function SettingsPage() {
  const { t, settings, setSettings, resetSettings } = useApp()

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="gap-1 px-4">
          <CardTitle>{t.common.process}</CardTitle>
          <CardDescription>{t.settings.lastQuality}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><QualitySlider
            value={settings.lastQuality}
            onChange={(v) => setSettings({ lastQuality: v })}
            label={t.settings.lastQuality}
            help={settings.lastFormat === "image/png" ? t.help.pngQuality : t.help.quality}
            resetLabel={t.common.reset}
          /></div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">{t.settings.lastFormat}<HintButton label={t.settings.lastFormat}>{t.help.format}</HintButton></Label>
            <Select
              value={settings.lastFormat}
              onValueChange={(v) => setSettings({ lastFormat: v as OutputFormat })}
            >
              <SelectTrigger className="w-full" aria-label={t.settings.lastFormat}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image/jpeg">{formatLabel("image/jpeg")}</SelectItem>
                <SelectItem value="image/png">{formatLabel("image/png")}</SelectItem>
                <SelectItem value="image/webp">{formatLabel("image/webp")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.bgColor}</Label>
            <input
              type="color"
              value={settings.bgColor}
              onChange={(e) => setSettings({ bgColor: e.target.value })}
              className="h-9 w-16 cursor-pointer rounded-md border bg-transparent p-1"
              aria-label={t.settings.bgColor}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.about}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <p className="text-sm text-muted-foreground">{t.settings.aboutText}</p>
          <Button variant="outline" size="sm" onClick={resetSettings}>{t.common.reset}</Button>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
