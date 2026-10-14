/** Resolução de identidades estáveis (favoritos e afins) em registros da geração ativa. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord } from '../db'
import { type StableIdParts } from '../userStateRepository'
import { blockRecord, blocksOfKind } from '../categoryBlocks'
import { FavoritesScanComplete, KEY_MAX, KEY_MIN, activeGenerationOf } from './shared'
import { getCategoryAccess } from '../categoryAccess'

/**
 * Resolve favoritos (feature 013, `stableId` do usuário) em registros do
 * catálogo da GERAÇÃO ATIVA — sem isso a categoria "Favoritos" não tem o
 * que mostrar. Favorito cujo item não está carregado nesta instalação é
 * simplesmente omitido (contado em `unresolved`), nunca inventado
 * (`sdd/specs/013-favoritos/logic/resolucao-favoritos.md`).
 *
 * Devolve na MESMA ORDEM de `favorites` (mais recente primeiro, já que é
 * quem chama — `useFavoritesContent` — que passa a lista nessa ordem).
 */
export async function resolveFavorites(
  sourceId: string,
  kind: CatalogItemKind,
  favorites: StableIdParts[],
  database: CatalogDb = db,
): Promise<{ records: CatalogRecord[]; unresolved: number }> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return { records: [], unresolved: favorites.length }

  const resolved = await resolveStableIdsIn(database, sourceId, generation, kind, favorites)
  const records: CatalogRecord[] = []
  let unresolved = 0
  for (const favorite of favorites) {
    const record = resolved.get(favorite)
    if (record) records.push(record)
    else unresolved += 1
  }
  return { records, unresolved }
}

/**
 * Várias identidades do mesmo `kind` → registro, numa passada (feature 039,
 * T034) — o mapa diz de quem é cada registro; identidade sem registro não
 * entra. Mesma resolução de `resolveFavorites`.
 */
export async function resolveStableIds(
  sourceId: string,
  kind: CatalogItemKind,
  parts: StableIdParts[],
  database: CatalogDb = db,
): Promise<Map<StableIdParts, CatalogRecord>> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return new Map()
  return resolveStableIdsIn(database, sourceId, generation, kind, parts)
}

/**
 * Núcleo de `resolveFavorites`: cada identidade (todas do mesmo `kind`) →
 * registro da geração ativa, numa passada só pelos blocos do tipo e depois
 * pelas linhas. O mapa diz de QUEM é cada registro — o que permite resolver
 * vários itens de uma vez (feature 039, T019).
 */
export async function resolveStableIdsIn(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  kind: CatalogItemKind,
  favorites: StableIdParts[],
): Promise<Map<StableIdParts, CatalogRecord>> {
  const resolved = new Map<StableIdParts, CatalogRecord>()
  // Feature 066: item só em categoria escondida/bloqueada não resolve; ocorrência numa categoria livre, sim.
  const access = await getCategoryAccess(sourceId, database)
  const allowed = (record: CatalogRecord) => !access.isExcludedRecord(record)

  // Feature 039 (§5): primeiro os blocos do tipo, UM POR VEZ (memória,
  // FR-013), parando assim que todos os favoritos forem achados; depois as
  // linhas antigas, só para o que sobrou. Uma categoria é ou bloco ou linhas.
  if (kind !== 'episode' && favorites.length > 0) {
    // Por valor, não por objeto: a mesma identidade pode vir repetida (dois
    // objetos iguais) — conta uma vez só, ou `remaining` nunca zeraria e a
    // varredura leria todos os blocos do tipo.
    const byId = new Map<string, StableIdParts[]>()
    const byNameKey = new Map<string, StableIdParts[]>()
    for (const favorite of favorites) {
      const map = favorite.identifier.type === 'id' ? byId : byNameKey
      const group = map.get(favorite.identifier.value)
      if (group) group.push(favorite)
      else map.set(favorite.identifier.value, [favorite])
    }
    let remaining = byId.size + byNameKey.size
    const take = (targets: StableIdParts[] | undefined, record: () => CatalogRecord) => {
      if (!targets || resolved.has(targets[0])) return
      const value = record()
      for (const target of targets) resolved.set(target, value)
      remaining -= 1
    }
    try {
      await blocksOfKind(database, sourceId, generation, kind).each((block) => {
        if (access.excluded.has(block.categoryId)) return
        block.items.forEach((item, index) => {
          const record = () => blockRecord(block, item, index)
          if (item.providerStreamId) take(byId.get(item.providerStreamId), record)
          if (kind === 'series' && item.seriesId) take(byId.get(item.seriesId), record)
          if (byNameKey.size > 0) take(byNameKey.get(item.originalName.trim().toLowerCase()), record)
        })
        if (remaining === 0) throw new FavoritesScanComplete()
      })
    } catch (error) {
      if (!(error instanceof FavoritesScanComplete)) throw error
    }
    if (remaining === 0) return resolved
  }

  // Linhas antigas: o mesmo valor repetido resolve todos os objetos dele.
  const share = () => {
    const byValue = new Map<string, CatalogRecord>()
    for (const [parts, record] of resolved) byValue.set(`${parts.identifier.type}:${parts.identifier.value}`, record)
    for (const favorite of favorites) {
      if (resolved.has(favorite)) continue
      const record = byValue.get(`${favorite.identifier.type}:${favorite.identifier.value}`)
      if (record) resolved.set(favorite, record)
    }
  }

  // Id do painel: um lookup pelo índice por favorito — nunca uma varredura.
  for (const favorite of favorites) {
    if (favorite.identifier.type !== 'id' || resolved.has(favorite)) continue
    const value = favorite.identifier.value

    let record = await database.channels
      .where('[sourceId+generation+kind+providerStreamId]')
      .equals([sourceId, generation, kind, value])
      .filter(allowed)
      .first()

    // Série sem `providerStreamId` próprio guarda o `seriesId` como
    // identificador (`buildStableId`) — mesmo índice que a 012 já usa
    // pra achar os episódios, aqui filtrado pro registro da série em si.
    if (!record && kind === 'series') {
      record = await database.channels
        .where('[sourceId+generation+seriesId]')
        .equals([sourceId, generation, value])
        .and((candidate) => candidate.kind === 'series' && allowed(candidate))
        .first()
    }

    if (record) resolved.set(favorite, record)
  }

  // Nome (só fonte M3U, sem identificador de painel): uma varredura só do
  // tipo, encerrada assim que todos os alvos restantes forem encontrados —
  // nunca por item, nunca ao focar (D-005 do plan.md).
  const byName = favorites.filter(
    (favorite): favorite is StableIdParts & { identifier: { type: 'name'; value: string } } =>
      favorite.identifier.type === 'name' && !resolved.has(favorite),
  )
  if (byName.length > 0) {
    const targetsByName = new Map(byName.map((favorite) => [favorite.identifier.value, favorite]))
    let remaining = targetsByName.size

    try {
      await database.channels
        .where('[sourceId+generation+kind+groupOrder]')
        .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
        .each((record) => {
          if (!allowed(record)) return
          const key = record.originalName.trim().toLowerCase()
          const target = targetsByName.get(key)
          // Nome repetido em duas categorias: a ordem do índice já é por
          // `groupOrder` crescente, então o primeiro achado é o de menor
          // `groupOrder` — o `!resolved.has` abaixo nunca sobrescreve com
          // o segundo.
          if (target && !resolved.has(target)) {
            resolved.set(target, record)
            remaining -= 1
            if (remaining === 0) throw new FavoritesScanComplete()
          }
        })
    } catch (error) {
      if (!(error instanceof FavoritesScanComplete)) throw error
    }
  }

  share()
  return resolved
}
