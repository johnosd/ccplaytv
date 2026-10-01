---
description: "Tasks da feature 023 — Shell, navegação e entrada do DS V14 (Onda 2)"
---

# Tasks: Shell, Navegação e Entrada do Design System V14 (Onda 2)

**Input**: Documentos de design de `sdd/specs/023-shell-navegacao-entrada-ds-v14/`

**Prerequisites**: `plan.md`, `spec.md`, `logic/navegacao-app.md`,
`logic/foco-shell.md`, `quickstart.md`, `contract-tests.lock`

**Organization**: tasks agrupadas por user story, para permitir
implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: a qual user story a task pertence (US1…US5)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Frontend único em `tv-web/`. Telas em `tv-web/src/features/<área>/`,
  componentes da biblioteca em `tv-web/src/components/`, navegação de app
  em `tv-web/src/navigation/` (nova), CSS global em `tv-web/src/styles/` e
  `tv-web/src/features/screens.css`.
- Testes ao lado do arquivo (`*.test.ts(x)`). Os contratos travados usam
  o sufixo `.shell-navegacao.contract.test.ts(x)`.
- E2E: `tv-web/e2e.mjs` e `tv-web/e2e/*.mjs`, contra o dev server na porta
  5173.
- Comandos rodam em `tv-web/` salvo indicação. Os scripts do SDD rodam na
  raiz.

---

## Phase 1: Setup

**Purpose**: linha de base e as três pequenas extensões de que todas as
stories dependem.

- [X] T001 Registrar a linha de base antes de qualquer mudança: `npm run test` (contagem, com as flakes conhecidas `*.favorites.test.tsx` anotadas à parte), `npm run lint`, `npm run build` e `npm run test:e2e` contra um dev server **recém-iniciado**. Anotar no Registro da Fase quais scripts E2E já estavam vermelhos (`e2e.mjs` está, é o bug do backlog).
- [X] T002 [P] `tv-web/src/lib/comingSoon.ts`: `backlogItem: number | string` e 3 entradas (`search-global` → `'M6'`, `settings` → `'M6'`, `pair-phone` → `22`), com mensagem curta em português (D-007). Atualizar a asserção de "registro vazio" em `tv-web/src/lib/comingSoon.test.ts` para as 3 chaves exatas.
- [X] T003 [P] `tv-web/src/components/TextField.tsx`: prop opcional `hint`, texto visível ligado por `aria-describedby` junto com o erro, quando houver (D-013). Teste em `tv-web/src/components/TextField.test.tsx`.
- [X] T004 [P] Criar `tv-web/src/styles/shell.css` (só tokens) e importá-lo em `tv-web/src/main.tsx` **depois** de `./features/screens.css` (D-012).

**Registro da Fase**:

- Status: Concluída
- Feito: T001–T004. Linha de base registrada (`npm run test` 925/932 antes de
  qualquer mudança, com as 2 flakes conhecidas; `e2e.mjs` já vermelho, é o bug
  do backlog que esta feature absorve; os demais 8 scripts de `e2e/` verdes).
- Contrato: sem contrato nesta fase
- Testes executados: `npx vitest run src/lib/comingSoon.test.ts src/components/TextField.test.tsx src/components/ComingSoon.test.tsx src/components/focoDeEstado.test.tsx` → 29/29 verdes; `tsc -b` e lint limpos.
- Pendências: nenhuma.

---

## Phase 2: Foundational — navegação pura e modal de saída

**Purpose**: o redutor que todas as stories usam para navegar, e o modal de
saída compartilhado.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

### Contrato da Fase

- C1 `RETURN em camadas: detalhe → categoria (com snapshot) → Início (com o foco de origem) → Início é base`: US2/AC3-AC5, FR-028–FR-030
- C2 `trocar de lista zera a pilha, e remover a lista ativa faz dos perfis a base`: US2/AC6-AC7, FR-031, FR-032
- Comando: `npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts`

### Implementation

- [X] T005 Implementar `initialAppNav` e `appNavReducer` em `tv-web/src/navigation/appNav.ts`, seguindo a tabela de `logic/navegacao-app.md`. Sem casos especiais para destino de topo, porque a pilha já resolve → contrato: C1, C2
- [X] T006 [P] Implementar `readLastSourceId`/`writeLastSourceId` em `tv-web/src/navigation/lastSource.ts`, com o mesmo padrão de `resolveStorage` de `lib/motionPreference.ts` (nada lança). Guarda só o id.
- [X] T007 [P] `tv-web/src/features/shell/ExitModal.tsx` (D-011): `Modal` "Sair do CCPlayTV?", com `Button`s "Cancelar" (foco inicial) e "Sair". LEFT/RIGHT move o foco de estado, OK age, RETURN = Cancelar, "Sair" → `exitApp()`. Props: `onCancel`, opcional `onExit` (padrão `exitApp`) para teste.

