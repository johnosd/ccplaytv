import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const syncEpg = vi.fn()
vi.mock('./epgSync', () => ({ syncEpg: (...args: unknown[]) => syncEpg(...args) }))

import { isEpgSyncing, onEpgSyncFinished, requestEpgSync, subscribeEpgSyncing } from './epgRunner'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('epgRunner (FR-010) — sem Worker no jsdom, roda na thread principal', () => {
  beforeEach(() => {
    syncEpg.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('duas chamadas enquanto uma roda = uma única sincronização', async () => {
    const gate = deferred<{ outcome: 'synced' }>()
    syncEpg.mockReturnValue(gate.promise)

    const first = requestEpgSync('s1')
    const second = requestEpgSync('s1')
    expect(second).toBe(first)
    expect(isEpgSyncing('s1')).toBe(true)

    gate.resolve({ outcome: 'synced' })
    await first
    expect(syncEpg).toHaveBeenCalledTimes(1)
    expect(isEpgSyncing('s1')).toBe(false)

    syncEpg.mockResolvedValue({ outcome: 'synced' })
    await requestEpgSync('s1')
    expect(syncEpg).toHaveBeenCalledTimes(2)
  })

  it('fontes diferentes sincronizam em paralelo', async () => {
    const gate = deferred<{ outcome: 'synced' }>()
    syncEpg.mockReturnValue(gate.promise)
    const a = requestEpgSync('a')
    const b = requestEpgSync('b')
    expect(a).not.toBe(b)
    gate.resolve({ outcome: 'synced' })
    await Promise.all([a, b])
    expect(syncEpg).toHaveBeenCalledTimes(2)
  })

  it('avisa quando começa/termina e quando cada sincronização acaba, com o resultado', async () => {
    syncEpg.mockResolvedValue({ outcome: 'failed', errorKind: 'network' })
    const syncingEvents = vi.fn()
    const finished = vi.fn()
    const offSyncing = subscribeEpgSyncing(syncingEvents)
    const offFinished = onEpgSyncFinished(finished)

    await requestEpgSync('s2')

    expect(syncingEvents).toHaveBeenCalledTimes(2) // começou, terminou
    expect(finished).toHaveBeenCalledWith('s2', { outcome: 'failed', errorKind: 'network' })

    offSyncing()
    offFinished()
    await requestEpgSync('s2')
    expect(finished).toHaveBeenCalledTimes(1)
  })

  it('uma exceção inesperada vira falha, nunca rejeição sem dono', async () => {
    syncEpg.mockRejectedValue(new Error('https://x.test/?password=segredo'))
    const result = await requestEpgSync('s3')
    expect(result).toEqual({ outcome: 'failed', errorKind: 'unreadable' })
    expect(JSON.stringify(result)).not.toContain('segredo')
    expect(isEpgSyncing('s3')).toBe(false)
  })
})
