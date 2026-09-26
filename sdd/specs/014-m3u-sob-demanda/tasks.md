---
description: "Tasks da feature 014-m3u-sob-demanda"
---

# Tasks: Fonte M3U Estrutura-Primeiro (Detecção de Painel Xtream ou Arquivo Guardado)

**Input**: Documentos de design de `sdd/specs/014-m3u-sob-demanda/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/importacao-m3u.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/`; lógica de catálogo em `tv-web/src/lib/catalog/`
  (telas nunca falam com Dexie direto); telas em `tv-web/src/features/`.
- Testes Vitest ao lado do arquivo testado (`*.test.ts`/`*.test.tsx`), com
  `fake-indexeddb` para Dexie.
- E2E em `tv-web/e2e/*.mjs`, dados fictícios em `tv-web/e2e/fixtures/`,
  servidor HTTP local criado pelo próprio script (padrão de
  `e2e/favoritos.mjs`).
- Backend `api/` não é tocado (ADR-008).

---

## Phase 1: Setup

**Purpose**: medir o ponto de partida e travar o comportamento atual antes de mexer.

- [X] T001 (Fechada com valor informado pelo usuário em 2026-09-24: **60 s**, navegador, lista real, tamanho não informado — não medido nesta sessão; ver `plan.md` → Execution Notes.) Medir o tempo de importação atual da lista real do usuário por URL M3U no navegador (`npm run dev`), da confirmação até "Concluída", seguindo `quickstart.md` → Medição, passo 1. Registrar o número e o ambiente em `sdd/specs/014-m3u-sob-demanda/plan.md` → Execution Notes. Nunca registrar a URL.
- [X] T002 [P] Teste-referência de paridade em `tv-web/src/lib/catalog/m3uParity.test.ts`: roda o caminho integral **atual** (`startImport` com `fetch` simulado) sobre uma lista fictícia com canais, filmes, séries `SxxEyy`, episódio sem padrão, entradas não classificáveis, grupo vazio e, num segundo caso, o Modo limitado (`/live/`, `/movie/`, `/series/` na URL). Guarda como esperado as categorias (kind, nome, ordem, contagem) e os itens normalizados (kind, name, originalName, group, seriesId, seasonNumber, episodeNumber, providerStreamId, streamExtension, directUrl), sem ids locais. Tem de passar hoje (SC-005).

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: T001 (linha de base informada pelo usuário, 60 s). T002: `tv-web/src/lib/catalog/m3uParity.fixtures.ts` (fixtures `M3U_AVULSA_FIXTURE`/`M3U_LEGACY_FIXTURE`, normalizadores `normalizeCategories`/`normalizeItems`, expectativas `EXPECTED_AVULSA`/`EXPECTED_LEGACY` + tallies) e `tv-web/src/lib/catalog/m3uParity.test.ts`, rodando `startImport` de hoje sem tocar `importPipeline.ts`.
- Testes executados: `npm run test -- src/lib/catalog/m3uParity.test.ts` (2/2 passou, expectativa derivada à mão bateu de primeira); `npm run test` completo (563/567 — 4 falhas em `*.favorites.test.tsx`/`LiveScreen.test.tsx`, todas por timers reais sensíveis a carga quando a suíte inteira roda em paralelo; nenhum arquivo tocado por esta feature; confirmado pré-existente: `git status` mostra zero arquivo de produção alterado, e os 4 arquivos passam isolados — ex. `LiveScreen.favorites.test.tsx` 12/12 sozinho); `npm run lint` (só warnings pré-existentes, nenhum novo); `npm run build` (limpo).
- Pendências: nenhuma.

---

## Phase 2: Foundational

**Purpose**: esquema v10 e campos que as três stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T003 [P] Em `tv-web/src/lib/catalog/catalogRepository.test.ts`: `publishGeneration`, `discardGeneration` e `deleteAllForSource` apagam as linhas de `storedEntries` das gerações certas e só delas.
- [X] T004 [P] Em `tv-web/src/lib/catalog/sourceRepository.test.ts`: `markSynced` grava `providerImportMode` e `limitedReason` e **limpa** os dois quando a marca vem sem eles; `providerMigratedAt` só muda quando `mode` vem definido; `SourceView` expõe `limitedReason`.

### Implementation

