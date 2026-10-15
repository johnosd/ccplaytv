# Data Model — 058

**Dexie não muda de versão** (continua v16, a da `057`): todos os campos novos
são de valor, sem índice — mesmo padrão de `providerRating` (055) e
`accountStatus` (034).

## 1. `CatalogRecord` / `BlockItem` (`lib/catalog/db.ts`)

| Campo | Tipo | Quem grava | Regra |
| --- | --- | --- | --- |
| `archiveDays` | `number?` | `mapLiveEntry` → `toItemRecord` (canal Xtream) | Só `kind: 'channel'`. `tv_archive` igual a `1` (número ou string) **e** `tv_archive_duration` inteiro > 0 → esse número; qualquer outra coisa → ausente. Nunca em M3U avulsa. |

- `itemsSignature` (`categoryBlocks.ts`): `archiveDays` entra **só quando
  existe**, DEPOIS dos campos da 055 (D-005 da 055) — uma lista sem arquivo
  gera o mesmo vetor de antes; uma com arquivo regrava o bloco uma vez.
- `importPipeline.ts`: o caminho eager de `acquireXtreamChannels` também copia
  `archiveDays` (mesmo ponto onde copia `providerRating`).

## 2. `CatalogItemOut` (`features/catalog/catalogApi.ts`)

| Campo | Tipo | Origem |
| --- | --- | --- |
| `archive_days` | `number \| null` | `record.archiveDays ?? null` em `itemOut` |

## 3. `CatalogItemPlayback`

| Campo | Tipo | Origem |
| --- | --- | --- |
| `headers` | `PlaybackHeaders?` | `record.playbackHeaders` em `fetchPlayback` (já existe desde a 044). **Segredo**: só atravessa até `createPlayerSession` → adaptador. |

`fetchArchivePlayback` devolve o mesmo formato com `kind: 'archive'` e a URL de
arquivo (`headers` ausente: catch-up é só Xtream).

## 4. `SourceRecord` (`lib/catalog/db.ts`)

| Campo | Tipo | Quem grava | Regra |
| --- | --- | --- | --- |
| `panelTimezone` | `string?` | `markSynced`/`markAccount` a partir de `AccountStatus.clock` | `server_info.timezone` não vazio. Regravado a cada verificação que trouxer o campo. |
| `panelUtcOffsetMinutes` | `number?` | idem | `round((parse(time_now como UTC) − timestamp_now·1000) / 60 000 / 15) · 15`; só se os dois vierem válidos e o resultado ficar em −840…+840. |
| `archiveVariant` | `'rest' \| 'php'?` | `rememberArchiveVariant(sourceId, v)` depois que uma sessão de arquivo **tocou** | Ausente = tentar `rest` primeiro. Nunca gravado por falha. |

- Nenhum dos três é segredo, mas o relógio não vai para tela nem log (não há
  motivo); `SourceView` não os expõe.
- Apagados junto com a fonte (`deleteSource` já apaga o registro inteiro).

## 5. `AccountStatus` (`lib/catalog/xtreamConnector.ts`)

Ganha `clock?: { timezone?: string; utcOffsetMinutes?: number }`, lido de
`server_info` em `resolveAccountStatus` (o mesmo JSON de auth que a 034 já
lê). Ausente quando o painel não declarar.

## 6. Tipos só de reprodução (`lib/player/PlayerService.ts`, stubs do plano)

- `RequestHeaders { userAgent?, referer? }` — espelho estrutural de
  `PlaybackHeaders` (a camada de player não importa `lib/catalog`).
- `RequestHeaderName = 'User-Agent' | 'Referer'`;
  `RequestHeadersReport { applied, refused }` — só nomes.
- `PlayerTimeline { durationMs, maxPositionMs? }` — linha do tempo do EPG.
- `PlayableKind` ganha `'archive'` (capacidades de VOD).

## 7. Estado de tela (não persistido)

`LiveScreen` ganha, junto de `playing`:

```ts
archive: { program: ArchiveProgram; origin: 'guide' | 'startOver'; guideList?: GuideListKey } | null
```

Nunca persistido, nunca em histórico (FR-019).
