---
description: "Tasks da feature 045 — IME da TV nos formulários"
---

# Tasks: IME da TV nos formulários — teclado, Next/Done, senha e erros de conexão

**Input**: `sdd/specs/045-ime-formularios-tv/` (`spec.md`, `plan.md`, `research.md`, `logic/*.md`, `quickstart.md`)

**Prerequisites**: `plan.md`, `spec.md`; contratos travados em `contract-tests.lock` (5 testes — **não editar**).

**Organization**: por user story (P1 → P3). Cada fase é testável sozinha.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: arquivos diferentes, sem dependência
- **[Story]**: US1…US5

## Path Conventions

- Frontend em `tv-web/` (tudo abaixo é relativo a ele): `src/lib/**`, `src/components/**`, `src/features/**`, `src/styles/**`, `e2e/**`.
- Documentação em `sdd/specs/045-ime-formularios-tv/` e `.planning/backlog.md`; `CLAUDE.md` na raiz.
- Comandos rodam de dentro de `tv-web/` (PowerShell 5.1: sem `&&`; usar `;`).

## Phase 1: Setup — sonda do IME (dev-only)

**Purpose**: poder **medir na TV** o que o IME entrega (R-001/R-002), sem console.

- [x] T001 [P] Criar `src/lib/imeProbe.ts` (anel de ~12 eventos: `keydown`/`keyup`/`focusin`/`focusout` com `key`, `keyCode`, `code`, `isComposing`, tag/`id` do alvo — **nunca** o valor do campo) e `src/components/ImeProbeOverlay.tsx` (molde de `src/components/PerfOverlay.tsx`), montados só com `import.meta.env.VITE_CCPLAY_IME_PROBE === '1'` (off por padrão). Teste: o anel não guarda o valor digitado e respeita o limite.
- [x] T002 **ADIADA por decisão do usuário (2026-10-02, risco R-012 aceito) — Passada na TV (usuário) — decidida para ANTES da Fase 4 (R-012)**: instalar com a sonda (skill `tizen-tv`), registrar em `research.md` R0-1 o que chega ao apertar Next, Done, Cancel e RETURN com o teclado **aberto/fechado** nos 3 formulários. As Fases 2–3 e 5–7 não dependem dela e podem andar antes; **a Fase 4 (T015/T030) só começa depois de T002**, salvo adiamento explícito do usuário (aí usa os valores padrão da tabela e fica "não verificada"). — **Atualização 06/10/2026: passada na TV física realizada com sucesso** (relato do usuário, sem números medidos nem capturas; registro em `plan.md` → "Passada física na TV — 2026-10-02"); qualquer "não executado/adiada" acima é o estado anterior, mantido como histórico

**Checkpoint**: sonda disponível; medição registrada ou explicitamente adiada.

---

## Phase 2: Foundational — a confirmação de conexão (lib pura)

**Purpose**: o módulo que as US1 consome. Bloqueia a Fase 3.

### Contrato da Fase

- `distingue endereço inválido (sem rede), offline, falha de conexão, credencial recusada e resposta incompatível` — US1/AC1-AC4
- `painel sem protocolo Xtream cujo M3U serve confirma como "limited" e abandona o download depois da primeira entrada` — US1/AC5
- Comando: `npx vitest run src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts`

### Implementation

- [x] T003 [P] [US2] Criar `src/lib/imeKeys.ts` (`IME_KEYCODES = { done: [65376], cancel: [65385], next: [] }`, `imeKeyOf(event)` pura) — ver `logic/ime-teclas-e-cobertura.md` §1.
- [x] T004 [US1] Implementar `checkSourceConnection` em `src/lib/catalog/sourceConnectionCheck.ts` (manter tipos/assinatura do stub) seguindo `logic/verificacao-conexao.md` §3–§4: reusar `normalizeServerAddress`, `resolveAccountStatus`, `legacyM3uUrl`, `parsePanelUrl`, `parseM3uLines`+`linesFromResponse`, `isAbortError`, `getNetworkState`; `Promise.race` com `CheckTimeout`/`CheckCancelled`; erro inesperado **sobe** (D-009); nunca logar nem devolver URL/credencial. → contrato: os dois testes acima
- [x] T005 [P] [US1] Adicionar `buttonRef?: Ref<HTMLButtonElement>` (aditivo) a `src/components/Button.tsx`.

### Testes da Fase

