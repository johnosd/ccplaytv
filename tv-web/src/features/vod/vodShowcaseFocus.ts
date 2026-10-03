import { SEE_ALL_ID, type ShowcaseRowKind } from './vodShowcaseRows'

/**
 * Foco da tela hero de Filmes/Séries com fileiras dinâmicas (feature 053). Funções puras: o estado guarda, por
 * fileira, o id focado por último (e o índice, só para reconciliar quando o id some). Regras em
 * `logic/carrosseis-e-foco.md` §2. A lista lateral de categorias NÃO é uma fileira aqui: `null` = "foco na lista lateral".
 */

export interface RowMemory {
  id: string
  /** Índice no instante em que o id foi focado — só serve para cair num vizinho se o id sumir. */
  index: number
}

export interface ShowcaseFocusState {
  rowKey: string
  memory: Readonly<Record<string, RowMemory>>
}

export interface FocusRow {
  key: string
  kind: ShowcaseRowKind
}

/** Ids dos cartões focáveis de uma fileira, em ordem (último = "Ver tudo", quando existir). */
export type EntryIdsOf = (rowKey: string) => readonly string[]

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(0, length - 1))
}

/** Elegível para o foco inicial: tem ao menos um item real (o "Ver tudo" e o slot não contam). */
function isEligible(row: FocusRow, ids: readonly string[]): boolean {
  if (row.kind === 'slot') return false
  return ids.some((id) => id !== SEE_ALL_ID)
}

function firstEligible(rows: readonly FocusRow[], entryIdsOf: EntryIdsOf): FocusRow | undefined {
  return rows.find((row) => isEligible(row, entryIdsOf(row.key)))
}

/** Índice do cartão focado na fileira, já reconciliado com os ids atuais (id sumiu → índice lembrado, clampado). */
function currentIndex(state: ShowcaseFocusState, rowKey: string, ids: readonly string[]): number {
  const memory = state.memory[rowKey]
  if (!memory) return 0
  const found = ids.indexOf(memory.id)
  return found >= 0 ? found : clampIndex(memory.index, ids.length)
}

function withMemory(state: ShowcaseFocusState, rowKey: string, ids: readonly string[], index: number): ShowcaseFocusState {
  return { rowKey, memory: { ...state.memory, [rowKey]: { id: ids[index], index } } }
}

export function initialShowcaseFocus(
  rows: readonly FocusRow[],
  entryIdsOf: EntryIdsOf,
  restore?: { row: string; id: string },
): ShowcaseFocusState | null {
  const empty: ShowcaseFocusState = { rowKey: '', memory: {} }
  if (restore) {
    const row = rows.find((candidate) => candidate.key === restore.row)
    const ids = row ? entryIdsOf(row.key) : []
    if (row && ids.length > 0) {
      const found = ids.indexOf(restore.id)
      // Id que sumiu: cai no 1º cartão da MESMA fileira (nunca perde o foco).
      return withMemory(empty, row.key, ids, found >= 0 ? found : 0)
    }
  }
  const first = firstEligible(rows, entryIdsOf)
  if (!first) return null
  return withMemory(empty, first.key, entryIdsOf(first.key), 0)
}

export function moveShowcaseVertical(
  state: ShowcaseFocusState,
  rows: readonly FocusRow[],
  entryIdsOf: EntryIdsOf,
  direction: 'up' | 'down',
): ShowcaseFocusState | 'top' | null {
  const at = rows.findIndex((row) => row.key === state.rowKey)
  if (at < 0) return null
  const step = direction === 'up' ? -1 : 1
  for (let i = at + step; i >= 0 && i < rows.length; i += step) {
    const ids = entryIdsOf(rows[i].key)
    if (ids.length === 0) continue
    return withMemory(state, rows[i].key, ids, currentIndex(state, rows[i].key, ids))
  }
  return direction === 'up' ? 'top' : null
}

export function moveShowcaseHorizontal(
  state: ShowcaseFocusState,
  entryIdsOf: EntryIdsOf,
  direction: 'left' | 'right',
): ShowcaseFocusState | null {
  const ids = entryIdsOf(state.rowKey)
  if (ids.length === 0) return null
  const next = currentIndex(state, state.rowKey, ids) + (direction === 'left' ? -1 : 1)
  if (next < 0 || next >= ids.length) return null
  return withMemory(state, state.rowKey, ids, next)
}

export function reconcileShowcaseFocus(
  state: ShowcaseFocusState,
  rows: readonly FocusRow[],
  entryIdsOf: EntryIdsOf,
): ShowcaseFocusState | null {
  const row = rows.find((candidate) => candidate.key === state.rowKey)
  const ids = row ? entryIdsOf(row.key) : []
  if (row && ids.length > 0) return withMemory(state, row.key, ids, currentIndex(state, row.key, ids))
  const first = firstEligible(rows, entryIdsOf)
  if (!first) return null
  return withMemory(state, first.key, entryIdsOf(first.key), currentIndex(state, first.key, entryIdsOf(first.key)))
}

export function focusedEntryId(state: ShowcaseFocusState, entryIdsOf: EntryIdsOf): string | null {
  const ids = entryIdsOf(state.rowKey)
  if (ids.length === 0) return null
  return ids[currentIndex(state, state.rowKey, ids)]
}