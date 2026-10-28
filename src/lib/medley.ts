import { detectKeyFromText } from './music/analyze'
import { lineText, parseSheet, transposeDoc, type MedleyPart, type SheetDoc, type SheetSection } from './music/sheet'
import { makeSpeller, mod12, semitonesBetween } from './music/theory'
import type { Id, MedleyCut, SectionRef, Song } from '@/types'

/**
 * Medley: duas ou mais músicas tocadas em sequência, que contam como uma música só. É uma
 * música como as outras (entra no setlist, na votação e na playlist), mas a cifra não é
 * guardada nela: vem de cada parte, então quem corrige a cifra de uma parte corrige o medley.
 * De cada parte pode entrar só um trecho (ex.: do refrão até a ponte), e a cifra avisa onde
 * troca para a próxima.
 */

export const isMedley = (song: Pick<Song, 'medleyIds'> | null | undefined): boolean => !!song?.medleyIds?.length

/** As partes que ainda existem, na ordem do medley (um medley não entra dentro de outro). */
export function medleyParts(song: Pick<Song, 'medleyIds'>, songs: Record<Id, Song>): Song[] {
  return (song.medleyIds ?? []).map((id) => songs[id]).filter((s): s is Song => !!s && !isMedley(s))
}

/** Tom em que a equipe toca a parte (o da equipe, senão o original). */
export const partKey = (song: Song): string | null => song.teamKey ?? song.originalKey ?? detectKeyFromText(song.content)

/** "Bondade de Deus + Eu Me Rendo" */
export const medleyTitle = (parts: Pick<Song, 'title'>[]) => parts.map((p) => p.title.trim()).join(' + ')

/** Os artistas das partes, sem repetir. */
export const medleyArtist = (parts: Pick<Song, 'artist'>[]) => [...new Set(parts.map((p) => p.artist.trim()).filter(Boolean))].join(', ')

/** Só os trechos das músicas que estão no medley, sem os vazios ("inteira"). */
export function cleanCuts(cuts: Record<Id, MedleyCut> | null | undefined, ids: Id[]): Record<Id, MedleyCut> | null {
  const out: Record<Id, MedleyCut> = {}
  for (const id of ids) {
    const c = cuts?.[id]
    if (c?.from || c?.to) out[id] = { ...(c.from ? { from: c.from } : {}), ...(c.to ? { to: c.to } : {}) }
  }
  return Object.keys(out).length ? out : null
}

const cutsKey = (cuts: Record<Id, MedleyCut> | null | undefined, ids: Id[]) => JSON.stringify(ids.map((id) => cleanCuts(cuts, ids)?.[id] ?? null))

/** Um medley com as mesmas músicas, na mesma ordem e com os mesmos trechos (para não criar dois iguais). */
export function findMedley(songs: Song[], ids: Id[], cuts?: Record<Id, MedleyCut> | null): Song | undefined {
  const key = ids.join('|')
  const trechos = cutsKey(cuts, ids)
  return songs.find((s) => isMedley(s) && s.medleyIds!.join('|') === key && cutsKey(s.medleyCuts, ids) === trechos)
}

// ---------------------------------------------------------------------------
// Seções de cada música (para escolher onde entra e até onde vai)
// ---------------------------------------------------------------------------

export interface SectionOption {
  index: number
  label: string | null
  /** "Refrão (2ª vez)" */
  name: string
  /** O começo da letra da seção, para reconhecer qual é. */
  snippet: string
}

/** As seções de uma cifra com nomes que dá para distinguir ("Refrão", "Refrão (2ª vez)"…). */
export function sectionOptions(sections: SheetSection[]): SectionOption[] {
  const base = sections.map((s, i) => s.label ?? (i === 0 ? 'Começo' : 'Sem nome'))
  const total = new Map<string, number>()
  for (const b of base) total.set(b, (total.get(b) ?? 0) + 1)
  const seen = new Map<string, number>()
  return sections.map((s, i) => {
    const n = (seen.get(base[i]) ?? 0) + 1
    seen.set(base[i], n)
    const lyric = s.lines.find((l) => l.kind === 'lyric' && lineText(l).trim())
    const text = lyric ? lineText(lyric).replace(/\s+/g, ' ').trim() : ''
    return {
      index: i,
      label: s.label,
      name: (total.get(base[i]) ?? 0) > 1 ? `${base[i]} (${n}ª vez)` : base[i],
      snippet: text.length > 34 ? `${text.slice(0, 33).trimEnd()}…` : text,
    }
  })
}

