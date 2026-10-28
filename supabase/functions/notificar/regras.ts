// Regras das notificações no celular: o que avisar, para quem e quando.
//
// A função roda a cada minuto e chama `planejar` com o estado atual da equipe. Cada aviso tem
// uma chave única (ex.: "escala:<culto>:<pessoa>"); a função só envia as chaves que ainda não
// estão no registro, então rodar de novo nunca repete notificação.
//
// As regras de votação e de tipo de evento repetem as do app (src/lib/voting.ts e
// src/lib/events.ts); um teste confere que as duas versões dão o mesmo resultado.

export type NotifyKind = 'escala' | 'votacao' | 'setlist' | 'ensaio' | 'avisos'

export interface Payload {
  title: string
  body: string
  /** Mesma tag = a notificação nova substitui a anterior em vez de empilhar. */
  tag: string
  /** Página do app que abre ao tocar. */
  url: string
  /** Arte de /notificacoes (aparece grande no Android). */
  image: string
}

export interface Planned {
  key: string
  kind: NotifyKind
  recipients: Array<{ userId: string; payload: Payload }>
}

export interface ProfileRow {
  id: string
  name: string
  functions: string[] | null
  notify_prefs: Partial<Record<NotifyKind, boolean>> | null
}

export interface ServiceRow {
  id: string
  title: string
  kind: string | null
  date: string
  time: string | null
  notes: string | null
  items: Array<{ songId: string }> | null
  team: Array<{ userId: string; role: string }> | null
  updated_at: string
}

export interface PollRow {
  id: string
  mode: 'votacao' | 'lider'
  picks: number | null
  max_votes?: number | null
  opens_at: string | null
  closes_at: string | null
  applied_at: string | null
}

export interface AnnouncementRow {
  id: string
  title: string
  body: string
  audience: string[] | null
  ends_on: string | null
  created_by: string | null
  created_at: string
}

export interface State {
  now: Date
  team: { selection_mode: string | null; voting_picks: number | null; voting_votes?: number | null; timezone: string | null }
  profiles: ProfileRow[]
  services: ServiceRow[]
  polls: PollRow[]
  /** Quem já votou em cada evento. */
  votes: Array<{ service_id: string; user_id: string }>
  /** Eventos com alguma sugestão esperando votação. */
  suggested: Set<string>
  songTitles: Map<string, string>
  announcements: AnnouncementRow[]
  /** Eventos cujo setlist já foi avisado alguma vez (para dizer "atualizado"). */
  setlistNotified: Set<string>
}

const MIN = 60_000
const HOUR = 60 * MIN

// ---------------------------------------------------------------------------
// Datas no fuso da equipe
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

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

export function zonedTime(day: string, hour: number, minute: number, timeZone = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  let t = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000
  t = guess - tzOffsetMinutes(new Date(t), timeZone) * 60000
  return new Date(t)
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** Dia (AAAA-MM-DD) e hora no fuso da equipe. */
export function localNow(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

export function rehearsalDay(eventDay: string): string {
  const [y, m, d] = eventDay.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const back = (dow - 4 + 7) % 7 || 7
  return shiftDay(eventDay, -back)
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const weekday = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/** "19h", "19h30" */
export function clock(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '')
  if (!m) return ''
  return `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}`
}

/** "hoje", "amanhã" ou "domingo, 26/10" */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'hoje'
  if (day === shiftDay(today, 1)) return 'amanhã'
  return `${weekday(day)}, ${ddmm(day)}`
}

function instantParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: clock(`${get('hour')}:${get('minute')}`) }
}

/** "sábado, 25/10 às 12h" */
function instantLabel(at: Date, timeZone: string, today: string): string {
  const { day, time } = instantParts(at, timeZone)
  return `${dayLabel(day, today)} às ${time}`
}

// ---------------------------------------------------------------------------
// Regras do app (mesmas de src/lib)
// ---------------------------------------------------------------------------

