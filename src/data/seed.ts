import { addDays, toLocalDateString } from '@/lib/utils'
import { TABLES, type Announcement, type Attendance, type CustomTheme, type DataSnapshot, type Favorite, type Message, type Playlist, type Profile, type Reaction, type Recording, type Service, type SongPoll, type Vote, type Song, type SongPref, type Suggestion } from '@/types'
import { zonedTime } from '@/lib/voting'
import { buildSeedSongs } from './songs'

/**
 * Dados do modo demonstração: uma equipe fictícia de 8 pessoas com cultos, escala,
 * sugestões, playlists e conversa no chat — tudo com datas relativas a hoje.
 */

const iso = (d: Date) => d.toISOString()

function at(base: Date, dayOffset: number, hh: number, mm = 0): Date {
  const d = addDays(base, dayOffset)
  d.setHours(hh, mm, 0, 0)
  return d
}

/** Próximo domingo (hoje, se hoje for domingo). */
function nextSunday(from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  return addDays(d, (7 - d.getDay()) % 7)
}

export const DEMO_MEMBERS: Array<Pick<Profile, 'id' | 'name' | 'role' | 'functions' | 'color' | 'bio'>> = [
  { id: 'demo-ana', name: 'Ana Clara', role: 'admin', functions: ['ministro', 'vocal'], color: 'lavender', bio: 'Líder do ministério. Ama hinos e um bom arranjo de cordas.' },
  { id: 'demo-lucas', name: 'Lucas Ferreira', role: 'member', functions: ['violao', 'backvocal'], color: 'sky', bio: 'Violão e segunda voz.' },
  { id: 'demo-beatriz', name: 'Beatriz Souza', role: 'member', functions: ['teclado'], color: 'mint', bio: 'Teclados e pads.' },
  { id: 'demo-gabriel', name: 'Gabriel Lima', role: 'member', functions: ['bateria'], color: 'butter', bio: '' },
  { id: 'demo-julia', name: 'Júlia Martins', role: 'member', functions: ['vocal', 'ministro'], color: 'rose', bio: 'Ministra no culto de jovens.' },
  { id: 'demo-rafael', name: 'Rafael Costa', role: 'member', functions: ['baixo'], color: 'peach', bio: '' },
  { id: 'demo-mariana', name: 'Mariana Alves', role: 'member', functions: ['backvocal', 'midia'], color: 'orchid', bio: 'Back vocal e projeção.' },
  { id: 'demo-pedro', name: 'Pedro Henrique', role: 'member', functions: ['guitarra'], color: 'coral', bio: '' },
]

