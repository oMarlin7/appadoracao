import { isPresentation } from './events'
import type { Id, Service, SetlistItem, Song, SongPoll, Suggestion, TeamSettings, Vote } from '@/types'

/**
 * Votação das músicas de um evento, com base nas sugestões da equipe.
 *
 * Regra semanal (quando o líder escolhe "votação"): o ensaio é a quinta antes do evento; a
 * votação fecha no sábado 12h anterior a esse ensaio e abre dois dias antes (quinta 12h).
 * Para um culto de domingo: abre na quinta 12h (10 dias antes) e fecha no sábado 12h
 * (8 dias antes), a tempo do ensaio de quinta. O líder pode mudar prazo e quantidade por
 * evento, ou escolher direto. (Mesma regra de voting_window no banco.)
 */

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
/** Quantas músicas a votação pode escolher (o mesmo limite do banco). */
export const MAX_VOTING_PICKS = 20

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime()) / 60000
}

/** Um horário de relógio (ex.: 12:00) num dia AAAA-MM-DD, no fuso da equipe. */
export function zonedTime(day: string, hour: number, minute: number, timeZone = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  let t = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000
  // Ajuste fino para dias com mudança de horário de verão.
  t = guess - tzOffsetMinutes(new Date(t), timeZone) * 60000
  return new Date(t)
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

/** Quinta-feira do ensaio da semana do evento (a quinta anterior ao dia do evento). */
export function rehearsalDay(eventDay: string): string {
  const [y, m, d] = eventDay.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const back = (dow - 4 + 7) % 7 || 7
  return shiftDay(eventDay, -back)
}

export type VotingPhase = 'off' | 'agendada' | 'aberta' | 'encerrada'

export interface VotingInfo {
  /** O evento é escolhido por votação? */
  enabled: boolean
  phase: VotingPhase
  opensAt: Date
  closesAt: Date
  rehearsal: string
  picks: number
  applied: boolean
  /** O líder mudou algo só para este evento. */
  custom: boolean
}

export function votingInfo(
  service: Pick<Service, 'id' | 'date' | 'kind' | 'title'>,
  team: Pick<TeamSettings, 'selectionMode' | 'votingPicks' | 'timezone'> | undefined,
  poll: SongPoll | undefined,
  now: Date = new Date(),
): VotingInfo {
  const tz = team?.timezone || DEFAULT_TIMEZONE
  const rehearsal = rehearsalDay(service.date)
  const closesAt = poll?.closesAt ? new Date(poll.closesAt) : zonedTime(shiftDay(rehearsal, -5), 12, 0, tz)
  const opensAt = poll?.opensAt ? new Date(poll.opensAt) : zonedTime(shiftDay(rehearsal, -7), 12, 0, tz)
  const mode = poll?.mode ?? (team?.selectionMode === 'votacao' ? 'votacao' : 'lider')
  const enabled = isPresentation(service) && mode === 'votacao'
  const phase: VotingPhase = !enabled ? 'off' : now < opensAt ? 'agendada' : now < closesAt ? 'aberta' : 'encerrada'
  return {
    enabled,
    phase,
    opensAt,
    closesAt,
    rehearsal,
    picks: poll?.picks ?? team?.votingPicks ?? 2,
    applied: !!poll?.appliedAt,
    custom: !!poll && (poll.opensAt !== null || poll.closesAt !== null || poll.picks !== null || poll.mode === 'lider'),
  }
}

/**
 * A votação ainda vale para o evento? Uma votação que terminou sem nenhum voto (ou cujo prazo
 * passou antes de o evento ser criado) volta a ser escolha do líder.
 */
export function votingActive(info: VotingInfo, hasVotes: boolean): boolean {
  return info.enabled && (info.phase !== 'encerrada' || info.applied || hasVotes)
}

// ---------------------------------------------------------------------------
// Candidatas e apuração
// ---------------------------------------------------------------------------

export interface Candidate {
  songId: Id
  suggestedBy: Id[]
  /** Primeira sugestão (desempate). */
  firstAt: string
  notes: string[]
  votes: number
  voters: Id[]
}

/** Sugestões do evento viram candidatas; ordem = mais votadas, depois a sugestão mais antiga. */
export function tally(serviceId: Id, suggestions: Suggestion[], votes: Vote[], songExists: (id: Id) => boolean = () => true): Candidate[] {
  const map = new Map<Id, Candidate>()
  for (const s of suggestions) {
    if (s.serviceId !== serviceId || s.status === 'recusada' || !songExists(s.songId)) continue
    const c = map.get(s.songId) ?? { songId: s.songId, suggestedBy: [], firstAt: s.createdAt, notes: [], votes: 0, voters: [] }
    if (!c.suggestedBy.includes(s.userId)) c.suggestedBy.push(s.userId)
    if (s.createdAt < c.firstAt) c.firstAt = s.createdAt
    if (s.note.trim()) c.notes.push(s.note.trim())
    map.set(s.songId, c)
  }
  for (const v of votes) {
    if (v.serviceId !== serviceId) continue
    const c = map.get(v.songId)
    if (!c || c.voters.includes(v.userId)) continue
    c.votes++
    c.voters.push(v.userId)
  }
  return [...map.values()].sort((a, b) => b.votes - a.votes || a.firstAt.localeCompare(b.firstAt) || a.songId.localeCompare(b.songId))
}

/** As mais votadas (só entram músicas com pelo menos 1 voto). */
export function winners(candidates: Candidate[], picks: number): Candidate[] {
  return candidates.filter((c) => c.votes > 0).slice(0, picks)
}

/** Empate na última vaga, decidido pela sugestão mais antiga? */
export function tieAtCutoff(candidates: Candidate[], picks: number): boolean {
  const last = candidates[picks - 1]
  const next = candidates[picks]
  return !!last && !!next && last.votes > 0 && last.votes === next.votes
}

/** Itens que entram no setlist ao aplicar o resultado (sem repetir o que já está lá). */
export function itemsFromWinners(current: SetlistItem[], win: Candidate[], songs: Record<Id, Song>): SetlistItem[] {
  const added = win
    .filter((c) => !current.some((i) => i.songId === c.songId))
    .map((c) => ({
      id: `votacao-${c.songId}`,
      songId: c.songId,
      key: songs[c.songId]?.teamKey ?? songs[c.songId]?.originalKey ?? null,
      moment: null,
      notes: 'Escolhida na votação',
    }))
  return [...current, ...added]
}

/** "2d 4h", "5h 20min", "12 min" */
export function timeLeft(to: Date, now: Date = new Date()): string {
  const ms = to.getTime() - now.getTime()
  if (ms <= 0) return 'encerrada'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  return `${Math.max(1, m)} min`
}

export function formatDeadline(at: Date, timeZone = DEFAULT_TIMEZONE): string {
  const wd = at.toLocaleDateString('pt-BR', { weekday: 'long', timeZone })
  const day = at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone })
  const hm = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).replace(':00', 'h').replace(':', 'h')
  return `${wd.replace('-feira', '')}, ${day} às ${hm}`
}
