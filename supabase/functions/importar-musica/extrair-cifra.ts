// Supabase Edge Function · importar-musica · extrair-cifra
//
// Extrai a cifra e a letra de uma página de cifra (Cifra Club, letras.mus.br e afins) e
// devolve o texto no formato que o app já lê: acordes na linha de cima, letra embaixo,
// seções entre colchetes. O texto é extraído da própria página citada — nunca inventado.
//
// O navegador não consegue buscar essas páginas (CORS e bloqueio anti-robô), então a
// extração roda aqui, no servidor, e o app recebe só o texto pronto. A página certa vem da
// busca do próprio Cifra Club, que também dá o nome da música como está lá.

export interface ExtractedSheet {
  content: string
  originalKey: string | null
  bpm: number | null
  /** De qual site veio (para atribuição na tela). */
  source: 'cifraclub' | 'letras' | 'lrclib' | 'web'
  sourceUrl: string | null
  /** Nome da música e do artista como estão no Cifra Club (quando a página veio da busca). */
  title: string | null
  artist: string | null
}

/** Página de uma música no Cifra Club, achada pela busca do próprio site. */
export interface CifraPage {
  url: string
  title: string
  artist: string
}

// ---------------------------------------------------------------------------
// HTML → texto
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;/gi, ' ')
}

function stripNonContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}

