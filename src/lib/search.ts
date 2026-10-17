import { docLyrics, parseSheet } from './music/sheet'
import { MOMENT_BY_ID, THEME_BY_ID } from './taxonomy'
import { normalizeSearch } from './utils'
import type { Song } from '@/types'

/**
 * Busca sem acento e tolerante: "graca" acha "Graça", "sl 23" acha "Salmos 23",
 * e procura no título, artista, significado, temas, tags, referências e letra.
 */

interface IndexEntry {
  stamp: string
  title: string
  artist: string
  meta: string
  lyrics: string
}

const cache = new Map<string, IndexEntry>()

const BOOK_ALIASES: Record<string, string> = {
  sl: 'salmos',
  salmo: 'salmos',
  is: 'isaias',
  jo: 'joao',
  mt: 'mateus',
  mc: 'marcos',
  lc: 'lucas',
  rm: 'romanos',
  ef: 'efesios',
  hb: 'hebreus',
  ap: 'apocalipse',
  gn: 'genesis',
  ex: 'exodo',
  fp: 'filipenses',
  cl: 'colossenses',
  at: 'atos',
  pv: 'proverbios',
}

export function lyricsOf(song: Song): string {
  return entry(song).lyrics
}

function entry(song: Song): IndexEntry {
  const stamp = song.updatedAt
  const hit = cache.get(song.id)
  if (hit && hit.stamp === stamp) return hit
  const lyrics = normalizeSearch(docLyrics(parseSheet(song.content)))
  const meta = normalizeSearch(
    [
      song.meaning,
      song.notes,
      ...song.tags,
      ...song.bibleRefs,
      ...song.themes.map((t) => THEME_BY_ID[t]?.name ?? t),
      ...song.moments.map((m) => MOMENT_BY_ID[m]?.name ?? m),
    ].join(' '),
  )
  const e = { stamp, title: normalizeSearch(song.title), artist: normalizeSearch(song.artist), meta, lyrics }
  cache.set(song.id, e)
  return e
}

function expandToken(t: string): string {
  return BOOK_ALIASES[t] ?? t
}

/** Pontuação de 0 (não bate) para cima. Todas as palavras da busca precisam aparecer. */
export function scoreSong(song: Song, query: string): number {
  const tokens = normalizeSearch(query).split(' ').filter(Boolean).map(expandToken)
  if (!tokens.length) return 1
  const e = entry(song)
  let total = 0
  for (const t of tokens) {
    let s = 0
    if (e.title.startsWith(t)) s = Math.max(s, 12)
    if (new RegExp(`\\b${escapeRe(t)}`).test(e.title)) s = Math.max(s, 9)
    else if (e.title.includes(t)) s = Math.max(s, 6)
    if (e.artist.includes(t)) s = Math.max(s, 5)
    if (e.meta.includes(t)) s = Math.max(s, 4)
    if (e.lyrics.includes(t)) s = Math.max(s, 2)
    if (s === 0) return 0
    total += s
  }
  // Frase inteira no título/letra vale mais.
  const phrase = tokens.join(' ')
  if (tokens.length > 1) {
    if (e.title.includes(phrase)) total += 10
    else if (e.lyrics.includes(phrase)) total += 5
  }
  return total
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function searchSongs(songs: Song[], query: string): Song[] {
  const q = query.trim()
  if (!q) return songs
  return songs
    .map((s) => ({ s, score: scoreSong(s, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title, 'pt-BR'))
    .map((x) => x.s)
}

/** Trecho da letra em volta do termo buscado, para mostrar no resultado. */
export function lyricSnippet(song: Song, query: string, radius = 38): string | null {
  const tokens = normalizeSearch(query).split(' ').filter((t) => t.length > 2)
  if (!tokens.length) return null
  const raw = docLyrics(parseSheet(song.content)).replace(/\n+/g, ' · ')
  // Mesmo comprimento do original (texto em NFC): tira só os acentos.
  const flat = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return snippetAt(raw, flat, tokens, radius)
}

function snippetAt(raw: string, flat: string, tokens: string[], radius: number): string | null {
  for (const t of tokens) {
    const idx = flat.indexOf(t)
    if (idx >= 0) {
      const start = Math.max(0, idx - radius)
      const end = Math.min(raw.length, idx + t.length + radius)
      return (start > 0 ? '…' : '') + raw.slice(start, end).trim() + (end < raw.length ? '…' : '')
    }
  }
  return null
}
