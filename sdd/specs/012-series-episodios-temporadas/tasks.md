---
description: "Tasks da feature 012 — Séries: episódios e temporadas"
---

# Tasks: Séries — Episódios e Temporadas

**Input**: Documentos de design de `sdd/specs/012-series-episodios-temporadas/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/series-episodes.md, logic/episodios-autoplay.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1–US4)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Todo o código desta feature está em `tv-web/src/` (frontend único; `api/` congelado pela ADR-008, não tocado).
- Armazenamento/conectores/carregadores: `tv-web/src/lib/catalog/`
- Player: `tv-web/src/lib/player/` e `tv-web/src/components/PlayerLayer.tsx`
- Fachada das telas: `tv-web/src/features/catalog/catalogApi.ts`
- Telas de série: `tv-web/src/features/series/`
- Estilos: `tv-web/src/features/screens.css` (tokens de `tv-web/src/index.css`)
- Testes ao lado do arquivo (`*.test.ts[x]`), `vitest` + `fake-indexeddb`
- Comandos a partir de `tv-web/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema e tipos que todas as stories usam.

- [X] T001 Subir o schema para v8 com o índice `[sourceId+generation+seriesId]` em `channels` e declarar `CatalogRecord.episodesFetchedAt?` e `UserStateRecord.completedAt?` em `tv-web/src/lib/catalog/db.ts` (`data-model.md` §1–§3; sem `.upgrade()`)
- [X] T002 [P] Teste de migração v7→v8 (dados existentes intactos; consulta pelo índice novo funciona; registro sem `seriesId` não quebra a consulta) em `tv-web/src/lib/catalog/db.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Leitura/gravação de episódios, identidade estável com temporada/episódio e ordenação — o que toda story consome.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T003 [P] Testes de `listEpisodes`/`storeSeriesEpisodes` (substituição integral; nunca apaga o registro `kind:'series'` com mesmo `seriesId`; carimba `episodesFetchedAt`; só geração ativa; `StorageFullError` em quota) em `tv-web/src/lib/catalog/catalogRepository.test.ts`
- [X] T004 [P] Testes de `stableIdOf` (episódio inclui `s`/`e`; mesmo resultado que `buildStableId` para filme e canal; sem identidade → `null`, nunca lança) em `tv-web/src/features/catalog/catalogApi.test.tsx` (arquivo já existia — testes acrescentados nele, não em arquivo novo)
- [X] T005 [P] Testes de `groupBySeason` (ordem numérica de temporadas; episódios por número, nulos depois, empate por id; grupo "Episódios" para temporada nula, por último) em `tv-web/src/features/series/episodeNavigation.test.ts`
- [X] T006 [P] Teste em `tv-web/src/components/PlayerLayer.test.tsx`: reproduzir um item `kind:'episode'` grava progresso sob o id de `stableIdOf` com temporada/episódio (R-001); cenários existentes de canal e filme inalterados

### Implementation

- [X] T007 Implementar `listEpisodes` e `storeSeriesEpisodes` em `tv-web/src/lib/catalog/catalogRepository.ts` (`contracts/series-episodes.md` §1, D-002)
- [X] T008 [P] Implementar `stableIdOf`; acrescentar `series_id` a `CatalogItemOut` (em `toItemOut`) e `series_id`/`season_number`/`episode_number` a `CatalogItemPlayback` (em `fetchPlayback`) em `tv-web/src/features/catalog/catalogApi.ts` (D-006, `data-model.md` §5)
- [X] T009 [P] Implementar `groupBySeason` (e o tipo `Season`, e o tipo `EpisodeOut` — ver Execution Notes) em `tv-web/src/features/series/episodeNavigation.ts` (`logic` §3)
- [X] T010 Trocar `computeIdentity` de `tv-web/src/components/PlayerLayer.tsx` por `stableIdOf(playback)` (depende de T008)

**Checkpoint**: Fundação pronta — `npx vitest run` e `npx tsc -b` limpos; Live TV e Filmes sem regressão.

**Registro da Fase**:

- Status: Concluída (Setup + Foundational).
- Feito: Schema v8 (`db.ts`) com índice `[sourceId+generation+seriesId]` e campos `episodesFetchedAt`/`completedAt`, sem `.upgrade()`. `listEpisodes`/`storeSeriesEpisodes` em `catalogRepository.ts`. `stableIdOf` novo em `catalogApi.ts` (ponto único de identidade estável, usado por `PlayerLayer` no lugar do antigo `computeIdentity` que não incluía temporada/episódio — R-001 corrigido e testado). `CatalogItemOut.series_id` e `CatalogItemPlayback.series_id/season_number/episode_number` adicionados. `groupBySeason`/`EpisodeOut`/`Season` novos em `episodeNavigation.ts` (o tipo `EpisodeOut` nasceu aqui, não em `catalogApi.ts` como o `data-model.md` sugeria — `catalogApi.ts` vai reimportar/reexportar na Fase 3, T016, mesmo padrão já usado para `CatalogCategory`).
- Testes executados: `npx vitest run` (suíte completa) — 409/409. `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Assistir episódio de série de provedor, com retomada (Priority: P1) 🎯 MVP

