---
description: "Tasks da feature 075 — redesenho de Portal & licença e aba Backup"
---

# Tasks: Redesenho da tela Portal & licença e item Backup

**Input**: Documentos de design de `sdd/specs/075-redesenho-portal-licenca/`

**Prerequisites**: plan.md, spec.md, logic/foco-portal.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Frontend em `tv-web/src/` (comandos rodam de `tv-web/`); UI desta feature em `tv-web/src/features/settings/` e `tv-web/src/features/settings/tabs/`.
- Lógica reaproveitada em `tv-web/src/lib/portal/`, `tv-web/src/lib/licensing/`, `tv-web/src/lib/backup/`; componentes em `tv-web/src/components/`.
- Textos em `tv-web/src/lib/i18n/messages/portal.ts` e `settings.ts` (pt/en/es).
- E2E em `tv-web/e2e/`.
- **Proibido** importar `features/portal/*` de `features/settings/*` (ratchet `scripts/architecture.mjs`); arquivo de produção ≤ 300 linhas.

## Phase 1: Setup

Nenhuma (sem dependência nova).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: utilitário, textos e esqueleto visual usados por todas as stories.

- [X] T001 [P] `formatDeviceKey(key: string): string` em `tv-web/src/lib/portal/displayId.ts` — 10 dígitos → `"173 204 9818"` (3-3-4); entrada fora do padrão devolve o valor como está (D-005)
- [X] T002 [P] Teste de `formatDeviceKey` em `tv-web/src/lib/portal/displayId.test.ts` (criar se não existir; `.ts` no projeto `node`)
- [X] T003 Textos novos nos 3 idiomas em `tv-web/src/lib/i18n/messages/portal.ts`: `portal.access.title` ("Acessar o portal"), `portal.license.title` ("Licença"), `portal.codeLabel` ("Código da licença"), `portal.hideCode` ("Ocultar código da licença"; `portal.showCode` já é "Mostrar código da licença"), `portal.codePrivateHint` (linha curta "guarde em local privado"), `portal.more` ("Mais opções"), `portal.rotateAll` ("Gerar nova chave e código"), `portal.rotateAllTitle`, `portal.rotateAllHint` (chave, QR e código mudam; site desconecta; listas, favoritos e licença preservados), `portal.recoveryQr` (rótulo do QR temporário), `portal.retry` (se não houver chave comum equivalente); e `settings.tab.backup` em `tv-web/src/lib/i18n/messages/settings.ts` (pt "Backup", en "Backup", es "Copia de seguridad")
- [X] T004 [P] Reescrever `tv-web/src/features/settings/portalLicense.css`: grid de 2 cartões (`minmax(0,1fr)` cada), moldura clara do QR (zona de silêncio, como `.portal-pairing-qr-frame`), valores em `--fs-body-lg` tabulares, cartões com tokens de superfície/raio/elevação V14 — nenhum literal de cor/raio/fonte

**Checkpoint**: fundação pronta.

---

## Phase 3: User Story 1 - Ver QR, ID e chave sem apertar nada (Priority: P1) 🎯 MVP

**Objetivo**: cartão Acessar o portal com QR, site, ID e chave à vista; tela principal sem os botões antigos.

**Independent Test**: abrir a aba numa TV pareada e ver QR/ID/chave sem SELECT e sem requisição.

### Contrato da Fase

- `US1-AC1/FR-002/FR-003/FR-016/SC-005: QR, ID e chave agrupada à vista…` — US1, FR-002/003/016, SC-005
- `FR-004/FR-017/SC-003/Constitution: Foco Visível e Sem Becos Sem Saída…` — FR-004/017, SC-003
- Comando: `npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx -t "US1-AC1|FR-004"`

### Implementation

