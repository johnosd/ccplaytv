import { describe, expect, it } from 'vitest'
import { homeStatusLine } from './homeStatusLine'
import type { PrefetchProgress } from '../catalog/prefetchApi'

const base = { sourceId: 'fonte-1', updating: false, lastSuccessfulSyncAt: null, now: 1_000 }
const progress = (extra: Partial<PrefetchProgress>): PrefetchProgress => ({
  state: 'paused',
  sourceId: 'fonte-1',
  ready: 3,
  total: 10,
  ...extra,
})

describe('homeStatusLine — limite do painel (feature 042, FR-017)', () => {
  it('429: uma linha só, sem número de categoria nem toast por categoria', () => {
    expect(homeStatusLine({ ...base, progress: progress({ pausedReason: 'rate_limited' }) })).toBe(
      'Pré-carga em pausa — o painel pediu um intervalo',
    )
  })

  it('o motivo só vale para a lista ativa', () => {
    const line = homeStatusLine({ ...base, sourceId: 'outra', progress: progress({ pausedReason: 'rate_limited' }) })
    expect(line).not.toBe('Pré-carga em pausa — o painel pediu um intervalo')
  })

  it('"Atualizando catálogo…" continua vencendo o aviso de pausa', () => {
    expect(homeStatusLine({ ...base, updating: true, progress: progress({ pausedReason: 'rate_limited' }) })).toBe(
      'Atualizando catálogo…',
    )
  })

  it('sem o motivo volta ao "Preparando catálogo — N de M"', () => {
    expect(homeStatusLine({ ...base, progress: progress({ pausedReason: undefined, state: 'running' }) })).toBe(
      'Preparando catálogo — 3 de 10 categorias',
    )
  })
})
