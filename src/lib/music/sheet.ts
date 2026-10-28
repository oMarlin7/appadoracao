import { isChord, isChordLine, tokenizeLine, transposeChord } from './chords'
import { normalizeKeyName, type Speller } from './theory'

/**
 * Formato da cifra
 * ----------------
 * O conteúdo é texto simples no estilo que todo músico conhece (e que vem do Cifra Club):
 *
 *   [Intro] G  D/F#  Em  C
 *
 *   [Refrão]
 *   G           D/F#
 *   Santo, santo é o Senhor
 *
 * Também aceitamos ChordPro (`[G]Santo, [D]santo`, `{c: Refrão}`, `{soc}`…), o que permite
 * importar arquivos .cho de outros apps. O texto é interpretado na hora de exibir, então a
 * letra quebra bonito em qualquer largura de tela e a transposição não desalinha nada.
 */

export type SectionType =
  | 'intro'
  | 'verse'
  | 'prechorus'
  | 'chorus'
  | 'bridge'
  | 'instrumental'
  | 'outro'
  | 'other'

export interface Piece {
  chord?: string
  text: string
}

export type ChordItem = { chord: string } | { note: string }

export type SheetLine =
  | { kind: 'lyric'; pieces: Piece[]; note?: string }
  | { kind: 'chords'; items: ChordItem[] }
  | { kind: 'tab'; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'blank' }

export interface SheetSection {
  label: string | null
  type: SectionType
  lines: SheetLine[]
  /** Num medley, a primeira seção de cada música traz qual música começa ali. */
  part?: MedleyPart
  /** Num medley, a última seção de cada música avisa para qual música troca. */
  cue?: MedleyCue
}

export interface MedleyPart {
  /** 1, 2, 3… */
  index: number
  songId: string
  title: string
  artist: string
  /** Tom em que a parte soa (já com a transposição da tela). */
  key: string | null
  /** Quando não é a música inteira: "Refrão → Ponte", "começo → Ponte"… */
  range?: string
}

/** A troca para a próxima música do medley. */
export interface MedleyCue {
  index: number
  title: string
  /** Seção em que a próxima entra (null = do começo). */
  entry: string | null
  key: string | null
}

/** "→ Troca para 2. Eu Me Rendo (entra em: Refrão · Tom E)" */
export const medleyCueText = (c: MedleyCue) =>
  `→ Troca para ${c.index}. ${c.title}${c.entry || c.key ? ` (${[c.entry && `entra em: ${c.entry}`, c.key && `Tom ${c.key}`].filter(Boolean).join(' · ')})` : ''}`

/** "2. Eu Me Rendo · Tom Dm" (para copiar e compartilhar). */
export const medleyPartHeading = (p: MedleyPart) => `${p.index}. ${p.title}${p.key ? ` · Tom ${p.key}` : ''}${p.range ? ` · ${p.range}` : ''}`

export interface SheetMeta {
  title?: string
  artist?: string
  key?: string
  capo?: number
  bpm?: number
  timeSignature?: string
}

