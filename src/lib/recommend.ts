import { keyCompatibility, normalizeKeyName, prettyAccidentals } from './music/theory'
import { scoreSong } from './search'
import { MOMENTS, MOMENT_BY_ID, TEMPO_BY_ID, THEMES, THEME_BY_ID, normalizeForMatch, suggestThemes, type Tempo } from './taxonomy'
import { daysBetween, parseLocalDate } from './utils'
import type { Favorite, Id, Service, SetlistItem, Song } from '@/types'

/**
 * Assistente de repertório (sem IA externa): pontua cada música pelo momento do culto,
 * temas, ritmo, transição de tom, familiaridade da equipe e variedade.
 * A interface é a mesma que um modelo de IA poderá usar no futuro.
 */

export interface RecommendQuery {
  moment?: string | null
  themes?: string[]
  tempo?: Tempo | null
  /** Tom da música anterior, para emendar bem. */
  afterKey?: string | null
  text?: string
  excludeIds?: Id[]
  limit?: number
}

export interface Recommendation {
  song: Song
  score: number
  reasons: string[]
  /** Tom sugerido (o da equipe, se houver). */
  key: string | null
}

export interface RecommendContext {
  songs: Song[]
  services: Service[]
  favorites: Favorite[]
  /** Data de referência (AAAA-MM-DD), padrão hoje. */
  today?: Date
}

interface Usage {
  plays: number
  lastPlayed: string | null
}

function usageMap(services: Service[], today: Date): Map<Id, Usage> {
  const map = new Map<Id, Usage>()
  for (const s of services) {
    const d = parseLocalDate(s.date)
    const ago = daysBetween(d, today)
    if (ago < 0 || ago > 180) continue
    for (const it of s.items) {
      const u = map.get(it.songId) ?? { plays: 0, lastPlayed: null }
      u.plays++
      if (!u.lastPlayed || s.date > u.lastPlayed) u.lastPlayed = s.date
      map.set(it.songId, u)
    }
  }
  return map
}

export const songKey = (s: Song) => s.teamKey ?? s.originalKey

export function recommend(ctx: RecommendContext, q: RecommendQuery): Recommendation[] {
  const today = ctx.today ?? new Date()
  const usage = usageMap(ctx.services, today)
  const favCount = new Map<Id, number>()
  for (const f of ctx.favorites) favCount.set(f.songId, (favCount.get(f.songId) ?? 0) + 1)
  const exclude = new Set(q.excludeIds ?? [])
  const moment = q.moment ? MOMENT_BY_ID[q.moment] : undefined
  const themes = q.themes ?? []
  const text = q.text?.trim()

  const out: Recommendation[] = []
  for (const song of ctx.songs) {
    if (exclude.has(song.id)) continue
    let score = 0
    const reasons: string[] = []

    if (moment) {
      if (song.moments.includes(moment.id)) {
        score += 6
        reasons.push(`Ideal para ${moment.short ?? moment.name}`)
      } else {
        const overlap = song.themes.filter((t) => moment.themes.includes(t)).length
        if (overlap) score += 1.5 * overlap
        else score -= 2
      }
      if (song.tempo && moment.tempos.includes(song.tempo)) score += moment.tempos[0] === song.tempo ? 2 : 1
      else if (song.tempo) score -= 1.5
    }

    if (themes.length) {
      const hits = themes.filter((t) => song.themes.includes(t))
      if (hits.length) {
        score += 4 * hits.length + (song.themes[0] === hits[0] ? 1 : 0)
        reasons.push(hits.map((t) => THEME_BY_ID[t]?.short ?? THEME_BY_ID[t]?.name ?? t).join(' · '))
      } else score -= 3
    }

    if (q.tempo) {
      if (song.tempo === q.tempo) {
        score += 3
        reasons.push(`Ritmo ${TEMPO_BY_ID[q.tempo].name.toLowerCase()}`)
      } else if (song.tempo) score -= 2.5
    }

    if (text) {
      const s = scoreSong(song, text)
      if (s > 0) {
        score += Math.min(10, s / 2)
        reasons.push('Combina com a busca')
      } else if (!themes.length && !moment && !q.tempo) continue
    }

    const key = songKey(song)
    if (q.afterKey && key) {
      const comp = keyCompatibility(q.afterKey, key)
      if (comp) {
        score += comp * 1.4
        reasons.push(
          comp === 3
            ? `Mesmo tom (${prettyAccidentals(key)})`
            : `${prettyAccidentals(key)} emenda bem com ${prettyAccidentals(normalizeKeyName(q.afterKey) ?? q.afterKey)}`,
        )
      }
    }

    const u = usage.get(song.id)
    if (u) {
      score += Math.min(2, u.plays * 0.5)
      if (u.plays >= 2) reasons.push('A equipe já conhece')
      const ago = u.lastPlayed ? daysBetween(parseLocalDate(u.lastPlayed), today) : 999
      if (ago <= 14) {
        score -= 2.5
        reasons.push(ago <= 7 ? 'Tocada na última semana' : 'Tocada há 2 semanas')
      }
    }

    const favs = favCount.get(song.id) ?? 0
    if (favs) {
      score += Math.min(2, favs * 0.5)
      if (favs >= 2) reasons.push(`Favorita de ${favs} membros`)
    }

    if (!song.content.trim()) score -= 2

    out.push({ song, score, reasons: dedupe(reasons), key })
  }
  return out.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, 'pt-BR')).slice(0, q.limit ?? 12)
}

