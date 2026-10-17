import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  AudioLines,
  Camera,
  CalendarCheck,
  ChevronRight,
  Copy,
  ImageOff,
  Tags,
  Crown,
  Database,
  Download,
  Heart,
  KeyRound,
  Lightbulb,
  LogOut,
  Mic2,
  Moon,
  Music,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Share2,
  Sun,
  SunMoon,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { HeaderAvatar, Page, PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Card, Chip, Field, Input, SectionTitle, Segmented, Switch, Textarea } from '@/components/ui/primitives'
import { confirm } from '@/components/ui/sheet'
import { signOut } from '@/lib/auth'
import { deleteSong, exportLibrary, importLibrary, saveSong, setMemberRole, updateMyProfile, updateTeam } from '@/lib/actions'
import { demoBackend, isDemo } from '@/lib/backend'
import { EXAMPLE_TAG, buildSeedSongs } from '@/data/songs'
import { useDocumentTitle, useTeam } from '@/lib/hooks'
import { getData, useIsAdmin, useMe, useRows, useSettings, type ThemePref } from '@/lib/store'
import { PASTELS, ROLES, ROLE_BY_ID } from '@/lib/taxonomy'
import { pickFile, squareImageDataUrl } from '@/lib/images'
import { cn, copyText, downloadFile, firstName, plural, todayString } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

