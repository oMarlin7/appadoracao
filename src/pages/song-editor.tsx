import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import {
  ChevronDown,
  ClipboardPaste,
  Eye,
  FileText,
  ImagePlus,
  ListPlus,
  Loader2,
  Minus,
  PencilLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { ChordSheet } from '@/components/chord-sheet'
import { Page, TopBar } from '@/components/layout'
import { SongCover } from '@/components/song-bits'
import { ThemeEditorSheet } from '@/components/theme-editor'
import { Button } from '@/components/ui/button'
import { Card, Chip, Field, Input, Segmented, Select, Textarea } from '@/components/ui/primitives'
import { Sheet, confirm } from '@/components/ui/sheet'
import { newSong, saveSong } from '@/lib/actions'
import { useDocumentTitle, useThemes } from '@/lib/hooks'
import { pickFile, squareImageDataUrl } from '@/lib/images'
import { SmartImport } from '@/components/smart-import'
import { chordSearchUrl, extractMediaLinks, parseMediaUrl, youtubeThumb, type MediaLink } from '@/lib/media'
import { detectKeyFromText, tempoFromBpm } from '@/lib/music/analyze'
import { docLyrics, parseSheet, transposeText } from '@/lib/music/sheet'
import { allKeys, makeSpeller, normalizeKeyName, prettyAccidentals, transposeKey } from '@/lib/music/theory'
import { analyzeImport, analyzeLocally, analyzeWithAI, aiAvailable, draftMeaning, fetchLinkMetadata, type ImportAnalysis, type LinkMetadata, type SongAnalysis } from '@/lib/song-import'
import type { SongCandidate, SongDetails } from '@/lib/song-search'
import { useRow, useSettings } from '@/lib/store'
import { MOMENTS, TEMPOS, THEME_BY_ID, groupThemes, suggestMoments, suggestThemes } from '@/lib/taxonomy'
import { cn, plural } from '@/lib/utils'
import type { Song } from '@/types'

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8']

const PLACEHOLDER = `[Intro] G  D/F#  Em  C

[Verso]
G              D/F#
Escreva os acordes na linha de cima
Em             C
E a letra logo abaixo

[Refrão]
...`

function KeySelect({ id, value, onChange, placeholder }: { id: string; value: string | null; onChange: (v: string | null) => void; placeholder: string }) {
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      <optgroup label="Maiores">
        {allKeys(false).map((k) => (
          <option key={k} value={k}>
            {prettyAccidentals(k)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Menores">
        {allKeys(true).map((k) => (
          <option key={k} value={k}>
            {prettyAccidentals(k)}
          </option>
        ))}
      </optgroup>
    </Select>
  )
}

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  )
}

const splitList = (s: string) =>
  s
    .split(/[;,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

const sameList = (a: string[] | undefined, b: string[] | undefined) => (a ?? []).join('|') === (b ?? []).join('|')

/** Coloca cada link no campo certo (um link do Spotify colado no campo do YouTube, por exemplo). */
function sortLinks(song: Song): Song {
  const links = [parseMediaUrl(song.youtubeUrl), parseMediaUrl(song.spotifyUrl)]
  const yt = links.find((l) => l?.provider === 'youtube')
  const sp = links.find((l) => l?.provider === 'spotify')
  return {
    ...song,
    youtubeUrl: yt?.url ?? (song.youtubeUrl && !parseMediaUrl(song.youtubeUrl) ? song.youtubeUrl : null),
    spotifyUrl: sp?.url ?? null,
  }
}

export function SongEditorPage() {
  const { id } = useParams()
  const existing = useRow('songs', id)
  const isNew = !id
  useDocumentTitle(isNew ? 'Nova música' : `Editar ${existing?.title ?? ''}`)
  const navigate = useNavigate()
  const themes = useThemes()
  const [song, setSong] = useState<Song>(() => existing ?? newSong())
  const [refsText, setRefsText] = useState(() => (existing?.bibleRefs ?? []).join('; '))
  const [tagsText, setTagsText] = useState(() => (existing?.tags ?? []).join(', '))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [autoPaste, setAutoPaste] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [themeSheet, setThemeSheet] = useState(false)
  const [allThemes, setAllThemes] = useState(false)
  const [view, setView] = useState<'editar' | 'previa'>('editar')
  const [analysis, setAnalysis] = useState<{ state: 'idle' | 'running' | 'done'; source?: SongAnalysis['source'] }>({ state: 'idle' })
  const [smart, setSmart] = useState(isNew)
  const titleRef = useRef<HTMLInputElement>(null)
  /** Referências preenchidas automaticamente (o campo é texto, fora do objeto da música). */
  const autoRefs = useRef('')
  const fontScale = useSettings((s) => s.fontScale)
  const sheetRef = useRef<HTMLDivElement>(null)
  /** Valores preenchidos automaticamente: podem ser substituídos por uma análise melhor. */
  const auto = useRef<Partial<Song>>({})

  const set = <K extends keyof Song>(key: K, value: Song[K]) => {
    setSong((s) => ({ ...s, [key]: value }))
    setDirty(true)
  }

  const doc = useMemo(() => parseSheet(song.content), [song.content])
  const lyrics = useMemo(() => docLyrics(doc), [doc])
  const themeSuggestions = useMemo(() => suggestThemes(`${song.title}\n${lyrics}`).filter((t) => !song.themes.includes(t)), [lyrics, song.title, song.themes])
  const momentSuggestions = useMemo(
    () => suggestMoments(song.themes.length ? song.themes : suggestThemes(lyrics), song.tempo).filter((m) => !song.moments.includes(m)),
    [song.themes, song.tempo, song.moments, lyrics],
  )

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirm({ title: 'Sair sem salvar?', description: 'As alterações desta música serão perdidas.', confirmLabel: 'Sair sem salvar', danger: true }).then((ok) =>
      ok ? blocker.proceed() : blocker.reset(),
    )
  }, [blocker])

  /** Aplica valores automáticos sem apagar o que o membro já escreveu à mão. */
  const applyAuto = (patch: Partial<Song>) => {
    setSong((s) => {
      const next: Song = { ...s }
      for (const [k, v] of Object.entries(patch) as Array<[keyof Song, Song[keyof Song]]>) {
        const current = s[k]
        const empty = current === null || current === undefined || current === '' || (Array.isArray(current) && current.length === 0)
        const wasAuto = Array.isArray(current) ? sameList(current, auto.current[k] as string[] | undefined) : current === auto.current[k]
        if (empty || wasAuto) {
          ;(next as unknown as Record<string, unknown>)[k] = v
          ;(auto.current as Record<string, unknown>)[k] = v
        }
      }
      return next
    })
    setDirty(true)
  }

  const applyAnalysis = (a: SongAnalysis) => {
    applyAuto(
      Object.fromEntries(
        Object.entries({
          themes: a.themes.length ? a.themes : undefined,
          moments: a.moments.length ? a.moments : undefined,
          meaning: a.meaning || undefined,
          tempo: a.tempo ?? undefined,
          bpm: a.bpm ?? undefined,
        }).filter(([, v]) => v !== undefined),
      ) as Partial<Song>,
    )
    if (a.bibleRefs.length && !refsText.trim()) setRefsText(a.bibleRefs.join('; '))
    setAnalysis({ state: 'done', source: a.source })
  }

  /** Ficha automática: análise local na hora; com IA disponível, refina em seguida. */
  const runAnalysis = async (base: { title: string; artist: string; content: string; bpm: number | null; tempo: Song['tempo'] }, useAI = true) => {
    const text = docLyrics(parseSheet(base.content))
    applyAnalysis(analyzeLocally({ title: base.title, lyrics: text, bpm: base.bpm, tempo: base.tempo }))
    if (!useAI || !aiAvailable() || (!text && !base.title)) return
    setAnalysis({ state: 'running' })
    const ai = await analyzeWithAI({ title: base.title, artist: base.artist, lyrics: text })
    if (ai) {
      applyAnalysis(ai)
      toast.success('Ficha preenchida pela IA', { description: 'Confira temas, momentos e significado antes de salvar.' })
    } else setAnalysis({ state: 'done', source: 'local' })
  }

  /** Ficha completa da busca pelo nome (sem IA: sugestões pelo título e o BPM do catálogo). */
  const applyDetails = (d: SongDetails | null, c: SongCandidate) => {
    if (!d?.ia) {
      if (d?.bpm) applyAuto({ bpm: d.bpm })
      void runAnalysis({ title: c.title, artist: c.artist, content: '', bpm: d?.bpm ?? null, tempo: null }, false)
      return
    }
    const yt = parseMediaUrl(d.youtubeUrl)
    applyAuto(
      compactPatch({
        youtubeUrl: d.youtubeUrl,
        spotifyUrl: d.spotifyUrl,
        coverUrl: c.coverUrl ?? (yt?.provider === 'youtube' ? youtubeThumb(yt.id) : null),
        originalKey: d.originalKey,
        bpm: d.bpm,
        timeSignature: d.timeSignature,
        tempo: d.tempo ?? tempoFromBpm(d.bpm),
        themes: d.themes,
        moments: d.moments,
        meaning: d.meaning,
        notes: d.arrangementNotes,
      }),
    )
    if (d.bibleRefs.length)
      setRefsText((cur) => {
        if (cur.trim() && cur !== autoRefs.current) return cur
        autoRefs.current = d.bibleRefs.join('; ')
        return autoRefs.current
      })
    setAnalysis({ state: 'done', source: 'ia' })
  }

  /** "Escolher outra música": desfaz só o que foi preenchido automaticamente. */
  const clearAuto = () => {
    const blank = newSong()
    setSong((s) => {
      const next = { ...s }
      for (const [k, v] of Object.entries(auto.current) as Array<[keyof Song, unknown]>) {
        const current = s[k]
        const same = Array.isArray(current) ? sameList(current as string[], v as string[]) : current === v
        if (same) (next as unknown as Record<string, unknown>)[k] = blank[k]
      }
      return next
    })
    auto.current = {}
    setRefsText((cur) => (cur === autoRefs.current ? '' : cur))
    autoRefs.current = ''
    setAnalysis({ state: 'idle' })
  }

  /** Abre o campo de colar já com o que estiver copiado (quando o aparelho deixa ler). */
  const pasteCifra = () => {
    setAutoPaste(true)
    setImportOpen(true)
  }

  const applyCifra = (r: ImportAnalysis) => {
    const next = {
      title: song.title || r.title || '',
      artist: song.artist || r.artist || '',
      content: r.content,
      bpm: song.bpm ?? r.bpm ?? null,
      tempo: song.tempo,
    }
    setSong((s) => ({
      ...s,
      title: next.title,
      artist: next.artist,
      originalKey: r.key ? normalizeKeyName(r.key) : s.originalKey,
      bpm: next.bpm,
      tempo: s.tempo ?? tempoFromBpm(r.bpm),
      content: r.content,
    }))
    setDirty(true)
    setImportOpen(false)
    toast.success('Cifra organizada', { description: compactJoin([r.key && `Tom ${r.key} (${r.keySource === 'texto' ? 'informado' : 'detectado'})`, `${r.chordCount} acordes`]) })
    // A ficha da pesquisa (IA) vale mais que a sugestão pela letra.
    if (analysis.source !== 'ia') void runAnalysis(next)
  }

  const save = async () => {
    if (!song.title.trim()) {
      toast.error('Dê um título para a música')
      return
    }
    setSaving(true)
    const final: Song = sortLinks({
      ...song,
      bibleRefs: splitList(refsText),
      tags: splitList(tagsText).map((t) => t.replace(/^#/, '').toLowerCase()),
      originalKey: song.originalKey ?? detectKeyFromText(song.content),
    })
    const ok = await saveSong(final)
    if (ok) {
      setDirty(false)
      toast.success(isNew ? 'Música adicionada 🎶' : 'Alterações salvas')
      setTimeout(() => navigate(`/musica/${final.id}`, { replace: true }), 0)
    } else setSaving(false)
  }

  /** Reescreve a cifra salva em outro tom (o tom da equipe continua o mesmo). */
  const transposeContent = (d: number) => {
    const base = song.originalKey ?? detectKeyFromText(song.content)
    const target = base ? transposeKey(base, d) : null
    const next = transposeText(song.content, d, makeSpeller(target))
    setSong((s) => ({ ...s, content: next, originalKey: target ?? s.originalKey }))
    setDirty(true)
  }

  const chooseCover = async () => {
    const file = await pickFile('image/*')
    if (!file) return
    try {
      set('coverUrl', await squareImageDataUrl(file, 360))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível usar esta imagem')
    }
  }

  if (id && !existing)
    return (
      <>
        <TopBar backTo="/musicas" />
        <Page>
          <p className="py-16 text-center text-muted">Música não encontrada.</p>
        </Page>
      </>
    )

  const visibleThemes = allThemes ? themes : themes.filter((t) => song.themes.includes(t.id))
  const ytLink = parseMediaUrl(song.youtubeUrl)

  return (
    <>
      <TopBar
        title={isNew ? 'Nova música' : 'Editar música'}
        actions={
          <Button size="sm" icon={Save} loading={saving} onClick={() => void save()}>
            Salvar
          </Button>
        }
      />
      <Page className="max-w-6xl pt-5 pb-28">
        {isNew &&
          (smart ? (
            <SmartImport
              song={song}
              themes={themes}
              onPick={(c) => applyAuto(compactPatch({ title: c.title, artist: c.artist, coverUrl: c.coverUrl }))}
              onDetails={applyDetails}
              onLink={(link, meta) =>
                applyAuto(
                  compactPatch({
                    title: meta.title,
                    artist: meta.artist,
                    coverUrl: meta.coverUrl,
                    youtubeUrl: link.provider === 'youtube' ? link.url : null,
                    spotifyUrl: link.provider === 'spotify' ? link.url : null,
                  }),
                )
              }
              onReset={clearAuto}
              onPasteCifra={() => void pasteCifra()}
              onOpenPaste={() => {
                setAutoPaste(false)
                setImportOpen(true)
              }}
              onShowSheet={() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              onManual={() => {
                setSmart(false)
                setTimeout(() => titleRef.current?.focus(), 50)
              }}
              onBatch={() => setBatchOpen(true)}
              onBpm={(bpm) => {
                setSong((s) => ({ ...s, bpm, tempo: !s.tempo || s.tempo === auto.current.tempo ? tempoFromBpm(bpm) : s.tempo }))
                auto.current.tempo = tempoFromBpm(bpm)
                setDirty(true)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setSmart(true)}
              className="mb-5 flex w-full items-center gap-3 rounded-3xl border border-dashed border-primary/40 bg-primary-soft/50 px-5 py-4 text-left text-[15px] font-bold text-primary"
            >
              <Search className="size-5" /> Buscar a música pelo nome
            </button>
          ))}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <Section title="Música">
              <div className="flex items-center gap-4">
                <SongCover song={song} size={84} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink-2">Capa</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" icon={ImagePlus} onClick={() => void chooseCover()}>
                      {song.coverUrl ? 'Trocar' : 'Escolher foto'}
                    </Button>
                    {ytLink && song.coverUrl !== `https://i.ytimg.com/vi/${ytLink.id}/hqdefault.jpg` && (
                      <Button variant="ghost" size="sm" icon={ImagePlus} onClick={() => set('coverUrl', `https://i.ytimg.com/vi/${ytLink.id}/hqdefault.jpg`)}>
                        Do vídeo
                      </Button>
                    )}
                    {song.coverUrl && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => set('coverUrl', null)} aria-label="Remover capa" />}
                  </div>
                </div>
              </div>
              <Field label="Título">{(fid) => <Input ref={titleRef} id={fid} value={song.title} onChange={(e) => set('title', e.target.value)} placeholder="Nome da música" autoFocus={!isNew} />}</Field>
              <Field label="Artista / ministério">{(fid) => <Input id={fid} value={song.artist} onChange={(e) => set('artist', e.target.value)} placeholder="Quem gravou ou compôs" />}</Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tom original">
                  {(fid) => <KeySelect id={fid} value={song.originalKey} onChange={(v) => set('originalKey', v)} placeholder={detectKeyFromText(song.content) ? `Detectado: ${detectKeyFromText(song.content)}` : 'Escolher'} />}
                </Field>
                <Field label="Tom da equipe" hint="opcional">
                  {(fid) => <KeySelect id={fid} value={song.teamKey} onChange={(v) => set('teamKey', v)} placeholder="= original" />}
                </Field>
                <Field label="BPM" hint="opcional">
                  {(fid) => (
                    <Input
                      id={fid}
                      inputMode="numeric"
                      value={song.bpm ?? ''}
                      onChange={(e) => {
                        const bpm = parseInt(e.target.value.replace(/\D/g, ''), 10) || null
                        setSong((s) => ({ ...s, bpm, tempo: s.tempo ?? tempoFromBpm(bpm) }))
                        setDirty(true)
                      }}
                      placeholder="Ex.: 72"
                    />
                  )}
                </Field>
                <Field label="Compasso">
                  {(fid) => (
                    <Select id={fid} value={song.timeSignature ?? '4/4'} onChange={(e) => set('timeSignature', e.target.value)}>
                      {TIME_SIGNATURES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-ink-2">Ritmo</div>
                <div className="flex flex-wrap gap-2">
                  {TEMPOS.map((t) => (
                    <Chip key={t.id} icon={t.icon} color={t.color} selected={song.tempo === t.id} onClick={() => set('tempo', song.tempo === t.id ? null : t.id)}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </div>
            </Section>

            <Section
              title="Organização"
              action={
                analysis.state === 'running' ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-bold text-primary">
                    <Loader2 className="size-3.5 animate-spin" /> IA analisando…
                  </span>
                ) : analysis.source === 'ia' ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-bold text-primary">
                    <Sparkles className="size-3.5" /> Preenchido pela IA
                  </span>
                ) : undefined
              }
            >
              <div>
                <div className="mb-2 flex items-center justify-between gap-2 text-[13px] font-semibold text-ink-2">
                  <span>Temas {song.themes.length > 0 && <span className="text-muted">· {song.themes.length}</span>}</span>
                  <button type="button" className="flex items-center gap-1 text-[12.5px] font-bold text-primary" onClick={() => setThemeSheet(true)}>
                    <Plus className="size-3.5" /> Novo tema
                  </button>
                </div>
                {themeSuggestions.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-2.5">
                    <span className="flex items-center gap-1 px-1 text-[12.5px] font-bold text-primary">
                      <Sparkles className="size-3.5" /> Pela letra:
                    </span>
                    {themeSuggestions.map((t) => {
                      const theme = THEME_BY_ID[t]
                      return theme ? (
                        <Chip key={t} size="sm" icon={Plus} onClick={() => set('themes', [...song.themes, t])}>
                          {theme.short ?? theme.name}
                        </Chip>
                      ) : null
                    })}
                  </div>
                )}
                {allThemes ? (
                  <div className="space-y-3">
                    {groupThemes(themes).map((g) => (
                      <div key={g.id}>
                        <div className="mb-1.5 text-[11.5px] font-bold tracking-wide text-muted uppercase">{g.name}</div>
                        <div className="flex flex-wrap gap-2">
                          {g.themes.map((t) => (
                            <Chip
                              key={t.id}
                              size="sm"
                              icon={t.icon}
                              color={t.color}
                              selected={song.themes.includes(t.id)}
                              onClick={() => set('themes', song.themes.includes(t.id) ? song.themes.filter((x) => x !== t.id) : [...song.themes, t.id])}
                            >
                              {t.short ?? t.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {visibleThemes.map((t) => (
                      <Chip key={t.id} size="sm" icon={t.icon} color={t.color} selected onClick={() => set('themes', song.themes.filter((x) => x !== t.id))}>
                        {t.short ?? t.name}
                      </Chip>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setAllThemes((v) => !v)} className="mt-2.5 flex items-center gap-1 text-[13px] font-bold text-primary">
                  <ChevronDown className={cn('size-4 transition-transform', allThemes && 'rotate-180')} />
                  {allThemes ? 'Mostrar só os escolhidos' : `Escolher entre ${themes.length} temas`}
                </button>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-ink-2">
                  Momentos do culto
                  {momentSuggestions.length > 0 && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[12.5px] font-bold text-primary"
                      onClick={() => set('moments', Array.from(new Set([...song.moments, ...momentSuggestions])))}
                    >
                      <Sparkles className="size-3.5" /> Sugerir
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {MOMENTS.map((m) => (
                    <Chip
                      key={m.id}
                      size="sm"
                      icon={m.icon}
                      color={m.color}
                      selected={song.moments.includes(m.id)}
                      onClick={() => set('moments', song.moments.includes(m.id) ? song.moments.filter((x) => x !== m.id) : [...song.moments, m.id])}
                      className={cn(momentSuggestions.includes(m.id) && !song.moments.includes(m.id) && 'border-dashed border-primary/40')}
                    >
                      {m.short ?? m.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <Field
                label="Significado / mensagem"
                hint={
                  !song.meaning && song.themes.length ? (
                    <button type="button" className="font-bold text-primary" onClick={() => set('meaning', draftMeaning(song.themes, song.moments))}>
                      Rascunho automático
                    </button>
                  ) : undefined
                }
              >
                {(fid) => (
                  <Textarea
                    id={fid}
                    rows={4}
                    value={song.meaning}
                    onChange={(e) => set('meaning', e.target.value)}
                    placeholder="Ex.: Fala da fidelidade de Deus nas estações difíceis. Boa para ministrar depois de uma palavra de consolo."
                  />
                )}
              </Field>
              <Field label="Referências bíblicas" hint="separe por ponto e vírgula">
                {(fid) => (
                  <Input
                    id={fid}
                    value={refsText}
                    onChange={(e) => {
                      setRefsText(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="Salmos 23; João 3:16"
                  />
                )}
              </Field>
              <Field label="Etiquetas" hint="separe por vírgula">
                {(fid) => (
                  <Input
                    id={fid}
                    value={tagsText}
                    onChange={(e) => {
                      setTagsText(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="hino, jovens, natal 2026"
                  />
                )}
              </Field>
            </Section>

            <Section title="Para a equipe">
              <Field label="Notas de arranjo" hint="opcional">
                {(fid) => <Textarea id={fid} rows={3} value={song.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: Intro só com teclado. Bateria entra no 2º refrão." />}
              </Field>
              <Field label="Link do YouTube" hint="opcional">
                {(fid) => <Input id={fid} type="url" inputMode="url" value={song.youtubeUrl ?? ''} onChange={(e) => set('youtubeUrl', e.target.value || null)} placeholder="https://youtube.com/watch?v=…" />}
              </Field>
              <Field label="Link do Spotify" hint="opcional">
                {(fid) => <Input id={fid} type="url" inputMode="url" value={song.spotifyUrl ?? ''} onChange={(e) => set('spotifyUrl', e.target.value || null)} placeholder="https://open.spotify.com/track/…" />}
              </Field>
            </Section>
          </div>

          <div ref={sheetRef} className="min-w-0 scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'editar', label: 'Cifra', icon: PencilLine },
                    { value: 'previa', label: 'Prévia', icon: Eye },
                  ]}
                />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" icon={ClipboardPaste} onClick={() => setImportOpen(true)}>
                    Colar
                  </Button>
                  <Button variant="ghost" size="sm" icon={Minus} onClick={() => transposeContent(-1)} disabled={!song.content} aria-label="Transpor meio tom abaixo" />
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => transposeContent(1)} disabled={!song.content} aria-label="Transpor meio tom acima" />
                </div>
              </div>
              {view === 'editar' ? (
                <textarea
                  value={song.content}
                  onChange={(e) => set('content', e.target.value)}
                  spellCheck={false}
                  placeholder={PLACEHOLDER}
                  className="block min-h-[60vh] w-full resize-y bg-surface px-4 py-4 font-mono text-[14px] leading-[1.55] text-ink outline-none placeholder:text-muted/60"
                />
              ) : (
                <div className="max-h-[70vh] min-h-[60vh] overflow-y-auto px-5 py-5">
                  <ChordSheet doc={doc} mode="cifra" fontScale={fontScale * 0.92} />
                </div>
              )}
            </Card>
          </div>
        </div>
      </Page>

      <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-line bg-surface/90 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl lg:left-[264px]">
        <div className="mx-auto flex max-w-6xl justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button icon={Save} loading={saving} onClick={() => void save()} className="min-w-36">
            {isNew ? 'Adicionar música' : 'Salvar'}
          </Button>
        </div>
      </div>

      <ImportSheet open={importOpen} autoPaste={autoPaste} onClose={() => setImportOpen(false)} onApply={applyCifra} searchUrl={song.title ? chordSearchUrl(song.title, song.artist) : null} />
      <ThemeEditorSheet open={themeSheet} onClose={() => setThemeSheet(false)} onSaved={(tid) => set('themes', [...song.themes, tid])} />
      <BatchImportSheet open={batchOpen} onClose={() => setBatchOpen(false)} />
    </>
  )
}

const compactJoin = (parts: Array<string | false | null | undefined | 0>) => parts.filter(Boolean).join(' · ')

/** Só os valores preenchidos (o que veio vazio não apaga nada). */
function compactPatch(patch: Partial<Song>): Partial<Song> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<Song>
}

// ---------------------------------------------------------------------------
// Colar cifra
// ---------------------------------------------------------------------------

function ImportSheet({
  open,
  autoPaste,
  onClose,
  onApply,
  searchUrl,
}: {
  open: boolean
  autoPaste?: boolean
  onClose: () => void
  onApply: (r: ImportAnalysis) => void
  searchUrl: string | null
}) {
  const [text, setText] = useState('')
  const analysis = useMemo(() => (text.trim() ? analyzeImport(text) : null), [text])
  useEffect(() => {
    if (!open) return
    setText('')
    if (!autoPaste || !navigator.clipboard?.readText) return
    // Alguns aparelhos pedem permissão (ou nunca respondem): o campo já está aberto para colar à mão.
    let alive = true
    navigator.clipboard
      .readText()
      .then((t) => alive && t.trim() && setText((cur) => cur || t))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, autoPaste])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Colar cifra"
      description="Cole a cifra completa."
      size="lg"
      tall
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {analysis && (
            <div className="min-w-0 flex-1 text-[13px] text-muted">
              {analysis.title && <b className="text-ink">{analysis.title}</b>}
              {analysis.artist && ` · ${analysis.artist}`}
              {analysis.key && ` · Tom ${analysis.key} (${analysis.keySource})`}
              {` · ${analysis.chordCount} acordes`}
            </div>
          )}
          <div className="ml-auto flex gap-2">
            {searchUrl && !text && (
              <a href={searchUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-ink-2 hover:bg-surface-2">
                <Search className="size-4" /> Procurar
              </a>
            )}
            <Button
              variant="ghost"
              icon={FileText}
              onClick={async () => {
                const file = await pickFile('.txt,.cho,.chopro,.chordpro,.crd,.pro,text/plain')
                if (file) setText(await file.text())
              }}
            >
              Arquivo
            </Button>
            <Button
              variant="outline"
              icon={ClipboardPaste}
              onClick={async () => {
                try {
                  setText(await navigator.clipboard.readText())
                } catch {
                  toast('Não foi possível ler a área de transferência', { description: 'Cole com Ctrl+V ou segurando o dedo no campo.' })
                }
              }}
            >
              Colar
            </Button>
            <Button icon={Wand2} disabled={!analysis} onClick={() => analysis && onApply(analysis)}>
              Organizar
            </Button>
          </div>
        </div>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        autoFocus
        placeholder={'Nome da música\nArtista\n\nTom: G\n[Intro] G  D  Em  C\n\n[Primeira Parte]\nG            D\nLetra da música…'}
        className="block h-full min-h-[50vh] w-full resize-none rounded-2xl border border-line bg-surface-2/50 p-4 font-mono text-[13.5px] leading-[1.55] text-ink outline-none focus:border-primary"
      />
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Vários links de uma vez
// ---------------------------------------------------------------------------

interface BatchItem {
  link: MediaLink
  state: 'loading' | 'ok' | 'partial'
  meta?: LinkMetadata
  include: boolean
}

function BatchImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [items, setItems] = useState<BatchItem[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setText('')
    setItems([])
  }, [open])

  const read = async (value: string) => {
    setText(value)
    const links = extractMediaLinks(value)
    setItems((prev) => {
      const keep = prev.filter((p) => links.some((l) => l.provider === p.link.provider && l.id === p.link.id))
      const added = links.filter((l) => !prev.some((p) => p.link.provider === l.provider && p.link.id === l.id)).map((link) => ({ link, state: 'loading' as const, include: true }))
      for (const a of added)
        void fetchLinkMetadata(a.link).then((meta) =>
          setItems((list) => list.map((it) => (it.link === a.link ? { ...it, meta, state: meta.title ? 'ok' : 'partial' } : it))),
        )
      return [...keep, ...added]
    })
  }

  const chosen = items.filter((i) => i.include && i.state !== 'loading')
  const loading = items.some((i) => i.state === 'loading')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Importar vários links"
      description="Um link do YouTube ou do Spotify por linha."
      size="lg"
      footer={
        <Button
          className="w-full"
          icon={ListPlus}
          loading={saving}
          disabled={!chosen.length || loading}
          onClick={async () => {
            setSaving(true)
            let ok = 0
            for (const it of chosen) {
              const title = it.meta?.title || `Música do ${it.link.provider === 'youtube' ? 'YouTube' : 'Spotify'}`
              const themes = suggestThemes(title, 2)
              const saved = await saveSong(
                newSong({
                  title,
                  artist: it.meta?.artist ?? '',
                  coverUrl: it.meta?.coverUrl ?? null,
                  youtubeUrl: it.link.provider === 'youtube' ? it.link.url : null,
                  spotifyUrl: it.link.provider === 'spotify' ? it.link.url : null,
                  themes,
                  moments: suggestMoments(themes, null, 2),
                  tags: ['sem-cifra'],
                }),
              )
              if (saved) ok++
            }
            setSaving(false)
            if (ok) {
              toast.success(plural(ok, 'música adicionada', 'músicas adicionadas'), { description: 'Elas ficaram com a etiqueta “sem-cifra”.' })
              onClose()
              navigate('/musicas?q=sem-cifra')
            }
          }}
        >
          {chosen.length ? `Adicionar ${plural(chosen.length, 'música', 'músicas')}` : 'Adicionar'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => void read(e.target.value)}
            placeholder={'https://youtu.be/…\nhttps://open.spotify.com/track/…'}
            className="font-mono text-[13px]"
            aria-label="Links"
          />
          {!text && (
            <Button
              variant="soft"
              size="sm"
              icon={ClipboardPaste}
              className="absolute right-3 bottom-3"
              onClick={async () => {
                try {
                  void read(await navigator.clipboard.readText())
                } catch {
                  toast('Cole os links no campo')
                }
              }}
            >
              Colar
            </Button>
          )}
        </div>
        {items.length > 0 && (
          <div className="divide-y divide-line rounded-3xl border border-line">
            {items.map((it) => (
              <label key={`${it.link.provider}:${it.link.id}`} className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={it.include}
                  onChange={(e) => setItems((list) => list.map((x) => (x === it ? { ...x, include: e.target.checked } : x)))}
                  className="size-5 accent-[var(--primary)]"
                />
                <SongCover song={{ id: it.link.id, themes: [], coverUrl: it.meta?.coverUrl }} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-ink">{it.state === 'loading' ? 'Buscando…' : it.meta?.title || 'Título não encontrado'}</span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {it.link.provider === 'youtube' ? 'YouTube' : 'Spotify'}
                    {it.meta?.artist ? ` · ${it.meta.artist}` : ''}
                  </span>
                </span>
                {it.state === 'loading' && <Loader2 className="size-4 animate-spin text-primary" />}
              </label>
            ))}
          </div>
        )}
        {text && !items.length && <p className="text-[13px] font-semibold text-rose-ink">Nenhum link do YouTube ou Spotify encontrado.</p>}
      </div>
    </Sheet>
  )
}
