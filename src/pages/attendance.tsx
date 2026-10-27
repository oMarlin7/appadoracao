import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { AttendancePill, lateDetail, MyRsvp } from '@/components/attendance'
import { Avatar } from '@/components/avatar'
import { HeaderAvatar, Page, PageHeader } from '@/components/layout'
import { DateBlock } from '@/pages/services'
import { Card, EmptyState, SectionTitle, Segmented } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { attendanceId } from '@/lib/actions'
import { expectedMembers, hasStarted, isJustified, memberStats, minutesLate, type MemberStats } from '@/lib/attendance'
import { useDocumentTitle, useServices } from '@/lib/hooks'
import { useMe, useRows, useTable } from '@/lib/store'
import { ABSENCE_REASON_BY_ID } from '@/lib/taxonomy'
import { addDays, cn, firstName, friendlyDate, plural, toLocalDateString } from '@/lib/utils'
import type { Attendance, Id, Profile, Service } from '@/types'

type Period = '30' | '90' | 'tudo'

export function AttendancePage() {
  useDocumentTitle('Presença')
  const me = useMe()
  const profiles = useRows('profiles')
  const services = useRows('services')
  const attendance = useRows('attendance')
  const servicesById = useTable('services')
  const { upcoming } = useServices()
  const [period, setPeriod] = useState<Period>('90')
  const [member, setMember] = useState<Id | null>(null)

  const stats = useMemo(() => {
    const from = period === 'tudo' ? null : toLocalDateString(addDays(new Date(), -Number(period)))
    return memberStats(services, attendance, { from })
  }, [services, attendance, period])

  const rows = useMemo(
    () =>
      profiles
        .map((p) => ({ profile: p, stats: stats.get(p.id) }))
        .sort((a, b) => (b.stats?.rate ?? -1) - (a.stats?.rate ?? -1) || a.profile.name.localeCompare(b.profile.name, 'pt-BR')),
    [profiles, stats],
  )

  // Do horário de início em diante o evento já aconteceu: sai dos "próximos" e entra no histórico.
  const started = (a: Attendance) => !!servicesById[a.serviceId] && hasStarted(servicesById[a.serviceId])
  const byDate = (a: Attendance, b: Attendance) => servicesById[a.serviceId].date.localeCompare(servicesById[b.serviceId].date)
  // Ausências já avisadas para os próximos cultos (o líder reorganiza a escala).
  const upcomingAbsences = attendance.filter((a) => a.status === 'ausente' && servicesById[a.serviceId] && !started(a)).sort(byDate)
  const recentAbsences = attendance
    .filter((a) => a.status === 'ausente' && started(a))
    .sort((a, b) => byDate(b, a))
    .slice(0, 8)
  const recentLates = attendance
    .filter((a) => a.status === 'atrasado' && started(a))
    .sort((a, b) => byDate(b, a))
    .slice(0, 8)
  const profileById = useTable('profiles')
  const nextServices = upcoming.filter((s) => !hasStarted(s)).slice(0, 3)

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Presença" subtitle="Confirmações, faltas, atrasos e justificativas da equipe" actions={<HeaderAvatar />} />

      {nextServices.length > 0 && (
        <section>
          <SectionTitle title="Próximos cultos" subtitle="Confirme ou avise com antecedência" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {nextServices.map((s) => {
              const records = attendance.filter((a) => a.serviceId === s.id)
              const expected = expectedMembers(s, records)
              const yes = records.filter((r) => r.status !== 'ausente').length
              const no = records.filter((r) => r.status === 'ausente').length
              return (
                <Card key={s.id} className="p-4">
                  <Link to={`/cultos/${s.id}`} className="flex items-center gap-3">
                    <DateBlock date={s.date} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-ink">{s.title}</div>
                      <div className="truncate text-[12.5px] text-muted">
                        {plural(yes, 'confirmado', 'confirmados')} · {plural(no, 'ausente', 'ausentes')} · {Math.max(0, expected.length - records.length)} sem resposta
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </Link>
                  <div className="mt-3">
                    <MyRsvp service={s} compact />
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {upcomingAbsences.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="Ausências avisadas" subtitle="Quem não vai estar nos próximos cultos" />
          <Card className="divide-y divide-line">
            {upcomingAbsences.map((a) => (
              <AbsenceRow key={a.id} profile={profileById[a.userId]} serviceTitle={servicesById[a.serviceId].title} date={servicesById[a.serviceId].date} reason={a.reason} note={a.note} to={`/cultos/${a.serviceId}`} />
            ))}
          </Card>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle title="Frequência" subtitle="Cultos que já aconteceram" />
        <Segmented<Period>
          size="sm"
          value={period}
          onChange={setPeriod}
          className="mb-3"
          options={[
            { value: '30', label: 'Últimos 30 dias' },
            { value: '90', label: '90 dias' },
            { value: 'tudo', label: 'Tudo' },
          ]}
        />
        {rows.every((r) => !r.stats) ? (
          <EmptyState icon={CalendarCheck} title="Sem registros no período" />
        ) : (
          <Card className="divide-y divide-line">
            {rows.map(({ profile, stats: s }) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setMember(profile.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
              >
                <Avatar profile={profile} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14.5px] font-bold text-ink">
                      {profile.name}
                      {profile.id === me?.id && <span className="font-medium text-muted"> (você)</span>}
                    </span>
                    <span className="shrink-0 text-[14px] font-extrabold text-ink tabular-nums">{s?.rate != null ? `${Math.round(s.rate * 100)}%` : '—'}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={cn('h-full rounded-full', (s?.rate ?? 0) >= 0.75 ? 'bg-[var(--mint-solid)]' : (s?.rate ?? 0) >= 0.5 ? 'bg-[var(--butter-solid)]' : 'bg-[var(--rose-solid)]')}
                      style={{ width: `${Math.round((s?.rate ?? 0) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 truncate text-[12px] text-muted">{summary(s)}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </button>
            ))}
          </Card>
        )}
      </section>

      {recentAbsences.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="Ausências recentes" />
          <Card className="divide-y divide-line">
            {recentAbsences.map((a) => (
              <AbsenceRow key={a.id} profile={profileById[a.userId]} serviceTitle={servicesById[a.serviceId].title} date={servicesById[a.serviceId].date} reason={a.reason} note={a.note} to={`/cultos/${a.serviceId}`} />
            ))}
          </Card>
        </section>
      )}

      {recentLates.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="Atrasos recentes" />
          <Card className="divide-y divide-line">
            {recentLates.map((a) => (
              <LateRow key={a.id} profile={profileById[a.userId]} service={servicesById[a.serviceId]} record={a} />
            ))}
          </Card>
        </section>
      )}

      {member && profileById[member] && <MemberHistorySheet profile={profileById[member]} onClose={() => setMember(null)} />}
    </Page>
  )
}

function summary(s: MemberStats | undefined): string {
  if (!s) return 'Sem cultos no período'
  // O atraso já está dentro das presenças: "3 presenças (1 com atraso)".
  const parts = [`${plural(s.present, 'presença', 'presenças')}${s.late ? ` (${s.late} com atraso)` : ''}`]
  if (s.justified) parts.push(plural(s.justified, 'ausência justificada', 'ausências justificadas'))
  if (s.unjustified) parts.push(plural(s.unjustified, 'falta', 'faltas'))
  if (s.unmarked) parts.push(`${s.unmarked} sem registro`)
  return parts.join(' · ')
}

function AbsenceRow({ profile, serviceTitle, date, reason, note, to }: { profile?: Profile; serviceTitle: string; date: string; reason: string | null; note: string; to: string }) {
  if (!profile) return null
  const r = reason ? ABSENCE_REASON_BY_ID[reason] : null
  return (
    <Link to={to} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/60">
      <Avatar profile={profile} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14.5px] font-bold text-ink">{firstName(profile.name)}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', reason || note ? 'bg-butter text-butter-ink' : 'bg-rose text-rose-ink')}>
            {r ? r.name : note ? 'Justificou' : 'Sem justificativa'}
          </span>
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {serviceTitle} · {friendlyDate(date, { short: true })}
        </div>
        {note && <p className="mt-1 text-[13.5px] leading-snug text-ink-2">“{note}”</p>}
      </div>
    </Link>
  )
}

function LateRow({ profile, service, record }: { profile?: Profile; service: Service; record: Attendance }) {
  if (!profile) return null
  const min = minutesLate(service, record)
  return (
    <Link to={`/cultos/${service.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/60">
      <Avatar profile={profile} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14.5px] font-bold text-ink">{firstName(profile.name)}</span>
          <span className="rounded-full bg-peach px-2.5 py-0.5 text-[12px] font-bold text-peach-ink">{min ? `${min} min de atraso` : 'Atrasado'}</span>
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {service.title} · {friendlyDate(service.date, { short: true })}
          {record.arrivedAt ? ` · chegou às ${record.arrivedAt}` : ''}
        </div>
        {record.note && <p className="mt-1 text-[13.5px] leading-snug text-ink-2">“{record.note}”</p>}
      </div>
    </Link>
  )
}

function MemberHistorySheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const services = useRows('services')
  const attendance = useTable('attendance')
  const history = services
    .filter((s) => hasStarted(s) && (s.team.some((t) => t.userId === profile.id) || attendance[attendanceId(s.id, profile.id)]))
    .sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Sheet open onClose={onClose} title={profile.name} description="Histórico de presença nos cultos que já aconteceram">
      {history.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-muted">Nenhum culto registrado ainda.</p>
      ) : (
        <div className="divide-y divide-line">
          {history.map((s) => {
            const r = attendance[attendanceId(s.id, profile.id)]
            return (
              <Link key={s.id} to={`/cultos/${s.id}`} onClick={onClose} className="flex items-center gap-3 py-3">
                <DateBlock date={s.date} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-bold text-ink">{s.title}</div>
                  {r?.status === 'ausente' && isJustified(r) && <div className="truncate text-[12.5px] text-muted">{r.note || ABSENCE_REASON_BY_ID[r.reason ?? '']?.name}</div>}
                  {r?.status === 'atrasado' && lateDetail(r) && <div className="truncate text-[12.5px] text-muted">{lateDetail(r)}</div>}
                </div>
                <AttendancePill record={r} past service={s} />
              </Link>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}
