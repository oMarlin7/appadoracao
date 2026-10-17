/**
 * Teoria musical básica: notas, tons e grafia de acidentes.
 *
 * As alturas são classes de altura (0 = Dó … 11 = Si).
 */

export type Accidental = 'sharp' | 'flat'
/** Preferência do usuário: grafia automática (pelo tom), sempre sustenido ou sempre bemol. */
export type AccidentalPref = 'auto' | Accidental

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/** Nomes em solfejo, como os músicos brasileiros falam. */
export const SOLFEGE: Record<string, string> = {
  C: 'Dó',
  D: 'Ré',
  E: 'Mi',
  F: 'Fá',
  G: 'Sol',
  A: 'Lá',
  B: 'Si',
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Grafia preferida de cada tom maior / menor (índice = classe de altura da tônica). */
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']

/**
 * Quantas letras acima da tônica fica cada grau cromático (lado "bemol", o mais
 * comum para acordes emprestados: bIII, bVI, bVII…). O #4 é a exceção (D/F# em Dó).
 *   0 I · 1 b2 · 2 2 · 3 b3 · 4 3 · 5 4 · 6 #4 · 7 5 · 8 b6 · 9 6 · 10 b7 · 11 7
 */
const DEGREE_STEPS_FLAT_SIDE = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]
/** Acordes diminutos de passagem costumam ser sustenidos (C#°, D#°, G#°). */
const DEGREE_STEPS_SHARP_SIDE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]

/** Letras acima da fundamental para cada intervalo (para soletrar o baixo: E/G#, C/Bb). */
const INTERVAL_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]

export const mod12 = (n: number) => ((n % 12) + 12) % 12

export function normalizeAccidentals(s: string): string {
  return s.replace(/♯/g, '#').replace(/♭/g, 'b')
}

