import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardPaste,
  ExternalLink,
  FileText,
  Gauge,
  Link2,
  ListPlus,
  Loader2,
  Music,
  NotebookPen,
  Pause,
  PencilLine,
  Play,
  Search,
  Sparkles,
  Tags,
  Video,
  X,
} from 'lucide-react'
import { MediaEmbed, TapTempo } from '@/components/media'
import { SongCover } from '@/components/song-bits'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { fetchLinkMetadata, type LinkMetadata } from '@/lib/song-import'
import { chordSearchUrl, parseMediaUrl, type MediaLink } from '@/lib/media'
import { detectKeyFromText } from '@/lib/music/analyze'
import { parseSheet } from '@/lib/music/sheet'
import { prettyAccidentals } from '@/lib/music/theory'
import { aiErrorMessage, completeSong, formatDuration, isYouTubeCandidate, searchSongs, type SongCandidate, type SongDetails } from '@/lib/song-search'
import { MOMENT_BY_ID, TEMPOS, THEME_BY_ID, type Theme } from '@/lib/taxonomy'
import { cn, plural } from '@/lib/utils'
import type { Song } from '@/types'

/**
 * Cadastro pelo nome: digitar "música e artista", escolher o vídeo certo no YouTube e o app
 * completa a ficha sozinho (o Deezer só aparece quando o YouTube não responde).
 */
