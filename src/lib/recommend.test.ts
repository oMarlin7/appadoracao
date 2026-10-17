import { describe, expect, it } from 'vitest'
import { buildDemoSeed } from '@/data/seed'
import { buildSetlist, parseRequest, recommend } from './recommend'
import { lyricSnippet, searchSongs } from './search'
import { suggestMoments, suggestThemes } from './taxonomy'

const seed = buildDemoSeed(new Date(2026, 9, 16, 12))
const songs = Object.values(seed.songs)
const ctx = { songs, services: Object.values(seed.services), favorites: Object.values(seed.favorites), today: new Date(2026, 9, 16) }

describe('busca', () => {
  it('ignora acentos e acha pelo título', () => {
    expect(searchSongs(songs, 'graca')[0].title).toBe('Graça Sem Fim')
  })
  it('acha por trecho da letra e mostra o trecho', () => {
    const [hit] = searchSongs(songs, 'vale de ossos')
    expect(hit.title).toBe('Sopra, Espírito')
    expect(lyricSnippet(hit, 'ossos')).toContain('ossos secos')
  })
  it('entende abreviação de livro bíblico', () => {
    expect(searchSongs(songs, 'sl 23').map((s) => s.title)).toContain('Tua Bondade')
  })
  it('exige todas as palavras', () => {
    expect(searchSongs(songs, 'calvário natal')).toHaveLength(0)
  })
})

describe('pedido em português', () => {
  it('entende momento, tema, ritmo e quantidade', () => {
    const r = parseRequest('3 músicas de gratidão animadas para a abertura')
    expect(r.moment).toBe('abertura')
    expect(r.themes).toContain('gratidao')
    expect(r.tempo).toBe('rapida')
    expect(r.count).toBe(3)
  })
  it('entende a ceia e a cruz', () => {
    const r = parseRequest('algo sobre a cruz para a ceia')
    expect(r.moment).toBe('ceia')
    expect(r.themes).toContain('cruz')
  })
  it('emenda depois de uma música do acervo', () => {
    const r = parseRequest('pra tocar depois de Celebrai', songs)
    expect(r.afterKey).toBe('G')
    expect(r.excludeIds).toEqual(['ex-celebrai'])
  })
})

describe('assistente', () => {
  it('prioriza a música certa para a ceia', () => {
    const [first] = recommend(ctx, { moment: 'ceia', themes: ['cruz'] })
    expect(first.song.title).toBe('No Calvário')
    expect(first.reasons.join(' ')).toMatch(/Ceia/)
  })
  it('valoriza transições de tom', () => {
    const list = recommend(ctx, { moment: 'louvor', afterKey: 'A', limit: 20 })
    const sameKey = list.find((r) => r.key === 'A')!
    expect(sameKey.reasons.join(' ')).toMatch(/Mesmo tom/)
  })
  it('desconta músicas tocadas na última semana', () => {
    const list = recommend(ctx, { moment: 'abertura', limit: 20 })
    const celebrai = list.find((r) => r.song.id === 'ex-celebrai')!
    expect(celebrai.reasons).toContain('Tocada na última semana')
  })
  it('monta um setlist completo sem repetir músicas', () => {
    const set = buildSetlist(ctx, { message: 'A graça que nos alcança' })
    expect(set.map((s) => s.moment)).toEqual(['abertura', 'louvor', 'louvor', 'adoracao', 'adoracao', 'ministracao'])
    expect(new Set(set.map((s) => s.song.id)).size).toBe(set.length)
  })
  it('respeita o que já está no setlist', () => {
    const set = buildSetlist(ctx, { existing: [{ id: 'x', songId: 'ex-celebrai', key: 'G', moment: 'abertura', notes: '' }] })
    expect(set.map((s) => s.song.id)).not.toContain('ex-celebrai')
  })
})

describe('sugestões ao cadastrar', () => {
  it('sugere temas pela letra', () => {
    expect(suggestThemes('Sobre o monte uma cruz, o sangue do Cordeiro no Calvário')).toContain('cruz')
    expect(suggestThemes('Vem, Espírito Santo, derrama a tua unção, vem Espírito')).toContain('espirito')
  })
  it('sugere momentos pelos temas e ritmo', () => {
    expect(suggestMoments(['celebracao'], 'rapida')).toContain('abertura')
    expect(suggestMoments(['cruz', 'graca'], 'lenta')).toContain('ceia')
  })
})
