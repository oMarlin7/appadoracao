import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { CalendarClock, Check, CircleStop, Hand, Lightbulb, ListChecks, Play, Settings2, Trophy, Vote } from 'lucide-react'
import { SongPickerSheet } from '@/components/action-sheets'
import { AvatarStack } from '@/components/avatar'
import { SongCover } from '@/components/song-bits'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Card, Segmented } from '@/components/ui/primitives'
import { applyPoll, closePollNow, openPollNow, setPoll, suggestSong, toggleVote } from '@/lib/actions'
import { isPresentation } from '@/lib/events'
import { useIsAdmin, useMe, useRow, useRows, useTable } from '@/lib/store'
import { cn, compact, firstName, plural } from '@/lib/utils'
import { formatDeadline, tally, tieAtCutoff, timeLeft, votingActive, votingInfo, winners } from '@/lib/voting'
import type { Service } from '@/types'

/** Leva o resultado das votações encerradas para o setlist (roda em qualquer aparelho da equipe). */
export function useVotingAutomation() {
  const services = useRows('services')
  const polls = useTable('song_polls')
  const votes = useTable('votes')
  const team = useTable('team_settings').team
  const me = useMe()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])
  useEffect(() => {
    if (!me) return
    const now = new Date()
    for (const s of services) {
      const info = votingInfo(s, team, polls[s.id], now)
      if (info.enabled && info.phase === 'encerrada' && !info.applied && now.getTime() - info.closesAt.getTime() < 30 * 86400_000)
        void applyPoll(s.id)
    }
  }, [services, polls, votes, team, me, tick])
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

const PHASE_LABEL = { agendada: 'Abre em breve', aberta: 'Aberta', encerrada: 'Encerrada', off: '' }

