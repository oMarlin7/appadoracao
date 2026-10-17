import { chordClass, isChordLine, parseChord } from './chords'
import { docChords, docLyrics, hasInlineChords, isSectionLabel, isTabLine, normalizeText, parseSheet } from './sheet'
import { keyNameFor, mod12 } from './theory'

// ---------------------------------------------------------------------------
// Detecção de tom
// ---------------------------------------------------------------------------

/** Acordes diatônicos do campo harmônico maior: [grau, classe, peso]. */
const DIATONIC: Array<[number, 'major' | 'minor' | 'dim', number]> = [
  [0, 'major', 2], // I
  [2, 'minor', 1], // ii
  [4, 'minor', 0.8], // iii
  [5, 'major', 1.5], // IV
  [7, 'major', 1.5], // V
  [9, 'minor', 1.2], // vi
  [11, 'dim', 0.5], // vii°
]
/** Empréstimos comuns (bVII, bVI, II, III, VI maiores) — quase não penalizam. */
const BORROWED: Array<[number, 'major' | 'minor' | 'dim']> = [
  [10, 'major'],
  [8, 'major'],
  [2, 'major'],
  [4, 'major'],
  [9, 'major'],
]

/**
 * Descobre o tom provável a partir da sequência de acordes.
 * Pontua cada tom maior pelo campo harmônico, dá peso extra ao primeiro e último acordes
 * e decide entre o tom maior e o relativo menor.
 */
export function detectKey(chordTokens: string[]): string | null {
  const chords = chordTokens.map((c) => parseChord(c.replace(/^\(|\)$/g, ''))).filter((c) => c !== null)
  if (chords.length === 0) return null
  let best = { score: -Infinity, root: 0 }
  for (let k = 0; k < 12; k++) {
    let score = 0
    chords.forEach((c, i) => {
      const degree = mod12(c.root - k)
      const cls = chordClass(c)
      const hit = DIATONIC.find(([d, q]) => d === degree && q === cls)
      score += hit ? hit[2] : BORROWED.some(([d, q]) => d === degree && q === cls) ? -0.25 : -1
      if (degree === 0 && cls === 'major') {
        if (i === 0) score += 1.5
        if (i === chords.length - 1) score += 1
      }
    })
    if (score > best.score) best = { score, root: k }
  }
  // Relativo menor: tônica (vi) no começo/fim e pelo menos tão frequente quanto o I.
  const vi = mod12(best.root + 9)
  const isTonicMinor = (c: (typeof chords)[number] | undefined) => !!c && c.root === vi && chordClass(c) === 'minor'
  const countOf = (pc: number, cls: 'major' | 'minor') => chords.filter((c) => c.root === pc && chordClass(c) === cls).length
  const first = chords[0]
  const last = chords[chords.length - 1]
  const minorEvidence = (isTonicMinor(first) ? 1 : 0) + (isTonicMinor(last) ? 1 : 0)
  if (minorEvidence >= 1 && countOf(vi, 'minor') >= countOf(best.root, 'major')) {
    return keyNameFor(vi, true)
  }
  return keyNameFor(best.root, false)
}

export function detectKeyFromText(text: string): string | null {
  return detectKey(docChords(parseSheet(text)))
}

// ---------------------------------------------------------------------------
// Análise de cifra colada (importação)
// ---------------------------------------------------------------------------

export interface ImportAnalysis {
  title?: string
  artist?: string
  /** Tom informado no texto ("Tom: G") ou detectado pelos acordes. */
  key?: string
  keySource?: 'texto' | 'detectado'
  capo?: number
  bpm?: number
  /** Conteúdo limpo para salvar (sem cabeçalho de título/artista). */
  content: string
  chordCount: number
  lyrics: string
}

const JUNK_LINE_RE =
  /^(cifra club|cifraclub|letras\.mus|www\.|https?:\/\/|exibir|imprimir|baixar|vídeo aula|video aula|ver cifra|simplificar cifra|auto rolagem|transpor|meia|tom\s*-\s*\+|aumentar|diminuir|mais acessadas|composição de|composicao de|enviada por|colaboração e revisão|revisão)/i

function looksLikeHeader(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 70) return false
  if (isChordLine(line) || isTabLine(line) || hasInlineChords(line)) return false
  if (/^\[/.test(t) || /^\{/.test(t) || isSectionLabel(t)) return false
  if (/^[Tt]om\s*:/.test(t) || /^capo/i.test(t)) return false
  return true
}

export function analyzeImport(raw: string): ImportAnalysis {
  let lines = normalizeText(raw).split('\n').map((l) => l.replace(/\s+$/, ''))
  lines = lines.filter((l) => !JUNK_LINE_RE.test(l.trim()))

  // Título e artista: primeiras linhas "de texto" antes da cifra começar, seguidas de linha
  // em branco, de "Tom:" ou de uma seção/acorde.
  let title: string | undefined
  let artist: string | undefined
  let startIdx = 0
  while (startIdx < lines.length && !lines[startIdx].trim()) startIdx++
  const a = lines[startIdx]
  const b = lines[startIdx + 1]
  const c = lines[startIdx + 2]
  const endsHeader = (l: string | undefined) =>
    l === undefined || !l.trim() || !looksLikeHeader(l) || /^[Tt]om\s*:/.test(l.trim())
  if (a !== undefined && looksLikeHeader(a)) {
    if (b !== undefined && looksLikeHeader(b) && endsHeader(c)) {
      title = a.trim()
      artist = b.trim()
      startIdx += 2
    } else if (endsHeader(b) && (b === undefined || !b.trim())) {
      title = a.trim()
      startIdx += 1
    }
  }
  const content = lines.slice(startIdx).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trim()

  const doc = parseSheet(content)
  const chords = docChords(doc)
  const detected = detectKey(chords)
  const result: ImportAnalysis = {
    title: doc.meta.title ?? title,
    artist: doc.meta.artist ?? artist,
    capo: doc.meta.capo,
    bpm: doc.meta.bpm,
    content,
    chordCount: chords.length,
    lyrics: docLyrics(doc),
  }
  if (doc.meta.key) {
    result.key = doc.meta.key
    result.keySource = 'texto'
  } else if (detected) {
    result.key = detected
    result.keySource = 'detectado'
  }
  return result
}

/** Ritmo a partir do BPM. */
export function tempoFromBpm(bpm: number | null | undefined): 'lenta' | 'moderada' | 'rapida' | null {
  if (!bpm) return null
  if (bpm < 82) return 'lenta'
  if (bpm <= 112) return 'moderada'
  return 'rapida'
}
