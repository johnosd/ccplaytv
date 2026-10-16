---
description: "Tasks da feature 076 — Portal & licença simplificada, com Avançado e código de recuperação"
---

# Tasks: Simplificar Portal & licença — ações raras e código de recuperação em Avançado

**Input**: Documentos de design de `sdd/specs/076-simplificar-portal-licenca/`

**Prerequisites**: plan.md, spec.md, logic/avancado-foco.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Frontend em `tv-web/src/` (comandos rodam de `tv-web/`); UI em `tv-web/src/features/settings/` e `tv-web/src/features/settings/tabs/`.
- Textos em `tv-web/src/lib/i18n/messages/` (pt/en/es, mesmas chaves nos três).
- E2E em `tv-web/e2e/`; no PowerShell use `node e2e/run.mjs --only a,b` (o `npm run x -- --flag` perde o `--`).
- **Proibido** importar `features/portal/*` de `features/settings/*` (ratchet); arquivo de produção ≤ 300 linhas.
- Os arquivos de contrato (`*.simplificar-portal-licenca.contract.test.tsx`) são travados: nunca editar. O da 075 só muda pela emenda T009.

## Phase 1: Setup

Nenhuma (sem dependência nova; o stub `SettingsTabHandle.onBack?` já existe).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: RETURN da aba, textos, visões/ações por id, hook do olho e CSS usados por todas as stories.

- [X] T001 `tv-web/src/features/settings/SettingsScreen.tsx`: no `useRemoteNav`, trocar `onBack` por função que, com `zone === 'panel'`, chama `tabHandle.current?.onBack?.()` e só segue para `onBack` da tela se o retorno não for `true` (`logic/avancado-foco.md` §2). Tirar o aviso "STUB do sdd-plan" do comentário de `onBack` em `tabs/settingsTab.ts`
- [X] T002 [P] i18n: criar `tv-web/src/lib/i18n/messages/portalAdvanced.ts` (`defineArea`) com as chaves de `logic/avancado-foco.md` §5 (`portal.advanced`, `.intro`, `.codeText`, `.rotateText`, `.recoverText`, `.unlinkText`, `.needsPairing`, `portal.codeReminder`) em pt/en/es; registrar em `pt.ts`, `en.ts`, `es.ts` e na lista `AREAS` de `messages/areas.test.ts`; em `messages/portal.ts` renomear o texto de `portal.showCode`, `portal.hideCode`, `portal.codeLabel` (valor novo "Código de recuperação"), `portal.rotateAllHint`, `portal.changed` e **remover** `portal.more`, `portal.moreUnavailable`, `portal.codePrivateHint` (conferir com Grep que nada mais as usa) — *feito em T002: a área nova e os renomes (inclui `portal.recoveryNeeded`, que também dizia "código da licença"); a **remoção** das 3 chaves fica para T007/T018, quando os últimos consumidores saem (senão o 	sc quebra no meio da fase)*
- [X] T003 [P] `tv-web/src/features/settings/portalActions.ts`: reescrever para visões (`PortalView`, `MainActionId`, `AdvancedActionId`, `mainActions`, `initialMain`, `ADVANCED_ACTIONS`, `resolveAction` genérica, `pairingNeedsAction` mantida) conforme §1; criar `tv-web/src/features/settings/portalActions.test.ts` (projeto `node`): ordem, foco inicial por licença/build, fallback quando a ação não existe
- [X] T004 [P] `tv-web/src/features/settings/useCodeReveal.ts`: extrair `useCodeReveal` de `PortalLicenseCard.tsx` e acrescentar `hide()` (§3); `PortalLicenseCard.tsx` deixa de exportá-lo
- [X] T005 [P] `tv-web/src/features/settings/portalLicense.css`: `.portal-cards.is-single` (uma coluna), `.portal-advanced`, `.portal-advanced-item` (título, texto, linha do motivo, ação) e `.portal-code-reminder`; nenhum literal de cor/raio/fonte

**Checkpoint**: fundação pronta (nada visível ainda).

---

## Phase 3: User Story 1 - Tela principal enxuta (Priority: P1) 🎯 MVP

