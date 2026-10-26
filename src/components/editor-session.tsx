import * as React from "react"
import type { WorkImage } from "@/components/work-image"
import { createEditorHistory } from "@/lib/editor-history.mjs"

type EditorSession = {
  original: HTMLCanvasElement
  canvas: HTMLCanvasElement
  version: number
  canUndo: boolean
  canRedo: boolean
  resetVersion: number
  viewportZoom: number
  viewportFit: boolean
  setViewportZoom: (zoom: number) => void
  fitViewport: (zoom: number) => void
  registerPending: (key: string, pending: boolean) => void
  hasPendingExcept: (key: string) => boolean
  commit: (canvas: HTMLCanvasElement) => void
  undo: () => void
  redo: () => void
  reset: () => void
}

const EditorSessionContext = React.createContext<EditorSession | null>(null)
const MAX_HISTORY_BYTES = 64 * 1024 * 1024

function copyCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas")
  copy.width = source.width
  copy.height = source.height
  copy.getContext("2d")!.drawImage(source, 0, 0)
  return copy
}

export function EditorSessionProvider({ image, children }: { image: WorkImage; children: React.ReactNode }) {
  const [original, setOriginal] = React.useState(image.canvas)
  const [canvas, setCanvas] = React.useState(image.canvas)
  const canvasRef = React.useRef(canvas)
  const historyRef = React.useRef(createEditorHistory<HTMLCanvasElement>())
  const pendingRef = React.useRef(new Set<string>())
  const [historyVersion, setHistoryVersion] = React.useState(0)
  const [resetVersion, setResetVersion] = React.useState(0)
  const [viewportZoom, setViewportZoomState] = React.useState(1)
  const [viewportFit, setViewportFit] = React.useState(true)

  React.useEffect(() => {
    setOriginal(image.canvas)
    canvasRef.current = image.canvas
    setCanvas(image.canvas)
    setViewportZoomState(1)
    setViewportFit(true)
    historyRef.current.clear()
    pendingRef.current.clear()
    setResetVersion((version) => version + 1)
    setHistoryVersion((version) => version + 1)
  }, [image.id])

  const setViewportZoom = React.useCallback((zoom: number) => {
    setViewportZoomState(zoom)
    setViewportFit(false)
  }, [])
  const fitViewport = React.useCallback((zoom: number) => {
    setViewportZoomState(zoom)
    setViewportFit(true)
  }, [])

  const commit = React.useCallback((next: HTMLCanvasElement) => {
    const maxEntries = Math.max(1, Math.min(20, Math.floor(MAX_HISTORY_BYTES / (canvasRef.current.width * canvasRef.current.height * 4))))
    historyRef.current.setLimit(maxEntries)
    historyRef.current.push(copyCanvas(canvasRef.current))
    canvasRef.current = next
    setCanvas(next)
    setHistoryVersion((version) => version + 1)
  }, [])

  const undo = React.useCallback(() => {
    const previous = historyRef.current.undo(copyCanvas(canvasRef.current))
    if (!previous) return
    canvasRef.current = previous
    setCanvas(previous)
    setHistoryVersion((version) => version + 1)
  }, [])

  const redo = React.useCallback(() => {
    const next = historyRef.current.redo(copyCanvas(canvasRef.current))
    if (!next) return
    canvasRef.current = next
    setCanvas(next)
    setHistoryVersion((version) => version + 1)
  }, [])

  const reset = React.useCallback(() => {
    canvasRef.current = original
    setCanvas(original)
    historyRef.current.clear()
    pendingRef.current.clear()
    setResetVersion((version) => version + 1)
    setHistoryVersion((version) => version + 1)
  }, [original])

  const registerPending = React.useCallback((key: string, pending: boolean) => {
    if (pending) pendingRef.current.add(key)
    else pendingRef.current.delete(key)
  }, [])
  const hasPendingExcept = React.useCallback((key: string) => [...pendingRef.current].some((pending) => pending !== key), [])

  const value = React.useMemo(() => ({
    original, canvas, version: historyVersion, resetVersion, viewportZoom, viewportFit, setViewportZoom, fitViewport,
    canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo,
    commit, undo, redo, reset, registerPending, hasPendingExcept,
  }), [original, canvas, commit, undo, redo, reset, historyVersion, resetVersion, registerPending, hasPendingExcept, viewportZoom, viewportFit, setViewportZoom, fitViewport])

  return <EditorSessionContext.Provider value={value}>{children}</EditorSessionContext.Provider>
}

export function useEditorSession() {
  const session = React.useContext(EditorSessionContext)
  if (!session) throw new Error("useEditorSession must be used inside EditorSessionProvider")
  return session
}
