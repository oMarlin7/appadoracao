import { cn, initials } from '@/lib/utils'
import { solid, ink, type Pastel } from '@/lib/taxonomy'
import type { Profile } from '@/types'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11.5px]',
  md: 'size-10 text-[13px]',
  lg: 'size-14 text-[17px]',
  xl: 'size-20 text-2xl',
}

export function Avatar({
  profile,
  name,
  color,
  size = 'md',
  className,
  ring,
}: {
  profile?: Pick<Profile, 'name' | 'color'> | null
  name?: string
  color?: Pastel
  size?: keyof typeof SIZES
  className?: string
  ring?: boolean
}) {
  const n = profile?.name ?? name ?? '?'
  const c = profile?.color ?? color ?? 'lavender'
  return (
    <span
      title={n}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-bold tracking-tight select-none',
        SIZES[size],
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={{ background: solid(c), color: ink(c) }}
    >
      {initials(n)}
    </span>
  )
}

export function AvatarStack({
  profiles,
  max = 4,
  size = 'sm',
  className,
}: {
  profiles: Array<Pick<Profile, 'id' | 'name' | 'color'>>
  max?: number
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const shown = profiles.slice(0, max)
  const rest = profiles.length - shown.length
  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((p, i) => (
        <Avatar key={p.id} profile={p} size={size} ring className={i > 0 ? (size === 'xs' ? '-ml-1' : '-ml-2') : undefined} />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            'inline-grid shrink-0 place-items-center rounded-full bg-surface-2 font-bold text-muted ring-2 ring-surface',
            SIZES[size],
            size === 'xs' ? '-ml-1' : '-ml-2',
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
