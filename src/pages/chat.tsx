import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, CalendarDays, Copy, MessageCircle, Music, Paperclip, SendHorizontal, SmilePlus, Trash2 } from 'lucide-react'
import { SongPickerSheet } from '@/components/action-sheets'
import { Avatar, AvatarStack } from '@/components/avatar'
import { KeyBadge, SongCover, songSubtitle } from '@/components/song-bits'
import { IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { deleteMessage, sendMessage, toggleReaction } from '@/lib/actions'
import { useDocumentTitle, useServices } from '@/lib/hooks'
import { useMe, useRows, useSettings, useTable } from '@/lib/store'
import { chatDayLabel, cn, copyText, firstName, friendlyDate, sameDay, timeOf } from '@/lib/utils'
import type { Message } from '@/types'

const EMOJIS = ['👍', '❤️', '🙏', '🔥', '🙌', '😂']

function Attachment({ message, mine }: { message: Message; mine: boolean }) {
  const songs = useTable('songs')
  const services = useTable('services')
  if (message.songId) {
    const song = songs[message.songId]
    if (!song) return <div className="text-[13px] text-muted italic">Música removida</div>
    return (
      <Link
        to={`/musica/${song.id}`}
        className={cn('mt-1 flex w-64 max-w-full items-center gap-3 rounded-2xl p-2 pr-3 transition-colors', mine ? 'bg-surface/70 hover:bg-surface' : 'bg-surface-2 hover:bg-surface-3')}
      >
        <SongCover song={song} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-ink">{song.title}</span>
          <span className="block truncate text-[12px] text-muted">{songSubtitle(song, { themes: false })}</span>
        </span>
        <KeyBadge value={song.teamKey ?? song.originalKey} />
      </Link>
    )
  }
  if (message.serviceId) {
    const service = services[message.serviceId]
    if (!service) return <div className="text-[13px] text-muted italic">Culto removido</div>
    return (
      <Link
        to={`/cultos/${service.id}`}
        className={cn('mt-1 flex w-64 max-w-full items-center gap-3 rounded-2xl p-2.5 pr-3 transition-colors', mine ? 'bg-surface/70 hover:bg-surface' : 'bg-surface-2 hover:bg-surface-3')}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-butter text-butter-ink">
          <CalendarDays className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold text-ink">{service.title}</span>
          <span className="block truncate text-[12px] text-muted">
            {friendlyDate(service.date, { short: true })} · {service.items.length} músicas
          </span>
        </span>
      </Link>
    )
  }
  return null
}

export function ChatPage() {
  useDocumentTitle('Chat')
  const navigate = useNavigate()
  const me = useMe()
  const messages = useRows('messages')
  const profiles = useTable('profiles')
  const profileList = useRows('profiles')
  const reactions = useRows('reactions')
  const setSetting = useSettings((s) => s.set)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Message | null>(null)
  const [attach, setAttach] = useState<null | 'menu' | 'song' | 'service'>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const nearBottom = useRef(true)
  const { upcoming } = useServices()

  const sorted = useMemo(() => messages.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [messages])
  const reactionsByMsg = useMemo(() => {
    const m = new Map<string, Map<string, string[]>>()
    for (const r of reactions) {
      if (r.targetType !== 'message') continue
      const byEmoji = m.get(r.targetId) ?? new Map<string, string[]>()
      byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.userId])
      m.set(r.targetId, byEmoji)
    }
    return m
  }, [reactions])

  const last = sorted[sorted.length - 1]
  useEffect(() => {
    if (last) setSetting('lastChatRead', last.createdAt)
  }, [last, setSetting])

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (nearBottom.current || last?.userId === me?.id) el.scrollTo({ top: el.scrollHeight, behavior: sorted.length > 1 && nearBottom.current ? 'smooth' : 'auto' })
  }, [sorted.length, last?.userId, me?.id])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText('')
    nearBottom.current = true
    await sendMessage(body)
    input.current?.focus()
  }

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  return (
    <div className="fixed inset-0 flex flex-col bg-bg lg:left-[264px]">
      <header className="pt-safe glass shrink-0 border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-2 sm:px-4">
          <IconButton icon={ArrowLeft} label="Voltar" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} className="lg:hidden" />
          <span className="grid size-10 place-items-center rounded-2xl bg-sky text-sky-ink">
            <MessageCircle className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-extrabold text-ink">Chat da equipe</h1>
            <p className="text-[12.5px] text-muted">{profileList.length} membros</p>
          </div>
          <AvatarStack profiles={profileList} size="sm" max={4} className="hidden sm:inline-flex" />
        </div>
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={(e) => {
          const el = e.currentTarget
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160
        }}
      >
        <div className="mx-auto max-w-3xl px-3 py-4 sm:px-5">
          {sorted.length === 0 && (
            <EmptyState icon={MessageCircle} color="sky" title="Comece a conversa" description="Combine ensaios e compartilhe músicas." />
          )}
          {sorted.map((m, i) => {
            const prev = sorted[i - 1]
            const nextMsg = sorted[i + 1]
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt)
            const startsGroup = newDay || prev.userId !== m.userId || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000
            const endsGroup =
              !nextMsg || nextMsg.userId !== m.userId || !sameDay(nextMsg.createdAt, m.createdAt) || new Date(nextMsg.createdAt).getTime() - new Date(m.createdAt).getTime() > 5 * 60_000
            const mine = m.userId === me?.id
            const author = profiles[m.userId]
            const reacts = reactionsByMsg.get(m.id)
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-surface-2 px-3 py-1 text-[12px] font-bold text-muted">{chatDayLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', startsGroup ? 'mt-3' : 'mt-0.5')}>
                  {!mine && <div className="w-8 shrink-0">{endsGroup && <Avatar profile={author} size="sm" />}</div>}
                  <div className={cn('flex max-w-[80%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
                    {!mine && startsGroup && (
                      <span className="mb-1 ml-1 text-[12px] font-bold" style={{ color: `var(--${author?.color ?? 'lavender'}-ink)` }}>
                        {author ? firstName(author.name) : 'Membro'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(m)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setSelected(m)
                      }}
                      className={cn(
                        'group relative px-3.5 py-2 text-left text-[15px] leading-snug transition-[filter] active:brightness-95',
                        mine ? 'rounded-[20px] rounded-br-md bg-primary-soft text-ink' : 'rounded-[20px] rounded-bl-md border border-line bg-surface text-ink shadow-card',
                        !startsGroup && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
                      )}
                    >
                      {m.text && <span className="block whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</span>}
                      <Attachment message={m} mine={mine} />
                      <span className={cn('mt-0.5 block text-right text-[10.5px] font-semibold', mine ? 'text-primary/70' : 'text-muted')}>{timeOf(m.createdAt)}</span>
                      <span className="absolute top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 max-lg:hidden" style={mine ? { right: 'calc(100% + 6px)' } : { left: 'calc(100% + 6px)' }}>
                        <SmilePlus className="size-4.5 text-muted" />
                      </span>
                    </button>
                    {reacts && reacts.size > 0 && (
                      <div className={cn('-mt-1.5 flex flex-wrap gap-1', mine ? 'mr-2' : 'ml-2')}>
                        {Array.from(reacts.entries()).map(([emoji, users]) => {
                          const reacted = users.includes(me?.id ?? '')
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => void toggleReaction('message', m.id, emoji)}
                              title={users.map((u) => (profiles[u] ? firstName(profiles[u].name) : '')).join(', ')}
                              className={cn(
                                'flex h-6 items-center gap-1 rounded-full border px-1.5 text-[12px] font-bold shadow-sm',
                                reacted ? 'border-primary/40 bg-primary-soft text-primary' : 'border-line bg-surface text-ink-2',
                              )}
                            >
                              {emoji} {users.length > 1 && users.length}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-surface/85 px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <IconButton icon={Paperclip} label="Compartilhar música ou culto" onClick={() => setAttach('menu')} className="shrink-0" />
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send()
              }
            }}
            enterKeyHint="send"
            placeholder="Mensagem para a equipe"
            className="max-h-33 min-h-11 flex-1 resize-none rounded-[22px] border border-line bg-surface px-4 py-2.5 text-[15px] leading-snug text-ink outline-none placeholder:text-muted/80 focus:border-primary"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!text.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-ink shadow-float transition-all active:scale-90 disabled:opacity-40 disabled:shadow-none"
          >
            <SendHorizontal className="size-5" strokeWidth={2.3} />
          </button>
        </form>
      </div>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Mensagem" size="sm">
        {selected && (
          <div>
            <div className="mb-4 flex justify-between gap-2 rounded-3xl bg-surface-2 p-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    void toggleReaction('message', selected.id, e)
                    setSelected(null)
                  }}
                  className="grid size-11 place-items-center rounded-2xl text-[24px] transition-transform hover:bg-surface active:scale-90"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {selected.text && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-semibold hover:bg-surface-2"
                  onClick={async () => {
                    if (await copyText(selected.text)) toast.success('Mensagem copiada')
                    setSelected(null)
                  }}
                >
                  <Copy className="size-5 text-muted" /> Copiar texto
                </button>
              )}
              {(selected.userId === me?.id || me?.role === 'admin') && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-semibold text-rose-ink hover:bg-rose"
                  onClick={() => {
                    void deleteMessage(selected.id)
                    setSelected(null)
                  }}
                >
                  <Trash2 className="size-5" /> Apagar mensagem
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={attach === 'menu'} onClose={() => setAttach(null)} title="Compartilhar" size="sm">
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setAttach('song')} className="flex flex-col items-start gap-3 rounded-3xl bg-lavender p-4 text-left text-lavender-ink">
            <Music className="size-6" />
            <span className="text-[15px] font-bold">Música</span>
          </button>
          <button type="button" onClick={() => setAttach('service')} className="flex flex-col items-start gap-3 rounded-3xl bg-butter p-4 text-left text-butter-ink">
            <CalendarDays className="size-6" />
            <span className="text-[15px] font-bold">Culto</span>
          </button>
        </div>
      </Sheet>
      <SongPickerSheet
        open={attach === 'song'}
        onClose={() => setAttach(null)}
        title="Compartilhar música"
        onPick={async (song) => {
          setAttach(null)
          nearBottom.current = true
          await sendMessage(text, { songId: song.id })
          setText('')
        }}
      />
      <Sheet open={attach === 'service'} onClose={() => setAttach(null)} title="Compartilhar culto">
        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-muted">Nenhum culto agendado.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={async () => {
                  setAttach(null)
                  nearBottom.current = true
                  await sendMessage(text, { serviceId: s.id })
                  setText('')
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left hover:bg-surface-2"
              >
                <CalendarDays className="size-5 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{s.title}</span>
                  <span className="block text-[13px] text-muted">{friendlyDate(s.date)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  )
}
