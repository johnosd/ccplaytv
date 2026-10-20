/**
 * Tipos do bloco de uma categoria (feature 039), agora com o formato comprimido em pedaços da feature 082
 * (`sdd/specs/082-orcamento-armazenamento-tv/data-model.md`). Saíram de `db.ts` porque ele está no teto de linhas da
 * catraca; `db.ts` reexporta tudo, então quem importa de lá não muda.
 */
import type { CatalogRecord, CategoryKind } from './db'

/**
 * Um item dentro de um bloco de categoria (feature 039) — o `CatalogRecord`
 * sem o que o bloco já diz (fonte, geração, tipo, categoria, posição), com
 * `id` **negativo** estável (`categoryBlocks.ts`, `blockItemId`).
 */
export type BlockItem = Omit<
  CatalogRecord,
  'id' | 'sourceId' | 'generation' | 'kind' | 'groupOrder' | 'categoryId' | 'categoryPosition'
> & { id: number }

/** Campos iguais para todos os itens do bloco, gravados uma vez no formato comprimido (082). */
export interface BlockShared {
  group?: string
  providerCategoryId?: string
}

/**
 * Os itens de uma categoria (feature 039, `data-model.md`). Chave: o id local da categoria. Substituído inteiro a cada
 * obtenção.
 *
 * Dois formatos (feature 082):
 * - **antigo** (sem `format`): `items` tem todos os itens, na ordem da fonte;
 * - **`format: 2`**: este registro é só o cabeçalho; os itens estão comprimidos em `categoryChunks`
 *   (`chunkTables.ts`) e são lidos por `readBlockChunks` (`blockChunks.ts`) — nunca por `items`.
 */
export interface CategoryBlockRecord {
  categoryId: number
  sourceId: string
  generation: number
  kind: CategoryKind
  /** = `categories.order` (imutável — chave dos itens, D-005 da 038). */
  groupOrder: number
  /** Formato antigo: na ordem da fonte. Ausente no `format: 2`. */
  items?: BlockItem[]
  format?: 2
  shared?: BlockShared
  /** Itens gravados (formato 2). */
  count?: number
  /** Pedaços de itens (sem contar o índice de identidade). */
  chunkCount?: number
  /** Bytes gravados: pedaços + índice (conta própria, `storageLedger.ts`). */
  storedBytes?: number
  /** Troca a cada gravação — concorrência otimista da gravação em 2 fases (`blockChunks.ts`). */
  revision?: string
}
