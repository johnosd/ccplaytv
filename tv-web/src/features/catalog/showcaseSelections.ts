/**
 * Carregamento das fileiras calculadas de uma vitrine (feature 086, T071/T072).
 *
 * Fora de `catalogApi.ts` porque o caminho ganhou duas pontas — o documento de tela e o caminho dos candidatos — e o
 * arquivo já estava no teto de linhas do ratchet. A conversão para o item de tela entra por parâmetro, para este módulo
 * não depender de `catalogApi` (seria um ciclo).
 */

import type { CatalogReadItem } from '../../lib/catalog/readProjectionTypes'
import { buildShowcaseRowsFromCandidates } from '../../lib/catalog/showcaseRows'
import { readScreenDocument } from '../../lib/catalog/screenDocument'
import { emitMetric } from '../../lib/perf/metricsChannel'

export interface ShowcaseSelections<T> {
  recent: T[]
  rated: T[]
  coveredCategories: number
  totalCategories: number
}

/**
 * As fileiras "Adicionados recentemente" e "Bem avaliados" de um tipo, para a abertura da tela.
 *
 * Duas pontas, nesta ordem:
 *
 * 1. **o documento de tela** — uma leitura síncrona do `localStorage`, que sob a carga da lista custou p95 **0,8 ms**
 *    na TV, contra ~20 ms de um `get` do IndexedDB e 223 ms num banco separado (T070,
 *    `evidencias/sonda-montagem-tv-2026-10-21.md`). As duas leituras de validação são pequenas, e `getCategoryAccess` é
 *    memorizado por lista. Visibilidade diferente da que o documento registrou o invalida — é o que mantém a decisão de
 *    visibilidade fora do dado guardado (regra da feature 066);
 * 2. **os candidatos por categoria** (FR-001/FR-002: a abertura não varre o tipo), e então o documento é refeito **fora
 *    do caminho do desenho**, para a próxima abertura. É assim que uma lista que já estava no aparelho ganha o seu.
 */
export async function loadShowcaseSelections<T>(
  sourceId: string,
  kind: 'movie' | 'series',
  now: number,
  toOut: (item: CatalogReadItem) => T,
): Promise<ShowcaseSelections<T>> {
  const startedAt = performance.now()
  // O documento primeiro, e **sem tocar o banco** (T089): a TV mostrou que as duas leituras que eu usava para validá-lo
  // custavam 0,9–4,0 s na abertura, contra 1–17 ms para ler o documento. Quem invalida é quem escreve — a troca de
  // geração e a mudança de visibilidade de categoria apagam o documento no mesmo instante em que acontecem.
  const document = readScreenDocument(sourceId, kind, { now })
  if (document) {
    emitMetric({ source: 'showcase', kind, outcome: 'done', docMs: Math.round(performance.now() - startedAt),
      stale: document.stale === true ? 1 : 0 })
    return {
      recent: document.recent.map(toOut),
      rated: document.rated.map(toOut),
      coveredCategories: document.coveredCategories,
      totalCategories: document.totalCategories,
    }
  }

  // Sem documento, o caminho dos candidatos responde agora. **Refazer o documento não acontece aqui**: ficaria trabalho
  // solto depois de a tela desenhar. Quem o refaz é a carga por seção ou a fila de segundo plano do prefetch.
  const rows = await buildShowcaseRowsFromCandidates(sourceId, kind, { now })
  emitMetric({ source: 'showcase', kind, outcome: 'failed', candidatesMs: Math.round(performance.now() - startedAt) })
  return {
    recent: rows.recent.map(toOut),
    rated: rows.rated.map(toOut),
    coveredCategories: rows.coveredCategories,
    totalCategories: rows.totalCategories,
  }
}
