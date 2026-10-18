import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Reorder, useDragControls } from 'motion/react'
import { toast } from 'sonner'
import { Copy, GripVertical, ListMusic, Lock, Pencil, Play, Plus, Trash2, Users, X } from 'lucide-react'
import { NewPlaylistForm, SongPickerSheet } from '@/components/action-sheets'
import { Avatar } from '@/components/avatar'
import { HeaderAvatar, Page, PageHeader, TopBar } from '@/components/layout'
import { KeyBadge, SongCover } from '@/components/song-bits'
import { Button, IconButton, LinkButton } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Card, EmptyState, Field, Input, Segmented, Switch } from '@/components/ui/primitives'
import { Sheet, confirm } from '@/components/ui/sheet'
import { addToPlaylist, createPlaylist, deletePlaylist, removeFromPlaylist, updatePlaylist } from '@/lib/actions'
import { useDocumentTitle } from '@/lib/hooks'
import { useMe, useRow, useRows, useTable } from '@/lib/store'
import { PASTELS, ink, solid, type Pastel } from '@/lib/taxonomy'
import { cn, firstName, plural } from '@/lib/utils'
import type { Playlist, Song } from '@/types'

export function PlaylistCover({ playlist, size = 'md', className }: { playlist: Playlist; size?: 'md' | 'lg'; className?: string }) {
  const songs = useTable('songs')
  const list = playlist.songIds.map((id) => songs[id]).filter(Boolean).slice(0, 4)
  const box = size === 'lg' ? 'size-36 sm:size-44 rounded-[32px]' : 'aspect-square w-full rounded-3xl'
  if (list.length < 4)
    return (
      <div
        className={cn('cover-art relative grid shrink-0 place-items-center overflow-hidden', box, className)}
        style={{ background: `radial-gradient(circle at 25% 20%, rgb(255 255 255 / 0.5), transparent 55%), ${solid(playlist.color)}` }}
      >
        <ListMusic className={size === 'lg' ? 'size-14' : 'size-10'} style={{ color: ink(playlist.color) }} strokeWidth={1.6} />
      </div>
    )
  return (
    <div className={cn('grid shrink-0 grid-cols-2 gap-0.5 overflow-hidden', box, className)} style={{ background: solid(playlist.color) }}>
      {list.map((s) => (
        <SongCover key={s!.id} song={s!} size={88} rounded="rounded-none" className="!h-full !w-full" />
      ))}
    </div>
  )
}

