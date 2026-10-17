import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tint, type Pastel } from '@/lib/taxonomy'

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-3xl border border-line bg-surface shadow-card', className)} {...rest} />
}

export function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chip (filtro / etiqueta)
// ---------------------------------------------------------------------------

interface ChipProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'color'> {
  selected?: boolean
  color?: Pastel
  icon?: LucideIcon
  size?: 'sm' | 'md'
  count?: number
  disabled?: boolean
}

export function Chip({ selected, color, icon: Icon, size = 'md', count, className, children, ...rest }: ChipProps) {
  const style = selected && color ? tint(color) : undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition-all duration-150 active:scale-[0.96]',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9.5 px-3.5 text-[13px]',
        selected
          ? color
            ? 'border-transparent'
            : 'border-transparent bg-ink text-bg'
          : 'border-line bg-surface text-ink-2 hover:border-surface-3 hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="size-3.5" strokeWidth={2.3} />}
      {children}
      {count !== undefined && count > 0 && (
        <span className={cn('ml-0.5 rounded-full px-1.5 text-[11px] leading-5', selected ? 'bg-black/10 dark:bg-white/15' : 'bg-surface-2')}>{count}</span>
      )}
      {selected && !color && count === undefined && <Check className="-mr-0.5 size-3.5" strokeWidth={2.6} />}
    </button>
  )
}

/** Etiqueta pastel não clicável. */
export function Tag({ color = 'lavender', icon: Icon, children, className }: { color?: Pastel; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span style={tint(color)} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', className)}>
      {Icon && <Icon className="size-3" strokeWidth={2.4} />}
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-ink-2">
      <span>{children}</span>
      {hint && <span className="text-[12px] font-medium text-muted">{hint}</span>}
    </label>
  )
}

const fieldBase =
  'w-full rounded-2xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-muted/80 outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-[var(--ring)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, 'h-12', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-3 leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, 'h-12 appearance-none pr-10 font-semibold', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-[18px] -translate-y-1/2 text-muted" strokeWidth={2.3} />
    </div>
  )
})

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children(id)}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar',
  className,
  autoFocus,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onEnter?: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted" strokeWidth={2.2} />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        className={cn(fieldBase, 'h-12 pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"
        >
          <X className="size-4" strokeWidth={2.4} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode; icon?: LucideIcon }>
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className={cn('no-scrollbar inline-flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1 dark:bg-black/25 dark:ring-1 dark:ring-white/5', className)}>
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-all duration-200',
              size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9.5 px-3.5 text-[13.5px]',
              active
                ? 'bg-surface text-ink shadow-card dark:bg-primary-soft dark:text-primary-strong dark:shadow-none dark:ring-1 dark:ring-primary/35'
                : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="size-4" strokeWidth={2.2} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-primary' : 'bg-surface-3 dark:bg-white/15')}
      >
        <span
          className={cn(
            'absolute top-1 left-1 size-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  color = 'lavender',
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  color?: Pastel
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 scale-150 rounded-full opacity-60 blur-2xl" style={{ background: `var(--${color}-bg)` }} />
        <div className="relative grid size-18 place-items-center rounded-[28px]" style={tint(color)}>
          <Icon className="size-8" strokeWidth={1.9} />
        </div>
      </div>
      <h3 className="text-[17px] font-bold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-surface-2', className)} />
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px bg-line', className)} />
}

/** Fecha ao clicar fora (para menus e popovers simples). */
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [ref, onOutside, active])
}
