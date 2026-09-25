# Data Model: 014-m3u-sob-demanda

Mudanças no banco local `ccplaytv` (`tv-web/src/lib/catalog/db.ts`), da v9
para a **v10**. Sem `.upgrade()`: nenhum dado existente é convertido.

## 1. `SourceRecord` — campo novo

| Campo | Tipo | Significado |
| --- | --- | --- |
| `limitedReason` | `'protocol_unavailable' \| 'panel_unreachable' \| undefined` | Motivo do Modo limitado (FR-020). Só existe quando `providerImportMode === 'legacy_m3u'`. |

`providerImportMode` passa a valer também para `type: 'm3u_url'` (D-010):

| Situação da última importação | `providerImportMode` | `limitedReason` |
| --- | --- | --- |
| Provedor pelo protocolo | `xtream_api` | ausente |
| Provedor que caiu no caminho M3U | `legacy_m3u` | `protocol_unavailable` |
| URL M3U de painel confirmado | `xtream_api` | ausente |
| URL M3U de painel que não respondeu ao protocolo (inclui CORS bloqueado na API) | `legacy_m3u` | `protocol_unavailable` |
| URL M3U de painel inalcançável na consulta | `legacy_m3u` | `panel_unreachable` |
| URL M3U avulsa | ausente | ausente |

`markSynced` grava os dois campos a cada importação bem-sucedida, inclusive
como ausentes — hoje ele só grava `mode` quando definido, o que deixaria um
`legacy_m3u` antigo para trás (FR-023).

`SourceView` (`sourceRepository.ts`) e `SourceOut` (`importApi.ts`,
`limited_reason`) expõem `limitedReason`. Não é segredo: é categoria fixa.

## 2. `CatalogFetchMode` — valor novo

```ts
export type CatalogFetchMode =
  | 'on_demand' // provedor pelo protocolo (e URL M3U de painel confirmado)
  | 'eager'     // legado: importado integral antes da 014; só leitura
  | 'stored'    // conteúdo guardado no aparelho; lido ao entrar (014)
```

Categoria `stored`:

| Campo | Valor |
| --- | --- |
| `providerCategoryId` | ausente |
| `name`, `order` | do `group-title` e da ordem de aparição, como no caminho integral |
| `declaredCount` | contagem real de registros que a leitura vai produzir (séries contam séries, não episódios) — D-011 |
| `itemsFetchedAt` | ausente até a leitura; depois, o instante da leitura |
| `itemsCount` | ausente até a leitura; depois, igual a `declaredCount` |

Validade: enquanto durar a geração (FR-011). `isCategoryFresh` (24 h) não
se aplica a `stored`.

## 3. Tabela nova `storedEntries`

```ts
export interface StoredEntriesRecord {
  id?: number
  sourceId: string
  generation: number
  /** Id local da categoria (`categories.id`) dona destes registros. */
  categoryId: number
  /** Ordem de gravação do bloco — a leitura concatena na ordem crescente. */
  chunk: number
  /**
   * Registros prontos para `channels`, sem `id`, `sourceId`, `generation` e
   * `categoryId` (preenchidos na leitura). Inclui `directUrl` quando a fonte
   * é URL M3U avulsa, como o caminho integral grava hoje (ADR-010).
   * Episódios (`kind: 'episode'`) vêm no bloco da categoria da série (D-006).
   */
  records: StoredCatalogRecord[]
}

export type StoredCatalogRecord = Omit<CatalogRecord, 'id' | 'sourceId' | 'generation' | 'categoryId'>
```

Índices (v10):

```ts
storedEntries: '++id, [sourceId+generation], [sourceId+generation+categoryId+chunk]'
```

- `[sourceId+generation]` — descarte por geração (publicação, descarte,
  remoção da fonte).
- `[sourceId+generation+categoryId+chunk]` — leitura de uma categoria em
  ordem, e verificação de "conteúdo ausente" (`count() === 0`).

Ciclo de vida:

| Evento | Efeito em `storedEntries` |
| --- | --- |
| Varredura da importação | blocos gravados na geração nova (D-005) |
| `publishGeneration` | apaga blocos das outras gerações da fonte |
| `discardGeneration` | apaga blocos da geração descartada |
| `deleteAllForSource` (remover fonte) | apaga todos os blocos da fonte (FR-016) |
| Leitura de uma categoria | apaga os blocos daquela categoria, na mesma transação que grava os itens (D-007) |

## 4. `ImportErrorKind` — valor novo

`'storage_full'`: não coube guardar o conteúdo da lista (FR-015, D-009).
A importação falha e a geração em escrita é descartada.

## 5. `CategoryFetchOutcome` — valor novo

`'source_missing'`: categoria `stored` ainda não lida e sem nenhum bloco
(D-008). Diferente de `'failed'`, porque "Tentar de novo" não resolve —
só uma ressincronização.

## 6. O que não muda

- `channels`: mesmos campos e índices. Itens lidos do conteúdo guardado
  são idênticos aos que o caminho integral gravava (SC-005).
- `userStates`: nada.
- Categorias `eager` já gravadas continuam legíveis (D-012).
