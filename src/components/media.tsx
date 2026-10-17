import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  AudioLines,
  Download,
  Hand,
  Link2,
  Loader2,
  Mic,
  Pause,
  Pencil,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { SongCover } from '@/components/song-bits'
import { Button, IconButton } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Field, Input, Segmented, Select } from '@/components/ui/primitives'
import { Sheet, confirm } from '@/components/ui/sheet'
import { addRecording, deleteRecording, updateRecording } from '@/lib/actions'
import { backend } from '@/lib/backend'
import { embedUrl, parseMediaUrl, youtubeThumb, type MediaLink } from '@/lib/media'
import { formatDuration, recordingTrack, usePlayer } from '@/lib/player'
import { mediaDuration, recordingSupported, useRecorder } from '@/lib/recorder'
import { useIsAdmin, useMe, useRow, useRows, useTable } from '@/lib/store'
import { cn, compact, firstName, friendlyDate, timeAgo } from '@/lib/utils'
import type { Id, Recording, Song } from '@/types'

// ---------------------------------------------------------------------------
// Player do YouTube / Spotify (carrega só quando o membro toca no play)
// ---------------------------------------------------------------------------

export function songMediaLinks(song: Pick<Song, 'youtubeUrl' | 'spotifyUrl'>): MediaLink[] {
  const links = compact([parseMediaUrl(song.youtubeUrl), parseMediaUrl(song.spotifyUrl)])
  return links.filter((l, i) => links.findIndex((x) => x.provider === l.provider && x.id === l.id) === i)
}

