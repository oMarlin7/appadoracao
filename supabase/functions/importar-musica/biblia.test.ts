import { describe, expect, it } from 'vitest'
import { isBibleRef } from './biblia.ts'

describe('referências bíblicas sugeridas pela IA', () => {
  it('aceita livro e capítulo que existem, com ou sem acento e versículos', () => {
    for (const ref of ['Salmos 23:1-3', 'Salmo 91', 'João 3:16', 'joao 3.16', '1 Coríntios 13:4-7', '1ª Coríntios 13', 'Isaías 53:5', 'Cântico dos Cânticos 2:4', 'Apocalipse 22:20', 'Salmos 119:176', 'Atos dos Apóstolos 2:1'])
      expect(isBibleRef(ref), ref).toBe(true)
  })

  it('recusa livro inventado, capítulo que não existe e formato estranho', () => {
    for (const ref of ['João 25:3', 'Salmos 151:1', 'Livro Inventado 1:1', '4 Reis 2:1', 'Judas 2', 'Romanos', '', 'Salmos 23:5-2', 'veja Salmos 23'])
      expect(isBibleRef(ref), ref).toBe(false)
  })
})
