import type { CatalogCategory } from '../../../lib/catalog/catalogRepository'
import type { CategoryKind } from '../../../lib/catalog/db'
import { categoryMatchKey } from '../../../lib/catalog/structureDiff'

/** Seções da gestão, na ordem da tela (FR-002). */
export const PARENTAL_SECTIONS: CategoryKind[] = ['channel', 'movie', 'series']

/** Uma categoria como a gestão a mostra: estado salvo, inclusive escondida. */
export type ManagedCategory = CatalogCategory & { hidden: boolean; locked: boolean; suggested: boolean }

/** Identidade da linha — a mesma da preferência (D-002), nunca o id local nem o índice. */
export const managedKeyOf = (category: Pick<CatalogCategory, 'providerCategoryId' | 'name'>): string =>
  categoryMatchKey(category.providerCategoryId, category.name)

export type ParentalControlAction = 'enable' | 'change' | 'disable'

/**
 * Ações da linha de controle: a 1ª é o interruptor (desligado → ligar; ligado → desligar, com o PIN); ligado, ao lado,
 * "Trocar PIN" (FR-017, FR-019). Pedido do usuário na TV (2026-10-10): interruptor com o estado, não dois botões.
 */
export const controlActions = (pinActive: boolean): ParentalControlAction[] => (pinActive ? ['disable', 'change'] : ['enable'])

/** Onde está o foco dentro da aba. Na categoria, `col` 0 = Visível/Escondida, 1 = Livre/Bloqueada. */
export type ParentalFocus =
  | { row: 'gate' }
  | { row: 'control'; col: number }
  | { row: 'sections'; col: number }
  | { row: 'category'; key: string; col: number }
  | { row: 'retry' }

export function sameParentalFocus(a: ParentalFocus | undefined, b: ParentalFocus): boolean {
  if (a === undefined || a.row !== b.row) return false
  if (a.row === 'category' && b.row === 'category') return a.key === b.key && a.col === b.col
  if ((a.row === 'sections' || a.row === 'control') && (b.row === 'sections' || b.row === 'control')) return a.col === b.col
  return true
}