- [x] T006 [P] [US1] `src/lib/catalog/sourceConnectionCheck.test.ts`: timeout de 15 s (timers falsos) → `NET-02` mesmo com `fetch` que ignora o sinal; `signal` abortado → `cancelled`; painel por URL M3U (`…/get.php?username=&password=`) → `xtream`/`SRC-401`/`SRC-402`; `429` → `API-429`; M3U que serve manifesto HLS → `SRC-422`; M3U com usuário/senha embutidos → `SRC-001`.
- [x] T007 [P] `src/lib/imeKeys.test.ts` (+ `Button.test.tsx` para `buttonRef`).

**Critério de Conclusão**: `npx vitest run src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts` → 2/2 verdes; `check-contract-tests.ps1 -Slug 045-ime-formularios-tv` íntegro; `npx tsc -b` limpo; nenhum código novo na tabela da 042.

**Registro da Fase**:

- Status: concluída (2026-10-02).
- Feito: T003 (lib/imeKeys.ts), T004 (sourceConnectionCheck.ts real, árvore de logic/verificacao-conexao.md), T005 (Button.buttonRef), T006/T007 (testes).
- Contrato: `npx vitest run src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: sourceConnectionCheck.test.ts (7), imeKeys.test.ts (3), Button.test.tsx (+1), imeProbe.test.ts (3); `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 — Erros de conexão no formulário (Priority: P1) 🎯 MVP

**Objetivo**: confirmar a conexão antes de sair do formulário; falha = permanece, com dados, uma faixa, foco na ação.

**Independent Test**: painel falso respondendo cada caso (`quickstart.md` cenários 1–6).

### Contrato da Fase

- `credencial recusada: o formulário permanece com os dados, uma única faixa com o código, foco na ação, nada criado e nenhum segredo à vista` — US1/AC3+AC7
- `durante a confirmação um segundo OK é ignorado e RETURN cancela sem sair da tela; com nada pendente, RETURN sai` — US1/AC6
- Comando: `npx vitest run src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx` (o 3º teste é da Fase 4)

### Implementation

- [x] T008 [P] [US1] `src/features/import/connectionBanner.ts`: `bannerFor(code)` → `{ title, description, code, retryable }` a partir de `describeError` (`src/lib/errors/errorCatalog.ts`); relabel do botão (`'Tentar de novo'` só se `retryable`). + `src/features/import/ConnectionErrorBanner.tsx` (`role="alert"`, título + descrição + código discreto; nada além disso) + CSS `.connection-banner` em `src/styles/onboarding.css` (só tokens). → contrato: `credencial recusada…`
- [x] T009 [P] [US1] `src/features/import/connectionInput.ts`: `connectionInputFor({ existing?, mode, draft })` → `ConnectionCheckInput | null` (cadastro: sempre; edição: só se mudou; em branco completado por `readCredential`, nunca fora do helper) — `logic/verificacao-conexao.md` §5.
- [x] T010 [US1] `src/features/import/AddSourceScreen.tsx`: fases `idle|checking|saving`, trava síncrona por `useRef`, `AbortController`, `checkSourceConnection` antes de `createSource`/`updateSource`, banner único, relabel "Tentar de novo", foco no botão de ação (via `buttonRef`) após falha/cancelamento, `STO-01` por quota (reusar o helper de `catalogRepository.ts`), RETURN: cancela se há confirmação ativa, senão `onBack`. Manter validação de campos vazios (FR-012). Remover a linha crua `…{error.message}` só para os casos que agora têm código; erro inesperado mantém a linha genérica (D-009). → contrato: os dois testes da Fase 3
- [x] T011 [US1] **APROVADA pelo usuário em 2026-10-02 (R-003)** — emendar só o mock de `fetch`: o teste 1 de `src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx` (037) mocka `fetch` rejeitando e espera `onSourceCreated`. Pedir aprovação, emendar **só o mock de `fetch`** (servir `#EXTM3U` + 1 entrada) e re-travar a 037 (`check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo -Write -Paths …`); registrar em `plan.md` (R-003 → Resolvido).
- [x] T012 [US1] E2E: `e2e/lib/entrada.mjs` (o painel falso passa a atender a confirmação — `player_api` com `user_info`, M3U com `#EXTM3U`) e conferir todos os `e2e/*.mjs` que cadastram lista; novo `e2e/ime-formularios.mjs` (cenários 1–7 e 10 de `quickstart.md`, contando requisições ao painel falso) entra em `test:e2e` (`package.json`). Medir 1× contra a lista real (`CCPLAY_PROBE_*`, só contagens/ms) para R-005.

