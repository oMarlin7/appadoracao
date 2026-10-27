import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, CheckCheck, CircleHelp, Clock, Eraser, X } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Card, Chip, Field, Input, SectionTitle, Textarea } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { attendanceId, clearAttendance, setAttendance } from '@/lib/actions'
import { clockNow, expectedMembers, hasStarted, isJustified, minutesLate } from '@/lib/attendance'
import { useMe, useRows, useTable } from '@/lib/store'
import { ABSENCE_REASONS, ABSENCE_REASON_BY_ID, ROLE_BY_ID } from '@/lib/taxonomy'
import { cn, firstName, plural, todayString } from '@/lib/utils'
import type { Attendance, Id, Service } from '@/types'

// ---------------------------------------------------------------------------
// Selo de situação
// ---------------------------------------------------------------------------

/** "chegou às 19:42 (+12 min)" + a observação, para a linha embaixo do nome. */
export function lateDetail(record: Pick<Attendance, 'arrivedAt' | 'note'>, service?: Pick<Service, 'time'>): string {
  const min = service ? minutesLate(service, record) : null
  return [record.arrivedAt && `chegou às ${record.arrivedAt}${min ? ` (+${min} min)` : ''}`, record.note && `“${record.note}”`].filter(Boolean).join(' · ')
}

export function AttendancePill({ record, past, service, className }: { record?: Attendance; past: boolean; service?: Pick<Service, 'time'>; className?: string }) {
  let cls = 'bg-surface-2 text-muted'
  let label = past ? 'Sem registro' : 'Sem resposta'
  if (record?.status === 'presente') {
    cls = 'bg-mint text-mint-ink'
    label = 'Presente'
  } else if (record?.status === 'atrasado') {
    const min = service ? minutesLate(service, record) : null
    cls = 'bg-peach text-peach-ink'
    label = min ? `Atrasado · ${min} min` : 'Atrasado'
  } else if (record?.status === 'confirmado') {
    cls = 'bg-mint text-mint-ink'
    label = past ? 'Confirmou' : 'Confirmado'
  } else if (record?.status === 'ausente') {
    const reason = record.reason ? ABSENCE_REASON_BY_ID[record.reason]?.name : null
    if (isJustified(record)) {
      cls = 'bg-butter text-butter-ink'
      label = reason ? `Ausente · ${reason}` : 'Ausente · justificou'
    } else {
      cls = 'bg-rose text-rose-ink'
      label = past ? 'Faltou' : 'Não vai'
    }
  }
  // Sem espaço (ex.: ao lado dos botões do líder), o selo encolhe com reticências em vez de ficar por baixo deles.
  return <span className={cn('inline-block max-w-full shrink-0 truncate rounded-full px-2.5 py-0.5 align-middle text-[12px] font-bold', cls, className)}>{label}</span>
}

// ---------------------------------------------------------------------------
// Justificar ausência
// ---------------------------------------------------------------------------

