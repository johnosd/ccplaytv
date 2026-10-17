---
description: "Tasks da feature 077 — redesenho do portal web mobile-first (listas, licença, chave TMDB, backup)"
---

# Tasks: Redesenho do portal web mobile-first — listas, licença, chave TMDB e backup

**Input**: Documentos de design de `sdd/specs/077-redesenho-portal-web/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/portal-api-tmdb.md, logic/shell-responsivo.md, logic/tmdb-estado.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Portal: `portal-web/src/` (comandos de `portal-web/`); estilos em `portal-web/src/styles/`; E2E em `portal-web/e2e/` (servidor já no ar: `npm run dev`, porta 5174).
- Serviço: `api/app/portal/` e `api/tests/portal/` (pytest com emulador: `$env:PORTAL_TEST_FIRESTORE='1'`, Firestore em `127.0.0.1:8085`).
- TV: `tv-web/src/lib/portal/` e `tv-web/src/features/portal/` (comandos de `tv-web/`).
- Textos novos em `portal-web/src/lib/i18n/areas/novoPortal.ts` (pt/en/es). Só tokens do DS; nenhum literal de cor/raio/fonte; mobile-first (`min-width`).
- **Os 5 arquivos `*.redesenho-portal-web.contract.*` e `tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts` são travados: nunca editar.** `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` depois de cada fase.
- No PowerShell, `npm run x -- --flag` perde o `--`: use `npx playwright test <arquivo>` / `node e2e/run.mjs --only a,b`.

## Phase 1: Setup

Nenhuma (sem dependência nova; os stubs de `lastDevice.ts`, `tmdbStatus.ts` e `tmdbRemote.ts` já existem).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: base visual, textos, navegação e leitura de dados compartilhados por todas as stories.

- [X] T001 [P] CSS base mobile-first: criar `portal-web/src/styles/tokens.css` (os tokens atuais de `styles.css` + `--control-h: 44px`, `--page-nav-bar`, áreas seguras), `base.css` (reset, tipografia ≥ 16 px nos campos, `:focus-visible`, `prefers-reduced-motion`, `min-width: 0`, `overflow-wrap`, alvos ≥ 44 px) e importá-los em `portal-web/src/main.tsx` **antes** de `styles.css` (o legado continua até o Polish) (`logic/shell-responsivo.md` §1)
- [X] T002 [P] i18n: criar `portal-web/src/lib/i18n/areas/novoPortal.ts` com as chaves de `logic/shell-responsivo.md` §8 em pt/en/es e fundir em `lib/i18n/index.ts` (o tipo `MessageKey` continua vindo de `pt`); estender `lib/i18n/index.test.ts` para exigir as mesmas chaves nos três idiomas
- [X] T003 [P] `portal-web/src/features/shell/navigation.ts`: tipos `Destination`/`View`, `navigate()`/`back()` sobre `history.pushState` **sem mudar a URL** e `onPopState` (D-002); `portal-web/src/features/shell/navigation.test.ts` (Vitest `node`, `history` injetado)
- [X] T004 [P] `portal-web/src/features/shell/useDashboard.ts` (extrai de `SourceManager.tsx` o `refresh` de `api.dashboard()` com `alive`/`loading`, atualização a cada 10 s só com a aba visível e ao voltar o foco) e `useTvSummary.ts` (`api.licenseDevice()` + último contato do snapshot; função pura `summaryState()` com as linhas da tabela de `logic/shell-responsivo.md` §3) + `summaryState.test.ts`
- [X] T005 [P] `portal-web/playwright.config.ts`: projeto padrão para os specs existentes e para os contratos (`testIgnore: /layout\.spec/`) e três projetos `mobile` (360×740, `hasTouch`), `tablet` (768×1024), `desktop` (1280×800) só para `layout.spec.ts` (`testMatch`)

**Checkpoint**: fundação pronta (nada visível ainda).

---

## Phase 3: User Story 1 - Entrar e ter o painel da TV à mão (Priority: P1) 🎯 MVP

**Objetivo**: entrada que lembra o ID, casca com três destinos (barra inferior/lateral), resumo da TV e Ajustes com as ações existentes; Revendedores e Recarregar saem.

**Independent Test**: em 360 px entrar sem QR, navegar entre os três destinos, sair e voltar com o ID preenchido.

### Contrato da Fase

- `US1-AC1/AC2/FR-003: lembra só o último ID válido…` (`lastDevice.redesenho-portal-web.contract.test.ts`)
- `US1-AC1..AC5/FR-001/FR-002/FR-003/FR-015/FR-016/SC-006/SC-007: três destinos…` (`shell.redesenho-portal-web.contract.spec.ts`)
- Comandos: `cd portal-web; npx vitest run src/features/session` e (com `npm run dev`) `npx playwright test e2e/shell.redesenho-portal-web.contract.spec.ts`

### Implementation

- [X] T006 [US1] Implementar `portal-web/src/features/session/lastDevice.ts` (`localStorage["ccplay-portal-last-device"]`, só ID normalizado, nunca lança; `rememberDevice`/`readRememberedDevice`/`forgetDevice`) → contrato: `lastDevice…`
- [X] T007 [US1] `portal-web/src/features/session/SessionPage.tsx` (mover de `features/SessionPage.tsx`): ID lembrado preenchido no formato do campo e foco na chave, botão **Usar outra TV** (`forgetDevice` + foco no ID), `rememberDevice` só depois de sessão obtida (manual e `kind: 'device'` do QR em `main.tsx`/`App.tsx`); manter rótulos `Endereço MAC da TV`/`Chave do dispositivo`/`Conectar` e a recusa uniforme (`logic/shell-responsivo.md` §6) → contrato: `shell…`
- [X] T008 [US1] Criar `portal-web/src/features/shell/PortalShell.tsx`, `NavBar.tsx` (`<nav aria-label="Principal">` com Listas/Licença/Ajustes e `aria-current`) e `TvSummary.tsx` (`<section aria-label="Resumo da TV">` com ID, selo de licença e último contato, usando `useTvSummary`) e `portal-web/src/styles/shell.css` (barra inferior `< 960 px`, menu lateral `≥ 960 px`, área segura, conteúdo com `padding-bottom` da barra) (§1–§3) → contrato: `shell…`
- [X] T009 [US1] `portal-web/src/App.tsx`: compor `PortalShell` com os três destinos e a navegação por `navigation.ts` (retorno do Checkout abre Licença); remover as abas do topo, o botão **Recarregar**, o destino **Revendedores** e apagar `features/SellersPage.tsx` e as chaves `sellers*`, `comingSoon`, `reload` de `lib/i18n/index.ts` (D-014) → contrato: `shell…`
- [X] T010 [US1] `portal-web/src/features/settings/SettingsPage.tsx` + `items.ts` (`SETTINGS_ITEMS`, D-011): `<ul aria-label="Ajustes">` com Backup (reaproveita `BackupCard`), Código de recuperação (reaproveita `RecoveryCodeCard`), Recuperar acesso (abre o fluxo atual de `RecoveryPage`), Ajuda (`FaqPage`) e **Sair** (`api.logout`, **mantém** o ID lembrado), cada um com título + uma linha de descrição (§5); sub-telas empilham no `history` e devolvem o foco a quem abriu → contrato: `shell…`

### Testes da Fase

- [X] T011 [P] [US1] Atualizar `portal-web/e2e/bootstrap.spec.ts` e `portal-web/e2e/recuperacao.spec.ts` para a casca nova (entrada, Ajustes → Recuperar acesso); `portal-web/src/features/shell/navigation.test.ts` e `summaryState.test.ts` (T003/T004) verdes

**Critério de Conclusão**: `cd portal-web; npx vitest run src/features/session` e `npx playwright test e2e/shell.redesenho-portal-web.contract.spec.ts` → 2/2 verdes, `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` íntegro; `npx vitest run`, `npm run lint`, `npx tsc --noEmit` limpos; `bootstrap.spec.ts` e `recuperacao.spec.ts` verdes.

**Checkpoint**: US1 funcional isoladamente (Listas/Licença ainda no layout antigo dentro da casca nova).

**Registro da Fase**:

- Status: Concluída (2026-10-16). A Fase 2 (T001–T005) fechou junto.
- Feito: Fase 2 — `styles/tokens.css` (tokens do DS + fontes, `--control-h` 44 px, `--nav-bar-h`) e `base.css` (reset, formulários, botões, mensagens, diálogos e utilitários movidos de `styles.css`, campos ≥ 16 px); área de textos `lib/i18n/areas/novoPortal.ts` (pt/en/es, fundida em `index.ts`; `index.test.ts` exige as mesmas chaves e nenhuma repetida); `shell/navigation.ts` + `useNavigation.ts` (estado + `pushState` sem mudar a URL); leitura única `shell/useTvData.ts` + `TvDataProvider.tsx` + regras puras `summaryState.ts`; `playwright.config.ts` com projetos `default`/`mobile`/`tablet`/`desktop`. Fase 3 — `session/lastDevice.ts`; `session/SessionPage.tsx` (ID lembrado preenchido, foco na chave, **Usar outra TV**, grava só depois da sessão; `main.tsx` também grava na entrada por QR); `shell/NavBar.tsx`, `TvSummary.tsx`, `PortalShell.tsx` + `styles/shell.css` (barra inferior < 960 px, menu lateral ≥ 960 px); `App.tsx` compõe a casca (Revendedores e Recarregar removidos, `SellersPage.tsx` e chaves `sellers*`/`comingSoon`/`reload` apagadas); `settings/SettingsPage.tsx` + `items.ts` (Backup, Código de recuperação, Recuperar acesso, Ajuda, Sair; sub-telas empilham no histórico e devolvem o foco ao item). **Desvios**: `useDashboard` + `useTvSummary` viraram um hook só (`useTvData`) com contexto, porque o resumo e as telas leem os mesmos dois recursos; o rótulo do campo de recuperação passou de "Código privado da licença" para "Código de recuperação" (pt/en/es), coerente com a 076; `Remover lista`/legado seguem até a Fase 4.
- Contrato: `npx vitest run src/features/session` → 1/1 verde (`lastDevice`); `npx playwright test e2e/shell.redesenho-portal-web.contract.spec.ts` → 1/1 verde (com `npm run dev` na 5174); `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → trava íntegra (5 testes).
- Testes executados: `npx vitest run` do portal → 16 verdes e 1 vermelho esperado (`tmdbStatus`, Fase 6); `npm run lint` e `npx tsc --noEmit` limpos; `npx playwright test` (projeto `default`): `bootstrap.spec.ts` (2, novo caso do QR que também lembra o ID) e `recuperacao.spec.ts` (2) verdes; 8 vermelhos esperados e de fases futuras: contrato `listas` (Fase 4), `gerenciador.spec.ts` (Período de teste duplicado entre resumo e tela antiga; Fase 4) e os 5 de `licenca.spec.ts` (Fase 5).
- Pendências: `SourceManager`, `LicensePage`, `BackupCard` e o CSS legado ainda estão dentro da casca nova e duplicam o resumo (saem nas Fases 4, 5 e 7); a FAQ ainda tem a categoria e a ação "Revendedores" (limpa na T038); `configuracao.spec.ts` passou sem mudança, mas será reescrito na T018.

