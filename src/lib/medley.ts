import { detectKeyFromText } from './music/analyze'
import { parseSheet, transposeDoc, type SheetDoc, type SheetSection } from './music/sheet'
import { makeSpeller, mod12, semitonesBetween } from './music/theory'
import type { Id, Song } from '@/types'

/**
 * Medley: duas ou mais músicas tocadas em sequência, que contam como uma música só. É uma
 * música como as outras (entra no setlist, na votação e na playlist), mas a cifra não é
 * guardada nela: vem de cada parte, então quem corrige a cifra de uma parte corrige o medley.
 */

export const isMedley = (song: Pick<Song, 'medleyIds'> | null | undefined): boolean => !!song?.medleyIds?.length

/** As partes que ainda existem, na ordem do medley (um medley não entra dentro de outro). */
export function medleyParts(song: Pick<Song, 'medleyIds'>, songs: Record<Id, Song>): Song[] {
  return (song.medleyIds ?? []).map((id) => songs[id]).filter((s): s is Song => !!s && !isMedley(s))
}

/** Tom em que a equipe toca a parte (o da equipe, senão o original). */
export const partKey = (song: Song): string | null => song.teamKey ?? song.originalKey ?? detectKeyFromText(song.content)

/** "Bondade de Deus + Eu Me Rendo" */
export const medleyTitle = (parts: Pick<Song, 'title'>[]) => parts.map((p) => p.title.trim()).join(' + ')

/** Os artistas das partes, sem repetir. */
export const medleyArtist = (parts: Pick<Song, 'artist'>[]) => [...new Set(parts.map((p) => p.artist.trim()).filter(Boolean))].join(', ')

/** Um medley com as mesmas músicas, na mesma ordem (para não criar dois iguais). */
export function findMedley(songs: Song[], ids: Id[]): Song | undefined {
  const key = ids.join('|')
  return songs.find((s) => isMedley(s) && s.medleyIds!.join('|') === key)
}

/**
 * A cifra do medley: cada parte no tom da equipe, uma depois da outra, com a primeira seção de
 * cada uma marcando onde ela começa. O tom do medley é o da primeira parte; transpor o medley
 * move todas juntas, e a passagem de uma para a outra continua igual.
 */
export function medleyDoc(parts: Song[]): { doc: SheetDoc; baseKey: string | null } {
  const sections: SheetSection[] = []
  parts.forEach((song, i) => {
    const parsed = parseSheet(song.content)
    const from = song.originalKey ?? detectKeyFromText(song.content)
    const to = partKey(song)
    const shift = from && to ? semitonesBetween(from, to) : 0
    const doc = mod12(shift) ? transposeDoc(parsed, shift, makeSpeller(to)) : parsed
    const part = { index: i + 1, songId: song.id, title: song.title, artist: song.artist, key: to }
    const [first, ...rest] = doc.sections.length ? doc.sections : [{ label: null, type: 'other' as const, lines: [] }]
    sections.push({ ...first, part }, ...rest)
  })
  return { doc: { meta: {}, sections }, baseKey: parts[0] ? partKey(parts[0]) : null }
}