- [X] T005 [US1] Criar `tv-web/src/features/settings/PortalAccessCard.tsx`: usa `usePairingCredentials(connection)` (lib) e `FixedQr`; mostra QR, `pairing.site`, ID e `formatDeviceKey(device.deviceKey)` num único nó de texto; estados carregando (`portal.pairing.loading`), falha (`portal.failure` + `portal.failureCode`, botão `retry` → `pairing.retry`) e sem conexão (`portal.unconfigured`, + `portal.devHint` em DEV); prop opcional `invite` que substitui o QR fixo (usada na Fase 5) → contrato: US1-AC1, FR-004
- [X] T006 [US1] Reescrever `tv-web/src/features/settings/PortalLicensePanel.tsx` como composição: título/descrição, `<PortalAccessCard>` + espaço do cartão Licença + botão `more` (stub de Mais opções até a Fase 5); remover os 12 botões, `PortalPrivateDialog` e `PortalBackupActions` daqui; handle por id: `activate(id: PortalActionId)` e lista de ações `portalActions(...)` (`logic/foco-portal.md` §1) → contrato: US1-AC1, FR-004
- [X] T007 [US1] `tv-web/src/features/settings/tabs/PortalLicenseTab.tsx`: trocar `row`/`PORTAL_ACTION_COUNT` por `focusedId` e o mapa de teclas de `logic/foco-portal.md` §2 → contrato: FR-004
- [X] T008 [US1] Remover `tv-web/src/features/settings/PortalPrivateDialog.tsx` (e seu CSS `.portal-private-value`, se ficar sem uso)

### Testes da Fase

- [X] T009 [P] [US1] `tv-web/src/features/settings/PortalAccessCard.test.tsx`: falha mostra código não secreto e nunca a chave/código; `retry` chama `ensurePairing` de novo; TV pré-070 mostra carregando até o upgrade
- [X] T010 [P] [US1] Navegação da aba em `tv-web/src/features/settings/tabs/PortalLicenseTab.test.tsx`: ↑ no primeiro → `goToTopbar`, ← → `exitToTabs`, ↓ para no último

**Critério de Conclusão**: os 2 contratos da fase verdes (`-t "US1-AC1|FR-004"`) e `check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca` íntegro; `npx vitest run src/features/settings` verde; lint/tsc limpos.

**Checkpoint**: US1 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T001–T010 (Fase 2 incluída). `formatDeviceKey`; i18n pt/en/es; CSS dos dois cartões; `portalActions.ts` (ações por id, `initialAction`, `resolveAction`, `pairingNeedsAction`); `usePortalAccess.ts` (rotação/recuperação/desvincular); `PortalAccessCard`, `PortalLicensePanel` (composição), `PortalLicenseTab` (foco por id); `PortalPrivateDialog` removido. Desvio pequeno: o painel é dono de `usePairingCredentials` (o cartão é só apresentação), porque a aba precisa saber se há `retry` para montar a lista de ações; e o estado "TV desvinculada" ganhou o botão `Vincular de novo` (`portal.relink`) para o cartão nunca ficar sem focável (não há Atualizar no build não comercial).
- Contrato: `npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx` → 5/5 verdes (US1-AC1 e FR-004 entre eles); `check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca` → trava íntegra.
- Testes executados: `npx vitest run src/features/settings src/lib/portal src/components` (145 arquivos, 666 verdes); `npx tsc -b` limpo; `npm run lint` (oxlint sem erros, ratchet `architecture: ok`). Novos: `displayId.test.ts`, `PortalAccessCard.test.tsx`, `tabs/PortalLicenseTab.test.tsx`.
- Pendências: nenhuma na fase.

---

## Phase 4: User Story 2 - Cartão Licença enxuto com código atrás do olho (Priority: P1)

**Objetivo**: cartão Licença com estado/validade/oferta, olho, Comprar/Renovar e Atualizar; foco inicial por estado.

**Independent Test**: abrir a aba em cada estado de licença e no build não comercial; conferir conteúdo, foco e olho.

### Contrato da Fase

- `US2-AC3/AC4/FR-007/FR-008/FR-009: …olho…` — US2, FR-007/008/009
- `US2-AC1/AC2/FR-009: build comercial…` — US2, FR-005/009
- Comando: `npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx -t "US2"`

### Implementation

