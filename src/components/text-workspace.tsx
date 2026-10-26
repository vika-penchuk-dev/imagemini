import * as React from "react"
import { Bold, Hand, Italic, Minus, Plus, Scan, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useApp } from "@/lib/app-context"
import { useEditorSession } from "@/components/editor-session"
import { EditorViewport } from "@/components/editor-viewport"
import { SettingHint } from "@/components/setting-hint"
import { IconTooltipButton } from "@/components/icon-tooltip-button"
import { useSpacePan } from "@/components/editor-cursor"
import { editorFontStack } from "@/lib/editor-text.mjs"
import { imageFitScale, nextEditorZoom } from "@/lib/editor-geometry.mjs"
import type { TextLayer } from "@/lib/editor-text.mjs"
import type { WorkImage } from "@/components/work-image"

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `text-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function TextWorkspace({ image }: { image: WorkImage }) {
  const { t } = useApp()
  const { canvas, viewportZoom: zoom, viewportFit, setViewportZoom, fitViewport } = useEditorSession()
  const [textLayers, setTextLayers] = React.useState<TextLayer[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(textLayers[0]?.id ?? null)
  const [draggedLayers, setDraggedLayers] = React.useState<TextLayer[] | null>(null)
  const [handMode, setHandMode] = React.useState(false)
  const spaceHand = useSpacePan()
  const viewRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const dragRef = React.useRef<{ id: string; x: number; y: number; layerX: number; layerY: number } | null>(null)
  const layer = textLayers.find((item) => item.id === selectedId) ?? null
  const visibleLayers = draggedLayers ?? textLayers


  React.useEffect(() => { setSelectedId(textLayers.at(-1)?.id ?? null); setDraggedLayers(null) }, [image.id])
  React.useEffect(() => {
    const target = canvasRef.current
    if (!target) return
    target.width = canvas.width
    target.height = canvas.height
    const context = target.getContext("2d")!
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(canvas, 0, 0)
  }, [canvas])

  const update = (changes: Partial<TextLayer>) => {
    if (!layer) return
    setTextLayers((items) => items.map((item) => item.id === layer.id ? { ...item, ...changes } : item))
  }
  const addText = (x = canvas.width / 2, y = canvas.height / 2) => {
    const next: TextLayer = { id: newId(), text: t.edit.textPlaceholder, x, y, fontFamily: "Arial", fontSize: 48, color: "#ffffff", bold: false, italic: false, opacity: 100, angle: 0 }
    setTextLayers((items) => [...items, next])
    setSelectedId(next.id)
    return next
  }
  const startMove = (event: React.PointerEvent<HTMLDivElement>, selected: TextLayer) => {
    if (handMode || spaceHand) return
    event.stopPropagation(); event.preventDefault()
    setSelectedId(selected.id)
    dragRef.current = { id: selected.id, x: event.clientX, y: event.clientY, layerX: selected.x, layerY: selected.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current
    if (!start) return
    const dx = (event.clientX - start.x) / zoom, dy = (event.clientY - start.y) / zoom
    setDraggedLayers(textLayers.map((item) => item.id === start.id ? { ...item, x: start.layerX + dx, y: start.layerY + dy } : item))
  }
  const finishMove = () => {
    if (!dragRef.current || !draggedLayers) { dragRef.current = null; return }
    setTextLayers(draggedLayers)
    setDraggedLayers(null)
    dragRef.current = null
  }
  return <section className="grid min-h-[calc(100vh-12rem)] min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_248px]" aria-label={t.edit.editorTabText}>
    <EditorViewport viewportRef={viewRef} imageWidth={canvas.width} imageHeight={canvas.height} zoom={zoom} onZoom={setViewportZoom} fit={viewportFit} onFit={fitViewport} handMode={handMode || spaceHand}>
      <div className="relative" style={{ width: canvas.width * zoom, height: canvas.height * zoom }}>
        <canvas ref={canvasRef} onClick={(event) => {
          if (handMode || spaceHand) return
          const rect = event.currentTarget.getBoundingClientRect()
          addText(((event.clientX - rect.left) / rect.width) * canvas.width, ((event.clientY - rect.top) / rect.height) * canvas.height)
        }} className="absolute inset-0 block" style={{ width: canvas.width * zoom, height: canvas.height * zoom }} aria-label={t.edit.editorTabText} />
        <div className="pointer-events-none absolute inset-0">
          {visibleLayers.map((item) => <div key={item.id} role="button" tabIndex={0} aria-label={`${t.edit.textContent}: ${item.text}`} onPointerDown={(event) => startMove(event, item)} onPointerMove={move} onPointerUp={finishMove} onPointerCancel={finishMove} onClick={() => setSelectedId(item.id)} className={`pointer-events-auto absolute cursor-move whitespace-pre leading-[1.2] outline-none ${selectedId === item.id ? "ring-1 ring-primary ring-offset-2 ring-offset-transparent" : ""}`} style={{ left: item.x * zoom, top: item.y * zoom, color: item.color, fontFamily: editorFontStack(item.fontFamily), fontSize: item.fontSize * zoom, fontWeight: item.bold ? 700 : 400, fontStyle: item.italic ? "italic" : "normal", opacity: item.opacity / 100, transform: `rotate(${item.angle}deg)`, transformOrigin: "top left" }}>{item.text}</div>)}
        </div>
      </div>
    </EditorViewport>
    <aside className="min-w-0 space-y-2 overflow-y-auto rounded-lg border p-2 lg:max-h-[calc(100vh-12rem)]">
      <p className="text-sm text-muted-foreground">{t.edit.textHelp}</p>
      <div className="grid grid-cols-3 gap-1"><IconTooltipButton label={t.edit.zoomOut} variant="outline" onClick={() => setViewportZoom(nextEditorZoom(zoom, -1))}><Minus className="size-4" /></IconTooltipButton><IconTooltipButton label={t.edit.zoomFit} variant="outline" onClick={() => fitViewport(imageFitScale(canvas.width, canvas.height, viewRef.current?.clientWidth ?? 0, viewRef.current?.clientHeight ?? 0))}><Scan className="size-4" /></IconTooltipButton><IconTooltipButton label={t.edit.zoomIn} variant="outline" onClick={() => setViewportZoom(nextEditorZoom(zoom, 1))}><Plus className="size-4" /></IconTooltipButton><Button type="button" size="icon" className="col-span-3 w-full" variant={handMode ? "default" : "outline"} aria-label={t.edit.handTool} aria-pressed={handMode} onClick={() => setHandMode((value) => !value)}><Hand className="size-4" />{t.edit.handTool}</Button></div>
      <div className="flex items-center gap-2"><Label htmlFor="text-editor-zoom" className="text-xs">{t.edit.zoom}: {Math.round(zoom * 100)}%</Label><input id="text-editor-zoom" type="range" min="25" max="1600" step="1" value={Math.round(zoom * 100)} onChange={(event) => setViewportZoom(Number(event.target.value) / 100)} className="w-full accent-primary" /></div>
      <Button type="button" variant="outline" className="w-full" onClick={() => addText()}><Plus className="size-4" />{t.edit.addText}</Button>
      {layer ? <>
      <div className="space-y-1"><Label htmlFor="editor-text-content">{t.edit.textContent}</Label><Textarea id="editor-text-content" value={layer.text} onChange={(event) => update({ text: event.target.value })} placeholder={t.edit.textPlaceholder} rows={3} /></div>
        <div className="space-y-1"><div className="flex items-center gap-1"><Label htmlFor="editor-text-font">{t.edit.textFont}</Label><SettingHint label={t.edit.textFont}>{t.edit.textFontHelp}</SettingHint></div><select id="editor-text-font" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={layer.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Tahoma</option><option value="Times New Roman">Times New Roman</option><option value="Trebuchet MS">Trebuchet MS</option><option value="Courier New">Courier New</option><option value="system-ui">{t.edit.systemFont}</option></select></div>
        <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><div className="flex items-center gap-1"><Label htmlFor="editor-text-size">{t.edit.textFontSize}</Label><SettingHint label={t.edit.textFontSize}>{t.edit.textFontSizeHelp}</SettingHint></div><Input id="editor-text-size" type="number" min="6" max="500" value={layer.fontSize} onChange={(event) => update({ fontSize: Math.max(6, Math.min(500, Number(event.target.value) || 6)) })} /></div><div className="space-y-1"><div className="flex items-center gap-1"><Label htmlFor="editor-text-color">{t.edit.textColor}</Label><SettingHint label={t.edit.textColor}>{t.edit.textColorHelp}</SettingHint></div><Input id="editor-text-color" type="color" value={layer.color} onChange={(event) => update({ color: event.target.value })} className="h-9 p-1" /></div></div>
        <div className="grid grid-cols-2 gap-2"><Button type="button" variant={layer.bold ? "default" : "outline"} aria-pressed={layer.bold} onClick={() => update({ bold: !layer.bold })}><Bold className="size-4" />{t.edit.textBold}</Button><Button type="button" variant={layer.italic ? "default" : "outline"} aria-pressed={layer.italic} onClick={() => update({ italic: !layer.italic })}><Italic className="size-4" />{t.edit.textItalic}</Button></div>
        <div className="space-y-1"><div className="flex items-center gap-1"><Label htmlFor="editor-text-opacity">{t.edit.textOpacity}: {layer.opacity}%</Label><SettingHint label={t.edit.textOpacity}>{t.edit.textOpacityHelp}</SettingHint></div><input id="editor-text-opacity" type="range" min="0" max="100" value={layer.opacity} onChange={(event) => update({ opacity: Number(event.target.value) })} className="w-full accent-primary" /></div>
        <div className="space-y-1"><div className="flex items-center gap-1"><Label htmlFor="editor-text-angle">{t.edit.textAngle}: {layer.angle}°</Label><SettingHint label={t.edit.textAngle}>{t.edit.textAngleHelp}</SettingHint></div><input id="editor-text-angle" type="range" min="-180" max="180" value={layer.angle} onChange={(event) => update({ angle: Number(event.target.value) })} className="w-full accent-primary" /></div>
        <Button type="button" variant="outline" className="w-full" onClick={() => { setTextLayers((items) => items.filter((item) => item.id !== layer.id)); setSelectedId(null) }}><Trash2 className="size-4" />{t.edit.textDelete}</Button>
      </> : <p className="text-sm text-muted-foreground">{t.edit.textPlaceholder}</p>}
    </aside>
  </section>
}
