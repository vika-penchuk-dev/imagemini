export interface ImageJob {
  id: string
  file: File
  name: string
  size: number
  type: string
}

export interface ProcessedResult {
  id: string
  blob: Blob
  name: string
  size: number
  sourceSize: number
  sourceName: string
  width: number
  height: number
  format: string
}

let counter = 0
export function nextId(): string {
  counter += 1
  return `img-${Date.now().toString(36)}-${counter}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function saveToDirectory(
  blob: Blob,
  filename: string
): Promise<boolean> {
  const w = window as unknown as {
    showSaveFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle>
  }
  if (!w.showSaveFilePicker) return false
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: filename,
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch {
    return false
  }
}

export function withSuffix(name: string, suffix: string, ext: string): string {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name
  return `${base}${suffix}.${ext}`
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return [
    "jpg", "jpeg", "png", "webp", "bmp", "gif", "avif",
    "tiff", "tif", "heic", "heif", "svg", "ico",
  ].includes(ext)
}

export function formatLabel(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "JPEG"
    case "image/png":
      return "PNG"
    case "image/webp":
      return "WebP"
    case "image/gif":
      return "GIF"
    case "image/bmp":
      return "BMP"
    case "image/avif":
      return "AVIF"
    case "image/tiff":
      return "TIFF"
    case "image/svg+xml":
      return "SVG"
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ICO"
    case "image/heic":
    case "image/heif":
      return "HEIC/HEIF"
    default:
      return mime.replace("image/", "").toUpperCase() || "—"
  }
}
