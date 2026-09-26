# Lógica: resolver favoritos em itens carregados

Referenciado por: plan.md D-003..D-006, tasks.md T005–T010.

## Problema

O favorito é um `UserStateRecord` chaveado por `stableId`
(`userStateRepository.buildStableId`):

```
<sourceId>|<kind>|id:<providerStreamId ?? seriesId>      (provedor Xtream; série M3U da 012)
<sourceId>|<kind>|name:<originalName.trim().toLowerCase()>  (fonte M3U sem id)
```

A categoria "Favoritos" precisa transformar esse conjunto em **registros do
catálogo da geração ativa** — só os que estão carregados (Clarifications
da spec). Os `id` locais de `channels` mudam a cada geração, então nunca
são guardados no favorito.

## Funções novas

### `userStateRepository.ts` (dono do formato da chave)

```ts
/** Partes da chave. Único lugar que conhece o formato — nenhuma tela faz split. */
export interface StableIdParts {
  sourceId: string
  kind: CatalogItemKind
  identifier: { type: 'id'; value: string } | { type: 'name'; value: string }
}
export function parseStableId(stableId: string): StableIdParts | null
// sourceId é UUID (sem '|'); kind é o 2º segmento; o resto (pode conter '|'
// num nome M3U) é o identificador. Episódio (sufixo |sN|eN) → não é
// favoritável nesta feature: devolve as partes, e o chamador filtra kind.

/** Favoritos de uma fonte e tipo, do mais recente para o mais antigo (índice favoritedAt). */
export async function listFavorites(
  sourceId: string, kind: CatalogItemKind, database?: CatalogDb,
): Promise<UserStateRecord[]>

/** Remove todo estado do usuário de uma fonte (FR-017, D-007). */
export async function deleteUserStatesForSource(sourceId: string, database?: CatalogDb): Promise<void>
```

`listFavorites` usa `orderBy('favoritedAt').reverse()` e filtra em memória
por `sourceId` + prefixo `${sourceId}|${kind}|`. Favoritos são dezenas a
centenas; não justifica índice composto novo em `userStates`.

### `catalogRepository.ts`

```ts
/**
 * Registros da geração ativa correspondentes aos favoritos, na ORDEM dos
 * favoritos. Favorito sem registro carregado é omitido (e contado em
 * `unresolved`). Um registro por favorito (o de menor groupOrder, se o
 * nome M3U repetir em grupos diferentes).
 */
export async function resolveFavorites(
  sourceId: string,
  kind: 'channel' | 'movie' | 'series',
  favorites: StableIdParts[],
  database?: CatalogDb,
): Promise<{ records: CatalogRecord[]; unresolved: number }>
```

Algoritmo:

```
gen = activeGeneration(sourceId); se undefined → { records: [], unresolved: favorites.length }
byId   = favorites com identifier.type == 'id'
byName = favorites com identifier.type == 'name'

para cada f em byId:
   r = channels.where('[sourceId+generation+kind+providerStreamId]').equals([sourceId, gen, kind, f.value]).first()
   se !r e kind == 'series':
       r = channels.where('[sourceId+generation+seriesId]').equals([sourceId, gen, f.value])
                   .filter(x => x.kind == 'series').first()
   mapa[f] = r

se byName não vazio:                       // só fonte M3U (catálogo integral)
   alvo = Set(byName.map(f => f.value))
   varre channels.where('[sourceId+generation+kind+groupOrder]')
         .between([sourceId, gen, kind, Dexie.minKey], [sourceId, gen, kind, Dexie.maxKey])
         .each(r => { k = r.originalName.trim().toLowerCase(); se alvo.has(k) e !mapa[k]: mapa[k] = r })
   // uma passada, cedo encerrável quando todos os alvos foram achados

devolve na ordem de `favorites`, pulando os sem registro; unresolved = quantos pulou
```

A varredura por nome é o único caminho O(n) e só roda quando a pessoa
**entra** na categoria "Favoritos" de uma fonte M3U com favoritos por nome
— nunca ao mover o foco nem ao desenhar estrelas (R-003).

### `catalogApi.ts` (a única porta das telas)

```ts
/** Conjunto de stableIds favoritos da fonte+tipo — alimenta a estrela (FR-010). */
export function useFavoriteIds(sourceId: string | null, kind: FavoritableKind): UseQueryResult<Set<string>>
// queryKey: ['favorite-ids', sourceId, kind]

/** Conteúdo da categoria virtual "Favoritos" (FR-006/FR-009). */
export interface FavoritesContent { items: CatalogItemOut[]; unresolved: number }
export function useFavoritesContent(sourceId: string | null, kind: FavoritableKind, enabled: boolean)
// queryKey: ['favorites-content', sourceId, kind]; habilitada só quando a pessoa ENTRA na categoria

/** Alterna o favorito; devolve o novo estado. Invalida as duas chaves acima e ['user-state', id]. */
export function useToggleFavorite(): UseMutationResult<boolean, Error, CatalogItemOut>
```

`FavoritableKind = 'channel' | 'movie' | 'series'`.

A estrela de um item é `favoriteIds.has(stableIdOf(item))` — sem resolver
nada, sem consulta por item.

## Testes

- `userStateRepository.test.ts`: `parseStableId` ida-e-volta com
  `buildStableId` para id, nome com `|`, episódio; `listFavorites` filtra
  fonte/tipo e ordena; `deleteUserStatesForSource` só apaga a fonte certa.
- `catalogRepository.test.ts`: `resolveFavorites` por providerStreamId, por
  seriesId (série M3U da 012), por nome (maiúsculas/espaços), favorito não
  carregado conta em `unresolved`, geração antiga ignorada, ordem
  preservada, nome duplicado em dois grupos → um registro.
- Integração: favoritar → ressincronizar (nova geração com mesmo
  providerStreamId) → `resolveFavorites` encontra o registro novo
  (SC-003).
