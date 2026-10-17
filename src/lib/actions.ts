import { toast } from 'sonner'
import { backend, isNetworkError } from './backend'
import { normalizeKeyName } from './music/theory'
import { currentUserId, getData, useData } from './store'
import { enqueue } from './sync'
import type { Pastel } from './taxonomy'
import { normalizeSearch, nowIso, todayString, uid } from './utils'
import type {
  Id,
  Message,
  Playlist,
  Profile,
  Reaction,
  Service,
  SetlistItem,
  Song,
  SongPref,
  Suggestion,
  SuggestionStatus,
  TableName,
  Tables,
  TeamSettings,
} from '@/types'

// ---------------------------------------------------------------------------
// Escrita otimista: atualiza a tela na hora, envia ao servidor e desfaz se der erro.
// ---------------------------------------------------------------------------

let lastOfflineToast = 0
function notifyOffline() {
  if (Date.now() - lastOfflineToast < 30_000) return
  lastOfflineToast = Date.now()
  toast('Sem internet', { description: 'Salvamos aqui no aparelho e enviamos assim que a conexão voltar.' })
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e && 'message' in e) return String(e.message)
  return 'Algo deu errado. Tente novamente.'
}

async function save<T extends TableName>(table: T, row: Tables[T]): Promise<boolean> {
  const store = useData.getState()
  const prev = getData()[table][row.id] as Tables[T] | undefined
  store.upsertLocal(table, row)
  try {
    await backend.upsert(table, row)
    return true
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue({ op: 'upsert', table, row })
      notifyOffline()
      return true
    }
    if (prev) store.upsertLocal(table, prev)
    else store.removeLocal(table, row.id)
    toast.error('Não foi possível salvar', { description: errorMessage(e) })
    return false
  }
}

async function destroy(table: TableName, id: Id): Promise<boolean> {
  const store = useData.getState()
  const prev = getData()[table][id]
  if (!prev) return true
  store.removeLocal(table, id)
  try {
    await backend.remove(table, id)
    return true
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue({ op: 'delete', table, id })
      notifyOffline()
      return true
    }
    store.upsertLocal(table, prev as never)
    toast.error('Não foi possível excluir', { description: errorMessage(e) })
    return false
  }
}

/**
 * Linhas dependentes (favoritas, reações, sugestões…) de algo que foi excluído.
 * No Supabase o próprio banco apaga em cascata — aqui só limpamos a tela. No modo demo
 * não há banco, então apagamos de verdade.
 */
function cascade(table: TableName, id: Id) {
  if (backend.mode === 'demo') void destroy(table, id)
  else useData.getState().removeLocal(table, id)
}

function me(): Id {
  const id = currentUserId()
  if (!id) throw new Error('Entre na sua conta para continuar.')
  return id
}

// ---------------------------------------------------------------------------
// Músicas
// ---------------------------------------------------------------------------

