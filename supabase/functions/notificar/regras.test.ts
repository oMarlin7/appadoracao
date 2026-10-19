import { describe, expect, it } from 'vitest'
import { eventKind as appEventKind } from '@/lib/events'
import { announcementForMe } from '@/lib/inbox'
import { ROLES } from '@/lib/taxonomy'
import { votingInfo } from '@/lib/voting'
import type { Service, SongPoll } from '@/types'
import { announcementFor, clock, dayLabel, eventKind, planejar, ROLE_NAMES, setlistSignature, votingWindow, type ProfileRow, type ServiceRow, type State } from './regras'

const ana: ProfileRow = { id: 'ana', name: 'Ana Souza', functions: ['vocal'], notify_prefs: null }
const bia: ProfileRow = { id: 'bia', name: 'Bia', functions: ['teclado'], notify_prefs: {} }
const caio: ProfileRow = { id: 'caio', name: 'Caio Lima', functions: ['violao'], notify_prefs: { escala: false, setlist: false } }

const svc = (over: Partial<ServiceRow> = {}): ServiceRow => ({
  id: 'c1',
  title: 'Culto de Domingo',
  kind: 'culto',
  date: '2026-11-01',
  time: '19:00',
  notes: '',
  items: [],
  team: [],
  updated_at: '2026-10-01T12:00:00Z',
  ...over,
})

/** Horário de Brasília (UTC−3) */
const br = (day: string, hm: string) => new Date(`${day}T${hm}:00-03:00`)

const state = (over: Partial<State> = {}): State => ({
  now: br('2026-10-20', '10:00'),
  team: { selection_mode: 'lider', voting_picks: 2, timezone: 'America/Sao_Paulo' },
  profiles: [ana, bia, caio],
  services: [],
  polls: [],
  votes: [],
  suggested: new Set(),
  songTitles: new Map([
    ['s1', 'Galileu'],
    ['s2', 'Lugar Secreto'],
    ['s3', 'Ousado Amor'],
  ]),
  announcements: [],
  setlistNotified: new Set(),
  ...over,
})

describe('mesmas regras do app', () => {
  it('janela da votação igual à do app em qualquer dia', () => {
    const team = { selection_mode: 'votacao', voting_picks: 3, timezone: 'America/Sao_Paulo' }
    const poll: SongPoll = { id: 'x', mode: 'votacao', picks: 4, opensAt: '2026-10-01T10:00:00Z', closesAt: '2026-10-02T10:00:00Z', appliedAt: null, createdBy: null, createdAt: '', updatedAt: '' }
    for (let i = 0; i < 400; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
      for (const kind of ['culto', 'ensaio', null] as const) {
        for (const p of [undefined, poll]) {
          const row = svc({ date, kind, title: kind ? 'Evento' : 'Ensaio geral' })
          const app = votingInfo({ id: row.id, date, kind: kind ?? undefined, title: row.title } as Service, { selectionMode: 'votacao', votingPicks: 3, timezone: 'America/Sao_Paulo' }, p)
          const fn = votingWindow(row, team, p && { id: p.id, mode: p.mode, picks: p.picks, opens_at: p.opensAt, closes_at: p.closesAt, applied_at: p.appliedAt })
          expect([fn.enabled, fn.opensAt.getTime(), fn.closesAt.getTime(), fn.picks]).toEqual([app.enabled, app.opensAt.getTime(), app.closesAt.getTime(), app.picks])
        }
      }
    }
  })

  it('tipo do evento, funções e público dos avisos iguais aos do app', () => {
    for (const title of ['Ensaio geral', 'Passagem de som', 'Reunião do ministério', 'Confraternização', 'Culto de Domingo', 'ENSAIO'])
      expect(eventKind({ kind: null, title })).toBe(appEventKind({ title }))
    expect(Object.keys(ROLE_NAMES).sort()).toEqual(ROLES.map((r) => r.id).sort())
    for (const r of ROLES) expect(ROLE_NAMES[r.id]).toBe(r.name)
    for (const audience of [[], ['role:vocal'], ['user:bia'], ['role:baixo', 'user:caio']])
      for (const p of [ana, bia, caio]) expect(announcementFor({ audience }, p)).toBe(announcementForMe({ audience }, { id: p.id, functions: p.functions ?? [] }))
  })
})

describe('textos', () => {
  it('horas e dias', () => {
    expect(clock('19:00')).toBe('19h')
    expect(clock('19:30')).toBe('19h30')
    expect(clock(null)).toBe('')
    expect(dayLabel('2026-10-20', '2026-10-20')).toBe('hoje')
    expect(dayLabel('2026-10-21', '2026-10-20')).toBe('amanhã')
    expect(dayLabel('2026-11-01', '2026-10-20')).toBe('domingo, 01/11')
  })
})

