export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="4"
        y="8"
        width="40"
        height="32"
        rx="8"
        className="fill-primary"
      />
      <circle cx="17" cy="19" r="4" className="fill-primary-foreground" />
      <path
        d="M8 34l9-9 6 6 7-8 10 11"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground text-primary-foreground"
        fill="none"
      />
      <path
        d="M36 12l3 3m0-3l-3 3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-teal-500 dark:stroke-teal-400"
        fill="none"
      />
    </svg>
  )
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Logo className="size-8" />
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">
          Image<span className="text-primary">Mini</span>
        </div>
      </div>
    </div>
  )
}