export function ServiceVoting({ service }: { service: Service }) {
  const me = useMe()
  const isLeader = useIsAdmin()
  const team = useTable('team_settings').team
  const poll = useRow('song_polls', service.id)
  const suggestions = useRows('suggestions')
  const votes = useRows('votes')
  const songs = useTable('songs')
  const profiles = useTable('profiles')
  const memberCount = useRows('profiles').length
  const location = useLocation()
  const now = useNow()
  const [picking, setPicking] = useState(false)
  const info = votingInfo(service, team, poll, now)
  const candidates = useMemo(() => tally(service.id, suggestions, votes, (id) => !!songs[id]), [service.id, suggestions, votes, songs])
  const win = winners(candidates, info.picks)
  const voters = [...new Set(votes.filter((v) => v.serviceId === service.id).map((v) => v.userId))]
  const mine = votes.filter((v) => v.serviceId === service.id && v.userId === me?.id)
  const maxVotes = Math.max(1, ...candidates.map((c) => c.votes))

  useEffect(() => {
    if (location.hash === '#votacao') document.getElementById('votacao')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

  if (!isPresentation(service)) return null

  // Este evento é do líder (sem votação, ou a votação passou sem votos).
  if (!votingActive(info, voters.length > 0)) {
    if (!isLeader) return null
    return (
      <section id="votacao" className="mt-6 scroll-mt-20">
        <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-dashed border-line p-4">
          <span className="grid size-10 place-items-center rounded-2xl bg-orchid text-orchid-ink">
            <Vote className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold text-ink">Você escolhe as músicas deste evento</div>
            <div className="text-[12.5px] text-muted">
              {info.enabled ? 'A votação semanal passou sem votos. Quer abrir uma votação agora?' : 'Prefere deixar a equipe votar nas sugestões?'}
            </div>
          </div>
          <Button size="sm" variant="soft" icon={Vote} onClick={() => void openPollNow(service.id).then((ok) => ok && toast.success('Votação aberta para a equipe 🗳️'))}>
            Abrir votação
          </Button>
        </div>
      </section>
    )
  }

  const open = info.phase === 'aberta'
  const closed = info.phase === 'encerrada'

  return (
    <section id="votacao" className="mt-8 scroll-mt-20">
      <div className="relative overflow-hidden rounded-[30px] border border-line bg-surface shadow-card">
        <div className="absolute inset-0 bg-[var(--orchid-bg)]" />
        <div className="absolute -top-16 -right-10 size-52 rounded-full bg-[var(--orchid-solid)] opacity-50 blur-3xl" />
        <div className="relative p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--orchid-solid)] text-orchid-ink shadow-card">
              {closed ? <Trophy className="size-6" /> : <Vote className="size-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-extrabold tracking-tight text-ink">{closed ? 'Resultado da votação' : 'Votação das músicas'}</h2>
                <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold', open ? 'bg-primary text-primary-ink' : 'bg-surface/80 text-ink-2')}>
                  {info.applied ? 'No setlist ✓' : PHASE_LABEL[info.phase]}
                </span>
              </div>
              <p className="mt-0.5 text-[13.5px] text-ink-2">
                {open && `Escolha até ${info.picks} músicas. Fecha ${formatDeadline(info.closesAt, team?.timezone)} — faltam ${timeLeft(info.closesAt, now)}.`}
                {info.phase === 'agendada' && `Abre ${formatDeadline(info.opensAt, team?.timezone)} e fecha ${formatDeadline(info.closesAt, team?.timezone)}. Já dá para sugerir!`}
                {closed &&
                  (win.length
                    ? `${plural(win.length, 'música escolhida', 'músicas escolhidas')} pela equipe para o ensaio de quinta.`
                    : 'Encerrou sem votos — o líder escolhe as músicas.')}
              </p>
            </div>
            {isLeader && (
              <Menu
                label="Configurar votação"
                trigger={(openMenu) => (
                  <button type="button" onClick={openMenu} aria-label="Configurar votação" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface/70 text-ink-2 hover:bg-surface">
                    <Settings2 className="size-[18px]" />
                  </button>
                )}
                items={[
                  { label: 'Abrir agora', icon: Play, hidden: info.phase !== 'agendada', onSelect: () => void openPollNow(service.id) },
                  { label: 'Encerrar agora', icon: CircleStop, hidden: !open, description: 'As mais votadas entram no setlist', onSelect: () => void closePollNow(service.id) },
                  { label: 'Reabrir por 2 dias', icon: CalendarClock, hidden: !closed || info.applied, onSelect: () => void openPollNow(service.id) },
                  {
                    label: 'Escolher direto (sem votação)',
                    icon: Hand,
                    hidden: closed && info.applied,
                    description: 'Só neste evento',
                    onSelect: () => void setPoll(service.id, { mode: 'lider' }).then((ok) => ok && toast('Você escolhe as músicas deste evento')),
                  },
                ]}
              />
            )}
          </div>

          {/* Participação */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2.5">
              {voters.length > 0 ? <AvatarStack profiles={compact(voters.map((id) => profiles[id]))} size="sm" max={5} /> : null}
              <span className="text-[13px] font-semibold text-ink-2">
                {voters.length} de {memberCount} votaram
              </span>
            </div>
            {open && me && (
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                {Array.from({ length: info.picks }, (_, i) => (
                  <span key={i} className={cn('size-3 rounded-full ring-2 ring-surface/70', i < mine.length ? 'bg-primary' : 'bg-surface-3')} />
                ))}
                <span className="ml-1">{mine.length === info.picks ? 'Seus votos estão completos' : `Você escolheu ${mine.length} de ${info.picks}`}</span>
              </div>
            )}
            {isLeader && !closed && (
              <Segmented
                size="sm"
                value={String(info.picks)}
                onChange={(v) => void setPoll(service.id, { picks: Number(v) })}
                options={[
                  { value: '2', label: '2 músicas' },
                  { value: '3', label: '3 músicas' },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Candidatas */}
      <Card className="mt-3 overflow-hidden p-1.5">
        {candidates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <Lightbulb className="size-7 text-butter-ink" />
            <p className="text-[14px] font-semibold text-ink">Nenhuma sugestão ainda</p>
            <p className="text-[13px] text-muted">As sugestões da equipe para este evento viram as opções da votação.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {candidates.map((c, i) => {
              const song = songs[c.songId]
              const voted = mine.some((v) => v.songId === c.songId)
              const won = closed && win.some((w) => w.songId === c.songId)
              const leading = !closed && c.votes > 0 && i < info.picks
              return (
                <motion.li
                  key={c.songId}
                  layout
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  className={cn('relative flex items-center gap-3 overflow-hidden rounded-2xl p-2.5', voted && !closed && 'ring-1 ring-primary/30')}
                >
                  <motion.span
                    className="absolute inset-y-0 left-0"
                    initial={false}
                    animate={{ width: `${(c.votes / maxVotes) * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{ opacity: c.votes ? 1 : 0, background: won ? 'var(--mint-bg)' : voted && !closed ? 'var(--primary-soft)' : 'var(--orchid-bg)' }}
                  />
                  <span className="relative w-5 shrink-0 text-center text-[13px] font-extrabold text-muted tabular-nums">{won ? <Trophy className="mx-auto size-4 text-mint-ink" /> : i + 1}</span>
                  <Link to={`/musica/${song.id}`} className="relative shrink-0">
                    <SongCover song={song} size={46} />
                  </Link>
                  <div className="relative min-w-0 flex-1">
                    <Link to={`/musica/${song.id}`} className="block truncate text-[15px] font-bold text-ink">
                      {song.title}
                    </Link>
                    <div className="truncate text-[12.5px] text-muted">
                      sugerida por {c.suggestedBy.map((id) => (profiles[id] ? firstName(profiles[id].name) : 'alguém')).join(', ')}
                      {c.notes[0] ? ` · “${c.notes[0]}”` : ''}
                    </div>
                    {c.voters.length > 0 && <AvatarStack profiles={compact(c.voters.map((id) => profiles[id]))} size="xs" max={6} className="mt-1" />}
                  </div>
                  <div className="relative flex shrink-0 items-center gap-2">
                    <span className={cn('text-[15px] font-extrabold tabular-nums', leading || won ? 'text-primary' : 'text-ink-2')}>{c.votes}</span>
                    {open && (
                      <button
                        type="button"
                        aria-pressed={voted}
                        aria-label={voted ? `Tirar voto de ${song.title}` : `Votar em ${song.title}`}
                        onClick={() => void toggleVote(service.id, c.songId)}
                        className={cn(
                          'grid size-10 place-items-center rounded-full border-2 transition-all active:scale-90',
                          voted ? 'border-transparent bg-primary text-primary-ink shadow-float' : 'border-line bg-surface text-muted hover:border-primary/50 hover:text-primary',
                        )}
                      >
                        <Check className="size-5" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                </motion.li>
              )
            })}
          </ul>
        )}
        {(open || info.phase === 'agendada') && (
          <div className="border-t border-line p-2">
            <Button variant="ghost" icon={Lightbulb} className="w-full" onClick={() => setPicking(true)}>
              Sugerir outra música
            </Button>
          </div>
        )}
      </Card>
      {closed && tieAtCutoff(candidates, info.picks) && <p className="mt-2 px-1 text-[12.5px] text-muted">Empate na última vaga: entrou a música sugerida primeiro.</p>}
      {closed && !info.applied && win.length > 0 && isLeader && (
        <Button className="mt-3" icon={ListChecks} onClick={() => void applyPoll(service.id).then((ok) => ok && toast.success('Músicas da votação no setlist 🎉'))}>
          Levar para o setlist
        </Button>
      )}

      <SongPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        title="Sugerir para a votação"
        excludeIds={candidates.map((c) => c.songId)}
        onPick={async (song) => {
          setPicking(false)
          if (await suggestSong(song.id, service.id, '')) toast.success(open ? `“${song.title}” entrou na votação 🗳️` : `“${song.title}” vai para a votação`)
        }}
      />
    </section>
  )
}
