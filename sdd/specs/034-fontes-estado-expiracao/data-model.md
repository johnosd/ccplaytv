# Data Model — 034 Fontes IPTV completas

## §1 `SourceRecord` (tabela `sources`, Dexie v12 — **sem mudança de versão**)

Campos novos, todos opcionais e sem índice:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `accountStatus` | `'active' \| 'expired' \| 'refused'` | Ausente = nunca verificada. Só para fonte em `providerImportMode: 'xtream_api'`. |
| `accountExpiresAt` | `number \| null` | ms. `null` = painel declarou sem data (`exp_date` 0/negativo/vazio/não numérico). Ausente = desconhecido. |
| `accountCheckedAt` | `number` | Última resposta do painel (sincronização ou consulta leve), inclusive recusa. Falha de rede/tempo esgotado **não** atualiza. |
| `lastUnavailableSections` | `CatalogSection[]` | Seções que não responderam na última sincronização bem-sucedida. Regravado sempre em `markSynced` (inclusive `[]`). |

Fontes antigas não têm nenhum desses campos: o primeiro "escolher lista"
dispara a consulta leve (decisão `check`), e a próxima sincronização grava
tudo. Não há migração.

## §2 Visões (`SourceView` → `SourceOut`)

`account?: { status?: AccountStatusKind; expiresAt?: number | null;
checkedAt?: number }` — cópia direta dos três campos; e
`unavailable_sections?: CatalogSection[]` em `SourceOut`. Nenhum campo de
credencial entra (a desestruturação explícita de `toView` continua sendo a
fronteira).

## §3 Estado derivado (nunca persistido)

- **Sincronizando**: store em memória de `importApi.ts`, por `sourceId`.
- **Exibição da conta**: `describeAccount(account, now)` (`logic/conta-da-fonte.md` §2).
- **Decisão de acesso**: `decideSourceAccess(source, now)` (§3).
- **Contagem**: `useCatalogCounts(sourceId)` + `lastUnavailableSections` (§6).

## §4 Navegação (`appNav.ts`)

Novo membro de `AppScreen`:

```ts
| { name: 'source-access'; source: SourceOut; decision: Exclude<AccessDecision, { action: 'open' }> }
```

Nenhuma ação nova no redutor: `open` (empilha) e `back` já cobrem o fluxo.
