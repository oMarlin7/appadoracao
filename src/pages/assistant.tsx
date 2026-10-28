import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowRight, CalendarPlus, Info, Lightbulb, RotateCcw, SendHorizontal, SlidersHorizontal, Sparkles } from 'lucide-react'
import { AddToServiceSheet, SuggestSheet } from '@/components/action-sheets'
import { HeaderAvatar, Page } from '@/components/layout'
import { KeyBadge, SongCover, songSubtitle } from '@/components/song-bits'
import { Button, IconButton } from '@/components/ui/button'
import { Card, Chip, EmptyState, SectionTitle } from '@/components/ui/primitives'
import { useDocumentTitle, useServices } from '@/lib/hooks'
import { allKeys, prettyAccidentals, sameKey } from '@/lib/music/theory'
import { parseRequest, recommend, type RecommendQuery } from '@/lib/recommend'
import { useIsAdmin, useRows } from '@/lib/store'
import { MOMENTS, MOMENT_BY_ID, TEMPOS, THEMES, THEME_BY_ID, type Tempo } from '@/lib/taxonomy'
import { cn, friendlyDate } from '@/lib/utils'
import type { Song } from '@/types'

const EXAMPLES = [
  '3 músicas animadas para a abertura',
  'Algo sobre a cruz para a ceia',
  'Adoração lenta para depois da mensagem',
  'Músicas de gratidão para as ofertas',
  'Pra emendar depois de Celebrai',
]

