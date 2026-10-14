---
description: "Tasks da feature 049 — navegação por página nas listas"
---

# Tasks: Navegação por página nas listas

**Input**: `sdd/specs/049-navegacao-por-pagina/` (spec.md, plan.md, `logic/paginacao.md`, quickstart.md, handoff.md)

**Prerequisites**: plan.md, spec.md. Sem `research.md`/`data-model.md`/`contracts/` (sem incerteza técnica, nenhum dado novo, nenhuma API).

**Organization**: por user story. US1+US2 (P1) são inseparáveis (→ pagina ⇒ OK entra) e entram juntas na Fase 3; US3 e US4 dependem só da Fase 2/3.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Código em `tv-web/src/` (Vite/React/TS). Comandos a partir de `tv-web/`; scripts de trava rodam da raiz do repositório.
- Live: `tv-web/src/features/live/` (desenho em `liveColumns.tsx`, como **funções** — regra da 040). CSS: `tv-web/src/styles/live.css`.
- Foco: `tv-web/src/lib/focus/`. Filmes/Séries: `tv-web/src/features/vod/VodCatalogScreen.tsx`.
- E2E: `tv-web/e2e/` (registrar roteiro novo em `e2e/run.mjs`; `node e2e/run.mjs --only <nome> --jobs 1`).

## Phase 1: Setup

**Purpose**: baseline antes de mexer.

- [X] T001 Rodar `npx tsc -b` e `npx vitest run src/features/live src/features/vod src/lib/focus src/components` e registrar no `plan.md` (Execution Notes): só os 5 contratos desta feature devem falhar. Rodar `check-contract-tests.ps1` para 018, 024, 030, 031, 046, 048 e 049 (íntegras). Conferir quem escuta a porta 5173.

**Checkpoint**: baseline registrado.

---

## Phase 2: Foundational — paginação pura e âncora de rolagem

**Purpose**: o que Live e Filmes/Séries consomem.

### Contrato da Fase

- `avança e volta uma página, para no último/primeiro item, lista curta vai ao extremo e vazia não tem alvo` — FR-001/002/003, SC-001
- Comando: `npx vitest run src/lib/focus/paging.navegacao-por-pagina.contract.test.ts`

### Implementation

- [X] T002 Implementar `pageSizeFor` e `pagedIndex` em `tv-web/src/lib/focus/paging.ts` conforme `logic/paginacao.md` §1 → contrato: `avança e volta uma página…`
- [X] T003 Criar `tv-web/src/lib/focus/usePageScrollAnchor.ts` (ou função equivalente em `paging.ts`) que, ao paginar, mantém o item focado na mesma linha da tela (`logic/paginacao.md` §3), e um helper de passo da trilha (`measuredRowPitch(container)` com fallback `TRAIL_ROW_PITCH_FALLBACK = 56`).

### Testes da Fase

- [X] T004 [P] `tv-web/src/lib/focus/paging.test.ts`: `NaN`/negativo/fracionário em `pageSize`; `index` fora da faixa (preso); `pageSizeFor` com passo 0; helper de passo sem medida → fallback.

**Critério de Conclusão**: o comando do contrato → 1/1 verde; `npx tsc -b` limpo.

**Registro da Fase**:

