import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  AArrowDown,
  AArrowUp,
  BookOpen,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Copy,
  Headphones,
  Heart,
  Lightbulb,
  ListPlus,
  Maximize2,
  MessageCircle,
  Minus,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Timer,
  Trash2,
} from 'lucide-react'
import { AddToPlaylistSheet, AddToServiceSheet, SuggestSheet } from '@/components/action-sheets'
import { Avatar, AvatarStack } from '@/components/avatar'
import { ChordSheet } from '@/components/chord-sheet'
import { KeyPickerSheet } from '@/components/key-picker'
import { ListenPanel, songMediaLinks } from '@/components/media'
import { Page, TopBar } from '@/components/layout'
import { KeyBadge, MomentPill, SongCover } from '@/components/song-bits'
import { Button, IconButton, LinkButton } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Card, EmptyState, Segmented, Tag } from '@/components/ui/primitives'
import { confirm } from '@/components/ui/sheet'
import { deleteSong, sendMessage, setMyPref, setTeamKey, toggleFavorite } from '@/lib/actions'
import { useAutoScroll, useDocumentTitle, useFavoriteIds, useWakeLock } from '@/lib/hooks'
import { useMetronome } from '@/lib/metronome'
import { docLyrics, docToText } from '@/lib/music/sheet'
import { keyNameFor, parseKey, prettyAccidentals } from '@/lib/music/theory'
import { useMe, useRow, useRows, useSettings, useTable } from '@/lib/store'
import { MOMENT_BY_ID, TEMPO_BY_ID, THEME_BY_ID } from '@/lib/taxonomy'
import { KEY_SOURCE_LABEL, useDefaultView, useSongSheet } from '@/lib/use-song-sheet'
import { cn, compact, copyText, firstName, friendlyDate, plural, timeAgo } from '@/lib/utils'
import type { Song } from '@/types'

type Tab = 'cifra' | 'letra' | 'sobre'

/** Sequência quando a música é aberta a partir de um culto ou playlist (anterior/próxima). */
function useSequence(songId: string) {
  const [params] = useSearchParams()
  const serviceId = params.get('culto')
  const playlistId = params.get('playlist')
  const service = useRow('services', serviceId)
  const playlist = useRow('playlists', playlistId)
  const songs = useTable('songs')
  return useMemo(() => {
    if (service) {
      const items = service.items.filter((i) => songs[i.songId])
      const idx = items.findIndex((i) => i.songId === songId)
      if (idx < 0) return null
      const q = `?culto=${service.id}`
      return {
        label: service.title,
        index: idx,
        total: items.length,
        serviceKey: items[idx].key,
        notes: items[idx].notes,
        moment: items[idx].moment,
        prev: idx > 0 ? `/musica/${items[idx - 1].songId}${q}` : null,
        next: idx < items.length - 1 ? `/musica/${items[idx + 1].songId}${q}` : null,
        nextTitle: idx < items.length - 1 ? songs[items[idx + 1].songId]?.title : null,
        live: `/cultos/${service.id}/ao-vivo?i=${idx}`,
        back: `/cultos/${service.id}`,
      }
    }
    if (playlist) {
      const ids = playlist.songIds.filter((id) => songs[id])
      const idx = ids.indexOf(songId)
      if (idx < 0) return null
      const q = `?playlist=${playlist.id}`
      return {
        label: playlist.name,
        index: idx,
        total: ids.length,
        serviceKey: null,
        notes: '',
        moment: null,
        prev: idx > 0 ? `/musica/${ids[idx - 1]}${q}` : null,
        next: idx < ids.length - 1 ? `/musica/${ids[idx + 1]}${q}` : null,
        nextTitle: idx < ids.length - 1 ? songs[ids[idx + 1]]?.title : null,
        live: `/playlists/${playlist.id}/tocar?i=${idx}`,
        back: `/playlists/${playlist.id}`,
      }
    }
    return null
  }, [service, playlist, songs, songId])
}

export function SongPage() {
  const { id = '' } = useParams()
  const song = useRow('songs', id)
  useDocumentTitle(song?.title)
  if (!song)
    return (
      <>
        <TopBar backTo="/acervo" />
        <Page>
          <EmptyState icon={Music} title="Música não encontrada" description="Ela pode ter sido excluída por alguém da equipe." action={<LinkButton to="/acervo">Ir para o acervo</LinkButton>} />
        </Page>
      </>
    )
  return <SongView key={song.id} song={song} />
}

