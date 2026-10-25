import { describe, expect, it } from 'vitest'
import { extractSheetFromHtml, isChordToken, jinaMarkdownToSheet } from './extrair-cifra.ts'

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
    expect(r!.content).toContain('G D') // acordes na linha de cima (espaços normalizados)
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
