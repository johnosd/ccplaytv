---
description: "Tasks: Splash, ícone do app e Home de perfis/listas"
---

# Tasks: Splash, ícone do app e Home de perfis/listas

**Input**: `sdd/specs/002-splash-home-perfis/{spec.md,plan.md,research.md,quickstart.md}`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Organization**: Tasks agrupadas por user story (P1 → P1 → P2).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Frontend em `tv-web/` (único diretório tocado por código nesta feature).
- Asset do app Tizen em `CCPlayTv/icon.png` (fora de `tv-web/`, projeto
  scaffolded separado — mesmo padrão já usado pela feature 001).
- Sem mudança em `api/` nesta feature.

---

## Phase 1: Setup

**Purpose**: Confirmar que o toolchain existente segue funcionando — sem
dependência nova nesta feature.

- [x] T001 Confirmar toolchain verde antes de começar: `cd tv-web && npx tsc -b && npm run lint && npx vitest run && npm run build`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Peças compartilhadas pelas duas user stories P1 — sem elas,
nem US1 nem US2 podem fechar.

**⚠️ CRITICAL**: Bloqueia as Fases 3 e 4.

- [x] T002 [P] Criar `tv-web/src/lib/tizenExit.ts` — função `exitApp()` que chama `window.tizen.application.getCurrentApplication().exit()` só quando esse caminho existir (guard de ambiente); no-op silencioso fora da TV.
- [x] T003 [P] Adicionar classes `.confirm-dialog`, `.confirm-dialog-panel`, `.confirm-dialog-message`, `.confirm-dialog-actions`, `.confirm-dialog-button` em `tv-web/src/features/screens.css`, reaproveitando os tokens já definidos em `index.css` (`--surface`, `--accent`, etc.) e a classe `.tv-focus` já existente pro estado de foco.
- [x] T004 Criar `tv-web/src/components/ConfirmDialog.tsx` — props `message: string`, `confirmLabel: string`, `cancelLabel: string`, `onConfirm: () => void`, `onCancel: () => void`; usa `useRemoteNav` (`../lib/useRemoteNav`) para setas esquerda/direita alternarem entre os 2 botões, OK aciona a ação do botão focado, e Back chama sempre `onCancel` (nunca `onConfirm`) — modela a regra da constitution de RETURN fechar primeiro a camada aberta.

**Checkpoint**: `ConfirmDialog` e `tizenExit` prontos e testáveis isoladamente — US1 pode começar.

---

## Phase 3: User Story 1 - Primeira abertura, sem listas (Priority: P1) 🎯 MVP

**Objetivo**: com nenhuma lista cadastrada, a Home mostra o formulário de
adicionar lista diretamente, e o botão Voltar nesse estado pede confirmação
antes de sair do app.

**Independent Test**: banco sem nenhuma `Source`, abrir o app, confirmar
que a tela pós-Splash já é o formulário; pressionar Voltar abre o diálogo;
cancelar mantém o formulário; confirmar (em navegador) só fecha o diálogo
sem erro.

### Testes da Fase

- [x] T005 [P] [US1] Teste `tv-web/src/components/ConfirmDialog.test.tsx`: setas alternam foco entre os 2 botões; Enter no botão focado aciona a callback correta (`onConfirm`/`onCancel`); tecla Back sempre chama `onCancel`, independente de qual botão está focado.
- [x] T006 [P] [US1] Teste `tv-web/src/lib/tizenExit.test.ts`: com `window.tizen` mockado, `exitApp()` chama `getCurrentApplication().exit()`; com `window.tizen` `undefined`, `exitApp()` não lança erro.
- [x] T007 [P] [US1] Teste `tv-web/src/features/home/HomeScreen.test.tsx` (novo arquivo): mock de `useSources` retornando `{ data: { sources: [] }, isLoading: false, isError: false }` — renderiza o `AddSourceScreen` inline (campo "Nome de exibição" visível); simular tecla Back — o `ConfirmDialog` aparece; simular Back de novo com o diálogo já aberto — o diálogo fecha (não deve haver uma segunda instância nem erro).
- [x] T007a [Ad-hoc, descoberta durante T008] `useTvKeyNav`/`useRemoteNav` registravam um `document.addEventListener('keydown', ...)` cada, sem noção de sobreposição — com o `ConfirmDialog` aberto por cima do `AddSourceScreen` inline, as duas camadas reagiriam à mesma tecla ao mesmo tempo. Primeira tentativa (pilha de camadas) quebrou `AddSourceScreen`/`ImportProgressScreen` (usam os dois hooks juntos, competiam consigo mesmos) — revertida. Solução final: `useRemoteNav` ganhou opção `{ modal: true }` (fase de captura + `stopImmediatePropagation`), usada só por `ConfirmDialog`; os outros hooks voltaram ao comportamento original. Ver `plan.md` R-003.

