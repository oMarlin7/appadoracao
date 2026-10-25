// Supabase Edge Function · importar-musica
//
// Ações, chamadas pelo app (só membros logados, menos 'status'):
//   { action: 'buscar', q }        → vídeos do YouTube (título, canal, capa, duração) e, junto, as faixas
//                                     do Deezer para a mesma busca (o app tira delas o nome certo da música
//                                     e a prévia de 30 s); Deezer e iTunes no lugar só quando o YouTube
//                                     não responde
//   { action: 'completar', … }     → ficha da música escolhida: o nome como está no Cifra Club, a cifra+letra
//                                     da página achada pela busca do site (extrair-cifra.ts) e, com a chave
//                                     da IA, Spotify, tom, BPM, compasso, ritmo, temas, momentos,
//                                     significado, referências bíblicas e notas de arranjo (DeepSeek: busca
//                                     na web + modelo; dado da gravação só entra com a fonte)
//   { action: 'cifra', … }         → só a cifra+letra de uma música (título, artista e, se houver, o link)
//   { action: 'status' }           → o que está ligado no servidor (chave da IA, chave do YouTube); a
//                                     única ação que não pede login
//   { action: 'metadata', url }    → título, artista, capa e duração de um link do YouTube/Spotify
//   { action: 'analisar', … }      → temas, momentos, significado e referências a partir da letra
//
// Publicar:  supabase functions deploy importar-musica --no-verify-jwt
// Chave IA:  supabase secrets set DEEPSEEK_API_KEY=sk-...   (opcional: sem ela, a busca, a cifra e os
//            links funcionam, e o app tira temas e momentos da letra)
// YouTube:   supabase secrets set YOUTUBE_API_KEY=...   (YouTube Data API v3; sem ela, a busca usa o Deezer)
//
// O app usa a chave publicável (sb_publishable_…), que o verify_jwt da plataforma não
// entende; por isso a função confere o login de quem chama ela mesma (signedIn, abaixo).
//
// A cifra e a letra são extraídas do texto já publicado na página citada (nunca inventadas) e
// chegam ao app com a fonte para atribuição. A responsabilidade de ter licença para reproduzir
// o conteúdo (ex.: CCLI) é do ministério — a mesma que vale para o texto colado à mão.

import { isBibleRef } from './biblia.ts'
import { fetchSheet, findCifraPages, lyricsOnly, type CifraPage } from './extrair-cifra.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Só membros logados: o Auth do próprio projeto confirma a sessão enviada pelo app.
async function signedIn(req: Request): Promise<boolean> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1]
  const url = Deno.env.get('SUPABASE_URL')
  if (!token || !url || token.startsWith('sb_')) return false
  let apikey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  try {
    apikey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? apikey
  } catch {
    /* fica com a chave antiga */
  }
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })
  return res.ok
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function fetchText(url: string, ms = 8000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdoracaoApp/1.0)', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' },
    signal: AbortSignal.timeout(ms),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

const fetchJson = async <T>(url: string, ms = 8000): Promise<T> => JSON.parse(await fetchText(url, ms)) as T

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i')
  const v = re.exec(html)?.[1] ?? alt.exec(html)?.[1] ?? null
  return v ? decodeEntities(v) : null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const youtubeId = (url: string | null | undefined) =>
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url ?? '')?.[1] ?? null

const spotifyTrackId = (url: string | null | undefined) => /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/.exec(url ?? '')?.[1] ?? null