function SongView({ song }: { song: Song }) {
  const navigate = useNavigate()
  const me = useMe()
  const canDelete = me?.role === 'admin' || song.createdBy === me?.id
  const isLeader = me?.role === 'admin'
  const seq = useSequence(song.id)
  const recordingCount = useRows('recordings').filter((r) => r.songId === song.id).length
  const sheet = useSongSheet(song, { serviceKey: seq?.serviceKey })
  const defaultView = useDefaultView(sheet.hasChords)
  const [tab, setTab] = useState<Tab>(defaultView)
  const favIds = useFavoriteIds()
  const fav = favIds.has(song.id)
  const fontScale = useSettings((s) => s.fontScale)
  const showLabels = useSettings((s) => s.showSectionLabels)
  const keepAwake = useSettings((s) => s.keepAwake)
  const scrollSpeed = useSettings((s) => s.autoScrollSpeed)
  const setSetting = useSettings((s) => s.set)
  const accidentals = useSettings((s) => s.accidentals)
  const [scrolling, setScrolling] = useState(false)
  const [listening, setListening] = useState(false)
  const hasMedia = songMediaLinks(song).length > 0 || recordingCount > 0
  const [sheetOpen, setSheetOpen] = useState<null | 'key' | 'playlist' | 'service' | 'suggest'>(null)
  useAutoScroll(scrolling, scrollSpeed)
  useWakeLock(keepAwake)

  const baseKey = sheet.baseKey
  const canTranspose = !!baseKey && sheet.hasChords
  const step = (d: number) => {
    const k = parseKey(sheet.displayKey)
    if (k) sheet.setDisplayKey(keyNameFor(k.root + d, k.minor, accidentals))
  }
  const zoom = (d: number) => setSetting('fontScale', Math.min(1.8, Math.max(0.75, Math.round((fontScale + d) * 100) / 100)))

  const shareText = (mode: 'cifra' | 'letra') => {
    const header = `${song.title}${song.artist ? ` — ${song.artist}` : ''}${mode === 'cifra' && sheet.displayKey ? `\nTom: ${sheet.displayKey}${sheet.capo ? ` (capo ${sheet.capo})` : ''}` : ''}`
    const body = mode === 'cifra' ? docToText(sheet.doc) : docLyrics(sheet.doc, { labels: true })
    return `${header}\n\n${body}`
  }
  const share = async (mode: 'cifra' | 'letra') => {
    const text = shareText(mode)
    if (navigator.share) {
      try {
        await navigator.share({ title: song.title, text })
        return
      } catch {
        /* cancelado */
      }
    }
    if (await copyText(text)) toast.success(mode === 'cifra' ? 'Cifra copiada no tom atual' : 'Letra copiada')
  }

  return (
    <>
      <TopBar
        backTo={seq?.back}
        title={<span className="lg:hidden">{song.title}</span>}
        actions={
          <>
            <IconButton
              icon={Heart}
              label={fav ? 'Remover das favoritas' : 'Favoritar'}
              onClick={() => void toggleFavorite(song.id)}
              className={fav ? 'text-rose-ink' : undefined}
              iconClassName={fav ? 'fill-current' : undefined}
            />
            <Menu
              items={[
                { label: 'Editar música', icon: Pencil, onSelect: () => navigate(`/musica/${song.id}/editar`) },
                { label: 'Adicionar a um evento', icon: CalendarPlus, hidden: !isLeader, description: 'Só o líder escolhe as músicas', onSelect: () => setSheetOpen('service') },
                { label: 'Adicionar à playlist', icon: ListPlus, onSelect: () => setSheetOpen('playlist') },
                { label: 'Sugerir para um culto', icon: Lightbulb, onSelect: () => setSheetOpen('suggest') },
                {
                  label: 'Enviar no chat da equipe',
                  icon: MessageCircle,
                  onSelect: async () => {
                    if (await sendMessage('', { songId: song.id })) toast.success('Música enviada no chat')
                  },
                },
                { label: 'Compartilhar cifra', description: 'No tom que está na tela', icon: Share2, onSelect: () => void share('cifra'), hidden: !sheet.hasChords },
                { label: 'Copiar letra', icon: Copy, onSelect: () => void share('letra') },
                {
                  label: 'Excluir música',
                  icon: Trash2,
                  danger: true,
                  hidden: !canDelete,
                  onSelect: async () => {
                    const ok = await confirm({
                      title: 'Excluir esta música?',
                      description: `“${song.title}” sai do acervo de toda a equipe (setlists e playlists perdem a referência).`,
                      confirmLabel: 'Excluir',
                      danger: true,
                    })
                    if (ok && (await deleteSong(song.id))) {
                      toast.success('Música excluída')
                      navigate('/acervo')
                    }
                  },
                },
              ]}
            />
          </>
        }
      />

      {seq && (
        <div className="border-b border-line bg-surface-2/60">
          <div className="mx-auto flex h-12 max-w-5xl items-center gap-2 px-3 sm:px-6 lg:px-10">
            <IconButton icon={ChevronLeft} label="Música anterior" size="sm" disabled={!seq.prev} onClick={() => seq.prev && navigate(seq.prev, { replace: true })} />
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-[12.5px] font-bold text-ink-2">
                {seq.label} · {seq.index + 1} de {seq.total}
              </div>
              {seq.nextTitle && <div className="truncate text-[11.5px] text-muted">Próxima: {seq.nextTitle}</div>}
            </div>
            <IconButton icon={ChevronRight} label="Próxima música" size="sm" disabled={!seq.next} onClick={() => seq.next && navigate(seq.next, { replace: true })} />
          </div>
        </div>
      )}

      <Page className="max-w-3xl pb-32">
        <div className="flex items-start gap-4 pt-6 sm:gap-5">
          <SongCover song={song} size={92} className="hidden sm:block" />
          <SongCover song={song} size={72} className="sm:hidden" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] leading-tight font-extrabold tracking-tight text-ink sm:text-[30px]">{song.title}</h1>
            <p className="mt-1 truncate text-[14.5px] font-medium text-muted">{song.artist || 'Artista não informado'}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {seq?.moment && <MomentPill id={seq.moment} />}
              {song.themes.slice(0, 3).map((t) => {
                const theme = THEME_BY_ID[t]
                return theme ? (
                  <Link key={t} to={`/acervo/tema/${t}`}>
                    <Tag color={theme.color} icon={theme.icon}>
                      {theme.short ?? theme.name}
                    </Tag>
                  </Link>
                ) : null
              })}
            </div>
          </div>
        </div>

        {seq?.notes && (
          <div className="mt-4 rounded-2xl bg-butter px-4 py-3 text-[14px] font-medium text-butter-ink">
            <b>Nota para este culto:</b> {seq.notes}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button size="sm" icon={Lightbulb} onClick={() => setSheetOpen('suggest')}>
            Sugerir para o culto
          </Button>
          {tab !== 'sobre' && (
            <Button
              variant={listening ? 'primary' : hasMedia ? 'soft' : 'outline'}
              size="sm"
              icon={Headphones}
              aria-expanded={listening}
              onClick={() => setListening((v) => !v)}
            >
              Ouvir
            </Button>
          )}
          {isLeader && (
            <Button variant="outline" size="sm" icon={CalendarPlus} onClick={() => setSheetOpen('service')}>
              Pôr no culto
            </Button>
          )}
        </div>

        <div className="mt-4">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              ...(sheet.hasChords ? [{ value: 'cifra' as Tab, label: 'Cifra' }] : []),
              { value: 'letra' as Tab, label: 'Letra' },
              { value: 'sobre' as Tab, label: 'Sobre' },
            ]}
          />
        </div>

        <div className="mt-6">
          {tab === 'sobre' ? (
            <AboutTab song={song} />
          ) : (
            <>
              {listening && <ListenPanel song={song} className="mb-7" />}
              {tab === 'cifra' && canTranspose && (sheet.capo > 0 || sheet.source !== 'original') && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <span className="font-semibold">{KEY_SOURCE_LABEL[sheet.source]}:</span>
                  <KeyBadge value={sheet.displayKey} kind={sheet.source === 'culto' ? 'service' : sheet.source === 'meu' ? 'personal' : 'team'} />
                  {sheet.capo > 0 && (
                    <span className="font-semibold">
                      · capo na {sheet.capo}ª casa (formas de {prettyAccidentals(sheet.shapeKey ?? '')})
                    </span>
                  )}
                  {baseKey && sheet.displayKey !== baseKey && <span>· original em {prettyAccidentals(baseKey)}</span>}
                </div>
              )}
              <ChordSheet doc={sheet.doc} mode={tab === 'letra' ? 'letra' : 'cifra'} fontScale={fontScale} showLabels={showLabels} />
              {seq?.next && (
                <Link to={seq.next} replace className="mt-10 flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-card transition-transform active:scale-[0.99]">
                  <span className="text-[12.5px] font-bold tracking-wide text-muted uppercase">Próxima</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{seq.nextTitle}</span>
                  <ChevronRight className="size-5 text-muted" />
                </Link>
              )}
            </>
          )}
        </div>
      </Page>

      {tab !== 'sobre' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:pl-[280px]">
          <div className="glass pointer-events-auto mx-auto flex max-w-xl items-center gap-1 rounded-[24px] border border-line p-1.5 shadow-pop">
            {tab === 'cifra' && canTranspose && (
              <div className="flex items-center rounded-[18px] bg-surface-2/80">
                <IconButton icon={Minus} label="Meio tom abaixo" size="sm" onClick={() => step(-1)} />
                <button
                  type="button"
                  onClick={() => setSheetOpen('key')}
                  className="flex h-9 min-w-14 flex-col items-center justify-center rounded-xl px-2 leading-none hover:bg-surface"
                  aria-label="Escolher tom"
                >
                  <span className="text-[15px] font-extrabold text-ink">{prettyAccidentals(sheet.displayKey ?? '')}</span>
                  <span className="mt-0.5 text-[9.5px] font-bold tracking-wide text-muted uppercase">{sheet.capo ? `capo ${sheet.capo}` : 'tom'}</span>
                </button>
                <IconButton icon={Plus} label="Meio tom acima" size="sm" onClick={() => step(1)} />
              </div>
            )}
            <IconButton icon={AArrowDown} label="Diminuir fonte" size="sm" onClick={() => zoom(-0.1)} />
            <IconButton icon={AArrowUp} label="Aumentar fonte" size="sm" onClick={() => zoom(0.1)} />
            <div className="flex-1" />
            {scrolling && (
              <div className="flex items-center gap-0.5 rounded-full bg-primary-soft px-1">
                <button type="button" className="grid size-7 place-items-center text-primary" aria-label="Mais devagar" onClick={() => setSetting('autoScrollSpeed', Math.max(1, scrollSpeed - 1))}>
                  <Minus className="size-3.5" strokeWidth={2.6} />
                </button>
                <span className="w-4 text-center text-[12px] font-extrabold text-primary tabular-nums">{scrollSpeed}</span>
                <button type="button" className="grid size-7 place-items-center text-primary" aria-label="Mais rápido" onClick={() => setSetting('autoScrollSpeed', Math.min(10, scrollSpeed + 1))}>
                  <Plus className="size-3.5" strokeWidth={2.6} />
                </button>
              </div>
            )}
            <IconButton icon={scrolling ? Pause : Play} label={scrolling ? 'Parar rolagem' : 'Rolagem automática'} size="sm" active={scrolling} onClick={() => setScrolling((v) => !v)} />
            <IconButton
              icon={Maximize2}
              label="Modo palco"
              size="sm"
              onClick={() => navigate(seq?.live ?? `/musica/${song.id}/palco`)}
            />
          </div>
        </div>
      )}

      {canTranspose && sheet.displayKey && (
        <KeyPickerSheet
          open={sheetOpen === 'key'}
          onClose={() => setSheetOpen(null)}
          value={sheet.displayKey}
          onChange={sheet.setDisplayKey}
          originalKey={baseKey!}
          teamKey={song.teamKey}
          myKey={sheet.pref?.key}
          serviceKey={seq?.serviceKey}
          capo={sheet.capo}
          onCapoChange={(c) => {
            sheet.setCapo(c)
            void setMyPref(song.id, { capo: c || null })
          }}
          pref={accidentals}
          onSaveTeam={async () => {
            if (await setTeamKey(song.id, sheet.displayKey)) toast.success(`Tom da equipe: ${prettyAccidentals(sheet.displayKey!)}`)
          }}
          onSaveMine={async () => {
            if (await setMyPref(song.id, { key: sheet.displayKey })) toast.success(`Seu tom salvo: ${prettyAccidentals(sheet.displayKey!)}`)
          }}
        />
      )}
      <AddToPlaylistSheet songId={song.id} open={sheetOpen === 'playlist'} onClose={() => setSheetOpen(null)} />
      <AddToServiceSheet song={song} open={sheetOpen === 'service'} onClose={() => setSheetOpen(null)} initialKey={sheet.displayKey} />
      <SuggestSheet songId={song.id} open={sheetOpen === 'suggest'} onClose={() => setSheetOpen(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Aba "Sobre"
// ---------------------------------------------------------------------------

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-[13.5px] font-semibold text-muted">{label}</span>
      <span className="text-right text-[14px] font-bold text-ink">{children}</span>
    </div>
  )
}

