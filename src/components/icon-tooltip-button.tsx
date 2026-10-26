import * as React from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type Props = Omit<React.ComponentProps<typeof Button>, "children"> & {
  label: string
  description?: string
  children: React.ReactNode
}

export function IconTooltipButton({ label, description, children, ...buttonProps }: Props) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" aria-label={label} title={label} {...buttonProps}>
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{description ? <span className="grid gap-0.5"><span className="font-medium">{label}</span><span className="text-background/80">{description}</span></span> : label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
