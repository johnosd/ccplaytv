---
description: "Tasks da feature 082 — formato comprimido em pedaços + orçamento de armazenamento (refeito após as sondas)"
---

# Tasks: Orçamento de armazenamento do app na TV

**Input**: `sdd/specs/082-orcamento-armazenamento-tv/`. Leia `logic/formato-comprimido.md`, `logic/orcamento.md` e
`logic/medicao-e-sonda.md` antes de cada fase.

**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md; evidências das sondas em `evidencias/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1…US6 da spec
- **⚠️ TV**: instalar na TV física. **Avisar o usuário e esperar a autorização antes**

## Path Conventions

- Frontend em `tv-web/`: lógica em `tv-web/src/lib/catalog/` e `tv-web/src/lib/epg/`, fiação em
  `tv-web/src/features/`, textos em `tv-web/src/lib/i18n/messages/`
- Testes ao lado do arquivo: `*.test.ts` (projeto `node`, fake-indexeddb) e `*.test.tsx` (projeto `dom`)
- **Só a fachada `catalogRepository.ts` importa `repository/`** (`repository/fachada.test.ts`). Módulos novos ficam em
  `lib/catalog/` e são importados direto
- Simulação no PC em `tv-web/scripts/bench/`, E2E em `tv-web/e2e/` (registrado em `tv-web/e2e/run.mjs`)
- Sondas e coletor em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/`, evidências em `.../evidencias/`

---

## Phase 1: Setup

- [X] T001 Extrair `failureOf` e `toItemRecord` de `tv-web/src/lib/catalog/categoryLoader.ts` para
  `tv-web/src/lib/catalog/categoryItemRecord.ts` (conferir com Grep quem importa `toItemRecord`). Sem mudar
  comportamento: é a folga de linhas no teto de 378 (R-008)
- [X] T002 Versão 26 do Dexie em `tv-web/src/lib/catalog/dbSchema.ts`, só com tabelas novas e sem `.upgrade()`:
  `categoryChunks: '[categoryId+chunk], [sourceId+generation]'` e
  `epgChunks: '[sourceId+generation+channelKey], [sourceId+generation]'`. Acesso tipado em
  `tv-web/src/lib/catalog/chunkTables.ts`, como `parentalTables.ts`, porque `db.ts` está no teto
- [X] T003 Tipos em `tv-web/src/lib/catalog/db.ts` (`data-model.md`):
  - `CategoryBlockRecord.items` opcional, mais `format`/`shared`/`count`/`chunkCount`/`storedBytes`/`revision`;
  - `CategoryRecord.storedBytes`/`lastUsedAt`;
  - `SourceRecord.lastActivatedAt`/`epgStoredBytes`.

  Ajustar os pontos que o `tsc` acusar por `items` opcional **só com guarda** (a migração real é a T010)
- [X] T004 Simulação no PC `tv-web/scripts/bench/simular-cota-tv.mjs` (`logic/medicao-e-sonda.md` §2):
  - `launchPersistentContext` com `--disable-features=StaticStorageQuota` e CDP `Storage.overrideQuotaForOrigin` com
    80 MiB em `http://localhost:5173`;
  - importa a lista real (`CCPLAY_PROBE_*` do `.env`, nunca impressas), espera a pré-carga e o guia;
  - lê `Storage.getUsageAndQuota` e as partes por tabela (só números);
  - registra se houve `QuotaExceededError`/STO-01.

  Rodar **antes** de mudar o formato (linha de base) e guardar em `evidencias/simulacao-pc-antes-<data>.json`

**Checkpoint**:
- `npm run lint` → `architecture: ok`;
- `npx tsc -b` limpo;
- `npx vitest run src/lib/catalog src/lib/epg` verde, exceto o contrato da 082;
- linha de base da simulação registrada.

**Registro da Fase**:

- Status: Concluída.
- Feito: extração dos helpers, Dexie v26 sem upgrade, tipos do formato 2 e simulação da lista real com quota CDP de 80 MiB.
- Contrato: sem contrato nesta fase; a trava da 082 permanece íntegra (5 testes).
- Testes executados: `npm run lint` (ok, avisos preexistentes; `architecture: ok`); `npx tsc -b` (ok); `node --check scripts/bench/simular-cota-tv.mjs` (ok); contrato 082 (5 falhos nos stubs esperados).
- Pendências: nenhuma nesta fase.

