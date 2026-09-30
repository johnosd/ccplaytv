---
description: "Tasks da feature 037 — entrada fiel ao protótipo"
---

# Tasks: Entrada fiel ao protótipo — tela de listas e cadastro de lista

**Input**: Documentos de design de `sdd/specs/037-entrada-listas-prototipo/`

**Prerequisites**: plan.md, spec.md, logic/avatar-da-lista.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend em `tv-web/src/` (telas em `features/<área>/`, estilos em `styles/`, tokens em `index.css`, hooks em `lib/`).
- E2E em `tv-web/e2e.mjs` e `tv-web/e2e/*.mjs`; helper novo em `tv-web/e2e/lib/`.
- Documentação da feature em `sdd/specs/037-entrada-listas-prototipo/`.
- Comandos de teste rodam a partir de `tv-web/`; scripts `.planning/scripts/powershell/*.ps1` a partir da raiz.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nada a instalar — conferir o ponto de partida.

- [X] T001 Conferir o estado da feature 034 em `tv-web/src/features/profiles/ProfilesScreen.tsx` e `tv-web/src/features/sources/sourceFormat.ts` (working tree e `git log`): se os chips de conta (`sourceAlertChips`) já estiverem lá, anotar em `plan.md` → Execution Notes que a linha `.source-card-notices` deve renderizá-los (R-001)
- [X] T002 Rodar os 5 contratos (comando abaixo, Fase 2) e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo` para confirmar 5 vermelhos e trava íntegra

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Peças pequenas que as duas telas usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `listAvatar — contrato da feature 037 › iniciais seguem as regras do nome e o par de cores é estável por id, dentro do intervalo, e não constante (FR-005)` — origem: FR-005, Edge Cases
- Comando: `npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts`

### Implementation

- [X] T003 [P] Implementar `listInitials` e `listAvatarVariant` em `tv-web/src/features/profiles/listAvatar.ts` seguindo `logic/avatar-da-lista.md` (code points via `Array.from`, FNV-1a 32 bits sobre o id, `% LIST_AVATAR_VARIANTS`) → contrato: `listAvatar › iniciais seguem as regras…`
- [X] T004 [P] Acrescentar os tokens `--list-avatar-0-from/to` … `--list-avatar-5-from/to` em `tv-web/src/index.css`, referenciando só `--brand-1..5` na tabela de `logic/avatar-da-lista.md` (D-003)
- [X] T005 [P] Acrescentar a opção aditiva `initialFocus?: () => HTMLElement | null` a `TvKeyNavOptions` em `tv-web/src/lib/useTvKeyNav.ts`: ao montar (nada focado dentro do contêiner), foca o retorno dela se for um focável do contêiner; senão, o primeiro focável como hoje (D-009)
- [X] T006 [P] Criar `tv-web/e2e/lib/entrada.mjs` com `cadastrarListaM3u(page, { nome, url })` e `cadastrarListaXtream(page, { nome, servidor, usuario, senha })`: a partir da tela de listas, abre "Adicionar lista" (clique em `.add-card`), escolhe o tipo pelo botão "Lista M3U"/"Xtream Codes", preenche "Nome da lista" + "URL M3U" (ou "Servidor"/"Usuário"/"Senha") e clica "Conectar e sincronizar" (D-011). Ainda sem uso — os scripts migram na Fase 4

### Testes da Fase

- [X] T007 [P] Casos extras de `listAvatar` (nome com várias espaços internos, emoji no início, id vazio → índice válido) em `tv-web/src/features/profiles/listAvatar.test.ts`
- [X] T008 [P] `initialFocus` em `tv-web/src/lib/useTvKeyNav.test.tsx`: foca o elemento devolvido; devolvendo `null` ou um elemento fora do contêiner, cai no primeiro focável; sem a opção, comportamento idêntico ao de hoje

**Critério de Conclusão**: `npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo` íntegro; `useTvKeyNav.test.tsx` e `listAvatar.test.ts` verdes; `npx tsc -b` limpo.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-09-30)
- Feito: `listInitials`/`listAvatarVariant` (FNV-1a sobre o id, code points via `Array.from`); 12 tokens `--list-avatar-0..5-from/to` em `index.css` só com `var(--brand-N)`; opção aditiva `initialFocus` em `useTvKeyNav` (só vale para um focável do contêiner, e só ao montar — re-render não rouba o foco); helper `e2e/lib/entrada.mjs` (`cadastrarListaM3u`/`cadastrarListaXtream`, abre o cadastro por `.add-card` só se `#add-source-title` ainda não estiver visível), ainda sem uso.
- Contrato: `npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo` → PASS, trava íntegra.
- Testes executados: `npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts src/features/profiles/listAvatar.test.ts src/lib/useTvKeyNav.test.tsx` → 16/16; consumidores do hook (`AddSourceScreen.test.tsx`, `ImportProgressScreen.test.tsx`, `EpgSettingsScreen.test.tsx`, `TmdbKeyScreen.test.tsx`) → 48/48 verdes, só os 2 contratos da Fase 4 vermelhos (esperado); `npx tsc -b` limpo; `npx oxlint` nos arquivos tocados limpo. Uma iteração.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Escolher uma lista na tela nova (Priority: P1) 🎯 MVP