**Objetivo**: Abrir uma série Xtream, navegar temporadas/episódios e reproduzir um episódio retomando a posição salva.

**Independent Test**: Fonte Xtream com série de 2+ temporadas — abrir, trocar de temporada, OK num episódio toca; sair e voltar mostra "Continuar de mm:ss" e retoma (`quickstart.md` A–C).

### Testes da Fase

- [X] T011 [P] [US1] Atualizar teste de `fetchSeriesInfo` (sem `url`; `episode_num` em texto vira número; não numérico → ausente; sem `container_extension` → ausente; sem `id` → descartado; temporada não numérica → 1) em `tv-web/src/lib/catalog/xtreamConnector.test.ts`
- [X] T012 [P] [US1] Testes de `ensureSeriesEpisodes` — os quatro desfechos, `eager` nunca toca rede, frescor 24 h, single-flight, falha preserva disco, nenhum episódio gravado com URL, erro nunca vira mensagem — em `tv-web/src/lib/catalog/seriesLoader.test.ts`
- [X] T013 [P] [US1] Testes de `SeriesDetailScreen` em `tv-web/src/features/series/SeriesDetailScreen.test.tsx`: carregando/erro/vazio com botão focado **e ativado por OK**; foco inicial na primeira aba (FR-020); direita troca temporada sem nova obtenção (FR-008); BAIXO/CIMA entre abas e lista; OK no episódio monta `PlayerLayer` com `startAtMs` da retomada ou `undefined` (FR-009); aviso de `stale-served` (FR-004); RETURN chama `onBack` (FR-021); fechar a camada devolve o foco ao episódio; episódio sem identidade estável (`stableIdOf` → `null`) ainda abre o player, sem linha de retomada (FR-018)

### Implementation

