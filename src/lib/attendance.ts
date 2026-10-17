import type { Attendance, AttendanceStatus, Id, Service } from '@/types'

/**
 * Presença: cada culto que já aconteceu conta para quem estava na escala ou respondeu.
 *  • presente — marcado pelo líder, ou confirmou e ninguém marcou falta;
 *  • ausente com motivo/justificativa — falta justificada;
 *  • ausente sem nada — falta sem justificativa;
 *  • escalado sem nenhum registro — "sem registro" (não entra na porcentagem).
 */

export type AttendanceView = AttendanceStatus | 'pendente'

export const isJustified = (a: Pick<Attendance, 'reason' | 'note'>) => !!(a.reason || a.note.trim())

export function expectedMembers(service: Pick<Service, 'id' | 'team'>, records: Attendance[]): Id[] {
  const ids = new Set(service.team.map((t) => t.userId))
  for (const r of records) if (r.serviceId === service.id) ids.add(r.userId)
  return [...ids]
}

export interface MemberStats {
  userId: Id
  services: number
  present: number
  justified: number
  unjustified: number
  unmarked: number
  /** 0–1, ou null sem nenhum culto marcado. */
  rate: number | null
}

export function memberStats(
  services: Service[],
  attendance: Attendance[],
  opts: { today: string; from?: string | null },
): Map<Id, MemberStats> {
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
      s = { userId, services: 0, present: 0, justified: 0, unjustified: 0, unmarked: 0, rate: null }
      out.set(userId, s)
    }
    return s
  }
  for (const svc of services) {
    if (svc.date >= opts.today) continue
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
      } else s.present++
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
