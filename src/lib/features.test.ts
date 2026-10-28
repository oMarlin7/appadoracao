import { describe, expect, it } from 'vitest'
import { hasStarted, memberStats, minutesLate } from './attendance'
import { cleanChannelName, embedUrl, extractMediaLinks, parseMediaUrl, splitVideoTitle } from './media'
import { THEMES, THEME_BY_ID, applyCustomThemes, groupThemes, suggestThemes } from './taxonomy'
import { RELEASES, greetingFor, unseenReleases } from '@/data/changelog'
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
    expect(splitVideoTitle('Autor da Vida | Cover acústico', 'Coral Esperança')).toEqual({ title: 'Autor da Vida', artist: 'Coral Esperança' })
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
  const svc = (id: string, date: string, team: string[], time: string | null = null): Service => ({
    id,
    title: id,
    date,
    time,
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
    const stats = memberStats(services, records, { now: new Date(2026, 9, 17, 12) })
    expect(stats.get('ana')).toMatchObject({ services: 2, present: 2, justified: 0, unjustified: 0, rate: 1 })
    expect(stats.get('bia')).toMatchObject({ services: 2, present: 0, justified: 1, unjustified: 1, rate: 0 })
    expect(stats.get('caio')).toMatchObject({ services: 1, unmarked: 1, rate: null })
    // Quem não estava na escala mas foi marcado também conta.
    expect(stats.get('dani')).toMatchObject({ services: 1, present: 1 })
  })

  it('respeita o período escolhido', () => {
    const stats = memberStats(services, records, { now: new Date(2026, 9, 17, 12), from: '2026-10-05' })
    expect(stats.get('ana')?.services).toBe(1)
    expect(stats.get('bia')).toMatchObject({ justified: 0, unjustified: 1 })
  })

  it('atraso conta como presença, e o atraso fica registrado', () => {
    const culto = svc('d', '2026-10-15', ['ana', 'bia'], '19:30')
    const late = { ...att('d', 'ana', 'atrasado', null, 'trânsito'), arrivedAt: '19:52' }
    const stats = memberStats([culto], [late, att('d', 'bia', 'presente')], { now: new Date(2026, 9, 17) })
    expect(stats.get('ana')).toMatchObject({ services: 1, present: 1, late: 1, rate: 1 })
    expect(stats.get('bia')).toMatchObject({ present: 1, late: 0 })
    expect(minutesLate(culto, late)).toBe(22)
    expect(minutesLate(culto, { arrivedAt: '19:10' })).toBe(0)
    expect(minutesLate({ time: null }, late)).toBeNull()
  })

  it('no horário do evento, a presença já conta como o que aconteceu', () => {
    const culto = svc('e', '2026-10-18', ['ana'], '19:00')
    expect(hasStarted(culto, new Date(2026, 9, 18, 18, 59))).toBe(false)
    expect(hasStarted(culto, new Date(2026, 9, 18, 19, 0))).toBe(true)
    expect(hasStarted(culto, new Date(2026, 9, 18, 20, 30))).toBe(true)
    // Durante o culto a falta já entra na frequência; antes do horário, ainda não.
    const falta = att('e', 'ana', 'ausente')
    expect(memberStats([culto], [falta], { now: new Date(2026, 9, 18, 20) }).get('ana')).toMatchObject({ unjustified: 1, rate: 0 })
    expect(memberStats([culto], [falta], { now: new Date(2026, 9, 18, 18) }).get('ana')).toBeUndefined()
    // Sem horário, o dia inteiro do evento já conta.
    expect(hasStarted(svc('f', '2026-10-18', []), new Date(2026, 9, 18, 8))).toBe(true)
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

describe('notas da atualização', () => {
  const releases = [
    { id: '2026-11-05', items: [] },
    { id: '2026-10-28', items: [] },
  ]

  it('mostra só as versões que o aparelho ainda não mostrou', () => {
    expect(unseenReleases('2026-10-28', releases).map((r) => r.id)).toEqual(['2026-11-05'])
    expect(unseenReleases('2026-11-05', releases)).toEqual([])
    expect(unseenReleases(null, releases)).toHaveLength(2)
    // Segunda versão no mesmo dia: quem viu a primeira vê só a nova.
    expect(unseenReleases('2026-10-28', [{ id: '2026-10-28b', items: [] }, { id: '2026-10-28', items: [] }]).map((r) => r.id)).toEqual(['2026-10-28b'])
  })

  it('chama a pessoa pelo primeiro nome', () => {
    const g = greetingFor('Marlon de Paula', 'x')
    expect(g).toContain('Marlon')
    expect(g).not.toContain('{nome}')
    expect(g).not.toContain('Paula')
    // A mesma versão, para a mesma pessoa, tem sempre a mesma saudação.
    expect(greetingFor('Marlon de Paula', 'x')).toBe(g)
  })

  it('cada novidade é curta e diz onde tocar com o botão em negrito', () => {
    for (const r of RELEASES)
      for (const item of r.items) {
        expect(item.text.length, item.title).toBeLessThanOrEqual(220)
        if (item.kind === 'novo') expect(item.text, item.title).toMatch(/\*\*[^*]+\*\*/)
      }
  })
})