function dedupe(list: string[]) {
  return Array.from(new Set(list)).slice(0, 4)
}

// ---------------------------------------------------------------------------
// Entendendo o pedido em português ("3 músicas de gratidão animadas para a abertura")
// ---------------------------------------------------------------------------

const MOMENT_WORDS: Array<[RegExp, string]> = [
  [/\b(abertura|abrir|inicio|comeco|comecar|chamada)\b/, 'abertura'],
  [/\b(ministracao|ministrar|pos[- ]?(mensagem|palavra|pregacao))\b/, 'ministracao'],
  [/\b(oracao|orar|clamor|intercessao|interceder)\b/, 'oracao'],
  [/\b(oferta|ofertas|dizimo|dizimos|ofertorio)\b/, 'oferta'],
  [/\b(ceia|comunhao)\b/, 'ceia'],
  [/\b(apelo|conversao|decisao)\b/, 'apelo'],
  [/\b(encerramento|encerrar|final|envio|despedida|fechar)\b/, 'encerramento'],
  [/\b(batismo|batismal)\b/, 'batismo'],
  [/\b(casamento|aniversario|apresentacao de criancas|homenagem|dia das maes|dia dos pais)\b/, 'especial'],
  [/\b(adoracao|adorar|intimidade)\b/, 'adoracao'],
  [/\b(louvor|celebracao|celebrar)\b/, 'louvor'],
]

const TEMPO_WORDS: Array<[RegExp, Tempo]> = [
  [/\b(lenta|lentas|calma|calmas|suave|suaves|contemplativa|contemplativas|tranquila)\b/, 'lenta'],
  [/\b(animada|animadas|rapida|rapidas|agitada|agitadas|pra cima|festiva|festivas|alegre|alegres)\b/, 'rapida'],
  [/\b(moderada|moderadas|media|medias)\b/, 'moderada'],
]

const NUMBER_WORDS: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8 }

export interface ParsedRequest extends RecommendQuery {
  count?: number
  understood: string[]
}

