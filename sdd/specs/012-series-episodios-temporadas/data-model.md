# Data Model: Séries — Episódios e Temporadas

Base: `tv-web/src/lib/catalog/db.ts` (schema v7, feature 010). Esta feature
sobe para **v8**.

## 1. Schema v8

```ts
this.version(8).stores({
  channels:
    '++id, [sourceId+generation], [sourceId+generation+groupOrder], ' +
    '[sourceId+generation+kind+groupOrder], [sourceId+generation+seriesId]',
})
```

- Índice novo: `[sourceId+generation+seriesId]`. Registros sem `seriesId`
  (canal, filme) simplesmente não entram nele — índice composto do
  IndexedDB ignora linha com parte `undefined`.
- **Sem `.upgrade()`**: nenhum dado existente precisa ser convertido. Série
  Xtream já gravada tem `seriesId` e passa a ser encontrável; episódio M3U
  gravado antes desta feature não tem `seriesId` e **não** é religado — a
  fonte M3U precisa re-sincronizar para ganhar o agrupamento (mesma política
  de `data-model.md` §4 da 010: adivinhar vínculo seria reconstrução por
  aproximação).
- `userStates` não muda de índice.

## 2. `CatalogRecord` — campos por tipo

| Campo | Série Xtream | Série M3U (sintética) | Episódio Xtream | Episódio M3U |
| --- | --- | --- | --- | --- |
| `kind` | `'series'` | `'series'` | `'episode'` | `'episode'` |
| `seriesId` | `series_id` do painel | `m3u:<grupo>\|<seriesKey>` | `series_id` do painel | igual ao da série sintética |
| `categoryId` | categoria `on_demand` | categoria `eager` do grupo | `undefined` | `undefined` |
| `groupOrder` | `order` da categoria | ordem do grupo | `order` da categoria da série (não usado para leitura) | ordem do grupo |
| `providerStreamId` | — | — | `id` do episódio no painel | só no modo limitado (id da URL) |
| `seasonNumber` / `episodeNumber` | — | — | do JSON (ver `logic` §1) | do padrão `SxxEyy`; ausentes se não houver |
| `streamExtension` | — | — | `container_extension` ou ausente | da URL, quando reconhecível |
| `directUrl` | — | — | **nunca** (D-004) | URL da linha M3U só para fonte `m3u_url` (regra já existente `keepUrl`) |
| `episodesFetchedAt` *(novo)* | instante da última obtenção | ausente (nunca buscado) | — | — |
| `name` / `originalName` | nome declarado | título-base da **primeira** entrada vista | `title` do episódio | nome da linha |

`episodesFetchedAt` é não indexado; só faz sentido em série de categoria
`on_demand`.

## 3. `UserStateRecord` — campo novo

```ts
/** Instante em que o item foi assistido até o fim (D-007). Ausente = nunca concluído. */
completedAt?: number
```

- Gravado por `markCompleted(stableId, sourceId)`: `completedAt = agora`,
  `progressSeconds = undefined`, `lastWatched = agora`.
- Persistente: gravar progresso depois (reassistir) **não** apaga
  `completedAt`.
- Só `kind: 'episode'` grava nesta feature (D-007).

## 4. Identidade estável de episódio

`buildStableId` já trata `kind: 'episode'`:

```
<sourceId>|episode|id:<providerStreamId ?? seriesId>|s<season ?? 0>|e<episode ?? 0>
```

- Xtream: `id:<id do episódio>` — único por episódio mesmo sem número.
- M3U (URL simples): sem `providerStreamId`, cai no `seriesId` sintético;
  temporada/episódio desambiguam. Pela URL simples, só vira episódio quem
  tem `SxxEyy` no nome (classificador), então sempre há número.
- Modo limitado: tem `providerStreamId` da URL. Aqui pode existir episódio
  **sem** `SxxEyy` (o tipo vem do segmento `/series/`, D-012): agrupa pelo
  próprio nome normalizado, vira uma série de um episódio só, sem temporada
  (grupo "Episódios", D-011) — acessível, sem hierarquia inventada.

O helper `stableIdOf` (D-006) é o único ponto que monta isso a partir da
forma que as telas recebem (`source_id`, `kind`, `provider_stream_id`,
`series_id`, `season_number`, `episode_number`, `original_name`).

## 5. Formas expostas às telas (`catalogApi.ts`)

```ts
interface CatalogItemOut {           // campos novos, opcionais
  series_id?: string | null
}

interface EpisodeOut {
  id: string                          // id local — o que PlayerLayer recebe
  name: string
  season_number: number | null
  episode_number: number | null
  playable: boolean
  source_id: string
  provider_stream_id: string | null
  series_id: string
  original_name: string
}

interface CatalogItemPlayback {      // campos novos, obrigatórios
  series_id: string | null
  season_number: number | null
  episode_number: number | null
}
```

Nenhuma forma carrega URL, exceto `CatalogItemPlayback.url`, que já existia
e nunca é guardada em estado de tela.
