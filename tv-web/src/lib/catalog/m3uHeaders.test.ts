import { describe, expect, it } from 'vitest'
import { parseHeaderPairs, splitUrlHeaders } from './m3uHeaders'
import { parseM3uText } from './m3uParser'
import { M3U_PIPE_SAMPLE } from './m3uHeaders.fixtures'

describe('splitUrlHeaders (feature 044, logic §1)', () => {
  it('linha sem `|` volta intacta, sem headers', () => {
    expect(splitUrlHeaders('http://x.test/a.ts')).toEqual({ url: 'http://x.test/a.ts' })
  })

  it('aceita o nome em qualquer caixa e `Referrer` como Referer', () => {
    expect(splitUrlHeaders('http://x.test/a.ts|USER-AGENT=A&referrer=http://r.test/').headers).toEqual({
      userAgent: 'A',
      referer: 'http://r.test/',
    })
  })

  it('preserva `+` e `%` inválido no valor, sem lançar', () => {
    expect(splitUrlHeaders('http://x.test/a.ts|User-Agent=A+B').headers).toEqual({ userAgent: 'A+B' })
    expect(splitUrlHeaders('http://x.test/a.ts|User-Agent=100%zz').headers).toEqual({ userAgent: '100%zz' })
  })

  it('valor vazio ou com mais de 512 caracteres não é guardado; a URL sai limpa mesmo assim', () => {
    expect(splitUrlHeaders('http://x.test/a.ts|User-Agent=')).toEqual({ url: 'http://x.test/a.ts' })
    expect(splitUrlHeaders(`http://x.test/a.ts|User-Agent=${'a'.repeat(513)}`)).toEqual({ url: 'http://x.test/a.ts' })
    expect(splitUrlHeaders(`http://x.test/a.ts|User-Agent=${'a'.repeat(512)}`).headers?.userAgent).toHaveLength(512)
  })

  it('header repetido: vale o último', () => {
    expect(parseHeaderPairs('User-Agent=A&User-Agent=B')).toEqual({ userAgent: 'B' })
  })

  it('só Cookie/Origin: a URL sai limpa e sem headers; `|` comum no caminho fica', () => {
    expect(splitUrlHeaders('http://x.test/a.ts|Cookie=x&Origin=http://o.test')).toEqual({ url: 'http://x.test/a.ts' })
    expect(splitUrlHeaders('http://x.test/a|b.ts')).toEqual({ url: 'http://x.test/a|b.ts' })
  })

  it('amostra no formato real: todas as URLs saem sem sufixo e os headers esperados ficam à parte', async () => {
    const { entries } = await parseM3uText(M3U_PIPE_SAMPLE)
    expect(entries.map((entry) => entry.url.includes('|'))).toEqual([false, false, false, false])
    expect(entries[0].headers).toEqual({ userAgent: 'Mozilla/5.0 (Linux; Tizen 9.0)', referer: 'http://portal.exemplo.test/' })
    expect(entries[1].headers).toEqual({ userAgent: 'Exemplo Player/1.0' })
    expect(entries[2].headers).toEqual({ referer: 'http://portal.exemplo.test/p?x=1&y=2' })
    expect(entries[3].headers).toBeUndefined()
    expect(entries[0].group).toBe('Canais | Abertos')
  })
})
