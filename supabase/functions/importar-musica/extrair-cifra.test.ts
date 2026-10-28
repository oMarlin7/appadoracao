import { describe, expect, it } from 'vitest'
import { parseSheet } from '@/lib/music/sheet'
import {
  cifraClubSettings,
  cleanSongTitle,
  extractSheetFromHtml,
  isChordToken,
  jinaHtmlToSheet,
  jinaMarkdownToSheet,
  lyricsOnly,
  pickCifraPages,
  stripTabs,
  transposeChord,
  type CifraPage,
} from './extrair-cifra.ts'

/** Acorde → trecho da letra logo abaixo dele, como o app mostra. */
function chordOver(content: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const sec of parseSheet(content).sections)
    for (const line of sec.lines)
      if (line.kind === 'lyric') for (const p of line.pieces) if (p.chord) out.push([p.chord, p.text.trim().split(/\s+/)[0] ?? ''])
  return out
}

describe('isChordToken', () => {
  it('reconhece acordes comuns', () => {
    for (const c of ['G', 'Bb', 'F#m', 'C7M', 'C7+', 'D/F#', 'Em7(b5)', 'C#m7/G#', '(G)']) {
      expect(isChordToken(c), c).toBe(true)
    }
  })

  it('não confunde palavras com acordes', () => {
    for (const w of ['Santo', 'Grande', 'Deus', 'Forte', 'Amor', 'Refrão', 'Verso', 'Casa']) {
      expect(isChordToken(w), w).toBe(false)
    }
  })
})

describe('extractSheetFromHtml', () => {
  it('extrai um <pre> do Cifra Club (página de impressão)', () => {
    const html = `<html><body><pre>
Tom: G

[Intro] G  D  Em  C

[Refrão]
G              D
Santo, santo é o Senhor
Em             C
Digno de louvor
</pre></body></html>`
    const r = extractSheetFromHtml(html, 'https://www.cifraclub.com.br/artista/musica/imprimir.html')
    expect(r).not.toBeNull()
    expect(r!.originalKey).toBe('G')
    expect(r!.source).toBe('cifraclub')
    expect(r!.content).toContain('[Refrão]')
    expect(r!.content).toContain('Santo, santo é o Senhor')
    // a coluna de cada acorde fica como na página
    expect(r!.content).toContain('G              D\nSanto, santo é o Senhor\nEm             C\nDigno de louvor')
  })

  it('reconstrói acordes de <b> dentro de parágrafos (letras.mus.br)', () => {
    const html = `<html><body><div class="cnt-letra p402_premium">
<p><b>G</b>Santo, <b>D</b>santo é o Senhor</p>
<p><b>Em</b>Digno de <b>C</b>louvor</p>
</div></body></html>`
    const r = extractSheetFromHtml(html, 'https://www.letras.mus.br/artista/musica/')
    expect(r).not.toBeNull()
    expect(r!.source).toBe('letras')
    expect(r!.content).toContain('Santo, santo é o Senhor')
    expect(r!.content).toMatch(/G\s*D/) // acordes na linha de cima
  })

  it('rejeita páginas sem cifra nem letra', () => {
    const html = `<html><body><nav>Menu</nav><footer>Rodapé</footer></body></html>`
    expect(extractSheetFromHtml(html, 'https://example.com/')).toBeNull()
  })
})

describe('jinaMarkdownToSheet', () => {
  it('converte o markdown do Jina (X-Target-Selector: pre) para o formato do app', () => {
    const md = [
      'Title: Tudo É Perda - Felipe Rodrigues - Cifra Club',
      '',
      'URL Source: https://www.cifraclub.com.br/felipe-rodrigues/tudo-e-perda/',
      '',
      'Markdown Content:',
      '\u200b[Intro] **C****Am7****G****F7M(2)/C** \u200b[Primeira Parte]',
      '',
      '\u200b**C****Am7** \u200b Tudo é perda se não tenho a Ti',
      '',
      '\u200b**G****F7M(2)/C** \u200b A Tua graça é o que me basta',
      '',
      '\u200b( **Dm****G****C/E****F7M(2)/C** ) \u200b[Ponte]',
      '',
      '\u200b**Dm****G** \u200bTua presença é o que me basta',
    ].join('\n')
    const out = jinaMarkdownToSheet(md)
    expect(out).toContain('[Intro] C Am7 G F7M(2)/C')
    expect(out).toContain('[Primeira Parte]')
    expect(out).toContain('C Am7')
    expect(out).toContain('Tudo é perda se não tenho a Ti')
    expect(out).toContain('G F7M(2)/C')
    expect(out).toContain('Dm G C/E F7M(2)/C')
    expect(out).toContain('[Ponte]')
    expect(out).not.toContain('Title:')
    expect(out).not.toContain('Markdown Content')
  })
})

