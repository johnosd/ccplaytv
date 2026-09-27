# Lógica: ano, inclusão, duração e imagem do episódio

Feature 025 — FR-049..FR-051, FR-041. Contrato travado:
`tv-web/src/lib/catalog/vodMetadata.filmes-series-ds-v14.contract.test.ts`.

Mesmo espírito de `normalizeIconUrl` (feature 015): uma função de
normalização por dado, pura, que nunca lança e devolve `undefined` para
qualquer coisa ausente, ilegível ou implausível. Moram em `classifier.ts`
junto de `normalizeIconUrl` (fonte única das validações de captura) e são
chamadas por `xtreamConnector.ts`.

## 1. Funções

```ts
/** Ano de 4 dígitos entre 1888 e (ano corrente + 1). Aceita número, "2019" ou data "2019-06-01"/"2019". */
export function normalizeYear(raw: unknown, now = Date.now()): number | undefined

/** Epoch em segundos (número ou string só de dígitos) → epoch ms. Entre 2000-01-01 e agora + 1 dia. */
export function normalizeAddedAt(raw: unknown, now = Date.now()): number | undefined

/** Segundos inteiros > 0 e < 24 h. Aceita número ou string de dígitos. */
export function normalizeDurationSeconds(raw: unknown): number | undefined
```

- `normalizeYear` só lê o começo de uma **data** (`/^(\d{4})(-\d{2}(-\d{2})?)?$/`)
  ou um número/string de 4 dígitos. Nunca procura um ano no meio de um texto
  livre, nunca no título (FR-050).
- `normalizeAddedAt`: "0", negativo, texto ou futuro distante viram
  `undefined`.

## 2. Onde cada campo é lido

| Registro | Campo da fonte (provedor) | Vira |
|---|---|---|
| filme (`mapVodEntry`, `get_vod_streams`) | `year`; se ausente, `releaseDate`/`release_date` | `year` |
| filme | `added` | `addedAt` |
| série (`mapSeriesEntry`, `get_series`) | `year`; se ausente, `releaseDate`/`release_date` | `year` |
| série | — (`last_modified` é atualização, **nunca** inclusão) | `addedAt` ausente |
| episódio (`fetchSeriesInfo`, `get_series_info`) | `info.duration_secs`; se ausente, `info.duration` "HH:MM:SS" | `durationSeconds` |
| episódio | `info.movie_image` (via `normalizeIconUrl`) | `iconUrl` |
| M3U (qualquer tipo) | nada novo | — |

Os nomes exatos no painel real são confirmados na Fase 1 (T001,
`research.md` R1). Um nome **adicional** encontrado lá entra sem mexer no
contrato (que só fixa os nomes acima). "Recém-adicionados" em Séries fica
ausente enquanto o painel não declarar `added` para série.

## 3. Caminho até o registro

- `ClassifiedEntry` já tem `year`/`addedAt`/`durationSeconds` (stub do plan).
- `categoryLoader.ts` `toItemRecord` e `importPipeline.ts` (caminho integral
  legado do provedor, ~linha 420) copiam `year`/`addedAt` como já copiam
  `iconUrl`.
- `seriesLoader.ts` `toEpisodeRecord` copia `iconUrl` e `durationSeconds`.
- `catalogApi.ts`: `toItemOut` mapeia `year`/`added_at`; `toEpisodeOut`
  mapeia `icon_url`/`duration_seconds`.
- Campos de valor, sem índice: nenhum bump de versão do Dexie
  (`data-model.md`). Registros antigos ganham os dados quando a categoria
  (ou a série) for relida pelo fluxo normal.

## 4. Progresso do episódio (FR-041)

```
fração = progressSeconds / durationSeconds   // só quando os dois existem e durationSeconds > 0
barra  = min(fração, 1)
sem duration → texto "Continuar de mm:ss" (formatTime), sem barra
```

Filme não ganha duração nesta feature (`get_vod_streams` não a declara, e
não há consulta extra por item): o progresso de filme é sempre o texto.
