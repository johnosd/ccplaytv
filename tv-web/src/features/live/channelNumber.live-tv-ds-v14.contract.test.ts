/**
 * Teste de CONTRATO da feature 024 — travado em
 * `sdd/specs/024-live-tv-ds-v14/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo. Regra: `logic/numero-do-canal.md`.
 */
import { describe, expect, it } from 'vitest'
import { channelNumberOf } from './channelNumber'
import type { CatalogCategory } from '../catalog/catalogApi'

function cat(id: number, order: number, extra: Partial<CatalogCategory>): CatalogCategory {
  return { id, kind: 'channel', name: `Cat ${id}`, order, count: 0, fetchMode: 'on_demand', ...extra }
}

describe('channelNumberOf — contrato da feature 024', () => {
  // FR-030, FR-031, SC-005, US4/AC3-AC4, Constitution: "Progresso e Capacidades São Reais" (nunca inventar número)
  it('deriva o número da ordem da fonte, igual em qualquer entrada, e some quando não é derivável', () => {
    // M3U guardada (`stored`): contagem de toda categoria é conhecida desde a importação.
    const stored = [
      cat(1, 0, { fetchMode: 'stored', declaredCount: 3 }),
      cat(2, 1, { fetchMode: 'stored', declaredCount: 2 }),
    ]
    expect(channelNumberOf({ category_id: 1, category_position: 0 }, stored)).toBe('001')
    expect(channelNumberOf({ category_id: 2, category_position: 1 }, stored)).toBe('005')
    // A ordem declarada manda, não a ordem do array recebido.
    expect(channelNumberOf({ category_id: 2, category_position: 0 }, [...stored].reverse())).toBe('004')

    // Provedor sob demanda: categoria anterior nunca lida = contagem desconhecida = sem número.
    const onDemand = [
      cat(10, 0, { count: 4, itemsFetchedAt: 1 }),
      cat(11, 1, { count: 0 }),
      cat(12, 2, { count: 2, itemsFetchedAt: 1 }),
    ]
    expect(channelNumberOf({ category_id: 10, category_position: 2 }, onDemand)).toBe('003')
    expect(channelNumberOf({ category_id: 12, category_position: 0 }, onDemand)).toBeNull()

    // Número declarado pelo painel vence o cálculo; mais de 3 dígitos não é cortado.
    expect(channelNumberOf({ category_id: 12, category_position: 0, source_number: 7 }, onDemand)).toBe('007')
    expect(channelNumberOf({ category_id: 10, category_position: 0, source_number: 1234 }, onDemand)).toBe('1234')

    // Registro sem posição (gravado antes desta feature) ou de categoria desconhecida: sem número.
    expect(channelNumberOf({ category_id: 1, category_position: null }, stored)).toBeNull()
    expect(channelNumberOf({ category_id: 99, category_position: 0 }, stored)).toBeNull()
  })
})
