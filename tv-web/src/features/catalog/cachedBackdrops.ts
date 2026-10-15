import { useQuery } from '@tanstack/react-query'
import { db } from '../../lib/catalog/db'

/** Item da lista e a identidade estável dele no cache de metadata. */
export interface BackdropPair {
  itemId: string
  stableId: string
}

const EMPTY_BACKDROPS: ReadonlyMap<string, string> = new Map()
const PENDING_BACKDROPS: ReadonlyMap<string, string> = new Map()

/**
 * Imagem horizontal (backdrop) já guardada no cache de metadata, por id de item (feature 053, D-006): leitura SÓ local
 * (`titleMetadata`), sem consulta nova. Base de `useCachedBackdrops` (`catalogApi.ts`), que monta os pares.
 *
 * Enquanto a leitura não volta devolve um mapa vazio PRÓPRIO (`backdropsPending`): a vitrine sabe que o formato do
 * "Continue" ainda não está decidido e não desenha a fileira num formato para trocar logo depois (ad-hoc 2026-10-09).
 */
export function useStoredBackdrops(pairs: readonly BackdropPair[]): ReadonlyMap<string, string> {
  const key = pairs.map((pair) => pair.stableId).join('|')
  const query = useQuery({
    queryKey: ['cached-backdrops', key],
    queryFn: async (): Promise<Map<string, string>> => {
      const records = await db.titleMetadata.bulkGet(pairs.map((pair) => pair.stableId))
      const found = new Map<string, string>()
      records.forEach((record, index) => {
        const url = record?.provider?.backdropUrl ?? (record?.tmdb?.status === 'matched' ? record.tmdb.fields.backdropUrl : undefined)
        if (url) found.set(pairs[index].itemId, url)
      })
      return found
    },
    enabled: pairs.length > 0,
    // Reabrir a vitrine minutos depois já sabe o formato do "Continue" (sem desenhar pôster e trocar para largo).
    gcTime: 5 * 60_000,
  })
  return query.data ?? (pairs.length > 0 && query.isPending ? PENDING_BACKDROPS : EMPTY_BACKDROPS)
}

/** `true` enquanto `useCachedBackdrops` ainda lê o disco (o mapa vazio de agora não quer dizer "sem imagem"). */
export function backdropsPending(backdrops: ReadonlyMap<string, string>): boolean {
  return backdrops === PENDING_BACKDROPS
}
