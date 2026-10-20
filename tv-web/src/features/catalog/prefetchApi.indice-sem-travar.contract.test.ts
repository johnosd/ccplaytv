/**
 * Teste de CONTRATO da feature 084 (remontagem do índice limitada durante a pré-carga) — travado em
 * `sdd/specs/084-indice-busca-sem-travar/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { createPrefetchInvalidator } from './prefetchApi'

afterEach(() => vi.useRealTimers())

// FR-006 + SC-003 (US3/AC1-AC2): com a tela aberta, lotes a cada segundo remontam o índice no máximo uma vez por janela;
// a primeira remontagem é imediata e a última categoria chegada entra no fim da janela.
it('FR-006: lotes seguidos remontam índice e busca global no máximo 1× a cada janela, com a última chegada incluída', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const indexFetch = vi.fn(async () => ({ entries: [] }))
  const globalFetch = vi.fn(async () => ({}))
  client.setQueryData(['catalog-search-index', 'fonte', 'movie'], { entries: [] })
  client.setQueryData(['global-search-index', 'fonte'], {})
  const unsubs = [
    new QueryObserver(client, { queryKey: ['catalog-search-index', 'fonte', 'movie'], queryFn: indexFetch, staleTime: Infinity }).subscribe(() => {}),
    new QueryObserver(client, { queryKey: ['global-search-index', 'fonte'], queryFn: globalFetch, staleTime: Infinity }).subscribe(() => {}),
  ]
  const invalidator = createPrefetchInvalidator(client, 10, 1_000)
  try {
    // 5 lotes em ~500 ms (um a cada ~100 ms), todos dentro da mesma janela de 1 000 ms.
    for (let batch = 0; batch < 5; batch += 1) {
      invalidator.categoryDone('fonte', 100 + batch, 'movie')
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(indexFetch).toHaveBeenCalledTimes(1) // o 1º lote remonta na hora
    expect(globalFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(600) // fecha a janela: uma remontagem só, com o que chegou depois
    expect(indexFetch).toHaveBeenCalledTimes(2)
    expect(globalFetch).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_000) // nada novo chegou: nada mais é remontado
    expect(indexFetch).toHaveBeenCalledTimes(2)
    expect(globalFetch).toHaveBeenCalledTimes(2)
  } finally {
    invalidator.dispose()
    for (const unsubscribe of unsubs) unsubscribe()
    client.clear()
  }
})
