# Handoff — 034-fontes-estado-expiracao

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. App da TV em `tv-web/` (React 19 + TS + Vite, alvo `chrome108`; Dexie hoje **v15**; foco por estado via `useRemoteNav`, ADR-009; client-first, ADR-008).
- Próximo comando: `/sdd-execute 034-fontes-estado-expiracao`.
- Backlog: item 46; a feature passa a `Planejada`, 0/45 tarefas. O `tasks.md` **não existia** (o `sdd-plan` de 30/09 parou antes dele); esta sessão o escreveu e revalidou o plano contra a deriva das features 037/038/039/041 (R-005–R-007 em `plan.md`).
- Nada fora da pasta da feature mudou em disco nesta sessão. As travas dos 5 contratos seguem íntegras (hash de 30/09).

## O que a feature entrega

- **US1 (P1)** Vencimento da conta Xtream na linha de Configurações › Fontes IPTV ("Conta válida até DD/MM/AAAA", chip âmbar `Vence em N dias`/`Vence hoje`/`Vence amanhã`, chip de erro `Conta expirada`, "Sem data de vencimento") e **um chip só quando há o que fazer** no cartão de "Quem está assistindo?".
- **US2 (P1)** Escolher uma lista com conta vencida ou credencial recusada **não abre o Início**: tela de acesso com o motivo e Editar lista · Verificar de novo · Voltar (foco inicial em "Editar lista"). Consulta leve ao painel no máximo a cada 24 h, com limite de 5 s; falha de rede **sozinha nunca impede** (constitution 1.7.0), mas dado guardado vencido/recusado bloqueia mesmo offline.
- **US3 (P2)** "Sincronizando" na linha e no cartão enquanto a sincronização roda; "Credencial inválida" no lugar do "Erro" genérico.
- **US4 (P3)** Contagem real na linha ("41 categorias de canais · 20 de filmes · 30 de séries"; M3U guardada com totais de itens; tipo sem categoria omitido, seção sem resposta "não obtida", **nunca "0"**).
- Fora de escopo (decisão do usuário): conexões, conta de teste, total real de itens Xtream, aviso de vencimento no Início/player, vencimento para M3U avulsa/Modo limitado, códigos `SRC-401` (item 19).
- TV física: **recomendada, não gate**.

## Leitura obrigatória, em ordem

1. `spec.md` — 4 stories, FR-001…024, SC-001…006.
2. `plan.md` — D-001…D-009 (invariantes), R-001…R-007 (R-005–R-007 são a deriva), Estratégia de Testes (contratos e vermelhos).
3. `tasks.md` — 7 fases; a 2 fecha C1–C4, a 4 fecha C5.
4. `logic/conta-da-fonte.md` — o "como": regras de `describeAccount`/`decideSourceAccess`, `checkSourceAccount` (com `Promise.race`), tela de acesso, `formatStatus`/`formatCounts`, o que a sincronização grava.
5. `data-model.md` — campos novos de `SourceRecord`, visões `SourceView`/`SourceOut`, o novo membro de `AppScreen`.
6. `quickstart.md` — os 7 cenários do E2E e os itens transversais.
7. `.planning/memory/constitution.md` (v1.7.0, exceção de "Sem Conta Obrigatória" já escrita).

## Testes de contrato

- `tv-web/src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts` — 2 testes (C1, C2 → Fase 2).
- `tv-web/src/lib/catalog/accountCheck.fontes-estado.contract.test.ts` — 1 (C3 → Fase 2).
- `tv-web/src/lib/catalog/importPipeline.fontes-estado.contract.test.ts` — 1 (C4 → Fase 2).
- `tv-web/src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx` — 1 (C5 → Fase 4).
- Rodar (de `tv-web/`): `npx vitest run src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts src/lib/catalog/accountCheck.fontes-estado.contract.test.ts src/lib/catalog/importPipeline.fontes-estado.contract.test.ts src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 034-fontes-estado-expiracao`
- Vermelhos hoje: `Error: not implemented` (C1, C2, C3, C5) e `expected undefined to deeply equal { status:'active', … }` (C4). São **os 5 testes que aparecem vermelhos na suíte completa** desde a 040; fecham ao executar a feature.
- Travas de outras features em jogo: 023/024 (`appNav` — **não** adicionar ação nova no redutor, só um membro de `AppScreen`, D-008), 026/028 (Configurações, acessibilidade), 037 (cartão da lista).

## Stubs criados

- `tv-web/src/lib/catalog/sourceAccount.ts` — tipos e constantes **reais** (`SourceAccount`, `AccessDecision`, `ACCOUNT_WARNING_DAYS=7`, `ACCOUNT_CHECK_MAX_AGE_MS`, `ACCOUNT_CHECK_TIMEOUT_MS=5000`); as 4 funções lançam `not implemented` (T002).
- `tv-web/src/lib/catalog/accountCheck.ts` — tipos reais, `checkSourceAccount` lança (T004).
- `tv-web/src/features/sources/SourceAccessGate.tsx` — props reais (`onOpen`/`onEdit`/`onBack`, `checkAccount` injetável), corpo lança (T018).
- `db.ts` (`SourceRecord.account*`, `lastUnavailableSections`), `sourceRepository.ts` (`SourceView.account`) e `importApi.ts` (`SourceOut.account`) já têm os **tipos**; falta mapear (`toView`, `toSourceOut`) e gravar (T005–T007).