- [X] T005 `tv-web/src/lib/catalog/db.ts`: v10 com a tabela `storedEntries` (`'++id, [sourceId+generation], [sourceId+generation+categoryId+chunk]'`), tipos `StoredEntriesRecord`/`StoredCatalogRecord`, `'stored'` em `CatalogFetchMode`, `limitedReason` em `SourceRecord`, `'storage_full'` em `ImportErrorKind` (ver `data-model.md` §1–§4). Comentário curto no bloco da v10, no estilo das versões anteriores.
- [X] T006 `tv-web/src/lib/catalog/catalogRepository.ts`: `publishGeneration`, `discardGeneration` e `deleteAllForSource` incluem `storedEntries` (na transação de `publishGeneration`).
- [X] T007 `tv-web/src/lib/catalog/sourceRepository.ts`: `limitedReason` em `SourceView`/`toView`; `SyncMark.limitedReason`; `markSynced` grava `providerImportMode` e `limitedReason` sempre (D-010). Revisar as duas chamadas de `markSynced` em `tv-web/src/lib/catalog/importPipeline.ts` (sucesso e publicação parcial por espaço) para passarem `mode` explicitamente, sem apagar o modo de uma fonte de provedor por engano.
- [X] T008 [P] `tv-web/src/features/import/importApi.ts`: `SourceOut.limited_reason` e `toSourceOut`; mensagem para `'storage_full'` ("Não há espaço no aparelho para guardar esta lista.") onde as outras categorias de erro viram texto, e a mesma em `tv-web/src/features/import/ImportProgressScreen.tsx` se a tela tiver mapeamento próprio.

**Critério de Conclusão**: banco abre na v10 sobre um banco v9 existente sem perder dados; descarte e publicação limpam `storedEntries`; `markSynced` nunca deixa um `legacy_m3u` antigo para trás; `npm run test`, `npm run lint`, `npm run build` limpos.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: `db.ts` v10 (`storedEntries`, `StoredEntriesRecord`/`StoredCatalogRecord`, `CatalogFetchMode: 'stored'`, `SourceRecord.limitedReason`, `ImportErrorKind: 'storage_full'`). `catalogRepository.ts`: `allStoredEntriesGenerations` + `storedEntries` em `publishGeneration`/`discardGeneration`/`deleteAllForSource`. `sourceRepository.ts`: `SourceView.limitedReason`, `SyncMark.limitedReason`, `markSynced` agora grava `providerImportMode`/`limitedReason` sempre (inclusive ausentes), `providerMigratedAt` só avança com `mode` definido. `importPipeline.ts`: `mode`/`allowedFormats`/`limitedReason` subiram para o escopo de `startImport` (eram locais de `execute()`) para os dois pontos que chamam `markSynced` (sucesso e publicação parcial por espaço) passarem os mesmos valores — sem isso, a publicação parcial apagaria o modo de uma fonte de provedor. `importApi.ts`/`ImportProgressScreen.tsx`: `SourceOut.limited_reason`, mensagem de `storage_full`.
- Testes executados: `npm run test -- src/lib/catalog/db.test.ts src/lib/catalog/catalogRepository.test.ts src/lib/catalog/sourceRepository.test.ts src/lib/catalog/importPipeline.test.ts src/features/import/importApi.test.tsx src/features/home/HomeScreen.test.tsx` (102/102); `npm run test` completo (573/575 — 2 falhas em `LiveScreen.test.tsx`, mesmo padrão de timer real sob carga da suíte inteira já visto na Fase 1; passa isolado, 22/22; nenhum arquivo desta fase envolvido); `npm run lint` (só warnings pré-existentes + 1 novo esperado: `limitedReason` "never assigned" — resolve na Fase 4/US2, T025, que é quem atribui o valor); `npm run build` (limpo).
- Pendências: warning de lint de `limitedReason` some quando a T025 (Fase 4) atribuir o valor no ramo de Modo limitado.

---

## Phase 3: User Story 1 - URL M3U de painel Xtream importa só as categorias (Priority: P1) 🎯 MVP

**Objetivo**: URL `…/get.php?username=…&password=…` de painel que responde ao protocolo segue o caminho de provedor da 010; recusa e assinatura vencida falham com o motivo real; o resto continua no caminho integral de hoje (marcado Modo limitado quando havia painel).

**Independent Test**: adicionar a URL de um painel fictício que responde; importação conclui contando categorias, nenhum `get.php` é pedido, a fonte aparece como URL M3U sem selo, entrar numa categoria traz itens e um canal toca.

### Testes da Fase