export function AssistantPage() {
  useDocumentTitle('Assistente')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const songs = useRows('songs')
  const services = useRows('services')
  const favorites = useRows('favorites')
  const { upcoming } = useServices()
  const [text, setText] = useState(params.get('q') ?? '')
  const [query, setQuery] = useState<RecommendQuery & { count?: number }>(() => ({
    moment: params.get('momento'),
    themes: params.get('tema') ? [params.get('tema')!] : [],
    tempo: null,
    afterKey: null,
    text: params.get('q') ?? undefined,
  }))
  const [understood, setUnderstood] = useState<string[]>([])
  const [showAllThemes, setShowAllThemes] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [action, setAction] = useState<null | { kind: 'service' | 'suggest'; song: Song; key: string | null }>(null)
  const isLeader = useIsAdmin()

  const results = useMemo(
    () => recommend({ songs, services, favorites }, { ...query, limit: query.count ?? 8 }),
    [songs, services, favorites, query],
  )
  const hasQuery = !!(query.moment || query.themes?.length || query.tempo || query.afterKey || query.text)

  const submit = (value = text) => {
    const v = value.trim()
    if (!v) return
    const parsed = parseRequest(v, songs)
    setUnderstood(parsed.understood)
    setQuery({
      moment: parsed.moment ?? null,
      themes: parsed.themes ?? [],
      tempo: parsed.tempo ?? null,
      afterKey: parsed.afterKey ?? null,
      text: parsed.text,
      excludeIds: parsed.excludeIds,
      count: parsed.count,
    })
    if (!parsed.understood.length && !parsed.text) toast('Não entendi bem', { description: 'Tente citar o momento do culto, um tema ou o ritmo.' })
  }

  const update = (patch: Partial<typeof query>) => {
    setUnderstood([])
    setQuery((q) => ({ ...q, ...patch, text: patch.text ?? undefined }))
  }
  const themesToShow = showAllThemes ? THEMES : THEMES.slice(0, 8)

  return (
    <Page>
      <header className="flex items-start justify-end gap-4 pt-[max(20px,env(safe-area-inset-top))] pb-4 lg:hidden">
        <HeaderAvatar />
      </header>

      <div className="relative overflow-hidden rounded-[32px] border border-line p-5 shadow-card sm:p-7 lg:mt-10">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(circle at 0% 0%, var(--lavender-solid), transparent 50%), radial-gradient(circle at 100% 20%, var(--rose-solid), transparent 45%), radial-gradient(circle at 60% 120%, var(--mint-solid), transparent 50%), var(--surface)',
          }}
        />
        <div className="absolute inset-0 bg-surface/40 dark:bg-surface/60" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid size-11 place-items-center rounded-2xl bg-surface/85 text-primary shadow-card">
              <Sparkles className="size-5.5" strokeWidth={2.1} />
            </span>
            <div>
              <h1 className="text-[22px] leading-tight font-extrabold tracking-tight text-ink sm:text-[26px]">Assistente de repertório</h1>
              <p className="text-[13.5px] font-medium text-ink-2">Diga o que o momento pede e eu procuro a música certa.</p>
            </div>
          </div>
          <form
            className="mt-5 flex items-center gap-2 rounded-[22px] border border-line bg-surface p-1.5 pl-4 shadow-card focus-within:border-primary focus-within:ring-4 focus-within:ring-[var(--ring)]"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: 3 músicas de gratidão animadas para a abertura"
              enterKeyHint="send"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/80"
            />
            <button type="submit" aria-label="Pedir sugestões" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-ink shadow-float active:scale-95">
              <SendHorizontal className="size-5" />
            </button>
          </form>
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 sm:-mx-7 sm:px-7">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setText(e)
                  submit(e)
                }}
                className="shrink-0 rounded-full bg-surface/80 px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 backdrop-blur hover:bg-surface"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* No celular: momentos numa faixa rolável; o resto dos filtros fica recolhido. */}
      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
        <Chip icon={SlidersHorizontal} selected={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
          Filtros
        </Chip>
        {MOMENTS.map((m) => (
          <Chip key={m.id} icon={m.icon} color={m.color} selected={query.moment === m.id} onClick={() => update({ moment: query.moment === m.id ? null : m.id })}>
            {m.short ?? m.name}
          </Chip>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={cn('h-fit space-y-5 p-5 lg:sticky lg:top-6 lg:block', !filtersOpen && 'hidden')}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-ink">Refinar</h2>
            {hasQuery && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                onClick={() => {
                  setText('')
                  setUnderstood([])
                  setQuery({ moment: null, themes: [], tempo: null, afterKey: null })
                }}
              >
                Limpar
              </Button>
            )}
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">Momento</div>
            <div className="flex flex-wrap gap-1.5">
              {MOMENTS.map((m) => (
                <Chip key={m.id} size="sm" icon={m.icon} color={m.color} selected={query.moment === m.id} onClick={() => update({ moment: query.moment === m.id ? null : m.id })}>
                  {m.short ?? m.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">Tema</div>
            <div className="flex flex-wrap gap-1.5">
              {themesToShow.map((t) => {
                const on = query.themes?.includes(t.id)
                return (
                  <Chip
                    key={t.id}
                    size="sm"
                    icon={t.icon}
                    color={t.color}
                    selected={on}
                    onClick={() => update({ themes: on ? query.themes!.filter((x) => x !== t.id) : [...(query.themes ?? []), t.id] })}
                  >
                    {t.short ?? t.name}
                  </Chip>
                )
              })}
              <button type="button" className="px-2 text-[12.5px] font-bold text-primary" onClick={() => setShowAllThemes((v) => !v)}>
                {showAllThemes ? 'Menos' : `+${THEMES.length - 8} temas`}
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">Ritmo</div>
            <div className="flex flex-wrap gap-1.5">
              {TEMPOS.map((t) => (
                <Chip key={t.id} size="sm" icon={t.icon} color={t.color} selected={query.tempo === t.id} onClick={() => update({ tempo: query.tempo === t.id ? null : (t.id as Tempo) })}>
                  {t.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">Emendar depois do tom</div>
            <div className="grid grid-cols-6 gap-1.5">
              {allKeys(false).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => update({ afterKey: sameKey(query.afterKey, k) ? null : k })}
                  className={cn(
                    'h-9 rounded-xl border text-[13px] font-extrabold transition-all',
                    sameKey(query.afterKey, k) ? 'border-transparent bg-primary text-primary-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {prettyAccidentals(k)}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="min-w-0">
          {understood.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-semibold text-muted">Entendi:</span>
              {understood.map((u) => (
                <span key={u} className="rounded-full bg-primary-soft px-2.5 py-1 text-[12.5px] font-bold text-primary">
                  {u}
                </span>
              ))}
            </div>
          )}

          {!hasQuery ? (
            <EmptyState
              icon={Lightbulb}
              color="lavender"
              title="Qual é o momento do culto?"
              description="Escreva um pedido ou escolha momento, tema e ritmo."
            />
          ) : (
            <>
              <SectionTitle
                title={results.length ? 'Sugestões para agora' : 'Nada combinou'}
                subtitle={
                  [query.moment && MOMENT_BY_ID[query.moment]?.name, ...(query.themes ?? []).map((t) => THEME_BY_ID[t]?.short ?? THEME_BY_ID[t]?.name)].filter(Boolean).join(' · ') ||
                  undefined
                }
              />
              {results.length === 0 ? (
                <EmptyState icon={Sparkles} title="Nenhuma música encontrada" description="Tente tirar algum filtro." />
              ) : (
                <div className="space-y-2.5">
                  {results.map((r, i) => (
                    <Card key={r.song.id} className="animate-rise p-3.5" style={{ animationDelay: `${i * 35}ms` }}>
                      <div className="flex items-center gap-3">
                        <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-muted">{i + 1}</span>
                        <Link to={`/musica/${r.song.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <SongCover song={r.song} size={50} />
                          <span className="min-w-0">
                            <span className="block truncate text-[15.5px] font-bold text-ink">{r.song.title}</span>
                            <span className="block truncate text-[13px] text-muted">{songSubtitle(r.song, { themes: false })}</span>
                          </span>
                        </Link>
                        <KeyBadge value={r.key} kind={r.song.teamKey ? 'team' : 'original'} />
                      </div>
                      {r.reasons.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-8">
                          {r.reasons.map((reason) => (
                            <span key={reason} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-ink-2">
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2 pl-8">
                        {isLeader && (
                          <Button size="sm" variant="soft" icon={CalendarPlus} onClick={() => setAction({ kind: 'service', song: r.song, key: r.key })}>
                            Culto
                          </Button>
                        )}
                        <Button size="sm" variant={isLeader ? 'outline' : 'soft'} icon={Lightbulb} onClick={() => setAction({ kind: 'suggest', song: r.song, key: r.key })}>
                          Sugerir
                        </Button>
                        <div className="flex-1" />
                        <IconButton icon={ArrowRight} size="sm" label="Abrir música" onClick={() => navigate(`/musica/${r.song.id}`)} />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {isLeader && upcoming.length > 0 && (
            <section className="mt-10">
              <SectionTitle title="Montar o setlist inteiro" subtitle="Da abertura à ministração" />
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {upcoming.slice(0, 4).map((s) => (
                  <Link key={s.id} to={`/cultos/${s.id}?assistente=1`} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-card transition-transform active:scale-[0.99]">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-butter text-butter-ink">
                      <Sparkles className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-ink">{s.title}</span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {friendlyDate(s.date, { short: true })}
                        {s.theme && ` · ${s.theme}`}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="mt-10 flex gap-3 rounded-3xl bg-surface-2/70 p-4 text-[13px] leading-relaxed text-muted">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              As sugestões são calculadas aqui mesmo, sem internet, a partir dos temas, momentos, ritmo, tom da equipe, histórico de cultos e favoritas. O app já
              está preparado para ganhar uma <b className="text-ink-2">IA conversacional</b> no futuro, usando esta mesma base.
            </p>
          </div>
        </div>
      </div>

      {action?.kind === 'service' && <AddToServiceSheet song={action.song} open onClose={() => setAction(null)} initialKey={action.key} />}
      {action?.kind === 'suggest' && <SuggestSheet songId={action.song.id} open onClose={() => setAction(null)} />}
    </Page>
  )
}
