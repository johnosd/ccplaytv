# Data Model: Orçamento de armazenamento do app na TV (082)

Duas **tabelas novas** pedem **uma versão nova** do Dexie (`db.ts` + `dbSchema.ts`): `categoryChunks` e `epgChunks`. Os
campos novos em registros existentes não têm índice.

## Tabelas novas

| Tabela | Chave / índices | Campos |
| --- | --- | --- |
| `categoryChunks` | `[categoryId+chunk]`; `[sourceId+generation]` | `categoryId`, `sourceId`, `generation`, `chunk` (0..n-1 itens; **-1** = índice de identidade), `start`, `count`, `bytes: Uint8Array` (gzip do JSON enxuto) |
| `epgChunks` | `[sourceId+generation+channelKey]`; `[sourceId+generation]` | `sourceId`, `generation`, `channelKey`, `from`, `to`, `count`, `bytes: Uint8Array` (gzip dos programas do canal na janela) |

## Campos novos

| Registro | Campo | Significado |
| --- | --- | --- |
| `CategoryBlockRecord` | `format?: 2` | Cabeçalho do formato comprimido (sem `items`). Ausente = formato atual, com `items` |
| `CategoryBlockRecord` | `shared?`, `count?`, `chunkCount?`, `storedBytes?`, `revision?` | Campos comuns, contagem, pedaços, bytes gravados e versão da gravação (concorrência otimista, `logic/formato-comprimido.md` §4) |
| `CategoryRecord` | `storedBytes?` | Bytes gravados dos itens da categoria (conta própria) |
| `CategoryRecord` | `lastUsedAt?` | Último uso persistido (no máximo 1×/h) |
| `SourceRecord` | `lastActivatedAt?` | Última vez que virou a lista ativa |
| `SourceRecord` | `epgStoredBytes?` | Bytes do guia no formato novo |

`items` passa a ser **opcional** em `CategoryBlockRecord`: ele existe só no formato antigo.

## Estados de uma categoria `on_demand`

```
não obtida ──obtenção──▶ formato 2 (cabeçalho + pedaços)      formato antigo (items; + projeção 065 se ≥ 1000)
    ▲                         │                                     │  conversão em segundo plano
    └──liberada pelo orçamento┘◀────────────────────────────────────┘  (housekeeping, uma por vez)
```

Liberada = igual a nunca obtida. Ao ser obtida de novo, os ids são os mesmos (`blockItemId`).

## Saem de uso (lidos só como fallback, até a conversão)

- `catalogReadManifests` e `catalogReadChunks` (projeção 065): apagados categoria a categoria.
- `epgPrograms`: apagado na próxima troca de geração do guia.

As tabelas continuam declaradas no Dexie: removê-las exigiria outra versão. Um ADR futuro pode retirá-las quando não
houver mais TVs com dados antigos.

## O que nunca é liberado

`userStates`, `seriesWatch*`, `categoryPreferences`, PIN, `sources` (e a configuração de EPG), `portalDevice`,
`licenseCache`, `localTrial` e `networkDiagnostics`; as categorias `eager`/`stored` e `storedEntries` (M3U); e as
categorias protegidas (`logic/orcamento.md` §4).
