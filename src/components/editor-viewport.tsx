import * as React from "react"
import { editorViewportLayout, editorViewportZoomOffset, imageFitScale, nextEditorZoom } from "@/lib/editor-geometry.mjs"

type EditorViewportProps = {
  imageWidth: number
  imageHeight: number
  zoom: number
  onZoom: (zoom: number) => void
  fit: boolean
  onFit: (zoom: number) => void
  viewportRef: React.Ref<HTMLDivElement>
  onWheel?: React.WheelEventHandler<HTMLDivElement>
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>
  onPointerCancel?: React.PointerEventHandler<HTMLDivElement>
  handMode?: boolean
  children: React.ReactNode
  className?: string
}

export function EditorViewport({ imageWidth, imageHeight, zoom, onZoom, fit, onFit, viewportRef, children, className, handMode = false, ...events }: EditorViewportProps) {
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const [smallPan, setSmallPan] = React.useState({ x: 0, y: 0 })
  const panStart = React.useRef<{ x: number; y: number; panX: number; panY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const pendingScroll = React.useRef<{ left: number; top: number } | null>(null)
  const localRef = React.useRef<HTMLDivElement>(null)
  const setRef = React.useCallback((node: HTMLDivElement | null) => {
    localRef.current = node
    if (typeof viewportRef === "function") viewportRef(node)
    else if (viewportRef) (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [viewportRef])

  React.useLayoutEffect(() => {
    const view = localRef.current
    if (!view) return
    const update = () => {
      const width = view.clientWidth, height = view.clientHeight
      setSize({ width, height })
      if (fit && width > 0 && height > 0) onFit(imageFitScale(imageWidth, imageHeight, width, height))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(view)
    return () => observer.disconnect()
  }, [fit, imageWidth, imageHeight, onFit])
  React.useEffect(() => setSmallPan({ x: 0, y: 0 }), [imageWidth, imageHeight])
  React.useEffect(() => {
    const view = localRef.current, offset = pendingScroll.current
    if (!view || !offset) return
    view.scrollLeft = offset.left; view.scrollTop = offset.top
    pendingScroll.current = null
  }, [zoom])

  const baseLayout = editorViewportLayout(imageWidth, imageHeight, size.width, size.height, zoom)
  const layout = { ...baseLayout, left: baseLayout.left + (baseLayout.width <= size.width ? smallPan.x : 0), top: baseLayout.top + (baseLayout.height <= size.height ? smallPan.y : 0) }
  const stageWidth = Math.max(size.width, layout.width)
  const stageHeight = Math.max(size.height, layout.height)
  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    events.onWheel?.(event)
    if (!event.altKey) return
    event.preventDefault()
    const view = event.currentTarget
    const nextZoom = nextEditorZoom(zoom, event.deltaY < 0 ? 1 : -1)
    if (nextZoom === zoom) return
    const rect = view.getBoundingClientRect()
    const virtualRect = { left: rect.left + view.clientLeft - view.scrollLeft, top: rect.top + view.clientTop - view.scrollTop, width: view.clientWidth, height: view.clientHeight }
    const offset = editorViewportZoomOffset(layout, zoom, nextZoom, virtualRect, event.clientX, event.clientY)
    const width = imageWidth * nextZoom, height = imageHeight * nextZoom
    setSmallPan({ x: width <= size.width ? offset.x : 0, y: height <= size.height ? offset.y : 0 })
    pendingScroll.current = { left: width > size.width ? Math.max(0, -offset.x) : 0, top: height > size.height ? Math.max(0, -offset.y) : 0 }
    onZoom(nextZoom)
  }
  return <div ref={setRef} className={className ?? "relative h-[calc(100vh-12rem)] min-h-64 overflow-auto rounded-lg border bg-checkerboard"} {...events}
    onWheel={handleWheel}
    onPointerDown={(event) => {
      events.onPointerDown?.(event)
      if (!handMode || event.button !== 0) return
      panStart.current = { x: event.clientX, y: event.clientY, panX: smallPan.x, panY: smallPan.y, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    }}
    onPointerMove={(event) => {
      events.onPointerMove?.(event)
      const start = panStart.current
      if (!start) return
      setSmallPan({ x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y })
      if (baseLayout.width > size.width) event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.x)
      if (baseLayout.height > size.height) event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.y)
    }}
    onPointerUp={(event) => { events.onPointerUp?.(event); panStart.current = null }}
    onPointerCancel={(event) => { events.onPointerCancel?.(event); panStart.current = null }}>
    <div className="relative" style={{ width: stageWidth, height: stageHeight }}>
      <div className="absolute" style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}>
        {children}
      </div>
    </div>
  </div>
}