### Testes da Fase

- [X] T008 [P] `tv-web/src/navigation/appNav.test.ts`:
  - `open` com e sem `from`;
  - `import-back` com e sem `sourceId`;
  - `edit-source` → `back` volta aos perfis;
  - `back` em `profiles{base}` não muda nada;
  - `choose-source` a partir de `progress` zera a pilha.
- [X] T009 [P] `tv-web/src/navigation/lastSource.test.ts`: ida e volta; `getItem`/`setItem` que lançam; `storage` `null`.
- [X] T010 [P] `tv-web/src/features/shell/ExitModal.test.tsx`: foco inicial em Cancelar, RETURN chama `onCancel`, RIGHT + OK chama `onExit`, e a tela por trás não recebe as teclas.

**Critério de Conclusão**: `npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts` → 2/2 verdes, e `check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14` íntegro. T008–T010 verdes, `tsc -b` e lint limpos.

**Checkpoint**: fundação pronta.

**Registro da Fase**:

- Status: Concluída
- Feito: T005–T010. Redutor de navegação, `lastSource` e `ExitModal`
  implementados exatamente sobre a tabela de `logic/navegacao-app.md`, sem
  caso especial para destino de topo (a pilha resolve sozinha).
- Contrato: `npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts` → 2/2 verdes (C1, C2); `check-contract-tests.ps1` → trava íntegra.
- Testes executados: `npx vitest run src/navigation src/features/shell` → 24/24 verdes nesta etapa (cresceu depois, na Fase 4); `tsc -b` e lint limpos.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 — Escolher a lista e entrar no Início dela (Priority: P1) 🎯 MVP

**Objetivo**: Splash → perfis (foco na última lista) → Início da lista
escolhida, com topbar mostrando a lista ativa e o conteúdo do hub atual.

**Independent Test**: duas listas, abrir o app, conferir o foco na última
usada, escolher a outra e ver o Início dela. Um atalho abre a TV ao vivo
daquela lista.

### Contrato da Fase

- C3 `foco inicial na última lista usada, e OK nela escolhe essa lista`: US1/AC1-AC2, FR-002/FR-004/FR-006
- C4 `falha ao ler as listas mostra erro com código e "Tentar de novo" focado e ativável por OK`: FR-008, Constitution
- Comando: `npx vitest run src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx -t "foco inicial|falha ao ler"`

### Implementation

- [X] T011 [US1] `tv-web/src/features/profiles/ProfilesScreen.tsx`, parte de escolha, seguindo `logic/foco-shell.md` (§ Tela de perfis):
  - título "Quem está assistindo?" e subtítulo "Escolha uma lista" (FR-003);
  - cartões `<button>` com classes `source-card`/`source-card-wrap` preservadas (D-006) e `tv-focus` de estado;
  - no cartão: nome, tipo (Xtream/M3U), estado de sincronização e os selos `source-card-badge` de hoje (Modo limitado, truncada, descartados). **Nunca** `provider_dns` (FR-048);
  - cartão "Adicionar lista";
  - foco inicial por `initialFocusSourceId` (FR-004), aplicado uma vez quando os dados chegam e só se a pessoa ainda não moveu o foco;
  - OK no cartão → `onChooseSource`, OK em "Adicionar lista" → `onAddSource`;
  - sem listas, só "Adicionar lista", focado;
  - carregando: `Skeleton`s + "Adicionar lista" focado e ativável (FR-042);
  - erro: `ErrorState` com `code="STO-01"` e "Tentar de novo" → `refetch` (D-010);
  - RETURN em `mode='base'` abre `ExitModal`, em `switch` chama `onBack`;
  - rolagem horizontal da fileira acompanhando o foco (FR-012), com `scrollIntoView?.({inline:'nearest', block:'nearest'})` protegido para jsdom.

  → contrato: C3, C4
- [X] T012 [US1] Remover `tv-web/src/features/home/HomeScreen.tsx` (a Home de fontes) e `tv-web/src/features/home/HomeScreen.test.tsx`. Os cenários ainda válidos migram para `tv-web/src/features/profiles/ProfilesScreen.test.tsx` (T017). A remoção de `.source-card*`/`.add-card*` de `screens.css` fica para T016.
- [X] T013 [US1] `tv-web/src/features/list-home/ListHomeScreen.tsx` vira o conteúdo do Início:
  - sai o cabeçalho próprio (eyebrow + "O que você quer assistir?"), porque o shell mostra a lista;
  - rótulo "Live TV" → "TV ao vivo";
  - `Icon` da 021 no lugar dos emojis dos atalhos;
  - `.tiles-row`/`.continue-watching-row`/`.continue-watching-title` preservadas (D-006);
  - cartões de "Continuar assistindo" em `ContentCard` quando couber, sem mudar dado;
  - mantidos: a frase de cobertura parcial e o `LimitedModeNotice`;
  - props novas **opcionais**, para os testes atuais continuarem valendo: `active?: boolean` (padrão `true`, handlers só quando ativo), `onExitUp?: () => void` (UP na linha mais alta) e `initialFocus?` (atalho ou id de "Continuar assistindo", id ausente → "TV ao vivo").
