import { Fragment, memo, type CSSProperties } from 'react'
import { ArrowDownRight } from 'lucide-react'
import type { MedleyCue, MedleyPart, Piece, SectionType, SheetDoc, SheetLine, SheetSection } from '@/lib/music/sheet'
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

  // Num medley, o começo de cada música e o aviso da troca ficam mesmo quando a seção em que
  // estavam some (ex.: a introdução ou o final só de acordes, na visão de letra).
  const sections: SheetSection[] = []
  let pendingPart: MedleyPart | undefined
  for (const s of doc.sections) {
    const lines = lyricsOnly ? s.lines.filter((l) => l.kind === 'lyric' || l.kind === 'blank' || l.kind === 'comment') : s.lines
    const part = s.part ?? pendingPart
    if (lyricsOnly ? lines.some((l) => l.kind === 'lyric') : lines.length > 0 || s.label || part || s.cue) {
      sections.push({ ...s, lines, part })
      pendingPart = undefined
    } else {
      if (s.part) pendingPart = s.part
      const prev = sections[sections.length - 1]
      if (s.cue && prev && !pendingPart) sections[sections.length - 1] = { ...prev, cue: s.cue }
      else if (s.cue) sections.push({ ...s, lines: [], label: null, part })
      if (s.cue && pendingPart) pendingPart = undefined
    }
  }

  if (!sections.some((s) => s.lines.length || s.label)) {
    return <p className="py-8 text-center text-muted">Esta música ainda não tem {lyricsOnly ? 'letra' : 'cifra'} cadastrada.</p>
  }

  return (
    <div className={cn('sheet text-ink', lyricsOnly && 'leading-[1.55] font-medium', className)} style={style}>
      {sections.map((section, si) => {
        const color = SECTION_COLORS[section.type]
        const isChorus = section.type === 'chorus'
        return (
          <Fragment key={si}>
            {section.part && <MedleyPartHeader part={section.part} first={si === 0} />}
            <section
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
            {section.cue && <MedleyCueBanner cue={section.cue} />}
          </Fragment>
        )
      })}
    </div>
  )
})

/** Onde começa cada música do medley: número, nome e o tom em que ela soa. */
function MedleyPartHeader({ part, first }: { part: MedleyPart; first: boolean }) {
  return (
    <div className={cn('mb-[0.9em] flex items-center gap-[0.6em] rounded-2xl bg-surface-2 px-[0.8em] py-[0.55em] font-sans', !first && 'mt-[2em]')}>
      <span className="grid size-[1.7em] shrink-0 place-items-center rounded-full bg-primary text-[0.8em] font-extrabold text-primary-ink">{part.index}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[0.95em] font-extrabold text-ink">{part.title}</span>
        {(part.range || part.artist) && (
          <span className="block truncate text-[0.72em] font-semibold text-muted">{part.range ? `Trecho: ${part.range}` : part.artist}</span>
        )}
      </span>
      {part.key && (
        <span className="shrink-0 rounded-[0.6em] bg-primary-soft px-[0.55em] py-[0.15em] text-[0.8em] font-extrabold text-primary">{prettyAccidentals(part.key)}</span>
      )}
    </div>
  )
}

/** Fim do trecho: avisa para qual música troca, em que parte ela entra e em que tom. */
function MedleyCueBanner({ cue }: { cue: MedleyCue }) {
  return (
    <div className="-mt-[0.6em] mb-[1.2em] flex items-center gap-[0.55em] rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft/50 px-[0.8em] py-[0.5em] font-sans text-primary">
      <ArrowDownRight className="size-[1.1em] shrink-0" strokeWidth={2.6} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[0.82em] font-extrabold">Troca para {cue.index} · {cue.title}</span>
        {(cue.entry || cue.key) && (
          <span className="block truncate text-[0.7em] font-bold opacity-80">
            {[cue.entry && `entra em: ${cue.entry}`, cue.key && `Tom ${prettyAccidentals(cue.key)}`].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </div>
  )
}
