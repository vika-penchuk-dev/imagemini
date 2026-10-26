import * as React from "react"
import {
  Home,
  FileDown,
  RefreshCw,
  Wand2,
  Scissors,
  Ratio,
  PenTool,
  Layers,
  Settings2,
  ZoomIn,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp, type Page } from "@/lib/app-context"
import { LogoWordmark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { useWorkImage } from "@/components/work-image"
import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/sidebar-preference.mjs"

const NAV_ITEMS: {
  page: Page
  icon: React.ComponentType<{ className?: string }>
  key: keyof ReturnType<typeof useApp>["t"]["nav"]
}[] = [
  { page: "home", icon: Home, key: "home" },
  { page: "compress", icon: FileDown, key: "compress" },
  { page: "convert", icon: RefreshCw, key: "convert" },
  { page: "enhance", icon: Wand2, key: "enhance" },
  { page: "upscale", icon: ZoomIn, key: "upscale" },
  { page: "removeBg", icon: Scissors, key: "removeBg" },
  { page: "resize", icon: Ratio, key: "resize" },
  { page: "edit", icon: PenTool, key: "edit" },
  { page: "batch", icon: Layers, key: "batch" },
  { page: "settings", icon: Settings2, key: "settings" },
] 

const NAV_ICON_COLORS: Record<Page, string> = {
  home: "text-sky-500",
  compress: "text-violet-500",
  convert: "text-teal-500",
  enhance: "text-amber-500",
  upscale: "text-blue-500",
  removeBg: "text-rose-500",
  resize: "text-emerald-500",
  edit: "text-indigo-500",
  batch: "text-orange-500",
  settings: "text-slate-500",
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, page, setPage, settings, setSettings } = useApp()
  const { image, clear } = useWorkImage()
  const mobileNavOpen = React.useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(readSidebarCollapsed)

  const toggleSidebar = () => setSidebarCollapsed((collapsed) => {
    const next = !collapsed
    writeSidebarCollapsed(next)
    return next
  })

  const navList = (collapsed: boolean) => (
    <nav className="flex flex-col gap-1" aria-label={settings.lang === "ru" ? "Основная навигация" : "Main navigation"}>
      {NAV_ITEMS.map(({ page: p, icon: Icon, key }) => (
        <button
          key={p}
          onClick={() => {
            setPage(p)
            mobileNavOpen[1](false)
          }}
          aria-label={t.nav[key]}
          aria-current={page === p ? "page" : undefined}
          title={collapsed ? t.nav[key] : undefined}
          className={cn(
            "flex w-full items-center rounded-lg py-2 text-sm font-medium transition-colors text-left",
            collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
            "hover:bg-accent hover:text-accent-foreground",
            page === p && "bg-primary/10 text-primary"
          )}
        >
          <Icon className={cn("size-4 shrink-0", NAV_ICON_COLORS[p])} />
          <span className={collapsed ? "sr-only" : "truncate whitespace-nowrap"}>{t.nav[key]}</span>
        </button>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-3 px-3 sm:px-4">
          <button
            className="md:hidden"
            aria-label="Menu"
            onClick={() => mobileNavOpen[1](!mobileNavOpen[0])}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={() => setPage("home")} className="shrink-0">
            <LogoWordmark />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  {settings.lang === "ru" ? "RU" : "EN"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setSettings({ lang: "ru" })}
                >
                  Русский
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSettings({ lang: "en" })}
                >
                  English
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ModeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 gap-4 px-3 py-4 sm:px-4 lg:gap-5">
        <aside className={cn("hidden shrink-0 md:block", sidebarCollapsed ? "w-12" : "w-fit max-w-52")}>
          <div className="sticky top-20 space-y-2">
            <Button type="button" variant="ghost" size="icon" className={sidebarCollapsed ? "mx-auto" : "ml-auto"} aria-label={sidebarCollapsed ? t.nav.expand : t.nav.collapse} title={sidebarCollapsed ? t.nav.expand : t.nav.collapse} onClick={toggleSidebar}>
              {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
            {navList(sidebarCollapsed)}
          </div>
        </aside>
        {mobileNavOpen[0] && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => mobileNavOpen[1](false)}
            />
            <div className="absolute inset-y-0 left-0 w-64 border-r bg-background p-4">
              <LogoWordmark className="mb-4" />
              {navList(false)}
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1">
          {image && page !== "home" && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{image.name}</p>
              <Button variant="outline" size="sm" className="shrink-0" onClick={clear}>{t.common.clear}</Button>
            </div>
          )}
          {children}
        </main>
      </div>

      <footer className="border-t py-4">
        <div className="mx-auto max-w-screen-2xl px-3 text-center text-xs text-muted-foreground sm:px-4">
          {t.settings.aboutText}
        </div>
      </footer>
    </div>
  )
}