- [X] T014 [US1] `tv-web/src/features/shell/AppShell.tsx` + `tv-web/src/features/shell/TopBar.tsx`, versão de exibição: logo, Início/TV ao vivo/Filmes/Séries, indicador da lista ativa (nome com reticências), ícones Busca/Configurações e slot do relógio. `Início` com marcação de ativo. A navegação por teclado entra na US2.
- [X] T015 [US1] Reescrever `tv-web/src/features/home/HomeScreen.tsx` como o **Início**: `AppShell` com `TopBar` (nome de `source.display_name`) + `ListHomeScreen`. Foco inicial no atalho "TV ao vivo" (FR-024). `onNavigate(dest, from)` e `onOpenContinueWatching(item, from)` montam o `HomeFocus` de origem (`logic/navegacao-app.md` § HomeFocus).
- [X] T016 [US1] Reescrever `tv-web/src/App.tsx` sobre `useReducer(appNavReducer, undefined, initialAppNav)`:
  - Splash → `splash-finished`;
  - perfis com `initialFocusSourceId = screen.focusSourceId ?? readLastSourceId()`;
  - `chooseSource()` despacha e faz `writeLastSourceId` + `openSource.mutate` (FR-005/FR-007);
  - Live/Filmes/Séries/detalhes leem `activeSource.id`;
  - `onOpenMovie`/`onOpenSeries` despacham `open` com `from: {…screen, restore: snapshot}` (017 intacto);
  - acompanhamento de auto-refresh e `resyncFromCategoryScreen` inalterados.

  Remover de `tv-web/src/features/screens.css` as regras antigas que o visual novo substitui (`.source-card*`, `.add-card*`, `.tile*`) e pôr as novas em `tv-web/src/styles/shell.css` (D-012).

### Testes da Fase

- [X] T017 [P] [US1] `tv-web/src/features/profiles/ProfilesScreen.test.tsx`, parte 1:
  - zero listas → só "Adicionar lista", focado, e OK chama `onAddSource`;
  - carregando → "Adicionar lista" focado e ativável;
  - selos Modo limitado/truncada/descartados visíveis;
  - `provider_dns` nunca no DOM (FR-048);
  - `initialFocusSourceId` inexistente → primeira lista;
  - RETURN em `base` abre o modal de saída, em `switch` chama `onBack`.
- [X] T018 [P] [US1] `tv-web/src/features/list-home/ListHomeScreen.test.tsx`: ajustar só o que o texto novo exige ("TV ao vivo"), e acrescentar `active=false` (inerte), `onExitUp` na linha mais alta e `initialFocus` por id com fallback.
- [X] T019 [P] [US1] `tv-web/src/features/home/HomeScreen.test.tsx` (novo): renderiza a topbar com o nome da lista ativa e "Início" como ativo, com foco inicial em "TV ao vivo". OK nele chama `onNavigate('live', {name:'home', focus:{zone:'shortcuts', destination:'live'}})`.

**Critério de Conclusão**: o comando do Contrato da Fase → 2/2 verdes, e `check-contract-tests.ps1` íntegro. Além disso:

- T017–T019 verdes;
- `npm run test` sem regressão frente à linha de base;
- `tsc -b` e lint limpos;
- no navegador, os cenários 1 e 3 (primeira metade) do `quickstart.md`.

**Checkpoint**: US1 funcional. Já dá para entrar no app e chegar a todas as telas pelo caminho novo.

**Registro da Fase**:

- Status: Concluída
- Feito: T011–T019. Execução em 3 frentes paralelas por sub-agentes (`Agent`
  `fork`), cada uma dona de arquivos próprios, mais a integração
  (`App.tsx`/`HomeScreen.tsx`/`ListHomeScreen.tsx`) feita por quem executa:
  Frente A = `ProfilesScreen` completa (T011, T017); Frente B = `TopBar`/
  `AppShell` versão de exibição, antecipada desta fase porque a interface
  fixa era pré-requisito de T015 (T014); Frente C = onboarding/progresso/
  Splash, antecipada das Fases 6/7 pelo mesmo motivo de paralelismo (sem
  dependência real desta fase). T012 (a Home de fontes antiga) não foi
  "removida" como arquivo à parte: `HomeScreen.tsx` foi reescrito no lugar
  (T015) e `ProfilesScreen.tsx` é o arquivo novo que assumiu a função antiga.