### Testes da Fase

- [x] T013 [P] [US1] `connectionBanner.test.ts`, `connectionInput.test.ts` (edição: só nome → `null`; `dns` mudou com usuário/senha em branco → completa por `readCredential`; credencial sumida → `null`) e `AddSourceScreen.test.tsx`/`App.test.tsx`/`importApi.test.tsx` ajustados ao novo fluxo (não são contratos travados).
- [x] T014 [P] [US1] `AddSourceScreen.confirmacao.test.tsx`: `NET-01` offline sem `fetch`, `NET-02`, `SRC-001` sem `fetch`, `SRC-422`, fallback `limited` segue ao progresso, edição só com nome não consulta a rede, `STO-01`.

**Critério de Conclusão**: os 2 contratos desta fase verdes (`npx vitest run …AddSourceScreen.ime-formularios.contract.test.tsx` — o 3º só fecha na Fase 4); T011 concluída (037 re-travada, aprovação já dada); E2E `ime-formularios.mjs` verde; nenhuma sequência de teclas deixa a tela sem foco (SC-003).

**Registro da Fase**:

- Status: concluída (2026-10-02), T011 com a aprovação do usuário.
- Feito: T008 (`connectionBanner.ts` + `ConnectionErrorBanner.tsx` + CSS), T009 (`connectionInput.ts`), T010 (`AddSourceScreen` com confirmar → criar, faixa única, trava por ref, RETURN em camadas), T011 (emenda só do mock de `fetch` do teste 1 da 037 e 037 re-travada), T012 (E2E `e2e/ime-formularios.mjs` com 6 cenários; `m3u-sob-demanda.mjs` e `capa-real.mjs` passaram a esperar 2 pedidos ao M3U = confirmação + download, R-004), T013/T014 (testes).
- Contrato: `npx vitest run src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx` → 2/3 verdes (o 3º é da Fase 4); trava da 045 e da 037 íntegras.
- Testes executados: suíte inteira 2342/2343 (só o contrato da Fase 4 vermelho); `npx tsc -b` limpo; `npm run lint` 0 erros (54 avisos, nenhum nos arquivos desta feature); E2E: os 24 scripts de `test:e2e` verdes, depois de ajustar os 2 que contavam pedidos ao M3U; `node e2e/ime-formularios.mjs` 33 ✓ / 0 ✗.
- Pendências: medição contra a lista real (R-005, `CCPLAY_PROBE_*`) **não feita** — fica para o fechamento; `e2e/ime-formularios.mjs` entra em `test:e2e` no Polish, depois das cenas das Fases 4–6.

---

## Phase 4: User Story 2 — Next e Done previsíveis (Priority: P1)

**Objetivo**: Done conclui o campo e leva o foco à ação principal, sem enviar; Next avança (nativo ou por tabela).

### Contrato da Fase

- `Done do IME no último campo leva o foco à ação sem enviar; Enter sozinho continua do teclado do sistema` — US2/AC2+AC4
- Comando: `npx vitest run src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx` → 3/3

### Implementation

- [x] T015 [US2] `src/lib/useImeChain.ts` (`logic/ime-teclas-e-cobertura.md` §2): listener nativo no contêiner, só em `input.text-field-input`, `imeKeyOf`: `done`/`next` → próximo input em ordem de documento ou `primaryRef`; `cancel` → só `stopPropagation`; **nunca** `Enter`, nunca `click()`. → contrato: `Done do IME…`
- [x] T016 [US2] `src/components/TextField.tsx`: prop `enterKeyHint?: 'next' | 'done'` (atributo `enterkeyhint`). `AddSourceScreen.tsx`: `useImeChain(containerRef, primaryRef)`, `next` em Nome/Servidor/Usuário (Nome em M3U), `done` em Senha/URL M3U. → contrato: `Done do IME…`

- [ ] T030 [US2] **ADIADA junto de T002 (decisão do usuário, 2026-10-02) — Condicional ao resultado de T002 (R-002, FR-017)**: se a TV entregar RETURN à página com o teclado aberto, adicionar no contêiner da tela de formulário um guard em que o primeiro RETURN com um `input` focado só fecha o teclado (não chama `onBack`) e o segundo sai — local à tela/`useImeChain`, **sem** alterar `useRemoteNav`. Se T002 mostrar que o sistema consome o RETURN, registrar "não necessário" em `plan.md` (R-002 → Resolvido). Sem medição, FR-017 permanece **não verificado**.

