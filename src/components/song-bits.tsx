import { memo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Heart, Music } from 'lucide-react'
import { prettyAccidentals } from '@/lib/music/theory'
import { MOMENT_BY_ID, PASTELS, THEME_BY_ID, ink, soft, solid, tint, type Pastel, type Theme } from '@/lib/taxonomy'
import { cn, hashString } from '@/lib/utils'
import type { Song } from '@/types'

// ---------------------------------------------------------------------------
// Capa gerada (arte em degradê pastel, única para cada música)
// ---------------------------------------------------------------------------

export function coverColors(song: Pick<Song, 'id' | 'themes'>): [Pastel, Pastel] {
  const h = hashString(song.id)
  const first = song.themes[0] ? THEME_BY_ID[song.themes[0]]?.color : undefined
  const a = first ?? PASTELS[h % PASTELS.length]
  const secondTheme = song.themes[1] ? THEME_BY_ID[song.themes[1]]?.color : undefined
  let b = secondTheme && secondTheme !== a ? secondTheme : PASTELS[(h >>> 4) % PASTELS.length]
  if (b === a) b = PASTELS[(PASTELS.indexOf(a) + 3) % PASTELS.length]
  return [a, b]
}

function Pattern({ kind, color }: { kind: number; color: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 1.4, opacity: 0.45 }
  switch (kind) {
    case 0:
      return (
        <g {...common}>
          {[18, 30, 42, 54, 66].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} />
          ))}
        </g>
      )
    case 1:
      return (
        <g {...common}>
          {[52, 64, 76, 88].map((y) => (
            <path key={y} d={`M-5 ${y} C 25 ${y - 14}, 45 ${y + 14}, 70 ${y} S 110 ${y - 12}, 110 ${y}`} />
          ))}
        </g>
      )
    case 2:
      return (
        <g {...common}>
          {Array.from({ length: 9 }, (_, i) => {
            const a = (Math.PI / 2) * (i / 8) + Math.PI
            return <line key={i} x1="100" y1="100" x2={100 + Math.cos(a) * 150} y2={100 + Math.sin(a) * 150} />
          })}
        </g>
      )
    default:
      return (
        <g fill={color} opacity={0.4}>
          {Array.from({ length: 25 }, (_, i) => (
            <circle key={i} cx={58 + (i % 5) * 9} cy={58 + Math.floor(i / 5) * 9} r={1.6} />
          ))}
        </g>
      )
  }
}

