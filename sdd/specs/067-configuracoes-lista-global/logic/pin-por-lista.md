# Lógica — PIN parental por lista (feature 067, US3)

Substitui o "um PIN por aparelho" da feature 066 (`066/logic/pin.md` §1–§3
continuam valendo para hash, sal, teclado e recuperação — só o **escopo**
muda). Decisão do usuário em 2026-10-09 (spec, Clarifications).

## 1. Dado

- Tabela nova `parentalPins` (Dexie **v21**, em `lib/catalog/dbSchema.ts`),
  chave primária `sourceId`. Registro:
  `{ sourceId, salt, hash, algorithm: 'sha256', createdAt }` — o mesmo
  formato do `ParentalPinRecord` da 066, trocando `id: 'pin'` por `sourceId`.
- A tabela antiga `parentalPin` (`id: 'pin'`) **continua declarada** em v21
  (nunca `null`): o contrato de migração escreve nela, e apagar tabela no
  Dexie dentro de um upgrade tem ordem de execução que não queremos depender.
  Depois da migração ela fica vazia para sempre.
- Acesso tipado em `lib/catalog/parentalTables.ts` (`parentalPins(database)`),
  nunca na classe `CatalogDb` (`db.ts` está no teto, R-009 da 066).
- "Controle ligado **nesta lista**" = existe registro em `parentalPins` com
  esse `sourceId`. Nada mais (sem flag separada).

## 2. API pública — `lib/parental/listPin.ts`

Assinaturas fixadas pelo stub e pelos contratos travados (067 e emendas da
066). Todas recebem `sourceId` primeiro:

| Função | Regra |
| --- | --- |
| `hasPin(sourceId, db?)` | existe registro; realinha o espelho síncrono desta lista (§3) |
| `verifyPin(sourceId, pin, db?)` | sem registro → `false`; senão `hash(sal:pin) === hash` |
| `enableParentalControl(sourceId, pin, decisions, db?)` | grava o registro **desta lista** e as decisões numa transação só (`decisions` só podem ser desta lista — ignorar/recusar as de outra) |
| `changePin(sourceId, newPin, db?)` | novo sal+hash para esta lista; bloqueios ficam |
| `disableParentalControl(sourceId, db?)` | apaga o registro desta lista e tira `locked` só das preferências **desta lista**; escondidas e `declinedSuggestion` ficam; `relockSession()` |
| `recoverPinWithSource(sourceId, input, db?)` | confere só `sources.get(sourceId)`: Xtream → usuário+senha; M3U → endereço completo. Sem rede, sem revelar campo |
| `pinActiveHint(sourceId)` | leitura síncrona do espelho (§3) |

O hash é **o mesmo** da 066 (`SHA-256` de `` `${salt}:${pin}` ``, hex, via
`crypto.subtle` com reserva `sha256Hex`) — a migração copia sal+hash sem
recalcular, então mudar o esquema de hash quebraria todo PIN migrado.
`hashPin`/`pinRecord` podem ficar em `pin.ts` (exportados) ou mudar para
`listPin.ts`; as funções **globais** de `pin.ts` (`hasPin()`, `verifyPin(pin)`,
`enableParentalControl(pin, …)`, `changePin(pin)`, `disableParentalControl()`,
`recoverPinWithSource(input)`, `pinActiveHint()`) **saem** — nenhuma tela pode
continuar chamando o PIN sem dizer a lista. `CategoryDecision`/`RecoveryInput`
podem mudar de arquivo; `listPin.ts` os reexporta.

## 3. Espelho síncrono (herdeiro do R-013 da 066)

`DeleteSourceModal` decide na hora se pede PIN (contratos 023/026: sem PIN,
Excluir remove no mesmo toque). O espelho vira **por lista**:

- chave `ccplay.parental.pinSources` em `localStorage`, valor = JSON de um
  array de `sourceId` com PIN (só ids; nunca PIN/hash);
- escrito por `enableParentalControl`/`disableParentalControl`/exclusão da
  lista e realinhado por `hasPin(sourceId)` e por uma função
  `syncPinHints(db?)` chamada ao abrir o app (`useCategoryAccessLifecycle`,
  no lugar do `hasPin()` global de hoje);
- só o banco padrão (`database === db`) escreve, como hoje;
- a chave antiga `ccplay.parental.pinActive` é removida por `syncPinHints`.

## 4. Migração (FR-024, SC-005) — `lib/parental/pinMigration.ts`