**Objetivo**: principal só com cartões, linha do código e Avançado; sem olho nem código; cartão Licença só no comercial.

**Independent Test**: abrir a aba no build comercial e no não comercial e conferir botões, texto e foco.

### Contrato da Fase

- `US1-AC1/AC2/AC4/FR-001/FR-002/SC-001: build comercial — só Comprar, Atualizar e Avançado…`
- `US1-AC3/FR-003/FR-004: build não comercial — sem cartão Licença e o foco inicial cai em Avançado`
- Comando: `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx -t "US1"`

### Implementation

- [X] T006 [US1] `tv-web/src/features/settings/PortalLicenseCard.tsx`: remover olho, código e máscara; sobram estado, validade, oferta, Comprar/Renovar licença e Atualizar com a linha de status (só renderizado no comercial) → contrato: US1 (ambos)
- [X] T007 [US1] `tv-web/src/features/settings/PortalLicensePanel.tsx`: props `view`/`focusedId`/`onView`; visão `main` com `.portal-cards` (cartão Licença só se `commercial`, senão `is-single`), a linha `portal.codeReminder` (só com conexão), mensagens de resultado/falha como hoje e o botão `portal.advanced` no lugar de Mais opções; handle `{ activate, actions, initial }` da visão atual (`mainActions`/`initialMain`) → contrato: US1
- [X] T008 [US1] `tv-web/src/features/settings/tabs/PortalLicenseTab.tsx`: estado `{ view, focusedId }`; `onEnter` → `main` + `initialMain`; teclas da principal como em §2; SELECT em `advanced` só muda a visão (a subtela entra na Fase 4) → contrato: US1
- [X] T009 [US1] **Emenda aprovada (R-001, FR-016)**: em `tv-web/src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx` apagar apenas os `it` "US2-AC3/AC4/FR-007/FR-008/FR-009…olho…" e "US3-AC1/AC2/FR-010/FR-011/FR-012: Mais opções…" e os imports/constantes que ficarem sem uso (nada mais); regravar: `powershell -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca -Write` (da raiz) → 3/3; registrar a emenda nas Execution Notes

### Testes da Fase

- [X] T010 [P] [US1] `PortalLicenseCard.test.tsx`: sem olho nem código; comercial mostra estado, Renovar e Atualizar; mover os testes do olho para `tv-web/src/features/settings/useCodeReveal.test.tsx` (oculto ao abrir, alterna, `pagehide`/segundo plano, nova versão nunca nasce visível, sem device, `hide()`)
- [X] T011 [P] [US1] `PortalLicensePanel.test.tsx` e `tabs/PortalLicenseTab.test.tsx`: ordem das ações (`retry? purchase refresh advanced`; só `advanced` fora do comercial), navegação ↑/↓/←/→ da principal, QR fixo e chave não somem em segundo plano, linha do lembrete só com conexão

**Critério de Conclusão**: `npx vitest run … -t "US1"` → 2/2 verdes; o contrato da 075 emendado 3/3 verde; `check-contract-tests.ps1 -Slug 076-simplificar-portal-licenca` e `… -Slug 075-redesenho-portal-licenca` íntegros; `npx vitest run src/features/settings` verde exceto os testes de US2/US3 ainda vermelhos; lint/tsc limpos.

