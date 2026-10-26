import {
  FileDown,
  RefreshCw,
  Wand2,
  Scissors,
  Ratio,
  ZoomIn,
  PenTool,
  Layers,
} from "lucide-react"
import { useApp, type Page } from "@/lib/app-context"
import { DropZone } from "@/components/drop-zone"
import { useWorkImage } from "@/components/work-image"
import { Card, CardContent } from "@/components/ui/card"

const OPERATIONS: {
  page: Page
  icon: React.ComponentType<{ className?: string }>
  titleKey: "compress" | "convert" | "enhance" | "upscale" | "removeBg" | "resize" | "edit" | "batch"
}[] = [
  { page: "compress", icon: FileDown, titleKey: "compress" },
  { page: "convert", icon: RefreshCw, titleKey: "convert" },
  { page: "enhance", icon: Wand2, titleKey: "enhance" },
  { page: "upscale", icon: ZoomIn, titleKey: "upscale" },
  { page: "removeBg", icon: Scissors, titleKey: "removeBg" },
  { page: "resize", icon: Ratio, titleKey: "resize" },
  { page: "edit", icon: PenTool, titleKey: "edit" },
  { page: "batch", icon: Layers, titleKey: "batch" },
]

export function HomePage() {
  const { t, setPage } = useApp()
  const { setImageFromFile } = useWorkImage()

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t.home.title}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
          {t.home.subtitle}
        </p>
      </section>

      <DropZone
        onFiles={(files) => {
          void setImageFromFile(files[0]).then(() => setPage("compress"))
        }}
        label={t.home.addImages}
      />

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OPERATIONS.map(({ page, icon: Icon, titleKey }) => (
            <button key={page} onClick={() => setPage(page)} className="text-left">
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardContent className="flex flex-col gap-2 px-4 py-4">
                  <Icon className="size-5 text-primary" />
                  <span className="text-sm font-medium">{t.nav[titleKey]}</span>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
