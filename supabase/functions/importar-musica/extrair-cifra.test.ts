import { describe, expect, it } from 'vitest'
import { parseSheet } from '@/lib/music/sheet'
import { extractSheetFromHtml, isChordToken, jinaHtmlToSheet, jinaMarkdownToSheet } from './extrair-cifra.ts'

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

  it('devolve a cifra com cada acorde na mesma coluna da página', () => {
    expect(jinaHtmlToSheet(html)).toBe(sheet)
    expect(html).toContain('>F7M</b>')
    expect(html).toContain('\u200b   Vem com a gente cantar &amp; louvar')
  })

  it('o app mostra cada acorde em cima da palavra certa', () => {
    const over = chordOver(jinaHtmlToSheet(html)!)
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
