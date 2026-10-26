export type EditorCursorColor = "white" | "red" | "blue" | "black" | "yellow"
export function editorCursorColor(color: EditorCursorColor): string
export function editorSelectionStroke(color: EditorCursorColor): { stroke: string; outline: string }
export function editorCursorCss(color: EditorCursorColor): string
export function polygonPreviewPoints(points: { x: number; y: number }[], hover: { x: number; y: number } | null, active: boolean): { x: number; y: number }[]
export function zoomScrollOffset(currentZoom: number, nextZoom: number, rect: { left: number; top: number; width: number; height: number }, scrollLeft: number, scrollTop: number, clientX: number, clientY: number): { left: number; top: number }
export function shouldActivateSpacePan(keyCode: string, targetInfo?: { tagName?: string; isContentEditable?: boolean; inControl?: boolean }): boolean
export function pointerToImagePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number }
export function imageFitScale(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number): number
export type EditorViewportLayout = { left: number; top: number; width: number; height: number }
export function editorViewportLayout(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number, zoom: number, offsetX?: number, offsetY?: number): EditorViewportLayout
export function editorViewportZoomOffset(layout: EditorViewportLayout, currentZoom: number, nextZoom: number, viewportRect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): { x: number; y: number }
export function nextEditorZoom(current: number, direction: number, minimum?: number, maximum?: number): number
export function shouldClosePolygon(clientX: number, clientY: number, firstClientX: number, firstClientY: number, doubleClick?: boolean, threshold?: number): boolean
export function getEdgePanDelta(position: number, start: number, end: number, margin?: number, maximum?: number): number
export type LayerTransform = { x: number; y: number; width: number; height: number; scale: number; angle: number; flipX: boolean; flipY: boolean }
export function layerLocalToImagePoint(point: { x: number; y: number }, layer: LayerTransform): { x: number; y: number }
export function imageToLayerLocalPoint(point: { x: number; y: number }, layer: LayerTransform): { x: number; y: number }
export function isPointInLayer(point: { x: number; y: number }, layer: LayerTransform, tolerance?: number): boolean
export function layerHandleAt(point: { x: number; y: number }, corners: { x: number; y: number }[], tolerance: number): number
export function moveLayerBy<T extends { x: number; y: number }>(layer: T, dx: number, dy: number): T
export function eraseLayerAlpha(rgba: Uint8ClampedArray, width: number, height: number, centerX: number, centerY: number, radius: number, softness: number, opacity: number, mode?: "soft" | "hard"): Uint8ClampedArray
export function editorBrushDiameterOnScreen(diameter: number, zoom: number): number
export function canvasExportDimensions(canvas: { width: number; height: number }): { width: number; height: number }