**Objetivo**: A tela de listas fica igual ao `profiles()` do protótipo, sem perder nenhum comportamento de hoje.

**Independent Test**: Com duas listas, abrir o app, comparar com o protótipo, navegar e entrar na segunda lista (quickstart Cenário A).

### Contrato da Fase

- `ProfilesScreen — contrato da feature 037 › tela de listas no formato do protótipo: textos, cartão com iniciais + selo do tipo + avisos, sem data nem endereço, e "Adicionar lista" como botão` — origem: US1/AC1, US1/AC4, FR-003, FR-005–FR-007, FR-024
- `ProfilesScreen — contrato da feature 037 › foco inicial pedido em "Adicionar lista" vale mesmo com listas; ↓ leva a "Configurações", OK abre, ↑ devolve o foco` — origem: FR-008, FR-019
- Comando: `npx vitest run src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx`

### Implementation

- [X] T009 [US1] Reestruturar o JSX de `tv-web/src/features/profiles/ProfilesScreen.tsx` no formato do protótipo: `OnboardingBrand` centralizado, kicker, `<h1>` "Selecione ou Adicione" + `<br />` + "sua lista" (com espaço antes da quebra), subtítulo, fileira `.source-row` centralizada, rodapé, botão do canto — textos da tabela "Textos" do `plan.md` → contrato: `tela de listas no formato do protótipo…`
- [X] T010 [US1] Cartão de lista conforme D-004 em `tv-web/src/features/profiles/ProfilesScreen.tsx`: selo `formatType`, avatar `listInitials`/`listAvatarVariant` (`aria-hidden`), nome truncado, linha `.source-card-notices` com os `.source-card-badge` atuais (e os chips da 034, se T001 os achou); remover `formatStatus` do cartão → contrato: `tela de listas no formato do protótipo…`
- [X] T011 [US1] Cartão "Adicionar lista" conforme D-005 (`aria-label="Adicionar lista"`, círculo + ícone `add`, título, pílula "＋ Adicionar") em `tv-web/src/features/profiles/ProfilesScreen.tsx` → contrato: `tela de listas no formato do protótipo…`
- [X] T012 [US1] Trocar "Gerenciar listas" pelo botão `.profiles-settings-corner` com `Icon name="settings"` + "Configurações" (D-006), mantendo a linha `manage` do estado e toda a navegação atual, em `tv-web/src/features/profiles/ProfilesScreen.tsx` → contrato: `foco inicial pedido em "Adicionar lista"…`
- [X] T013 [US1] Honrar `initialFocusSourceId === ADD_LIST_FOCUS_ID` no cálculo de `initialId` (foco em "Adicionar lista" mesmo com listas) em `tv-web/src/features/profiles/ProfilesScreen.tsx` e remover o comentário "STUB do sdd-plan" → contrato: `foco inicial pedido em "Adicionar lista"…`
- [X] T014 [US1] Em `tv-web/src/App.tsx`, `onAddSource` da tela de listas passa a despachar `{ type: 'open', screen: { name: 'add-source' }, from: { ...screen, focusSourceId: ADD_LIST_FOCUS_ID } }` (D-007); o cadastro aberto por Configurações não muda
- [X] T015 [US1] Reescrever `tv-web/src/styles/profiles.css` para a tela nova, só com tokens: tela centralizada, kicker em caixa alta com `--accent`, título `--fs-display`/`--font-heading`, cartão vertical (selo no topo, avatar quadrado arredondado com gradiente `--list-avatar-N-*` e iniciais em `--bg-base`, nome), `.source-card-notices` compacta, `.add-card` como botão (tracejado `--accent-tint-border`, fundo transparente, círculo `--accent-tint`; em `.tv-focus` contorno contínuo `--accent` e círculo preenchido `--accent`/ícone `--accent-ink`), rodapé `--text-annotation`, `.profiles-settings-corner` absoluto no canto inferior direito da safe zone (`--safe-x`/`--safe-y`), esqueletos com as mesmas dimensões do cartão novo. Manter os nomes de classe de D-002
- [X] T016 [US1] Atualizar o comentário de cabeçalho de `ProfilesScreen.tsx` e de `styles/profiles.css` (título novo, feature 037, D-002)