/** As seções da cifra de uma música, como o medley as vê. */
export const songSections = (song: Song): SectionOption[] => sectionOptions(parseSheet(song.content).sections)

/** Acha a seção guardada; se a cifra mudou, a de mesmo nome mais perto de onde ela estava. */
function findSection(sections: Array<{ label: string | null }>, ref: SectionRef | null | undefined): number | null {
  if (!ref) return null
  const same = (i: number) => (sections[i]?.label ?? null) === (ref.label ?? null)
  if (same(ref.index)) return ref.index
  let best: number | null = null
  sections.forEach((_, i) => {
    if (same(i) && (best === null || Math.abs(i - ref.index) < Math.abs(best - ref.index))) best = i
  })
  return best
}

/** De qual a qual seção (inclusive) a música entra no medley. */
export function cutRange(sections: Array<{ label: string | null }>, cut: MedleyCut | null | undefined): [number, number] {
  const last = Math.max(sections.length - 1, 0)
  const from = findSection(sections, cut?.from) ?? 0
  const to = findSection(sections, cut?.to) ?? last
  return [from, Math.max(from, to)]
}

/** A seção escolhida como ponto do trecho (null quando é o começo ou o fim: a música inteira). */
export function sectionRef(options: SectionOption[], index: number, edge: 'from' | 'to'): SectionRef | null {
  const last = options.length - 1
  if ((edge === 'from' && index <= 0) || (edge === 'to' && index >= last)) return null
  return { index, label: options[index]?.label ?? null }
}

/** "Refrão → Ponte", "começo → Ponte", "Refrão → fim" (sem texto quando é a música inteira). */
export function rangeText(options: SectionOption[], [from, to]: [number, number]): string | undefined {
  const last = options.length - 1
  if (from <= 0 && to >= last) return undefined
  return `${from <= 0 ? 'começo' : options[from].name} → ${to >= last ? 'fim' : options[to].name}`
}

// ---------------------------------------------------------------------------
// A cifra do medley
// ---------------------------------------------------------------------------

/**
 * A cifra do medley: o trecho de cada parte no tom da equipe, um depois do outro. A primeira
 * seção de cada parte diz qual música começa ali (e qual trecho dela), e a última avisa para
 * qual troca e em que parte ela entra. O tom do medley é o da primeira parte; transpor o
 * medley move todas juntas, e a passagem de uma para a outra continua igual.
 */
export function medleyDoc(parts: Song[], cuts?: Record<Id, MedleyCut> | null): { doc: SheetDoc; baseKey: string | null } {
  const pieces = parts.map((song) => {
    const parsed = parseSheet(song.content)
    const from = song.originalKey ?? detectKeyFromText(song.content)
    const to = partKey(song)
    const shift = from && to ? semitonesBetween(from, to) : 0
    const doc = mod12(shift) ? transposeDoc(parsed, shift, makeSpeller(to)) : parsed
    const options = sectionOptions(parsed.sections)
    const range = cutRange(parsed.sections, cuts?.[song.id])
    return { song, key: to, sections: doc.sections.slice(range[0], range[1] + 1), options, range }
  })
  const sections: SheetSection[] = []
  pieces.forEach((p, i) => {
    const part: MedleyPart = { index: i + 1, songId: p.song.id, title: p.song.title, artist: p.song.artist, key: p.key, range: rangeText(p.options, p.range) }
    const own: SheetSection[] = p.sections.length ? p.sections.map((s) => ({ ...s })) : [{ label: null, type: 'other', lines: [] }]
    own[0] = { ...own[0], part }
    const next = pieces[i + 1]
    if (next) {
      own[own.length - 1] = {
        ...own[own.length - 1],
        cue: { index: i + 2, title: next.song.title, entry: next.range[0] > 0 ? (next.options[next.range[0]]?.name ?? null) : null, key: next.key },
      }
    }
    sections.push(...own)
  })
  return { doc: { meta: {}, sections }, baseKey: parts[0] ? partKey(parts[0]) : null }
}
