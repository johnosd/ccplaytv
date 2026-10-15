# Data Model — 066 Gestão de categorias e controle parental

Banco: `CatalogDb` (Dexie, `tv-web/src/lib/catalog/db.ts`). Versões novas vão em
`tv-web/src/lib/catalog/dbSchema.ts` (`registerLateCatalogSchemas`). Última hoje: **v19**. Esta
feature usa **v20**, só com tabelas novas (sem `.upgrade()`).

```ts
db.version(20).stores({
  categoryPreferences: '[sourceId+kind+matchKey], sourceId',
  parentalPin: 'id',
})
```

## `categoryPreferences` (nova)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `sourceId` | string | lista; índice para apagar junto com a lista (`deleteSource`, FR-005) |
| `kind` | `'channel' \| 'movie' \| 'series'` | seção; o `category_id` do Xtream se repete entre seções |
| `matchKey` | string | `categoryMatchKey(providerCategoryId, name)` — `p:<id>` ou `n:<nome>` |
| `hidden` | boolean? | ausente = visível |
| `locked` | boolean? | ausente = decide a regra do nome adulto; `false` explícito = liberada pela pessoa |
| `declinedSuggestion` | boolean? | a pessoa recusou a sugestão adulta (FR-024) |
| `updatedAt` | number | |

Uma linha só existe quando a pessoa (ou a confirmação da sugestão) decidiu algo. Categoria removida
pela lista: a linha fica (a categoria pode voltar — edge case da spec); só sai com a lista.

## `parentalPin` (nova)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `'pin'` | registro único |
| `salt` | string (hex, 32 chars) | aleatório por gravação |
| `hash` | string (hex, 64 chars) | SHA-256(`salt:pin`) |
| `algorithm` | `'sha256'` | para trocar no futuro sem ambiguidade |
| `createdAt` | number | |

Existir o registro = controle parental ligado.

## Estado em memória (não persiste)

- `unlockedSourceId: string | null` em `categoryAccess.ts` — sessão desbloqueada. Some ao ir para
  segundo plano, trocar de lista, fechar o app, desligar o controle.

## Limpeza

- `deleteSource(id)` (`lib/catalog/sourceRepository.ts`): acrescentar
  `categoryPreferences.where('sourceId').equals(id).delete()`.
- `disableParentalControl()`: apaga `parentalPin` e faz `locked = undefined` em todas as linhas
  (mantém `hidden` e `declinedSuggestion`).
- Nenhuma das duas tabelas entra em exportação/backup (não existe hoje) nem em log.
