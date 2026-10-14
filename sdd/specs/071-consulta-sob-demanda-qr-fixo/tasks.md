---
description: "Tasks da feature 071 — consulta sob demanda e QR fixo"
---

# Tasks: Consulta sob demanda e QR fixo

**Input**: `sdd/specs/071-consulta-sob-demanda-qr-fixo/` (spec, plan, research, data-model, contracts/portal-api-071.md, logic/atualizar.md, quickstart)

**Prerequisites**: plan.md, spec.md; Fase 1 (gate normativo) bloqueia todas as stories.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- TV: `tv-web/src/` (`lib/{portal,licensing,i18n}/`, `features/{portal,profiles,settings,import}/`, `components/`); E2E em `tv-web/e2e/*.mjs`; pacote em `CCPlayTv/`.
- Portal web: `portal-web/src/features/`, E2E em `portal-web/e2e/`.
- API do portal: `api/app/portal/` (rotas em `routes/`), testes em `api/tests/portal/` com emulador.
- Normas: `.planning/memory/constitution.md`, `sdd/adr/`.

## Phase 1: Gate normativo (bloqueante)

**Objetivo**: formalizar as exceções aceitas pelo usuário antes de qualquer comportamento novo.

- [ ] T001 Emendar `.planning/memory/constitution.md` 1.10.0 → 1.11.0 (MINOR) em "Segredos Fora dos Clientes e dos Logs" conforme D-001: (d) credenciais IPTV enviadas ao serviço, cifradas, nunca em log, devolvidas só à sessão da mesma TV; (e) chave no fragmento do QR fixo, nunca em path/query/log; (f) chave visível também na tela de bloqueio. Manter proibições de log/URL enviada/erro/exportação. Sync Impact Report no topo. (FR-024)
- [ ] T002 Registrar `sdd/adr/ADR-016-*.md` via `sdd-adr` (consulta sob demanda, QR fixo, credenciais da TV no serviço, teste local com âncora; riscos R-003/R-004/R-005 e mitigações); anotar `**Atualização (ADR-016):**` nas ADR-013 e ADR-014 e na tabela do `CLAUDE.md`. (FR-024)
- [ ] T003 Notas `Atualização (071)` em 069 (`spec.md` FR-002/FR-003, `plan.md` D-011/R-008/R-009 e invariantes I-5/I-10) e 070 (`spec.md` FR-026/US1 AC2, `plan.md` D-012); remover do `.planning/backlog.md` a ideia "QR gerado uma só vez" (entregue por esta feature). Sem reescrever o que foi entregue. (FR-025)

**Critério de Conclusão**: constitution 1.11.0 e ADR-016 aprovadas pelo usuário; notas aplicadas; `check-contract-tests.ps1` íntegro para 069/070/071.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 2: Fundação — agente sob demanda, teste local e âncora

**Objetivo**: nenhuma requisição sem ação da pessoa; teste de 7 dias contado no app; âncora no cadastro.

### Contrato da Fase

- `teste local de 7 dias: vale até o último instante, não ganha tempo com relógio atrasado e a âncora só encurta` — FR-020/021/022
- `sem ação da pessoa o agente não faz nenhuma requisição, mesmo com a TV parada por dias, visível e online` — FR-001/002, SC-001
- `Atualizar de listas envia exclusões, envios e busca nessa ordem; de licença só renova a licença; repetir em 10 s é recusado` — FR-004/005, SC-003
- Comando (em `tv-web/`): `npx vitest run src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts`

### Implementation

