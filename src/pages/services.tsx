import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Reorder, useDragControls } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  GripVertical,
  Lightbulb,
  MessageCircle,
  Mic,
  Mic2,
  Music,
  Pencil,
  Play,
  Plus,
  Sparkles,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import { SongPickerSheet } from '@/components/action-sheets'
import { Avatar, AvatarStack } from '@/components/avatar'
import { KeyGrid } from '@/components/key-picker'
import { HeaderAvatar, Page, PageHeader, TopBar } from '@/components/layout'
import { KeyBadge, MomentPill, SongCover } from '@/components/song-bits'
import { Button, IconButton, LinkButton } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Card, Chip, EmptyState, SectionTitle, Segmented, Textarea } from '@/components/ui/primitives'
import { ServiceAttendance } from '@/components/attendance'
import { AddRecordingSheet, RecordingRow } from '@/components/media'
import { Sheet, confirm } from '@/components/ui/sheet'
import {
  addToService,
  deleteService,
  deleteSuggestion,
  newService,
  saveService,
  sendMessage,
  setSuggestionStatus,
  toggleReaction,
  updateServiceItems,
} from '@/lib/actions'
import { useDocumentTitle, useServices } from '@/lib/hooks'
import { keyCompatibility, parseKey, prettyAccidentals } from '@/lib/music/theory'
import { buildSetlist, recommend } from '@/lib/recommend'
import { useMe, useRow, useRows, useSettings, useTable } from '@/lib/store'
import { MOMENTS, ROLES } from '@/lib/taxonomy'
import { cn, compact, dayOfMonth, firstName, friendlyDate, monthShort, plural, relativeDays, timeAgo, uid, weekdayName } from '@/lib/utils'
import type { Assignment, Service, SetlistItem, Song } from '@/types'

export function DateBlock({ date, size = 'md', className }: { date: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-2xl bg-surface-2 text-center',
        size === 'md' ? 'h-16 w-15' : 'h-12 w-12 rounded-xl',
        className,
      )}
    >
      <div className="leading-none">
        <div className={cn('font-extrabold tracking-wider text-primary', size === 'md' ? 'text-[11px]' : 'text-[9.5px]')}>{monthShort(date)}</div>
        <div className={cn('mt-0.5 font-extrabold text-ink', size === 'md' ? 'text-[24px]' : 'text-[18px]')}>{dayOfMonth(date)}</div>
        {size === 'md' && <div className="mt-0.5 text-[10px] font-bold text-muted uppercase">{weekdayName(date, true)}</div>}
      </div>
    </div>
  )
}

