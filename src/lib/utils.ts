import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ['card', 'pop', 'float'] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** UUID v4 — usa crypto.randomUUID quando existe (só em contexto seguro). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID()
    } catch {
      /* contexto inseguro (http na rede local) */
    }
  }
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const nowIso = () => new Date().toISOString()

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ---------------------------------------------------------------------------
// Datas (cultos usam data local "AAAA-MM-DD" para não sofrer com fuso horário)
// ---------------------------------------------------------------------------

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export function todayString(): string {
  return toLocalDateString(new Date())
}

/** Diferença em dias de calendário (b - a). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86400000)
}

const fmtWeekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
const fmtWeekdayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const fmtDayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
const fmtDayMonthShort = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const fmtMonthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const fmtTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function weekdayName(s: string, short = false): string {
  const d = parseLocalDate(s)
  return cap((short ? fmtWeekdayShort : fmtWeekday).format(d).replace('.', ''))
}

export function monthShort(s: string): string {
  return fmtMonthShort.format(parseLocalDate(s)).replace('.', '').toUpperCase()
}

export function dayOfMonth(s: string): number {
  return parseLocalDate(s).getDate()
}

/** "Hoje", "Amanhã", "Domingo, 19 de outubro" */
export function friendlyDate(s: string, opts: { short?: boolean } = {}): string {
  const d = parseLocalDate(s)
  const diff = daysBetween(new Date(), d)
  const dm = (opts.short ? fmtDayMonthShort : fmtDayMonth).format(d).replace('.', '')
  if (diff === 0) return `Hoje, ${dm}`
  if (diff === 1) return `Amanhã, ${dm}`
  if (diff === -1) return `Ontem, ${dm}`
  return `${weekdayName(s, opts.short)}, ${dm}`
}

/** "em 3 dias", "hoje", "há 2 semanas" */
export function relativeDays(s: string): string {
  const diff = daysBetween(new Date(), parseLocalDate(s))
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  if (diff > 1 && diff < 14) return `em ${diff} dias`
  if (diff >= 14) return `em ${Math.round(diff / 7)} semanas`
  if (diff > -14) return `há ${-diff} dias`
  return `há ${Math.round(-diff / 7)} semanas`
}

export function timeOf(iso: string): string {
  return fmtTime.format(new Date(iso))
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  const days = Math.floor(diff / 86400)
  if (days < 7) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
  return fmtDayMonthShort.format(new Date(iso)).replace('.', '')
}

/** Rótulo de separador de dia no chat. */
export function chatDayLabel(iso: string): string {
  const d = new Date(iso)
  const diff = daysBetween(d, new Date())
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return cap(fmtWeekday.format(d))
  return fmtDayMonth.format(d)
}

export function sameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

/** Remove nulos/indefinidos mantendo o tipo (ex.: perfis que não existem mais). */
export function compact<T>(list: Array<T | null | undefined>): T[] {
  return list.filter((x): x is T => x != null)
}

/** Move um item de posição num array (sem mutar). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export function downloadFile(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
