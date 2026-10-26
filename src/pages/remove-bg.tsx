import * as React from "react"
import { Download, Loader2, RotateCcw, Trash2 } from "lucide-react"
import { useApp } from "@/lib/app-context"
import { useWorkImage, ImagePanel } from "@/components/work-image"
import { Button } from "@/components/ui/button"
import { CompareSlider } from "@/components/compare"
import { downloadBlob, withSuffix } from "@/lib/image-job"

type BgWorkerResponse =
  | { type: "status"; status: "loading" | "downloading" | "ready" | "processing"; stage?: "preparing" | "segmenting" | "finishing"; loaded?: number; total?: number; provider?: string }
  | { type: "result"; pixels: ArrayBuffer; width: number; height: number; provider: string }
  | { type: "error"; code: "load" | "process"; debug?: string }

type ModelStatus = "loading" | "downloading" | "ready" | "error"
const PROCESS_TIMEOUT_MS = 120_000

export function RemoveBgPage() {
  const { t } = useApp()
  const { image, clear, error: imageError } = useWorkImage()
  const workerRef = React.useRef<Worker | null>(null)
  const busyRef = React.useRef(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = React.useState<ModelStatus>("loading")
  const [errorKind, setErrorKind] = React.useState<"load" | "process" | "timeout">("load")
  const [progress, setProgress] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [processingStage, setProcessingStage] = React.useState<"preparing" | "segmenting" | "finishing">("preparing")
  const [resultUrl, setResultUrl] = React.useState<string | null>(null)
  const [resultBlob, setResultBlob] = React.useState<Blob | null>(null)

  const createWorker = React.useCallback(() => {
    const worker = new Worker(new URL("../lib/bg-removal.worker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<BgWorkerResponse>) => {
      const message = event.data
      if (message.type === "status") {
        if (message.status !== "processing") setStatus(message.status)
        if (message.status === "processing" && message.stage) setProcessingStage(message.stage)
        if (message.status === "downloading" && message.total) {
          setProgress(Math.min(100, Math.round(message.loaded! / message.total * 100)))
        }
      } else if (message.type === "error") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = null
        if (import.meta.env.DEV) console.error(message.debug)
        setErrorKind(message.code)
        setStatus("error")
        busyRef.current = false
        setBusy(false)
      } else if (message.type === "result") {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = message.width
          canvas.height = message.height
          canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(message.pixels), message.width, message.height), 0, 0)
          canvas.toBlob((blob) => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = null
            if (!blob) {
              setErrorKind("process")
              setStatus("error")
              busyRef.current = false
              setBusy(false)
              return
            }
            setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob) })
            setResultBlob(blob)
            busyRef.current = false
            setBusy(false)
          }, "image/png")
        } catch {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = null
          setErrorKind("process")
          setStatus("error")
          busyRef.current = false
          setBusy(false)
        }
      }
    }
    const failWorker = () => {
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      setErrorKind(busyRef.current ? "process" : "load")
      setStatus("error")
      busyRef.current = false
      setBusy(false)
    }
    worker.onerror = failWorker
    worker.onmessageerror = failWorker
    return worker
  }, [])

  React.useEffect(() => {
    const worker = createWorker()
    worker.postMessage({ type: "load" })
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      worker.terminate()
      workerRef.current = null
      setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return null })
    }
  }, [createWorker])

  const process = async () => {
    if (!image || !workerRef.current || status !== "ready" || busy) return
    busyRef.current = true
    setBusy(true)
    setProcessingStage("preparing")
    setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return null })
    setResultBlob(null)
    let timedOut = false
    timeoutRef.current = setTimeout(() => {
      workerRef.current?.terminate()
      workerRef.current = null
      timeoutRef.current = null
      timedOut = true
      setErrorKind("timeout")
      setStatus("error")
      busyRef.current = false
      setBusy(false)
    }, PROCESS_TIMEOUT_MS)
    try {
      const bitmap = await createImageBitmap(image.canvas)
      if (timedOut) { bitmap.close(); return }
      const worker = workerRef.current
      if (!worker) { bitmap.close(); throw new Error("worker") }
      worker.postMessage({ type: "run", bitmap }, [bitmap])
    } catch {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      busyRef.current = false
      setBusy(false)
      setStatus("error")
      setErrorKind("process")
    }
  }

  const retryLoad = () => {
    setStatus("loading")
    setProgress(0)
    const worker = workerRef.current ?? createWorker()
    worker.postMessage({ type: "load" })
  }

  const clearImage = () => {
    clear()
    setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return null })
    setResultBlob(null)
  }

  const statusText = status === "ready" ? t.removeBg.readyStatus
    : status === "downloading" ? `${t.removeBg.modelDownloading} ${progress}%`
      : status === "error" ? errorKind === "load" ? t.removeBg.modelError : errorKind === "timeout" ? t.removeBg.processingTimeout : t.removeBg.processingError
        : t.removeBg.modelLoading

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.removeBg.title}</h1>
        <p className="text-muted-foreground">{t.removeBg.desc}</p>
      </header>
      <div role="status" className="flex items-center gap-2 rounded-lg border p-3 text-sm">
        {status === "loading" || status === "downloading" || busy ? <Loader2 className="size-4 animate-spin" /> : null}
        <span>{busy ? processingStage === "preparing" ? t.removeBg.preparing : processingStage === "segmenting" ? t.removeBg.segmenting : t.removeBg.finishing : statusText}</span>
        {status === "error" && <Button variant="outline" size="sm" onClick={retryLoad}><RotateCcw className="size-4" />{t.common.tryAgain}</Button>}
      </div>
      {status === "downloading" && <progress className="h-2 w-full" max={100} value={progress} aria-label={t.removeBg.modelDownloading} />}
      {busy && <progress className="h-2 w-full" aria-label={t.removeBg.processing} />}
      <ImagePanel>
        {image && <div className="flex flex-wrap gap-2">
          <Button onClick={() => void process()} disabled={status !== "ready" || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ? t.removeBg.processing : t.common.process}
          </Button>
          {resultBlob && resultUrl && <Button variant="outline" onClick={() => downloadBlob(resultBlob, withSuffix(image.name, "_nobg", "png"))}><Download className="size-4" />{t.removeBg.downloadPng}</Button>}
          <Button type="button" variant="ghost" onClick={clearImage} disabled={busy}><Trash2 className="size-4" />{t.removeBg.clearImage}</Button>
        </div>}
        {imageError && <p className="text-sm text-destructive">{imageError}</p>}
        {resultUrl && image && <div className="space-y-2">
          <p className="text-sm font-medium">{t.removeBg.compare}</p>
          <CompareSlider beforeSrc={image.objectUrl} afterSrc={resultUrl} beforeLabel={t.common.before} afterLabel={t.common.after} />
        </div>}
      </ImagePanel>
    </div>
  )
}