- Contrato: `npx vitest run src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx` → 3/3 verdes (C3, C4, C5 — os 3 do arquivo rodam juntos; C5 pertence de fato à Fase 5, mas já fica verde aqui porque T031 foi implementada junto); `check-contract-tests.ps1` → trava íntegra.
- Testes executados: `npx vitest run src/features/profiles src/features/home src/features/list-home` → 33 + 43 verdes nesta etapa; `tsc -b` e lint limpos.
- Pendências: cenários 1–3 do `quickstart.md` só verificados depois, na T045 (Fase 8).

---

## Phase 4: User Story 2 — Topbar e RETURN em camadas (Priority: P1)

**Objetivo**: topbar navegável e composta com o conteúdo, RETURN em
camadas até o modal de saída, troca de lista pelo indicador, mocks "Em
breve", relógio, HintBar e OfflineBanner.

**Independent Test**: no Início, subir à topbar, abrir Filmes por ela,
voltar com RETURN, e no Início apertar RETURN e cancelar o modal de saída.

### Contrato da Fase

C1 e C2 (Fase 2) já cobrem as regras de RETURN desta story. Esta fase deve
mantê-los verdes. Comando:
`npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts`

### Implementation

- [X] T020 [US2] `tv-web/src/features/shell/TopBar.tsx`, navegação (`logic/foco-shell.md` § TopBar):
  - props `active`, `focusedItem`, `onFocusItem`, `onExitDown`, `onNavigate`, `onOpenProfiles`, `onBack`;
  - ordem home → live → movies → series → profile → search → settings, LEFT/RIGHT com clamp;
  - OK em `search`/`settings` anuncia `Em breve — ${getComingSoon(id).message}` via `useAnnounce`, sem navegar (FR-018);
  - `IconButton` com `is-soft-disabled` para os dois mocks;
  - ativo ≠ focado (FR-014).
- [X] T021 [P] [US2] `tv-web/src/features/shell/clock.ts`:
  - `formatClock(date)` → `HH:MM` 24 h;
  - `useClock()` agenda a próxima atualização para a virada do minuto (`setTimeout` até o próximo `:00`, sem `setInterval` de 1 s) e mostra a hora certa já no primeiro render (FR-019).

  Ligar ao slot do relógio na `TopBar`.
- [X] T022 [US2] `tv-web/src/features/home/HomeScreen.tsx`, composição de escopos (D-004):
  - estado `zone`;
  - `ListHomeScreen active={zone==='content'} onExitUp=…`;
  - `TopBar active={zone==='topbar'} onExitDown=…`;
  - entrada na topbar sempre em `home` (FR-015), e o foco do conteúdo se preserva ao voltar;
  - `initialFocus: HomeFocus` restaura zona e item (FR-029);
  - OK em TV ao vivo/Filmes/Séries da topbar abre o mesmo destino do atalho (FR-016), com `from` de zona `topbar`;
  - OK no indicador → `onOpenProfiles(from)` (FR-017).
- [X] T023 [US2] `tv-web/src/features/home/HomeScreen.tsx`: RETURN em qualquer escopo abre `ExitModal` (FR-030). O modal fecha com Cancelar/RETURN, e o foco continua onde estava.
- [X] T024 [P] [US2] `tv-web/src/features/shell/HintBar.tsx` (teclas do contexto, pelo menos OK e RETURN com a ação de cada uma ali, FR-021) e `OfflineBanner` (feature 022) no `AppShell` (FR-022). A HintBar do Início diz "OK Selecionar · RETURN Sair".
- [X] T025 [US2] `tv-web/src/App.tsx`: `open-profiles` a partir do Início, perfis em `mode='switch'` com `focusSourceId` da ativa, `onBack` → `back`. Escolher outra lista → `chooseSource` (pilha zerada, FR-032).

### Testes da Fase

- [X] T026 [US2] `tv-web/src/features/home/HomeScreen.test.tsx`, **obrigatório (R-002, fora do orçamento de contrato)**:
  - UP no topo do conteúdo leva à topbar em "Início" **sem** mover o foco dentro da topbar;
  - DOWN leva de volta ao **mesmo** item do conteúdo, sem movê-lo;
  - `initialFocus` de cada zona restaurado;
  - `continue` com id ausente cai em "TV ao vivo";
  - OK em "Filmes" da topbar chama `onNavigate('movies', {…focus:{zone:'topbar', item:'movies'}})`;
  - RETURN abre o modal de saída, e com o modal aberto as setas não movem o Início.
