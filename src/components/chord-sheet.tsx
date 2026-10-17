import { memo, type CSSProperties } from 'react'
import type { Piece, SectionType, SheetDoc, SheetLine } from '@/lib/music/sheet'
import { lineText } from '@/lib/music/sheet'
import { prettyAccidentals } from '@/lib/music/theory'
import { tint, type Pastel } from '@/lib/taxonomy'
import { cn } from '@/lib/utils'

export const SECTION_COLORS: Record<SectionType, Pastel> = {
  intro: 'mint',
  verse: 'sky',
  prechorus: 'butter',
  chorus: 'rose',
  bridge: 'lavender',
  instrumental: 'aqua',
  outro: 'peach',
  other: 'orchid',
}

/** Agrupa os pedaços por palavra, para a quebra de linha nunca separar sílabas. */
function groupWords(pieces: Piece[]): Piece[][] {
  const words: Piece[][] = []
  let current: Piece[] = []
  let boundary = true
  for (const piece of pieces) {
    const tokens = piece.text ? (piece.text.match(/\s+|\S+\s*/g) ?? ['']) : ['']
    tokens.forEach((tok, i) => {
      const startsWord = boundary || /^\s/.test(tok)
      if (startsWord && current.length) {
        words.push(current)
        current = []
      }
      current.push({ chord: i === 0 ? piece.chord : undefined, text: tok })
      boundary = tok === '' || /\s$/.test(tok)
    })
  }
  if (current.length) words.push(current)
  return words
}

function Chord({ chord, onClick, float }: { chord: string; onClick?: (c: string) => void; float?: boolean }) {
  const text = prettyAccidentals(chord)
  const inner = float ? <span className="sheet-chord-inner">{text}</span> : text
  if (!onClick) return <span className={cn('sheet-chord', float && 'sheet-chord-float')}>{inner}</span>
  return (
    <button type="button" className={cn('sheet-chord sheet-chord-btn text-left', float && 'sheet-chord-float')} onClick={() => onClick(chord)}>
      {inner}
    </button>
  )
}

/**
 * Quando o acorde é mais largo que a sílaba, ele pode "flutuar" por cima das palavras seguintes
 * (como numa cifra impressa) — desde que não encoste no próximo acorde. Assim a letra não ganha
 * buracos. Retorna, para cada pedaço com acorde, se ele pode flutuar.
 */
function floatingChords(words: Piece[][]): boolean[][] {
  const flat = words.flatMap((w, wi) => w.map((p, pi) => ({ p, wi, pi })))
  const out = words.map((w) => w.map(() => false))
  flat.forEach(({ p, wi, pi }, i) => {
    if (!p.chord) return
    let room = 0
    for (let j = i; j < flat.length; j++) {
      if (j > i && flat[j].p.chord) break
      room += flat[j].p.text.length
    }
    const needed = prettyAccidentals(p.chord).length * 1.15 + 1
    out[wi][pi] = room >= needed && p.text.length < needed
  })
  return out
}

function LyricLine({ line, onChordClick }: { line: Extract<SheetLine, { kind: 'lyric' }>; onChordClick?: (c: string) => void }) {
  const hasChord = line.pieces.some((p) => p.chord)
  if (!hasChord) return <div className="sheet-line">{lineText(line).trimEnd() || '\u00a0'}</div>
  const words = groupWords(line.pieces)
  const floats = floatingChords(words)
  return (
    <div className="sheet-line mt-1">
      {words.map((word, wi) => (
        <span key={wi} className="sheet-word">
          {word.map((p, pi) => (
            <span key={pi} className="sheet-piece">
              {p.chord ? <Chord chord={p.chord} onClick={onChordClick} float={floats[wi][pi]} /> : <span className="sheet-chord" aria-hidden />}
              <span className="sheet-text">{p.text || '\u200b'}</span>
            </span>
          ))}
        </span>
      ))}
      {line.note && <span className="ml-2 self-end text-[0.8em] font-semibold text-muted">{line.note}</span>}
    </div>
  )
}

export interface ChordSheetProps {
  doc: SheetDoc
  mode: 'cifra' | 'letra'
  fontScale?: number
  showLabels?: boolean
  onChordClick?: (chord: string) => void
  className?: string
}

export const ChordSheet = memo(function ChordSheet({ doc, mode, fontScale = 1, showLabels = true, onChordClick, className }: ChordSheetProps) {
  const lyricsOnly = mode === 'letra'
  const style = { fontSize: `${(lyricsOnly ? 20 : 16.5) * fontScale}px` } as CSSProperties

  const sections = doc.sections
    .map((s) => ({
      ...s,
      lines: lyricsOnly ? s.lines.filter((l) => l.kind === 'lyric' || l.kind === 'blank' || l.kind === 'comment') : s.lines,
    }))
    .filter((s) => (lyricsOnly ? s.lines.some((l) => l.kind === 'lyric') : s.lines.length > 0 || s.label))

  if (!sections.length) {
    return <p className="py-8 text-center text-muted">Esta música ainda não tem {lyricsOnly ? 'letra' : 'cifra'} cadastrada.</p>
  }

  return (
    <div className={cn('sheet text-ink', lyricsOnly && 'leading-[1.55] font-medium', className)} style={style}>
      {sections.map((section, si) => {
        const color = SECTION_COLORS[section.type]
        const isChorus = section.type === 'chorus'
        return (
          <section
            key={si}
            className={cn('mb-[1.4em]', lyricsOnly && isChorus && 'border-l-[3px] pl-[0.8em]')}
            style={lyricsOnly && isChorus ? { borderColor: `var(--${color}-solid)` } : undefined}
          >
            {showLabels && section.label && (
              <div className="mb-[0.45em]">
                <span
                  style={tint(color)}
                  className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 font-bold tracking-wide', lyricsOnly ? 'text-[0.6em]' : 'text-[0.72em]')}
                >
                  {section.label}
                </span>
              </div>
            )}
            {section.lines.map((line, li) => {
              switch (line.kind) {
                case 'blank':
                  return <div key={li} className="h-[0.7em]" />
                case 'comment':
                  return (
                    <div key={li} className="text-[0.85em] font-semibold text-muted italic">
                      {line.text}
                    </div>
                  )
                case 'tab':
                  return (
                    <pre key={li} className="no-scrollbar overflow-x-auto font-mono text-[0.78em] leading-tight text-ink-2">
                      {line.text}
                    </pre>
                  )
                case 'chords':
                  return (
                    <div key={li} className="sheet-chords-only my-[0.15em]">
                      {line.items.map((it, ii) =>
                        'chord' in it ? (
                          <Chord key={ii} chord={it.chord} onClick={onChordClick} />
                        ) : (
                          <span key={ii} className="text-[0.85em] font-semibold text-muted">
                            {it.note}
                          </span>
                        ),
                      )}
                    </div>
                  )
                case 'lyric':
                  return lyricsOnly ? (
                    <p key={li} className="m-0">
                      {lineText(line).replace(/\s{2,}/g, ' ').trim() || ' '}
                    </p>
                  ) : (
                    <LyricLine key={li} line={line} onChordClick={onChordClick} />
                  )
              }
            })}
          </section>
        )
      })}
    </div>
  )
})
