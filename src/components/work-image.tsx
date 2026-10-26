import * as React from "react"
import { Loader2 } from "lucide-react"
import {
  decodeToBitmap,
  decodeSvgToBitmap,
  drawToCanvas,
  fitsCanvas,
  suggestScaleDown,
} from "@/lib/image-core"
import { nextId, formatLabel } from "@/lib/image-job"
import { DropZone } from "@/components/drop-zone"
import { useApp } from "@/lib/app-context"

export interface WorkImage {
  id: string
  file: File
  name: string
  size: number
  mime: string
  width: number
  height: number
  canvas: HTMLCanvasElement
  objectUrl: string
  scaledNote?: number // scale factor applied due to canvas limits
}

interface WorkImageContextValue {
  image: WorkImage | null
  setImageFromFile: (file: File) => Promise<void>
  clear: () => void
  updateCanvas: (canvas: HTMLCanvasElement) => void
  busy: boolean
  error: string | null
  setError: (e: string | null) => void
}

const WorkImageContext = React.createContext<WorkImageContextValue | undefined>(
  undefined
)

export function WorkImageProvider({ children }: { children: React.ReactNode }) {
  const [image, setImage] = React.useState<WorkImage | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const setImageFromFile = React.useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      let loaded
      if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
        loaded = await decodeSvgToBitmap(file)
      } else {
        loaded = await decodeToBitmap(file)
      }
      let w = loaded.width
      let h = loaded.height
      let scaledNote: number | undefined
      if (!fitsCanvas(w, h)) {
        const s = suggestScaleDown(w, h)
        scaledNote = s
        w = Math.max(1, Math.round(w * s))
        h = Math.max(1, Math.round(h * s))
      }
      const canvas = drawToCanvas(loaded.bitmap, w, h)
      if ("close" in loaded.bitmap && typeof loaded.bitmap.close === "function") {
        loaded.bitmap.close()
      }
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.objectUrl)
        return {
          id: nextId(),
          file,
          name: file.name,
          size: file.size,
          mime: file.type || "image/*",
          width: w,
          height: h,
          canvas,
          objectUrl: URL.createObjectURL(file),
          scaledNote,
        }
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось открыть файл / Could not open file"
      )
    } finally {
      setBusy(false)
    }
  }, [])

  const clear = React.useCallback(() => {
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl)
      return null
    })
    setError(null)
  }, [])

  const updateCanvas = React.useCallback((canvas: HTMLCanvasElement) => {
    setImage((prev) =>
      prev
        ? { ...prev, canvas, width: canvas.width, height: canvas.height }
        : prev
    )
  }, [])

  return (
    <WorkImageContext.Provider
      value={{ image, setImageFromFile, clear, updateCanvas, busy, error, setError }}
    >
      {children}
    </WorkImageContext.Provider>
  )
}

export function useWorkImage(): WorkImageContextValue {
  const ctx = React.useContext(WorkImageContext)
  if (!ctx) throw new Error("useWorkImage must be used within WorkImageProvider")
  return ctx
}

export function ProcessingStatus({ label }: { label: string }) {
  return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{label}</p>
}

export function ImagePanel({ children }: { children?: React.ReactNode }) {
  const { t } = useApp()
  const { image, setImageFromFile, busy, error } =
    useWorkImage()

  if (!image) {
    return (
      <div className="space-y-3">
        <DropZone
          onFiles={(files) => {
            void setImageFromFile(files[0])
          }}
          multiple={false}
        />
        {busy && <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t.common.loading}</p>}
        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {children}
      <div className="rounded-xl border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{image.name}</p>
            <p className="text-xs text-muted-foreground">
              {image.width}×{image.height} · {formatLabel(image.mime)} ·{" "}
              {(image.size / 1024).toFixed(0)} КБ
            </p>
          </div>
        </div>
        <div className="overflow-auto rounded-lg bg-checkerboard">
          <img
            src={image.objectUrl}
            alt={image.name}
            className="mx-auto block max-h-[50vh] w-auto max-w-full"
          />
        </div>
        {image.scaledNote && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Изображение уменьшено в {Math.round(1 / image.scaledNote)}× из-за
            ограничений браузера (лимит холста).
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
