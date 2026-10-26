import * as React from "react"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function SettingHint({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = React.useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 shrink-0" aria-label={label} title={label}>
              <Info className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 whitespace-normal">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <PopoverContent className="max-w-72 text-sm" side="top">{children}</PopoverContent>
  </Popover>
}
