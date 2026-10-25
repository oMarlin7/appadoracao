// Supabase Edge Function · importar-musica · extrair-cifra
//
// Extrai a cifra e a letra de uma página de cifra (Cifra Club, letras.mus.br e afins) e
// devolve o texto no formato que o app já lê: acordes na linha de cima, letra embaixo,
// seções entre colchetes. O texto é extraído da própria página citada — nunca inventado.
//
// O navegador não consegue buscar essas páginas (CORS e bloqueio anti-robô), então a
// extração roda aqui, no servidor, e o app recebe só o texto pronto.

export interface ExtractedSheet {
  content: string
  originalKey: string | null
  bpm: number | null
  /** De qual site veio (para atribuição na tela). */
  source: 'cifraclub' | 'letras' | 'lrclib' | 'web'
  sourceUrl: string | null
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

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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
  return { content: normalized, originalKey: keyFromText(normalized), bpm: bpmFromText(normalized), source, sourceUrl: null }
}

// ---------------------------------------------------------------------------
// 1) Bloco <pre> — Cifra Club (imprimir.html) e similares
// ---------------------------------------------------------------------------

function preText(html: string): string | null {
  const re = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi
  let m: RegExpExecArray | null
  let best: string | null = null
  while ((m = re.exec(html))) {
    const text = normalizeText(m[1].replace(/<[^>]+>/g, '\n'))
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
    html
      .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
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
  return normalizeText(out.join('\n'))
}

async function fetchJina(url: string, ms = 25_000): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'User-Agent': UA, Accept: 'text/plain', 'X-Return-Format': 'markdown', 'X-Target-Selector': 'pre' },
      signal: AbortSignal.timeout(ms),
    })
    if (!res.ok) {
      console.warn(`[cifra] jina HTTP ${res.status} — ${url}`)
      return null
    }
    const text = await res.text()
    console.log(`[cifra] jina ok (${text.length} bytes) — ${url}`)
    return text
  } catch (e) {
    console.warn(`[cifra] jina falha — ${url} — ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** Acha a página da cifra no Cifra Club pela busca do Jina (quando o slug adivinhado erra). */
async function findCifraUrlViaSearch(title: string, artist: string): Promise<string | null> {
  try {
    const q = `${title} ${artist} cifraclub`
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/plain' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    const m = /https?:\/\/(?:www\.)?cifraclub\.com\.br\/[^\s)"'<>]+/i.exec(text)
    if (m) {
      const url = m[0].replace(/[.,;)\]]+$/, '')
      console.log(`[cifra] busca achou: ${url}`)
      return url
    }
    return null
  } catch {
    return null
  }
}

/**
 * Tenta extrair cifra+letra de uma música.
 * Ordem: Jina (navegador real) → busca do Jina → LRCLIB (letra).
 */
export async function fetchSheet(
  title: string,
  artist: string,
  cifraUrl?: string | null,
  budgetMs = 45_000,
): Promise<ExtractedSheet | null> {
  const t = title.trim()
  if (!t) return null
  const deadline = Date.now() + budgetMs
  const a = artist.trim()

  // Candidatos: link exato da IA → cifraclub adivinhado → letras.mus adivinhado.
  const candidates: string[] = []
  if (cifraUrl) candidates.push(cifraUrl)
  if (a) {
    candidates.push(`https://www.cifraclub.com.br/${slug(a)}/${slug(t)}/`)
    candidates.push(`https://www.letras.mus.br/${slug(a)}/${slug(t)}/`)
  }
  const unique = [...new Set(candidates.filter(Boolean))]

  // 1) Jina sobre cada candidato (navegador real; contorna o Cloudflare).
  for (const url of unique) {
    if (Date.now() > deadline) break
    const md = await fetchJina(url)
    if (!md) continue
    const content = jinaMarkdownToSheet(md)
    if (content && looksLikeSheet(content)) {
      console.log(`[cifra] fonte: jina — ${url}`)
      return { content, originalKey: keyFromText(content), bpm: bpmFromText(content), source: sourceOf(url), sourceUrl: url }
    }
  }

  // 2) Se o slug adivinhado não achou, busca a página certa e tenta de novo.
  if (Date.now() <= deadline && a) {
    const found = await findCifraUrlViaSearch(t, a)
    if (found && !unique.includes(found)) {
      const md = await fetchJina(found)
      if (md) {
        const content = jinaMarkdownToSheet(md)
        if (content && looksLikeSheet(content)) {
          console.log(`[cifra] fonte: jina (via busca) — ${found}`)
          return { content, originalKey: keyFromText(content), bpm: bpmFromText(content), source: 'cifraclub', sourceUrl: found }
        }
      }
    }
  }

  // 3) Letra (sem acordes) via LRCLIB.
  if (Date.now() <= deadline) {
    const lyrics = await fetchLrclib(t, a)
    if (lyrics) {
      console.log('[cifra] fonte: lrclib (só letra)')
      return { content: lyrics, originalKey: null, bpm: null, source: 'lrclib', sourceUrl: 'https://lrclib.net/' }
    }
  }
  console.warn(`[cifra] nada encontrado para "${title}" / "${artist}"`)
  return null
}


