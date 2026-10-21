/** Tipos das fileiras guardadas (feature 086). Fora de `db.ts` para não engordar o schema (ratchet de linhas). */

import type { CatalogReadItem } from './readProjectionTypes'

/**
 * Feature 086: os poucos itens de UMA categoria que podem entrar nas fileiras calculadas, escolhidos por quem grava a
 * categoria. Derivado puro do catálogo — apagar e recalcular não perde nada da pessoa.
 */
export interface ShowcaseCandidatesRecord {
  categoryId: number
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  /** Ordem da categoria na fonte: define o desempate da mesclagem. */
  order: number
  recent: CatalogReadItem[]
  rated: CatalogReadItem[]
  /** Títulos elegíveis para "Bem avaliados" nesta categoria (sem dedupe entre categorias). */
  eligibleCount: number
  itemsCount: number
}

/** Feature 086: fileira que depende de serviço externo, já casada com o catálogo, com o período a que pertence. */
export interface ShowcaseExternalRowRecord {
  /** `${sourceId}|${kind}|${row}` */
  id: string
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  row: 'top10' | 'tip' | 'because'
  periodKey: string
  items: CatalogReadItem[]
  computedAt: number
  /**
   * Feature 087: guardados junto porque vêm do mesmo casamento, e a tela não pode consultar o serviço externo para
   * obtê-los depois. Pares em array (não `Map`): o registro atravessa o clone estruturado do IndexedDB.
   * Campos novos **não indexados** — não exigem subir a versão do schema.
   */
  ranks?: number[]
  backdrops?: Array<[string, string]>
  ratings?: Array<[string, { average: number; votes: number }]>
  coveredCategories?: number
  totalCategories?: number
}
