---
description: "Tasks da feature 032 — metadata do provedor + TMDB BYOK + Integrações"
---

# Tasks: Metadata de Filmes e Séries — Provedor Primeiro, TMDB (BYOK) Completa, e Tela Integrações

**Input**: Documentos de design de `sdd/specs/032-metadata-tmdb-integracoes/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/*.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Frontend único em `tv-web/` (client-first, ADR-008); `api/` não é tocado.
- Lógica sem UI em `tv-web/src/lib/metadata/` (nova) e `tv-web/src/lib/catalog/`.
- Telas em `tv-web/src/features/<área>/`; CSS no arquivo do dono em `tv-web/src/styles/` (só tokens de `index.css`).
- Testes ao lado do arquivo (`*.test.ts[x]`); contratos travados com sufixo `.metadata-tmdb.contract.test.ts[x]`.
- E2E em `tv-web/e2e/*.mjs` (Playwright, `executablePath` Linux hardcoded como os demais — sobrescrever localmente no Windows).

---

## Phase 1: Setup

**Purpose**: nada a instalar — nenhuma dependência nova. Fase vazia de propósito.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: armazenamento, leitura de dados do provedor e o ponto único de rede do TMDB.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T001 Dexie **v12** em `tv-web/src/lib/catalog/db.ts`: tabelas `titleMetadata` (`'stableId, sourceId'`) e `integrations` (`'id'`) com as interfaces `TitleMetadataRecord`/`IntegrationRecord` de `data-model.md` §1/§4; comentário no padrão das versões anteriores, sem `.upgrade()`
- [X] T002 [P] `fetchVodInfo(base, user, pass, vodId, signal?)` em `tv-web/src/lib/catalog/xtreamConnector.ts` (`action=get_vod_info`), mesmo tratamento de erro/`fetchJsonDirect` de `fetchSeriesInfo`; nunca loga URL
- [X] T003 [P] `fetchSeriesInfo` passa a devolver `{ episodes, info }` em `tv-web/src/lib/catalog/xtreamConnector.ts`; atualizar o único consumidor `tv-web/src/lib/catalog/seriesLoader.ts` e os testes existentes que o chamam (sem mudar comportamento dos episódios) — **desvio (R-008)**: `fetchSeriesInfo` manteve a assinatura (devolve só os episódios) e ganhou o irmão `fetchSeriesDetail` → `{episodes, info}`, evitando reescrever 11 chamadas de teste; `seriesLoader` passa a usar `fetchSeriesDetail` na T011
- [X] T004 [P] `tv-web/src/lib/metadata/providerMetadata.ts`: `normalizeVodInfo(info)` e `normalizeSeriesInfo(info)` → `ProviderMetadata` + `tmdbId?` conforme `data-model.md` §3 (vazio/`"0"`/lista vazia = ausente; `backdrop_path` array ou string; duração `duration_secs`→`duration`→`episode_run_time`×60)
- [X] T005 [P] `tv-web/src/lib/metadata/tmdbConnector.ts`: único montador de requisição a `api.themoviedb.org/3` (v3 `api_key`, v4 `Authorization: Bearer`), `fetchImpl` injetável, erros convertidos em categoria `refused | rate_limited | offline | not_found` sem guardar `message`; helpers `tmdbImageUrl(path)` (`w1280`, sem chave). Ver `logic/chave-tmdb.md` §6
- [X] T006 `deleteSource` em `tv-web/src/lib/catalog/sourceRepository.ts` apaga `titleMetadata` da fonte (FR-026)

### Testes da Fase

- [X] T007 [P] `tv-web/src/lib/metadata/providerMetadata.test.ts` — formatos reais medidos (array/string, `plot`/`description`, `cast`/`actors`, duração nas 3 formas, vazios)
- [X] T008 [P] `tv-web/src/lib/metadata/tmdbConnector.test.ts` — v3 vs v4 na requisição; 401/429/rede → categoria; mensagem de erro sem a chave
- [X] T009 [P] Estender teste de `deleteSource` em `tv-web/src/lib/catalog/sourceRepository.test.ts` (metadata da fonte some, de outra fonte fica)

**Critério de Conclusão**: `npx tsc -b` limpo; T007–T009 verdes; suítes existentes de `seriesLoader`/`xtreamConnector`/`sourceRepository` verdes.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: Dexie v12 (`titleMetadata`, `integrations`, tipos `TitleFields`/`TmdbResultRecord`/`IntegrationRecord` em `db.ts`); `fetchVodInfo` e `fetchSeriesDetail` em `xtreamConnector.ts` (o `info` cru; painel que manda `[]` vira ausente); `providerMetadata.ts` (normalização tolerante, reuso de `normalizeIconUrl`/`normalizeDurationSeconds`); `tmdbConnector.ts` (único ponto de rede TMDB, `TmdbError` com mensagem fixa por categoria, `detectKeyFormat`, `tmdbImageUrl` sem chave); `deleteSource` apaga `titleMetadata` da fonte e preserva a chave.
- Contrato: fase sem contrato próprio; a trava segue íntegra (5 testes, ainda vermelhos por desenho — os stubs só saem nas Fases 3–5).
- Testes executados: `npx tsc -b` limpo; `npx vitest run` nos 5 arquivos da fase (`providerMetadata`, `tmdbConnector`, `sourceRepository`, `xtreamConnector`, `seriesLoader`) → 5 arquivos, 98 testes verdes; `npm run lint` só com avisos pré-existentes (nenhum em arquivo desta feature).
- Pendências: T003 desviou do texto (R-008, `fetchSeriesInfo` mantido + `fetchSeriesDetail`); o `seriesLoader` ainda usa `fetchSeriesInfo` até a T011.

---

## Phase 3: User Story 1 - Detalhe com a metadata do provedor (Priority: P1) 🎯 MVP

**Objetivo**: detalhe de filme e série mostra backdrop, sinopse com "Ver mais", gênero, duração, direção, país e elenco vindos do provedor, sem chave.

**Independent Test**: fonte Xtream, nenhuma chave TMDB; abrir filme e série e conferir campos (quickstart cenários 1–3).

### Contrato da Fase

- `filme de painel sem chave TMDB: um get_vod_info, campos com origem "provider", e reabrir não chama a rede de novo` — US1/AC1, FR-001/002/003, SC-004
- `com metadata pendente "Assistir" já toca; com sinopse longa, "Ver mais" abre a sinopse completa e RETURN devolve o foco a ele` — US1/AC1-2-4, FR-003/004/005
- Comando: `cd tv-web; npx vitest run src/lib/metadata/titleMetadata.metadata-tmdb.contract.test.ts src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx`

### Implementation

- [X] T010 [US1] `ensureTitleMetadata` — caminho do provedor em `tv-web/src/lib/metadata/titleMetadata.ts` (`logic/metadados-e-casamento.md` §1, §4, §5): `stableId` via `buildStableId`, validade 24 h por `isCategoryFresh`, falha não avança `providerFetchedAt`, single-flight por `stableId`, nunca lança; mescla na leitura. O ramo TMDB fica para T030 → contrato: `filme de painel sem chave TMDB…`
- [X] T011 [US1] `seriesLoader.fetchAndStore` grava a metadata do provedor da mesma resposta de `get_series_info` (D-009) em `tv-web/src/lib/catalog/seriesLoader.ts`
- [X] T012 [US1] `MovieDetailScreen` em `tv-web/src/features/movies/MovieDetailScreen.tsx`: `useTitleMetadata(movieId)`, backdrop `<img>` filho com `onError` (D-008), sinopse com line-clamp, botão "Ver mais" quando > 220 caracteres (D-007), linha de foco `more` acima de `actions`, `Modal ariaLabel="Sinopse completa"` rolável por ↑/↓, fatos novos na aba Detalhes (`logic/detalhe-com-metadata.md`) → contrato: `com metadata pendente "Assistir"…`
- [X] T013 [US1] `SeriesDetailScreen` em `tv-web/src/features/series/SeriesDetailScreen.tsx`: mesmo hero/linhas/modal/fatos (aba inicial continua "Episódios"; duração "~n min por episódio"). Extrair o que for comum (ex.: `features/vod/DetailHeroMetadata.tsx` + `SynopsisModal.tsx`) em vez de duplicar
- [X] T041 [US1] Sinopse por episódio (FR-028, decisão do usuário 29/09/2026): `synopsis?: string` em `CatalogRecord` (`tv-web/src/lib/catalog/db.ts`, valor sem índice, sem bump — mesmo padrão de `iconUrl`); `fetchSeriesDetail` lê `info.plot` do episódio (`plot` → `description`; vazio/`"0"` = ausente) em `tv-web/src/lib/catalog/xtreamConnector.ts`; `toEpisodeRecord` em `seriesLoader.ts` a repassa; `EpisodeOut.synopsis` em `tv-web/src/features/catalog/catalogApi.ts`
- [X] T042 [US1] `SeriesDetailScreen` em `tv-web/src/features/series/SeriesDetailScreen.tsx`: bloco com a sinopse do **episódio focado** (só dado já guardado, zero rede), ausente quando o episódio não tem; nunca cai na sinopse da série; CSS no arquivo do dono, só tokens
- [X] T044 [US1] **Ad-hoc, descoberta na passada física (2026-09-29)**: o usuário viu a aba "Elenco" do detalhe ainda "Em breve" enquanto o elenco em texto já existia na aba Detalhes, e pediu para ligá-la. Aba real `Elenco` em `MovieDetailScreen.tsx` e `SeriesDetailScreen.tsx` (sem `softDisabled`; OK troca o painel), painel compartilhado `CastPanel` + `castNames` em `features/vod/DetailMetadata.tsx`/`detailMetadataFormat.ts` (nomes em lista, sem repetição/vazio, selo "Dados: TMDB" só se veio de lá; sem elenco diz "O elenco deste título não foi informado." — ou "Carregando o elenco…" —, nunca nome inventado), CSS em `vod.css`; mock `cast` removido de `lib/comingSoon.ts`. **Fora**: páginas de ator navegáveis e "Semelhantes" (item 45 — `similar` segue mock)
- [X] T045 [P] [US1] Testes da T044: `MovieDetailScreen.test.tsx`/`SeriesDetailScreen.test.tsx` (o teste antigo "aba Elenco é soft-disabled" virou "aba Elenco é real"), casos novos em `MovieDetailScreen.metadata.test.tsx` e `SeriesDetailScreen.metadata.test.tsx`, `comingSoon.test.ts` (sem `cast`), passo da aba Elenco em `e2e/metadata-tmdb.mjs` e ajuste de `e2e/filmes-series-ds-v14.mjs`
- [X] T014 [P] [US1] CSS em `tv-web/src/styles/` (arquivo do dono do `.vod-detail`): `.vod-detail-backdrop` (gradiente por token), `.vod-detail-synopsis` (3 linhas), botão "Ver mais" com `.tv-focus`, modal de texto `.no-scrollbar`; só tokens
- [X] T015 [US1] Conferir que nenhum outro consumidor (grade, hero do catálogo, Home, busca) chama `useTitleMetadata` (D-002) — grep documentado no Registro

### Testes da Fase

- [X] T016 [P] [US1] `tv-web/src/lib/metadata/titleMetadata.test.ts` — série via cache gravado pelo `seriesLoader` sem nova chamada; provedor falhando → `{}` sem lançar e sem avançar validade; >24 h → nova chamada; single-flight (duas chamadas simultâneas = 1 fetch); fonte M3U sem chave → `{}` sem rede
- [X] T017 [P] [US1] Casos extras em `MovieDetailScreen.test.tsx`/`SeriesDetailScreen.test.tsx`: sinopse curta sem "Ver mais"; backdrop com erro some; campos ausentes não renderizam rótulo; `findUnnamedControls` sem achados nos estados novos
- [X] T018 [P] [US1] `tv-web/src/lib/catalog/seriesLoader.test.ts` — uma única requisição grava episódios **e** metadata
- [X] T043 [P] [US1] Sinopse por episódio: caso em `xtreamConnector.test.ts` (`info.plot`/`description`, vazio = ausente), em `seriesLoader.test.ts` (chega ao registro do episódio) e em `SeriesDetailScreen.test.tsx` (mostra a do episódio focado, some sem sinopse, não usa a da série, mover o foco não chama `fetch`)

**Critério de Conclusão**: comando do contrato da fase → 2/2 verdes e `check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes` íntegro; T016–T018 verdes; `tsc`/lint limpos; quickstart cenários 1–3 no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: `ensureTitleMetadata` (caminho do provedor: `get_vod_info`/`get_series_info`, validade 24 h, falha não avança a validade, single-flight por `stableId`, nunca lança, série `eager`/`stored` e filme sem id do painel não tocam rede) + `mergeTitleMetadata` (provedor vence, TMDB só preenche vazio); `titleMetadataStore.ts` compartilhado com o `seriesLoader`, que agora grava metadata da série **e** a sinopse de cada episódio na mesma requisição (`fetchSeriesDetail`); `synopsis` em `CatalogRecord`/`EpisodeOut`; `features/vod/DetailMetadata.tsx` (+ `detailMetadataFormat.ts`, regras puras) com backdrop `<img>` no hero, sinopse em 3 linhas, "Ver mais" (> 220) e modal "Sinopse completa", selo de origem; `MovieDetailScreen` e `SeriesDetailScreen` com a linha de foco `more`, fatos Gênero/Duração/Direção/País/Elenco e, na série, a sinopse do episódio focado (FR-028, dado local, sem rede); CSS em `vod.css` só com tokens. Ramo TMDB de `ensureTitleMetadata` fica para a T031 (Fase 5). T015: `useTitleMetadata` só é consumido por `MovieDetailScreen`/`SeriesDetailScreen` (grep em `src/`, fora de testes).
- Contrato: `npx vitest run …metadata-tmdb.contract…` — verdes os 2 desta fase (`filme de painel sem chave TMDB…` e `com metadata pendente "Assistir" já toca…`); os outros 3 seguem vermelhos por desenho (Fases 4 e 5); trava íntegra.
- Testes executados: `npx tsc -b` limpo; novos `titleMetadata.test.ts`, `seriesLoader.metadata.test.ts`, `SeriesDetailScreen.metadata.test.tsx`, `MovieDetailScreen.metadata.test.tsx` e casos em `xtreamConnector.test.ts` (sinopse do episódio, `fetchSeriesDetail`, `fetchVodInfo` com fetch injetado sem sondagem) — todos verdes; suíte `src/features src/lib src/components`: 1499 verdes, 7 falhas = 3 contratos das Fases 4–5 (esperado) + 4 flakes conhecidos (`LiveScreen.favorites`, `LiveScreen`, `MoviesScreen.favorites`, `SeriesScreen.favorites`), **confirmados isolados com `--no-file-parallelism`: 4 arquivos, 106/106**; lint sem aviso novo nos arquivos da feature (os 3 avisos `only-export-components` de uma 1ª versão foram eliminados movendo as funções puras para `detailMetadataFormat.ts`). Iterações: 1 ajuste de arredondamento de duração (01:50:31 virava "1 h 51 min" → minutos truncados) e 2 ajustes de teste (`Elenco` é também nome de aba; rerender precisa de elemento novo).
- Pendências: nenhuma bloqueante. Backdrop sobre o plano de hardware do AVPlay só se prova na TV (quickstart cenário 6, recomendado).

---

## Phase 4: User Story 2 - Configurar a chave TMDB em Integrações & BYOK (Priority: P2)

**Objetivo**: aba real Integrações & BYOK com card TMDB (Configurar/Testar/Editar/Remover), tela da chave, e dock da Home com estado real.

**Independent Test**: quickstart cenário 4.

### Contrato da Fase

- `chave recusada não é salva; chave aceita vira "connected" mascarada, sem aparecer inteira em estado nem em log; remover volta a "not_configured"` — US2/AC2-3, FR-011/012/013/014, SC-005
- Comando: `cd tv-web; npx vitest run src/lib/metadata/tmdbKeyRepository.metadata-tmdb.contract.test.ts`

### Implementation

- [X] T019 [US2] `tv-web/src/lib/metadata/tmdbKeyRepository.ts`: `saveTmdbKey`, `getTmdbStatus`, `removeTmdbKey` (apaga a linha **e** `tmdb`/`tmdbFetchedAt` de todo `titleMetadata`, numa transação), `testTmdbKey`, e a leitura restrita `readTmdbKeyForConnector` (não exportada fora de `lib/metadata`) — `logic/chave-tmdb.md` → contrato: `chave recusada não é salva…`
- [X] T020 [US2] Hooks em `tv-web/src/features/catalog/catalogApi.ts` (ou `features/settings/integrationsApi.ts`): `useTmdbStatus` (`['tmdb-status']`, só IndexedDB), `useSaveTmdbKey`, `useTestTmdbKey`, `useRemoveTmdbKey` — invalidam `['tmdb-status']` e `['title-metadata']`
- [X] T021 [US2] `tv-web/src/features/settings/IntegrationsPanel.tsx` (`logic/integracoes-e-dock.md` §1): card TMDB com estado/mascarada/última verificação/capacidades/atribuição, ações por estado, 3 cards soft-disabled; modal de remoção com "Cancelar" padrão
- [X] T022 [US2] `SettingsScreen.tsx` em `tv-web/src/features/settings/`: aba `integrations` usa `IntegrationsPanel` (foco por estado: linhas/colunas, ← volta às abas, ↑ na linha 0 vai à topbar); `ComingSoonPanel` perde `integrations`; novo prop `onOpenTmdbKey(from)`
- [X] T023 [US2] `tv-web/src/features/settings/TmdbKeyScreen.tsx` (`logic/integracoes-e-dock.md` §2): `useTvKeyNav` + `TextField` (senha + Mostrar), campo vazio ao abrir, "Salvar e testar"/"Cancelar", erro inline por motivo, sem submissão duplicada
- [X] T024 [US2] Navegação: `{ name: 'tmdb-key' }` e ação em `tv-web/src/navigation/appNav.ts`; rota e retorno com `restore: {zone:'panel', tab:'integrations'}` em `tv-web/src/App.tsx`
- [X] T025 [US2] Dock em `tv-web/src/features/home/HomeContent.tsx`: ícone TMDB real (sem `is-soft-disabled`/`aria-disabled`, `aria-label` "TMDB — {estado}", marcador de estado não só por cor), OK → novo prop `onOpenIntegrations(from)`; ligar em `HomeScreen.tsx`/`App.tsx` → Configurações `{panel, integrations}`
- [X] T026 [US2] `tv-web/src/lib/comingSoon.ts`: remover `settings-integrations` e `dock-tmdb`; atualizar `tv-web/src/lib/comingSoon.test.ts`

### Testes da Fase

- [X] T027 [P] [US2] `tv-web/src/lib/metadata/tmdbKeyRepository.test.ts` — formato inválido sem requisição; v4 via header; 429/rede não gravam; `testTmdbKey` muda estado sem apagar chave; `removeTmdbKey` limpa só a parte TMDB do cache
- [X] T028 [P] [US2] `IntegrationsPanel.test.tsx`/`SettingsScreen.test.tsx`/`TmdbKeyScreen.test.tsx`/`HomeContent.test.tsx`: foco e ações por estado; chave nunca no DOM; RETURN/restauração de foco; `findUnnamedControls` limpo; dock abre Integrações
- [X] T029 [P] [US2] Ajustar `tv-web/src/navigation/appNav.test.ts` para a rota nova

**Critério de Conclusão**: comando do contrato da fase → 1/1 verde e trava íntegra; T027–T029 verdes; quickstart cenário 4 no navegador; nenhum contrato travado de outra feature quebrado (`check-contract-tests.ps1` das features 022/026/028 íntegros e verdes).

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: `tmdbKeyRepository.ts` (`saveTmdbKey` testa antes de gravar e nunca grava chave recusada; `getTmdbStatus` → exatamente `{state:'not_configured'}` sem chave e só a máscara `••••`+4 com chave; `testTmdbKey`; `removeTmdbKey` numa transação apaga a chave e só a parte TMDB do cache; `readTmdbCredential`/`markTmdbState` para o enriquecimento da Fase 5; pausa de 10 min no 429); hooks `useTmdbStatus`/`useSaveTmdbKey`/`useTestTmdbKey`/`useRemoveTmdbKey` em `catalogApi.ts`; aba real `IntegrationsPanel` (card TMDB com estado, chave mascarada, capacidades, atribuição, Configurar/Testar/Editar/Remover, + 3 cards "Em breve" reusando `dock-ai`/`dock-weather`/`dock-speedtest`), `integrationsModel.ts`, `RemoveTmdbKeyModal`; `TmdbKeyScreen` (campo sempre vazio, "Mostrar" só alterna a máscara do que foi digitado, mensagem por motivo sem ecoar a chave, foco volta ao campo, trava síncrona contra OK duplicado); rota `tmdb-key` no `appNav.ts`/`App.tsx`; ícone TMDB do dock com estado real (`aria-label`/`title`/`data-state`, OK → Configurações no card do TMDB) via `onOpenIntegrations`; `settings-integrations` e `dock-tmdb` removidos de `comingSoon.ts`; CSS só com tokens em `settings.css`/`home.css`.
- Contrato: `npx vitest run src/lib/metadata/tmdbKeyRepository.metadata-tmdb.contract.test.ts` → 1/1 verde; trava íntegra. Contratos verdes agora: 3/5 (faltam os 2 da Fase 5).
- Testes executados: `npx tsc -b` limpo; novos `tmdbKeyRepository.test.ts`, `TmdbKeyScreen.test.tsx`, `SettingsScreen.integrations.test.tsx`, casos novos em `HomeContent.test.tsx` e `appNav.test.ts` — verdes; 3 testes antigos atualizados porque dependiam dos mocks removidos (`comingSoon.test.ts`: lista de ids e `getComingSoon` lançando para `dock-tmdb`/`settings-integrations`; `SettingsScreen.test.tsx`: aba mock passou de "Integrações & BYOK" para "Player & reprodução"; `HomeContent.test.tsx`: o ícone TMDB deixou de anunciar "Em breve"); `npm run lint` sem aviso novo nos arquivos da feature; **as 16 travas de contrato do repositório seguem íntegras e todos os testes de contrato existentes passam** (única falha: os 2 contratos da 032 da Fase 5, esperado). Iterações: 1 bug real achado pelo teste — `save.isPending` só vira `true` no render seguinte, então dois OK em sequência rápida disparavam duas requisições; corrigido com uma trava síncrona (`useRef`).
- Pendências: nenhuma bloqueante. IME real da TV para digitar a chave (quickstart cenário 7) e CORS do TMDB no WebView da TV (R-002) só se provam na TV física (recomendado).

---

## Phase 5: User Story 3 - TMDB completa o que o provedor não deu (Priority: P3)

**Objetivo**: com chave, o detalhe preenche lacunas pelo TMDB, só com candidato único, marcando "Dados: TMDB".

**Independent Test**: quickstart cenário 5.

### Contrato da Fase

- `com chave: TMDB preenche só o que o provedor deixou vazio, pelo tmdb_id do provedor, e a chave só vai ao TMDB` — US3/AC1, FR-007/018/019, FR-013
- `M3U sem tmdb_id: busca por título + ano; dois candidatos plausíveis não enriquecem, e reabrir não busca de novo` — US3/AC2, FR-020/023, Constitution "Nunca Inventam Dados"
- Comando: `cd tv-web; npx vitest run src/lib/metadata/titleMetadata.metadata-tmdb.contract.test.ts`

### Implementation

- [X] T030 [US3] `tv-web/src/lib/metadata/tmdbMatch.ts`: `normalizeTitle`, `comparableTitle`, `yearHintFromTitle`, `pickCandidate(results, query, year)` (`logic/metadados-e-casamento.md` §2) → contrato: `M3U sem tmdb_id…`
- [X] T031 [US3] Ramo TMDB de `ensureTitleMetadata` em `tv-web/src/lib/metadata/titleMetadata.ts`: `precisaTmdb`, `tmdbUsável` (`refused`/`pausedUntil`), `tmdb_id` do provedor com checagem de ano e 404, busca, detalhe com `credits`, fallback de idioma (§3), cache 182 dias incl. `no_match`/`dead_id`, erro → estado em `integrations` sem cache e sem laço → contratos: `com chave…`, `M3U sem tmdb_id…`
- [X] T032 [US3] Selo "Dados: TMDB" e "(em {idioma})" nos blocos com origem `tmdb` em `MovieDetailScreen.tsx`/`SeriesDetailScreen.tsx` (ou no componente extraído em T013); a tela invalida `['tmdb-status']` quando a metadata chega (estado pode ter mudado)

### Testes da Fase

- [X] T033 [P] [US3] `tv-web/src/lib/metadata/tmdbMatch.test.ts` — normalização ("Duna (2021) [LEG]", "Filme 4K - 2019", acentos), ano ±1, título original, candidato sem data
- [X] T034 [P] [US3] Casos extras em `titleMetadata.test.ts`: `tmdb_id` com ano contraditório → busca; 404 → `dead_id`; 401 → `refused` e sem novas chamadas; 429 → `pausedUntil`; rede → sem cache e nova tentativa só no próximo detalhe; provedor completo → zero chamadas TMDB; sinopse vazia em pt-BR → idioma original; série busca em `/3/search/tv` sem `tmdb_id`
- [X] T035 [P] [US3] Detalhe: selo "Dados: TMDB" só nos campos de origem TMDB

**Critério de Conclusão**: comando do contrato da fase → 3/3 verdes (junto com o da Fase 3) e trava íntegra; T033–T035 verdes; quickstart cenário 5 no navegador com chave real.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: `tmdbMatch.ts` (`normalizeTitle`, `comparableTitle`, `yearHintFromTitle`, `yearOfDate`, `pickCandidate` — só o candidato único, ano ±1, título/original comparáveis), `tmdbMapping.ts` (detalhe TMDB → `TitleFields`; país por `Intl.DisplayNames` pt-BR, direção só no filme, elenco até 10, imagem `w1280` sem chave), `tmdbLookup.ts` (id do provedor primeiro com descarte por ano contraditório/404; sem ano não busca; busca `/search/movie|tv`; fallback de idioma da sinopse; erro de serviço sobe sem nada gravado, `not_found` vira `dead_id`/`no_match`), `storeTmdbResult`, e o ramo TMDB de `ensureTitleMetadata` (`enrichFromTmdb`: só com lacunas no provedor, só com chave usável — `refused`/pausa de 429 bloqueiam —, validade de 182 dias inclusive `no_match`/`dead_id`, erro atualiza o estado em Integrações/dock sem cachear e sem laço, sucesso desfaz "offline"/"limite"); `useTitleMetadata` invalida `['tmdb-status']` ao terminar (FR-024); selo "Dados: TMDB" e "em {idioma}" já vinham do `OriginTag` da Fase 3.
- Contrato: `npx vitest run src/lib/metadata src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx` → **5/5 verdes** (os 2 desta fase: `com chave: TMDB preenche só o que o provedor deixou vazio…` e `M3U sem tmdb_id: busca por título + ano…`); trava íntegra.
- Testes executados: `npx tsc -b` limpo; novos `tmdbMatch.test.ts` (16), `titleMetadata.tmdb.test.ts` (11: provedor completo = zero chamadas; id contraditório → busca; 404 sem ano → `dead_id` cacheado; 401 → `refused` sem nova tentativa; 429 → pausa e retomada; sem rede → `offline`, uma tentativa por abertura; fallback de idioma; original pt sem sinopse não repete; série por `/search/tv` + `first_air_date_year`; validade de 6 meses; remover a chave limpa só a parte TMDB) e `useTitleMetadata.test.tsx` (3) — todos verdes na primeira execução; `lint` sem aviso nos arquivos da feature. T035: o selo já é exercitado em `MovieDetailScreen.metadata.test.tsx`/`SeriesDetailScreen.metadata.test.tsx` (origem `tmdb` mostra "Dados: TMDB", `provider` não).
- Pendências: nenhuma bloqueante. SC-003 (zero atribuição errada numa amostra real) e o CORS do TMDB no WebView da TV seguem para o roteiro real (T037) e a passada física (R-002).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentação canônica e gates finais.

- [X] T036 `tv-web/e2e/metadata-tmdb.mjs` (fake painel como `e2e/epg-dados-agora.mjs` + `page.route('https://api.themoviedb.org/**')` e `image.tmdb.org`): US1 (hero, Ver mais, modal, RETURN), US2 (Integrações: recusada/aceita/Testar/Remover, dock), US3 (selo, candidato ambíguo), e **zero requisição de metadata ao navegar a grade** (D-002); incluir em `test:e2e` de `tv-web/package.json`
- [X] T037 `tv-web/e2e/metadata-tmdb-real.mjs` (fora do `test:e2e`; lê `.env`, imprime só contagens): amostra de filmes/séries da lista real com sinopse/backdrop do provedor (SC-001)
- [X] T038 Atualizar `CLAUDE.md` (status da 032; frase "TMDB/OpenAI keys never reach the client at all" → exceção BYOK da constitution 1.6.0), `.planning/migracao-design-system-v14.md` (mocks removidos) e o item 28 de `.planning/backlog.md`
- [X] T039 Revisão de segredos (constitution, Fluxo): grep por `console.` em `lib/metadata`, chave fora de estado/queryKey/toast/aria, Network do E2E sem chave em host ≠ `api.themoviedb.org`
- [X] T040 Rodar `quickstart.md` (cenários 1–5 no navegador; 6–7 recomendados na TV via `tizen-tv`, não gate)

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes` íntegro; travas de 022/025/026/028 íntegras
- [X] `npx tsc -b`, `npm run lint`, `npx vitest run` (flakes conhecidos confirmados isolados), `npm run build:tizen` limpos
- [X] `npm run test:e2e` verde com `npm run dev` rodando (inclui `e2e/metadata-tmdb.mjs`)
- [X] `quickstart.md` executado com sucesso (cenários de navegador)
- [X] Documentação canônica atualizada (T038)

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: `e2e/metadata-tmdb.mjs` (painel Xtream fictício + TMDB por `page.route`; ~60 asserções em Chromium real: grade sem nenhuma requisição de metadata, backdrop CARREGADO como `<img>` do hero e `.screen` sem `background-image`, sinopse/"Ver mais"/modal/RETURN, fatos e duração "1 h 50 min", cache sem nova requisição, Integrações — formato inválido/recusada/aceita/mascarada —, dock, TMDB preenchendo só a lacuna com o selo, série numa requisição só + sinopse do episódio focado, remoção da chave, higiene de console/painel) incluído em `test:e2e`; `e2e/metadata-tmdb-real.mjs` (lê o `.env`, imprime só contagens); `CLAUDE.md` (parágrafo da 032, exceção BYOK, constitution 1.6.0), `migracao-design-system-v14.md` (4 linhas da matriz real × mock) e o backlog (tabela, "Entregues", item 28, item 58); revisão de segredos.
- Contrato: 5/5 verdes na suíte; `check-contract-tests.ps1` íntegro para a 032 e para as 16 travas do repositório.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem aviso novo em arquivo da feature; `npx vitest run` → 182 arquivos verdes, 3 falhas = os flakes conhecidos de paralelismo (`LiveScreen.favorites`, `LiveScreen`, `MoviesScreen.favorites`), **103/103 isolados** com `--no-file-parallelism`; `npm run build:tizen` limpo; `npm run test:e2e` (15 roteiros, incluindo o novo) verde, e `metadata-tmdb.mjs` 3/3 execuções seguidas verdes. Medição real (`metadata-tmdb-real.mjs`): sinopse **e** backdrop em 90 % das 9 663 séries (a lista já vem inteira, sem amostragem) e 87–93 % dos filmes amostrados → **SC-001 cumprido**; sinopse por episódio em ~4–30 % dos episódios lidos (R-009). Achados reais pelo E2E, todos resolvidos: `get_series_info` duplicado ao abrir série (R-010), sinopse do TMDB reaparecendo depois de remover a chave (R-011), e — do meu próprio Windows/PowerShell — um BOM que eu mesmo introduzi no `package.json` e quebrava o `build:tizen` (removido; nenhum arquivo do repositório ficou com BOM novo).
- SC-003 (medido depois, com a chave TMDB real que o usuário pôs no `.env` como `TMDB_API_KEY`, 2026-09-29, por `e2e/metadata-tmdb-real-match.mjs` — fora do `test:e2e`, roda o `lookupTmdb` REAL do app no dev server): 80 filmes da lista real, casados **por título + ano SEM o `tmdb_id`** (como numa fonte M3U) contra o `tmdb_id` do próprio provedor como gabarito → **74 casaram (93 %), 74 certos, 0 ERRADOS**, 6 sem correspondência (o casamento preferiu não enriquecer), 0 falhas de serviço; 30 séries sem gabarito → 25 casaram (83 %) e todos os pares "título da lista → nome no TMDB" conferidos à mão batem (inclusive "Sons Of Anarchy" → "Filhos da Anarquia"). **SC-003 cumprido.** Também lista filmes reais SEM sinopse no provedor, que é onde o TMDB aparece na tela (ex.: "Carnaval Barra Limpa", "Na Fronteira 2 [L]"). O conjunto é amostral (80 + 30); não é prova exaustiva.
- Passada na TV física (2026-09-29, QN50Q60DAGXZD, instalado por `deploy-tv.ps1`; quem viu: o usuário): quickstart cenários 6–7 e o CORS do TMDB **aprovados** — backdrop não cobre o vídeo, sinopse/"Ver mais"/modal, TMDB com o selo "Dados: TMDB", chave pelo IME da TV, dock "conectado". Observação: a aba "Elenco" segue "Em breve" (item 45).
- Pendências: (a) ~~SC-003~~ resolvido acima; (b) ~~passada física~~ feita (linha acima); (c) histórico — quickstart cenários 6–7 (backdrop sobre o plano do AVPlay, IME da TV para a chave) e o CORS do TMDB no WebView da TV só se provam na TV física (recomendado, não gate).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: bloqueia todas as stories.
- **US1 (Phase 3)**: depende de T001–T004.
- **US2 (Phase 4)**: depende de T001, T005; independe de US1.
- **US3 (Phase 5)**: depende de US1 (T010, T012/T013) e US2 (T019).
- **Polish**: depois das três.

### Parallel Opportunities

- T002–T005 em paralelo (arquivos diferentes).
- US2 pode andar em paralelo com US1 depois da Fase 2.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 2 → Fase 3 → **PARAR E VALIDAR** (detalhe com metadata do provedor, sem chave).

### Incremental Delivery

1. US1 (valor para quase todo título, sem chave) → US2 (tela + chave) → US3 (lacunas pelo TMDB).

## Notes

- Contratos travados: nunca editar; se um parecer errado, parar e perguntar.
- Nenhuma consulta externa por foco (D-002) — vale também para o hero do catálogo e a Home.
- Backdrop nunca como fundo do `.screen` (D-008).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Origem**: `sdd-converge` de 2026-09-29 (achados F-01…F-03 da tabela de convergência). Só anexa — nada acima foi tocado.

- [X] T046 [US3] **(F-01, MEDIUM — FR-022)** Selo "Dados: TMDB" também para o **backdrop** vindo do TMDB: hoje `OriginTag` só acompanha sinopse, fatos e elenco; `DetailBackdrop` (`tv-web/src/features/vod/DetailMetadata.tsx`) não sinaliza a origem. Mostrar o selo discreto no hero de `MovieDetailScreen.tsx`/`SeriesDetailScreen.tsx` quando `metadata.backdropUrl.origin === 'tmdb'` (e nunca quando vier do provedor); testes em `MovieDetailScreen.metadata.test.tsx`/`SeriesDetailScreen.metadata.test.tsx` (com e sem selo) e uma asserção em `tv-web/e2e/metadata-tmdb.mjs` (o passo do "Filme Lacuna" já serve um backdrop do TMDB). Origem: FR-022; US3/AC1
- [X] T047 **(F-02, MEDIUM — Constitution "Documentação do Repositório É Canônica")** Alinhar os documentos de desenho ao que foi construído: `logic/metadados-e-casamento.md` §1/§5 (série: `ensureTitleMetadata` **adia** enquanto os episódios ainda vão ser buscados e `useSeriesEpisodes` invalida `title-metadata` — R-010; o texto atual promete "uma chamada extra única"); `logic/detalhe-com-metadata.md` (aba **Elenco** real com `CastPanel` — R-012 —, sinopse do episódio focado `.vod-episode-synopsis` — FR-028/T041–T042 —, selo do backdrop da T046); `quickstart.md` (cenário da aba Elenco, da sinopse por episódio, e `e2e/metadata-tmdb-real.mjs` + `e2e/metadata-tmdb-real-match.mjs` para SC-001/SC-003). Origem: plan R-010, R-012; FR-028
- [X] T048 **(F-03, MEDIUM — Constitution "Documentação…É Canônica": funcionalidade planejada não pode aparecer como entregue)** `README.md`, seção "Descoberta e metadados", edição cirúrgica só das linhas do TMDB: hoje diz "sinopse, capas e trailers" (trailer **não** foi entregue — item 32) e lista "elenco e equipe técnica" como "A avaliar". Passar a dizer o que existe: o provedor primeiro (sinopse, backdrop, gênero, duração, direção, país e elenco em texto, ao abrir o detalhe), o TMDB opcional com chave própria só completando lacunas, a aba Integrações & BYOK, a sinopse do episódio; e mover para "A avaliar/planejado" trailers, páginas de ator navegáveis e Semelhantes. Não tocar no resto do README. Origem: Constitution; item 28 do backlog

### Testes da Fase

- [X] T049 [P] Rodar `npx tsc -b`, `npm run lint` (sem aviso novo), `npx vitest run` (flakes conhecidos confirmados isolados), `node e2e/metadata-tmdb.mjs` e `check-contract-tests.ps1` (5/5 e as 17 travas) depois da T046

**Critério de Conclusão**: T046–T049 marcados; contratos 5/5 verdes com a trava íntegra; nenhum achado novo ao rodar `sdd-converge` outra vez.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: **T046** — `DetailBackdrop` recebe `origin` e mostra o selo `Dados: TMDB` (`.vod-detail-backdrop-origin`, canto do hero, fora do contêiner `aria-hidden`, some junto com a imagem se ela falhar) só quando o backdrop veio do TMDB; ligado em `MovieDetailScreen.tsx` e `SeriesDetailScreen.tsx`; CSS em `vod.css`. **T047** — `logic/metadados-e-casamento.md` (módulos novos; série: `deferred` e invalidação por `useSeriesEpisodes`, R-010), `logic/detalhe-com-metadata.md` (selo do backdrop, aba Elenco real R-012, sinopse do episódio FR-028) e `quickstart.md` (cenários 5b/5c e os dois scripts de medição real) alinhados ao código. **T048** — `README.md`, só a seção "Descoberta e metadados": o detalhe com backdrop/sinopse/fatos/aba Elenco, o TMDB opcional só completando lacunas, e trailers/equipe técnica/atores/Semelhantes movidos para "A avaliar" (o README dizia que o TMDB trazia "trailers").
- Contrato: 5/5 verdes; trava da 032 íntegra e as 17 travas do repositório íntegras.
- Testes executados: `npx tsc -b` limpo; lint sem aviso nos arquivos da feature; testes novos do selo do backdrop (filme e série: com selo se TMDB, sem selo se provedor, some com a imagem que falha) verdes; `node e2e/metadata-tmdb.mjs` 2/2 execuções verdes, agora também provando que o backdrop do `image.tmdb.org` carrega e leva o selo; `npx vitest run` → 182 arquivos verdes e 3 falhas = os flakes conhecidos de paralelismo (`LiveScreen.favorites`, `MoviesScreen.favorites`, `SeriesScreen.favorites`), **27/27 isolados**.
- Pendências: nenhuma. Observação fora do escopo, só registrada: o `README.md` tem `\n` literais na linha do "Guia completo" (seção de EPG, de antes desta feature) — merece um ajuste à parte.