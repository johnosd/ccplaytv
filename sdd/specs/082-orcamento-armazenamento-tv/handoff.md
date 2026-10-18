# Handoff — 082-orcamento-armazenamento-tv (sdd-plan refeito após as sondas → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. Há muita mudança alheia não commitada; não reverter.
- Stack: `tv-web/`, React 19 + TS + Vite 8, Dexie/IndexedDB, Vitest (`node`/`dom`, Node 22) e Playwright. A TV é Tizen 9
  / Chromium 120.
- Próximo comando: `/sdd-execute 082-orcamento-armazenamento-tv`. No backlog: **Planejada**.
- O plano foi **refeito em 2026-10-18** depois de duas sondas na TV física. A spec, o plano, as tasks, o
  `logic/*`, o `data-model` e o `quickstart` são novos. O contrato foi reescrito e retravado (5 testes).
- Fora de `sdd/`, só existem stubs:
  - `tv-web/src/lib/catalog/{blockCodec,storageLedger,storageBudget}.ts`;
  - o contrato;
  - `categoryLoader.ts`, que ganhou `EnsureCategoryOptions extends BudgetOptions` e teve um comentário encurtado (no
    teto de 378).

## O que a feature entrega

- **US1 P1, catálogo e guia comprimidos.**
  - Pedaços de 500 itens em gzip, com JSON enxuto, em `categoryChunks`.
  - **Substituem a projeção 065**, que era 18,7 MB dos ~44 MB da lista real.
  - O guia vai por canal em `epgChunks`.
  - Medido: ~13× menos espaço.
- **US2 P1, mais rápido e sem travar**: a 1ª página em ~14 ms contra 178 ms, e a compressão no Worker (nunca na tela,
  que congela 250 ms).
- **US3 P1**: o que é da pessoa sempre grava, com reserva, teto e **conta própria de bytes**. O `estimate()` não cai
  depois de `clear()` na TV.
- **US5 P2**: uma lista maior que o teto funciona sem erro, porque a entrada libera as categorias menos usadas da lista
  ativa. Ficam protegidos o que está em uso, os **favoritos e o "Continuar assistindo"**.
- **US4 P2**: várias listas, saindo primeiro a usada há mais tempo.
- **US6 P3**: as sondas e a simulação no PC como ferramenta, e o **híbrido descartado** (~3× mais lento).
- **Decisões do usuário**:
  - o catálogo **e** o guia são comprimidos;
  - a projeção 065 é **substituída**;
  - foco, memória geral e rede viram **ideias futuras**;
  - o M3U nunca é liberado e o `storedEntries` não muda, mas os blocos do gravador comum ficam comprimidos para todas as
    listas (decisão de plano, o usuário pode reabrir).

## Leitura obrigatória, em ordem

1. `spec.md`: 6 stories, FR-001…FR-017, SC-001…SC-007, e as Clarifications das duas sessões.
2. `evidencias/medicao-cota-tv-2026-10-18.md` e `evidencias/sonda2-capacidades-tv-2026-10-18.md`: **os números que
   justificam cada decisão**.
3. `plan.md`: D-001…D-010 e R-001…R-012.
4. `tasks.md`: 10 fases. Os ⚠️ TV exigem autorização.
5. `logic/formato-comprimido.md`: modelo, codec, gravar em 2 fases com `revision`, ler pedaço a pedaço, guia e
   conversão.
6. `logic/orcamento.md`: números, conta, planejador (contrato), `makeRoomFor` com favoritos protegidos e uso recente.
7. `logic/medicao-e-sonda.md`: ferramenta de sondas, simulação no PC e resultado do portão.
8. `data-model.md` (versão 26 do Dexie), `quickstart.md` e a constitution.

## Testes de contrato

- `tv-web/src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts`, **5 testes**:
  - `formato comprimido` → Fase 3;
  - 2× `planStorageRelease` → Fase 5;
  - 2× `ensureCategory com orçamento` → Fase 6.
- Rodar: `cd tv-web; npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts`. Hoje são 5
  vermelhos com `not implemented`.
- Integridade: `powershell -NoProfile -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv`.
- Os contratos usam **só interface pública**: `listChannels`, `readCategoryWindow` de `./categoryWindow` (não o de
  `repository/`), `categoryStoredBytes` e `ensureCategory` com `budget: { capBytes }`.
- Travas de outras features em risco:
  - 039 `categoryBlocks.catalogo-em-blocos.contract.test.ts`;
  - 055 `vodMetadata.campos-da-listagem.contract.test.ts` (`itemsSignature` não pode mudar);
  - 063 `catalogRepository.codigo-saudavel.contract.test.ts` + `repository/fachada.test.ts`;
  - 065 `repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts` (a janela **sem**
    `categoryBlocks.get`);
  - 066 `categoryAccess.*`, 038/042 `prefetchScheduler.*`, 081.

## Stubs criados

