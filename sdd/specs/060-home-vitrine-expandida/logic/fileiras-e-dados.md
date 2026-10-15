# Fileiras novas e dados (feature 060)

Cobre US3 (P3) e a base de imagem das outras: FR-012..FR-015, FR-018, FR-021, FR-022, FR-026, SC-008.

## 1. Imagem 16:9 de um item — `imageOf(item)` (só local)

Prioridade, a primeira que existir:

1. `item.provider_backdrop_url` (série, da listagem — feature 055);
2. backdrop no cache de metadata (`useCachedBackdrops`, feature 053 — `titleMetadata.provider.backdropUrl` ou TMDB
   `matched`);
3. `backdropUrl` que veio junto com o item na fileira que o trouxe: `DiscoveryPick.backdropUrl` (Top 10/Dica) ou
   `ResolvedTitle.backdropUrl` ("Porque você assistiu") — §5.

Hook `useHomeImages(items, extra: ReadonlyMap<itemId, url>)` → `ReadonlyMap<itemId, url>`. Nunca consulta rede; item sem
nenhuma das três → sem imagem (fallback pôster + cor da capa). URL de imagem nunca vai para log/erro (FR-026).

## 2. "Porque você assistiu X" — `useBecauseYouWatched(sourceId, kind)`

Módulo **novo** `features/catalog/becauseApi.ts` — fora de `catalogApi.ts` de propósito: os testes de
Filmes/Séries mocam o `catalogApi` parcialmente (`...actual`), e o hook precisa rodar de verdade lá **sem fazer
requisição nenhuma** (contratos emendados de 052/053/056/057 espionam `fetch`).

```
useBecauseYouWatched(sourceId, kind: 'movie' | 'series' | 'any') → { data: BecauseRow | null | undefined }
  1. tmdb = useTmdbStatus(); se state !== 'connected' → data = null  (NENHUMA leitura de rede; FR-014 "sem chave")
  2. states = userStates da fonte (IndexedDB)            // local
  3. seriesIdOfEpisode: registros de episódio já no aparelho (local); desconhecido → ignora
  4. seed = pickBecauseSeed(states, { sourceId, kind, seriesIdOfEpisode })   // CONTRATO 060
     null → data = null
  5. seedItem = registro local do filme/série semente (resolução por identidade, como resolveContinueWatching)
     não resolve → data = null
  6. metadata = useTitleMetadata(seedItem.id)            // ao ABRIR a tela, mesma consulta do detalhe; cache 24 h
  7. similar = metadata.tmdbMatch === 'matched' ? metadata.similar : []
  8. resolved = resolveTmdbTitles(sourceId, similar, [kindDoSeed])   // só IndexedDB
     items = resolved.titles com localItemId, sem o próprio seed, na ordem do TMDB, até SHOWCASE_LIMIT
  9. items.length === 0 → data = null
     senão data = { seed: seedItem, items: CatalogItemOut[], images: Map<itemId, backdropUrl> }
```

- Início: `kind = 'any'`. Filmes: `'movie'`. Séries: `'series'`. Mesma regra (FR-014).
- `data === undefined` (carregando) e `null` → a fileira não existe (sem skeleton).
- Título da fileira: `t('showcase.row.becauseOf', { title: seed.name })` = "Porque você assistiu {title}" (pt/en/es).
- Foco/restauração: chave de linha `because`, ids dos itens locais.

### Filmes e Séries (`VodShowcaseScreen`)

- `buildShowcaseRows` passa a ler `hasBecause`/`becauseTitle`: com `hasBecause`, `{ key: 'because', kind: 'items',
  format: 'poster', seeAll: null, slotId: null, title: becauseOf }` **no mesmo lugar** do antigo slot (depois de `tip`,
  antes das categorias); sem, nada (CONTRATO 060 + contratos emendados 052/053/056/057).
