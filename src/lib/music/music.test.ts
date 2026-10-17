import { describe, expect, it } from 'vitest'
import { analyzeImport, detectKey } from './analyze'
import { isChord, isChordLine, transposeChord } from './chords'
import { docLyrics, docToText, isSectionLabel, isTabLine, parseSheet, sectionType, transposeDoc, transposeText } from './sheet'
import { keyCompatibility, makeSpeller, parseKey, semitonesBetween, suggestCapo, transposeKey } from './theory'

describe('tons', () => {
  it('interpreta tons', () => {
    expect(parseKey('G')).toMatchObject({ root: 7, minor: false })
    expect(parseKey('Em')).toMatchObject({ root: 4, minor: true })
    expect(parseKey('F#m')).toMatchObject({ root: 6, minor: true })
    expect(parseKey('bb')).toMatchObject({ root: 10, minor: false, letter: 'B', accidental: 'b' })
    expect(parseKey('A menor')).toMatchObject({ root: 9, minor: true })
    expect(parseKey('Santo')).toBeNull()
  })

  it('transpõe tons com a grafia usual', () => {
    expect(transposeKey('G', 2)).toBe('A')
    expect(transposeKey('G', -2)).toBe('F')
    expect(transposeKey('G', 3)).toBe('Bb')
    expect(transposeKey('Em', 3)).toBe('Gm')
    expect(transposeKey('Am', -1)).toBe('G#m')
    expect(transposeKey('C', 6, 'flat')).toBe('Gb')
    expect(semitonesBetween('G', 'F')).toBe(10)
  })

  it('soletra notas pelo grau dentro do tom', () => {
    const c = makeSpeller('C')
    expect(c.root(10)).toBe('Bb') // bVII
    expect(c.root(8)).toBe('Ab') // bVI
    expect(c.root(3)).toBe('Eb') // bIII
    expect(c.root(6)).toBe('F#') // #IV
    expect(c.root(1, true)).toBe('C#') // C#° de passagem
    expect(c.root(3, true)).toBe('D#') // D#° de passagem
    expect(makeSpeller('F').root(10)).toBe('Bb')
    expect(makeSpeller('E').root(10)).toBe('A#')
    expect(makeSpeller('G').bass(8, 'E')).toBe('G#') // E/G#
    expect(makeSpeller('C').bass(10, 'C')).toBe('Bb') // C/Bb
    expect(makeSpeller('Eb').root(1)).toBe('Db')
    expect(makeSpeller('Eb').root(4)).toBe('E') // evita Fb
  })

  it('sugere capotraste e mede transições', () => {
    expect(suggestCapo('G')).toBeNull()
    expect(suggestCapo('Bb')).toEqual({ capo: 1, shapeKey: 'A' })
    expect(suggestCapo('F')).toEqual({ capo: 1, shapeKey: 'E' })
    expect(keyCompatibility('G', 'G')).toBe(3)
    expect(keyCompatibility('G', 'Em')).toBe(2)
    expect(keyCompatibility('G', 'D')).toBe(2)
    expect(keyCompatibility('G', 'A')).toBe(1)
    expect(keyCompatibility('G', 'F#')).toBe(0)
  })
})

