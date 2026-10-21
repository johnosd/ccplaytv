/**
 * Produção das fileiras que dependem de serviço externo — Top 10 e Dica (feature 087).
 *
 * **STUB criado pelo `sdd-plan`**: as assinaturas e o contrato estão fixados; o corpo é do `sdd-execute`.
 * O desenho completo (ordem obrigatória dos passos, o porquê de cada parada antecipada, a semente da Dica e o período)
 * está em `sdd/specs/087-top10-dica-segundo-plano/logic/producao-em-segundo-plano.md` §4.
 */

import type { CatalogDb } from './db'
import type { AppLanguage } from '../i18n/languages'

export interface RefreshExternalRowOptions {
  database?: CatalogDb
  now?: number
  signal?: AbortSignal
  /** Idioma das consultas ao TMDB, como a tela passava. */
  language?: AppLanguage
}

/**
 * Refaz **uma** fileira externa, se o período dela ainda não estiver guardado.
 *
 * @returns `true` se fez trabalho; `false` quando já estava em dia ou não havia como produzir.
 */
export async function refreshExternalRow(
  _sourceId: string,
  _kind: 'movie' | 'series',
  _row: 'top10' | 'tip',
  _options: RefreshExternalRowOptions = {},
): Promise<boolean> {
  throw new Error('not implemented')
}

/** Refaz a primeira fileira que estiver fora do período — uma por rodada da fila de segundo plano. */
export async function refreshStaleExternalRows(
  _sourceId: string,
  _options: RefreshExternalRowOptions = {},
): Promise<boolean> {
  throw new Error('not implemented')
}
