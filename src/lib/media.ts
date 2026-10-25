/**
 * Links de YouTube e Spotify: reconhecer, montar o player embutido e buscar os dados
 * públicos da faixa (título, artista, capa). Letra e cifra NÃO vêm desses serviços.
 */

export type MediaLink =
  | { provider: 'youtube'; id: string; url: string }
  | { provider: 'spotify'; kind: 'track' | 'album' | 'playlist' | 'episode'; id: string; url: string }

const YT_ID = /^[\w-]{11}$/

export function parseMediaUrl(raw: string | null | undefined): MediaLink | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const sp = /^spotify:(track|album|playlist|episode):([A-Za-z0-9]{22})$/.exec(text)
  if (sp) return { provider: 'spotify', kind: sp[1] as 'track', id: sp[2], url: `https://open.spotify.com/${sp[1]}/${sp[2]}` }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return YT_ID.test(id) ? { provider: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` } : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id = url.searchParams.get('v') ?? ''
    const path = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname)
    if (path) id = path[1]
    return YT_ID.test(id) ? { provider: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` } : null
  }
  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    const m = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{22})/.exec(url.pathname)
    if (m) return { provider: 'spotify', kind: m[1] as 'track', id: m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}` }
  }
  return null
}

/** Separa vários links colados (um por linha, ou separados por espaço). */
export function extractMediaLinks(text: string): MediaLink[] {
  const seen = new Set<string>()
  const out: MediaLink[] = []
  for (const token of text.split(/[\s,;]+/)) {
    const link = parseMediaUrl(token)
    if (!link) continue
    const key = `${link.provider}:${link.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(link)
  }
  return out
}

export const youtubeThumb = (id: string, quality: 'hq' | 'mq' | 'max' = 'hq') =>
  `https://i.ytimg.com/vi/${id}/${quality === 'max' ? 'maxresdefault' : `${quality}default`}.jpg`

export function embedUrl(link: MediaLink, opts: { autoplay?: boolean } = {}): string {
  if (link.provider === 'youtube') {
    const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' })
    if (opts.autoplay) p.set('autoplay', '1')
    return `https://www.youtube-nocookie.com/embed/${link.id}?${p}`
  }
  return `https://open.spotify.com/embed/${link.kind}/${link.id}?utm_source=generator`
}

// ---------------------------------------------------------------------------
// Título do vídeo → música + artista
// ---------------------------------------------------------------------------

const NOISE = [
  /\((?:[^()]*?)(?:clipe|clip|v[ií]deo|video|official|oficial|lyric|letra|legendad|ao vivo|live|ac[uú]stic|playback|cover|vers[aã]o|audio|áudio|visualizer|hd|4k|remaster)[^()]*\)/gi,
  /\[(?:[^[\]]*?)(?:clipe|clip|v[ií]deo|video|official|oficial|lyric|letra|legendad|ao vivo|live|ac[uú]stic|playback|cover|vers[aã]o|audio|áudio|visualizer|hd|4k|remaster)[^[\]]*\]/gi,
  /\b(?:clipe|v[ií]deo)\s+oficial\b/gi,
  /\bofficial\s+(?:music\s+)?video\b/gi,
  /\blyric\s+video\b/gi,
  /\bcom\s+letra\b/gi,
  /#\S+/g,
]

export const tidy = (s: string) =>
  s
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—|:•·]+|[\s\-–—|:•·]+$/g, '')
    .trim()

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/vevo$|oficial$|official$|music$|-\s*topic$/g, '')
    .replace(/[^a-z0-9]/g, '')

const VERSION_WORD = /^(?:cover|ac[uú]stic[oa]|ao|vivo|live|playback|instrumental|legendad[oa]|lyrics?|video|v[ií]deo|clipe|clip|oficial|official|karaok[eê]|com|letra|vers[aã]o|hd|4k)$/i

/** "Cover acústico", "Ao Vivo", "Lyric Video": pedaço do título que é só a versão. */
const isVersionPart = (part: string) => part.split(/\s+/).every((w) => VERSION_WORD.test(w))

/** Nome do canal sem "VEVO", "- Topic", "Oficial"… */
export function cleanChannelName(author: string | null | undefined): string {
  return tidy(
    (author ?? '')
      .replace(/\s*-\s*topic$/i, '')
      .replace(/vevo$/i, '')
      .replace(/\b(?:oficial|official|music|m[uú]sica|channel|canal)\b\s*$/i, ''),
  )
}

/**
 * "Gabriela Rocha - Lugar Secreto (Ao Vivo)" → { title: 'Lugar Secreto', artist: 'Gabriela Rocha' }.
 * Usa o nome do canal para decidir de que lado do traço está o artista.
 */
export function splitVideoTitle(rawTitle: string, author?: string | null): { title: string; artist: string } {
  let t = rawTitle
  for (const re of NOISE) t = t.replace(re, ' ')
  t = tidy(t.replace(/\(\s*\)|\[\s*\]/g, ' '))
  const channel = cleanChannelName(author)
  const parts = t
    .split(/\s+[-–—|]\s+|\s+\/\/\s+/)
    .map(tidy)
    .filter((p) => p && !isVersionPart(p))
  if (parts.length >= 2) {
    const ch = normalizeName(channel)
    const idx = ch ? parts.findIndex((p) => {
      const n = normalizeName(p)
      return n && (n === ch || n.includes(ch) || ch.includes(n))
    }) : -1
    if (idx >= 0) {
      const artist = parts[idx]
      const title = parts.filter((_, i) => i !== idx).join(' - ')
      return { title: tidy(title), artist }
    }
    // Padrão mais comum nos vídeos: "Artista - Música".
    return { title: tidy(parts.slice(1).join(' - ')), artist: parts[0] }
  }
  // "Música | Artista" sem espaços, ou só o título: o artista é o canal.
  return { title: parts.length === 1 ? parts[0] : t, artist: channel }
}

export function youtubeSearchUrl(title: string, artist: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent([title, artist].filter(Boolean).join(' '))}`
}