describe('acordes', () => {
  const valid = [
    'C', 'Cm', 'C7', 'C7M', 'Cmaj7', 'C7+', 'C9', 'C(9)', 'Cadd9', 'C4', 'Csus4', 'C7(4)', 'C7/9',
    'Cm7(b5)', 'Cº', 'C°', 'Cdim', 'C5+', 'Caug', 'C6', 'C6(9)', 'C/E', 'C#m7/G#', 'Bb7M(9)',
    'E7(9-)', 'Dm7(11)', 'D/F#', '(G)', 'A4/E', 'G7(13)', 'F#m7(b5)', 'Ebm', 'Dsus2', 'Bbø',
  ]
  it.each(valid)('reconhece %s', (c) => expect(isChord(c)).toBe(true))

  const invalid = ['Santo', 'Amém', 'De', 'Do', 'Bem', 'Fé', 'Deus', 'Ah', 'Eu', 'H', 'Cx', 'Ab(', 'Gloria']
  it.each(invalid)('ignora %s', (c) => expect(isChord(c)).toBe(false))

  it('transpõe preservando a qualidade e o baixo', () => {
    expect(transposeChord('D/F#', 2, makeSpeller('A'))).toBe('E/G#')
    expect(transposeChord('Bb7M(9)', 2, makeSpeller('D'))).toBe('C7M(9)')
    expect(transposeChord('G', 3, makeSpeller('Bb'))).toBe('Bb')
    expect(transposeChord('C#m7(b5)', -1, makeSpeller('C'))).toBe('Cm7(b5)')
    expect(transposeChord('(Em)', 5, makeSpeller('C'))).toBe('(Am)')
    expect(transposeChord('Refrão', 2, makeSpeller('A'))).toBe('Refrão')
    // Acorde diminuto de passagem sai com sustenido mesmo em tom "bemol"
    expect(transposeChord('C#°', 0, makeSpeller('C'))).toBe('C#°')
  })

  it('reconhece linhas de acordes', () => {
    expect(isChordLine('G   D/F#   Em   C')).toBe(true)
    expect(isChordLine('G D Em C (2x)')).toBe(true)
    expect(isChordLine('G  D  C  G  2x')).toBe(true)
    expect(isChordLine('| G  | D  | Em  | C  |')).toBe(true)
    expect(isChordLine('G D (repete a intro)')).toBe(true)
    expect(isChordLine('Santo, santo, santo')).toBe(false)
    expect(isChordLine('Em teus braços')).toBe(false)
    expect(isChordLine('E a')).toBe(false)
    expect(isChordLine('(repete 2x)')).toBe(false)
  })
})

