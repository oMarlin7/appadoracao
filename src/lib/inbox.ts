import { hasStarted, isJustified, memberStats } from './attendance'
import { EVENT_KIND_BY_ID, eventKind, isPresentation } from './events'
import { ABSENCE_REASON_BY_ID, ROLE_BY_ID, type Pastel } from './taxonomy'
import { addDays, daysBetween, firstName, parseLocalDate, plural, toLocalDateString, weekdayName } from './utils'
import { formatDeadline, tally, timeLeft, votingInfo, winners } from './voting'
import type { Announcement, Attendance, Id, Profile, Service, Song, SongPoll, Suggestion, TeamSettings, Vote } from '@/types'

/**
 * Painel "Para você": lembretes e avisos de cada membro, montados a partir dos dados da
 * equipe (escala, ensaio, votação, sugestões, presença) e dos avisos do líder.
 */

export type InboxVisual =
  | { type: 'ring'; value: number; label: string; tone: 'good' | 'warn' | 'bad' | 'info' }
  | { type: 'countdown'; to: string }
  | { type: 'covers'; songIds: Id[] }
  | { type: 'avatars'; userIds: Id[]; label: string }
  | { type: 'dots'; values: Array<'presente' | 'atraso' | 'justificada' | 'falta' | 'sem'>; label: string }
  | { type: 'date'; date: string; time: string | null }
  | { type: 'icon'; icon: string }

export interface InboxItem {
  /** Estável: dispensar esconde até o contexto mudar. */
  id: string
  kind:
    | 'aviso'
    | 'escala'
    | 'ensaio'
    | 'votar'
    | 'votou'
    | 'sugerir'
    | 'resultado'
    | 'justificar'
    | 'frequencia-alta'
    | 'frequencia-baixa'
    | 'lider-setlist'
    | 'lider-confirmacoes'
    | 'lider-ausencias'
    | 'lider-sugestoes'
    | 'lider-votacao'
    | 'tudo-certo'
  priority: number
  color: Pastel
  icon: string
  eyebrow: string
  title: string
  body: string
  cta?: { label: string; to: string }
  /** Ação rápida dentro do cartão. */
  confirm?: { serviceId: Id }
  visual?: InboxVisual
}

export interface InboxContext {
  me: Profile
  profiles: Profile[]
  services: Service[]
  songs: Record<Id, Song>
  attendance: Attendance[]
  suggestions: Suggestion[]
  votes: Vote[]
  polls: Record<Id, SongPoll>
  team?: TeamSettings
  announcements: Announcement[]
  now?: Date
}

export function announcementForMe(a: Pick<Announcement, 'audience'>, me: Pick<Profile, 'id' | 'functions'>): boolean {
  if (!a.audience.length) return true
  return a.audience.some((t) => t === `user:${me.id}` || (t.startsWith('role:') && me.functions.includes(t.slice(5))))
}