### Testes da Fase

- [X] T017 [US1] Atualizar `tv-web/src/features/profiles/ProfilesScreen.test.tsx` para os textos novos (título, subtítulo, "Configurações" no lugar de "Gerenciar listas", sem "Nunca sincronizada"/"Sincronizada em" no cartão) preservando o comportamento que cada teste cobre (R-005); acrescentar: avisos "A lista não coube inteira"/"Entradas não reconhecidas…" na linha de avisos; nome longo truncado mantém o nome inteiro no nome acessível; `findUnnamedControls` vazio com listas, carregando e erro
- [X] T018 [US1] Teste de integração em `tv-web/src/App.test.tsx` (ou `tv-web/src/navigation/appNav.test.ts`, o que já cobrir a abertura do cadastro): abrir o cadastro pela tela de listas e voltar deixa o foco em "Adicionar lista" (FR-019)
- [X] T019 [US1] Atualizar `tv-web/e2e.mjs` para a tela nova (asserções de título e do cartão-botão; `.add-card.tv-focus` ao voltar do cadastro) — o cadastro dele migra na Fase 4 junto com os demais

**Critério de Conclusão**: `npx vitest run src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx` → 5/5 verdes (2 da 037 + 3 da 023); `check-contract-tests.ps1` íntegro para 037 e 023; `ProfilesScreen.test.tsx` e `App.test.tsx` verdes; captura 1920×1080 da tela com 2 listas conferida contra o protótipo.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-30)
- Feito: `ProfilesScreen.tsx` no formato do `profiles()` (raiz `.screen.onboarding.profiles-screen`, `OnboardingBrand`, kicker, `<h1>` com quebra, subtítulo, fileira, rodapé `.profiles-foot-note`, botão `.profiles-settings-corner` com `Icon settings` + "Configurações"); cartão com selo `.source-card-kind`, avatar `.source-card-avatar.list-avatar--N` (`aria-hidden`), nome e `.source-card-notices` (só quando há aviso); `formatStatus` saiu do cartão; cartão-botão "Adicionar lista" com `aria-label` exato, círculo + `Icon add` e pílula "＋ Adicionar"; `ADD_LIST_FOCUS_ID` honrado no foco inicial; `App.tsx` abre o cadastro com `from: { ...screen, focusSourceId: ADD_LIST_FOCUS_ID }`; `profiles.css` reescrito só com tokens (centralização da fileira por `margin: auto` nas pontas — `safe center` não existe no Chromium 108; linha de ações centrada sob o cartão sem alargar o `.source-card-wrap`). Os textos de primeiro uso/carregando (T029, Fase 5) já entraram junto, por serem o mesmo bloco de JSX — os testes deles ficam para a Fase 5.
- Contrato: `npx vitest run src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx` → 5/5 verdes (2 da 037 + 3 da 023); `check-contract-tests.ps1` PASS para 037, 023, 026 e 028 — travas íntegras.
- Testes executados: `npx vitest run src/features/profiles src/App.test.tsx src/navigation` → 88/88; `npx vitest run src/features/settings src/testing src/components` → 348/348; `npx tsc -b` limpo; `npx oxlint src/features/profiles src/App.tsx src/App.test.tsx` limpo; `node e2e.mjs` (dev server de ~35 min) → todas as verificações verdes, incluindo as 4 novas (título, "Adicionar lista" como botão, "Configurações" no lugar de "Gerenciar listas", RETURN do cadastro com listas devolve o foco a `.add-card`). Captura 1920×1080 com 2 listas conferida contra o `profiles()` do protótipo (fora do repositório): mesmos blocos, ordem e textos; diferenças aceitas — título 64 px (D-014), iniciais em tinta escura e gradiente só com `--brand-*` (logic/avatar-da-lista.md), marca sem o triângulo de play (`OnboardingBrand` é compartilhado com o progresso, fora do escopo, D-012). Uma iteração.
- Pendências: nenhuma. Observação: no `e2e.mjs`, o RETURN do cadastro ainda é testado contra o formulário antigo — com o foco inicial em "Xtream Codes" (Fase 4), RETURN iria primeiro ao mock do celular (anterior no DOM); ver R-008.

