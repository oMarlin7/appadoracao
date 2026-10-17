import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AudioLines, Mic } from 'lucide-react'
import { HeaderAvatar, Page, PageHeader } from '@/components/layout'
import { AddRecordingSheet, RecordingRow } from '@/components/media'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, SearchInput, Segmented } from '@/components/ui/primitives'
import { useDocumentTitle } from '@/lib/hooks'
import { useMe, useRows, useTable } from '@/lib/store'
import { friendlyDate, normalizeSearch, plural } from '@/lib/utils'
import type { Recording } from '@/types'

export function RehearsalsPage() {
  useDocumentTitle('Ensaios')
  const me = useMe()
  const recordings = useRows('recordings')
  const services = useTable('services')
  const songs = useTable('songs')
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'todas' | 'minhas'>('todas')
  const [open, setOpen] = useState(false)

  const groups = useMemo(() => {
    const needle = normalizeSearch(q)
    const list = recordings
      .filter((r) => scope === 'todas' || r.createdBy === me?.id)
      .filter((r) => !needle || normalizeSearch(`${r.title} ${songs[r.songId ?? '']?.title ?? ''} ${services[r.serviceId ?? '']?.title ?? ''}`).includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const map = new Map<string, { key: string; title: string; subtitle: string; to?: string; date: string; items: Recording[] }>()
    for (const r of list) {
      const svc = r.serviceId ? services[r.serviceId] : undefined
      const key = svc ? svc.id : 'avulsas'
      if (!map.has(key))
        map.set(key, {
          key,
          title: svc ? svc.title : 'Gravações avulsas',
          subtitle: svc ? friendlyDate(svc.date) : 'Sem culto vinculado',
          to: svc ? `/cultos/${svc.id}` : undefined,
          date: svc ? svc.date : r.createdAt.slice(0, 10),
          items: [],
        })
      map.get(key)!.items.push(r)
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [recordings, scope, me?.id, q, songs, services])

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Ensaios"
        subtitle={recordings.length ? `${plural(recordings.length, 'gravação', 'gravações')} da equipe para estudar em casa` : 'Gravações da equipe para estudar em casa'}
        actions={
          <>
            <Button icon={Mic} onClick={() => setOpen(true)} className="hidden sm:inline-flex">
              Gravar / enviar
            </Button>
            <HeaderAvatar />
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar gravação, música ou culto" className="flex-1" />
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'minhas', label: 'Minhas' },
          ]}
        />
      </div>

      <Button icon={Mic} onClick={() => setOpen(true)} className="mb-6 w-full sm:hidden" size="lg">
        Gravar ou enviar ensaio
      </Button>

      {groups.length === 0 ? (
        <EmptyState
          icon={AudioLines}
          title={q ? 'Nada encontrado' : 'Nenhuma gravação ainda'}
          description={q ? 'Tente outro nome de música ou culto.' : 'Grave o próximo ensaio pelo celular ou envie um áudio. A equipe ouve aqui no app, inclusive mais devagar para estudar.'}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-end justify-between gap-3 px-1">
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-bold text-ink">{g.title}</h2>
                  <p className="text-[12.5px] text-muted">{g.subtitle}</p>
                </div>
                {g.to && (
                  <Link to={g.to} className="shrink-0 text-[13px] font-bold text-primary">
                    Ver culto
                  </Link>
                )}
              </div>
              <Card className="divide-y divide-line p-1.5">
                {g.items.map((r) => (
                  <RecordingRow key={r.id} rec={r} showSong />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <AddRecordingSheet open={open} onClose={() => setOpen(false)} />
    </Page>
  )
}