export function ProfilePage() {
  useDocumentTitle('Perfil')
  const me = useMe()!
  const favorites = useRows('favorites')
  const suggestions = useRows('suggestions')
  const services = useRows('services')
  const [name, setName] = useState(me.name)
  const [bio, setBio] = useState(me.bio)
  const [functions, setFunctions] = useState(me.functions)
  const [color, setColor] = useState(me.color)
  const [photoBusy, setPhotoBusy] = useState(false)
  const choosePhoto = async () => {
    const file = await pickFile('image/*')
    if (!file) return
    setPhotoBusy(true)
    try {
      const avatarUrl = await squareImageDataUrl(file, 320)
      if (await updateMyProfile({ avatarUrl })) toast.success('Foto atualizada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível usar esta foto')
    } finally {
      setPhotoBusy(false)
    }
  }
  const dirty = name !== me.name || bio !== me.bio || color !== me.color || functions.join() !== me.functions.join()
  const stats = useMemo(
    () => [
      { label: 'Favoritas', value: favorites.filter((f) => f.userId === me.id).length, icon: Heart, color: 'rose' as const },
      { label: 'Sugestões', value: suggestions.filter((s) => s.userId === me.id).length, icon: Lightbulb, color: 'butter' as const },
      { label: 'Escalas', value: services.filter((s) => s.date <= todayString() && s.team.some((t) => t.userId === me.id)).length, icon: Mic2, color: 'sky' as const },
    ],
    [favorites, suggestions, services, me.id],
  )

  return (
    <Page className="max-w-2xl">
      <PageHeader title="Meu perfil" actions={<HeaderAvatar />} />
      <Card className="overflow-hidden">
        <div className="relative h-24" style={{ background: `linear-gradient(120deg, var(--${color}-solid), var(--${PASTELS[(PASTELS.indexOf(color) + 3) % PASTELS.length]}-solid))` }} />
        <div className="px-5 pb-5">
          {/* relative + z-10: o avatar fica por cima da faixa colorida (antes ficava escondido atrás dela) */}
          <div className="relative z-10 -mt-12 flex items-end justify-between gap-3">
            <div className="relative">
              <Avatar profile={{ name, color, avatarUrl: me.avatarUrl }} size="2xl" className="shadow-card ring-4 ring-surface" />
              <button
                type="button"
                aria-label={me.avatarUrl ? 'Trocar foto' : 'Colocar foto'}
                disabled={photoBusy}
                onClick={() => void choosePhoto()}
                className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-primary text-primary-ink shadow-float ring-4 ring-surface transition-transform active:scale-95 disabled:opacity-60"
              >
                <Camera className="size-[18px]" strokeWidth={2.2} />
              </button>
            </div>
            {me.role === 'admin' && (
              <span className="mb-1 flex items-center gap-1 rounded-full bg-butter px-2.5 py-1 text-[12px] font-bold text-butter-ink">
                <Crown className="size-3.5" /> Líder
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-bold">
            <button type="button" onClick={() => void choosePhoto()} disabled={photoBusy} className="text-primary">
              {me.avatarUrl ? 'Trocar foto' : 'Colocar foto de perfil'}
            </button>
            {me.avatarUrl && (
              <button type="button" onClick={async () => (await updateMyProfile({ avatarUrl: null })) && toast('Foto removida')} className="flex items-center gap-1 text-muted hover:text-ink">
                <ImageOff className="size-3.5" /> Remover foto
              </button>
            )}
          </div>
          <div className="mt-4 mb-1 text-[13px] font-semibold text-ink-2">Cor (aparece quando não há foto)</div>
          <div className="flex flex-wrap gap-2">
            {PASTELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn('size-8 rounded-full transition-transform', color === c ? 'scale-110 ring-[3px] ring-primary ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                style={{ background: `var(--${c}-solid)` }}
              />
            ))}
          </div>
          <div className="mt-5 space-y-4">
            <Field label="Nome">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <div>
              <div className="mb-2 text-[13px] font-semibold text-ink-2">Funções no ministério</div>
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
              <p className="mt-2 text-[12.5px] text-muted">Quem canta abre as músicas na letra; quem toca, na cifra (dá para mudar nos ajustes).</p>
            </div>
            <Field label="Sobre você" hint="opcional">
              {(id) => <Textarea id={id} rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ex.: violão e segunda voz" />}
            </Field>
            <Button
              icon={Save}
              disabled={!dirty || !name.trim()}
              onClick={async () => {
                if (await updateMyProfile({ name: name.trim(), bio: bio.trim(), functions, color })) toast.success('Perfil atualizado')
              }}
            >
              Salvar perfil
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 text-center">
            <s.icon className="mx-auto size-5" style={{ color: `var(--${s.color}-ink)` }} />
            <div className="mt-1.5 text-[22px] font-extrabold text-ink tabular-nums">{s.value}</div>
            <div className="text-[12px] font-semibold text-muted">{s.label}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-5 divide-y divide-line">
        {[
          { to: '/ajustes', icon: Settings, label: 'Ajustes do app' },
          { to: '/equipe', icon: Users, label: 'Equipe e convites' },
          { to: '/presenca', icon: CalendarCheck, label: 'Presença e ausências' },
          { to: '/ensaios', icon: AudioLines, label: 'Gravações de ensaio' },
          { to: '/temas', icon: Tags, label: 'Temas do acervo' },
          { to: '/favoritas', icon: Heart, label: 'Minhas favoritas' },
          { to: '/sugestoes', icon: Lightbulb, label: 'Sugestões' },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 px-5 py-4 text-[15px] font-semibold text-ink hover:bg-surface-2/60">
            <l.icon className="size-5 text-muted" />
            <span className="flex-1">{l.label}</span>
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ))}
        <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] font-semibold text-rose-ink hover:bg-rose/50">
          <LogOut className="size-5" />
          Sair da conta
        </button>
      </Card>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export function SettingsPage() {
  useDocumentTitle('Ajustes')
  const s = useSettings()
  const isAdmin = useIsAdmin()
  const fileRef = useRef<HTMLInputElement>(null)
  const songs = useRows('songs')
  const examples = songs.filter((x) => x.tags.includes(EXAMPLE_TAG))

  return (
    <Page className="max-w-2xl">
      <PageHeader title="Ajustes" subtitle="Preferências deste aparelho" actions={<HeaderAvatar />} />

      <SectionTitle title="Aparência" />
      <Card className="p-5">
        <div className="mb-2 text-[13px] font-semibold text-ink-2">Tema</div>
        <Segmented<ThemePref>
          value={s.theme}
          onChange={(v) => s.set('theme', v)}
          className="w-full"
          options={[
            { value: 'system', label: 'Automático', icon: SunMoon },
            { value: 'light', label: 'Claro', icon: Sun },
            { value: 'dark', label: 'Escuro', icon: Moon },
          ]}
        />
      </Card>

      <SectionTitle title="Cifras e letras" className="mt-8" />
      <Card className="space-y-5 p-5">
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Ao abrir uma música, mostrar</div>
          <Segmented
            value={s.defaultView}
            onChange={(v) => s.set('defaultView', v)}
            className="w-full"
            options={[
              { value: 'auto', label: 'Pela função' },
              { value: 'cifra', label: 'Cifra' },
              { value: 'letra', label: 'Letra' },
            ]}
          />
        </div>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Acidentes na transposição</div>
          <Segmented
            value={s.accidentals}
            onChange={(v) => s.set('accidentals', v)}
            className="w-full"
            options={[
              { value: 'auto', label: 'Pelo tom' },
              { value: 'sharp', label: 'Sustenidos ♯' },
              { value: 'flat', label: 'Bemóis ♭' },
            ]}
          />
          <p className="mt-2 text-[12.5px] text-muted">“Pelo tom” escreve Bb em Fá e A# em Mi, como nas partituras.</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-ink-2">
            Tamanho do texto
            <span className="font-bold text-ink tabular-nums">{Math.round(s.fontScale * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.75}
            max={1.8}
            step={0.05}
            value={s.fontScale}
            onChange={(e) => s.set('fontScale', Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3" style={{ fontSize: `${16.5 * s.fontScale}px` }}>
            <div className="font-bold text-chord" style={{ fontSize: '0.92em' }}>
              G &nbsp; &nbsp; &nbsp; &nbsp; D/F#
            </div>
            <div className="font-medium text-ink">Santo, santo é o Senhor</div>
          </div>
        </div>
        <Switch checked={s.showSectionLabels} onChange={(v) => s.set('showSectionLabels', v)} label="Mostrar nomes das partes" description="Intro, Verso, Refrão, Ponte…" />
        <Switch checked={s.keepAwake} onChange={(v) => s.set('keepAwake', v)} label="Manter a tela ligada" description="Enquanto uma música estiver aberta." />
      </Card>

      <SectionTitle title="Acervo" className="mt-8" subtitle="Backup e músicas de exemplo" />
      <Card className="divide-y divide-line">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/60"
          onClick={() => {
            downloadFile(`acervo-adoracao-${todayString()}.json`, exportLibrary())
            toast.success('Backup baixado')
          }}
        >
          <Download className="size-5 text-muted" />
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-ink">Exportar acervo</span>
            <span className="block text-[12.5px] text-muted">Arquivo com todas as músicas e playlists da equipe</span>
          </span>
        </button>
        <button type="button" className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/60" onClick={() => fileRef.current?.click()}>
          <Upload className="size-5 text-muted" />
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-ink">Importar acervo</span>
            <span className="block text-[12.5px] text-muted">De um backup (útil para levar as músicas do modo demonstração para o oficial)</span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const r = await importLibrary(await file.text())
              toast.success(`Importação concluída`, { description: `${r.added} novas · ${r.updated} atualizadas · ${r.skipped} já existiam` })
            } catch (err) {
              toast.error('Não foi possível importar', { description: err instanceof Error ? err.message : undefined })
            }
          }}
        />
        {isAdmin && examples.length > 0 && (
          <button
            type="button"
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-rose/40"
            onClick={async () => {
              if (!(await confirm({ title: `Remover ${plural(examples.length, 'música', 'músicas')} de exemplo?`, description: 'As canções de exemplo e os hinos do acervo inicial saem para toda a equipe.', confirmLabel: 'Remover', danger: true })))
                return
              for (const x of examples) await deleteSong(x.id)
              toast.success('Músicas de exemplo removidas')
            }}
          >
            <Trash2 className="size-5 text-rose-ink" />
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-rose-ink">Remover músicas de exemplo</span>
              <span className="block text-[12.5px] text-muted">{plural(examples.length, 'música marcada', 'músicas marcadas')} como exemplo</span>
            </span>
          </button>
        )}
        {isAdmin && examples.length === 0 && (
          <button
            type="button"
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/60"
            onClick={async () => {
              const existing = getData().songs
              const seed = buildSeedSongs().filter((x) => !existing[x.id])
              for (const x of seed) await saveSong({ ...x, createdBy: null })
              toast.success(`${plural(seed.length, 'música adicionada', 'músicas adicionadas')}`)
            }}
          >
            <Music className="size-5 text-muted" />
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-ink">Adicionar músicas de exemplo</span>
              <span className="block text-[12.5px] text-muted">Canções de demonstração e hinos em domínio público</span>
            </span>
          </button>
        )}
      </Card>

      <SectionTitle title="Sobre" className="mt-8" />
      <Card className="space-y-3 p-5 text-[14px]">
        <div className="flex items-center gap-3">
          <Database className="size-5 text-muted" />
          <div className="flex-1">
            <div className="font-semibold text-ink">{isDemo ? 'Modo demonstração' : 'Conectado ao servidor da equipe'}</div>
            <div className="text-[12.5px] text-muted">
              {isDemo ? 'Os dados ficam só neste navegador. Configure o Supabase para a equipe toda usar (veja o README).' : 'Tudo sincronizado em tempo real e disponível offline.'}
            </div>
          </div>
        </div>
        {isDemo && (
          <Button
            variant="outline"
            icon={RotateCcw}
            onClick={async () => {
              if (!(await confirm({ title: 'Restaurar a demonstração?', description: 'Tudo o que você mudou no modo demonstração será apagado.', confirmLabel: 'Restaurar', danger: true }))) return
              await demoBackend()?.resetDemo()
              await signOut()
              window.location.href = '/entrar'
            }}
          >
            Restaurar dados de demonstração
          </Button>
        )}
        <Button variant="ghost" icon={LogOut} onClick={() => void signOut()} className="text-rose-ink">
          Sair da conta
        </Button>
      </Card>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

function randomCode(): string {
  const words = ['LOUVOR', 'ADORAR', 'GRACA', 'HOSANA', 'ALELUIA', 'SHALOM', 'CANTAI']
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(1000 + Math.random() * 9000)}`
}

export function TeamPage() {
  useDocumentTitle('Equipe')
  const me = useMe()!
  const isAdmin = me.role === 'admin'
  const team = useTeam()
  const profiles = useRows('profiles')
  const [name, setName] = useState(team?.name ?? 'Ministério de Louvor')
  const [church, setChurch] = useState(team?.church ?? '')
  const sorted = profiles.slice().sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'pt-BR') : a.role === 'admin' ? -1 : 1))
  const inviteText = `Paz! Entre no app do ${team?.name ?? 'ministério'}: ${window.location.origin}\nCrie sua conta com o código de convite: ${team?.inviteCode ?? ''}`

  return (
    <Page className="max-w-2xl">
      <PageHeader title="Equipe" subtitle={plural(profiles.length, 'membro', 'membros')} actions={<HeaderAvatar />} />

      {isAdmin && (
        <>
          <Card className="overflow-hidden">
            <div className="flex items-start gap-3 bg-lavender p-5 text-lavender-ink">
              <KeyRound className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="text-[15px] font-bold">Convide a equipe</div>
                <p className="mt-0.5 text-[13px] opacity-85">
                  {isDemo
                    ? 'No modo demonstração não há convites. Com o Supabase configurado, cada membro cria a própria conta usando este código.'
                    : 'Envie o link e o código para cada membro criar a própria conta. Troque o código quando quiser fechar a porta.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 p-5 sm:flex sm:items-center sm:gap-3">
              <div className="col-span-2 min-w-0 sm:flex-1">
                <div className="text-[12px] font-bold tracking-wide text-muted uppercase">Código de convite</div>
                <div className="mt-0.5 font-mono text-[22px] font-extrabold tracking-wider text-ink">{team?.inviteCode || '—'}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={async () => {
                  if (await updateTeam({ inviteCode: randomCode() })) toast.success('Novo código gerado')
                }}
              >
                Gerar novo
              </Button>
              <Button
                size="sm"
                icon={typeof navigator.share === 'function' ? Share2 : Copy}
                disabled={!team?.inviteCode}
                onClick={async () => {
                  if (typeof navigator.share === 'function') {
                    try {
                      await navigator.share({ text: inviteText })
                      return
                    } catch {
                      /* cancelado */
                    }
                  }
                  if (await copyText(inviteText)) toast.success('Convite copiado — cole no grupo da equipe')
                }}
              >
                Enviar convite
              </Button>
            </div>
          </Card>

          <Card className="mt-5 space-y-4 p-5">
            <Field label="Nome do ministério">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Igreja">{(id) => <Input id={id} value={church} onChange={(e) => setChurch(e.target.value)} placeholder="Nome da igreja" />}</Field>
            <Button
              size="sm"
              icon={Save}
              disabled={name === (team?.name ?? '') && church === (team?.church ?? '')}
              onClick={async () => {
                if (await updateTeam({ name: name.trim() || 'Ministério de Louvor', church: church.trim() })) toast.success('Dados da equipe salvos')
              }}
            >
              Salvar
            </Button>
          </Card>
        </>
      )}

      <SectionTitle title="Membros" className="mt-8" />
      <Card className="divide-y divide-line">
        {sorted.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
            <Avatar profile={p} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-bold text-ink">
                  {p.name}
                  {p.id === me.id && <span className="font-medium text-muted"> (você)</span>}
                </span>
                {p.role === 'admin' && <Crown className="size-3.5 shrink-0 text-butter-ink" />}
              </div>
              <div className="truncate text-[12.5px] text-muted">{p.functions.map((f) => ROLE_BY_ID[f]?.name ?? f).join(' · ') || 'Sem função definida'}</div>
            </div>
            {isAdmin && p.id !== me.id && (
              <Menu
                items={[
                  p.role === 'admin'
                    ? { label: 'Tirar de líder', icon: Users, onSelect: () => void setMemberRole(p.id, 'member') }
                    : {
                        label: 'Tornar líder',
                        icon: Crown,
                        description: 'Pode gerenciar convites e a equipe',
                        onSelect: async () => {
                          if (await setMemberRole(p.id, 'admin')) toast.success(`${firstName(p.name)} agora é líder`)
                        },
                      },
                ]}
              />
            )}
          </div>
        ))}
      </Card>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        Para remover alguém da equipe, o líder exclui o usuário no painel do Supabase (Authentication → Users). O perfil, as favoritas e as mensagens saem junto; as músicas cadastradas continuam no acervo.
      </p>
    </Page>
  )
}
