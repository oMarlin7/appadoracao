import { describe, expect, it } from 'vitest'
import { memberStats } from './attendance'
import { cleanChannelName, embedUrl, extractMediaLinks, parseMediaUrl, splitVideoTitle } from './media'
import { THEMES, THEME_BY_ID, applyCustomThemes, groupThemes, suggestThemes } from './taxonomy'
import type { Attendance, CustomTheme, Service } from '@/types'

describe('links de YouTube e Spotify', () => {
  it('reconhece os formatos de link do YouTube', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(parseMediaUrl(url), url).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    }
  })

  it('reconhece faixas, álbuns e o formato spotify:', () => {
    const id = '4uLU6hMCjMI75M1A2tKUQC'
    expect(parseMediaUrl(`https://open.spotify.com/track/${id}?si=xyz`)).toEqual({ provider: 'spotify', kind: 'track', id, url: `https://open.spotify.com/track/${id}` })
    expect(parseMediaUrl(`https://open.spotify.com/intl-pt/track/${id}`)?.id).toBe(id)
    expect(parseMediaUrl(`spotify:album:${id}`)).toMatchObject({ kind: 'album', id })
  })

  it('recusa o que não é link de música', () => {
    expect(parseMediaUrl('https://www.youtube.com/@canal')).toBeNull()
    expect(parseMediaUrl('https://open.spotify.com/artist/x')).toBeNull()
    expect(parseMediaUrl('Lugar Secreto')).toBeNull()
    expect(parseMediaUrl('')).toBeNull()
  })

  it('separa vários links colados e remove repetidos', () => {
    const links = extractMediaLinks('https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ, https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC texto solto')
    expect(links.map((l) => l.provider)).toEqual(['youtube', 'spotify'])
  })

  it('monta o player sem cookies do YouTube e o do Spotify', () => {
    expect(embedUrl(parseMediaUrl('https://youtu.be/dQw4w9WgXcQ')!)).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/)
    expect(embedUrl(parseMediaUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')!)).toMatch(/^https:\/\/open\.spotify\.com\/embed\/track\/4uLU6hMCjMI75M1A2tKUQC/)
  })
})

describe('título do vídeo → música e artista', () => {
  it('usa o canal para saber qual lado é o artista', () => {
    expect(splitVideoTitle('Gabriela Rocha - Lugar Secreto (Ao Vivo)', 'Gabriela Rocha')).toEqual({ title: 'Lugar Secreto', artist: 'Gabriela Rocha' })
    expect(splitVideoTitle('Ninguém Explica Deus | Preto no Branco feat. Gabriela Rocha', 'Preto no Branco')).toEqual({ title: 'Ninguém Explica Deus', artist: 'Preto no Branco feat. Gabriela Rocha' })
  })

  it('tira "clipe oficial", "lyric video" e afins', () => {
    expect(splitVideoTitle('Fernandinho - Uma Nova História [Clipe Oficial]', 'Fernandinho Oficial')).toEqual({ title: 'Uma Nova História', artist: 'Fernandinho' })
    expect(splitVideoTitle('Ministério Morada - Só Tu És Santo (Lyric Video) #worship', 'MORADA')).toEqual({ title: 'Só Tu És Santo', artist: 'Ministério Morada' })
  })

  it('sem traço, o artista é o canal', () => {
    expect(splitVideoTitle('Bondade de Deus (Ao Vivo)', 'Isaias Saad - Topic')).toEqual({ title: 'Bondade de Deus', artist: 'Isaias Saad' })
    expect(cleanChannelName('AlineBarrosVEVO')).toBe('AlineBarros')
  })
})

describe('presença', () => {
  const svc = (id: string, date: string, team: string[]): Service => ({
    id,
    title: id,
    date,
    time: null,
    theme: '',
    bibleText: '',
    notes: '',
    leaderId: null,
    items: [],
    team: team.map((userId) => ({ userId, role: 'vocal' })),
    createdBy: null,
    createdAt: '',
    updatedAt: '',
  })
  const att = (serviceId: string, userId: string, status: Attendance['status'], reason: string | null = null, note = ''): Attendance => ({
    id: `${serviceId}:${userId}`,
    serviceId,
    userId,
    status,
    reason,
    note,
    markedBy: null,
    createdAt: '',
    updatedAt: '',
  })
  const services = [svc('a', '2026-10-01', ['ana', 'bia']), svc('b', '2026-10-08', ['ana', 'bia', 'caio']), svc('c', '2026-10-30', ['ana'])]
  const records = [
    att('a', 'ana', 'presente'),
    att('a', 'bia', 'ausente', 'trabalho'),
    att('b', 'ana', 'confirmado'),
    att('b', 'bia', 'ausente'),
    att('b', 'dani', 'presente'),
    att('c', 'ana', 'ausente', null, 'viagem'),
  ]

  it('conta presenças, faltas justificadas e sem justificativa nos cultos que já passaram', () => {
    const stats = memberStats(services, records, { today: '2026-10-17' })
    expect(stats.get('ana')).toMatchObject({ services: 2, present: 2, justified: 0, unjustified: 0, rate: 1 })
    expect(stats.get('bia')).toMatchObject({ services: 2, present: 0, justified: 1, unjustified: 1, rate: 0 })
    expect(stats.get('caio')).toMatchObject({ services: 1, unmarked: 1, rate: null })
    // Quem não estava na escala mas foi marcado também conta.
    expect(stats.get('dani')).toMatchObject({ services: 1, present: 1 })
  })

  it('respeita o período escolhido', () => {
    const stats = memberStats(services, records, { today: '2026-10-17', from: '2026-10-05' })
    expect(stats.get('ana')?.services).toBe(1)
    expect(stats.get('bia')).toMatchObject({ justified: 0, unjustified: 1 })
  })
})

describe('temas', () => {
  it('tem temas específicos agrupados', () => {
    const groups = groupThemes()
    expect(groups.map((g) => g.id)).toEqual(['deus', 'cristo', 'resposta', 'vida', 'igreja', 'datas'])
    expect(THEMES.length).toBeGreaterThanOrEqual(35)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  it('sugere os temas novos pela letra', () => {
    expect(suggestThemes('Eu e a minha casa serviremos ao Senhor, a minha família, o meu lar')).toContain('familia')
    expect(suggestThemes('Debaixo das tuas asas é o meu refúgio, o meu abrigo e fortaleza')).toContain('protecao')
  })

  it('junta os temas criados pela equipe e usa as palavras deles nas sugestões', () => {
    const custom: CustomTheme = {
      id: 'tema-x',
      name: 'Juventude',
      description: '',
      icon: 'flame',
      color: 'coral',
      keywords: ['Juventude', 'geração eleita'],
      createdBy: null,
      createdAt: '',
      updatedAt: '',
    }
    applyCustomThemes([custom])
    expect(THEME_BY_ID['tema-x']).toMatchObject({ name: 'Juventude', group: 'equipe', custom: true })
    expect(suggestThemes('Somos uma geração eleita, juventude que adora')).toContain('tema-x')
    applyCustomThemes([])
    expect(THEME_BY_ID['tema-x']).toBeUndefined()
  })
})
