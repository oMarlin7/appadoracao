import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ArrowRight, CalendarDays, Heart, KeyRound, Mail, MessageCircle, Music2, Sparkles, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { LogoMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Chip, Field, Input, Segmented } from '@/components/ui/primitives'
import { errorMessage } from '@/lib/actions'
import { backend, demoBackend, isDemo, type InviteCheck } from '@/lib/backend'
import { DEMO_MEMBERS } from '@/data/seed'
import { ROLES, ROLE_BY_ID } from '@/lib/taxonomy'
import { useSession } from '@/lib/store'
import { cn, firstName } from '@/lib/utils'

function ArtPanel() {
  return (
    <div className="relative hidden overflow-hidden rounded-[36px] lg:block">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 15%, var(--lavender-solid), transparent 50%), radial-gradient(circle at 85% 30%, var(--rose-solid), transparent 45%), radial-gradient(circle at 30% 85%, var(--sky-solid), transparent 50%), radial-gradient(circle at 85% 90%, var(--mint-solid), transparent 45%), var(--surface-2)',
        }}
      />
      <div className="relative flex h-full flex-col justify-between p-10">
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <span className="text-[19px] font-extrabold tracking-tight text-[#2a2550]">Adoração</span>
        </div>
        <div className="relative mx-auto h-[360px] w-full max-w-[420px]">
          <div className="absolute top-0 left-0 w-[250px] rotate-[-4deg] rounded-3xl bg-white/90 p-4 shadow-pop">
            <div className="mb-2 inline-flex rounded-full bg-[#ffe4ee] px-2.5 py-0.5 text-[11px] font-bold text-[#ad345f]">Refrão</div>
            <div className="font-bold text-[#6252ee]">G &nbsp; &nbsp; &nbsp; &nbsp; D/F#</div>
            <div className="font-semibold text-[#1c1b2e]">Santo, santo é o Senhor</div>
            <div className="mt-1 font-bold text-[#6252ee]">Em &nbsp; &nbsp; &nbsp; C</div>
            <div className="font-semibold text-[#1c1b2e]">Digno de louvor</div>
          </div>
          <div className="absolute top-24 right-0 w-[230px] rotate-[3deg] rounded-3xl bg-white/90 p-4 shadow-pop">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[#1c1b2e]">
              <CalendarDays className="size-4 text-[#6252ee]" /> Domingo · 19h
            </div>
            {['Abertura', 'Louvor', 'Adoração'].map((m, i) => (
              <div key={m} className="mb-2 flex items-center gap-2.5">
                <span className="size-8 rounded-xl" style={{ background: ['#f7dc8f', '#ffc3a3', '#c8bdfc'][i] }} />
                <span className="text-[13px] font-semibold text-[#4b4a62]">{m}</span>
              </div>
            ))}
          </div>
          <div className="absolute bottom-2 left-10 flex w-[240px] rotate-[-2deg] items-start gap-2.5 rounded-3xl bg-white/90 p-3.5 shadow-pop">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f9b4cb] text-[11px] font-bold text-[#ad345f]">JM</span>
            <div className="text-[13px] leading-snug font-medium text-[#1c1b2e]">Sugeri uma pra ministração, acho que conversa com a mensagem 💜</div>
          </div>
        </div>
        <div>
          <h2 className="text-[30px] leading-tight font-extrabold tracking-tight text-[#1f1b47]">A música certa, na hora certa.</h2>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed font-medium text-[#3d3966]">
            Repertório organizado por tema e momento do culto, cifras no tom da equipe, letras para os cantores e a equipe toda conectada.
          </p>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: Music2, text: 'Cifras no tom da equipe' },
  { icon: Sparkles, text: 'Escolha rápida por momento' },
  { icon: Heart, text: 'Favoritas e playlists' },
  { icon: MessageCircle, text: 'Chat do ministério' },
]