- `entriesOf('because')` = `plainEntries(because.items)` (sem "Ver tudo", como Top 10/Dica).
- Hero do card focado nessa fileira: eyebrow `showcase.eyebrow.because` ("Porque você assistiu {title}").
- Remover `vod-because` de `comingSoon.ts` e do catálogo `comingSoon.*` (pt/en/es). `ShowcaseRowKind` mantém `'slot'`
  (o contrato de foco `vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts` usa slots sintéticos — não remover o
  tipo nem a renderização de slot).

## 3. Filmes adicionados / Séries adicionadas (FR-013)

- `useRecentlyAdded(sourceId, 'movie' | 'series')` (052, já otimizado no bug `tela-principal-filmes-lenta-na-tv`),
  estendido para devolver `coveredCategories`/`totalCategories` do mesmo índice (o `select` já tem `index`).
- **Carga adiada** (R-001): no Início, os dois só habilitam depois do primeiro desenho com o foco pronto
  (`useDeferredEnable(HOME_DEFERRED_MS = 600)` ou `requestIdleCallback` com fallback) — a primeira tela não espera a
  leitura do índice de dois tipos. A fileira simplesmente aparece quando chega (não há skeleton).
- Mesma `queryKey` (`['catalog-search-index', sourceId, kind]`) de Filmes/Séries: o índice lido em uma tela serve à
  outra por `SHOWCASE_INDEX_STALE_MS`.
- Itens sem `added_at` não entram (regra de `recentlyAddedBy`). Cobertura parcial: `showcase.ratedCoverage` no
  cabeçalho, como Top 10/Dica.

## 4. Ao vivo agora (FR-012)

- Dados de hoje: `useFavoritesContent(sourceId, 'channel', true)` + `useEpgPrograms` + `nowNextForChannel(lookup, id, now)`.
- Card `HomeLiveCard` 480×270: logo (`icon_url` via `PosterArt`, contain) · número (`channelNumberOf`, regra 024) · nome
  · `AO VIVO` · programa atual (`now.title`) · barra `now.progress` + horário (`formatEpgTimeRange(now.start, now.end)`).
  Sem EPG: só logo/nome/número/`AO VIVO`, sem programa nem barra (FR-012; mesma regra do contrato da 030).
- Fundo da arte do card: cor do logo (`useCoverColor`) ou gradiente neutro — nunca imagem inventada.
- Último card: `SeeAllCard` "Todos os canais" → `onOpenFavorites('live', from)` (comportamento atual de "Ver todos").
- OK no canal: `onOpenChannel` (igual a hoje). O fundo ambiente não muda para canais (mantém o último alvo).

## 5. Guardar o backdrop que já chega (FR-021)

Sem consulta nova e **sem mudança de esquema** (campos opcionais dentro de objetos que já são gravados — nenhum índice
novo, nenhum bump do Dexie; a v17 continua livre):

| Onde | Campo novo | De onde |
| --- | --- | --- |
| `TmdbTitleRef` (`lib/catalog/db.ts`) | `backdropUrl?: string` | `mapSimilar` (`tmdbMapping.ts`): `backdrop_path` → `tmdbImageUrl(path, 'w780')` |
| `DiscoveryTitle` (`lib/metadata/tmdbDiscovery.ts`) | `backdropUrl?: string` | `mapItem`: `backdrop_path` → mesma montagem |
| `DiscoveryPick` (`catalogApi.ts`) | `backdropUrl?: string` | `projectTop10`: do `DiscoveryTitle` casado |
| Dica (`useDailyTip`) | `images: Map<itemId, url>` no retorno | `projectTip`: idem |
| `ResolvedTitle` | herda de `TmdbTitleRef` | `resolveTmdbTitles` já copia o ref |

- Registros gravados antes não têm o campo: a cobertura cresce na próxima renovação (semana/dia/24 h). Aceito.
- URL montada sem chave (`tmdbImageUrl`) — já é a regra dos pôsteres (contrato 057 confere que a chave não aparece no
  resultado).
- Contratos que comparam esses objetos usam `toMatchObject` (057) ou campo a campo (035) — campo a mais não quebra.
