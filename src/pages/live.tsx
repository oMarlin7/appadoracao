import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Expand, Minus, Moon, Pause, Play, Plus, Sun, X } from 'lucide-react'
import { ChordSheet } from '@/components/chord-sheet'
import { MomentPill } from '@/components/song-bits'
import { IconButton } from '@/components/ui/button'
import { Segmented } from '@/components/ui/primitives'
import { useAutoScroll, useDocumentTitle, useWakeLock } from '@/lib/hooks'
import { keyNameFor, parseKey, prettyAccidentals } from '@/lib/music/theory'
import { readStorage, writeStorage } from '@/lib/storage'
import { useRow, useSettings, useTable } from '@/lib/store'
import { useDefaultView, useSongSheet } from '@/lib/use-song-sheet'
import { cn } from '@/lib/utils'
import type { Song } from '@/types'

interface Entry {
  song: Song
  key: string | null
  notes: string
  moment: string | null
}

/** Modo palco: tela cheia, escura, uma música por vez, com gesto/setas/pedal para avançar. */
export function LivePage({ source }: { source: 'service' | 'playlist' | 'song' }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const service = useRow('services', source === 'service' ? id : null)
  const playlist = useRow('playlists', source === 'playlist' ? id : null)
  const songs = useTable('songs')

  const entries: Entry[] = useMemo(() => {
    if (source === 'service' && service)
      return service.items.filter((i) => songs[i.songId]).map((i) => ({ song: songs[i.songId], key: i.key, notes: i.notes, moment: i.moment }))
    if (source === 'playlist' && playlist) return playlist.songIds.filter((s) => songs[s]).map((s) => ({ song: songs[s], key: null, notes: '', moment: null }))
    if (source === 'song' && songs[id]) return [{ song: songs[id], key: null, notes: '', moment: null }]
    return []
  }, [source, service, playlist, songs, id])

  const title = service?.title ?? playlist?.name ?? entries[0]?.song.title ?? 'Ao vivo'
  const index = Math.min(Math.max(parseInt(params.get('i') ?? '0', 10) || 0, 0), Math.max(entries.length - 1, 0))
  const entry = entries[index]
  useDocumentTitle(entry ? `${entry.song.title} · ao vivo` : 'Ao vivo')

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (source === 'service') navigate(`/cultos/${id}`)
    else if (source === 'playlist') navigate(`/playlists/${id}`)
    else navigate(`/musica/${id}`)
  }, [navigate, source, id])

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= entries.length) return
      setParams({ i: String(to) }, { replace: true })
    },
    [entries.length, setParams],
  )

  if (!entry)
    return (
      <div className="dark grid min-h-dvh place-items-center bg-bg p-6 text-center text-ink">
        <div>
          <p className="text-[16px] font-semibold">Nada para tocar por aqui.</p>
          <button type="button" className="mt-4 font-bold text-primary" onClick={exit}>
            Voltar
          </button>
        </div>
      </div>
    )

  return <LiveView key={entry.song.id + index} entries={entries} index={index} entry={entry} title={title} onExit={exit} go={go} />
}