export function AuthPage() {
  const status = useSession((s) => s.status)
  if (status === 'signedIn') return <Navigate to="/" replace />
  return (
    <div className="min-h-dvh bg-bg p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100dvh-24px)] max-w-6xl grid-cols-1 gap-5 sm:min-h-[calc(100dvh-40px)] lg:grid-cols-[1.05fr_1fr]">
        <ArtPanel />
        <div className="flex flex-col justify-center px-2 py-6 sm:px-8">
          <div className="mb-8 lg:hidden">
            <div className="relative mb-6">
              <div className="absolute -top-10 -left-10 size-48 rounded-full opacity-70 blur-3xl" style={{ background: 'var(--lavender-solid)' }} />
              <div className="absolute -top-6 right-0 size-40 rounded-full opacity-50 blur-3xl" style={{ background: 'var(--rose-solid)' }} />
              <div className="relative flex items-center gap-3">
                <LogoMark size={48} />
                <div>
                  <div className="text-[22px] font-extrabold tracking-tight text-ink">Adoração</div>
                  <div className="text-[13px] font-semibold text-muted">Ministério de louvor</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map((f) => (
                <span key={f.text} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2">
                  <f.icon className="size-3.5 text-primary" strokeWidth={2.3} />
                  {f.text}
                </span>
              ))}
            </div>
          </div>
          <div className="mx-auto w-full max-w-md">{isDemo ? <DemoLogin /> : <RealLogin />}</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modo demonstração
// ---------------------------------------------------------------------------

function DemoLogin() {
  const [signup, setSignup] = useState(false)
  if (signup) return <SignupForm onBack={() => setSignup(false)} firstUser={false} />
  return (
    <div className="animate-rise">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink">Quem está entrando?</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
        Este é o <b className="text-ink-2">modo demonstração</b>: uma equipe de exemplo com músicas, cultos e conversas. Os dados ficam só neste aparelho.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-2">
        {DEMO_MEMBERS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void demoBackend()?.demoSignIn(m.id)}
            className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98]"
          >
            <Avatar profile={m} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-bold text-ink">{firstName(m.name)}</span>
              <span className="block truncate text-[12px] text-muted">{m.functions.map((f) => ROLE_BY_ID[f]?.name).join(' · ')}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-[12.5px] text-muted">Dica: abra outra aba como outro membro para testar o chat em tempo real.</p>
      <div className="mt-6 flex items-center gap-3 text-[12px] font-semibold text-muted">
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="outline" icon={UserPlus} className="mt-4 w-full" onClick={() => setSignup(true)}>
        Criar meu perfil de teste
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contas reais (Supabase)
// ---------------------------------------------------------------------------

function RealLogin() {
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [invite, setInvite] = useState<InviteCheck>('unknown')
  useEffect(() => {
    backend.checkInvite('').then(setInvite).catch(() => {})
  }, [])
  const firstUser = invite === 'first'

  return (
    <div className="animate-rise">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink">{mode === 'entrar' ? 'Que bom te ver!' : firstUser ? 'Vamos começar' : 'Entre para a equipe'}</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
        {mode === 'entrar'
          ? 'Entre com seu e-mail e senha para acessar o repertório.'
          : firstUser
            ? 'Você é a primeira pessoa aqui: sua conta será a do líder, que convida o restante da equipe.'
            : 'Use o código de convite que o líder do ministério enviou.'}
      </p>
      <Segmented
        className="mt-6 w-full"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'entrar', label: 'Entrar' },
          { value: 'criar', label: 'Criar conta' },
        ]}
      />
      <div className="mt-6">{mode === 'entrar' ? <LoginForm /> : <SignupForm firstUser={firstUser} />}</div>
    </div>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgot, setForgot] = useState(false)

  if (forgot) return <ForgotForm onBack={() => setForgot(false)} initialEmail={email} />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await backend.signIn(email, password)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="E-mail">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />}</Field>
      <Field
        label="Senha"
        hint={
          <button type="button" className="font-semibold text-primary" onClick={() => setForgot(true)}>
            Esqueci a senha
          </button>
        }
      >
        {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading} iconRight={ArrowRight}>
        Entrar
      </Button>
    </form>
  )
}

