import type { Attendance, AttendanceStatus, Id, Service } from '@/types'
import { parseLocalDate } from './utils'

/**
 * Presença: cada evento que já começou conta para quem estava na escala ou respondeu.
 *  • presente — marcado pelo líder, ou confirmou e ninguém marcou falta;
 *  • atrasado — esteve, mas chegou depois do horário (conta como presença, e o atraso fica registrado);
 *  • ausente com motivo/justificativa — falta justificada;
 *  • ausente sem nada — falta sem justificativa;
 *  • escalado sem nenhum registro — "sem registro" (não entra na porcentagem).
 *
 * Do horário de início em diante o evento já está acontecendo: presença, atraso e falta são o
 * que aconteceu, não mais uma resposta sobre o futuro.
 */

export type AttendanceView = AttendanceStatus | 'pendente'

export const isJustified = (a: Pick<Attendance, 'reason' | 'note'>) => !!(a.reason || a.note.trim())

/** Início do evento (data e horário locais; sem horário, o começo do dia). */
export function serviceStart(service: Pick<Service, 'date' | 'time'>): Date {
  const d = parseLocalDate(service.date)
  const m = /^(\d{1,2}):(\d{2})/.exec(service.time ?? '')
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d
}

/** O evento já começou (ou já passou)? */
export const hasStarted = (service: Pick<Service, 'date' | 'time'>, now = new Date()) => serviceStart(service).getTime() <= now.getTime()

/** "HH:mm" de agora. */
export const clockNow = (now = new Date()) => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

/** Minutos de atraso pelo horário do evento (null sem horário de chegada ou do evento). */
export function minutesLate(service: Pick<Service, 'time'>, record: Pick<Attendance, 'arrivedAt'>): number | null {
  const toMin = (t: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const start = toMin(service.time)
  const arrived = toMin(record.arrivedAt)
  if (start === null || arrived === null) return null
  return Math.max(0, arrived - start)
}

export function expectedMembers(service: Pick<Service, 'id' | 'team'>, records: Attendance[]): Id[] {
  const ids = new Set(service.team.map((t) => t.userId))
  for (const r of records) if (r.serviceId === service.id) ids.add(r.userId)
  return [...ids]
}

export interface MemberStats {
  userId: Id
  services: number
  /** Esteve no evento (no horário ou atrasado). */
  present: number
  /** Desses, quantas vezes chegou atrasado. */
  late: number
  justified: number
  unjustified: number
  unmarked: number
  /** 0–1, ou null sem nenhum culto marcado. */
  rate: number | null
}

export function memberStats(services: Service[], attendance: Attendance[], opts: { now?: Date; from?: string | null } = {}): Map<Id, MemberStats> {
  const now = opts.now ?? new Date()
  const byService = new Map<Id, Map<Id, Attendance>>()
  for (const a of attendance) {
    const m = byService.get(a.serviceId) ?? new Map<Id, Attendance>()
    m.set(a.userId, a)
    byService.set(a.serviceId, m)
  }
  const out = new Map<Id, MemberStats>()
  const get = (userId: Id) => {
    let s = out.get(userId)
    if (!s) {
      s = { userId, services: 0, present: 0, late: 0, justified: 0, unjustified: 0, unmarked: 0, rate: null }
      out.set(userId, s)
    }
    return s
  }
  for (const svc of services) {
    if (!hasStarted(svc, now)) continue
    if (opts.from && svc.date < opts.from) continue
    const records = byService.get(svc.id) ?? new Map<Id, Attendance>()
    for (const userId of expectedMembers(svc, [...records.values()])) {
      const s = get(userId)
      s.services++
      const r = records.get(userId)
      if (!r) s.unmarked++
      else if (r.status === 'ausente') {
        if (isJustified(r)) s.justified++
        else s.unjustified++
      } else {
        s.present++
        if (r.status === 'atrasado') s.late++
      }
    }
  }
  for (const s of out.values()) {
    const counted = s.present + s.justified + s.unjustified
    s.rate = counted ? s.present / counted : null
  }
  return out
}

/** Situação de um membro num culto, para mostrar na tela. */
export function viewFor(record: Attendance | undefined): AttendanceView {
  return record?.status ?? 'pendente'
}