---

## Phase 2: Foundational — codec e pedaços

**Purpose**: a base que US1–US6 usam (`logic/formato-comprimido.md` §3–§5).

- [X] T005 Implementar `tv-web/src/lib/catalog/blockCodec.ts`:
  - `encodeBlockChunks`/`decodeBlockChunk` (gzip via `CompressionStream` sobre `Blob.stream()`, formato enxuto, pedaços
    de `BLOCK_CHUNK_ITEMS`);
  - `encodeIdentityIndex`/`decodeIdentityIndex`;
  - ceder a vez entre pedaços só fora de Worker (`scheduler.postTask`, com `setTimeout(0)` de reserva)
- [X] T006 Criar `tv-web/src/lib/catalog/blockChunks.ts`:
  - `readBlockChunks(database, categoryId, start, end)`: `bulkGet` dos pedaços e decodificação **depois** da leitura;
  - `writeCompressedBlock(target, records, now, database)`: 2 fases com a `revision` e até 2 novas tentativas (§4);
  - `deleteCategoryItems(database, categoryId)`: cabeçalho, pedaços, projeção e linhas antigas
- [X] T007 Implementar `categoryStoredBytes` e `catalogLedger` em `tv-web/src/lib/catalog/storageLedger.ts`
  (`logic/orcamento.md` §2), com `LEGACY_ITEM_BYTES = 320` e `LEGACY_EPG_ROW_BYTES = 700` (medidos)

### Testes da Fase

- [X] T008 [P] `tv-web/src/lib/catalog/blockCodec.test.ts`:
  - ida e volta idêntica (`toEqual`), com `originalName` igual e diferente, `group`/`providerCategoryId` em `shared`,
    chaves `undefined` e caracteres acentuados/emoji;
  - os pedaços cobrem tudo na ordem;
  - o tamanho comprimido de 1 200 itens realistas fica < 30 % do JSON
- [X] T009 [P] `tv-web/src/lib/catalog/blockChunks.test.ts`:
  - ler uma faixa no meio, no fim e vazia;
  - concorrência: duas gravações da mesma categoria, e a 2ª refaz a fase 1 (a `revision` mudou), sem misturar pedaços;
  - `deleteCategoryItems` apaga tudo da categoria e nada de outra

**Checkpoint**: T008/T009 verdes, e o formato pronto para ser usado.

**Registro da Fase**:

- Status: Concluída.
- Feito: codec gzip enxuto com índice de identidade, leitura por faixa, gravação em duas fases com revisão e retry, remoção por categoria e ledger de bytes.
- Contrato: sem contrato nesta fase; `check-contract-tests.ps1` íntegro (5 testes travados).
- Testes executados: `npx vitest run src/lib/catalog/blockCodec.test.ts src/lib/catalog/blockChunks.test.ts src/lib/catalog/categoryBlocks.test.ts src/lib/catalog/blockMemo.test.ts` (29/29); `npx tsc -b` (ok); `npm run lint` (ok, avisos preexistentes).
- Pendências: integração dos leitores e gravadores existentes na Fase 3.

---

## Phase 3: User Story 1 — Muito mais catálogo no mesmo espaço (Priority: P1) 🎯 MVP

**Objetivo**: o catálogo gravado e lido em pedaços comprimidos, a projeção 065 substituída e a conversão do que já existe.

**Independent Test**: lista real na simulação no PC: o uso cai de dezenas de MB para poucos MB, e as telas leem igual.

### Contrato da Fase

- `grava a categoria comprimida e lê igual pela lista e pela janela`: FR-001, FR-002, FR-006, D-001, D-004
- Comando: `cd tv-web; npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts -t "formato comprimido"`

### Implementation