- [X] T014 [P] [US1] Ajustar `fetchSeriesInfo` em `tv-web/src/lib/catalog/xtreamConnector.ts` conforme `logic` §1 (D-004, R-002, R-003)
- [X] T015 [US1] Criar `tv-web/src/lib/catalog/seriesLoader.ts` com `ensureSeriesEpisodes` (`contracts` §2; reusa `isCategoryFresh`/`readCredential`/`activeGeneration`; grava via `storeSeriesEpisodes`, `directUrl: undefined`). Acrescentou `getCategory` em `catalogRepository.ts` (não previsto no contrato, necessário pra saber se a categoria da série é `eager`)
- [X] T016 [US1] Implementar `useSeriesEpisodes`, `useUserStates`, `invalidateUserStates` e o tipo `EpisodeOut` em `tv-web/src/features/catalog/catalogApi.ts`; `getUserStates` em `tv-web/src/lib/catalog/userStateRepository.ts` (`contracts` §4/§7)
- [X] T017 [US1] Reescrever `tv-web/src/features/series/SeriesDetailScreen.tsx`: cabeçalho (backdrop placeholder, título, sinopse/elenco placeholder como no filme), abas de temporada, lista vertical virtualizada de episódios (miniatura placeholder + título + linha "Continuar de mm:ss" quando retomável), foco em duas linhas (`logic` §8), estados carregando/erro/vazio/stale com saída roteada em `onSelect`, `PlayerLayer` com invalidação de estados ao fechar
- [X] T018 [P] [US1] Estilos em `tv-web/src/features/screens.css` — **desvio do plano, ver Execution Notes**: `.series-detail-header`/`.series-detail-thumb`/`.series-detail-info`/`.series-detail-title`/`.series-detail-synopsis`/`.series-detail-cast`/`.season-tabs`/`.season-tab`/`.episode-list`/`.episode-row`/`.episode-thumb`/`.episode-title`/`.episode-meta` já existiam prontas em `screens.css`, extraídas 1:1 do protótipo e nunca consumidas — só adaptadas pra virtualização (`.episode-list-inner`, `position: absolute` nas linhas). Raiz da tela é `.screen` (não um `.series-detail-layout` novo), já coberta pela regra `:root.video-plane-visible .screen > *:not(.player-overlay)` — nenhuma edição na regra de plano de hardware foi necessária (R-006 resolvido por reuso, não por adição)

**Critério de Conclusão**: numa fonte Xtream, abrir uma série obtém os episódios uma vez (sem nova rede ao trocar de temporada ou reabrir dentro de 24 h), qualquer episódio toca pelo `PlayerLayer`, a retomada grava e é lida pelo mesmo id com temporada/episódio, e todos os estados do detalhe têm saída ativável por OK. Suíte, `tsc` e lint limpos; `quickstart.md` A–C verificados no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `fetchSeriesInfo` sem URL/presunção de extensão, números em texto tratados (`logic` §1). `seriesLoader.ts` (`ensureSeriesEpisodes`, gêmeo de `categoryLoader`) + `getCategory` novo em `catalogRepository.ts`. `useSeriesEpisodes`/`useUserStates`/`invalidateUserStates`/`EpisodeOut` em `catalogApi.ts` (`EpisodeOut` acabou definido em `catalogApi.ts`, não em `episodeNavigation.ts` como a Fase 2 tinha feito provisoriamente — `episodeNavigation.ts` agora reexporta de lá, direção de dependência catalog→series corrigida). `SeriesDetailScreen.tsx` reescrito por completo: cabeçalho, abas de temporada, lista virtualizada de episódios, retomada, todos os estados com saída focável e ativável por OK. CSS: as classes `.series-detail-*`/`.season-tab`/`.episode-row` já existiam prontas em `screens.css` desde antes desta feature (extraídas do protótipo, nunca consumidas) — só precisaram de ajuste pra virtualização.
- Testes executados: `npx vitest run` (suíte completa) — 437/437. `npx tsc -b` limpo. `npm run lint` — só avisos pré-existentes (`react(incompatible-library)` em todo hook que usa `useVirtualizer`, mesmo padrão de `LiveScreen`/`SeriesScreen`/`MoviesScreen`).
- Pendências: nenhuma para US1. `quickstart.md` A–C ainda não executados manualmente no navegador (ficam para a Fase 7/Polish, T043).

---

## Phase 4: User Story 2 - Séries também a partir de fonte M3U (Priority: P2)

**Objetivo**: Entradas M3U `Nome SxxEyy` aparecem como um cartão por série, abrindo em temporadas/episódios reproduzíveis.

**Independent Test**: Re-sincronizar uma fonte M3U com vários `Nome S01E0N` — Séries mostra um cartão "Nome"; abrir mostra os episódios em ordem e tocam (`quickstart.md` D).

### Testes da Fase