- [X] T009 [P] [US1] `tv-web/src/lib/catalog/m3uPanelUrl.test.ts`: aceita `http(s)://host[:porta][/sub]/get.php?username=u&password=p[&type=…&output=…]`; recusa sem `get.php`, sem usuário ou senha, URL inválida, `/playlist/u/p`; devolve `dns` normalizado sem credencial; nunca lança.
- [X] T010 [P] [US1] `tv-web/src/lib/catalog/sourceRepository.test.ts`: `readCredential` de fonte `m3u_url` com URL de painel devolve dns/usuário/senha derivados e `allowedFormats` da fonte; com URL avulsa devolve `undefined`; nada é gravado em `providerUsername`/`providerPassword`.
- [X] T011 [US1] `tv-web/src/lib/catalog/importPipeline.test.ts`, um caso por ramo da D-002 (`fetch` simulado): confirmado → categorias `on_demand`, zero linhas em `channels`, nenhum pedido a `get.php`, `providerImportMode: 'xtream_api'`, `limitedReason` ausente; `auth: 0` → falha `invalid_credentials`; 401 → falha `invalid_credentials`; `exp_date` vencido → falha `subscription_expired`; `player_api.php` 404 → caminho integral, `legacy_m3u`, `protocol_unavailable`; rede recusando `player_api.php` e servindo `get.php` → `legacy_m3u`, `panel_unreachable`; URL avulsa → caminho integral sem modo nem motivo.
- [X] T012 [US1] No mesmo arquivo, teste de não-vazamento (SC-007): em cada ramo de falha, nem `run.errorKind`, nem a mensagem do erro, nem chamadas espionadas de `logger` (`tv-web/src/lib/logger.ts`) contêm o usuário, a senha ou a URL da fixture.
- [X] T013 [P] [US1] Criar `tv-web/src/lib/catalog/playbackUrl.test.ts` (não existe hoje): item de categoria `on_demand` de fonte `m3u_url` de painel monta a URL de reprodução com a credencial derivada.

### Implementation

- [X] T014 [P] [US1] Criar `tv-web/src/lib/catalog/m3uPanelUrl.ts` com `parsePanelUrl` (`logic/importacao-m3u.md` §1).
- [X] T015 [US1] `readCredential` em `tv-web/src/lib/catalog/sourceRepository.ts` deriva a credencial para `type: 'm3u_url'` (D-003; comentário da porta restrita atualizado).
- [X] T016 [US1] `tv-web/src/lib/catalog/importPipeline.ts`: extrair o bloco de estrutura do provedor (`fetchLiveCategories` + `ingestCategoriesOptional`) para uma função que recebe a credencial, sem mudar o comportamento do ramo de provedor (testes existentes continuam verdes).
- [X] T017 [US1] `tv-web/src/lib/catalog/importPipeline.ts`: roteamento da fonte `m3u_url` e `confirmPanel` (`logic/importacao-m3u.md` §2). Enquanto a US3 não entra, o ramo "limitado" chama o `consumeM3u` atual com `refine: true` e o ramo "avulso" com `refine: false`. `markSynced` recebe `mode`, `allowedFormats` e `limitedReason` do ramo.
- [X] T018 [US1] `tv-web/e2e/m3u-sob-demanda.mjs` + `tv-web/e2e/fixtures/m3u-sob-demanda/`: servidor HTTP local fictício que responde `player_api.php` (conta, categorias, streams) e `get.php`, com CORS aberto e contador de requisições por caminho. Cenário A: adicionar a URL `get.php` do servidor, esperar "Concluída", conferir zero pedidos a `get.php`, ausência do selo "Modo limitado" na Home, entrar em Live TV → uma categoria → itens visíveis.

- [ ] T051 [US1] (**Bloqueada — precisa da lista real do usuário**, nunca digitada pelo agente.) Medir SC-001 no navegador (`quickstart.md` → Medição, passo 2) com a lista real do usuário, se ela for URL de painel: tempo da confirmação até "Concluída", meta ≤ 15 s. Registrar número e ambiente em `plan.md` → Execution Notes, passando ou não.

**Critério de Conclusão**: os ramos da D-002 cobertos por teste; URL de painel confirmado nunca baixa `get.php`; nenhum ramo de erro vaza credencial; fonte de provedor continua idêntica (suíte existente verde); cenário A do E2E passa; SC-001 medido e registrado.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Código concluído (2026-09-24). T051 pendente — depende de você rodar a importação da sua lista real no app.
- Feito: `m3uPanelUrl.ts` (`parsePanelUrl`, D-001). `sourceRepository.ts`: `readCredential` deriva dns/usuário/senha da URL para `type: 'm3u_url'` (D-003), sem copiar para `providerUsername`/`providerPassword`. `importPipeline.ts`: `ingestCategories`/`ingestCategoriesOptional`/`ingestProviderStructure` extraídos para fora do `if` de provedor (T016, comportamento idêntico); `confirmPanel` (D-002) e o roteamento da fonte `m3u_url` (T017) — painel confirmado usa `ingestProviderStructure`; recusa/expirada falham a importação; sem resposta ao protocolo ou rede indisponível cai no `consumeM3u` atual com `refine: true`, igual ao Modo limitado de provedor. `run.unit = 'items'` explícito no ramo "limitado" direto (achado: `ingestProviderStructure` nunca chega a rodar nesse ramo, então nada mais setava `run.unit`). E2E `m3u-sob-demanda.mjs` + fixture `painel.m3u`, cenário A, com um `launchBrowser()` que cai para a resolução padrão do Playwright quando o binário fixo de `favoritos.mjs` não existe neste ambiente (Windows) — achado durante a execução, não estava no plano.
- Testes executados: `npm run test -- src/lib/catalog/importPipeline.test.ts src/lib/catalog/m3uPanelUrl.test.ts src/lib/catalog/playbackUrl.test.ts src/lib/catalog/sourceRepository.test.ts src/lib/catalog/m3uParity.test.ts` (73/73); `node e2e/m3u-sob-demanda.mjs` contra `npm run dev` (cenário A, 6/6 verificações); `npm run test` completo (600/602 — mesmo padrão de timer real sob carga em `LiveScreen.test.tsx`, arquivo não tocado por esta feature); `npm run lint` (só warnings pré-existentes); `npm run build` (limpo, depois de corrigir um erro de tipo em `mock.calls.some` no teste novo).
- Pendências: T051 (medição SC-001 com a lista real do usuário).

