---
description: "Tasks da feature 073 — compra de licença por Pix na TV e renovação pelo portal"
---

# Tasks: Compra de licença por Pix na TV e renovação pelo portal

**Input**: Documentos de design de `sdd/specs/073-compra-licenca-pix/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/portal-api-073.md, logic/pix-e-codigo.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Serviço (Cloud Run): `api/app/portal/`, testes em `api/tests/portal/` (pytest + emulador, `PORTAL_TEST_FIRESTORE=1`).
- TV: `tv-web/src/` (lib em `lib/`, telas em `features/`, componentes em `components/`), E2E em `tv-web/e2e/*.mjs`
  registrados em `tv-web/e2e/run.mjs`.
- Portal: `portal-web/src/`, E2E em `portal-web/e2e/*.spec.ts`.
- Normativo: `.planning/memory/constitution.md`, `sdd/adr/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Base normativa e configuração.

- [X] T001 Propor ao usuário e, **só com aprovação**, aplicar a constitution 1.13.0 em `.planning/memory/constitution.md`: exceção (i) em "Segredos Fora dos Clientes e dos Logs" — por ação da pessoa (Atualizar), a TV PODE enviar ao serviço o código de recuperação que já guarda; o serviço confere o HMAC, guarda cópia cifrada e a revela só à sessão autenticada da mesma TV por ação explícita (POST, CSRF, `no-store`, limite), nunca em URL/log/erro/cache/analytics/checkout/exportação; risco aceito (R-003). Relatório de impacto e histórico no topo. Bloqueia a Fase 5.
- [X] T002 [P] Anexar `**Atualização (073):**` em `sdd/adr/ADR-013-portal-controle-serverless-google-cloud.md`: Pix dinâmico pela API de pagamentos (D-001), recebimento pelo Atualizar (D-004, ADR-016 intacta), pedido excedente (D-005), cópia cifrada do código (D-008).
- [X] T003 [P] Setting `pix_payer_domain` (env `CCPLAY_PORTAL_PIX_PAYER_DOMAIN`) em `api/app/portal/settings.py`, obrigatória quando `checkout_enabled` e Mercado Pago configurados (falta → rota de Pix responde 503); documentar em `docs/portal/deploy-staging.md`.

---

## Phase 2: Foundational — Pix e concessão no serviço (Blocking Prerequisites)

**Purpose**: Rotas e regras do serviço que a TV (US1) e o portal (US2) consomem.

**⚠️ CRITICAL**: US1 e US2 dependem desta fase.

- [X] T004 Campos `pix_payment_id`, `pix_qr_code` (`repr=False`, ≤ 1024), `pix_expires_at`, `pix_attempt`, `parent_order_id` em `OrderDocument` (`api/app/portal/commercial_models.py`), conforme `data-model.md`.
- [X] T005 `PixCharge` e `PaymentProvider.pix` em `api/app/portal/providers/base.py`; `MercadoPagoProvider.pix` em `providers/mercadopago.py` (`_request` com `headers` opcionais sem aceitar `authorization`; valida resposta: id numérico, copia-e-cola `000201…` ≤ 1024 ASCII, prazo aware; descarta `qr_code_base64`/`ticket_url`); `FakePaymentProvider.pix` em `providers/fake.py` (determinístico, conta chamadas). Research §1–§2; R-001.
- [X] T006 Módulo novo `api/app/portal/pix_orders.py` com `pix(principal, request_id, renew, now)`, `refresh_pix(principal, order_id, now)` e `pix_view(order, display_id, now)` seguindo `logic/pix-e-codigo.md` §1 (reaproveita `reserve_order`, lease do `checkout`, limite só ao chamar o provedor, job `order-<id>`).
- [X] T007 Em `api/app/portal/payments.py`: D-006 no ramo `else` de `reconcile_payment` (tentativa antiga não mexe no pedido) e zerar `pix_qr_code` quando o pedido sai de `created`/`pending` (também em `repositories/licensing_repository.py::approve` e `licensing.py::resume_refund`).
- [X] T008 `approve_surplus` em `api/app/portal/repositories/licensing_repository.py` e `refund` achando o pedido pelo `paymentClaims/{paymentId}` em `api/app/portal/licensing.py` (`logic/pix-e-codigo.md` §5, D-005).
- [X] T009 Rotas TV `POST /portal/v1/device/orders/pix` e `POST /portal/v1/device/orders/pix/refresh` em `api/app/portal/routes/licensing.py` (`tv_principal`, corpo estrito, `Cache-Control: no-store`, `checkout_enabled` → 503, limite `pix-refresh/<deviceId>`), conforme `contracts/portal-api-073.md`.

### Testes da Fase

- [X] T010 [P] `api/tests/portal/test_pix.py` (+ caso Pix em `test_mercadopago.py` com `httpx.MockTransport`): reabrir reaproveita sem chamar o provedor; vencido → `expired` sem criar; `renew` cria tentativa nova com chave de idempotência nova; venda desligada → 503; refresh concilia e só aprova por lookup; D-006; dois pagamentos aprovados → dois grants (+24 meses) e notificação repetida não soma; estorno do excedente; `repr`/erros sem copia-e-cola; outra TV → 401.

**Critério de Conclusão**: `pytest tests/portal/test_pix.py tests/portal/test_mercadopago.py tests/portal/test_payments.py tests/portal/test_licensing.py -q` com `PORTAL_TEST_FIRESTORE=1` verde (nenhum `skipped` nesses arquivos) e `ruff check .` limpo.

**Checkpoint**: Fundação pronta — US1 e US2 podem começar.

**Registro da Fase**:

- Status: Concluída (2026-10-15).
- Feito: campos Pix e `parent_order_id` em `OrderDocument`; `PixCharge`/`valid_pix_code` e `pix()` no provedor (Mercado Pago com `X-Idempotency-Key`, fake contando chamadas); `api/app/portal/pix_orders.py` (`PixOrders.pix/refresh/pending_order`, `pix_view`); D-006 e limpeza do copia-e-cola em `payments.py`/`approve`/`resume_refund`; `approve_surplus` (D-005) com estorno roteado pelo `paymentClaim` em `reconcile_payment` (não em `licensing.refund`, que não precisou mudar); rotas `POST /device/orders/pix` e `/pix/refresh` (`no-store`). Decisão de execução: "Gerar novo Pix" com Pix ainda pagável devolve o mesmo (sem dois Pix válidos em paralelo) — R-012.
- Contrato: sem contrato nesta fase (contratos são da TV, Fases 3/5); trava 073 íntegra.
- Testes executados: `cd api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider "--basetemp=<scratchpad>\pytest"` → 158 passed, 0 skipped (5 novos em `test_pix.py`, 1 novo em `test_mercadopago.py`); `ruff check .` limpo. Duas iterações: 2º dispositivo com `AuthService` próprio falhava pelo motivo errado (trocado por pedido de outra TV) e `tmp_path` sem permissão (resolvido com `--basetemp`).
- Pendências: Pix real no sandbox do Mercado Pago (R-001) fica para a T030 (staging, com confirmação do usuário).

---

## Phase 3: User Story 1 - Pagar a licença com Pix direto na TV (Priority: P1) 🎯 MVP

**Objetivo**: Comprar licença → Pix na TV → pagar no banco → Atualizar → entra na lista.

**Independent Test**: build comercial, teste vencido, portal fictício (E2E) ou staging de teste; bloqueio → Comprar → Atualizar com pagamento aprovado → lista abre (quickstart §3 passos 1–9).

### Contrato da Fase

- `abre com um único pedido de Pix e mostra copia-e-cola, R$ 35, 12 meses, ID da TV e prazo; setas não consultam` — US1/AC1, FR-002, FR-003, SC-004
- `Atualizar com Pix pendente explica e mantém o QR; Atualizar com pagamento aprovado chama onLicensed uma vez` — US1/AC2–AC3, FR-005–FR-007
- `falha de rede tem Tentar novamente e Voltar sem falar em recusa; Pix vencido só é trocado por Gerar novo Pix` — US1/AC5–AC7, FR-004, FR-007, FR-013
- `abre e atualiza pelas rotas fixas, só busca a licença quando aprovado e recusa resposta adulterada sem ecoar` — FR-002, FR-005, FR-006, FR-008, FR-012
- Comando (em `tv-web/`): `npx vitest run src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts`

### Implementation

- [X] T011 [US1] Implementar `createPixPurchase` em `tv-web/src/lib/licensing/pixPurchase.ts` (stub existente; `logic/pix-e-codigo.md` §2) → contrato: `abre e atualiza pelas rotas fixas…`
- [X] T012 [P] [US1] Textos da tela e do gate (pt/en/es) em `tv-web/src/lib/i18n/messages/portal.ts`: título, estados da tabela §3 (strings pt exatas do contrato), "Comprar licença", "Renovar licença", novo `portal.gate.steps` citando Comprar licença e o site para cartão.
- [X] T013 [US1] Implementar `LicensePixScreen` em `tv-web/src/features/portal/LicensePixScreen.tsx` + `LicensePixScreen.css` (tokens V14, QR ≥ 480 px no palco com `FixedQr`, copia-e-cola com quebra) seguindo §3 → contratos: `abre com um único pedido…`, `Atualizar com Pix pendente…`, `falha de rede…`
- [X] T014 [US1] Registro `tv-web/src/lib/licensing/pixPurchaseRuntime.ts` (`registerPixPurchaseOpener`/`openPixPurchase`) e, em `tv-web/src/features/portal/usePortalIntegration.tsx`, a porta de produção (`createPixPurchase` memo por `connection`) + renderização da tela aberta pelo painel (D-010).
- [X] T015 [US1] `tv-web/src/features/portal/LicenseGate.tsx`: ações Comprar licença (0)/Atualizar (1)/Voltar (2); troca para `LicensePixScreen` desmontando o próprio `Modal`; `onLicensed` reaproveita a retomada da lista negada; `onBack` volta com foco em 0 (D-010, D-011, R-006).
- [X] T016 [US1] `tv-web/src/features/settings/PortalLicensePanel.tsx` + `tabs/PortalLicenseTab.tsx`: ação no índice 7 com rótulo Comprar/Renovar, `BACKUP_FIRST = 8`, abre por `openPixPurchase`, foco volta ao 7; sem `connection` → soft-disabled (D-011, R-007). Conferir `node scripts/architecture.mjs` (sem import feature→feature novo).

### Testes da Fase

- [X] T017 [P] [US1] Atualizar `tv-web/src/features/portal/LicenseGate.test.tsx` (Comprar abre a tela; RETURN volta com foco em Comprar; aprovado retoma a lista) e `tv-web/src/features/settings/PortalLicensePanel.test.tsx` (índices novos, rótulo Renovar com licença ativa).
- [X] T018 [US1] E2E novo `tv-web/e2e/compra-licenca-pix.mjs` (modelo `licenca-anual.mjs`, portal fictício por interceptação): bloqueio → Comprar → QR/copia-e-cola → RETURN → reabrir mesmo Pix → Atualizar pendente → aprovado → lista abre; contagem de requisições zero ao só mover o foco (SC-004); registrar em `tv-web/e2e/run.mjs`.
- [X] T019a [US1] *(desvio aprovado pelo usuário em 2026-10-15, descoberto na T018; bug pré-existente da 069/071, R-014)* Remover a disputa de trava do Firestore nas leituras concorrentes do portal: `AuthService.authenticate_session` (`api/app/portal/auth.py`) valida por leitura e toca `lastSeenAt` com escrita otimista serializada por sessão no processo; `/session/device` usa `LicensingService.entitlement(..., persist=False)` (`api/app/portal/licensing.py`). Testes de regressão em `api/tests/portal/test_auth.py` e `test_licensing.py`; `node e2e/consulta-sob-demanda.mjs` 3/3.
- [X] T019 [P] [US1] Incluir a tela de Pix (pending, expired, erro) em `tv-web/e2e/legibilidade-tv.mjs` (pt/en/es).

**Critério de Conclusão**: comando do contrato → 4/4 verdes e `check-contract-tests.ps1 -Slug 073-compra-licenca-pix` íntegro; travas 069/070/071/072/026 íntegras; `npx tsc -b`, `npm run lint`, testes de T017 e `node e2e/compra-licenca-pix.mjs` verdes; legibilidade sem achados nas telas novas.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-15).
- Feito: `createPixPurchase` + `parsePixCharge` (`lib/licensing/pixPurchase.ts`); `LicensePixScreen` + CSS (QR 480 px, copia-e-cola, prazo local, estados da tabela §3, props opcionais `site`/`readExpiry`); textos pt/en/es numa área nova `lib/i18n/messages/purchase.ts` (o `portal.ts` estourou o teto de 300 linhas do ratchet; registrada em `pt/en/es.ts` e `areas.test.ts`); `lib/licensing/pixPurchaseRuntime.ts` + porta de produção e tela aberta pelo painel em `usePortalIntegration.tsx`; bloqueio com Comprar licença (0)/Atualizar (1)/Voltar (2); painel com a ação no índice 7 (Comprar/Renovar), backup em 8–11. Dois bugs da própria fase corrigidos inline: (1) o `licenseMonitor` fechava o bloqueio ao chegar a licença e desmontava a tela de Pix antes do `onLicensed` — a lista negada nunca era retomada (R-013); (2) no dev (StrictMode) a trava `busy` da tela impedia a segunda abertura e a tela ficava em "Gerando o Pix…" (trocada por "chamada viva não abortada").
- Contrato: `npx vitest run src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts` → 4/4 verdes; trava 073 íntegra; travas 072/071/070/069/026 íntegras e seus contratos 25/25 verdes.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem violação (só avisos herdados); `npx vitest run src/features/portal src/features/settings src/lib/licensing src/lib/portal src/lib/i18n` verdes (exceto o contrato da Fase 5, vermelho esperado); `LicenseGate.test.tsx` +1 caso e `PortalLicensePanel.test.tsx` +1 caso; `node e2e/run.mjs --only licenca-anual,compra-licenca-pix` → 2/2; `node e2e/legibilidade-tv.mjs` → 96 telas, 0 achados (Pix pendente/vencido/sem conexão em pt/en/es). E2E novo usa a porta 5179 (5177 é da legibilidade).
- Pendências: `node e2e/consulta-sob-demanda.mjs` (071, fora do `run.mjs`) falha no passo 4 por "Transaction lock timeout" do emulador — **também na base sem a 073** (export do HEAD: 2/2 falhas; árvore atual 4/4; base passou 1 vez antes). Bug pré-existente, fora do escopo; o usuário pediu para corrigir agora → T019a (R-014 resolvido, 3/3 PASS).

---

## Phase 4: User Story 2 - Renovar pelo portal e receber na TV (Priority: P2)

**Objetivo**: Aba Renovar/Comprar licença sempre visível, aviso de Pix pendente, mesmo checkout; TV recebe no Atualizar.

**Independent Test**: sessão de portal de TV de teste; Renovar licença → checkout de teste → Atualizar na TV (quickstart §3 passo 10).

### Implementation

- [X] T020 [US2] `GET /portal/v1/session/device` em `api/app/portal/routes/licensing.py` com `pendingOrder` (Pix pendente válido ou checkout pendente, sem copia-e-cola) — `contracts/portal-api-073.md`.
- [X] T021 [US2] Portal: rótulo da aba por estado em `portal-web/src/App.tsx`; `portal-web/src/features/LicensePage.tsx` com aviso de Pix pendente (sem nova cobrança automática), validade atual e oferta; tipos em `features/api.ts`; textos pt/en/es em `lib/i18n/index.ts` e FAQ em `lib/i18n/faq.ts` (Pix direto na TV, Atualizar).

### Testes da Fase

- [X] T022 [P] [US2] pytest de `pendingOrder` (em `api/tests/portal/test_pix.py`) e casos em `portal-web/e2e/licenca.spec.ts` (rótulo Comprar no teste / Renovar com licença ativa, aviso de Pix pendente sem criar pedido).

**Critério de Conclusão**: pytest e `portal-web` lint/test/build/E2E verdes; renovação antecipada soma 12 meses (pytest) e o Atualizar da TV a recebe (E2E da Fase 3 com licença ativa ou quickstart §3 passo 10).

**Registro da Fase**:

- Status: Concluída (2026-10-15).
- Feito: `pending_order` virou função pura de leitura em `api/app/portal/pix_orders.py` (não depende do Mercado Pago configurado, então não derruba `/session/device`) e `/session/device` devolve `pendingOrder` (Pix válido ou checkout aberto, sem copia-e-cola). Portal: `purchaseLabel`/`PendingOrder`/`LicenseState` em `features/api.ts`; aba e atalho do card com Comprar licença (teste) / Renovar licença (licença paga) em `App.tsx` e `SourceManager.tsx`; `LicensePage` com o aviso de pedido em aberto (o botão segue no mesmo pedido, sem cobrança nova); chaves pt/en/es; FAQ com Pix direto na TV, Atualizar na TV e renovação somando ao vencimento.
- Contrato: sem contrato nesta fase; trava 073 íntegra.
- Testes executados: pytest `test_pix.py`/`test_auth.py`/`test_licensing.py` 19/19 (novo `test_portal_sees_pending_pix_without_code_and_no_new_charge`), `ruff` limpo; `portal-web`: `npm run lint`, `npm run build`, `npm run test` 7/7, `npx playwright test` 17/17 com `npm run dev` na 5174 (caso novo em `licenca.spec.ts`; `licenca.spec.ts` e `gerenciador.spec.ts` atualizados para os rótulos novos). Renovação antecipada somando 12 meses já coberta pelos testes de calendário da 069 (`test_licensing.py`).
- Pendências: nenhuma. O E2E do portal não sobe servidor sozinho: exige `npm run dev` do portal-web na 5174.

---

## Phase 5: User Story 3 - Consultar e guardar a licença para reinstalação (Priority: P3)

**Objetivo**: Código de recuperação no portal por ação explícita, a partir da cópia cifrada enviada pela TV.

**Independent Test**: TV de teste aperta Atualizar; portal mostra o mesmo código de Portal & licença; recuperação pelo site funciona com ele (quickstart §3 passos 12–13).

**Pré-requisito**: T001 aprovada e aplicada.

### Contrato da Fase

- `envia o código de recuperação só no corpo, uma vez por versão, e reenvia só quando a versão muda` — FR-011, FR-012, D-008
- Comando (em `tv-web/`): `npx vitest run src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts`

### Implementation

- [X] T023 [US3] Serviço: `RecoveryEscrowDocument` em `api/app/portal/models.py`, `api/app/portal/recovery_escrow.py` (put com HMAC/versão, reveal só com HMAC corrente, limites), rotas `PUT /portal/v1/device/recovery-code/escrow` e `POST /portal/v1/session/recovery-code` (`no-store`, CSRF) registradas em `api/app/portal/application.py`, limpeza em `api/app/portal/retention.py`.
- [X] T024 [US3] Implementar `escrowRecoveryCode` em `tv-web/src/lib/portal/recoveryEscrow.ts` (stub existente; §4) e o campo `escrowedCodeVersion` em `tv-web/src/lib/portal/portalTables.ts` → contrato: `envia o código de recuperação só no corpo…`
- [X] T025 [US3] Passo `escrow` no agente (`tv-web/src/lib/portal/portalAgent.ts`: porta opcional, antes de `license` e depois de `uploads`, falha não derruba o Atualizar — D-009) e ligação em `tv-web/src/features/portal/usePortalIntegration.tsx`.
- [X] T026 [US3] Portal: `portal-web/src/features/RecoveryCodeCard.tsx` na aba de licença (mostrar por clique, aviso de credencial privada, esconder em `visibilitychange`, `409 not_escrowed` → orientação), chamada em `features/api.ts`, textos pt/en/es e FAQ.

### Testes da Fase

- [X] T027 [P] [US3] `api/tests/portal/test_recovery_escrow.py`: HMAC/versão errados → 409 sem gravar; certo → cifrado (nada em claro no documento); reveal da mesma TV com `no-store`; outra sessão/TV → 401; escrow velho após rotação → 409 `not_escrowed`; limite 429.
- [X] T028 [P] [US3] Caso do passo `escrow` em `tv-web/src/lib/portal/portalAgent.test.ts` (falha não derruba a licença) e caso "mostrar código" em `portal-web/e2e/licenca.spec.ts`.

**Critério de Conclusão**: comando do contrato → 1/1 verde e trava íntegra; pytest/ruff, `npx tsc -b`, `npm run lint`, testes do agente e E2E do portal verdes.

**Registro da Fase**:

- Status: Concluída (2026-10-15).
- Feito: serviço — `RecoveryEscrowDocument` (`models.py`), `recovery_escrow.py` (put só com HMAC+versão do dispositivo, cifra com `PortalCrypto`/`CipherContext(deviceId,"recovery-code",versão)`, reenvio idempotente; reveal só com HMAC corrente, limites 10/h e 5/10 min), rotas `PUT /device/recovery-code/escrow` (204, `no-store`) e `POST /session/recovery-code` (CSRF, `no-store`) em `routes/recovery_escrow.py` registradas em `application.py`; `recoveryEscrow` em `document_path`; código `not_escrowed` em `AUTH_CODES`. **Desvio do plano:** `retention.py` não mudou — a cópia é um documento único sobrescrito (`current`), registros de dispositivo não são expurgados (o `backups` da 072 também não entra na retenção) e cópia velha nunca é revelada (comparação por HMAC). TV — `escrowRecoveryCode` + `escrowedCodeVersion`; passo `escrow` no agente (antes de `license`, depois de `uploads`, falha só registra `escrow_failed`) ligado em `usePortalIntegration`. Portal — `api.revealRecoveryCode`, `RecoveryCodeCard` na aba de licença (mostrar/ocultar, aviso, some em `visibilitychange`, 409 → orientação), textos pt/en/es, estilo, FAQ. `e2e/consulta-sob-demanda.mjs`: rota nova na régua de rotas permitidas (é ação da pessoa — Atualizar).
- Contrato: `npx vitest run src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts` → 1/1; os 5 contratos da feature juntos → 5/5 verdes; trava íntegra.
- Testes executados: pytest `tests/portal` 163/163 (novo `test_recovery_escrow.py` 2/2), `ruff` limpo; TV `npx tsc -b`, `npm run lint` (sem violação), `npx vitest run src/lib/portal src/features/portal src/features/settings` 221/221, `portalAgent.test.ts` 10/10 (caso novo); portal `npm run lint`, `npm run build`, `npm run test` 7/7, `npx playwright test` 18/18 (caso novo do código); `node e2e/consulta-sob-demanda.mjs` PASS na pilha real (API + emulador), exercitando o envio da cópia. Uma iteração: no teste do serviço, a rotação troca a época de autenticação e o `principal` antigo vira 401 (comportamento certo) — o teste passou a reconstruir o `principal` a partir do registro atual.
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentação, validação ponta a ponta e gates.

- [X] T029 [P] Documentação: `docs/portal/operacao.md` (Pix, `pix_payer_domain`, pedido excedente, escrow), FAQ do portal já em T021/T026 conferido; nenhum status de feature no `CLAUDE.md`.
- [X] T030 Staging de teste (**só com confirmação do usuário**): publicar a API antes do pacote; validar Pix sandbox (R-001), pagamento aprovado/pendente/vencido e Pix + cartão no mesmo pedido; registrar em `sdd/specs/073-compra-licenca-pix/evidencias/staging.md`. **Resultado:** API publicada (`ccplaytv-portal-00020-nzt`, jobs `00019-sk9`); compra com cartão de teste no Checkout Pro aprovada e recebida pelo Atualizar da TV (365 dias); cópia/revelação do código validadas. **Pix não validado no provedor real** (conta vendedora de teste sem Pix; decisão do usuário) — R-001.
- [X] T031 Suítes completas: TV `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`, `npm run test:e2e` (com `npm run dev`); API `pytest tests/portal` + `ruff`; portal lint/test/build/E2E; travas 073/072/071/070/069/026.
- [X] T032 Revisão de segredos: copia-e-cola, ids de pagamento e código de recuperação fora de logs, `repr`, erros, diagnósticos, URLs e caches; respostas `no-store` conferidas; registrar em `sdd/specs/073-compra-licenca-pix/evidencias/segredos.md`.
- [X] T033 Rodar `quickstart.md` §3 no navegador e registrar o resultado.
- [X] T034 TV física (**gate SC-007, só com confirmação do usuário**, skill `tizen-tv`): QR Pix lido do sofá, fluxo por controle remoto, atualização preservando dados. — 2026-10-16, veredito do usuário: QR do portal, Comprar (indisponível no staging, esperado), compra por cartão no portal com retorno correto, Atualizar recebeu a licença (15/10/2027) e a 2ª compra somou +12 meses. QR do Pix lido do sofá **não executado** (R-001, risco aceito pelo usuário). `evidencias/tv.md`.

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (073 e travas 069/070/071/072/026)
- [X] Constitution 1.13.0 aprovada e aplicada; ADR-013 com nota 073
- [X] API: pytest (sem `skipped` nos arquivos da feature) + ruff
- [X] TV: tsc/lint/test/build/build:tizen + `npm run test:e2e` antes de qualquer `tizen-tv`
- [X] Portal: lint/test/build/E2E (E2E 18/18 em 2 de 3 rodadas; `configuracao.spec.ts:123` instável — R-015)
- [X] Revisão de segredos registrada
- [X] Staging de teste validado (sem venda real; `checkout_enabled` falso fora dele) — cartão sim, Pix não (R-001)
- [X] `quickstart.md` executado; TV física (SC-007) aprovada ou risco aceito explicitamente pelo usuário (aprovada com cartão; Pix do sofá = risco aceito, R-001)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 bloqueia só a Fase 5; T002/T003 sem dependência.
- **Foundational (Phase 2)**: depende de T003 — BLOQUEIA US1 e US2.
- **US1 (Phase 3)**: depende da Fase 2. **US2 (Phase 4)**: depende da Fase 2 (independe da US1).
- **US3 (Phase 5)**: depende de T001; independe de US1/US2 (usa o Atualizar existente).
- **Polish**: depois das stories desejadas.

### Parallel Opportunities

- T002 ‖ T003; T010 ‖ T011–T013 (stack diferente); T019 ‖ T017; T022 ‖ T021 após T020; T027 ‖ T024–T026.

---

## Parallel Example: User Story 1

```bash
Task: "T011 [US1] createPixPurchase em tv-web/src/lib/licensing/pixPurchase.ts"
Task: "T012 [P] [US1] textos em tv-web/src/lib/i18n/messages/portal.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 (T002/T003; T001 pode correr em paralelo aguardando aprovação)
2. Fase 2 (serviço)
3. Fase 3 (TV) → **PARAR E VALIDAR** com E2E e quickstart §3 passos 1–9

### Incremental Delivery

1. Fundação → US1 (MVP) → US2 (portal) → US3 (código no portal, após T001)
2. Venda real continua desligada em todas as etapas (gates da 069)

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Contratos travados não são editados; stubs são ponto de partida
- Commitar após cada task ou grupo lógico coerente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Purpose**: fechar os achados do `sdd-converge` de 2026-10-16 (C1–C4). Nenhuma task anterior foi alterada.

- [X] T035 [US3] Teste de integração do caminho completo de SC-006 em `api/tests/portal/test_recovery_escrow.py` (ou arquivo vizinho): TV envia a cópia → portal revela o código (`POST /session/recovery-code`) → "reinstalação" (identidade nova) → recuperação pelo site com **o código revelado** (`/recoveries/exchange` + `/recoveries/confirm`) → a TV volta ao mesmo registro com a licença; código antigo após rotação não recupera. Origem: SC-006, US3/AC2–AC3 (achado C1, MEDIUM).
- [X] T036 Estender a revisão de segredos à sessão do portal guardada na aba (correção da T034): conferir que `sessionStorage` só tem ID/CSRF/validade, que some no logout/validade/sessão recusada, que o cookie `httpOnly` segue obrigatório, que nada vai para URL/log/erro; registrar em `sdd/specs/073-compra-licenca-pix/evidencias/segredos.md`. Origem: Constitution (segredos), FR-011/FR-012 (achado C2, MEDIUM).
- [X] T037 Registrar em `plan.md` → `## Riscos e Decisões` (R-018) a extensão da D-004 feita na T034: `/session/device` e `/device/entitlement/refresh` conciliam o pedido em aberto (consulta autenticada, `reconcile_after` 10 s, provedor fora do ar não derruba a resposta; só por ação da pessoa, ADR-016), e a comparação da licença por situação/validade na TV. Origem: plan D-004 (achado C3, LOW).
- [X] T038 Rodar o gate E2E depois das correções da T034: TV `npm run test:e2e` (com `npm run dev`) e `node e2e/consulta-sob-demanda.mjs` (pilha real, emulador), registrando o resultado nas Execution Notes. Origem: Constitution "Fluxo de Desenvolvimento" (achado C4, LOW).

**Registro da Fase**

- Status: concluída (2026-10-16).
- Feito: T035 teste de integração código revelado no portal → recuperação pelo site após reinstalar → mesmo registro com a licença; portal só mostra o código atual. T036 revisão de segredos da sessão na aba (`evidencias/segredos.md`), com endurecimento: `rememberSession` grava só ID/CSRF/validade. T037 R-018 em `plan.md`. T038 gate E2E.
- Contrato: `check-contract-tests.ps1 -Slug 073-compra-licenca-pix` → 5/5 verdes na suíte da TV, trava íntegra.
- Testes executados: `uv run pytest tests/portal` 167/167 (+1 de T035, verde na 1ª iteração) e `uv run ruff check .` limpo; portal `npx vitest run` 8/8, `npm run lint`, `npm run build`, `npx playwright test` 19/19; TV `node e2e/run.mjs` 51/51 (190 s) e `node e2e/consulta-sob-demanda.mjs` PASS (pilha real).
- Pendências: o endurecimento do `rememberSession` (T036) ainda não foi publicado no staging (comportamento publicado é equivalente: a resposta do login só tem os três campos). R-001, R-015, R-016 seguem abertos.
