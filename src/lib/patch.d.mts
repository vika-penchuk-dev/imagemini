export const MAX_PATCH_AREA: number
export function applyPatchRgba(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  feather?: number,
  mode?: "one-tone" | "texture",
): Uint8ClampedArray
