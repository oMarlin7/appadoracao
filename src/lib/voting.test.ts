import { describe, expect, it } from 'vitest'
import { eventKind, isPresentation } from './events'
import { buildInbox } from './inbox'
import { itemsFromWinners, rehearsalDay, tally, tieAtCutoff, votingInfo, votingRule, winners, zonedTime } from './voting'
import type { Attendance, Profile, Service, SongPoll, Suggestion, TeamSettings, Vote } from '@/types'

const svc = (over: Partial<Service> = {}): Service => ({
  id: 'c1',
  title: 'Culto de Domingo',
  kind: 'culto',
  date: '2026-10-25',
  time: '19:00',
  theme: '',
  bibleText: '',
  notes: '',
  leaderId: null,
  items: [],
  team: [],
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  ...over,
})
const team: TeamSettings = { id: 'team', name: '', church: '', inviteCode: null, selectionMode: 'votacao', votingPicks: 2, timezone: 'America/Sao_Paulo', updatedAt: '' }
const sug = (id: string, songId: string, userId: string, createdAt: string, serviceId = 'c1'): Suggestion => ({ id, songId, serviceId, userId, note: '', status: 'pendente', createdAt, updatedAt: createdAt })
const vote = (userId: string, songId: string, serviceId = 'c1'): Vote => ({ id: `${serviceId}:${userId}:${songId}`, serviceId, userId, songId, createdAt: '' })

describe('tipos de evento', () => {
  it('só cultos, festas, congressos e especiais são apresentações', () => {
    expect(isPresentation({ kind: 'culto', title: '' })).toBe(true)
    expect(isPresentation({ kind: 'congresso', title: '' })).toBe(true)
    expect(isPresentation({ kind: 'ensaio', title: '' })).toBe(false)
    expect(isPresentation({ kind: 'confraternizacao', title: '' })).toBe(false)
  })
  it('eventos antigos sem tipo são deduzidos pelo título', () => {
    expect(eventKind({ title: 'Ensaio geral' })).toBe('ensaio')
    expect(eventKind({ title: 'Reunião do ministério' })).toBe('reuniao')
    expect(eventKind({ title: 'Culto de Jovens' })).toBe('culto')
  })
})

describe('janela da votação', () => {
  it('12h em São Paulo é 15h UTC', () => {
    expect(zonedTime('2026-10-17', 12, 0, 'America/Sao_Paulo').toISOString()).toBe('2026-10-17T15:00:00.000Z')
  })
  it('ensaio é a quinta antes do evento', () => {
    expect(rehearsalDay('2026-10-25')).toBe('2026-10-22') // domingo → quinta
    expect(rehearsalDay('2026-10-24')).toBe('2026-10-22') // sábado → quinta
    expect(rehearsalDay('2026-10-22')).toBe('2026-10-15') // quinta → quinta anterior
  })
  it('culto de domingo: abre quinta 12h (10 dias antes) e fecha sábado 12h (8 dias antes)', () => {
    const info = votingInfo(svc(), team, undefined, new Date('2026-10-16T12:00:00Z'))
    expect(info.opensAt.toISOString()).toBe('2026-10-15T15:00:00.000Z')
    expect(info.closesAt.toISOString()).toBe('2026-10-17T15:00:00.000Z')
    expect(info.phase).toBe('aberta')
    expect(info.picks).toBe(2)
  })
  it('fases ao longo da semana', () => {
    expect(votingInfo(svc(), team, undefined, new Date('2026-10-15T14:59:00Z')).phase).toBe('agendada')
    expect(votingInfo(svc(), team, undefined, new Date('2026-10-17T14:59:00Z')).phase).toBe('aberta')
    expect(votingInfo(svc(), team, undefined, new Date('2026-10-17T15:00:00Z')).phase).toBe('encerrada')
  })
  it('sem votação: líder escolhe, ensaio ou o líder escolheu direto no evento', () => {
    expect(votingInfo(svc(), { ...team, selectionMode: 'lider' }, undefined).enabled).toBe(false)
    expect(votingInfo(svc({ kind: 'ensaio' }), team, undefined).enabled).toBe(false)
    const lider: SongPoll = { id: 'c1', mode: 'lider', picks: null, opensAt: null, closesAt: null, appliedAt: null, createdBy: null, createdAt: '', updatedAt: '' }
    expect(votingInfo(svc(), team, lider).enabled).toBe(false)
  })
  it('o líder pode abrir votação num evento mesmo com a equipe no modo "líder escolhe", com 3 músicas e prazo próprio', () => {
    const poll: SongPoll = { id: 'c1', mode: 'votacao', picks: 3, opensAt: '2026-10-20T10:00:00Z', closesAt: '2026-10-22T10:00:00Z', appliedAt: null, createdBy: null, createdAt: '', updatedAt: '' }
    const info = votingInfo(svc(), { ...team, selectionMode: 'lider' }, poll, new Date('2026-10-21T00:00:00Z'))
    expect(info).toMatchObject({ enabled: true, phase: 'aberta', picks: 3, custom: true })
  })
})

