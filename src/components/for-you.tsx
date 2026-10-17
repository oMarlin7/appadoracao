import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  AudioLines,
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  Church,
  Coffee,
  Flame,
  Gift,
  Heart,
  Lightbulb,
  ListMusic,
  Megaphone,
  MessageCircleHeart,
  Mic,
  Music,
  PartyPopper,
  Pencil,
  Pin,
  Plus,
  Shirt,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  Trophy,
  Users,
  Vote,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AvatarStack } from '@/components/avatar'
import { SongCover } from '@/components/song-bits'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Chip, Field, Input, Segmented, Switch, Textarea } from '@/components/ui/primitives'
import { Sheet, confirm } from '@/components/ui/sheet'
import { deleteAnnouncement, saveAnnouncement, setAttendance } from '@/lib/actions'
import { buildInbox, type InboxItem, type InboxVisual } from '@/lib/inbox'
import { readJson, writeStorage } from '@/lib/storage'
import { useIsAdmin, useMe, useRows, useTable } from '@/lib/store'
import { PASTELS, ROLES, ink, soft, solid, type Pastel } from '@/lib/taxonomy'
import { addDays, cn, dayOfMonth, firstName, monthShort, toLocalDateString, weekdayName } from '@/lib/utils'
import type { Announcement, Id } from '@/types'

// ---------------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------------

/** Ícones que o líder pode escolher para um aviso. */
export const ANNOUNCEMENT_ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  calendar: CalendarClock,
  mic: Mic,
  music: Music,
  church: Church,
  heart: Heart,
  star: Star,
  party: PartyPopper,
  coffee: Coffee,
  shirt: Shirt,
  gift: Gift,
  alert: TriangleAlert,
}

const ICONS: Record<string, LucideIcon> = {
  ...ANNOUNCEMENT_ICONS,
  audio: AudioLines,
  vote: Vote,
  lightbulb: Lightbulb,
  trophy: Trophy,
  message: MessageCircleHeart,
  flame: Flame,
  list: ListMusic,
  users: Users,
  sparkles: Sparkles,
}

const iconFor = (key: string) => ICONS[key] ?? Bell

// ---------------------------------------------------------------------------
// Dados do painel
// ---------------------------------------------------------------------------

const dismissKey = (userId: Id) => `adoracao:inbox:dispensados:${userId}`

/** Avisos do membro logado (recalcula a cada minuto por causa dos prazos). */
export function useInbox() {
  const me = useMe()
  const profiles = useRows('profiles')
  const services = useRows('services')
  const songs = useTable('songs')
  const attendance = useRows('attendance')
  const suggestions = useRows('suggestions')
  const votes = useRows('votes')
  const polls = useTable('song_polls')
  const team = useTable('team_settings').team
  const announcements = useRows('announcements')
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const [dismissed, setDismissed] = useState<string[]>(() => (me ? readJson<string[]>('local', dismissKey(me.id), []) : []))
  const meId = me?.id
  useEffect(() => {
    if (meId) setDismissed(readJson<string[]>('local', dismissKey(meId), []))
  }, [meId])

  const items = useMemo(
    () => (me ? buildInbox({ me, profiles, services, songs, attendance, suggestions, votes, polls, team, announcements, now: new Date(tick) }) : []),
    [me, profiles, services, songs, attendance, suggestions, votes, polls, team, announcements, tick],
  )
  const dismiss = (id: string) => {
    if (!me) return
    const next = [...new Set([...dismissed, id])].slice(-200)
    setDismissed(next)
    writeStorage('local', dismissKey(me.id), JSON.stringify(next))
  }
  const restore = () => {
    if (!me) return
    setDismissed([])
    writeStorage('local', dismissKey(me.id), '[]')
  }
  const visible = items.filter((i) => !dismissed.includes(i.id))
  return { items, visible, dismissed, dismiss, restore, urgent: visible.filter((i) => i.priority >= 60).length }
}

// ---------------------------------------------------------------------------
// Visuais
// ---------------------------------------------------------------------------

function Ring({ value, label, color }: { value: number; label: string; color: Pastel }) {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="8" style={{ stroke: soft(color) }} />
        <motion.circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          style={{ stroke: solid(color) }}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0.02, Math.min(1, value))) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[16px] font-extrabold tabular-nums" style={{ color: ink(color) }}>
        {label}
      </span>
    </div>
  )
}

