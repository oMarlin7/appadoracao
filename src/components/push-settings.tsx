import { useEffect, useState } from 'react'
import { BellRing, Share, SquarePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { updateMyProfile } from '@/lib/actions'
import { disablePush, enablePush, NOTIFY_KINDS, pushStatus, sendTestPush, wantsKind, type NotifyKind, type PushStatus } from '@/lib/push'
import { readStorage, writeStorage } from '@/lib/storage'
import { tint } from '@/lib/taxonomy'
import { useMe } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Card, Switch } from './ui/primitives'

function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  useEffect(() => {
    let alive = true
    void pushStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])
  return [status, setStatus] as const
}

const failMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Não foi possível ativar agora. Tente de novo.')

async function activate(setStatus: (s: PushStatus) => void) {
  try {
    const s = await enablePush()
    setStatus(s)
    if (s === 'on') toast.success('Notificações ativadas neste aparelho')
    else if (s === 'denied') toast.error('Notificações bloqueadas', { description: 'Libere nos ajustes do celular para este app.' })
  } catch (e) {
    toast.error(failMessage(e))
  }
}

const STATUS_TEXT: Record<PushStatus, string> = {
  on: 'Ativadas neste aparelho',
  off: 'Escala, votação, setlist, ensaio e avisos',
  denied: 'Bloqueadas nos ajustes do celular',
  'ios-install': 'No iPhone, funcionam com o app instalado',
  unsupported: 'Este navegador não recebe notificações',
}

function IosSteps() {
  return (
    <ol className="space-y-2.5 border-t border-line px-5 py-4 text-[14px] text-ink-2">
      <li className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-ink">1</span>
        No Safari, toque em <Share className="inline size-4 text-primary" aria-label="Compartilhar" /> <b className="text-ink">Compartilhar</b>
      </li>
      <li className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-ink">2</span>
        <SquarePlus className="inline size-4 text-primary" aria-hidden /> <b className="text-ink">Adicionar à Tela de Início</b>
      </li>
      <li className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-ink">3</span>
        Abra o app pelo ícone e ative aqui
      </li>
    </ol>
  )
}

/** Perfil: ativar neste aparelho, testar e escolher o que receber. */
export function PushCard({ className }: { className?: string }) {
  const me = useMe()
  const [status, setStatus] = usePushStatus()
  const [busy, setBusy] = useState(false)
  if (!me || !status) return null
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const test = run(async () => {
    try {
      const sent = await sendTestPush(me.name)
      if (sent) toast.success('Notificação enviada', { description: 'Deve chegar em alguns segundos.' })
      else toast.error('Nenhum aparelho ativo', { description: 'Desative e ative de novo neste aparelho.' })
    } catch (e) {
      toast.error(failMessage(e))
    }
  })
  const setPref = (kind: NotifyKind, on: boolean) => void updateMyProfile({ notifyPrefs: { ...me.notifyPrefs, [kind]: on } })

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center gap-3.5 p-5">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', status === 'on' ? 'bg-primary text-primary-ink' : 'bg-lavender text-lavender-ink')}>
          <BellRing className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-bold text-ink">Notificações no celular</div>
          <div className="mt-0.5 text-[13px] text-muted">{STATUS_TEXT[status]}</div>
        </div>
        {status === 'off' && (
          <Button size="sm" loading={busy} onClick={run(() => activate(setStatus))}>
            Ativar
          </Button>
        )}
        {status === 'on' && (
          <Button size="sm" variant="soft" loading={busy} onClick={test}>
            Testar
          </Button>
        )}
      </div>

      {status === 'ios-install' && <IosSteps />}

      {status === 'on' && (
        <div className="border-t border-line px-5 pt-2 pb-3">
          <div className="divide-y divide-line">
            {NOTIFY_KINDS.map((k) => (
              <div key={k.id} className="py-2">
                <Switch
                  checked={wantsKind(me.notifyPrefs, k.id)}
                  onChange={(v) => setPref(k.id, v)}
                  label={
                    <span className="flex items-center gap-2.5">
                      <span style={tint(k.color)} className="grid size-7 place-items-center rounded-lg">
                        <k.icon className="size-4" />
                      </span>
                      {k.label}
                    </span>
                  }
                  description={<span className="block pl-[38px]">{k.hint}</span>}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={run(async () => setStatus(await disablePush()))}
            className="mt-1 py-2 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Desativar neste aparelho
          </button>
        </div>
      )}
    </Card>
  )
}

const PROMPT_KEY = 'adoracao:push-convite'

/** Início: convite discreto para ativar (some quando ativa ou quando a pessoa fecha). */
export function PushPrompt() {
  const [status, setStatus] = usePushStatus()
  const [closed, setClosed] = useState(() => readStorage('local', PROMPT_KEY) === 'fechado')
  const [busy, setBusy] = useState(false)
  if (closed || (status !== 'off' && status !== 'ios-install')) return null
  const close = () => {
    writeStorage('local', PROMPT_KEY, 'fechado')
    setClosed(true)
  }
  return (
    <Card className="relative flex items-center gap-3.5 overflow-hidden p-4 pr-12">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lavender text-lavender-ink">
        <BellRing className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-ink">Receba os avisos no celular</div>
        <div className="mt-0.5 text-[13px] text-muted">
          {status === 'ios-install' ? (
            <>
              Instale o app: <Share className="inline size-3.5 -translate-y-px" aria-label="Compartilhar" /> → Adicionar à Tela de Início
            </>
          ) : (
            'Escala, votação, setlist e ensaio'
          )}
        </div>
      </div>
      {status === 'off' && (
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            await activate(setStatus)
            setBusy(false)
          }}
        >
          Ativar
        </Button>
      )}
      <button type="button" aria-label="Fechar" onClick={close} className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
        <X className="size-4" />
      </button>
    </Card>
  )
}