---

## Phase 4: User Story 2 - Cadastrar uma lista pela tela nova (Priority: P1)

**Objetivo**: O cadastro fica igual ao `sourceSetup()` do protótipo, com Xtream Codes/Lista M3U e o celular como "Em breve".

**Independent Test**: Sem listas, "Adicionar lista" → conferir a tela → cadastrar uma M3U e (outra rodada) uma Xtream → progresso abre (quickstart Cenário B).

### Contrato da Fase

- `AddSourceScreen — contrato da feature 037 › abre em Xtream Codes (selecionado e em foco); trocar para Lista M3U mantém o nome e "Conectar e sincronizar" cria a lista` — origem: US2/AC1–AC4, FR-012, FR-015–FR-018
- `AddSourceScreen — contrato da feature 037 › "Conectar com celular" é mock honesto: "Em breve", sem "Recomendado", sem código/QR/endereço inventados, e só anuncia ao ativar` — origem: FR-013, FR-014, FR-023, SC-005
- Comando: `npx vitest run src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx`

### Implementation

- [X] T020 [US2] Reestruturar `tv-web/src/features/import/AddSourceScreen.tsx` (modo cadastro) no formato do `sourceSetup()`: raiz `.screen.onboarding.source-setup` (mantendo `id="add-source-title"` no `<h1>`), `OnboardingBrand`, kicker/título/subtítulo, grade com painel lateral "Como funciona" (3 passos + nota, sem estado "concluído") e painel principal "Adicionar serviço" contendo o painel do celular, o painel manual, os campos e as ações — textos da tabela "Textos" do `plan.md` → contrato: `abre em Xtream Codes…`
- [X] T021 [US2] Painel "Conectar com celular" com selo "Em breve", h3 "Conectar com celular", texto e `ComingSoon id="pair-phone"` — sem QR, código ou endereço (FR-013) em `tv-web/src/features/import/AddSourceScreen.tsx` → contrato: `"Conectar com celular" é mock honesto…`
- [X] T022 [US2] Seletor de tipo conforme D-008 (dois `<button aria-pressed>` "Xtream Codes"/"Lista M3U" com descrição; Xtream selecionado por padrão), substituindo o `Tabs`; trocar o tipo preserva o Nome já digitado (FR-017) em `tv-web/src/features/import/AddSourceScreen.tsx` → contrato: `abre em Xtream Codes…`
- [X] T023 [US2] Campos e ações conforme D-010 ("Nome da lista", "Servidor", "Usuário", "Senha" / "Nome da lista", "URL M3U"; botões "Voltar" → `onBack` e "Conectar e sincronizar" com `loading`), mesmas validações/mensagens/`mutate` de hoje — só a de nome vazio vira "Informe um nome para a lista." (FR-018) —, em `tv-web/src/features/import/AddSourceScreen.tsx` → contrato: `abre em Xtream Codes…`
- [X] T024 [US2] Passar `initialFocus` ao `useTvKeyNav` no modo cadastro, devolvendo o botão do tipo selecionado (D-009), em `tv-web/src/features/import/AddSourceScreen.tsx` → contrato: `abre em Xtream Codes…`
- [X] T025 [US2] Estilos do bloco `.source-setup` em `tv-web/src/styles/onboarding.css` (só tokens): grade lateral/principal, painéis `--bg-surface` com `--radius-lg`, selos (`panel-eyebrow`) em caixa alta, passos numerados, cartões de tipo com estado selecionado visível sem depender só de cor (marca ✓/borda + `aria-pressed`), campos em grade 2 colunas com rótulo permanente dentro da caixa (Nome e Servidor/URL em largura total), ações à direita; raiz com `overflow-y: auto` + `.no-scrollbar` (D-013). Não alterar as regras compartilhadas com `ImportProgressScreen` (D-012)
- [X] T026 [US2] Migrar para `e2e/lib/entrada.mjs` todo cadastro de lista em `tv-web/e2e.mjs` e em `tv-web/e2e/*.mjs` — inclusive os `-real` fora do `test:e2e` (`epg-dados-agora-real.mjs`, `epg-guia-completo-real.mjs` usam Xtream) e `paridade-*.mjs`/`shell-visual.mjs` se cadastrarem lista — conferindo por grep que não sobra "Nome de exibição"/"URL da lista M3U"/"Endereço, usuário e senha" em `tv-web/e2e*` (R-002)

