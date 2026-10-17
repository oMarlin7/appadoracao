import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './button'
import { useClickOutside } from './primitives'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  hidden?: boolean
  description?: string
}

/** Menu de "mais opções" ancorado no botão. */
export function Menu({
  items,
  trigger,
  align = 'right',
  label = 'Mais opções',
  className,
}: {
  items: MenuItem[]
  trigger?: (open: () => void) => ReactNode
  align?: 'left' | 'right'
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close, open)
  const visible = items.filter((i) => !i.hidden)

  return (
    <div ref={ref} className={cn('relative', className)} onKeyDown={(e) => e.key === 'Escape' && close()}>
      {trigger ? trigger(() => setOpen((v) => !v)) : <IconButton icon={MoreHorizontal} label={label} onClick={() => setOpen((v) => !v)} aria-expanded={open} />}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute top-full z-40 mt-2 min-w-56 origin-top overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {visible.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    close()
                    item.onSelect()
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-colors',
                    item.danger ? 'text-rose-ink hover:bg-rose' : 'text-ink hover:bg-surface-2',
                  )}
                >
                  {Icon && <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={2.1} />}
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    {item.description && <span className="block text-[12px] font-medium text-muted">{item.description}</span>}
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