- Status: Concluída (Fases 1 e 2)
- Feito: baseline (tsc limpo; 5 contratos vermelhos pelo motivo certo; travas íntegras); `paging.ts` (`pageSizeFor`, `pagedIndex`, `measuredRowPitch`, `scrollByPage`, `TRAIL_ROW_PITCH_FALLBACK`) — a âncora de rolagem ficou em `scrollByPage` (sem hook, T003).
- Contrato: `npx vitest run src/lib/focus/paging.navegacao-por-pagina.contract.test.ts` → 1/1 verde; trava íntegra.
- Testes executados: `paging.test.ts` (3 casos); `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Stories 1 e 2 - Paginar e entrar com OK (Priority: P1) 🎯 MVP

**Objetivo**: na Live, → e ← paginam trilha e lista de canais; OK entra e toca; RETURN volta à trilha; a coluna do destaque sai do modelo de foco.

**Independent Test**: o contrato abaixo; captura de 20 canais paginados no E2E (Fase 8).

### Contrato da Fase

- `→/← paginam a trilha e a lista sem entrar nem tocar; OK entra; RETURN volta à trilha e a reentrada devolve o canal` — US1/US2, FR-001..006
- Comando: `npx vitest run src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx -t "paginam a trilha"`

### Implementation

- [X] T005 [US1] Em `tv-web/src/features/live/useLiveKeyboard.ts` (`handleTrailDirection`), conforme `logic/paginacao.md` §4: `←/→` na trilha e na lista de canais viram `pagedIndex` (trilha: `setFocusedIdentity({ trailKey, channelId: null })`; canais: `channelId`); nunca `setCol`/`enterFocusedTrailItem`. Tamanho de página dos refs da `LiveScreen` (`channelListRef`, `trailScrollRef`) via `pageSizeFor` + `LIVE_ITEM_ROW_HEIGHT`/passo da trilha → contrato: `→/← paginam…`
- [X] T006 [US1] Âncora de rolagem: aplicar `usePageScrollAnchor`/rolagem por `pageSize*84` na lista de canais e no contêiner da trilha (`LiveScreen.tsx`, `liveColumns.tsx`), sem rolar além do conteúdo (§3, D-009).
- [X] T007 [US2] Remover a coluna 2: apagar `previewAction`/`setPreviewAction`/`PREVIEW_ACTION_COUNT` (`LiveScreen.tsx`, `useLiveKeyboard.ts`, `liveTrail.ts`, `liveColumns.tsx` — modelo `LiveColumnsModel`), o ramo `effectiveCol === 2` de `handleTrailSelect`/`onBack` e `setCol: 0|1|2` → `0|1` (`useLiveCatalog.ts`, `useLiveGuide.tsx`, `useLiveZapping.ts`, onde o tipo aparecer). `OK` na trilha continua `enterFocusedTrailItem`; `OK` num canal `playActiveChannel` → contrato: `→/← paginam…`
- [X] T008 [US2] RETURN: confirmar que na coluna 1 sem busca ativa vai à trilha (`setCol(0)`) também nos estados carregando/vazio/erro (FR-006/FR-013); nenhuma regressão da camada da busca (018).

### Testes da Fase

- [X] T009 [US1] `tv-web/src/features/live/LiveScreen.paginacao.test.tsx`: trilha longa (≥ 20 entradas) pagina e para nas bordas; lista curta vai ao extremo; seta segurada (`repeat: true`) atravessa páginas sem `fetchPlayback`/consulta; estados carregando/vazio/erro: OK/RETURN voltam à trilha; ↑ do 1º canal continua indo à lupa.
- [X] T010 [P] [US1] Teste do zapping em `LiveScreen.test.tsx` (bloco do zapping): → pagina a lista do zapping, OK nela toca e fecha como hoje, RETURN fecha só a lista (inalterado).

**Critério de Conclusão**: o comando do contrato → 1/1 verde; `check-contract-tests.ps1` íntegro para 049; os **outros** contratos/tests da Live que assumem "→ entra" ficam para a Fase 7 (vermelhos *esperados*, listados no Registro).

**Checkpoint**: US1+US2 funcionais na Live.

**Registro da Fase**:

- Status: Concluída
- Feito: `useLiveKeyboard`: →/← paginam trilha e canais (`pageList`), sem trocar de coluna; OK entra/toca; coluna 2 removida (`previewAction`, `PREVIEW_ACTION_COUNT`, `setCol: 0|1`); RETURN em camadas no zapping (canais → trilha → fecha a lista, `useLiveZapping`); paginação de canais adiada para o quadro seguinte com destino pendente (lista virtualizada).
- Contrato: contrato 'paginam a trilha…' verde.
- Testes executados: `LiveScreen.paginacao.test.tsx` (5 casos: trilha longa, lista curta, seta segurada, categoria vazia, linha do topo); zapping em `LiveScreen.test.tsx`.
- Pendências: nenhuma.

---

## Phase 4: User Story 3 - Destaque informativo e ícone de Guia (Priority: P2)

**Objetivo**: o destaque perde os botões; o Guia vira ícone focável ao lado da lupa; busca com ←/→ do cursor.

### Contrato da Fase

- `destaque sem botões nem foco; ↑ vai à lupa, → ao ícone de Guia, OK abre o Guia, ↓ volta ao canal` — US3, FR-007/008
- `busca: ←/→ no campo são do cursor; com o foco nos resultados, → pagina` — FR-010
- Comando: `npx vitest run src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx -t "destaque sem botões|busca"`

### Implementation

- [X] T011 [US3] Em `liveColumns.tsx`, remover o bloco `.live-preview-actions` do `.live-hero`; apagar `.live-preview-action*` de `live.css`; ajustar o espaçamento do `.live-hero` (`logic/paginacao.md` §6) → contrato: `destaque sem botões…`
- [X] T012 [US3] `useLiveSearch.ts`: `topIcon: 'search' | 'guide'` (+ `setTopIcon`), resetado em `resetSearchState()`. `liveColumns.tsx`: `.live-guide-button` (`aria-label="Guia completo"`, `<Icon name="guide" />`, `.tv-focus` quando `topFocused && topIcon === 'guide'`) ao lado da lupa, sob a condição de `logic/paginacao.md` §5; CSS escopado em `live.css` (mesma receita do `.search-icon-button`).
- [X] T013 [US3] `useLiveKeyboard.ts`: na linha do topo, → na lupa vai ao Guia (se existir), ← no Guia volta à lupa, ↓ ao 1º canal, OK no Guia chama `openGuideFromPreview` (ou o renomeado) com `setCol(1)`; `←/→` com o campo de busca com foco DOM real seguem do cursor (guarda do `useRemoteNav`) e, com o foco nos resultados, paginam (`topFocused` falso) → contrato: `destaque sem botões…`, `busca…`
- [X] T014 [US3] Dicas do rodapé (`LIVE_HINTS` em `liveTrail.ts`, `VOD_HINTS`): refletir OK Entrar/Assistir, ← → Página, Segurar OK Favoritar, RETURN Voltar (`logic/paginacao.md` §8).

### Testes da Fase

- [X] T015 [US3] `LiveScreen.destaque.test.tsx` (048): trocar os casos de `Assistir` soft disabled por OK em canal não reproduzível (feedback "sem fonte", sem tocar) e remover o que assertava botões; Segurar OK favorita sem destaque; Guia aberto do ícone devolve o foco ao canal de origem no RETURN; sem ícone de Guia no zapping nem com a busca aberta.

**Critério de Conclusão**: o comando do contrato → 2/2 verdes; `check-contract-tests.ps1` íntegro para 049.

**Registro da Fase**:

- Status: Concluída
- Feito: destaque sem botões (CSS `.live-preview-action*` removido); `topIcon` em `useLiveSearch`; `.live-guide-button` ao lado da lupa (`.live-top-icons`); teclado da linha do topo; `LIVE_HINTS`/`VOD_HINTS` com `← → Página`; o foco só sai do ícone quando o guia fecha (trocar `topFocused` no meio do toque ativava o guia duas vezes).
- Contrato: contratos 'destaque sem botões…' e 'busca…' verdes.
- Testes executados: `LiveScreen.destaque.test.tsx` (OK em canal sem fonte, sem botões); guia/favoritos (h2 → Segurar OK).
- Pendências: o guia abre no canal onde o ícone foi alcançado (o 1º da lista) — ver R-011.

---

## Phase 5: User Story 4 - Trilha de Filmes e Séries (Priority: P3)

**Objetivo**: ←/→ paginam a trilha; OK entra; a grade fica como está.

### Contrato da Fase

- `trilha: → pagina sem abrir a categoria; OK entra; a grade segue cartão a cartão e ← na 1ª coluna volta à trilha` — US4, FR-001/011
- Comando: `npx vitest run src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`

### Implementation

- [X] T016 [US4] `VodCatalogScreen.tsx` (`col === 0`): `left`/`right` viram `pagedIndex` sobre a trilha (`setFocusedTrailKey`), tamanho de página pelo contêiner rolável da trilha (passo medido/fallback 56), âncora de rolagem (T003); `onSelect` em `col === 0` já entra; `VOD_HINTS` (T014) → contrato: `trilha: → pagina…`
- [X] T017 [P] [US4] Conferir `MoviesScreen`/`SeriesScreen` (cascas de `VodCatalogScreen`): nada de teclado próprio na trilha; se houver, aplicar a mesma regra.

### Testes da Fase

- [X] T018 [US4] `VodCatalogScreen.paginacao.test.tsx`: Séries e Filmes (as duas seções); toolbar (busca/ordenar) com ←/→ próprios intactos; Favoritos/Histórico/Todos paginam e entram com OK; estados vazios/erro do conteúdo: OK volta à trilha.

**Critério de Conclusão**: o comando do contrato → 1/1 verde; testes de grade (`VodCatalogScreen*`, `MoviesScreen*`, `SeriesScreen*`) só mudaram onde assumiam "→ entra" (Fase 7).

**Registro da Fase**:

- Status: Concluída
- Feito: `VodCatalogScreen` `col === 0`: ←/→ paginam a trilha (`measuredRowPitch` do contêiner `.vod-side-nav`); OK já entrava; grade e toolbar intactas.
- Contrato: `VodCatalogScreen.navegacao-por-pagina.contract.test.tsx` → 1/1 verde.
- Testes executados: `VodCatalogScreen.paginacao.test.tsx` (Filmes e Séries, bordas, OK entra/RETURN volta).
- Pendências: nenhuma.

---

## Phase 6: Zapping, estados e acabamento visual

**Objetivo**: o zapping herda a regra; sem restos do destaque antigo.

- [X] T019 Zapping (`useLiveZapping.ts`, `zapTopLayer`): conferir que `handleTrailDirection`/`handleTrailSelect` compartilhados dão → página e OK entra/toca; `Segurar OK` favorita (já existe); sem topo (lupa/Guia) — ajustar só o necessário.
- [X] T020 CSS: remover resíduos (`.live-hero .live-preview-actions`, `.live-preview-action*`), conferir o `.live-hero` sem os botões à vista (captura), `.live-guide-button` com anel inteiro (receita da 048: folga do contêiner da linha do topo) — só tokens.
- [X] T021 `docs`: atualizar `LIVE_HINTS`/textos de `AppShell` se fixarem "→"; grep por `Assistir`/`Guia completo` em textos de ajuda.

**Critério de Conclusão**: `npx vitest run src/features/live src/features/vod` verde exceto os arquivos da Fase 7 listados.

**Registro da Fase**:

- Status: Concluída
- Feito: zapping herda a regra (mesmas funções); resíduos de CSS removidos; hints atualizadas.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/features/live src/features/vod` verde.
- Pendências: nenhuma.