---

## Phase 4: User Story 2 - Gerenciar listas rápido (Priority: P1)

**Objetivo**: Listas em cartões com selo de estado, ações contextuais, adicionar/editar em coluna única e excluir com confirmação.

**Independent Test**: em 360 px adicionar uma lista M3U, editar o nome de outra e excluir uma, conferindo selos e o próximo passo na TV.

### Contrato da Fase

- `US2-AC1..AC6/FR-005/FR-006/FR-007/SC-001: cartões com estado…` (`listas.redesenho-portal-web.contract.spec.ts`)
- Comando: (com `npm run dev`) `cd portal-web; npx playwright test e2e/listas.redesenho-portal-web.contract.spec.ts`

### Implementation

- [X] T012 [US2] `portal-web/src/features/lists/listStatus.ts`: `listStatus(source, configuration, operations, snapshot)` → `'onTv' | 'waiting' | 'error' | 'none'` e flags `canResend`/`canCancel` conforme `logic/shell-responsivo.md` §4 (módulo puro; `cancelled` = sem selo) → contrato: `listas…`
- [X] T013 [US2] `portal-web/src/features/lists/ListsPage.tsx` + `ListCard.tsx` (`<article>` com nome acessível = nome da lista; selo com texto e ícone; **Editar**/**Excluir** sempre, **Cancelar envio** só pendente, **Reenviar** só com Erro; botão **Adicionar lista** sempre visível — fixo acima da barra inferior no celular, no cabeçalho no PC) usando `useDashboard`; estado vazio com um botão e uma frase → contrato: `listas…`
- [X] T014 [US2] `portal-web/src/features/lists/DeleteDialog.tsx` (`<dialog>`: **Cancelar** / **Sim, excluir**; foco inicial em Cancelar; Esc fecha) e fluxo `source.delete` com `operationId` reaproveitado em falha de rede (padrão atual de `SourceManager.remove`) → contrato: `listas…`
- [X] T015 [US2] `portal-web/src/features/lists/ListEditor.tsx` (de `SourceForm.tsx`): coluna única, só os campos do tipo, teclado por campo, ≥ 16 px, barra de ações sticky **Enviar para a TV**/Cancelar no lugar da barra inferior, valores salvos na edição como hoje; manter rótulos `Nome da lista`, grupo `Tipo de lista`/`M3U por URL`, `URL da lista M3U`, botão `Enviar para a TV`; depois de enviar, status `Enviado — na TV, aperte Atualizar` e retorno à lista com o foco no cartão → contrato: `listas…`
- [X] T016 [US2] `portal-web/src/styles/lists.css` (grade de cartões 1 coluna → 2/3 colunas por `min-width`, selos, barra de ações) e remover `features/SourceManager.tsx`, `SourceForm.tsx`, `ConfigurationManager.tsx` e o CSS legado correspondente de `styles.css` depois de migrar; `OperationStatus.tsx` vira o selo/mensagem de integração (§4)

### Testes da Fase

- [X] T017 [P] [US2] `portal-web/src/features/lists/listStatus.test.ts` (tabela de estados, incl. `cancelled`, exclusão pendente, snapshot ausente)
- [X] T018 [P] [US2] Atualizar `portal-web/e2e/configuracao.spec.ts` e `portal-web/e2e/gerenciador.spec.ts` para a estrutura nova (cartões, Excluir/Sim excluir, mensagem do próximo passo)

**Critério de Conclusão**: `npx playwright test e2e/listas.redesenho-portal-web.contract.spec.ts` → 1/1 verde, trava íntegra; `npx vitest run`, lint e tsc limpos; `configuracao.spec.ts` e `gerenciador.spec.ts` verdes; sem rolagem horizontal em 360 px.

**Checkpoint**: US1 + US2 entregam o MVP.

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: `lists/listStatus.ts` (+ `collectLists`, `revisionOf`, `orphanDeletions`), `ListCard.tsx` (avatar, selo com texto e ponto de cor, Editar/Excluir sempre, Cancelar envio só pendente, Reenviar só com erro — fica visível porém `aria-disabled` com snapshot velho), `DeleteDialog.tsx` (`<dialog>`, foco em Cancelar, Esc cancela, devolve o foco), `ListEditor.tsx` (uma coluna, ações fixas no rodapé, EPG recolhido), `ListsPage.tsx` (lê o contexto `useTvData`, sem timer próprio; Adicionar flutuante no celular e no cabeçalho no PC; `operationId` reaproveitado em exclusão e reenvio após falha de rede; Voltar fecha o editor e devolve o foco ao botão de origem; exclusão pendente sem lista correspondente continua visível); `styles/lists.css`; `PortalShell` ganhou `data-view` para esconder a barra inferior no editor no celular. Removidos `SourceManager.tsx`, `SourceForm.tsx`, `ConfigurationManager.tsx` e `OperationStatus.tsx`. `configuracao.spec.ts` e `gerenciador.spec.ts` reescritos (7 + 3 casos; novos: Voltar devolve o foco, Reenviar só com erro, sem Reenviar sem erro). **Desvio**: `OperationStatus.tsx` foi apagado em vez de virar o selo — o selo e a mensagem de estado ficam em `ListCard`/`listStatus`.
- Contrato: `npx playwright test e2e/listas.redesenho-portal-web.contract.spec.ts --project=default` → 1/1 verde; `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → trava íntegra (5 testes).
- Testes executados: `npx vitest run` → 22 verdes + 1 vermelho esperado (`tmdbStatus`, Fase 6; `listStatus.test.ts` 6/6); `npm run lint` e `npx tsc --noEmit` limpos; `npx playwright test e2e/configuracao.spec.ts e2e/gerenciador.spec.ts e2e/listas.redesenho-portal-web.contract.spec.ts --project=default` → 13/13 verdes. Sem rolagem horizontal em 360 px verificado dentro do contrato; a medição nos 4 larguras fica no `layout.spec.ts` (T042).
- Pendências: o CSS legado `.source-*` e `.editor-*` de `styles.css` ficou sem uso (sai inteiro com o arquivo na T041); `licenca.spec.ts` (5 vermelhos) e `gerenciador.spec.ts` > backup seguem acoplados a `LicensePage`/`BackupCard` legados (Fases 5 e 7).

---

## Phase 5: User Story 3 - Comprar ou renovar a licença em um passo (Priority: P2)

**Objetivo**: cartão único de Licença com estado, validade, oferta e um botão; aceite como frase com o ID da TV.

**Independent Test**: em 360 px abrir Licença em teste e com licença ativa; conferir rótulo, validade, retorno do Checkout e pedido pendente.

### Implementation

- [X] T019 [US3] `portal-web/src/features/license/LicenseCard.tsx` (de `LicensePage.tsx`): estado + validade, oferta validada como hoje (3500, BRL, 12 meses, 1 TV, `manual`), botão grande **Comprar licença**/**Renovar licença** (`purchaseLabel`), frase `A licença será ativada na TV {id}.` junto ao botão (sem caixa de seleção), pedido pendente reaproveitado, `checkoutEnabled=false` com motivo e botão indisponível, `safeCheckoutUrl` e idempotência de tentativa intactos (`§7`); usar o `useTvSummary` (sem timer próprio)
- [X] T020 [US3] Retirar o `RecoveryCodeCard` da tela de Licença (já está em Ajustes, T010); retorno do Checkout (`?checkout=return`) abre Licença com o estado do pedido e o próximo passo "Na TV, aperte Atualizar"
- [X] T021 [US3] `portal-web/src/styles/license.css` e remover `features/LicensePage.tsx` e o CSS legado de licença

### Testes da Fase

- [X] T022 [P] [US3] Manter `safeCheckoutUrl` e seu teste (`features/license/LicenseCard.test.ts`, de `LicensePage.test.ts`); adicionar teste da frase/validação da oferta em módulo puro quando houver
- [X] T023 [P] [US3] Reescrever `portal-web/e2e/licenca.spec.ts` para o cartão único (rótulo Comprar/Renovar, frase com o ID, pedido pendente, checkout desabilitado, retorno do Checkout)

**Critério de Conclusão**: `licenca.spec.ts` verde em 360 px; `npx vitest run`, lint e tsc limpos; a compra continua exigindo 2 toques (SC-003) e a trava de contratos segue íntegra.

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: `license/LicenseCard.tsx` (estado + validade, preço R$ 35,00 · 12 meses · 1 TV, sem renovação automática, frase `A licença será ativada na TV {ID}.` junto do botão e sem caixa de seleção, botão único **Comprar licença**/**Renovar licença** por `purchaseLabel`, link **Continuar no Mercado Pago** no lugar do botão com pedido pendente, Pix/checkout em aberto da TV como aviso, venda desabilitada com motivo e `aria-disabled`; oferta validada como antes, `safeCheckoutUrl` e id de tentativa idempotente em `sessionStorage` intactos; sem timer próprio — relê a oferta e o pedido a cada leitura de `useTvData`); `styles/license.css`; `App.tsx` usa o cartão; `RecoveryCodeCard` saiu de Licença (fica em Ajustes → Código de recuperação). Removidos `LicensePage.tsx`, `LicensePage.test.ts` e o CSS `.license-*`/`.sellers-*` de `styles.css`. `LicenseCard.test.ts` mantém o teste de `safeCheckoutUrl`. `licenca.spec.ts` reescrito (7 casos; novos: dois toques para comprar — SC-003 —, sem caixa de seleção, frase com o ID, código de recuperação agora via Ajustes). **Desvio**: após pagamento aprovado o botão **Renovar licença** fica habilitado (antes ficava desabilitado até marcar a caixa); cada nova compra começa uma tentativa nova.
- Contrato: sem contrato nesta fase; trava segue íntegra (`check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → PASS, 5 testes).
- Testes executados: `npx playwright test e2e/licenca.spec.ts --project=default` → 7/7 verdes (1ª rodada: o caso 1 falhou uma vez por carga fria do servidor de dev esperando o título de Listas; passou nas duas rodadas seguintes e na suíte inteira, sem mudança de código); suíte `default` inteira → 25/25 verdes; `npx vitest run` → 22 verdes + 1 vermelho esperado (`tmdbStatus`, Fase 6); lint e `tsc --noEmit` limpos.
- Pendências: `BackupCard`/`RecoveryCodeCard`/`FaqPage` ainda são os antigos dentro de Ajustes (Fase 7); chaves de texto sem uso (`licenseConfirm`, `licenseBuy`, `yourDetails`, `summary`, `beforePay`…) ficam para a limpeza do Polish (T041); a leitura de Licença abre o card sem rolagem horizontal só foi conferida nos testes — a medição nas 4 larguras fica no `layout.spec.ts` (T042).

