export type CropRect = { x: number; y: number; w: number; h: number }

export function moveCropRect(rect: CropRect, dx: number, dy: number, boundsWidth: number, boundsHeight: number): CropRect
export function resizeCropRect(
  rect: CropRect,
  handle: string,
  dx: number,
  dy: number,
  boundsWidth: number,
  boundsHeight: number,
  ratio?: number | null
): CropRect
export function cropSourceToWorkspace(
  rect: CropRect,
  width: number,
  height: number,
  rotate: number,
  flipH: boolean,
  flipV: boolean
): CropRect
export function cropWorkspaceToSource(
  rect: CropRect,
  width: number,
  height: number,
  rotate: number,
  flipH: boolean,
  flipV: boolean
): CropRect
