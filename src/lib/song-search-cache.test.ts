import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./backend', () => ({ backend: { invoke: (...args: unknown[]) => invoke(...args) }, IMPORT_FUNCTION: 'importar-musica', isDemo: false }))

const { searchSongs } = await import('./song-search')

const video = {
  id: 'youtube:abcdefghijk',
  title: 'Fernandinho - Galileu (Ao Vivo)',
  version: null,
  artist: 'Fernandinho',
  album: null,
  coverUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
  durationSec: 360,
  previewUrl: null,
  link: 'https://www.youtube.com/watch?v=abcdefghijk',
}

describe('cota do YouTube', () => {
  beforeEach(() => invoke.mockReset())

  it('repetir a mesma busca não chama o servidor de novo', async () => {
    invoke.mockResolvedValue({ results: [video], source: 'youtube' })
    const first = await searchSongs('galileu fernandinho')
    const again = await searchSongs('  Galileu   Fernandinho ')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(again).toEqual(first)
    expect(first[0]).toMatchObject({ title: 'Galileu', artist: 'Fernandinho', version: 'Ao Vivo' })
  })

  it('buscas diferentes vão ao servidor', async () => {
    invoke.mockResolvedValue({ results: [video], source: 'youtube' })
    await searchSongs('lugar secreto')
    await searchSongs('ousado amor')
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