---

## Phase 6: User Story 4 - Chave TMDB pelo portal (Priority: P3)

**Objetivo**: adicionar, substituir e remover a chave TMDB pelo portal, com estado real e sem nunca devolver a chave; serviço + TV + portal.

**Independent Test**: com serviço e TV de teste, enviar uma chave no portal, apertar Atualizar na TV e ver "Aplicada na TV"; enviar uma inválida e ver "Recusada pelo TMDB"; remover.

### Gate de governança (ANTES de qualquer código desta fase)

- [X] T024 [US4] Escrever `sdd/adr/ADR-020-chave-tmdb-pelo-portal.md` (Contexto: BYOK só na TV e no backup cifrado; Decisão: chave digitada no navegador → serviço (cifrada, uma pendente por TV, apagada ao aplicar) → TV (só `GET` autenticado) → TMDB; nunca em log/URL/erro/`localStorage`/ack; resultado só `applied|rejected|retry`; risco aceito pelo usuário; Alternativas: só orientar, fora da feature) e uma nota "Atualização (ADR-020)" na ADR-013 e na ADR-016
- [X] T025 [US4] Emenda da constitution **1.15.0 (MINOR)**: nova exceção **(j)** em "Segredos Fora dos Clientes e dos Logs" (chave TMDB **BYOK da própria pessoa** digitada no portal pode transitar cifrada pelo serviço até a TV; chave de desenvolvedor/compartilhada continua proibida) + relatório de impacto no topo e linha de versão; refletir no `CLAUDE.md` (versão da constitution)