/** Interpreta um pedido em linguagem natural (sem IA): momento, temas, ritmo, tom e quantidade. */
export function parseRequest(input: string, songs: Song[] = []): ParsedRequest {
  const text = normalizeForMatch(input)
  const understood: string[] = []
  const req: ParsedRequest = { understood }

  for (const [re, id] of MOMENT_WORDS) {
    if (re.test(text)) {
      req.moment = id
      understood.push(`Momento: ${MOMENT_BY_ID[id].name}`)
      break
    }
  }

  const themes = new Set<string>()
  for (const t of THEMES) {
    const names = [t.name, t.short ?? '', t.id].map((n) => normalizeForMatch(n).trim()).filter(Boolean)
    const nameHit = names.some((n) => text.includes(` ${n} `) || (n.split(' ').length > 1 && text.includes(n)))
    const singleNames = normalizeForMatch(t.name)
      .trim()
      .split(' ')
      .filter((w) => w.length > 3 && !['deus', 'jesus'].includes(w))
    if (nameHit || singleNames.some((w) => text.includes(` ${w} `))) themes.add(t.id)
  }
  for (const t of suggestThemes(input, 3)) themes.add(t)
  // "louvor"/"adoração" como momento não precisam virar tema também.
  if (req.moment === 'louvor') themes.delete('celebracao')
  if (req.moment === 'adoracao') themes.delete('adoracao')
  if (themes.size) {
    req.themes = Array.from(themes).slice(0, 3)
    understood.push(`Tema: ${req.themes.map((t) => THEME_BY_ID[t].short ?? THEME_BY_ID[t].name).join(', ')}`)
  }

  for (const [re, id] of TEMPO_WORDS) {
    if (re.test(text)) {
      req.tempo = id
      understood.push(`Ritmo: ${TEMPO_BY_ID[id].name}`)
      break
    }
  }

  const keyMatch = /\b(?:tom|em|no tom de|tonalidade)\s+([a-g](?:#|b|sustenido|bemol)?m?)\b/.exec(
    text.replace(/ sustenido/g, '#').replace(/ bemol/g, 'b'),
  )
  if (keyMatch) {
    const k = normalizeKeyName(keyMatch[1])
    if (k) {
      req.afterKey = k
      understood.push(`Perto do tom ${prettyAccidentals(k)}`)
    }
  }

  const afterSong = /\b(?:depois de|apos|seguida de)\s+(.+?)(?:\s+(?:para|pra|no|na|com|em)\b|$)/.exec(text)
  if (afterSong && songs.length) {
    const target = afterSong[1].trim()
    const found = songs.find((s) => normalizeForMatch(s.title).trim() === target) ?? songs.find((s) => normalizeForMatch(s.title).includes(target))
    if (found && songKey(found)) {
      req.afterKey = songKey(found)
      req.excludeIds = [found.id]
      understood.push(`Depois de “${found.title}”`)
    }
  }

  const num = /\b(\d+|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito)\s+(?:musicas?|cancoes|hinos|louvores|opcoes|sugestoes)\b/.exec(text)
  if (num) req.count = Math.min(12, Number(num[1]) || NUMBER_WORDS[num[1]] || 3)

  const leftovers = text
    .replace(/\b(quero|preciso|me|de|da|do|das|dos|para|pra|uma|um|umas|uns|musicas?|cancoes|sugira|sugere|sugestao|sugestoes|para o|culto|momento|no|na|o|a|e|com|que|falem|falam|sobre|tema|hoje|domingo)\b/g, ' ')
    .trim()
  if (!req.moment && !req.themes && !req.tempo && leftovers.length > 2) req.text = input
  return req
}

// ---------------------------------------------------------------------------
// Setlist automática para um culto
// ---------------------------------------------------------------------------

export const DEFAULT_FLOW = ['abertura', 'louvor', 'louvor', 'adoracao', 'adoracao', 'ministracao']

export interface SetlistSuggestion extends Recommendation {
  moment: string
}

/** Monta um fluxo completo (abertura → louvor → adoração → ministração) emendando os tons. */
export function buildSetlist(
  ctx: RecommendContext,
  opts: { message?: string; themes?: string[]; flow?: string[]; existing?: SetlistItem[]; avoidIds?: Id[] },
): SetlistSuggestion[] {
  const flow = opts.flow ?? DEFAULT_FLOW
  const fromMessage = opts.message ? parseRequest(opts.message).themes ?? [] : []
  const themes = Array.from(new Set([...(opts.themes ?? []), ...fromMessage]))
  const picked: SetlistSuggestion[] = []
  const exclude = new Set((opts.existing ?? []).map((i) => i.songId))
  let lastKey: string | null = null
  for (const moment of flow) {
    const momentInfo = MOMENT_BY_ID[moment]
    const base = momentInfo?.themes.slice(0, 2) ?? []
    // Abertura e louvor pedem celebração; o tema da mensagem pesa mais da adoração em diante.
    const relevantThemes = ['abertura', 'louvor', 'encerramento'].includes(moment)
      ? Array.from(new Set([...themes.filter((t) => momentInfo?.themes.includes(t)), ...base]))
      : themes.length
        ? themes
        : base
    const query: RecommendQuery = { moment, themes: relevantThemes, afterKey: lastKey, limit: 1 }
    const avoid = opts.avoidIds ?? []
    // Tenta fugir das músicas já sugeridas; se não sobrar opção boa, aceita repetir.
    let best: Recommendation | undefined = avoid.length ? recommend(ctx, { ...query, excludeIds: [...exclude, ...avoid] })[0] : undefined
    if (!best || best.score <= 0) best = recommend(ctx, { ...query, excludeIds: Array.from(exclude) })[0]
    if (!best) continue
    picked.push({ ...best, moment })
    exclude.add(best.song.id)
    lastKey = best.key ?? lastKey
  }
  return picked
}

export { MOMENTS }
