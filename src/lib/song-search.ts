import { backend, IMPORT_FUNCTION, isDemo } from './backend'
import { cleanChannelName, splitVideoTitle } from './media'
import { normalizeKeyName } from './music/theory'
import { MOMENTS, type Tempo, type Theme } from './taxonomy'

/**
 * Cadastro pelo nome: a equipe digita "música e artista", escolhe o vídeo certo no YouTube (o
 * Deezer só entra quando o YouTube não responde) e o servidor completa a ficha com IA e busca na
 * web — Spotify, página da cifra, tom, BPM, compasso, temas, momentos, significado, referências
 * e notas de arranjo. O vídeo escolhido fica na música para ouvir dentro do app.
 *
 * A cifra e a letra vêm junto com a ficha, extraídas no servidor da página citada (a busca só
 * da cifra fica em cifra-search.ts).
 */

export interface SongCandidate {
  /** 'youtube:<id do vídeo>', 'deezer:123' ou 'itunes:456' */
  id: string
  title: string
  /** "Ao Vivo", "Playback"… */
  version: string | null
  artist: string
  album: string | null
  coverUrl: string | null
  durationSec: number | null
  /** Trecho de 30 s da faixa (Deezer), para conferir se é a música certa. */
  previewUrl: string | null
  link: string | null
  /** Vídeo do YouTube: a faixa do Deezer que é a mesma música ('deezer:123'). */
  catalogId?: string | null
}

export interface SongDetails {
  /** A IA completou a ficha? (sem chave configurada, vêm só os dados do catálogo) */
  ia: boolean
  aiError?: string
  year: string | null
  youtubeUrl: string | null
  spotifyUrl: string | null
  cifraUrl: string | null
  originalKey: string | null
  bpm: number | null
  timeSignature: string | null
  tempo: Tempo | null
  themes: string[]
  moments: string[]
  meaning: string
  bibleRefs: string[]
  arrangementNotes: string
  sources: Array<{ url: string; title: string }>
  /** Cifra+letra extraídas da página da cifra (texto Cifra Club/ChordPro). */
  content: string | null
  /** Endereço da página de onde a cifra+letra foram extraídas. */
  sourceUrl: string | null
  /** Nome da música e do artista como estão no Cifra Club (corrige o que veio do título do vídeo). */
  title?: string | null
  artist?: string | null
}

const EMPTY_DETAILS: SongDetails = {
  ia: false,
  year: null,
  youtubeUrl: null,
  spotifyUrl: null,
  cifraUrl: null,
  originalKey: null,
  bpm: null,
  timeSignature: null,
  tempo: null,
  themes: [],
  moments: [],
  meaning: '',
  bibleRefs: [],
  arrangementNotes: '',
  sources: [],
  content: null,
  sourceUrl: null,
}

// ---------------------------------------------------------------------------
// Sem servidor (modo demonstração): o catálogo do Deezer direto do navegador
// ---------------------------------------------------------------------------

