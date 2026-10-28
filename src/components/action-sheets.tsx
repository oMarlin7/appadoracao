import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CalendarPlus, Check, Layers, ListMusic, Lightbulb, Plus, Vote as VoteIcon } from 'lucide-react'
import { addToPlaylist, addToService, createMedley, createPlaylist, suggestSong } from '@/lib/actions'
import { useServices, useSongs } from '@/lib/hooks'
import { findMedley, isMedley } from '@/lib/medley'
import { searchSongs } from '@/lib/search'
import { isPresentation } from '@/lib/events'
import { useRows, useSession, useTable } from '@/lib/store'
import { formatDeadline, votingActive, votingInfo } from '@/lib/voting'
import { MOMENTS, PASTELS, type Pastel } from '@/lib/taxonomy'
import { cn, friendlyDate, plural } from '@/lib/utils'
import type { Id, Song } from '@/types'
import { MedleyBuilder, StartMedleyButton } from './medley'
import { KeyBadge, SongCover, SongRow } from './song-bits'
import { Button } from './ui/button'
import { Chip, EmptyState, Field, Input, SearchInput, Switch, Textarea } from './ui/primitives'
import { Sheet } from './ui/sheet'

// ---------------------------------------------------------------------------
// Adicionar à playlist
// ---------------------------------------------------------------------------

export function AddToPlaylistSheet({ songId, open, onClose }: { songId: Id; open: boolean; onClose: () => void }) {
  const me = useSession((s) => s.user?.id)
  const playlists = useRows('playlists')
  const mine = useMemo(() => playlists.filter((p) => p.ownerId === me).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [playlists, me])
  const [creating, setCreating] = useState(false)

  return (
    <Sheet open={open} onClose={onClose} title="Adicionar à playlist">
      {creating ? (
        <NewPlaylistForm
          initialSongIds={[songId]}
          onDone={(id) => {
            setCreating(false)
            onClose()
            if (id) toast.success('Playlist criada com a música')
          }}
        />
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-dashed border-surface-3 px-3 py-3 text-left font-bold text-primary hover:bg-primary-soft"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft">
              <Plus className="size-5" strokeWidth={2.4} />
            </span>
            Nova playlist
          </button>
          {mine.map((p) => {
            const has = p.songIds.includes(songId)
            return (
              <button
                key={p.id}
                type="button"
                disabled={has}
                onClick={async () => {
                  if (await addToPlaylist(p.id, songId)) toast.success(`Adicionada em “${p.name}”`)
                  onClose()
                }}
                className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <span className="grid size-12 place-items-center rounded-2xl" style={{ background: `var(--${p.color}-solid)`, color: `var(--${p.color}-ink)` }}>
                  <ListMusic className="size-5" strokeWidth={2.1} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{p.name}</span>
                  <span className="block text-[13px] text-muted">
                    {plural(p.songIds.length, 'música', 'músicas')} · {p.isShared ? 'Compartilhada' : 'Só eu'}
                  </span>
                </span>
                {has && <Check className="size-5 text-primary" strokeWidth={2.5} />}
              </button>
            )
          })}
          {mine.length === 0 && <p className="px-2 pt-2 text-[13.5px] text-muted">Você ainda não tem playlists.</p>}
        </div>
      )}
    </Sheet>
  )
}

