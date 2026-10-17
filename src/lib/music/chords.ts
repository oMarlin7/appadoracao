import { makeSpeller, mod12, noteIndex, normalizeAccidentals, type AccidentalPref, type Speller } from './theory'

/**
 * Acordes em notação popular brasileira e internacional:
 * C, Cm, C7, C7M, Cmaj7, C7+, C9, C(9), Cadd9, C4, Csus4, C7(4), C7/9, Cm7(b5), Cº, C°, Cdim,
 * C5+, Caug, C6, C6(9), C/E, C#m7/G#, Bb7M(9), E7(9-), Dm7(11)…
 */

export interface Chord {
  root: number
  rootName: string
  /** Tudo entre a fundamental e o baixo (m7, 7M(9), sus4…), preservado como escrito. */
  quality: string
  bass?: number
  bassName?: string
}

const ROOT_RE = /^([A-G])([#b]?)/
const QUALITY_RE =
  /^(?:maj|min|dim|aug|sus|add|omit|no|alt|m|M|°|º|ø|Δ|\+|-|#|b|\d|\(|\)|,|\.|\/(?=[\d#b+\-(]))*$/
const BASS_RE = /\/([A-G][#b]?)$/

export function parseChord(raw: string): Chord | null {
  const s = normalizeAccidentals(raw.trim())
  const m = ROOT_RE.exec(s)
  if (!m) return null
  const rootName = m[1] + m[2]
  let rest = s.slice(rootName.length)
  let bassName: string | undefined
  const b = BASS_RE.exec(rest)
  if (b) {
    bassName = b[1]
    rest = rest.slice(0, b.index)
  }
  if (!QUALITY_RE.test(rest)) return null
  if (count(rest, '(') !== count(rest, ')')) return null
  return {
    root: noteIndex(rootName)!,
    rootName,
    quality: rest,
    bass: bassName ? noteIndex(bassName)! : undefined,
    bassName,
  }
}

function count(s: string, ch: string) {
  let n = 0
  for (const c of s) if (c === ch) n++
  return n
}

/** Acorde opcional entre parênteses: "(G)" ou "(D/F#)". */
function unwrap(token: string): { inner: string; wrapped: boolean } {
  if (token.length > 2 && token.startsWith('(') && token.endsWith(')')) {
    return { inner: token.slice(1, -1), wrapped: true }
  }
  return { inner: token, wrapped: false }
}

export function isChord(token: string): boolean {
  if (!token) return false
  return parseChord(unwrap(token).inner) !== null
}

/** Classe do acorde para análise harmônica. */
export function chordClass(c: Chord): 'major' | 'minor' | 'dim' {
  const q = c.quality
  if (/^(dim|°|º|ø)/.test(q) || /^m7?\(?b5\)?/.test(q)) return 'dim'
  if (/^(m(?!aj)|min|-)/.test(q)) return 'minor'
  return 'major'
}

export function formatChord(c: Chord): string {
  return c.rootName + c.quality + (c.bassName ? '/' + c.bassName : '')
}

export function transposeParsed(c: Chord, semitones: number, speller: Speller): Chord {
  const root = mod12(c.root + semitones)
  const rootName = speller.root(root, chordClass(c) === 'dim')
  const out: Chord = { root, rootName, quality: c.quality }
  if (c.bass !== undefined) {
    out.bass = mod12(c.bass + semitones)
    out.bassName = speller.bass(out.bass, rootName)
  }
  return out
}

/**
 * Transpõe um acorde em texto. Tokens que não são acordes voltam intactos.
 * `speller` define a grafia (crie com `makeSpeller(tomDestino)`).
 */
export function transposeChord(token: string, semitones: number, speller: Speller): string {
  const { inner, wrapped } = unwrap(token)
  const c = parseChord(inner)
  if (!c) return token
  const t = formatChord(transposeParsed(c, semitones, speller))
  return wrapped ? `(${t})` : t
}

/** Atalho: transpõe sabendo só o tom de destino. */
export function transposeChordTo(
  token: string,
  semitones: number,
  targetKey: string | null | undefined,
  pref: AccidentalPref = 'auto',
): string {
  return transposeChord(token, semitones, makeSpeller(targetKey, pref))
}

// ---------------------------------------------------------------------------
// Linhas de acordes
// ---------------------------------------------------------------------------

/** Marcações que podem aparecer numa linha de acordes sem serem acordes. */
const NEUTRAL_TOKEN_RE = /^(\|+:?|:?\|+|-+|–|—|\/|\.{2,}|%|>|<|x?\d+x?|n\.?c\.?|\*+|~+|riff|bis)$/i

export interface LineToken {
  text: string
  index: number
  kind: 'chord' | 'neutral' | 'note' | 'word'
}

/** Divide uma linha em tokens; observações entre parênteses ficam num token só. */
export function tokenizeLine(line: string): LineToken[] {
  const out: LineToken[] = []
  const re = /\([^()]*\)|\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const text = m[0]
    let kind: LineToken['kind']
    if (isChord(text)) kind = 'chord'
    else if (NEUTRAL_TOKEN_RE.test(text)) kind = 'neutral'
    else if (text.startsWith('(') && text.endsWith(')')) kind = 'note'
    else kind = 'word'
    out.push({ text, index: m.index, kind })
  }
  return out
}

/**
 * Uma linha é "de acordes" quando todos os tokens são acordes, marcações neutras
 * (barras, "2x") ou observações entre parênteses — e há pelo menos um acorde.
 */
export function isChordLine(line: string): boolean {
  const tokens = tokenizeLine(line)
  return tokens.some((t) => t.kind === 'chord') && tokens.every((t) => t.kind !== 'word')
}
