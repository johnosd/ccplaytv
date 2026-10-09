import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_ON_OPEN_MIN_MS } from '../../lib/catalog/freshness'
import { beginSourceSync, endSourceSync, isSourceSyncing } from './sourceSyncing'
import { shouldCheckOnForeground, useRefreshOnForeground } from './useRefreshOnForeground'
import type { SourceOut } from './importApi'

const NOW = Date.UTC(2026, 9, 9, 20, 0, 0)

function makeSource(overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id: 'a',
    type: 'provider_credentials',
    display_name: 'Lista a',
    connection_state: 'synced',
    last_successful_sync_at: '2026-10-09T12:00:00.000Z',
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

let visibility: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })

function goTo(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  cleanup()
  visibility = 'visible'
  while (isSourceSyncing('a')) endSourceSync('a')
})

// Bug `lista-xtream-nao-atualiza-novos-filmes`: o app residente na TV voltava ao
// primeiro plano sem nunca perguntar ao provedor o que mudou.
describe('shouldCheckOnForeground', () => {
  it('pergunta com lista ativa, acesso aberto e sem verificação recente', () => {
    expect(shouldCheckOnForeground({ source: makeSource(), syncing: false, lastCheckAt: undefined, now: NOW })).toBe(true)
  })

  it('não pergunta sem lista ativa nem durante uma sincronização', () => {
    expect(shouldCheckOnForeground({ source: null, syncing: false, lastCheckAt: undefined, now: NOW })).toBe(false)
    expect(shouldCheckOnForeground({ source: makeSource(), syncing: true, lastCheckAt: undefined, now: NOW })).toBe(false)
  })

  it('não pergunta com a conta guardada vencida ou recusada', () => {
    const expired = makeSource({ account: { status: 'active', expiresAt: NOW - 1000, checkedAt: NOW - 1000 } })
    const refused = makeSource({ account: { status: 'refused', checkedAt: NOW - 1000 } })
    expect(shouldCheckOnForeground({ source: expired, syncing: false, lastCheckAt: undefined, now: NOW })).toBe(false)
    expect(shouldCheckOnForeground({ source: refused, syncing: false, lastCheckAt: undefined, now: NOW })).toBe(false)
  })

  it('respeita o intervalo mínimo desde a última verificação do gatilho', () => {
    const source = makeSource()
    expect(shouldCheckOnForeground({ source, syncing: false, lastCheckAt: NOW - 60_000, now: NOW })).toBe(false)
    expect(shouldCheckOnForeground({ source, syncing: false, lastCheckAt: NOW - REFRESH_ON_OPEN_MIN_MS, now: NOW })).toBe(true)
  })
})

describe('useRefreshOnForeground', () => {
  it('verifica a lista ativa ao voltar ao primeiro plano, uma vez por intervalo', () => {
    let now = NOW
    const check = vi.fn()
    renderHook(() => useRefreshOnForeground(makeSource(), check, () => now))

    goTo('hidden')
    expect(check).not.toHaveBeenCalled()
    goTo('visible')
    expect(check).toHaveBeenCalledWith('a')

    now += 60_000
    goTo('hidden')
    goTo('visible')
    expect(check).toHaveBeenCalledTimes(1)

    now += REFRESH_ON_OPEN_MIN_MS
    goTo('hidden')
    goTo('visible')
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('não verifica sem lista ativa nem com a lista sincronizando', () => {
    const check = vi.fn()
    const { rerender } = renderHook(({ source }) => useRefreshOnForeground(source, check, () => NOW), {
      initialProps: { source: null as SourceOut | null },
    })
    goTo('visible')
    expect(check).not.toHaveBeenCalled()

    beginSourceSync('a')
    rerender({ source: makeSource() })
    goTo('visible')
    expect(check).not.toHaveBeenCalled()
  })
})
