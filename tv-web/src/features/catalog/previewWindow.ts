/**
 * Decisões da janela de prévias de categoria (feature 089, R-012).
 *
 * Por que existe, e por que é um arquivo separado. Até a feature 089, `useCategoryPreviews` mantinha **uma consulta por
 * janela**, cuja chave continha a lista de ids das categorias visíveis. Cada tecla que deslizava a janela mudava a
 * chave: consulta nova criada, um `fetchQuery` disparado por categoria, consulta anterior órfã. Medido na TV de
 * referência em **19,6 eventos de cache por tecla**, contra 0,4 de scroll e 0,6 de transação de banco — e as janelas
 * com mais eventos deram **33 fps** contra 41 das com menos.
 *
 * A decisão de *o que buscar* e *o que montar* virou função pura aqui porque (a) é a parte com regra de verdade — stale
 * e invalidado contam como faltando, senão a prévia pararia de acompanhar a pré-carga da feature 038 — e (b)
 * `catalogApi.ts` está no seu teto de linhas no ratchet, então o hook de lá tem de ficar fino.
 *
 * Nada aqui importa de `catalogApi.ts`: as consultas entram por callback e o dado é genérico, para não criar ciclo de
 * import entre os dois.
 */

/** O que o React Query sabe de uma consulta, no mínimo que estas decisões precisam. */
export interface CachedState<T> {
  readonly data: T | undefined
  /** `true` depois de um `invalidateQueries` — os dados continuam no cache, mas não valem mais. */
  readonly isInvalidated: boolean
  /** Quando o dado entrou no cache (epoch ms). */
  readonly dataUpdatedAt: number
}

/**
 * Quais ids precisam ser buscados: sem dado, **invalidado** (a pré-carga invalida quando a categoria chega) ou velho
 * demais. Os outros saem do cache sem tocar em consulta nenhuma — é isso que corta os eventos por tecla.
 */
export function previewsFaltando<T>(
  ids: readonly number[],
  estadoDe: (id: number) => CachedState<T> | undefined,
  agora: number,
  staleMs: number,
): number[] {
  const faltando: number[] = []
  for (const id of ids) {
    const estado = estadoDe(id)
    if (estado?.data === undefined || estado.isInvalidated || agora - estado.dataUpdatedAt > staleMs) faltando.push(id)
  }
  return faltando
}

/**
 * Monta o mapa a partir do que já está no cache. Id sem dado fica **fora** do mapa em vez de entrar com um valor
 * inventado — quem lê trata a ausência como "ainda não obtida", e a constituição proíbe cartão com dado falso.
 */
export function montarPreviews<T>(
  ids: readonly number[],
  dadoDe: (id: number) => T | undefined,
): ReadonlyMap<number, T> {
  const pares: Array<readonly [number, T]> = []
  for (const id of ids) {
    const dado = dadoDe(id)
    if (dado !== undefined) pares.push([id, dado])
  }
  return new Map(pares)
}
