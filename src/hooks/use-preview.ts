import * as React from "react"
import { createLatestTaskGate } from "@/lib/preview-gate.mjs"

export interface PreviewValue {
  blob: Blob
}

export type PreviewResult<T extends PreviewValue> = T & {
  key: string
  url: string
}

export function useDebouncedPreview<T extends PreviewValue>(
  key: string | null,
  process: (signal: AbortSignal) => Promise<T>,
  delay = 300
) {
  const processRef = React.useRef(process)
  processRef.current = process
  const gate = React.useRef(createLatestTaskGate())
  const urlRef = React.useRef<string | null>(null)
  const [result, setResult] = React.useState<PreviewResult<T> | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const task = gate.current.next()
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    setError(null)
    setBusy(key !== null)
    setResult(null)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null

    if (key !== null) {
      timer = setTimeout(async () => {
        try {
          const value = await processRef.current(controller.signal)
          if (!gate.current.isCurrent(task)) return
          const url = URL.createObjectURL(value.blob)
          urlRef.current = url
          setResult({ ...value, key, url })
        } catch (err) {
          if (gate.current.isCurrent(task)) {
            setError(err instanceof Error ? err.message : String(err))
          }
        } finally {
          if (gate.current.isCurrent(task)) setBusy(false)
        }
      }, delay)
    }

    return () => {
      if (timer) clearTimeout(timer)
      controller.abort()
      gate.current.invalidate()
    }
  }, [key, delay])

  React.useEffect(() => () => {
    gate.current.invalidate()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  return { result, busy, error }
}