export function buildDemoSeed(now = new Date()): DataSnapshot {
  const out = Object.fromEntries(TABLES.map((t) => [t, {}])) as unknown as DataSnapshot
  const created = iso(addDays(now, -60))

  for (const m of DEMO_MEMBERS) out.profiles[m.id] = { ...m, createdAt: created, updatedAt: created }

  const songs: Song[] = buildSeedSongs(now.getTime())
  for (const s of songs) out.songs[s.id] = { ...s, createdBy: 'demo-ana' }
  const key = (id: string) => out.songs[id].teamKey ?? out.songs[id].originalKey

  out.team_settings.team = {
    id: 'team',
    name: 'Ministério de Louvor',
    church: 'Igreja Comunidade da Graça',
    inviteCode: 'LOUVOR2026',
    selectionMode: 'votacao',
    votingPicks: 2,
    timezone: 'America/Sao_Paulo',
    updatedAt: created,
  }

  // ---- Cultos ------------------------------------------------------------
  const sunday = nextSunday(now)
  const date = (offset: number) => toLocalDateString(addDays(sunday, offset))
  const item = (songId: string, moment: string, notes = '') => ({ id: `it-${songId}-${moment}`, songId, key: key(songId), moment, notes })

  const services: Service[] = [
    {
      id: 'svc-celebracao',
      title: 'Consagração',
      date: date(0),
      time: '19:00',
      theme: 'A fidelidade de Deus em todas as estações',
      bibleText: 'Lamentações 3:22-23',
      notes: 'Passagem de som às 17h30. Roupa: tons claros.',
      leaderId: 'demo-ana',
      items: [
        item('ex-celebrai', 'abertura', 'Intro com bateria e baixo, entra todo mundo no refrão.'),
        item('ex-ele-vive', 'louvor'),
        item('ex-tua-bondade', 'louvor', 'Repetir a ponte 2x.'),
        item('ex-santo-es-tu', 'adoracao'),
        item('ex-graca-sem-fim', 'ministracao', 'Seguir a ministração da Ana; só teclado no final.'),
      ],
      team: [
        { userId: 'demo-ana', role: 'ministro' },
        { userId: 'demo-julia', role: 'vocal' },
        { userId: 'demo-mariana', role: 'backvocal' },
        { userId: 'demo-lucas', role: 'violao' },
        { userId: 'demo-beatriz', role: 'teclado' },
        { userId: 'demo-rafael', role: 'baixo' },
        { userId: 'demo-gabriel', role: 'bateria' },
      ],
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -3)),
      updatedAt: iso(addDays(now, -1)),
    },
    {
      id: 'svc-ensaio',
      title: 'Ensaio',
      kind: 'ensaio',
      date: date(-1),
      time: '16:00',
      theme: 'Ensaio do repertório de domingo',
      bibleText: '',
      notes: 'Trazer afinador e cabos reserva.',
      leaderId: 'demo-ana',
      items: [item('ex-celebrai', 'abertura'), item('ex-ele-vive', 'louvor'), item('ex-tua-bondade', 'louvor'), item('ex-santo-es-tu', 'adoracao'), item('ex-graca-sem-fim', 'ministracao')],
      team: [
        { userId: 'demo-ana', role: 'ministro' },
        { userId: 'demo-lucas', role: 'violao' },
        { userId: 'demo-beatriz', role: 'teclado' },
        { userId: 'demo-gabriel', role: 'bateria' },
        { userId: 'demo-rafael', role: 'baixo' },
      ],
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -3)),
      updatedAt: iso(addDays(now, -3)),
    },
    {
      id: 'svc-ceia',
      title: 'Culto de Santa Ceia',
      date: date(7),
      time: '19:00',
      theme: 'Fazei isto em memória de mim',
      bibleText: '1 Coríntios 11:23-26',
      notes: 'As músicas da ministração saem da votação da equipe.',
      leaderId: 'demo-julia',
      items: [item('hino-santo-santo-santo', 'abertura')],
      team: [
        { userId: 'demo-julia', role: 'ministro' },
        { userId: 'demo-lucas', role: 'violao' },
        { userId: 'demo-beatriz', role: 'teclado' },
      ],
      createdBy: 'demo-julia',
      createdAt: iso(addDays(now, -2)),
      updatedAt: iso(addDays(now, -2)),
    },
    {
      id: 'svc-passado-1',
      title: 'Culto de Domingo',
      date: date(-7),
      time: '19:00',
      theme: 'Eis-me aqui: o chamado de Isaías',
      bibleText: 'Isaías 6:1-8',
      notes: '',
      leaderId: 'demo-julia',
      items: [item('ex-celebrai', 'abertura'), item('ex-firme-estou', 'louvor'), item('ex-rei-dos-reis', 'adoracao'), item('ex-eis-me-aqui', 'ministracao')],
      team: [
        { userId: 'demo-julia', role: 'ministro' },
        { userId: 'demo-lucas', role: 'violao' },
        { userId: 'demo-gabriel', role: 'bateria' },
        { userId: 'demo-pedro', role: 'guitarra' },
      ],
      createdBy: 'demo-julia',
      createdAt: iso(addDays(now, -12)),
      updatedAt: iso(addDays(now, -8)),
    },
    {
      id: 'svc-passado-2',
      title: 'Culto de Libertação',
      date: date(-11),
      time: '20:00',
      theme: 'Buscando a face de Deus',
      bibleText: '2 Crônicas 7:14',
      notes: '',
      leaderId: 'demo-ana',
      items: [item('ex-clamor', 'oracao'), item('ex-sopra-espirito', 'ministracao'), item('ex-fonte-de-cura', 'ministracao')],
      team: [
        { userId: 'demo-ana', role: 'ministro' },
        { userId: 'demo-beatriz', role: 'teclado' },
      ],
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -15)),
      updatedAt: iso(addDays(now, -12)),
    },
    {
      id: 'svc-passado-3',
      title: 'Culto de Domingo',
      date: date(-14),
      time: '19:00',
      theme: 'Firmes na Rocha',
      bibleText: 'Mateus 7:24-27',
      notes: '',
      leaderId: 'demo-ana',
      items: [item('ex-vitoria', 'abertura'), item('ex-firme-estou', 'louvor'), item('ex-amor-de-pai', 'adoracao'), item('ex-amanhecer', 'ministracao')],
      team: [
        { userId: 'demo-ana', role: 'ministro' },
        { userId: 'demo-lucas', role: 'violao' },
        { userId: 'demo-rafael', role: 'baixo' },
        { userId: 'demo-gabriel', role: 'bateria' },
      ],
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -19)),
      updatedAt: iso(addDays(now, -15)),
    },
  ]
  // Outros tipos de evento na programação
  services.push(
    {
      id: 'svc-congresso',
      title: 'Congresso de Jovens',
      kind: 'congresso',
      date: date(20),
      time: '19:30',
      theme: 'Geração que adora',
      bibleText: 'Salmos 145:4',
      notes: 'Três noites. Repertório mais animado.',
      leaderId: 'demo-julia',
      items: [],
      team: [
        { userId: 'demo-julia', role: 'ministro' },
        { userId: 'demo-pedro', role: 'guitarra' },
        { userId: 'demo-gabriel', role: 'bateria' },
      ],
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -1)),
      updatedAt: iso(addDays(now, -1)),
    },
    {
      id: 'svc-confra',
      title: 'Reunião do ministério',
      kind: 'reuniao',
      date: date(13),
      time: '12:00',
      theme: 'Planejamento do trimestre',
      bibleText: '',
      notes: 'Depois do culto, na sala do ministério',
      leaderId: 'demo-ana',
      items: [],
      team: [],
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -5)),
      updatedAt: iso(addDays(now, -5)),
    },
  )
  for (const s of services) out.services[s.id] = s

  // ---- Sugestões e apoios ---------------------------------------------------
  const suggestions: Suggestion[] = [
    {
      id: 'sug-1',
      songId: 'ex-fonte-de-cura',
      serviceId: 'svc-celebracao',
      userId: 'demo-julia',
      note: 'Acho que conversa muito com a mensagem. Poderia entrar na ministração 🙏',
      status: 'pendente',
      createdAt: iso(at(now, 0, 10, 30)),
      updatedAt: iso(at(now, 0, 10, 30)),
    },
    {
      id: 'sug-2',
      songId: 'ex-vitoria',
      serviceId: 'svc-celebracao',
      userId: 'demo-pedro',
      note: 'Pra fechar o culto lá em cima!',
      status: 'pendente',
      createdAt: iso(at(now, -1, 21, 5)),
      updatedAt: iso(at(now, -1, 21, 5)),
    },
    {
      id: 'sug-3',
      songId: 'ex-graca-sem-fim',
      serviceId: 'svc-ceia',
      userId: 'demo-lucas',
      note: 'Fica linda depois da ceia, só voz e violão.',
      status: 'pendente',
      createdAt: iso(at(now, -1, 18, 40)),
      updatedAt: iso(at(now, -1, 18, 40)),
    },
    {
      id: 'sug-4',
      songId: 'ex-amor-de-pai',
      serviceId: null,
      userId: 'demo-beatriz',
      note: 'Pra algum culto em breve — o pessoal da célula pediu.',
      status: 'pendente',
      createdAt: iso(at(now, -2, 15, 0)),
      updatedAt: iso(at(now, -2, 15, 0)),
    },
  ]
  for (const s of suggestions) out.suggestions[s.id] = s

  const reactions: Reaction[] = []
  const react = (targetType: Reaction['targetType'], targetId: string, userId: string, emoji: string, when: Date) =>
    reactions.push({ id: `${targetType}:${targetId}:${userId}:${emoji}`, targetType, targetId, userId, emoji, createdAt: iso(when) })
  react('suggestion', 'sug-1', 'demo-ana', '👍', at(now, 0, 11))
  react('suggestion', 'sug-1', 'demo-mariana', '👍', at(now, 0, 11, 20))
  react('suggestion', 'sug-2', 'demo-gabriel', '👍', at(now, -1, 21, 30))
  react('suggestion', 'sug-3', 'demo-beatriz', '👍', at(now, -1, 19))

  // ---- Chat ------------------------------------------------------------------
  const messages: Message[] = [
    { id: 'msg-1', userId: 'demo-ana', text: 'Paz, pessoal! O setlist de domingo já está no app. Deem uma olhada e sugiram se sentirem algo 🙌', songId: null, serviceId: 'svc-celebracao', createdAt: iso(at(now, -1, 20, 10)), editedAt: null },
    { id: 'msg-2', userId: 'demo-lucas', text: 'Show! Vou passar “Tua Bondade” em A, no tom da Ana.', songId: null, serviceId: null, createdAt: iso(at(now, -1, 20, 14)), editedAt: null },
    { id: 'msg-3', userId: 'demo-beatriz', text: 'Essa aqui no tom da equipe fica linda no piano 🎹', songId: 'ex-santo-es-tu', serviceId: null, createdAt: iso(at(now, -1, 20, 21)), editedAt: null },
    { id: 'msg-4', userId: 'demo-gabriel', text: 'Ensaio sábado 16h confirmado?', songId: null, serviceId: null, createdAt: iso(at(now, 0, 9, 2)), editedAt: null },
    { id: 'msg-5', userId: 'demo-ana', text: 'Confirmado! 16h em ponto ⏰ Quem puder chegar 15h45 ajuda a montar o som.', songId: null, serviceId: null, createdAt: iso(at(now, 0, 9, 15)), editedAt: null },
    { id: 'msg-6', userId: 'demo-julia', text: 'Sugeri “Fonte de Cura” pra ministração, acho que conversa com a mensagem 💜', songId: null, serviceId: null, createdAt: iso(at(now, 0, 10, 31)), editedAt: null },
  ]
  // Mensagens não podem estar no futuro (se "agora" for de madrugada, puxa para ontem).
  for (const m of messages) {
    if (new Date(m.createdAt) > now) m.createdAt = iso(addDays(new Date(m.createdAt), -1))
    out.messages[m.id] = m
  }
  react('message', 'msg-1', 'demo-lucas', '🙏', at(now, -1, 20, 12))
  react('message', 'msg-1', 'demo-gabriel', '🙏', at(now, -1, 20, 30))
  react('message', 'msg-1', 'demo-julia', '❤️', at(now, -1, 20, 40))
  react('message', 'msg-3', 'demo-ana', '❤️', at(now, -1, 20, 25))
  react('message', 'msg-5', 'demo-rafael', '👍', at(now, 0, 9, 20))
  for (const r of reactions) out.reactions[r.id] = r

  // ---- Playlists ----------------------------------------------------------------
  const playlists: Playlist[] = [
    { id: 'pl-ceia', name: 'Santa Ceia', description: 'Músicas para o momento da ceia.', color: 'rose', ownerId: 'demo-lucas', isShared: true, songIds: ['ex-no-calvario', 'ex-graca-sem-fim', 'ex-amor-de-pai', 'hino-santo-santo-santo'], createdAt: created, updatedAt: created },
    { id: 'pl-abertura', name: 'Pra abrir o culto', description: 'Animadas, conhecidas e fáceis de cantar.', color: 'butter', ownerId: 'demo-ana', isShared: true, songIds: ['ex-celebrai', 'ex-ele-vive', 'ex-vitoria', 'ex-ide'], createdAt: created, updatedAt: created },
    { id: 'pl-natal', name: 'Cantata de Natal', description: 'Repertório para dezembro.', color: 'mint', ownerId: 'demo-mariana', isShared: true, songIds: ['ex-noite-santa', 'hino-doxologia'], createdAt: created, updatedAt: created },
    { id: 'pl-devocional', name: 'Meu devocional', description: 'Para ouvir e orar durante a semana.', color: 'lavender', ownerId: 'demo-ana', isShared: false, songIds: ['ex-amanhecer', 'ex-fonte-de-cura', 'ex-santo-es-tu'], createdAt: created, updatedAt: created },
  ]
  for (const p of playlists) out.playlists[p.id] = p

  // ---- Favoritas e preferências ------------------------------------------------------
  const favs: Array<[string, string]> = [
    ['demo-ana', 'ex-santo-es-tu'],
    ['demo-ana', 'ex-graca-sem-fim'],
    ['demo-ana', 'hino-santo-santo-santo'],
    ['demo-ana', 'ex-tua-bondade'],
    ['demo-lucas', 'ex-tua-bondade'],
    ['demo-lucas', 'ex-vitoria'],
    ['demo-beatriz', 'ex-santo-es-tu'],
    ['demo-beatriz', 'ex-amor-de-pai'],
    ['demo-julia', 'ex-fonte-de-cura'],
    ['demo-julia', 'ex-santo-es-tu'],
    ['demo-gabriel', 'ex-celebrai'],
    ['demo-pedro', 'ex-vitoria'],
    ['demo-mariana', 'ex-graca-sem-fim'],
  ]
  for (const [userId, songId] of favs) {
    const f: Favorite = { id: `${userId}:${songId}`, userId, songId, createdAt: created }
    out.favorites[f.id] = f
  }
  const prefs: SongPref[] = [
    { id: 'demo-lucas:ex-vitoria', userId: 'demo-lucas', songId: 'ex-vitoria', key: null, capo: 2, updatedAt: created },
    { id: 'demo-julia:ex-santo-es-tu', userId: 'demo-julia', songId: 'ex-santo-es-tu', key: 'C', capo: null, updatedAt: created },
  ]
  for (const p of prefs) out.song_prefs[p.id] = p

  // ---- Presença ------------------------------------------------------------------------
  const presence: Array<[string, string, Attendance['status'], string | null, string]> = [
    ['svc-passado-1', 'demo-julia', 'presente', null, ''],
    ['svc-passado-1', 'demo-lucas', 'presente', null, ''],
    ['svc-passado-1', 'demo-gabriel', 'ausente', 'saude', 'Gripado, avisei no grupo na sexta.'],
    ['svc-passado-1', 'demo-pedro', 'presente', null, ''],
    ['svc-passado-2', 'demo-ana', 'presente', null, ''],
    ['svc-passado-2', 'demo-beatriz', 'presente', null, ''],
    ['svc-passado-3', 'demo-ana', 'presente', null, ''],
    ['svc-passado-3', 'demo-lucas', 'presente', null, ''],
    ['svc-passado-3', 'demo-rafael', 'ausente', null, ''],
    ['svc-passado-3', 'demo-gabriel', 'presente', null, ''],
    ['svc-ensaio', 'demo-ana', 'confirmado', null, ''],
    ['svc-ensaio', 'demo-lucas', 'confirmado', null, ''],
    ['svc-ensaio', 'demo-gabriel', 'confirmado', null, ''],
    ['svc-celebracao', 'demo-lucas', 'confirmado', null, ''],
    ['svc-celebracao', 'demo-beatriz', 'confirmado', null, ''],
    ['svc-celebracao', 'demo-rafael', 'ausente', 'viagem', 'Viagem a trabalho, volto na segunda. Já falei com o Pedro para cobrir o baixo.'],
  ]
  for (const [serviceId, userId, status, reason, note] of presence) {
    if (!out.services[serviceId]) continue
    const svc = out.services[serviceId]
    const markedBy = status === 'presente' || (status === 'ausente' && !note) ? svc.leaderId : userId
    const a: Attendance = { id: `${serviceId}:${userId}`, serviceId, userId, status, reason, note, markedBy, createdAt: svc.updatedAt, updatedAt: svc.updatedAt }
    out.attendance[a.id] = a
  }

  // ---- Gravações de ensaio (áudio sintetizado no aparelho) ----------------------------------
  const rec = (id: string, title: string, chords: string, bpm: number, serviceId: string | null, songId: string | null, by: string, daysAgo: number): Recording => ({
    id,
    title,
    serviceId,
    songId,
    storagePath: `exemplo/${chords}@${bpm}.wav`,
    mimeType: 'audio/wav',
    durationSec: Math.round((8 * 4 * 60) / bpm + 1.5),
    sizeBytes: null,
    createdBy: by,
    createdAt: iso(at(now, -daysAgo, 17, 10)),
    updatedAt: iso(at(now, -daysAgo, 17, 10)),
  })
  const recordings = [
    rec('rec-1', 'Ensaio geral · Celebrai', 'G-C-Em-D', 128, 'svc-passado-1', 'ex-celebrai', 'demo-julia', 8),
    rec('rec-2', 'Voz e violão · Tua Bondade', 'A-E-F#m-D', 72, null, 'ex-tua-bondade', 'demo-lucas', 3),
    rec('rec-3', 'Passagem de som · Santo És Tu', 'E-B-C#m-A', 68, 'svc-passado-3', 'ex-santo-es-tu', 'demo-ana', 15),
  ]
  for (const r of recordings) if (!r.songId || out.songs[r.songId]) out.recordings[r.id] = r

  // ---- Votação aberta para a Santa Ceia ------------------------------------------------------
  // Prazo personalizado (aberta "agora" em qualquer dia em que o demo for aberto).
  const poll: SongPoll = {
    id: 'svc-ceia',
    mode: 'votacao',
    picks: 2,
    // Abriu ontem às 12h e fecha daqui a dois dias às 12h (horário de Brasília).
    opensAt: iso(zonedTime(toLocalDateString(addDays(now, -1)), 12, 0)),
    closesAt: iso(zonedTime(toLocalDateString(addDays(now, 2)), 12, 0)),
    appliedAt: null,
    createdBy: 'demo-ana',
    createdAt: iso(addDays(now, -2)),
    updatedAt: iso(addDays(now, -2)),
  }
  out.song_polls[poll.id] = poll
  const ceiaSuggestions: Array<[string, string, string, string, number]> = [
    ['sug-5', 'ex-no-calvario', 'demo-julia', 'Para o momento do pão e do cálice.', -30],
    ['sug-6', 'hino-santo-santo-santo', 'demo-mariana', 'Um hino para abrir com reverência.', -26],
    ['sug-7', 'ex-amor-de-pai', 'demo-beatriz', '', -20],
  ]
  for (const [id, songId, userId, note, hours] of ceiaSuggestions) {
    if (!out.songs[songId]) continue
    const when = iso(new Date(now.getTime() + hours * 3600_000))
    out.suggestions[id] = { id, songId, serviceId: 'svc-ceia', userId, note, status: 'pendente', createdAt: when, updatedAt: when }
  }
  const ballots: Array<[string, string[]]> = [
    ['demo-lucas', ['ex-graca-sem-fim', 'ex-no-calvario']],
    ['demo-julia', ['ex-no-calvario', 'ex-amor-de-pai']],
    ['demo-mariana', ['hino-santo-santo-santo', 'ex-no-calvario']],
    ['demo-gabriel', ['ex-graca-sem-fim']],
    ['demo-beatriz', ['ex-amor-de-pai', 'ex-graca-sem-fim']],
  ]
  for (const [userId, songIds] of ballots)
    for (const songId of songIds) {
      if (!out.songs[songId]) continue
      const v: Vote = { id: `svc-ceia:${userId}:${songId}`, serviceId: 'svc-ceia', userId, songId, createdAt: iso(new Date(now.getTime() - 5 * 3600_000)) }
      out.votes[v.id] = v
    }

  // ---- Avisos do líder ---------------------------------------------------------------------
  const announcements: Announcement[] = [
    {
      id: 'aviso-ensaio',
      title: 'Ensaio geral na quinta, 20h',
      body: 'Vamos passar o repertório da Santa Ceia. Quem puder chegar 19h45 ajuda a montar o som 🙏',
      icon: 'megaphone',
      color: 'butter',
      audience: [],
      pinned: true,
      endsOn: toLocalDateString(addDays(now, 6)),
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -1)),
      updatedAt: iso(addDays(now, -1)),
    },
    {
      id: 'aviso-vozes',
      title: 'Vozes: aquecimento às 18h no domingo',
      body: 'Vamos aquecer juntos na sala 3 antes da passagem de som.',
      icon: 'mic',
      color: 'rose',
      audience: ['role:vocal', 'role:backvocal', 'role:ministro'],
      pinned: false,
      endsOn: toLocalDateString(addDays(now, 2)),
      createdBy: 'demo-ana',
      createdAt: iso(addDays(now, -1)),
      updatedAt: iso(addDays(now, -1)),
    },
  ]
  for (const a of announcements) out.announcements[a.id] = a

  // ---- Tema criado pela equipe --------------------------------------------------------------
  const youth: CustomTheme = {
    id: 'tema-juventude',
    name: 'Juventude & Chamado',
    description: 'Propósito, identidade e chamado — para cultos de jovens.',
    icon: 'flame',
    color: 'coral',
    keywords: ['jovem', 'jovens', 'juventude', 'geracao', 'chamado', 'proposito', 'identidade', 'eis-me aqui'],
    createdBy: 'demo-julia',
    createdAt: created,
    updatedAt: created,
  }
  out.custom_themes[youth.id] = youth
  if (out.songs['ex-eis-me-aqui']) out.songs['ex-eis-me-aqui'].themes = [...out.songs['ex-eis-me-aqui'].themes, youth.id]

  return out
}
