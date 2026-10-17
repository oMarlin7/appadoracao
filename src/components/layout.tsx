import { type ReactNode } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useMatches, useNavigate } from 'react-router'
import {
  ArrowLeft,
  CalendarDays,
  CloudOff,
  Heart,
  House,
  Library,
  Lightbulb,
  ListMusic,
  MessageCircle,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { isDemo } from '@/lib/backend'
import { useTeam, useUnreadCount } from '@/lib/hooks'
import { ROLE_BY_ID } from '@/lib/taxonomy'
import { useMe, useRows, useSession } from '@/lib/store'
import { useOnline, usePendingCount } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'
import { Logo } from './logo'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
}

function useNavItems(): NavItem[] {
  const unread = useUnreadCount()
  return [
    { to: '/', label: 'Início', icon: House, end: true },
    { to: '/acervo', label: 'Acervo', icon: Library },
    { to: '/cultos', label: 'Cultos', icon: CalendarDays },
    { to: '/playlists', label: 'Playlists', icon: ListMusic },
    { to: '/chat', label: 'Chat', icon: MessageCircle, badge: unread },
  ]
}

function Badge({ n, className }: { n: number; className?: string }) {
  if (!n) return null
  return (
    <span className={cn('grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-ink px-1 text-[10.5px] leading-none font-extrabold text-white dark:text-[#2a1020]', className)}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Barra lateral (tablet deitado / computador)
// ---------------------------------------------------------------------------

function Sidebar() {
  const items = useNavItems()
  const me = useMe()
  const team = useTeam()
  const userId = useSession((s) => s.user?.id)
  const playlists = useRows('playlists')
  const pinned = playlists
    .filter((p) => p.ownerId === userId || p.isShared)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[14.5px] font-semibold transition-colors',
      isActive ? 'bg-primary-soft text-primary' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface/70 px-4 pt-6 pb-4 backdrop-blur-xl lg:flex">
      <Link to="/" className="mb-7 px-2">
        <Logo subtitle={team?.name ?? 'Ministério de Louvor'} />
      </Link>
      <nav className="space-y-1">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={linkCls}>
            <it.icon className="size-5" strokeWidth={2.1} />
            <span className="flex-1">{it.label}</span>
            <Badge n={it.badge ?? 0} />
          </NavLink>
        ))}
        <NavLink to="/assistente" className={linkCls}>
          <Sparkles className="size-5" strokeWidth={2.1} />
          <span className="flex-1">Assistente</span>
        </NavLink>
        <NavLink to="/favoritas" className={linkCls}>
          <Heart className="size-5" strokeWidth={2.1} />
          <span className="flex-1">Favoritas</span>
        </NavLink>
        <NavLink to="/sugestoes" className={linkCls}>
          <Lightbulb className="size-5" strokeWidth={2.1} />
          <span className="flex-1">Sugestões</span>
        </NavLink>
      </nav>

      {pinned.length > 0 && (
        <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 px-3.5 text-[11.5px] font-bold tracking-wider text-muted uppercase">Playlists</div>
          <div className="space-y-0.5">
            {pinned.map((p) => (
              <NavLink
                key={p.id}
                to={`/playlists/${p.id}`}
                className={({ isActive }) =>
                  cn('flex h-10 items-center gap-3 rounded-xl px-3.5 text-[13.5px] font-semibold', isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2')
                }
              >
                <span className="size-2.5 rounded-full" style={{ background: `var(--${p.color}-solid)` }} />
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto space-y-1 pt-4">
        <NavLink to="/equipe" className={linkCls}>
          <Users className="size-5" strokeWidth={2.1} />
          Equipe
        </NavLink>
        <NavLink to="/ajustes" className={linkCls}>
          <Settings className="size-5" strokeWidth={2.1} />
          Ajustes
        </NavLink>
        {me && (
          <Link to="/perfil" className="mt-2 flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 transition-colors hover:bg-surface-2">
            <Avatar profile={me} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold text-ink">{me.name}</div>
              <div className="truncate text-[12px] text-muted">{me.functions.map((f) => ROLE_BY_ID[f]?.name ?? f).join(' · ') || 'Membro'}</div>
            </div>
          </Link>
        )}
        {isDemo && <div className="px-2 pt-2 text-center text-[11px] font-semibold text-muted">Modo demonstração · dados neste aparelho</div>}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Barra inferior (celular)
// ---------------------------------------------------------------------------

function BottomNav() {
  const items = useNavItems()
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden" aria-label="Navegação principal">
      <div className="glass mx-auto mb-2.5 flex max-w-lg items-stretch justify-around rounded-[26px] border border-line px-1.5 py-1.5 shadow-pop">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              cn('relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[20px] py-1.5 transition-colors', isActive ? 'text-primary' : 'text-muted')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('grid h-8 w-12 place-items-center rounded-full transition-all duration-200', isActive && 'bg-primary-soft')}>
                  <it.icon className="size-[21px]" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="text-[10.5px] font-bold">{it.label}</span>
                <Badge n={it.badge ?? 0} className="absolute top-0.5 right-[calc(50%-24px)]" />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Estrutura das páginas
// ---------------------------------------------------------------------------

function OfflinePill() {
  const online = useOnline()
  const pending = usePendingCount()
  if (online && !pending) return null
  return (
    <div className="pointer-events-none fixed top-[max(10px,env(safe-area-inset-top))] left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+132px)]">
      <div className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-bold text-bg shadow-pop">
        <CloudOff className="size-4" strokeWidth={2.3} />
        {online ? `Enviando ${pending} alteração(ões)…` : pending ? `Sem internet · ${pending} para enviar` : 'Sem internet · usando dados salvos'}
      </div>
    </div>
  )
}

export function AppLayout() {
  const matches = useMatches()
  const hideNav = matches.some((m) => (m.handle as { hideNav?: boolean } | undefined)?.hideNav)
  return (
    <div className="min-h-dvh">
      <ScrollRestoration />
      <Sidebar />
      <OfflinePill />
      <main className={cn('lg:pl-[264px]', hideNav ? 'pb-6' : 'pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-10')}>
        <Outlet />
      </main>
      {!hideNav && <BottomNav />}
    </div>
  )
}

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-10', wide ? 'max-w-6xl' : 'max-w-5xl', className)}>{children}</div>
}

/** Avatar no canto do cabeçalho (só no celular) — leva ao perfil. */
export function HeaderAvatar() {
  const me = useMe()
  if (!me) return null
  return (
    <Link to="/perfil" aria-label="Meu perfil" className="lg:hidden">
      <Avatar profile={me} size="md" />
    </Link>
  )
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  back,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  back?: boolean | string
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header className={cn('pt-[max(20px,env(safe-area-inset-top))] pb-5 lg:pt-10', className)}>
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === 'string' ? navigate(back) : history.length > 1 ? navigate(-1) : navigate('/'))}
          className="-ml-2 mb-3 inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="size-[18px]" strokeWidth={2.3} />
          Voltar
        </button>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[13px] font-semibold text-muted">{eyebrow}</div>}
          {title && <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-tight text-ink sm:text-[32px]">{title}</h1>}
          {subtitle && <p className="mt-1.5 text-[14.5px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Barra fixa de páginas de detalhe (voltar + ações), com fundo de vidro. */
export function TopBar({ title, actions, backTo, className }: { title?: ReactNode; actions?: ReactNode; backTo?: string; className?: string }) {
  const navigate = useNavigate()
  return (
    <div className={cn('glass sticky top-0 z-20 border-b border-line/70 pt-safe', className)}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-4 lg:px-8">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => (backTo ? navigate(backTo) : history.length > 1 ? navigate(-1) : navigate('/'))}
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-2"
        >
          <ArrowLeft className="size-[21px]" strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{title}</div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    </div>
  )
}