## Armadilhas já mapeadas

- **Sem versão nova do Dexie**: campos sem índice; hoje é a v15. Se algo exigir índice, parar e perguntar (v16).
- **Um único `markSynced`** (~l.827 de `importPipeline.ts`) depois dos caminhos `applyStructureRefresh` e `publishGeneration` da 038 — gravar a conta ali, e `markAccount` em `fail()`/antes de lançar `subscription_expired`. `markAccount` **não** toca `connectionState` nem catálogo (D-007).
- `fetchJsonDirect(url, signal?, fetchImpl?)` já aceita o sinal; `resolveAccountStatus` só precisa repassá-lo. O limite de 5 s é `Promise.race` + temporizador (D-005): um `fetch` que ignora o sinal não pode prender a tela (C3 simula isso).
- O pipeline roda no **Worker**: nada de estado em memória da thread de UI na gravação da conta; o "Sincronizando" (`useSourceSyncing`) é um store em memória alimentado por `startLocalImport` na thread de UI, **nunca persistido**.
- O cartão da 037 **não tem estado de sincronização** (a data saiu): chips e "Sincronizando" entram em `.source-card-notices`; `formatStatus` só serve Configurações.
- `chooseSource` (`App.tsx` ~l.134) hoje faz `choose-source` + `writeLastSourceId` + `wakePrefetch` + `openSource.mutate`: extrair `enterSource` e **não** chamar nada disso antes de o acesso abrir. `openImportedSource` também passa por `chooseSource` (conta recém-verificada → abre direto).
- Segredos: nada de `provider_dns`, URL, usuário ou senha em texto, `aria-*`, `title`, log ou erro (`toView`/`toSourceOut` por desestruturação explícita; `logger.warn` só com o `reason`).
- Dias até o vencimento por **calendário local** (meia-noite local de cada data), nunca `ms / dia`; `exp_date` é segundos Unix (R-002), `0`/negativo/vazio/não numérico = "sem data".
- Reuso: `Chip`, `Button`, `Spinner` (feature 022), `useCatalogCounts` (`catalogApi.ts` ~l.591, sem consumidor hoje), `findUnnamedControls` (`testing/accessibleNames.ts`).
- E2E: painel Xtream falso por `http.createServer` (padrão `e2e/metadata-tmdb.mjs`); cadastro de lista **só** por `e2e/lib/entrada.mjs`; rodar com `npm run dev` recém-iniciado (um dev server de várias horas fica instável); scripts um a um se o encadeado falhar por `ERR_CONNECTION_REFUSED`.
- Flakes conhecidos sob paralelismo (`*.favorites.test.tsx`, `LiveScreen.test.tsx`): registrar como pendência, nunca "ok".
- PowerShell 5.1: `.ps1` com acento precisa de UTF-8 com BOM; mensagem de commit por `git commit -F <arquivo>`; não nomear função `R` em script (alias de `Invoke-History`).

## Pendências do Analyze

- **A-01 (MEDIUM)** — FR-014 ("Editar lista" → salvar e sincronizar com sucesso **limpa** o bloqueio) não tem teste nem passo de E2E nominal. Recomendação: cobrir no cenário 2 de `e2e/fontes-estado.mjs` (T030): bloqueada → Editar → ressincronizar contra o painel já renovado → a lista abre.
- **A-02 (LOW)** — FR-020 ("nunca por foco") só vale por construção. Recomendação: no E2E (T030), contar as requisições ao painel falso enquanto o foco anda pelos cartões e pelas linhas de Configurações → zero.
- **A-03 (LOW)** — R-002 (`exp_date` em segundos Unix) só foi visto no conector e em fixtures. Recomendação: T031 (`fontes-estado-real.mjs`) confere na lista real do `.env` antes de fechar; "não executado" se não houver acesso.

## Gate de pronto

- 5/5 contratos da 034 verdes (C1–C4 na Fase 2, C5 na Fase 4) + `check-contract-tests.ps1` íntegro; travas das 023/024/026/028/037 intactas.
- `npx tsc -b`, `npm run lint`, `npm run test` (a suíte volta a ficar **sem** os 5 vermelhos da 034), `npm run build:tizen` (nenhum arquivo emitido fora de `tizen_web_project.yaml`), `npm run test:e2e` incluindo o novo `fontes-estado.mjs`.
- `quickstart.md` (navegador) executado; SC-006 com a lista real ou registrado como não executado.
- Docs no Polish: `CLAUDE.md`, `README.md`, `.planning/backlog.md` (item 46). A constitution já está na 1.7.0.
- Passada na TV física: **recomendada, não gate** (nada depende de AVPlay nem de tecla especial); conferir a tela de acesso e os chips na próxima sessão do item 58.
