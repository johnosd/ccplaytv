import { describe, expect, it } from 'vitest'
import { vodGroupDisplay } from './vodGroupDisplay'

describe('vodGroupDisplay', () => {
  it('tira o prefixo redundante "Filmes |" / "Séries |" só na exibição', () => {
    expect(vodGroupDisplay('Filmes | Lançamentos')).toBe('Lançamentos')
    expect(vodGroupDisplay('Filmes | 4K')).toBe('4K')
    expect(vodGroupDisplay('Séries | Netflix')).toBe('Netflix')
    expect(vodGroupDisplay('Series: Drama')).toBe('Drama')
    expect(vodGroupDisplay('Filmes – Cinema')).toBe('Cinema')
  })

  it('mantém o que não tem o separador obrigatório ou ficaria vazio', () => {
    expect(vodGroupDisplay('Filmes de Ação')).toBe('Filmes de Ação')
    expect(vodGroupDisplay('Filmes')).toBe('Filmes')
    expect(vodGroupDisplay('Filmes |')).toBe('Filmes |')
    expect(vodGroupDisplay(undefined)).not.toBe('')
  })
})