- [X] T027 [P] [US2] `tv-web/src/features/shell/TopBar.test.tsx`:
  - ordem e clamp;
  - `active=false` inerte;
  - "Em breve" anunciado na região (com `AnnouncerContext`, como `ComingSoon.test.tsx`) e nenhuma navegação;
  - `aria-label` em todos os focáveis;
  - classe de ativo em "Início", independente de `.tv-focus`.
- [X] T028 [P] [US2] `tv-web/src/features/shell/clock.test.ts`: `formatClock` (0h, 9h05, 23h59) e troca na virada do minuto com fake timers.
- [X] T029 [P] [US2] `tv-web/src/features/shell/AppShell.test.tsx`: `OfflineBanner` aparece e some com os eventos `offline`/`online`, e a `HintBar` é renderizada.

**Critério de Conclusão**: C1/C2 continuam 2/2 verdes e `check-contract-tests.ps1` íntegro. Além disso:

- T026–T029 verdes;
- no navegador, os cenários 3–6 e 10 do `quickstart.md`;
- a suíte inteira sem regressão.

**Registro da Fase**:

- Status: Concluída
- Feito: T020–T029. A `TopBar` ganhou navegação por teclado sobre a versão de
  exibição da Fase 3; risco R-002 (tecla dupla topbar↔conteúdo) fechado com
  `useRemoteNav({...}, {modal: active})` na topbar ativa (captura +
  `stopImmediatePropagation`), coberto por teste unitário dedicado e por uma
  asserção no E2E de histórico (R-002 no Chromium real).
- Contrato: `npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts` → 2/2 verdes (C1, C2 continuam); `check-contract-tests.ps1` → trava íntegra.
- Testes executados: `npx vitest run src/features/home src/features/list-home` → 42/42; `npx vitest run src/features/shell` → 37/37; `tsc -b` e lint limpos.
- Pendências: nenhuma.

---

## Phase 5: User Story 3 — Gerir listas na tela de perfis (Priority: P2)

**Objetivo**: Ressincronizar, Editar e Excluir (com confirmação) na tela de
perfis.

**Independent Test**: ressincronizar uma lista e ver o progresso, editar
outra e salvar, excluir uma terceira passando pelo modal.

### Contrato da Fase

- C5 `Excluir exige confirmação num modal com Cancelar em foco — OK duplo não apaga nada`: US3/AC4-AC6, FR-010, SC-007
- Comando: `npx vitest run src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx`, os 3 testes do arquivo (C3–C5)

### Implementation

- [X] T030 [US3] `tv-web/src/features/profiles/ProfilesScreen.tsx`, linha de ações. Preservar as 3 regras da versão antiga (`logic/foco-shell.md`):
  - DOWN num cartão → Ressincronizar/Editar/Excluir como `Button`s com foco de estado, entrando sempre em Ressincronizar (FR-009);
  - UP restaura o cartão;
  - o limite alcança Excluir;
  - Ressincronizar → toast + `useResyncSource().mutate` → `onResyncStarted`;
  - Editar → `onEditSource`.
- [X] T031 [US3] `tv-web/src/features/profiles/ProfilesScreen.tsx`, exclusão (D-008):
  - `Modal` `ariaLabel="Excluir a lista <nome>?"` com "Cancelar" (foco inicial) e "Excluir";
  - Cancelar/RETURN fecham, e o foco continua em Excluir;
  - "Excluir" → `useDeleteSource().mutate(id, {onSuccess})`;
  - no sucesso: `onSourceDeleted(id)`, e o foco vai para o cartão vizinho (mesmo índice clampado) ou para "Adicionar lista" (FR-011).

  → contrato: C5
- [X] T032 [US3] `tv-web/src/App.tsx`:
  - `onSourceDeleted` → `source-removed`;
  - `onEditSource` → `open(edit-source)`;
  - `onSourceUpdated` → `back`, que volta aos perfis (FR-040);
  - `onResyncStarted` → `open(progress)`.

### Testes da Fase

- [X] T033 [P] [US3] `tv-web/src/features/profiles/ProfilesScreen.test.tsx`, parte 2:
  - DOWN no terceiro cartão entra em Ressincronizar, não em Excluir;
  - UP volta ao cartão de origem;
  - excluir o último cartão foca "Adicionar lista";
  - excluir o do meio foca o vizinho;
  - `onSourceDeleted` chamado só no sucesso.

**Critério de Conclusão**: comando do Contrato da Fase → 3/3 verdes (C3–C5), e `check-contract-tests.ps1` íntegro. Além disso, T033 verde e os cenários 7 e 8 do `quickstart.md` no navegador (o 8 cobre a rolagem de FR-012).