### Implementation

- [x] T008 [US1] Remodelar `tv-web/src/features/home/HomeScreen.tsx`: destructure `isLoading`/`isError` de `useSources()`; adicionar estado local `showExitConfirm` (`useState`); estrutura de renderização em 4 ramos — carregando / erro / vazio (`sources.length === 0`, renderiza `<AddSourceScreen onSourceCreated={onSourceCreated} onBack={() => setShowExitConfirm(true)} />` + `<ConfirmDialog ... />` condicional por cima quando `showExitConfirm`) / cards (comportamento atual, sem mudança). Import de `AddSourceScreen`, `ConfirmDialog` e `exitApp` de `../../lib/tizenExit`.
- [x] T009 [US1] Ajustar `tv-web/src/App.tsx`: passar a prop nova `onSourceCreated={(result) => goto({ name: 'progress', jobId: result.jobId })}` pra `<HomeScreen>` (mesmo handler já usado pela tela `add-source` do roteador), e atualizar a interface `HomeScreenProps` em `HomeScreen.tsx` de acordo.

**Critério de Conclusão**: com o backend sem nenhuma `Source`, abrir o app
(Splash) cai direto no formulário; Back abre a confirmação de saída,
navegável só por controle; cancelar volta pro formulário sem perder o que
foi digitado; cadastrar a primeira lista leva à tela de Progresso e, ao
voltar, a Home já mostra o card criado.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `ConfirmDialog`, `tizenExit`, `HomeScreen` remodelada (4 ramos: loading/erro/vazio-inline/cards), `App.tsx` ajustado. Bug ad-hoc T007a corrigido (opção `{ modal: true }` em `useRemoteNav`, fase de captura + `stopImmediatePropagation`).
- Testes executados: `cd tv-web && npx tsc -b && npm run lint && npx vitest run` — 15/15 testes verdes (5 arquivos), tsc e oxlint limpos.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Abertura com listas já cadastradas (Priority: P1)

**Objetivo**: com 1+ listas cadastradas, a Home mostra os cards sem piscar
o formulário durante o carregamento, e trata erro de rede com um
indicativo visível.

**Independent Test**: banco com 1+ `Source`, abrir o app e confirmar que
não há nenhum instante em que o formulário aparece; simular falha de rede
na busca de fontes e confirmar que aparece uma mensagem de erro, não um
carregamento infinito nem os cards tratados como lista vazia.

### Testes da Fase

- [x] T010 [P] [US2] Teste em `tv-web/src/features/home/HomeScreen.test.tsx`: mock de `useSources` com `isLoading: true` renderiza indicador de carregamento (nem formulário, nem cards); mock com `isError: true` renderiza mensagem de erro; mock com `sources` não-vazio renderiza os cards das listas + o card fixo "Adicionar lista" (comportamento já existente, ganha cobertura de teste dedicada agora). Escrito junto com T007 na Fase 3 (mesmo arquivo).

### Implementation

A estrutura de 4 ramos entregue em T008 (Fase 3) já cobre os ramos de
carregamento/erro/cards exigidos por esta story — nenhuma implementação
nova aqui, só a validação/teste dedicados acima (mesmo padrão já usado na
feature 001, onde uma story seguinte reaproveitou trabalho entregue por uma
anterior).

**Critério de Conclusão**: com fontes já cadastradas, não há nenhum flash
de formulário entre o fim da Splash e os cards aparecerem; falha de rede
mostra indicativo de erro.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: cobertura de teste dedicada para os ramos loading/erro/cards de `HomeScreen` (já implementados na Fase 3) — sem código de produção novo, conforme previsto no plano.
- Testes executados: incluídos na mesma rodada da Fase 3 (`npx vitest run`, 15/15 verdes).
- Pendências: verificação end-to-end contra o backend real (sem mock) fica pro roteiro de `quickstart.md` na Fase 6 (Polish).

---

## Phase 5: User Story 3 - Ícone do app na TV (Priority: P2)

**Objetivo**: o ícone do CCPlayTv na tela de Apps da TV usa o mesmo
gradiente de marca + triângulo de play da tela de Splash.

**Independent Test**: reinstalar o `.wgt` na TV física e conferir
visualmente o ícone na tela de Apps (não é testável automaticamente — é
asset estático).