`migrateLegacyPin(source: TableSource)`, idempotente, chamada no
`.upgrade()` da v21 com a `Transaction` (`tx.table(nome)`) — assim roda
**antes de qualquer leitura**, e nenhuma categoria fica desbloqueada nem por
um instante. Os testes a chamam com o `CatalogDb` aberto.

```
legado = parentalPin.get('pin')
se não existe: retorna (idempotente)
para cada source em sources:
  gen = source.activeGeneration
  categorias = categories onde sourceId = source.id e generation = gen
  prefs = categoryPreferences onde sourceId = source.id (mapa kind|matchKey)
  bloqueada(c) =
    pref?.locked !== undefined ? pref.locked
    : pref?.declinedSuggestion !== true && isAdultCategoryName(c.name)
  se alguma pref tem locked === true  OU  alguma categoria é bloqueada(c):
    parentalPins.put({ sourceId: source.id, salt: legado.salt, hash: legado.hash,
                       algorithm: legado.algorithm, createdAt: legado.createdAt })
parentalPin.delete('pin')
```

- A regra `bloqueada(c)` é **exatamente** o `savedLock` de
  `categoryAccess.ts` com o controle ligado — reaproveite a mesma função, não
  reescreva (o contrato confere nome adulto sem decisão, recusada e liberada).
- `pref.locked === true` vale mesmo se a categoria não estiver na geração
  ativa (ainda protege quando ela voltar).
- **Ciclo de import**: `dbSchema.ts` (carregado por `db.ts`) → `pinMigration.ts`
  → `categoryAccess.ts` → `db.ts`. Para não depender da ordem de avaliação,
  mova `isAdultCategoryName` + `ADULT_NAME` + o cálculo de `savedLock` sem
  `Rule` para um módulo puro (ex.: `lib/catalog/adultCategory.ts`, sem
  importar `db.ts`), e faça `categoryAccess.ts` e `pinMigration.ts`
  importarem de lá. Conferido no plano: `categoryMatchKey` vem de
  `structureDiff.ts` (só `import type` de `db.ts` — seguro); mas
  `normalizeForSearch` vem de `catalogSearch.ts`, que importa `db.ts`,
  `catalogRepository.ts` e `categoryAccess.ts` — mova `normalizeForSearch`
  (função pura) para o módulo puro também, com `catalogSearch.ts`
  reexportando-a para não mexer nos outros chamadores.

## 5. Quem usa o PIN, e como passa a saber a lista

| Ponto | Hoje (066) | 067 |
| --- | --- | --- |
| `categoryAccess.loadRule` | `parentalPin.get('pin')` | `parentalPins.get(sourceId)` |
| `unlockWithPin(sourceId, pin)` | `verifyPin(pin)` | `verifyPin(sourceId, pin)` |
| `ParentalGate` (rota de editar lista) | `hasPin()` | recebe `sourceId?`; ausente (adicionar lista) → abre direto (FR-021) |
| `withParentalGate` (`navigation/routeModules.ts`) | sempre | passa `props.existingSource?.id` ao gate |
| `DeleteSourceModal` | `pinActiveHint()`, `verifyPin(pin)` | `pinActiveHint(source.id)`, `verifyPin(source.id, pin)` |
| `ParentalPinPrompt` / `RecoverPinFlow` | recuperação contra qualquer lista | recebem `sourceId` e chamam `recoverPinWithSource(sourceId, …)`, `changePin(sourceId, …)` |
| `LockedCategoryState` | `onUnlock(pin)` | recebe `sourceId` (para o "Esqueci o PIN"); `liveColumns.tsx` está no teto — troque a prop sem linha nova |
| Aba de categorias (`tabs/ParentalTab.tsx` → Configurações da lista) | `hasPin()`, `enableParentalControl(pin, …)` | tudo com o `sourceId` da tela; chave de consulta do PIN inclui o `sourceId` |
| `ParentalFlow` | `verifyPin(pin)`, `changePin(pin)`, `disableParentalControl()` | idem com `sourceId` (a prop já existe) |
| `deleteSource` (`sourceRepository.ts`, teto 409) | mantém o PIN | apaga `parentalPins` da lista (FR-025) — troque o comentário da 066 pela linha, sem crescer o arquivo |

## 6. O que NÃO muda

Desbloqueio de sessão (`unlockedSourceId`, só a lista ativa, rebloqueia ao ir
para segundo plano/fechar/trocar de lista); teclado/teclas numéricas; PIN
incorreto sem limite; nada de PIN em log/erro/tela; sugestão adulta
(`SuggestionStep` já recebe `sourceId`).