- [X] T019 [P] [US2] Testes do agrupador (mesma chave → mesma série, emitida uma vez; grupo diferente → série diferente; `seriesName` da primeira entrada; sem `seriesKey` usa nome normalizado) em `tv-web/src/lib/catalog/m3uSeriesGrouping.test.ts`
- [X] T020 [P] [US2] Testes de importação em `tv-web/src/lib/catalog/importPipeline.test.ts`: M3U com 10 `Breaking Bad S01E01..10` → 1 registro `series` na categoria do grupo e 10 `episode` com o mesmo `seriesId`, `itemsCount` da categoria = 1; duas fontes não se misturam; modo limitado com `/series/` na URL → `kind:'episode'` (D-012) e agrupado; `listEpisodes` devolve os 10
- [X] T021 [P] [US2] Já coberto pelo teste "série de categoria eager sai sempre fresh" escrito na Fase 3 (`seriesLoader.test.ts`) — `ensureSeriesEpisodes` não distingue a origem da categoria `eager` (M3U/Modo limitado), só o `fetchMode`; um segundo teste M3U-específico seria redundante

### Implementation

- [X] T022 [P] [US2] Criar `tv-web/src/lib/catalog/m3uSeriesGrouping.ts` (`createSeriesGrouper`, `logic` §2, D-003)
- [X] T023 [US2] Integrar o agrupador em `consumeM3u` e trocar `/series/` → `'episode'` em `refineFromUrl`, em `tv-web/src/lib/catalog/importPipeline.ts` (`logic` §2). Extraído `enqueue()` de dentro de `accept()` — a série sintética grava no lote sem contar como `entriesRead` (ela não é uma linha da fonte); `channelsStored` continua exato. Três testes pré-existentes que assumiam "episódio nunca cria categoria" e "stored ≤ read" foram atualizados para o comportamento correto pós-feature (não eram bugs, eram invariantes que só valiam antes do agrupamento existir)

**Critério de Conclusão**: numa fonte M3U re-sincronizada, a tela Séries mostra um cartão por série (não por arquivo), o detalhe abre as temporadas/episódios sem tocar rede, os episódios reproduzem e retomam como na US1. Suíte, `tsc` e lint limpos; `quickstart.md` D verificado.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `m3uSeriesGrouping.ts` (`createSeriesGrouper`, chave grupo+título-base normalizado). Integrado em `consumeM3u`: episódio nunca ganha categoria própria, a série sintética sim (mesma categoria "eager" do grupo). `refineFromUrl` corrigido (D-012, R-004): segmento `/series/` da URL agora vira `kind:'episode'`, não `'series'` — bug pré-existente ao Modo limitado, fechado nesta feature. `enqueue()` extraído de `accept()` pra série sintética não inflar `entriesRead`.
- Testes executados: `npx vitest run` (suíte completa) — 445/445. `npx tsc -b` limpo. `npm run lint` — só os mesmos avisos pré-existentes de `useVirtualizer`.
- Pendências: `quickstart.md` D ainda não executado manualmente no navegador (Fase 7).

---

## Phase 5: User Story 3 - Marca de episódio assistido (Priority: P3)

**Objetivo**: Episódio concluído aparece marcado como assistido, distinto de "em andamento" e "nunca aberto".

**Independent Test**: Concluir um episódio (fim ou >95%), voltar — selo "✓ Assistido" só nele (`quickstart.md` E).

### Testes da Fase

- [X] T024 [P] [US3] Testes de `markCompleted` (grava `completedAt`, apaga `progressSeconds`; progresso gravado depois não apaga `completedAt`) em `tv-web/src/lib/catalog/userStateRepository.test.ts`. Acrescentou também testes de `getUserStates` (ordem preservada, lista vazia) que tinham ficado sem teste dedicado na Fase 3
- [X] T025 [P] [US3] Testes de `progressRecorder` com `recordCompletion: true` (conclusão real e `isPastEnd` chamam `markCompleted`); sem a opção, comportamento da 011 idêntico, em `tv-web/src/lib/player/progressRecorder.test.ts`
- [X] T026 [P] [US3] Testes de `episodeBadge` (quatro combinações de `logic` §5) em `tv-web/src/features/series/episodeNavigation.test.ts`
- [X] T027 [P] [US3] Teste em `tv-web/src/features/series/SeriesDetailScreen.test.tsx`: selo aparece só no concluído; em andamento mostra retomada sem selo; nunca aberto sem nada; reassistir um concluído mostra os dois juntos

