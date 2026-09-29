---
description: "Tasks da feature 030-epg-dados-agora"
---

# Tasks: EPG — Dados de Programação e "Agora" na Live TV, no Player e na Home

**Input**: Documentos de design de `sdd/specs/030-epg-dados-agora/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, logic/*.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (client-first, ADR-008); `api/` não é tocado.
- Lógica de EPG sem React em `tv-web/src/lib/epg/`; catálogo em `tv-web/src/lib/catalog/`.
- Telas falam só com `tv-web/src/features/catalog/catalogApi.ts` e `tv-web/src/features/import/importApi.ts` (nunca `lib/` direto).
- Estilos em `tv-web/src/styles/*.css`, só tokens V14 de `tv-web/src/index.css`.
- E2E em `tv-web/e2e/*.mjs`; pacote Tizen em `CCPlayTv/` (lista em `CCPlayTv/tizen_web_project.yaml`).
- Comandos rodam de `tv-web/`, exceto os scripts `.planning/scripts/powershell/*.ps1` (da raiz).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Evidência real antes de codar.

- [x] T001 Spike com o painel real do `.env` (feito no `sdd-plan`, 2026-09-29) — campo `epg_channel_id`, CORS/tamanho/fuso do `xmltv.php`, casamento 954/954, URL externa inalcançável; ver `research.md` R1–R6
- [ ] T002 Verificar se `DecompressionStream` existe no ambiente Vitest/jsdom (`npx vitest` com um teste descartável); se não existir, os testes de gzip de T013 usam `DecompressionStream` de `node:stream/web` injetado — **nunca** um polyfill no código de produção. Registrar a conclusão em `Cuidados para Retomada` do `plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Dados, parser, sincronização e executor — tudo que as superfícies consomem.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `lê em pedaços partidos, resolve fuso, filtra pela janela e descarta programa sem título` — origem: FR-003/FR-004/FR-014/FR-030
- `acha agora/a seguir sem inventar: progresso real, lacuna vazia, sobreposição pelo mais recente, deslocamento na leitura` — origem: FR-020/FR-023/FR-025/FR-030
- `fonte Xtream sem configuração: baixa o xmltv.php do painel, grava, e a sincronização seguinte substitui a anterior` — origem: US1/AC1, FR-001/FR-004/FR-015
- `falha de rede preserva a programação anterior, registra o erro categorizado e nunca vaza a senha` — origem: US2/AC3, FR-005/FR-013/FR-019
- Comando: `npx vitest run src/lib/epg`

### Implementation

- [ ] T003 Dexie v11 em `tv-web/src/lib/catalog/db.ts`: tabela `epgPrograms` (`'++id, [sourceId+generation], [sourceId+generation+channelKey+start]'`) + `EpgProgramRecord`; campos de valor novos em `SourceRecord` (`epgManualUrl`, `epgDeclaredUrl`, `epgOffsetHours`, `epgDisabled`, `epgLastSyncAt`, `epgLastErrorKind`, `epgLastErrorAt`, `epgActiveGeneration`, `epgIdsCapturedAt`) e `CatalogRecord.epgChannelId` — `data-model.md` §1–§3; comentário de versão no mesmo estilo das anteriores
- [ ] T004 [P] Captura Xtream: `ClassifiedEntry.epgChannelId` em `tv-web/src/lib/catalog/classifier.ts`; `mapLiveEntry` lê `epg_channel_id` (string com `trim()` não vazio, senão ausente) em `tv-web/src/lib/catalog/xtreamConnector.ts` (FR-006, research R1)
- [ ] T005 [P] Captura M3U: `classifyEntry` lê `attributes['tvg-id']` só para `kind: 'channel'` em `tv-web/src/lib/catalog/classifier.ts`; `toStoredRecord` em `tv-web/src/lib/catalog/importPipeline.ts` e `toItemRecord` em `tv-web/src/lib/catalog/categoryLoader.ts` levam `epgChannelId`; `toItemOut` em `tv-web/src/features/catalog/catalogApi.ts` preenche `epg_channel_id` (`?? null`) — remover a nota "STUB" do campo
- [ ] T006 Cabeçalho M3U: `ParseTally` ganha `headerAttributes?: Record<string, string>` preenchido pela linha `#EXTM3U` em `tv-web/src/lib/catalog/m3uParser.ts` (mesmo `parseAttributes`); `scanToStored` em `tv-web/src/lib/catalog/importPipeline.ts` guarda `url-tvg ?? x-tvg-url` (primeiro endereço se vier lista separada por vírgula) e passa a `markSynced`; `SyncMark.epgDeclaredUrl` + `markSynced` em `tv-web/src/lib/catalog/sourceRepository.ts` grava `epgDeclaredUrl` **sempre** (inclusive ausente) e `epgIdsCapturedAt: mark.at` — a URL nunca vai para `run`/`ImportRunRecord`/progresso
- [ ] T007 `writeEpgPrograms` em `tv-web/src/lib/epg/epgRepository.ts`: geração nova, lotes de 2.000, descrição truncada em 600, troca de `epgActiveGeneration` + apagar gerações antigas numa transação ao fim; falha → apaga só a parcial e relança (quota → erro reconhecível por `isQuotaError`) — `data-model.md` §2 → contrato: `fonte Xtream sem configuração…`
- [ ] T008 `listProgramsForChannels` e `deleteEpgForSource` em `tv-web/src/lib/epg/epgRepository.ts`; `deleteSource` em `tv-web/src/lib/catalog/sourceRepository.ts` chama `deleteEpgForSource` antes de apagar a fonte (FR-012) → contrato: `falha de rede preserva…`
- [ ] T009 `tv-web/src/lib/epg/epgStatus.ts` (novo): `epgStatusOf(record)` (derivação do `data-model.md` §1), `resolveEpgUrl(record, credential)` (logic/sincronizacao-epg.md §1), `epgErrorMessage(kind)` (tabela de logic/tela-epg-configuracoes.md), `EPG_STALE_AFTER_MS = 12 h`, `isEpgStale(record, now)`; `getEpgStatus` em `epgRepository.ts` usa `epgStatusOf`; `SourceView` ganha `epg: EpgStatus` e `epgManualHost?` em `toView` (`sourceRepository.ts`) — **nenhuma URL** em `SourceView`
- [ ] T010 [P] `parseXmltvTime` em `tv-web/src/lib/epg/xmltvParser.ts` (logic/xmltv-parse.md)
- [ ] T011 `parseXmltv` em `tv-web/src/lib/epg/xmltvParser.ts` — varredura por pedaços, `decode`, CDATA, `channel` vazio descartado, título vazio descartado, janela por sobreposição (logic/xmltv-parse.md) → contrato: `lê em pedaços partidos…`
- [ ] T012 [P] `nowAndNext` em `tv-web/src/lib/epg/nowNext.ts` (logic/agora-e-a-seguir.md) → contrato: `acha agora/a seguir sem inventar…`
- [ ] T013 `tv-web/src/lib/epg/epgFetch.ts` (novo): `textChunks(body)` com gzip por magic `1f 8b` + `DecompressionStream`, `TextDecoder` em modo stream, `reader.cancel()` no `finally`; detecção cedo de `not_xmltv` (primeiro conteúdo útil sem `<tv`) — logic/sincronizacao-epg.md §2–§3
- [ ] T014 `syncEpg` em `tv-web/src/lib/epg/epgSync.ts`: resolve → baixa → lê → grava → registra estado; categorias de erro (`network`/`refused`/`not_xmltv`/`unreadable`/`storage_full`); descartar se a fonte sumiu ou foi desativada durante a execução (FR-011); **nenhum** log do erro cru — logic/sincronizacao-epg.md §2 → contratos: `fonte Xtream sem configuração…`, `falha de rede preserva…`
- [ ] T015 Setters de configuração em `tv-web/src/lib/epg/epgRepository.ts`: `setEpgManualUrl(sourceId, url | undefined)` (valida http/https, lança erro de validação sem ecoar a URL), `setEpgOffsetHours(sourceId, n)` (inteiro, clamp −12…+12), `setEpgEnabled(sourceId, enabled)` (desativar apaga a programação — FR-021)
- [ ] T016 Executor: `tv-web/src/lib/epg/epgWorker.ts` (mensagens `sync`/`done`/`error` só com nome) e `tv-web/src/lib/epg/epgRunner.ts` (`requestEpgSync` single-flight por fonte, `isEpgSyncing`, `subscribeEpgSyncing`, `onEpgSyncFinished`, plano B na thread principal) — logic/sincronizacao-epg.md §4; molde: `tv-web/src/lib/catalog/importRunner.ts`/`importWorker.ts`
- [ ] T017 Migração única (FR-007, D-007): `decideOnOpen` em `tv-web/src/lib/catalog/freshness.ts` devolve `'migrate'` para fonte já sincronizada sem `epgIdsCapturedAt` (depois da regra de `never_synced`, antes da idade)

### Testes da Fase

- [ ] T018 [P] Testes unitários em arquivos **não** de contrato: `xtreamConnector.test.ts` (epg_channel_id string/null/vazio), `classifier.test.ts` (tvg-id só canal), `m3uParser.test.ts` (atributos do cabeçalho), `importPipeline.test.ts` (`epgDeclaredUrl` e `epgIdsCapturedAt` gravados; ausência de `url-tvg` limpa o valor anterior), `freshness.test.ts` (migrate por `epgIdsCapturedAt`), `tv-web/src/lib/epg/epgStatus.test.ts` (precedência manual→painel→lista, derivação de estado, host sem path/query), `tv-web/src/lib/epg/epgFetch.test.ts` (gzip por magic, `Content-Encoding` ignorado, `not_xmltv` com HTML), `tv-web/src/lib/epg/epgRepository.test.ts` (falha no meio preserva a geração ativa; quota → `storage_full`; setters), `tv-web/src/lib/epg/epgRunner.test.ts` (duas chamadas = uma sincronização; desativar durante a execução descarta; `onEpgSyncFinished` chamado), `sourceRepository.test.ts` (`SourceView` sem `epgManualUrl`/`epgDeclaredUrl`; `deleteSource` apaga programação)

**Critério de Conclusão**: `npx vitest run src/lib/epg` → 4/4 contratos da fase verdes e `..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 030-epg-dados-agora` íntegro (rodar da raiz); T018 verde; `npx tsc -b` e `npm run lint` limpos; `grep` por `console.`/`logger.` em `src/lib/epg` sem erro cru.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 - Ver o que está passando agora na lista de canais (Priority: P1) 🎯 MVP

**Objetivo**: EPG obtido sozinho após importar/abrir, e "Agora" + progresso em toda linha de canal da Live TV.

**Independent Test**: fixture XMLTV conhecida → importar → entrar numa categoria: título e barra certos nos canais com id; slot vazio nos sem id.

### Contrato da Fase

- `linha de canal: com id de EPG mostra o programa atual e a barra; sem id, slot vazio e sem barra` — origem: US1/AC1-AC2, FR-023/FR-029/FR-030, SC-003
- Comando: `npx vitest run src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx`

### Implementation

- [ ] T019 [US1] Gatilhos em `tv-web/src/features/import/importApi.ts`: `startLocalImport` → ao concluir com `status === 'completed'`, `requestEpgSync(sourceId)`; `useOpenSource` → quando **não** dispara importação e `isEpgStale`, `requestEpgSync`; `SourceOut`/`toSourceOut` ganham `epg` e `epg_manual_host` (nunca URL)
- [ ] T020 [US1] `tv-web/src/App.tsx`: assinar `onEpgSyncFinished` na raiz e invalidar `['epg']` e `['sources']` (D-009)
- [ ] T021 [US1] Pacote: `new Worker(new URL('./epgWorker.ts', import.meta.url), { type: 'module' })` emite `assets/epgWorker.js` → adicionar em `CCPlayTv/tizen_web_project.yaml` (com comentário no estilo do `importWorker.js`) e qualquer chunk extra que o build acusar; `npm run build:tizen` verde (R-005)
- [ ] T022 [P] [US1] `tv-web/src/lib/useNow.ts` (novo, intervalo configurável, limpa no unmount) e `useEpgPrograms(sourceId, channelKeys)` em `tv-web/src/features/catalog/catalogApi.ts` (query `['epg', sourceId, chaves únicas ordenadas]`, lê programas `[now − 24 h, now + 48 h]` + `epgOffsetHours`; nunca rede; sem chaves → desabilitada) — logic/agora-e-a-seguir.md
- [ ] T023 [US1] `tv-web/src/features/live/LiveScreen.tsx` `renderColumns`: `ChannelRow` recebe `nowPlaying`/`progress` de `nowAndNext` por `epg_channel_id` (vale para categoria, "★ Favoritos", "Todos", busca por categoria e lista de zapping — todos passam por `renderColumns`) → contrato: `linha de canal: com id de EPG…`

### Testes da Fase

- [ ] T024 [P] [US1] `tv-web/src/features/live/LiveScreen.test.tsx` (ou arquivo novo `LiveScreen.epg.test.tsx`): "Agora" em "★ Favoritos"/"Todos"/lista de zapping; programa vira ao passar o horário (avançar `Date` + tick de `useNow`); mover o foco não chama `listProgramsForChannels` com rede (espionar `fetch`: zero chamadas); `importApi` dispara `requestEpgSync` só em `completed`

**Critério de Conclusão**: `npx vitest run src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx` → 1/1 verde e trava íntegra; T024 verde; `npm run build:tizen` verde com `assets/epgWorker.js` listado; no navegador, fonte Xtream do `.env` mostra "Agora" sem nenhuma configuração (quickstart passos 1–3).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - Configurar e acompanhar o EPG da fonte (Priority: P1)

**Objetivo**: estado do EPG na linha da fonte e tela "EPG da lista" real; remove `settings-epg`.

**Independent Test**: fonte M3U sem `url-tvg` → informar endereço → "EPG vinculado" → "Agora" aparece; +1 h desloca sem download; desativar apaga.

### Implementation

- [ ] T025 [US2] Navegação: screen `{ name: 'epg-settings'; sourceId: string }` em `tv-web/src/navigation/appNav.ts` (molde `edit-source`, restauração `{ zone: 'sources', sourceId, action: 'epg' }`); rota em `tv-web/src/App.tsx`; `SettingsScreen` ganha prop `onOpenEpg(source, from)` e a coluna 3 deixa de mostrar toast — `tv-web/src/features/settings/SettingsScreen.tsx`
- [ ] T026 [P] [US2] Remover `settings-epg` de `tv-web/src/lib/comingSoon.ts` e ajustar `tv-web/src/lib/comingSoon.test.ts` (lista e `backlogItem`)
- [ ] T027 [P] [US2] `tv-web/src/features/settings/SourcesPanel.tsx`: texto de estado do EPG por linha (`formatEpgStatus(source.epg, syncing)` em `tv-web/src/features/sources/sourceFormat.ts`), "Sincronizando EPG" via hook `useEpgSyncing(sourceId)` exposto por `importApi.ts` (`useSyncExternalStore` sobre `epgRunner`)
- [ ] T028 [US2] `tv-web/src/features/settings/EpgSettingsScreen.tsx` (novo) conforme `logic/tela-epg-configuracoes.md`: estado + origem (host só do manual), `TextField purpose="url"` vazio com validação (FR-018), deslocamento ←/→ (grava e invalida `['epg']`, sem sync), "Sincronizar agora"/"Tentar novamente", "Desativar EPG" com `Modal` de confirmação / "Ativar EPG"; ≥ 1 focável em todo estado; erro com mensagem §45 + `EPG-02`; mutations em `importApi.ts` (telas não importam `lib/` direto)
- [ ] T029 [P] [US2] Estilos da tela em `tv-web/src/styles/settings.css` só com tokens V14; controles sem nome acessível corrigidos (padrão `findUnnamedControls`, feature 028)

### Testes da Fase

- [ ] T030 [P] [US2] `tv-web/src/features/settings/EpgSettingsScreen.test.tsx`: cada estado tem focável; endereço inválido mantém foco e mostra erro sem ecoar credencial; Enter com vazio limpa o manual; ←/→ muda deslocamento sem chamar `requestEpgSync`; Desativar exige confirmação e apaga; `findUnnamedControls` vazio; texto da tela nunca contém a URL manual completa nem `password=`; `appNav` test (`epg-settings` → RETURN volta a `settings` com foco no botão EPG); `SettingsScreen` test (coluna EPG chama `onOpenEpg`, não toast)

**Critério de Conclusão**: T030 verde; contratos travados da feature 026 (`SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) e 023/024 (`appNav.*.contract.test.ts`) continuam verdes sem edição; `comingSoon` sem `settings-epg`; quickstart passos 8–10 no navegador.

**Checkpoint**: User Stories 1 e 2 funcionando de forma independente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - "Agora" e "A seguir" no preview da Live TV (Priority: P2)

**Objetivo**: preview do canal focado com programa atual (título, horário, progresso, sinopse) e "A seguir".

**Independent Test**: focar canal com EPG → área preenchida; sem EPG → área vazia sem rótulos.

### Implementation

- [ ] T031 [US3] `tv-web/src/features/live/LiveScreen.tsx`: preencher o slot `.live-channel-now` do preview — "Agora" (título, `HH:MM – HH:MM` no horário local, barra, sinopse em até 3 linhas) e "A seguir" (título + horário) — sem nenhum rótulo quando não houver `now` nem `next`; helper `formatTimeRange` em `tv-web/src/lib/epg/formatEpgTime.ts`
- [ ] T032 [P] [US3] `tv-web/src/styles/live.css`: estilos do bloco (tokens V14; `-webkit-line-clamp: 3` na sinopse; reservar a mesma área, sem salto de layout)

### Testes da Fase

- [ ] T033 [P] [US3] Teste de preview (arquivo não-contrato): com EPG mostra "Agora"/"A seguir"/sinopse; só `next` (lacuna) mostra só "A seguir"; sem EPG, nenhum texto "Agora"/"A seguir"; foco rápido entre canais não chama `fetch`; `formatEpgTime.test.ts`

**Critério de Conclusão**: T033 verde; contratos 018/024 da Live TV intactos; quickstart passo 4.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 4 - Programa atual no player Live e na Home (Priority: P3)

**Objetivo**: banda do player Live e rail "Canais favoritos" com o programa atual.

**Independent Test**: tocar canal com EPG → banda com programa; ↑/↓ troca e a banda acompanha; Home mostra programa nos cards.

### Implementation

- [ ] T034 [US4] `PlayerIdentity.now?: { title: string; progress: number }` em `tv-web/src/components/chromeControls.ts`; `tv-web/src/components/PlayerChrome.tsx` desenha título + barra na banda só quando presente (D-014); estilos em `tv-web/src/styles/player.css` (tokens)
- [ ] T035 [US4] `tv-web/src/features/live/LiveScreen.tsx`: `identity.now` do canal em reprodução (usa `useEpgPrograms` do `playing` + `useNow`), atualizado na troca de canal (zapping/CH±)
- [ ] T036 [US4] `tv-web/src/features/home/HomeContent.tsx`: `ChannelRow` da rail "Canais favoritos" recebe `nowPlaying` (só título, FR-027) via `useEpgPrograms` das chaves dos favoritos exibidos

### Testes da Fase

- [ ] T037 [P] [US4] `PlayerChrome` test (banda com/sem `now`, nenhum `<button>` novo na banda); `HomeContent.test.tsx` (card com programa; sem EPG igual a hoje); contratos travados de 027/029 (`PlayerLayer.player-chrome.contract.test.tsx`, `PlayerLayer.audio-legendas-info.contract.test.tsx`) e 026 (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) verdes sem edição

**Critério de Conclusão**: T037 verde; quickstart passos 5–7 no navegador.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: E2E, dados reais, documentação e gates.

- [ ] T038 [P] `tv-web/e2e/epg-dados-agora.mjs` (novo): servidor fictício no próprio script servindo M3U com `url-tvg` → XMLTV **gzip** com horários relativos a "agora" e `tvg-id` em parte dos canais; cobrir: importar → "Sincronizando/EPG vinculado" em Configurações; "Agora" na linha (com/sem id); preview "A seguir"; banda do player; zapping; tela de EPG (endereço inválido, deslocamento +1 h, desativar/ativar); RETURN volta ao botão "EPG"; `assertOneFocus` a cada passo; nenhuma requisição de EPG ao mover o foco. Adicionar ao `test:e2e` em `tv-web/package.json` (mesmo padrão de `executablePath` dos demais scripts)
- [ ] T039 [P] `tv-web/e2e/epg-dados-agora-real.mjs` (novo, **fora** do `test:e2e`): lê o `.env` da raiz em tempo de execução, cadastra a lista Xtream pela UI, espera "EPG vinculado", confere que ao menos um canal de uma categoria mostra "Agora"; nunca imprime/loga valores do `.env` (saída só com contagens); pula com aviso claro se o `.env` faltar
- [ ] T040 Gates: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen`, `npm run test:e2e` (com `npm run dev` recém-iniciado), `node e2e/epg-dados-agora-real.mjs`, `check-contract-tests.ps1 -Slug 030-epg-dados-agora` e as travas das features 017–029
- [ ] T041 Rodar `quickstart.md` no navegador (cenário ponta a ponta, offline, fonte antiga)
- [ ] T042 [P] Documentação: `CLAUDE.md` (parágrafo da 030 em "Project status"), `.planning/backlog.md` (item 42/tabela "Próximas entregas": 42a/42b entregues), `.planning/migracao-design-system-v14.md` (matriz real × mock: `settings-epg` real; slot "Agora" real)
- [ ] T043 Revisão de segredos antes de commit (constitution "Fluxo de Desenvolvimento"): `SourceView`/`SourceOut` sem URL; nenhum `console`/`logger` com erro cru de EPG; `epgManualUrl`/`epgDeclaredUrl` fora de tela, `aria-label`, toast e mensagem de erro
- [ ] T044 Emenda inline na ADR-010 (`**Atualização (030-epg-dados-agora):**` — endereço XMLTV manual e `url-tvg` declarado sob a mesma exceção e as mesmas proibições) via `sdd-adr` (Complexity Tracking do `plan.md`)
- [ ] T045 (Recomendado, não gate) Passada na TV física via `tizen-tv`: quickstart passos 2–7 + SC-002 durante a sincronização, Worker carregado sem plano B, `.xml.gz` (R-007), URL externa do `.env` (R-001); registrar em `Riscos e Decisões`

### Checklist de Release

- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [ ] Fase 6 (User Story 4) concluída
- [ ] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (030 e travas de 017–029)
- [ ] `npm run build:tizen` verde com `assets/epgWorker.js` na lista do pacote
- [ ] `npm run test:e2e` verde (inclui `e2e/epg-dados-agora.mjs`) e `e2e/epg-dados-agora-real.mjs` verde com o `.env`
- [ ] Nenhuma URL/credencial em log, tela ou erro (T043)
- [ ] `quickstart.md` executado com sucesso
- [ ] Documentação e ADR-010 atualizadas (T042/T044)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 feito; T002 antes de T013/T018
- **Foundational (Phase 2)**: T003 primeiro (schema); T004/T005/T010/T012 em paralelo; T007–T009 antes de T014; T013 antes de T014; T014 antes de T016 — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende da Fase 2; T021 depende de T016
- **US2 (Phase 4)**: depende da Fase 2 e de T019 (`SourceOut.epg`); independente de T023
- **US3 (Phase 5)**: depende de T022
- **US4 (Phase 6)**: depende de T022
- **Polish (Phase 7)**: depende de todas as stories

### Parallel Opportunities

- T004, T005, T010, T012 (arquivos diferentes, após T003)
- T026, T027, T029 na Fase 4
- US3 e US4 em paralelo depois da Fase 3
- T038 e T039

---

## Parallel Example: Phase 2

```bash
Task: "T004 [P] Captura Xtream em xtreamConnector.ts"
Task: "T005 [P] Captura M3U em classifier.ts/importPipeline.ts/categoryLoader.ts"
Task: "T010 [P] parseXmltvTime"
Task: "T012 [P] nowAndNext"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 (T002)
2. Fase 2 (fundação + 4 contratos)
3. Fase 3 (US1 + contrato da tela)
4. **PARAR E VALIDAR**: "Agora" na Live TV com a fonte real do `.env`

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → "Agora" na lista (MVP)
3. US2 → Configurações (remove `settings-epg`)
4. US3 → preview; US4 → banda + Home
5. Polish → E2E (fictício + real), docs, gates

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