### Implementation

- [x] T011 [US3] Escrever e rodar um script PowerShell one-off (`System.Drawing`/GDI+, ver `research.md`) que gera um novo `CCPlayTv/icon.png` (117×117, mesmas proporções do ícone atual) com o gradiente diagonal `#FF2E87 → #FF7A3D 40% → #FFC93D 70% → #1E9AB0 100%` e um triângulo de play, cantos arredondados — substitui o arquivo existente no lugar (`config.xml` já referencia `icon.png`, sem mudança de path necessária). Gerado, dimensões confirmadas (117×117) e inspecionado visualmente.

### Testes da Fase

- Nenhum automatizado — asset estático. Verificação é manual (ver
  `quickstart.md`, seção "Ícone do app").

**Critério de Conclusão**: `CCPlayTv/icon.png` substituído; validado
visualmente após reinstalação na TV física.

**Checkpoint**: User Story 3 concluída.

**Registro da Fase**:

- Status: Concluída (falta validação visual na TV física, ver Fase 6/T013).
- Feito: `CCPlayTv/icon.png` substituído (script GDI+ one-off, não versionado — só o PNG resultante); inspecionado visualmente via Read (gradiente + triângulo corretos, 117×117).
- Testes executados: N/A (asset estático).
- Pendências: confirmação na tela de Apps da TV física após reinstalação (T013).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: fechar a feature com as checagens de toda a stack e o roteiro
manual completo.

- [x] T012 Rodar `cd tv-web && npx tsc -b && npm run lint && npx vitest run && npm run build` — tudo verde. (15/15 testes, tsc/oxlint/build limpos.)
- [ ] T013 Executar o roteiro completo de `quickstart.md` (US1 e US2 em navegador; US3 na TV física via `npm run build:tizen` + `tz pack` + Apps2Samsung, mesmo pipeline da feature 001).
- [x] T013 Executar o roteiro completo de `quickstart.md` (US1 e US2 em navegador; US3 na TV física via `npm run build:tizen` + `tz pack` + Apps2Samsung, mesmo pipeline da feature 001).

### Checklist de Release

- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída — validada na TV física
- [ ] Frontend disponível e validado (`npx vitest run` verde)
- [ ] `quickstart.md` executado com sucesso
- [ ] Nenhuma credencial exposta nos cards da Home (reconfirmação — sem mudança de contrato de `SourceOut`)
- [ ] Toda ação desta feature (incluindo o novo diálogo de confirmação) alcançável só por controle remoto
- [x] Fase 3 (User Story 1) concluída
- [x] Fase 4 (User Story 2) concluída
- [x] Fase 5 (User Story 3) concluída — validada na TV física
- [x] Frontend disponível e validado (`npx vitest run` verde)
- [x] `quickstart.md` executado com sucesso
- [x] Nenhuma credencial exposta nos cards da Home (reconfirmação — sem mudança de contrato de `SourceOut`)
- [x] Toda ação desta feature (incluindo o novo diálogo de confirmação) alcançável só por controle remoto

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup — bloqueia as Fases 3 e 4.
- **User Story 1 (Fase 3)**: depende do Foundational. Entrega a estrutura de 4 ramos da `HomeScreen` usada também pela Fase 4.
- **User Story 2 (Fase 4)**: depende da Fase 3 (reaproveita a implementação de T008) — só adiciona teste dedicado.
- **User Story 3 (Fase 5)**: independente das Fases 3/4 — pode rodar em paralelo com elas (asset estático, sem tocar `HomeScreen`).
- **Polish (Fase 6)**: depende de todas as stories desejadas estarem completas.

### Parallel Opportunities

- T002/T003/T004 (Fase 2) tocam arquivos diferentes — paralelizáveis.
- T005/T006/T007 (Fase 3) tocam arquivos de teste diferentes — paralelizáveis.
- Fase 5 (ícone) pode rodar em paralelo com as Fases 3-4 (nenhum arquivo em comum).

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup.
2. Completar Fase 2: Foundational.
3. Completar Fase 3: User Story 1.
4. **PARAR E VALIDAR**: testar US1 isoladamente (banco vazio).

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. US1 → testar isoladamente → já é o comportamento mais crítico (primeira
   abertura).
3. US2 → validar que nada regrediu pra quem já tem listas.
4. US3 → ícone, pode ser feito a qualquer momento em paralelo.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar após cada fase fechada.
- A Fase 4 é deliberadamente "leve" — sua implementação já sai pronta da
  Fase 3, só falta o teste dedicado e a validação da Independent Test.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