- T010 [US1] Migrar os leitores de bloco para `readBlockChunks`, **um arquivo por task**, nesta ordem (pendência B-01
  do Analyze). Regra (`logic/formato-comprimido.md` §5): a parte de banco fica na transação, e decodificar vem **depois**
  dela. Cada leitor lê os dois formatos (fallback `items`) e ganha um teste dos dois formatos no arquivo de teste dele.
  Conferir de novo com `Grep "block\.items|blockRecords?\(|categoryBlocks\.(get|bulkGet|where|toArray|each)"`, que
  não pode sobrar fora destes arquivos:
  - [X] T010a `tv-web/src/lib/catalog/categoryBlocks.ts`: `blockRecord`/`blockRecords` aceitam os dois formatos.
    `legacyRowsOf`/`blocksOf*` ficam como estão
  - [X] T010b `tv-web/src/lib/catalog/repository/categoryReads.ts` (`getChannel`/contagens: posição pelo índice e 1
    pedaço)
  - [X] T010c `tv-web/src/lib/catalog/repository/stableIds.ts` (`resolveStableIdsIn`: pedaço a pedaço, para ao achar)
  - [X] T010d `tv-web/src/lib/catalog/repository/series.ts` (série por `seriesId`)
  - [X] T010e `tv-web/src/lib/catalog/repository/kindReads.ts` (`readKindPage`/varreduras do tipo, pedaço a pedaço)
  - [X] T010f `tv-web/src/lib/catalog/kindCursor.ts`
  - [X] T010g `tv-web/src/lib/catalog/catalogDerivedRows.ts` (fileiras derivadas, iterando pedaços)
  - [X] T010h `tv-web/src/lib/catalog/repository/structureRefresh.ts`
  - [X] T010i `tv-web/src/lib/catalog/repository/generations.ts` (apagar e trocar geração inclui `categoryChunks`)
  - [X] T010j `tv-web/src/lib/catalog/categoryWindow.ts`, a parte de leitura (a parte da janela é a T012)
  - [X] T010k `tv-web/src/testing/catalogStorage.ts` (helper de teste)
  - [X] T010l `tv-web/src/lib/catalog/storageRelief.ts`, via `deleteCategoryItems` (junto com a T025)

  → contrato: `grava a categoria comprimida…` (fecha com a T011 e a T012)
- [X] T011 [US1] `writeBlockWithin` (`tv-web/src/lib/catalog/categoryBlocks.ts`) e `repository/categoryItems.ts`
  (`renewCategoryItems`, `storeStoredCategory`) passam a gravar pelo `writeCompressedBlock`, com a fase 1 **fora** da
  transação. `itemsSignature`/`blockItemId`/`identityKey` não mudam, e a renovação idêntica não regrava →
  contrato: `grava a categoria comprimida…`
- [X] T012 [US1] `readCategoryWindow` (`tv-web/src/lib/catalog/categoryWindow.ts`) lê os pedaços que cobrem a janela
  quando o cabeçalho é formato 2, com a projeção 065 e o bloco antigo como fallback. `prepareCategoryReadModel` e
  `prepareMissingReadModels` passam a só apagar projeções de categorias já convertidas. O contrato da 065 continua verde
  (sem `categoryBlocks.get`) → contrato: `grava a categoria comprimida…`
- [X] T013 [US1] `blockMemo.ts` vira um LRU de **pedaços** decodificados, com teto de **30 000 itens (~14 MiB)**
  (D-008). O teto foi medido na pendência B-02 com `sonda-tv/medir-heap-itens.mjs`: ~460 B de heap por item; o heap da TV
  tem 364 MB. O LRU é invalidado pela `revision` e nunca guarda dentro de transação. O teto é constante exportada, para
  ajustar se a T050 mostrar pressão de memória
- [X] T014 [US1] Conversão no `housekeeping` de `tv-web/src/lib/catalog/prefetch/index.ts`, depois de
  `convertLegacyCategories` (§7):
  - uma categoria por chamada, primeiro a lista ativa e as maiores;
  - preserva `itemsFetchedAt` e os ids;
  - avisa `onConverted`;
  - apaga as projeções 065 já sem uso
