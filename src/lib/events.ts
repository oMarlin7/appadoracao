import { AudioLines, Cake, Church, MessagesSquare, PartyPopper, Star, Tent, type LucideIcon } from 'lucide-react'
import { stripAccents } from './music/sheet'
import type { Pastel } from './taxonomy'
import type { EventKind, Service } from '@/types'

/**
 * Tipos de evento da programação. "Apresentação" é onde a equipe ministra o que ensaiou
 * (culto, festa, congresso…): só esses contam como "próximo evento" e abrem votação.
 */
export interface EventKindInfo {
  id: EventKind
  name: string
  icon: LucideIcon
  color: Pastel
  presentation: boolean
  /** Títulos prontos ao criar o evento. */
  presets: string[]
}

export const EVENT_KINDS: EventKindInfo[] = [
  { id: 'culto', name: 'Culto', icon: Church, color: 'lavender', presentation: true, presets: ['Culto de Domingo', 'Culto de Celebração', 'Culto de Santa Ceia', 'Culto de Jovens', 'Culto de Oração'] },
  { id: 'festa', name: 'Festa', icon: PartyPopper, color: 'butter', presentation: true, presets: ['Festa da Igreja', 'Aniversário da Igreja', 'Festa de Natal'] },
  { id: 'congresso', name: 'Congresso', icon: Tent, color: 'sky', presentation: true, presets: ['Congresso de Jovens', 'Congresso de Mulheres', 'Conferência'] },
  { id: 'especial', name: 'Especial', icon: Star, color: 'orchid', presentation: true, presets: ['Casamento', 'Cantata', 'Batismo', 'Evento especial'] },
  { id: 'ensaio', name: 'Ensaio', icon: AudioLines, color: 'mint', presentation: false, presets: ['Ensaio', 'Ensaio geral', 'Passagem de som'] },
  { id: 'reuniao', name: 'Reunião', icon: MessagesSquare, color: 'sage', presentation: false, presets: ['Reunião do ministério', 'Reunião de oração da equipe'] },
  { id: 'confraternizacao', name: 'Confraternização', icon: Cake, color: 'peach', presentation: false, presets: ['Confraternização da equipe', 'Café da manhã do ministério'] },
]

export const EVENT_KIND_BY_ID = Object.fromEntries(EVENT_KINDS.map((k) => [k.id, k])) as Record<EventKind, EventKindInfo>

/** Tipo do evento (eventos antigos, sem tipo, são deduzidos pelo título). */
export function eventKind(s: Pick<Service, 'kind' | 'title'>): EventKind {
  if (s.kind && EVENT_KIND_BY_ID[s.kind]) return s.kind
  const t = stripAccents(s.title.toLowerCase())
  if (/^(ensaio|passagem de som)/.test(t)) return 'ensaio'
  if (/reuniao/.test(t)) return 'reuniao'
  if (/confraterniza/.test(t)) return 'confraternizacao'
  return 'culto'
}

export const isPresentation = (s: Pick<Service, 'kind' | 'title'>) => EVENT_KIND_BY_ID[eventKind(s)].presentation
