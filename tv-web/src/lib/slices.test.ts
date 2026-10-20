import { describe, expect, it } from 'vitest'
import { createSliceClock, forEachInSlices, mapInSlices, stableSortInSlices } from './slices'

const noYield = async () => {}

interface Row {
  key: number
  position: number
}

// Muitos empates: a chave só tem 7 valores, então a ordem dos empates (posição) é o que diferencia as ordenações.
function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, position) => ({ key: (position * 7919) % 7, position }))
}

const byKey = (a: Row, b: Row) => a.key - b.key

describe('stableSortInSlices', () => {
  it.each([0, 1, 31, 32, 33, 64, 65, 5_000])('dá o mesmo resultado de sort nativo com %i itens e muitos empates', async (count) => {
    const items = rows(count)
    const copy = items.slice()
    const sorted = await stableSortInSlices(items, byKey, createSliceClock({ yieldToMain: noYield }))
    expect(sorted).toEqual([...items].sort(byKey))
    expect(items).toEqual(copy) // não muta a entrada
  })

  it('mantém a ordem da fonte entre ausentes e empates com comparador que devolve 0', async () => {
    const items = rows(200)
    const sorted = await stableSortInSlices(items, () => 0, createSliceClock({ yieldToMain: noYield }))
    expect(sorted.map((row) => row.position)).toEqual(items.map((row) => row.position))
  })

  it('cede a vez entre as fatias', async () => {
    let yields = 0
    await stableSortInSlices(rows(5_000), byKey, createSliceClock({ yieldToMain: async () => { yields += 1 } }))
    expect(yields).toBeGreaterThan(0)
  })

  it('aborta com AbortError no meio, sem ceder de novo', async () => {
    const controller = new AbortController()
    let yields = 0
    const sorting = stableSortInSlices(rows(5_000), byKey, createSliceClock({
      signal: controller.signal,
      yieldToMain: async () => {
        yields += 1
        controller.abort()
      },
    }))
    await expect(sorting).rejects.toMatchObject({ name: 'AbortError' })
    expect(yields).toBe(1)
  })
})

describe('mapInSlices / forEachInSlices', () => {
  it('mapInSlices preserva a ordem e não muta a entrada', async () => {
    const items = Array.from({ length: 1_000 }, (_, index) => index)
    const copy = items.slice()
    const doubled = await mapInSlices(items, (value) => value * 2, createSliceClock({ yieldToMain: noYield, budgetMs: 0 }))
    expect(doubled).toEqual(items.map((value) => value * 2))
    expect(items).toEqual(copy)
  })

  it('com orçamento zero cede a cada conferência; com orçamento folgado não cede', async () => {
    const items = Array.from({ length: 1_000 }, (_, index) => index)
    let tight = 0
    await forEachInSlices(items, () => {}, createSliceClock({ yieldToMain: async () => { tight += 1 }, budgetMs: 0 }))
    expect(tight).toBe(3) // 1 000 itens, uma conferência a cada 256
    let loose = 0
    await forEachInSlices(items, () => {}, createSliceClock({ yieldToMain: async () => { loose += 1 }, budgetMs: 60_000 }))
    expect(loose).toBe(0)
  })

  it('mapInSlices rejeita com AbortError quando o sinal já foi abortado', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(mapInSlices([1, 2, 3], (value) => value, createSliceClock({ signal: controller.signal, yieldToMain: noYield })))
      .rejects.toMatchObject({ name: 'AbortError' })
  })
})
