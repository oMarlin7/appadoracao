import { describe, expect, it } from 'vitest'
import { aiErrorMessage, candidateFromDeezer, catalogFor, dedupeCandidates, formatDuration, normalizeDetails } from './song-search'
import { THEMES } from './taxonomy'

describe('busca pelo nome', () => {
  const track = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    title: 'Galileu (Ao Vivo)',
    title_short: 'Galileu',
    title_version: '(Ao Vivo)',
    duration: 360,
    artist: { name: 'Fernandinho' },
    album: { title: 'Galileu', cover_big: 'https://img/500.jpg', cover_xl: 'https://img/1000.jpg' },
    ...extra,
  })

  it('separa título e versão e usa a capa grande', () => {
    expect(candidateFromDeezer(track(1))).toMatchObject({ id: 'deezer:1', title: 'Galileu', version: 'Ao Vivo', artist: 'Fernandinho', coverUrl: 'https://img/1000.jpg', durationSec: 360 })
    expect(candidateFromDeezer(track(2, { title_version: '', title: 'Galileu' })).version).toBeNull()
  })

  it('tira a mesma faixa repetida em coletâneas', () => {
    const list = [track(1), track(2, { album: { title: 'Coletânea' } }), track(3, { title_version: '' })].map(candidateFromDeezer)
    expect(dedupeCandidates(list).map((c) => c.id)).toEqual(['deezer:1', 'deezer:3'])
  })

  it('duração em minutos', () => {
    expect(formatDuration(360)).toBe('6:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(null)).toBe('')
  })
})

describe('ficha vinda do servidor', () => {
  it('normaliza o tom e completa o que faltou', () => {
    const d = normalizeDetails({ ia: true, originalKey: 'F#m', themes: ['cruz'] })
    expect(d).toMatchObject({ ia: true, originalKey: 'F#m', themes: ['cruz'], moments: [], bibleRefs: [], meaning: '', sources: [] })
  })

  it('mensagens claras quando a IA não completa', () => {
    expect(aiErrorMessage(undefined)).toBeNull()
    expect(aiErrorMessage('sem-chave')).toMatch(/chave/)
    expect(aiErrorMessage('qualquer')).toMatch(/Não deu/)
  })

  it('o catálogo inclui todos os temas e os momentos do culto', () => {
    const c = catalogFor(THEMES)
    expect(c.themes.length).toBe(THEMES.length)
    expect(c.moments.some((m) => m.id === 'adoracao')).toBe(true)
  })
})
