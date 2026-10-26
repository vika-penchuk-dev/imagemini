import * as React from "react"
import { Upload, ImagePlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { isImageFile } from "@/lib/image-job"
import { ACCEPTED_INPUT } from "@/lib/image-core"
import { Button } from "@/components/ui/button"

interface DropZoneProps {
  onFiles: (files: File[]) => void
  multiple?: boolean
  compact?: boolean
  label?: string
  className?: string
}

export function DropZone({
  onFiles,
  multiple = true,
  compact = false,
  label,
  className,
}: DropZoneProps) {
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const depth = React.useRef(0)

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      if (!files) return
      const images = Array.from(files).filter(isImageFile)
      if (images.length) onFiles(multiple ? images : images.slice(0, 1))
    },
    [onFiles, multiple]
  )

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile()
          if (f && isImageFile(f)) files.push(f)
        }
      }
      if (files.length) {
        onFiles(multiple ? files : files.slice(0, 1))
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [onFiles, multiple])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label ?? "Add images"}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) setDragging(false)
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors",
        "hover:border-primary/60 hover:bg-accent/40",
        dragging && "border-primary bg-primary/5",
        compact ? "p-6" : "p-10 sm:p-14",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_INPUT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 text-primary",
          compact ? "size-10" : "size-14"
        )}
      >
        {compact ? (
          <ImagePlus className="size-5" />
        ) : (
          <Upload className="size-6" />
        )}
      </div>
      <div>
        {label && <div className="font-medium">{label}</div>}
        <p className="text-sm text-muted-foreground">
          {compact
            ? label ?? "Выберите файлы или перетащите сюда"
            : "Выберите файлы или перетащите папку · Ctrl+V — вставить из буфера"}
        </p>
      </div>
      {!compact && (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
        >
          Выбрать файлы
        </Button>
      )}
    </div>
  )
}
