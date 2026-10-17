import { backend, isDemo } from './backend'
import { analyzeImport, tempoFromBpm, type ImportAnalysis } from './music/analyze'
import { splitVideoTitle, tidy, youtubeThumb, type MediaLink } from './media'
import { MOMENTS, MOMENT_BY_ID, THEMES, THEME_BY_ID, suggestMoments, suggestThemes, type Tempo } from './taxonomy'

/**
 * Importação rápida: dados públicos do link (título, artista, capa) e análise da letra.
 * Letra e cifra têm direitos autorais e não vêm do YouTube/Spotify — o membro cola a cifra
 * (de um site, PDF ou mensagem) e o app organiza e analisa o resto.
 */

// ---------------------------------------------------------------------------
// Dados públicos da faixa (oEmbed)
// ---------------------------------------------------------------------------

export interface LinkMetadata {
  provider: MediaLink['provider']
  title: string
  artist: string
  coverUrl: string | null
  durationSec: number | null
}

async function fetchJson<T>(url: string, ms = 6000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

interface OEmbed {
  title?: string
  author_name?: string
  thumbnail_url?: string
  error?: string
}

async function firstOk<T>(tasks: Array<() => Promise<T>>): Promise<T> {
  let lastError: unknown
  for (const task of tasks) {
    try {
      return await task()
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/**
 * Busca título, artista e capa. Com o Supabase configurado, o servidor do app faz a busca
 * (mais completo: traz o artista do Spotify e a duração). Sem servidor, tenta os serviços
 * públicos de oEmbed direto do navegador. Se nada responder, devolve o que dá para saber
 * pelo próprio link (a capa do YouTube sempre funciona).
 */
export async function fetchLinkMetadata(link: MediaLink): Promise<LinkMetadata> {
  const fallback: LinkMetadata = {
    provider: link.provider,
    title: '',
    artist: '',
    coverUrl: link.provider === 'youtube' ? youtubeThumb(link.id) : null,
    durationSec: null,
  }
  const fromOEmbed = (o: OEmbed): LinkMetadata => {
    if (o.error || !o.title) throw new Error(o.error ?? 'sem título')
    if (link.provider === 'youtube') {
      const { title, artist } = splitVideoTitle(o.title, o.author_name)
      return { ...fallback, title, artist }
    }
    return { ...fallback, title: tidy(o.title), artist: '', coverUrl: o.thumbnail_url ?? null }
  }
  const tasks: Array<() => Promise<LinkMetadata>> = []
  if (!isDemo)
    tasks.push(async () => {
      const r = await backend.invoke<Partial<LinkMetadata> & { rawTitle?: string; author?: string; error?: string }>('importar-musica', {
        action: 'metadata',
        url: link.url,
      })
      if (!r || r.error) throw new Error(r?.error ?? 'sem dados')
      const names = r.rawTitle ? splitVideoTitle(r.rawTitle, r.author) : { title: tidy(r.title ?? ''), artist: r.artist ?? '' }
      if (!names.title) throw new Error('sem título')
      return { ...fallback, ...names, coverUrl: r.coverUrl ?? fallback.coverUrl, durationSec: r.durationSec ?? null }
    })
  const encoded = encodeURIComponent(link.url)
  if (link.provider === 'youtube') {
    tasks.push(() => fetchJson<OEmbed>(`https://www.youtube.com/oembed?format=json&url=${encoded}`).then(fromOEmbed))
    tasks.push(() => fetchJson<OEmbed>(`https://noembed.com/embed?url=${encoded}`).then(fromOEmbed))
  } else {
    tasks.push(() => fetchJson<OEmbed>(`https://open.spotify.com/oembed?url=${encoded}`).then(fromOEmbed))
    tasks.push(() => fetchJson<OEmbed>(`https://noembed.com/embed?url=${encoded}`).then(fromOEmbed))
  }
  try {
    return await firstOk(tasks)
  } catch {
    return fallback
  }
}


// ---------------------------------------------------------------------------
// Ficha da música: temas, momentos, significado…
// ---------------------------------------------------------------------------

export interface SongAnalysis {
  themes: string[]
  moments: string[]
  meaning: string
  bibleRefs: string[]
  tempo: Tempo | null
  bpm: number | null
  /** De onde veio a análise. */
  source: 'ia' | 'local'
}

/** Rascunho do significado a partir dos temas (o membro ajusta com as palavras da equipe). */
export function draftMeaning(themes: string[], moments: string[]): string {
  const t = themes.map((id) => THEME_BY_ID[id]).filter(Boolean)
  if (!t.length) return ''
  const first = t[0].description.replace(/\.$/, '')
  const others = t.slice(1, 3).map((x) => (x.short ?? x.name).toLowerCase())
  const m = moments.map((id) => (MOMENT_BY_ID[id]?.short ?? MOMENT_BY_ID[id]?.name ?? '').toLowerCase()).filter(Boolean)
  let text = `${first}.`
  if (others.length) text += ` Também fala de ${others.join(' e ')}.`
  if (m.length) text += ` Funciona bem em ${m.slice(0, 2).join(' e ')}.`
  return text
}

export function analyzeLocally(input: { title: string; lyrics: string; bpm?: number | null; tempo?: Tempo | null }): SongAnalysis {
  const themes = suggestThemes(`${input.title}\n${input.lyrics}`)
  const tempo = input.tempo ?? tempoFromBpm(input.bpm)
  const moments = suggestMoments(themes, tempo)
  return { themes, moments, meaning: draftMeaning(themes, moments), bibleRefs: [], tempo, bpm: input.bpm ?? null, source: 'local' }
}

/** Há servidor com IA? (só dá para saber tentando; o resultado fica guardado.) */
let aiUnavailable = isDemo

export const aiAvailable = () => !aiUnavailable

/**
 * Análise com IA (Claude, pela função do servidor) — usa só o título, o artista e a letra
 * que a equipe colou. Sem servidor ou sem chave configurada, devolve null e o app usa a
 * análise local.
 */
export async function analyzeWithAI(input: { title: string; artist: string; lyrics: string }): Promise<SongAnalysis | null> {
  if (aiUnavailable) return null
  try {
    const r = await backend.invoke<Partial<SongAnalysis> & { error?: string }>('importar-musica', {
      action: 'analisar',
      title: input.title,
      artist: input.artist,
      lyrics: input.lyrics,
      themes: THEMES.map((t) => ({ id: t.id, name: t.name, description: t.description })),
      moments: MOMENTS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    })
    if (r.error) {
      if (r.error === 'sem-chave') aiUnavailable = true
      return null
    }
    return {
      themes: r.themes ?? [],
      moments: r.moments ?? [],
      meaning: r.meaning ?? '',
      bibleRefs: r.bibleRefs ?? [],
      tempo: r.tempo ?? null,
      bpm: r.bpm ?? null,
      source: 'ia',
    }
  } catch (e) {
    if ((e as { code?: string }).code === 'no-server') aiUnavailable = true
    return null
  }
}

export type { ImportAnalysis }
export { analyzeImport }
