/**
 * Montagem das fileiras calculadas a partir dos candidatos guardados (feature 086, `logic/selecoes-guardadas.md` §2 e §4).
 *
 * É o que a tela chama no lugar da varredura do tipo inteiro. Lê as linhas de candidatos (dezenas), filtra categoria
 * escondida/travada na LEITURA e mescla com os mesmos acumuladores de hoje — o resultado é idêntico ao da varredura.
 * **Nunca** toca a rede e **nunca** lê blocos do catálogo.
 *
 * STUB do `sdd-plan` — corpo a implementar no `sdd-execute`.
 */

import type { CatalogDb } from './db'
import type { ShowcaseCandidateItem } from './showcaseCandidates'

export type ExternalRowKey = 'top10' | 'tip' | 'because'

export interface ShowcaseExternalRow {
  /** `${sourceId}|${kind}|${row}` */
  id: string
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  row: ExternalRowKey
  /** Período a que o resultado pertence (semana do Top 10, dia da Dica, semente do Porque você assistiu). */
  periodKey: string
  items: ShowcaseCandidateItem[]
  computedAt: number
}

export interface ShowcaseRows {
  recent: ShowcaseCandidateItem[]
  rated: ShowcaseCandidateItem[]
  /** Categorias visíveis já obtidas, para o aviso de cobertura parcial (FR-006). */
  coveredCategories: number
  totalCategories: number
}

export interface BuildShowcaseRowsOptions {
  database?: CatalogDb
  /** Instante da montagem — define a semente diária de "Bem avaliados". */
  now?: number
}

/**
 * Monta "Adicionados recentemente" e "Bem avaliados" da geração ativa. O resultado é igual ao da varredura do tipo
 * inteiro para o mesmo catálogo (contrato C1).
 */
export function buildShowcaseRowsFromCandidates(
  _sourceId: string,
  _kind: 'movie' | 'series',
  _options?: BuildShowcaseRowsOptions,
): Promise<ShowcaseRows> {
  throw new Error('not implemented')
}

/**
 * Fileira que depende de serviço externo, como foi guardada. Devolve `undefined` quando não há resultado guardado —
 * a fileira simplesmente não existe, e a montagem NUNCA dispara a consulta nem espera por ela (FR-013).
 */
export function readExternalRow(
  _sourceId: string,
  _kind: 'movie' | 'series',
  _row: ExternalRowKey,
  _database?: CatalogDb,
): Promise<ShowcaseExternalRow | undefined> {
  throw new Error('not implemented')
}

/** Guarda o resultado do casamento com o serviço externo. Roda fora da abertura da tela (FR-014). */
export function writeExternalRow(_row: ShowcaseExternalRow, _database?: CatalogDb): Promise<void> {
  throw new Error('not implemented')
}