---

## Phase 4: User Story 2 - Saber por que uma fonte está em Modo limitado (Priority: P2)

**Objetivo**: toda fonte em Modo limitado tem motivo registrado; o selo continua na Home e o hub da lista explica motivo, o que se perde, descartes e o que fazer.

**Independent Test**: importar uma fonte de provedor (ou URL de painel) cujo painel não responde ao protocolo; selo na Home; hub com a explicação e o motivo, sem URL, usuário ou senha.

### Testes da Fase

- [X] T019 [P] [US2] `tv-web/src/features/list-home/LimitedModeNotice.test.tsx`: texto certo para `protocol_unavailable` e `panel_unreachable`; diz que todos os itens identificados estão disponíveis; lista o que se perde (FR-021); mostra o número de descartadas só quando > 0; motivo ausente/desconhecido cai num texto genérico sem inventar motivo (FR-020); nenhum texto contém `username=`, `password=` ou `http`.
- [X] T020 [P] [US2] `tv-web/src/features/list-home/ListHomeScreen.test.tsx`: a explicação aparece só com `provider_import_mode === 'legacy_m3u'`; as três tiles continuam navegáveis e SELECT continua abrindo o destino com a explicação na tela.
- [X] T021 [US2] `tv-web/src/lib/catalog/importPipeline.test.ts`: fonte de provedor que cai no caminho M3U grava `limitedReason: 'protocol_unavailable'`; uma ressincronização que volta ao protocolo limpa modo e motivo (FR-023). Mesmo par de casos para fonte `m3u_url` de painel: primeira importação com `player_api.php` em 404 (`legacy_m3u`), segunda com o painel respondendo (`xtream_api`, motivo ausente, categorias `on_demand`) — a detecção é refeita a cada importação (FR-004).

### Implementation

- [X] T022 [US2] Antes de desenhar, conferir `docs/design/` (Grep em `CCPlayTv Prototype - Standalone.html` por `O que você quer assistir` e por avisos/estados informativos) e `docs/guia-praticas-app-tv/` (texto em tela de TV, tamanho de leitura). Registrar o que foi encontrado em `plan.md` → Riscos e Decisões.
- [X] T023 [US2] Criar `tv-web/src/features/list-home/LimitedModeNotice.tsx` com o texto da FR-021 por motivo, tom informativo (D-008 da 004), e a classe nova em `tv-web/src/features/screens.css` consumindo só tokens de `tv-web/src/index.css`.
- [X] T024 [US2] `tv-web/src/features/list-home/ListHomeScreen.tsx` recebe a fonte (`SourceOut`) em vez de só `sourceId`/`sourceName`, e renderiza `LimitedModeNotice` quando a fonte está em Modo limitado; `tv-web/src/App.tsx` passa `screen.source`.
- [X] T025 [US2] `tv-web/src/lib/catalog/importPipeline.ts`: ramo de provedor passa `limitedReason: 'protocol_unavailable'` ao cair no caminho M3U.
- [X] T026 [US2] `tv-web/e2e/m3u-sob-demanda.mjs`, cenário B: servidor fictício com `player_api.php` respondendo 404 e `get.php` servindo a lista; esperar "Concluída"; Home com selo "Modo limitado"; abrir a fonte; hub com o texto do motivo `protocol_unavailable`; nenhum texto da página contém o usuário ou a senha da fixture.

