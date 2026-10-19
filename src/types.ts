import type { Pastel, Tempo } from './lib/taxonomy'

export type Id = string

export interface Profile {
  id: Id
  name: string
  /** admin = líder (gerencia equipe e código de convite) */
  role: 'admin' | 'member'
  /** Funções no ministério (ids de ROLES: vocal, violao, teclado…) */
  functions: string[]
  color: Pastel
  bio: string
  /** Foto de perfil (imagem pequena já reduzida no aparelho, em data URL). */
  avatarUrl?: string | null
  /** Notificações no celular que a pessoa desligou (o que não está como false fica ligado). */
  notifyPrefs?: Partial<Record<'escala' | 'votacao' | 'setlist' | 'ensaio' | 'avisos', boolean>> | null
  createdAt: string
  updatedAt: string
}

export interface Song {
  id: Id
  title: string
  artist: string
  originalKey: string | null
  /** "Nosso tom": tom em que a equipe toca a música. */
  teamKey: string | null
  bpm: number | null
  timeSignature: string | null
  tempo: Tempo | null
  themes: string[]
  moments: string[]
  tags: string[]
  /** Significado / mensagem da música. */
  meaning: string
  bibleRefs: string[]
  /** Cifra (acordes sobre a letra, estilo Cifra Club, ou ChordPro). */
  content: string
  /** Observações de arranjo da equipe. */
  notes: string
  youtubeUrl: string | null
  spotifyUrl?: string | null
  /** Capa: link da imagem (YouTube/Spotify) ou foto enviada (data URL). Sem capa = arte gerada. */
  coverUrl?: string | null
  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

export interface Favorite {
  id: Id
  userId: Id
  songId: Id
  createdAt: string
}

/** Preferências pessoais por música (tom e capotraste de cada membro). */
export interface SongPref {
  id: Id
  userId: Id
  songId: Id
  key: string | null
  capo: number | null
  updatedAt: string
}

export interface Playlist {
  id: Id
  name: string
  description: string
  color: Pastel
  ownerId: Id
  isShared: boolean
  songIds: Id[]
  createdAt: string
  updatedAt: string
}

export interface SetlistItem {
  id: Id
  songId: Id
  key: string | null
  moment: string | null
  notes: string
}

export interface Assignment {
  userId: Id
  role: string
}

/**
 * Tipo de evento da programação. Apresentações (culto, festa, congresso, especial) são onde
 * a equipe ministra o que ensaiou; ensaio, reunião e confraternização não contam como
 * "próximo evento" nem abrem votação de músicas.
 */
export type EventKind = 'culto' | 'festa' | 'congresso' | 'especial' | 'ensaio' | 'reuniao' | 'confraternizacao'

export interface Service {
  id: Id
  title: string
  /** Antigos (sem tipo) são tratados como culto, ou ensaio pelo título. */
  kind?: EventKind
  /** AAAA-MM-DD (data local, sem fuso) */
  date: string
  /** HH:mm */
  time: string | null
  /** Tema da mensagem / pregação */
  theme: string
  bibleText: string
  notes: string
  leaderId: Id | null
  items: SetlistItem[]
  team: Assignment[]
  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

export type SuggestionStatus = 'pendente' | 'aceita' | 'recusada'

export interface Suggestion {
  id: Id
  songId: Id
  serviceId: Id | null
  userId: Id
  note: string
  status: SuggestionStatus
  createdAt: string
  updatedAt: string
}

export interface Reaction {
  id: Id
  targetType: 'suggestion' | 'message'
  targetId: Id
  userId: Id
  emoji: string
  createdAt: string
}

export interface Message {
  id: Id
  userId: Id
  text: string
  songId: Id | null
  serviceId: Id | null
  createdAt: string
  editedAt: string | null
}

/**
 * Presença num culto/ensaio. Antes do dia o membro confirma ou avisa a ausência (com
 * justificativa); no dia o líder marca quem esteve presente.
 */
export type AttendanceStatus = 'confirmado' | 'presente' | 'ausente'

export interface Attendance {
  /** `${serviceId}:${userId}` — uma linha por membro em cada culto. */
  id: Id
  serviceId: Id
  userId: Id
  status: AttendanceStatus
  /** Motivo da ausência (ids de ABSENCE_REASONS). */
  reason: string | null
  /** Justificativa escrita. */
  note: string
  markedBy: Id | null
  createdAt: string
  updatedAt: string
}

/** Gravação de ensaio (o áudio fica no armazenamento de arquivos). */
export interface Recording {
  id: Id
  title: string
  serviceId: Id | null
  songId: Id | null
  storagePath: string
  mimeType: string
  durationSec: number | null
  sizeBytes: number | null
  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

/** Tema criado pela equipe, além dos temas que já vêm no app. */
export interface CustomTheme {
  id: Id
  name: string
  description: string
  /** Chave de THEME_ICONS. */
  icon: string
  color: Pastel
  /** Palavras que indicam o tema numa letra (para as sugestões automáticas). */
  keywords: string[]
  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

export interface TeamSettings {
  id: 'team'
  name: string
  church: string
  inviteCode: string | null
  /** Como as músicas dos cultos são escolhidas: o líder escolhe ou votação semanal. */
  selectionMode?: 'lider' | 'votacao'
  /** Quantas músicas saem da votação (normalmente 2, às vezes 3). */
  votingPicks?: number
  /** Fuso dos horários da votação (quinta 12h → sábado 12h). */
  timezone?: string
  updatedAt: string
}

/**
 * Votação de músicas de um evento (id = id do evento). Sem esta linha, vale a regra da equipe:
 * abre na quinta 12h e fecha no sábado 12h antes do ensaio da semana do evento.
 */
export interface SongPoll {
  id: Id
  /** 'lider' = o líder escolheu direto para este evento (sem votação). */
  mode: 'votacao' | 'lider'
  picks: number | null
  /** Datas personalizadas (null = regra semanal). */
  opensAt: string | null
  closesAt: string | null
  /** Quando as músicas vencedoras entraram no setlist. */
  appliedAt: string | null
  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

export interface Vote {
  /** `${serviceId}:${userId}:${songId}` */
  id: Id
  serviceId: Id
  userId: Id
  songId: Id
  createdAt: string
}

/** Aviso do líder no painel "Para você". Público vazio = equipe toda. */
export interface Announcement {
  id: Id
  title: string
  body: string
  /** Chave de ANNOUNCEMENT_ICONS */
  icon: string
  color: Pastel
  /** 'user:<id>' ou 'role:<função>'; vazio = todos. */
  audience: string[]
  pinned: boolean
  /** AAAA-MM-DD; depois desse dia o aviso some. */
  endsOn: string | null
  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

/** Avisos que o membro já viu ou excluiu (um registro por pessoa, igual em todos os aparelhos). */
export interface InboxState {
  /** id do perfil */
  id: Id
  dismissed: string[]
  seen: string[]
  updatedAt: string
}

export interface Tables {
  profiles: Profile
  songs: Song
  favorites: Favorite
  song_prefs: SongPref
  playlists: Playlist
  services: Service
  suggestions: Suggestion
  reactions: Reaction
  messages: Message
  team_settings: TeamSettings
  attendance: Attendance
  recordings: Recording
  custom_themes: CustomTheme
  song_polls: SongPoll
  votes: Vote
  announcements: Announcement
  inbox_state: InboxState
}

export type TableName = keyof Tables
export type Row<T extends TableName = TableName> = Tables[T]

export const TABLES: TableName[] = [
  'profiles',
  'songs',
  'favorites',
  'song_prefs',
  'playlists',
  'services',
  'suggestions',
  'reactions',
  'messages',
  'team_settings',
  'attendance',
  'recordings',
  'custom_themes',
  'song_polls',
  'votes',
  'announcements',
  'inbox_state',
]

export type DataSnapshot = { [K in TableName]: Record<Id, Tables[K]> }

export interface AuthUser {
  id: Id
  email: string | null
}