describe('escala', () => {
  const s = state({ services: [svc({ team: [{ userId: 'ana', role: 'vocal' }, { userId: 'caio', role: 'violao' }, { userId: 'sumiu', role: 'baixo' }] })] })

  it('avisa quem entrou na escala, pelo nome, com a função', () => {
    const n = planejar(s).filter((x) => x.kind === 'escala')
    expect(n.map((x) => x.key)).toEqual(['escala:c1:ana'])
    expect(n[0].recipients[0].payload).toMatchObject({
      title: 'Ana, você está na escala',
      body: 'Culto de Domingo · domingo, 01/11 às 19h · Vocal. Toque para confirmar presença.',
      url: '/cultos/c1',
      image: '/notificacoes/escala.jpg',
    })
  })

  it('não avisa à noite (chega às 7h), nem eventos passados ou ensaios', () => {
    expect(planejar({ ...s, now: br('2026-10-20', '23:10') })).toEqual([])
    expect(planejar({ ...s, now: br('2026-10-20', '06:59') })).toEqual([])
    expect(planejar({ ...s, now: br('2026-10-20', '07:00') }).length).toBeGreaterThan(0)
    expect(planejar({ ...s, now: br('2026-10-20', '23:10') }, { ignoreQuiet: true }).length).toBeGreaterThan(0)
    expect(planejar({ ...s, services: [svc({ date: '2026-10-19', team: [{ userId: 'ana', role: 'vocal' }] })] })).toEqual([])
    expect(planejar({ ...s, services: [svc({ kind: 'ensaio', team: [{ userId: 'ana', role: 'vocal' }] })] }).filter((x) => x.kind === 'escala')).toEqual([])
  })
})

describe('votação', () => {
  // Culto em 01/11 (domingo): abre quinta 22/10 12h, fecha sábado 24/10 12h.
  const base = state({ team: { selection_mode: 'votacao', voting_picks: 3, timezone: 'America/Sao_Paulo' }, services: [svc()] })

  it('avisa todos quando abre', () => {
    expect(planejar({ ...base, now: br('2026-10-22', '11:59') }).filter((x) => x.kind === 'votacao')).toEqual([])
    const n = planejar({ ...base, now: br('2026-10-22', '12:01') }).filter((x) => x.kind === 'votacao')
    expect(n).toHaveLength(1)
    expect(n[0].key).toBe(`votacao:c1:${br('2026-10-22', '12:00').toISOString()}`)
    expect(n[0].recipients.map((r) => r.userId)).toEqual(['ana', 'bia', 'caio'])
    expect(n[0].recipients[1].payload.body).toBe('Bia, escolha até 3 músicas para o Culto de Domingo (01/11). Fecha sábado, 24/10 às 12h.')
    // Muito depois de abrir não avisa mais (o app já mostra a votação)
    expect(planejar({ ...base, now: br('2026-10-23', '09:00') }).filter((x) => x.kind === 'votacao')).toEqual([])
  })

  it('nas últimas 2 horas lembra só quem não votou, se houver sugestões', () => {
    const now = br('2026-10-24', '10:30')
    expect(planejar({ ...base, now }).filter((x) => x.kind === 'votacao')).toEqual([])
    const n = planejar({ ...base, now, suggested: new Set(['c1']), votes: [{ service_id: 'c1', user_id: 'ana' }] }).filter((x) => x.kind === 'votacao')
    expect(n.map((x) => x.recipients[0].userId)).toEqual(['bia', 'caio'])
    expect(n[0].recipients[0].payload).toMatchObject({ title: 'Últimas horas para votar', image: '/notificacoes/votacao-fim.jpg' })
    expect(n[0].recipients[0].payload.body).toContain('fecha hoje às 12h')
    expect(planejar({ ...base, now: br('2026-10-24', '09:59'), suggested: new Set(['c1']) }).filter((x) => x.kind === 'votacao')).toEqual([])
  })

  it('não avisa quando o líder escolhe ou quando o resultado já foi aplicado', () => {
    const now = br('2026-10-22', '12:01')
    expect(planejar({ ...base, now, team: { ...base.team, selection_mode: 'lider' } }).filter((x) => x.kind === 'votacao')).toEqual([])
    const applied = { id: 'c1', mode: 'votacao' as const, picks: null, opens_at: null, closes_at: null, applied_at: '2026-10-22T15:00:00Z' }
    expect(planejar({ ...base, now, polls: [applied] }).filter((x) => x.kind === 'votacao')).toEqual([])
  })
})