- `blockCodec.ts`: `BLOCK_CHUNK_ITEMS = 500`, os tipos, e `encodeBlockChunks`/`decodeBlockChunk` em `not implemented`.
  `encodeIdentityIndex`/`decodeIdentityIndex` ainda **não existem**: criar na T005.
- `storageLedger.ts`: `categoryStoredBytes` e `catalogLedger` (`not implemented`).
- `storageBudget.ts`:
  - **reais**: as constantes, `storageReserveBytes`/`catalogCapBytes` e `BudgetOptions`/`StorageBudgetConfig` (só
    `capBytes`);
  - **stubs**: `planStorageRelease`, `makeRoomFor` e `touchCategory`.
- `categoryLoader.ts`: aceita `budgetMode`/`budget` e **ainda os ignora** (a T034 liga).

## Armadilhas já mapeadas

- **Nunca `await` de compressão ou descompressão dentro de `database.transaction(...)`**: encerra a transação. Gravar é
  em 2 fases com `revision` (`formato-comprimido.md` §4); ler é bytes na transação e decodificação depois (§5).
- **13 leitores leem `block.items`** (lista na T010). Com o formato 2 não há `items`. Use `readBlockChunks` e mantenha
  o fallback do formato antigo até a conversão.
- **Transações grandes são abortadas na TV** (R-013, medido): um lote de 2 000 linhas de guia deu
  `TimeoutError: Transaction timed out due to inactivity`. Grave em lotes pequenos (≤ 500 linhas, ≤ 200 canais
  comprimidos), e converta e libere uma categoria por transação.
- **`scheduler.yield` não existe na TV**: use `scheduler.postTask(…, { priority: 'background' })`, com `setTimeout(0)`
  de reserva. Dentro de Worker não ceda.
- **Nunca mande objetos entre threads**: o clone de 11 mil objetos leva 195 ms; o Worker grava o banco direto
  (IndexedDB existe no Worker).
- **Tetos da catraca**: `categoryLoader.ts` 378 (faça a T001 antes), `db.ts` 860 (acesso tipado novo em
  `chunkTables.ts`) e `sourceRepository.ts` 400. Nunca suba o baseline.
- **Só a fachada importa `repository/`** (`fachada.test.ts`); módulos novos ficam em `lib/catalog/`.
- **Versão 26 do Dexie** só com tabelas novas e sem `.upgrade()` (padrão da 066/069), em `dbSchema.ts`.
- **`performance.memory` na TV é quantizado** (sempre 10 MB): não use para medir memória lá. Para estimar o heap no
  PC, use `node --expose-gc sonda-tv/medir-heap-itens.mjs`.
- **Simulação no PC**:
  - use `launchPersistentContext` + `--disable-features=StaticStorageQuota` + `Storage.overrideQuotaForOrigin`;
  - o Chrome do PC bloqueia `localhost`→`127.0.0.1` (Local Network Access);
  - o PC comprime os valores grandes e a TV não: compare só comportamento no PC, e números na TV.
- **Sondas**: são apps separados (ids `ccpSonda82.CotaProbe` e `ccpSondaV2.Capacidades`), já desinstalados. Reinstalar
  só com autorização.
- **i18n**: `home.status.partial` em pt/en/es.
- **PowerShell**: `npm run x -- --flag` perde o `--`; chame `node scripts/...` direto.

## Pendências do Analyze

Todas as pendências foram resolvidas no próprio `sdd-plan` (2026-10-18), a pedido do usuário:

- **B-01 (HIGH)**: a T010 foi dividida em **T010a–T010l**, uma por arquivo, cada uma com o seu teste de dois formatos.
- **B-02 (MEDIUM)**: medido ~460 B de heap por item (`sonda-tv/medir-heap-itens.mjs`). O teto do cache é de **30 000
  itens (~14 MiB)** (D-008, T013).
- **B-03 (MEDIUM)**: a nota R-023 foi acrescentada no `plan.md` da 065.
- **B-04 (LOW)**: o usuário **confirmou** comprimir também os blocos M3U (Clarifications da spec).
- **B-05 (LOW)**: o guia foi medido na TV: **1,01 s** no Worker, contra 10,2 s hoje (R-014). SC-007 está confirmado em
  laboratório, e a T050 só confirma com o app real.

Nada pendente. O achado novo virou armadilha (abaixo) e risco R-013.

## Gate de pronto

- contrato 5/5 verde e `check-contract-tests.ps1` íntegro;
- as travas das outras features acima verdes;
- `npx tsc -b`, `npm run lint` (`architecture: ok`), `npm run test` e `npm run build`;
- a **simulação no PC** sem erro de armazenamento;
- `npm run test:e2e` (com `npm run dev`), **antes** da TV;
- `quickstart.md` Cenários A, B e D;
- docs: nota de absorção no bugfix, nota na 065, regra curta no `CLAUDE.md` (T052), portão na avaliação (T046) e as
  ideias no backlog (T047);
- **a TV física é gate** (T050: SC-001/002/003/004/007), sempre com autorização. Fechar sem ela só por decisão explícita
  do usuário, registrada em `Riscos e Decisões`.