export const SongCover = memo(function SongCover({
  song,
  size = 48,
  className,
  rounded,
}: {
  song: Pick<Song, 'id' | 'themes' | 'coverUrl'>
  size?: number
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const photo = song.coverUrl && failed !== song.coverUrl ? song.coverUrl : null
  const [a, b] = coverColors(song)
  const h = hashString(song.id + 'x')
  const theme = song.themes[0] ? THEME_BY_ID[song.themes[0]] : undefined
  const Icon = theme?.icon ?? Music
  const angle = 120 + (h % 90)
  return (
    <div
      className={cn('cover-art relative shrink-0 overflow-hidden', rounded ?? (size >= 80 ? 'rounded-3xl' : 'rounded-[14px]'), className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at ${20 + (h % 30)}% 18%, rgb(255 255 255 / 0.55), transparent 55%), linear-gradient(${angle}deg, ${solid(a)}, ${solid(b)})`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
        <Pattern kind={h % 4} color={ink(a)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <Icon style={{ color: ink(a), width: size * 0.42, height: size * 0.42 }} strokeWidth={size > 70 ? 1.6 : 1.9} />
      </div>
      {photo && (
        <img
          src={photo}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(photo)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Selo de tom
// ---------------------------------------------------------------------------

export function KeyBadge({
  value,
  kind = 'team',
  className,
  label,
}: {
  value: string | null | undefined
  kind?: 'team' | 'original' | 'personal' | 'service'
  className?: string
  label?: string
}) {
  if (!value) return null
  const styles: Record<string, string> = {
    team: 'bg-primary-soft text-primary',
    original: 'bg-surface-2 text-ink-2',
    personal: 'bg-mint text-mint-ink',
    service: 'bg-butter text-butter-ink',
  }
  return (
    <span
      title={label}
      className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded-[10px] px-2 text-[13px] font-extrabold tracking-tight tabular-nums', styles[kind], className)}
    >
      {prettyAccidentals(value)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Linha de música (listas)
// ---------------------------------------------------------------------------

export function songSubtitle(song: Song, opts: { themes?: boolean } = { themes: true }): string {
  const parts = [song.artist || 'Artista não informado']
  if (opts.themes && song.themes.length) parts.push(song.themes.slice(0, 2).map((t) => THEME_BY_ID[t]?.short ?? THEME_BY_ID[t]?.name ?? t).join(', '))
  return parts.join(' · ')
}

export function SongRow({
  song,
  to,
  onClick,
  favorite,
  onToggleFavorite,
  keyValue,
  right,
  snippet,
  leading,
  className,
  subtitle,
}: {
  song: Song
  to?: string
  onClick?: () => void
  favorite?: boolean
  onToggleFavorite?: () => void
  keyValue?: string | null
  right?: ReactNode
  snippet?: string | null
  leading?: ReactNode
  className?: string
  subtitle?: ReactNode
}) {
  const body = (
    <>
      {leading}
      <SongCover song={song} size={50} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold tracking-tight text-ink">{song.title}</div>
        <div className="mt-0.5 truncate text-[13px] text-muted">{subtitle ?? songSubtitle(song)}</div>
        {snippet && <div className="mt-1 line-clamp-1 text-[12.5px] text-ink-2 italic">“{snippet}”</div>}
      </div>
    </>
  )
  const cls = 'flex min-w-0 flex-1 items-center gap-3.5 text-left'
  return (
    <div className={cn('group flex items-center gap-2 rounded-2xl px-2 py-2 transition-colors hover:bg-surface-2/70', className)}>
      {to ? (
        <Link to={to} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      )}
      <KeyBadge value={keyValue === undefined ? (song.teamKey ?? song.originalKey) : keyValue} kind={song.teamKey ? 'team' : 'original'} />
      {onToggleFavorite && (
        <button
          type="button"
          aria-label={favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full transition-all active:scale-90',
            favorite ? 'text-rose-ink' : 'text-muted/70 hover:bg-surface-2 hover:text-ink-2',
          )}
        >
          <Heart className={cn('size-[19px]', favorite && 'fill-current')} strokeWidth={2.1} />
        </button>
      )}
      {right}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card de música (carrosséis)
// ---------------------------------------------------------------------------

export function SongCard({ song, to, className, caption }: { song: Song; to: string; className?: string; caption?: ReactNode }) {
  return (
    <Link to={to} className={cn('group block w-36 shrink-0 sm:w-40', className)}>
      <SongCover song={song} size={160} className="aspect-square !h-auto !w-full transition-transform duration-300 group-hover:-translate-y-0.5" rounded="rounded-3xl" />
      <div className="mt-2.5 px-0.5">
        <div className="truncate text-[14px] font-bold tracking-tight text-ink">{song.title}</div>
        <div className="truncate text-[12.5px] text-muted">{caption ?? song.artist}</div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Tema / momento
// ---------------------------------------------------------------------------

export function ThemeTile({ theme, count, to, className }: { theme: Theme; count: number; to: string; className?: string }) {
  const Icon = theme.icon
  return (
    <Link
      to={to}
      className={cn('group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-3xl p-4 transition-transform duration-200 active:scale-[0.98]', className)}
      style={{ background: soft(theme.color) }}
    >
      <div
        className="absolute -top-8 -right-8 size-28 rounded-full opacity-70 blur-2xl transition-transform duration-500 group-hover:scale-125"
        style={{ background: solid(theme.color) }}
      />
      <div className="relative grid size-10 place-items-center rounded-2xl bg-white/60 dark:bg-white/10" style={{ color: ink(theme.color) }}>
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="relative">
        <div className="text-[14.5px] leading-tight font-bold" style={{ color: ink(theme.color) }}>
          {theme.short ?? theme.name}
        </div>
        <div className="mt-0.5 text-[12px] font-semibold opacity-75" style={{ color: ink(theme.color) }}>
          {count === 1 ? '1 música' : `${count} músicas`}
        </div>
      </div>
    </Link>
  )
}

export function MomentPill({ id, className }: { id: string | null | undefined; className?: string }) {
  const m = id ? MOMENT_BY_ID[id] : undefined
  if (!m) return null
  const Icon = m.icon
  return (
    <span style={tint(m.color)} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold', className)}>
      <Icon className="size-3" strokeWidth={2.5} />
      {m.short ?? m.name}
    </span>
  )
}