describe('setlist', () => {
  const items = [{ songId: 's1' }, { songId: 's2' }]

  it('espera 10 minutos sem mexer e avisa com as músicas', () => {
    const fresh = state({ now: br('2026-10-20', '10:00'), services: [svc({ items, updated_at: br('2026-10-20', '09:55').toISOString() })] })
    expect(planejar(fresh).filter((x) => x.kind === 'setlist')).toEqual([])
    const n = planejar({ ...fresh, now: br('2026-10-20', '10:06') }).filter((x) => x.kind === 'setlist')
    expect(n[0].key).toBe(`setlist:c1:${setlistSignature(items)}`)
    expect(n[0].recipients.map((r) => r.userId)).toEqual(['ana', 'bia'])
    expect(n[0].recipients[0].payload).toMatchObject({ title: 'Setlist pronto · Culto de Domingo', body: 'Domingo, 01/11 às 19h: Galileu · Lugar Secreto' })
  })

  it('"atualizado" quando muda de novo; vai só para a escala, se houver', () => {
    const s = state({ setlistNotified: new Set(['c1']), services: [svc({ items, team: [{ userId: 'bia', role: 'teclado' }] })] })
    const n = planejar(s).filter((x) => x.kind === 'setlist')
    expect(n[0].recipients.map((r) => r.userId)).toEqual(['bia'])
    expect(n[0].recipients[0].payload.title).toBe('Setlist atualizado · Culto de Domingo')
  })

  it('a assinatura muda com a ordem', () => {
    expect(setlistSignature(items)).not.toBe(setlistSignature([...items].reverse()))
    expect(setlistSignature(items)).toBe(setlistSignature([{ songId: 's1' }, { songId: 's2' }]))
  })
})

describe('ensaio', () => {
  const ensaio = svc({ id: 'e1', kind: 'ensaio', title: 'Ensaio', date: '2026-10-22', time: '19:30', items: [{ songId: 's3' }] })

  it('no dia, 4 horas antes, para todos se não houver escala', () => {
    expect(planejar(state({ now: br('2026-10-22', '15:29'), services: [ensaio] })).filter((x) => x.kind === 'ensaio')).toEqual([])
    const n = planejar(state({ now: br('2026-10-22', '15:31'), services: [ensaio] })).filter((x) => x.kind === 'ensaio')
    expect(n[0].key).toBe('ensaio:e1')
    expect(n[0].recipients[0].payload).toMatchObject({ title: 'Ensaio hoje às 19h30', body: 'Ana, repertório: Ousado Amor.', image: '/notificacoes/ensaio.jpg' })
    expect(planejar(state({ now: br('2026-10-22', '19:31'), services: [ensaio] })).filter((x) => x.kind === 'ensaio')).toEqual([])
  })

  it('sem horário, às 9h', () => {
    const s = state({ services: [{ ...ensaio, time: null, items: [] }] })
    expect(planejar({ ...s, now: br('2026-10-22', '08:59') }).filter((x) => x.kind === 'ensaio')).toEqual([])
    const n = planejar({ ...s, now: br('2026-10-22', '09:00') }).filter((x) => x.kind === 'ensaio')
    expect(n[0].recipients[0].payload).toMatchObject({ title: 'Ensaio hoje', body: 'Ana, revise as cifras antes de ir.' })
  })
})

describe('avisos do líder', () => {
  const aviso = { id: 'a1', title: 'Ensaio extra no sábado', body: 'Vozes às 15h.', audience: ['role:vocal'], ends_on: null, created_by: 'bia', created_at: br('2026-10-20', '09:00').toISOString() }

  it('chega só para quem foi escolhido, nunca para quem escreveu', () => {
    const n = planejar(state({ announcements: [aviso, { ...aviso, id: 'a2', audience: [] }] })).filter((x) => x.kind === 'avisos')
    expect(n.map((x) => [x.key, x.recipients.map((r) => r.userId)])).toEqual([
      ['aviso:a1', ['ana']],
      ['aviso:a2', ['ana', 'caio']],
    ])
    expect(n[0].recipients[0].payload).toMatchObject({ title: 'Ensaio extra no sábado', body: 'Vozes às 15h.', image: '/notificacoes/aviso.jpg' })
  })

  it('avisos antigos ou vencidos não são enviados; texto longo é encurtado', () => {
    const old = { ...aviso, created_at: br('2026-10-18', '09:00').toISOString() }
    const ended = { ...aviso, id: 'a3', ends_on: '2026-10-19' }
    const long = { ...aviso, id: 'a4', body: 'x'.repeat(300) }
    const n = planejar(state({ announcements: [old, ended, long] })).filter((x) => x.kind === 'avisos')
    expect(n.map((x) => x.key)).toEqual(['aviso:a4'])
    expect(n[0].recipients[0].payload.body).toHaveLength(178)
  })
})