export function newSong(partial: Partial<Song> = {}): Song {
  const now = nowIso()
  return {
    id: uid(),
    title: '',
    artist: '',
    originalKey: null,
    teamKey: null,
    bpm: null,
    timeSignature: null,
    tempo: null,
    themes: [],
    moments: [],
    tags: [],
    meaning: '',
    bibleRefs: [],
    content: '',
    notes: '',
    youtubeUrl: null,
    createdBy: currentUserId(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export async function saveSong(song: Song): Promise<boolean> {
  return save('songs', {
    ...song,
    title: song.title.trim(),
    artist: song.artist.trim(),
    originalKey: normalizeKeyName(song.originalKey),
    teamKey: normalizeKeyName(song.teamKey),
    updatedAt: nowIso(),
  })
}

export async function deleteSong(id: Id): Promise<boolean> {
  const data = getData()
  const ok = await destroy('songs', id)
  if (!ok) return false
  for (const f of Object.values(data.favorites)) if (f.songId === id) cascade('favorites', f.id)
  for (const p of Object.values(data.song_prefs)) if (p.songId === id) cascade('song_prefs', p.id)
  for (const s of Object.values(data.suggestions))
    if (s.songId === id) {
      cascade('suggestions', s.id)
      for (const r of Object.values(data.reactions)) if (r.targetId === s.id) cascade('reactions', r.id)
    }
  return true
}

export async function setTeamKey(songId: Id, key: string | null): Promise<boolean> {
  const song = getData().songs[songId]
  if (!song) return false
  return save('songs', { ...song, teamKey: normalizeKeyName(key), updatedAt: nowIso() })
}

// ---------------------------------------------------------------------------
// Favoritas e preferências pessoais
// ---------------------------------------------------------------------------

export const favoriteId = (userId: Id, songId: Id) => `${userId}:${songId}`

export async function toggleFavorite(songId: Id): Promise<boolean> {
  const userId = me()
  const id = favoriteId(userId, songId)
  if (getData().favorites[id]) {
    await destroy('favorites', id)
    return false
  }
  await save('favorites', { id, userId, songId, createdAt: nowIso() })
  return true
}

export const prefId = favoriteId

export async function setMyPref(songId: Id, patch: Partial<Pick<SongPref, 'key' | 'capo'>>): Promise<boolean> {
  const userId = me()
  const id = prefId(userId, songId)
  const prev = getData().song_prefs[id]
  const next: SongPref = {
    id,
    userId,
    songId,
    key: prev?.key ?? null,
    capo: prev?.capo ?? null,
    ...patch,
    updatedAt: nowIso(),
  }
  if (next.key) next.key = normalizeKeyName(next.key)
  if (!next.key && !next.capo) return destroy('song_prefs', id)
  return save('song_prefs', next)
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export async function createPlaylist(input: { name: string; description?: string; color: Pastel; isShared: boolean; songIds?: Id[] }): Promise<Id> {
  const now = nowIso()
  const playlist: Playlist = {
    id: uid(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    color: input.color,
    isShared: input.isShared,
    ownerId: me(),
    songIds: input.songIds ?? [],
    createdAt: now,
    updatedAt: now,
  }
  await save('playlists', playlist)
  return playlist.id
}

export async function updatePlaylist(id: Id, patch: Partial<Playlist>): Promise<boolean> {
  const p = getData().playlists[id]
  if (!p) return false
  return save('playlists', { ...p, ...patch, id, updatedAt: nowIso() })
}

export async function deletePlaylist(id: Id) {
  return destroy('playlists', id)
}

export async function addToPlaylist(playlistId: Id, songId: Id): Promise<boolean> {
  const p = getData().playlists[playlistId]
  if (!p) return false
  if (p.songIds.includes(songId)) {
    toast('Essa música já está na playlist')
    return false
  }
  return updatePlaylist(playlistId, { songIds: [...p.songIds, songId] })
}

export async function removeFromPlaylist(playlistId: Id, songId: Id) {
  const p = getData().playlists[playlistId]
  if (!p) return false
  return updatePlaylist(playlistId, { songIds: p.songIds.filter((s) => s !== songId) })
}

// ---------------------------------------------------------------------------
// Cultos (setlist e escala)
// ---------------------------------------------------------------------------

export function newService(partial: Partial<Service> = {}): Service {
  const now = nowIso()
  return {
    id: uid(),
    title: 'Culto de Domingo',
    date: todayString(),
    time: '19:00',
    theme: '',
    bibleText: '',
    notes: '',
    leaderId: currentUserId(),
    items: [],
    team: [],
    createdBy: currentUserId(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export async function saveService(service: Service): Promise<boolean> {
  return save('services', { ...service, title: service.title.trim() || 'Culto', updatedAt: nowIso() })
}

export async function deleteService(id: Id): Promise<boolean> {
  const data = getData()
  const ok = await destroy('services', id)
  if (ok)
    for (const s of Object.values(data.suggestions))
      if (s.serviceId === id) {
        cascade('suggestions', s.id)
        for (const r of Object.values(data.reactions)) if (r.targetId === s.id) cascade('reactions', r.id)
      }
  return ok
}

export async function updateServiceItems(serviceId: Id, items: SetlistItem[]): Promise<boolean> {
  const s = getData().services[serviceId]
  if (!s) return false
  return save('services', { ...s, items, updatedAt: nowIso() })
}

export async function addToService(
  serviceId: Id,
  songId: Id,
  opts: { key?: string | null; moment?: string | null; notes?: string } = {},
): Promise<boolean> {
  const s = getData().services[serviceId]
  const song = getData().songs[songId]
  if (!s || !song) return false
  if (s.items.some((i) => i.songId === songId)) {
    toast('Essa música já está no setlist desse culto')
    return false
  }
  const item: SetlistItem = {
    id: uid(),
    songId,
    key: opts.key ?? song.teamKey ?? song.originalKey,
    moment: opts.moment ?? song.moments[0] ?? null,
    notes: opts.notes ?? '',
  }
  return updateServiceItems(serviceId, [...s.items, item])
}

export async function removeFromService(serviceId: Id, itemId: Id) {
  const s = getData().services[serviceId]
  if (!s) return false
  return updateServiceItems(
    serviceId,
    s.items.filter((i) => i.id !== itemId),
  )
}

// ---------------------------------------------------------------------------
// Sugestões para o culto
// ---------------------------------------------------------------------------

export async function suggestSong(songId: Id, serviceId: Id | null, note: string): Promise<boolean> {
  const userId = me()
  const dup = Object.values(getData().suggestions).find(
    (s) => s.songId === songId && s.serviceId === serviceId && s.status === 'pendente',
  )
  if (dup) {
    toast('Essa música já foi sugerida', { description: 'Você pode apoiar a sugestão existente.' })
    return false
  }
  const now = nowIso()
  const suggestion: Suggestion = { id: uid(), songId, serviceId, userId, note: note.trim(), status: 'pendente', createdAt: now, updatedAt: now }
  return save('suggestions', suggestion)
}

export async function setSuggestionStatus(id: Id, status: SuggestionStatus): Promise<boolean> {
  const s = getData().suggestions[id]
  if (!s) return false
  const ok = await save('suggestions', { ...s, status, updatedAt: nowIso() })
  if (ok && status === 'aceita' && s.serviceId) {
    const service = getData().services[s.serviceId]
    if (service && !service.items.some((i) => i.songId === s.songId)) await addToService(s.serviceId, s.songId)
  }
  return ok
}

export async function deleteSuggestion(id: Id) {
  const data = getData()
  const ok = await destroy('suggestions', id)
  if (ok) for (const r of Object.values(data.reactions)) if (r.targetId === id) cascade('reactions', r.id)
  return ok
}

// ---------------------------------------------------------------------------
// Reações (apoio às sugestões e emojis no chat)
// ---------------------------------------------------------------------------

export async function toggleReaction(targetType: Reaction['targetType'], targetId: Id, emoji: string): Promise<boolean> {
  const userId = me()
  const id = `${targetType}:${targetId}:${userId}:${emoji}`
  if (getData().reactions[id]) {
    await destroy('reactions', id)
    return false
  }
  await save('reactions', { id, targetType, targetId, userId, emoji, createdAt: nowIso() })
  return true
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendMessage(text: string, attach: { songId?: Id | null; serviceId?: Id | null } = {}): Promise<boolean> {
  const body = text.trim()
  if (!body && !attach.songId && !attach.serviceId) return false
  const msg: Message = {
    id: uid(),
    userId: me(),
    text: body,
    songId: attach.songId ?? null,
    serviceId: attach.serviceId ?? null,
    createdAt: nowIso(),
    editedAt: null,
  }
  return save('messages', msg)
}

export async function deleteMessage(id: Id) {
  const data = getData()
  const ok = await destroy('messages', id)
  if (ok) for (const r of Object.values(data.reactions)) if (r.targetId === id) cascade('reactions', r.id)
  return ok
}

// ---------------------------------------------------------------------------
// Perfil, equipe e configurações
// ---------------------------------------------------------------------------

export async function updateMyProfile(patch: Partial<Pick<Profile, 'name' | 'functions' | 'color' | 'bio'>>) {
  const p = getData().profiles[me()]
  if (!p) return false
  return save('profiles', { ...p, ...patch, updatedAt: nowIso() })
}

export async function setMemberRole(userId: Id, role: Profile['role']) {
  const p = getData().profiles[userId]
  if (!p) return false
  return save('profiles', { ...p, role, updatedAt: nowIso() })
}

export async function updateTeam(patch: Partial<Omit<TeamSettings, 'id'>>) {
  const current = getData().team_settings.team ?? {
    id: 'team' as const,
    name: 'Ministério de Louvor',
    church: '',
    inviteCode: null,
    updatedAt: nowIso(),
  }
  return save('team_settings', { ...current, ...patch, id: 'team', updatedAt: nowIso() })
}

// ---------------------------------------------------------------------------
// Backup do acervo
// ---------------------------------------------------------------------------

export function exportLibrary(): string {
  const data = getData()
  return JSON.stringify(
    {
      app: 'adoracao',
      version: 1,
      exportedAt: nowIso(),
      songs: Object.values(data.songs),
      playlists: Object.values(data.playlists).filter((p) => p.isShared),
    },
    null,
    2,
  )
}

export async function importLibrary(json: string): Promise<{ added: number; updated: number; skipped: number }> {
  const parsed = JSON.parse(json) as { songs?: Partial<Song>[] }
  if (!Array.isArray(parsed.songs)) throw new Error('Arquivo inválido: não encontramos músicas.')
  const data = getData()
  const byTitle = new Map(Object.values(data.songs).map((s) => [normalizeSearch(`${s.title} ${s.artist}`), s]))
  let added = 0
  let updated = 0
  let skipped = 0
  for (const raw of parsed.songs) {
    if (!raw.title) {
      skipped++
      continue
    }
    const existing = (raw.id && data.songs[raw.id]) || byTitle.get(normalizeSearch(`${raw.title} ${raw.artist ?? ''}`))
    if (existing) {
      if ((raw.updatedAt ?? '') > existing.updatedAt) {
        await saveSong({ ...existing, ...raw, id: existing.id, createdBy: existing.createdBy } as Song)
        updated++
      } else skipped++
      continue
    }
    await saveSong(newSong({ ...raw, id: raw.id ?? uid(), createdBy: currentUserId() }))
    added++
  }
  return { added, updated, skipped }
}