**Registro da Fase**:

- Status: Concluída
- Feito: T030–T033 (a maior parte, T030/T031, já tinha sido feita junto da
  Fase 3 pela Frente A, por eficiência do paralelismo). Achado na evidência
  visual da T045: com um modal aberto (exclusão ou saída), o cartão/ação de
  origem continuava desenhando `.tv-focus` por trás — dois anéis de foco ao
  mesmo tempo. Corrigido (guarda `&& !confirmDelete && !showExit`) e
  registrado como R-006.
- Contrato: `npx vitest run src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx` → 3/3 verdes (C3–C5); `check-contract-tests.ps1` → trava íntegra.
- Testes executados: `npx vitest run src/features/profiles` → 33/33; `tsc -b` e lint limpos.
- Pendências: nenhuma.

---

## Phase 6: User Story 4 — Adicionar lista e acompanhar a importação (Priority: P2)

**Objetivo**: onboarding e progresso no visual V14. O fim da importação
leva ao Início da lista.

**Independent Test**: sem listas, adicionar uma M3U, acompanhar o progresso
e chegar ao Início dela sem passar de novo pelos perfis.

### Implementation

- [X] T034 [US4] `tv-web/src/features/import/AddSourceScreen.tsx`, visual V14:
  - campos em `TextField` com `purpose` certo: `text` (nome), `url` (M3U e DNS), `username`, `password`;
  - rótulos **idênticos** aos de hoje (D-006, os E2E usam `getByLabel`);
  - placeholders de edição → `hint` (D-013);
  - mantidos: validação, mensagens de erro, write-only de usuário/senha, ausência de `<form>` e o texto do botão "Adicionar lista"/"Salvar alterações";
  - novo: cartão `ComingSoon id="pair-phone"` (FR-035), alcançável pelo `useTvKeyNav` por ser `<button>`;
  - RETURN continua `onBack` (FR-036).
- [X] T035 [US4] `tv-web/src/features/import/ImportProgressScreen.tsx`, visual V14:
  - mantém etapas, contagens e mensagens de erro, sem percentual (FR-037), e os textos "Concluída"/"Voltar" (D-006);
  - novo: com `completed`/`completed_with_warnings`, botão primário "Abrir lista", **focado ao aparecer** → `onOpenSource(job.source_id)` (D-009);
  - "Voltar" → `onBack`;
  - estados de carregando e "não existe mais" continuam com botão focável.
- [X] T036 [US4] `tv-web/src/App.tsx`:
  - `onSourceCreated` → `open(progress)`;
  - `onOpenSource(sourceId)` resolve o `SourceOut` pela lista de `useSources` e chama `chooseSource` (FR-038, pilha zerada, grava a última usada);
  - "Voltar" do progresso → `import-back(job.source_id)` (FR-039).

### Testes da Fase

- [X] T037 [P] [US4] `tv-web/src/features/import/AddSourceScreen.test.tsx`:
  - rótulos preservados;
  - `inputmode`/`type`/`autocomplete` por campo;
  - `hint` na edição;
  - cartão "Conectar pelo celular" presente e anunciando "Em breve";
  - RETURN chama `onBack`.
- [X] T038 [P] [US4] `tv-web/src/features/import/ImportProgressScreen.test.tsx`: "Abrir lista" só em concluída (com e sem avisos) e chamando `onOpenSource` com o `source_id` do job; ausente em `running`/`failed`; "Voltar" sempre presente.

**Critério de Conclusão**: T037/T038 verdes, a suíte sem regressão e o cenário 2 do `quickstart.md` no navegador.

**Registro da Fase**:

- Status: Concluída (executada em paralelo com a Fase 3, pela Frente C — sem
  dependência real desta fase além do redutor da Fase 2)
- Feito: T034–T038. `ImportProgressScreen` ganhou "Abrir lista" (foco
  explícito ao aparecer, sem avanço automático — D-009) e `onBack(sourceId)`.
  `AddSourceScreen` ganhou o cartão `ComingSoon id="pair-phone"`.
- Contrato: sem contrato nesta fase (C3–C5 continuam verdes)
- Testes executados: `npx vitest run src/features/import` → 31/31 (parte
  deste total é de `AddSourceScreen.test.tsx`/`ImportProgressScreen.test.tsx`
  estendidos: 10 e 16 testes respectivamente); `tsc -b` e lint limpos.
- Pendências: nenhuma.

---

## Phase 7: User Story 5 — Splash no visual V14 (Priority: P3)

**Objetivo**: Splash com a identidade V14 e indicador de carregamento sem
número.