export function PlaylistsPage() {
  useDocumentTitle('Playlists')
  const me = useMe()
  const playlists = useRows('playlists')
  const profiles = useTable('profiles')
  const [tab, setTab] = useState<'todas' | 'minhas' | 'equipe'>('todas')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const visible = useMemo(
    () =>
      playlists
        .filter((p) => p.isShared || p.ownerId === me?.id)
        .filter((p) => (tab === 'minhas' ? p.ownerId === me?.id : tab === 'equipe' ? p.ownerId !== me?.id : true))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [playlists, me?.id, tab],
  )

  return (
    <Page>
      <PageHeader
        title="Playlists"
        subtitle="Repertórios para ensaios, datas especiais e devocional"
        actions={
          <>
            <Button icon={Plus} onClick={() => setCreating(true)} className="hidden sm:inline-flex">
              Nova playlist
            </Button>
            <HeaderAvatar />
          </>
        }
      />
      <div className="mb-5 flex items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'minhas', label: 'Minhas' },
            { value: 'equipe', label: 'Da equipe' },
          ]}
        />
        <Button icon={Plus} size="sm" variant="soft" onClick={() => setCreating(true)} className="sm:hidden">
          Nova
        </Button>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          color="mint"
          title="Nenhuma playlist aqui"
          description="Monte repertórios para ensaios e datas especiais."
          action={
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Criar playlist
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => {
            const owner = profiles[p.ownerId]
            return (
              <Link key={p.id} to={`/playlists/${p.id}`} className="group block">
                <PlaylistCover playlist={p} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
                <div className="mt-2.5 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-bold text-ink">{p.name}</span>
                    {!p.isShared && <Lock className="size-3.5 shrink-0 text-muted" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    {owner && <Avatar profile={owner} size="xs" />}
                    <span className="truncate">
                      {owner?.id === me?.id ? 'Você' : owner ? firstName(owner.name) : ''} · {plural(p.songIds.length, 'música', 'músicas')}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title="Nova playlist">
        <NewPlaylistForm
          onDone={(id) => {
            setCreating(false)
            if (id) navigate(`/playlists/${id}`)
          }}
        />
      </Sheet>
    </Page>
  )
}

function PlaylistRow({ song, index, playlistId, canEdit, onDragEnd }: { song: Song; index: number; playlistId: string; canEdit: boolean; onDragEnd: () => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={song.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative flex items-center gap-2 rounded-2xl bg-surface py-2 pr-2 pl-1"
      whileDrag={{ scale: 1.02, boxShadow: 'var(--sh-2)', zIndex: 10 }}
    >
      {canEdit ? (
        <button type="button" aria-label="Arrastar" onPointerDown={(e) => controls.start(e)} className="grid h-12 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted/60">
          <GripVertical className="size-[18px]" />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-muted tabular-nums">{index + 1}</span>
      <Link to={`/musica/${song.id}?playlist=${playlistId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <SongCover song={song} size={46} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-ink">{song.title}</div>
          <div className="truncate text-[13px] text-muted">{song.artist}</div>
        </div>
      </Link>
      <KeyBadge value={song.teamKey ?? song.originalKey} kind={song.teamKey ? 'team' : 'original'} />
      {canEdit && <IconButton icon={X} size="sm" label="Remover da playlist" onClick={() => void removeFromPlaylist(playlistId, song.id)} />}
    </Reorder.Item>
  )
}

function EditPlaylistSheet({ playlist, open, onClose }: { playlist: Playlist; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(playlist.name)
  const [description, setDescription] = useState(playlist.description)
  const [color, setColor] = useState<Pastel>(playlist.color)
  const [isShared, setShared] = useState(playlist.isShared)
  useEffect(() => {
    if (!open) return
    setName(playlist.name)
    setDescription(playlist.description)
    setColor(playlist.color)
    setShared(playlist.isShared)
  }, [open, playlist])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar playlist"
      footer={
        <Button
          className="w-full"
          disabled={!name.trim()}
          onClick={async () => {
            await updatePlaylist(playlist.id, { name: name.trim(), description: description.trim(), color, isShared })
            onClose()
          }}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Descrição">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-2">
          {PASTELS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn('size-9 rounded-full', color === c && 'ring-[3px] ring-primary ring-offset-2 ring-offset-surface')}
              style={{ background: `var(--${c}-solid)` }}
            />
          ))}
        </div>
        <Switch checked={isShared} onChange={setShared} label="Compartilhar com a equipe" />
      </div>
    </Sheet>
  )
}

export function PlaylistPage() {
  const { id = '' } = useParams()
  const playlist = useRow('playlists', id)
  useDocumentTitle(playlist?.name)
  if (!playlist)
    return (
      <>
        <TopBar backTo="/playlists" />
        <Page>
          <EmptyState icon={ListMusic} title="Playlist não encontrada" action={<LinkButton to="/playlists">Ver playlists</LinkButton>} />
        </Page>
      </>
    )
  return <PlaylistView playlist={playlist} />
}

function PlaylistView({ playlist }: { playlist: Playlist }) {
  const me = useMe()
  const navigate = useNavigate()
  const songs = useTable('songs')
  const profiles = useTable('profiles')
  const owner = profiles[playlist.ownerId]
  const canEdit = playlist.ownerId === me?.id || me?.role === 'admin'
  const [order, setOrder] = useState(playlist.songIds)
  useEffect(() => setOrder(playlist.songIds), [playlist.songIds])
  const [sheet, setSheet] = useState<null | 'add' | 'edit'>(null)
  const list = order.filter((sid) => songs[sid])

  return (
    <>
      <TopBar
        backTo="/playlists"
        actions={
          <Menu
            items={[
              { label: 'Editar playlist', icon: Pencil, onSelect: () => setSheet('edit'), hidden: !canEdit },
              {
                label: 'Duplicar para mim',
                icon: Copy,
                onSelect: async () => {
                  const nid = await createPlaylist({ name: `${playlist.name} (cópia)`, description: playlist.description, color: playlist.color, isShared: false, songIds: playlist.songIds })
                  toast.success('Playlist duplicada')
                  navigate(`/playlists/${nid}`)
                },
              },
              {
                label: 'Excluir playlist',
                icon: Trash2,
                danger: true,
                hidden: !canEdit,
                onSelect: async () => {
                  if (await confirm({ title: 'Excluir esta playlist?', confirmLabel: 'Excluir', danger: true })) {
                    await deletePlaylist(playlist.id)
                    navigate('/playlists')
                  }
                },
              },
            ]}
          />
        }
      />
      <Page className="pt-6">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
          <PlaylistCover playlist={playlist} size="lg" className="shadow-pop" />
          <div className="min-w-0">
            <div className="flex items-center justify-center gap-1.5 text-[12.5px] font-bold tracking-wide text-muted uppercase sm:justify-start">
              {playlist.isShared ? <Users className="size-3.5" /> : <Lock className="size-3.5" />}
              {playlist.isShared ? 'Playlist da equipe' : 'Só você vê'}
            </div>
            <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight text-ink sm:text-[34px]">{playlist.name}</h1>
            {playlist.description && <p className="mt-1 text-[14.5px] text-muted">{playlist.description}</p>}
            <div className="mt-2 flex items-center justify-center gap-2 text-[13px] text-muted sm:justify-start">
              {owner && <Avatar profile={owner} size="xs" />}
              {owner ? firstName(owner.name) : ''} · {plural(list.length, 'música', 'músicas')}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-2 sm:justify-start">
          {list.length > 0 && (
            <LinkButton to={`/playlists/${playlist.id}/tocar`} icon={Play}>
              Tocar em sequência
            </LinkButton>
          )}
          {canEdit && (
            <Button variant="soft" icon={Plus} onClick={() => setSheet('add')}>
              Adicionar
            </Button>
          )}
        </div>

        <div className="mt-6">
          {list.length === 0 ? (
            <EmptyState icon={ListMusic} title="Playlist vazia" action={canEdit && <Button icon={Plus} onClick={() => setSheet('add')}>Adicionar músicas</Button>} />
          ) : (
            <Card className="p-1.5">
              <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-0.5">
                {order.map((sid) =>
                  songs[sid] ? (
                    <PlaylistRow
                      key={sid}
                      song={songs[sid]}
                      index={list.indexOf(sid)}
                      playlistId={playlist.id}
                      canEdit={canEdit}
                      onDragEnd={() => void updatePlaylist(playlist.id, { songIds: order })}
                    />
                  ) : null,
                )}
              </Reorder.Group>
            </Card>
          )}
        </div>
      </Page>
      <SongPickerSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        title="Adicionar à playlist"
        excludeIds={playlist.songIds}
        onPick={async (song) => {
          if (await addToPlaylist(playlist.id, song.id)) toast.success(`“${song.title}” adicionada`)
        }}
      />
      <EditPlaylistSheet playlist={playlist} open={sheet === 'edit'} onClose={() => setSheet(null)} />
    </>
  )
}