const when = (s: Service) => `${weekdayName(s.date).toLowerCase()}${s.time ? `, ${s.time}` : ''}`
const shortDate = (day: string) => parseLocalDate(day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function buildInbox(ctx: InboxContext): InboxItem[] {
  const now = ctx.now ?? new Date()
  const today = toLocalDateString(now)
  const me = ctx.me
  const first = firstName(me.name)
  const isLeader = me.role === 'admin'
  const items: InboxItem[] = []
  const byService = new Map<Id, Attendance[]>()
  for (const a of ctx.attendance) byService.set(a.serviceId, [...(byService.get(a.serviceId) ?? []), a])
  const record = (serviceId: Id, userId: Id) => byService.get(serviceId)?.find((a) => a.userId === userId)
  const sorted = ctx.services.slice().sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  const upcoming = sorted.filter((s) => s.date >= today)
  // Depois do horário de início não se pede mais confirmação: a presença já é o que aconteceu.
  const notStarted = upcoming.filter((s) => !hasStarted(s, now))
  const daysTo = (s: Service) => daysBetween(parseLocalDate(today), parseLocalDate(s.date))
  const profileById = new Map(ctx.profiles.map((p) => [p.id, p]))
  const songTitle = (id: Id) => ctx.songs[id]?.title ?? 'música'

  // ---- Avisos do líder -------------------------------------------------------------------
  for (const a of ctx.announcements) {
    if (!announcementForMe(a, me) || (a.endsOn && a.endsOn < today)) continue
    const author = a.createdBy ? profileById.get(a.createdBy) : undefined
    items.push({
      id: `aviso:${a.id}:${a.updatedAt}`,
      kind: 'aviso',
      priority: a.pinned ? 100 : 82,
      color: a.color,
      icon: a.icon,
      eyebrow: author ? `Aviso de ${firstName(author.name)}` : 'Aviso da liderança',
      title: a.title,
      body: a.body,
      visual: { type: 'icon', icon: a.icon },
    })
  }

  // ---- Escala do próximo evento ----------------------------------------------------------
  const myNext = notStarted.find((s) => isPresentation(s) && daysTo(s) <= 14 && s.team.some((t) => t.userId === me.id))
  if (myNext) {
    const roles = myNext.team.filter((t) => t.userId === me.id).map((t) => ROLE_BY_ID[t.role]?.name ?? t.role)
    const r = record(myNext.id, me.id)
    const songsIn = myNext.items.filter((i) => ctx.songs[i.songId])
    const d = daysTo(myNext)
    const whenText = d === 0 ? 'hoje' : d === 1 ? 'amanhã' : when(myNext)
    items.push({
      id: `escala:${myNext.id}:${r?.status ?? 'sem'}`,
      kind: 'escala',
      priority: r?.status === 'ausente' ? 35 : d <= 3 ? 96 : 90,
      color: 'lavender',
      icon: 'mic',
      eyebrow: `Escala · ${myNext.title}`,
      title: r?.status === 'ausente' ? `${first}, sua ausência está avisada` : `${first}, você está na escala ${d <= 1 ? whenText : `de ${whenText}`}!`,
      body:
        r?.status === 'ausente'
          ? 'Obrigado por avisar com antecedência — a liderança já sabe.'
          : `${roles.join(' e ')} · ${songsIn.length ? `${plural(songsIn.length, 'música', 'músicas')} no setlist para estudar` : 'o setlist ainda vai ser definido'}.${r ? ' Presença confirmada ✓' : ' Confirme sua presença:'}`,
      cta: { label: 'Ver setlist', to: `/cultos/${myNext.id}` },
      confirm: r ? undefined : { serviceId: myNext.id },
      visual: songsIn.length ? { type: 'covers', songIds: songsIn.slice(0, 4).map((i) => i.songId) } : { type: 'date', date: myNext.date, time: myNext.time },
    })
  }

  // ---- Ensaio ----------------------------------------------------------------------------
  const rehearsal = notStarted.find((s) => eventKind(s) === 'ensaio' && daysTo(s) <= 7 && (!s.team.length || s.team.some((t) => t.userId === me.id)))
  if (rehearsal) {
    const r = record(rehearsal.id, me.id)
    const d = daysTo(rehearsal)
    items.push({
      id: `ensaio:${rehearsal.id}:${r?.status ?? 'sem'}`,
      kind: 'ensaio',
      priority: r ? 30 : d <= 1 ? 93 : 84,
      color: 'mint',
      icon: 'audio',
      eyebrow: 'Ensaio',
      title: d === 0 ? `Ensaio hoje${rehearsal.time ? ` às ${rehearsal.time}` : ''}, ${first}!` : `${first}, tem ensaio ${d === 1 ? 'amanhã' : when(rehearsal)}`,
      body: r?.status === 'ausente' ? 'Você avisou que não vai. Ouça as gravações para não ficar para trás.' : r ? 'Presença confirmada. Revise as cifras antes — chegue afinado 🎶' : rehearsal.notes || 'Vai estar lá? Confirme para o líder organizar o ensaio.',
      cta: { label: 'Detalhes', to: `/cultos/${rehearsal.id}` },
      confirm: r ? undefined : { serviceId: rehearsal.id },
      visual: { type: 'date', date: rehearsal.date, time: rehearsal.time },
    })
  }

  // ---- Votação ---------------------------------------------------------------------------
  const memberCount = ctx.profiles.length
  for (const s of upcoming) {
    const info = votingInfo(s, ctx.team, ctx.polls[s.id], now)
    if (!info.enabled) continue
    const cands = tally(s.id, ctx.suggestions, ctx.votes, (id) => !!ctx.songs[id])
    const voters = [...new Set(ctx.votes.filter((v) => v.serviceId === s.id).map((v) => v.userId))]
    const mine = ctx.votes.filter((v) => v.serviceId === s.id && v.userId === me.id)
    const suggested = ctx.suggestions.some((g) => g.serviceId === s.id && g.userId === me.id)
    if (info.phase === 'aberta') {
      if (mine.length < info.picks && cands.length) {
        items.push({
          id: `votar:${s.id}:${mine.length}`,
          kind: 'votar',
          priority: info.closesAt.getTime() - now.getTime() < 12 * 3600_000 ? 97 : 92,
          color: 'orchid',
          icon: 'vote',
          eyebrow: `Votação · ${s.title}`,
          title: mine.length ? `Falta ${info.picks - mine.length === 1 ? '1 voto' : `${info.picks - mine.length} votos`}, ${first}!` : `${first}, sua voz conta! Vote nas músicas`,
          body: `Escolha até ${info.picks} entre ${plural(cands.length, 'sugestão', 'sugestões')} para ${shortDate(s.date)}. Fecha ${formatDeadline(info.closesAt, ctx.team?.timezone)} (faltam ${timeLeft(info.closesAt, now)}).`,
          cta: { label: 'Votar agora', to: `/cultos/${s.id}#votacao` },
          visual: { type: 'countdown', to: info.closesAt.toISOString() },
        })
      } else if (mine.length) {
        items.push({
          id: `votou:${s.id}`,
          kind: 'votou',
          priority: 25,
          color: 'orchid',
          icon: 'vote',
          eyebrow: `Votação · ${s.title}`,
          title: 'Seu voto está registrado ✓',
          body: `${voters.length} de ${memberCount} já votaram. O resultado sai ${formatDeadline(info.closesAt, ctx.team?.timezone)}.`,
          cta: { label: 'Acompanhar', to: `/cultos/${s.id}#votacao` },
          visual: { type: 'ring', value: memberCount ? voters.length / memberCount : 0, label: `${voters.length}/${memberCount}`, tone: 'info' },
        })
      }
    }
    if ((info.phase === 'aberta' || (info.phase === 'agendada' && info.opensAt.getTime() - now.getTime() < 7 * 86400_000)) && !suggested) {
      items.push({
        id: `sugerir:${s.id}`,
        kind: 'sugerir',
        priority: info.phase === 'aberta' ? 74 : 68,
        color: 'butter',
        icon: 'lightbulb',
        eyebrow: `Sugestões · ${s.title}`,
        title: s.theme ? `Que música combina com “${s.theme}”?` : `${first}, que música você sugere?`,
        body:
          info.phase === 'aberta'
            ? `As sugestões viram opções da votação, que fecha ${formatDeadline(info.closesAt, ctx.team?.timezone)}.`
            : `A votação abre ${formatDeadline(info.opensAt, ctx.team?.timezone)}. Deixe sua sugestão já!`,
        cta: { label: 'Sugerir música', to: `/cultos/${s.id}#votacao` },
        visual: { type: 'icon', icon: 'lightbulb' },
      })
    }
    if (info.phase === 'encerrada') {
      const win = winners(cands, info.picks)
      const closedAgo = now.getTime() - info.closesAt.getTime()
      if (win.length && closedAgo < 7 * 86400_000) {
        const mineWon = win.some((w) => mine.some((v) => v.songId === w.songId))
        items.push({
          id: `resultado:${s.id}`,
          kind: 'resultado',
          priority: 76,
          color: 'mint',
          icon: 'trophy',
          eyebrow: `Resultado da votação · ${shortDate(s.date)}`,
          title: `Deu na votação: ${win.map((w) => songTitle(w.songId)).join(' e ')}`,
          body: `${mineWon ? 'Sua escolha entrou! 🎉 ' : ''}Já estão no setlist do ${s.title} — bora ensaiar na quinta.`,
          cta: { label: 'Ver setlist', to: `/cultos/${s.id}` },
          visual: { type: 'covers', songIds: win.map((w) => w.songId) },
        })
      } else if (!win.length && isLeader && closedAgo < 7 * 86400_000) {
        items.push({
          id: `lider-votacao:${s.id}`,
          kind: 'lider-votacao',
          priority: 79,
          color: 'coral',
          icon: 'vote',
          eyebrow: 'Para o líder',
          title: `A votação do ${s.title} terminou sem votos`,
          body: 'Escolha as músicas direto no setlist.',
          cta: { label: 'Montar setlist', to: `/cultos/${s.id}` },
          visual: { type: 'icon', icon: 'vote' },
        })
      }
    }
  }

  // Sem votação: lembrar de sugerir para o próximo evento.
  if (ctx.team?.selectionMode !== 'votacao') {
    const next = upcoming.find((s) => isPresentation(s) && daysTo(s) <= 10 && !ctx.polls[s.id])
    if (next && !ctx.suggestions.some((g) => g.serviceId === next.id && g.userId === me.id)) {
      items.push({
        id: `sugerir:${next.id}`,
        kind: 'sugerir',
        priority: 50,
        color: 'butter',
        icon: 'lightbulb',
        eyebrow: `Sugestões · ${next.title}`,
        title: next.theme ? `Que música combina com “${next.theme}”?` : `${first}, que música você sugere?`,
        body: `Sugira uma música para ${when(next)} — o líder recebe na hora.`,
        cta: { label: 'Sugerir música', to: `/cultos/${next.id}` },
        visual: { type: 'icon', icon: 'lightbulb' },
      })
    }
  }

  // ---- Falta sem justificativa -----------------------------------------------------------
  const from30 = toLocalDateString(addDays(now, -30))
  for (const s of sorted) {
    if (!hasStarted(s, now) || s.date < from30) continue
    const r = record(s.id, me.id)
    if (r?.status === 'ausente' && !isJustified(r)) {
      items.push({
        id: `justificar:${s.id}`,
        kind: 'justificar',
        priority: 88,
        color: 'rose',
        icon: 'message',
        eyebrow: 'Presença',
        title: `${first}, conta pra gente o que houve?`,
        body: `Sua falta no ${s.title} (${shortDate(s.date)}) está sem justificativa. Leva menos de um minuto.`,
        cta: { label: 'Justificar', to: `/cultos/${s.id}` },
        visual: { type: 'date', date: s.date, time: s.time },
      })
    }
  }

  // ---- Frequência ------------------------------------------------------------------------
  const from90 = toLocalDateString(addDays(now, -90))
  const stats = memberStats(ctx.services, ctx.attendance, { now, from: from90 }).get(me.id)
  const counted = stats ? stats.present + stats.justified + stats.unjustified : 0
  if (stats && stats.rate !== null && counted >= 3) {
    const pct = Math.round(stats.rate * 100)
    const lastSix = sorted
      .filter((s) => hasStarted(s, now) && s.date >= from90 && (s.team.some((t) => t.userId === me.id) || record(s.id, me.id)))
      .slice(-6)
      .map((s) => {
        const r = record(s.id, me.id)
        if (!r) return 'sem' as const
        if (r.status === 'ausente') return isJustified(r) ? ('justificada' as const) : ('falta' as const)
        return r.status === 'atrasado' ? ('atraso' as const) : ('presente' as const)
      })
    const month = today.slice(0, 7)
    if (stats.rate >= 0.85)
      items.push({
        id: `frequencia-alta:${month}`,
        kind: 'frequencia-alta',
        priority: 45,
        color: 'mint',
        icon: 'flame',
        eyebrow: 'Sua frequência',
        title: pct === 100 ? `${first}, 100% de presença! 🔥` : `Que fidelidade, ${first}! 🔥`,
        body: `Você esteve em ${stats.present} de ${counted} encontros nos últimos 3 meses. Obrigado por servir com tanta dedicação!`,
        visual: { type: 'ring', value: stats.rate, label: `${pct}%`, tone: 'good' },
      })
    else if (stats.rate < 0.6)
      items.push({
        id: `frequencia-baixa:${month}`,
        kind: 'frequencia-baixa',
        priority: 66,
        color: 'peach',
        icon: 'heart',
        eyebrow: 'Sua frequência',
        title: `Sentimos sua falta, ${first} 💜`,
        body: `Sua presença nos últimos 3 meses está em ${pct}%. Se algo estiver difícil, conte com a liderança — estamos juntos.`,
        cta: { label: 'Ver minha presença', to: '/presenca' },
        visual: { type: 'dots', values: lastSix, label: `${pct}%` },
      })
  }

  // ---- Pendências do líder ---------------------------------------------------------------
  if (isLeader) {
    const nextEvent = notStarted.find((s) => isPresentation(s) && daysTo(s) <= 10)
    if (nextEvent) {
      const info = votingInfo(nextEvent, ctx.team, ctx.polls[nextEvent.id], now)
      if (!nextEvent.items.length && info.phase !== 'aberta' && info.phase !== 'agendada')
        items.push({
          id: `lider-setlist:${nextEvent.id}`,
          kind: 'lider-setlist',
          priority: 81,
          color: 'coral',
          icon: 'list',
          eyebrow: 'Para o líder',
          title: `O ${nextEvent.title} ainda não tem músicas`,
          body: `É ${when(nextEvent)}. Monte o setlist para a equipe estudar.`,
          cta: { label: 'Montar setlist', to: `/cultos/${nextEvent.id}` },
          visual: { type: 'date', date: nextEvent.date, time: nextEvent.time },
        })
      const pending = [...new Set(nextEvent.team.map((t) => t.userId))].filter((id) => id !== me.id && !record(nextEvent.id, id) && profileById.has(id))
      if (pending.length)
        items.push({
          id: `lider-confirmacoes:${nextEvent.id}:${pending.length}`,
          kind: 'lider-confirmacoes',
          priority: 72,
          color: 'sky',
          icon: 'users',
          eyebrow: 'Para o líder',
          title: `${plural(pending.length, 'pessoa ainda não confirmou', 'pessoas ainda não confirmaram')}`,
          body: `${pending.map((id) => firstName(profileById.get(id)!.name)).join(', ')} · ${nextEvent.title}, ${when(nextEvent)}.`,
          cta: { label: 'Ver escala', to: `/cultos/${nextEvent.id}` },
          visual: { type: 'avatars', userIds: pending, label: 'sem resposta' },
        })
    }
    for (const s of notStarted.filter((x) => daysTo(x) <= 14)) {
      for (const a of byService.get(s.id) ?? []) {
        if (a.status !== 'ausente' || a.userId === me.id || !s.team.some((t) => t.userId === a.userId)) continue
        const p = profileById.get(a.userId)
        if (!p) continue
        const roles = s.team.filter((t) => t.userId === a.userId).map((t) => ROLE_BY_ID[t.role]?.name ?? t.role)
        items.push({
          id: `lider-ausencias:${a.id}:${a.updatedAt}`,
          kind: 'lider-ausencias',
          priority: 77,
          color: 'peach',
          icon: 'alert',
          eyebrow: 'Para o líder · escala',
          title: `${firstName(p.name)} não vai estar ${daysTo(s) <= 1 ? (daysTo(s) === 0 ? 'hoje' : 'amanhã') : `em ${shortDate(s.date)}`}`,
          body: `${roles.join(', ')} no ${s.title}${a.reason ? ` · ${ABSENCE_REASON_BY_ID[a.reason]?.name}` : ''}${a.note ? `: “${a.note}”` : ''}. Vale escalar alguém.`,
          cta: { label: 'Ajustar escala', to: `/cultos/${s.id}` },
          visual: { type: 'avatars', userIds: [a.userId], label: 'ausente' },
        })
      }
    }
    const loose = ctx.suggestions.filter((g) => g.status === 'pendente' && !g.serviceId && ctx.songs[g.songId])
    if (loose.length)
      items.push({
        id: `lider-sugestoes:${loose.length}`,
        kind: 'lider-sugestoes',
        priority: 52,
        color: 'butter',
        icon: 'lightbulb',
        eyebrow: 'Para o líder',
        title: `${plural(loose.length, 'sugestão esperando', 'sugestões esperando')} sua decisão`,
        body: 'A equipe indicou músicas sem escolher o culto. Aceite, recuse ou leve para a votação.',
        cta: { label: 'Ver sugestões', to: '/sugestoes' },
        visual: { type: 'covers', songIds: loose.slice(0, 4).map((g) => g.songId) },
      })
  }

  if (!items.some((i) => i.priority >= 60)) {
    items.push({
      id: `tudo-certo:${today}`,
      kind: 'tudo-certo',
      priority: 1,
      color: 'sky',
      icon: 'sparkles',
      eyebrow: 'Para você',
      title: `Tudo em dia, ${first}! ✨`,
      body: 'Nenhuma pendência por aqui. Que tal ouvir as músicas do próximo culto?',
      cta: { label: 'Ver programação', to: '/cultos' },
      visual: { type: 'icon', icon: 'sparkles' },
    })
  }

  return items.sort((a, b) => b.priority - a.priority)
}

/** Para mostrar o tipo do evento junto ao título (Culto, Festa, Ensaio…). */
export const kindLabel = (s: Pick<Service, 'kind' | 'title'>) => EVENT_KIND_BY_ID[eventKind(s)].name
