import { useState } from 'react'
import { cn, initials } from '@/lib/utils'
import { solid, ink, type Pastel } from '@/lib/taxonomy'
import type { Profile } from '@/types'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11.5px]',
  md: 'size-10 text-[13px]',
  lg: 'size-14 text-[17px]',
  xl: 'size-20 text-2xl',
  '2xl': 'size-24 text-3xl',
}

export function Avatar({
  profile,
  name,
  color,
  size = 'md',
  className,
  ring,
}: {
  profile?: Pick<Profile, 'name' | 'color' | 'avatarUrl'> | null
  name?: string
  color?: Pastel
  size?: keyof typeof SIZES
  className?: string
  ring?: boolean
}) {
  const n = profile?.name ?? name ?? '?'
  const c = profile?.color ?? color ?? 'lavender'
  const photo = profile?.avatarUrl || null
  const [failed, setFailed] = useState<string | null>(null)
  const showPhoto = photo && failed !== photo
  return (
    <span
      title={n}
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-bold tracking-tight select-none',
        SIZES[size],
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={{ background: solid(c), color: ink(c) }}
    >
      {showPhoto ? (
        <img src={photo} alt="" draggable={false} onError={() => setFailed(photo)} className="absolute inset-0 size-full object-cover" />
      ) : (
        initials(n)
      )}
    </span>
  )
}

export function AvatarStack({
  profiles,
  max = 4,
  size = 'sm',
  className,
}: {
  profiles: Array<Pick<Profile, 'id' | 'name' | 'color' | 'avatarUrl'>>
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
