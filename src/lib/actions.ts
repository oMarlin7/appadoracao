import { toast } from 'sonner'
import { backend, isNetworkError } from './backend'
import { cleanCuts, findMedley, isMedley, medleyArtist, medleyTitle, partKey } from './medley'
import { normalizeKeyName } from './music/theory'
import { currentUserId, getData, useData } from './store'
import { enqueue, flushOutbox, refresh } from './sync'
import type { Pastel } from './taxonomy'
import { normalizeSearch, nowIso, todayString, uid } from './utils'
import { itemsFromWinners, tally, votingInfo, winners } from './voting'
import type {
  Announcement,
  Attendance,
  AttendanceStatus,
  CustomTheme,
  Id,
  InboxState,
  MedleyCut,
  Message,
  Playlist,
  Profile,
  Reaction,
  Recording,
  Service,
  SetlistItem,
  Song,
  SongPoll,
  SongPref,
  Suggestion,
  SuggestionStatus,
  TableName,
  Tables,
  TeamSettings,
  Vote,
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

/** Envios em andamento: quem chama uma função do servidor espera por eles antes. */
const inflight = new Set<Promise<unknown>>()

function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p)
  void p.catch(() => {}).finally(() => inflight.delete(p))
  return p
}

/** Espera os envios em andamento e a fila offline (ex.: antes de aplicar a votação no banco). */
export async function settleWrites() {
  await Promise.allSettled([...inflight])
  await flushOutbox()
}

