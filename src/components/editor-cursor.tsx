import * as React from "react"
import { useApp } from "@/lib/app-context"
import { editorCursorColor, editorCursorCss, shouldActivateSpacePan, type EditorCursorColor } from "@/lib/editor-geometry.mjs"

const STORAGE_KEY = "imagemini.editor.cursorColor"

type CursorLabelKey = "whiteCursor" | "redCursor" | "blueCursor" | "blackCursor" | "yellowCursor"
const COLOR_LABEL_KEYS: Record<EditorCursorColor, CursorLabelKey> = {
  white: "whiteCursor",
  red: "redCursor",
  blue: "blueCursor",
  black: "blackCursor",
  yellow: "yellowCursor",
}

function isCursorColor(value: string | null): value is EditorCursorColor {
  return value === "white" || value === "red" || value === "blue" || value === "black" || value === "yellow"
}

function readColor(): EditorCursorColor {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isCursorColor(value) ? value : "yellow"
  } catch {
    return "yellow"
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener("imagemini-editor-cursor-color", onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener("imagemini-editor-cursor-color", onChange)
  }
}

export function setEditorCursorColor(color: EditorCursorColor) {
  try { window.localStorage.setItem(STORAGE_KEY, color) } catch { /* Storage can be disabled by the browser. */ }
  window.dispatchEvent(new Event("imagemini-editor-cursor-color"))
}

function getCursorSnapshot() {
  return readColor()
}

function getServerSnapshot(): EditorCursorColor {
  return "yellow"
}

export function useEditorCursor() {
  const color = React.useSyncExternalStore(subscribe, getCursorSnapshot, getServerSnapshot)
  return { color, cursorStyle: editorCursorCss(color) }
}

export function useSpacePan() {
  const [spaceHeld, setSpaceHeld] = React.useState(false)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const inControl = !!target?.closest("button, a, [role=button]")
      if (!shouldActivateSpacePan(event.code, target ? { tagName: target.tagName, isContentEditable: target.isContentEditable, inControl } : {})) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceHeld(false) }
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [])

  return spaceHeld
}

export function EditorCursorPicker() {
  const { t } = useApp()
  const { color } = useEditorCursor()
  const label = t.edit.cursorColor
  const colors = Object.keys(COLOR_LABEL_KEYS) as EditorCursorColor[]

  return <div className="space-y-1.5">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {colors.map((value) => <button
        key={value}
        type="button"
        aria-label={t.edit[COLOR_LABEL_KEYS[value]]}
        aria-pressed={color === value}
        title={t.edit[COLOR_LABEL_KEYS[value]]}
        onClick={() => setEditorCursorColor(value)}
        className={`size-6 rounded-full border border-foreground/30 shadow-sm ${color === value ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
        style={{ backgroundColor: editorCursorColor(value) }}
      />)}
    </div>
  </div>
}
