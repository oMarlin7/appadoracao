// Supabase Edge Function · importar-musica
//
// Ações, chamadas pelo app (só membros logados):
//   { action: 'buscar', q }        → músicas do catálogo do Deezer (título, artista, álbum, capa, duração)
//   { action: 'completar', … }     → ficha da música escolhida: vídeo oficial, Spotify, página da cifra,
//                                     tom, BPM, compasso, ritmo, temas, momentos, significado, referências
//                                     bíblicas, notas de arranjo (Claude com busca na web) e a cifra+letra
//                                     extraídas da página citada (extrair-cifra.ts)
//   { action: 'cifra', … }         → só a cifra+letra de uma música (título, artista e, se houver, o link)
//   { action: 'metadata', url }    → título, artista, capa e duração de um link do YouTube/Spotify
//   { action: 'analisar', … }      → ficha a partir da letra que o membro colou
//
// Publicar:  supabase functions deploy importar-musica --no-verify-jwt
// Chave IA:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (sem ela, a busca e os links
//            funcionam; a ficha completa precisa da chave)
//
// O app usa a chave publicável (sb_publishable_…), que o verify_jwt da plataforma não
// entende; por isso a função confere o login de quem chama ela mesma (signedIn, abaixo).
//
// A cifra e a letra são extraídas do texto já publicado na página citada (nunca inventadas) e
// chegam ao app com a fonte para atribuição. A responsabilidade de ter licença para reproduzir
// o conteúdo (ex.: CCLI) é do ministério — a mesma que vale para o texto colado à mão.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0'
import { fetchSheet } from './extrair-cifra.ts'

const MODEL = 'claude-opus-5-5'

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
// Busca por nome (catálogo do Deezer; iTunes se o Deezer não responder)
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