describe('músicas que entram e votos por pessoa', () => {
  const poll = (over: Partial<SongPoll> = {}): SongPoll => ({ id: 'c1', mode: 'votacao', picks: null, maxVotes: null, opensAt: null, closesAt: null, appliedAt: null, createdBy: null, createdAt: '', updatedAt: '', ...over })

  it('sem número próprio, cada um vota em tantas quantas entram (como antes)', () => {
    expect(votingInfo(svc(), team, undefined)).toMatchObject({ picks: 2, votes: 2 })
    expect(votingInfo(svc(), team, poll({ picks: 4 }))).toMatchObject({ picks: 4, votes: 4 })
  })

  it('a equipe pode dar mais votos do que músicas: cada um vota em 3, entra 1', () => {
    const t = { ...team, votingPicks: 1, votingVotes: 3 }
    expect(votingInfo(svc(), t, undefined)).toMatchObject({ picks: 1, votes: 3 })
    // O evento pode ter os próprios números.
    expect(votingInfo(svc(), t, poll({ maxVotes: 1 }))).toMatchObject({ picks: 1, votes: 1, custom: true })
    expect(votingInfo(svc(), t, poll({ picks: 2 }))).toMatchObject({ picks: 2, votes: 3 })
  })

  it('a apuração escolhe só as que entram, mesmo com vários votos por pessoa', () => {
    const s = [sug('a', 's1', 'ana', '2026-10-15T16:00:00Z'), sug('b', 's2', 'bia', '2026-10-15T17:00:00Z'), sug('c', 's3', 'caio', '2026-10-15T18:00:00Z')]
    // Cada um votou em 3 (ou 2): s2 tem 3 votos, s1 e s3 têm 2.
    const v = [vote('ana', 's1'), vote('ana', 's2'), vote('ana', 's3'), vote('bia', 's2'), vote('bia', 's3'), vote('caio', 's2'), vote('caio', 's1')]
    expect(winners(tally('c1', s, v), 1).map((c) => c.songId)).toEqual(['s2'])
  })

  it('a regra em uma frase', () => {
    expect(votingRule(3, 1)).toBe('Cada um tem 3 votos · a mais votada entra no setlist.')
    expect(votingRule(1, 2)).toBe('Cada um tem 1 voto · as 2 mais votadas entram no setlist.')
    expect(votingRule(2, 2)).toBe('Escolha até 2 músicas: as 2 mais votadas entram no setlist.')
    expect(votingRule(1, 1)).toBe('Escolha até 1 música: a mais votada entra no setlist.')
  })
})

describe('apuração', () => {
  const suggestions = [sug('a', 's1', 'ana', '2026-10-15T16:00:00Z'), sug('b', 's2', 'bia', '2026-10-15T17:00:00Z'), sug('c', 's3', 'caio', '2026-10-15T18:00:00Z'), sug('d', 's2', 'dani', '2026-10-16T10:00:00Z')]
  const votes = [vote('ana', 's2'), vote('bia', 's2'), vote('bia', 's3'), vote('caio', 's1'), vote('caio', 's1')]

  it('conta um voto por pessoa e ordena por votos e pela sugestão mais antiga', () => {
    const t = tally('c1', suggestions, votes)
    expect(t.map((c) => [c.songId, c.votes])).toEqual([
      ['s2', 2],
      ['s1', 1],
      ['s3', 1],
    ])
    expect(t[0].suggestedBy).toEqual(['bia', 'dani'])
    expect(winners(t, 2).map((c) => c.songId)).toEqual(['s2', 's1'])
    expect(tieAtCutoff(t, 2)).toBe(true)
  })

  it('não conta sugestões recusadas nem de outro evento', () => {
    const t = tally('c1', [...suggestions.slice(0, 2), { ...sug('x', 's9', 'eva', '2026-10-15T10:00:00Z'), status: 'recusada' }, sug('y', 's8', 'eva', '2026-10-15T10:00:00Z', 'c2')], votes)
    expect(t.map((c) => c.songId)).toEqual(['s2', 's1'])
  })

  it('vencedoras entram no fim do setlist sem repetir', () => {
    const items = itemsFromWinners([{ id: 'i1', songId: 's1', key: 'G', moment: null, notes: '' }], winners(tally('c1', suggestions, votes), 2), {})
    expect(items.map((i) => i.songId)).toEqual(['s1', 's2'])
    expect(items[1]).toMatchObject({ id: 'votacao-s2', notes: 'Escolhida na votação' })
  })
})