### Testes da Fase

- [x] T017 [P] [US2] `src/lib/useImeChain.test.tsx`: Done no campo do meio avança ao próximo; Done no último foca `primaryRef` sem `click`; Cancel não sai da tela; `Enter` nunca tem `preventDefault`; tecla fora da tabela é ignorada; campo fora do contêiner é ignorado.

**Critério de Conclusão**: `npx vitest run …AddSourceScreen.ime-formularios.contract.test.tsx` → 3/3 e `check-contract-tests.ps1` íntegro; SC-004 verificado em E2E por eventos simulados (nenhuma tecla direcional para mudar de campo). **SC-007 (TV) é a passada final** — ver Polish.

**Registro da Fase**:

- Status: código concluído (2026-10-02) — **sem a medição na TV (T002 não feita) e sem T030**, por escolha do usuário de implementar com os padrões da tabela.
- Feito: T015 (`lib/useImeChain.ts`), T016 (`enterKeyHint` no `TextField` e fiação no `AddSourceScreen`: `next` em Nome/Servidor/Usuário, `done` em Senha/URL M3U), T017 (testes).
- Contrato: `npx vitest run src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx` → 3/3 verdes; trava íntegra.
- Testes executados: `useImeChain.test.tsx` (5: Done no meio avança, no último foca a ação sem enviar, Cancel não sai, Enter nunca é tomado, tecla/campo fora da tabela ignorados); E2E cenário 9 (Done anda Nome → Servidor → Usuário → Senha → ação, 0 requisições ao painel, Enter sem preventDefault).
- Pendências: **T002 (sonda na TV) e T030 (RETURN com o teclado aberto) abertos**; `IME_KEYCODES.done`/`cancel` são de memória e `next` está vazio — Next/Done/RETURN **não verificados** (R-001/R-002, R-012 atualizado: usuário escolheu seguir sem medir).

---

## Phase 5: User Story 3 — O campo nunca fica atrás do teclado (Priority: P2)

**Objetivo**: ao focar, o `.text-field` inteiro fica na metade superior do contêiner rolável.

**Independent Test**: E2E a 1920×1080 medindo o retângulo (SC-005).

### Implementation

- [x] T018 [P] [US3] `src/lib/focus/revealInTopHalf.ts`: `topHalfScrollDelta(block, container)` pura + `revealInTopHalf(block)` (ancestral rolável, escala do palco, `requestAnimationFrame`) — `logic/ime-teclas-e-cobertura.md` §3.
- [x] T019 [US3] `src/components/TextField.tsx`: `onFocus` do `<input>` chama `revealInTopHalf(.text-field)`. CSS: `.form-scroll-room::after` (folga = metade do palco; conferir o token real em `src/index.css`/`src/lib/stage.ts`) em `src/styles/components.css`; aplicar às 3 telas; `overflow-y: auto` + `no-scrollbar` em `.screen.epg-settings`/`.tmdb-key` (`src/styles/settings.css`, atenção ao anel de foco, R-006). Foco programático da ação principal usa `scrollIntoView({ block: 'nearest' })`.

### Testes da Fase

- [x] T020 [P] [US3] `revealInTopHalf.test.ts` (pura: já na metade de cima → 0; embaixo → delta que ancora a ~10%; acima do topo → delta negativo; altura zero → 0) e teste de `TextField` (foco chama o utilitário; busca continua funcionando). E2E (em `e2e/ime-formularios.mjs`): cenário 8 de `quickstart.md`.

**Critério de Conclusão**: testes verdes; E2E mede, nos 3 formulários e a 1920×1080, `.text-field` inteiro na metade superior depois de cada foco (100%); sem recorte do anel de foco; contratos intactos.

**Registro da Fase**:

- Status: concluída (2026-10-02).
- Feito: T018 (`lib/focus/revealInTopHalf.ts`, geometria pura + rolagem do ancestral com a escala do palco), T019 (`TextField` chama a cobertura no `onFocus`; `.form-scroll-room::after` com meia altura do palco; `overflow-y: auto` + `no-scrollbar` em `.epg-settings`/`.tmdb-key`; classe aplicada às 3 telas), T020 (testes).
- Contrato: sem contrato nesta fase (os 5 travados não cobrem US3 — plano).
- Testes executados: `revealInTopHalf.test.ts` (6), `TextField.cobertura.test.tsx` (2); E2E `e2e/ime-formularios.mjs` cenário 7: 7 campos (4 Xtream, URL M3U, EPG, chave TMDB) com o bloco na metade superior (até 540 px) a 1920×1080.
- Pendências: o recorte do anel de foco por `overflow` (R-006) não mostrou problema no E2E, mas só a TV física confirma; **o teclado real cobrindo ou não o campo só se vê na TV (SC-007)**.