/** O vídeo existe? (o oEmbed do YouTube responde 404/401 para vídeos removidos ou privados) */
async function checkYouTube(url: string | null): Promise<string | null> {
  const id = youtubeId(url)
  if (!id) return null
  const canonical = `https://www.youtube.com/watch?v=${id}`
  try {
    const o = await fetchJson<{ title?: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`, 6000)
    return o.title ? canonical : null
  } catch {
    return null
  }
}

async function checkSpotify(url: string | null): Promise<string | null> {
  const id = spotifyTrackId(url)
  if (!id) return null
  const canonical = `https://open.spotify.com/track/${id}`
  try {
    const o = await fetchJson<{ title?: string }>(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`, 6000)
    return o.title ? canonical : null
  } catch {
    return null
  }
}

/** Só endereços web de verdade (a página da cifra é aberta pela equipe, nunca copiada aqui). */
function safeUrl(url: string | null): string | null {
  try {
    const u = new URL(url ?? '')
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

const cleanKey = (k: string | null) => {
  const v = clean(k).replace(/\s*(maior|major)$/i, '').replace(/\s*(menor|minor)$/i, 'm').replace(/♯/g, '#').replace(/♭/g, 'b')
  return /^[A-G][#b]?m?$/.test(v) ? v : null
}

const plausibleBpm = (n: number | null | undefined) => (n && n >= 40 && n <= 220 ? Math.round(n) : null)

// ---------------------------------------------------------------------------
// Busca por nome (YouTube; catálogo do Deezer e iTunes quando ele não responde)
// ---------------------------------------------------------------------------

interface Candidate {
  id: string
  title: string
  version: string | null
  artist: string
  album: string | null
  coverUrl: string | null
  durationSec: number | null
  previewUrl: string | null
  link: string | null
}

interface DeezerTrack {
  id: number
  title?: string
  title_short?: string
  title_version?: string
  duration?: number
  preview?: string
  link?: string
  bpm?: number
  isrc?: string
  release_date?: string
  artist?: { name?: string }
  album?: { title?: string; cover_big?: string; cover_xl?: string }
}

function fromDeezer(t: DeezerTrack): Candidate {
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

async function searchDeezer(q: string, limit = 15): Promise<Candidate[]> {
  // Erros do Deezer chegam com HTTP 200 e um objeto "error".
  const r = await fetchJson<{ data?: DeezerTrack[]; error?: { message?: string } }>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`)
  if (r.error || !Array.isArray(r.data)) throw new Error(r.error?.message ?? 'Deezer indisponível')
  return r.data.map(fromDeezer)
}

async function searchItunes(q: string): Promise<Candidate[]> {
  const r = await fetchJson<{ results?: Array<{ trackId: number; trackName?: string; artistName?: string; collectionName?: string; trackTimeMillis?: number }> }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&country=BR&limit=15`,
  )
  // Sem capa: a Apple só libera a arte para divulgar a própria loja.
  return (r.results ?? []).map((t) => ({
    id: `itunes:${t.trackId}`,
    title: clean(t.trackName),
    version: null,
    artist: clean(t.artistName),
    album: clean(t.collectionName) || null,
    coverUrl: null,
    durationSec: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
    previewUrl: null,
    link: null,
  }))
}

/** "PT4M5S" → 245 */
function isoDuration(d: string | undefined): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? '')
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || null : null
}

interface YouTubeVideo {
  id: string
  snippet?: { title?: string; channelTitle?: string }
  contentDetails?: { duration?: string }
}

/**
 * Busca no YouTube pela API oficial (YouTube Data API v3). Devolve o título do vídeo e o canal
 * como vieram; o app separa "Artista - Música" (mesma regra do link colado).
 */
async function searchYouTube(q: string, key: string): Promise<Candidate[]> {
  const params = new URLSearchParams({ part: 'id', type: 'video', videoEmbeddable: 'true', maxResults: '15', regionCode: 'BR', relevanceLanguage: 'pt', q, key })
  const found = await fetchJson<{ items?: Array<{ id?: { videoId?: string } }> }>(`https://www.googleapis.com/youtube/v3/search?${params}`)
  const ids = (found.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => !!id && /^[\w-]{11}$/.test(id))
  if (!ids.length) return []
  const videos = await fetchJson<{ items?: YouTubeVideo[] }>(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(',')}&key=${encodeURIComponent(key)}`)
  const byId = new Map((videos.items ?? []).map((v) => [v.id, v]))
  return ids
    .map((id) => byId.get(id))
    .filter((v): v is YouTubeVideo => !!v)
    .map((v) => ({
      id: `youtube:${v.id}`,
      title: clean(v.snippet?.title),
      version: null,
      artist: clean(v.snippet?.channelTitle),
      album: null,
      coverUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      durationSec: isoDuration(v.contentDetails?.duration),
      previewUrl: null,
      link: `https://www.youtube.com/watch?v=${v.id}`,
    }))
    // Fora os Shorts e as transmissões/compilações longas.
    .filter((c) => !c.durationSec || (c.durationSec >= 60 && c.durationSec <= 20 * 60))
}