describe('jinaHtmlToSheet', () => {
  // A cifra como aparece no Cifra Club: a coluna de cada acorde diz em cima de qual sílaba ele cai.
  const sheet = [
    '[Intro] C  Am  F7M',
    '',
    '[Tab - Intro]',
    '',
    'E|-------4-4----|',
    'B|---4-6--------|',
    '',
    '[Primeira Parte]',
    '',
    'Am          F7M          Am',
    '   Vem com a gente cantar & louvar',
    '             F7M',
    'Que grande e eterno amor',
    '',
    '[Refrão]',
    '',
    ' Dm7  F7M    C',
    'Santo, santo, santo',
  ].join('\n')

  // O mesmo texto no formato que o Jina devolve (X-Return-Format: html, X-Target-Selector: pre):
  // acordes em <b>, partes em <div>, tablatura em <span>, espaço zero (\u200b) no começo das linhas.
  const html = (() => {
    let i = 0
    const lines = sheet.split('\n').map((line) => {
      const marked = line.replace(/\b([A-G][#b]?(?:m|7M|7|4|2)*)(?=\s|$)/g, (c) => (/^\[|\|/.test(line) && !/^\[Intro/.test(line) ? c : `<b data-chord-name="${c}" data-chord-index="${i++}" data-chord-original-text="${c}">${c}</b>`))
      const escaped = marked.replace(/&(?![a-z]+;)/g, '&amp;')
      if (/^[EB]\|/.test(line)) return `<span class="tab">${escaped}      </span>`
      return `\u200b${escaped}`
    })
    return `<html><head></head><body><pre class="_crVx" data-chord-content="true"><div class="kvMV">${lines.slice(0, 4).join('\n')}\n</div><div class="kvMV"><div class="tabs">${lines.slice(4, 6).join('\n')}\n</div>${lines.slice(6).join('\n')}\n</div></pre></body></html>`
  })()

  // O que o app recebe: a mesma cifra, sem a tablatura (nem o rótulo dela).
  const withoutTab = sheet
    .split('\n')
    .filter((l) => !/^\[Tab|\|/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  it('devolve a cifra com cada acorde na mesma coluna da página, sem a tablatura', () => {
    expect(jinaHtmlToSheet(html)).toEqual({ content: withoutTab, key: null, capo: 0 })
    expect(html).toContain('>F7M</b>')
    expect(html).toContain('\u200b   Vem com a gente cantar &amp; louvar')
  })

  it('o app mostra cada acorde em cima da palavra certa', () => {
    const over = chordOver(jinaHtmlToSheet(html)!.content)
    expect(over.slice(0, 2)).toEqual([
      ['Am', 'Vem'],
      ['F7M', 'gente'],
    ])
    expect(over).toContainEqual(['F7M', 'eterno'])
    expect(over).toContainEqual(['C', 'santo'])
  })

  it('página sem cifra devolve nada', () => {
    expect(jinaHtmlToSheet('<html><body><pre>Página não encontrada</pre></body></html>')).toBeNull()
  })
})

describe('capotraste: a cifra vem no tom que soa', () => {
  /** Página como o Jina devolve com X-Target-Selector: #key, #capo, pre (o HTML real do Cifra Club, resumido). */
  const page = (key: string, capo: string, lines: string[]) => {
    const chords = (l: string) => l.replace(/(^|\s)([A-G][#b]?[^\s]*)(?=\s|$)/g, (all, sp: string, c: string) => (isChordToken(c) ? `${sp}<b data-chord-name="${c}">${c}</b>` : all))
    const isChordLine = (l: string) => /^\[Intro\]/.test(l) || (!!l.trim() && l.trim().split(/\s+/).every(isChordToken))
    const pre = lines.map((l) => `\u200b${isChordLine(l) ? chords(l) : l}`).join('\n')
    return [
      '<html><head></head><body>',
      `<div class="nt eDVGi" id="key"><div class="icon tAvU5"><i class="_voBV"></i></div><div class="DCqes"><p class="_5QAC">Tom</p></div><div class="N0qCA"><button class="hC0CP" aria-label="Diminuir tom"><div class="icon"><i></i></div></button><span class="_QG2y Hkrrv"><p class="_5QAC HjnxC">${key}</p></span><button class="hC0CP" aria-label="Aumentar tom"><div class="icon"><i></i></div></button></div></div>`,
      '',
      `<button class="nt eDVGi" id="capo"><div class="icon tAvU5"><i class="_voBV"></i></div><div class="DCqes"><p class="_5QAC">Capotraste</p></div><span class="_QG2y"><p class="_5QAC HjnxC u-ellipsis">${capo}</p><div class="icon"><i></i></div></span></button>`,
      '',
      `<pre class="_crVx" data-chord-content="true"><div class="kvMV">${pre}\n</div></pre></body></html>`,
    ].join('\n')
  }
  // "Bondade de Deus" no Cifra Club: acordes no desenho de C, capotraste na 2ª casa, tom D.
  const shapes = ['[Intro] C  C4  C  C4', '', '[Primeira Parte]', '', '         C', 'Te amo, Deus', '      F7M/C      C', 'Tua graça nunca falha', '   G/B    Am7', 'Todos os dias']

  it('lê o tom e o capotraste da página', () => {
    expect(cifraClubSettings(page('D', '2ª casa', shapes))).toEqual({ key: 'D', capo: 2 })
    expect(cifraClubSettings(page('A', 'Sem capotraste', shapes))).toEqual({ key: 'A', capo: 0 })
    expect(cifraClubSettings('<pre>só a cifra</pre>')).toEqual({ key: null, capo: 0 })
  })

  it('sobe os acordes pelo capotraste e cada um continua em cima da mesma sílaba', () => {
    const r = jinaHtmlToSheet(page('D', '2ª casa', shapes))!
    expect(r.key).toBe('D')
    expect(r.capo).toBe(2)
    expect(r.content).toBe(['[Intro] D  D4  D  D4', '', '[Primeira Parte]', '', '         D', 'Te amo, Deus', '      G7M/D      D', 'Tua graça nunca falha', '   A/C#   Bm7', 'Todos os dias'].join('\n'))
    const semCapo = jinaHtmlToSheet(page('C', 'Sem capotraste', shapes))!
    expect(semCapo.content).toBe(shapes.join('\n'))
    // Mesmas sílabas, acordes no tom que soa.
    expect(chordOver(r.content).map(([, w]) => w)).toEqual(chordOver(semCapo.content).map(([, w]) => w))
    expect(chordOver(r.content).map(([c]) => c)).toEqual(['D', 'G7M/D', 'D', 'A/C#', 'Bm7'])
  })

  it('F# com capotraste na 4ª casa: desenho de D vira F# (com sustenido)', () => {
    const r = jinaHtmlToSheet(page('F#', '4ª casa', ['[Intro] D  A  Bm  G', '', 'D           A', 'Santo, santo']))!
    expect(r.key).toBe('F#')
    // Sem letra embaixo, ficam os espaços entre os acordes.
    expect(r.content.split('\n')[0]).toBe('[Intro] F#  C#  D#m  B')
    expect(r.content.split('\n')[2]).toBe('F#          C#')
  })

  it('tom com bemol escreve os acordes com bemol', () => {
    const r = jinaHtmlToSheet(page('F', '1ª casa', ['[Intro] E  B  C#m  A', '', 'E           B', 'Santo, santo']))!
    expect(r.content.split('\n')[0]).toBe('[Intro] F  C  Dm  Bb')
  })

  it('a letra não muda (nem "E" e "A", que parecem acordes)', () => {
    const r = jinaHtmlToSheet(page('D', '2ª casa', ['         C', 'E a Ti, Senhor', '         G', 'A glória e o louvor']))!
    expect(r.content).toBe(['         D', 'E a Ti, Senhor', '         A', 'A glória e o louvor'].join('\n'))
  })

  it('transpõe cada parte do acorde', () => {
    expect(transposeChord('F7M/C', 2)).toBe('G7M/D')
    expect(transposeChord('C#m7/G#', 1)).toBe('Dm7/A')
    expect(transposeChord('C7/9', 2)).toBe('D7/9')
    expect(transposeChord('(G)', 5, true)).toBe('(C)')
    expect(transposeChord('Ab', 1, true)).toBe('A')
    expect(transposeChord('(2x)', 2)).toBe('(2x)')
    expect(transposeChord('G', 0)).toBe('G')
  })
})

describe('tablaturas', () => {
  it('tira a tablatura, o rótulo dela e a seção que ficou vazia', () => {
    const cifra = [
      '[Refrão]',
      '',
      '         Dm           F',
      'E eu me rendo, eu me rendo',
      '',
      '[Riff]',
      '',
      'E|-10...-12...-13...-15...----|',
      'G|----------------------------| (2x)',
      '',
      '[Solo] Bb  F  C  Gm',
      '',
      '[Tab - Solo]',
      '',
      'Parte 1 de 2',
      'e|-18...-17...-15...----------|',
      '|-----------------------------|',
      '',
      '[Segunda Parte]',
      '',
      '      Gm',
      'Pra conhecer-te mais',
    ].join('\n')
    expect(stripTabs(cifra)).toBe(
      ['[Refrão]', '', '         Dm           F', 'E eu me rendo, eu me rendo', '', '[Solo] Bb  F  C  Gm', '', '[Segunda Parte]', '', '      Gm', 'Pra conhecer-te mais'].join('\n'),
    )
  })

  it('tira também "Parte 1 de 2" e a linha de acordes que marca o tempo em cima da tablatura', () => {
    // Trecho de "Deus de Obras Completas" como foi salvo.
    const cifra = [
      '[Intro] C7M  D  Bm  Em',
      '      ( Em  D  G/B ) C  D',
      '',
      '[Tab - Intro]',
      '',
      'Parte 1 de 2',
      '  C7M  D  Bm  Em ( Em   D   G/B )   C',
      'E|----------------------------------------------------|',
      'G|-----------------7h9--7\\--4--4/5--5-----------------|',
      '',
      '[Parte 2 de 2]',
      '              D',
      'E|----------------------------------------------------|',
      '',
      '[Primeira Parte]',
      '',
      '          G9',
      'Quando eu olho para os meus projetos',
    ].join('\n')
    expect(stripTabs(cifra)).toBe(['[Intro] C7M  D  Bm  Em', '      ( Em  D  G/B ) C  D', '', '[Primeira Parte]', '', '          G9', 'Quando eu olho para os meus projetos'].join('\n'))
  })

  it('seção que era só dedilhado some inteira', () => {
    // Começo de "Me Ama" como foi salvo.
    const cifra = [
      '[Intro] A  D/F#  E  D2',
      '',
      '[Dedilhado - Intro e Primeira Parte]',
      '',
      'Parte 1 de 8',
      '   A',
      'E|------9----------9----------9-------------|',
      'B|---10---10----10---10----10---10----------|',
      '',
      'Parte 2 de 8',
      'E|-9--9--9--9--9--9-------------------------|',
      '',
      '[Primeira Parte]',
      '',
      ' A',
      'Tem ciúmes de mim',
    ].join('\n')
    expect(stripTabs(cifra)).toBe(['[Intro] A  D/F#  E  D2', '', '[Primeira Parte]', '', ' A', 'Tem ciúmes de mim'].join('\n'))
  })

  it('tira o "Riff 2" que ficou entre os acordes, sem mudar a coluna deles', () => {
    // Trecho de "Deus de Obras Completas".
    const cifra = [
      'Riff            C7M',
      'O meu Deus não faz pela metade',
      '                           Riff 3',
      'Vai fazer cumprir na hora certa',
      ' Riff 2       C',
      'Meu Deus não falha, não',
      '    G/B                    Em  Riff 4',
      '( Riff 1 )',
      'Toca o riff de novo',
    ].join('\n')
    expect(stripTabs(cifra)).toBe(
      [
        '                C7M',
        'O meu Deus não faz pela metade',
        'Vai fazer cumprir na hora certa',
        '              C',
        'Meu Deus não falha, não',
        '    G/B                    Em',
        'Toca o riff de novo',
      ].join('\n'),
    )
  })

  it('não mexe em cifra sem tablatura', () => {
    const cifra = ['[Intro] G  D', '', '[Refrão]', '', 'G       D', 'Santo, santo'].join('\n')
    expect(stripTabs(cifra)).toBe(cifra)
  })
})

describe('nome da música para a busca da cifra', () => {
  it('tira numeração, versão e o que está entre parênteses', () => {
    expect(cleanSongTitle('ATO 3 - 04 - Grande é o Senhor')).toBe('Grande é o Senhor')
    expect(cleanSongTitle('Grande é o Senhor (Great is the Lord) - Acústico Ao Vivo')).toBe('Grande é o Senhor')
    expect(cleanSongTitle('Eu Falo Jesus (Ao Vivo)')).toBe('Eu Falo Jesus')
    expect(cleanSongTitle('Corpo e Família part. Késia Soares')).toBe('Corpo e Família')
    expect(cleanSongTitle('Autor da Vida')).toBe('Autor da Vida')
  })
})

describe('escolha da página da cifra', () => {
  const page = (artist: string, title: string, path: string): CifraPage => ({ url: `https://www.cifraclub.com.br/${path}/`, title, artist })
  // Resultados reais da busca do Cifra Club.
  const aline = [page('Aline Barros', 'Autor da Vida', 'aline-barros/autor-da-vida'), page('Aline Barros', 'Poder Pra Salvar', 'aline-barros/poder-pra-salvar')]
  const grande = [
    page('Adhemar de Campos', 'Grande É o Senhor', 'adhemar-de-campos/grande-o-senhor'),
    page('Adhemar de Campos', 'Louvemos Ao Senhor', 'adhemar-de-campos/louvemos-ao-senhor'),
    page('Adhemar de Campos', 'Grande É o Senhor (part. Nívea Soares)', 'adhemar-de-campos/grande-e-o-senhor-part-nivea-soares'),
    page('Xandão de Deus', 'Grande é o Senhor', 'xandao-de-deus/grande-o-senhor'),
  ]

  it('acha a página pelo nome, mesmo com o endereço diferente do título', () => {
    expect(pickCifraPages(grande, 'ATO 3 - 04 - Grande é o Senhor', 'ADHEMAR DE CAMPOS')[0].url).toBe('https://www.cifraclub.com.br/adhemar-de-campos/grande-o-senhor/')
  })

  it('prefere o artista do vídeo quando há várias gravações', () => {
    expect(pickCifraPages(grande, 'Grande é o Senhor', 'Xandão de Deus')[0].url).toBe('https://www.cifraclub.com.br/xandao-de-deus/grande-o-senhor/')
  })

  it('entende música e artista trocados', () => {
    const [p] = pickCifraPages(aline, 'Aline Barros', 'Autor da Vida')
    expect(p).toMatchObject({ title: 'Autor da Vida', artist: 'Aline Barros', url: 'https://www.cifraclub.com.br/aline-barros/autor-da-vida/' })
  })

  it('um cover usa a cifra da gravação original', () => {
    expect(pickCifraPages(aline, 'Autor da Vida', 'Coral da Igreja')[0].url).toBe('https://www.cifraclub.com.br/aline-barros/autor-da-vida/')
  })

  it('não aceita outra música', () => {
    expect(pickCifraPages(aline, 'Ao Único', 'Aline Barros')).toEqual([])
    expect(pickCifraPages(grande, 'Senhor', 'Fulano')).toEqual([])
  })
})

describe('letra para a IA', () => {
  it('tira acordes e tablaturas e deixa letra e seções', () => {
    const cifra = '[Intro] C  Am  F  G\n\nE|---0---2---|\n\n[Primeira Parte]\nC              Am\nSanto, santo é o Senhor\n  F       G\nDigno de louvor'
    expect(lyricsOnly(cifra)).toBe('[Intro]\n\n[Primeira Parte]\nSanto, santo é o Senhor\nDigno de louvor')
  })
})