### Testes da Fase

- [X] T027 [US2] Atualizar `tv-web/src/features/import/AddSourceScreen.test.tsx` para os textos/estrutura novos (R-005), preservando: pipeline local sem requisição a `/sources`, `inputmode`/`type`/`autocomplete` por campo nos dois tipos, nenhum `placeholder`, RETURN → `onBack` sem salvar, validação (nome vazio, URL vazia, Xtream incompleto), `findUnnamedControls` vazio; acrescentar: "Voltar" chama `onBack`; ↑ a partir de "Xtream Codes" alcança o mock do celular; OK duplo em "Conectar e sincronizar" cria uma lista só; nome vazio mostra "Informe um nome para a lista."
- [X] T027a [US2] (ad-hoc, descoberta na T027) Ordenar os focáveis do `useTvKeyNav` pela posição no documento em `tv-web/src/lib/useTvKeyNav.ts`: no jsdom, `querySelectorAll` escopado com lista de seletores agrupa por seletor (botões antes dos inputs), e os testes navegavam numa ordem que o navegador nunca tem; + teste em `tv-web/src/lib/useTvKeyNav.test.tsx` (R-009)
- [X] T028 [US2] `npm run test:e2e` inteiro verde com o dev server recém-iniciado; conferir no `e2e.mjs` (ou no helper) que o cadastro abre com "Xtream Codes" em foco e que o foco volta a `.add-card` depois de "Voltar"
- [X] T028a [US2] SC-002 no `tv-web/e2e.mjs`: a partir da tela vazia, cadastrar uma lista Xtream **só pelo teclado** (OK em "Adicionar lista", setas + digitação nos campos, OK em "Conectar e sincronizar") contando os `Enter` de navegação, e afirmar que são ≤ 3 até a tela de progresso aparecer (o preenchimento dos campos não conta)

**Critério de Conclusão**: `npx vitest run src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1` íntegro; `AddSourceScreen.test.tsx` verde; `npm run test:e2e` verde; captura 1920×1080 do cadastro (Xtream e M3U) conferida contra o protótipo, com "Conectar e sincronizar" visível ou alcançável por rolagem.

**Checkpoint**: User Stories 1 e 2 funcionais — o fluxo padrão inteiro está no visual novo.

**Registro da Fase**:

- Status: concluída (2026-09-30)
- Feito: `AddSourceScreen.tsx` no formato do `sourceSetup()` (raiz `.screen.onboarding.source-setup.no-scrollbar`, `#add-source-title` mantido): painel lateral "Como funciona" (3 passos, nenhum concluído, nota "Em breve"), painel principal "Adicionar serviço" com "Conectar com celular" (selo "Em breve", `ComingSoon pair-phone`, sem QR/código/endereço) e "Configuração manual" lado a lado, seletor de tipo com dois `<button aria-pressed>` (Xtream Codes padrão, marca ✓ além da cor), campos "Nome da lista"/"Servidor"/"Usuário"/"Senha" ou "Nome da lista"/"URL M3U" em grade 2 colunas com rótulo dentro da caixa, ações "Voltar"/"Conectar e sincronizar" (`Conectando…` com `loading`). Mesma validação/`mutate`; só a mensagem de nome vazio mudou. `initialFocus` devolve o tipo selecionado. O modo edição (T031, Fase 6) já entrou junto no mesmo JSX — os testes dele ficam para a Fase 6. Bloco `.source-setup` em `onboarding.css` só com tokens, cabendo em 1080 dentro da safe zone (Xtream: painel termina em y=990) e `scroll-padding-block: var(--safe-y)` para a rolagem. 23 scripts `e2e*` + os 2 `-real` migrados para `e2e/lib/entrada.mjs` (script Node sobre o padrão de 3 linhas; grep sem rótulo antigo). `e2e.mjs` ganhou: foco inicial em "Xtream Codes", "Voltar" devolve o foco a `.add-card` e o SC-002 (2 OK até o progresso). R-008 resolvido sem código (premissa não valia); T027a ad-hoc (ordem de foco no jsdom, R-009).
- Contrato: `npx vitest run src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx` → 2/2 verdes; `check-contract-tests.ps1` PASS para 037, 023, 026 e 028 — travas íntegras.
- Testes executados: `npx vitest run src/features/import src/lib/useTvKeyNav.test.tsx src/features/settings src/features/live/guide` → 138/138 (duas iterações: a 1ª achou a ordem de foco do jsdom → T027a); `npx tsc -b` limpo; `npx oxlint` nos arquivos tocados sem aviso novo (o único é pré-existente, `eventually` sem uso em `e2e/epg-guia-completo.mjs`); dev server reiniciado → `node e2e.mjs` verde e `npm run test:e2e` 18/18 scripts verdes (exit 0); fora do `test:e2e`, `e2e/player-chrome.mjs` e `e2e/filmes-series-ds-v14.mjs` verdes. Capturas 1920×1080 do cadastro Xtream e M3U conferidas contra o `sourceSetup()` (fora do repositório): mesmos blocos e ordem; desvios aceitos — celular sem QR/código (FR-013), título 64 px (D-014), pílulas fundidas nos cartões de tipo (D-008), Nome sem valor pré-preenchido.
- Pendências: `e2e/paridade-visual.mjs`, `e2e/paridade-limpeza.mjs` e `e2e/shell-visual.mjs` (capturas, fora do `test:e2e`) e os dois `-real` (rede + `.env`) foram migrados mas não rodados; as de paridade vão acusar diferença nas telas de entrada, que é a mudança desejada. Observação: o vitest avisou uma vez `Timeout terminating forks worker` no arquivo de contrato do cadastro, com todos os testes verdes — aviso de encerramento do pool, não falha; acompanhar na suíte completa (T034).

---

## Phase 5: User Story 3 - Primeiro uso sem listas (Priority: P2)

**Objetivo**: Tela vazia com só "Adicionar lista", em foco, e textos de primeiro uso.

**Independent Test**: IndexedDB limpo → abrir o app (quickstart Cenário C).

### Implementation

- [ ] T029 [US3] Textos de primeiro uso (kicker "Configuração inicial", subtítulo "Adicione sua primeira lista para começar.") no estado `empty` e texto de carregando no estado `loading`, em `tv-web/src/features/profiles/ProfilesScreen.tsx`; rodapé e botão do canto presentes nos três estados não-erro

### Testes da Fase

- [ ] T030 [US3] Em `tv-web/src/features/profiles/ProfilesScreen.test.tsx`: estado vazio mostra só "Adicionar lista" em foco + textos de primeiro uso; OK chama `onAddSource`; RETURN abre "Sair do CCPlayTV?"; carregando tem esqueletos com a geometria do cartão novo e um focável

**Critério de Conclusão**: testes de T030 verdes; o `e2e.mjs` (que começa sem lista) segue verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 4 - Editar uma lista no visual novo (Priority: P3)

**Objetivo**: A edição usa a tela nova, sem celular e sem trocar o tipo.

**Independent Test**: Editar uma lista Xtream e uma M3U (quickstart Cenário D).

### Implementation