const KNOWN_KINDS = ['culto', 'festa', 'congresso', 'especial', 'ensaio', 'reuniao', 'confraternizacao']
const PRESENTATION = new Set(['culto', 'festa', 'congresso', 'especial'])

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function eventKind(s: { kind: string | null; title: string }): string {
  if (s.kind && KNOWN_KINDS.includes(s.kind)) return s.kind
  const t = stripAccents(s.title.toLowerCase())
  if (/^(ensaio|passagem de som)/.test(t)) return 'ensaio'
  if (/reuniao/.test(t)) return 'reuniao'
  if (/confraterniza/.test(t)) return 'confraternizacao'
  return 'culto'
}

export const isPresentation = (s: { kind: string | null; title: string }) => PRESENTATION.has(eventKind(s))

export function votingWindow(service: ServiceRow, team: State['team'], poll: PollRow | undefined) {
  const tz = team.timezone || DEFAULT_TIMEZONE
  const rehearsal = rehearsalDay(service.date)
  const closesAt = poll?.closes_at ? new Date(poll.closes_at) : zonedTime(shiftDay(rehearsal, -5), 12, 0, tz)
  const opensAt = poll?.opens_at ? new Date(poll.opens_at) : zonedTime(shiftDay(rehearsal, -7), 12, 0, tz)
  const mode = poll?.mode ?? (team.selection_mode === 'votacao' ? 'votacao' : 'lider')
  const picks = poll?.picks ?? team.voting_picks ?? 2
  // Em quantas músicas cada pessoa vota (sem número próprio, tantas quantas entram).
  const votes = poll?.max_votes ?? team.voting_votes ?? picks
  return { enabled: isPresentation(service) && mode === 'votacao', opensAt, closesAt, picks, votes, applied: !!poll?.applied_at }
}

export const ROLE_NAMES: Record<string, string> = {
  ministro: 'Ministro(a)',
  vocal: 'Vocal',
  backvocal: 'Back vocal',
  violao: 'Violão',
  guitarra: 'Guitarra',
  baixo: 'Baixo',
  teclado: 'Teclado',
  bateria: 'Bateria',
  percussao: 'Percussão',
  sopro: 'Sopros',
  som: 'Som / Técnica',
  midia: 'Mídia / Projeção',
}

export function announcementFor(a: Pick<AnnouncementRow, 'audience'>, p: Pick<ProfileRow, 'id' | 'functions'>): boolean {
  const audience = a.audience ?? []
  if (!audience.length) return true
  return audience.some((t) => t === `user:${p.id}` || (t.startsWith('role:') && (p.functions ?? []).includes(t.slice(5))))
}

// ---------------------------------------------------------------------------
// Planejamento
// ---------------------------------------------------------------------------

const firstName = (p: ProfileRow) => p.name.trim().split(/\s+/)[0] || 'Olá'
const wants = (p: ProfileRow, kind: NotifyKind) => p.notify_prefs?.[kind] !== false
const art = (name: string) => `/notificacoes/${name}.jpg`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Assinatura curta do setlist (muda quando entra, sai ou troca de ordem uma música). */
export function setlistSignature(items: Array<{ songId: string }>): string {
  let h = 2166136261
  for (const ch of items.map((i) => i.songId).join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0).toString(36)
}

function songList(items: Array<{ songId: string }>, titles: Map<string, string>, max = 4): string {
  const names = items.map((i) => titles.get(i.songId)).filter((t): t is string => !!t)
  if (!names.length) return plural(items.length, 'música', 'músicas')
  return names.length > max ? `${names.slice(0, max).join(' · ')} +${names.length - max}` : names.join(' · ')
}

/** Silêncio à noite: o que acontecer entre 22h e 7h chega às 7h. */
export const QUIET_FROM = 22
export const QUIET_UNTIL = 7
/** Espera o líder terminar de mexer no setlist antes de avisar. */
export const SETLIST_SETTLE_MS = 10 * MIN

