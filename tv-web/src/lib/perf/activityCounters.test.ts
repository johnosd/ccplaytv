// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActivityCounters, type QueryCacheLike } from './activityCounters'

/** Cache de consultas falso: só o `subscribe`, que é tudo o que o módulo de medição usa. */
function fakeCache(): QueryCacheLike & { emitir(): void } {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emitir() {
      for (const l of [...listeners]) l()
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('contadores de acionamento por janela (089, T022)', () => {
  it('conta scroll na captura, evento do cache de consultas, e zera no snapshot', () => {
    const cache = fakeCache()
    const contadores = createActivityCounters()
    const desinstalar = contadores.install(cache)
    try {
      // Scroll não borbulha: sem a captura, um evento disparado num filho passaria despercebido.
      const alvo = document.createElement('div')
      document.body.append(alvo)
      alvo.dispatchEvent(new Event('scroll'))
      alvo.dispatchEvent(new Event('scroll'))
      cache.emitir()

      const primeira = contadores.snapshot()
      expect(primeira).toEqual({ scrollsN: 2, idbTxN: 0, queriesN: 1 })

      // Janela seguinte, nada acionado: `null`, e não um objeto de zeros.
      expect(contadores.snapshot()).toBeNull()
      alvo.remove()
    } finally {
      desinstalar()
    }
  })

  it('para de contar depois de desinstalar — a medição não vaza para fora da janela', () => {
    const cache = fakeCache()
    const contadores = createActivityCounters()
    contadores.install(cache)()

    document.dispatchEvent(new Event('scroll'))
    cache.emitir()
    expect(contadores.snapshot()).toBeNull()
  })

  it('devolve o `IDBDatabase.prototype.transaction` original ao desinstalar', () => {
    // O contador de transações é um remendo no protótipo; deixá-lo instalado contaminaria todo o resto da sessão.
    class FakeIDB {
      transaction() {
        return 'original'
      }
    }
    vi.stubGlobal('IDBDatabase', FakeIDB)
    const antes = FakeIDB.prototype.transaction

    const contadores = createActivityCounters()
    const desinstalar = contadores.install()
    expect(FakeIDB.prototype.transaction).not.toBe(antes)
    expect(new FakeIDB().transaction()).toBe('original') // o remendo delega, não substitui o comportamento
    expect(contadores.snapshot()).toEqual({ scrollsN: 0, idbTxN: 1, queriesN: 0 })

    desinstalar()
    expect(FakeIDB.prototype.transaction).toBe(antes)
  })

  it('funciona sem cache de consultas (argumento opcional)', () => {
    const contadores = createActivityCounters()
    const desinstalar = contadores.install()
    try {
      document.dispatchEvent(new Event('scroll'))
      expect(contadores.snapshot()).toEqual({ scrollsN: 1, idbTxN: 0, queriesN: 0 })
    } finally {
      desinstalar()
    }
  })
})
