import { useQuery } from '@tanstack/react-query'
import type { BecauseSeedKind } from '../../lib/catalog/becauseSeed'
import { SHOWCASE_LIMIT } from '../vod/vodShowcase'
import { loadBecauseSeed, loadCatalogItems, useSimilarTitles, useTmdbStatus, type CatalogItemOut } from './catalogApi'

/**
 * "Porque você assistiu X" (feature 060, FR-014/FR-015 — `logic/fileiras-e-dados.md` §2). Mora FORA de `catalogApi.ts` de
 * propósito (D-011): os testes de Filmes/Séries mocam o `catalogApi` parcialmente e espionam `fetch`; este hook roda de
 * verdade lá e, **sem TMDB conectado, não lê nada além do IndexedDB e não faz requisição nenhuma**.
 */
export interface BecauseRow {
  /** O título semente (o último concluído) — dele vem o nome da fileira. */
  seed: CatalogItemOut
  /** Semelhantes do TMDB que ESTÃO na lista, na ordem do TMDB, sem o próprio título. */
  items: CatalogItemOut[]
  /** Fundo 16:9 que já veio na resposta do TMDB, por id do item da lista (só para o card expandido do Início). */
  images: ReadonlyMap<string, string>
}

/**
 * `undefined` = ainda não se sabe (carregando); `null` = não existe fileira (sem chave TMDB, sem concluído, sem semelhante na
 * lista) — nunca um card inventado nem um "Em breve". A consulta da metadata do título semente (provedor/TMDB) acontece ao
 * ABRIR a tela, uma vez por 24 h, como no detalhe; focar nunca consulta.
 */
export function useBecauseYouWatched(sourceId: string | null, kind: BecauseSeedKind): BecauseRow | null | undefined {
  const tmdbState = useTmdbStatus().data?.state
  const connected = tmdbState === 'connected'

  const seedQuery = useQuery({
    queryKey: ['because-seed', sourceId, kind],
    queryFn: () => loadBecauseSeed(sourceId as string, kind),
    enabled: sourceId !== null && connected,
    // Terminar um título (ou tirá-lo do Histórico) muda a semente: as chaves de usuário já invalidam `['user-state…']`, e esta
    // leitura é local e barata — vale a releitura a cada montagem da tela.
    staleTime: 0,
  })
  const seed = seedQuery.data ?? null

  const similar = useSimilarTitles(seed?.id ?? null, seed !== null)
  const itemIds =
    seed === null || similar.status !== 'ready'
      ? []
      : similar.titles
          .filter((title) => title.localItemId !== undefined && title.localItemId !== seed.id)
          .slice(0, SHOWCASE_LIMIT)
          .map((title) => title.localItemId as string)
  const itemsQuery = useQuery({
    queryKey: ['because-items', seed?.id ?? null, itemIds.join(',')],
    queryFn: () => loadCatalogItems(itemIds),
    enabled: itemIds.length > 0,
  })

  if (sourceId === null) return null
  if (!connected) return tmdbState === undefined ? undefined : null // sem chave (ou ainda lendo o estado): nada além do IndexedDB
  if (seedQuery.data === undefined) return undefined
  if (seed === null) return null
  if (similar.status === 'loading') return undefined
  if (itemIds.length === 0) return null // sem semelhante na lista (ou sem correspondência no TMDB): a fileira não existe
  if (itemsQuery.data === undefined) return undefined
  const items = itemsQuery.data
  if (items.length === 0) return null

  const images = new Map<string, string>()
  for (const title of similar.titles) {
    if (title.localItemId !== undefined && title.backdropUrl !== undefined) images.set(title.localItemId, title.backdropUrl)
  }
  return { seed, items, images }
}