/** Classe de altura de um nome de nota ("C#", "Bb", "E"…). */
export function noteIndex(name: string): number | null {
  const m = /^([A-G])([#b]*)$/.exec(normalizeAccidentals(name.trim()))
  if (!m) return null
  let pc = LETTER_PC[m[1]]
  for (const ch of m[2]) pc += ch === '#' ? 1 : -1
  return mod12(pc)
}

export function noteName(pc: number, acc: Accidental): string {
  return (acc === 'flat' ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]
}

/** Nome com a letra pedida, se der com no máximo um acidente simples e sem grafias esquisitas. */
function nameWithLetter(pc: number, letter: string): string | null {
  const diff = mod12(pc - LETTER_PC[letter])
  const name = diff === 0 ? letter : diff === 1 ? letter + '#' : diff === 11 ? letter + 'b' : null
  if (!name || name === 'Cb' || name === 'Fb' || name === 'E#' || name === 'B#') return null
  return name
}

// ---------------------------------------------------------------------------
// Tons
// ---------------------------------------------------------------------------

export interface MusicKey {
  root: number
  minor: boolean
  /** Letra da tônica como escrita (para soletrar os acordes pelo grau). */
  letter: string
  /** Acidente como escrito ("", "#" ou "b"). */
  accidental: '' | '#' | 'b'
}

export function parseKey(input: string | null | undefined): MusicKey | null {
  if (!input) return null
  let s = normalizeAccidentals(input.trim())
  s = s.charAt(0).toUpperCase() + s.slice(1)
  const m = /^([A-G])([#b]?)\s*(m|min|menor|-)?$/.exec(s)
  if (!m) return null
  const accidental = (m[2] ?? '') as MusicKey['accidental']
  const root = noteIndex(m[1] + accidental)
  if (root === null) return null
  return { root, minor: Boolean(m[3]), letter: m[1], accidental }
}

/** Nome "canônico" de um tom a partir da tônica. */
export function keyNameFor(root: number, minor: boolean, pref: AccidentalPref = 'auto'): string {
  if (pref === 'auto') return (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod12(root)]
  return noteName(root, pref) + (minor ? 'm' : '')
}

/** Normaliza a grafia de um tom digitado ("bb" → "Bb", "f# menor" → "F#m"). */
export function normalizeKeyName(input: string | null | undefined): string | null {
  const k = parseKey(input)
  if (!k) return null
  return k.letter + k.accidental + (k.minor ? 'm' : '')
}

/** Armadura do tom: usa sustenidos ou bemóis? */
export function keyAccidental(k: MusicKey): Accidental {
  const major = k.minor ? mod12(k.root + 3) : k.root
  if (major === 5 || major === 10 || major === 3 || major === 8) return 'flat'
  if (major === 1) return (k.minor ? k.letter === 'A' : k.letter === 'C') ? 'sharp' : 'flat'
  if (major === 6) return (k.minor ? k.letter === 'E' : k.letter === 'G') ? 'flat' : 'sharp'
  return 'sharp'
}

export function transposeKey(key: string, semitones: number, pref: AccidentalPref = 'auto'): string {
  const k = parseKey(key)
  if (!k) return key
  return keyNameFor(k.root + semitones, k.minor, pref)
}

/** Distância (0–11) de um tom para outro, considerando só a tônica. */
export function semitonesBetween(from: string | null | undefined, to: string | null | undefined): number {
  const a = parseKey(from)
  const b = parseKey(to)
  if (!a || !b) return 0
  return mod12(b.root - a.root)
}

/** Representa um deslocamento como o menor caminho (-5 … +6). */
export function shortestShift(semitones: number): number {
  const s = mod12(semitones)
  return s > 6 ? s - 12 : s
}

export function sameKey(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = parseKey(a)
  const kb = parseKey(b)
  return !!ka && !!kb && ka.root === kb.root && ka.minor === kb.minor
}

export function isMinorKey(key: string | null | undefined): boolean {
  return parseKey(key)?.minor ?? false
}

export function allKeys(minor: boolean, pref: AccidentalPref = 'auto'): string[] {
  return Array.from({ length: 12 }, (_, i) => keyNameFor(i, minor, pref))
}

/** "G" → "Sol", "F#m" → "Fá♯ menor" */
export function solfegeName(key: string): string {
  const k = parseKey(key)
  if (!k) return key
  const acc = k.accidental === '#' ? '♯' : k.accidental === 'b' ? '♭' : ''
  return `${SOLFEGE[k.letter]}${acc}${k.minor ? ' menor' : ''}`
}

/** Troca # e b pelos símbolos tipográficos (só para exibição). */
export function prettyAccidentals(s: string): string {
  return s.replace(/([A-G])#/g, '$1♯').replace(/([A-G])b/g, '$1♭')
}

// ---------------------------------------------------------------------------
// Grafia de notas dentro de um tom
// ---------------------------------------------------------------------------

export interface Speller {
  /** Nome da fundamental de um acorde. `dim` = acorde diminuto (prefere sustenido). */
  root(pc: number, dim?: boolean): string
  /** Nome do baixo de um acorde invertido, soletrado a partir da fundamental. */
  bass(pc: number, rootName: string): string
}

export function makeSpeller(targetKey: string | null | undefined, pref: AccidentalPref = 'auto'): Speller {
  const k = parseKey(targetKey)
  if (pref !== 'auto' || !k) {
    const acc: Accidental = pref !== 'auto' ? pref : 'sharp'
    return { root: (pc) => noteName(pc, acc), bass: (pc) => noteName(pc, acc) }
  }
  const fallback = keyAccidental(k)
  const keyLetterIdx = LETTERS.indexOf(k.letter as (typeof LETTERS)[number])
  return {
    root(pc, dim) {
      const degree = mod12(pc - k.root)
      const steps = (dim ? DEGREE_STEPS_SHARP_SIDE : DEGREE_STEPS_FLAT_SIDE)[degree]
      const letter = LETTERS[(keyLetterIdx + steps) % 7]
      return nameWithLetter(pc, letter) ?? noteName(pc, fallback)
    },
    bass(pc, rootName) {
      const rootPc = noteIndex(rootName)
      const rootLetterIdx = LETTERS.indexOf(rootName[0] as (typeof LETTERS)[number])
      if (rootPc === null || rootLetterIdx < 0) return noteName(pc, fallback)
      const letter = LETTERS[(rootLetterIdx + INTERVAL_STEPS[mod12(pc - rootPc)]) % 7]
      return nameWithLetter(pc, letter) ?? noteName(pc, fallback)
    },
  }
}

// ---------------------------------------------------------------------------
// Relações entre tons (transições suaves entre músicas)
// ---------------------------------------------------------------------------

/**
 * Quão bem um tom "emenda" no outro (0–3).
 * 3 = mesmo tom · 2 = relativo ou vizinho na roda de quintas · 1 = meio tom/um tom acima.
 */
export function keyCompatibility(from: string | null | undefined, to: string | null | undefined): number {
  const a = parseKey(from)
  const b = parseKey(to)
  if (!a || !b) return 0
  if (a.root === b.root && a.minor === b.minor) return 3
  const ra = a.minor ? mod12(a.root + 3) : a.root
  const rb = b.minor ? mod12(b.root + 3) : b.root
  if (ra === rb) return 2
  const d = mod12(rb - ra)
  if (d === 5 || d === 7) return 2
  if (d === 1 || d === 2) return 1
  return 0
}

export const EASY_GUITAR_KEYS = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm']

/** Sugere capotraste para tocar com "formas" fáceis no violão. */
export function suggestCapo(targetKey: string | null | undefined): { capo: number; shapeKey: string } | null {
  const k = parseKey(targetKey)
  if (!k) return null
  if (EASY_GUITAR_KEYS.includes(keyNameFor(k.root, k.minor))) return null
  for (let capo = 1; capo <= 7; capo++) {
    const shape = keyNameFor(k.root - capo, k.minor)
    if (EASY_GUITAR_KEYS.includes(shape)) return { capo, shapeKey: shape }
  }
  return null
}
