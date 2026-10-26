export type TextLayer = {
  id: string
  text: string
  x: number
  y: number
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  opacity: number
  angle: number
}
export function editorFontStack(fontFamily: string): string
export function drawTextLayers(context: CanvasRenderingContext2D, layers: TextLayer[]): void
export function compositeCanvasWithText(source: HTMLCanvasElement, layers: TextLayer[]): HTMLCanvasElement
export function transformTextLayers(layers: TextLayer[], transform: { sourceWidth: number; sourceHeight: number; crop?: { x: number; y: number; w: number; h: number } | null; rotate: number; flipH: boolean; flipV: boolean }): TextLayer[]
