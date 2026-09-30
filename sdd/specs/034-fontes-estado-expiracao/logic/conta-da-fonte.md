# Lógica: conta da fonte, acesso à lista e estado exibido

Feature `034-fontes-estado-expiracao`. Contratos travados que dependem deste
documento: `sourceAccount.fontes-estado.contract.test.ts`,
`accountCheck.fontes-estado.contract.test.ts`,
`importPipeline.fontes-estado.contract.test.ts`,
`SourceAccessGate.fontes-estado.contract.test.tsx`.

## §1 Dados guardados (em `SourceRecord`, sem índice)

| Campo | Significado | Quem grava |
| --- | --- | --- |
| `accountStatus` | `'active' \| 'expired' \| 'refused'`; ausente = nunca verificada | sincronização (§7) e consulta leve (§4) |
| `accountExpiresAt` | ms; `null` = painel declarou "sem data"; ausente = desconhecido | idem |
| `accountCheckedAt` | instante da última resposta do painel (inclusive recusa) | idem |
| `lastUnavailableSections` | `CatalogSection[]` da última sincronização bem-sucedida | `markSynced` |

`SourceView.account` / `SourceOut.account` expõem `{ status, expiresAt,
checkedAt }` — nenhum desses campos é segredo. `deleteSource` já apaga o
registro inteiro (FR-021 sai de graça; um teste confirma).

**Nunca** subir a versão do Dexie por isto: campos sem índice não exigem.

## §2 `parseExpDate` e `describeAccount(account, now)`

`parseExpDate(raw)`: `null`, `undefined`, `''`, número/string ≤ 0, ou não
numérico → `null`. Senão `Number(raw) * 1000`. (Mesma regra que o
`isExpired` atual de `xtreamConnector.ts` — que passa a usar esta função.)

`describeAccount` (ordem importa):

1. `account` ausente ou sem `status` → `{ kind: 'unknown' }` (nada a mostrar).
2. `status === 'refused'` → `{ kind: 'refused', text: 'Credencial inválida',
   chip: { tone: 'error', label: 'Credencial inválida' } }`.
3. `status === 'expired'`, **ou** `expiresAt` numérico `<= now` →
   `{ kind: 'expired', text: 'Conta expirada em DD/MM/AAAA' (sem data se
   desconhecida: 'Conta expirada'), chip: { tone: 'error', label: 'Conta
   expirada' } }`.
4. `expiresAt === null` → `{ kind: 'no_expiry', text: 'Sem data de
   vencimento' }`.
5. `expiresAt === undefined` (verificada sem data conhecida) → `unknown`.
6. `daysLeft` = diferença em **dias de calendário local** entre a data de
   `now` e a data de `expiresAt` (meia-noite local de cada uma; nunca
   `Math.ceil(ms / dia)`, que erra perto da meia-noite).
   - `daysLeft <= ACCOUNT_WARNING_DAYS (7)` → `{ kind: 'expiring', text:
     'Conta válida até DD/MM/AAAA', chip: { tone: 'warning', label } }`, com
     `label` = `'Vence hoje'` (0), `'Vence amanhã'` (1) ou `'Vence em N
     dias'`.
   - senão → `{ kind: 'valid', text: 'Conta válida até DD/MM/AAAA' }`, sem
     chip.

Data: `toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit',
year: 'numeric' })` no fuso local — é um instante, não uma data sem hora (o
bug de fuso corrigido na 026 era outro caso).

## §3 `decideSourceAccess(input, now)` e `accessFromAccount(input, now)`

`decideSourceAccess`:

1. `provider_import_mode !== 'xtream_api'` → `{ action: 'open' }` (M3U
   avulsa, Modo limitado, nunca sincronizada — FR-022).
2. `account?.checkedAt` ausente, ou `now - checkedAt > ACCOUNT_CHECK_MAX_AGE_MS`
   → `{ action: 'check' }`.
3. senão → `accessFromAccount(input, now)`.

`accessFromAccount` (só o dado guardado, usado também quando a consulta
falha):

- `status === 'refused'` → `{ action: 'blocked', reason: 'refused' }`.
- `status === 'expired'` ou `expiresAt` numérico `<= now` → `{ action:
  'blocked', reason: 'expired', expiresAt }` (o campo `expiresAt` vem igual ao
  guardado, inclusive `undefined`/`null` — o contrato compara com `toEqual`).