function AboutTab({ song }: { song: Song }) {
  const profiles = useTable('profiles')
  const favorites = useRows('favorites')
  const services = useRows('services')
  const metronome = useMetronome(song.bpm, Number(song.timeSignature?.split('/')[0]) || 4)
  const favBy = compact(favorites.filter((f) => f.songId === song.id).map((f) => profiles[f.userId]))
  const played = services
    .filter((s) => s.items.some((i) => i.songId === song.id) && s.date <= new Date().toISOString().slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date))
  const creator = song.createdBy ? profiles[song.createdBy] : undefined

  return (
    <div className="space-y-4">
      {song.meaning && (
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-bold tracking-wide text-primary uppercase">
            <BookOpen className="size-4" /> Significado
          </div>
          <p className="text-[15.5px] leading-relaxed text-ink">{song.meaning}</p>
          {song.bibleRefs.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {song.bibleRefs.map((r) => (
                <span key={r} className="rounded-full bg-surface-2 px-3 py-1 text-[12.5px] font-bold text-ink-2">
                  {r}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-3 text-[13px] font-bold tracking-wide text-muted uppercase">Temas e momentos</div>
        <div className="flex flex-wrap gap-1.5">
          {song.themes.map((t) =>
            THEME_BY_ID[t] ? (
              <Link key={t} to={`/acervo/tema/${t}`}>
                <Tag color={THEME_BY_ID[t].color} icon={THEME_BY_ID[t].icon}>
                  {THEME_BY_ID[t].name}
                </Tag>
              </Link>
            ) : null,
          )}
          {song.moments.map((m) =>
            MOMENT_BY_ID[m] ? (
              <Link key={m} to={`/acervo/momento/${m}`}>
                <MomentPill id={m} className="py-1 text-[12px]" />
              </Link>
            ) : null,
          )}
          {!song.themes.length && !song.moments.length && <span className="text-[14px] text-muted">Nenhum tema cadastrado.</span>}
        </div>
        {song.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {song.tags.map((t) => (
              <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] font-semibold text-muted">
                #{t}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="divide-y divide-line px-5 py-1">
        <InfoRow label="Tom original">{song.originalKey ? prettyAccidentals(song.originalKey) : '—'}</InfoRow>
        <InfoRow label="Tom da equipe">{song.teamKey ? prettyAccidentals(song.teamKey) : 'Igual ao original'}</InfoRow>
        <InfoRow label="Ritmo">{song.tempo ? TEMPO_BY_ID[song.tempo].name : '—'}</InfoRow>
        <InfoRow label="Andamento">
          {song.bpm ? (
            <span className="flex items-center gap-2">
              {song.bpm} BPM · {song.timeSignature ?? '4/4'}
              <button
                type="button"
                onClick={metronome.toggle}
                className={cn('flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold', metronome.running ? 'bg-primary text-primary-ink' : 'bg-primary-soft text-primary')}
              >
                <Timer className="size-3.5" />
                {metronome.running ? 'Parar' : 'Metrônomo'}
                {metronome.running && (
                  <span className={cn('size-2 rounded-full bg-current transition-opacity', metronome.beat === 0 ? 'opacity-100' : 'opacity-40')} />
                )}
              </button>
            </span>
          ) : (
            '—'
          )}
        </InfoRow>
      </Card>

      {song.notes && (
        <Card className="p-5">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-muted uppercase">Notas da equipe</div>
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink">{song.notes}</p>
        </Card>
      )}

      <ListenPanel song={song} />

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[13px] font-bold tracking-wide text-muted uppercase">Na equipe</div>
            <p className="mt-1.5 text-[14px] text-ink">
              {played.length ? `Tocada ${plural(played.length, 'vez', 'vezes')} · última em ${friendlyDate(played[0].date, { short: true })}` : 'Ainda não tocada em culto'}
            </p>
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-wide text-muted uppercase">Favorita de</div>
            <div className="mt-1.5 flex items-center gap-2">
              {favBy.length ? <AvatarStack profiles={favBy} size="sm" max={6} /> : <span className="text-[14px] text-muted">Ninguém ainda</span>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-[12.5px] text-muted">
          {creator && <Avatar profile={creator} size="xs" />}
          {creator ? `Cadastrada por ${firstName(creator.name)}` : 'Música do acervo inicial'} · atualizada {timeAgo(song.updatedAt)}
        </div>
      </Card>
    </div>
  )
}