### Implementation

- [X] T028 [P] [US3] `markCompleted` em `tv-web/src/lib/catalog/userStateRepository.ts`
- [X] T029 [US3] Opção `recordCompletion` em `tv-web/src/lib/player/progressRecorder.ts`; `PlayerLayer` passa `recordCompletion = playback.kind === 'episode'` em `tv-web/src/components/PlayerLayer.tsx` (D-007)
- [X] T030 [P] [US3] `episodeBadge` em `tv-web/src/features/series/episodeNavigation.ts` e selo "✓ Assistido" (texto + cor de acento, tokens) na linha de episódio em `tv-web/src/features/series/SeriesDetailScreen.tsx` / `tv-web/src/features/screens.css`

**Critério de Conclusão**: concluir um episódio o marca como assistido na próxima exibição da lista; filme continua gravando exatamente como na 011 (nenhum `completedAt` em filme). Suíte, `tsc` e lint limpos; `quickstart.md` E verificado.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `markCompleted` (grava `completedAt`, apaga `progressSeconds`, persistente). `recordCompletion` em `progressRecorder.ts` — os dois pontos que apagavam retomada (conclusão real, limiar final) gravam conclusão em vez disso, só quando ligado. `PlayerLayer` liga isso só para `kind:'episode'`. `episodeBadge` (`watched`/`resumeSeconds`, os dois convivem) e selo "✓ Assistido" na linha do episódio.
- Testes executados: `npx vitest run` (suíte completa) — 459/459. `npx tsc -b` limpo. `npm run lint` — só os mesmos avisos pré-existentes.
- Pendências: `quickstart.md` E ainda não executado manualmente (Fase 7).

---

## Phase 6: User Story 4 - Autoplay do próximo episódio (Priority: P4)

**Objetivo**: Ao concluir um episódio, contagem cancelável de 10 s e reprodução automática do próximo (inclusive atravessando temporada).

**Independent Test**: Concluir episódio com próximo → contagem com "Cancelar" focado; cancelar volta à lista; expirar toca o próximo (`quickstart.md` F).

### Testes da Fase

- [X] T031 [P] [US4] Testes de `nextEpisode` (mesma temporada; último da temporada → E1 da seguinte; último da última → `null`; id desconhecido → `null`) em `tv-web/src/features/series/episodeNavigation.test.ts`
- [X] T032 [P] [US4] Testes de `PlayerLayer`: com `onCompleted`, conclusão chama `onCompleted` e não `onClose`; RETURN/erro continuam chamando `onClose`; sem `onCompleted`, comportamento da 011 intacto, em `tv-web/src/components/PlayerLayer.test.tsx`
- [X] T033 [P] [US4] Testes de `NextEpisodeCountdown` com fake timers (conta de 10 a 0; expirar chama `onExpire` uma vez; OK e RETURN chamam `onCancel`; desmontar limpa o temporizador; "Cancelar" focado) em `tv-web/src/features/series/NextEpisodeCountdown.test.tsx`
- [X] T034 [P] [US4] Testes de integração em `tv-web/src/features/series/SeriesDetailScreen.test.tsx`: conclusão desmonta o player antes de mostrar a contagem (FR-013); expirar monta o player no próximo e muda a aba quando atravessa temporada; cancelar volta com foco no episódio concluído; último da última temporada volta sem contagem (FR-016)

### Implementation