async function searchDeezer(q: string): Promise<Candidate[]> {
  // Erros do Deezer chegam com HTTP 200 e um objeto "error".
  const r = await fetchJson<{ data?: DeezerTrack[]; error?: { message?: string } }>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`)
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
// Ficha completa (Claude + busca na web)
// ---------------------------------------------------------------------------

interface CatalogItem {
  id: string
  name: string
  description?: string
}

interface CompleteInput {
  id?: string
  title?: string
  artist?: string
  album?: string | null
  durationSec?: number | null
  themes?: CatalogItem[]
  moments?: CatalogItem[]
}

interface Ficha {
  youtubeUrl: string | null
  spotifyUrl: string | null
  cifraUrl: string | null
  originalKey: string | null
  bpm: number | null
  timeSignature: string | null
  tempo: 'lenta' | 'moderada' | 'rapida' | null
  themes: string[]
  moments: string[]
  meaning: string
  bibleRefs: string[]
  arrangementNotes: string
}

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8']

const SYSTEM_FICHA = `Você ajuda o ministério de louvor de uma igreja evangélica brasileira a cadastrar músicas no repertório da equipe.
Recebe uma música escolhida num catálogo (título, artista, álbum, duração) e monta a ficha dela pesquisando na web.

O que pesquisar (de 3 a 5 buscas bem escolhidas costumam bastar):
- O vídeo oficial no YouTube: clipe, ao vivo ou lyric video publicado pelo artista, ministério ou gravadora. Evite covers e versões de terceiros.
- A faixa no Spotify (open.spotify.com/track/…).
- O endereço da página da cifra no Cifra Club (ou em outro site de cifras).
- O tom original, o BPM e o compasso da gravação original. Sites de cifra costumam mostrar o tom; sites de BPM mostram o andamento.
- O que se sabe da música: contexto, mensagem, o que o artista contou sobre ela.

Quando terminar, chame salvar_ficha uma única vez com tudo.

Regras:
- Links: só endereços que apareceram nos resultados da busca. Não monte links de cabeça.
- Na dúvida sobre um dado (link, tom, BPM, compasso), use null. Não invente.
- Tom em notação americana (C, G, Bb, F#m, Em…). BPM em número inteiro.
- Temas: os 2 a 4 mais centrais. Momentos do culto: 1 a 3 em que a música funciona bem.
- Significado: 2 ou 3 frases em português do Brasil, com suas palavras, sobre a mensagem e quando ela edifica no culto.
- Referências bíblicas: até 4, as que mais dialogam com a mensagem (formato "Salmos 23:1-3").
- Notas de arranjo: o que a equipe precisa para tocar como na gravação original, em frases curtas, uma por linha (como começa, quem entra quando, dinâmica, partes que repetem, como termina). Se não encontrar informação sobre a gravação, proponha um arranjo simples no estilo da música e comece com "Sugestão:".
- Nunca escreva, complete ou reproduza a letra ou a cifra da música, nem trechos delas.`

const nullable = (schema: Record<string, unknown>, description: string) => ({ anyOf: [schema, { type: 'null' }], description })

function fichaSchema(themeIds: string[], momentIds: string[]) {
  const pick = (ids: string[]) => (ids.length ? { type: 'string', enum: ids } : { type: 'string' })
  return {
    type: 'object' as const,
    properties: {
      youtubeUrl: nullable({ type: 'string' }, 'Vídeo oficial no YouTube, copiado de um resultado da busca'),
      spotifyUrl: nullable({ type: 'string' }, 'Faixa no Spotify (open.spotify.com/track/…), copiada de um resultado da busca'),
      cifraUrl: nullable({ type: 'string' }, 'Endereço da página da cifra (ex.: Cifra Club), copiado de um resultado da busca'),
      originalKey: nullable({ type: 'string' }, 'Tom da gravação original, ex.: G, Bb, F#m'),
      bpm: nullable({ type: 'integer' }, 'Andamento da gravação original'),
      timeSignature: nullable({ type: 'string', enum: TIME_SIGNATURES }, 'Compasso'),
      tempo: nullable({ type: 'string', enum: ['lenta', 'moderada', 'rapida'] }, 'Caráter da música'),
      themes: { type: 'array', items: pick(themeIds), description: 'Ids dos 2 a 4 temas mais centrais' },
      moments: { type: 'array', items: pick(momentIds), description: 'Ids de 1 a 3 momentos do culto' },
      meaning: { type: 'string', description: '2 ou 3 frases sobre a mensagem, com suas palavras' },
      bibleRefs: { type: 'array', items: { type: 'string' }, description: 'Até 4 referências, ex.: Salmos 23:1-3' },
      arrangementNotes: { type: 'string', description: 'Notas de arranjo, uma por linha' },
    },
    required: ['youtubeUrl', 'spotifyUrl', 'cifraUrl', 'originalKey', 'bpm', 'timeSignature', 'tempo', 'themes', 'moments', 'meaning', 'bibleRefs', 'arrangementNotes'],
    additionalProperties: false,
  }
}

const mmss = (sec: number | null | undefined) => (sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : null)

const catalogText = (title: string, items: CatalogItem[]) =>
  [title, ...items.map((t) => `- ${t.id}: ${t.name}${t.description ? ` — ${t.description}` : ''}`)].join('\n')

type Research = { ficha: Ficha; sources: Array<{ url: string; title: string }> } | { error: string }

/** A função do Supabase é encerrada aos 150 s: a pesquisa inteira cabe em menos que isso. */
const RESEARCH_BUDGET_MS = 115_000

async function research(input: CompleteInput, apiKey: string): Promise<Research> {
  const client = new Anthropic({ apiKey })
  const deadline = Date.now() + RESEARCH_BUDGET_MS
  const themes = input.themes ?? []
  const moments = input.moments ?? []
  const song = [
    `Música: ${clean(input.title)}`,
    `Artista: ${clean(input.artist) || '(não informado)'}`,
    input.album ? `Álbum: ${clean(input.album)}` : null,
    mmss(input.durationSec) ? `Duração: ${mmss(input.durationSec)}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const prompt = [song, '', catalogText('Temas disponíveis (id: nome — descrição):', themes), '', catalogText('Momentos do culto (id: nome — descrição):', moments)].join('\n')

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } },
    {
      name: 'salvar_ficha',
      description: 'Salva a ficha da música no repertório da equipe. Chame uma única vez, no final.',
      strict: true,
      input_schema: fichaSchema(
        themes.map((t) => t.id),
        moments.map((m) => m.id),
      ),
    },
  ]
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }]
  const sources = new Map<string, string>()

  for (let turn = 0; turn < 5; turn++) {
    const left = deadline - Date.now()
    if (left < 10_000) return { error: 'tempo' }
    const res = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        // Cada busca relê a conversa inteira; com o cache, o que já foi lido sai bem mais barato.
        cache_control: { type: 'ephemeral' },
        system: SYSTEM_FICHA,
        tools,
        messages,
      },
      // Só tenta de novo (ex.: servidor ocupado) se ainda houver tempo para uma pesquisa inteira.
      { timeout: left, maxRetries: left > 70_000 ? 1 : 0 },
    )
    for (const block of res.content)
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content))
        for (const r of block.content) if (r.type === 'web_search_result' && !sources.has(r.url)) sources.set(r.url, r.title)

    if (res.stop_reason === 'refusal') return { error: 'recusado' }
    const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'salvar_ficha')
    if (call && call.type === 'tool_use') return { ficha: call.input as Ficha, sources: [...sources].map(([url, title]) => ({ url, title })) }

    messages.push({ role: 'assistant', content: res.content })
    // pause_turn: a busca no servidor ainda não terminou; reenviar continua de onde parou.
    if (res.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Agora chame salvar_ficha com o que você encontrou (use null no que não encontrou).' })
  }
  return { error: 'sem-resposta' }
}

function aiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'chave-invalida'
  if (e instanceof Anthropic.RateLimitError) return 'limite'
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'tempo'
  if (e instanceof Anthropic.APIError) return `api-${e.status ?? 'erro'}`
  return 'falhou'
}

async function complete(input: CompleteInput) {
  const title = clean(input.title)
  if (!title) return { error: 'sem título' }
  const deezerId = /^deezer:(\d+)$/.exec(input.id ?? '')?.[1]
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const themeIds = new Set((input.themes ?? []).map((t) => t.id))
  const momentIds = new Set((input.moments ?? []).map((m) => m.id))

  const [track, ai] = await Promise.all([
    deezerId ? deezerTrack(deezerId).catch(() => null) : Promise.resolve(null),
    apiKey ? research(input, apiKey).catch((e): Research => ({ error: aiError(e) })) : Promise.resolve<Research>({ error: 'sem-chave' }),
  ])

  const base = { ia: false, year: track?.year ?? null, bpm: track?.bpm ?? null }
  const f = 'error' in ai ? null : ai.ficha
  const aiErr = 'error' in ai ? ai.error : null
  const sources = 'error' in ai ? [] : ai.sources

  // Cifra e letra: extrai o texto da página citada pela IA (ou tenta adivinhar a página).
  const sheet = await fetchSheet(title, clean(input.artist), f?.cifraUrl ? safeUrl(f.cifraUrl) : null).catch(() => null)

  if (!f) return { ...base, aiError: aiErr, content: sheet?.content ?? null, sourceUrl: sheet?.sourceUrl ?? null }

  const [youtubeUrl, spotifyUrl] = await Promise.all([checkYouTube(f.youtubeUrl), checkSpotify(f.spotifyUrl)])
  return {
    ...base,
    ia: true,
    youtubeUrl,
    spotifyUrl,
    cifraUrl: safeUrl(f.cifraUrl),
    originalKey: cleanKey(f.originalKey) ?? sheet?.originalKey ?? null,
    // O BPM do Deezer às vezes vem dobrado ou pela metade; o da pesquisa vem primeiro.
    bpm: plausibleBpm(f.bpm) ?? base.bpm,
    timeSignature: f.timeSignature && TIME_SIGNATURES.includes(f.timeSignature) ? f.timeSignature : null,
    tempo: f.tempo,
    themes: [...new Set(f.themes)].filter((id) => themeIds.has(id)).slice(0, 4),
    moments: [...new Set(f.moments)].filter((id) => momentIds.has(id)).slice(0, 3),
    meaning: clean(f.meaning),
    bibleRefs: f.bibleRefs.map(clean).filter(Boolean).slice(0, 4),
    arrangementNotes: f.arrangementNotes
      .split('\n')
      .map(clean)
      .filter(Boolean)
      .join('\n'),
    content: sheet?.content ?? null,
    sourceUrl: sheet?.sourceUrl ?? null,
    sources: sources.slice(0, 8),
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
// Análise da letra colada pela equipe
// ---------------------------------------------------------------------------

interface AnalyzeInput {
  title?: string
  artist?: string
  lyrics?: string
  themes?: CatalogItem[]
  moments?: CatalogItem[]
}

const SYSTEM_ANALISE = `Você ajuda um ministério de louvor de uma igreja evangélica brasileira a organizar o repertório.
Recebe o título, o artista e (quando houver) a letra que a equipe colou, e devolve uma ficha da música em JSON.

Regras:
- Escolha temas e momentos SOMENTE entre os ids fornecidos. Temas: os 2 a 4 mais centrais. Momentos: 1 a 3 em que a música funciona bem no culto.
- "meaning": 2 ou 3 frases em português do Brasil explicando a mensagem da música e quando ela edifica (ex.: depois de uma palavra sobre fidelidade). Escreva com suas palavras; não copie versos.
- "bibleRefs": até 3 referências bíblicas que dialogam com a mensagem (formato "Salmos 23:1").
- "tempo": lenta, moderada ou rapida, pelo caráter da música.
- "bpm": só se você conhece a gravação original com segurança; senão null.
- Nunca escreva, complete ou reproduza a letra da música.`

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    themes: { type: 'array', items: { type: 'string' } },
    moments: { type: 'array', items: { type: 'string' } },
    meaning: { type: 'string' },
    bibleRefs: { type: 'array', items: { type: 'string' } },
    tempo: { anyOf: [{ type: 'string', enum: ['lenta', 'moderada', 'rapida'] }, { type: 'null' }] },
    bpm: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
  },
  required: ['themes', 'moments', 'meaning', 'bibleRefs', 'tempo', 'bpm'],
  additionalProperties: false,
}

