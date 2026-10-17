// Supabase Edge Function · importar-musica
//
// Duas ações, chamadas pelo app (usuário logado):
//   { action: 'metadata', url }   → título, artista, capa e duração de um link do YouTube/Spotify
//   { action: 'analisar', ... }   → temas, momentos, significado, referências e ritmo a partir
//                                    da letra que o membro colou (precisa de ANTHROPIC_API_KEY)
//
// Publicar:  supabase functions deploy importar-musica
// Chave IA:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (opcional)
//
// Letra e cifra têm direitos autorais: esta função não baixa nem escreve letras — só lê os
// dados públicos do link e analisa o texto que a própria equipe colou.

import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------------------------------------------------------------------------
// Dados do link
// ---------------------------------------------------------------------------

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdoracaoApp/1.0)', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

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
  const id = /[?&]v=([\w-]{11})/.exec(url)?.[1]
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
// Análise da letra (Claude)
// ---------------------------------------------------------------------------

interface AnalyzeInput {
  title?: string
  artist?: string
  lyrics?: string
  themes?: Array<{ id: string; name: string; description?: string }>
  moments?: Array<{ id: string; name: string; description?: string }>
}

const SYSTEM = `Você ajuda um ministério de louvor de uma igreja evangélica brasileira a organizar o repertório.
Recebe o título, o artista e (quando houver) a letra que a equipe colou, e devolve uma ficha da música em JSON.

Regras:
- Escolha temas e momentos SOMENTE entre os ids fornecidos. Temas: os 2 a 4 mais centrais. Momentos: 1 a 3 em que a música funciona bem no culto.
- "meaning": 2 ou 3 frases em português do Brasil explicando a mensagem da música e quando ela edifica (ex.: depois de uma palavra sobre fidelidade). Escreva com suas palavras; não copie versos.
- "bibleRefs": até 3 referências bíblicas que dialogam com a mensagem (formato "Salmos 23:1").
- "tempo": lenta, moderada ou rapida, pelo caráter da música.
- "bpm": só se você conhece a gravação original com segurança; senão null.
- Nunca escreva, complete ou reproduza a letra da música.`

const SCHEMA = {
  type: 'object',
  properties: {
    themes: { type: 'array', items: { type: 'string' } },
    moments: { type: 'array', items: { type: 'string' } },
    meaning: { type: 'string' },
    bibleRefs: { type: 'array', items: { type: 'string' } },
    tempo: { type: ['string', 'null'], enum: ['lenta', 'moderada', 'rapida', null] },
    bpm: { type: ['integer', 'null'] },
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
  const catalog = [
    'Temas disponíveis (id: nome — descrição):',
    ...(input.themes ?? []).map((t) => `- ${t.id}: ${t.name}${t.description ? ` — ${t.description}` : ''}`),
    '',
    'Momentos do culto (id: nome):',
    ...(input.moments ?? []).map((m) => `- ${m.id}: ${m.name}${m.description ? ` — ${m.description}` : ''}`),
  ].join('\n')
  const lyrics = (input.lyrics ?? '').slice(0, 12000)
  const song = [
    `Título: ${input.title || '(sem título)'}`,
    `Artista: ${input.artist || '(não informado)'}`,
    lyrics ? `\nLetra colada pela equipe:\n<letra>\n${lyrics}\n</letra>` : '\n(Sem letra: use o que você sabe da música, se a conhecer.)',
  ].join('\n')

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
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
    bpm: out.bpm && out.bpm >= 40 && out.bpm <= 220 ? out.bpm : null,
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  try {
    const body = await req.json()
    if (body.action === 'metadata') {
      const url = String(body.url ?? '')
      if (/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(url)) return json(await youtubeMetadata(url))
      if (/^https:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/[A-Za-z0-9]{22}$/.test(url)) return json(await spotifyMetadata(url))
      return json({ error: 'link não suportado' }, 400)
    }
    if (body.action === 'analisar') return json(await analyze(body as AnalyzeInput))
    return json({ error: 'ação desconhecida' }, 400)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'limite' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'chave inválida' }, 500)
    if (e instanceof Anthropic.APIError) return json({ error: `api ${e.status}` }, 502)
    return json({ error: e instanceof Error ? e.message : 'erro' }, 500)
  }
})
