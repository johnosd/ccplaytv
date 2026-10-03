import type { VodSortOption } from './vodSort'
import type { ShowcaseRowKey } from './vodShowcaseRows'

/**
 * Tipos da vitrine de Filmes/Séries e da tela de categoria (feature 052). Identidade sempre por nome declarado
 * pela fonte / id de item — nunca índice (constitution, "Voltar Restaura Foco e Posição").
 */

/** O que a tela de categoria abre. `all` pode vir com ordenação inicial ("Ver tudo" de Adicionados recentemente) ou a pesquisa feita na vitrine (query, ≥ 3 letras, sobre o tipo inteiro). */
export type VodTarget =
  | { kind: 'favorites' }
  | { kind: 'history' }
  | { kind: 'all'; sort?: VodSortOption }
  | { kind: 'category'; name: string }

/** Chave da fileira da tela hero (feature 053): as fileiras dinâmicas + 'categories' = a lista lateral. */
export type VodShowcaseRow = ShowcaseRowKey | 'categories'

/** Onde estava o foco da vitrine — opaco para o `App`: ele guarda o que a tela entrega e devolve em `restore`. */
export interface VodShowcaseFocus {
  row: VodShowcaseRow
  id: string
}

/** Estado da tela de categoria no instante em que um item foi aberto — devolvido em `restore` ao voltar do detalhe. */
export interface VodCategoryRestore {
  focusedItemId: string | null
  searchTerm: string
  searchActive: boolean
  /** Dica de vizinho para quando o card de origem não existir mais; NUNCA identidade. */
  focusedIndexHint?: number
}

/** estore de movies/series no AppScreen pode ainda ser o shape antigo (contrato 023): só este é da vitrine. */
export function isShowcaseFocus(value: unknown): value is VodShowcaseFocus {
  return typeof value === 'object' && value !== null && 'row' in value && 'id' in value
}