/** `ignoreQuiet`: na primeira rodada tudo o que já existe é marcado como avisado, a qualquer hora. */
export function planejar(s: State, opts: { ignoreQuiet?: boolean } = {}): Planned[] {
  const tz = s.team.timezone || DEFAULT_TIMEZONE
  const { day: today, hour } = localNow(s.now, tz)
  if (!opts.ignoreQuiet && (hour >= QUIET_FROM || hour < QUIET_UNTIL)) return []

  const now = s.now.getTime()
  const out: Planned[] = []
  const byId = new Map(s.profiles.map((p) => [p.id, p]))
  const pollOf = new Map(s.polls.map((p) => [p.id, p]))
  const upcoming = s.services.filter((v) => v.date >= today)
  const teamOf = (v: ServiceRow) => [...new Set((v.team ?? []).map((t) => t.userId))].map((id) => byId.get(id)).filter((p): p is ProfileRow => !!p)

  for (const v of upcoming) {
    const presentation = isPresentation(v)
    const when = `${dayLabel(v.date, today)}${v.time ? ` às ${clock(v.time)}` : ''}`

    // Escala: quem entra na escala de um culto/evento.
    if (presentation)
      for (const a of v.team ?? []) {
        const p = byId.get(a.userId)
        if (!p || !wants(p, 'escala')) continue
        const role = ROLE_NAMES[a.role]
        out.push({
          key: `escala:${v.id}:${p.id}`,
          kind: 'escala',
          recipients: [
            {
              userId: p.id,
              payload: {
                title: `${firstName(p)}, você está na escala`,
                body: `${v.title} · ${when}${role ? ` · ${role}` : ''}. Toque para confirmar presença.`,
                tag: `escala-${v.id}`,
                url: `/cultos/${v.id}`,
                image: art('escala'),
              },
            },
          ],
        })
      }

    // Votação: quando abre e nas últimas 2 horas (só para quem ainda não votou).
    if (presentation) {
      const w = votingWindow(v, s.team, pollOf.get(v.id))
      const open = w.enabled && !w.applied && now >= w.opensAt.getTime() && now < w.closesAt.getTime()
      if (open && now - w.opensAt.getTime() < 12 * HOUR) {
        const closes = instantLabel(w.closesAt, tz, today)
        out.push({
          key: `votacao:${v.id}:${w.opensAt.toISOString()}`,
          kind: 'votacao',
          recipients: s.profiles
            .filter((p) => wants(p, 'votacao'))
            .map((p) => ({
              userId: p.id,
              payload: {
                title: 'A votação abriu',
                body: `${firstName(p)}, ${w.votes === w.picks ? `escolha até ${plural(w.picks, 'música', 'músicas')}` : `você tem ${plural(w.votes, 'voto', 'votos')} e ${w.picks === 1 ? 'entra a mais votada' : `entram as ${w.picks} mais votadas`}`} para o ${v.title} (${ddmm(v.date)}). Fecha ${closes}.`,
                tag: `votacao-${v.id}`,
                url: `/cultos/${v.id}`,
                image: art('votacao'),
              },
            })),
        })
      }
      if (open && s.suggested.has(v.id) && w.closesAt.getTime() - now <= 2 * HOUR) {
        const voted = new Set(s.votes.filter((x) => x.service_id === v.id).map((x) => x.user_id))
        for (const p of s.profiles) {
          if (voted.has(p.id) || !wants(p, 'votacao')) continue
          out.push({
            key: `votacao-fim:${v.id}:${w.closesAt.toISOString()}:${p.id}`,
            kind: 'votacao',
            recipients: [
              {
                userId: p.id,
                payload: {
                  title: 'Últimas horas para votar',
                  body: `${firstName(p)}, a votação do ${v.title} fecha ${instantLabel(w.closesAt, tz, today)}. Seu voto ajuda a montar o setlist.`,
                  tag: `votacao-${v.id}`,
                  url: `/cultos/${v.id}`,
                  image: art('votacao-fim'),
                },
              },
            ],
          })
        }
      }
    }

    // Setlist: quando fica pronto (e quando muda), depois de 10 min sem mexer.
    const items = v.items ?? []
    if (items.length && now - new Date(v.updated_at).getTime() >= SETLIST_SETTLE_MS) {
      const again = s.setlistNotified.has(v.id)
      const people = teamOf(v).length ? teamOf(v) : s.profiles
      out.push({
        key: `setlist:${v.id}:${setlistSignature(items)}`,
        kind: 'setlist',
        recipients: people
          .filter((p) => wants(p, 'setlist'))
          .map((p) => ({
            userId: p.id,
            payload: {
              title: `${again ? 'Setlist atualizado' : 'Setlist pronto'} · ${v.title}`,
              body: `${when[0].toUpperCase()}${when.slice(1)}: ${songList(items, s.songTitles)}`,
              tag: `setlist-${v.id}`,
              url: `/cultos/${v.id}`,
              image: art('setlist'),
            },
          })),
      })
    }

    // Ensaio: no dia, 4 horas antes (nunca antes das 7h; sem horário, às 9h).
    if (eventKind(v) === 'ensaio' && v.date === today) {
      const m = /^(\d{1,2}):(\d{2})/.exec(v.time ?? '')
      const start = m ? zonedTime(today, Number(m[1]), Number(m[2]), tz).getTime() : null
      const sendAt = start ? Math.max(start - 4 * HOUR, zonedTime(today, QUIET_UNTIL, 0, tz).getTime()) : zonedTime(today, 9, 0, tz).getTime()
      if (now >= sendAt && (start === null || now < start)) {
        const people = teamOf(v).length ? teamOf(v) : s.profiles
        const extra = items.length ? `Repertório: ${songList(items, s.songTitles)}.` : v.notes?.trim() || 'Revise as cifras antes de ir.'
        out.push({
          key: `ensaio:${v.id}`,
          kind: 'ensaio',
          recipients: people
            .filter((p) => wants(p, 'ensaio'))
            .map((p) => ({
              userId: p.id,
              payload: {
                title: `Ensaio hoje${v.time ? ` às ${clock(v.time)}` : ''}`,
                body: `${firstName(p)}, ${extra.charAt(0).toLowerCase()}${extra.slice(1)}`,
                tag: `ensaio-${v.id}`,
                url: `/cultos/${v.id}`,
                image: art('ensaio'),
              },
            })),
        })
      }
    }
  }

  // Avisos do líder: assim que publicados (até 24 h depois), para quem foi escolhido.
  for (const a of s.announcements) {
    if (now - new Date(a.created_at).getTime() > 24 * HOUR) continue
    if (a.ends_on && a.ends_on < today) continue
    const text = a.body.trim().replace(/\s+/g, ' ')
    out.push({
      key: `aviso:${a.id}`,
      kind: 'avisos',
      recipients: s.profiles
        .filter((p) => p.id !== a.created_by && wants(p, 'avisos') && announcementFor(a, p))
        .map((p) => ({
          userId: p.id,
          payload: {
            title: a.title,
            body: text ? (text.length > 180 ? `${text.slice(0, 177)}…` : text) : 'Toque para ver o aviso.',
            tag: `aviso-${a.id}`,
            url: '/',
            image: art('aviso'),
          },
        })),
    })
  }

  return out.filter((n) => n.recipients.length)
}

export function testPayload(name: string): Payload {
  return {
    title: `Tudo certo, ${name.trim().split(/\s+/)[0] || 'você'}!`,
    body: 'As notificações do Adoração estão ativadas neste aparelho.',
    tag: 'teste',
    url: '/perfil',
    image: art('teste'),
  }
}