async function save<T extends TableName>(table: T, row: Tables[T]): Promise<boolean> {
  const store = useData.getState()
  const prev = getData()[table][row.id] as Tables[T] | undefined
  store.upsertLocal(table, row)
  try {
    await track(backend.upsert(table, row))
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
    await track(backend.remove(table, id))
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

/** Igual ao `cascade`, para referências que viram vazias (on delete set null). */
function detach(id: Id, patch: Partial<Recording>) {
  const r = getData().recordings[id]
  if (!r) return
  const next = { ...r, ...patch }
  if (backend.mode === 'demo') void save('recordings', next)
  else useData.getState().upsertLocal('recordings', next)
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
    spotifyUrl: null,
    coverUrl: null,
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
  for (const r of Object.values(data.recordings)) if (r.songId === id) detach(r.id, { songId: null })
  for (const v of Object.values(data.votes)) if (v.songId === id) cascade('votes', v.id)
  for (const s of Object.values(data.suggestions))
    if (s.songId === id) {
      cascade('suggestions', s.id)
      for (const r of Object.values(data.reactions)) if (r.targetId === s.id) cascade('reactions', r.id)
    }
  // A música sai dos medleys em que estava (o medley continua com as outras).
  for (const m of Object.values(data.songs))
    if (m.medleyIds?.includes(id)) {
      const ids = m.medleyIds.filter((x) => x !== id)
      void save('songs', { ...m, medleyIds: ids, medleyCuts: cleanCuts(m.medleyCuts, ids), updatedAt: nowIso() })
    }
  return true
}

/** Temas, momentos, capa e tom do medley, tirados das partes (e o trecho de cada uma). */
function medleyFields(parts: Song[], cuts: Record<Id, MedleyCut> | null | undefined): Partial<Song> {
  const ids = parts.map((p) => p.id)
  return {
    artist: medleyArtist(parts),
    medleyIds: ids,
    medleyCuts: cleanCuts(cuts, ids),
    originalKey: partKey(parts[0]),
    tempo: parts[0].tempo,
    themes: [...new Set(parts.flatMap((p) => p.themes))].slice(0, 6),
    moments: [...new Set(parts.flatMap((p) => p.moments))],
    coverUrl: parts.find((p) => p.coverUrl)?.coverUrl ?? null,
  }
}

function medleyPartsOf(ids: Id[]): Song[] | null {
  const songs = getData().songs
  const parts = [...new Set(ids)].map((id) => songs[id]).filter((s): s is Song => !!s && !isMedley(s))
  if (parts.length >= 2) return parts
  toast.error('Escolha pelo menos duas músicas para o medley')
  return null
}

/**
 * Junta duas ou mais músicas num medley (uma música só). Se a equipe já tem um medley com as
 * mesmas músicas na mesma ordem, usa ele.
 */
export async function createMedley(ids: Id[], name = '', cuts?: Record<Id, MedleyCut> | null): Promise<Song | null> {
  const parts = medleyPartsOf(ids)
  if (!parts) return null
  const title = name.trim() || medleyTitle(parts)
  const existing = findMedley(Object.values(getData().songs), parts.map((p) => p.id), cuts)
  if (existing && (!name.trim() || existing.title === title)) return existing
  const song = newSong({ title, ...medleyFields(parts, cuts) })
  return (await saveSong(song)) ? song : null
}

export async function updateMedley(id: Id, ids: Id[], name = '', cuts?: Record<Id, MedleyCut> | null): Promise<boolean> {
  const song = getData().songs[id]
  const parts = medleyPartsOf(ids)
  if (!song || !parts) return false
  return saveSong({ ...song, ...medleyFields(parts, cuts === undefined ? song.medleyCuts : cuts), title: name.trim() || medleyTitle(parts) })
}

/** Onde troca de música no medley (de qual parte até qual parte de cada uma). */
export async function setMedleyCuts(id: Id, cuts: Record<Id, MedleyCut> | null): Promise<boolean> {
  const song = getData().songs[id]
  if (!song || !isMedley(song)) return false
  return save('songs', { ...song, medleyCuts: cleanCuts(cuts, song.medleyIds ?? []), updatedAt: nowIso() })
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
    kind: 'culto',
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
  if (!ok) return false
  for (const s of Object.values(data.suggestions))
    if (s.serviceId === id) {
      cascade('suggestions', s.id)
      for (const r of Object.values(data.reactions)) if (r.targetId === s.id) cascade('reactions', r.id)
    }
  for (const a of Object.values(data.attendance)) if (a.serviceId === id) cascade('attendance', a.id)
  for (const v of Object.values(data.votes)) if (v.serviceId === id) cascade('votes', v.id)
  if (data.song_polls[id]) cascade('song_polls', id)
  for (const r of Object.values(data.recordings)) if (r.serviceId === id) detach(r.id, { serviceId: null })
  return true
}

/** Só o líder escolhe as músicas do culto (no Supabase o banco também garante). */
export function canEditSetlist(): boolean {
  return getData().profiles[currentUserId() ?? '']?.role === 'admin'
}

function leaderOnly(): boolean {
  if (canEditSetlist()) return true
  toast.error('Só o líder escolhe as músicas do culto', { description: 'Use “Sugerir” para indicar uma música — ela entra na votação ou vai para o líder.' })
  return false
}

export async function updateServiceItems(serviceId: Id, items: SetlistItem[]): Promise<boolean> {
  const s = getData().services[serviceId]
  if (!s || !leaderOnly()) return false
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
  if (!s || !leaderOnly()) return false
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

export async function updateMyProfile(patch: Partial<Pick<Profile, 'name' | 'functions' | 'color' | 'bio' | 'avatarUrl' | 'notifyPrefs'>>) {
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
// Presença
// ---------------------------------------------------------------------------

export const attendanceId = (serviceId: Id, userId: Id) => `${serviceId}:${userId}`

export async function setAttendance(
  serviceId: Id,
  userId: Id,
  patch: { status: AttendanceStatus; reason?: string | null; note?: string; arrivedAt?: string | null },
): Promise<boolean> {
  const id = attendanceId(serviceId, userId)
  const prev = getData().attendance[id]
  const now = nowIso()
  const absent = patch.status === 'ausente'
  const late = patch.status === 'atrasado'
  // A observação só continua quando a situação continua a mesma (ausência → ausência, atraso → atraso).
  const keepNote = (absent || late) && prev?.status === patch.status
  const row: Attendance = {
    id,
    serviceId,
    userId,
    status: patch.status,
    // Ao voltar para "presente/confirmado", a justificativa antiga deixa de valer.
    reason: absent ? (patch.reason !== undefined ? patch.reason : (prev?.reason ?? null)) : null,
    note: absent || late ? (patch.note !== undefined ? patch.note : keepNote ? (prev?.note ?? '') : '').trim() : '',
    arrivedAt: late ? (patch.arrivedAt !== undefined ? patch.arrivedAt : (prev?.arrivedAt ?? null)) : null,
    markedBy: currentUserId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  }
  return save('attendance', row)
}

export async function clearAttendance(serviceId: Id, userId: Id) {
  return destroy('attendance', attendanceId(serviceId, userId))
}

// ---------------------------------------------------------------------------
// Votação das músicas
// ---------------------------------------------------------------------------

export const voteId = (serviceId: Id, userId: Id, songId: Id) => `${serviceId}:${userId}:${songId}`

export function pollInfo(serviceId: Id, now = new Date()) {
  const data = getData()
  const svc = data.services[serviceId]
  return svc ? votingInfo(svc, data.team_settings.team, data.song_polls[serviceId], now) : null
}

/** Vota (ou tira o voto) numa música sugerida. Cada um tem N votos, um por música. */
export async function toggleVote(serviceId: Id, songId: Id): Promise<boolean> {
  const userId = me()
  const data = getData()
  const info = pollInfo(serviceId)
  if (!info || info.phase !== 'aberta' || info.applied) {
    toast('A votação deste evento não está aberta')
    return false
  }
  const id = voteId(serviceId, userId, songId)
  if (data.votes[id]) return destroy('votes', id)
  const mine = Object.values(data.votes).filter((v) => v.serviceId === serviceId && v.userId === userId)
  if (mine.length >= info.votes) {
    toast(info.votes === 1 ? 'Você já usou seu voto' : `Você já usou seus ${info.votes} votos`, { description: 'Toque numa delas para tirar o voto e trocar.' })
    return false
  }
  const vote: Vote = { id, serviceId, userId, songId, createdAt: nowIso() }
  return save('votes', vote)
}

/** O líder ajusta a votação deste evento (modo, músicas que entram, votos por pessoa, prazo). */
export async function setPoll(serviceId: Id, patch: Partial<Pick<SongPoll, 'mode' | 'picks' | 'maxVotes' | 'opensAt' | 'closesAt' | 'appliedAt'>>) {
  if (!leaderOnly()) return false
  const prev = getData().song_polls[serviceId]
  const now = nowIso()
  const base: SongPoll = prev ?? { id: serviceId, mode: 'votacao', picks: null, opensAt: null, closesAt: null, appliedAt: null, createdBy: currentUserId(), createdAt: now, updatedAt: now }
  return save('song_polls', { ...base, ...patch, updatedAt: now })
}

export async function openPollNow(serviceId: Id) {
  const info = pollInfo(serviceId)
  if (!info) return false
  const now = Date.now()
  const closes = info.closesAt.getTime() > now + 3600_000 ? info.closesAt : new Date(now + 2 * 86400_000)
  return setPoll(serviceId, { mode: 'votacao', opensAt: new Date(now - 1000).toISOString(), closesAt: closes.toISOString(), appliedAt: null })
}

/** O líder encerra a votação; as mais votadas já entram no setlist. */
export async function closePollNow(serviceId: Id) {
  const info = pollInfo(serviceId)
  if (!info) return false
  const now = Date.now()
  const ok = await setPoll(serviceId, {
    opensAt: info.opensAt.getTime() < now ? info.opensAt.toISOString() : new Date(now - 2000).toISOString(),
    closesAt: new Date(now - 1000).toISOString(),
  })
  if (!ok) return false
  return applyPoll(serviceId, { manual: true })
}

/** Votações sendo aplicadas agora (o botão e a automação esperam a mesma tentativa). */
const applying = new Map<Id, Promise<boolean>>()
/**
 * Falhas que não são de rede (ex.: banco sem a migração) não são repetidas a cada minuto pela
 * automação — até a votação mudar. O botão do líder sempre tenta de novo.
 */
const applyFailed = new Map<Id, string>()

/**
 * Leva as mais votadas para o setlist depois do prazo. Qualquer aparelho da equipe pode fazer
 * isso (no Supabase pela função aplicar_votacao, que confere prazo e votos no banco).
 */
export function applyPoll(serviceId: Id, opts: { manual?: boolean } = {}): Promise<boolean> {
  const running = applying.get(serviceId)
  if (running) return running
  const data = getData()
  const svc = data.services[serviceId]
  const info = pollInfo(serviceId)
  const pollVersion = data.song_polls[serviceId]?.updatedAt ?? ''
  if (!svc || !info || !info.enabled || info.phase !== 'encerrada' || info.applied) return Promise.resolve(false)
  if (!opts.manual && applyFailed.get(serviceId) === pollVersion) return Promise.resolve(false)
  const win = winners(tally(serviceId, Object.values(data.suggestions), Object.values(data.votes), (id) => !!data.songs[id]), info.picks)
  if (!win.length) return Promise.resolve(false)

  const run = async (): Promise<boolean> => {
    try {
      if (backend.mode === 'supabase') {
        // A mudança no prazo (ex.: "Encerrar agora") precisa chegar ao banco antes.
        await settleWrites()
        await backend.rpc<number>('aplicar_votacao', { sid: serviceId })
        applyFailed.delete(serviceId)
        await refresh()
        return true
      }
      const now = nowIso()
      await save('services', { ...svc, items: itemsFromWinners(svc.items, win, data.songs), updatedAt: now })
      for (const s of Object.values(data.suggestions))
        if (s.serviceId === serviceId && win.some((w) => w.songId === s.songId) && s.status !== 'aceita') await save('suggestions', { ...s, status: 'aceita', updatedAt: now })
      const base: SongPoll = data.song_polls[serviceId] ?? { id: serviceId, mode: 'votacao', picks: null, opensAt: null, closesAt: null, appliedAt: null, createdBy: null, createdAt: now, updatedAt: now }
      await save('song_polls', { ...base, appliedAt: now, updatedAt: now })
      return true
    } catch (e) {
      if (!isNetworkError(e)) {
        applyFailed.set(serviceId, pollVersion)
        console.warn('Não foi possível aplicar a votação', e)
      }
      if (opts.manual) toast.error('Não foi possível levar para o setlist', { description: errorMessage(e) })
      return false
    }
  }
  const p = run().finally(() => applying.delete(serviceId))
  applying.set(serviceId, p)
  return p
}

// ---------------------------------------------------------------------------
// Notificações lidas e excluídas
// ---------------------------------------------------------------------------

/** Guarda só as mais recentes (os ids carregam o estado do aviso e mudam com o tempo). */
const INBOX_MEMORY = 300

export async function updateInboxState(patch: { dismiss?: string[]; restore?: boolean; seen?: string[] }): Promise<boolean> {
  const userId = me()
  const prev = getData().inbox_state[userId]
  const merge = (a: string[], b: string[] = []) => [...new Set([...a, ...b])].slice(-INBOX_MEMORY)
  const row: InboxState = {
    id: userId,
    dismissed: patch.restore ? [] : merge(prev?.dismissed ?? [], patch.dismiss),
    seen: merge(prev?.seen ?? [], patch.seen),
    updatedAt: nowIso(),
  }
  if (prev && row.dismissed.join('\n') === prev.dismissed.join('\n') && row.seen.join('\n') === prev.seen.join('\n')) return true
  return save('inbox_state', row)
}

// ---------------------------------------------------------------------------
// Avisos do líder
// ---------------------------------------------------------------------------

export async function saveAnnouncement(input: Partial<Announcement> & Pick<Announcement, 'title'>): Promise<Id | null> {
  if (getData().profiles[currentUserId() ?? '']?.role !== 'admin') {
    toast.error('Só o líder publica avisos')
    return null
  }
  const prev = input.id ? getData().announcements[input.id] : undefined
  const now = nowIso()
  const row: Announcement = {
    id: prev?.id ?? uid(),
    title: input.title.trim(),
    body: (input.body ?? prev?.body ?? '').trim(),
    icon: input.icon ?? prev?.icon ?? 'megaphone',
    color: input.color ?? prev?.color ?? 'lavender',
    audience: input.audience ?? prev?.audience ?? [],
    pinned: input.pinned ?? prev?.pinned ?? false,
    endsOn: input.endsOn !== undefined ? input.endsOn : (prev?.endsOn ?? null),
    createdBy: prev?.createdBy ?? currentUserId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  }
  return (await save('announcements', row)) ? row.id : null
}

export async function deleteAnnouncement(id: Id) {
  return destroy('announcements', id)
}

// ---------------------------------------------------------------------------
// Gravações de ensaio
// ---------------------------------------------------------------------------

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }

export async function addRecording(input: {
  file: Blob
  title: string
  serviceId?: Id | null
  songId?: Id | null
  durationSec?: number | null
  fileName?: string
}): Promise<Id | null> {
  const userId = me()
  const id = uid()
  const mimeType = (input.file.type || 'audio/webm').split(';')[0]
  const ext = EXT[mimeType] ?? input.fileName?.split('.').pop()?.toLowerCase() ?? 'audio'
  const storagePath = `${userId}/${id}.${ext}`
  try {
    await backend.uploadFile(storagePath, input.file, mimeType)
  } catch (e) {
    toast.error('Não foi possível enviar a gravação', { description: isNetworkError(e) ? 'Sem conexão. Tente de novo quando a internet voltar.' : errorMessage(e) })
    return null
  }
  const now = nowIso()
  const row: Recording = {
    id,
    title: input.title.trim() || 'Gravação de ensaio',
    serviceId: input.serviceId ?? null,
    songId: input.songId ?? null,
    storagePath,
    mimeType,
    durationSec: input.durationSec ? Math.round(input.durationSec) : null,
    sizeBytes: input.file.size,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  const ok = await save('recordings', row)
  if (!ok) void backend.removeFile(storagePath)
  return ok ? id : null
}

export async function updateRecording(id: Id, patch: Partial<Pick<Recording, 'title' | 'serviceId' | 'songId'>>) {
  const r = getData().recordings[id]
  if (!r) return false
  return save('recordings', { ...r, ...patch, updatedAt: nowIso() })
}

export async function deleteRecording(id: Id) {
  const r = getData().recordings[id]
  if (!r) return true
  const ok = await destroy('recordings', id)
  if (ok && !r.storagePath.startsWith('exemplo/')) void backend.removeFile(r.storagePath).catch(() => {})
  return ok
}

// ---------------------------------------------------------------------------
// Temas da equipe
// ---------------------------------------------------------------------------

export async function saveCustomTheme(input: Partial<CustomTheme> & Pick<CustomTheme, 'name'>): Promise<Id | null> {
  const prev = input.id ? getData().custom_themes[input.id] : undefined
  const now = nowIso()
  const row: CustomTheme = {
    id: prev?.id ?? `tema-${uid()}`,
    name: input.name.trim(),
    description: (input.description ?? prev?.description ?? '').trim(),
    icon: input.icon ?? prev?.icon ?? 'sparkles',
    color: input.color ?? prev?.color ?? 'lavender',
    keywords: (input.keywords ?? prev?.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    createdBy: prev?.createdBy ?? currentUserId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  }
  return (await save('custom_themes', row)) ? row.id : null
}

/** Exclui o tema e tira ele das músicas que o usavam. */
export async function deleteCustomTheme(id: Id) {
  const songs = Object.values(getData().songs).filter((s) => s.themes.includes(id))
  const ok = await destroy('custom_themes', id)
  if (ok) for (const s of songs) void save('songs', { ...s, themes: s.themes.filter((t) => t !== id), updatedAt: nowIso() })
  return ok
}

// ---------------------------------------------------------------------------
// Backup das músicas
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