- [X] T035 [P] [US4] Prop `onCompleted` em `tv-web/src/components/PlayerLayer.tsx` (D-008, `contracts` §6)
- [X] T036 [P] [US4] `nextEpisode` em `tv-web/src/features/series/episodeNavigation.ts` (`logic` §4)
- [X] T037 [P] [US4] Criar `tv-web/src/features/series/NextEpisodeCountdown.tsx` (camada modal, D-009, `logic` §7) — reusa `.player-overlay`/`.player-message`/`.player-action` já existentes, sem CSS novo. Timer via `setInterval` único criado na montagem (não `setTimeout` reagendado por efeito) — mais robusto sob relógio falso de teste
- [X] T038 [US4] Estado `countdown` e transições em `tv-web/src/features/series/SeriesDetailScreen.tsx` (`logic` §7) — unificado num só `Mode` (`browsing`/`playing`/`countdown`) em vez de dois `useState` separados

**Critério de Conclusão**: todos os caminhos de `logic` §7 funcionam; nunca há duas sessões de reprodução montadas; a contagem é cancelável por OK e por RETURN em qualquer instante; Live TV e Filmes intactos. Suíte, `tsc` e lint limpos; `quickstart.md` F verificado.

**Checkpoint**: User Story 4 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `nextEpisode` (atravessa temporada, `null` no fim). `PlayerLayer` ganhou `onCompleted` (D-008) — substitui `onClose` só na conclusão, RETURN/erro continuam por `onClose`. `NextEpisodeCountdown.tsx` novo, reusando CSS de diálogo já existente (`.player-overlay`/`.player-message`/`.player-action`), sem estilo novo. `SeriesDetailScreen.tsx` ganhou uma máquina `Mode` (`browsing`/`playing`/`countdown`) substituindo os dois `useState` separados da Fase 3 — nunca duas camadas de reprodução juntas (FR-013), muda de aba/foco ao atravessar temporada, cancela por SELECT ou RETURN em qualquer instante.
- Testes executados: `npx vitest run` (suíte completa) — 478/478. `npx tsc -b` limpo. `npm run lint` — só os mesmos avisos pré-existentes de `useVirtualizer`.
- Pendências: `quickstart.md` F ainda não executado manualmente (Fase 7); Cenários G–I (conclusão real de episódio e troca de sessão no AVPlay) só a TV física prova — R-005, não é gate obrigatório.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentação canônica, verificação manual e hardware.

- [X] T039 [P] Atualizar `CLAUDE.md`: gap de séries fechado (seção "Project status"), nota da regra de plano de hardware atualizada (`SeriesDetailScreen` ficou `.screen`-rooted, coberta sem editar a regra — não precisou de `.series-detail-layout`), e `SeriesDetailScreen` como terceiro consumidor do `PlayerLayer`
- [X] T040 [P] Atualizar `.planning/backlog.md` item 9 (e o parágrafo "O buraco mais visível hoje") para refletir o entregue; registrar R-004 como corrigido
- [X] T041 Revisão de segredos: nenhum `console`/mensagem/estado com URL ou credencial nos arquivos novos; `seriesId` sintético sem dado sensível (`credential.dns/username/password` só passam para `fetchSeriesInfo`, nunca logados — mesmo padrão de `categoryLoader.ts`)
- [X] T042 Conferir que os estilos novos só usam tokens de `tv-web/src/index.css` (sem cor, raio ou fonte literal) — só `var(--accent)`/`var(--text-*)`/`var(--font-body)`, tamanhos na mesma escala literal já usada em todo o resto de `screens.css` (convenção pré-existente do arquivo: cor é tokenizada, tamanho/raio são literais por componente)
- [X] T043 Verificação manual no navegador (`npm run dev` + Playwright) — **parcial, ver nota abaixo**
- [ ] T044 Rodar `quickstart.md` G–I na TV física (skill `tizen-tv`) — recomendado, não gate (R-005); não executado nesta sessão, sem TV disponível
- [X] T045 Suíte completa: `npx vitest run` (478/478), `npx tsc -b` (limpo), `npm run lint` (só avisos pré-existentes) — `npm run build:tizen` não executado (sem necessidade de empacotar pra esta verificação; nenhuma mudança em `vite.config.ts`/estrutura de chunks que justifique)

