# Data Model — 039

## Dexie v14 (sobe de v13)

Tabela nova:

```ts
categoryBlocks: 'categoryId, [sourceId+generation+kind]'
```

```ts
interface CategoryBlockRecord {
  categoryId: number                 // chave: id local da categoria (único no banco)
  sourceId: string
  generation: number
  kind: 'channel' | 'movie' | 'series'
  groupOrder: number                 // = categories.order
  items: BlockItem[]                 // ordem da fonte
}
```

`BlockItem` = campos de `CatalogRecord` sem `sourceId`, `generation`, `kind`,
`groupOrder`, `categoryId`, `categoryPosition` (reidratados na leitura), com
`id: number` **negativo** (`logic/blocos-e-identidade.md` §3).

Nada muda nas demais tabelas. `channels` continua existindo:

- **episódios** (todos os formatos) — como hoje;
- **formato antigo** de categorias ainda não convertidas — lido como reserva,
  apagado pela conversão;
- `storeBatch` (caminho `eager` legado) — como hoje.

`categories` já tem `itemsFetchedAt`, `itemsCount`, `itemsSignature` (038) —
continuam valendo para os blocos.

## Identidade

| Tipo de item | Identidade | Onde aparece |
| --- | --- | --- |
| Série | `s:<seriesId>` | id do bloco, casamento na renovação |
| Canal/filme do provedor | `p:<providerStreamId>` | idem |
| M3U sem id | `n:<originalName>` (repetidos por ordem) | idem |

`stableId` do usuário (favoritos, progresso, histórico) **não muda** — é
fonte + tipo + id estável, independente do id local.

## Migração v13 → v14

Só acrescenta a tabela (nenhum dado é movido no upgrade do Dexie). A
conversão das categorias acontece depois, em segundo plano
(`convertLegacyCategories`), uma categoria por vez.