function LiveView({ entries, index, entry, title, onExit, go }: { entries: Entry[]; index: number; entry: Entry; title: string; onExit: () => void; go: (i: number) => void }) {
  const sheet = useSongSheet(entry.song, { serviceKey: entry.key })
  const defaultView = useDefaultView(sheet.hasChords)
  const [mode, setMode] = useState<'cifra' | 'letra'>(() => (readStorage('session', 'adoracao:live-mode') as 'cifra' | 'letra' | null) ?? defaultView)
  const [dark, setDark] = useState(() => readStorage('local', 'adoracao:stage-light') !== '1')
  const fontScale = useSettings((s) => s.fontScale)
  const speed = useSettings((s) => s.autoScrollSpeed)
  const setSetting = useSettings((s) => s.set)
  const accidentals = useSettings((s) => s.accidentals)
  const [scrolling, setScrolling] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  useWakeLock(true)
  useAutoScroll(scrolling, speed, scroller.current)
  const effectiveMode = sheet.hasChords ? mode : 'letra'

  useEffect(() => {
    writeStorage('session', 'adoracao:live-mode', mode)
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = scroller.current
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === 'Escape') onExit()
      else if ((e.key === 'PageDown' || e.key === ' ') && el) {
        e.preventDefault()
        el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' })
      } else if (e.key === 'PageUp' && el) {
        e.preventDefault()
        el.scrollBy({ top: -el.clientHeight * 0.8, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, onExit])

  const step = (d: number) => {
    const k = parseKey(sheet.displayKey)
    if (k) sheet.setDisplayKey(keyNameFor(k.root + d, k.minor, accidentals))
  }
  const zoom = (d: number) => setSetting('fontScale', Math.min(1.8, Math.max(0.75, Math.round((fontScale + d) * 100) / 100)))
  const next = entries[index + 1]

  return (
    <div className={cn('fixed inset-0 z-50 flex flex-col bg-bg text-ink', dark ? 'dark' : 'light')}>
      <header className="pt-safe shrink-0 border-b border-line bg-surface/70 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-1.5 px-2 sm:px-4">
          <IconButton icon={X} label="Sair do modo ao vivo" onClick={onExit} />
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[15px] font-extrabold text-ink">{entry.song.title}</div>
            <div className="truncate text-[12px] font-semibold text-muted">
              {title}
              {entries.length > 1 && ` · ${index + 1}/${entries.length}`}
            </div>
          </div>
          {sheet.hasChords && (
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'cifra', label: 'Cifra' },
                { value: 'letra', label: 'Letra' },
              ]}
              className="hidden sm:inline-flex"
            />
          )}
          <IconButton icon={dark ? Sun : Moon} label={dark ? 'Tela clara' : 'Tela escura'} size="sm" onClick={() => {
            writeStorage('local', 'adoracao:stage-light', dark ? '1' : '0')
            setDark(!dark)
          }} />
          {document.fullscreenEnabled && (
            <IconButton
              icon={Expand}
              label="Tela cheia"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => {}))}
            />
          )}
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-2 pb-2 sm:px-4">
          {sheet.hasChords && (
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'cifra', label: 'Cifra' },
                { value: 'letra', label: 'Letra' },
              ]}
              className="sm:hidden"
            />
          )}
          {effectiveMode === 'cifra' && sheet.baseKey && (
            <div className="flex shrink-0 items-center rounded-full bg-surface-2">
              <IconButton icon={Minus} label="Meio tom abaixo" size="sm" onClick={() => step(-1)} />
              <span className="min-w-10 text-center text-[15px] font-extrabold">{prettyAccidentals(sheet.displayKey ?? '')}</span>
              <IconButton icon={Plus} label="Meio tom acima" size="sm" onClick={() => step(1)} />
            </div>
          )}
          {sheet.capo > 0 && effectiveMode === 'cifra' && <span className="shrink-0 px-1 text-[12px] font-bold text-muted">capo {sheet.capo}</span>}
          <IconButton icon={AArrowDown} label="Diminuir fonte" size="sm" onClick={() => zoom(-0.1)} />
          <IconButton icon={AArrowUp} label="Aumentar fonte" size="sm" onClick={() => zoom(0.1)} />
          <div className="flex-1" />
          <MomentPill id={entry.moment} className="shrink-0" />
        </div>
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
          if (scrolling) setScrolling(false)
        }}
        onTouchEnd={(e) => {
          const start = touch.current
          touch.current = null
          if (!start) return
          const dx = e.changedTouches[0].clientX - start.x
          const dy = e.changedTouches[0].clientY - start.y
          if (Math.abs(dx) > 80 && Math.abs(dy) < 60) go(dx < 0 ? index + 1 : index - 1)
        }}
      >
        <div className="mx-auto max-w-4xl px-5 pt-6 pb-40 sm:px-10">
          {entry.notes && <div className="mb-5 rounded-2xl bg-butter px-4 py-2.5 text-[14px] font-semibold text-butter-ink">{entry.notes}</div>}
          <ChordSheet doc={sheet.doc} mode={effectiveMode} fontScale={fontScale * 1.15} />
          {next && (
            <button type="button" onClick={() => go(index + 1)} className="mt-8 w-full rounded-3xl border border-line bg-surface p-5 text-left">
              <div className="text-[12px] font-bold tracking-wide text-muted uppercase">A seguir</div>
              <div className="mt-1 text-[18px] font-extrabold text-ink">{next.song.title}</div>
            </button>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-line bg-surface/70 px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-30"
          >
            <ChevronLeft className="size-5 shrink-0" />
            <span className="truncate text-[13px] font-semibold text-muted">{entries[index - 1]?.song.title ?? 'Início'}</span>
          </button>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 p-1">
            {scrolling && (
              <button type="button" className="grid size-9 place-items-center rounded-full" aria-label="Mais devagar" onClick={() => setSetting('autoScrollSpeed', Math.max(1, speed - 1))}>
                <Minus className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setScrolling((v) => !v)}
              aria-label={scrolling ? 'Parar rolagem' : 'Rolagem automática'}
              className={cn('grid size-11 place-items-center rounded-full transition-colors', scrolling ? 'bg-primary text-primary-ink' : 'bg-surface text-ink')}
            >
              {scrolling ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            {scrolling && (
              <button type="button" className="grid size-9 place-items-center rounded-full" aria-label="Mais rápido" onClick={() => setSetting('autoScrollSpeed', Math.min(10, speed + 1))}>
                <Plus className="size-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={!next}
            onClick={() => go(index + 1)}
            className="flex h-12 min-w-0 flex-1 items-center justify-end gap-2 rounded-2xl px-3 text-right transition-colors hover:bg-surface-2 disabled:opacity-30"
          >
            <span className="truncate text-[13px] font-bold text-ink">{next?.song.title ?? 'Fim'}</span>
            <ChevronRight className="size-5 shrink-0" />
          </button>
        </div>
      </footer>
    </div>
  )
}
