import { describe, expect, it } from 'vitest'
import { findMedley, isMedley, medleyArtist, medleyDoc, medleyParts, medleyTitle } from './medley'
import { docChords, docLyrics, docToText } from './music/sheet'
import type { Song } from '@/types'

const song = (id: string, patch: Partial<Song>): Song => ({
  id,
  title: id,
  artist: '',
  originalKey: null,
  teamKey: null,
  bpm: null,
  timeSignature: null,
  tempo: null,
  themes: [],
  moments: [],
  tags: [],
  meaning: '',
  bibleRefs: [],
  content: '',
  notes: '',
  youtubeUrl: null,
  createdBy: null,
  createdAt: '2026-10-28T00:00:00Z',
  updatedAt: '2026-10-28T00:00:00Z',
  ...patch,
})

const bondade = song('bondade', {
  title: 'Bondade de Deus',
  artist: 'Isaías Saad',
  originalKey: 'G',
  content: ['[Intro] G  D  Em  C', '', '[Primeira Parte]', 'G           D', 'Te amo, Deus'].join('\n'),
})
// Tom original D, a equipe toca em E: no medley ela entra em E.
const rendo = song('rendo', {
  title: 'Eu Me Rendo',
  artist: 'Renascer Praise',
  originalKey: 'D',
  teamKey: 'E',
  content: ['[Refrão]', 'D          A', 'Eu me rendo'].join('\n'),
})
const medley = song('m1', { title: 'Bondade de Deus + Eu Me Rendo', medleyIds: ['bondade', 'rendo'] })
const songs = { bondade, rendo, m1: medley }

describe('medley', () => {
  it('é uma música feita de outras, na ordem escolhida', () => {
    expect(isMedley(medley)).toBe(true)
    expect(isMedley(bondade)).toBe(false)
    expect(medleyParts(medley, songs).map((s) => s.id)).toEqual(['bondade', 'rendo'])
    expect(medleyTitle([bondade, rendo])).toBe('Bondade de Deus + Eu Me Rendo')
    expect(medleyArtist([bondade, rendo, song('x', { artist: 'Isaías Saad' })])).toBe('Isaías Saad, Renascer Praise')
  })

  it('não repete um medley com as mesmas músicas na mesma ordem', () => {
    expect(findMedley(Object.values(songs), ['bondade', 'rendo'])?.id).toBe('m1')
    expect(findMedley(Object.values(songs), ['rendo', 'bondade'])).toBeUndefined()
  })

  it('pula a parte que foi excluída e não aceita medley dentro de medley', () => {
    const m2 = song('m2', { medleyIds: ['rendo', 'apagada', 'm1'] })
    expect(medleyParts(m2, songs).map((s) => s.id)).toEqual(['rendo'])
  })

  it('junta as cifras, cada parte no tom da equipe e marcada onde começa', () => {
    const { doc, baseKey } = medleyDoc([bondade, rendo])
    expect(baseKey).toBe('G')
    const starts = doc.sections.filter((s) => s.part).map((s) => [s.part!.index, s.part!.title, s.part!.key])
    expect(starts).toEqual([
      [1, 'Bondade de Deus', 'G'],
      [2, 'Eu Me Rendo', 'E'],
    ])
    // "Eu Me Rendo" sobe de D para E.
    expect(docChords(doc)).toEqual(['G', 'D', 'Em', 'C', 'G', 'D', 'E', 'B'])
  })

  it('copiar a cifra ou a letra mostra onde começa cada música', () => {
    const { doc } = medleyDoc([bondade, rendo])
    const text = docToText(doc)
    expect(text).toContain('1. Bondade de Deus · Tom G')
    expect(text).toContain('2. Eu Me Rendo · Tom E')
    expect(text.indexOf('Te amo, Deus')).toBeLessThan(text.indexOf('Eu me rendo'))
    expect(docLyrics(doc, { labels: true })).toContain('2. Eu Me Rendo · Tom E')
  })

  it('parte sem cifra ainda aparece no medley', () => {
    const vazia = song('vazia', { title: 'Sem cifra ainda' })
    const { doc } = medleyDoc([bondade, vazia])
    expect(doc.sections.filter((s) => s.part).map((s) => s.part!.title)).toEqual(['Bondade de Deus', 'Sem cifra ainda'])
  })
})
