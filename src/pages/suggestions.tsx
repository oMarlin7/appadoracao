import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Lightbulb, Plus, ThumbsUp, Trash2 } from 'lucide-react'
import { Avatar, AvatarStack } from '@/components/avatar'
import { HeaderAvatar, Page, PageHeader } from '@/components/layout'
import { SongCover } from '@/components/song-bits'
import { Button, IconButton, LinkButton } from '@/components/ui/button'
import { Card, EmptyState, SectionTitle, Segmented } from '@/components/ui/primitives'
import { deleteSuggestion, setSuggestionStatus, toggleReaction } from '@/lib/actions'
import { useDocumentTitle } from '@/lib/hooks'
import { useMe, useRows, useTable } from '@/lib/store'
import { compact, firstName, friendlyDate, timeAgo } from '@/lib/utils'
import type { Suggestion, SuggestionStatus } from '@/types'

const STATUS_LABEL: Record<SuggestionStatus, string> = { pendente: 'Pendentes', aceita: 'Aceitas', recusada: 'Arquivadas' }

export function SuggestionsPage() {
  useDocumentTitle('Sugestões')
  const suggestions = useRows('suggestions')
  const services = useTable('services')
  const songs = useTable('songs')
  const [status, setStatus] = useState<SuggestionStatus>('pendente')
  const groups = useMemo(() => {
    const list = suggestions.filter((s) => s.status === status && songs[s.songId]).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const map = new Map<string, Suggestion[]>()
    for (const s of list) {
      const key = s.serviceId && services[s.serviceId] ? s.serviceId : 'sem-culto'
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'sem-culto') return 1
      if (b === 'sem-culto') return -1
      return services[a].date.localeCompare(services[b].date)
    })
  }, [suggestions, status, services, songs])
  const counts = useMemo(() => {
    const c: Record<SuggestionStatus, number> = { pendente: 0, aceita: 0, recusada: 0 }
    for (const s of suggestions) if (songs[s.songId]) c[s.status]++
    return c
  }, [suggestions, songs])

  return (
    <Page>
      <PageHeader title="Sugestões" subtitle="Ideias da equipe para os próximos cultos" actions={<HeaderAvatar />} />
      <Segmented
        value={status}
        onChange={setStatus}
        className="mb-6"
        options={(Object.keys(STATUS_LABEL) as SuggestionStatus[]).map((s) => ({ value: s, label: `${STATUS_LABEL[s]}${counts[s] ? ` · ${counts[s]}` : ''}` }))}
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          color="butter"
          title={status === 'pendente' ? 'Nenhuma sugestão pendente' : 'Nada por aqui'}
          description="Abra qualquer música e toque em “Sugerir” para indicá-la a um culto."
          action={status === 'pendente' && <LinkButton to="/acervo">Explorar o acervo</LinkButton>}
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([serviceId, list]) => {
            const service = services[serviceId]
            return (
              <section key={serviceId}>
                <SectionTitle
                  title={service ? service.title : 'Para um culto em breve'}
                  subtitle={service ? friendlyDate(service.date) : 'Sem data definida'}
                  action={
                    service && (
                      <Link to={`/cultos/${service.id}`} className="text-[13px] font-bold text-primary">
                        Abrir culto
                      </Link>
                    )
                  }
                />
                <div className="space-y-2.5">
                  {list.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </Page>
  )
}

function SuggestionCard({ suggestion: s }: { suggestion: Suggestion }) {
  const me = useMe()
  const songs = useTable('songs')
  const services = useTable('services')
  const profiles = useTable('profiles')
  const reactions = useRows('reactions')
  const song = songs[s.songId]
  const by = profiles[s.userId]
  const service = s.serviceId ? services[s.serviceId] : undefined
  const votes = reactions.filter((r) => r.targetType === 'suggestion' && r.targetId === s.id)
  const voted = votes.some((v) => v.userId === me?.id)
  // Aceitar/recusar (e levar para o setlist) é só do líder.
  const canManage = me?.role === 'admin'
  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <Link to={`/musica/${song.id}`}>
          <SongCover song={song} size={50} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/musica/${song.id}`} className="block truncate text-[15px] font-bold text-ink">
            {song.title}
          </Link>
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
            {by && <Avatar profile={by} size="xs" />}
            {by ? firstName(by.name) : 'Alguém'} sugeriu · {timeAgo(s.createdAt)}
          </div>
          {s.note && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{s.note}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={voted ? 'soft' : 'outline'} icon={ThumbsUp} onClick={() => void toggleReaction('suggestion', s.id, '👍')}>
          {voted ? 'Apoiado' : 'Apoiar'}
          {votes.length > 0 && ` · ${votes.length}`}
        </Button>
        {votes.length > 0 && <AvatarStack profiles={compact(votes.map((v) => profiles[v.userId]))} size="xs" />}
        {s.status === 'pendente' && canManage && service && (
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => void setSuggestionStatus(s.id, 'recusada')}>
              Agora não
            </Button>
            <Button
              size="sm"
              icon={Plus}
              onClick={async () => {
                if (await setSuggestionStatus(s.id, 'aceita')) toast.success(`Adicionada ao setlist de “${service.title}”`)
              }}
            >
              Aceitar
            </Button>
          </div>
        )}
        {s.status !== 'pendente' && canManage && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void setSuggestionStatus(s.id, 'pendente')}>
            Reabrir
          </Button>
        )}
        {(s.userId === me?.id || me?.role === 'admin') && <IconButton icon={Trash2} size="sm" label="Excluir sugestão" onClick={() => void deleteSuggestion(s.id)} />}
      </div>
    </Card>
  )
}
