import { describe, expect, it } from 'vitest'
import { describeError, listErrorCodes } from '../../lib/errors/errorCatalog'
import { bannerFor, RETRY_LABEL } from './connectionBanner'

describe('bannerFor', () => {
  it('traz título, descrição e código exatamente da tabela da 042', () => {
    const banner = bannerFor('SRC-401')
    expect(banner).toEqual({
      code: 'SRC-401',
      title: describeError('SRC-401').title,
      description: describeError('SRC-401').description,
      retryable: false,
    })
  })

  it('só os códigos recuperáveis pedem "Tentar de novo"', () => {
    expect(bannerFor('NET-01').retryable).toBe(true)
    expect(bannerFor('NET-02').retryable).toBe(true)
    expect(bannerFor('API-429').retryable).toBe(true)
    expect(bannerFor('STO-01').retryable).toBe(true)
    for (const code of ['SRC-001', 'SRC-401', 'SRC-402', 'SRC-422'] as const) {
      expect(bannerFor(code).retryable).toBe(false)
    }
    expect(RETRY_LABEL).toBe('Tentar de novo')
  })

  it('nenhum texto da faixa carrega URL ou credencial', () => {
    for (const code of listErrorCodes()) {
      const { title, description } = bannerFor(code)
      expect(`${title} ${description}`).not.toMatch(/https?:|@|senha=|password/i)
    }
  })
})