/** Tira repetições (a mesma faixa em coletâneas), mantendo a ordem de relevância. */
function dedupe(list: Candidate[]): Candidate[] {
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

async function search(q: string) {
  const query = clean(q).slice(0, 120)
  if (query.length < 2) return { results: [], source: null }
  // O YouTube vem primeiro. Deezer e iTunes só se ele não responder (sem chave, cota do dia no fim…).
  const ytKey = Deno.env.get('YOUTUBE_API_KEY')
  if (ytKey) {
    // As faixas do Deezer vêm junto: dão o nome certo de cada vídeo e a prévia de 30 s.
    const [videos, catalog] = await Promise.all([
      searchYouTube(query, ytKey).catch((e): Candidate[] => {
        console.warn('[busca] YouTube não respondeu:', e instanceof Error ? e.message : e)
        return []
      }),
      searchDeezer(query, 25).catch((): Candidate[] => []),
    ])
    const results = dedupe(videos)
    if (results.length) return { results, catalog, source: 'youtube' }
    if (catalog.length) return { results: dedupe(catalog), source: 'deezer' }
  }
  try {
    return { results: dedupe(await searchDeezer(query)), source: 'deezer' }
  } catch {
    return { results: dedupe(await searchItunes(query)), source: 'itunes' }
  }
}

async function deezerTrack(id: string) {
  const t = await fetchJson<DeezerTrack & { error?: unknown }>(`https://api.deezer.com/track/${id}`)
  if (t.error) throw new Error('faixa não encontrada')
  return { bpm: plausibleBpm(t.bpm), year: /^\d{4}/.exec(t.release_date ?? '')?.[0] ?? null }
}

// ---------------------------------------------------------------------------
// IA (DeepSeek): busca na web e modelo de texto
// ---------------------------------------------------------------------------

const DEEPSEEK_URL = 'https://api.deepseek.com'
const MODEL = 'deepseek-flash'

/** Erro da IA, com o código que o app entende ('chave-invalida', 'sem-saldo', 'limite', 'tempo'…). */
class AIError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const timedOut = (e: unknown) => e instanceof Error && e.name === 'TimeoutError'

async function deepseek<T>(path: string, body: unknown, key: string, ms: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${DEEPSEEK_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    })
  } catch (e) {
    throw new AIError(timedOut(e) ? 'tempo' : 'falhou')
  }
  if (res.status === 401) throw new AIError('chave-invalida')
  if (res.status === 402) throw new AIError('sem-saldo')
  if (res.status === 429) throw new AIError('limite')
  if (!res.ok) throw new AIError(`api-${res.status}`)
  try {
    return JSON.parse(await res.text()) as T
  } catch (e) {
    throw new AIError(timedOut(e) ? 'tempo' : 'falhou')
  }
}

interface ChatResponse {
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>
}

/** Uma resposta em JSON do modelo, sem o modo de raciocínio (ligado por padrão e cobrado como saída). */
async function askJson<T>(system: string, user: string, key: string, ms: number): Promise<T> {
  const r = await deepseek<ChatResponse>(
    '/chat/completions',
    {
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 4000,
    },
    key,
    ms,
  )
  const choice = r.choices?.[0]
  if (choice?.finish_reason === 'content_filter') throw new AIError('recusado')
  const text = choice?.message?.content?.trim()
  if (choice?.finish_reason !== 'stop' || !text) throw new AIError('sem-resposta')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AIError('sem-resposta')
  }
}

interface WebResult {
  url: string
  title: string
  /** O resumo da página que a busca devolve para o modelo ler. */
  text: string
}