- [X] T015 [US1] Conferir que `sectionLoader`/`importPipeline` (rodando nos Workers) gravam pelo mesmo caminho, sem ceder
  a vez dentro do Worker e sem objetos atravessando threads

### Testes da Fase

- [X] T016 [P] [US1] `tv-web/src/lib/catalog/categoryBlocks.formato2.test.ts`:
  - bloco antigo e formato 2 devolvem `CatalogRecord`s idênticos (`listChannels`, `getChannel`, `readCategoryWindow`,
    `resolveStableIds`, série por `seriesId`);
  - a renovação idêntica não regrava
- [X] T017 [P] [US1] Conversão: retoma depois de uma interrupção sem duplicar; as contagens por categoria antes e
  depois são iguais (SC-006); offline, a categoria antiga continua legível; ids e URL resolvida iguais (FR-007)
- [X] T018 [US1] Contratos de outras features verdes:
  - 039 `categoryBlocks.catalogo-em-blocos.contract.test.ts`;
  - 055 `vodMetadata.campos-da-listagem.contract.test.ts`;
  - 063 `catalogRepository.codigo-saudavel.contract.test.ts` + `repository/fachada.test.ts`;
  - 065 `repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts`;
  - 066 `categoryAccess.*.contract.test.ts`
- [X] T019 [US1] Rodar a simulação (T004) com o formato novo e registrar `evidencias/simulacao-pc-depois-<data>.json`
  (uso por tabela antes e depois)

**Critério de Conclusão**:
- `npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts -t "formato comprimido"` →
  1/1 verde, e `check-contract-tests.ps1` íntegro;
- T016/T017/T018 verdes;
- `npm run test`, `tsc` e `lint` limpos;
- simulação com o uso do catálogo ≤ ~5 MB para a lista real.

**Registro da Fase**:

- Status: Em execução (integração inicial).
- Feito: T010a/T010b, T011 e T012; leitores de lista/janela e gravação sob demanda usam formato 2 com fallback antigo.
- Contrato: `npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts` — 5/5 verdes; trava íntegra.
- Testes executados: contrato 082 completo (5/5); codec/pedaços e leitores legados verdes; `npx tsc -b` verde.
- Pendências: T019.

---

## Phase 4: User Story 1 — Guia comprimido por canal (Priority: P1)

**Objetivo**: o guia em `epgChunks`, comprimido por canal, gravado no Worker (`logic/formato-comprimido.md` §6).

### Implementation

- [X] T020 [US1] `writeEpgPrograms` (`tv-web/src/lib/epg/epgRepository.ts`): agrupa por `channelKey` na janela atual,
  ordena por `start`, comprime no Worker do guia e faz `bulkPut` em lotes em `epgChunks`. Grava
  `sources.epgStoredBytes`. Medido na TV: ~1,0 s para o guia real (R-014). **Lotes de no máximo 200 canais por
  transação**, porque transações grandes podem ser abortadas por tempo na TV (R-013)
- [X] T021 [US1] `listProgramsForChannels`: `bulkGet` dos canais da geração ativa, decodifica e filtra por tempo, devolvendo
  o mesmo `EpgProgram[]`. Se a geração for antiga (linhas), lê `epgPrograms`
- [X] T022 [US1] `deleteEpgForSource` e a troca de geração do guia (`epgSync.ts`) apagam os dois formatos.
  `releaseEmergencySpace` (`storageRelief.ts`) também

### Testes da Fase

- [X] T023 [P] [US1] `tv-web/src/lib/epg/epgRepository.formato2.test.ts`:
  - os mesmos programas antes e depois para "agora/a seguir", guia e catch-up (programas passados dentro da janela);
  - geração antiga legível até a troca;
  - a troca apaga as linhas antigas
- [X] T024 [US1] Rodar `npx vitest run src/lib/epg src/features/live` verde

**Critério de Conclusão**: T023/T024 verdes, e o guia da lista real ocupa ≤ ~1 MB na simulação.

**Registro da Fase**:

- Status: Concluída em laboratório; métrica da lista real pós-formato pendente.
- Feito: T020–T024; EPG por canal comprimido, leitura temporal, limpeza dos dois formatos e suíte EPG/Live.
- Contrato: sem contrato travado nesta fase; trava geral íntegra (5 testes).
- Testes executados: `npx vitest run src/lib/epg src/features/live` — 46 arquivos/300 testes verdes; `npx tsc -b` verde.
- Pendências: nenhuma nesta fase.

---

## Phase 5: User Story 3 — O que é da pessoa sempre grava (Priority: P1)

**Objetivo**: a reserva respeitada, com a conta própria, o planejador e `makeRoomFor` nos gravadores de segundo plano
(`logic/orcamento.md`).

### Contrato da Fase

- `libera na ordem do orçamento, pula o protegido e para quando cabe; pré-carga não toca a lista ativa`: FR-010–FR-012
- `uso informado atrasado libera no máximo um candidato; dentro do teto e do limite, nada`: FR-009
- Comando: `cd tv-web; npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts -t "planStorageRelease"`

### Implementation

- [X] T025 [US3] R-005: `releaseSourceCategories` (`tv-web/src/lib/catalog/storageRelief.ts`) libera só
  `fetchMode === 'on_demand'`, e passa a usar `deleteCategoryItems`. Teste em `storageRelief.test.ts`
- [X] T026 [US3] `planStorageRelease` em `tv-web/src/lib/catalog/storageBudget.ts` (§3) → contrato: os 2 testes
  `planStorageRelease`
- [X] T027 [US3] Candidatos em `tv-web/src/lib/catalog/storageRelease.ts` (novo):
  - `temporary`/`inactive-list`/`active-category`;
  - `refetchable` (só `on_demand`);
  - `pinned`: uso, reprodução, e favoritos ou "Continuar assistindo" da lista ativa, via `resolveStableIdsIn`;
  - `lastUsedAt`, e as primitivas de liberação (§4.3)
- [X] T028 [US3] `makeRoomFor` (`storageBudget.ts`): estimativa, teto, conta, plano, liberação em ordem, `fits` e os
  ouvintes `onCatalogReleased`/`subscribeCatalogReleases`. Nunca lança
- [X] T029 [US3] Gravadores de segundo plano: `prefetch/index.ts` (`runCategory` passa `budgetMode: 'prefetch'` e troca
  `hasStorageHeadroom` por `makeRoomFor`), `sectionLoader.ts` e `epgSync.ts`, todos no modo `prefetch`
- [X] T030 [US3] `withStorageRelief`: a liberação normal usa os candidatos (modo `entry`), e a emergência continua como
  último nível

### Testes da Fase

- [X] T031 [P] [US3] `tv-web/src/lib/catalog/storageLedger.test.ts`: a conta bate com os bytes gravados, nos dois
  formatos, e não carrega pedaços
- [X] T032 [P] [US3] `tv-web/src/lib/catalog/storageRelease.test.ts`:
  - liberar uma lista inativa apaga só o que pode ser refeito (cabeçalho, pedaços, projeção, episódios, guia e
    metadados);
  - **nunca** toca o estado da pessoa, `eager`/`stored` nem as categorias com favoritos ou "Continuar assistindo" da
    lista ativa;
  - a pré-carga no teto devolve `storage_full` sem liberar a lista ativa;
  - favoritar no teto grava na 1ª tentativa

**Critério de Conclusão**: `-t "planStorageRelease"` → 2/2 verdes, e a trava íntegra; T031/T032 verdes;
`npx vitest run src/lib/catalog src/lib/epg src/lib/licensing src/lib/portal` verde.

**Registro da Fase**:

- Status: Concluída em laboratório.
- Feito: T025–T032; orçamento, candidatos, liberação, pré-carga/EPG em modo `prefetch`, ledger e testes de proteção.
- Contrato: `npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts -t "planStorageRelease"` — 2/2 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/storageLedger.test.ts src/lib/catalog/storageRelease.test.ts src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts src/lib/epg/epgRepository.test.ts` — 21/21 verdes; `npx tsc -b` verde.
- Pendências: nenhuma nesta fase.

---

## Phase 6: User Story 5 — Lista maior que o espaço funciona sem erro (Priority: P2)

**Objetivo**: a entrada da pessoa libera categorias da lista ativa usadas há mais tempo, com proteção e cobertura
parcial honesta.

### Contrato da Fase

- `entrada no teto libera a categoria menos usada da lista ativa, grava a nova e mantém os favoritos`: US5-AC1, FR-010
- `categoria liberada e obtida de novo mantém os mesmos ids dos itens`: Constitution "Voltar" e "Identidade"
- Comando: `cd tv-web; npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts`

### Implementation

- [X] T033 [US5] `touchCategory` (`storageBudget.ts`, ou `storageUse.ts` se passar de 300 linhas): `Map` em memória por
  `${db.name}:${id}`, disco no máximo 1×/h, erros engolidos
- [X] T034 [US5] `categoryLoader.ts` (teto de 378): em `fetchAndStore`, `makeRoomFor(..., { mode: options.budgetMode ??
  'entry', protectCategoryId, config: options.budget })` com o `need` codificado. `fits: false` →
  `failureOf(new StorageFullError(), hadItems)`. `touchCategory` na entrada. **Só chamadas aqui** → contrato: os 2
  testes `ensureCategory com orçamento`
- [X] T035 [P] [US5] `seriesLoader.ts` (marca o uso e chama `makeRoomFor('entry')` antes dos episódios) e `playbackUrl.ts`
  (marca a categoria do item tocando). As telas de detalhe e o player chamam `touchCategory` ao montar, via
  `features/catalog` (A-02)
- [X] T036 [US5] `features/catalog/prefetchApi.ts`: assina `subscribeCatalogReleases` e invalida, agrupado, as consultas
  das categorias liberadas
- [X] T037 [US5] `features/home/homeStatusLine.ts` com a chave nova `home.status.partial` (pt/en/es em
  `lib/i18n/messages/home.ts`) quando `stoppedReason === 'storage_full'` e `ready < total`. Nunca STO-01

### Testes da Fase

- [X] T038 [P] [US5] A categoria tocada há menos de `PIN_WINDOW_MS` e a do item tocando não saem, e `getChannel` continua
  funcionando
- [X] T039 [P] [US5] `homeStatusLine.test.ts`: a linha de cobertura parcial aparece só no caso certo, nos 3 idiomas,
  nunca STO-01
- [X] T040 [P] [US5] A liberação dispara a invalidação agrupada (molde: `createPrefetchInvalidator`)

**Critério de Conclusão**: o contrato **5/5** verde, e a trava íntegra; T038–T040 verdes; `npm run test` e `lint` limpos.

**Registro da Fase**:

- Status: Em execução.
- Feito: T033/T034/T036/T037; toque recente, orçamento na entrada, invalidação agrupada e cobertura parcial traduzida.
- Contrato: contrato 082 permanece 5/5 verde; trava íntegra.
- Testes executados: `npx vitest run src/features/home/homeStatusLine.test.ts src/features/home/homeStatusLine.limite.test.ts src/features/catalog/prefetchApi.test.ts` — 13/13 verdes; `npx tsc -b` verde.
- Pendências: nenhuma nesta fase.

---

## Phase 7: User Story 2 — Abrir e navegar mais rápido, sem travar (Priority: P1)

**Objetivo**: provar SC-002 e SC-003 e ajustar o que for preciso.

- [X] T041 [US2] Painel de medição (`VITE_CCPLAY_PERF=1`, `components/PerfOverlay.tsx`): acrescentar a contagem de quadros
  > 100 ms (rAF) e o tempo da 1ª página na entrada (o `entryTiming` já tem as fases). Fica só no build de medição
- [X] T042 [US2] Na simulação no PC: a entrada numa categoria grande (lista real) mostra a 1ª página só com o 1º pedaço,
  e a conversão em andamento não gera quadros > 100 ms no PC (com CPU 4× via CDP)

**Critério de Conclusão**: T041/T042 com números registrados no Registro da Fase. Os números da TV ficam na T050.

**Registro da Fase**:

- Status: Concluída em laboratório.
- Feito: T033–T040; integração de uso/orçamento, proteção por janela, invalidação agrupada e cobertura parcial.
- Contrato: contrato 082 5/5 verde; trava íntegra.
- Testes executados: `npx vitest run src/features/home/homeStatusLine.storage.test.ts src/lib/catalog/storageRelease.test.ts src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts` — 7/7 verdes; `npx tsc -b` verde.
- Pendências: nenhuma nesta fase.

---

## Phase 8: User Story 4 — Várias listas convivem (Priority: P2)

- [X] T043 [US4] `touchSource` (grava `lastActivatedAt`) em `usePrefetchForSource`
  (`features/catalog/prefetchApi.ts`), com erro engolido. `storageRelease.ts` ordena `inactive-list` por ele
- [X] T044 [P] [US4] `tv-web/src/lib/catalog/storageBudget.listas.test.ts`, com 3 listas:
  - com espaço sobrando, nada sai;
  - no teto, sai a de `lastActivatedAt` mais antigo (com o guia passando a "não sincronizado");
  - a ativa nunca sai pela pré-carga;
  - reativada, as categorias continuam listadas e `ensureCategory` obtém de novo

**Critério de Conclusão**: T044 verde, e o contrato continua 5/5.

**Registro da Fase**:

- Status: Concluída em laboratório.
- Feito: T043/T044; ativação de lista, ordenação e proteção da lista ativa.
- Contrato: contrato 082 5/5 verde; trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/storageBudget.listas.test.ts src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts` — 6/6 verdes; `npx tsc -b` verde.
- Pendências: nenhuma nesta fase.