**Nota sobre T043 (verificação manual — o que foi e não foi coberto)**: com `npm run dev` real e Playwright, dados de série foram inseridos direto no IndexedDB local (sem tocar rede/credencial, limpos ao final) pra contornar a ausência de uma fonte Xtream/M3U real nesta sessão. Confirmado num navegador de verdade: schema v8 abre sem erro em cima de dados existentes do usuário ("Fixture compartilhada", intocada); um cartão por série (FR-006); cabeçalho + abas de temporada + lista de episódios no layout do protótipo; foco (aba↔lista) e a receita de foco da ADR-007; OK num episódio tenta reproduzir e uma falha de stream cai no estado de erro existente (`PlayerLayer`), com "Tentar de novo"/"Voltar" focáveis; fechar a camada devolve o foco ao episódio de origem (FR-021). **Não coberto nesta sessão** (sem fonte real disponível): obtenção sob demanda de fato contra um painel Xtream (US1), a tela de "carregando episódios"/`stale-served` com rede real, o selo de assistido e a contagem de autoplay renderizados de verdade (cobertos pela suíte automatizada, não por olho humano) — `quickstart.md` B/C/E/F ficam para quando houver uma fonte real à mão.

**Achado fora de escopo, não corrigido** (encontrado durante a verificação manual, não introduzido por esta feature): tanto `avplayAdapter.ts` quanto `htmlVideoAdapter.ts` usam a mensagem genérica fixa "Não foi possível reproduzir este canal." pra qualquer falha de stream sem código reconhecido — inclusive pra filme (feature 011) e agora episódio, não só canal ao vivo. Severidade baixa (cosmético; não vaza segredo, não bloqueia nada). Não corrigido aqui porque é pré-existente e toca dois adaptadores usados por Live TV/Filmes também, fora do escopo desta feature — registrado em `.planning/backlog.md` como `[Bug]` pra entrar pelo `sdd-bugfix` quando alguém pegar.

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [~] `quickstart.md` A–F executado no navegador — parcial (ver nota em T043); B/C/E/F ficam para quando houver fonte real
- [ ] `quickstart.md` G–I executado na TV física (ou risco residual registrado) — não executado, sem TV disponível nesta sessão (R-005, não é gate obrigatório)
- [X] Revisão de segredos feita
- [X] Nenhum backend necessário (ADR-008)
- [ ] `npm run build:tizen` sincronizado em `CCPlayTv/` sem novo chunk fora de `tizen_web_project.yaml` — não executado nesta sessão (nenhum Worker novo nem mudança de build a justificar; fica pra antes de instalar na TV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende do Foundational
- **US2 (Phase 4)**: depende do Foundational; a tela da US1 é quem mostra o resultado, então na prática vem depois dela
- **US3 (Phase 5)**: depende da US1 (lista de episódios e reprodução)
- **US4 (Phase 6)**: depende da US1; independe da US2/US3
- **Polish (Phase 7)**: depende das stories desejadas

### Parallel Opportunities

- T002 com T001 assim que o tipo existir; T003–T006 juntos; T008/T009 juntos
- Na US1: T011, T012, T013, T014, T018 em paralelo
- US3 e US4 em paralelo depois da US1 (arquivos compartilhados: `PlayerLayer.tsx`, `SeriesDetailScreen.tsx`, `episodeNavigation.ts` — coordenar a ordem de edição)

---

## Parallel Example: User Story 1

```bash
Task: "T011 [P] [US1] teste fetchSeriesInfo em tv-web/src/lib/catalog/xtreamConnector.test.ts"
Task: "T012 [P] [US1] testes seriesLoader em tv-web/src/lib/catalog/seriesLoader.test.ts"
Task: "T014 [P] [US1] fetchSeriesInfo em tv-web/src/lib/catalog/xtreamConnector.ts"
Task: "T018 [P] [US1] estilos em tv-web/src/features/screens.css"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 + Fase 2
2. Fase 3 (US1)
3. **PARAR E VALIDAR**: `quickstart.md` A–C

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → série Xtream reproduz com retomada (MVP)
3. US2 → séries M3U
4. US3 → selo de assistido
5. US4 → autoplay

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
