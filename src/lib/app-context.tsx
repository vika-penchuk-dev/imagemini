import * as React from "react"
import { translations, type Lang, type TranslationKey } from "@/lib/i18n"

export type Page =
  | "home"
  | "compress"
  | "convert"
  | "enhance"
  | "upscale"
  | "resize"
  | "edit"
  | "batch"
  | "settings"

export type ThemeMode = "light" | "dark" | "system"

export interface AppSettings {
  lang: Lang
  lastQuality: number
  lastFormat: "image/jpeg" | "image/png" | "image/webp"
  bgColor: string
  compressMode: "maxQuality" | "balanced" | "maxCompress" | "manual" | "sharpText"
  dontEnlarge: boolean
  keepAspect: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  lang: "ru",
  lastQuality: 80,
  lastFormat: "image/webp",
  bgColor: "#ffffff",
  compressMode: "balanced",
  dontEnlarge: true,
  keepAspect: true,
}

const STORAGE_KEY = "imagemini-settings"

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface AppContextValue {
  settings: AppSettings
  setSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
  lang: Lang
  t: TranslationKey
  page: Page
  setPage: (page: Page) => void
}

const AppContext = React.createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = React.useState<AppSettings>(loadSettings)
  const [page, setPage] = React.useState<Page>("home")

  const setSettings = React.useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // storage unavailable (private mode) — keep in-memory only
      }
      return next
    })
  }, [])

  const resetSettings = React.useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setSettingsState(DEFAULT_SETTINGS)
  }, [])

  const lang = settings.lang
  const t = translations[lang]

  React.useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = React.useMemo(
    () => ({
      settings,
      setSettings,
      resetSettings,
      lang,
      t,
      page,
      setPage,
    }),
    [settings, setSettings, resetSettings, lang, t, page]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}

export { DEFAULT_SETTINGS }
