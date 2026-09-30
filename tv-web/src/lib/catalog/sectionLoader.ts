/**
 * Carga de uma SEÇÃO inteira do provedor numa requisição só (feature 038,
 * `research.md` R0-3, Entrega 1).
 *
 * Por quê: pedir uma categoria por vez esbarra no limite de frequência do
 * painel (medido: ~34 pedidos a ~1/s e o painel passa a recusar), enquanto a
 * seção inteira chega em 1–3 s (canais 0,76 MB; filmes 12,4 MB; séries
 * 9,7 MB). A resposta é lida em fluxo (`jsonArrayStream`) — um objeto por vez,
 * nunca o texto inteiro na memória —, cada item vira o mesmo registro compacto
 * da carga por categoria (`toItemRecord`) e as categorias pedidas são gravadas
 * uma a uma por `renewCategoryItems` (id preservado, lista idêntica não é
 * regravada), com pausa entre elas para ceder à navegação.
 *
 * Nunca registra URL nem credencial; falha sai como categoria de resultado.
 */

import { db, type CatalogDb, type CatalogRecord, type CategoryKind } from './db'
import { activeGeneration, listCategories, renewCategoryItems, StorageFullError, type CatalogCategory } from './catalogRepository'
import { toItemRecord } from './categoryLoader'
import { readJsonArrayStream } from './jsonArrayStream'
import { readCredential } from './sourceRepository'
import {
  isAbortError,
  mapLiveEntry,
  mapSeriesEntry,
  mapVodEntry,
  playerApiUrl,
  type LiveCategory,
  type MappedChannel,
} from './xtreamConnector'

const ACTION: Record<CategoryKind, string> = {
  channel: 'get_live_streams',
  movie: 'get_vod_streams',
  series: 'get_series',
}

export type SectionLoadOutcome = 'done' | 'failed' | 'storage_full'

export interface SectionLoadOptions {
  database?: CatalogDb
  now?: () => number
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  /** Uma categoria acabou de ser gravada (a interface invalida as consultas dela). */
  onCategory?: (categoryId: number) => void
  /** Chamada antes de gravar cada categoria: resolve quando pode continuar (portão de atividade). */
  waitUntilAllowed?: () => Promise<void>
}

export interface SectionLoadResult {
  outcome: SectionLoadOutcome
  /** Categorias gravadas nesta carga. */
  written: number[]
}

/** Sem URL de propósito: a de reprodução é montada na hora (`playbackUrl.ts`), nunca guardada. */
const noUrl = (): undefined => undefined

function mapperFor(kind: CategoryKind, categoryMap: Map<string, LiveCategory>) {
  if (kind === 'channel') return (raw: Record<string, unknown>) => mapLiveEntry(raw, categoryMap, noUrl)
  if (kind === 'movie') return (raw: Record<string, unknown>) => mapVodEntry(raw, categoryMap, noUrl)
  return (raw: Record<string, unknown>) => mapSeriesEntry(raw, categoryMap)
}

/**
 * Busca a seção `kind` inteira e grava as categorias `categoryIds` (as que a
 * pré-carga quer). Categoria pedida que a resposta não traz fica gravada vazia
 * — é o que a carga por categoria também daria.
 */
export async function loadSection(
  sourceId: string,
  kind: CategoryKind,
  categoryIds: readonly number[],
  options: SectionLoadOptions = {},
): Promise<SectionLoadResult> {
  const database = options.database ?? db
  const now = options.now ?? (() => Date.now())
  const written: number[] = []

  const credential = await readCredential(sourceId, database)
  const generation = await activeGeneration(sourceId, database)
  if (!credential || generation === undefined) return { outcome: 'failed', written }

  const wanted = new Set(categoryIds)
  const categories = (await listCategories(sourceId, kind, database)).filter(
    (category) => wanted.has(category.id) && category.fetchMode === 'on_demand' && category.providerCategoryId,
  )
  if (categories.length === 0) return { outcome: 'done', written }

  const byProviderId = new Map<string, CatalogCategory>(categories.map((c) => [c.providerCategoryId as string, c]))
  const categoryMap = new Map<string, LiveCategory>(
    categories.map((c) => [c.providerCategoryId as string, { id: c.providerCategoryId as string, name: c.name ?? '', order: c.order }]),
  )
  const map = mapperFor(kind, categoryMap)
  const groups = new Map<number, CatalogRecord[]>(categories.map((c) => [c.id, []]))

  try {
    const response = await (options.fetchImpl ?? fetch)(
      playerApiUrl(credential.dns, credential.username, credential.password, { action: ACTION[kind] }),
      options.signal ? { signal: options.signal } : undefined,
    )
    if (!response.ok || !response.body) return { outcome: 'failed', written }
    await readJsonArrayStream(
      response.body,
      (raw) => {
        const providerCategoryId = raw.category_id === undefined || raw.category_id === null ? undefined : String(raw.category_id)
        const category = providerCategoryId ? byProviderId.get(providerCategoryId) : undefined
        if (!category) return // categoria que a pré-carga não pediu (ou que a fonte não declara)
        const item: MappedChannel | undefined = map(raw)
        if (item) groups.get(category.id)?.push(toItemRecord(item, sourceId, generation, category))
      },
      options.signal,
    )
  } catch (error) {
    if (isAbortError(error)) throw error
    return { outcome: 'failed', written }
  }

  try {
    for (const category of categories) {
      if (options.signal?.aborted) throw new DOMException('Carga cancelada.', 'AbortError')
      await options.waitUntilAllowed?.()
      const items = groups.get(category.id) ?? []
      await renewCategoryItems(
        { sourceId, generation, kind, categoryId: category.id, groupOrder: category.order },
        items,
        now(),
        database,
      )
      groups.delete(category.id) // libera a memória desta categoria já gravada
      written.push(category.id)
      options.onCategory?.(category.id)
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    if (error instanceof StorageFullError) return { outcome: 'storage_full', written }
    return { outcome: 'failed', written }
  }
  return { outcome: 'done', written }
}