export interface SheetDoc {
  meta: SheetMeta
  sections: SheetSection[]
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const SECTION_RE = new RegExp(
  '^(?:(?:primeira|segunda|terceira|quarta|quinta|ultima|\\d+\\s*[ªaº°o]?)\\s+)?' +
    '(intro(?:ducao)?|refrao|coro|chorus|verso|verse|estrofe|ponte|bridge|' +
    'pre[- ]?(?:refrao|coro|chorus)|pos[- ]?refrao|solo|interludio|instrumental|final|outro|tag|parte|' +
    'riff|ministracao|espontaneo|vamp|coda|fim)' +
    '(?:\\s+(?:\\d+|[ivx]+|final|\\d+\\s*[ªaº°]?\\s*vez))?' +
    '(?:\\s*\\(.*\\))?\\s*:?$',
)

export function isSectionLabel(text: string): boolean {
  const t = stripAccents(text.trim().toLowerCase())
  return t.length > 0 && t.length <= 36 && SECTION_RE.test(t)
}

export function sectionType(label: string | null | undefined): SectionType {
  if (!label) return 'other'
  const t = stripAccents(label.toLowerCase())
  if (/pre[- ]?(refrao|coro|chorus)/.test(t)) return 'prechorus'
  if (/(refrao|coro|chorus)/.test(t)) return 'chorus'
  if (/(ponte|bridge)/.test(t)) return 'bridge'
  if (/intro/.test(t)) return 'intro'
  if (/(solo|interludio|instrumental|riff|vamp|base)/.test(t)) return 'instrumental'
  if (/(final|outro|coda|tag|fim)/.test(t)) return 'outro'
  if (/(verso|verse|estrofe|parte)/.test(t)) return 'verse'
  return 'other'
}

function tidyLabel(label: string): string {
  const l = label.trim().replace(/:$/, '').trim()
  // "REFRÃO" → "Refrão"
  if (l === l.toUpperCase() && /[A-ZÀ-Ú]{3}/.test(l)) {
    return l.charAt(0) + l.slice(1).toLowerCase()
  }
  return l.charAt(0).toUpperCase() + l.slice(1)
}

// ---------------------------------------------------------------------------
// Tipos de linha
// ---------------------------------------------------------------------------

const TAB_RE = /^\s*(?:[A-Ga-g][#b]?\s*)?\|[-0-9|hpbrxs/\\~^().*=\s]*$/
const BARE_TAB_RE = /^[-0-9hpbrx/\\~^|\s]+$/

export function isTabLine(line: string): boolean {
  const dashes = line.match(/-/g)?.length ?? 0
  if (TAB_RE.test(line) && dashes >= 4) return true
  return BARE_TAB_RE.test(line) && dashes >= 8 && /\d/.test(line)
}

const INLINE_CHORD_RE = /\[([^\]\n]+)\]/g

export function hasInlineChords(line: string): boolean {
  for (const m of line.matchAll(INLINE_CHORD_RE)) if (isChord(m[1])) return true
  return false
}

function parseInline(line: string): Piece[] {
  const pieces: Piece[] = []
  let last = 0
  let pending: string | undefined
  for (const m of line.matchAll(INLINE_CHORD_RE)) {
    if (!isChord(m[1])) continue
    const before = line.slice(last, m.index)
    if (pending !== undefined || before) pieces.push(pending ? { chord: pending, text: before } : { text: before })
    pending = m[1]
    last = m.index! + m[0].length
  }
  pieces.push(pending ? { chord: pending, text: line.slice(last) } : { text: line.slice(last) })
  return pieces.filter((p) => p.chord || p.text)
}

function chordItems(line: string): ChordItem[] {
  return tokenizeLine(line).map((t) => (t.kind === 'chord' ? { chord: t.text } : { note: t.text }))
}

/** Junta a linha de acordes com a letra logo abaixo, usando as colunas. */
export function mergeChordLyric(chordLine: string, lyric: string): Extract<SheetLine, { kind: 'lyric' }> {
  const tokens = tokenizeLine(chordLine)
  const chords = tokens.filter((t) => t.kind === 'chord')
  const notes = tokens.filter((t) => t.kind !== 'chord').map((t) => t.text)
  const pieces: Piece[] = []
  if (chords.length === 0) return { kind: 'lyric', pieces: [{ text: lyric }] }
  if (chords[0].index > 0) {
    const head = lyric.slice(0, chords[0].index)
    if (head) pieces.push({ text: head })
  }
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].index : undefined
    pieces.push({ chord: c.text, text: lyric.slice(c.index, end) })
  })
  const line: Extract<SheetLine, { kind: 'lyric' }> = { kind: 'lyric', pieces }
  if (notes.length) line.note = notes.join(' ')
  return line
}