export function MediaEmbed({ link, cover, title, className, autoLoad }: { link: MediaLink; cover?: string | null; title?: string; className?: string; autoLoad?: boolean }) {
  const [loaded, setLoaded] = useState(!!autoLoad)
  useEffect(() => setLoaded(!!autoLoad), [link.provider, link.id, autoLoad])

  if (link.provider === 'youtube') {
    return (
      <div className={cn('relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-card', className)}>
        {loaded ? (
          <iframe
            src={embedUrl(link, { autoplay: !autoLoad })}
            title={title ?? 'Vídeo do YouTube'}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" onClick={() => setLoaded(true)} className="group absolute inset-0" aria-label={`Tocar ${title ?? 'vídeo'} aqui no app`}>
            <img src={youtubeThumb(link.id)} alt="" className="absolute inset-0 size-full object-cover opacity-90 transition-opacity group-hover:opacity-100" referrerPolicy="no-referrer" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <span className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#e0245e] shadow-pop transition-transform group-active:scale-95">
              <Play className="ml-1 size-7 fill-current" />
            </span>
            <span className="absolute right-4 bottom-3 left-4 truncate text-left text-[13px] font-bold text-white">YouTube · tocar aqui no app</span>
          </button>
        )}
      </div>
    )
  }
  const height = link.kind === 'track' || link.kind === 'episode' ? 152 : 352
  return loaded ? (
    <iframe
      src={embedUrl(link)}
      title={title ?? 'Spotify'}
      height={height}
      className={cn('w-full rounded-3xl border-0', className)}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  ) : (
    <button
      type="button"
      onClick={() => setLoaded(true)}
      className={cn('flex w-full items-center gap-3.5 rounded-3xl border border-line bg-surface p-3.5 text-left shadow-card transition-transform active:scale-[0.99]', className)}
    >
      {cover ? (
        <img src={cover} alt="" className="size-14 shrink-0 rounded-2xl object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-mint text-mint-ink">
          <AudioLines className="size-6" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-ink">{title ?? 'Ouvir no Spotify'}</span>
        <span className="block text-[12.5px] text-muted">Spotify · tocar aqui no app</span>
      </span>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#1db954] text-white shadow-card">
        <Play className="ml-0.5 size-5 fill-current" />
      </span>
    </button>
  )
}

/** "Ouvir": vídeo/áudio de referência + gravações de ensaio da música. */
export function ListenPanel({ song, className }: { song: Song; className?: string }) {
  const links = useMemo(() => songMediaLinks(song), [song])
  const [provider, setProvider] = useState<MediaLink['provider']>(links[0]?.provider ?? 'youtube')
  const recordings = useRows('recordings')
    .filter((r) => r.songId === song.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [recOpen, setRecOpen] = useState(false)
  const current = links.find((l) => l.provider === provider) ?? links[0]

  return (
    <div className={cn('space-y-3', className)}>
      {links.length > 1 && (
        <Segmented
          size="sm"
          value={current.provider}
          onChange={setProvider}
          options={links.map((l) => ({ value: l.provider, label: l.provider === 'youtube' ? 'YouTube' : 'Spotify' }))}
        />
      )}
      {current ? (
        <MediaEmbed link={current} cover={song.coverUrl} title={song.title} />
      ) : (
        <div className="flex items-center gap-3 rounded-3xl border border-dashed border-line p-4 text-[13.5px] text-muted">
          <Link2 className="size-5 shrink-0" />
          <span className="flex-1">Sem link de referência. Cole um link do YouTube ou Spotify na edição da música para ouvir aqui.</span>
          <Link to={`/musica/${song.id}/editar`} className="shrink-0 font-bold text-primary">
            Adicionar
          </Link>
        </div>
      )}
      <div className="rounded-3xl border border-line bg-surface p-2 shadow-card">
        <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-1">
          <div className="text-[13px] font-bold tracking-wide text-muted uppercase">Gravações de ensaio</div>
          <Button variant="soft" size="sm" icon={Mic} onClick={() => setRecOpen(true)}>
            Gravar / enviar
          </Button>
        </div>
        {recordings.length ? (
          <div className="divide-y divide-line">
            {recordings.map((r) => (
              <RecordingRow key={r.id} rec={r} showService />
            ))}
          </div>
        ) : (
          <p className="px-2.5 pt-1 pb-3 text-[13px] text-muted">Grave o ensaio desta música para a equipe estudar em casa.</p>
        )}
      </div>
      <AddRecordingSheet open={recOpen} onClose={() => setRecOpen(false)} songId={song.id} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gravações
// ---------------------------------------------------------------------------

export function RecordingRow({ rec, showSong, showService }: { rec: Recording; showSong?: boolean; showService?: boolean }) {
  const me = useMe()
  const isAdmin = useIsAdmin()
  const author = useRow('profiles', rec.createdBy)
  const song = useRow('songs', rec.songId)
  const service = useRow('services', rec.serviceId)
  const active = usePlayer((s) => s.track?.id === rec.id)
  const status = usePlayer((s) => (s.track?.id === rec.id ? s.status : 'idle'))
  const position = usePlayer((s) => (s.track?.id === rec.id ? s.position : 0))
  const duration = usePlayer((s) => (s.track?.id === rec.id ? s.duration : 0)) || rec.durationSec || 0
  const [renaming, setRenaming] = useState(false)
  const canEdit = isAdmin || rec.createdBy === me?.id
  const playing = active && status === 'playing'

  const meta = compact([
    formatDuration(rec.durationSec),
    author ? firstName(author.name) : null,
    timeAgo(rec.createdAt),
    showService && service ? service.title + ' · ' + friendlyDate(service.date, { short: true }) : null,
  ]).join(' · ')

  return (
    <div className="relative flex items-center gap-3 rounded-2xl px-2.5 py-2.5">
      {showSong && song ? (
        <button type="button" onClick={() => void usePlayer.getState().play(recordingTrack(rec, song.title))} className="relative shrink-0" aria-label={`Tocar ${rec.title}`}>
          <SongCover song={song} size={44} />
          <span className="absolute inset-0 grid place-items-center rounded-[14px] bg-black/25 text-white">
            {status === 'loading' ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-label={playing ? 'Pausar' : `Tocar ${rec.title}`}
          onClick={() => (active ? usePlayer.getState().toggle() : void usePlayer.getState().play(recordingTrack(rec, song?.title ?? service?.title)))}
          className={cn('grid size-11 shrink-0 place-items-center rounded-full transition-colors', active ? 'bg-primary text-primary-ink' : 'bg-primary-soft text-primary')}
        >
          {status === 'loading' ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-bold text-ink">{rec.title}</div>
        <div className="truncate text-[12.5px] text-muted">
          {showSong && song ? `${song.title} · ` : ''}
          {meta}
        </div>
        {active && duration > 0 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(100, (position / duration) * 100)}%` }} />
          </div>
        )}
      </div>
      <Menu
        items={[
          {
            label: 'Baixar',
            icon: Download,
            onSelect: async () => {
              try {
                const url = await backend.fileUrl(rec.storagePath)
                const a = document.createElement('a')
                a.href = url
                a.download = `${rec.title}.${rec.storagePath.split('.').pop()}`
                a.click()
              } catch {
                toast.error('Não foi possível baixar')
              }
            },
          },
          { label: 'Renomear e vincular', icon: Pencil, hidden: !canEdit, onSelect: () => setRenaming(true) },
          {
            label: 'Excluir gravação',
            icon: Trash2,
            danger: true,
            hidden: !canEdit,
            onSelect: async () => {
              if (!(await confirm({ title: 'Excluir esta gravação?', description: `“${rec.title}” sai para toda a equipe.`, confirmLabel: 'Excluir', danger: true }))) return
              if (active) usePlayer.getState().stop()
              if (await deleteRecording(rec.id)) toast.success('Gravação excluída')
            },
          },
        ]}
      />
      {canEdit && <EditRecordingSheet rec={rec} open={renaming} onClose={() => setRenaming(false)} />}
    </div>
  )
}

function useLinkOptions() {
  const services = useRows('services')
  const songs = useRows('songs')
  return useMemo(
    () => ({
      services: services.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
      songs: songs.slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    }),
    [services, songs],
  )
}

function LinkFields({ serviceId, songId, onService, onSong }: { serviceId: Id | null; songId: Id | null; onService: (v: Id | null) => void; onSong: (v: Id | null) => void }) {
  const { services, songs } = useLinkOptions()
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Culto / ensaio" hint="opcional">
        {(id) => (
          <Select id={id} value={serviceId ?? ''} onChange={(e) => onService(e.target.value || null)}>
            <option value="">Nenhum</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {friendlyDate(s.date, { short: true })} · {s.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Música" hint="opcional">
        {(id) => (
          <Select id={id} value={songId ?? ''} onChange={(e) => onSong(e.target.value || null)}>
            <option value="">Ensaio geral (várias)</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  )
}

function EditRecordingSheet({ rec, open, onClose }: { rec: Recording; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(rec.title)
  const [serviceId, setServiceId] = useState(rec.serviceId)
  const [songId, setSongId] = useState(rec.songId)
  useEffect(() => {
    if (!open) return
    setTitle(rec.title)
    setServiceId(rec.serviceId)
    setSongId(rec.songId)
  }, [open, rec])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Gravação"
      footer={
        <Button
          className="w-full"
          disabled={!title.trim()}
          onClick={async () => {
            if (await updateRecording(rec.id, { title: title.trim(), serviceId, songId })) onClose()
          }}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <LinkFields serviceId={serviceId} songId={songId} onService={setServiceId} onSong={setSongId} />
      </div>
    </Sheet>
  )
}

const MAX_UPLOAD = 100 * 1024 * 1024

export function AddRecordingSheet({ open, onClose, serviceId: initialService = null, songId: initialSong = null }: { open: boolean; onClose: () => void; serviceId?: Id | null; songId?: Id | null }) {
  const recorder = useRecorder()
  const songs = useTable('songs')
  const services = useTable('services')
  const [mode, setMode] = useState<'choose' | 'record' | 'file'>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [fileDuration, setFileDuration] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [serviceId, setServiceId] = useState<Id | null>(initialService)
  const [songId, setSongId] = useState<Id | null>(initialSong)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (recorder.blob ? URL.createObjectURL(recorder.blob) : null), [recorder.blob])
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])

  useEffect(() => {
    if (!open) return
    setMode('choose')
    setFile(null)
    setFileDuration(null)
    setServiceId(initialService)
    setSongId(initialSong)
    const base = (initialSong && songs[initialSong]?.title) || (initialService && services[initialService]?.title) || 'Ensaio'
    setTitle(`${base} · ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`)
    recorder.reset()
  }, [open])

  const close = () => {
    if (recorder.state === 'recording' || recorder.state === 'paused') recorder.reset()
    onClose()
  }

  const blob = mode === 'record' ? recorder.blob : file
  const ready = !!blob && !!title.trim()

  const save = async () => {
    if (!blob) return
    setSaving(true)
    const id = await addRecording({
      file: blob,
      title,
      serviceId,
      songId,
      durationSec: mode === 'record' ? recorder.elapsed : fileDuration,
      fileName: file?.name,
    })
    setSaving(false)
    if (id) {
      toast.success('Gravação salva para a equipe 🎧')
      onClose()
    }
  }

  const bars = Array.from({ length: 24 }, (_, i) => {
    const wave = Math.sin((i / 24) * Math.PI)
    return Math.max(0.08, Math.min(1, recorder.level * (0.6 + wave * 0.8)))
  })

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Gravação de ensaio"
      description="Grave pelo celular durante o ensaio ou envie um áudio/vídeo que você já tem."
      footer={
        mode !== 'choose' && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => (recorder.reset(), setFile(null), setMode('choose'))}>
              Voltar
            </Button>
            <Button className="flex-1" icon={Upload} disabled={!ready || recorder.state === 'recording'} loading={saving} onClick={() => void save()}>
              Salvar para a equipe
            </Button>
          </div>
        )
      }
    >
      {mode === 'choose' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recordingSupported() && (
            <ChoiceButton
              icon={Mic}
              title="Gravar agora"
              description="Usa o microfone deste aparelho"
              color="rose"
              onClick={() => {
                setMode('record')
                void recorder.start()
              }}
            />
          )}
          <ChoiceButton icon={Upload} title="Enviar arquivo" description="MP3, M4A, WAV ou vídeo (até 100 MB)" color="sky" onClick={() => fileInput.current?.click()} />
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (f.size > MAX_UPLOAD) {
                toast.error('Arquivo muito grande', { description: 'O limite é 100 MB. Exporte o áudio em MP3 ou M4A.' })
                return
              }
              setFile(f)
              setMode('file')
              setFileDuration(await mediaDuration(f))
              if (f.name) setTitle((t) => (t.startsWith('Ensaio ·') ? f.name.replace(/\.[^.]+$/, '') : t))
            }}
          />
        </div>
      )}

      {mode === 'record' && (
        <div className="space-y-5">
          <div className="rounded-3xl bg-surface-2 p-5 text-center">
            <div className="flex h-16 items-center justify-center gap-[3px]" aria-hidden>
              {bars.map((h, i) => (
                <span
                  key={i}
                  className={cn('w-1.5 rounded-full transition-[height] duration-75', recorder.state === 'recording' ? 'bg-rose-ink' : 'bg-muted/40')}
                  style={{ height: `${recorder.state === 'recording' ? h * 100 : 10}%` }}
                />
              ))}
            </div>
            <div className="mt-3 font-mono text-[34px] font-extrabold tracking-tight text-ink tabular-nums">{formatDuration(recorder.elapsed)}</div>
            <div className="text-[13px] font-semibold text-muted">
              {recorder.state === 'asking' && 'Aguardando permissão do microfone…'}
              {recorder.state === 'recording' && 'Gravando — deixe o celular perto da banda, longe da caixa de som'}
              {recorder.state === 'paused' && 'Pausado'}
              {recorder.state === 'done' && 'Gravação pronta. Ouça antes de salvar:'}
              {recorder.state === 'error' && recorder.error}
            </div>
            {preview && recorder.state === 'done' && <audio src={preview} controls className="mx-auto mt-3 w-full" />}
            <div className="mt-4 flex justify-center gap-2">
              {recorder.state === 'recording' && (
                <Button variant="outline" icon={Pause} onClick={recorder.pause}>
                  Pausar
                </Button>
              )}
              {recorder.state === 'paused' && (
                <Button variant="outline" icon={Mic} onClick={recorder.resume}>
                  Continuar
                </Button>
              )}
              {(recorder.state === 'recording' || recorder.state === 'paused') && (
                <Button variant="danger" icon={Square} onClick={recorder.stop}>
                  Parar
                </Button>
              )}
              {(recorder.state === 'done' || recorder.state === 'error') && (
                <Button variant="outline" icon={RotateCcw} onClick={() => void recorder.start()}>
                  Gravar de novo
                </Button>
              )}
            </div>
          </div>
          <RecordingDetails title={title} setTitle={setTitle} serviceId={serviceId} songId={songId} setServiceId={setServiceId} setSongId={setSongId} />
        </div>
      )}

      {mode === 'file' && file && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-3xl bg-surface-2 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky text-sky-ink">
              <AudioLines className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-bold text-ink">{file.name}</div>
              <div className="text-[12.5px] text-muted">
                {(file.size / 1024 / 1024).toFixed(1)} MB{fileDuration ? ` · ${formatDuration(fileDuration)}` : ''}
              </div>
            </div>
            <IconButton icon={X} label="Trocar arquivo" size="sm" onClick={() => (setFile(null), setMode('choose'))} />
          </div>
          <RecordingDetails title={title} setTitle={setTitle} serviceId={serviceId} songId={songId} setServiceId={setServiceId} setSongId={setSongId} />
        </div>
      )}
    </Sheet>
  )
}

function RecordingDetails(p: {
  title: string
  setTitle: (v: string) => void
  serviceId: Id | null
  songId: Id | null
  setServiceId: (v: Id | null) => void
  setSongId: (v: Id | null) => void
}) {
  return (
    <div className="space-y-4">
      <Field label="Nome da gravação">{(id) => <Input id={id} value={p.title} onChange={(e) => p.setTitle(e.target.value)} />}</Field>
      <LinkFields serviceId={p.serviceId} songId={p.songId} onService={p.setServiceId} onSong={p.setSongId} />
    </div>
  )
}

function ChoiceButton({ icon: Icon, title, description, color, onClick }: { icon: LucideIcon; title: string; description: string; color: 'rose' | 'sky'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 text-left shadow-card transition-transform active:scale-[0.98]">
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', color === 'rose' ? 'bg-rose text-rose-ink' : 'bg-sky text-sky-ink')}>
        <Icon className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        <span className="block text-[12.5px] text-muted">{description}</span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Mini player fixo (continua tocando entre as telas)
// ---------------------------------------------------------------------------

const RATES = [0.75, 0.9, 1, 1.1, 1.25]

export function AudioDock({ aboveToolbar }: { aboveToolbar?: boolean }) {
  const { track, status, position, duration, rate, loop } = usePlayer()
  const song = useRow('songs', track?.songId)
  const author = useRows('recordings').find((r) => r.id === track?.id)?.createdBy
  const authorProfile = useRow('profiles', author)
  if (!track) return null
  const p = usePlayer.getState()
  const playing = status === 'playing'
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-40 px-3 lg:right-6 lg:left-auto lg:w-[440px] lg:px-0',
        'bottom-[calc(84px+env(safe-area-inset-bottom))]',
        aboveToolbar ? 'lg:bottom-24' : 'lg:bottom-6',
      )}
    >
      <div className="glass pointer-events-auto mx-auto max-w-lg rounded-[24px] border border-line p-2.5 shadow-pop">
        <div className="flex items-center gap-3">
          {song ? <SongCover song={song} size={42} /> : authorProfile ? <Avatar profile={authorProfile} size="md" /> : (
            <span className="grid size-[42px] shrink-0 place-items-center rounded-[14px] bg-primary-soft text-primary">
              <AudioLines className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-ink">{track.title}</div>
            <div className="truncate text-[12px] text-muted">
              {formatDuration(position)} / {formatDuration(duration)}
              {track.subtitle ? ` · ${track.subtitle}` : ''}
            </div>
          </div>
          <IconButton icon={RotateCcw} label="Voltar 10 segundos" size="sm" onClick={() => p.skip(-10)} className="hidden sm:inline-flex" />
          <button
            type="button"
            aria-label={playing ? 'Pausar' : 'Tocar'}
            onClick={p.toggle}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-ink shadow-float active:scale-95"
          >
            {status === 'loading' ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </button>
          <IconButton icon={RotateCw} label="Avançar 10 segundos" size="sm" onClick={() => p.skip(10)} className="hidden sm:inline-flex" />
          <IconButton icon={X} label="Fechar player" size="sm" onClick={p.stop} />
        </div>
        <div className="mt-2 flex items-center gap-2 px-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(position, duration || 0)}
            onChange={(e) => p.seek(Number(e.target.value))}
            aria-label="Posição"
            className="range-slim h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => p.setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
            className="h-7 shrink-0 rounded-full bg-surface-2 px-2.5 text-[12px] font-extrabold text-ink-2 tabular-nums"
            aria-label="Velocidade"
            title="Velocidade (para estudar mais devagar)"
          >
            {rate.toString().replace('.', ',')}×
          </button>
          <button
            type="button"
            onClick={() => p.setLoop(!loop)}
            aria-pressed={loop}
            aria-label="Repetir"
            className={cn('grid size-7 shrink-0 place-items-center rounded-full', loop ? 'bg-primary-soft text-primary' : 'text-muted')}
          >
            <Repeat className="size-4" strokeWidth={2.3} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BPM no toque
// ---------------------------------------------------------------------------

export function TapTempo({ onBpm, className }: { onBpm: (bpm: number) => void; className?: string }) {
  const taps = useRef<number[]>([])
  const [bpm, setBpm] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const tap = () => {
    const now = performance.now()
    const last = taps.current[taps.current.length - 1]
    if (last && now - last > 2000) taps.current = []
    taps.current.push(now)
    taps.current = taps.current.slice(-9)
    setCount(taps.current.length)
    if (taps.current.length >= 3) {
      const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i])
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const value = Math.round(60000 / avg)
      if (value >= 30 && value <= 260) {
        setBpm(value)
        onBpm(value)
      }
    }
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault()
        tap()
      }}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), tap())}
      className={cn(
        'flex w-full touch-manipulation items-center gap-3 rounded-3xl border-2 border-dashed border-primary/40 bg-primary-soft px-4 py-3 text-left transition-transform select-none active:scale-[0.98]',
        className,
      )}
    >
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-ink transition-transform', count && 'animate-[pulse_0.2s_ease-out]')}>
        <Hand className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{bpm ? `${bpm} BPM` : 'Toque no ritmo'}</span>
        <span className="block text-[12.5px] text-muted">{bpm ? 'Continue tocando para refinar' : 'Dê play e toque aqui a cada batida (4 ou mais toques)'}</span>
      </span>
    </button>
  )
}