- senão → `{ action: 'open' }`.

Falha de rede nunca impede sozinha (constitution 1.7.0): sem `status`
guardado, `accessFromAccount` abre.

## §4 `checkSourceAccount(sourceId, options)`

```
record = database.sources.get(sourceId)
stored = { status, expiresAt, checkedAt } do record   // só campos definidos
credential = readCredential(sourceId, database)
se !credential → { fresh:false, reason:'no_credential', account: stored }

controller = new AbortController()
timer = setTimeout(() => controller.abort(), timeoutMs ?? ACCOUNT_CHECK_TIMEOUT_MS)
resultado = Promise.race([
  resolveAccountStatus(dns, user, pass, now(), { signal: controller.signal }),
  promessa que rejeita com TimeoutMarker ao disparar o mesmo timer,
])
```

- O `race` é obrigatório: um `fetch` que ignora o sinal (o contrato simula
  isso) nunca pode prender a tela. `clearTimeout` no `finally`.
- `AccountStatus` ganha `expiresAt: number | null` (via `parseExpDate`) —
  mudança aditiva; `resolveAccountStatus` ganha um 5º parâmetro opcional
  `{ signal?: AbortSignal }` repassado a `fetchJsonDirect`.
- Mapeamento:
  - resolveu → `status = !authorized ? 'refused' : expired ? 'expired' :
    'active'`; grava `accountStatus/accountExpiresAt/accountCheckedAt = now()`;
    devolve `{ fresh: true, account }`.
  - `ProviderError('invalid_credentials')` → grava `refused` (com
    `checkedAt`), `fresh: true`.
  - timeout → `{ fresh: false, reason: 'timeout', account: stored }`.
  - qualquer outra falha (rede, CORS, incompatível) → `{ fresh: false,
    reason: 'network', account: stored }`.
- Nunca grava nada quando `fresh: false`. Nunca registra o erro cru em log
  (a URL tem a senha): no máximo `logger.warn` com o `reason`.

`importApi.ts` expõe `useCheckSourceAccount()` (mutation) que chama isto e
invalida `['sources']` quando `fresh`.

## §5 Tela de acesso (`SourceAccessGate`) e navegação

**Quando monta.** `App.chooseSource(source)` calcula
`decideSourceAccess(source, Date.now())`:

- `open` → comportamento atual (`choose-source` + `openSource.mutate`).
- `check` ou `blocked` → `dispatch({ type: 'open', screen: { name:
  'source-access', source, decision }, from: { name: 'profiles', mode,
  focusSourceId: source.id } })`. `mode` é o da tela de perfis atual (o App
  lê do `screen` corrente). O redutor ganha só o **tipo** novo de tela — a
  ação `open` existente já empilha (sem ação nova, para não mexer no
  contrato travado da 023).

`chooseSource` é também o caminho de `openImportedSource`; depois de uma
importação bem-sucedida a conta acabou de ser verificada, então a decisão é
`open` sem tela extra.

**Estados da tela.**

| Estado | Conteúdo | Ações (linha horizontal, foco inicial) |
| --- | --- | --- |
| `checking` (decisão `check`) | "Verificando a conta da lista…" + `Spinner` | `Voltar` (focado) — FR-024 |
| `blocked` `expired` | "A assinatura desta lista venceu em DD/MM/AAAA." (sem data: "A assinatura desta lista venceu.") | `Editar lista` (focado), `Verificar de novo`, `Voltar` |
| `blocked` `refused` | "O provedor recusou o usuário ou a senha desta lista." | idem |
| `rechecking` (depois de "Verificar de novo") | mesma mensagem + `Spinner`; botões continuam focáveis | idem |

- Com a consulta não confirmada (`fresh: false`) e decisão final
  `blocked`, acrescenta a linha "Não foi possível confirmar agora — o
  aparelho está sem conexão com o provedor." (FR-011).
- `checking` → ao terminar: `accessFromAccount({ provider_import_mode,
  account: result.account })`; `open` → `onOpen(source)`; `blocked` → estado
  `blocked`.
- "Verificar de novo" → `checkAccount(source.id)`; resultado `open` →
  `onOpen(source)`; senão fica em `blocked` (motivo atualizado).
