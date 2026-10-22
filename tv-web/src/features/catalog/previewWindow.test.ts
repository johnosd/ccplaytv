import { describe, expect, it } from 'vitest'
import { montarPreviews, previewsFaltando, type CachedState } from './previewWindow'

const AGORA = 1_000_000
const STALE = 10_000

function estado(parcial: Partial<CachedState<string>>): CachedState<string> {
  return { data: 'ok', isInvalidated: false, dataUpdatedAt: AGORA, ...parcial }
}

describe('previewsFaltando (089, R-012)', () => {
  it('busca só o que não tem dado — é isso que corta os eventos de cache por tecla', () => {
    const cache = new Map<number, CachedState<string>>([
      [1, estado({})],
      [3, estado({})],
    ])
    expect(previewsFaltando([1, 2, 3, 4], (id) => cache.get(id), AGORA, STALE)).toEqual([2, 4])
  })

  it('invalidado conta como faltando, mesmo com dado no cache', () => {
    // A pré-carga (feature 038) chama `invalidateQueries` quando a categoria chega: o dado CONTINUA no cache, só deixa
    // de valer. Tratar só `data === undefined` faria a prévia parar de acompanhar a pré-carga — regressão silenciosa.
    const cache = new Map([[1, estado({ isInvalidated: true })]])
    expect(previewsFaltando([1], (id) => cache.get(id), AGORA, STALE)).toEqual([1])
  })

  it('dado mais velho que a janela de frescor conta como faltando; dentro dela, não', () => {
    const velho = new Map([[1, estado({ dataUpdatedAt: AGORA - STALE - 1 })]])
    const fresco = new Map([[1, estado({ dataUpdatedAt: AGORA - STALE + 1 })]])
    expect(previewsFaltando([1], (id) => velho.get(id), AGORA, STALE)).toEqual([1])
    expect(previewsFaltando([1], (id) => fresco.get(id), AGORA, STALE)).toEqual([])
  })

  it('lista vazia não busca nada', () => {
    expect(previewsFaltando([], () => undefined, AGORA, STALE)).toEqual([])
  })
})

describe('montarPreviews (089)', () => {
  it('monta na ordem dos ids e deixa FORA quem não tem dado', () => {
    // Constitution "Progresso e Capacidades São Reais": id sem dado fica ausente do mapa, nunca entra com um valor
    // inventado — quem lê trata a ausência como "categoria ainda não obtida".
    const cache = new Map([[2, 'b'], [4, 'd']])
    const mapa = montarPreviews([1, 2, 3, 4], (id) => cache.get(id))

    expect([...mapa.entries()]).toEqual([[2, 'b'], [4, 'd']])
    expect(mapa.has(1)).toBe(false)
  })

  it('sem nenhum dado devolve mapa vazio, não nulo', () => {
    expect(montarPreviews([1, 2], () => undefined).size).toBe(0)
  })
})
