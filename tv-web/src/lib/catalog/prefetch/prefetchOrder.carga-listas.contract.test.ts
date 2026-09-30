import { describe, expect, it } from 'vitest'
import { pickNextCategory, type PrefetchCategoryState, type PrefetchHint } from './prefetchOrder'

const NOW = 10 * 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

function cat(id: number, kind: PrefetchCategoryState['kind'], order: number, extra: Partial<PrefetchCategoryState> = {}) {
  return { id, kind, order, fetchMode: 'on_demand', ...extra } satisfies PrefetchCategoryState
}

/** Chama `pickNextCategory` até esgotar, marcando cada escolhida como obtida agora. */
function drain(categories: PrefetchCategoryState[], hint: PrefetchHint | undefined, attempts: Map<number, number>) {
  const state = categories.map((category) => ({ ...category }))
  const picked: number[] = []
  for (let guard = 0; guard < 50; guard += 1) {
    const next = pickNextCategory({ categories: state, hint, attempts, now: NOW })
    if (next === undefined) break
    picked.push(next)
    const chosen = state.find((category) => category.id === next)!
    chosen.itemsFetchedAt = NOW
    chosen.renewRequestedAt = undefined
  }
  return picked
}

describe('Ordem da pré-carga — contrato da feature 038', () => {
  // FR-005 (focada → vizinhas → resto da seção → Canais → Filmes → Séries), FR-007 (falha vai para o fim,
  // limite de tentativas), US1-AC4; frias antes de renovação dentro do mesmo nível; eager e frescas nunca.
  it('prioriza a focada e as vizinhas, depois o resto da seção, depois as outras seções; falhas no fim', () => {
    const categories: PrefetchCategoryState[] = [
      cat(1, 'channel', 0),
      cat(2, 'channel', 1, { itemsFetchedAt: NOW - HOUR }), // fresca: nunca
      cat(3, 'channel', 2, { itemsFetchedAt: NOW - 25 * HOUR }), // vencida: renovação
      cat(10, 'movie', 0),
      cat(11, 'movie', 1),
      cat(12, 'movie', 2, { itemsFetchedAt: NOW - HOUR, renewRequestedAt: NOW - 1000 }), // renovação pedida
      cat(13, 'movie', 3),
      cat(14, 'movie', 4),
      cat(15, 'movie', 5),
      cat(16, 'movie', 6),
      cat(17, 'movie', 7),
      cat(18, 'movie', 8),
      cat(20, 'series', 0),
      cat(21, 'series', 1, { fetchMode: 'eager' }), // eager: nunca
      cat(22, 'series', 2),
    ]
    const attempts = new Map<number, number>([
      [1, 1], // falhou uma vez: vai para o fim
      [22, 3], // esgotou as tentativas desta sessão: nunca
    ])

    const picked = drain(categories, { kind: 'movie', focusedCategoryId: 14 }, attempts)

    expect(picked).toEqual([
      14, // a focada
      15, 13, 16, 17, 11, 12, // vizinhas (raio 3) por distância, depois a de baixo antes da de cima; 12 é renovação e vai por último no nível
      10, 18, // resto da seção de Filmes, na ordem da fonte
      3, // Canais (1 falhou, 2 fresca)
      20, // Séries (21 eager, 22 esgotada)
      1, // a que falhou antes, no fim
    ])
  })
})
