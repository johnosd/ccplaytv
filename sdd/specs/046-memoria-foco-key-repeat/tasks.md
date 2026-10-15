---
description: "Tasks da feature 046 — memória de foco por área e key repeat"
---

# Tasks: Memória de foco por área e key repeat

**Input**: `sdd/specs/046-memoria-foco-key-repeat/` (spec.md, plan.md, `logic/key-repeat.md`, `logic/memoria-foco-live.md`)

**Prerequisites**: plan.md, spec.md. Sem `research.md`/`data-model.md`/`contracts/` (nenhuma incerteza técnica, nenhum dado, nenhuma API).

**Organization**: por user story. US1 (14a) e US2 (14b) são independentes e podem ser entregues em separado.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Código em `tv-web/src/` (frontend Vite/React/TS). Comandos a partir de `tv-web/`; o script de trava roda da raiz do repositório.
- Lib de foco: `tv-web/src/lib/focus/`. Live: `tv-web/src/features/live/`. Catálogo: `tv-web/src/features/catalog/`.
- E2E: `tv-web/e2e/` (Playwright, dev server já rodando). Docs: `sdd/specs/046-memoria-foco-key-repeat/`.

## Phase 1: Setup

**Purpose**: baseline antes de mexer — os contratos são vermelhos por construção; a área tocada deve começar verde.

- [X] T001 Rodar, isolados, `LiveScreen*.test.tsx`, `catalogApi.test.tsx`, `VodCatalogScreen*.test.tsx`, `MoviesScreen*.test.tsx`, `SeriesScreen*.test.tsx` e registrar no `plan.md` (Execution Notes) o resultado base (os 3 arquivos de contrato desta feature falham por desenho). Rodar também `npx tsc -b` (deve sair limpo).

**Checkpoint**: baseline registrado.

---

## Phase 2: Foundational

Nada bloqueante: as duas stories não compartilham código. Cada uma instala seu próprio reset em `setupTests.ts` (T004 / T014).

---

## Phase 3: User Story 1 - Segurar a seta na trilha sem prefetch por categoria (Priority: P1) 🎯 MVP — 14a

**Objetivo**: 0 prefetch durante a rajada; ao estabilizar, só a categoria parada, com o debounce atual.

**Independent Test**: `catalogApi.key-repeat.contract.test.tsx` verde; os 8 testes antigos de `useCategoryFocusPrefetch` seguem verdes.

### Contrato da Fase

- `rajada com repeat não prefetcha nada; ao soltar, só a categoria final, após o debounce` — FR-002/FR-003, US1/AC1+AC2
- `sem keyup, a rajada acaba sozinha após o silêncio e a categoria parada é prefetchada` — FR-005
- Comando (de `tv-web/`): `npx vitest run src/features/catalog/catalogApi.key-repeat.contract.test.tsx`

### Implementation