### Contrato da Fase

- `US4, FR-011: junta pendência, último resultado e o que a TV informou…` (`tmdbStatus.redesenho-portal-web.contract.test.ts`)
- `US4-AC2/AC3/AC4/Constitution Segredos: aplica, recusa, adia e remove…` (`tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts`)
- Comandos: `cd portal-web; npx vitest run src/features/settings` e `cd tv-web; npx vitest run src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts`

### Implementation

- [X] T026 [US4] `api/app/portal/models.py`: `TmdbIntegrationDocument` e `SnapshotDocument.integrations` opcional (`data-model.md` §1–§2); `repositories/control.py` (coleção `integrations` permitida, ao lado de `backups`); `retention.py` apaga o documento junto do aparelho
- [X] T027 [US4] `api/app/portal/tmdb_integration.py` (`TmdbIntegrationService`): `set`/`remove` (substitui a pendente na mesma transação e apaga o envelope antigo), `cancel`, `pull` (entrega só à TV, época/expiração), `ack` (`applied`/`rejected` gravam `last_*` e apagam o envelope; `retry` mantém), `view` para o navegador (nunca a chave), cifra `CipherContext(device_id, "tmdb-key", operation_id)`; nada em log
- [X] T028 [US4] `api/app/portal/routes/integrations.py` com as rotas de `contracts/portal-api-tmdb.md` (limite 10/h por TV no navegador, limite de `pull` na TV, `no-store`), registrar o router em `application.py`; `routes/operations.py`: `SnapshotInput.integrations` opcional e `GET /snapshot` devolve o campo
- [X] T029 [US4] `tv-web/src/lib/portal/tmdbRemote.ts`: implementar `applyRemoteTmdb` (D-008) e a fábrica de portas HTTP (`GET /device/integrations/tmdb`, `POST …/ack`) sem logar a chave; mapear `SaveTmdbKeyFailure` (`refused|invalid_format` → `rejected`; `offline|rate_limited` → `retry`); erro inesperado não confirma como aplicado e não carrega a chave → contrato: `tmdbRemote…`
- [X] T030 [US4] `tv-web/src/lib/portal/portalAgent.ts`: passo `'integrations'` entre `pull` e `snapshot` no escopo `lists` e porta opcional `applyIntegrations`; `portalSync.ts`/`publishSnapshot`: incluir `integrations.tmdb` (`getTmdbStatus` → `none|configured`); `features/portal/usePortalIntegration.tsx`: ligar a porta quando há conexão
- [X] T031 [US4] `portal-web/src/features/settings/tmdbStatus.ts`: implementar `resolveTmdbView` conforme `logic/tmdb-estado.md` → contrato: `tmdbStatus…`
- [X] T032 [US4] `portal-web/src/features/api.ts`: `api.tmdb` (`status`, `set(session, key, operationId)`, `remove`, `cancel`) e tipo de snapshot com `integrations`; `portal-web/src/features/settings/tmdbKeyFormat.ts` (v3 = 32 hex, v4 = JWT de 3 partes, apara espaços) + teste
- [X] T033 [US4] `portal-web/src/features/settings/TmdbPage.tsx`: estado (texto + ícone), campo da chave oculto por padrão com olho, **Adicionar/Substituir**, **Remover** (confirmação), link de como criar a chave, barra de ações sticky; limpa o campo após enviar; a chave nunca em endereço, `localStorage`, `console`, mensagem ou atributo; registrar o item **Chave TMDB** no início de `SETTINGS_ITEMS` e o CSS em `styles/settings.css`