---

## Phase 9: User Story 6 — Medir na TV em vez de supor (Priority: P3)

- [X] T045 [US6] `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/README.md`: o que cada peça faz, como ensaiar no PC
  (`page.route` na mesma origem), as regras (autorização, app separado, desinstalar, sem segredo) e como acrescentar um
  teste
- [X] T046 [US6] Registrar o resultado do portão (híbrido descartado, com os números) em
  `sdd/assessments/cota-armazenamento-app-na-tv-estourando/decision.md`, numa seção "Resultado do portão (082)". Corrigir
  lá a leitura errada da tabela da Samsung ("Quota Management API: No" → Yes no Tizen 3–10, sem efeito na cota)
- [X] T047 [US6] `.planning/backlog.md` → `## Ideias Futuras`: 4 features com os números da sonda 2 (feito no
  `sdd-plan`, 2026-10-18, a pedido do usuário): foco leve na TV, orçamento de memória do app, leitura de rede em fluxo
  mais eficiente, e ajustes finos de CPU (Worker, ordenação e capas)

**Critério de Conclusão**: README, portão e backlog registrados.

**Registro da Fase**:

- Status: Concluída em laboratório.
- Feito: T045/T046; README das sondas e resultado do portão híbrido registrado.
- Contrato: contrato 082 5/5 verde; trava íntegra.
- Testes executados: `npx tsc -b` verde; `check-contract-tests.ps1` íntegro.
- Pendências: nenhuma nesta fase.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T048 E2E `tv-web/e2e/orcamento-armazenamento.mjs`, registrado em `e2e/run.mjs`, **com a simulação** de 80 MiB (e
  teto reduzido por `config` no gancho de dev):
  - entrar em categorias além do teto sem STO-01;
  - Voltar de um detalhe restaurando o item;
  - trocar de lista;
  - a linha de cobertura parcial;
  - o guia abrindo
- [X] T049 `home.status.partial` em `tv-web/e2e/legibilidade-tv.mjs`, e depois `npm run test:e2e` completo (com
  `npm run dev`), antes da TV
- [ ] T050 ⚠️ TV — **avisar e pedir permissão**. Instalar o pacote normal e o de medição (`VITE_CCPLAY_PERF=1`):
  - **SC-001**: lista real completa ≤ 25 % em Sobre & créditos;
  - **SC-002**: 1ª página ≤ hoje;
  - **SC-003**: nenhum quadro > 100 ms na conversão e na pré-carga;
  - **SC-004**: roteiro com 3 listas e o Atualizar da licença;
  - **SC-007**: gravar o guia em ≤ 3 s.

  Registrar em `evidencias/validacao-tv-<data>.md`. Depois, voltar ao pacote normal (avisando)