- [X] T002 [US1] Implementar `tv-web/src/lib/focus/keyRepeat.ts` conforme `logic/key-repeat.md` §1: rastreador de módulo (listeners em `window`, captura, passivos; `repeat`+seta → rajada; `keyup` de seta/outra tecla/`blur`/`visibilitychange` encerram; silêncio de `KEY_REPEAT_QUIET_MS`), `useKeyRepeatBurst` via `useSyncExternalStore`, `resetKeyRepeatTracker`. Remover o `throw`/no-op dos stubs → contrato: ambos
- [X] T003 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`, `useCategoryFocusPrefetch`: ler `useKeyRepeatBurst()`, retornar cedo no efeito quando `fast`, incluir `fast` nas dependências (`logic/key-repeat.md` §2). **Não** alterar a assinatura nem o ramo de aborto → contrato: ambos
- [X] T004 [US1] Em `tv-web/src/setupTests.ts`, `afterEach(resetKeyRepeatTracker)` global (R-004) — importar do módulo real, não de teste

### Testes da Fase

- [X] T005 [P] [US1] `tv-web/src/lib/focus/keyRepeat.test.ts`: `repeat:false` nunca é rajada; tecla não-seta encerra; `keyup` encerra; `blur`/`visibilitychange` encerram; listeners removidos quando o último assinante sai; um `keydown` interceptado por um listener `document` em captura com `stopImmediatePropagation` ainda é visto (D-001); o rastreador não chama `preventDefault`
- [X] T006 [P] [US1] Em `tv-web/src/features/catalog/catalogApi.test.tsx`: **não editar os testes existentes**; confirmar que continuam verdes. Se faltar, acrescentar um teste novo (arquivo novo `catalogApi.key-repeat.test.tsx`) para: rajada **não** aborta a busca em andamento da categoria entrada (FR-004)

**Critério de Conclusão**: `npx vitest run src/features/catalog/catalogApi.key-repeat.contract.test.tsx` → 2/2 verdes; `catalogApi.test.tsx` e os testes de tela que mockam o hook seguem verdes; `check-contract-tests.ps1` íntegro; `npx tsc -b` limpo.

**Checkpoint**: US1 funcional e testável isoladamente — pode ser entregue sem a US2.

**Registro da Fase**:

- Status: concluída (modo contínuo).
- Feito: `keyRepeat.ts` (rastreador em `window`/captura, `useKeyRepeatBurst`, `isKeyRepeatBurst`, `subscribeKeyRepeatBurst`); `useCategoryFocusPrefetch` reage à rajada por assinatura síncrona; reset global em `setupTests.ts`.
- Contrato: `npx vitest run src/features/catalog/catalogApi.key-repeat.contract.test.tsx` → 2/2 verdes; trava íntegra.
- Testes executados: `keyRepeat.test.tsx` (9), `catalogApi.key-repeat.test.tsx` (1), `catalogApi.test.tsx` e `src/lib/focus` (81/81 no conjunto); `npx tsc -b` limpo. Desvio de `logic/key-repeat.md` §2 (R-007): `fast` não entra nas dependências do efeito — a reação é por assinatura direta.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Live TV lembra o foco por entrada (Priority: P2) — 14b

**Objetivo**: reentrar numa categoria/★ Favoritos/Todos restaura o último canal; fechar o player devolve o canal que tocava.

**Independent Test**: os 3 arquivos de contrato da US2 verdes (3 testes).

### Contrato da Fase

- `lembra o canal por lista e entrada, nunca mistura listas, e esquece uma lista inteira` — FR-007/FR-009/FR-012/FR-013
- `trocar de categoria e voltar devolve o foco ao último canal daquela categoria` — US2/AC1, FR-008
- `fechar o player depois de zapping e ↓ devolve o foco ao canal que tocava, na lista de origem` — US2/AC3, FR-011
- Comando (de `tv-web/`): `npx vitest run src/features/live/liveSessionMemory.memoria-foco.contract.test.ts src/features/live/LiveScreen.memoria-foco.contract.test.tsx`

### Implementation

- [X] T007 [US2] Implementar `tv-web/src/features/live/liveSessionMemory.ts` conforme `logic/memoria-foco-live.md` §1 (mapa de módulo, chave `${sourceId}|live|${entry}`, `forgetLiveSource`, `resetLiveSessionMemory`) → contrato: `lembra o canal por lista e entrada…`
- [X] T008 [P] [US2] Em `tv-web/src/features/live/liveTrail.ts`: `liveEntryKey(entered, categories)` e `trailKeyOf(entered, categories)` puras (`logic/memoria-foco-live.md` §1/§4); `undefined` para categoria inexistente
- [X] T009 [US2] Em `tv-web/src/features/live/useLiveCatalog.ts` (`useLiveChannels`): efeito de gravação com as regras do §2 e dica de vizinho no `locateOrNeighbor` (§3). Não mudar a ordem dos efeitos existentes (`sdd/specs/040-dividir-player-live/logic/divisao.md` §1.2): declarar o efeito novo **depois** do que atualiza `lastChannelFocusRef` → contrato: `trocar de categoria e voltar…`
- [X] T010 [US2] Em `tv-web/src/features/live/useLiveKeyboard.ts`: `enterCategory`/`enterFavorites`/`enterAll` usam `recalledLiveFocus(...)?.channelId ?? null`; passar `sourceId` por `LiveKeyboardParams` (e por `LiveScreen.tsx`, que já o tem) → contrato: `trocar de categoria e voltar…`
- [X] T011 [US2] Em `tv-web/src/features/live/useLiveZapping.ts`: `onPlayerClosed` (§4), exportado no objeto retornado; em `LiveScreen.tsx:294` trocar `onClose={() => setPlaying(null)}` por `zapping.onPlayerClosed` → contrato: `fechar o player depois de zapping…`
- [X] T012 [US2] Em `tv-web/src/features/import/importApi.ts`, `useDeleteSource.onSuccess`: `forgetLiveSource(sourceId)` (D-009) — o `mutationFn` já recebe `sourceId`; usar `onSuccess: (_d, sourceId) =>`
- [X] T013 [US2] Em `tv-web/src/setupTests.ts`: `afterEach(resetLiveSessionMemory)` global (R-004), ao lado do T004

### Testes da Fase

- [X] T014 [P] [US2] `tv-web/src/features/live/liveTrail.memoria.test.ts`: `liveEntryKey`/`trailKeyOf` para favoritos/todos/categoria, e categoria que sumiu → `undefined`
- [X] T015 [P] [US2] `tv-web/src/features/live/LiveScreen.memoria-foco.test.tsx` (novo, **não** o contrato): ★ Favoritos e Todos também lembram (FR-007); busca ativa não sobrescreve a memória (FR-014); canal lembrado removido da lista cai no vizinho, não no topo (FR-010); entrada nunca visitada abre no 1º item (FR-009); restaurar não chama `fetchPlayback` (FR-016)
- [X] T016 [P] [US2] Em `tv-web/src/features/import/` um teste novo de `useDeleteSource` chamando `forgetLiveSource` (D-009/FR-013)
- [X] T017 [US2] Rodar isolados todos os `LiveScreen*.test.tsx` e contratos que montam `LiveScreen` (R-005) e comparar com a baseline do T001

**Critério de Conclusão**: os 3 testes de contrato da US2 verdes (e o par da US1 ainda verdes); `LiveScreen*.test.tsx` iguais à baseline; `check-contract-tests.ps1` íntegro; todas as travas das outras features (`check-contract-tests.ps1` por slug 016/018/024/027/031/036/038/039) íntegras; `npx tsc -b` limpo.

**Checkpoint**: US2 funcional; o app todo continua verde.

**Registro da Fase**:

- Status: concluída (modo contínuo).
- Feito: `liveSessionMemory.ts`; `liveEntryKey`/`trailKeyOf` em `liveTrail.ts`; gravação + dica de vizinho em `useLiveChannels`; restauração em `useLiveKeyboard` (`sourceId` novo em `LiveKeyboardParams`); `onPlayerClosed` em `useLiveZapping` ligado em `LiveScreen`; `forgetLiveSource` em `useDeleteSource`; reset global em `setupTests.ts`.
- Contrato: `npx vitest run src/features/live/liveSessionMemory.memoria-foco.contract.test.ts src/features/live/LiveScreen.memoria-foco.contract.test.tsx` → 3/3 verdes; trava íntegra (e as 28 das outras features).
- Testes executados: `LiveScreen.memoria-foco.test.tsx` (4), `liveTrail.memoria.test.ts` (3), `importApi.forget-live-focus.test.tsx` (1); pasta `src/features/live` 188/188. Uma regressão real achada e resolvida em `LiveScreen.test.tsx` (R-008).
- Pendências: nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T018 Novo `tv-web/e2e/memoria-foco-key-repeat.mjs` (entra em `npm run test:e2e`; mesmo molde de `zapping-live-tv.mjs`/`lib/entrada.mjs`, dados fictícios): (a) segurar ↓ por ≥ 30 categorias com `repeat:true` sintético e **contar requisições** de categoria — 0 durante, ≤ 1 depois (SC-001); (b) toque isolado ainda prefetcha após 300 ms (SC-002); (c) ida e volta entre duas categorias 10× devolve o mesmo canal (SC-003); (d) fechar o player após 1–5 zappings (SC-004)
- [X] T019 Rodar `quickstart.md` (partes automatizáveis) e registrar o resultado
- [X] T020 `npx tsc -b`, `npm run lint` (sem warnings **novos** além do baseline de 45), `npm run build`; não rodar `build:tizen` (reescreve artefato já modificado) a menos que o usuário peça
- [X] T021 Docs canônicas: `CLAUDE.md` (parágrafo desta feature), `ADR-009` só se o executor julgar que o rastreador paralelo merece nota (não é obrigatório — `useRemoteNav` não mudou), backlog via `update-feature-status.ps1` (não editar à mão as colunas de status)

### Checklist de Release

- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [X] Travas das outras features íntegras (rodar o script por slug das que montam `LiveScreen`/telas VOD)
- [X] `npm run test:e2e` verde (suíte inteira, dev server reiniciado antes)
- [X] `quickstart.md` executado (partes automatizáveis, via E2E); passada na TV física (recomendada, **não** gate): **pendente** — `repeat` real nas setas (R-001) e SC-006

---

## Dependencies & Execution Order

- Phase 1 → (Phase 3 ‖ Phase 4) → Phase 5.
- Dentro da US1: T002 → T003 → T004. Dentro da US2: T007/T008 → T009/T010/T011 → T012/T013.
- US1 e US2 não compartilham arquivos de produção; ambas editam `setupTests.ts` (T004/T013): fazer em sequência, não em paralelo.

## Implementation Strategy

MVP = US1 (14a): fecha o bug de TV real (rajada de buscas) e é entregável sozinha. US2 vem depois, sem quebrar a US1.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
