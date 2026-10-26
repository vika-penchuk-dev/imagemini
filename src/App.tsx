import { AppProvider, useApp } from "@/lib/app-context"
import { AppShell } from "@/components/app-shell"
import { WorkImageProvider } from "@/components/work-image"
import { HomePage } from "@/pages/home"
import { CompressPage } from "@/pages/compress"
import { ConvertPage } from "@/pages/convert"
import { EnhancePage } from "@/pages/enhance"
import { RemoveBgPage } from "@/pages/remove-bg"
import { ResizePage } from "@/pages/resize"
import { UpscalePage } from "@/pages/upscale"
import { EditPage } from "@/pages/edit"
import { BatchPage } from "@/pages/batch"
import { SettingsPage } from "@/pages/settings"
import { Toaster } from "@/components/ui/sonner"

function Router() {
  const { page } = useApp()
  switch (page) {
    case "compress":
      return <CompressPage />
    case "convert":
      return <ConvertPage />
    case "enhance":
      return <EnhancePage />
    case "upscale":
      return <UpscalePage />
    case "removeBg":
      return <RemoveBgPage />
    case "resize":
      return <ResizePage />
    case "edit":
      return <EditPage />
    case "batch":
      return <BatchPage />
    case "settings":
      return <SettingsPage />
    case "home":
    default:
      return <HomePage />
  }
}

function Shell() {
  return (
    <WorkImageProvider>
      <AppShell>
        <Router />
      </AppShell>
    </WorkImageProvider>
  )
}

export function App() {
  return (
    <AppProvider>
      <Shell />
      <Toaster />
    </AppProvider>
  )
}

export default App