- [X] T011 [US2] Criar `tv-web/src/features/settings/PortalLicenseCard.tsx`: build comercial → estado (`portal.licenseStatus` com a mesma regra de hoje, incl. `expired`), validade, `portal.licenseOffer`, olho, `purchase` (`portal.buy`/`portal.renew` se `state === 'active'`) e `refresh` (`portal.refresh.label` + `RefreshStatusLine scope="license"`); não comercial → só código + olho. Olho conforme `logic/foco-portal.md` §3 (D-004). Ler `commercialBuild` e `licenseMonitor` de `lib/licensing/licenseRuntime` **no render** (R-004) → contrato: US2 (ambos)
- [X] T012 [US2] Ligar o cartão no `PortalLicensePanel.tsx`: `activate('eye'|'purchase'|'refresh')` (compra Pix pelo `openPixPurchase` com `onBack`/`onLicensed` devolvendo foco a `purchase`; sem registro → `portal.pix.unavailable`)
- [X] T013 [US2] Foco inicial e reconciliação em `PortalLicenseTab.tsx`: `onEnter` → `initialAction`; se `focusedId` some do conjunto (licença mudou), cair em `initialAction` (`logic/foco-portal.md` §1) → contrato: US2-AC1/AC2

### Testes da Fase

- [X] T014 [P] [US2] Reescrever `tv-web/src/features/settings/PortalLicensePanel.test.tsx`: remover os testes do fluxo antigo (botão de chave, QR sob demanda que some no pagehide — R-006); manter "ACK concluído encerra recuperação sem acusar expiração"; Comprar via `activate('purchase')` com e sem registro de Pix
- [X] T015 [P] [US2] `tv-web/src/features/settings/PortalLicenseCard.test.tsx`: `pagehide` oculta; nova `recoveryCodeVersion` oculta; `aria-pressed` acompanha; sem device o olho é soft-disabled e SELECT não revela

**Critério de Conclusão**: contratos `-t "US2"` 2/2 verdes, trava íntegra; suíte `src/features/settings` verde.

**Checkpoint**: US1 + US2 entregam o MVP.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T011–T015. `PortalLicenseCard` (+ `useCodeReveal` exportado do mesmo arquivo, olho com a versão do código revelado, máscara fixa, glifos `eye`/`eyeOff` novos em `iconPaths.ts`); Comprar/Renovar via `openPixPurchase` no painel, volta devolve o foco a `purchase`; foco inicial e reconciliação por id (derivados em `resolveAction`, sem efeito). `PortalLicensePanel.test.tsx` reescrito (R-006: QR fixo não some no `pagehide`). Desvio: o plano citava `aria-pressed` no olho; `Button` não tem essa prop e o nome acessível já muda ("Mostrar…"/"Ocultar código da licença"), então o teste confere o nome, não `aria-pressed`.
- Contrato: `npx vitest run … -t "US2"` → 2/2 verdes (já na rodada completa 5/5); trava 075 íntegra.
- Testes executados: mesma rodada da Fase 3 + `PortalLicenseCard.test.tsx` (5), `PortalLicensePanel.test.tsx` (4) — todos verdes.
- Pendências: nenhuma na fase.

---

## Phase 5: User Story 3 - Ações raras em "Mais opções" (Priority: P2)

**Objetivo**: menu modal com Gerar nova chave e código, Recuperar pelo site e Desvincular.

**Independent Test**: abrir Mais opções e executar cada ação com confirmar e cancelar.

### Contrato da Fase

- `US3-AC1/AC2/FR-010/FR-011/FR-012: Mais opções…` — US3, FR-010/011/012
- Comando: `npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx -t "US3"`

### Implementation

- [X] T016 [US3] Criar `tv-web/src/features/settings/PortalMoreOptions.tsx`: `Modal` com 3 `Button`s na ordem `portal.rotateAll`, `portal.recover`, `portal.unlink`; ↑/↓/SELECT/RETURN; escolher fecha o menu e abre a confirmação certa (`PortalConfirmDialog`; rótulo de confirmar da rotação = `portal.rotateAll`) — `logic/foco-portal.md` §4 → contrato: US3
- [X] T017 [US3] No `PortalLicensePanel.tsx`: rotação → `connection.rotate('revoke')` (D-006) com status `portal.changed`; Recuperar → `connection.recovery()` + `usePortalRecovery`, convite passado a `PortalAccessCard` (`invite`, contagem `portal.expiry`, rótulo `portal.recoveryQr`; descarta em `visibilitychange`/`pagehide`, QR fixo fica — D-008); Desvincular → mover de `PortalBackupActions.tsx` o fluxo 072 (`refreshPortal('backup')` se online, `resetPortalAgent`, `unlinkPortal`, mensagens `portal.unlinkDone`/`portal.unlinkNoBackup`); itens indisponíveis soft-disabled (sem conexão/sem pareamento) → contrato: US3
- [X] T018 [US3] Foco: RETURN/cancelar em menu ou confirmação devolve a `more` (D-007)