function ForgotForm({ onBack, initialEmail }: { onBack: () => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  if (sent)
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 text-center">
        <Mail className="mx-auto size-10 text-primary" strokeWidth={1.8} />
        <h3 className="mt-3 text-[17px] font-bold">Confira seu e-mail</h3>
        <p className="mt-1 text-[14px] text-muted">Enviamos um link para você criar uma nova senha.</p>
        <Button variant="ghost" className="mt-4" onClick={onBack}>
          Voltar para o login
        </Button>
      </div>
    )
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
          await backend.resetPassword(email)
          setSent(true)
        } catch (err) {
          toast.error(errorMessage(err))
        } finally {
          setLoading(false)
        }
      }}
    >
      <Field label="E-mail da sua conta">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" className="flex-1" loading={loading}>
          Enviar link
        </Button>
      </div>
    </form>
  )
}

function SignupForm({ firstUser, onBack }: { firstUser: boolean; onBack?: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [functions, setFunctions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (!isDemo && !firstUser) {
        const check = await backend.checkInvite(code)
        if (check === 'invalid') {
          toast.error('Código de convite inválido', { description: 'Peça o código atualizado ao líder do ministério.' })
          return
        }
      }
      const { needsConfirmation } = await backend.signUp({ name, email, password, inviteCode: code, functions })
      if (needsConfirmation) setConfirmSent(true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (confirmSent)
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 text-center">
        <Mail className="mx-auto size-10 text-primary" strokeWidth={1.8} />
        <h3 className="mt-3 text-[17px] font-bold">Confirme seu e-mail</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">Enviamos um link de confirmação para {email}. Depois de confirmar, é só entrar.</p>
      </div>
    )

  return (
    <form onSubmit={submit} className="animate-rise space-y-4">
      {onBack && (
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Criar perfil</h1>
          <p className="mt-1 text-[14px] text-muted">Seu perfil de teste fica salvo neste aparelho.</p>
        </div>
      )}
      <Field label="Seu nome">{(id) => <Input id={id} required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como a equipe te chama" />}</Field>
      <Field label="E-mail">{(id) => <Input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />}</Field>
      <Field label="Senha" hint="mínimo 6 caracteres">
        {(id) => <Input id={id} type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      {!isDemo && !firstUser && (
        <Field label="Código de convite">
          {(id) => (
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted" />
              <Input id={id} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: LOUVOR2026" className="pl-11 uppercase" />
            </div>
          )}
        </Field>
      )}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-ink-2">O que você faz no ministério?</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <Chip
              key={r.id}
              size="sm"
              icon={r.icon}
              color={r.color}
              selected={functions.includes(r.id)}
              onClick={() => setFunctions((f) => (f.includes(r.id) ? f.filter((x) => x !== r.id) : [...f, r.id]))}
            >
              {r.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className={cn('flex gap-2 pt-1', !onBack && 'block')}>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            Voltar
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1 sm:w-full" loading={loading} iconRight={ArrowRight}>
          Criar conta
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Nova senha (link do e-mail de recuperação)
// ---------------------------------------------------------------------------

export function NewPasswordPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-3xl border border-line bg-surface p-6 shadow-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setLoading(true)
          try {
            await backend.updatePassword(password)
            toast.success('Senha atualizada!')
            navigate('/')
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setLoading(false)
          }
        }}
      >
        <LogoMark size={44} />
        <h1 className="text-[22px] font-extrabold tracking-tight">Crie uma nova senha</h1>
        <Field label="Nova senha" hint="mínimo 6 caracteres">
          {(id) => <Input id={id} type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Salvar senha
        </Button>
      </form>
    </div>
  )
}