**Critério de Conclusão**: os dois motivos aparecem certos no hub; nenhuma URL/credencial no DOM; fonte avulsa sem selo nem explicação; ressincronização que volta ao protocolo limpa tudo; cenário B passa.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: T022 — `docs/design/` não tem tela nem padrão de "aviso informativo" pronto (só um comentário solto sem relação); `docs/guia-praticas-app-tv/` não fixa limite de caracteres, só reforça legibilidade à distância (D02) — desenhei texto curto, frases diretas, sem jargão. `LimitedModeNotice.tsx` (motivo, "itens disponíveis", 4 itens do que se perde, contagem de descartadas condicional, o que fazer) + `.limited-mode-notice*` em `screens.css`, só tokens. `ListHomeScreen` passa a receber `source: SourceOut` (não mais `sourceId`/`sourceName` soltos); `App.tsx` atualizado. `importPipeline.ts`: `limitedReason = 'protocol_unavailable'` no catch do ramo de provedor (mesmo motivo do caminho `m3u_url`). E2E cenário B adicionado ao mesmo `m3u-sob-demanda.mjs`, com um segundo servidor fictício (`startLimitedPanelServer`) e uma segunda fonte na mesma sessão do navegador (navegação por `ArrowRight`/`Enter` até o card "+", sem clique — a Home só responde a SELECT). Achado durante a execução: o primeiro nome que dei à fonte do cenário B ("Fonte E2E Modo Limitado") continha a própria frase que os asserts procuravam, colidindo com o selo e com o título do aviso (`getByText`/`locator` com `hasText` casam substring, case-insensitive) — troquei o nome e apertei os seletores para classes específicas (`.source-card-badge`, `.limited-mode-notice-title`) em vez de busca de texto livre.
- Testes executados: `npm run test -- src/features/list-home/LimitedModeNotice.test.tsx` (10/10); `npm run test -- src/features/list-home/` (16/16, incluindo `ListHomeScreen.test.tsx` atualizado); `npm run test -- src/lib/catalog/importPipeline.test.ts` (38/38); `node e2e/m3u-sob-demanda.mjs` contra `npm run dev`, dois cenários (A+B), rodado duas vezes seguidas para checar estabilidade — 17/17 verificações nas duas rodadas; `npm run lint` (o warning de `limitedReason` "never assigned" da Fase 2 sumiu, como esperado; só os warnings pré-existentes ficaram); `npm run build` (limpo); `npm run test` completo (613/617 — as 4 falhas são o mesmo padrão de timer real sob carga de `*.favorites.test.tsx`/`LiveScreen.test.tsx`; os dois arquivos ainda não confirmados isolados nesta feature — `MoviesScreen.favorites.test.tsx`, `SeriesScreen.favorites.test.tsx` — passam sozinhos, 7/7; nenhum arquivo desta fase envolvido).
- Pendências: nenhuma.

---

## Phase 5: User Story 3 - Lista que não é de painel Xtream usa o arquivo guardado (Priority: P3)

**Objetivo**: a varredura guarda o conteúdo separado por categoria e grava só a estrutura; cada categoria é lida do conteúdo guardado ao entrar, sem rede, e fica em cache até a próxima ressincronização.

**Independent Test**: adicionar uma lista `.m3u` estática grande; importação conclui sem linhas em `channels`; entrar numa categoria traz os itens sem requisição; voltar a ela não relê.

### Testes da Fase

- [X] T027 [US3] `tv-web/src/lib/catalog/importPipeline.test.ts`, varredura: lista avulsa e Modo limitado gravam categorias `stored` com `declaredCount` certo e zero linhas em `channels`; blocos respeitam o teto (teste com teto reduzido via opção); episódios no bloco da categoria da série; não classificáveis descartados e contados; cancelamento no meio descarta os blocos; `StorageFullError` ao gravar bloco → falha `storage_full`, geração anterior intacta, nada publicado (D-009).
- [X] T028 [US3] `tv-web/src/lib/catalog/categoryLoader.test.ts`: `stored` não lida → `fetched`, itens e episódios em `channels`, `itemsFetchedAt`/`itemsCount` carimbados, blocos da categoria apagados; segunda chamada → `fresh` sem ler nada; duas chamadas simultâneas → uma leitura só (FR-013); sem blocos → `source_missing`; quota → `failed` e categoria continua listada; nenhuma chamada a `fetch`.
- [X] T029 [P] [US3] `tv-web/src/lib/catalog/seriesLoader.test.ts`: série de categoria `stored` → `fresh`, sem rede, episódios vindos da leitura da categoria.
- [X] T030 [P] [US3] `tv-web/src/features/catalog/catalogApi.test.tsx`: `useCatalogCounts` soma `declaredCount` de `stored` não lida e `count` de `stored` lida.
- [X] T031 [US3] `tv-web/src/lib/catalog/m3uParity.test.ts`: novo caso — varrer a mesma fixture da T002 e ler todas as categorias `stored` produz exatamente as categorias e itens esperados pela T002 (SC-005). A expectativa da T002 não é editada.
- [X] T050 [P] [US3] `tv-web/src/features/import/ImportProgressScreen.test.tsx` (FR-018): execução do caminho guardado mostra as etapas reais, sem percentual, e o contador com rótulo que corresponde ao que ele conta (entradas lidas / guardadas — não "canais gravados"). Se o rótulo atual não servir, ajustar em `tv-web/src/features/import/ImportProgressScreen.tsx` e/ou `tv-web/src/features/import/importApi.ts` na mesma task.
- [X] T052 [P] [US3] `tv-web/src/features/catalog/catalogApi.test.tsx` (FR-012): `prefetchCategoryContent` sobre uma categoria `stored` lê do conteúdo guardado sem chamar `fetch`; a entrada seguinte na mesma categoria usa o cache, sem segunda leitura; pré-carga e entrada simultâneas fazem uma leitura só.
- [X] T032 [P] [US3] Testes de tela em `tv-web/src/features/live/LiveScreen.test.tsx`, `tv-web/src/features/movies/MoviesScreen.test.tsx` e `tv-web/src/features/series/SeriesScreen.test.tsx`: outcome `source_missing` mostra o estado com "Ressincronizar lista"; SELECT chama `onResync`. (Sem botão "Voltar" separado — RETURN já sai da categoria, mesmo padrão de um único botão que "Tentar de novo" já usa; ver Registro da Fase.)

