import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CalendarPlus, ChevronRight, MessageCircle, Play, Plus, Sparkles, ThumbsUp } from 'lucide-react'
import { Avatar, AvatarStack } from '@/components/avatar'
import { ForYouPanel } from '@/components/for-you'
import { HeaderAvatar, Page } from '@/components/layout'
import { SongCard, SongCover, SongRow, ThemeTile } from '@/components/song-bits'
import { LinkButton } from '@/components/ui/button'
import { Card, SectionTitle } from '@/components/ui/primitives'
import { toggleFavorite } from '@/lib/actions'
import { useFavoriteIds, useNextService, useSongs, useTeam, useUnreadCount } from '@/lib/hooks'
import { EVENT_KIND_BY_ID, eventKind } from '@/lib/events'
import { MOMENTS, THEMES, ink, soft, solid } from '@/lib/taxonomy'
import { useMe, useRows, useTable } from '@/lib/store'
import { cn, compact, dayOfMonth, firstName, greeting, monthShort, plural, relativeDays, timeAgo, weekdayName } from '@/lib/utils'
import type { Service } from '@/types'

function NextServiceCard({ service }: { service: Service }) {
  const songs = useTable('songs')
  const profiles = useTable('profiles')
  const leader = service.leaderId ? profiles[service.leaderId] : undefined
  const items = service.items.filter((i) => songs[i.songId])
  const team = compact(Array.from(new Set(service.team.map((t) => t.userId))).map((id) => profiles[id]))

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-line p-5 shadow-card sm:p-6">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, var(--lavender-solid), transparent 55%), radial-gradient(circle at 100% 0%, var(--rose-solid), transparent 50%), radial-gradient(circle at 100% 100%, var(--sky-solid), transparent 55%), var(--surface)',
          opacity: 0.9,
        }}
      />
      <div className="absolute inset-0 bg-surface/35 dark:bg-surface/55" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-13 shrink-0 place-items-center rounded-2xl bg-surface/85 text-center shadow-card backdrop-blur">
              <div className="leading-none">
                <div className="text-[10.5px] font-extrabold tracking-wider text-primary">{monthShort(service.date)}</div>
                <div className="mt-0.5 text-[21px] font-extrabold text-ink">{dayOfMonth(service.date)}</div>
              </div>
            </div>
            <div>
              <div className="text-[12.5px] font-bold tracking-wide text-ink-2 uppercase">Próximo evento</div>
              <div className="text-[13.5px] font-semibold text-ink-2">
                {EVENT_KIND_BY_ID[eventKind(service)].name} · {weekdayName(service.date)}
                {service.time && ` · ${service.time}`}
              </div>
            </div>
          </div>
          <span className="rounded-full bg-surface/85 px-3 py-1 text-[12px] font-bold text-primary backdrop-blur">{relativeDays(service.date)}</span>
        </div>

        <h2 className="mt-4 text-[24px] leading-tight font-extrabold tracking-tight text-ink sm:text-[26px]">{service.title}</h2>
        {service.theme && <p className="mt-1 line-clamp-2 text-[14.5px] font-medium text-ink-2">“{service.theme}”</p>}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center">
            {items.slice(0, 4).map((it, i) => (
              <SongCover key={it.id} song={songs[it.songId]} size={34} rounded="rounded-[11px]" className={cn('ring-2 ring-surface', i > 0 && '-ml-2')} />
            ))}
            <span className="ml-2.5 text-[13px] font-bold text-ink-2">{plural(items.length, 'música', 'músicas')}</span>
          </div>
          {leader && (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
              <Avatar profile={leader} size="xs" />
              {firstName(leader.name)} ministra
            </div>
          )}
          {team.length > 0 && <AvatarStack profiles={team} size="xs" max={5} />}
        </div>

        <div className="mt-5 flex gap-2">
          <LinkButton to={`/cultos/${service.id}`} variant="primary" className="flex-1 sm:flex-none">
            Ver setlist
          </LinkButton>
          {items.length > 0 && (
            <LinkButton to={`/cultos/${service.id}/ao-vivo`} variant="outline" icon={Play} className="bg-surface/80 backdrop-blur">
              Ao vivo
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickPick() {
  return (
    <section>
      <SectionTitle
        title="O que o momento pede?"
        action={
          <Link to="/assistente" className="flex items-center gap-1 text-[13px] font-bold text-primary">
            Assistente <Sparkles className="size-3.5" />
          </Link>
        }
      />
      <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
        {MOMENTS.filter((m) => m.id !== 'especial' && m.id !== 'batismo').map((m) => (
          <Link
            key={m.id}
            to={`/assistente?momento=${m.id}`}
            className="group flex w-[118px] shrink-0 flex-col gap-3 rounded-3xl p-3.5 transition-transform active:scale-[0.97] lg:w-auto"
            style={{ background: soft(m.color) }}
          >
            <span className="grid size-10 place-items-center rounded-2xl" style={{ background: solid(m.color), color: ink(m.color) }}>
              <m.icon className="size-5" strokeWidth={2.1} />
            </span>
            <span className="text-[14px] leading-tight font-bold" style={{ color: ink(m.color) }}>
              {m.short ?? m.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function SuggestionsPreview() {
  const suggestions = useRows('suggestions')
  const songs = useTable('songs')
  const profiles = useTable('profiles')
  const reactions = useRows('reactions')
  const pending = useMemo(
    () =>
      suggestions
        .filter((s) => s.status === 'pendente' && songs[s.songId])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3),
    [suggestions, songs],
  )
  if (!pending.length) return null
  return (
    <section>
      <SectionTitle
        title="Sugestões da equipe"
        action={
          <Link to="/sugestoes" className="text-[13px] font-bold text-primary">
            Ver todas
          </Link>
        }
      />
      <Card className="divide-y divide-line overflow-hidden">
        {pending.map((s) => {
          const song = songs[s.songId]
          const by = profiles[s.userId]
          const votes = reactions.filter((r) => r.targetId === s.id).length
          return (
            <Link key={s.id} to={`/musica/${song.id}`} className="flex items-start gap-3 p-3.5 transition-colors hover:bg-surface-2/60">
              <SongCover song={song} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold text-ink">{song.title}</div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  {by && <Avatar profile={by} size="xs" />}
                  <span className="truncate">
                    {by ? firstName(by.name) : 'Alguém'} · {timeAgo(s.createdAt)}
                  </span>
                </div>
                {s.note && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{s.note}</p>}
              </div>
              {votes > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[12px] font-bold text-ink-2">
                  <ThumbsUp className="size-3.5" /> {votes}
                </span>
              )}
            </Link>
          )
        })}
      </Card>
    </section>
  )
}

function ChatPreview() {
  const messages = useRows('messages')
  const profiles = useTable('profiles')
  const unread = useUnreadCount()
  const last = useMemo(() => messages.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2).reverse(), [messages])
  return (
    <Link to="/chat" className="block">
      <Card className="p-4 transition-transform active:scale-[0.99]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-2xl bg-sky text-sky-ink">
              <MessageCircle className="size-[18px]" strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-bold text-ink">Chat da equipe</span>
            {unread > 0 && <span className="rounded-full bg-rose px-2 py-0.5 text-[11.5px] font-extrabold text-rose-ink">{unread} novas</span>}
          </div>
          <ChevronRight className="size-5 text-muted" />
        </div>
        {last.length === 0 ? (
          <p className="text-[13.5px] text-muted">Nenhuma mensagem ainda. Diga um “paz do Senhor” para a equipe!</p>
        ) : (
          <div className="space-y-2.5">
            {last.map((m) => {
              const p = profiles[m.userId]
              return (
                <div key={m.id} className="flex items-start gap-2.5">
                  <Avatar profile={p} size="sm" />
                  <div className="min-w-0 rounded-2xl rounded-tl-md bg-surface-2 px-3 py-2">
                    <div className="text-[12px] font-bold text-ink-2">{p ? firstName(p.name) : 'Membro'}</div>
                    <div className="line-clamp-2 text-[13.5px] text-ink">{m.text || (m.songId ? '🎵 Compartilhou uma música' : '📅 Compartilhou um culto')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </Link>
  )
}

export function HomePage() {
  const me = useMe()
  const team = useTeam()
  const next = useNextService()
  const songs = useSongs()
  const favIds = useFavoriteIds()
  const favorites = songs.filter((s) => favIds.has(s.id))
  const recent = useMemo(() => songs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4), [songs])
  const themeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of songs) for (const t of s.themes) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [songs])
  const topThemes = THEMES.filter((t) => themeCounts.get(t.id)).sort((a, b) => (themeCounts.get(b.id) ?? 0) - (themeCounts.get(a.id) ?? 0)).slice(0, 6)
  const todayRaw = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1)

  return (
    <Page wide>
      <header className="flex items-start justify-between gap-4 pt-[max(20px,env(safe-area-inset-top))] pb-6 lg:pt-10">
        <div>
          <div className="mb-1 text-[13px] font-semibold text-muted">{today}</div>
          <h1 className="text-[25px] leading-tight font-extrabold tracking-tight text-ink sm:text-[32px]">
            {greeting()},{' '}
            <span className="whitespace-nowrap">
              {me ? firstName(me.name) : ''} <span className="ml-0.5 inline-block origin-bottom-right animate-[pulse-soft_2s_ease-in-out_1]">👋</span>
            </span>
          </h1>
          <p className="mt-1 text-[14.5px] text-muted">{team?.church || team?.name || 'Ministério de louvor'}</p>
        </div>
        <HeaderAvatar />
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="min-w-0 space-y-8">
          <ForYouPanel />

          {next ? (
            <NextServiceCard service={next} />
          ) : (
            <Card className="flex flex-col items-start gap-3 p-6">
              <span className="grid size-11 place-items-center rounded-2xl bg-butter text-butter-ink">
                <CalendarPlus className="size-5" />
              </span>
              <div>
                <h2 className="text-[18px] font-bold">Nenhum evento agendado</h2>
                <p className="text-[14px] text-muted">Nenhum evento agendado.</p>
              </div>
              <LinkButton to="/cultos/novo" icon={Plus}>
                Agendar evento
              </LinkButton>
            </Card>
          )}

          <QuickPick />

          <Link
            to="/assistente"
            className="group flex items-center gap-3.5 rounded-3xl border border-line bg-surface p-3 pl-4 shadow-card transition-transform active:scale-[0.99]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--lavender-solid)] to-[var(--rose-solid)] text-[var(--lavender-ink)]">
              <Sparkles className="size-5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold text-ink">Pedir uma sugestão</span>
              <span className="block truncate text-[13px] text-muted">“3 músicas de gratidão animadas para a abertura”</span>
            </span>
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-ink transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="size-[18px]" strokeWidth={2.4} />
            </span>
          </Link>

          {topThemes.length > 0 && (
            <section>
              <SectionTitle
                title="Explorar por tema"
                action={
                  <Link to="/musicas" className="text-[13px] font-bold text-primary">
                    Todas as músicas
                  </Link>
                }
              />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {topThemes.map((t) => (
                  <ThemeTile key={t.id} theme={t} count={themeCounts.get(t.id) ?? 0} to={`/musicas/tema/${t.id}`} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-8">
          <SuggestionsPreview />
          <ChatPreview />

          {favorites.length > 0 ? (
            <section>
              <SectionTitle
                title="Suas favoritas"
                action={
                  <Link to="/favoritas" className="text-[13px] font-bold text-primary">
                    Ver todas
                  </Link>
                }
              />
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                {favorites.slice(0, 8).map((s) => (
                  <SongCard key={s.id} song={s} to={`/musica/${s.id}`} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle
              title="Músicas novas"
              action={
                <Link to="/musica/nova" className="flex items-center gap-1 text-[13px] font-bold text-primary">
                  <Plus className="size-4" /> Nova
                </Link>
              }
            />
            <div className="-mx-2">
              {recent.map((s) => (
                <SongRow key={s.id} song={s} to={`/musica/${s.id}`} favorite={favIds.has(s.id)} onToggleFavorite={() => void toggleFavorite(s.id)} />
              ))}
            </div>
          </section>

        </div>
      </div>
    </Page>
  )
}