async function webSearch(query: string, key: string, count: number): Promise<WebResult[]> {
  try {
    const r = await deepseek<{ results?: Array<{ url?: string; title?: string; summary?: string; snippet?: string }> }>(
      '/v1/tools/search',
      { query: query.slice(0, 128), count },
      key,
      15_000,
    )
    return (r.results ?? [])
      .filter((x) => !!x.url && /^https?:\/\//.test(x.url))
      .map((x) => ({ url: x.url!, title: clean(x.title), text: clean(x.summary || x.snippet).slice(0, 900) }))
  } catch (e) {
    console.warn(`[ficha] busca falhou — ${query} — ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

/** As buscas da ficha, ao mesmo tempo, sem repetir páginas. */
async function searchSong(song: { title: string; artist: string }, wantVideo: boolean, key: string): Promise<WebResult[]> {
  const q = `${song.title} ${song.artist}`.trim()
  const lists = await Promise.all([
    webSearch(`${q} site:open.spotify.com`, key, 4),
    webSearch(`${q} bpm tom compasso`, key, 6),
    webSearch(`"${song.title}" ${song.artist} história significado da música lang:pt`, key, 6),
    webSearch(`"${song.title}" ${song.artist} como tocar arranjo lang:pt`, key, 5),
    wantVideo ? webSearch(`${q} site:youtube.com`, key, 4) : Promise.resolve<WebResult[]>([]),
  ])
  const seen = new Set<string>()
  const out: WebResult[] = []
  for (const r of lists.flat()) {
    if (seen.has(r.url)) continue
    seen.add(r.url)
    out.push(r)
  }
  return out.slice(0, 24)
}

// ---------------------------------------------------------------------------
// Ficha completa (busca na web + modelo)
// ---------------------------------------------------------------------------

interface CatalogItem {
  id: string
  name: string
  description?: string
}

interface CompleteInput {
  id?: string
  /** Faixa do Deezer que corresponde ao vídeo escolhido ('deezer:123'), para o BPM e o ano. */
  catalogId?: string | null
  title?: string
  artist?: string
  album?: string | null
  durationSec?: number | null
  themes?: CatalogItem[]
  moments?: CatalogItem[]
}

/** Um dado da gravação e o número do resultado da busca de onde ele veio. */
interface Cited<T> {
  value?: T | null
  source?: number | null
}

/** O que o modelo devolve (tudo é conferido antes de entrar na ficha). */
interface FichaIA {
  youtube?: number | null
  spotify?: number | null
  originalKey?: Cited<string> | null
  bpm?: Cited<number> | null
  timeSignature?: Cited<string> | null
  tempo?: string | null
  themes?: unknown
  moments?: unknown
  meaning?: unknown
  bibleRefs?: unknown
  arrangement?: { notes?: unknown; source?: number | null } | null
}

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8']
const TEMPOS = ['lenta', 'moderada', 'rapida']

const SYSTEM_FICHA = `Você ajuda o ministério de louvor de uma igreja evangélica brasileira a cadastrar músicas no repertório da equipe.
Recebe a música (nome e artista), a letra (quando houver), resultados de uma busca na web numerados [1], [2]… e os temas e momentos do culto disponíveis. Responda só com um objeto JSON, no formato do exemplo.

Regras:
- Dados da gravação (vídeo, Spotify, tom, BPM, compasso e arranjo): use somente o que está escrito nos resultados da busca e diga em "source" o número do resultado de onde veio. Se nenhum resultado traz o dado, use null. Nunca deduza, estime ou invente.
- youtube / spotify: o número do resultado que é o vídeo oficial / a faixa no Spotify desta música e deste artista; senão null.
- arrangement: só quando um resultado descreve com clareza como a gravação é tocada (introdução, instrumentos, partes que repetem, dinâmica, final). Frases curtas, uma por item. Não tire da letra nem da cifra e não sugira nada: sem essa descrição, arrangement é null.
- themes: de 2 a 4 ids, só da lista. moments: de 1 a 3 ids, só da lista.
- meaning: 2 ou 3 frases em português do Brasil, com suas palavras, sobre a mensagem e quando ela edifica no culto (pela letra e pelo que os resultados contam da música).
- bibleRefs: até 4 referências que dialogam com a mensagem, no formato "Salmos 23:1-3". Só referências que você tem certeza que existem.
- tempo: "lenta", "moderada" ou "rapida", pelo caráter da música.
- Nunca copie a letra nem trechos dela.

Exemplo de JSON:
{"youtube": null, "spotify": 2, "originalKey": {"value": "G", "source": 4}, "bpm": {"value": 72, "source": 4}, "timeSignature": {"value": null, "source": null}, "tempo": "lenta", "themes": ["adoracao", "nome-jesus"], "moments": ["adoracao"], "meaning": "…", "bibleRefs": ["Filipenses 2:9-11"], "arrangement": null}`

const mmss = (sec: number | null | undefined) => (sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : null)

const catalogText = (title: string, items: CatalogItem[]) =>
  [title, ...items.map((t) => `- ${t.id}: ${t.name}${t.description ? ` — ${t.description}` : ''}`)].join('\n')

function fichaPrompt(input: CompleteInput, song: { title: string; artist: string }, video: string | null, lyrics: string, results: WebResult[]): string {
  return [
    `Música: ${song.title}`,
    `Artista: ${song.artist || '(não informado)'}`,
    input.album ? `Álbum: ${clean(input.album)}` : null,
    mmss(input.durationSec) ? `Duração: ${mmss(input.durationSec)}` : null,
    video ? `Vídeo escolhido pela equipe (não precisa achar outro): ${video}` : null,
    '',
    lyrics ? `Letra:\n<letra>\n${lyrics.slice(0, 5000)}\n</letra>` : '(Sem a letra.)',
    '',
    'Resultados da busca:',
    results.length ? results.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.text}`).join('\n\n') : '(nenhum)',
    '',
    catalogText('Temas disponíveis (id: nome — descrição):', input.themes ?? []),
    '',
    catalogText('Momentos do culto (id: nome — descrição):', input.moments ?? []),
  ]
    .filter((l) => l !== null)
    .join('\n')
}

/** A fonte citada fala mesmo de como a música é tocada? */
const describesArrangement = (r: WebResult) =>
  /introdu|\bintro\b|teclado|piano|viol[aã]o|guitarra|bateria|baixo|refr[aã]o|ponte|solo|arranjo|dedilhad|batida|levada|crescend|instrument/i.test(`${r.title} ${r.text}`)

const ids = (v: unknown, allowed: Set<string>, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.has(x)))].slice(0, max) : []