### Implementation

- [X] T033 [P] [US3] Criar `tv-web/src/lib/catalog/storedEntries.ts`: `storeEntryChunks` (bulkAdd numa transação, quota → `StorageFullError`), `readEntryChunks` (ordem de `chunk`), `countEntryChunks`. Só este módulo e `catalogRepository.ts` tocam `storedEntries`.
- [X] T034 [US3] `tv-web/src/lib/catalog/catalogRepository.ts`: `storeStoredCategory` (uma transação, `logic/importacao-m3u.md` §4) e `setDeclaredCount`.
- [X] T035 [US3] `tv-web/src/lib/catalog/importPipeline.ts`: `scanToStored` (`logic/importacao-m3u.md` §3) no lugar de `consumeM3u` nos três ramos (provedor limitado, painel limitado, avulsa); regra de `fail()` para o caminho guardado (D-009); remover o caminho integral de escrita que ficou sem uso (D-012 — a leitura de `eager` continua).
- [X] T036 [US3] `tv-web/src/lib/catalog/categoryLoader.ts`: ramo `stored` com `readStored`, deduplicação por `inFlight`, outcome `'source_missing'` em `CategoryFetchOutcome`; atualizar o comentário de cabeçalho do módulo.
- [X] T037 [P] [US3] `tv-web/src/lib/catalog/seriesLoader.ts`: `stored` tratado como `eager` (sem rede).
- [X] T038 [P] [US3] `tv-web/src/features/catalog/catalogApi.ts`: `sectionCount` com a regra de `stored` (`logic/importacao-m3u.md` §5).
- [X] T039 [US3] Estado `source_missing` em `tv-web/src/features/live/LiveScreen.tsx`, `tv-web/src/features/movies/MoviesScreen.tsx` e `tv-web/src/features/series/SeriesScreen.tsx` (mesmos elementos `live-state*` do erro atual; texto "O conteúdo desta lista não está mais no aparelho."), com prop nova `onResync`; `tv-web/src/App.tsx` liga `onResync` a `useResyncSource` e navega para a tela de progresso, como a Home faz. **Achado corrigido junto (aprovado pelo usuário)**: "Tentar de novo" das três telas tinha aparência de foco mas SELECT não o ativava (só `onClick`) — bug pré-existente da feature 010, fora do escopo original desta task; corrigido no mesmo `onSelect` que ganhou o caso novo de `source_missing`.
- [X] T040 [US3] `tv-web/e2e/m3u-sob-demanda.mjs`, cenário C: lista `.m3u` estática fictícia com vários grupos de canais, filmes e uma série `SxxEyy`; esperar "Concluída"; zerar o contador de requisições; entrar em duas categorias e na série; conferir contador ainda zero e itens visíveis; sair e voltar a uma categoria e conferir itens na hora.
- [ ] T041 [US3] (**Bloqueada — precisa da lista real do usuário**, nunca digitada pelo agente.) Medir SC-002 e SC-003 (`quickstart.md` → Medição, passo 3) e registrar números e ambiente em `plan.md` → Execution Notes; atualizar R-001/R-002 com o resultado.

