import { describe, expect, it } from 'vitest'
import { cleanCuts, cutRange, findMedley, isMedley, medleyArtist, medleyDoc, medleyParts, medleyTitle, rangeText, sectionRef, songSections } from './medley'
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

describe('onde troca de música', () => {
  const ponte = song('ponte', {
    title: 'Grande É o Senhor',
    originalKey: 'G',
    content: ['[Intro] G  C', '', '[Verso]', 'G       C', 'Grande é o Senhor', '', '[Refrão]', 'G     D', 'Santo, santo', '', '[Ponte]', 'Em    C', 'Digno de louvor', '', '[Refrão]', 'G     D', 'Santo outra vez'].join('\n'),
  })
  const entra = song('entra', {
    title: 'Ele Vive',
    originalKey: 'A',
    content: ['[Intro] A  E', '', '[Verso]', 'A       E', 'Ele vive', '', '[Refrão]', 'A     E', 'Ressuscitou'].join('\n'),
  })

  it('dá nome a cada seção, contando as repetidas', () => {
    expect(songSections(ponte).map((o) => o.name)).toEqual(['Intro', 'Verso', 'Refrão (1ª vez)', 'Ponte', 'Refrão (2ª vez)'])
    expect(songSections(ponte)[2].snippet).toBe('Santo, santo')
  })

  it('a cifra e a letra mostram só o trecho escolhido, com o aviso da troca', () => {
    const opts = songSections(ponte)
    const cuts = { ponte: { to: sectionRef(opts, 3, 'to') }, entra: { from: sectionRef(songSections(entra), 2, 'from') } }
    const { doc } = medleyDoc([ponte, entra], cuts)
    expect(doc.sections.map((s) => s.label)).toEqual(['Intro', 'Verso', 'Refrão', 'Ponte', 'Refrão'])
    expect(doc.sections[0].part?.range).toBe('começo → Ponte')
    expect(doc.sections[3].cue).toEqual({ index: 2, title: 'Ele Vive', entry: 'Refrão', key: 'A' })
    expect(doc.sections[4].part?.range).toBe('Refrão → fim')
    const text = docToText(doc)
    expect(text).not.toContain('Santo outra vez')
    expect(text).not.toContain('Ele vive')
    expect(text).toContain('→ Troca para 2. Ele Vive (entra em: Refrão · Tom A)')
    expect(docLyrics(doc, { labels: true })).toContain('→ Troca para 2. Ele Vive')
  })

  it('música inteira quando não há trecho, e "começo"/"fim" não viram trecho', () => {
    const opts = songSections(ponte)
    expect(sectionRef(opts, 0, 'from')).toBeNull()
    expect(sectionRef(opts, 4, 'to')).toBeNull()
    expect(rangeText(opts, cutRange(opts, null))).toBeUndefined()
    expect(cleanCuts({ ponte: { from: null, to: null }, sumiu: { to: { index: 1, label: 'Verso' } } }, ['ponte', 'entra'])).toBeNull()
  })

  it('acha a mesma seção mesmo depois de editarem a cifra', () => {
    // Guardado: "Ponte" na posição 3. Alguém pôs um Pré-Refrão antes: a Ponte foi para a 4.
    const editada = song('ponte', { ...ponte, content: ponte.content.replace('[Refrão]', '[Pré-Refrão]\nC   D\nPra ele\n\n[Refrão]') })
    const opts = songSections(editada)
    expect(cutRange(opts, { to: { index: 3, label: 'Ponte' } })).toEqual([0, 4])
    // A seção sumiu: a música volta a ir até o fim.
    expect(cutRange(opts, { to: { index: 3, label: 'Coda' } })).toEqual([0, opts.length - 1])
  })

  it('começo depois do fim não quebra: vai ao menos até o começo', () => {
    const opts = songSections(ponte)
    expect(cutRange(opts, { from: { index: 3, label: 'Ponte' }, to: { index: 1, label: 'Verso' } })).toEqual([3, 3])
  })

  it('medley com outros trechos não é o mesmo medley', () => {
    const a = song('a1', { medleyIds: ['ponte', 'entra'], medleyCuts: { ponte: { to: { index: 3, label: 'Ponte' } } } })
    expect(findMedley([a], ['ponte', 'entra'], { ponte: { to: { index: 3, label: 'Ponte' } } })?.id).toBe('a1')
    expect(findMedley([a], ['ponte', 'entra'])).toBeUndefined()
  })
})