function Countdown({ to, color }: { to: string; color: Pastel }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const ms = Math.max(0, new Date(to).getTime() - now)
  const d = Math.floor(ms / 86400_000)
  const h = Math.floor((ms % 86400_000) / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const parts = d > 0 ? [[d, 'd'], [h, 'h']] : [[h, 'h'], [m, 'min']]
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex gap-1">
        {parts.map(([n, u]) => (
          <motion.span
            key={u}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="grid h-12 min-w-11 place-items-center rounded-2xl bg-surface/80 px-1.5 shadow-card"
            style={{ color: ink(color) }}
          >
            <span className="text-[19px] leading-none font-extrabold tabular-nums">{n}</span>
            <span className="-mt-1 text-[10px] font-bold opacity-70">{u}</span>
          </motion.span>
        ))}
      </div>
      <span className="text-[10.5px] font-bold tracking-wide uppercase" style={{ color: ink(color) }}>
        para fechar
      </span>
    </div>
  )
}

function Covers({ songIds }: { songIds: Id[] }) {
  const songs = useTable('songs')
  const list = songIds.map((id) => songs[id]).filter(Boolean).slice(0, 3)
  const rot = list.length === 1 ? [0] : list.length === 2 ? [-7, 7] : [-10, 0, 10]
  return (
    <div className="relative h-[76px] w-[86px] shrink-0">
      {list.map((s, i) => (
        <motion.div
          key={s.id}
          initial={{ rotate: 0, y: 8, opacity: 0 }}
          animate={{ rotate: rot[i], y: 0, opacity: 1 }}
          transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 260, damping: 20 }}
          className="absolute top-2 left-1/2 -ml-[30px] origin-bottom"
          style={{ zIndex: i === Math.floor(list.length / 2) ? 3 : 1 }}
        >
          <SongCover song={s} size={60} className="shadow-pop ring-2 ring-surface" />
        </motion.div>
      ))}
    </div>
  )
}