- [ ] T031 [US4] Modo edição em `tv-web/src/features/import/AddSourceScreen.tsx` conforme D-015: kicker "Suas listas", título "Editar lista", subtítulo de edição de hoje, sem painel do celular, sem seletor de tipo e sem o painel lateral "Como funciona" (painel manual em largura total), campos do tipo da lista com os `hint`s de hoje, ações "Voltar" e "Salvar alterações" (FR-021); sem `initialFocus` (foco no primeiro campo)

### Testes da Fase

- [ ] T032 [US4] Em `tv-web/src/features/import/AddSourceScreen.test.tsx`: edição Xtream (Servidor preenchido, Usuário/Senha vazios com hint ligado por `aria-describedby`, sem `aria-pressed` de tipo, sem "Conectar com celular", sem "Como funciona", "Salvar alterações" chama `useUpdateSource` com só o que mudou) e edição M3U (URL vazia com hint)

**Critério de Conclusão**: testes de T032 verdes; contratos da 037 seguem verdes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Limpeza, verificação completa e documentação.

- [ ] T033 Remover de `tv-web/src/styles/onboarding.css` as regras que ficaram sem uso (`.onboarding-layout`, `.onboarding-form`, `.onboarding-fields`, `.onboarding-tabs`, `.onboarding-side*`, `.onboarding-submit`, `.onboarding .text-field-*` se substituídas) — confirmar por grep em `tv-web/src` antes de cada remoção (D-012)
- [ ] T034 Suíte completa `npm run test` (flakes conhecidos confirmados isolados), `npx tsc -b`, `npm run lint`, `npm run build:tizen`
- [ ] T035 Integridade das travas: `check-contract-tests.ps1` para `037-entrada-listas-prototipo`, `023-shell-navegacao-entrada-ds-v14`, `026-home-busca-configuracoes-ds-v14`, `028-limpeza-qa-ds-v14`
- [ ] T036 Rodar `quickstart.md` (Cenários A–D) com capturas 1920×1080 lado a lado com o protótipo (SC-001), guardando as capturas fora do repositório
- [ ] T037 Atualizar a documentação: seção da feature 037 em `CLAUDE.md` (Project status) e o cabeçalho de `.planning/migracao-design-system-v14.md` se citar a tela de perfis; status via `update-feature-status.ps1`

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [ ] Fase 6 (User Story 4) concluída
- [ ] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (037, 023, 026, 028)
- [ ] `npm run test`, `tsc -b`, `lint`, `build:tizen` limpos
- [ ] `npm run test:e2e` verde (dev server recém-iniciado)
- [X] Nenhum "Nome de exibição"/"URL da lista M3U"/"Endereço, usuário e senha" restante em `tv-web/e2e*`
- [ ] `quickstart.md` executado com sucesso
- [ ] Passada na TV física: recomendada, não gate (spec sem exceção declarada)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem da Fase 2; podem rodar em paralelo (arquivos diferentes), exceto T019/T026 (`e2e.mjs`), que devem ser feitos na ordem T019 → T026
- **US3 (Phase 5)**: depende da Fase 3 (mesmo arquivo)
- **US4 (Phase 6)**: depende da Fase 4 (mesmo arquivo)
- **Polish (Phase 7)**: depende de todas

### Parallel Opportunities

- T003, T004, T005, T006 (Fase 2) — arquivos diferentes
- Fase 3 (`ProfilesScreen.tsx`, `profiles.css`, `App.tsx`) em paralelo com Fase 4 (`AddSourceScreen.tsx`, `onboarding.css`, `e2e/`)

---

## Parallel Example: Foundational

```bash
Task: "T003 [P] listAvatar.ts"
Task: "T004 [P] tokens em index.css"
Task: "T005 [P] initialFocus em useTvKeyNav.ts"
Task: "T006 [P] e2e/lib/entrada.mjs"
```

---

## Implementation Strategy

### MVP First

1. Fase 1 → Fase 2 → Fase 3 (tela de listas) → Fase 4 (cadastro) — o fluxo padrão
   só fica inteiro com as duas P1.
2. **PARAR E VALIDAR**: contratos 5/5, `test:e2e`, capturas contra o protótipo.

### Incremental Delivery

1. Fase 2 → fundação
2. Fase 3 → tela de listas nova (o cadastro antigo ainda funciona)
3. Fase 4 → cadastro novo + E2E migrados
4. Fases 5 e 6 → primeiro uso e edição

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
