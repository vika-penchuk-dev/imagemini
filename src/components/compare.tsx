import * as React from "react"
import {
  Check,
  ChevronDown,
  Copy,
  Columns2,
  Download,
  Minus,
  Plus,
  Rows2,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { clampSliderValue } from "@/lib/image-sizing.mjs"
import { SettingHint } from "@/components/setting-hint"

type CompareMode = "slider" | "sideBySide" | "stacked"

interface CompareSliderProps {
  beforeSrc: string
  afterSrc: string
  beforeLabel?: string
  afterLabel?: string
  className?: string
  lang?: "ru" | "en"
}

export function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "До",
  afterLabel = "После",
  className,
  lang = "ru",
}: CompareSliderProps) {
  const [pos, setPos] = React.useState(50)
  const [mode, setMode] = React.useState<CompareMode>("slider")
  const [zoom, setZoom] = React.useState(1)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })
  const defaultModeApplied = React.useRef(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)

  const updateFromEvent = React.useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const p = ((clientX - rect.left) / rect.width) * 100
    setPos(Math.min(100, Math.max(0, p)))
  }, [])

  React.useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current) updateFromEvent(e.clientX)
    }
    const up = () => {
      dragging.current = false
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [updateFromEvent])

  React.useEffect(() => {
    defaultModeApplied.current = false
  }, [beforeSrc])

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label={lang === "ru" ? "Режим сравнения" : "Comparison mode"}>
          {([
            ["slider", SlidersHorizontal, lang === "ru" ? "Разделитель" : "Slider"],
            ["sideBySide", Columns2, lang === "ru" ? "Рядом" : "Side by side"],
            ["stacked", Rows2, lang === "ru" ? "Друг под другом" : "Stacked"],
          ] as const).map(([value, Icon, label]) => (
            <Button
              key={value}
              type="button"
              size="icon-sm"
              variant={mode === value ? "secondary" : "ghost"}
              aria-label={label}
              aria-pressed={mode === value}
              title={label}
              onClick={() => setMode(value)}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={lang === "ru" ? "Уменьшить" : "Zoom out"} disabled={zoom <= 1} onClick={() => setZoom((v) => Math.max(1, +(v - 0.25).toFixed(2)))}>
            <Minus className="size-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={lang === "ru" ? "Увеличить" : "Zoom in"} disabled={zoom >= 3} onClick={() => setZoom((v) => Math.min(3, +(v + 0.25).toFixed(2)))}>
            <Plus className="size-4" />
          </Button>
          {zoom > 1 && <Button type="button" size="icon-sm" variant="ghost" aria-label={lang === "ru" ? "Сбросить увеличение" : "Reset zoom"} onClick={() => setZoom(1)}><RotateCcw className="size-4" /></Button>}
        </div>
      </div>

      <div className="block w-full max-w-full rounded-lg border">
        {mode === "slider" ? (
          <div
            ref={containerRef}
            className="relative inline-block max-w-full select-none overflow-hidden bg-checkerboard align-top"
            style={{ zoom }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              dragging.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              updateFromEvent(e.clientX)
            }}
            onPointerMove={(e) => { if (dragging.current) updateFromEvent(e.clientX) }}
            onPointerUp={() => { dragging.current = false }}
            onPointerCancel={() => { dragging.current = false }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setPos((v) => Math.max(0, v - 2)) }
              if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setPos((v) => Math.min(100, v + 2)) }
              if (e.key === "Home") setPos(0)
              if (e.key === "End") setPos(100)
            }}
            role="slider"
            tabIndex={0}
            aria-label={lang === "ru" ? "Разделитель До и После" : "Before and After divider"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
          >
            <img
              src={beforeSrc}
              alt={beforeLabel}
              className="block max-h-[60vh] w-auto max-w-full"
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: width, naturalHeight: height } = e.currentTarget
                setDimensions({ width, height })
                if (!defaultModeApplied.current) {
                  setMode(height > width ? "sideBySide" : "stacked")
                  defaultModeApplied.current = true
                }
              }}
            />
            <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
              <img src={afterSrc} alt={afterLabel} className="absolute inset-0 size-full object-contain" draggable={false} />
            </div>
            <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${pos}%` }}>
              <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md">
                <ChevronDown className="size-4 rotate-90 text-foreground" />
              </div>
            </div>
            <CompareLabels beforeLabel={beforeLabel} afterLabel={afterLabel} />
          </div>
        ) : (
          <div className={cn("grid gap-3 bg-background p-3", mode === "sideBySide" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")} style={{ zoom }}>
            {[ [beforeSrc, beforeLabel], [afterSrc, afterLabel] ].map(([src, label]) => (
              <figure key={src} className="relative m-0 flex min-w-0 items-center justify-center rounded-md bg-checkerboard" style={{ aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : undefined, width: dimensions.width ? `min(100%, ${60 * dimensions.width / dimensions.height}vh)` : undefined }}>
                <img src={src} alt={label} className="size-full object-contain" draggable={false} onLoad={(e) => { if (label === beforeLabel) setDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }) }} />
                <figcaption className={cn("absolute bottom-2 rounded-md px-2 py-1 text-xs font-medium backdrop-blur", label === beforeLabel ? "left-2 bg-background/80" : "right-2 bg-primary/90 text-primary-foreground")}>{label}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
      <span className="sr-only">{dimensions.width > 0 ? `${dimensions.width}×${dimensions.height}` : ""}</span>
    </section>
  )
}

function CompareLabels({ beforeLabel, afterLabel }: { beforeLabel: string; afterLabel: string }) {
  return <>
    <div className="absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur">{beforeLabel}</div>
    <div className="absolute right-2 bottom-2 rounded-md bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground backdrop-blur">{afterLabel}</div>
  </>
}

export function HintButton({ children, label }: { children: React.ReactNode; label: string }) {
  return <SettingHint label={label}>{children}</SettingHint>
}

export function StatRow({
  items,
}: {
  items: { label: string; value: string; accent?: boolean }[]
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd
            className={cn(
              "font-medium tabular-nums",
              it.accent && "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ParameterSlider({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  resetValue,
  help,
  disabled,
  resetLabel = "Reset",
}: {
  value: number
  onChange: (v: number) => void
  label: string
  min: number
  max: number
  step?: number
  resetValue: number
  help?: string
  disabled?: boolean
  resetLabel?: string
}) {
  const [draft, setDraft] = React.useState(String(value))
  const inputFocused = React.useRef(false)
  React.useEffect(() => {
    if (!inputFocused.current) setDraft(String(value))
  }, [value])

  const commit = (raw: string) => {
    const parsed = Number(raw)
    if (!raw.trim() || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = clampSliderValue(parsed, min, max, step)
    setDraft(String(next))
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1"><span className="text-sm font-medium">{label}</span>{help && <HintButton label={label}>{help}</HintButton>}</div>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            aria-label={`${label} value`}
            min={min}
            max={max}
            step={step}
            value={draft}
            disabled={disabled}
            className="h-8 w-20 text-right tabular-nums"
            onFocus={() => { inputFocused.current = true }}
            onChange={(event) => {
              const raw = event.target.value
              setDraft(raw)
              if (raw.trim() && Number.isFinite(Number(raw))) {
                onChange(clampSliderValue(Number(raw), min, max, step))
              }
            }}
            onBlur={(event) => { inputFocused.current = false; commit(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          <Button type="button" variant="ghost" size="icon-sm" className="size-6" aria-label={`${label}: ${resetLabel}`} title={`${label}: ${resetLabel}`} onClick={() => onChange(resetValue)} disabled={disabled}><RotateCcw className="size-3.5" /></Button>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  )
}

export function QualitySlider({
  value,
  onChange,
  label,
  resetValue = 80,
  help,
  resetLabel,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  resetValue?: number
  help?: string
  resetLabel?: string
}) {
  return <ParameterSlider value={value} onChange={onChange} label={label} min={1} max={100} resetValue={resetValue} help={help} resetLabel={resetLabel} />
}

export function ResultActions({
  onDownload,
  onDownloadAll,
  onCopy,
  allLabel,
}: {
  onDownload: () => void
  onDownloadAll?: () => void
  onCopy?: () => void
  allLabel?: string
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onDownload}>
        <Download className="size-4" />
        {allLabel ?? "Скачать"}
      </Button>
      {onDownloadAll && (
        <Button variant="outline" onClick={onDownloadAll}>
          <Download className="size-4" />
          ZIP
        </Button>
      )}
      {onCopy && (
        <Button
          variant="outline"
          onClick={() => {
            onCopy()
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied ? "OK" : "Копировать"}
        </Button>
      )}
    </div>
  )
}

export function EmptyCanvasState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <Upload className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Добавьте изображение, чтобы начать
      </p>
    </div>
  )
}