function Dots({ values, label, color }: { values: Array<'presente' | 'justificada' | 'falta' | 'sem'>; label: string; color: Pastel }) {
  const tone = { presente: 'var(--mint-solid)', justificada: 'var(--butter-solid)', falta: 'var(--rose-solid)', sem: 'var(--surface-3)' }
  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <span className="text-[22px] leading-none font-extrabold tabular-nums" style={{ color: ink(color) }}>
        {label}
      </span>
      <div className="flex gap-1">
        {values.map((v, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            title={v}
            className="size-3 rounded-full ring-2 ring-surface/70"
            style={{ background: tone[v] }}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold tracking-wide uppercase opacity-70" style={{ color: ink(color) }}>
        últimos encontros
      </span>
    </div>
  )
}

function BigIcon({ icon, color }: { icon: string; color: Pastel }) {
  const Icon = iconFor(icon)
  return (
    <motion.span
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      className="grid size-[68px] shrink-0 place-items-center rounded-[24px] shadow-card"
      style={{ background: solid(color), color: ink(color) }}
    >
      <Icon className="size-8" strokeWidth={1.9} />
    </motion.span>
  )
}

function DateTile({ date, time, color }: { date: string; time: string | null; color: Pastel }) {
  return (
    <div className="grid h-[76px] w-[66px] shrink-0 place-items-center rounded-[22px] bg-surface/85 text-center shadow-card">
      <div className="leading-none">
        <div className="text-[10.5px] font-extrabold tracking-wider" style={{ color: ink(color) }}>
          {monthShort(date)}
        </div>
        <div className="mt-0.5 text-[25px] font-extrabold text-ink">{dayOfMonth(date)}</div>
        <div className="mt-0.5 text-[10px] font-bold text-muted uppercase">{time ?? weekdayName(date, true)}</div>
      </div>
    </div>
  )
}

function Visual({ visual, color }: { visual: InboxVisual; color: Pastel }) {
  const profiles = useTable('profiles')
  switch (visual.type) {
    case 'ring':
      return <Ring value={visual.value} label={visual.label} color={visual.tone === 'bad' ? 'rose' : visual.tone === 'warn' ? 'butter' : color} />
    case 'countdown':
      return <Countdown to={visual.to} color={color} />
    case 'covers':
      return <Covers songIds={visual.songIds} />
    case 'avatars': {
      const list = visual.userIds.map((id) => profiles[id]).filter(Boolean)
      return (
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <AvatarStack profiles={list} size="md" max={3} />
          <span className="text-[10.5px] font-bold tracking-wide uppercase" style={{ color: ink(color) }}>
            {visual.label}
          </span>
        </div>
      )
    }
    case 'dots':
      return <Dots values={visual.values} label={visual.label} color={color} />
    case 'date':
      return <DateTile date={visual.date} time={visual.time} color={color} />
    case 'icon':
      return <BigIcon icon={visual.icon} color={color} />
  }
}

// ---------------------------------------------------------------------------
// Cartão
// ---------------------------------------------------------------------------

function InboxCard({ item, onDismiss, index, compact }: { item: InboxItem; onDismiss?: () => void; index: number; compact?: boolean }) {
  const me = useMe()
  const [busy, setBusy] = useState(false)
  const Icon = iconFor(item.icon)
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ delay: Math.min(index, 5) * 0.05, type: 'spring', stiffness: 300, damping: 28 }}
      className={cn(
        'relative isolate flex flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-card',
        compact ? 'w-full' : 'w-[86%] max-w-[390px] shrink-0 snap-start sm:w-[360px]',
      )}
    >
      <div className="absolute inset-0 -z-10" style={{ background: soft(item.color) }} />
      <div className="absolute -top-14 -right-12 -z-10 size-44 rounded-full opacity-60 blur-3xl" style={{ background: solid(item.color) }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-lg" style={{ background: solid(item.color), color: ink(item.color) }}>
            <Icon className="size-3.5" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold tracking-wide uppercase" style={{ color: ink(item.color) }}>
            {item.eyebrow}
          </span>
          {onDismiss && (
            <button type="button" onClick={onDismiss} aria-label="Dispensar aviso" className="-mr-1 grid size-7 place-items-center rounded-full text-muted hover:bg-surface/70 hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-1 items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] leading-snug font-extrabold tracking-tight text-ink">{item.title}</h3>
            {item.body && <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{item.body}</p>}
          </div>
          {item.visual && <Visual visual={item.visual} color={item.color} />}
        </div>
        {(item.confirm || item.cta) && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {item.confirm && me && (
              <Button
                size="sm"
                icon={Check}
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  if (await setAttendance(item.confirm!.serviceId, me.id, { status: 'confirmado' })) toast.success(`Presença confirmada, ${firstName(me.name)} 🙌`)
                  setBusy(false)
                }}
              >
                Vou estar lá
              </Button>
            )}
            {item.cta && (
              <Link
                to={item.cta.to}
                className={cn(
                  'inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[13px] font-bold transition-transform active:scale-95',
                  item.confirm ? 'bg-surface/80 text-ink' : 'bg-primary text-primary-ink shadow-[0_6px_16px_-6px_var(--primary)]',
                )}
              >
                {item.cta.label}
                <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}

// ---------------------------------------------------------------------------
// Painel no topo do início
// ---------------------------------------------------------------------------

export function ForYouPanel() {
  const me = useMe()
  const isAdmin = useIsAdmin()
  const { visible, items, dismiss } = useInbox()
  const [all, setAll] = useState(false)
  const [compose, setCompose] = useState(false)
  if (!me) return null
  return (
    <section aria-label="Para você">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink">
            Para você
            {visible.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11.5px] font-extrabold text-primary-ink">{visible.length}</span>}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Lembretes e avisos só seus, {firstName(me.name)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isAdmin && (
            <Button variant="soft" size="sm" icon={Megaphone} onClick={() => setCompose(true)}>
              Aviso
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
            Ver tudo
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <button type="button" onClick={() => setAll(true)} className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-line p-4 text-left text-[14px] font-semibold text-muted">
          <Sparkles className="size-5 text-primary" /> Você viu todos os seus avisos. {items.length > 0 && 'Toque para rever.'}
        </button>
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:px-0">
          <AnimatePresence initial mode="popLayout">
            {visible.map((it, i) => (
              <InboxCard key={it.id} item={it} index={i} onDismiss={() => dismiss(it.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}
      <InboxSheet open={all} onClose={() => setAll(false)} onCompose={() => setCompose(true)} />
      <AnnouncementSheet open={compose} onClose={() => setCompose(false)} />
    </section>
  )
}

/** Sino com o número de avisos importantes; abre a lista completa. */
export function InboxBell({ className }: { className?: string }) {
  const { urgent } = useInbox()
  const [open, setOpen] = useState(false)
  const [compose, setCompose] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={urgent ? `Avisos (${urgent} novos)` : 'Avisos'} className={cn('relative grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2', className)}>
        <Bell className="size-[21px]" strokeWidth={2.1} />
        {urgent > 0 && (
          <span className="absolute top-1 right-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rose-ink px-1 text-[10px] font-extrabold text-white dark:text-[#2a1020]">{urgent}</span>
        )}
      </button>
      <InboxSheet open={open} onClose={() => setOpen(false)} onCompose={() => setCompose(true)} />
      <AnnouncementSheet open={compose} onClose={() => setCompose(false)} />
    </>
  )
}

function InboxSheet({ open, onClose, onCompose }: { open: boolean; onClose: () => void; onCompose: () => void }) {
  const me = useMe()
  const isAdmin = useIsAdmin()
  const { items, dismissed, restore } = useInbox()
  const announcements = useRows('announcements').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const [editing, setEditing] = useState<Announcement | null>(null)
  return (
    <Sheet open={open} onClose={onClose} title={me ? `Para você, ${firstName(me.name)}` : 'Para você'} description="Seus lembretes, pendências e os avisos da liderança." size="lg">
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={it.id} className={cn(dismissed.includes(it.id) && 'opacity-60')} onClick={(e) => (e.target as HTMLElement).closest('a') && onClose()}>
            <InboxCard item={it} index={i} compact />
          </div>
        ))}
        {dismissed.length > 0 && (
          <button type="button" onClick={restore} className="w-full py-2 text-center text-[13px] font-bold text-primary">
            Mostrar de novo os avisos dispensados no início
          </button>
        )}
        {isAdmin && (
          <div className="mt-4 rounded-3xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="text-[13px] font-bold tracking-wide text-muted uppercase">Avisos publicados</div>
              <Button size="sm" variant="soft" icon={Plus} onClick={onCompose}>
                Novo aviso
              </Button>
            </div>
            {announcements.length === 0 ? (
              <p className="px-1 pb-1 text-[13px] text-muted">Nenhum aviso. Publique lembretes para toda a equipe ou só para algumas pessoas.</p>
            ) : (
              <div className="divide-y divide-line">
                {announcements.map((a) => {
                  const Icon = iconFor(a.icon)
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-1 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: solid(a.color), color: ink(a.color) }}>
                        <Icon className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 truncate text-[14px] font-bold text-ink">
                          {a.pinned && <Pin className="size-3.5 shrink-0 text-primary" />}
                          {a.title}
                        </div>
                        <div className="truncate text-[12px] text-muted">
                          {audienceLabel(a.audience)}
                          {a.endsOn ? ` · até ${a.endsOn.split('-').reverse().slice(0, 2).join('/')}` : ''}
                        </div>
                      </div>
                      <Menu
                        items={[
                          { label: 'Editar', icon: Pencil, onSelect: () => setEditing(a) },
                          {
                            label: 'Excluir aviso',
                            icon: Trash2,
                            danger: true,
                            onSelect: async () => {
                              if (await confirm({ title: 'Excluir este aviso?', confirmLabel: 'Excluir', danger: true })) await deleteAnnouncement(a.id)
                            },
                          },
                        ]}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <AnnouncementSheet open={!!editing} onClose={() => setEditing(null)} announcement={editing} />
    </Sheet>
  )
}

function audienceLabel(audience: string[]): string {
  if (!audience.length) return 'Equipe toda'
  const roles = audience.filter((a) => a.startsWith('role:')).length
  const people = audience.filter((a) => a.startsWith('user:')).length
  return [roles && `${roles} ${roles === 1 ? 'função' : 'funções'}`, people && `${people} ${people === 1 ? 'pessoa' : 'pessoas'}`].filter(Boolean).join(' + ')
}

// ---------------------------------------------------------------------------
// Novo aviso (líder)
// ---------------------------------------------------------------------------

export function AnnouncementSheet({ open, onClose, announcement }: { open: boolean; onClose: () => void; announcement?: Announcement | null }) {
  const profiles = useRows('profiles').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [icon, setIcon] = useState('megaphone')
  const [color, setColor] = useState<Pastel>('butter')
  const [target, setTarget] = useState<'todos' | 'funcoes' | 'pessoas'>('todos')
  const [audience, setAudience] = useState<string[]>([])
  const [endsOn, setEndsOn] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const a = announcement
    setTitle(a?.title ?? '')
    setBody(a?.body ?? '')
    setIcon(a?.icon ?? 'megaphone')
    setColor(a?.color ?? 'butter')
    setAudience(a?.audience ?? [])
    setTarget(!a?.audience.length ? 'todos' : a.audience.some((x) => x.startsWith('user:')) ? 'pessoas' : 'funcoes')
    setEndsOn(a?.endsOn ?? toLocalDateString(addDays(new Date(), 7)))
    setPinned(a?.pinned ?? false)
  }, [open, announcement])

  const toggle = (v: string) => setAudience((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]))
  const finalAudience = target === 'todos' ? [] : audience.filter((a) => (target === 'funcoes' ? a.startsWith('role:') : a.startsWith('user:')))
  const PreviewIcon = iconFor(icon)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={announcement ? 'Editar aviso' : 'Novo aviso'}
      description="Aparece no topo do app, no painel “Para você” de quem você escolher."
      size="lg"
      footer={
        <Button
          className="w-full"
          icon={Megaphone}
          loading={saving}
          disabled={!title.trim() || (target !== 'todos' && !finalAudience.length)}
          onClick={async () => {
            setSaving(true)
            const id = await saveAnnouncement({ id: announcement?.id, title, body, icon, color, audience: finalAudience, endsOn: endsOn || null, pinned })
            setSaving(false)
            if (id) {
              toast.success(announcement ? 'Aviso atualizado' : 'Aviso publicado para a equipe 📣')
              onClose()
            }
          }}
        >
          {announcement ? 'Salvar aviso' : 'Publicar aviso'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-3xl p-4" style={{ background: soft(color) }}>
          <div className="absolute -top-12 -right-10 size-36 rounded-full opacity-60 blur-3xl" style={{ background: solid(color) }} />
          <div className="relative flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-bold tracking-wide uppercase" style={{ color: ink(color) }}>
                Prévia do aviso
              </div>
              <div className="mt-1 text-[16px] font-extrabold text-ink">{title.trim() || 'Título do aviso'}</div>
              <p className="mt-0.5 text-[13px] text-ink-2">{body.trim() || 'Mensagem para a equipe'}</p>
            </div>
            <span className="grid size-14 shrink-0 place-items-center rounded-[20px]" style={{ background: solid(color), color: ink(color) }}>
              <PreviewIcon className="size-7" />
            </span>
          </div>
        </div>
        <Field label="Título">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Ensaio geral na quinta, 20h" maxLength={80} />}</Field>
        <Field label="Mensagem" hint="opcional">
          {(id) => <Textarea id={id} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ex.: Tragam a cifra impressa. Quem puder chegar 19h45 ajuda a montar o som 🙏" />}
        </Field>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Ícone e cor</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ANNOUNCEMENT_ICONS).map(([key, I]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn('grid size-10 place-items-center rounded-2xl border', icon === key ? 'border-transparent bg-primary text-primary-ink' : 'border-line text-ink-2 hover:bg-surface-2')}
              >
                <I className="size-5" />
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {PASTELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn('size-8 rounded-full transition-transform', color === c ? 'scale-110 ring-[3px] ring-primary ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                style={{ background: solid(c) }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Para quem</div>
          <Segmented
            size="sm"
            value={target}
            onChange={setTarget}
            options={[
              { value: 'todos', label: 'Equipe toda' },
              { value: 'funcoes', label: 'Por função' },
              { value: 'pessoas', label: 'Pessoas' },
            ]}
          />
          {target === 'funcoes' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <Chip key={r.id} size="sm" icon={r.icon} color={r.color} selected={audience.includes(`role:${r.id}`)} onClick={() => toggle(`role:${r.id}`)}>
                  {r.name}
                </Chip>
              ))}
            </div>
          )}
          {target === 'pessoas' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {profiles.map((p) => (
                <Chip key={p.id} size="sm" selected={audience.includes(`user:${p.id}`)} onClick={() => toggle(`user:${p.id}`)}>
                  {firstName(p.name)}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mostrar até" hint="opcional">
            {(id) => <Input id={id} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}
          </Field>
          <div className="sm:pt-6">
            <Switch checked={pinned} onChange={setPinned} label="Fixar no topo" description="Aparece antes dos lembretes" />
          </div>
        </div>
      </div>
    </Sheet>
  )
}
