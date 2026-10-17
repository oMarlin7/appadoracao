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

export interface Service {
  id: Id
  title: string
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

export interface TeamSettings {
  id: 'team'
  name: string
  church: string
  inviteCode: string | null
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
]

export type DataSnapshot = { [K in TableName]: Record<Id, Tables[K]> }

export interface AuthUser {
  id: Id
  email: string | null
}
