# Contrato: Episódios de Série

Superfícies novas ou alteradas desta feature. Mesma disciplina do
`contracts/catalog-on-demand.md` da feature 010: telas falam só com
`features/catalog/catalogApi.ts`; `lib/catalog/` nunca importa UI.

## 1. Repositório (`lib/catalog/catalogRepository.ts`)

```ts
export interface SeriesEpisodesTarget {
  sourceId: string
  generation: number
  seriesId: string
  /** Id local do registro kind:'series' — recebe o carimbo `episodesFetchedAt`. */
  seriesRecordId: number
}

/** Episódios de uma série, geração ativa, sem ordenação (a ordem é da tela, `logic` §3). */
export function listEpisodes(sourceId: string, seriesId: string, database?: CatalogDb): Promise<CatalogRecord[]>

/**
 * Substitui integralmente os episódios de uma série e carimba a série, numa
 * transação. Apaga só `kind === 'episode'` com o mesmo seriesId — nunca o
 * registro da série (D-002). Falta de espaço → StorageFullError.
 */
export function storeSeriesEpisodes(
  target: SeriesEpisodesTarget,
  episodes: CatalogRecord[],
  now: number,
  database?: CatalogDb,
): Promise<void>
```

## 2. Carregador (`lib/catalog/seriesLoader.ts`)

```ts
export type SeriesFetchOutcome = 'fresh' | 'fetched' | 'stale-served' | 'failed'

export function ensureSeriesEpisodes(
  seriesRecordId: number,
  options?: { database?: CatalogDb; now?: () => number },
): Promise<{ outcome: SeriesFetchOutcome }>
```

Regras invioláveis (espelho do `categoryLoader`):

1. Chamado só na **entrada** do detalhe da série — nunca ao focar o cartão.
2. Série cuja categoria é `eager` → `fresh`, sem rede (M3U e modo limitado já
   gravaram os episódios na importação).
3. `episodesFetchedAt` dentro de `STALE_AFTER_MS` → `fresh`, sem rede.
4. Chamadas concorrentes para a mesma série compartilham **uma** promessa
   (`inFlight` por `seriesRecordId`).
5. Falha nunca apaga episódios gravados: `stale-served` se já houve obtenção,
   `failed` se nunca houve.
6. Erro sai como desfecho, **nunca** como mensagem — a mensagem crua de rede
   carrega a URL com credencial (FR-023).
7. Registro inexistente, sem `seriesId`, sem credencial ou sem geração ativa →
   `failed` (ou `stale-served` se já houve obtenção), sem lançar.
8. Nenhum episódio gravado guarda URL (D-004).

## 3. Conector (`lib/catalog/xtreamConnector.ts`)

`fetchSeriesInfo(base, username, password, seriesId): Promise<XtreamEpisode[]>`
— mesma assinatura. Mudanças de contrato:

- `url` sempre `undefined` (D-004).
- `streamExtension` = `container_extension` se for texto não vazio; senão
  `undefined` (sem `'mp4'` presumido).
- `episodeNumber`/`seasonNumber` conforme `logic/episodios-autoplay.md` §1.
- Falha de rede/HTTP continua lançando (quem trata é o `seriesLoader`).

## 4. Estado do usuário (`lib/catalog/userStateRepository.ts`)

```ts
/** Marca conclusão: completedAt = agora, apaga progressSeconds, atualiza lastWatched. */
export function markCompleted(stableId: string, sourceId: string, database?: CatalogDb): Promise<void>

/** Leitura em lote, na ordem pedida; ausente → undefined na posição. */
export function getUserStates(stableIds: string[], database?: CatalogDb): Promise<(UserStateRecord | undefined)[]>
```

## 5. Gravador (`lib/player/progressRecorder.ts`)

```ts
createProgressRecorder(identity, reportsPosition, database?, options?: { recordCompletion?: boolean })
```

Com `recordCompletion: true`, os dois pontos que hoje chamam `clearProgress`
(conclusão real e `isPastEnd`) chamam `markCompleted` em vez disso. Sem a
opção, comportamento idêntico ao da 011.

## 6. Camada de reprodução (`components/PlayerLayer.tsx`)

```ts
interface PlayerLayerProps {
  // …existentes…
  /** Se presente, a conclusão chama isto em vez de onClose (D-008). */
  onCompleted?: () => void
}
```

- Identidade pela `stableIdOf(playback)` (D-006); `recordCompletion` =
  `playback.kind === 'episode'`.
- RETURN, erro e "Voltar" continuam chamando `onClose`.

## 7. `catalogApi.ts`

```ts
/** Nunca lança; null = sem identidade estável (D-010 da 011). */
export function stableIdOf(item: {
  source_id?: string; kind: CatalogItemKind; provider_stream_id?: string | null
  series_id?: string | null; season_number?: number | null; episode_number?: number | null
  original_name?: string
}): string | null

export interface SeriesEpisodesContent { episodes: EpisodeOut[]; outcome: SeriesFetchOutcome }

/** Garante (seriesLoader) e lê os episódios. queryKey ['series-episodes', seriesItemId]. */
export function useSeriesEpisodes(seriesItemId: string | null): UseQueryResult<SeriesEpisodesContent>

/** Estados em lote. queryKey ['user-states', ...ids]. */
export function useUserStates(stableIds: (string | null)[]): UseQueryResult<(UserStateRecord | null)[]>

/** Invalida todas as leituras em lote (prefixo ['user-states']). */
export function invalidateUserStates(queryClient: QueryClient): void
```

`fetchPlayback` passa a preencher `series_id`, `season_number`,
`episode_number` a partir do registro.