const texts = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(clean).filter(Boolean) : [])

/** A função do Supabase é encerrada aos 150 s: a ficha inteira (busca, cifra e IA) cabe nisso. */
const COMPLETE_BUDGET_MS = 140_000

/** Vídeo do YouTube que a equipe escolheu na busca (o app abre o player dele). */
const chosenVideo = (input: CompleteInput) => {
  const id = /^youtube:([\w-]{11})$/.exec(input.id ?? '')?.[1]
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}

async function complete(input: CompleteInput) {
  const title = clean(input.title)
  if (!title) return { error: 'sem título' }
  const deadline = Date.now() + COMPLETE_BUDGET_MS
  const deezerId = /^deezer:(\d+)$/.exec(input.catalogId ?? input.id ?? '')?.[1]
  const key = Deno.env.get('DEEPSEEK_API_KEY')
  const themeIds = new Set((input.themes ?? []).map((t) => t.id))
  const momentIds = new Set((input.moments ?? []).map((m) => m.id))
  const video = chosenVideo(input)

  // O nome certo vem da busca do Cifra Club: corrige "Música - Artista" lido ao contrário e tira
  // "(Ao Vivo)", "Ato 3 - 04"… do título do vídeo, antes da pesquisa e da cifra.
  const pages: CifraPage[] = await findCifraPages(title, clean(input.artist)).catch(() => [])
  const name = pages[0] ? { title: pages[0].title, artist: pages[0].artist } : { title, artist: clean(input.artist) }

  // Cifra, catálogo e busca na web ao mesmo tempo.
  const [sheet, track, results] = await Promise.all([
    fetchSheet(name.title, name.artist, { pages }).catch(() => null),
    deezerId ? deezerTrack(deezerId).catch(() => null) : Promise.resolve(null),
    key ? searchSong(name, !video, key) : Promise.resolve<WebResult[]>([]),
  ])

  const base = {
    ia: false,
    year: track?.year ?? null,
    bpm: track?.bpm ?? null,
    title: pages[0]?.title ?? null,
    artist: pages[0]?.artist ?? null,
    content: sheet?.content ?? null,
    sourceUrl: sheet?.sourceUrl ?? null,
  }
  if (!key) return { ...base, aiError: 'sem-chave' }

  let f: FichaIA
  try {
    const lyrics = sheet ? lyricsOnly(sheet.content) : ''
    f = await askJson<FichaIA>(SYSTEM_FICHA, fichaPrompt(input, name, video, lyrics, results), key, Math.max(15_000, Math.min(75_000, deadline - Date.now())))
  } catch (e) {
    const code = e instanceof AIError ? e.code : 'falhou'
    console.warn(`[ficha] IA: ${code}`)
    return { ...base, aiError: code }
  }

  // Cada dado da gravação só entra com a fonte; links só os que apareceram na busca.
  const at = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= results.length ? results[n - 1] : null)
  const cited = new Set<WebResult>()
  const sourced = <T>(c: Cited<T> | null | undefined): T | null => {
    const r = at(c?.source)
    if (c?.value === null || c?.value === undefined || !r) return null
    cited.add(r)
    return c.value
  }
  const linkFrom = (n: unknown, isOk: (url: string) => boolean) => {
    const r = at(n)
    if (!r || !isOk(r.url)) return null
    cited.add(r)
    return r.url
  }
  const [youtubeUrl, spotifyUrl] = await Promise.all([
    video ?? checkYouTube(linkFrom(f.youtube, (u) => !!youtubeId(u))),
    checkSpotify(linkFrom(f.spotify, (u) => !!spotifyTrackId(u))),
  ])

  // Arranjo: só o que uma fonte descreve; na dúvida, fica vazio (nada de sugestão).
  const arrSource = at(f.arrangement?.source)
  const arrangement = arrSource && describesArrangement(arrSource) ? texts(f.arrangement?.notes).slice(0, 8) : []
  if (arrangement.length && arrSource) cited.add(arrSource)

  const bpm = plausibleBpm(Number(sourced(f.bpm)) || null)
  const timeSignature = sourced(f.timeSignature)
  const tempo = typeof f.tempo === 'string' && TEMPOS.includes(f.tempo) ? (f.tempo as 'lenta' | 'moderada' | 'rapida') : null
  return {
    ...base,
    ia: true,
    youtubeUrl,
    spotifyUrl,
    cifraUrl: sheet?.sourceUrl ?? null,
    // O tom da cifra vale mais (é nele que a equipe toca); sem cifra, o tom que uma fonte informa.
    originalKey: sheet ? sheet.originalKey : cleanKey(sourced(f.originalKey)),
    // O BPM do Deezer às vezes vem dobrado ou pela metade; o de uma fonte da busca vem primeiro.
    bpm: bpm ?? base.bpm,
    timeSignature: typeof timeSignature === 'string' && TIME_SIGNATURES.includes(timeSignature) ? timeSignature : null,
    tempo,
    themes: ids(f.themes, themeIds, 4),
    moments: ids(f.moments, momentIds, 3),
    meaning: typeof f.meaning === 'string' ? clean(f.meaning) : '',
    bibleRefs: texts(f.bibleRefs).filter(isBibleRef).slice(0, 4),
    arrangementNotes: arrangement.join('\n'),
    sources: [...cited, ...results.filter((r) => !cited.has(r))].slice(0, 8).map((r) => ({ url: r.url, title: r.title })),
  }
}