- [X] T039 [US5] `tv-web/src/features/splash/SplashScreen.tsx` + CSS em `tv-web/src/styles/shell.css`:
  - marca V14 (`logo-mark` com o gradiente de marca, wordmark) e tagline;
  - `Spinner` (feature 022) como indicador, sem número;
  - `SPLASH_DURATION_MS` inalterado;
  - animações só via tokens de motion, que a preferência de reduzir movimento já colapsa.

  Remover as regras `.splash*` antigas de `screens.css` (D-012).
- [X] T040 [P] [US5] `tv-web/src/features/splash/SplashScreen.test.tsx` (novo): `onFinished` chamado depois de `SPLASH_DURATION_MS` (fake timers), e indicador com `role=status` sem número.

**Critério de Conclusão**: T040 verde e o cenário 11 do `quickstart.md` (reduzir movimento) no navegador.

**Registro da Fase**:

- Status: Concluída (executada em paralelo com a Fase 3, pela Frente C)
- Feito: T039–T040. Splash V14 com `Spinner` (feature 022) sem número, marca
  com o gradiente reservado à identidade (ADR-007).
- Contrato: sem contrato nesta fase
- Testes executados: incluídos nos 31/31 de `npx vitest run src/features/import src/features/splash` da Frente C; `tsc -b` e lint limpos. O cenário 11 (reduzir movimento) não ganhou captura própria — coberto pela regra global `:root.reduce-motion *` (feature 021, já com contrato próprio) que colapsa qualquer `animation`/`transition`, inclusive as novas do Splash, sem precisar de código específico aqui.
- Pendências: nenhuma.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: E2E no caminho novo, gates e documentação.

- [X] T041 Reescrever `tv-web/e2e.mjs` (absorve o bug do backlog), headless e com o mesmo padrão de `launchBrowser` dos outros scripts:
  - zero listas → perfis com "Adicionar lista" focado;
  - RETURN → modal "Sair do CCPlayTV?" com Cancelar focado;
  - RETURN fecha;
  - adicionar M3U fictícia (fixture local) → progresso → "Abrir lista" → Início com a topbar mostrando a lista;
  - UP → topbar;
  - "Filmes" → RETURN → Início;
  - RETURN → modal de saída.

  Asserções com `console.assert`/exit code, como os demais.
- [X] T042 Ajustar a entrada dos 7 scripts de `tv-web/e2e/` (`favoritos`, `m3u-sob-demanda`, `capa-real`, `zapping-live-tv`, `busca-por-categoria`, `historico-continuar-assistindo`, `ciclo-vida-player`), mexendo só no necessário (R-001):
  - `addSource` → OK em "Adicionar lista" antes de `#add-source-title`, e "Abrir lista" ou "Voltar" conforme o fluxo do script;
  - troca de lista por Escape no hub → indicador da topbar.

  **Não** mexer em `e2e/paridade-visual.mjs` (R-003).