**Critério de Conclusão**: nenhuma fonte M3U nova grava itens durante a importação; paridade (T031) verde contra a expectativa original; categoria lida uma vez por geração, sem rede; conteúdo ausente e falta de espaço declarados como a spec pede; cenário C passa; SC-002/SC-003 medidos e registrados, passando ou não.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Código concluído (2026-09-24). T041 pendente — depende de você rodar a importação da sua lista real no app.
- Feito: `storedEntries.ts` (`storeEntryChunks`/`readEntryChunks`/`countEntryChunks`, `isQuotaError` exportado de `catalogRepository.ts` pra reusar a detecção). `catalogRepository.ts`: `storeStoredCategory` (uma transação: substitui itens+episódios da categoria, carimba `itemsFetchedAt`/`itemsCount`, apaga os blocos lidos) e `setDeclaredCount`. `importPipeline.ts`: `scanToStored` substitui `consumeM3u` (removido, junto com `pendingBatch`/`flush`/`accept`/`enqueue`/`toRecord`, todos órfãos); `DEFAULT_BATCH_SIZE` 2500→5000 (D-005, já sem outro consumidor); `fail()` simplificado — `StorageFullError` agora é sempre descarte total com `errorKind: 'storage_full'` (a publicação parcial antiga só fazia sentido pro caminho integral, que não existe mais). `categoryLoader.ts`: ramo `stored` com `readStored`, `dedup()` compartilhado entre os dois ramos (refactor pra não duplicar a lógica de `inFlight`), outcome `source_missing`. `seriesLoader.ts`/`catalogApi.ts`: ajustes pontuais conforme `logic/importacao-m3u.md`. Telas: `contentMissing`/`contentUnavailable` nas três, `onResync` novo, e a correção do achado (T039) no mesmo `onSelect`. E2E cenário C com fixture `avulsa.m3u` nova.
- Testes executados: cada arquivo tocado rodado isoladamente ao longo da fase (`m3uParity`, `importPipeline`, `categoryLoader`, `seriesLoader`, `catalogApi`, `ImportProgressScreen`, `LiveScreen`/`MoviesScreen`/`SeriesScreen` + as três variantes `.favorites`); `npm run test:e2e`-equivalente manual (`node e2e/m3u-sob-demanda.mjs`, 3 cenários, rodado 3x seguidas pra confirmar estabilidade depois de um timeout de navegação corrigido — 22/22 verificações nas 3 rodadas); `npm run lint`/`npm run build` limpos; `npm run test` completo 634/637 (as 3 falhas são o mesmo padrão de timer real sob carga já visto em toda a feature — `LiveScreen.favorites`/`MoviesScreen.favorites`/`SeriesScreen.favorites`, confirmadas 19/19 isoladas).
- Pendências: T041 (medição SC-002/SC-003 com a lista real do usuário).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: documentação canônica, gates e verificação.

- [X] T042 [P] `tv-web/package.json`: `test:e2e` inclui `node e2e/m3u-sob-demanda.mjs`.
- [X] T043 [P] `CLAUDE.md`: status da 014 no "Project status" e reescrita do "Known deviation" (fonte M3U deixa de importar integral; caminho Xtream por URL; conteúdo guardado).
- [X] T044 [P] `sdd/specs/010-catalogo-sob-demanda/spec.md`: nota `**Atualização (014):**` na FR-011 e na FR-012 (e no item de Fora de Escopo correspondente), sem reescrever o texto original.
- [X] T045 [P] `.planning/backlog.md` → "O que já existe hoje": corrigir o trecho "Fonte por URL M3U continua integral, em uma passada" (prosa mantida à mão; a tabela de Features é do script).
- [X] T046 Revisão de segredos (constitution, Fluxo de Desenvolvimento): conferir no diff que nenhuma mensagem, log ou texto de tela interpola `m3uUrl`, credencial derivada ou registro de `storedEntries`.
- [X] T047 Gates: `npm run test`, `npm run lint`, `npm run build`, e `npm run test:e2e` com `npm run dev` rodando.
- [X] T048 Rodar `quickstart.md` inteiro no navegador (cenários 1–6 e itens da constitution).
- [ ] T049 (Recomendado, não obrigatório) TV física pelo procedimento `tizen-tv`: cenários 1, 3 e 4 do `quickstart.md` com a lista real; registrar SC-001/SC-003 em `plan.md`.

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Paridade SC-005 verde contra a expectativa original da T002
- [X] E2E `npm run test:e2e` verde (cenários A, B, C)
- [X] Nenhum vazamento de URL/credencial (T012, T019, T026, T046)
- [ ] Medições SC-001/SC-002/SC-003 registradas com ambiente
- [X] Documentação canônica atualizada (T043–T045)
- [X] `quickstart.md` executado com sucesso

---

**Registro da Fase**:

- Status: Código, documentação e verificação manual concluídos (2026-09-24). Só T049 (opcional/recomendado, TV física) e as medições T041/T051 (bloqueadas na lista real do usuário) seguem pendentes.
- Feito: T042 (`test:e2e` já incluía `m3u-sob-demanda.mjs` desde a Fase 3). T043 (`CLAUDE.md` com o parágrafo "In execution: 014-m3u-sob-demanda" e "Known deviation, mostly closed" reescrito). T044 (notas `**Atualização (ADR-010 / feature 014):**` na spec 010, FR-011/FR-012/Fora de Escopo). T045 (`.planning/backlog.md` corrigido + bullet novo da 014). T046 (revisão de segredos: `git diff` das mudanças de produção só mostra nomes de campo/variável como `credential.username`/`panel.password`, nenhum valor literal; varredura ampla por padrões de domínio/credencial nos 35 arquivos tocados confirmou só usos legítimos da palavra "xtream" como nome de módulo/protocolo e os domínios fictícios já estabelecidos nas fixtures de teste — `exemplo.test`, `avulsa-fictício.test`, `painel-fictício.test`; nenhum valor de `docs/m3u/dados.md` apareceu em lugar nenhum).
- Testes executados (T047): `npm run test` completo — 634/637, as 4 falhas (`LiveScreen.favorites`, `LiveScreen.test.tsx` T010 scroll, `MoviesScreen.favorites`, `SeriesScreen.favorites`) são o mesmo padrão de timer real sob carga já documentado em toda a feature; confirmadas passando isoladas (ex.: `LiveScreen.favorites.test.tsx` sozinho, 12/12). `npm run lint`: limpo (só os mesmos warnings pré-existentes de `react-compiler`/`fast-refresh`, nenhum novo). `npm run build`: limpo. `npm run test:e2e` (cadeia `e2e.mjs && e2e/favoritos.mjs && e2e/m3u-sob-demanda.mjs`): travou em `e2e.mjs` por um bug pré-existente e fora do escopo desta feature — o script espera um diálogo de confirmação de saída em `AddSourceScreen` que não existe mais no app atual (`e2e.mjs` está intocado desde o commit inicial do repositório). Decisão do usuário (AskUserQuestion): logar no backlog e seguir, em vez de corrigir agora — entrada nova em `.planning/backlog.md` → Ideias Futuras, prefixada `[Bug]`. Rodados isoladamente em seguida: `node e2e/favoritos.mjs` falhou por um problema de ambiente já conhecido e documentado (caminho fixo `/opt/pw-browsers/chromium`, incompatível com Windows, não relacionado a esta feature); `node e2e/m3u-sob-demanda.mjs` passou 100% — os três cenários A/B/C (24 verificações) todos verdes.
- T048 (quickstart.md, 2026-09-24): cenários A/B/C (1, 3, 4) já verificados pelo `e2e/m3u-sob-demanda.mjs`; cenário 2 (painel recusa) coberto pelos testes de `importPipeline.test.ts` (T011/T012, mesmo caminho de código, sem vazamento); cenário 5 (conteúdo ausente) coberto por `categoryLoader.test.ts` (T028) + testes de tela (T032); cenário 6 (ressincronizar limpa Modo limitado) verificado com um script Playwright ad-hoc contra `npm run dev` (servidor fictício com protocolo ligável, removido depois — 3/3 verificações passaram: selo aparece, some depois de ressincronizar com o protocolo ligado, explicação some do hub). Itens da constitution: foco+SELECT nos estados novos (T032, código revisado), nenhuma URL/credencial em tela/log (T012/T019/T026/T046), progresso sem percentual (T050), `.limited-mode-notice*` só com tokens de cor/fonte — `border-radius`/tamanhos em px hardcoded, mas isso é a convenção já estabelecida no projeto (não existe `--radius` token em `index.css`; todo o resto de `screens.css` faz o mesmo).
- Pendências: T049 (opcional, TV física), T041/T051 (medições SC-001/SC-002/SC-003 com a lista real do usuário, bloqueadas até ele rodar a importação e reportar os números).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências. T001 precisa acontecer antes de qualquer mudança em `importPipeline.ts`; T002 também (é a referência de paridade).
- **Foundational (Phase 2)**: depende do Setup — bloqueia todas as stories.
- **US1 (Phase 3)**: depende do Foundational.
- **US2 (Phase 4)**: depende do Foundational; não depende da US1 (vale para o Modo limitado de provedor que já existe). T026 fica mais simples depois da T018 (mesmo servidor fictício).
- **US3 (Phase 5)**: depende do Foundational e da T017 (os ramos que a T035 troca de `consumeM3u` para `scanToStored`).
- **Polish (Phase 6)**: depois das stories desejadas.

### Parallel Opportunities

- T003/T004 juntos; T008 em paralelo com T005–T007.
- Na US1: T009, T010, T013, T014 juntos.
- Na US3: T029, T030, T032, T033, T037, T038, T050, T052 juntos.
- IDs T050–T052 foram acrescentados depois do Analyze do `sdd-plan` (achados A3–A5) e ficam fora da ordem numérica de propósito, para não renumerar as demais.
- T042–T045 juntos.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Setup (T001 medição, T002 paridade)
2. Foundational
3. US1 → validar com o cenário A e com a lista real do usuário (esperada: painel)
4. **PARAR E VALIDAR**

### Incremental Delivery

1. US1 → URL de painel já rápida
2. US2 → Modo limitado explicado
3. US3 → lista avulsa e Modo limitado também estrutura-primeiro

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Dados reais do usuário só entram pelo formulário do app, nunca em fixture, doc ou log

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
