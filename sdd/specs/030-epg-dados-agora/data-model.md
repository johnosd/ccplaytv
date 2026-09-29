# Data Model — 030-epg-dados-agora

Tudo em IndexedDB via Dexie (`tv-web/src/lib/catalog/db.ts`). Uma versão
nova, **v11**, só para a tabela nova. Campos novos em registros existentes
são de valor, sem índice — não exigem bump (mesmo padrão de `iconUrl`,
feature 015 D-009).

## 1. `SourceRecord` — campos novos (estado e configuração do EPG)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `epgManualUrl` | `string?` | Endereço XMLTV informado pela pessoa (FR-016). Tem precedência (FR-001). **Segredo potencial** (pode carregar token) — regra ADR-010: nunca em log, tela, erro, terceiro. |
| `epgDeclaredUrl` | `string?` | `url-tvg`/`x-tvg-url` do cabeçalho M3U, gravado por `markSynced` a cada importação M3U (inclusive como ausente — o cabeçalho pode ter perdido o atributo). Mesma regra de segredo. |
| `epgOffsetHours` | `number?` | Deslocamento manual −12…+12, inteiro. Ausente = 0. Aplicado só na leitura. |
| `epgDisabled` | `boolean?` | `true` = EPG desativado pela pessoa (FR-021). |
| `epgLastSyncAt` | `number?` | Última sincronização **bem-sucedida**. Não avança em falha (FR-005). |
| `epgLastErrorKind` | `EpgErrorKind?` | Categoria da última falha; apagado no próximo sucesso. Nunca mensagem crua. |
| `epgLastErrorAt` | `number?` | Quando a última falha aconteceu. |
| `epgActiveGeneration` | `number?` | Geração publicada em `epgPrograms`. |
| `epgIdsCapturedAt` | `number?` | Marca que a última importação já captura id de EPG dos canais e o `url-tvg` (R6 do research). Ausente numa fonte sincronizada → migração única ao abrir (`decideOnOpen`, D-007). |

**Endereço do painel não é guardado**: é derivado na hora de
`readCredential` (fonte de provedor ou URL M3U de painel), igual à URL de
reprodução. Nada é copiado para outro campo.

### `SourceView` (o que as telas veem)

Continua **sem** URL nenhuma (`toView` é desestruturação explícita). Ganha só:

- `epg: EpgStatus` — derivado de forma pura do registro (`epgStatusOf(record)`,
  mesma função que `getEpgStatus` usa);
- `epgManualHost?: string` — só o **hostname** do endereço manual, para o
  painel dizer "Endereço informado por você (exemplo.com)" sem nunca mostrar
  caminho, query ou credencial (FR-017).

Derivação de `EpgStatus.state`:

1. `epgDisabled` → `disabled`
2. nenhum endereço resolvível (sem manual, sem credencial de painel, sem
   declarado) → `not_configured`
3. `epgLastErrorKind` definido **e** (`epgLastSyncAt` ausente **ou**
   `epgLastErrorAt > epgLastSyncAt`) → `error`
4. `epgLastSyncAt` definido → `linked`
5. senão → `never_synced`

`urlOrigin`: `manual` se houver manual; senão `panel` se `readCredential`
resolveria (fonte de provedor, ou `m3uUrl` com formato de painel —
`parsePanelUrl`); senão `playlist` se houver declarado.

## 2. Tabela nova `epgPrograms` (v11)

```ts
interface EpgProgramRecord {
  id?: number
  sourceId: string
  generation: number
  channelKey: string   // <programme channel="…">, exato, nunca vazio
  start: number        // epoch ms, fuso do XMLTV resolvido (sem deslocamento)
  end: number
  title: string        // nunca vazio
  description?: string // truncada em 600 caracteres na gravação
}
```

Índices: `'++id, [sourceId+generation], [sourceId+generation+channelKey+start]'`

- `[sourceId+generation]` — descarte de geração/fonte.
- `[sourceId+generation+channelKey+start]` — leitura por canal, em ordem.

**Substituição por geração** (`writeEpgPrograms`): nova geração =
`(epgActiveGeneration ?? 0) + 1`; grava em lotes de 2.000 (`bulkAdd`);
terminado, uma transação troca `sources.epgActiveGeneration` e apaga as
gerações antigas daquela fonte. Falha no meio → apaga só a geração parcial,
a ativa continua intacta (FR-005). `QuotaExceededError` vira
`storage_full`.

## 3. `CatalogRecord` / `StoredCatalogRecord` — campo novo

| Campo | Tipo | Significado |
| --- | --- | --- |
| `epgChannelId` | `string?` | `epg_channel_id` (Xtream) ou `tvg-id` (M3U), `trim()`, vazio → ausente. Só `kind: 'channel'`. |

Exposto às telas como `CatalogItemOut.epg_channel_id` (`toItemOut`).

## 4. Janela guardada

`from = syncAt − 12 h − |offset|`, `to = syncAt + 48 h + |offset|` (offset em
horas da fonte no momento da sincronização). Um programa entra se
`end > from && start < to` (sobreposição). Mudar o deslocamento depois pode
deixar as bordas um pouco curtas até a próxima sincronização — aceito (D-004).

## 5. Estado em memória (não persistido)

`epgRunner.ts` (thread principal): `Map<sourceId, Promise<SyncEpgResult>>` —
single-flight (FR-010) e fonte do estado "Sincronizando EPG"
(`useEpgSyncing(sourceId)` via `useSyncExternalStore`).
