import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { HeaderAvatar, Page, PageHeader } from '@/components/layout'
import { ThemeEditorSheet } from '@/components/theme-editor'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { SearchInput, SectionTitle } from '@/components/ui/primitives'
import { confirm } from '@/components/ui/sheet'
import { deleteCustomTheme } from '@/lib/actions'
import { useDocumentTitle, useSongs, useThemes } from '@/lib/hooks'
import { useIsAdmin, useMe, useTable } from '@/lib/store'
import { groupThemes, ink, normalizeForMatch, soft, solid, type Theme } from '@/lib/taxonomy'
import { cn, plural } from '@/lib/utils'
import type { CustomTheme } from '@/types'

export function ThemesPage() {
  useDocumentTitle('Temas')
  const themes = useThemes()
  const songs = useSongs()
  const custom = useTable('custom_themes')
  const me = useMe()
  const isAdmin = useIsAdmin()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<CustomTheme | null | 'new'>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of songs) for (const t of s.themes) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [songs])

  const needle = normalizeForMatch(q).trim()
  const filtered = needle ? themes.filter((t) => normalizeForMatch(`${t.name} ${t.short ?? ''} ${t.description}`).includes(needle)) : themes
  const groups = groupThemes(filtered)

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Temas"
        subtitle={plural(themes.length, 'tema', 'temas')}
        actions={
          <>
            <Button icon={Plus} onClick={() => setEditing('new')} className="hidden sm:inline-flex">
              Novo tema
            </Button>
            <HeaderAvatar />
          </>
        }
      />
      <div className="mb-6 flex gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar tema" className="flex-1" />
        <Button icon={Plus} onClick={() => setEditing('new')} className="h-12 sm:hidden">
          Novo
        </Button>
      </div>

      {needle && filtered.length === 0 && (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="mb-6 flex w-full items-center gap-3 rounded-3xl border border-dashed border-primary/40 bg-primary-soft p-4 text-left text-[14.5px] font-semibold text-primary"
        >
          <Plus className="size-5" /> Criar o tema “{q.trim()}”
        </button>
      )}

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.id}>
            <SectionTitle title={g.name} subtitle={g.id === 'equipe' ? 'Editáveis por quem criou e pelo líder' : undefined} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {g.themes.map((t) => {
                const row = t.custom ? custom[t.id] : undefined
                const canEdit = !!row && (isAdmin || row.createdBy === me?.id)
                return (
                  <ThemeCard
                    key={t.id}
                    theme={t}
                    count={counts.get(t.id) ?? 0}
                    actions={
                      canEdit && row ? (
                        <Menu
                          items={[
                            { label: 'Editar tema', icon: Pencil, onSelect: () => setEditing(row) },
                            {
                              label: 'Excluir tema',
                              icon: Trash2,
                              danger: true,
                              onSelect: async () => {
                                const n = counts.get(t.id) ?? 0
                                const ok = await confirm({
                                  title: `Excluir “${t.name}”?`,
                                  description: n ? `O tema sai de ${plural(n, 'música', 'músicas')}.` : undefined,
                                  confirmLabel: 'Excluir',
                                  danger: true,
                                })
                                if (ok && (await deleteCustomTheme(t.id))) toast.success('Tema excluído')
                              },
                            },
                          ]}
                        />
                      ) : undefined
                    }
                  />
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <ThemeEditorSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        theme={editing === 'new' ? null : editing}
        initialName={editing === 'new' && filtered.length === 0 ? q.trim() : ''}
      />
    </Page>
  )
}

function ThemeCard({ theme, count, actions }: { theme: Theme; count: number; actions?: ReactNode }) {
  const Icon = theme.icon
  return (
    <div className="relative overflow-hidden rounded-3xl" style={{ background: soft(theme.color) }}>
      <div className="absolute -top-10 -right-10 size-28 rounded-full opacity-60 blur-2xl" style={{ background: solid(theme.color) }} />
      <Link to={`/musicas/tema/${theme.id}`} className="relative flex items-center gap-3 p-4 pr-12">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/60 dark:bg-white/10" style={{ color: ink(theme.color) }}>
          <Icon className="size-[22px]" strokeWidth={2} />
        </span>
        <span className="min-w-0" style={{ color: ink(theme.color) }}>
          <span className="block truncate text-[15px] font-bold">{theme.name}</span>
          <span className="line-clamp-1 text-[12.5px] font-medium opacity-80">{theme.description}</span>
          <span className={cn('mt-0.5 block text-[12px] font-bold', count ? 'opacity-90' : 'opacity-60')}>{count ? plural(count, 'música', 'músicas') : 'Nenhuma música ainda'}</span>
        </span>
      </Link>
      {actions && <div className="absolute top-2 right-2">{actions}</div>}
    </div>
  )
}