describe('cifra', () => {
  const sample = `[Intro] G  D/F#  Em  C

[Primeira Parte]
G              C
Santo, santo, santo
       D        G
Deus onipotente

REFRÃO:
Em        C
  Aleluia, aleluia
(2x)

e|-----3-----2---|
B|---0---0-------|`

  it('separa seções, acordes e letra', () => {
    const doc = parseSheet(sample)
    expect(doc.sections.map((s) => s.label)).toEqual(['Intro', 'Primeira Parte', 'Refrão'])
    expect(doc.sections[0].lines[0]).toEqual({
      kind: 'chords',
      items: [{ chord: 'G' }, { chord: 'D/F#' }, { chord: 'Em' }, { chord: 'C' }],
    })
    const first = doc.sections[1].lines[0]
    expect(first).toEqual({
      kind: 'lyric',
      pieces: [
        { chord: 'G', text: 'Santo, santo, s' },
        { chord: 'C', text: 'anto' },
      ],
    })
    const second = doc.sections[1].lines[1]
    expect(second.kind === 'lyric' && second.pieces[0]).toEqual({ text: 'Deus on' })
    expect(doc.sections[2].type).toBe('chorus')
    const kinds = doc.sections[2].lines.map((l) => l.kind)
    expect(kinds).toEqual(['lyric', 'comment', 'blank', 'tab', 'tab'])
  })

  it('extrai só a letra', () => {
    expect(docLyrics(parseSheet(sample))).toBe('Santo, santo, santo\nDeus onipotente\n\nAleluia, aleluia')
  })

  it('entende ChordPro', () => {
    const doc = parseSheet('{title: Teste}\n{c: Refrão}\n[G]Santo, [C]santo\n[D] [G]')
    expect(doc.meta.title).toBe('Teste')
    expect(doc.sections[0].label).toBe('Refrão')
    expect(doc.sections[0].lines[0]).toEqual({
      kind: 'lyric',
      pieces: [
        { chord: 'G', text: 'Santo, ' },
        { chord: 'C', text: 'santo' },
      ],
    })
    expect(doc.sections[0].lines[1]).toEqual({ kind: 'chords', items: [{ chord: 'D' }, { chord: 'G' }] })
  })

  it('lê metadados do Cifra Club', () => {
    const doc = parseSheet('Tom: Bb\nCapotraste na 3ª casa\n[Intro] G D')
    expect(doc.meta.key).toBe('Bb')
    expect(doc.meta.capo).toBe(3)
    expect(parseSheet('Tom e luz').meta.key).toBeUndefined()
  })

  it('identifica rótulos de seção', () => {
    for (const l of ['Refrão', 'REFRÃO:', '2ª Parte', 'Primeira Parte', 'Pré-Refrão', 'Ponte (2x)', 'Verso 2', 'Final', 'Intro'])
      expect(isSectionLabel(l)).toBe(true)
    for (const l of ['Parte o pão', 'Finalmente livre', 'Santo santo']) expect(isSectionLabel(l)).toBe(false)
    expect(sectionType('Pré-Refrão')).toBe('prechorus')
    expect(sectionType('Ponte')).toBe('bridge')
  })

  it('reconhece tablatura', () => {
    expect(isTabLine('e|-----3-----2---|')).toBe(true)
    expect(isTabLine('|---0---0---|')).toBe(true)
    expect(isTabLine('Santo - santo')).toBe(false)
  })

  it('transpõe o documento e volta para texto', () => {
    const doc = transposeDoc(parseSheet(sample), 2, makeSpeller('A'))
    const text = docToText(doc)
    expect(text).toContain('[Intro] A  E/G#  F#m  D')
    expect(text).toContain('A              D\nSanto, santo, santo')
  })

  it('transpõe o texto mantendo a formatação', () => {
    const out = transposeText('[Intro] G  D/F#  Em  C\nG     C\nSanto santo\n[G]Ale[C]luia', 2, makeSpeller('A'))
    expect(out).toBe('[Intro] A  E/G#  F#m D\nA     D\nSanto santo\n[A]Ale[D]luia')
  })
})

describe('análise', () => {
  it('detecta o tom pelos acordes', () => {
    expect(detectKey(['G', 'D/F#', 'Em', 'C', 'G'])).toBe('G')
    expect(detectKey(['C', 'G', 'Am', 'F'])).toBe('C')
    expect(detectKey(['D', 'A', 'Bm', 'G', 'D'])).toBe('D')
    expect(detectKey(['E', 'B', 'C#m', 'A', 'E'])).toBe('E')
    expect(detectKey(['Bb', 'F', 'Gm', 'Eb', 'Bb'])).toBe('Bb')
    expect(detectKey(['Am', 'F', 'C', 'G', 'Am'])).toBe('Am')
    expect(detectKey(['Em', 'C', 'G', 'D', 'Em'])).toBe('Em')
    expect(detectKey(['C', 'Bb', 'F', 'C'])).toBe('C')
    expect(detectKey([])).toBeNull()
  })

  it('analisa uma cifra colada', () => {
    const r = analyzeImport(`Cifra Club
Grande Hino
Ministério Exemplo

Tom: D
[Intro] D  A  Bm  G

[Refrão]
D           A
Cantamos ao Rei`)
    expect(r.title).toBe('Grande Hino')
    expect(r.artist).toBe('Ministério Exemplo')
    expect(r.key).toBe('D')
    expect(r.keySource).toBe('texto')
    expect(r.chordCount).toBe(6)
    expect(r.content.startsWith('Tom: D')).toBe(true)
    expect(r.lyrics).toBe('Cantamos ao Rei')
  })

  it('detecta o tom quando o texto não informa', () => {
    const r = analyzeImport('[Intro] Am F C G\n\nAm      F\nTexto qualquer')
    expect(r.key).toBe('Am')
    expect(r.keySource).toBe('detectado')
    expect(r.title).toBeUndefined()
  })
})
