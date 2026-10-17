import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' | 'plain'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink shadow-[0_6px_16px_-6px_var(--primary)] hover:bg-primary-strong',
  soft: 'bg-primary-soft text-primary hover:brightness-[0.97] dark:hover:brightness-125',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
  danger: 'bg-rose text-rose-ink hover:brightness-[0.97] dark:hover:brightness-125',
  plain: '',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 rounded-full px-3.5 text-[13px]',
  md: 'h-11 rounded-full px-5 text-sm',
  lg: 'h-13 rounded-full px-6 text-[15px]',
}

const iconSizes: Record<Size, string> = {
  sm: 'size-9 rounded-full',
  md: 'size-11 rounded-full',
  lg: 'size-13 rounded-full',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-4' : 'size-[18px]'} strokeWidth={2.2} /> : null}
      {children}
      {IconRight && <IconRight className="size-4" strokeWidth={2.2} />}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  variant?: Variant
  size?: Size
  active?: boolean
  iconClassName?: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', active, className, iconClassName, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], active && 'bg-primary-soft text-primary', className)}
      {...rest}
    >
      <Icon className={cn(size === 'sm' ? 'size-[18px]' : 'size-5', iconClassName)} strokeWidth={2.1} />
    </button>
  )
})

interface LinkButtonProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  children?: ReactNode
}

export function LinkButton({ variant = 'primary', size = 'md', icon: Icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {Icon && <Icon className={size === 'sm' ? 'size-4' : 'size-[18px]'} strokeWidth={2.2} />}
      {children}
    </Link>
  )
}