const META_TOM_RE = /^[Tt]om\s*:\s*([A-G][#b♯♭]?m?)(?![\w#])/
const META_CAPO_RE = /^capo(?:traste)?\s*(?:na|:)?\s*(\d{1,2})/i
const META_SKIP_RE = /^(afina[cç][aã]o|cifra\s*:|composi[cç][aã]o|tablatura\s*:|exibir|parte \d+ de \d+)/i
const DIRECTIVE_RE = /^\{([^}]*)\}$/

function isLyricCandidate(line: string | undefined): line is string {
  if (line === undefined) return false
  const t = line.trim()
  if (!t) return false
  if (DIRECTIVE_RE.test(t)) return false
  if (/^\(.*\)$/.test(t)) return false
  const sec = /^\[([^\]]+)\]/.exec(t)
  if (sec && !isChord(sec[1])) return false
  if (isSectionLabel(t)) return false
  if (isChordLine(line) || isTabLine(line) || hasInlineChords(line)) return false
  return true
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[   ]/g, ' ')
    .replace(/[​﻿]/g, '')
}

export function parseSheet(text: string): SheetDoc {
  const lines = normalizeText(text ?? '').split('\n')
  const meta: SheetMeta = {}
  const sections: SheetSection[] = []
  let current: SheetSection = { label: null, type: 'other', lines: [] }
  let inTab = false

  const push = (l: SheetLine) => current.lines.push(l)
  const start = (label: string) => {
    if (current.label !== null || current.lines.some((l) => l.kind !== 'blank')) sections.push(current)
    const tidy = tidyLabel(label)
    current = { label: tidy, type: sectionType(tidy), lines: [] }
  }
  const pushRest = (rest: string) => {
    if (!rest.trim()) return
    if (isChordLine(rest)) push({ kind: 'chords', items: chordItems(rest) })
    else push({ kind: 'comment', text: rest.trim() })
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, '')
    const t = raw.trim()

    if (inTab) {
      if (/^\{\s*(eot|end_of_tab)\s*\}$/i.test(t)) inTab = false
      else push({ kind: 'tab', text: raw })
      continue
    }

    if (!t) {
      push({ kind: 'blank' })
      continue
    }

    // Diretivas ChordPro: {title: …}, {c: Refrão}, {soc}, {Refrão}
    const dir = DIRECTIVE_RE.exec(t)
    if (dir) {
      const body = dir[1].trim()
      const colon = body.indexOf(':')
      const name = (colon >= 0 ? body.slice(0, colon) : body).trim().toLowerCase()
      const value = colon >= 0 ? body.slice(colon + 1).trim() : ''
      switch (name) {
        case 'title':
        case 't':
          meta.title = value
          break
        case 'subtitle':
        case 'st':
        case 'artist':
          meta.artist = value
          break
        case 'key':
          meta.key = normalizeKeyName(value) ?? undefined
          break
        case 'capo':
          meta.capo = parseInt(value, 10) || undefined
          break
        case 'tempo':
          meta.bpm = parseInt(value, 10) || undefined
          break
        case 'time':
          meta.timeSignature = value
          break
        case 'c':
        case 'comment':
        case 'ci':
        case 'comment_italic':
        case 'cb':
        case 'comment_box':
          if (isSectionLabel(value)) start(value)
          else push({ kind: 'comment', text: value })
          break
        case 'soc':
        case 'start_of_chorus':
          start(value || 'Refrão')
          break
        case 'sov':
        case 'start_of_verse':
          start(value || 'Verso')
          break
        case 'sob':
        case 'start_of_bridge':
          start(value || 'Ponte')
          break
        case 'sot':
        case 'start_of_tab':
          inTab = true
          break
        case 'eoc':
        case 'end_of_chorus':
        case 'eov':
        case 'end_of_verse':
        case 'eob':
        case 'end_of_bridge':
          break
        default:
          if (colon < 0 && body) start(body)
      }
      continue
    }

    // [Refrão] ou [Intro] G D Em C
    const sec = /^\[([^\]]+)\]\s*(.*)$/.exec(t)
    if (sec && !isChord(sec[1])) {
      start(sec[1])
      pushRest(sec[2])
      continue
    }

    // Intro: G D Em C
    const lab = /^([^:]{2,36}):\s*(.*)$/.exec(t)
    if (lab && isSectionLabel(lab[1])) {
      start(lab[1])
      pushRest(lab[2])
      continue
    }

    if (isSectionLabel(t)) {
      start(t)
      continue
    }

    const tom = META_TOM_RE.exec(t)
    if (tom && t.length < 60) {
      meta.key = normalizeKeyName(tom[1]) ?? meta.key
      continue
    }
    const capo = META_CAPO_RE.exec(t)
    if (capo && t.length < 60) {
      meta.capo = parseInt(capo[1], 10) || undefined
      continue
    }
    if (META_SKIP_RE.test(t)) continue

    if (isTabLine(raw)) {
      push({ kind: 'tab', text: raw })
      continue
    }

    if (hasInlineChords(raw)) {
      const pieces = parseInline(raw)
      if (pieces.every((p) => !p.text.trim())) {
        push({ kind: 'chords', items: pieces.filter((p) => p.chord).map((p) => ({ chord: p.chord! })) })
      } else push({ kind: 'lyric', pieces })
      continue
    }

    if (isChordLine(raw)) {
      const next = lines[i + 1]?.replace(/\s+$/, '')
      if (isLyricCandidate(next)) {
        push(mergeChordLyric(raw, next))
        i++
      } else push({ kind: 'chords', items: chordItems(raw) })
      continue
    }

    if (/^\(.*\)$/.test(t)) {
      push({ kind: 'comment', text: t })
      continue
    }

    push({ kind: 'lyric', pieces: [{ text: raw }] })
  }
  sections.push(current)

  return { meta, sections: sections.map(tidySection).filter((s) => s.label !== null || s.lines.length) }
}

