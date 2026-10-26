import { Check, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider"
import { useApp } from "@/lib/app-context"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useApp()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t.settings.theme} title={t.settings.theme}>
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>{t.settings.light}{theme === "light" && <Check className="ml-auto size-4" />}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>{t.settings.dark}{theme === "dark" && <Check className="ml-auto size-4" />}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>{t.settings.system}{theme === "system" && <Check className="ml-auto size-4" />}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
