import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ClipboardPaste, Eye, Minus, PencilLine, Plus, Save, Sparkles, Wand2 } from 'lucide-react'
import { ChordSheet } from '@/components/chord-sheet'
import { Page, TopBar } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, Chip, Field, Input, Segmented, Select, Textarea } from '@/components/ui/primitives'
import { Sheet, confirm } from '@/components/ui/sheet'
import { newSong, saveSong } from '@/lib/actions'
import { useDocumentTitle } from '@/lib/hooks'
import { analyzeImport, detectKeyFromText, tempoFromBpm } from '@/lib/music/analyze'
import { docLyrics, parseSheet, transposeText } from '@/lib/music/sheet'
import { allKeys, makeSpeller, normalizeKeyName, prettyAccidentals, transposeKey } from '@/lib/music/theory'
import { useRow, useSettings } from '@/lib/store'
import { MOMENTS, TEMPOS, THEMES, suggestMoments, suggestThemes } from '@/lib/taxonomy'
import { cn } from '@/lib/utils'
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

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  )
}

const splitList = (s: string) =>
  s
    .split(/[;,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

export function SongEditorPage() {
  const { id } = useParams()
  const existing = useRow('songs', id)
  const isNew = !id
  useDocumentTitle(isNew ? 'Nova música' : `Editar ${existing?.title ?? ''}`)
  const navigate = useNavigate()
  const [song, setSong] = useState<Song>(() => existing ?? newSong())
  const [refsText, setRefsText] = useState(() => (existing?.bibleRefs ?? []).join('; '))
  const [tagsText, setTagsText] = useState(() => (existing?.tags ?? []).join(', '))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [view, setView] = useState<'editar' | 'previa'>('editar')
  const fontScale = useSettings((s) => s.fontScale)

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

  const save = async () => {
    if (!song.title.trim()) {
      toast.error('Dê um título para a música')
      return
    }
    setSaving(true)
    const final: Song = {
      ...song,
      bibleRefs: splitList(refsText),
      tags: splitList(tagsText).map((t) => t.replace(/^#/, '').toLowerCase()),
      originalKey: song.originalKey ?? detectKeyFromText(song.content),
    }
    const ok = await saveSong(final)
    if (ok) {
      setDirty(false)
      toast.success(isNew ? 'Música adicionada ao acervo 🎶' : 'Alterações salvas')
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

  if (id && !existing)
    return (
      <>
        <TopBar backTo="/acervo" />
        <Page>
          <p className="py-16 text-center text-muted">Música não encontrada.</p>
        </Page>
      </>
    )

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
        {isNew && !song.content && (
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="mb-5 flex w-full items-center gap-4 rounded-[28px] border border-primary/25 bg-primary-soft p-5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-ink shadow-float">
              <ClipboardPaste className="size-6" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-bold text-ink">Tem a cifra pronta? Cole aqui</span>
              <span className="mt-0.5 block text-[13.5px] text-ink-2">Copie do Cifra Club, de um PDF ou do WhatsApp: a gente separa acordes, letra, seções e descobre o tom.</span>
            </span>
          </button>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <Section title="Música">
              <Field label="Título">{(fid) => <Input id={fid} value={song.title} onChange={(e) => set('title', e.target.value)} placeholder="Nome da música" autoFocus={!isNew} />}</Field>
              <Field label="Artista / ministério">{(fid) => <Input id={fid} value={song.artist} onChange={(e) => set('artist', e.target.value)} placeholder="Quem gravou ou compôs" />}</Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tom original">
                  {(fid) => <KeySelect id={fid} value={song.originalKey} onChange={(v) => set('originalKey', v)} placeholder={detectKeyFromText(song.content) ? `Detectado: ${detectKeyFromText(song.content)}` : 'Escolher'} />}
                </Field>
                <Field label="Tom da equipe" hint="opcional">
                  {(fid) => <KeySelect id={fid} value={song.teamKey} onChange={(v) => set('teamKey', v)} placeholder="Igual ao original" />}
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

            <Section title="Organização" description="É isso que faz a música aparecer na hora certa da busca e do assistente.">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-ink-2">Temas</div>
                {themeSuggestions.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-2.5">
                    <span className="flex items-center gap-1 px-1 text-[12.5px] font-bold text-primary">
                      <Sparkles className="size-3.5" /> Pela letra:
                    </span>
                    {themeSuggestions.map((t) => {
                      const theme = THEMES.find((x) => x.id === t)!
                      return (
                        <Chip key={t} size="sm" icon={Plus} onClick={() => set('themes', [...song.themes, t])}>
                          {theme.short ?? theme.name}
                        </Chip>
                      )
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {THEMES.map((t) => (
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
                      className={cn(momentSuggestions.includes(m.id) && !song.moments.includes(m.id) && 'border-primary/40 border-dashed')}
                    >
                      {m.short ?? m.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <Field label="Significado / mensagem" hint="o que a música comunica">
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
              <Field label="Link de referência" hint="YouTube, Spotify…">
                {(fid) => <Input id={fid} type="url" value={song.youtubeUrl ?? ''} onChange={(e) => set('youtubeUrl', e.target.value || null)} placeholder="https://" />}
              </Field>
            </Section>
          </div>

          <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
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
              <div className="border-t border-line bg-surface-2/60 px-4 py-2.5 text-[12px] leading-relaxed text-muted">
                Acordes na linha de cima, letra embaixo. Seções entre colchetes: <b>[Refrão]</b>, <b>[Ponte]</b>. Os botões − e + reescrevem a cifra salva em outro tom.
              </div>
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
            {isNew ? 'Adicionar ao acervo' : 'Salvar'}
          </Button>
        </div>
      </div>

      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={(r) => {
          setSong((s) => {
            const themes = s.themes.length ? s.themes : suggestThemes(`${r.title ?? ''}\n${r.lyrics}`)
            return {
              ...s,
              title: s.title || r.title || '',
              artist: s.artist || r.artist || '',
              originalKey: r.key ? normalizeKeyName(r.key) : s.originalKey,
              bpm: s.bpm ?? r.bpm ?? null,
              tempo: s.tempo ?? tempoFromBpm(r.bpm),
              content: r.content,
              themes,
              moments: s.moments.length ? s.moments : suggestMoments(themes, s.tempo ?? tempoFromBpm(r.bpm)),
            }
          })
          setDirty(true)
          setImportOpen(false)
          toast.success('Cifra importada', { description: r.key ? `Tom ${r.keySource === 'texto' ? 'informado' : 'detectado'}: ${r.key}` : undefined })
        }}
      />
    </>
  )
}

function ImportSheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (r: ReturnType<typeof analyzeImport>) => void }) {
  const [text, setText] = useState('')
  const analysis = useMemo(() => (text.trim() ? analyzeImport(text) : null), [text])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Colar cifra"
      description="Cole a cifra completa — com título e artista no topo, se tiver. Funciona com o formato do Cifra Club e com ChordPro."
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