- Segunda seleção enquanto uma consulta está em voo é ignorada
  (single-flight — mesmo padrão da 011/033, nunca enfileirar).
- Foco é estado (ADR-009): `useRemoteNav` com ←/→ entre os botões, OK
  executa, RETURN = `onBack`. `Button` com `focused`.
- Título: o `display_name` da lista. Nenhum `provider_dns`, URL, usuário ou
  senha em texto, `aria-*` ou `title`.
- `onOpen(source)` no App → `dispatch({ type: 'choose-source', source })` +
  `openSource.mutate` (a mesma função interna que o caminho `open` usa —
  extrair `enterSource(source)` para não duplicar).
- `onEdit(source)` → `open` `edit-source` a partir da tela de acesso. Voltar
  da edição retorna à tela de acesso, que **remonta** e refaz a decisão a
  partir do `source` mais novo de `['sources']` (o App passa a versão atual
  da lista de fontes, como já faz com `currentSource`).

## §6 Estado exibido na linha e no cartão

`features/sources/sourceFormat.ts`:

- `formatStatus(source, { syncing } = {})`:
  `syncing` → `'Sincronizando'`; `account.status === 'refused'` →
  `'Credencial inválida'`; senão o texto atual.
  (`'Conta expirada'` fica no chip/linha de conta, não substitui a data da
  última sincronização — assim a pessoa vê as duas coisas.)
- `formatAccount(source, now)` → `describeAccount(source.account, now).text`
  só quando `provider_import_mode === 'xtream_api'`; `undefined` senão.
- `sourceAlertChips(source, now, { syncing })` — **só** para o cartão
  (FR-006), na ordem: chip da conta (`expiring`/`expired`/`refused`),
  `{ tone:'error', label:'Erro na última sincronização' }` quando
  `connection_state === 'error'` e a conta não é `refused`, `{ tone:'error',
  label:'Erro no EPG' }` quando `epg.state === 'error'`.
- "Sincronizando": `useSourceSyncing(sourceId)` em `importApi.ts`, um store
  em memória (`useSyncExternalStore`, mesmo padrão de `useEpgSyncing`)
  alimentado por `startLocalImport` (entra no início, sai no `finally`).
  Nunca persistido.
- Contagem (`formatCounts(counts, unavailable)`, só na linha de
  Configurações), a partir de `useCatalogCounts(source.id)` (já existe em
  `catalogApi.ts`, hoje sem consumidor) e de `lastUnavailableSections`:
  - por tipo, na ordem canais → filmes → séries;
  - tipo em `unavailable` → `'filmes não obtidos'` / `'séries não obtidas'`;
  - `items` definido → `'1.200 canais'` (`toLocaleString('pt-BR')`);
  - senão `categories > 0` → `'41 categorias de canais'`;
  - `categories === 0` e não indisponível → tipo omitido (FR-018);
  - quando **todas** as partes presentes são de categorias, as seguintes à
    primeira encurtam para `'20 de filmes'`, `'30 de séries'` (US4 AC1:
    `'41 categorias de canais · 20 de filmes · 30 de séries'`);
  - partes unidas por `' · '`.

## §7 Sincronização grava a conta

Em `importPipeline.ts`, nos dois pontos que chamam `resolveAccountStatus`
(fonte por credencial e `confirmPanel` da URL M3U de painel):

- guardar o `AccountStatus` numa variável da execução;
- **sucesso** → `markSynced` recebe `account: { status: 'active', expiresAt,
  checkedAt: now() }` e `unavailableSections: run.unavailableSections ?? []`;
- `subscription_expired` → antes de lançar, `markAccount(sourceId, { status:
  'expired', expiresAt, checkedAt: now() })`;
- `invalid_credentials` (pela resposta ou por 401/403 lançado pelo conector)
  → em `fail()`, `markAccount(sourceId, { status: 'refused', checkedAt:
  now() })`.

`markAccount` é uma função nova de `sourceRepository.ts`; **não** toca
`connectionState`, `activeGeneration` nem o catálogo (constitution 1.7.0:
estado local preservado). Modo limitado (`legacy_m3u`) não grava conta.
O pipeline roda no Worker: Dexie funciona igual lá — nada de estado em
memória da thread principal aqui.