export function SmartImport({
  song,
  themes,
  onPick,
  onDetails,
  onLink,
  onReset,
  onPasteCifra,
  onOpenPaste,
  onShowSheet,
  onManual,
  onBatch,
  onBpm,
}: {
  song: Song
  themes: Theme[]
  /** Faixa escolhida: título, artista e capa entram na hora. */
  onPick: (c: SongCandidate) => void
  /** Ficha completa (ou null quando o servidor não respondeu). */
  onDetails: (d: SongDetails | null, c: SongCandidate) => void
  onLink: (link: MediaLink, meta: LinkMetadata) => void
  onReset: () => void
  onPasteCifra: () => void
  onOpenPaste: () => void
  onShowSheet: () => void
  onManual: () => void
  onBatch: () => void
  onBpm: (bpm: number) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SongCandidate[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [picked, setPicked] = useState<SongCandidate | null>(null)
  const [details, setDetails] = useState<SongDetails | null>(null)
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState<string | null>(null)
  const token = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Busca enquanto digita (ou lê o link colado).
  useEffect(() => {
    const q = query.trim()
    if (picked || q.length < 2) {
      setResults(null)
      setSearching(false)
      setSearchError(null)
      return
    }
    const link = parseMediaUrl(q)
    const my = ++token.current
    setSearching(true)
    setSearchError(null)
    const timer = setTimeout(
      async () => {
        try {
          if (link) {
            const meta = await fetchLinkMetadata(link)
            if (my !== token.current) return
            onLink(link, meta)
            void choose({
              id: `link:${link.provider}:${link.id}`,
              title: meta.title,
              version: null,
              artist: meta.artist,
              album: null,
              coverUrl: meta.coverUrl,
              durationSec: meta.durationSec,
              previewUrl: null,
              link: link.url,
            }, false)
            return
          }
          const list = await searchSongs(q)
          if (my !== token.current) return
          setResults(list)
        } catch (e) {
          if (my !== token.current) return
          setResults(null)
          setSearchError(e instanceof Error && e.message ? e.message : 'Não deu para buscar agora.')
        } finally {
          if (my === token.current) setSearching(false)
        }
      },
      // Espera a pessoa parar de digitar: cada busca no YouTube gasta da cota diária.
      link ? 0 : 700,
    )
    return () => clearTimeout(timer)
  }, [query, picked])

  const choose = async (c: SongCandidate, apply = true) => {
    const my = ++token.current
    if (apply) onPick(c)
    setPicked(c)
    setDetails(null)
    setFillError(null)
    setFilling(true)
    try {
      const d = await completeSong(c, themes)
      if (my !== token.current) return
      setDetails(d)
      onDetails(d, c)
    } catch (e) {
      if (my !== token.current) return
      setFillError(e instanceof Error && /entre na sua conta/i.test(e.message) ? 'Entre de novo na sua conta.' : 'Não deu para completar a ficha agora.')
      onDetails(null, c)
    } finally {
      if (my === token.current) setFilling(false)
    }
  }

  const reset = () => {
    token.current++
    setPicked(null)
    setDetails(null)
    setFilling(false)
    setFillError(null)
    setQuery('')
    onReset()
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <Card className="mb-5 overflow-hidden border-primary/25">
      <AnimatePresence mode="wait" initial={false}>
        {picked ? (
          <motion.div key="picked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <PickedSong candidate={picked} song={song} onReset={reset} />
            <FillProgress
              song={song}
              details={details}
              filling={filling}
              error={fillError ?? aiErrorMessage(details?.aiError)}
              onRetry={() => void choose(picked, false)}
              onBpm={onBpm}
            />
            <CifraStep song={song} cifraUrl={details?.cifraUrl ?? null} onPaste={onPasteCifra} onOpenPaste={onOpenPaste} onShowSheet={onShowSheet} />
            {details && details.sources.length > 0 && <Sources sources={details.sources} />}
          </motion.div>
        ) : (
          <motion.div key="search" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <div className="relative overflow-hidden bg-primary-soft px-5 pt-5 pb-5">
              <div className="absolute -top-16 -right-10 size-48 rounded-full bg-[var(--orchid-solid)] opacity-25 blur-3xl" />
              <div className="relative">
                <h2 className="flex items-center gap-2 text-[18px] font-extrabold tracking-tight text-ink">
                  <Sparkles className="size-5 text-primary" /> Qual música?
                </h2>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder="Nome da música e artista"
                    aria-label="Nome da música e artista"
                    className="h-14 w-full rounded-2xl border border-line bg-surface pr-12 pl-12 text-[16px] font-semibold text-ink shadow-card outline-none placeholder:font-medium placeholder:text-muted focus:border-primary"
                  />
                  {searching ? (
                    <Loader2 className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-primary" />
                  ) : query ? (
                    <button type="button" aria-label="Limpar" onClick={() => setQuery('')} className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-2">
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <SearchResults results={results} error={searchError} query={query} onChoose={(c) => void choose(c)} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-[13px]">
              <button type="button" onClick={onManual} className="inline-flex items-center gap-1.5 font-bold text-primary">
                <PencilLine className="size-4" /> Preencher à mão
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 font-bold text-primary"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (parseMediaUrl(text)) setQuery(text.trim())
                    else toast('Copie o link do YouTube ou do Spotify e toque aqui de novo')
                  } catch {
                    toast('Cole o link no campo de busca')
                  }
                }}
              >
                <Link2 className="size-4" /> Colar link
              </button>
              <button type="button" onClick={onBatch} className="inline-flex items-center gap-1.5 font-bold text-primary">
                <ListPlus className="size-4" /> Vários links
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function Thumb({ url, size = 52 }: { url: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  return url && !failed ? (
    <img src={url} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-xl object-cover shadow-card" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" style={{ width: size, height: size }}>
      <Music className="size-5" />
    </span>
  )
}

/** Miniatura do vídeo (16:9), com o selo do YouTube. */
function VideoThumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="relative block h-[45px] w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 shadow-card">
      {!failed && <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />}
      <span className="absolute right-1 bottom-1 grid size-4 place-items-center rounded-[5px] bg-[#ff0033] text-white">
        <Play className="ml-px size-2.5 fill-current" />
      </span>
    </span>
  )
}

const videoId = (c: SongCandidate) => c.id.slice('youtube:'.length)

function SearchResults({ results, error, query, onChoose }: { results: SongCandidate[] | null; error: string | null; query: string; onChoose: (c: SongCandidate) => void }) {
  if (error) return <p className="px-5 py-4 text-[13.5px] font-semibold text-rose-ink">{error}</p>
  if (!results) return null
  if (!results.length)
    return (
      <div className="px-5 py-6 text-center">
        <p className="text-[14px] font-bold text-ink">Nada encontrado para “{query.trim()}”</p>
        <p className="mt-0.5 text-[13px] text-muted">Confira o nome ou tente só o título.</p>
      </div>
    )
  return (
    <div>
      <ul className="divide-y divide-line">
        {results.map((c, i) => (
          <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.03 }}>
            <button type="button" onClick={() => onChoose(c)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2">
              {isYouTubeCandidate(c) ? <VideoThumb id={videoId(c)} /> : <Thumb url={c.coverUrl} />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold text-ink">{c.title}</span>
                  {c.version && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">{c.version}</span>}
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {[c.artist, c.album, formatDuration(c.durationSec)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" />
            </button>
          </motion.li>
        ))}
      </ul>
      <p className="px-5 pt-1 pb-2 text-right text-[11px] font-semibold text-muted">
        {results.some(isYouTubeCandidate) ? 'Resultados do YouTube' : results.some((r) => r.id.startsWith('deezer:')) ? 'Catálogo: Deezer' : null}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Música escolhida
// ---------------------------------------------------------------------------

function PickedSong({ candidate, song, onReset }: { candidate: SongCandidate; song: Song; onReset: () => void }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [video, setVideo] = useState(false)
  const youtube = isYouTubeCandidate(candidate) ? parseMediaUrl(candidate.link) : null
  useEffect(() => () => audio.current?.pause(), [])
  const toggle = () => {
    // Vídeo do YouTube: abre o player aqui mesmo, no app.
    if (youtube) return setVideo((v) => !v)
    if (!candidate.previewUrl) return
    audio.current ??= new Audio(candidate.previewUrl)
    const a = audio.current
    a.onended = () => setPlaying(false)
    if (a.paused) {
      void a.play().then(() => setPlaying(true)).catch(() => toast('Não deu para tocar a prévia'))
    } else {
      a.pause()
      setPlaying(false)
    }
  }
  return (
    <div className="relative overflow-hidden px-5 pt-5 pb-4">
      <div className="absolute inset-0 bg-primary-soft opacity-70" />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <SongCover song={{ ...song, coverUrl: song.coverUrl ?? candidate.coverUrl }} size={88} />
          {(youtube || candidate.previewUrl) && (
            <button
              type="button"
              onClick={toggle}
              aria-label={youtube ? (video ? 'Fechar o vídeo' : 'Ouvir no YouTube aqui no app') : playing ? 'Pausar prévia' : 'Ouvir prévia'}
              className={cn(
                'absolute -right-2 -bottom-2 grid size-10 place-items-center rounded-full shadow-float transition-transform active:scale-90',
                youtube ? 'bg-[#ff0033] text-white' : 'bg-primary text-primary-ink',
              )}
            >
              {playing || video ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[19px] leading-tight font-extrabold tracking-tight text-ink">{song.title || candidate.title}</div>
          <div className="mt-0.5 truncate text-[14px] font-semibold text-ink-2">{song.artist || candidate.artist}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {[youtube ? 'YouTube' : null, candidate.version, candidate.album, formatDuration(candidate.durationSec)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" onClick={onReset} aria-label="Escolher outra música" className="grid size-9 shrink-0 place-items-center self-start rounded-full bg-surface/70 text-ink-2 hover:bg-surface">
          <X className="size-4" />
        </button>
      </div>
      {youtube && video && <MediaEmbed link={youtube} title={song.title || candidate.title} autoLoad className="relative mt-4 rounded-2xl" />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ficha sendo preenchida
// ---------------------------------------------------------------------------

function useElapsed(running: boolean) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!running) return
    setSec(0)
    const start = Date.now()
    const t = window.setInterval(() => setSec(Math.round((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [running])
  return sec
}

/** Mostra os itens um a um quando a ficha chega. */
function useReveal(total: number, ready: boolean) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!ready) {
      setShown(0)
      return
    }
    let n = 0
    const t = window.setInterval(() => {
      n++
      setShown(n)
      if (n >= total) window.clearInterval(t)
    }, 160)
    return () => window.clearInterval(t)
  }, [ready, total])
  return shown
}

function Row({ icon: Icon, label, state, children }: { icon: typeof Music; label: string; state: 'run' | 'done' | 'empty'; children?: ReactNode }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl transition-colors',
          state === 'done' ? 'bg-primary text-primary-ink' : state === 'empty' ? 'bg-surface-2 text-muted' : 'bg-primary-soft text-primary',
        )}
      >
        {state === 'run' ? <Loader2 className="size-4 animate-spin" /> : state === 'done' ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-[13px] font-bold', state === 'run' ? 'text-muted' : 'text-ink-2')}>{label}</div>
        <AnimatePresence initial={false}>
          {state !== 'run' && children && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
              <div className="pt-1">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {state === 'run' && <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded-full bg-surface-2" />}
      </div>
    </li>
  )
}

function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'primary' }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold', tone === 'primary' ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-ink-2')}>{children}</span>
}

function FillProgress({
  song,
  details,
  filling,
  error,
  onRetry,
  onBpm,
}: {
  song: Song
  details: SongDetails | null
  filling: boolean
  error: string | null
  onRetry: () => void
  onBpm: (bpm: number) => void
}) {
  const elapsed = useElapsed(filling)
  const shown = useReveal(5, !filling)
  const [tapping, setTapping] = useState(false)
  const st = (i: number, has: boolean): 'run' | 'done' | 'empty' => (filling || shown <= i ? 'run' : has ? 'done' : 'empty')
  const tempo = TEMPOS.find((t) => t.id === song.tempo)
  const refs = details?.bibleRefs ?? []
  const notes = song.notes.split('\n').filter(Boolean)

  return (
    <div className="border-t border-line px-5 pt-2 pb-1">
      {filling && (
        <div className="flex items-center gap-2 pt-2 text-[12.5px] font-semibold text-primary">
          <Sparkles className="size-3.5" /> Pesquisando a música na web… {elapsed > 2 && <span className="text-muted tabular-nums">{elapsed} s</span>}
        </div>
      )}
      {!filling && error && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-butter px-3.5 py-2.5 text-[13px] font-semibold text-butter-ink">
          {error}
          {details?.aiError !== 'sem-chave' && details?.aiError !== 'sem-servidor' && (
            <button type="button" onClick={onRetry} className="font-extrabold underline underline-offset-2">
              Tentar de novo
            </button>
          )}
        </div>
      )}
      <ul className="divide-y divide-line">
        <Row icon={Video} label="Vídeo e Spotify" state={st(0, !!(song.youtubeUrl || song.spotifyUrl))}>
          <div className="flex flex-wrap gap-1.5">
            {song.youtubeUrl && (
              <a href={song.youtubeUrl} target="_blank" rel="noreferrer">
                <Pill tone="primary">
                  YouTube <ExternalLink className="size-3" />
                </Pill>
              </a>
            )}
            {song.spotifyUrl && (
              <a href={song.spotifyUrl} target="_blank" rel="noreferrer">
                <Pill tone="primary">
                  Spotify <ExternalLink className="size-3" />
                </Pill>
              </a>
            )}
            {!song.youtubeUrl && !song.spotifyUrl && <span className="text-[13px] text-muted">Não encontrados</span>}
          </div>
        </Row>
        <Row icon={Gauge} label="Tom, BPM e compasso" state={st(1, !!(song.originalKey || song.bpm || song.timeSignature))}>
          <div className="flex flex-wrap items-center gap-1.5">
            {song.originalKey && <Pill tone="primary">Tom {prettyAccidentals(song.originalKey)}</Pill>}
            {song.bpm && <Pill>{song.bpm} BPM</Pill>}
            {song.timeSignature && <Pill>{song.timeSignature}</Pill>}
            {tempo && <Pill>{tempo.name}</Pill>}
            {!song.bpm && (
              <button type="button" onClick={() => setTapping((v) => !v)} className="text-[12.5px] font-bold text-primary">
                {tapping ? 'Fechar' : 'Marcar o BPM no toque'}
              </button>
            )}
          </div>
          {tapping && !song.bpm && <TapTempo onBpm={onBpm} className="mt-2" />}
        </Row>
        <Row icon={Tags} label="Temas e momentos do culto" state={st(2, song.themes.length + song.moments.length > 0)}>
          <div className="flex flex-wrap gap-1.5">
            {song.themes.map((t) => {
              const th = THEME_BY_ID[t]
              return th ? (
                <span key={t} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold" style={{ background: `var(--${th.color}-bg)`, color: `var(--${th.color}-ink)` }}>
                  <th.icon className="size-3" /> {th.short ?? th.name}
                </span>
              ) : null
            })}
            {song.moments.map((m) => (
              <Pill key={m}>{MOMENT_BY_ID[m]?.short ?? MOMENT_BY_ID[m]?.name ?? m}</Pill>
            ))}
          </div>
        </Row>
        <Row icon={BookOpen} label="Significado e Bíblia" state={st(3, !!song.meaning || refs.length > 0)}>
          {song.meaning && <p className="text-[13.5px] leading-relaxed text-ink">{song.meaning}</p>}
          {refs.length > 0 && <p className="mt-1 text-[13px] font-semibold text-primary">{refs.join(' · ')}</p>}
        </Row>
        <Row icon={NotebookPen} label="Notas de arranjo" state={st(4, notes.length > 0)}>
          {notes.length > 0 && (
            <ul className="space-y-0.5 text-[13.5px] leading-relaxed text-ink">
              {notes.slice(0, 6).map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  {n}
                </li>
              ))}
            </ul>
          )}
        </Row>
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cifra e letra (o passo da equipe)
// ---------------------------------------------------------------------------

function CifraStep({ song, cifraUrl, onPaste, onOpenPaste, onShowSheet }: { song: Song; cifraUrl: string | null; onPaste: () => void; onOpenPaste: () => void; onShowSheet: () => void }) {
  const hasCifra = !!song.content.trim()
  const sections = hasCifra ? parseSheet(song.content).sections.filter((s) => s.label).length : 0
  const key = song.originalKey ?? detectKeyFromText(song.content)
  const href = cifraUrl ?? (song.title ? chordSearchUrl(song.title, song.artist) : undefined)
  return (
    <div className="border-t border-line bg-surface-2/50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl', hasCifra ? 'bg-primary text-primary-ink' : 'bg-butter text-butter-ink')}>
          {hasCifra ? <Check className="size-4" strokeWidth={3} /> : <FileText className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-extrabold text-ink">Cifra e letra</div>
          {hasCifra ? (
            <div className="text-[12.5px] text-muted">
              {[key && `Tom ${prettyAccidentals(key)}`, plural(sections, 'seção', 'seções')].filter(Boolean).join(' · ')}
            </div>
          ) : (
            <div className="text-[12.5px] text-muted">Abra a cifra, copie tudo e cole aqui</div>
          )}
        </div>
        {hasCifra && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={onOpenPaste}>
              Trocar
            </Button>
            <Button size="sm" variant="soft" onClick={onShowSheet}>
              Ver
            </Button>
          </div>
        )}
      </div>
      {!hasCifra && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!href}
            className={cn(
              'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] font-bold text-ink hover:bg-surface-2',
              !href && 'pointer-events-none opacity-50',
            )}
          >
            Abrir a cifra <ExternalLink className="size-3.5 text-muted" />
          </a>
          <Button icon={ClipboardPaste} onClick={onPaste}>
            Colar cifra
          </Button>
        </div>
      )}
    </div>
  )
}

function Sources({ sources }: { sources: Array<{ url: string; title: string }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-line px-5 py-2.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12.5px] font-bold text-muted hover:text-ink">
        {open ? 'Esconder fontes' : `Fontes consultadas (${sources.length})`}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 pb-1">
          {sources.map((s) => (
            <li key={s.url} className="truncate text-[12.5px]">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {s.title || new URL(s.url).hostname}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