---

## Phase 7: Emenda dos contratos e migração dos testes (FR-014, D-010)

**Purpose**: reescrever o que assume o fluxo antigo, **sem afrouxar asserção**. Regra de migração: (a) `→` que *entrava* numa categoria/canal vira `Enter`; (b) `→` do canal ao destaque + `Assistir/Favoritar/Guia completo` viram `Enter` (tocar), `Segurar OK`/`onFavoriteKey` (favoritar) e ↑ + `→` + `Enter` no `.live-guide-button` (Guia); (c) `←` que *voltava* de coluna vira `Escape`; (d) `→/←` que deveriam paginar ganham expectativa de página. Cada arquivo travado emendado: registrar `R-0NN` em `plan.md` e regravar a trava da respectiva feature com `check-contract-tests.ps1 -Slug <slug> -Write` (aprovação já dada em D-010).

- [X] T022 Rodar `npx vitest run src/features/live` e listar os arquivos vermelhos; confirmar que cada falha é do fluxo antigo (não bug novo) antes de editar.
- [X] T023 [P] Contratos travados da Live: `LiveScreen.busca-categoria.contract.test.tsx` (018), `LiveScreen.live-tv-ds-v14.contract.test.tsx` (024, inclui `channelNumber`/`appNav`/`channelLogo` se usarem →), `LiveScreen.epg-dados-agora.contract.test.tsx` (030), `LiveScreen.epg-guia-completo.contract.test.tsx` (031), `LiveScreen.memoria-foco.contract.test.tsx` (046), `LiveScreen.live-paridade-v14.contract.test.tsx` (048: o teste "ações em linha" deixa de existir como está — reescrever para "OK toca / ícone de Guia", **mantendo no máximo 4 casos** ou reduzir; registrar em `R-0NN`) — regravar as travas.
- [X] T024 [P] Contrato travado de Filmes/Séries: `MoviesScreen.filmes-series-ds-v14.contract.test.tsx` (025) e `VodCatalogScreen.limpar-historico.contract.test.tsx` (se usarem → para entrar) — regravar as travas.
- [X] T025 [P] Testes comuns da Live: `LiveScreen.test.tsx` (~68 usos de →), `LiveScreen.favorites.test.tsx`, `LiveScreen.memoria-foco.test.tsx`, `LiveScreen.epg.test.tsx`, `LiveScreen.guide.test.tsx`, `LiveScreen.destaque.test.tsx`, `LiveScreen.toast-repetido.test.tsx`.
- [X] T026 [P] Testes de Filmes/Séries: `VodCatalogScreen.test.tsx`, `VodCatalogScreen.limpar-historico.test.tsx`, `MoviesScreen*.test.tsx`, `SeriesScreen*.test.tsx`, e demais que entrarem pela lista de T022.
- [X] T027 [P] E2E que atravessam a Live/Filmes/Séries: `live-tv-ds-v14`, `live-paridade-v14`, `busca-por-categoria`, `epg-dados-agora`, `epg-guia-completo`, `memoria-foco-key-repeat`, `zapping-live-tv`, `favoritos`, `filmes-series-ds-v14`, `catalogo-em-blocos`, `m3u-sob-demanda`, `carga-listas`, `historico-continuar-assistindo`, `limpar-historico`, `semelhantes-elenco-ator`, `trailers`, `metadata-tmdb`, `shell-visual`, `home-busca-configuracoes`, `paridade-limpeza`, `paridade-visual`, `capa-real`, `fontes-estado`, `rede-lifecycle-erros`, `ciclo-vida-player`, `audio-legendas-info`, `qualidade-aspecto`, `player-chrome`, `player-dev-mpegts` — conferir cada um que cite →/Assistir/Guia e migrar; os demais não mudam.