export function JustifySheet({
  open,
  onClose,
  service,
  userId,
}: {
  open: boolean
  onClose: () => void
  service: Pick<Service, 'id' | 'title' | 'date'>
  userId: Id
}) {
  const me = useMe()
  const profile = useTable('profiles')[userId]
  const current = useTable('attendance')[attendanceId(service.id, userId)]
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const self = userId === me?.id
  useEffect(() => {
    if (!open) return
    setReason(current?.status === 'ausente' ? current.reason : null)
    setNote(current?.status === 'ausente' ? current.note : '')
  }, [open, current])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={self ? 'Não vou poder ir' : `Ausência de ${firstName(profile?.name ?? 'membro')}`}
      description={service.title}
      footer={
        <Button
          className="w-full"
          loading={saving}
          onClick={async () => {
            setSaving(true)
            const ok = await setAttendance(service.id, userId, { status: 'ausente', reason, note })
            setSaving(false)
            if (ok) {
              toast.success(self ? 'Ausência avisada para a equipe' : 'Ausência registrada')
              onClose()
            }
          }}
        >
          {self ? 'Avisar ausência' : reason || note.trim() ? 'Registrar ausência justificada' : 'Registrar falta sem justificativa'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Motivo</div>
          <div className="flex flex-wrap gap-2">
            {ABSENCE_REASONS.map((r) => (
              <Chip key={r.id} icon={r.icon} selected={reason === r.id} color="butter" onClick={() => setReason(reason === r.id ? null : r.id)}>
                {r.name}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Justificativa" hint="opcional">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={self ? 'Ex.: plantão no trabalho — já combinei com o Pedro para me cobrir no baixo.' : 'Ex.: avisou pelo WhatsApp que estava doente.'}
            />
          )}
        </Field>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Registrar atraso
// ---------------------------------------------------------------------------

export function LateSheet({
  open,
  onClose,
  service,
  userId,
}: {
  open: boolean
  onClose: () => void
  service: Pick<Service, 'id' | 'title' | 'date' | 'time'>
  userId: Id
}) {
  const profile = useTable('profiles')[userId]
  const current = useTable('attendance')[attendanceId(service.id, userId)]
  const [arrivedAt, setArrivedAt] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    const late = current?.status === 'atrasado'
    // No dia do evento, o horário de agora (o líder marca na hora em que a pessoa chega).
    setArrivedAt((late && current.arrivedAt) || (service.date === todayString() ? clockNow() : (service.time ?? '')))
    setNote(late ? current.note : '')
  }, [open, current, service.date, service.time])
  const min = minutesLate(service, { arrivedAt })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Atraso de ${firstName(profile?.name ?? 'membro')}`}
      description={`${service.title}${service.time ? ` · começou às ${service.time}` : ''}`}
      footer={
        <Button
          className="w-full"
          loading={saving}
          onClick={async () => {
            setSaving(true)
            const ok = await setAttendance(service.id, userId, { status: 'atrasado', arrivedAt: arrivedAt || null, note })
            setSaving(false)
            if (ok) {
              toast.success('Atraso registrado')
              onClose()
            }
          }}
        >
          Registrar atraso
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Chegou às" hint={min ? `${min} min depois do início` : undefined}>
          {(id) => <Input id={id} type="time" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} />}
        </Field>
        <Field label="Observação" hint="opcional">
          {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: avisou que pegou trânsito." />}
        </Field>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Minha resposta (vou / não vou)
// ---------------------------------------------------------------------------

export function MyRsvp({ service, compact }: { service: Service; compact?: boolean }) {
  const me = useMe()
  const record = useTable('attendance')[me ? attendanceId(service.id, me.id) : '']
  const [justify, setJustify] = useState(false)
  if (!me) return null
  // Depois que o evento começa não há mais "vou / não vou": vale o que o líder registrar.
  if (hasStarted(service)) return null
  const roles = service.team.filter((t) => t.userId === me.id).map((t) => ROLE_BY_ID[t.role]?.name ?? t.role)
  const going = record?.status === 'confirmado' || record?.status === 'presente'
  const absent = record?.status === 'ausente'

  return (
    <div className={cn('rounded-3xl border border-line bg-surface shadow-card', compact ? 'p-3.5' : 'p-4')}>
      {!compact && (
        <div className="mb-3 flex items-center gap-2 text-[14px] text-ink-2">
          <CircleHelp className="size-[18px] text-primary" />
          <span className="min-w-0 flex-1">
            {roles.length ? (
              <>
                Você está na escala: <b className="text-ink">{roles.join(', ')}</b>. Vai estar lá?
              </>
            ) : (
              'Você vai estar lá?'
            )}
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={going ? 'primary' : 'outline'}
          icon={Check}
          className="flex-1"
          onClick={async () => {
            if (going) return void clearAttendance(service.id, me.id)
            if (await setAttendance(service.id, me.id, { status: 'confirmado' })) toast.success('Presença confirmada 🙌')
          }}
        >
          {going ? 'Confirmado' : 'Vou estar lá'}
        </Button>
        <Button size="sm" variant={absent ? 'danger' : 'outline'} icon={X} className="flex-1" onClick={() => setJustify(true)}>
          {absent ? 'Ausência avisada' : 'Não vou poder'}
        </Button>
      </div>
      {absent && record && (record.reason || record.note) && (
        <p className="mt-2.5 text-[12.5px] text-muted">
          {record.reason && <b>{ABSENCE_REASON_BY_ID[record.reason]?.name}</b>}
          {record.reason && record.note && ' · '}
          {record.note}
        </p>
      )}
      <JustifySheet open={justify} onClose={() => setJustify(false)} service={service} userId={me.id} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presença no culto (lista da escala)
// ---------------------------------------------------------------------------

export function ServiceAttendance({ service, canManage }: { service: Service; canManage: boolean }) {
  const profiles = useTable('profiles')
  const attendance = useRows('attendance')
  const [justifyFor, setJustifyFor] = useState<Id | null>(null)
  const [lateFor, setLateFor] = useState<Id | null>(null)
  const records = useMemo(() => attendance.filter((a) => a.serviceId === service.id), [attendance, service.id])
  const byUser = useMemo(() => new Map(records.map((r) => [r.userId, r])), [records])
  // Do horário de início em diante, a presença é o que aconteceu (não mais "vai / não vai").
  const past = hasStarted(service)
  const markDay = past || service.date <= todayString()
  const members = expectedMembers(service, records)
    .filter((id) => profiles[id])
    .sort((a, b) => profiles[a].name.localeCompare(profiles[b].name, 'pt-BR'))

  const late = records.filter((r) => r.status === 'atrasado').length
  const yes = records.filter((r) => r.status !== 'ausente' && r.status !== 'atrasado').length
  const no = records.filter((r) => r.status === 'ausente').length
  const pending = members.filter((id) => !byUser.has(id)).length
  const subtitle = members.length
    ? [
        yes && (markDay ? plural(yes, 'presente', 'presentes') : plural(yes, 'confirmado', 'confirmados')),
        late && plural(late, 'atrasado', 'atrasados'),
        no && plural(no, 'ausente', 'ausentes'),
        pending && `${pending} sem ${past ? 'registro' : 'resposta'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Monte a escala para acompanhar a presença.'

  return (
    <section className="mt-8">
      <SectionTitle
        title="Presença"
        subtitle={subtitle}
        action={
          canManage && markDay && pending > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              icon={CheckCheck}
              onClick={async () => {
                for (const id of members) if (!byUser.has(id)) await setAttendance(service.id, id, { status: 'presente' })
                toast.success('Todos marcados como presentes')
              }}
            >
              Todos presentes
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-3">
        {!past && <MyRsvp service={service} />}
        {members.length > 0 && (
          <Card className="divide-y divide-line">
            {members.map((id) => {
              const p = profiles[id]
              const r = byUser.get(id)
              const roles = service.team.filter((t) => t.userId === id).map((t) => ROLE_BY_ID[t.role]?.name ?? t.role)
              return (
                <div key={id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar profile={p} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[14.5px] font-bold text-ink">{firstName(p.name)}</span>
                      <AttendancePill record={r} past={past} />
                    </div>
                    <div className="truncate text-[12.5px] text-muted">
                      {roles.join(' · ') || 'Fora da escala'}
                      {r?.status === 'ausente' && r.note ? ` · “${r.note}”` : ''}
                    </div>
                    {r?.status === 'atrasado' && lateDetail(r, service) && <div className="line-clamp-2 text-[12.5px] leading-snug text-peach-ink">{lateDetail(r, service)}</div>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Marcar ${firstName(p.name)} como ${markDay ? 'presente' : 'confirmado'}`}
                        onClick={() => void setAttendance(service.id, id, { status: markDay ? 'presente' : 'confirmado' })}
                        className={cn(
                          'grid size-9 place-items-center rounded-full border transition-colors',
                          r && r.status !== 'ausente' && r.status !== 'atrasado' ? 'border-transparent bg-mint text-mint-ink' : 'border-line text-muted hover:bg-surface-2',
                        )}
                      >
                        <Check className="size-[18px]" strokeWidth={2.6} />
                      </button>
                      {markDay && (
                        <button
                          type="button"
                          aria-label={`Registrar atraso de ${firstName(p.name)}`}
                          onClick={() => setLateFor(id)}
                          className={cn(
                            'grid size-9 place-items-center rounded-full border transition-colors',
                            r?.status === 'atrasado' ? 'border-transparent bg-peach text-peach-ink' : 'border-line text-muted hover:bg-surface-2',
                          )}
                        >
                          <Clock className="size-[18px]" strokeWidth={2.4} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Marcar ausência de ${firstName(p.name)}`}
                        onClick={() => setJustifyFor(id)}
                        className={cn(
                          'grid size-9 place-items-center rounded-full border transition-colors',
                          r?.status === 'ausente' ? 'border-transparent bg-rose text-rose-ink' : 'border-line text-muted hover:bg-surface-2',
                        )}
                      >
                        <X className="size-[18px]" strokeWidth={2.6} />
                      </button>
                      {r && (
                        <Menu
                          label="Mais opções de presença"
                          items={[{ label: 'Limpar marcação', icon: Eraser, onSelect: () => void clearAttendance(service.id, id) }]}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        )}
      </div>
      {justifyFor && <JustifySheet open onClose={() => setJustifyFor(null)} service={service} userId={justifyFor} />}
      {lateFor && <LateSheet open onClose={() => setLateFor(null)} service={service} userId={lateFor} />}
    </section>
  )
}
