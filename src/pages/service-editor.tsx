import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { Page, TopBar } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, Chip, Field, Input, Textarea } from '@/components/ui/primitives'
import { newService, saveService } from '@/lib/actions'
import { useDocumentTitle } from '@/lib/hooks'
import { useRow, useRows } from '@/lib/store'
import { EVENT_KINDS, EVENT_KIND_BY_ID, eventKind } from '@/lib/events'
import { tint } from '@/lib/taxonomy'
import { addDays, cn, firstName, toLocalDateString } from '@/lib/utils'
import type { Service } from '@/types'

function nextSundayString(): string {
  const d = new Date()
  return toLocalDateString(addDays(d, (7 - d.getDay()) % 7 || 7))
}

export function ServiceEditorPage() {
  const { id } = useParams()
  const existing = useRow('services', id)
  const isNew = !id
  useDocumentTitle(isNew ? 'Novo evento' : 'Editar evento')
  const navigate = useNavigate()
  const profiles = useRows('profiles')
  const [service, setService] = useState<Service>(() => existing ?? newService({ date: nextSundayString() }))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setService((s) => ({ ...s, [k]: v }))
  const kind = EVENT_KIND_BY_ID[eventKind(service)]

  if (id && !existing)
    return (
      <>
        <TopBar backTo="/cultos" />
        <Page>
          <p className="py-16 text-center text-muted">Evento não encontrado.</p>
        </Page>
      </>
    )

  const save = async () => {
    setSaving(true)
    const ok = await saveService(service)
    setSaving(false)
    if (ok) {
      toast.success(isNew ? `${kind.name} agendado 🙌` : 'Evento atualizado')
      navigate(`/cultos/${service.id}`, { replace: true })
    }
  }

  return (
    <>
      <TopBar
        title={isNew ? 'Novo evento' : 'Editar evento'}
        actions={
          <Button size="sm" icon={Save} loading={saving} onClick={() => void save()}>
            Salvar
          </Button>
        }
      />
      <Page className="max-w-2xl space-y-5 pt-5 pb-10">
        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink-2">Tipo de evento</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EVENT_KINDS.filter((k) => !k.retired || k.id === kind.id).map((k) => {
                const active = kind.id === k.id
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setService((s) => ({
                        ...s,
                        kind: k.id,
                        // Troca o nome sugerido só se ainda era um nome pronto de outro tipo.
                        title: EVENT_KINDS.some((x) => x.presets.includes(s.title)) || !s.title.trim() ? k.presets[0] : s.title,
                      }))
                    }
                    className={cn(
                      'flex items-center gap-2 rounded-2xl border p-2.5 text-left text-[13.5px] font-bold transition-all',
                      active ? 'border-transparent shadow-card' : 'border-line text-ink-2 hover:bg-surface-2',
                    )}
                    style={active ? tint(k.color) : undefined}
                  >
                    <k.icon className="size-[18px] shrink-0" />
                    {k.name}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {kind.presets.map((p) => (
              <Chip key={p} size="sm" selected={service.title === p} onClick={() => set('title', p)}>
                {p}
              </Chip>
            ))}
          </div>
          <Field label="Nome do evento">{(fid) => <Input id={fid} value={service.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Culto de Domingo" />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">{(fid) => <Input id={fid} type="date" value={service.date} onChange={(e) => e.target.value && set('date', e.target.value)} />}</Field>
            <Field label="Horário">{(fid) => <Input id={fid} type="time" value={service.time ?? ''} onChange={(e) => set('time', e.target.value || null)} />}</Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="text-[16px] font-bold">Mensagem</h2>
          <Field label="Tema da pregação">
            {(fid) => <Input id={fid} value={service.theme} onChange={(e) => set('theme', e.target.value)} placeholder="Ex.: A fidelidade de Deus nas estações difíceis" />}
          </Field>
          <Field label="Texto bíblico">{(fid) => <Input id={fid} value={service.bibleText} onChange={(e) => set('bibleText', e.target.value)} placeholder="Ex.: Lamentações 3:22-23" />}</Field>
          <Field label="Observações">
            {(fid) => <Textarea id={fid} rows={3} value={service.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-[16px] font-bold">Quem ministra?</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {profiles
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set('leaderId', service.leaderId === p.id ? null : p.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all',
                    service.leaderId === p.id ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2',
                  )}
                >
                  <Avatar profile={p} size="sm" />
                  <span className="truncate text-[14px] font-bold text-ink">{firstName(p.name)}</span>
                </button>
              ))}
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button icon={Save} loading={saving} onClick={() => void save()}>
            {isNew ? 'Agendar' : 'Salvar'}
          </Button>
        </div>
      </Page>
    </>
  )
}
