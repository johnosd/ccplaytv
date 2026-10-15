/**
 * Teste de CONTRATO da feature 053 — foco da tela hero com fileiras dinâmicas: memória por fileira, por id, e
 * reconciliação sem perder o foco. Travado em `sdd/specs/053-carrosseis-filmes-series/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import {
  focusedEntryId,
  initialShowcaseFocus,
  moveShowcaseHorizontal,
  moveShowcaseVertical,
  reconcileShowcaseFocus,
  type EntryIdsOf,
  type FocusRow,
  type ShowcaseFocusState,
} from './vodShowcaseFocus'

const ROWS: FocusRow[] = [
  { key: 'continue', kind: 'items' },
  { key: 'top10', kind: 'slot' },
  { key: 'favorites', kind: 'items' },
  { key: 'cat:A', kind: 'category' },
  { key: 'cat:B', kind: 'category' },
]

function idsFor(overrides: Record<string, string[]> = {}): EntryIdsOf {
  const base: Record<string, string[]> = {
    continue: ['c1', 'c2', '__see-all__'],
    top10: ['slot'],
    favorites: ['f1', '__see-all__'],
    'cat:A': ['a1', 'a2', 'a3', '__see-all__'],
    'cat:B': ['__see-all__'], // ainda não obtida: só o "Ver tudo"
  }
  const merged = { ...base, ...overrides }
  return (rowKey) => merged[rowKey] ?? []
}

function must<T>(value: T | null | 'top'): T {
  expect(value).not.toBeNull()
  expect(value).not.toBe('top')
  return value as T
}

describe('foco da tela hero — contrato da feature 053', () => {
  // FR-011, FR-012, FR-013, Constitution: "Foco Visível e Sem Becos Sem Saída" + "Voltar Restaura Foco e Posição"
  it('lembra o cartão por fileira (por id), atravessa slots, sobe à topbar e nunca perde o foco ao reconciliar', () => {
    const ids = idsFor()

    // Foco inicial: 1ª fileira com cartão real — o slot (sem dado) nunca é a entrada.
    let state = must(initialShowcaseFocus(ROWS, ids))
    expect([state.rowKey, focusedEntryId(state, ids)]).toEqual(['continue', 'c1'])
    expect(initialShowcaseFocus(ROWS.slice(1, 2), ids)).toBeNull() // só um slot → lista lateral
    expect(initialShowcaseFocus(ROWS.slice(3), idsFor({ 'cat:A': ['__see-all__'] }))).toBeNull() // categorias pendentes → lista lateral

    // → anda dentro da fileira; ← na borda devolve null (a tela decide ir à lista lateral).
    state = must(moveShowcaseHorizontal(state, ids, 'right'))
    expect(focusedEntryId(state, ids)).toBe('c2')
    expect(moveShowcaseHorizontal(must(initialShowcaseFocus(ROWS, ids)), ids, 'left')).toBeNull()

    // ↓ atravessa o slot "Em breve" (focável) até Favoritos; cada fileira lembra o seu cartão.
    state = must(moveShowcaseVertical(state, ROWS, ids, 'down'))
    expect([state.rowKey, focusedEntryId(state, ids)]).toEqual(['top10', 'slot'])
    state = must(moveShowcaseVertical(state, ROWS, ids, 'down'))
    expect([state.rowKey, focusedEntryId(state, ids)]).toEqual(['favorites', 'f1'])
    state = must(moveShowcaseHorizontal(state, ids, 'right')) // → "Ver tudo"
    state = must(moveShowcaseVertical(state, ROWS, ids, 'up'))
    state = must(moveShowcaseVertical(state, ROWS, ids, 'up'))
    expect([state.rowKey, focusedEntryId(state, ids)]).toEqual(['continue', 'c2']) // voltou ao c2, não ao 1º
    state = must(moveShowcaseVertical(state, ROWS, ids, 'down'))
    state = must(moveShowcaseVertical(state, ROWS, ids, 'down'))
    expect(focusedEntryId(state, ids)).toBe('__see-all__') // Favoritos lembrou o "Ver tudo"

    // Extremos: ↑ da 1ª fileira sobe à topbar; ↓ da última não faz nada.
    expect(moveShowcaseVertical(must(initialShowcaseFocus(ROWS, ids)), ROWS, ids, 'up')).toBe('top')
    const last: ShowcaseFocusState = { rowKey: 'cat:B', memory: {} }
    expect(moveShowcaseVertical(last, ROWS, ids, 'down')).toBeNull()
    expect(focusedEntryId(last, ids)).toBe('__see-all__') // fileira nunca visitada → 1º cartão

    // Reconciliar por id: o c2 saiu do histórico → cai num vizinho da MESMA fileira.
    const onC2: ShowcaseFocusState = must(moveShowcaseHorizontal(must(initialShowcaseFocus(ROWS, ids)), ids, 'right'))
    const afterRemoval = idsFor({ continue: ['c1', '__see-all__'] })
    const reconciled = must(reconcileShowcaseFocus(onC2, ROWS, afterRemoval))
    expect(reconciled.rowKey).toBe('continue')
    expect(['c1', '__see-all__']).toContain(focusedEntryId(reconciled, afterRemoval))

    // A fileira focada deixou de existir (histórico esvaziou): o foco vai a outra fileira elegível, nunca some.
    const withoutContinue = ROWS.filter((row) => row.key !== 'continue')
    const moved = must(reconcileShowcaseFocus(onC2, withoutContinue, idsFor({ continue: [] })))
    expect(moved.rowKey).toBe('favorites')
    // Sem nenhuma fileira elegível: null (a tela manda o foco à lista lateral).
    expect(reconcileShowcaseFocus(onC2, [{ key: 'top10', kind: 'slot' }], idsFor())).toBeNull()

    // Restaurar ao voltar (por id): fileira e cartão de antes; id que sumiu → vizinho da mesma fileira.
    const restored = must(initialShowcaseFocus(ROWS, ids, { row: 'cat:A', id: 'a2' }))
    expect([restored.rowKey, focusedEntryId(restored, ids)]).toEqual(['cat:A', 'a2'])
    const gone = must(initialShowcaseFocus(ROWS, ids, { row: 'cat:A', id: 'a-sumiu' }))
    expect(gone.rowKey).toBe('cat:A')
    expect(ids('cat:A')).toContain(focusedEntryId(gone, ids))
  })
})