---

## Phase 6: User Story 4 — Senha mascarada com "Mostrar" (Priority: P2)

**Objetivo**: máscara por padrão e controle focável que alterna até a pessoa desligar.

### Implementation

- [x] T021 [US4] `src/components/TextField.tsx`: `revealable?`/`revealNoun?` (só vale em `purpose="password"`); estado `revealed` do próprio componente; o mesmo `<input>` troca `type`; botão **logo após o input**, `aria-pressed`, nome "Mostrar|Ocultar {noun}", texto visível; CSS `.text-field-control` e o toggle em `src/styles/components.css` (e o ajuste de largura em `src/styles/onboarding.css` para `.source-setup .text-field`).
- [x] T022 [US4] `AddSourceScreen.tsx` (Senha: `revealable revealNoun="senha"`) e `src/features/settings/TmdbKeyScreen.tsx` (remover o botão próprio `Mostrar chave`/`Ocultar chave` e o `showKey`; `revealable revealNoun="chave"`; o campo continua começando vazio).

### Testes da Fase

- [x] T023 [P] [US4] `TextField.test.tsx` (máscara por padrão; alterna; nome/`aria-pressed`; desmontar zera; nunca imprime o valor em `aria-*`), `TmdbKeyScreen.test.tsx` ajustado, e varredura de segredos no E2E (cenários 9–10).

**Critério de Conclusão**: máscara por padrão inclusive na edição; alternar e sair/voltar mascarada; `findUnnamedControls` sem achados nas 3 telas; nenhum valor de campo em banner/anúncio/`aria-*`/log.

**Registro da Fase**:

- Status: concluída (2026-10-02).
- Feito: T021 (`TextField` `revealable`/`revealNoun`/`enterKeyHint`; botão logo depois do `<input>`, `aria-pressed`, nome que muda, texto visível; mesmo `<input>` troca de `type` sem remontar), T022 (`AddSourceScreen` Senha e `TmdbKeyScreen` usam o controle do componente; o botão próprio da chave saiu), T023 (testes).
- Contrato: sem contrato nesta fase.
- Testes executados: `TextField.revelar.test.tsx` (6), `TmdbKeyScreen.test.tsx` verde sem mudança (os nomes `Mostrar chave`/`Ocultar chave` continuam); `AddSourceScreen.test.tsx` ajustado em 2 pontos (ordem de foco ganhou `Mostrar`; `aria-pressed` do seletor de tipo vira `.source-type[aria-pressed]`); E2E cenário 8 (revela, nome muda, volta mascarada, sem segredo em nome acessível).
- Pendências: nenhuma.

---

## Phase 7: User Story 5 — Mesmos comportamentos na chave TMDB e no EPG manual (Priority: P3)

**Objetivo**: Done, cobertura e rótulo permanente valem nos dois formulários restantes; erros próprios intactos.

### Implementation

- [x] T024 [P] [US5] `src/features/settings/TmdbKeyScreen.tsx`: `useImeChain` (primário "Salvar e testar"), `enterKeyHint="done"`, folga de rolagem. `src/features/settings/EpgSettingsScreen.tsx`: `useImeChain` (primário "Salvar endereço"), `enterKeyHint="done"`, folga + `overflow`. Erros próprios **inalterados** (`API-401`/`API-429`; endereço inválido/`EPG-02`) — FR-024.

### Testes da Fase

- [x] T025 [P] [US5] `TmdbKeyScreen.test.tsx` e `EpgSettingsScreen.test.tsx`: Done foca a ação sem enviar; os erros próprios continuam com o mesmo texto e código; cobertura chamada no foco.

**Critério de Conclusão**: Done não envia em nenhuma das duas telas; contratos 026/028/032/041 e os testes existentes dessas telas verdes.

**Registro da Fase**:

- Status: concluída (2026-10-02).
- Feito: T024 (`TmdbKeyScreen`: `useImeChain` → "Salvar e testar", `enterKeyHint="done"`; `EpgSettingsScreen`: → "Salvar endereço"; folga/`overflow` já vieram da Fase 5), T025 (testes).
- Contrato: sem contrato nesta fase.
- Testes executados: `TmdbKeyScreen.ime.test.tsx` (2), `EpgSettingsScreen.ime.test.tsx` (2: Done foca a ação sem salvar nem sincronizar; erro de endereço inválido com o mesmo texto); `TmdbKeyScreen.test.tsx` e `EpgSettingsScreen.test.tsx` existentes verdes sem mudança; E2E cenário 7 cobre os dois campos.
- Pendências: a TV física (SC-007) vale também aqui.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T026 Atualizar `CLAUDE.md` (parágrafo da feature 045), `.planning/backlog.md` (item 18; rodar `update-feature-status.ps1`) e, se a passada na TV mudar a tabela, `lib/imeKeys.ts` + `research.md` R0-1/R-001/R-002.
- [x] T027 Revisão de segredos antes do commit (constitution): `git diff` sem URL/usuário/senha de teste em log, fixture ou snapshot; varredura do E2E (SC-006).
- [x] T028 **Parte automatizada feita; passada na TV ADIADA por decisão do usuário (2026-10-02)** — Rodar `quickstart.md` inteiro; passada na TV (SC-007, T002 + cenários de TV) — **decisão do usuário se é gate** (padrão 013/027): "não testado" nunca vira "aprovado". — **Atualização 06/10/2026: passada na TV física realizada com sucesso** (relato do usuário, sem números medidos nem capturas; registro em `plan.md` → "Passada física na TV — 2026-10-02"); qualquer "não executado/adiada" acima é o estado anterior, mantido como histórico
- [x] T029 Texto de FR-014 da `spec.md` ajustado para "Done do IME" (R-011) — aprovado e feito no `sdd-plan` em 2026-10-02.

### Checklist de Release

- [x] Fase 2 (confirmação de conexão) concluída
- [x] Fase 3 (US1) concluída — incluindo T011 com aprovação do usuário
- [x] Fase 4 (US2) concluída
- [x] Fase 5 (US3) concluída
- [x] Fase 6 (US4) concluída
- [x] Fase 7 (US5) concluída
- [x] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 045-ime-formularios-tv` íntegro; as travas de **outras** features íntegras (a 037 só re-travada com aprovação)
- [x] `npx tsc -b` e `npm run lint` (0 erros; 45 avisos é a linha de base) limpos; `npx vitest run` (flakes de paralelismo conhecidos repetidos isolados)
- [x] `npm run test:e2e` verde (dev server reiniciado), incluindo `e2e/ime-formularios.mjs`
- [x] `npm run build` ok; `npm run build:tizen` só no converge (o artefato `CCPlayTv/assets/index.js` já tem modificação local — checar antes)
- [x] Revisão de segredos feita
- [x] `quickstart.md` executado (parte automatizada); passada na TV **adiada por decisão explícita do usuário em 2026-10-02**, com o risco em `plan.md` (R-012)

---

## Dependencies & Execution Order

- **Fase 1** (sonda): independente; T002 pode ser adiada.
- **Fase 2** (lib): bloqueia a Fase 3. T003 (`imeKeys`) é usada pela Fase 4.
- **Fase 3 (US1)** → **Fase 4 (US2)** (mesma tela: o `useImeChain` entra depois da orquestração para não disputar o arquivo).
- **Fases 5, 6, 7** dependem de `TextField` estável: fazer **5 → 6** em sequência (mesmo arquivo `TextField.tsx`); a 7 depois de 4–6.
- **T011** depende de aprovação do usuário e **bloqueia o fechamento da Fase 3** (sem isso a trava da 037 fica vermelha).
- **Polish** depende de tudo.

### Parallel Opportunities

- T001 ∥ T003 ∥ T005 (arquivos diferentes). T008 ∥ T009. T018 ∥ T017.
- US3/US4 **não** em paralelo entre si (mesmo `TextField.tsx`).

## Implementation Strategy

### MVP First (US1)

1. Fase 2 → Fase 3 (aprovação do T011) → **PARAR E VALIDAR** com o painel falso e, se possível, a lista real.
2. Fase 4 (Done) → Fase 5 (cobertura) → Fase 6 (Mostrar) → Fase 7 (TMDB/EPG).
3. Passada na TV por último (ou adiada de forma explícita).

## Notes

- Nunca editar `*.ime-formularios.contract.test.*`; o contrato da 037 só com aprovação.
- `useRemoteNav` e `useTvKeyNav` **não mudam** nesta feature.
- Commitar por fase; o rodapé de commit segue a regra da sessão.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