- [ ] T004 Implementar `tv-web/src/lib/licensing/localTrial.ts` (`evaluateLocalTrial`, `reconcileTrialStart`) e `localTrialRepository.ts` (tabela Dexie `localTrial`: criar na 1ª abertura do build comercial, marca d'água por checkpoint, `anchoredAt`); reler o schema Dexie antes de migrar. **Migração**: instalação já em uso com `licenseCache` verificado herda `startedAt = startsAt` do JWS de teste (nunca `now`, para não estender o teste de quem já está no meio); sem JWS, `startedAt = now`. → contrato C1
- [ ] T005 `tv-web/src/lib/licensing/licenseMonitor.ts`/`licenseRuntime.ts`: decisão = JWS válido **ou** teste local vigente; JWS `revoked` vence; entrada negada sem rede abre o bloqueio; `evaluatePlaybackAccess` intacto (C5 da 069). (FR-020/021)
- [ ] T006 `tv-web/src/lib/portal/portalAgent.ts`: remover `DAY`, `RETRIES`, `quick*`, `schedule`/timers e o `liveQuery` de abertura; implementar `refresh(scope)` com pausa de 10 s por escopo (`wait` sem dormir) e a porta `flushUploads`; `attach(_quick?)` mantém a assinatura. → contratos C2, C3 (FR-001/002/004/005)
- [ ] T007 `tv-web/src/lib/portal/portalRuntime.ts`, `usePortalAgent.ts`, `features/portal/usePortalIntegration.tsx`: remover `acquirePortalQuick`/`portalQuickMode`/`portalSyncNow`; expor `refreshPortal(scope)`; **não** chamar `connection.ready()` no mount (cadastro preguiçoso, D-004). (FR-001/002/023)
- [ ] T008 API `api/app/portal/enrollment.py`, `models.py`, `routes/auth.py`: `POST /devices/enroll` aceita `trialStartedAt` (validação de faixa), grava `trial_started_at = min(created_at, valor)` no cadastro e devolve o gravado; idempotente por identidade. Testes em `api/tests/portal/test_enrollment.py`. (FR-022, D-006)
- [ ] T009 `tv-web/src/lib/portal/portalConnection.ts`: enviar `trialStartedAt` (início local) no 1º cadastro e reconciliar com o devolvido (`reconcileTrialStart`), também na recuperação. (FR-022)

### Testes da Fase

- [ ] T010 [P] Reescrever `tv-web/src/lib/portal/portalAgent.test.ts` e `usePortalAgent*.test.tsx` (sem ciclo diário/quick; lifecycle visível/online só governa `refresh`); testes do `licenseMonitor` com teste local; `test_enrollment.py` (âncora `min`, faixa, reinstalação). Contratos 069 C1–C5 e 070 C1–C5 verdes sem edição.

**Critério de Conclusão**: contratos C1–C3 3/3 verdes e `check-contract-tests.ps1` íntegro; API `tests/portal` verde; `npx tsc -b` e lint sem violação nova.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 e 2 — botões Atualizar e tela de bloqueio (Priority: P1) 🎯 MVP

**Objetivo**: Atualizar nas quatro telas, bloqueio com QR/endereço/ID/chave, e liberar o app depois da compra.

**Independent Test**: com o teste vencido, comprar (sandbox) e apertar Atualizar no bloqueio libera e entra na lista negada; criar lista no site e apertar Atualizar traz a lista com foco nela.

### Implementation

- [ ] T011 [US1] `tv-web/src/features/portal/RefreshButton.tsx` + hook `useRefreshAction(scope)`: estados (carregando, sucesso, sem novidades, offline, pausa, erro com código), `role="status"`, desabilitado por 10 s, i18n pt/en/es em `lib/i18n/messages/portal.ts`. (FR-003/004/026)
- [ ] T012 [US1] `tv-web/src/features/portal/PortalPairingPanel.tsx`: remover convite/renovação/`acquirePortalQuick`; manter "Recarregar" (`refreshPortal('lists')`) e voltar à tela de listas com foco na nova (`onReloaded`); "Gerar nova chave" mantém. (FR-006, D-013)
- [ ] T013 [US1] `tv-web/src/features/profiles/ProfilesScreen.tsx`: botão **Atualizar** (escopo listas) com feedback e foco por id; tokens V14, texto ≥ 20 px; sem consulta ao abrir. (FR-003/005/006)
- [ ] T014 [US2] `tv-web/src/features/portal/LicenseGate.tsx`: conteúdo do bloqueio (mensagem, orientação, QR, endereço, ID, chave), **Atualizar** (escopo licença) e Voltar; cadastro preguiçoso ao abrir; ao liberar, retomar a entrada negada (`sourceId` guardado). (FR-007/017/018, D-004)
- [ ] T015 [US2] `tv-web/src/features/settings/PortalLicensePanel.tsx`: remover `acquirePortalQuick`; botão **Atualizar** (licença); a chave continua só por ação explícita aqui (I-5 da 069 permanece). (FR-003/018)

### Testes da Fase

- [ ] T016 [P] [US1] Testes de `RefreshButton`/`useRefreshAction` (pausa, offline, erro), `PortalPairingPanel` (sem requisição ao abrir além do cadastro; Recarregar volta com foco), `ProfilesScreen` (Atualizar), `LicenseGate` (libera e retoma; "sem compra"; offline) e `PortalLicensePanel`; contratos 037/045/023/024/026 e 070 C1 verdes sem edição.
- [ ] T017 [US1] `tv-web/e2e/legibilidade-tv.mjs`: incluir bloqueio e botão Atualizar da lista em pt/en/es (≥ 20 px, sem corte). (SC-009)

**Critério de Conclusão**: contratos C1–C3 verdes (Fase 2) permanecem; E2E `legibilidade-tv` PASS; nenhum teste não travado assume o ciclo diário.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 5 — QR fixo que entra direto (Priority: P2)

**Objetivo**: QR local, sem requisição, que abre o painel autenticado.

### Contrato da Fase

- `QR fixo: endereço + ID + chave só no fragmento, estável, muda só com a chave e recusa dados inválidos` — FR-013/014/016
- Comando (em `tv-web/`): `npx vitest run src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts`

### Implementation

- [ ] T018 [US5] `tv-web/src/lib/portal/fixedQr.ts` (`buildFixedQrUrl`: valida ID `XX:…`, chave de 10 dígitos e `https://` do site; só fragmento). → contrato C4
- [ ] T019 [US5] Dependência de QR (`research.md` §1): `npm i qrcode-generator` (versão exata), `features/portal/FixedQr.tsx` (SVG, `role="img"`, alt "QR…"), arquivo emitido no `CCPlayTv/tizen_web_project.yaml`; remover a leitura de `qrDataUrl` do convite em Adicionar/bloqueio. (FR-013, R-008)
- [ ] T020 [US5] `portal-web/src/features/api.ts`/`SessionPage.tsx`: `takeEntry` aceita `#id=&key=`, chama `POST /sessions/manual`, limpa o fragmento com `replaceState` antes de renderizar; recusa uniforme preservada. (FR-014/015, D-008)
- [ ] T021 [US5] "Gerar nova chave": o QR da TV reage à nova chave (`liveQuery`) e o QR/sessões antigas são recusadas (teste E2E). (FR-016)

### Testes da Fase

- [ ] T022 [P] [US5] `portal-web` unit (`takeEntry` com fragmento válido/ inválido/ com chave errada) e `gerenciador.spec.ts` (entra pelo QR sem digitar; histórico limpo); teste do componente `FixedQr`.

**Critério de Conclusão**: contrato C4 1/1 verde, trava íntegra; E2E do QR PASS; portal lint/test/build/E2E verdes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 4 — Lista da TV aparece no site com tudo (Priority: P2)

**Objetivo**: enviar nome/tipo/host/usuário/senha ao serviço, com fila, lotes e 1ª subida completa.

### Contrato da Fase

- `envio TV → site: a 1ª vez sobe todas as listas completas; depois só as com revisão nova; incompletas não sobem` — FR-008/009/010
- Comando (em `tv-web/`): `npx vitest run src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts`

### Implementation

- [ ] T023 [US4] API `configurations.py` (`submit_from_device`), `routes/operations.py` (`POST /device/sources`): lote ≤ 10, allowlist, cifra/versão, `applied_revision`, tombstone → `gone`, digest idempotente, sem log/cache do corpo; revisão de segredos com marcadores. Testes `api/tests/portal/test_device_sources.py`. (FR-008/011/012, D-009, D-014)
- [ ] T024 [US4] `tv-web/src/lib/portal/sourceUploadPlan.ts` (`planSourceUploads`) + `sourceUploads.ts` (tabela Dexie, mapeamento de `SourceRecord`, lotes, parada no 1º erro). → contrato C5
- [ ] T025 [US4] `portalSync.ts`: porta `flushUploads` real e gatilho no ato em criar/editar lista (uma tentativa; falha mantém a fila); `refresh('lists')` esvazia a fila; `gone` registrado como enviado. (FR-008/009/010)
- [ ] T026 [US4] `portal-web`: lista da TV mostra valores e permite editar sem o rótulo "Somente na TV" para itens enviados (reusa `values`); estados pendente/conflito da 069 intactos. (FR-012)

### Testes da Fase

- [ ] T027 [P] [US4] Testes do mapeamento/lotes/fila (offline → Atualizar), API com emulador (idempotência, tombstone, CAS vs portal), e E2E de pilha local (adicionar na TV → site; editar no site → Atualizar).

**Critério de Conclusão**: contrato C5 1/1 verde, trava íntegra; API `tests/portal` verde; E2E da fila PASS.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T028 Revisão de segredos com marcadores fictícios (DOM, URL/fragmento, QR, histórico, logs da API, cabeçalhos, erros) — `evidencias/segredos.md`. (SC-008)
- [ ] T029 Atualizar `docs/portal/operacao.md`, `infra/portal/README.md`, `README.md` e as notas das specs 069/070 (consulta sob demanda, QR fixo, teste local, envio TV → site).
- [ ] T030 E2E novo `tv-web/e2e/consulta-sob-demanda.mjs` (SUITE quando isolado) e ajustes em `entrada-listas-gerenciador.mjs`, `portal-dev-server.mjs`, `licenca-anual.mjs`, `portal-configuracao.mjs`; medir SC-001 (0 requisições em 24 h simulados) e SC-007.
- [ ] T031 Gates: TV `tsc`/lint/`npm run test`/build/`build:tizen`; API pytest + Ruff; portal lint/test/build/E2E; travas 071/070/069/026/037/045/023/024 íntegras; `npm run test:e2e` completo com `npm run dev`.
- [ ] T032 Publicar API (rota + âncora) e portal-web no staging (**ação externa: pedir confirmação do usuário**) e repetir E2E do pacote contra o staging; reescrever `homologate-070.ps1`/`measure-staging.ps1` para a rota nova se necessário.
- [ ] T033 TV física (quickstart §4): instalar o pacote comercial sem desinstalar, cenários 2–10, `evidencias/tv.md`.
- [ ] T034 Backlog/status via scripts; `plan.md` Estado Atual/Execution Notes.

### Checklist de Release

- [ ] Fase 1 (constitution 1.11.0, ADR-016, notas 069/070) concluída
- [ ] Fase 2 (agente sob demanda, teste local, âncora) concluída
- [ ] Fase 3 (US1/US2: Atualizar e bloqueio) concluída
- [ ] Fase 4 (US5: QR fixo) concluída
- [ ] Fase 5 (US4: envio TV → site) concluída
- [ ] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (071, 070, 069, 026, 037, 045, 023, 024)
- [ ] E2E no dev server e no pacote `file://` aprovados antes da TV
- [ ] Revisão de segredos aprovada
- [ ] Staging publicado com confirmação do usuário
- [ ] TV física: quickstart observado pelo usuário (`evidencias/tv.md`)

---

## Dependencies & Execution Order

- Fase 1 bloqueia tudo (normativo).
- Fase 2 depende da 1 e bloqueia US1/US2 (agente e teste local).
- US1/US2 (Fase 3) são P1; US5 (Fase 4) depende só da Fase 2; US4 (Fase 5) depende da Fase 2 e da API (T023).
- T008 (API âncora) e T023 (API envio) antecedem a TV física; publicar a API no staging **antes** do pacote (R-010).
- Polish depois das stories; T032/T033 exigem confirmação/observação do usuário.

## Implementation Strategy

MVP = Fases 1–3 (nada automático, botões e bloqueio resolvem o custo e a compra). Depois QR fixo (Fase 4) e envio TV → site (Fase 5). Cada fase fecha com contratos, testes e o E2E de pilha local antes de qualquer instalação na TV.

## Notes

- Nunca editar arquivos de contrato travados; emenda só com aprovação explícita (execute, passo 5b).
- Ratchet: sem import novo feature→feature; arquivos grandes extraem módulos (`ProfilesScreen`, `PortalPairingPanel`).
- Esta feature **não** reabre a venda: riscos R-022..R-026 da 069 seguem abertos.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