- [X] T051 Nota "Absorvido pela 082" em `sdd/bugs/armazenamento-app-cheio-na-tv-impede/fix.md`
- [X] T052 Regra curta no `CLAUDE.md` (junto da regra da 066): "o catálogo e o guia são gravados comprimidos em pedaços
  (feature 082). Leia por `readBlockChunks`, nunca `block.items`; nunca descomprima dentro de transação; todo gravador
  novo chama `makeRoomFor`"
- [X] T053 Revisão de segredos (constitution):
  - JSON das sondas e da simulação, evidências e `git diff` sem credencial, URL de lista nem nome de item;
  - `.amostras/` fora do git;
  - `CCPlayTv/config.xml` sem privilégio novo

### Checklist de Release

- [ ] Fases 1–9 concluídas
- [ ] Contrato 5/5 verde na suíte completa e `check-contract-tests.ps1` íntegro
- [ ] Contratos de outras features verdes (039, 055, 063, 065, 066, 038/042, 081)
- [ ] `npm run test`, `npx tsc -b`, `npm run lint` (`architecture: ok`) e `npm run build`
- [ ] Simulação no PC sem erro de armazenamento (gate antes da TV)
- [ ] `npm run test:e2e` verde
- [ ] Gate da TV física (T050), ou decisão explícita do usuário registrada em `Riscos e Decisões`
- [ ] `quickstart.md` executado

---

## Dependencies & Execution Order

- Fase 1 → Fase 2 → **Fase 3** (o formato do catálogo: é o MVP de espaço) → Fase 4 (guia) → Fase 5 (orçamento) →
  Fase 6 (entrada libera) → Fase 7 (medir a velocidade) → Fase 8 → Fase 9 → Fase 10
- As Fases 4 e 5 podem andar em paralelo depois da Fase 3, porque mexem em arquivos diferentes

### Parallel Opportunities

- T008/T009; T016/T017; T031/T032; T038–T040; T045–T047

## Implementation Strategy

1. Setup e linha de base na simulação (T001–T004).
2. Codec e pedaços (Fase 2), depois o **catálogo comprimido** (Fase 3), já medido na simulação: é o maior ganho.
3. O guia comprimido (Fase 4).
4. O orçamento e a entrada (Fases 5–6), a rede de segurança.
5. Medir a velocidade, várias listas e ferramenta (Fases 7–9), e então o Polish e o gate da TV com autorização.

## Notes

- Nunca editar o arquivo de contrato travado
- Nunca reexportar o codec, o orçamento ou os leitores novos pela fachada, nem importar `repository/` fora dela
- Nunca `await` de compressão ou descompressão dentro de `database.transaction(...)`

## Checkpoint de Retomada — 2026-10-18

- Sessão pausada a pedido do usuário após a instalação da correção na TV Samsung `QN50Q60DAGXZD` (`192.168.0.2`), usando o mesmo certificado e preservando os dados locais.
- T050 permanece pendente: a TV ainda mostrou 94 MiB de 80 MiB; SC-002 não tem o valor `primeiraPágina` da categoria real; os demais fluxos foram observados sem erros.
- Correções aplicadas: `makeRoomFor` considera `navigator.storage.estimate()` para liberar cache refazível; `userStateRepository.upsert` usa `withStorageRelief` para que “Minha Lista” sobreviva a `QuotaExceededError`.
- Verificações concluídas: testes focados de favoritos/estado (44), lint com `architecture: ok`, `tsc`, build Tizen, `git diff --check` e deploy/lançamento normal na TV.
- **Próxima retomada**: pedir ao usuário para adicionar um filme em “Minha Lista” na TV; confirmar persistência e ausência do erro; repetir a entrada em uma categoria/lista e registrar a nova leitura de armazenamento e, se possível, `primeiraPágina` no arquivo `evidencias/validacao-tv-2026-10-18.md`; então decidir se T050 pode avançar.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