interface DeezerTrack {
  id: number
  title?: string
  title_short?: string
  title_version?: string
  duration?: number
  preview?: string
  link?: string
  bpm?: number
  release_date?: string
  artist?: { name?: string }
  album?: { title?: string; cover_big?: string; cover_xl?: string }
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** O Deezer não libera CORS; a API oficial aceita JSONP. */
function jsonp<T>(url: string, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__adoracaoJsonp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const script = document.createElement('script')
    const w = window as unknown as Record<string, unknown>
    const done = () => {
      clearTimeout(timer)
      delete w[name]
      script.remove()
    }
    const timer = setTimeout(() => {
      done()
      reject(new Error('Tempo esgotado'))
    }, ms)
    w[name] = (data: T) => {
      done()
      resolve(data)
    }
    script.onerror = () => {
      done()
      reject(new Error('Sem conexão com o catálogo'))
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${name}`
    document.head.appendChild(script)
  })
}

export function candidateFromDeezer(t: DeezerTrack): SongCandidate {
  return {
    id: `deezer:${t.id}`,
    title: clean(t.title_short || t.title),
    version: clean(t.title_version).replace(/^\((.*)\)$/, '$1') || null,
    artist: clean(t.artist?.name),
    album: clean(t.album?.title) || null,
    coverUrl: t.album?.cover_xl || t.album?.cover_big || null,
    durationSec: t.duration || null,
    previewUrl: t.preview || null,
    link: t.link || null,
  }
}

export const isYouTubeCandidate = (c: Pick<SongCandidate, 'id'>) => c.id.startsWith('youtube:')

/** "(Ao Vivo)", "Playback"… no título do vídeo vira a versão. */
function videoVersion(raw: string): string | null {
  if (/\bplayback\b/i.test(raw)) return 'Playback'
  if (/\bao vivo\b|\blive\b/i.test(raw)) return 'Ao Vivo'
  if (/ac[uú]stic/i.test(raw)) return 'Acústico'
  if (/\binstrumental\b/i.test(raw)) return 'Instrumental'
  return null
}

/** Para comparar nomes: minúsculas, sem acento e sem pontuação, com espaço nas pontas. */
const words = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/**
 * A faixa do catálogo que é a música deste vídeo: o título da faixa aparece no título do vídeo
 * e o artista, no título ou no canal. Entre várias, fica a de nome mais completo e a da mesma
 * versão (ao vivo, playback…).
 */
export function matchCatalog(videoTitle: string, channel: string, catalog: SongCandidate[]): SongCandidate | null {
  const video = words(videoTitle)
  const ch = words(cleanChannelName(channel))
  const version = videoVersion(videoTitle)
  let best: SongCandidate | null = null
  let bestScore = 0
  for (const t of catalog) {
    const title = words(t.title)
    const artist = words(t.artist)
    if (title.trim().length < 2 || artist.trim().length < 2 || !video.includes(title)) continue
    if (!video.includes(artist) && !(ch.trim() && (ch.includes(artist) || artist.includes(ch)))) continue
    const sameVersion = version ? !!t.version && words(t.version).includes(words(version)) : !t.version
    const score = title.length + (sameVersion ? 100 : 0)
    if (score > bestScore) {
      best = t
      bestScore = score
    }
  }
  return best
}

/**
 * Vídeo do YouTube ("Artista - Música (Ao Vivo)", do canal) → música, artista e versão. Com a
 * faixa do catálogo, o nome vem dela (o título do vídeo pode vir na ordem "Música - Artista") e
 * a prévia de 30 s também.
 */
export function candidateFromYouTube(c: SongCandidate, catalog: SongCandidate[] = []): SongCandidate {
  const version = videoVersion(c.title)
  const track = matchCatalog(c.title, c.artist, catalog)
  if (track)
    return {
      ...c,
      title: track.title,
      artist: track.artist,
      version,
      album: track.album,
      coverUrl: track.coverUrl ?? c.coverUrl,
      previewUrl: track.previewUrl,
      catalogId: track.id,
    }
  const { title, artist } = splitVideoTitle(c.title, c.artist)
  return { ...c, title: title || c.title, artist: artist || cleanChannelName(c.artist), version }
}

/** Tira repetições (a mesma faixa em coletâneas), mantendo a ordem de relevância. */
export function dedupeCandidates(list: SongCandidate[]): SongCandidate[] {
  const seen = new Set<string>()
  return list
    .filter((c) => {
      if (!c.title) return false
      const key = `${c.title}|${c.artist}|${c.version ?? ''}`.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 10)
}

async function searchDirect(q: string): Promise<SongCandidate[]> {
  const r = await jsonp<{ data?: DeezerTrack[]; error?: unknown }>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`)
  if (r.error || !Array.isArray(r.data)) throw new Error('Catálogo indisponível')
  return dedupeCandidates(r.data.map(candidateFromDeezer))
}

async function trackDirect(id: string): Promise<Pick<SongDetails, 'bpm' | 'year'>> {
  const t = await jsonp<DeezerTrack & { error?: unknown }>(`https://api.deezer.com/track/${id}`)
  if (t.error) throw new Error('Faixa não encontrada')
  return { bpm: t.bpm && t.bpm >= 40 && t.bpm <= 220 ? Math.round(t.bpm) : null, year: /^\d{4}/.exec(t.release_date ?? '')?.[0] ?? null }
}

// ---------------------------------------------------------------------------
// Busca e ficha
// ---------------------------------------------------------------------------

const useServer = () => !isDemo

/**
 * Buscas já feitas nesta sessão. Cada busca no YouTube gasta cerca de 1% da cota diária gratuita
 * da equipe, então apagar e redigitar o mesmo nome não busca de novo.
 */
const recentSearches = new Map<string, SongCandidate[]>()

export async function searchSongs(q: string): Promise<SongCandidate[]> {
  const query = clean(q)
  if (query.length < 2) return []
  const cacheKey = query.toLowerCase()
  const cached = recentSearches.get(cacheKey)
  if (cached) return cached
  let fromServer: SongCandidate[] | null = null
  let serverError: unknown = null
  if (useServer()) {
    try {
      const r = await backend.invoke<{ results?: SongCandidate[]; catalog?: SongCandidate[]; error?: string }>(IMPORT_FUNCTION, { action: 'buscar', q: query })
      if (r.results?.length) {
        const list = r.results.map((c) => (isYouTubeCandidate(c) ? candidateFromYouTube(c, r.catalog) : c))
        if (recentSearches.size >= 30) recentSearches.delete(recentSearches.keys().next().value!)
        recentSearches.set(cacheKey, list)
        return list
      }
      fromServer = r.results ?? null
    } catch (e) {
      serverError = e
    }
  }
  // Sem servidor, ou o catálogo não respondeu lá: tenta direto deste aparelho.
  try {
    return await searchDirect(query)
  } catch (e) {
    if (fromServer) return fromServer
    throw serverError ?? e
  }
}

/** Catálogo de temas e momentos que a IA pode escolher (inclui os temas da equipe). */
export function catalogFor(themes: Theme[]) {
  return {
    themes: themes.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    moments: MOMENTS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
  }
}

export async function completeSong(c: Pick<SongCandidate, 'id' | 'title' | 'artist' | 'album' | 'durationSec' | 'catalogId'>, themes: Theme[]): Promise<SongDetails> {
  if (useServer()) {
    const r = await backend.invoke<Partial<SongDetails> & { error?: string }>(IMPORT_FUNCTION, {
      action: 'completar',
      id: c.id,
      catalogId: c.catalogId ?? null,
      title: c.title,
      artist: c.artist,
      album: c.album,
      durationSec: c.durationSec,
      ...catalogFor(themes),
    })
    if (r.error) throw new Error(r.error)
    return normalizeDetails(r)
  }
  const deezerId = /^deezer:(\d+)$/.exec(c.id)?.[1]
  const track = deezerId ? await trackDirect(deezerId).catch(() => null) : null
  return { ...EMPTY_DETAILS, aiError: 'sem-servidor', bpm: track?.bpm ?? null, year: track?.year ?? null }
}

export function normalizeDetails(r: Partial<SongDetails>): SongDetails {
  return {
    ...EMPTY_DETAILS,
    ...r,
    originalKey: r.originalKey ? normalizeKeyName(r.originalKey) : null,
    themes: r.themes ?? [],
    moments: r.moments ?? [],
    bibleRefs: r.bibleRefs ?? [],
    meaning: r.meaning ?? '',
    arrangementNotes: r.arrangementNotes ?? '',
    content: r.content ?? null,
    sourceUrl: r.sourceUrl ?? null,
    sources: r.sources ?? [],
  }
}

/** Mensagem para quando a IA não completou a ficha. */
export function aiErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case undefined:
      return null
    case 'sem-chave':
      return 'A ficha automática precisa da chave da IA no servidor.'
    case 'sem-servidor':
      return 'A ficha automática funciona com o app conectado ao servidor.'
    case 'chave-invalida':
      return 'A chave da IA no servidor não é válida.'
    case 'sem-saldo':
      return 'A conta da IA está sem saldo. Coloque crédito em platform.deepseek.com.'
    case 'limite':
      return 'Muitas buscas seguidas. Tente de novo em instantes.'
    case 'tempo':
      return 'A pesquisa demorou demais. Tente de novo.'
    default:
      return 'Não deu para completar a ficha agora.'
  }
}

export const formatDuration = (sec: number | null) => (sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '')
