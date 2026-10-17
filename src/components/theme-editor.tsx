import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { saveCustomTheme } from '@/lib/actions'
import { useThemes } from '@/lib/hooks'
import { PASTELS, THEME_ICONS, normalizeForMatch, type Pastel } from '@/lib/taxonomy'
import { cn } from '@/lib/utils'
import type { CustomTheme, Id } from '@/types'

/** Criar/editar um tema da equipe. Chama `onSaved` com o id (para já marcar na música). */
export function ThemeEditorSheet({
  open,
  onClose,
  theme,
  initialName = '',
  onSaved,
}: {
  open: boolean
  onClose: () => void
  theme?: CustomTheme | null
  initialName?: string
  onSaved?: (id: Id) => void
}) {
  const themes = useThemes()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<Pastel>('lavender')
  const [icon, setIcon] = useState('sparkles')
  const [keywords, setKeywords] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(theme?.name ?? initialName)
    setDescription(theme?.description ?? '')
    setColor(theme?.color ?? PASTELS[Math.floor(Math.random() * PASTELS.length)])
    setIcon(theme?.icon ?? 'sparkles')
    setKeywords((theme?.keywords ?? []).join(', '))
  }, [open, theme, initialName])

  const norm = normalizeForMatch(name).trim()
  const duplicate = !!norm && themes.some((t) => t.id !== theme?.id && (normalizeForMatch(t.name).trim() === norm || normalizeForMatch(t.short ?? '').trim() === norm))
  const PreviewIcon = THEME_ICONS[icon]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={theme ? 'Editar tema' : 'Novo tema'}
      description="Temas mais específicos ajudam a achar a música certa: “Família”, “Juventude”, “Ceia de Natal”…"
      footer={
        <Button
          className="w-full"
          loading={saving}
          disabled={!name.trim() || duplicate}
          onClick={async () => {
            setSaving(true)
            const id = await saveCustomTheme({
              id: theme?.id,
              name,
              description,
              color,
              icon,
              keywords: keywords.split(/[,;\n]/),
            })
            setSaving(false)
            if (id) {
              toast.success(theme ? 'Tema atualizado' : `Tema “${name.trim()}” criado`)
              onSaved?.(id)
              onClose()
            }
          }}
        >
          {theme ? 'Salvar tema' : 'Criar tema'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-3xl p-4" style={{ background: `var(--${color}-bg)`, color: `var(--${color}-ink)` }}>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/60 dark:bg-white/10">{PreviewIcon && <PreviewIcon className="size-6" />}</span>
          <div className="min-w-0">
            <div className="truncate text-[16px] font-extrabold">{name.trim() || 'Nome do tema'}</div>
            <div className="truncate text-[12.5px] opacity-80">{description.trim() || 'Criado pela equipe'}</div>
          </div>
        </div>
        <Field label="Nome">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Família" autoFocus={!theme} maxLength={40} />}
        </Field>
        {duplicate && <p className="-mt-3 text-[12.5px] font-semibold text-rose-ink">Já existe um tema com esse nome.</p>}
        <Field label="Descrição" hint="opcional">
          {(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando usar este tema" />}
        </Field>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Cor</div>
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
        </div>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-ink-2">Ícone</div>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
            {Object.entries(THEME_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn('grid aspect-square place-items-center rounded-2xl border transition-colors', icon === key ? 'border-transparent bg-primary text-primary-ink' : 'border-line text-ink-2 hover:bg-surface-2')}
              >
                <Icon className="size-5" />
              </button>
            ))}
          </div>
        </div>
        <Field label="Palavras da letra" hint="separe por vírgula">
          {(id) => <Input id={id} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Ex.: família, lar, casa, filhos, gerações" />}
        </Field>
        <p className="-mt-3 text-[12.5px] text-muted">Quando uma letra tiver essas palavras, o app sugere este tema ao cadastrar a música.</p>
      </div>
    </Sheet>
  )
}