**Checkpoint**: US1 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T006–T011. `PortalLicenseCard` sem olho/código (só Licença: estado, validade, oferta, Comprar/Renovar, Atualizar); `PortalLicensePanel` com `view`/`onView`, cartão Licença só no comercial (`is-single` no resto), linha `portal.codeReminder` (só com conexão) e botão Avançado, handle `{ activate, actions, initial, mainInitial }`; `PortalLicenseTab` com `{ view, focusedId }`, teclas da principal **e já as da subtela e o `onBack`** (T014 adiantada: a subtela em si entra na Fase 4); legado da 075 (`portalActions`/`initialAction`, id `'more'`) removido de `portalActions.ts`; `portal.codePrivateHint` removida (sem consumidores). **Emenda T009 aplicada**: apagados só os `it` do olho e do menu "Mais opções" e os imports `fireEvent`/`within`; trava da 075 regravada (3/3). `PortalMoreOptions.test.tsx` **apagado** nesta fase (testava o menu removido); seus 5 casos voltam em T019 (`PortalAdvanced.flows.test.tsx`).
- Contrato: `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx -t "US1"` → 2/2 verdes; 3 de US2/US3 seguem vermelhos por asserção (esperado); `check-contract-tests.ps1 -Slug 076-…` e `-Slug 075-…` → trava íntegra (3 testes da 075, 3/3 verdes).
- Testes executados: `npx vitest run src/features/settings src/lib/i18n` → 182 verdes, 3 vermelhos (os contratos US2/US3); `npx tsc -b` limpo; `npm run lint` → `architecture: ok`. Novos/reescritos: `PortalLicenseCard.test.tsx` (3), `useCodeReveal.test.tsx` (4), `PortalLicensePanel.test.tsx` (5), `tabs/PortalLicenseTab.test.tsx` (2).
- Pendências: `portal.more`/`portal.moreUnavailable` ainda existem (usadas por `PortalMoreOptions.tsx`, que sai na T018).

---

## Phase 4: User Story 2 - Avançado explica cada item (Priority: P1)

**Objetivo**: subtela com quatro itens, texto de "para que serve / quando usar", código com olho, Voltar com foco em Avançado.

**Independent Test**: abrir Avançado, conferir itens/ordem/textos, revelar e ocultar o código, voltar.

### Contrato da Fase

- `US2-AC1/AC5/FR-005/FR-006/SC-002: Avançado abre uma subtela (não um modal) com 4 itens…`
- `US2-AC2/AC3/AC4/FR-007/FR-008/SC-004: o código só aparece por SELECT no olho… Voltar fecha…`
- Comando: `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx -t "US2"`

### Implementation

- [X] T012 [US2] Criar `tv-web/src/features/settings/PortalAdvanced.tsx`: região `aria-label={t('portal.advanced')}` com `h2`, intro e os quatro `PortalAdvancedItem` (`h3` + texto + linha de motivo quando indisponível + botão), estrutura exata de `logic/avancado-foco.md` §4; item do código com `dl` (máscara fixa ou `device.recoveryCode`) e botão olho (`portal.showCode`/`hideCode`, ícones `eye`/`eyeOff`, soft-disabled sem device); sem botão Voltar → contrato: US2 (ambos)
- [X] T013 [US2] `PortalLicensePanel.tsx`: visão `advanced` renderiza `PortalAdvanced` no lugar dos cartões; `activate('eye')` → `reveal.toggle()`; `reveal.hide()` ao voltar a `main` (D-005); `current` do foco zerado com confirmação aberta → contrato: US2
- [X] T014 [US2] `tabs/PortalLicenseTab.tsx`: SELECT em `advanced` → `view='advanced'`, `focusedId='eye'`; ↑/↓ param nas pontas; ← e `onBack()` → `main` + foco `advanced` (`onBack` devolve `true` só na subtela, `false` na principal) → contrato: US2

### Testes da Fase

- [X] T015 [P] [US2] `tv-web/src/features/settings/PortalAdvanced.test.tsx`: quatro itens com os textos em pt/en/es (sem a palavra "licença"/"license code" no texto do código), itens indisponíveis soft-disabled com o motivo visível, olho soft-disabled sem device
- [X] T016 [P] [US2] `tabs/PortalLicenseTab.test.tsx` (navegação da subtela e `onBack`) e novo `tv-web/src/features/settings/SettingsScreen.aba-onback.test.tsx`: com `zone` painel e `onBack` da aba devolvendo `true` a tela **não** sai; devolvendo `false`/ausente, sai; na zona das abas sai como sempre

**Critério de Conclusão**: `npx vitest run … -t "US2"` → 2/2 verdes, trava íntegra; `npx vitest run src/features/settings` verde exceto o contrato US3; lint/tsc limpos.