/** Remove linhas em branco nas pontas e colapsa brancos repetidos. */
function tidySection(s: SheetSection): SheetSection {
  const lines: SheetLine[] = []
  for (const l of s.lines) {
    if (l.kind === 'blank' && (lines.length === 0 || lines[lines.length - 1].kind === 'blank')) continue
    lines.push(l)
  }
  while (lines.length && lines[lines.length - 1].kind === 'blank') lines.pop()
  return { ...s, lines }
}

// ---------------------------------------------------------------------------
// Operações sobre o documento
// ---------------------------------------------------------------------------

export function mapChords(doc: SheetDoc, fn: (chord: string) => string): SheetDoc {
  return {
    meta: doc.meta,
    sections: doc.sections.map((s) => ({
      ...s,
      lines: s.lines.map((l): SheetLine => {
        if (l.kind === 'lyric') return { ...l, pieces: l.pieces.map((p) => (p.chord ? { ...p, chord: fn(p.chord) } : p)) }
        if (l.kind === 'chords') return { kind: 'chords', items: l.items.map((it) => ('chord' in it ? { chord: fn(it.chord) } : it)) }
        return l
      }),
    })),
  }
}

export function transposeDoc(doc: SheetDoc, semitones: number, speller: Speller): SheetDoc {
  return mapChords(doc, (c) => transposeChord(c, semitones, speller))
}

export function docChords(doc: SheetDoc): string[] {
  const out: string[] = []
  for (const s of doc.sections)
    for (const l of s.lines) {
      if (l.kind === 'lyric') for (const p of l.pieces) p.chord && out.push(p.chord)
      if (l.kind === 'chords') for (const it of l.items) 'chord' in it && out.push(it.chord)
    }
  return out
}

export function lineText(l: SheetLine): string {
  if (l.kind === 'lyric') return l.pieces.map((p) => p.text).join('')
  if (l.kind === 'comment') return l.text
  return ''
}

/** Só a letra (para a visão dos cantores, busca e compartilhamento). */
export function docLyrics(doc: SheetDoc, opts: { labels?: boolean } = {}): string {
  const blocks: string[] = []
  for (const s of doc.sections) {
    const lines = s.lines
      .filter((l) => l.kind === 'lyric' || l.kind === 'blank')
      .map((l) => lineText(l).replace(/\s{2,}/g, ' ').trim())
    while (lines.length && !lines[0]) lines.shift()
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    if (s.part && opts.labels) blocks.push(medleyPartHeading(s.part))
    if (lines.length) blocks.push((opts.labels && s.label ? `[${s.label}]\n` : '') + lines.join('\n'))
    if (s.cue && opts.labels) blocks.push(medleyCueText(s.cue))
  }
  return blocks.join('\n\n')
}

