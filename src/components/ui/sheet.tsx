import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { X } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '@/lib/utils'
import { Button } from './button'

/**
 * Sheet: no celular sobe de baixo (dá para arrastar para fechar);
 * em telas maiores vira um diálogo centralizado.
 */

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

let openSheets = 0

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Ocupa a altura toda no celular (listas longas). */
  tall?: boolean
  className?: string
  hideClose?: boolean
}

export function Sheet({ open, onClose, title, description, children, footer, size = 'md', tall, className, hideClose }: SheetProps) {
  const desktop = useIsDesktop()
  const drag = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement
    openSheets++
    document.documentElement.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button:not([data-close])')
      el?.focus({ preventScroll: true })
    }, 60)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      openSheets--
      if (openSheets === 0) document.documentElement.style.overflow = ''
      restoreFocus.current?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  const width = size === 'sm' ? 'md:max-w-md' : size === 'lg' ? 'md:max-w-3xl' : 'md:max-w-xl'

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="presentation">
          <motion.div
            className="absolute inset-0 bg-[#0d0c22]/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={cn(
              'relative flex w-full flex-col overflow-hidden border border-line bg-surface shadow-pop',
              'max-h-[92dvh] rounded-t-[28px] md:max-h-[86vh] md:rounded-[28px]',
              tall && 'h-[92dvh] md:h-auto',
              width,
              className,
            )}
            initial={desktop ? { opacity: 0, scale: 0.96, y: 8 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97, y: 6 } : { y: '100%' }}
            transition={desktop ? { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } : { type: 'spring', damping: 32, stiffness: 340 }}
            drag={desktop ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose()
            }}
          >
            <div className="shrink-0 touch-none pt-2.5 md:hidden" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto h-1.5 w-11 rounded-full bg-surface-3" />
            </div>
            {(title || !hideClose) && (
              <div className="flex shrink-0 items-start gap-3 px-5 pt-3 pb-3 md:px-6 md:pt-5" onPointerDown={(e) => !desktop && drag.start(e)}>
                <div className="min-w-0 flex-1">
                  {title && <h2 className="text-[19px] leading-tight font-bold tracking-tight text-ink">{title}</h2>}
                  {description && <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{description}</p>}
                </div>
                {!hideClose && (
                  <button
                    type="button"
                    data-close
                    aria-label="Fechar"
                    onClick={onClose}
                    className="-mt-0.5 -mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:text-ink"
                  >
                    <X className="size-[18px]" strokeWidth={2.3} />
                  </button>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 md:px-6 md:pb-6">{children}</div>
            {footer && <div className="shrink-0 border-t border-line bg-surface px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6 md:pb-5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Confirmação global: `await confirm({ title: 'Excluir?' })`
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState {
  options: ConfirmOptions | null
  resolve: ((v: boolean) => void) | null
}

const useConfirmStore = create<ConfirmState>(() => ({ options: null, resolve: null }))

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ options, resolve }))
}

export function ConfirmHost() {
  const { options, resolve } = useConfirmStore()
  const close = (v: boolean) => {
    resolve?.(v)
    useConfirmStore.setState({ options: null, resolve: null })
  }
  return (
    <Sheet open={!!options} onClose={() => close(false)} title={options?.title} description={options?.description} size="sm" hideClose>
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => close(false)}>
          {options?.cancelLabel ?? 'Cancelar'}
        </Button>
        <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
          {options?.confirmLabel ?? 'Confirmar'}
        </Button>
      </div>
    </Sheet>
  )
}
