import { useId } from 'react'
import { cn } from '@/lib/utils'

/** Marca do app: notas musicais sobre um degradê lavanda → rosa. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8f80ff" />
          <stop offset="0.55" stopColor="#b48cf2" />
          <stop offset="1" stopColor="#f6a6c8" />
        </linearGradient>
        <radialGradient id={`${id}-h`} cx="14" cy="8" r="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill={`url(#${id}-g)`} />
      <rect width="48" height="48" rx="15" fill={`url(#${id}-h)`} />
      <g fill="#fff">
        <path d="M19.2 31.6V15.9c0-.9.6-1.7 1.5-1.9l11.6-2.9c1.3-.3 2.5.7 2.5 2v15.2h-3.2V18.4l-9.2 2.3v10.9h-3.2Z" />
        <ellipse cx="15.6" cy="32.4" rx="4.6" ry="3.7" transform="rotate(-18 15.6 32.4)" />
        <ellipse cx="30.9" cy="28.9" rx="4.6" ry="3.7" transform="rotate(-18 30.9 28.9)" />
      </g>
    </svg>
  )
}

export function Logo({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark size={40} />
      <div className="min-w-0 leading-tight">
        <div className="text-[17px] font-extrabold tracking-tight text-ink">Adoração</div>
        {subtitle && <div className="truncate text-[12px] font-semibold text-muted">{subtitle}</div>}
      </div>
    </div>
  )
}