export function NewPlaylistForm({ initialSongIds = [], onDone }: { initialSongIds?: Id[]; onDone: (id: Id | null) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<Pastel>('lavender')
  const [isShared, setShared] = useState(true)
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        setSaving(true)
        const id = await createPlaylist({ name, description, color, isShared, songIds: initialSongIds })
        setSaving(false)
        onDone(id)
      }}
    >
      <Field label="Nome">{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ensaio de sábado" />}</Field>
      <Field label="Descrição" hint="opcional">
        {(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para que serve esta playlist?" />}
      </Field>
      <div>
        <div className="mb-2 text-[13px] font-semibold text-ink-2">Cor</div>
        <div className="flex flex-wrap gap-2">
          {PASTELS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn('size-9 rounded-full transition-transform', color === c ? 'scale-110 ring-[3px] ring-primary ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
              style={{ background: `var(--${c}-solid)` }}
            />
          ))}
        </div>
      </div>
      <Switch checked={isShared} onChange={setShared} label="Compartilhar com a equipe" />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving} disabled={!name.trim()}>
          Criar playlist
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Sugerir para o culto
// ---------------------------------------------------------------------------

export function SuggestSheet({ songId, open, onClose, serviceId: preset }: { songId: Id; open: boolean; onClose: () => void; serviceId?: Id | null }) {
  const { upcoming } = useServices()
  const team = useTable('team_settings').team
  const polls = useTable('song_polls')
  const suggestions = useRows('suggestions')
  const events = useMemo(() => upcoming.filter(isPresentation).slice(0, 6), [upcoming])
  const votes = useRows('votes')
  const withInfo = events.map((s) => {
    const info = votingInfo(s, team, polls[s.id])
    return { s, info: { ...info, enabled: votingActive(info, votes.some((v) => v.serviceId === s.id)) } }
  })
  const best = withInfo.find((x) => x.info.phase === 'aberta') ?? withInfo.find((x) => x.info.phase === 'agendada') ?? withInfo[0]
  const [serviceId, setServiceId] = useState<Id | null | undefined>(undefined)
  const [note, setNote] = useState('')
  /** Medley: as músicas que vão junto com esta (null = só esta música). */
  const [medleyIds, setMedleyIds] = useState<Id[] | null>(null)
  const [medleyName, setMedleyName] = useState('')
  const [sending, setSending] = useState(false)
  const allSongs = useRows('songs')
  const song = useTable('songs')[songId]
  useEffect(() => {
    if (!open) return
    setServiceId(preset)
    setMedleyIds(null)
    setMedleyName('')
  }, [open, preset])
  const selected = serviceId === undefined ? (best?.s.id ?? null) : serviceId
  const selectedInfo = withInfo.find((x) => x.s.id === selected)?.info
  const building = medleyIds !== null
  const targetId = building ? findMedley(allSongs, medleyIds)?.id : songId
  const already = !!targetId && suggestions.some((g) => g.songId === targetId && g.serviceId === selected && g.status === 'pendente')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={building ? 'Sugerir medley' : 'Sugerir música'}
      footer={
        <Button
          className="w-full"
          icon={building ? Layers : Lightbulb}
          disabled={already || (building && medleyIds.length < 2)}
          loading={sending}
          onClick={async () => {
            setSending(true)
            const m = building ? await createMedley(medleyIds, medleyName) : null
            const ok = (!building || m) && (await suggestSong(m?.id ?? songId, selected, note))
            setSending(false)
            if (building && !m) return
            if (ok) toast.success(selectedInfo?.phase === 'aberta' ? 'Sugestão na votação! Agora é só votar 🗳️' : 'Sugestão enviada para a equipe 💡')
            setNote('')
            onClose()
          }}
        >
          {already ? 'Já sugerida para este evento' : building ? (medleyIds.length < 2 ? 'Escolha mais uma música' : 'Sugerir medley') : 'Enviar sugestão'}
        </Button>
      }
    >
      {song && !isMedley(song) && (
        <div className="mb-5">
          {building ? (
            <div className="rounded-3xl border border-primary/30 bg-primary-soft/40 p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <Layers className="size-4 text-primary" />
                <span className="flex-1 text-[13px] font-bold tracking-wide text-primary uppercase">Medley</span>
                <button type="button" onClick={() => setMedleyIds(null)} className="text-[13px] font-bold text-muted hover:text-ink">
                  Sugerir só esta
                </button>
              </div>
              <MedleyBuilder ids={medleyIds} onChange={setMedleyIds} name={medleyName} onNameChange={setMedleyName} />
            </div>
          ) : (
            <StartMedleyButton label="Juntar com outra música (medley)" onClick={() => setMedleyIds([songId])} />
          )}
        </div>
      )}
      <div className="mb-2 text-[13px] font-semibold text-ink-2">Para quando?</div>
      <div className="space-y-2">
        {withInfo.map(({ s, info }) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setServiceId(s.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
              selected === s.id ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-ink">{s.title}</span>
              <span className="block text-[13px] text-muted">
                {friendlyDate(s.date)}
                {s.time ? ` · ${s.time}` : ''}
              </span>
              {info.enabled && (
                <span className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold', info.phase === 'aberta' ? 'bg-orchid text-orchid-ink' : 'bg-surface-2 text-ink-2')}>
                  <VoteIcon className="size-3" />
                  {info.phase === 'aberta'
                    ? `Votação aberta · fecha ${formatDeadline(info.closesAt, team?.timezone)}`
                    : info.phase === 'agendada'
                      ? `Votação abre ${formatDeadline(info.opensAt, team?.timezone)}`
                      : 'Votação encerrada'}
                </span>
              )}
            </span>
            {selected === s.id && <Check className="size-5 shrink-0 text-primary" strokeWidth={2.5} />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setServiceId(null)}
          className={cn(
            'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
            selected === null ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-ink">Para um culto em breve</span>
            <span className="block text-[13px] text-muted">Sem data definida</span>
          </span>
          {selected === null && <Check className="size-5 text-primary" strokeWidth={2.5} />}
        </button>
      </div>
      <Field label="Por que essa música?" hint="opcional" className="mt-4">
        {(id) => (
          <Textarea
            id={id}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ex.: conversa com a mensagem de domingo, a igreja conhece bem…"
          />
        )}
      </Field>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Adicionar ao setlist de um culto
// ---------------------------------------------------------------------------

export function AddToServiceSheet({ song, open, onClose, initialKey }: { song: Song; open: boolean; onClose: () => void; initialKey?: string | null }) {
  const { upcoming } = useServices()
  const navigate = useNavigate()
  const [moment, setMoment] = useState<string | null>(song.moments[0] ?? null)
  return (
    <Sheet open={open} onClose={onClose} title="Adicionar a um evento" description={`“${song.title}” entra no setlist${initialKey ? ` em ${initialKey}` : ''}.`}>
      <div className="mb-4">
        <div className="mb-2 text-[13px] font-semibold text-ink-2">Momento</div>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-6 md:px-6">
          {MOMENTS.map((m) => (
            <Chip key={m.id} size="sm" icon={m.icon} color={m.color} selected={moment === m.id} onClick={() => setMoment(moment === m.id ? null : m.id)}>
              {m.short ?? m.name}
            </Chip>
          ))}
        </div>
      </div>
      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Nenhum evento agendado"
          action={
            <Button
              icon={Plus}
              onClick={() => {
                onClose()
                navigate('/cultos/novo')
              }}
            >
              Novo evento
            </Button>
          }
          className="py-6"
        />
      ) : (
        <div className="space-y-2">
          {upcoming.map((s) => {
            const has = s.items.some((i) => i.songId === song.id)
            return (
              <button
                key={s.id}
                type="button"
                disabled={has}
                onClick={async () => {
                  if (await addToService(s.id, song.id, { key: initialKey ?? undefined, moment })) toast.success(`Adicionada em “${s.title}”`)
                  onClose()
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{s.title}</span>
                  <span className="block text-[13px] text-muted">
                    {friendlyDate(s.date)} · {plural(s.items.length, 'música', 'músicas')}
                  </span>
                </span>
                {has ? <span className="text-[12.5px] font-semibold text-muted">Já está</span> : <Plus className="size-5 text-primary" strokeWidth={2.4} />}
              </button>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Escolher música
// ---------------------------------------------------------------------------

export function SongPickerSheet({
  open,
  onClose,
  onPick,
  title = 'Escolher música',
  excludeIds = [],
  suggestions,
  medley = false,
  startWithMedley = false,
}: {
  open: boolean
  onClose: () => void
  onPick: (song: Song) => void
  title?: string
  excludeIds?: Id[]
  suggestions?: Array<{ song: Song; reason?: string; key?: string | null }>
  /** Deixa juntar várias músicas num medley, que chega em `onPick` como uma música só. */
  medley?: boolean
  /** Já abre montando o medley. */
  startWithMedley?: boolean
}) {
  const songs = useSongs()
  const [q, setQ] = useState('')
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds])
  const results = useMemo(() => searchSongs(songs, q).filter((s) => !exclude.has(s.id)), [songs, q, exclude])
  const [medleyIds, setMedleyIds] = useState<Id[] | null>(null)
  const [medleyName, setMedleyName] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setMedleyIds(startWithMedley ? [] : null)
    setMedleyName('')
  }, [open, startWithMedley])

  const building = medley && medleyIds !== null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={building ? 'Montar medley' : title}
      description={building ? 'Duas ou mais músicas, uma emendada na outra, que contam como uma só.' : undefined}
      tall
      footer={
        building && (
          <Button
            className="w-full"
            icon={Layers}
            loading={saving}
            disabled={medleyIds.length < 2}
            onClick={async () => {
              setSaving(true)
              const m = await createMedley(medleyIds, medleyName)
              setSaving(false)
              if (!m) return
              setMedleyIds(startWithMedley ? [] : null)
              setMedleyName('')
              onPick(m)
            }}
          >
            {medleyIds.length < 2 ? 'Escolha pelo menos 2 músicas' : `Usar o medley (${medleyIds.length} músicas)`}
          </Button>
        )
      }
    >
      {building ? (
        <>
          {!startWithMedley && (
            <button type="button" onClick={() => setMedleyIds(null)} className="mb-3 text-[13px] font-bold text-primary">
              ← Voltar para a lista
            </button>
          )}
          <MedleyBuilder ids={medleyIds} onChange={setMedleyIds} name={medleyName} onNameChange={setMedleyName} />
        </>
      ) : (
        <SongPickerList {...{ q, setQ, results, suggestions, onPick, medley, onStartMedley: () => setMedleyIds([]) }} />
      )}
    </Sheet>
  )
}

function SongPickerList({
  q,
  setQ,
  results,
  suggestions,
  onPick,
  medley,
  onStartMedley,
}: {
  q: string
  setQ: (v: string) => void
  results: Song[]
  suggestions?: Array<{ song: Song; reason?: string; key?: string | null }>
  onPick: (song: Song) => void
  medley: boolean
  onStartMedley: () => void
}) {
  return (
    <>
      <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3 md:-mx-6 md:px-6">
        <SearchInput value={q} onChange={setQ} placeholder="Título, artista, trecho da letra…" />
      </div>
      {medley && !q && <StartMedleyButton onClick={onStartMedley} className="mb-3" />}
      {!q && suggestions && suggestions.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 px-2 text-[12px] font-bold tracking-wide text-primary uppercase">Sugestões do assistente</div>
          {suggestions.map(({ song, reason, key }) => (
            <button
              key={song.id}
              type="button"
              onClick={() => onPick(song)}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2"
            >
              <SongCover song={song} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{song.title}</span>
                {reason && <span className="block truncate text-[12.5px] text-muted">{reason}</span>}
              </span>
              <KeyBadge value={key} />
            </button>
          ))}
          <div className="mx-2 my-2 h-px bg-line" />
        </div>
      )}
      <div className="-mx-2">
        {results.map((s) => (
          <SongRow key={s.id} song={s} onClick={() => onPick(s)} />
        ))}
        {results.length === 0 && <p className="py-8 text-center text-[14px] text-muted">Nenhuma música encontrada.</p>}
      </div>
    </>
  )
}
