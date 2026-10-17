import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowUpDown, Heart, LayoutGrid, List, Music, Plus, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { HeaderAvatar, Page, PageHeader } from '@/components/layout'
import { SongCard, SongRow, ThemeTile } from '@/components/song-bits'
import { Button, IconButton, LinkButton } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Chip, EmptyState, SearchInput, SectionTitle } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { toggleFavorite } from '@/lib/actions'
import { useDocumentTitle, useFavoriteCounts, useFavoriteIds, usePlayCounts, useSongs, useThemes } from '@/lib/hooks'
import { allKeys, prettyAccidentals, sameKey } from '@/lib/music/theory'
import { lyricSnippet, searchSongs } from '@/lib/search'
import { useSettings } from '@/lib/store'
import { MOMENTS, MOMENT_BY_ID, TEMPOS, THEME_BY_ID, ink, soft, solid, type Tempo } from '@/lib/taxonomy'
import { plural } from '@/lib/utils'
import type { Song } from '@/types'

type Sort = 'az' | 'recentes' | 'tocadas' | 'favoritas'
const SORT_LABEL: Record<Sort, string> = { az: 'A–Z', recentes: 'Mais recentes', tocadas: 'Mais tocadas', favoritas: 'Mais favoritadas' }

interface Filters {
  q: string
  themes: string[]
  moments: string[]
  tempo: Tempo | null
  key: string | null
  fav: boolean
  sort: Sort
}

function useFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const [params, setParams] = useSearchParams()
  const filters: Filters = {
    q: params.get('q') ?? '',
    themes: params.get('tema')?.split(',').filter(Boolean) ?? [],
    moments: params.get('momento')?.split(',').filter(Boolean) ?? [],
    tempo: (params.get('ritmo') as Tempo | null) ?? null,
    key: params.get('tom'),
    fav: params.get('fav') === '1',
    sort: (params.get('ordem') as Sort | null) ?? 'az',
  }
  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    const p = new URLSearchParams()
    if (next.q) p.set('q', next.q)
    if (next.themes.length) p.set('tema', next.themes.join(','))
    if (next.moments.length) p.set('momento', next.moments.join(','))
    if (next.tempo) p.set('ritmo', next.tempo)
    if (next.key) p.set('tom', next.key)
    if (next.fav) p.set('fav', '1')
    if (next.sort !== 'az') p.set('ordem', next.sort)
    setParams(p, { replace: true, preventScrollReset: true })
  }
  return [filters, update]
}

export function applyFilters(
  songs: Song[],
  f: Omit<Filters, 'sort' | 'q'>,
  favIds: Set<string>,
): Song[] {
  return songs.filter((s) => {
    if (f.fav && !favIds.has(s.id)) return false
    if (f.themes.length && !f.themes.some((t) => s.themes.includes(t))) return false
    if (f.moments.length && !f.moments.some((m) => s.moments.includes(m))) return false
    if (f.tempo && s.tempo !== f.tempo) return false
    if (f.key && !sameKey(s.teamKey ?? s.originalKey, f.key)) return false
    return true
  })
}