// ---------------------------------------------------------------------------
// Dados de um link do YouTube/Spotify
// ---------------------------------------------------------------------------

async function youtubeMetadata(url: string) {
  const o = JSON.parse(await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`))
  let durationSec: number | null = null
  try {
    const page = await fetchText(url)
    const m = /"lengthSeconds":"(\d+)"/.exec(page)
    if (m) durationSec = Number(m[1])
  } catch {
    /* duração é opcional */
  }
  const id = youtubeId(url)
  return {
    provider: 'youtube',
    // O app separa "Artista - Música" do título do vídeo (mesma regra do modo sem servidor).
    rawTitle: o.title as string,
    author: o.author_name as string,
    coverUrl: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : (o.thumbnail_url ?? null),
    durationSec,
  }
}

async function spotifyMetadata(url: string) {
  const page = await fetchText(url)
  const title = meta(page, 'og:title') ?? ''
  // og:description: "Artista · Música · 2017" (faixa) ou "Artista · Álbum · 2017"
  const desc = meta(page, 'og:description') ?? ''
  const artist = desc.split(' · ')[0] ?? ''
  const duration = Number(meta(page, 'music:duration')) || null
  return {
    provider: 'spotify',
    title,
    artist: artist === title ? '' : artist,
    coverUrl: meta(page, 'og:image'),
    durationSec: duration,
  }
}

// ---------------------------------------------------------------------------
// Análise da letra (temas, momentos, significado e referências)
// ---------------------------------------------------------------------------

interface AnalyzeInput {
  title?: string
  artist?: string
  lyrics?: string
  themes?: CatalogItem[]
  moments?: CatalogItem[]
}

const SYSTEM_ANALISE = `Você ajuda um ministério de louvor de uma igreja evangélica brasileira a organizar o repertório.
Recebe o título, o artista e (quando houver) a letra da música, e devolve uma ficha em JSON, no formato do exemplo.

Regras:
- Escolha temas e momentos SOMENTE entre os ids fornecidos. Temas: os 2 a 4 mais centrais. Momentos: 1 a 3 em que a música funciona bem no culto.
- "meaning": 2 ou 3 frases em português do Brasil explicando a mensagem da música e quando ela edifica (ex.: depois de uma palavra sobre fidelidade). Escreva com suas palavras; não copie versos.
- "bibleRefs": até 3 referências bíblicas que dialogam com a mensagem (formato "Salmos 23:1"). Só referências que você tem certeza que existem.
- "tempo": "lenta", "moderada" ou "rapida", pelo caráter da música.
- Nunca escreva, complete ou reproduza a letra da música.

Exemplo de JSON:
{"themes": ["fidelidade", "esperanca"], "moments": ["ministracao"], "meaning": "…", "bibleRefs": ["Lamentações 3:22-23"], "tempo": "lenta"}`

async function analyze(input: AnalyzeInput) {
  const key = Deno.env.get('DEEPSEEK_API_KEY')
  if (!key) return { error: 'sem-chave' }
  const themeIds = new Set((input.themes ?? []).map((t) => t.id))
  const momentIds = new Set((input.moments ?? []).map((m) => m.id))
  const catalog = [catalogText('Temas disponíveis (id: nome — descrição):', input.themes ?? []), '', catalogText('Momentos do culto (id: nome):', input.moments ?? [])].join('\n')
  const lyrics = (input.lyrics ?? '').slice(0, 12000)
  const song = [
    `Título: ${input.title || '(sem título)'}`,
    `Artista: ${input.artist || '(não informado)'}`,
    lyrics ? `\nLetra:\n<letra>\n${lyrics}\n</letra>` : '\n(Sem letra: use o que você sabe da música, se a conhecer.)',
  ].join('\n')

  const out = await askJson<{ themes?: unknown; moments?: unknown; meaning?: unknown; bibleRefs?: unknown; tempo?: unknown }>(SYSTEM_ANALISE, `${catalog}\n\n${song}`, key, 60_000)
  return {
    themes: ids(out.themes, themeIds, 4),
    moments: ids(out.moments, momentIds, 3),
    meaning: typeof out.meaning === 'string' ? out.meaning.trim() : '',
    bibleRefs: texts(out.bibleRefs).filter(isBibleRef).slice(0, 3),
    tempo: typeof out.tempo === 'string' && TEMPOS.includes(out.tempo) ? out.tempo : null,
    bpm: null,
  }
}

// ---------------------------------------------------------------------------
// Cifra e letra
// ---------------------------------------------------------------------------

async function buscarCifra(input: { title?: string; artist?: string; cifraUrl?: string | null }) {
  const title = clean(input.title)
  if (!title) return { error: 'sem título' }
  const sheet = await fetchSheet(title, clean(input.artist), { cifraUrl: safeUrl(input.cifraUrl ?? null) })
  if (!sheet) return { error: 'não encontrada' }
  return {
    content: sheet.content,
    originalKey: sheet.originalKey,
    bpm: sheet.bpm,
    source: sheet.source,
    sourceUrl: sheet.sourceUrl,
    title: sheet.title,
    artist: sheet.artist,
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  try {
    const body = await req.json()
    // Só diz o que está ligado (sem chamar nada lá fora), então não precisa de login.
    if (body.action === 'status') return json({ ia: !!Deno.env.get('DEEPSEEK_API_KEY'), youtube: !!Deno.env.get('YOUTUBE_API_KEY') })
    if (!(await signedIn(req))) return json({ error: 'entre na sua conta' }, 401)
    if (body.action === 'buscar') return json(await search(String(body.q ?? '')))
    if (body.action === 'completar') return json(await complete(body as CompleteInput))
    if (body.action === 'metadata') {
      const url = String(body.url ?? '')
      if (/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(url)) return json(await youtubeMetadata(url))
      if (/^https:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/[A-Za-z0-9]{22}$/.test(url)) return json(await spotifyMetadata(url))
      return json({ error: 'link não suportado' }, 400)
    }
    if (body.action === 'analisar') return json(await analyze(body as AnalyzeInput))
    if (body.action === 'cifra') return json(await buscarCifra(body as { title?: string; artist?: string; cifraUrl?: string | null }))
    return json({ error: 'ação desconhecida' }, 400)
  } catch (e) {
    // Erro da IA volta com o código para o app mostrar o aviso certo (sem chave, sem saldo…).
    if (e instanceof AIError) return json({ error: e.code })
    return json({ error: e instanceof Error ? e.message : 'erro' }, 500)
  }
})