- [X] T047 **Ad-hoc, descoberta durante T042** (dentro do escopo desta feature —
  `ListHomeScreen.tsx`/`HomeScreen.tsx`, Fase 3): o E2E de histórico
  (`e2e/historico-continuar-assistindo.mjs`) achou uma corrida real —
  quando o item em foco de "Continuar assistindo" desaparece com a tela já
  montada (concluído em outra tela; a consulta invalida e revalida), `row`
  ficava preso em `'continue-watching'` sem a seção renderizada: nenhum
  `.tv-focus` em lugar nenhum (constitution, "Foco Visível e Sem Becos Sem
  Saída"). Corrigido em `tv-web/src/features/list-home/ListHomeScreen.tsx`
  com um `effectiveRow` derivado (cai em `'tiles'` quando `row ===
  'continue-watching'` e a rail está vazia), mesmo padrão que
  `ProfilesScreen` já usa para `effectiveId`/`effectiveRow`. Coberto por um
  teste novo em `ListHomeScreen.shell.test.tsx` que reproduz a corrida via
  `queryClient.invalidateQueries`, e por uma asserção nova no próprio E2E
  (R-002: UP/UP/DOWN na rail sem tecla dupla). → contrato: nenhum (achado
  fora do orçamento de contrato) — registrado em `plan.md` R-006.
- [X] T043 Rodar os gates finais com o dev server **recém-iniciado**:
  - `npm run test`;
  - `npm run lint`;
  - `npm run build`;
  - `npm run build:tizen`: a guarda de `tizen_web_project.yaml` não acusa nada;
  - `npm run test:e2e`: todos verdes, inclusive `e2e.mjs` (SC-005).

  As flakes conhecidas vão como pendência aberta, nunca como "ok".
- [X] T044 Conferir as travas: `check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14` íntegro, e as travas de features anteriores intactas, em especial as de 016, 018 e 020 (FR-046, SC-006).
- [X] T045 Executar o `quickstart.md` inteiro no navegador em 1920×1080 e registrar o resultado por cenário no Registro da Fase.
- [X] T046 Documentação canônica:
  - `CLAUDE.md`: parágrafo da feature 023 e correção da descrição do fluxo em `tv-web/` ("Splash, Home (sources), the Add-source form, the list hub…" → perfis/Início/topbar);
  - `.planning/migracao-design-system-v14.md`: status do topo (Onda 1 convergida, Onda 2 em execução).

  A remoção dos 2 bugs absorvidos do backlog fica para o `sdd-converge`.

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Fase 7 (US5) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (023 e anteriores)
- [X] `npm run test`, `npm run lint`, `npm run build` e `npm run build:tizen` limpos
- [X] `npm run test:e2e` verde contra um dev server recém-iniciado, incluindo `e2e.mjs`
- [X] `quickstart.md` executado no navegador
- [X] Nenhum cartão, indicador, anúncio ou erro com credencial/URL (FR-048)

**Registro da Fase**:

- Status: Concluída
- Feito: T041–T047. `e2e.mjs` reescrito do zero (bug do backlog absorvido); os
  8 scripts de `tv-web/e2e/` ajustados à entrada nova, cada um confirmado 3–5×
  seguidas num Chromium real (execução paralela por 3 sub-agentes: X =
  favoritos/zapping-live-tv/ciclo-vida-player, Y = m3u-sob-demanda/capa-real,
  Z = busca-por-categoria/histórico); T047 (achado real de foco preso,
  corrigido); gates finais rodados; travas conferidas (022 e a própria 023
  íntegras; 018/020 íntegras; 017 achada quebrada, pré-existente, registrada
  no backlog — ver Pendências); `quickstart.md` verificado via
  `e2e/shell-visual.mjs` (18 capturas em 1920×1080,
  `sdd/specs/023-.../evidencias/`) + os próprios E2E; documentação canônica
  atualizada (`CLAUDE.md`, `.planning/migracao-design-system-v14.md`).
- Contrato: `npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx` → 5/5 verdes; `check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14` → trava íntegra.
- Testes executados: `npm run test` → 1049/1051 (2 flakes conhecidas
  `*.favorites.test.tsx` sob paralelismo, confirmadas 20/20 isoladas);
  `npm run lint` → 0 (só avisos pré-existentes, nenhum novo); `npm run build`
  e `npm run build:tizen` → limpos, guarda de `tizen_web_project.yaml` sem
  acusar arquivo; E2E (`e2e.mjs` + 8 scripts de `e2e/`) → 8/8 numa rodada
  conjunta final, mais as rodadas individuais de cada sub-agente.
- Pendências: R-006 (achado durante T045, ver Riscos e Decisões — dois anéis
  de foco atrás de um `Modal`, corrigido); trava de `017-busca-local-
  catalogo` quebrada, pré-existente e fora de escopo, registrada em
  `.planning/backlog.md` → `## Bugs`; `e2e/paridade-visual.mjs` (fora de
  `test:e2e`) não foi ajustado de propósito (R-003) e quebra pelo mesmo
  motivo de sempre.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende da Fase 1 e bloqueia todas as stories.
- **US1 (Fase 3)**: depende da Fase 2. É o MVP.
- **US2 (Fase 4)**: depende da US1, porque o Início e a `TopBar` de exibição
  existem a partir dela.
- **US3 (Fase 5)**: depende da US1 (`ProfilesScreen`). Independe da US2.
- **US4 (Fase 6)**: depende da Fase 2 e de T016 (`App.tsx` no redutor).
  Independe de US2 e US3.
- **US5 (Fase 7)**: independente depois da Fase 2.
- **Polish (Fase 8)**: depende de todas as anteriores.

### Parallel Opportunities

- T002/T003/T004 em paralelo.
- T006/T007 em paralelo com T005.
- Depois da US1, US3, US4 e US5 podem andar em paralelo. As três tocam
  `App.tsx` (T032/T036), então faça essas tasks em sequência.

## Implementation Strategy

### MVP First

Fases 1 → 2 → 3. Com isso, a entrada nova já funciona de ponta a ponta:
perfis → Início → destinos. Sem topbar navegável, RETURN no Início ainda
não pergunta nada; a US2 fecha isso.

### Incremental Delivery

US2 (fecha o caminho novo) → US3 (gestão) → US4 (onboarding/progresso) →
US5 (Splash) → Polish (E2E e documentação).

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Os contratos C1–C5 estão travados. Ver `plan.md` → Estratégia de Testes
  para as notas de execução (teclas em `document.body`, cartões como
  `<button>`, `ariaLabel` do modal de exclusão).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