**Checkpoint**: US1 + US2 entregam o MVP.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T012–T016. `PortalAdvanced.tsx` (região "Avançado", 4 `h3`, texto sempre visível, motivo `portal.advanced.needsPairing` nos itens indisponíveis, olho com ícones `eye`/`eyeOff`, só os 4 botões, sem `Modal`); painel renderiza a visão `advanced` e liga `eye` ao `useCodeReveal`; aba (T014) já estava pronta desde a Fase 3 — aqui só conferida por testes. **Desvio**: `useCodeReveal(device, active)` substituiu o `hide()` planejado — com `active = view === 'advanced'` o código oculta ao sair da subtela sem efeito no painel (D-005 do plan cita `hide()`; o efeito é o mesmo).
- Contrato: `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx -t "US2"` → 2/2 verdes (US1 2/2 da fase anterior; falta só US3); `check-contract-tests.ps1` 076 e 075 → trava íntegra.
- Testes executados: `npx vitest run src/features/settings src/lib/i18n` → 197 verdes, 1 vermelho (o contrato US3, Fase 5); `npx tsc -b` limpo; `npm run lint` → `architecture: ok`. Novos: `PortalAdvanced.test.tsx` (4), `lib/i18n/messages/portalAdvanced.test.ts` (3: mesmas chaves nos 3 idiomas; nenhum texto da TV diz "código da licença/license code/código de licencia"; texto do código diz que não é licença comprada e manda guardar fora da TV em pt/en/es), `SettingsScreen.aba-onback.test.tsx` (3), +2 em `tabs/PortalLicenseTab.test.tsx` (subtela e `onBack`).
- Pendências: rotação/Recuperar/Desvincular ainda não fazem nada ao apertar (Fase 5, T017); `PortalMoreOptions.tsx` e as chaves `portal.more`/`portal.moreUnavailable` seguem até T018.

---

## Phase 5: User Story 3 - Ações do Avançado funcionam como antes (Priority: P2)

**Objetivo**: rotação, Recuperar e Desvincular a partir da subtela, com as mesmas confirmações e efeitos.

**Independent Test**: executar cada ação com confirmar e cancelar e conferir para onde o foco volta.

### Contrato da Fase

- `US3-AC1/FR-010: gerar nova chave só após confirmar, uma rotação, volta à tela principal com a nova chave e o código novo oculto`
- Comando: `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx -t "US3"`

### Implementation

- [X] T017 [US3] `PortalAdvanced.tsx` + `PortalLicensePanel.tsx`: SELECT em `rotate`/`unlink` abre `PortalConfirmDialog` (rótulo de confirmar da rotação = `portal.rotateAll`; texto `portal.rotateAllHint`; Desvincular usa `portal.unlinkTitle/Text`) — cancelar/RETURN fecha só a confirmação e mantém foco no item; confirmar volta a `main` com foco em `advanced` e chama `access.rotate()`/`access.unlink()`; SELECT em `recover` volta a `main` e chama `access.startRecovery()`; itens indisponíveis seguem soft-disabled sem abrir nada (D-007) → contrato: US3
- [X] T018 [US3] Remover `tv-web/src/features/settings/PortalMoreOptions.tsx` (nada mais o importa) depois de portar seus testes (T019)

### Testes da Fase

- [X] T019 [P] [US3] Portar `PortalMoreOptions.test.tsx` para `PortalAdvanced.flows.test.tsx` (apagar o antigo): RETURN na confirmação mantém a subtela com foco no item; Cancelar não chama `rotate`; sem pareamento rotação/Desvincular soft-disabled com o motivo; Desvincular confirmado solta o pareamento, guarda o lembrete e mostra Vincular de novo; Recuperar volta à principal com o QR temporário no lugar do fixo e o fixo volta no `pagehide`