**Critério de Conclusão**: `npm run test` verde; `check-contract-tests.ps1` íntegro para 049 e para cada slug regravado; a lista de arquivos emendados e o motivo estão em `plan.md` (R-0NN).

**Registro da Fase**:

- Status: Concluída
- Feito: migração de ~35 arquivos de teste e ~25 E2E (→ de entrada vira OK; ← de volta vira RETURN; ações do destaque viram OK/Segurar OK/ícone de Guia); contratos emendados e travas regravadas: 018, 024, 025, 030, 031, 036, 046, 048 (R-009..R-012 no plan).
- Contrato: `check-contract-tests.ps1` íntegro para todos os slugs (8 regravados + 049).
- Testes executados: `npm run test` 345 arquivos verdes; `node e2e/run.mjs` 29/29.
- Pendências: nenhuma.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T028 Criar `tv-web/e2e/navegacao-por-pagina.mjs` (padrão de `e2e/live-paridade-v14.mjs`: M3U gerada e servida localmente, 1920×1080): lista de 60 canais e trilha de 20 categorias; → pagina uma tela (mede a linha relativa do foco antes/depois, ±1 linha), para nas bordas; OK entra/toca (player abre), RETURN volta; ícone de Guia por ↑ + → + OK abre o Guia e RETURN devolve ao canal; zapping pagina; Filmes: trilha pagina e a grade segue cartão a cartão; seta segurada atravessa páginas sem erro de página. Registrar em `e2e/run.mjs`; capturas em `test-results/`.
- [X] T029 `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`, `npm run build:tizen` e `npm run test:e2e` completo (confirmar o servidor da 5173).
- [X] T030 Rodar `quickstart.md` (incl. a Tizen QA matrix de §34 para Remote) e registrar o que só a TV física prova (page size real, tecla segurada) como recomendação.
- [X] T031 `plan.md` (Estado Atual, Execution Notes, Arquivos Principais) e status no backlog via `update-feature-status.ps1`.
- [X] T032 Nota nos planos das features afetadas: `048` (destaque sem botões; ações em linha viram OK/Segurar OK/ícone), `024`/`031` (preview e "Guia completo" do preview) — uma linha em `## Riscos e Decisões` de cada.
- [X] T033 `sdd-adr`: nota `**Atualização (ADR-011)**` em `sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md` registrando que → pagina e OK entra nas trilhas/lista de canais (divergência da Spec V14 §13/§33) e que o destaque da Live é informativo.

