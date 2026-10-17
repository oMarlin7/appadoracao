import { describe, expect, it } from 'vitest'
import { detectKeyFromText } from '@/lib/music/analyze'
import { docChords, docLyrics, parseSheet } from '@/lib/music/sheet'
import { buildSeedSongs } from './songs'

describe('acervo inicial', () => {
  const songs = buildSeedSongs(0)
  it.each(songs.map((s) => [s.title, s] as const))('%s tem cifra, letra e tom coerentes', (_t, s) => {
    const doc = parseSheet(s.content)
    expect(docChords(doc).length).toBeGreaterThan(4)
    expect(docLyrics(doc).length).toBeGreaterThan(40)
    expect(detectKeyFromText(s.content)).toBe(s.originalKey)
    // Ida e volta: o texto salvo continua sendo interpretado igual.
    expect(docLyrics(parseSheet(s.content))).toBe(docLyrics(doc))
  })
})