function ServiceCard({ service }: { service: Service }) {
  const profiles = useTable('profiles')
  const songs = useTable('songs')
  const suggestions = useRows('suggestions')
  const pending = suggestions.filter((s) => s.serviceId === service.id && s.status === 'pendente').length
  const leader = service.leaderId ? profiles[service.leaderId] : undefined
  const team = compact(Array.from(new Set(service.team.map((t) => t.userId))).map((id) => profiles[id]))
  const items = service.items.filter((i) => songs[i.songId])
  return (
    <Link to={`/cultos/${service.id}`} className="block">
      <Card className="flex gap-4 p-4 transition-transform hover:-translate-y-0.5 active:scale-[0.99]">
        <DateBlock date={service.date} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold text-ink">{service.title}</div>
              <div className="text-[13px] text-muted">
                {service.time ? `${service.time} · ` : ''}
                {relativeDays(service.date)}
              </div>
            </div>
            {pending > 0 && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-butter px-2 py-0.5 text-[11.5px] font-bold text-butter-ink">
                <Lightbulb className="size-3" /> {pending}
              </span>
            )}
          </div>
          {service.theme && <p className="mt-1.5 line-clamp-1 text-[13.5px] text-ink-2">“{service.theme}”</p>}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center">
              {items.slice(0, 5).map((it, i) => (
                <SongCover key={it.id} song={songs[it.songId]} size={28} rounded="rounded-[9px]" className={cn('ring-2 ring-surface', i > 0 && '-ml-1.5')} />
              ))}
              <span className="ml-2 text-[12.5px] font-semibold text-muted">{items.length ? plural(items.length, 'música', 'músicas') : 'Setlist vazio'}</span>
            </div>
            <div className="flex items-center gap-2">
              {leader && <Avatar profile={leader} size="xs" />}
              {team.length > 1 && <AvatarStack profiles={team} size="xs" max={4} />}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

export function ServicesPage() {
  useDocumentTitle('Cultos')
  const { upcoming, past } = useServices()
  const [tab, setTab] = useState<'proximos' | 'anteriores'>('proximos')
  const list = tab === 'proximos' ? upcoming : past
  return (
    <Page>
      <PageHeader
        title="Cultos"
        subtitle="Setlists, escala e sugestões de cada culto"
        actions={
          <>
            <LinkButton to="/cultos/novo" icon={Plus} className="hidden sm:inline-flex">
              Novo culto
            </LinkButton>
            <HeaderAvatar />
          </>
        }
      />
      <div className="mb-5 flex items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'proximos', label: `Próximos${upcoming.length ? ` (${upcoming.length})` : ''}` },
            { value: 'anteriores', label: 'Anteriores' },
          ]}
        />
        <LinkButton to="/cultos/novo" icon={Plus} size="sm" variant="soft" className="sm:hidden">
          Novo
        </LinkButton>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          color="butter"
          title={tab === 'proximos' ? 'Nenhum culto agendado' : 'Nenhum culto anterior'}
          description={tab === 'proximos' ? 'Agende o próximo culto e monte o setlist junto com a equipe.' : 'Os cultos realizados ficam guardados aqui como histórico.'}
          action={
            tab === 'proximos' && (
              <LinkButton to="/cultos/novo" icon={Plus}>
                Agendar culto
              </LinkButton>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Página do culto
// ---------------------------------------------------------------------------

function KeyFlow({ items, songs }: { items: SetlistItem[]; songs: Record<string, Song> }) {
  const keys = items.map((i) => i.key ?? songs[i.songId]?.teamKey ?? songs[i.songId]?.originalKey ?? null)
  if (keys.filter(Boolean).length < 2) return null
  return (
    <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1">
      <span className="mr-1 text-[12px] font-bold tracking-wide text-muted uppercase">Fluxo de tons</span>
      {keys.map((k, i) => {
        const prev = i > 0 ? keys[i - 1] : null
        const comp = prev && k ? keyCompatibility(prev, k) : null
        return (
          <span key={i} className="flex shrink-0 items-center gap-1">
            {i > 0 && (
              <span title={comp === 0 ? 'Salto de tom: prepare uma transição' : 'Transição suave'} className={cn('text-[11px]', comp === 0 ? 'text-peach-ink' : 'text-muted')}>
                {comp === 0 ? <TriangleAlert className="size-3.5" /> : '→'}
              </span>
            )}
            <span className="rounded-lg bg-surface-2 px-2 py-0.5 text-[12.5px] font-extrabold text-ink-2">{k ? prettyAccidentals(k) : '?'}</span>
          </span>
        )
      })}
    </div>
  )
}

function SetlistRow({
  item,
  index,
  song,
  serviceId,
  onEdit,
  onDragEnd,
}: {
  item: SetlistItem
  index: number
  song: Song
  serviceId: string
  onEdit: () => void
  onDragEnd: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative flex items-center gap-2 rounded-2xl bg-surface py-2 pr-2 pl-1"
      whileDrag={{ scale: 1.02, boxShadow: 'var(--sh-2)', zIndex: 10 }}
    >
      <button
        type="button"
        aria-label="Arrastar para reordenar"
        onPointerDown={(e) => controls.start(e)}
        className="grid h-12 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted/60 hover:text-ink-2 active:cursor-grabbing"
      >
        <GripVertical className="size-[18px]" />
      </button>
      <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-muted tabular-nums">{index + 1}</span>
      <Link to={`/musica/${song.id}?culto=${serviceId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <SongCover song={song} size={46} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">{song.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <MomentPill id={item.moment} />
            {item.notes && <span className="truncate text-[12.5px] text-muted">{item.notes}</span>}
            {!item.moment && !item.notes && <span className="truncate text-[12.5px] text-muted">{song.artist}</span>}
          </div>
        </div>
      </Link>
      <button type="button" onClick={onEdit} aria-label="Editar tom e notas" className="shrink-0 rounded-xl p-1 hover:bg-surface-2">
        <KeyBadge value={item.key ?? song.teamKey ?? song.originalKey} kind="service" />
      </button>
    </Reorder.Item>
  )
}

function ItemSheet({ service, item, onClose }: { service: Service; item: SetlistItem | null; onClose: () => void }) {
  const songs = useTable('songs')
  const accidentals = useSettings((s) => s.accidentals)
  // Mantém o último item durante a animação de saída.
  const [draft, setDraft] = useState<SetlistItem | null>(item)
  useEffect(() => {
    if (item) setDraft(item)
  }, [item])
  const song = draft ? songs[draft.songId] : undefined
  if (!draft || !song) return null
  const base = song.originalKey
  const minor = parseKey(draft.key ?? base)?.minor ?? false
  const marks: Record<string, string> = {}
  if (base) marks[base] = 'Original'
  if (song.teamKey) marks[song.teamKey] = 'Equipe'
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={song.title}
      description="Tom, momento e observações só para este culto."
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              await updateServiceItems(
                service.id,
                service.items.filter((i) => i.id !== draft.id),
              )
              onClose()
            }}
          >
            Remover
          </Button>
          <Button
            className="flex-1"
            icon={Check}
            onClick={async () => {
              await updateServiceItems(
                service.id,
                service.items.map((i) => (i.id === draft.id ? draft : i)),
              )
              onClose()
            }}
          >
            Salvar
          </Button>
        </div>
      }
    >
      {base && (
        <div className="mb-5">
          <div className="mb-2 text-[13px] font-bold text-ink-2">Tom neste culto</div>
          <KeyGrid value={draft.key ?? song.teamKey ?? base} onChange={(k) => setDraft({ ...draft, key: k })} minor={minor} pref={accidentals} marks={marks} />
        </div>
      )}
      <div className="mb-5">
        <div className="mb-2 text-[13px] font-bold text-ink-2">Momento</div>
        <div className="flex flex-wrap gap-2">
          {MOMENTS.map((m) => (
            <Chip key={m.id} size="sm" icon={m.icon} color={m.color} selected={draft.moment === m.id} onClick={() => setDraft({ ...draft, moment: draft.moment === m.id ? null : m.id })}>
              {m.short ?? m.name}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-bold text-ink-2">Observações</div>
        <Textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Ex.: repetir o refrão 2x, entrar só voz e violão…" />
      </div>
    </Sheet>
  )
}

function TeamSheet({ service, open, onClose }: { service: Service; open: boolean; onClose: () => void }) {
  const profiles = useRows('profiles')
  const [team, setTeam] = useState<Assignment[]>(service.team)
  useEffect(() => {
    if (open) setTeam(service.team)
  }, [open, service.team])
  const has = (userId: string, role: string) => team.some((t) => t.userId === userId && t.role === role)
  const toggle = (userId: string, role: string) =>
    setTeam((t) => (has(userId, role) ? t.filter((x) => !(x.userId === userId && x.role === role)) : [...t, { userId, role }]))
  const sorted = profiles.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Escala do culto"
      description="Toque nas funções de cada pessoa neste culto."
      tall
      footer={
        <Button
          className="w-full"
          icon={Check}
          onClick={async () => {
            await saveService({ ...service, team })
            toast.success('Escala atualizada')
            onClose()
          }}
        >
          Salvar escala
        </Button>
      }
    >
      <div className="space-y-4">
        {sorted.map((p) => {
          const roles = [...ROLES].sort((a, b) => Number(p.functions.includes(b.id)) - Number(p.functions.includes(a.id)))
          return (
            <div key={p.id} className="rounded-2xl border border-line p-3">
              <div className="mb-2.5 flex items-center gap-2.5">
                <Avatar profile={p} size="sm" />
                <span className="text-[14.5px] font-bold text-ink">{p.name}</span>
              </div>
              <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
                {roles.map((r) => (
                  <Chip key={r.id} size="sm" icon={r.icon} color={r.color} selected={has(p.id, r.id)} onClick={() => toggle(p.id, r.id)} className={cn(!p.functions.includes(r.id) && !has(p.id, r.id) && 'opacity-60')}>
                    {r.name}
                  </Chip>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

function AutoSetlistSheet({ service, open, onClose }: { service: Service; open: boolean; onClose: () => void }) {
  const songs = useRows('songs')
  const services = useRows('services')
  const favorites = useRows('favorites')
  // "Outra opção" evita as músicas já sugeridas (quando o acervo permite).
  const [avoid, setAvoid] = useState<string[]>([])
  useEffect(() => {
    if (open) setAvoid([])
  }, [open])
  const suggestions = useMemo(() => {
    const ctx = { songs, services: services.filter((s) => s.id !== service.id), favorites }
    return buildSetlist(ctx, { message: `${service.theme} ${service.bibleText}`, existing: service.items, avoidIds: avoid })
  }, [songs, services, favorites, service, avoid])
  const [skip, setSkip] = useState<Set<string>>(new Set())
  useEffect(() => setSkip(new Set()), [suggestions])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Montar setlist com o assistente"
      description={service.theme ? `Fluxo completo pensado para “${service.theme}”, emendando os tons.` : 'Fluxo completo de abertura a ministração, emendando os tons.'}
      tall
      footer={
        <div className="flex gap-2">
          <Button variant="outline" icon={Sparkles} onClick={() => setAvoid((a) => [...a, ...suggestions.map((s) => s.song.id)])}>
            Outra opção
          </Button>
          <Button
            className="flex-1"
            icon={Plus}
            disabled={suggestions.length === skip.size}
            onClick={async () => {
              for (const s of suggestions) if (!skip.has(s.song.id)) await addToService(service.id, s.song.id, { key: s.key, moment: s.moment })
              toast.success('Setlist montado! Ajuste o que quiser.')
              onClose()
            }}
          >
            Adicionar {suggestions.length - skip.size} ao culto
          </Button>
        </div>
      }
    >
      {suggestions.length === 0 ? (
        <EmptyState icon={Music} title="Acervo pequeno demais" description="Cadastre mais músicas com temas e momentos para o assistente montar o setlist." />
      ) : (
        <div className="space-y-2">
          {suggestions.map((s, i) => {
            const off = skip.has(s.song.id)
            return (
              <button
                key={s.song.id}
                type="button"
                onClick={() => setSkip((set) => {
                  const next = new Set(set)
                  if (next.has(s.song.id)) next.delete(s.song.id)
                  else next.add(s.song.id)
                  return next
                })}
                className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all', off ? 'border-line opacity-50' : 'border-primary/30 bg-primary-soft/40')}
              >
                <span className="w-5 text-center text-[13px] font-extrabold text-muted">{i + 1}</span>
                <SongCover song={s.song} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{s.song.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <MomentPill id={s.moment} />
                    <span className="truncate text-[12px] text-muted">{s.reasons.filter((r) => !r.startsWith('Ideal')).slice(0, 2).join(' · ')}</span>
                  </span>
                </span>
                <KeyBadge value={s.key} kind="service" />
                <span className={cn('grid size-6 place-items-center rounded-full', off ? 'bg-surface-2' : 'bg-primary text-primary-ink')}>
                  {off ? <X className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

function ServiceRecordings({ service }: { service: Service }) {
  const recordings = useRows('recordings')
    .filter((r) => r.serviceId === service.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [open, setOpen] = useState(false)
  return (
    <section className="mt-8">
      <SectionTitle
        title="Gravações"
        subtitle={recordings.length ? 'Para estudar em casa — o áudio continua tocando enquanto você navega.' : undefined}
        action={
          <Button variant="ghost" size="sm" icon={Mic} onClick={() => setOpen(true)}>
            Gravar / enviar
          </Button>
        }
      />
      {recordings.length ? (
        <Card className="divide-y divide-line p-1.5">
          {recordings.map((r) => (
            <RecordingRow key={r.id} rec={r} showSong />
          ))}
        </Card>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-surface-3 p-4 text-left text-[14px] font-semibold text-muted hover:bg-surface-2">
          <Mic className="size-5" /> Grave o ensaio pelo celular para a equipe ouvir depois.
        </button>
      )}
      <AddRecordingSheet open={open} onClose={() => setOpen(false)} serviceId={service.id} />
    </section>
  )
}

function ServiceSuggestions({ service, canManage }: { service: Service; canManage: boolean }) {
  const me = useMe()
  const suggestions = useRows('suggestions')
  const reactions = useRows('reactions')
  const songs = useTable('songs')
  const profiles = useTable('profiles')
  const list = suggestions
    .filter((s) => s.serviceId === service.id && s.status === 'pendente' && songs[s.songId])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!list.length) return null
  return (
    <section className="mt-8">
      <SectionTitle title="Sugestões para este culto" subtitle="Apoie as que você curtiu. O líder decide o que entra." />
      <div className="space-y-2.5">
        {list.map((s) => {
          const song = songs[s.songId]
          const by = profiles[s.userId]
          const votes = reactions.filter((r) => r.targetType === 'suggestion' && r.targetId === s.id)
          const voted = votes.some((v) => v.userId === me?.id)
          return (
            <Card key={s.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <Link to={`/musica/${song.id}`}>
                  <SongCover song={song} size={48} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/musica/${song.id}`} className="block truncate text-[15px] font-bold text-ink">
                    {song.title}
                  </Link>
                  <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    {by && <Avatar profile={by} size="xs" />}
                    {by ? firstName(by.name) : 'Alguém'} · {timeAgo(s.createdAt)}
                  </div>
                  {s.note && <p className="mt-1.5 text-[13.5px] text-ink-2">{s.note}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={voted ? 'soft' : 'outline'} icon={ThumbsUp} onClick={() => void toggleReaction('suggestion', s.id, '👍')}>
                  {voted ? 'Apoiado' : 'Apoiar'} {votes.length > 0 && `· ${votes.length}`}
                </Button>
                {votes.length > 0 && <AvatarStack profiles={compact(votes.map((v) => profiles[v.userId]))} size="xs" />}
                {canManage && (
                  <div className="ml-auto flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => void setSuggestionStatus(s.id, 'recusada')}>
                      Agora não
                    </Button>
                    <Button
                      size="sm"
                      icon={Plus}
                      onClick={async () => {
                        if (await setSuggestionStatus(s.id, 'aceita')) toast.success('Sugestão aceita e adicionada ao setlist')
                      }}
                    >
                      Aceitar
                    </Button>
                  </div>
                )}
                {!canManage && s.userId === me?.id && <IconButton icon={Trash2} size="sm" label="Remover sugestão" onClick={() => void deleteSuggestion(s.id)} />}
              </div>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export function ServicePage() {
  const { id = '' } = useParams()
  const service = useRow('services', id)
  useDocumentTitle(service?.title)
  if (!service)
    return (
      <>
        <TopBar backTo="/cultos" />
        <Page>
          <EmptyState icon={CalendarDays} title="Culto não encontrado" action={<LinkButton to="/cultos">Ver cultos</LinkButton>} />
        </Page>
      </>
    )
  return <ServiceView service={service} />
}

function ServiceView({ service }: { service: Service }) {
  const navigate = useNavigate()
  const me = useMe()
  const songs = useTable('songs')
  const profiles = useTable('profiles')
  const allSongs = useRows('songs')
  const services = useRows('services')
  const favorites = useRows('favorites')
  const [items, setItems] = useState(service.items)
  useEffect(() => setItems(service.items), [service.items])
  const [editing, setEditing] = useState<SetlistItem | null>(null)
  const [sheet, setSheet] = useState<null | 'add' | 'team' | 'auto'>(null)
  const leader = service.leaderId ? profiles[service.leaderId] : undefined
  const canManage = me?.role === 'admin' || service.leaderId === me?.id || service.createdBy === me?.id
  const visible = items.filter((i) => songs[i.songId])

  const lastKey = visible.length ? (visible[visible.length - 1].key ?? null) : null
  const nextMoment = MOMENTS.find((m) => !visible.some((i) => i.moment === m.id))?.id ?? null
  const pickerSuggestions = useMemo(
    () =>
      sheet === 'add'
        ? recommend(
            { songs: allSongs, services: services.filter((s) => s.id !== service.id), favorites },
            { moment: nextMoment, afterKey: lastKey, excludeIds: visible.map((i) => i.songId), limit: 4 },
          ).map((r) => ({ song: r.song, reason: r.reasons.slice(0, 2).join(' · '), key: r.key }))
        : [],
    [sheet, allSongs, services, favorites, service.id, nextMoment, lastKey, visible],
  )

  const roles = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const a of service.team) map.set(a.role, [...(map.get(a.role) ?? []), a.userId])
    return ROLES.filter((r) => map.has(r.id)).map((r) => ({ role: r, users: map.get(r.id)! }))
  }, [service.team])

  return (
    <>
      <TopBar
        backTo="/cultos"
        title={<span className="lg:hidden">{service.title}</span>}
        actions={
          <>
            <IconButton icon={Pencil} label="Editar culto" onClick={() => navigate(`/cultos/${service.id}/editar`)} />
            <Menu
              items={[
                {
                  label: 'Enviar no chat',
                  icon: MessageCircle,
                  onSelect: async () => {
                    if (await sendMessage('', { serviceId: service.id })) toast.success('Culto compartilhado no chat')
                  },
                },
                {
                  label: 'Duplicar culto',
                  icon: Copy,
                  description: 'Mesmo setlist e escala, uma semana depois',
                  onSelect: async () => {
                    const d = new Date(`${service.date}T12:00:00`)
                    d.setDate(d.getDate() + 7)
                    const copy = newService({
                      ...service,
                      id: uid(),
                      date: d.toISOString().slice(0, 10),
                      items: service.items.map((i) => ({ ...i, id: uid() })),
                      createdBy: me?.id ?? null,
                    })
                    if (await saveService(copy)) navigate(`/cultos/${copy.id}`)
                  },
                },
                {
                  label: 'Excluir culto',
                  icon: Trash2,
                  danger: true,
                  hidden: !canManage,
                  onSelect: async () => {
                    if (await confirm({ title: 'Excluir este culto?', description: 'O setlist, a escala e as sugestões dele serão apagados.', confirmLabel: 'Excluir', danger: true })) {
                      await deleteService(service.id)
                      navigate('/cultos')
                    }
                  },
                },
              ]}
            />
          </>
        }
      />
      <Page className="pt-6">
        <div className="flex items-start gap-4">
          <DateBlock date={service.date} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-muted">
              {friendlyDate(service.date)}
              {service.time && ` · ${service.time}`}
            </div>
            <h1 className="mt-0.5 text-[26px] leading-tight font-extrabold tracking-tight text-ink sm:text-[30px]">{service.title}</h1>
            {leader && (
              <div className="mt-2 flex items-center gap-2 text-[13.5px] font-semibold text-ink-2">
                <Avatar profile={leader} size="xs" />
                {firstName(leader.name)} ministra
              </div>
            )}
          </div>
        </div>

        {(service.theme || service.bibleText) && (
          <Card className="mt-5 flex gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-lavender text-lavender-ink">
              <BookOpen className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-bold tracking-wide text-muted uppercase">Mensagem</div>
              {service.theme && <div className="text-[15px] font-bold text-ink">{service.theme}</div>}
              {service.bibleText && <div className="text-[13.5px] text-ink-2">{service.bibleText}</div>}
            </div>
          </Card>
        )}
        {service.notes && <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">{service.notes}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          {visible.length > 0 && (
            <LinkButton to={`/cultos/${service.id}/ao-vivo`} icon={Play}>
              Modo ao vivo
            </LinkButton>
          )}
          <Button variant="soft" icon={Plus} onClick={() => setSheet('add')}>
            Música
          </Button>
          <Button variant="outline" icon={Sparkles} onClick={() => setSheet('auto')}>
            {visible.length ? 'Completar com assistente' : 'Montar com assistente'}
          </Button>
        </div>

        <section className="mt-8">
          <SectionTitle title="Setlist" subtitle={visible.length ? `${plural(visible.length, 'música', 'músicas')} · arraste para reordenar` : undefined} />
          {visible.length === 0 ? (
            <Card className="p-2">
              <EmptyState
                icon={Music}
                title="Setlist vazio"
                description="Adicione músicas do acervo ou deixe o assistente montar um fluxo completo para a mensagem."
                action={
                  <Button icon={Sparkles} onClick={() => setSheet('auto')}>
                    Montar com assistente
                  </Button>
                }
                className="py-8"
              />
            </Card>
          ) : (
            <Card className="p-1.5">
              <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-0.5">
                {items.map((item, i) =>
                  songs[item.songId] ? (
                    <SetlistRow
                      key={item.id}
                      item={item}
                      index={visible.indexOf(item) >= 0 ? visible.indexOf(item) : i}
                      song={songs[item.songId]}
                      serviceId={service.id}
                      onEdit={() => setEditing(item)}
                      onDragEnd={() => void updateServiceItems(service.id, items)}
                    />
                  ) : null,
                )}
              </Reorder.Group>
              <div className="border-t border-line px-3 pt-2.5 pb-1.5">
                <KeyFlow items={visible} songs={songs} />
              </div>
            </Card>
          )}
        </section>

        <section className="mt-8">
          <SectionTitle
            title="Escala"
            action={
              <Button variant="ghost" size="sm" icon={Users} onClick={() => setSheet('team')}>
                Editar
              </Button>
            }
          />
          {roles.length === 0 ? (
            <button type="button" onClick={() => setSheet('team')} className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-surface-3 p-4 text-left text-[14px] font-semibold text-muted hover:bg-surface-2">
              <Mic2 className="size-5" /> Quem vai ministrar e tocar? Toque para montar a escala.
            </button>
          ) : (
            <Card className="divide-y divide-line">
              {roles.map(({ role, users }) => (
                <div key={role.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `var(--${role.color}-bg)`, color: `var(--${role.color}-ink)` }}>
                    <role.icon className="size-[18px]" />
                  </span>
                  <span className="w-28 shrink-0 text-[13.5px] font-bold text-ink-2">{role.name}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {users.map((u) =>
                      profiles[u] ? (
                        <span key={u} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-[13px] font-semibold text-ink">
                          <Avatar profile={profiles[u]} size="xs" />
                          {firstName(profiles[u].name)}
                        </span>
                      ) : null,
                    )}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </section>

        {/* Presença dos outros: só o líder ou quem ministra o culto (mesma regra do banco). */}
        <ServiceAttendance service={service} canManage={me?.role === 'admin' || service.leaderId === me?.id} />

        <ServiceRecordings service={service} />

        <ServiceSuggestions service={service} canManage={canManage} />

        <div className="mt-10 rounded-3xl bg-surface-2/70 p-4 text-[13px] text-muted">
          Dica: os cantores podem abrir o <b>modo ao vivo</b> na visão de letra e os músicos na de cifra — o tom de cada música já vem do setlist.
          <Link to="/sugestoes" className="ml-1 inline-flex items-center gap-1 font-bold text-primary">
            Ver todas as sugestões <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </Page>

      <SongPickerSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        title="Adicionar ao setlist"
        excludeIds={visible.map((i) => i.songId)}
        suggestions={pickerSuggestions}
        onPick={async (song) => {
          setSheet(null)
          const rec = pickerSuggestions.find((p) => p.song.id === song.id)
          if (await addToService(service.id, song.id, { key: rec?.key ?? undefined })) toast.success(`“${song.title}” no setlist`)
        }}
      />
      <TeamSheet service={service} open={sheet === 'team'} onClose={() => setSheet(null)} />
      <AutoSetlistSheet service={service} open={sheet === 'auto'} onClose={() => setSheet(null)} />
      <ItemSheet service={service} item={editing} onClose={() => setEditing(null)} />
    </>
  )
}

