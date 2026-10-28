import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowDown, ArrowUp, Layers, Plus, X } from 'lucide-react'
import { useSongs } from '@/lib/hooks'
import { isMedley, medleyParts, medleyTitle, partKey } from '@/lib/medley'
import { keyCompatibility, prettyAccidentals } from '@/lib/music/theory'
import { searchSongs } from '@/lib/search'
import { useTable } from '@/lib/store'
import { cn, plural } from '@/lib/utils'
import type { Id, Song } from '@/types'
import { KeyBadge, SongCover } from './song-bits'
import { Button, IconButton } from './ui/button'
import { Card, Field, Input, SearchInput } from './ui/primitives'
import { Sheet } from './ui/sheet'

/**
 * Monta o medley: as músicas na ordem em que vão ser tocadas, a busca da próxima (com as que
 * emendam no tom da última logo à mão) e um nome, se a equipe quiser.
 */
export function MedleyBuilder({ ids, onChange, name, onNameChange }: { ids: Id[]; onChange: (ids: Id[]) => void; name: string; onNameChange: (v: string) => void }) {
  const songs = useTable('songs')
  const all = useSongs()
  const [q, setQ] = useState('')
  const parts = ids.map((id) => songs[id]).filter((s): s is Song => !!s)
  const lastKey = parts.length ? partKey(parts[parts.length - 1]) : null
  const options = useMemo(() => all.filter((s) => !isMedley(s) && !ids.includes(s.id)), [all, ids])
  const results = useMemo(() => {
    if (q.trim()) return searchSongs(options, q).slice(0, 8)
    // Sem busca: as que emendam no tom da última música do medley.
    if (!lastKey) return []
    return options
      .map((s) => ({ s, c: keyCompatibility(lastKey, partKey(s)) }))
      .filter((x) => x.c >= 2)
      .sort((a, b) => b.c - a.c)
      .slice(0, 5)
      .map((x) => x.s)
  }, [options, q, lastKey])

  const move = (i: number, d: number) => {
    const next = [...ids]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {parts.length > 0 && (
        <ol className="space-y-1.5">
          {parts.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 py-1.5 pr-1 pl-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[12.5px] font-extrabold text-primary-ink">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold text-ink">{s.title}</span>
                <span className="block truncate text-[12px] text-muted">{s.artist || 'Artista não informado'}</span>
              </span>
              <KeyBadge value={partKey(s)} kind={s.teamKey ? 'team' : 'original'} />
              <span className="flex shrink-0">
                <IconButton icon={ArrowUp} size="sm" label="Tocar antes" disabled={i === 0} onClick={() => move(i, -1)} className="size-8" />
                <IconButton icon={ArrowDown} size="sm" label="Tocar depois" disabled={i === parts.length - 1} onClick={() => move(i, 1)} className="size-8" />
                <IconButton icon={X} size="sm" label="Tirar do medley" onClick={() => onChange(ids.filter((id) => id !== s.id))} className="size-8" />
              </span>
            </li>
          ))}
        </ol>
      )}

      <div>
        <div className="mb-2 text-[13px] font-semibold text-ink-2">{parts.length ? 'Juntar com' : 'Escolha as músicas'}</div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar a próxima música…" />
        {!q.trim() && results.length > 0 && lastKey && (
          <div className="mt-3 px-1 text-[12px] font-bold tracking-wide text-primary uppercase">Emendam bem com {prettyAccidentals(lastKey)}</div>
        )}
        <div className="-mx-2 mt-1">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange([...ids, s.id])
                setQ('')
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2"
            >
              <SongCover song={s} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{s.title}</span>
                <span className="block truncate text-[12.5px] text-muted">{s.artist || 'Artista não informado'}</span>
              </span>
              <KeyBadge value={partKey(s)} kind={s.teamKey ? 'team' : 'original'} />
              <Plus className="size-5 shrink-0 text-primary" strokeWidth={2.4} />
            </button>
          ))}
          {q.trim() && results.length === 0 && <p className="px-2 py-4 text-center text-[13.5px] text-muted">Nenhuma música encontrada.</p>}
        </div>
      </div>

      {parts.length >= 2 && (
        <Field label="Nome do medley" hint="opcional">
          {(id) => <Input id={id} value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={medleyTitle(parts)} />}
        </Field>
      )}
    </div>
  )
}

/** Montar ou editar um medley numa janela própria (playlist, página do medley). */
export function MedleySheet({
  open,
  onClose,
  initialIds = [],
  initialName = '',
  title = 'Montar medley',
  confirmLabel = 'Salvar medley',
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  initialIds?: Id[]
  initialName?: string
  title?: string
  confirmLabel?: string
  onConfirm: (ids: Id[], name: string) => Promise<unknown>
}) {
  const [ids, setIds] = useState<Id[]>(initialIds)
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setIds(initialIds)
    setName(initialName)
    // Só ao abrir: o que vem de fora é o ponto de partida.
  }, [open])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description="Duas ou mais músicas, uma emendada na outra, que contam como uma só."
      tall
      footer={
        <Button
          className="w-full"
          icon={Layers}
          loading={saving}
          disabled={ids.length < 2}
          onClick={async () => {
            setSaving(true)
            await onConfirm(ids, name)
            setSaving(false)
          }}
        >
          {ids.length < 2 ? 'Escolha pelo menos 2 músicas' : confirmLabel}
        </Button>
      }
    >
      <MedleyBuilder ids={ids} onChange={setIds} name={name} onNameChange={setName} />
    </Sheet>
  )
}

/** Botão para começar um medley (nas listas de escolher música). */
export function StartMedleyButton({ onClick, label = 'Juntar músicas num medley', className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-3.5 rounded-2xl border border-dashed border-surface-3 px-3 py-2.5 text-left hover:bg-primary-soft', className)}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Layers className="size-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-primary">{label}</span>
        <span className="block text-[12.5px] text-muted">Duas ou mais músicas que viram uma só</span>
      </span>
    </button>
  )
}

/** As músicas de um medley, na ordem, cada uma levando à própria página. */
export function MedleyPartsList({ song, className }: { song: Song; className?: string }) {
  const songs = useTable('songs')
  const parts = medleyParts(song, songs)
  return (
    <Card className={cn('p-2', className)}>
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-[13px] font-bold tracking-wide text-primary uppercase">
        <Layers className="size-4" /> Medley · {plural(parts.length, 'música', 'músicas')}
      </div>
      <ol>
        {parts.map((p, i) => (
          <li key={p.id}>
            <Link to={`/musica/${p.id}`} className="flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-surface-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-[12.5px] font-extrabold text-primary">{i + 1}</span>
              <SongCover song={p} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold text-ink">{p.title}</span>
                <span className="block truncate text-[12.5px] text-muted">{p.artist || 'Artista não informado'}</span>
              </span>
              <KeyBadge value={partKey(p)} kind={p.teamKey ? 'team' : 'original'} />
            </Link>
          </li>
        ))}
      </ol>
      {parts.length < 2 && <p className="px-2.5 pb-2 text-[13px] text-muted">Uma das músicas deste medley foi excluída. Edite o medley para escolher outra.</p>}
    </Card>
  )
}