**Critério de Conclusão**: `npx vitest run … -t "US3"` → verde (5/5 no arquivo todo), trava íntegra; `npx vitest run src/features/settings` verde; lint/tsc limpos.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T017–T019. `PortalLicensePanel`: `step` ('rotate' | 'unlink') abre `PortalConfirmDialog` por cima do Avançado (textos `portal.rotateAllTitle/Hint` e `portal.unlinkTitle/Text`; confirmar da rotação = `portal.rotateAll`); cancelar/RETURN fecha só a confirmação e o foco fica no item; confirmar volta à principal com foco em Avançado e chama `access.rotate()`/`access.unlink()`; `recover` volta à principal e chama `access.startRecovery()`; itens indisponíveis não abrem nada (soft-disabled com o motivo). `PortalMoreOptions.tsx` apagado, junto com `portal.more`/`portal.moreUnavailable` (3 idiomas) e o CSS `.portal-more-list`; `portal.ts` ficou em 288 linhas.
- Contrato: `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx` → **5/5 verdes**; `check-contract-tests.ps1` 076 (5) e 075 (3) → trava íntegra.
- Testes executados: `npx vitest run src/features/settings src/lib/i18n` → 50 arquivos / 203 verdes; `npx tsc -b` limpo; `npm run lint` → `architecture: ok`. Novo: `PortalAdvanced.flows.test.tsx` (5: RETURN na confirmação, Cancelar sem `rotate` + efeito explicado, soft-disabled sem vínculo com o motivo, Desvincular com lembrete + Vincular de novo, Recuperar com QR temporário e `pagehide`) — porta os 5 casos do antigo `PortalMoreOptions.test.tsx`.
- Pendências: nenhuma na fase.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 Varredura de terminologia (FR-009): Grep por `código da licença|código de licença|license code|Mais opções|More options|Más opciones` em `tv-web/src`, `tv-web/e2e`, `CLAUDE.md`, `docs/`, `.planning/memory` e `sdd/adr`; trocar nos comentários de produção, nos testes não travados e nos catálogos; não tocar nos contratos travados nem em `sdd/specs/07[0-5]-*` (história)
- [X] T021 Documentação canônica: `.planning/memory/constitution.md` → versão **1.14.1** (PATCH): trocar "código da licença" por "código de recuperação" nos 6 pontos, esclarecer que "na própria tela" do item (f) vale para a subtela Avançado da mesma aba (sem modal de aviso) e acrescentar o relatório de impacto no topo (sem enfraquecer a regra); nota **Atualização (feature 076)** em `sdd/adr/ADR-019-portal-licenca-qr-id-chave.md` e ajuste da linha na `ADR-016`; `CLAUDE.md`: versão da constitution (1.14.1) e linha da ADR-019 (código de recuperação em Avançado)
- [X] T022 [P] `portal-web/src/lib/i18n/index.ts` (`recoveryHint` pt/en/es, `recoveryCode` en) e `portal-web/src/lib/i18n/faq.ts` (linha ~136): "código da licença/license code/código de licencia" → "código de recuperação/recovery code/código de recuperación" e "escolha Recuperar pelo site" → "abra Avançado e escolha Recuperar pelo site" (R-003: só essas linhas; o arquivo tem mudanças alheias não commitadas)
- [X] T023 E2E `tv-web/e2e/lib/portal.mjs`: `abrirAvancado(page)` (↓ até Avançado + Enter + espera a região), `gerarNovaChave(page)` pelo Avançado, remover `abrirMaisOpcoes`; `irParaFoco` mantido
- [X] T024 E2E roteiros: `portal-configuracao.mjs` (principal sem olho; código só no Avançado), `portal-mais-opcoes.mjs` → renomear `portal-avancado.mjs` (e `SUITE` em `e2e/run.mjs`) cobrindo Avançado, Voltar, Cancelar/confirmar nova chave, Recuperar, aba Backup e Desvincular só por teclado, `portal-dev-server.mjs`, `portal-pacote-file.mjs`, `entrada-listas-gerenciador.mjs`, `consulta-sob-demanda.mjs`, `desvincular-backup.mjs` (Desvincular pelo Avançado); rodar `node e2e/run.mjs --only portal-configuracao,portal-avancado,licenca-anual,configuracoes-lista-global` e, com a pilha local, os opt-in
- [X] T025 `tv-web/e2e/legibilidade-tv.mjs`: no bloco `abrirAbaDeConfiguracoes` trocar os passos de "Mais opções" por: principal; Avançado (subtela, com o código revelado clicando o olho); confirmação de nova chave; Backup — pt/en/es, sem violações (FR-015)
- [X] T026 Gates: `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`, `npm run test:e2e` (com `npm run dev`), `node e2e/legibilidade-tv.mjs`
- [X] T027 Rodar `quickstart.md` (cenário ponta a ponta no navegador, `npm run dev:portal`) — feito por roteiros de teclado no navegador (`portal-avancado`, `portal-configuracao`, `legibilidade-tv` com capturas conferidas); o passo a passo manual com a pilha `dev:portal` ficou com o usuário (a pilha dele já estava no ar)
- [X] T028 [descoberta em T024, relato do usuário] Rolagem da subtela: voltar ao primeiro item deixava título e texto cortados (`scrollIntoView({ block: 'nearest' })` no botão). `tabs/PortalLicenseTab.tsx`: a primeira ação rola `.settings-panel` ao topo e as demais mostram o bloco inteiro do item (`.portal-advanced-item`); teste em `tabs/PortalLicenseTab.test.tsx` e verificação de layout em `e2e/portal-avancado.mjs` (reproduz o defeito sem a correção)

