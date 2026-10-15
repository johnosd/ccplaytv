// Contrato da feature 047 (player-dev-mpegts) — TRAVADO por contract-tests.lock.
// Só o `sdd-plan` altera este arquivo; o `sdd-execute` apenas faz passar.
import { describe, expect, it } from 'vitest'
import { shouldFallbackToDemux, type FallbackInput } from './devDemux'

describe('devDemux — quando cair no demux (contrato 047)', () => {
  // FR-003 / FR-009 / FR-006: só um .ts que o <video> recusou (erro 4), com demux disponível e ainda não tentado.
  it('só autoriza o fallback para .ts com erro 4, disponível e sem tentativa anterior', () => {
    const base: FallbackInput = {
      url: 'http://painel.test/live/u/p/1.ts',
      mediaErrorCode: 4,
      alreadyTried: false,
      available: true,
    }

    expect(shouldFallbackToDemux(base)).toBe(true)
    // A query string não muda o formato: continua .ts.
    expect(shouldFallbackToDemux({ ...base, url: 'http://painel.test/live/u/p/1.ts?token=abc' })).toBe(true)

    // FR-009: o que não é MPEG-TS segue pelo caminho de hoje.
    expect(shouldFallbackToDemux({ ...base, url: 'http://painel.test/movie/u/p/9.mp4' })).toBe(false)
    expect(shouldFallbackToDemux({ ...base, url: 'http://painel.test/live/u/p/1.m3u8' })).toBe(false)
    expect(shouldFallbackToDemux({ ...base, url: 'isto não é uma url' })).toBe(false)

    // Outro erro do elemento (rede = 2, decodificação = 3) ou nenhum: não é "formato não suportado".
    expect(shouldFallbackToDemux({ ...base, mediaErrorCode: 2 })).toBe(false)
    expect(shouldFallbackToDemux({ ...base, mediaErrorCode: 3 })).toBe(false)
    expect(shouldFallbackToDemux({ ...base, mediaErrorCode: null })).toBe(false)

    // FR-006: uma tentativa só — sem laço de demux → erro → demux.
    expect(shouldFallbackToDemux({ ...base, alreadyTried: true })).toBe(false)
    // FR-008/FR-013: sem demux disponível (produção, TV, jsdom) nada muda.
    expect(shouldFallbackToDemux({ ...base, available: false })).toBe(false)
  })
})
