import { Fragment, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkles, X } from 'lucide-react'
import { create } from 'zustand'
import { RELEASES, greetingFor, unseenReleases, type Release } from '@/data/changelog'
import { readStorage, writeStorage } from '@/lib/storage'
import { useMe } from '@/lib/store'
import { ink, soft } from '@/lib/taxonomy'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

/**
 * Notas da atualização: na primeira vez que a pessoa abre uma versão nova do app (depois de
 * tocar em "Atualizar"), a tela inteira mostra o que chegou ou foi corrigido. Cada aparelho
 * lembra a última versão que já mostrou.
 */

const SEEN_KEY = 'adoracao:novidades-vistas'

const useWhatsNew = create<{ releases: Release[] | null }>(() => ({ releases: null }))

/** Abre as novidades da versão atual (ex.: pelo perfil). */
export function showWhatsNew() {
  if (RELEASES.length) useWhatsNew.setState({ releases: RELEASES.slice(0, 1) })
}

function closeWhatsNew() {
  if (RELEASES[0]) writeStorage('local', SEEN_KEY, RELEASES[0].id)
  useWhatsNew.setState({ releases: null })
}

const releaseDate = (id: string) =>
  new Date(`${id}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })

/** "toque em **Medley**" → o nome do botão em negrito. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 ? (
          <b key={i} className="font-extrabold text-ink">
            {part}
          </b>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

/** Fica no layout do app (fora do modo palco): mostra as novidades da versão nova uma vez. */
export function WhatsNewHost() {
  const me = useMe()
  const releases = useWhatsNew((s) => s.releases)

  useEffect(() => {
    const latest = RELEASES[0]
    if (!me || !latest) return
    const seen = readStorage('local', SEEN_KEY)
    // Conta criada depois desta versão: para ela, tudo já é como está.
    if (!seen && me.createdAt.slice(0, 10) >= latest.id) {
      writeStorage('local', SEEN_KEY, latest.id)
      return
    }
    const unseen = unseenReleases(seen)
    if (unseen.length) useWhatsNew.setState({ releases: unseen })
  }, [me?.id])

  return createPortal(<AnimatePresence>{releases && me && <WhatsNewScreen releases={releases} name={me.name} seed={`${releases[0].id}:${me.id}`} />}</AnimatePresence>, document.body)
}

function WhatsNewScreen({ releases, name, seed }: { releases: Release[]; name: string; seed: string }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const items = releases.flatMap((r) => r.items).slice(0, 8)

  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeWhatsNew()
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 80)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = prev
    }
  }, [])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="novidades-titulo"
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Fundo colorido que preenche a tela toda. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-20 size-[340px] rounded-full opacity-70 blur-3xl" style={{ background: 'var(--lavender-solid)' }} />
        <div className="absolute top-1/3 -right-24 size-[300px] rounded-full opacity-60 blur-3xl" style={{ background: 'var(--mint-solid)' }} />
        <div className="absolute -bottom-24 left-1/4 size-[320px] rounded-full opacity-60 blur-3xl" style={{ background: 'var(--peach-solid)' }} />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
        <motion.div
          className="relative rounded-[32px] border border-line bg-surface/95 p-5 shadow-pop backdrop-blur-xl sm:p-7"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        >
          <button
            ref={closeRef}
            type="button"
            aria-label="Fechar as novidades"
            onClick={closeWhatsNew}
            className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:text-ink"
          >
            <X className="size-5" strokeWidth={2.4} />
          </button>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12px] font-extrabold tracking-wide text-primary uppercase">
            <Sparkles className="size-3.5" /> Novidades · {releaseDate(releases[0].id)}
          </div>
          <h1 id="novidades-titulo" className="mt-4 pr-10 text-[27px] leading-[1.12] font-extrabold tracking-tight text-ink sm:text-[31px]">
            {greetingFor(name, seed)}
          </h1>
          <p className="mt-2 text-[15px] text-muted">Saiu atualização fresquinha. Bora ver o que mudou:</p>

          <ul className="mt-6 space-y-2.5">
            {items.map((item, i) => (
              <motion.li
                key={`${item.title}-${i}`}
                className="flex gap-3.5 rounded-3xl bg-surface-2/70 p-3.5 sm:p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.07, duration: 0.3 }}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-[24px] leading-none" style={{ background: soft(item.color) }} aria-hidden>
                  {item.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[16px] leading-tight font-extrabold text-ink">{item.title}</span>
                    <span
                      className={cn('rounded-full px-2 py-px text-[10.5px] font-extrabold tracking-wide uppercase')}
                      style={{ background: soft(item.kind === 'novo' ? 'mint' : 'sky'), color: ink(item.kind === 'novo' ? 'mint' : 'sky') }}
                    >
                      {item.kind === 'novo' ? 'Novidade' : 'Corrigido'}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                    <Rich text={item.text} />
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>

          <Button size="lg" className="mt-6 w-full" onClick={closeWhatsNew}>
            Bora usar! 🙌
          </Button>
        </motion.div>
      </div>
    </motion.div>
  )
}