### Checklist de Release

- [X] Fase 2 (paginação pura) concluída
- [X] Fases 3 (US1+US2), 4 (US3), 5 (US4) concluídas
- [X] Fase 6 (zapping/acabamento) concluída
- [X] Fase 7 (emenda de contratos e migração) concluída, com R-0NN e travas regravadas
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 049 e os slugs regravados
- [X] Lint, `tsc -b`, `npm run test`, `npm run build` e `npm run build:tizen` limpos
- [X] `npm run test:e2e` verde (gate da constitution antes de qualquer validação em TV)
- [X] `quickstart.md` executado; estados carregando/vazio/erro alcançáveis só com setas, OK e RETURN
- [X] ADR-011 atualizada e planos 048/024/031 anotados

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → **US1+US2 (3)** → US3 (4) e US4 (5) em qualquer ordem (4 depende de 3; 5 só de 2) → Zapping/acabamento (6) → **Migração (7)** → Polish (8).
- A migração (7) só começa depois que 3–6 estão verdes nos próprios contratos: ela reescreve o que o novo comportamento invalidou.
- `[P]` = arquivos diferentes, sem dependência.

## Implementation Strategy

1. Fases 1–3 → MVP: paginar e entrar com OK na Live. Parar e validar.
2. Fase 4 (destaque informativo + Guia) fecha o caminho de ações; Fase 5 estende às trilhas de Filmes/Séries.
3. Fase 7 é grande e mecânica: fazer por grupo, rodando o arquivo a cada grupo; nunca afrouxar asserção.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