function cleanRun(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------------
// Acordes — mesma regra do app (src/lib/music/chords.ts)
// ---------------------------------------------------------------------------

const ROOT_RE = /^([A-G])([#b]?)/
const QUALITY_RE = /^(?:maj|min|dim|aug|sus|add|omit|no|alt|m|M|°|º|ø|Δ|\+|-|#|b|\d|\(|\)|,|\.|\/(?=[\d#b+\-(]))*$/

function unwrap(s: string): string {
  if (s.length > 2 && s.startsWith('(') && s.endsWith(')')) return s.slice(1, -1)
  return s
}

export function isChordToken(token: string): boolean {
  const s = unwrap(token.trim())
  if (!s || s.length > 12) return false
  const m = ROOT_RE.exec(s)
  if (!m) return false
  let rest = s.slice(m[0].length)
  const bass = /\/([A-G][#b]?)$/.exec(rest)
  if (bass) rest = rest.slice(0, bass.index)
  return QUALITY_RE.test(rest)
}

// Seções (mesma lógica de src/lib/music/sheet.ts)
const SECTION_RE =
  /^(?:intro(?:ducao)?|refrao|coro|chorus|verso|verse|estrofe|ponte|bridge|pre[- ]?(?:refrao|coro|chorus)|pos[- ]?refrao|solo|interludio|instrumental|final|outro|tag|parte|riff|vamp|coda|fim)(?:\s+\d+)?$/i

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isSectionLabelText(token: string): boolean {
  const t = stripAccents(token.trim()).replace(/:$/, '')
  return t.length > 0 && t.length <= 30 && SECTION_RE.test(t)
}

// ---------------------------------------------------------------------------
// Detecção do formato
// ---------------------------------------------------------------------------

function hasChordLine(text: string): boolean {
  return text.split('\n').some((raw) => {
    const t = raw.trim()
    if (!t || /^[\[{]/.test(t) || /^(tom|bpm|capo)\s*:/i.test(t)) return false
    const tokens = t.split(/\s+/)
    if (!tokens.length || tokens.length > 40) return false
    const chords = tokens.filter(isChordToken).length
    return chords > 0 && chords / tokens.length >= 0.5
  })
}

function looksLikeSheet(text: string): boolean {
  const t = text.trim()
  if (t.length < 20) return false
  return hasChordLine(t) || /^tom\s*:/im.test(t) || /\[(intro|refrao|verso|coro|ponte|parte)\]/i.test(t)
}

/**
 * Limpa quebras e espaços do fim das linhas. Os espaços do meio (e do começo) ficam: é a
 * coluna de cada acorde que diz em cima de qual sílaba ele cai.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u200b\ufeff]/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+$/g, '').replace(/\u00a0/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

/** Para texto que veio sem colunas (letra corrida): junta espaços repetidos. */
const collapseSpaces = (text: string) => text.split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').trim()).join('\n')

function keyFromText(content: string): string | null {
  const m = /^tom\s*:?\s*([A-G][#b]?m?)\b/im.exec(content)
  return m ? m[1] : null
}

function bpmFromText(content: string): number | null {
  const m = /bpm\s*:?\s*(\d{2,3})/i.exec(content)
  const n = m ? parseInt(m[1], 10) : NaN
  return n >= 40 && n <= 220 ? n : null
}

function sourceOf(url: string): ExtractedSheet['source'] {
  if (/cifraclub/i.test(url)) return 'cifraclub'
  if (/letras\.mus/i.test(url)) return 'letras'
  return 'web'
}

function finalize(content: string, source: ExtractedSheet['source']): ExtractedSheet {
  const normalized = normalizeText(content)
  return { content: normalized, originalKey: keyFromText(normalized), bpm: bpmFromText(normalized), source, sourceUrl: null, title: null, artist: null }
}

// ---------------------------------------------------------------------------
// 1) Bloco <pre> — Cifra Club (imprimir.html) e similares
// ---------------------------------------------------------------------------

/** Conteúdo de um <pre> → texto com as colunas dos acordes intactas. */
function preHtmlText(inner: string): string {
  return normalizeText(decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')))
}

/** HTML que o Jina devolve com X-Return-Format: html e X-Target-Selector: pre. */
export function jinaHtmlToSheet(html: string): string | null {
  const text = preText(stripNonContent(html))
  return text && looksLikeSheet(text) ? text : null
}

function preText(html: string): string | null {
  const re = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi
  let m: RegExpExecArray | null
  let best: string | null = null
  while ((m = re.exec(html))) {
    const text = preHtmlText(m[1])
    if (looksLikeSheet(text) && (!best || text.length > best.length)) best = text
  }
  return best
}

// ---------------------------------------------------------------------------
// 2) Parágrafos com acordes em <b>/<strong>/<u> — letras.mus.br e afins
// ---------------------------------------------------------------------------

function paragraphsToSheet(html: string): string {
  const blocks = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []
  const out: string[] = []
  for (const block of blocks) {
    const inner = block.replace(/^<p\b[^>]*>/i, '').replace(/<\/p>\s*$/i, '').replace(/<br\s*\/?>/gi, ' ')
    const re = /<(?:b|strong|u)\b[^>]*>([\s\S]*?)<\/(?:b|strong|u)>/gi
    let lyric = ''
    let chords = ''
    let last = 0
    let m: RegExpExecArray | null
    const flush = () => {
      if (chords.trim()) out.push(chords.trimEnd())
      if (lyric.trim()) out.push(lyric.trimEnd())
      lyric = ''
      chords = ''
    }
    while ((m = re.exec(inner))) {
      lyric += cleanRun(inner.slice(last, m.index))
      const token = cleanRun(m[1]).trim()
      if (isSectionLabelText(token)) {
        flush()
        out.push(`[${token}]`)
      } else if (isChordToken(token)) {
        let col = lyric.length
        if (chords.length > 0 && chords.length >= col) col = chords.length + (lyric === '' || lyric.endsWith(' ') ? 1 : 0)
        chords = chords.padEnd(col) + token
      } else {
        lyric += token
      }
      last = re.lastIndex
    }
    lyric += cleanRun(inner.slice(last))
    flush()
    out.push('')
  }
  return normalizeText(out.join('\n'))
}

// ---------------------------------------------------------------------------
// 3) Letra sem acordes (conteúdo dentro do container de letra)
// ---------------------------------------------------------------------------

function containerHtml(html: string): string | null {
  const patterns = [
    /<div\b[^>]*class=["'][^"']*cnt-letra[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*class=["'][^"']*cifra[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  ]
  for (const re of patterns) {
    const m = re.exec(html)
    if (m) return m[1]
  }
  return null
}

function bodyText(html: string): string {
  return normalizeText(
    collapseSpaces(
      decodeEntities(
        html
          .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' '),
      ),
    ),
  )
}

// ---------------------------------------------------------------------------
// Ponto de entrada da extração (puro: não faz rede)
// ---------------------------------------------------------------------------

export function extractSheetFromHtml(html: string, baseUrl: string): ExtractedSheet | null {
  const stripped = stripNonContent(html)
  const source = sourceOf(baseUrl)

  const pre = preText(stripped)
  if (pre) return { ...finalize(pre, source), sourceUrl: baseUrl }

  const region = containerHtml(stripped) ?? stripped
  const para = paragraphsToSheet(region)
  if (para && (hasChordLine(para) || /^\[/m.test(para))) return { ...finalize(para, source), sourceUrl: baseUrl }

  // Letra pura (sem acordes) só é aproveitada quando veio de um container de letra.
  if (region !== stripped) {
    const body = bodyText(region)
    if (body && body.length >= 40 && body.split('\n').length >= 2) return { ...finalize(body, source), sourceUrl: baseUrl }
  }
  return null
}

// ---------------------------------------------------------------------------
// Busca e extração (faz rede; roda no servidor)
// ---------------------------------------------------------------------------

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function slug(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

// ---------------------------------------------------------------------------
// Nome da música (título do vídeo → como a música se chama)
// ---------------------------------------------------------------------------

const VERSION_PART =
  /\b(?:ao vivo|live|ac[uú]stic[oa]|playback|instrumental|clipe|clip|oficial|official|v[ií]deo|video|lyric|letra|legendad[oa]|cover|vers[aã]o|remix|single|karaok[eê]|cifrad[oa]|hd|4k)\b/i
const NUMBERING_PART = /^(?:(?:ato|ep|parte|part|vol(?:ume)?|faixa|track|cap[ií]tulo|cd|dvd)\.?\s*)?\d{1,3}$/i

/** "ATO 3 - 04 - Grande é o Senhor (Great is the Lord) - Acústico Ao Vivo" → "Grande é o Senhor" */
export function cleanSongTitle(title: string): string {
  const base = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+(?:feat\.?|ft\.?|part\.|participa[cç][aã]o)\s.*$/i, ' ')
  const parts = base
    .split(/\s+[-–—|:]\s+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const kept = parts.filter((p) => !NUMBERING_PART.test(p) && !(VERSION_PART.test(p) && p.split(' ').length <= 4))
  return (kept.length ? kept : parts).join(' ').replace(/^\d{1,3}\s*[.)-]\s*/, '').trim()
}

/** "Adhemar de Campos e Nívea Soares" → "Adhemar de Campos" */
const mainArtist = (artist: string) => artist.split(/\s+(?:e|&|feat\.?|ft\.?|part\.?|com|x)\s+|,|\//i)[0].trim()

/** Para comparar nomes: sem acento, sem pontuação e sem o que está entre parênteses. */
const nameKey = (s: string) =>
  stripAccents(s)
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** 3: mesmo nome · 2: um contém o outro · 0: outro nome */
function sameName(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 3
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `) ? 2 : 0
}

/**
 * Escolhe, entre os resultados da busca, as páginas desta música. Título igual basta (um cover
 * usa a cifra da gravação original); título parecido precisa do artista certo. Também reconhece
 * título e artista trocados ("Autor da Vida - Aline Barros" lido ao contrário).
 */
export function pickCifraPages(hits: CifraPage[], title: string, artist: string): CifraPage[] {
  const t = nameKey(cleanSongTitle(title))
  const a = nameKey(artist)
  const scored = hits.map((h, i) => {
    const ht = nameKey(h.title)
    const ha = nameKey(h.artist)
    let tm = sameName(ht, t)
    let am = sameName(ha, a)
    if (!tm && a) {
      const swappedTitle = sameName(ht, nameKey(cleanSongTitle(artist)))
      const swappedArtist = sameName(ha, nameKey(title))
      if (swappedTitle && swappedArtist) [tm, am] = [swappedTitle, swappedArtist]
    }
    const ok = tm === 3 || (tm === 2 && (am > 0 || !a))
    return { h, score: ok ? tm * 10 + am * 4 - i * 0.1 : -1 }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((s) => s.h)
}

// ---------------------------------------------------------------------------
// Busca do Cifra Club (a mesma da caixa de busca do site)
// ---------------------------------------------------------------------------

interface CifraClubDoc {
  art?: string
  txt?: string
  dns?: string
  url?: string
}

async function searchCifraClub(q: string): Promise<CifraPage[]> {
  try {
    const res = await fetch(`https://solr.sscdn.co/cc/c7/?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = JSON.parse(await res.text()) as { response?: { docs?: CifraClubDoc[] } }
    // Só músicas (artistas e álbuns vêm sem o endereço da música).
    return (data.response?.docs ?? [])
      .filter((d) => d.txt && d.dns && d.url && /^[a-z0-9-]+$/.test(d.dns) && /^[a-z0-9-]+$/.test(d.url))
      .map((d) => ({ url: `https://www.cifraclub.com.br/${d.dns}/${d.url}/`, title: d.txt!.trim(), artist: (d.art ?? '').trim() }))
  } catch (e) {
    console.warn(`[cifra] busca falhou — ${q} — ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

/**
 * Páginas do Cifra Club desta música, da mais provável para a menos. O endereço não dá para
 * adivinhar ("grande-o-senhor", "grande--o-senhor"…), então a busca do site é a fonte.
 */
export async function findCifraPages(title: string, artist: string): Promise<CifraPage[]> {
  const t = cleanSongTitle(title)
  if (!t) return []
  const a = artist.trim()
  const main = mainArtist(a)
  const queries = [...new Set([a && `${t} ${a}`, main && main !== a && `${t} ${main}`, t].filter((q): q is string => !!q))]
  for (const q of queries) {
    const pages = pickCifraPages(await searchCifraClub(q), title, artist)
    if (pages.length) {
      console.log(`[cifra] busca: ${pages[0].url}`)
      return pages.slice(0, 2)
    }
  }
  return []
}

async function fetchLrclib(title: string, artist: string): Promise<string | null> {
  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = (await res.json()) as { plainLyrics?: string; syncedLyrics?: string }
    const plain = data.plainLyrics?.trim()
    if (plain && plain.length >= 40) return plain
    const synced = data.syncedLyrics
      ?.split('\n')
      .map((l) => l.replace(/^\[?\d{1,2}:\d{2}(?:\.\d+)?\]?\s*/, '').trim())
      .filter(Boolean)
      .join('\n')
    return synced && synced.length >= 40 ? synced : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Jina Reader (navegador real; contorna o Cloudflare do Cifra Club)
// ---------------------------------------------------------------------------

/** Converte o markdown do Jina (X-Target-Selector: pre) para o formato do app. */
export function jinaMarkdownToSheet(md: string): string {
  const out: string[] = []
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\u200b/g, '').trim()
    if (!line) {
      out.push('')
      continue
    }
    if (/^(Title:|URL Source:|Markdown Content:|## )/i.test(line)) continue
    if (/^Tom\s*:?\s*$/i.test(line)) continue
    if (/^\[Tab/i.test(line)) continue

    // rótulo de seção no início (ex.: "[Intro]")
    let lead = ''
    let body = line
    const leadM = /^\s*(\[[^\]]+\])\s*/.exec(body)
    if (leadM) {
      lead = leadM[1]
      body = body.slice(leadM[0].length)
    }
    // rótulos de seção no final (ex.: "[Primeira Parte]", "[Refrão]")
    const trail: string[] = []
    let trailM = /\s*(\[[^\]]+\])\s*$/.exec(body)
    while (trailM) {
      trail.unshift(trailM[1])
      body = body.slice(0, trailM.index)
      trailM = /\s*(\[[^\]]+\])\s*$/.exec(body)
    }
    // tira parênteses externos de linhas só de acordes: "( Dm G C/E )"
    if (body.startsWith('(') && body.endsWith(')')) body = body.slice(1, -1).trim()

    // acordes em **negrito**; o resto é letra
    const re = /\*\*([^*]+)\*\*/g
    let lyric = ''
    let chords = ''
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) {
      lyric += body.slice(last, m.index).replace(/\s+/g, ' ')
      const token = m[1].trim()
      if (isChordToken(token)) {
        let col = lyric.length
        if (chords.length > 0 && chords.length >= col) col = chords.length + (lyric === '' || lyric.endsWith(' ') ? 1 : 0)
        chords = chords.padEnd(col) + token
      } else {
        lyric += token
      }
      last = re.lastIndex
    }
    lyric += body.slice(last).replace(/\s+/g, ' ')
    lyric = lyric.trim()
    chords = chords.trim()

    if (lead) out.push(chords ? `${lead} ${chords}` : lead)
    else if (chords) out.push(chords)
    if (lyric) out.push(lyric)
    for (const l of trail) out.push(l)
  }
  return normalizeText(collapseSpaces(out.join('\n')))
}

/**
 * Lê a página por um navegador real (Jina). `html` mantém os espaços e as quebras de linha do
 * <pre>, ou seja, a posição de cada acorde; o `markdown` junta a linha dos acordes com a da letra.
 */
async function fetchJina(url: string, format: 'html' | 'markdown', ms: number): Promise<{ status: number; text: string | null }> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'User-Agent': UA, Accept: 'text/plain', 'X-Return-Format': format, 'X-Target-Selector': 'pre' },
      signal: AbortSignal.timeout(ms),
    })
    if (!res.ok) {
      console.warn(`[cifra] jina HTTP ${res.status} — ${url}`)
      return { status: res.status, text: null }
    }
    const text = await res.text()
    console.log(`[cifra] jina ok (${text.length} bytes) — ${url}`)
    return { status: res.status, text }
  } catch (e) {
    console.warn(`[cifra] jina falha — ${url} — ${e instanceof Error ? e.message : String(e)}`)
    return { status: 0, text: null }
  }
}

/**
 * Cifra de uma página: o HTML do <pre>, com cada acorde na coluna certa. Se o Jina não
 * responder em HTML, tenta o markdown (os acordes ficam na linha certa, mas sem a coluna).
 */
async function readSheet(url: string, ms = 25_000): Promise<string | null> {
  const html = await fetchJina(url, 'html', ms)
  if (html.text) return jinaHtmlToSheet(html.text)
  // A página não existe (ou não tem cifra): o markdown daria no mesmo.
  if (html.status === 404 || html.status === 422) return null
  const md = await fetchJina(url, 'markdown', ms)
  const content = md.text ? jinaMarkdownToSheet(md.text) : null
  return content && looksLikeSheet(content) ? content : null
}

/** Cifra+letra de uma página conhecida (ex.: a que a pesquisa da IA citou). */
export async function sheetFromPage(url: string, ms = 25_000, page?: CifraPage): Promise<ExtractedSheet | null> {
  const content = await readSheet(url, ms)
  if (!content) return null
  console.log(`[cifra] fonte: jina — ${url}`)
  return {
    content,
    originalKey: keyFromText(content),
    bpm: bpmFromText(content),
    source: sourceOf(url),
    sourceUrl: url,
    title: page?.title ?? null,
    artist: page?.artist ?? null,
  }
}

/**
 * Cifra+letra de uma música. Ordem: a página citada → as páginas que a busca do Cifra Club
 * achou (ou, sem nenhuma, o endereço adivinhado) → só a letra, no LRCLIB.
 * `pages` evita buscar de novo quando quem chama já buscou.
 */
export async function fetchSheet(
  title: string,
  artist: string,
  opts: { cifraUrl?: string | null; pages?: CifraPage[]; budgetMs?: number } = {},
): Promise<ExtractedSheet | null> {
  const t = title.trim()
  if (!t) return null
  const deadline = Date.now() + (opts.budgetMs ?? 45_000)
  const a = artist.trim()
  const pages = opts.pages ?? (await findCifraPages(t, a))
  const guessed = !pages.length && a ? [`https://www.cifraclub.com.br/${slug(mainArtist(a))}/${slug(cleanSongTitle(t))}/`] : []
  const urls = [...new Set([opts.cifraUrl, ...pages.map((p) => p.url), ...guessed].filter((u): u is string => !!u))]

  for (const url of urls) {
    const left = deadline - Date.now()
    if (left < 3000) break
    const sheet = await sheetFromPage(url, Math.min(25_000, left), pages.find((p) => p.url === url) ?? pages[0])
    if (sheet) return sheet
  }

  // Só a letra (sem acordes), com o nome certo quando a busca achou a música.
  if (Date.now() < deadline) {
    const lyrics = await fetchLrclib(pages[0]?.title ?? cleanSongTitle(t), pages[0]?.artist ?? a)
    if (lyrics) {
      console.log('[cifra] fonte: lrclib (só letra)')
      return { content: lyrics, originalKey: null, bpm: null, source: 'lrclib', sourceUrl: 'https://lrclib.net/', title: pages[0]?.title ?? null, artist: pages[0]?.artist ?? null }
    }
  }
  console.warn(`[cifra] nada encontrado para "${title}" / "${artist}"`)
  return null
}