function FilterSheet({ open, onClose, filters, update, count }: { open: boolean; onClose: () => void; filters: Filters; update: (p: Partial<Filters>) => void; count: number }) {
  const themes = useThemes()
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const [minorKeys, setMinorKeys] = useState(false)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtrar acervo"
      tall
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => update({ themes: [], moments: [], tempo: null, key: null, fav: false })}>
            Limpar
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Ver {plural(count, 'música', 'músicas')}
          </Button>
        </div>
      }
    >
      <FilterGroup title="Momento do culto">
        {MOMENTS.map((m) => (
          <Chip key={m.id} icon={m.icon} color={m.color} selected={filters.moments.includes(m.id)} onClick={() => update({ moments: toggle(filters.moments, m.id) })}>
            {m.short ?? m.name}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="Tema">
        {themes.map((t) => (
          <Chip key={t.id} icon={t.icon} color={t.color} selected={filters.themes.includes(t.id)} onClick={() => update({ themes: toggle(filters.themes, t.id) })}>
            {t.short ?? t.name}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="Ritmo">
        {TEMPOS.map((t) => (
          <Chip key={t.id} icon={t.icon} color={t.color} selected={filters.tempo === t.id} onClick={() => update({ tempo: filters.tempo === t.id ? null : t.id })}>
            {t.name}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup
        title="Tom da equipe"
        action={
          <button type="button" className="text-[12.5px] font-bold text-primary" onClick={() => setMinorKeys((v) => !v)}>
            {minorKeys ? 'Ver maiores' : 'Ver menores'}
          </button>
        }
      >
        {allKeys(minorKeys).map((k) => (
          <Chip key={k} size="sm" selected={sameKey(filters.key, k)} onClick={() => update({ key: sameKey(filters.key, k) ? null : k })} className="min-w-12 justify-center">
            {prettyAccidentals(k)}
          </Chip>
        ))}
      </FilterGroup>
    </Sheet>
  )
}

function FilterGroup({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[13px] font-bold tracking-wide text-ink-2 uppercase">{title}</h3>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function SongList({ songs, query, grid, groupByLetter }: { songs: Song[]; query?: string; grid?: boolean; groupByLetter?: boolean }) {
  const favIds = useFavoriteIds()
  if (grid)
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {songs.map((s) => (
          <SongCard key={s.id} song={s} to={`/musica/${s.id}`} className="w-full sm:w-full" caption={s.artist} />
        ))}
      </div>
    )
  let lastLetter = ''
  return (
    <div className="-mx-2">
      {songs.map((s) => {
        const letter = s.title.charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        const showLetter = groupByLetter && letter !== lastLetter
        lastLetter = letter
        return (
          <div key={s.id}>
            {showLetter && <div className="px-3 pt-4 pb-1 text-[12px] font-extrabold tracking-wider text-muted">{/[A-Z]/.test(letter) ? letter : '#'}</div>}
            <SongRow
              song={s}
              to={`/musica/${s.id}`}
              favorite={favIds.has(s.id)}
              onToggleFavorite={() => void toggleFavorite(s.id)}
              snippet={query ? lyricSnippet(s, query) : null}
            />
          </div>
        )
      })}
    </div>
  )
}

export function LibraryPage() {
  const themes = useThemes()
  useDocumentTitle('Músicas')
  const songs = useSongs()
  const favIds = useFavoriteIds()
  const plays = usePlayCounts()
  const favCounts = useFavoriteCounts()
  const [filters, update] = useFilters()
  const [sheet, setSheet] = useState(false)
  const layout = useSettings((s) => s.libraryLayout)
  const setSetting = useSettings((s) => s.set)
  const navigate = useNavigate()

  const results = useMemo(() => {
    let list = applyFilters(searchSongs(songs, filters.q), filters, favIds)
    if (!filters.q) {
      if (filters.sort === 'recentes') list = list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      if (filters.sort === 'tocadas') list = list.slice().sort((a, b) => (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0))
      if (filters.sort === 'favoritas') list = list.slice().sort((a, b) => (favCounts.get(b.id) ?? 0) - (favCounts.get(a.id) ?? 0))
    }
    return list
  }, [songs, filters, favIds, plays, favCounts])

  const activeCount = filters.themes.length + filters.moments.length + (filters.tempo ? 1 : 0) + (filters.key ? 1 : 0)
  const browsing = !filters.q && !activeCount && !filters.fav
  const themeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of songs) for (const t of s.themes) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [songs])

  return (
    <Page wide>
      <PageHeader
        title="Músicas"
        subtitle={`${plural(songs.length, 'música', 'músicas')} no repertório do ministério`}
        actions={
          <>
            <LinkButton to="/musica/nova" icon={Plus} className="hidden sm:inline-flex">
              Nova música
            </LinkButton>
            <HeaderAvatar />
          </>
        }
      />

      <div className="glass-page sticky top-0 z-20 -mx-4 border-b border-transparent px-4 pt-[max(8px,env(safe-area-inset-top))] pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <SearchInput value={filters.q} onChange={(q) => update({ q })} placeholder="Buscar música, artista ou trecho" />
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <Chip icon={SlidersHorizontal} selected={activeCount > 0} count={activeCount || undefined} onClick={() => setSheet(true)}>
            Filtros
          </Chip>
          <Chip icon={Heart} selected={filters.fav} color="rose" onClick={() => update({ fav: !filters.fav })}>
            Favoritas
          </Chip>
          {TEMPOS.map((t) => (
            <Chip key={t.id} icon={t.icon} color={t.color} selected={filters.tempo === t.id} onClick={() => update({ tempo: filters.tempo === t.id ? null : t.id })}>
              {t.name}
            </Chip>
          ))}
          {MOMENTS.slice(0, 4).map((m) => (
            <Chip
              key={m.id}
              icon={m.icon}
              color={m.color}
              selected={filters.moments.includes(m.id)}
              onClick={() => update({ moments: filters.moments.includes(m.id) ? filters.moments.filter((x) => x !== m.id) : [...filters.moments, m.id] })}
            >
              {m.short ?? m.name}
            </Chip>
          ))}
        </div>
      </div>

      {(filters.themes.length > 0 || filters.key || filters.moments.length > 4) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filters.themes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update({ themes: filters.themes.filter((x) => x !== t) })}
              className="inline-flex items-center gap-1 rounded-full py-1 pr-2 pl-3 text-[12.5px] font-bold"
              style={{ background: soft(THEME_BY_ID[t]?.color ?? 'lavender'), color: ink(THEME_BY_ID[t]?.color ?? 'lavender') }}
            >
              {THEME_BY_ID[t]?.short ?? THEME_BY_ID[t]?.name ?? t} <X className="size-3.5" />
            </button>
          ))}
          {filters.key && (
            <button type="button" onClick={() => update({ key: null })} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pr-2 pl-3 text-[12.5px] font-bold text-primary">
              Tom {prettyAccidentals(filters.key)} <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {browsing && (
        <section className="mt-6">
          <SectionTitle
            title="Navegar por tema"
            subtitle="Encontre pelo assunto da mensagem"
            action={
              <Link to="/temas" className="shrink-0 text-[13px] font-bold text-primary">
                Todos os temas
              </Link>
            }
          />
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
            {themes.filter((t) => themeCounts.get(t.id)).map((t) => (
              <ThemeTile key={t.id} theme={t} count={themeCounts.get(t.id) ?? 0} to={`/acervo/tema/${t.id}`} className="w-[150px] shrink-0 lg:w-auto" />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink-2">
            {browsing ? 'Todas as músicas' : plural(results.length, 'resultado', 'resultados')}
          </h2>
          <div className="flex items-center gap-1">
            {!filters.q && (
              <Menu
                trigger={(open) => (
                  <Button variant="ghost" size="sm" icon={ArrowUpDown} onClick={open}>
                    {SORT_LABEL[filters.sort]}
                  </Button>
                )}
                items={(Object.keys(SORT_LABEL) as Sort[]).map((s) => ({ label: SORT_LABEL[s], onSelect: () => update({ sort: s }) }))}
              />
            )}
            <IconButton
              size="sm"
              icon={layout === 'grid' ? List : LayoutGrid}
              label={layout === 'grid' ? 'Ver em lista' : 'Ver em grade'}
              onClick={() => setSetting('libraryLayout', layout === 'grid' ? 'list' : 'grid')}
            />
          </div>
        </div>
        {results.length === 0 ? (
          songs.length === 0 ? (
            <EmptyState
              icon={Music}
              title="O acervo está vazio"
              description="Cadastre as músicas que o ministério canta. Dá para colar a cifra direto do Cifra Club."
              action={
                <LinkButton to="/musica/nova" icon={Plus}>
                  Adicionar primeira música
                </LinkButton>
              }
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="Nada encontrado"
              description="Tente outra palavra ou peça ajuda ao assistente para achar algo parecido."
              action={
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => update({ q: '', themes: [], moments: [], tempo: null, key: null, fav: false })}>
                    Limpar busca
                  </Button>
                  <Button icon={Sparkles} onClick={() => navigate(`/assistente?q=${encodeURIComponent(filters.q)}`)}>
                    Assistente
                  </Button>
                </div>
              }
            />
          )
        ) : (
          <SongList songs={results} query={filters.q} grid={layout === 'grid'} groupByLetter={browsing && filters.sort === 'az' && layout === 'list'} />
        )}
      </section>

      <Link
        to="/musica/nova"
        aria-label="Nova música"
        className="fixed right-5 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full bg-primary text-primary-ink shadow-float transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" strokeWidth={2.4} />
      </Link>

      <FilterSheet open={sheet} onClose={() => setSheet(false)} filters={filters} update={update} count={results.length} />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Tema / momento
// ---------------------------------------------------------------------------

function CollectionHero({ title, description, color, icon: Icon, verse, count, action }: { title: string; description: string; color: Parameters<typeof soft>[0]; icon: typeof Music; verse?: { text: string; ref: string }; count: number; action?: ReactNode }) {
  return (
    <div className="relative mt-2 overflow-hidden rounded-[32px] p-6 sm:p-8" style={{ background: soft(color) }}>
      <div className="absolute -top-16 -right-10 size-56 rounded-full opacity-70 blur-3xl" style={{ background: solid(color) }} />
      <div className="absolute -bottom-20 left-10 size-40 rounded-full opacity-40 blur-3xl" style={{ background: solid(color) }} />
      <div className="relative">
        <span className="grid size-14 place-items-center rounded-[20px] bg-white/60 dark:bg-white/10" style={{ color: ink(color) }}>
          <Icon className="size-7" strokeWidth={1.9} />
        </span>
        <h1 className="mt-4 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[34px]" style={{ color: ink(color) }}>
          {title}
        </h1>
        <p className="mt-1.5 max-w-xl text-[15px] font-medium opacity-85" style={{ color: ink(color) }}>
          {description}
        </p>
        {verse && (
          <blockquote className="mt-4 max-w-xl border-l-2 pl-3 text-[14px] font-medium italic opacity-80" style={{ color: ink(color), borderColor: ink(color) }}>
            “{verse.text}” <span className="not-italic font-bold">— {verse.ref}</span>
          </blockquote>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-white/60 px-3 py-1 text-[13px] font-bold dark:bg-white/10" style={{ color: ink(color) }}>
            {plural(count, 'música', 'músicas')}
          </span>
          {action}
        </div>
      </div>
    </div>
  )
}

export function ThemePage() {
  const { themeId = '' } = useParams()
  useThemes()
  const theme = THEME_BY_ID[themeId]
  useDocumentTitle(theme?.name)
  const songs = useSongs()
  const [moment, setMoment] = useState<string | null>(null)
  const inTheme = useMemo(() => songs.filter((s) => s.themes.includes(themeId)), [songs, themeId])
  const list = moment ? inTheme.filter((s) => s.moments.includes(moment)) : inTheme
  const moments = MOMENTS.filter((m) => inTheme.some((s) => s.moments.includes(m.id)))
  if (!theme) return <NotFoundInline />
  return (
    <Page>
      <PageHeader back="/acervo" title="" className="pb-0" />
      <CollectionHero
        title={theme.name}
        description={theme.description}
        color={theme.color}
        icon={theme.icon}
        verse={theme.verse}
        count={inTheme.length}
        action={
          <LinkButton to={`/assistente?tema=${theme.id}`} size="sm" variant="outline" icon={Sparkles} className="border-transparent bg-white/70 dark:bg-white/10">
            Sugerir para o culto
          </LinkButton>
        }
      />
      {moments.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <Chip selected={!moment} onClick={() => setMoment(null)}>
            Todos os momentos
          </Chip>
          {moments.map((m) => (
            <Chip key={m.id} icon={m.icon} color={m.color} selected={moment === m.id} onClick={() => setMoment(moment === m.id ? null : m.id)}>
              {m.short ?? m.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-4">
        {list.length ? <SongList songs={list} /> : <EmptyState icon={Music} title="Nenhuma música aqui ainda" description="Ao cadastrar uma música, marque este tema para ela aparecer aqui." />}
      </div>
    </Page>
  )
}

export function MomentPage() {
  const { momentId = '' } = useParams()
  const moment = MOMENT_BY_ID[momentId]
  useDocumentTitle(moment?.name)
  const songs = useSongs()
  const list = useMemo(() => songs.filter((s) => s.moments.includes(momentId)), [songs, momentId])
  if (!moment) return <NotFoundInline />
  return (
    <Page>
      <PageHeader back="/acervo" title="" className="pb-0" />
      <CollectionHero
        title={moment.name}
        description={moment.description}
        color={moment.color}
        icon={moment.icon}
        count={list.length}
        action={
          <LinkButton to={`/assistente?momento=${moment.id}`} size="sm" variant="outline" icon={Sparkles} className="border-transparent bg-white/70 dark:bg-white/10">
            Ver sugestões
          </LinkButton>
        }
      />
      <div className="mt-4">{list.length ? <SongList songs={list} /> : <EmptyState icon={Music} title="Nenhuma música para este momento" />}</div>
    </Page>
  )
}

export function FavoritesPage() {
  useDocumentTitle('Favoritas')
  const songs = useSongs()
  const favIds = useFavoriteIds()
  const counts = useFavoriteCounts()
  const mine = songs.filter((s) => favIds.has(s.id))
  const team = songs
    .filter((s) => (counts.get(s.id) ?? 0) >= 2)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .slice(0, 10)
  return (
    <Page>
      <PageHeader title="Favoritas" subtitle="As músicas que você mais ama tocar e cantar" actions={<HeaderAvatar />} />
      {mine.length ? (
        <SongList songs={mine} />
      ) : (
        <EmptyState icon={Heart} color="rose" title="Nenhuma favorita ainda" description="Toque no coração de qualquer música para guardá-la aqui." action={<LinkButton to="/acervo">Ir para o acervo</LinkButton>} />
      )}
      {team.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Queridinhas da equipe" subtitle="As mais favoritadas pelos membros" />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {team.map((s) => (
              <SongCard key={s.id} song={s} to={`/musica/${s.id}`} caption={`❤ ${counts.get(s.id)} membros`} />
            ))}
          </div>
        </section>
      )}
    </Page>
  )
}

function NotFoundInline() {
  return (
    <Page>
      <EmptyState icon={Music} title="Não encontrado" action={<LinkButton to="/acervo">Voltar ao acervo</LinkButton>} />
    </Page>
  )
}