describe('painel "Para você"', () => {
  const me: Profile = { id: 'lucas', name: 'Lucas Ferreira', role: 'member', functions: ['violao'], color: 'sky', bio: '', createdAt: '', updatedAt: '' }
  const ana: Profile = { ...me, id: 'ana', name: 'Ana Clara', role: 'admin', functions: ['ministro'] }
  const now = new Date('2026-10-16T12:00:00Z')
  const att = (serviceId: string, userId: string, status: Attendance['status'], note = ''): Attendance => ({ id: `${serviceId}:${userId}`, serviceId, userId, status, reason: null, note, markedBy: null, createdAt: '', updatedAt: '' })
  const base = {
    profiles: [me, ana],
    songs: { s1: { id: 's1', title: 'Graça' } as never, s2: { id: 's2', title: 'Fonte' } as never },
    polls: {},
    team,
    now,
  }

  it('lembra da escala, de confirmar presença e de votar — chamando pelo nome', () => {
    const items = buildInbox({
      ...base,
      me,
      services: [svc({ team: [{ userId: 'lucas', role: 'violao' }] }), svc({ id: 'e1', kind: 'ensaio', title: 'Ensaio', date: '2026-10-22', time: '20:00' })],
      attendance: [],
      suggestions: [sug('a', 's1', 'ana', '2026-10-15T16:00:00Z')],
      votes: [],
      announcements: [],
    })
    const kinds = items.map((i) => i.kind)
    expect(kinds).toContain('escala')
    expect(kinds).toContain('votar')
    expect(kinds).toContain('ensaio')
    expect(items.find((i) => i.kind === 'escala')?.title).toMatch(/^Lucas, você está na escala/)
    expect(items.find((i) => i.kind === 'escala')?.confirm).toEqual({ serviceId: 'c1' })
    expect(items.find((i) => i.kind === 'votar')?.visual?.type).toBe('countdown')
  })

  it('avisos do líder só para quem é do público escolhido', () => {
    const announcement = (id: string, audience: string[]) => ({ id, title: id, body: '', icon: 'mic', color: 'rose' as const, audience, pinned: false, endsOn: null, createdBy: 'ana', createdAt: '', updatedAt: '' })
    const items = buildInbox({ ...base, me, services: [], attendance: [], suggestions: [], votes: [], announcements: [announcement('todos', []), announcement('violao', ['role:violao']), announcement('vozes', ['role:vocal']), announcement('so-lucas', ['user:lucas'])] })
    expect(items.filter((i) => i.kind === 'aviso').map((i) => i.title).sort()).toEqual(['so-lucas', 'todos', 'violao'])
  })

  it('parabeniza a frequência alta e acolhe a baixa', () => {
    const past = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'].map((date, i) => svc({ id: `p${i}`, date, team: [{ userId: 'lucas', role: 'violao' }] }))
    const good = buildInbox({ ...base, me, services: past, attendance: past.map((p) => att(p.id, 'lucas', 'presente')), suggestions: [], votes: [], announcements: [] })
    expect(good.find((i) => i.kind === 'frequencia-alta')).toMatchObject({ title: 'Lucas, 100% de presença! 🔥', visual: { type: 'ring', value: 1 } })
    const low = buildInbox({ ...base, me, services: past, attendance: past.map((p, i) => att(p.id, 'lucas', i === 0 ? 'presente' : 'ausente')), suggestions: [], votes: [], announcements: [] })
    expect(low.find((i) => i.kind === 'frequencia-baixa')?.title).toBe('Sentimos sua falta, Lucas 💜')
    expect(low.find((i) => i.kind === 'justificar')).toBeTruthy()
  })

  it('o líder vê quem avisou ausência na escala', () => {
    const s = svc({ team: [{ userId: 'lucas', role: 'violao' }] })
    const items = buildInbox({ ...base, me: ana, services: [s], attendance: [att('c1', 'lucas', 'ausente', 'Plantão')], suggestions: [], votes: [], announcements: [] })
    expect(items.find((i) => i.kind === 'lider-ausencias')?.title).toMatch(/^Lucas não vai estar/)
  })
})