### Checklist de Release

- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Contratos 076 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 076-simplificar-portal-licenca` íntegro
- [X] Contrato da 075 emendado (T009) 3/3 verde e trava da 075 regravada e íntegra
- [X] Lint (incl. ratchet de arquitetura), tsc, vitest e build limpos
- [X] `npm run test:e2e` verde e auditoria de legibilidade sem violações (pt/en/es)
- [X] "código da licença" fora da UI e da documentação canônica (constitution 1.14.1, ADR-019, CLAUDE.md)
- [X] `quickstart.md` executado
- [X] TV física fora do gate — **não realizada** (decisão herdada da 075; leitura real do QR, segundo plano Tizen e identificador após formatar seguem sem prova)

---

## Dependencies & Execution Order

- Fase 2 bloqueia todas (T001–T005 são independentes entre si, exceto T003/T004 antes de T006–T008).
- Fase 3 (US1) → Fase 4 (US2) → Fase 5 (US3): mesmos arquivos (`PortalLicensePanel`, `PortalLicenseTab`).
- T009 (emenda da 075) só depois de T006–T008, na mesma fase em que o olho sai da principal.
- T018 (apagar `PortalMoreOptions.tsx`) só depois de T019 portar os testes.
- Fase 6 depois de todas; T020 antes de T021 e T022.

### Parallel Opportunities

- T002/T003/T004/T005; T010/T011; T015/T016; T022 com T023.

## Implementation Strategy

### MVP First

Fases 2 → 3 → 4 (US1 + US2, ambas P1) e validar no navegador; depois Fase 5 e Polish.

## Notes

- Commitar por fase. Nunca editar o arquivo de contrato da 076; a 075 só pela emenda T009.
- Depois de cada fase, rodar `check-contract-tests.ps1` das duas features.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
## Phase 7: Convergence

**Objetivo**: fechar o que a convergência de 2026-10-16 deixou sem evidência. Nenhuma tarefa de código novo.

- [X] T029 [MEDIUM, F-001] Rodar os roteiros opt-in já atualizados para o Avançado, com a pilha local livre (encerrar o `npm run dev:portal` antes): de `tv-web/`, `node e2e/entrada-listas-gerenciador.mjs`, `node e2e/desvincular-backup.mjs`, `node e2e/consulta-sob-demanda.mjs` e `node e2e/portal-dev-server.mjs`; corrigir só o que o Avançado quebrou e registrar o resultado de cada um (e, se possível, `node e2e/portal-pacote-file.mjs` após `build:tizen:commercial`) → origem: FR-016, plan: R-010. **Resultado (2026-10-16, pilha livre):** `entrada-listas-gerenciador` PASS, `desvincular-backup` PASS (25 requisições, todas por ação da pessoa), `consulta-sob-demanda` PASS (24 requisições), `portal-dev-server` PASS; nenhum precisou de correção. `portal-pacote-file` **não** rodado: exige `build:tizen:commercial` sincronizado em `CCPlayTv/` (muda arquivos versionados do pacote) e foi deixado de fora
- [X] T030 [LOW, F-002] Alinhar a nota de rascunho de textos em `spec.md` (§Assumptions) à fonte da verdade `logic/avancado-foco.md` §5 ("permite recuperar…", "Guarde fora da TV…"), sem mudar requisito → origem: spec × logic