### Testes da Fase

- [X] T034 [P] [US4] `api/tests/portal/test_tmdb_integration.py` (pytest com emulador; não é contrato): cifrado em repouso (marcador fora do documento), só a mesma TV lê, outra TV/época não, substituir apaga o envelope antigo, ack `applied`/`rejected` apagam o envelope e gravam `last_*`, ack `retry` mantém, ack repetido/obsoleto é idempotente, expira em 7 dias, marcador ausente de logs e respostas do navegador, limite de mutações
- [X] T035 [P] [US4] Testes da TV (`tv-web/src/lib/portal/portalAgent.integrations.test.ts`, `tmdbRemote.http.test.ts`): o passo roda só no escopo `lists`, depois do `pull`; falha do passo não derruba o snapshot; snapshot inclui `integrations.tmdb`
- [X] T036 [P] [US4] `portal-web/e2e/tmdb.spec.ts` (fixtures): adicionar → "Aguardando a TV"; aplicada; recusada; substituir; remover com confirmação; a chave digitada não aparece em DOM depois do envio, endereço, `localStorage` e requisições além do `PUT`

**Critério de Conclusão**: contratos `tmdbStatus` e `tmdbRemote` verdes e trava íntegra; `uv run pytest tests/portal -q` (emulador) e `uv run ruff check .` limpos; `npx vitest run src/lib/portal` e `npm run lint`/`tsc -b` da TV limpos; `tmdb.spec.ts` verde em 360 px; revisão de segredos (grep do marcador de teste em logs/respostas) sem ocorrência.

**Registro da Fase**:

- Status: Concluída (2026-10-16). Gate de governança (T024/T025) aceito pelo usuário antes do código: ADR-020 (Aceita, com o argumento de que a chave é gratuita e revogável) e constitution 1.15.0 (exceção (j)).
- Feito: **Serviço** — `TmdbIntegrationDocument` + `IntegrationsSnapshotDocument` (`models.py`), coleção `integrations` permitida, `tmdb_integration.py` (`request` substitui a pendente e apaga o envelope, `cancel`, `view` com `tvReported` do snapshot, `pull` só à mesma TV com cifra `(device, "tmdb-key", operação)`, `ack` `applied|rejected|retry` idempotente), rotas em `routes/integrations.py` registradas em `application.py`, `SnapshotInput.integrations` e `save_snapshot` que compara o campo. **TV** — `lib/portal/tmdbRemote.ts` (`applyRemoteTmdb` + `createTmdbRemoteStep` com validação da resposta e conferência de identidade), passo `integrations` entre `pull` e `snapshot` em `portalAgent.ts` (falha não derruba o snapshot), `snapshotPublisher` informa `integrations.tmdb`, `usePortalIntegration` liga a porta. **Portal** — `resolveTmdbView` (`tmdbStatus.ts`), `tmdbKeyFormat.ts` (v3/v4, apara espaços), `api.tmdb`, `TmdbPage.tsx` (campo oculto com olho, limpo após o envio, Remover com diálogo, Cancelar envio, link de como criar), item **Chave TMDB** no início de Ajustes, `styles/settings.css` (também estiliza lista e cabeçalho de Ajustes, que ainda não tinham CSS), textos pt/en/es. `DeleteDialog` ganhou título/texto/confirmação opcionais. **Desvios**: (1) o `GET` da TV tem limite próprio (`tmdb-pull` 3/10 s) — compartilhar o de `pull` (1/10 s) recusaria o pedido logo após o pull das listas no mesmo Atualizar; (2) estados `cancelled` e `expired` no documento (contrato e data-model atualizados); (3) `retention.py` não foi alterado: não existe remoção de aparelho que apague subcoleções, então o envelope some por cancelamento, ack, substituição, expiração ou mudança de `auth_epoch` (apagado na próxima leitura).
- Contrato: `cd portal-web; npx vitest run src/features/settings` → `tmdbStatus` verde; `cd tv-web; npx vitest run src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → trava íntegra (5/5 contratos da feature verdes).
- Testes executados: `api`: emulador Firestore (Java do Android Studio) + `PORTAL_TEST_FIRESTORE=1` → `pytest tests/portal` 172 passed (5 novos em `test_tmdb_integration.py`: cifrado em repouso e marcador fora do documento/logs/respostas, só a mesma TV, substituir apaga o envelope, ack applied/rejected/retry e idempotência, cancelar/expirar/mudar a época, limites, snapshot opcional) e `ruff check` limpo. `tv-web`: `tsc -b` e `npm run lint` (arquitetura ok) limpos; `vitest src/lib/portal src/features/portal` 31 arquivos verdes (+ `portalAgent.integrations.test.ts` 3 e `tmdbRemote.http.test.ts` 4 novos). `portal-web`: `vitest` 25 verdes (inclui `tmdbKeyFormat.test.ts`), lint e `tsc` limpos, Playwright `default` 31/31 (`tmdb.spec.ts` 6 novos).
- Pendências: revisão de segredos do Polish (T047) ainda faz o grep final de logs/respostas; `npm run test` completo da TV e o E2E da TV ficam para o gate do Polish (T046); o comportamento na TV física (Atualizar real contra o TMDB) é recomendação do Polish, não gate.

---

## Phase 7: User Story 5 - Excluir o backup e cuidar da conta em Ajustes (Priority: P4)

**Objetivo**: Backup e demais itens de Ajustes com texto claro, na ordem do FR-014.

**Independent Test**: com um backup de teste, abrir Ajustes em 360 px, excluir com confirmação e ver "Nenhum backup guardado"; percorrer Código de recuperação, Recuperar acesso, Ajuda e Sair.

### Implementation

- [X] T037 [US5] `portal-web/src/features/settings/BackupPage.tsx` (de `BackupCard.tsx`): data e contagens (favoritos/histórico/andamento) ou "Nenhum backup guardado", explicação de que a TV só volta a guardar quando a pessoa pedir, **Excluir backup** só com backup, confirmação (`<dialog>` Cancelar/**Sim, excluir**), mensagem "nada na TV foi apagado"; `api.backup`/`api.deleteBackup` inalterados
- [X] T038 [US5] Páginas de Ajustes: Código de recuperação (revelar por ação explícita como hoje), Recuperar acesso (fluxo atual) e **Ajuda** com a FAQ atualizada para a nova estrutura, o termo "código de recuperação" e a chave TMDB (`lib/i18n/faq.ts`, pt/en/es); descrições do §5 em cada item
- [X] T039 [US5] `portal-web/src/styles/settings.css` (lista de itens, páginas internas, barra de ações) e remover `features/BackupCard.tsx` e o CSS legado de backup

### Testes da Fase

- [X] T040 [P] [US5] `portal-web/e2e/ajustes.spec.ts` (fixtures): backup existente → excluir com confirmação → "Nenhum backup"; backup ausente sem botão de excluir; Ajuda abre dentro de Ajustes; ordem e descrições dos itens

**Critério de Conclusão**: `ajustes.spec.ts` verde em 360 px; Backup em ≤ 3 toques (SC-005); `npx vitest run`, lint e tsc limpos; contratos 1–3 ainda verdes.

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: `settings/BackupPage.tsx` (data e contagens ou "Nenhum backup guardado", **Excluir backup** só com backup, diálogo "Sim, excluir"/Cancelar com foco em Cancelar, texto "nada na TV é apagado", aviso "Backup apagado."; `api.backup`/`api.deleteBackup` inalterados; relê junto da leitura compartilhada) no lugar do `BackupCard` (removido); o rótulo pt passou de "Apagar backup" para "Excluir backup". FAQ (`lib/i18n/faq.ts`, pt/en/es) sem a categoria, ação e pergunta de Revendedores, com respostas para a estrutura nova (selo "Aguardando a TV"/"Erro", Reenviar, Cancelar envio, Licença, Ajustes → Código de recuperação) e perguntas novas sobre a chave TMDB e o backup; `FaqPage` sem classes legadas e `styles/faq.css` (migrado do `styles.css`; filtros rolam na horizontal no celular). Os itens de Ajustes (Chave TMDB, Backup, Código de recuperação, Recuperar acesso, Ajuda, Sair) já tinham a linha de descrição e a ordem do FR-014; `settings.css` nasceu na Fase 6. `gerenciador.spec.ts` perdeu o caso de backup, que agora é de `ajustes.spec.ts`.
- Contrato: sem contrato próprio nesta fase; `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → trava íntegra (5/5), contratos 1–3 verdes.
- Testes executados: `cd portal-web; npx playwright test --project=default` → 35/35 verdes (`ajustes.spec.ts` 5 novos: ordem e descrições, backup existente com cancelar/confirmar, backup ausente + foco ao voltar, Ajuda sem Revendedores com atalho para Licença, Sair com ID lembrado); `npx vitest run` 25 verdes; lint e `tsc --noEmit` limpos. Uma iteração: o campo do ID usa hífens (`A0-8C-…`), não dois-pontos.
- Pendências: o CSS legado de `styles.css` (`.faq-*`, `.management-*`, `.source-*`…) segue duplicado até a T041; classes que componentes ainda usam (`RecoveryCodeCard`, `RecoveryPage`, `SessionPage`…) serão auditadas na T041 antes de apagar o arquivo; SC-005 conta Ajustes → Backup → Excluir + confirmar, como a spec define.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T041 Apagar `portal-web/src/styles.css` (legado) e conferir que nada o referencia; `grep` por classes antigas (`portal-tabs`, `source-list-card`, `license-hero`…) sem ocorrência
- [X] T042 `portal-web/e2e/layout.spec.ts` (projetos `mobile`/`tablet`/`desktop`, mais 320 px): sem rolagem horizontal, todo alvo interativo ≥ 44 px, nomes acessíveis em todo controle, navegação inferior/lateral na faixa certa, resumo visível, foco inicial na entrada, Esc fecha confirmações, zoom 200% sem corte, em pt/en/es (`locale`)
- [X] T043 Documentação: `docs/portal/operacao.md` (seção "Chave TMDB pelo portal, ID lembrado e casca nova (feature 077)"), `portal-web/README.md`, `CLAUDE.md` (linha da ADR-020 e a descrição do portal), `.planning/backlog.md` via `update-feature-status.ps1`
- [X] T044 Gates do portal: `cd portal-web; npx vitest run; npm run lint; npx tsc --noEmit; npm run build; npx playwright test` (com `npm run dev`)
- [X] T045 Gates do serviço: `cd api; $env:PORTAL_TEST_FIRESTORE='1'; uv run pytest tests/portal -q; uv run ruff check .` (emulador no ar)
- [X] T046 Gates da TV: `cd tv-web; npm run lint; npx tsc -b; npm run test; npm run build; node e2e/run.mjs` (com `npm run dev`)
- [X] T047 Revisão de segredos (constitution "Fluxo de Desenvolvimento"): marcador de chave TMDB de teste fora de logs, respostas ao navegador, `localStorage`/`sessionStorage`, URLs e `console`; ID lembrado é o único dado novo no `localStorage`
- [X] T048 Rodar `quickstart.md` (cenário ponta a ponta com `npm run dev:portal`, em 360 px e 1280 px)

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: T041 — `src/styles.css` apagado; auditoria de classes (script que cruza `className` do código com as regras) achou só `brand*`, `portal-header`, `portal-footer` e `recovery-code-*` presas ao legado, migradas para `styles/standalone.css`; a regra de `prefers-reduced-motion` foi para `base.css`; `npm run build` passou de ≈ 37 KB de CSS para 26 KB. T042 — `e2e/layout.spec.ts` (projetos `mobile` 360, `tablet` 768 e `desktop` 1280; mais 320 px no `mobile`; pt/en/es): sem rolagem horizontal, alvos ≥ 44 px no toque e ≥ 36 px no PC, nomes acessíveis, navegação inferior/lateral na faixa certa, resumo visível, foco inicial no ID, Esc fecha confirmação. T043 — `docs/portal/operacao.md` (seção da 077), `portal-web/README.md`, `CLAUDE.md` (bullet do `portal-web/`). T044–T047 — gates e revisão de segredos (abaixo). T048 — roteiro ponta a ponta executado contra a pilha local real (emulador + API + portal + TV) por um E2E novo, `tv-web/e2e/chave-tmdb-pelo-portal.mjs`. **Defeitos achados e corrigidos na inspeção visual** (capturas em 360 e 1280 px, ainda não vistas antes): (1) a marca "CCPlayTV" aparecia dentro da barra inferior do celular porque `.brand` (carregado depois) vencia `.portal-nav-brand { display: none }` — especificidade aumentada; (2) no PC o botão "Adicionar lista" cobria o texto "último estado recebido" — o cabeçalho reserva o espaço; (3) o título tomava foco no carregamento em StrictMode — a casca compara com a tela anterior em vez de "primeira execução"; (4) o olho de mostrar/ocultar e o seletor Xtream/M3U tinham 36 e 34 px de altura — agora 44 px. **Fora do portal-web**: os E2E de integração da TV que leem o site (`consulta-sob-demanda`, `entrada-listas-gerenciador`, `portal-dev-server`) procuravam o título "Suas listas" (agora "Listas") e o primeiro tem uma régua de rotas permitidas à TV, à qual entrou `GET /device/integrations/tmdb` (uma por Atualizar de listas).
- Contrato: `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → trava íntegra, 5/5 contratos verdes (`lastDevice`, `tmdbStatus`, `tmdbRemote`, `shell`, `listas`).
- Testes executados: **portal-web** — `npm run lint` e `npx tsc --noEmit` limpos, `npx vitest run` 25/25, `npm run build` ok, `npx playwright test --project=default --project=mobile --project=tablet --project=desktop` → 45 passaram (2 puladas por desenho: o caso de 320 px só roda no `mobile`). **api** — emulador Firestore (Java do Android Studio) + `PORTAL_TEST_FIRESTORE=1`: `pytest tests/portal` 172 passed, `ruff check .` limpo. **tv-web** — `tsc -b` limpo, `npm run lint` (arquitetura ok), `npm run test` 619 arquivos / 3484 testes verdes, `node e2e/run.mjs` 52/52 scripts (196 s); pilha local real: `chave-tmdb-pelo-portal.mjs` (novo), `consulta-sob-demanda.mjs`, `entrada-listas-gerenciador.mjs`, `portal-dev-server.mjs` e `desvincular-backup.mjs` todos PASS. **Segredos (T047)** — a chave de teste não aparece em resposta do serviço, endereço, `localStorage`/`sessionStorage` (só `ccplay-portal-last-device` com o ID, e a sessão/pedido de licença que já existiam), console da TV nem log da API (verificado pelo E2E novo e por `test_tmdb_integration.py`); não há `console.*` nem logger nos arquivos da chave TMDB.
- Pendências: passada em TV física (a TV não ganha tela nova; só aplica a chave no Atualizar) é recomendação, fora do gate; chaves de texto sem uso em `lib/i18n/index.ts` (`licenseConfirm`, `licenseBuy`, `yourDetails`, `beforePay`, `summary`, `backupDeleteConfirm` segue em uso…) podem ser podadas num ajuste futuro, sem efeito no comportamento; `tv-web/e2e/chave-tmdb-pelo-portal.mjs` e os outros roteiros de portal ficam fora do `SUITE` do runner (exigem emulador), como os anteriores.

### Checklist de Release

- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída (ADR-020 e constitution 1.15.0 antes do código)
- [X] Fase 7 (US5) concluída
- [X] Contratos 5/5 verdes e `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` íntegro
- [X] Gates do portal, do serviço e da TV limpos (T044–T046) e roteiros E2E do portal verdes nas 4 larguras
- [X] Revisão de segredos sem ocorrência (T047)
- [X] `quickstart.md` executado
- [X] TV física fora do gate (a TV não ganha tela nova)
- [X] Fase 9 (Convergence) concluída

---

## Dependencies & Execution Order

- Fase 2 bloqueia todas.
- Fases 3 → 4 → 5 (mesma casca e mesmo `App.tsx`); Fase 6 depende da Fase 3 (registro de Ajustes) e **T024–T025 antes de T026–T033**; Fase 7 depois da 6 (ou em paralelo à parte de `api/`+TV da 6, que não toca o portal).
- Dentro da Fase 6: `api/` (T026–T028) e TV (T029–T030) são independentes entre si; o portal (T031–T033) só integra depois do contrato de rotas.
- Fase 8 depois de todas.

### Parallel Opportunities

- T001–T005; T017/T018; T022/T023; T034–T036; T040.

## Implementation Strategy

### MVP First

Fases 2 → 3 → 4 (US1 + US2, ambas P1) e validar no navegador em 360 px e 1280 px; depois Licença, depois a chave TMDB (com o gate de governança), depois Ajustes e Polish.

## Notes

- Commitar por fase. Nunca editar os arquivos de contrato.
- A US4 é a única fase que muda `api/` e `tv-web/`; as demais só tocam o `portal-web`.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
## Phase 9: Convergence

**Objetivo**: fechar as lacunas achadas pelo `sdd-converge` (2026-10-16) entre a spec e o código. Sem CRITICAL/HIGH; dois MEDIUM e três LOW.

- [X] T049 [US1] **MEDIUM** — Sessão expirada ou chave trocada na TV: quando a leitura compartilhada (`portal-web/src/features/shell/useTvData.ts`) recebe `access` (401/403), encerrar a sessão local (`rememberSession(undefined)`) e voltar à entrada (`App.tsx`) com o ID lembrado e uma mensagem clara em pt/en/es (chave nova em `areas/novoPortal.ts`), sem perder o ID. Teste Playwright em `e2e/` com o serviço respondendo 401 no meio da sessão. (origem: Edge Cases "sessão expirada ou chave trocada"; FR-004)
- [X] T050 [US2] **MEDIUM** — Teclado virtual sem esconder o campo focado: `scroll-padding-bottom` no `html` e `scroll-margin-bottom` nos campos do editor de lista e da chave TMDB, somando a altura da barra de ações fixa e a área segura (`env(safe-area-inset-bottom)`); conferir em 360 px (viewport reduzido pelo teclado) no `layout.spec.ts`. (origem: FR-016; plan R-009)
- [X] T051 [US2] LOW — Nome da lista não pode ser cortado: trocar a reticência de `.list-card-body h3` (`styles/lists.css`) por quebra em até 2 linhas mantendo o `title`, e fazer o `layout.spec.ts` falhar quando algum texto visível estiver cortado (`scrollWidth > clientWidth` em elementos com `overflow` oculto) em pt/en/es. (origem: SC-006)
- [X] T052 [US2] LOW — "Aplicado na TV": mostrar a mensagem (`appliedOnTv`) quando uma lista que aguardava passa a "Na TV" (aviso `role="status"` na tela de Listas) ou, se a decisão for manter só o selo, remover a chave morta dos três idiomas e registrar a decisão no `plan.md`. (origem: US2/AC6; FR-007)
- [X] T053 [P] LOW — Contraste AA verificado: teste puro em `portal-web/src/styles/` (ou `src/lib/`) que lê `styles/tokens.css`, calcula a razão de contraste dos pares texto/fundo usados (primário, secundário, mudo, destaque, sobre o destaque, sucesso, aviso, perigo) e exige ≥ 4,5:1 (≥ 3:1 só para texto grande/ícones). (origem: FR-017)

**Critério de Conclusão**: T049–T053 marcadas; `npx vitest run`, lint, `tsc` e `npx playwright test` (4 projetos) do `portal-web` limpos; `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` íntegro; depois, `sdd-converge` outra vez sem achados.

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: T049 — `SessionGuard` encerra a sessão local em 401/403, preserva o ID lembrado, limpa a chave e mostra o aviso traduzido; T050 — token `--action-bar-safe-bottom`, `scroll-padding-bottom` no documento e `scroll-margin-bottom` nos campos do editor/TMDB; T051 — título de lista quebra em até duas linhas e a auditoria encontra texto visível cortado; T052 — `ListsPage` anuncia `Aplicado na TV` somente na transição observada de `waiting` para `onTv`; T053 — `tokens.contrast.test.ts` calcula contraste dos pares de tokens (AA para texto, 3:1 para indicadores grandes).
- Contrato: `check-contract-tests.ps1 -Slug 077-redesenho-portal-web` → trava íntegra (5 testes de contrato, arquivos sem alteração).
- Testes executados: `cd portal-web; npx vitest run` → 11 arquivos / 28 testes verdes; `npm.cmd run lint` e `npx tsc --noEmit` limpos; `npm.cmd run build` verde; `npx playwright test --project=default --project=mobile --project=tablet --project=desktop` → 50 verdes, 4 pulados por desenho (os cenários 320 px e teclado virtual só no projeto mobile). Focados antes do gate: `layout.spec.ts --project=mobile` → 5/5 e `gerenciador.spec.ts -g 'lista aguardando'` → 1/1.
- Pendências: Nenhuma de execução. Rodar `sdd-converge` novamente para conferir a spec contra a implementação e encerrar a feature.