async function analyze(input: AnalyzeInput) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return { error: 'sem-chave' }
  const client = new Anthropic({ apiKey })

  const themeIds = new Set((input.themes ?? []).map((t) => t.id))
  const momentIds = new Set((input.moments ?? []).map((m) => m.id))
  const catalog = [catalogText('Temas disponíveis (id: nome — descrição):', input.themes ?? []), '', catalogText('Momentos do culto (id: nome):', input.moments ?? [])].join('\n')
  const lyrics = (input.lyrics ?? '').slice(0, 12000)
  const song = [
    `Título: ${input.title || '(sem título)'}`,
    `Artista: ${input.artist || '(não informado)'}`,
    lyrics ? `\nLetra colada pela equipe:\n<letra>\n${lyrics}\n</letra>` : '\n(Sem letra: use o que você sabe da música, se a conhecer.)',
  ].join('\n')

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
    system: SYSTEM_ANALISE,
    messages: [{ role: 'user', content: `${catalog}\n\n${song}` }],
  })

  if (response.stop_reason === 'refusal') return { error: 'recusado' }
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const out = JSON.parse(text) as {
    themes: string[]
    moments: string[]
    meaning: string
    bibleRefs: string[]
    tempo: 'lenta' | 'moderada' | 'rapida' | null
    bpm: number | null
  }
  return {
    themes: out.themes.filter((t) => themeIds.has(t)).slice(0, 4),
    moments: out.moments.filter((m) => momentIds.has(m)).slice(0, 3),
    meaning: out.meaning.trim(),
    bibleRefs: out.bibleRefs.slice(0, 3),
    tempo: out.tempo,
    bpm: plausibleBpm(out.bpm),
  }
}

// ---------------------------------------------------------------------------
// Cifra e letra
// ---------------------------------------------------------------------------

async function buscarCifra(input: { title?: string; artist?: string; cifraUrl?: string | null }) {
  const title = clean(input.title)
  if (!title) return { error: 'sem título' }
  const sheet = await fetchSheet(title, clean(input.artist), safeUrl(input.cifraUrl ?? null))
  if (!sheet) return { error: 'não encontrada' }
  return { content: sheet.content, originalKey: sheet.originalKey, bpm: sheet.bpm, source: sheet.source, sourceUrl: sheet.sourceUrl }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  try {
    if (!(await signedIn(req))) return json({ error: 'entre na sua conta' }, 401)
    const body = await req.json()
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
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'limite' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'chave inválida' }, 500)
    if (e instanceof Anthropic.APIError) return json({ error: `api ${e.status}` }, 502)
    return json({ error: e instanceof Error ? e.message : 'erro' }, 500)
  }
})