export function hasChords(text: string | null | undefined): boolean {
  if (!text) return false
  return docChords(parseSheet(text)).length > 0
}

// ---------------------------------------------------------------------------
// Volta para texto (copiar/compartilhar já no tom escolhido)
// ---------------------------------------------------------------------------

function pieceLines(pieces: Piece[]): [string, string] {
  let lyric = ''
  let chords = ''
  for (const p of pieces) {
    if (p.chord) {
      let col = lyric.length
      if (chords.length > 0 && chords.length >= col) {
        // Acorde anterior "invade" a posição: empurra a letra se estivermos entre palavras.
        const atBoundary = lyric === '' || lyric.endsWith(' ')
        if (atBoundary) {
          col = chords.length + 1
          lyric = lyric.padEnd(col)
        } else col = chords.length + 1
      }
      chords = chords.padEnd(col) + p.chord
    }
    lyric += p.text
  }
  return [chords, lyric.replace(/\s+$/, '')]
}

export function docToText(doc: SheetDoc): string {
  const out: string[] = []
  for (const s of doc.sections) {
    if (out.length) out.push('')
    if (s.part) out.push(medleyPartHeading(s.part), '')
    const first = s.lines[0]
    if (s.label) {
      if (first?.kind === 'chords') {
        out.push(`[${s.label}] ${first.items.map((it) => ('chord' in it ? it.chord : it.note)).join('  ')}`)
      } else out.push(`[${s.label}]`)
    }
    s.lines.forEach((l, idx) => {
      if (idx === 0 && s.label && l.kind === 'chords') return
      switch (l.kind) {
        case 'blank':
          out.push('')
          break
        case 'comment':
          out.push(l.text)
          break
        case 'tab':
          out.push(l.text)
          break
        case 'chords':
          out.push(l.items.map((it) => ('chord' in it ? it.chord : it.note)).join('  '))
          break
        case 'lyric': {
          const [c, ly] = pieceLines(l.pieces)
          if (c.trim()) out.push(c + (l.note ? '  ' + l.note : ''))
          out.push(ly)
        }
      }
    })
    if (s.cue) out.push('', medleyCueText(s.cue))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------------------
// Transposição do próprio texto (mantém a formatação do usuário)
// ---------------------------------------------------------------------------

function transposeChordRow(row: string, semitones: number, speller: Speller): string {
  const tokens = tokenizeLine(row)
  let out = ''
  for (const t of tokens) {
    const text = t.kind === 'chord' ? transposeChord(t.text, semitones, speller) : t.text
    const col = out.length === 0 ? t.index : Math.max(t.index, out.length + 1)
    out = out.padEnd(col) + text
  }
  return out
}

export function transposeText(text: string, semitones: number, speller: Speller): string {
  return normalizeText(text)
    .split('\n')
    .map((raw) => {
      const t = raw.trim()
      if (!t || DIRECTIVE_RE.test(t) || isTabLine(raw)) return raw
      const sec = /^(\s*\[[^\]]+\]\s*)(.*)$/.exec(raw)
      if (sec && !isChord(/\[([^\]]+)\]/.exec(sec[1])![1])) {
        return sec[2] && isChordLine(sec[2]) ? sec[1] + transposeChordRow(sec[2], semitones, speller).trimStart() : raw
      }
      const lab = /^(\s*[^:]{2,36}:\s*)(.*)$/.exec(raw)
      if (lab && isSectionLabel(lab[1].replace(/:\s*$/, ''))) {
        return lab[2] && isChordLine(lab[2]) ? lab[1] + transposeChordRow(lab[2], semitones, speller).trimStart() : raw
      }
      if (hasInlineChords(raw)) {
        return raw.replace(INLINE_CHORD_RE, (m, c: string) => (isChord(c) ? `[${transposeChord(c, semitones, speller)}]` : m))
      }
      if (isChordLine(raw)) return transposeChordRow(raw, semitones, speller)
      return raw
    })
    .join('\n')
}
