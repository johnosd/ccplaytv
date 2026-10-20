/**
 * Lógica pura de seleção das fileiras calculadas (feature 086).
 *
 * **Movida** de `features/vod/vodShowcase.ts` e `features/vod/ratedSelection.ts`: `lib/` não pode importar de `features/`
 * (ratchet `lib-to-ui`), e a montagem por candidatos (`showcaseRows.ts`) precisa exatamente destes acumuladores — são eles
 * que garantem que o resultado continue idêntico ao de hoje (`logic/selecoes-guardadas.md` §2).
 *
 * Os arquivos de `features/vod/` passam a **reexportar** daqui, para os contratos travados das features 052, 056 e 065
 * continuarem importando dos mesmos caminhos.
 *
 * STUB do `sdd-plan` — o `sdd-execute` move o código existente para cá, sem alterar o algoritmo.
 */

import type { CatalogDb, CatalogReadItem } from './db'

export interface ShowcaseScanResult {
  recent: CatalogReadItem[]
  rated: CatalogReadItem[]
  coveredCategories: number
  totalCategories: number
}

export interface ShowcaseScanOptions {
  database?: CatalogDb
  /** Instante da seleção — define a semente diária de "Bem avaliados". */
  now?: number
  signal?: AbortSignal
}

/**
 * A varredura de hoje: percorre o tipo inteiro, bloco a bloco, e devolve as fileiras calculadas. Continua existindo como
 * **referência de correção** (o contrato C1 compara a montagem por candidatos com ela) e como caminho de reserva.
 *
 * NÃO é chamada na abertura das telas depois desta feature (FR-002).
 */
export function selectShowcaseRowsByScan(
  _sourceId: string,
  _kind: 'movie' | 'series',
  _options?: ShowcaseScanOptions,
): Promise<ShowcaseScanResult> {
  throw new Error('not implemented')
}