### Testes da Fase

- [X] T019 [P] [US3] `tv-web/src/features/settings/PortalMoreOptions.test.tsx`: RETURN fecha e devolve foco; Cancelar não chama `rotate`; Desvincular sem pareamento soft-disabled; Desvincular confirmado solta o pareamento e guarda o lembrete (portar os 2 testes de unlink de `PortalBackupActions.test.tsx`); Recuperar mostra o QR temporário e o fixo volta após `pagehide`

**Critério de Conclusão**: contrato `-t "US3"` verde, trava íntegra; suíte `src/features/settings` verde.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T016–T019. `PortalMoreOptions` (menu `Modal` com 3 `Button`s + `PortalConfirmDialog` para rotação e Desvincular; itens soft-disabled com o motivo `portal.moreUnavailable`); ações em `usePortalAccess` (`rotate('revoke')`, `recovery()` + `usePortalRecovery`, fluxo 072 de desvincular movido de `PortalBackupActions`); convite de recuperação ocupa o lugar do QR fixo e é descartado em segundo plano. Foco: fechar/cancelar devolve `more` (`close()` no painel).
- Contrato: `-t "US3"` verde (rodada completa 5/5); trava 075 íntegra.
- Testes executados: `PortalMoreOptions.test.tsx` (5: RETURN, Cancelar sem `rotate`, soft-disabled sem pareamento, Desvincular com lembrete guardado, Recuperar com QR temporário e `pagehide`). Os 2 testes de unlink de `PortalBackupActions.test.tsx` foram portados para cá.
- Pendências: edge case A4 (rotação/recuperação pendente) coberto só pelo teste "ACK concluído" do painel; sem caso dedicado de rotação pendente.

---

## Phase 6: User Story 4 - Backup como item próprio do menu (Priority: P2)

**Objetivo**: aba Backup logo após Portal & licença.

**Independent Test**: navegar até Backup e executar cada ação.

### Implementation

- [X] T020 [US4] `tv-web/src/features/settings/PortalBackupActions.tsx`: remover Desvincular (3 ações: Fazer backup agora, Restaurar backup, Apagar backup); motivo visível quando indisponível
- [X] T021 [US4] Emenda aprovada (R-001): em `tv-web/src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx` acrescentar `'Backup'` ao fim do array da linha 78 (nada mais) e regravar a trava: `powershell -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 067-configuracoes-lista-global -Write` (da raiz); registrar a emenda nas Execution Notes
- [X] T022 [US4] Criar `tv-web/src/features/settings/tabs/BackupTab.tsx` (`SettingsTabProps`; monta `PortalBackupActions` com `getPortalConnection()`; ↑/↓ entre as 3 ações, ← `exitToTabs`, ↑ no topo `goToTopbar`); `'backup'` em `SettingsTab` (`tabs/settingsTab.ts`) e entrada após `'portal'` em `tabs/settingsTabs.ts` (`labelKey: 'settings.tab.backup'`, ícone existente, ex. `history`)

### Testes da Fase

- [X] T023 [P] [US4] Ajustar `tv-web/src/features/settings/PortalBackupActions.test.tsx` (sem os testes de unlink, movidos para T019) e adicionar navegação/ação da `BackupTab` (`tv-web/src/features/settings/tabs/BackupTab.test.tsx`)

**Critério de Conclusão**: `npx vitest run src/features/settings` verde, incluindo o contrato da 067 emendado e `check-contract-tests.ps1 -Slug 067-configuracoes-lista-global` íntegro após a regravação.

**Registro da Fase**:

- Status: Concluída (2026-10-16)
- Feito: T020–T023. `PortalBackupActions` com 3 ações (título agora `h2`, motivo `portal.unconfigured` quando não há conexão); `BackupTab` (↑/↓/←, `exitToTabs`/`goToTopbar`); `'backup'` em `SettingsTab` e `SETTINGS_TABS` logo após `portal` (ícone `history`); chave `settings.tab.backup` ficou em `messages/portal.ts` (o teto de 470 linhas de `settings.ts` não comporta +3 linhas). **Emenda R-001 aplicada**: `SettingsScreen.configuracoes-lista-global.contract.test.tsx` linha 78 ganhou `'Backup'` no fim do array (nada mais) e a trava da 067 foi regravada (`check-contract-tests.ps1 -Slug 067-configuracoes-lista-global -Write`; diff do `.lock` = só `lockedAt` e sha256).
- Contrato: trava 067 `PASS: trava íntegra (5 testes de contrato)` após a regravação; trava 075 `PASS: trava íntegra (5 testes)`.
- Testes executados: `PortalBackupActions.test.tsx` (3, sem Desvincular), `tabs/BackupTab.test.tsx` (3); `npx vitest run src/features/settings src/lib/i18n` → 44 arquivos / 179 verdes; `npx tsc -b` limpo; `npm run lint` → `architecture: ok`.
- Pendências: nenhuma na fase.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T024 Atualizar o comentário de `tv-web/src/features/portal/PortalPairingPanel.tsx` (cita "Revogar acessos ao portal" → "Mais opções → Gerar nova chave e código") e qualquer outro comentário de produção que cite os rótulos antigos (constitution: documentação canônica)
- [X] T025 E2E: helper `tv-web/e2e/lib/portal.mjs` (aba + foco inicial por id) e roteiros `portal-configuracao.mjs`, `portal-dev-server.mjs`, `portal-pacote-file.mjs` (QR/ID/chave à vista, olho, Mais opções) — R-002
- [X] T026 E2E: `consulta-sob-demanda.mjs`, `entrada-listas-gerenciador.mjs` (nova chave via Mais opções → Gerar nova chave e código), `licenca-anual.mjs` (sem "Gerar QR"), `desvincular-backup.mjs` (Desvincular em Mais opções; backup na aba Backup), `configuracoes-lista-global.mjs` (lista de abas com "Backup"), conferir `compra-licenca-pix.mjs`
- [X] T027 `tv-web/e2e/legibilidade-tv.mjs`: auditar as abas Portal & licença (com código revelado e com o menu Mais opções aberto) e Backup em pt/en/es (FR-019)
- [X] T028 Remover chaves i18n sem uso (`portal.open`, `portal.showKey`, `portal.revoke`, `portal.revokeHint`, `portal.rotateCode`, `portal.rotateHint`, `portal.reveal`, `portal.privateWarning`, `portal.codeHint` se não reaproveitada) dos 3 idiomas, conferindo com Grep que nada mais as usa
- [X] T029 Gates: `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`, `npm run test:e2e` (com `npm run dev`), `node e2e/legibilidade-tv.mjs`
- [X] T030 Rodar `quickstart.md` (cenário ponta a ponta no navegador)
- [X] T031 [descoberta em T025] Roteiro novo `tv-web/e2e/portal-mais-opcoes.mjs` (porta 5180, no SUITE de `e2e/run.mjs`): Mais opções, nova chave com Cancelar/confirmar, aba Backup e Desvincular só por teclado — os testes unitários usam clique; faltava a prova de teclado ponta a ponta

### Checklist de Release

- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Contratos 075 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca` íntegro
- [X] Trava da 067 regravada pela emenda (T021) e íntegra
- [X] Lint (incl. ratchet de arquitetura), tsc, vitest e build limpos
- [X] `npm run test:e2e` verde e auditoria de legibilidade sem violações nas duas abas (pt/en/es)
- [X] `quickstart.md` executado
- [X] TV física fora do gate (decisão do usuário, R-003) — **não realizada**: leitura real do QR e segundo plano Tizen seguem sem prova

---

## Dependencies & Execution Order

- Fase 2 bloqueia todas.
- Fase 3 (US1) → Fase 4 (US2) (mesmo painel/aba; US2 usa o handle por id da US1).
- Fase 5 (US3) depende da Fase 3; Fase 6 (US4) pode rodar em paralelo à 5 depois da 3, mas T017 (mover Desvincular) e T020 (remover de `PortalBackupActions`) tocam o mesmo fluxo — fazer T017 antes de T020.
- Fase 7 depois de todas.

### Parallel Opportunities

- T001/T002/T004 em paralelo; T009/T010; T014/T015.

## Implementation Strategy

### MVP First

Fases 2 → 3 → 4 (US1 + US2, ambas P1) e validar; depois 5 e 6; Polish por último.

## Notes

- Commitar por fase.
- Nunca editar o arquivo de contrato da 075; a 067 só pela emenda T021.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
