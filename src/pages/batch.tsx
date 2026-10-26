import * as React from "react"
import { CheckCircle2, XCircle, Clock, Trash2, Square, Download } from "lucide-react"
import { useApp } from "@/lib/app-context"
import {
  compressCanvas,
  computeTargetSize,
  decodeToBitmap,
  decodeSvgToBitmap,
  drawToCanvas,
  extForFormat,
  flattenOnBackground,
  formatBytesLocalized,
  hasAlphaChannel,
  steppedDrawToCanvas,
  type OutputFormat,
  type ResizeOptions,
} from "@/lib/image-core"
import { isImageFile, withSuffix, downloadBlob } from "@/lib/image-job"
import { zipSync } from "fflate"
import { DropZone } from "@/components/drop-zone"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { QualitySlider, HintButton } from "@/components/compare"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { uniqueArchiveName } from "@/lib/archive-names.mjs"

type BatchOp = "compress" | "convert" | "resize"

interface BatchItem {
  id: string
  file: File
  status: "pending" | "working" | "done" | "error"
  resultSize?: number
  resultName?: string
  resultBlob?: Blob
  thumbnailUrl: string
  error?: string
}

export function BatchPage() {
  const { t, lang, settings, setSettings } = useApp()
  const [items, setItems] = React.useState<BatchItem[]>([])
  const [op, setOp] = React.useState<BatchOp>("compress")
  const [quality, setQuality] = React.useState(settings.lastQuality)
  const [format, setFormat] = React.useState<OutputFormat>(settings.lastFormat)
  const [resizeMode, setResizeMode] = React.useState<ResizeOptions["mode"]>("longSide")
  const [longSide, setLongSide] = React.useState("1920")
  const [running, setRunning] = React.useState(false)
  const cancelRef = React.useRef(false)
  const resultsRef = React.useRef<{ id: string; name: string; blob: Blob }[]>([])
  const thumbnailUrls = React.useRef(new Set<string>())

  React.useEffect(() => () => {
    for (const url of thumbnailUrls.current) URL.revokeObjectURL(url)
  }, [])

  const addFiles = (files: File[]) => {
    setItems((prev) => [
      ...prev,
      ...files
        .filter(isImageFile)
        .map((f) => {
          const thumbnailUrl = URL.createObjectURL(f)
          thumbnailUrls.current.add(thumbnailUrl)
          return { id: `${f.name}-${f.size}-${Math.random()}`, file: f, status: "pending" as const, thumbnailUrl }
        }),
    ])
  }

  const removeItem = (id: string) => {
    if (running) return
    resultsRef.current = resultsRef.current.filter((result) => result.id !== id)
    setItems((prev) => {
      const removed = prev.find((i) => i.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.thumbnailUrl)
        thumbnailUrls.current.delete(removed.thumbnailUrl)
      }
      return prev.filter((i) => i.id !== id)
    })
  }

  const clearAll = () => {
    if (running) return
    for (const item of items) {
      URL.revokeObjectURL(item.thumbnailUrl)
      thumbnailUrls.current.delete(item.thumbnailUrl)
    }
    setItems([])
    resultsRef.current = []
    resultsRef.current = []
  }

  const processOne = async (item: BatchItem): Promise<{ name: string; blob: Blob }> => {
    const file = item.file
    let loaded
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      loaded = await decodeSvgToBitmap(file)
    } else {
      loaded = await decodeToBitmap(file)
    }
    const sourceCanvas = drawToCanvas(loaded.bitmap, loaded.width, loaded.height)
    if ("close" in loaded.bitmap && typeof loaded.bitmap.close === "function") {
      loaded.bitmap.close()
    }

    let outFormat: OutputFormat
    let outCanvas = sourceCanvas

    if (op === "compress") {
      const srcMime = file.type
      outFormat =
        srcMime === "image/png" ? "image/png" : srcMime === "image/webp" ? "image/webp" : "image/jpeg"
    } else {
      outFormat = format
    }

    if (op === "resize") {
      const target = computeTargetSize(loaded.width, loaded.height, {
        mode: resizeMode,
        longSide: parseInt(longSide) || 1920,
        keepAspect: true,
        dontEnlarge: settings.dontEnlarge,
      })
      outCanvas =
        target.w < loaded.width
          ? steppedDrawToCanvas(sourceCanvas, loaded.width, loaded.height, target.w, target.h)
          : drawToCanvas(sourceCanvas, target.w, target.h)
    }

    if (outFormat === "image/jpeg" && (await hasAlphaChannel(outCanvas))) {
      outCanvas = flattenOnBackground(outCanvas, settings.bgColor)
    }

    const blob = await compressCanvas(outCanvas, outFormat, quality / 100)
    const suffix = op === "compress" ? "_compressed" : op === "resize" ? "_resized" : "_converted"
    return {
      name: withSuffix(file.name, suffix, extForFormat(outFormat)),
      blob,
    }
  }

  const run = async () => {
    if (!items.length) return
    cancelRef.current = false
    setRunning(true)
    resultsRef.current = []
    setItems((prev) => prev.map((i) => ({ ...i, status: "pending", error: undefined })))

    const queue = [...items]
    const CONCURRENCY = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1))

    let index = 0
    const worker = async () => {
      while (!cancelRef.current) {
        const current = index
        index += 1
        if (current >= queue.length) return
        const item = queue[current]
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "working" } : i))
        )
        try {
          const res = await processOne(item)
          resultsRef.current.push({ id: item.id, ...res })
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "done", resultSize: res.blob.size, resultName: res.name, resultBlob: res.blob }
                : i
            )
          )
        } catch (err) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "error",
                    error: err instanceof Error ? err.message : "Error",
                  }
                : i
            )
          )
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    setRunning(false)
  }

  const downloadZip = async () => {
    if (!resultsRef.current.length) return
    const files: Record<string, [Uint8Array, { level: 0 }]> = {}
    const used = new Set<string>()
    for (const r of resultsRef.current) {
      const name = uniqueArchiveName(r.name, used)
      const buf = new Uint8Array(await r.blob.arrayBuffer())
      files[name] = [buf, { level: 0 }]
    }
    const zipped = zipSync(files, { level: 0 })
    downloadBlob(new Blob([zipped as unknown as BlobPart]), "imagemini-batch.zip")
  }

  const total = items.length
  const done = items.filter((i) => i.status === "done").length
  const failed = items.filter((i) => i.status === "error").length
  const processed = done + failed
  const sourceTotal = items.reduce((sum, item) => sum + item.file.size, 0)
  const resultTotal = items.reduce((sum, item) => sum + (item.resultSize ?? 0), 0)

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.batch.title}</h1>
        <p className="text-muted-foreground">{t.batch.desc}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <DropZone onFiles={addFiles} label={t.batch.addImages} compact />

          {items.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>
                  {t.batch.processed}: {processed} {t.common.of} {total}
                </CardTitle>
                <div className="flex gap-2">
                  {running ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        cancelRef.current = true
                      }}
                    >
                      <Square className="size-3.5" />
                      {t.batch.stop}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={clearAll}>
                      <Trash2 className="size-3.5" />
                      {t.common.clear}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={(processed / Math.max(1, total)) * 100} />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    {t.batch.success}: {done}
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="size-3.5 text-destructive" />
                    {t.batch.failed}: {failed}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {t.batch.pending}: {total - done - failed}
                  </span>
                  {total > 0 && processed === total && (
                    <span>{t.batch.totalSize}: {formatBytesLocalized(sourceTotal, lang)} → {formatBytesLocalized(resultTotal, lang)}</span>
                  )}
                </div>
                <div className="max-h-[50vh] space-y-1.5 overflow-auto">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      {item.status === "done" && (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                      )}
                      {item.status === "error" && (
                        <XCircle className="size-4 shrink-0 text-destructive" />
                      )}
                      {item.status === "working" && (
                        <Clock className="size-4 shrink-0 animate-pulse text-primary" />
                      )}
                      {item.status === "pending" && (
                        <Clock className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <img src={item.thumbnailUrl} alt="" className="size-10 shrink-0 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{item.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.status === "pending" ? t.batch.waiting : item.status === "working" ? t.batch.working : item.status === "done" ? t.batch.completed : t.batch.failed}
                        </p>
                        {item.status === "done" && item.resultSize !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            {formatBytesLocalized(item.file.size, lang)} → {formatBytesLocalized(item.resultSize, lang)} ·{" "}
                            {item.resultName}
                          </p>
                        )}
                        {item.error && (
                          <p className="text-xs text-destructive">{item.error}</p>
                        )}
                      </div>
                      {!running && (
                        <div className="flex shrink-0 items-center gap-1">
                          {item.status === "done" && item.resultBlob && item.resultName && (
                            <Button variant="outline" size="icon-xs" aria-label={`${t.common.download}: ${item.resultName}`} onClick={() => downloadBlob(item.resultBlob!, item.resultName!)}>
                              <Download className="size-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-xs" aria-label={t.common.remove} onClick={() => removeItem(item.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="tool-panel-stack">
          <Card>
            <CardHeader>
              <CardTitle>{t.batch.operation}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={op}
                onValueChange={(v) => setOp(v as BatchOp)}
              >
                {(
                  [
                    ["compress", t.nav.compress],
                    ["convert", t.nav.convert],
                    ["resize", t.nav.resize],
                  ] as [BatchOp, string][]
                ).map(([value, label]) => (
                  <Label
                    key={value}
                    className="flex items-center gap-3 rounded-lg border p-3 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={value} />
                    {label}
                  </Label>
                ))}
              </RadioGroup>

              {op === "convert" && (
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
                  <p className="text-xs text-muted-foreground">{t.batch.outputFormatNote}: {format === "image/jpeg" ? "JPEG (.jpg)" : format === "image/png" ? "PNG (.png)" : "WebP (.webp)"}</p>
                </div>
              )}

              {op === "resize" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t.resize.mode}</Label>
                    <Select
                      value={resizeMode}
                      onValueChange={(v) => setResizeMode(v as ResizeOptions["mode"])}
                    >
                      <SelectTrigger className="w-full" aria-label={t.resize.mode}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="longSide">{t.resize.longSide}</SelectItem>
                        <SelectItem value="percent">{t.resize.percent}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {resizeMode === "longSide" && (
                    <Label className="flex items-center gap-2 font-normal">
                      px
                      <input
                        type="number"
                        min={16}
                        value={longSide}
                        onChange={(e) => setLongSide(e.target.value)}
                        className="h-8 w-24 rounded-md border bg-transparent px-2 text-sm"
                      />
                    </Label>
                  )}
                  <Label className="flex items-center gap-2 font-normal">
                    <Checkbox
                      checked={settings.dontEnlarge}
                      onCheckedChange={(v) => setSettings({ dontEnlarge: v === true })}
                    />
                    {t.resize.dontEnlarge}
                  </Label>
                </div>
              )}

              <QualitySlider value={quality} onChange={setQuality} label={t.common.quality} help={t.help.batchQuality} resetLabel={t.common.reset} />

              <Button className="w-full" onClick={() => void run()} disabled={!items.length || running}>
                {running ? t.common.processing : t.batch.start}
              </Button>

              {done > 0 && !running && (
                <Button variant="outline" className="w-full" onClick={() => void downloadZip()}>
                  {t.common.downloadAll}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
