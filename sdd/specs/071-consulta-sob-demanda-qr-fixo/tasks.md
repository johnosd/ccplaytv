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

- [X] T001 Emendar `.planning/memory/constitution.md` 1.10.0 → 1.11.0 (MINOR) em "Segredos Fora dos Clientes e dos Logs" conforme D-001: (d) credenciais IPTV enviadas ao serviço, cifradas, nunca em log, devolvidas só à sessão da mesma TV; (e) chave no fragmento do QR fixo, nunca em path/query/log; (f) chave visível também na tela de bloqueio. Manter proibições de log/URL enviada/erro/exportação. Sync Impact Report no topo. (FR-024)
- [X] T002 Registrar `sdd/adr/ADR-016-*.md` via `sdd-adr` (consulta sob demanda, QR fixo, credenciais da TV no serviço, teste local com âncora; riscos R-003/R-004/R-005 e mitigações); anotar `**Atualização (ADR-016):**` nas ADR-013 e ADR-014 e na tabela do `CLAUDE.md`. (FR-024)
- [X] T003 Notas `Atualização (071)` em 069 (`spec.md` FR-002/FR-003, `plan.md` D-011/R-008/R-009 e invariantes I-5/I-10) e 070 (`spec.md` FR-026/US1 AC2, `plan.md` D-012); remover do `.planning/backlog.md` a ideia "QR gerado uma só vez" (entregue por esta feature). Sem reescrever o que foi entregue. (FR-025)

**Critério de Conclusão**: constitution 1.11.0 e ADR-016 aprovadas pelo usuário; notas aplicadas; `check-contract-tests.ps1` íntegro para 069/070/071.

**Registro da Fase**:

- Status: Concluída em 2026-10-14; constitution 1.11.0 e ADR-016 aprovadas pelo usuário.
- Feito: T001 constitution 1.11.0 (itens (d)(e)(f), esclarecimento em "Comandos Locais", relatório de impacto, histórico, rodapé); T002 `sdd/adr/ADR-016-consulta-sob-demanda-qr-fixo.md` + notas `Atualização (ADR-016)` em ADR-013, ADR-014 e tabela do `CLAUDE.md`; T003 notas `Atualização (071)` em 069 (`spec` FR-002/FR-003, `plan` D-011/R-008/R-009/I-5/I-10) e 070 (`spec` FR-026/US1 AC2, `plan` D-012); ideia "QR gerado uma só vez" removida do backlog; A001 resolvida no texto do FR-003 da 071 (Adicionar mantém "Recarregar").
- Contrato: sem contrato nesta fase; `check-contract-tests.ps1` PASS para 071 (5), 070 (5) e 069 (5) — trava íntegra.
- Testes executados: nenhum teste automatizado (fase normativa); `check-contract-tests.ps1 -Slug 071-consulta-sob-demanda-qr-fixo`, `070-entrada-listas-gerenciador`, `069-portal-tv-licenca-anual` → PASS.
- Pendências: nenhuma.

---

## Phase 2: Fundação — agente sob demanda, teste local e âncora

**Objetivo**: nenhuma requisição sem ação da pessoa; teste de 7 dias contado no app; âncora no cadastro.

### Contrato da Fase

- `teste local de 7 dias: vale até o último instante, não ganha tempo com relógio atrasado e a âncora só encurta` — FR-020/021/022
- `sem ação da pessoa o agente não faz nenhuma requisição, mesmo com a TV parada por dias, visível e online` — FR-001/002, SC-001
- `Atualizar de listas envia exclusões, envios e busca nessa ordem; de licença só renova a licença; repetir em 10 s é recusado` — FR-004/005, SC-003
- Comando (em `tv-web/`): `npx vitest run src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts`

### Implementation

- [X] T004 Implementar `tv-web/src/lib/licensing/localTrial.ts` (`evaluateLocalTrial`, `reconcileTrialStart`) e `localTrialRepository.ts` (tabela Dexie `localTrial`: criar na 1ª abertura do build comercial, marca d'água por checkpoint, `anchoredAt`); reler o schema Dexie antes de migrar. **Migração**: instalação já em uso com `licenseCache` verificado herda `startedAt = startsAt` do JWS de teste (nunca `now`, para não estender o teste de quem já está no meio); sem JWS, `startedAt = now`. → contrato C1
- [X] T005 `tv-web/src/lib/licensing/licenseMonitor.ts`/`licenseRuntime.ts`: decisão = JWS válido **ou** teste local vigente; JWS `revoked` vence; entrada negada sem rede abre o bloqueio; `evaluatePlaybackAccess` intacto (C5 da 069). (FR-020/021)
- [X] T006 `tv-web/src/lib/portal/portalAgent.ts`: remover `DAY`, `RETRIES`, `quick*`, `schedule`/timers e o `liveQuery` de abertura; implementar `refresh(scope)` com pausa de 10 s por escopo (`wait` sem dormir) e a porta `flushUploads`; `attach(_quick?)` mantém a assinatura. → contratos C2, C3 (FR-001/002/004/005)
- [X] T007 `tv-web/src/lib/portal/portalRuntime.ts`, `usePortalAgent.ts`, `features/portal/usePortalIntegration.tsx`: remover `acquirePortalQuick`/`portalQuickMode`/`portalSyncNow`; expor `refreshPortal(scope)`; **não** chamar `connection.ready()` no mount (cadastro preguiçoso, D-004). (FR-001/002/023)
- [X] T008 API `api/app/portal/enrollment.py`, `models.py`, `routes/auth.py`: `POST /devices/enroll` aceita `trialStartedAt` (validação de faixa), grava `trial_started_at = min(created_at, valor)` no cadastro e devolve o gravado; idempotente por identidade. Testes em `api/tests/portal/test_enrollment.py`. (FR-022, D-006)
- [X] T009 `tv-web/src/lib/portal/portalConnection.ts`: enviar `trialStartedAt` (início local) no 1º cadastro e reconciliar com o devolvido (`reconcileTrialStart`), também na recuperação. (FR-022)

### Testes da Fase

- [X] T010 [P] **Remover** os casos de `portalAgent.test.ts` e `usePortalAgent*.test.tsx` que afirmam ciclo diário/quick (os contratos C2/C3 já definem o novo comportamento) e manter só os que continuam valendo (lifecycle suspende/retoma, sem overlap, exclusão no ato); acrescentar 1 caso do `licenseMonitor` (JWS ou teste local; `revoked` vence) e 2 de `test_enrollment.py` (âncora `min`, faixa inválida). Contratos 069 C1–C5 e 070 C1–C5 verdes sem edição.

**Critério de Conclusão**: contratos C1–C3 3/3 verdes e `check-contract-tests.ps1` íntegro; API `tests/portal` verde; `npx tsc -b` e lint sem violação nova.

**Registro da Fase**:

- Status: Concluída em 2026-10-14 (T004–T010).
- Feito: T004 `localTrial.ts` (`evaluateLocalTrial`, `reconcileTrialStart`, `decideAccess`) + `localTrialRepository.ts` + tabela Dexie `localTrial` (v23); T005 `licenseMonitor.ts` decide JWS **ou** teste local (`revoked` vence; instalação em uso herda `startsAt` do JWS verificado, nunca `now`); T006 `portalAgent.ts` reescrito sem timers/ciclo/quick, com `refresh(scope)` (pausa 10 s por escopo, fila serial) e envio no ato só de exclusão **criada depois do attach**; T007 `portalRuntime` (`refreshPortal`/`registerPortalRefresh`), `usePortalAgent(db, ports, enabled)`, `usePortalIntegration` sem `connection.ready()` no mount e sem identidade/quick; T008 API: `POST /devices/enroll` aceita `trialStartedAt`, grava `min(created_at, valor)` no cadastro e devolve o gravado (também nas credenciais de rotação/recuperação); T009 `portalConnection` envia o início local (recortado a 29 dias) e reconcilia no cadastro e na recuperação; T010 testes obsoletos removidos/reescritos.
- Contrato: `npx vitest run src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts` → 3/3 verdes; `check-contract-tests.ps1` PASS (071, 070, 069, 026, 037, 045, 023, 024). C4/C5 seguem vermelhos por `not implemented` (Fases 4 e 5).
- Testes executados: TV `npx tsc -b` limpo; `npm run lint` exit 0 (ratchet ok); `npx vitest run src/lib/portal src/lib/licensing src/features/portal src/features/settings src/features/profiles src/features/import src/App.licensing.test.tsx src/lib/catalog/db` → 384 passaram, 2 falharam (só C4/C5, esperados). API com emulador Firestore: `$env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider "--basetemp=$env:TEMP\pytest-071"` → 141 passaram; `ruff check app/portal tests/portal` limpo.
- Pendências: (1) `PortalPairingPanel` ainda gera convite ao abrir e o renova a cada ~5 min enquanto aberto (T012/T019 removem; só entra na Fase 3/4) — troquei apenas `portalSyncNow` por `refreshPortal('lists')` e tirei `acquirePortalQuick`; (2) `PortalLicensePanel` perdeu a janela rápida mas ainda não tem botão Atualizar (T015); (3) instalação cujo JWS em cache não verifica cria o teste com `startedAt = now` (R-013); (4) dispositivos antigos sem `trial_started_at` seguem recebendo o início lazy no primeiro `entitlement` (comportamento da 069 preservado).

---

## Phase 3: User Story 1 e 2 — botões Atualizar e tela de bloqueio (Priority: P1) 🎯 MVP

**Objetivo**: Atualizar nas quatro telas, bloqueio com QR/endereço/ID/chave, e liberar o app depois da compra.

**Independent Test**: com o teste vencido, comprar (sandbox) e apertar Atualizar no bloqueio libera e entra na lista negada; criar lista no site e apertar Atualizar traz a lista com foco nela.

### Implementation

- [X] T011 [US1] `tv-web/src/features/portal/RefreshButton.tsx` + hook `useRefreshAction(scope)`: estados (carregando, sucesso, sem novidades, offline, pausa, erro com código), `role="status"`, desabilitado por 10 s, i18n pt/en/es em `lib/i18n/messages/portal.ts`. (FR-003/004/026)
- [X] T012 [US1] `tv-web/src/features/portal/PortalPairingPanel.tsx`: remover convite/renovação/`acquirePortalQuick`; manter "Recarregar" (`refreshPortal('lists')`) e voltar à tela de listas com foco na nova (`onReloaded`); "Gerar nova chave" mantém. (FR-006, D-013)
- [X] T013 [US1] `tv-web/src/features/profiles/ProfilesScreen.tsx`: botão **Atualizar** (escopo listas) com feedback e foco por id; tokens V14, texto ≥ 20 px; sem consulta ao abrir. (FR-003/005/006)
- [X] T014 [US2] `tv-web/src/features/portal/LicenseGate.tsx`: conteúdo do bloqueio (mensagem, orientação, QR, endereço, ID, chave), **Atualizar** (escopo licença) e Voltar; cadastro preguiçoso ao abrir; ao liberar, retomar a entrada negada (`sourceId` guardado). (FR-007/017/018, D-004)
- [X] T015 [US2] `tv-web/src/features/settings/PortalLicensePanel.tsx`: remover `acquirePortalQuick`; botão **Atualizar** (licença); a chave continua só por ação explícita aqui (I-5 da 069 permanece). (FR-003/018)

### Testes da Fase

- [X] T016 [P] [US1] **1 teste por unidade, só do que mudou**: `useRefreshAction` (pausa 10 s, offline, erro com código) e `LicenseGate` (libera e retoma a entrada; "sem compra" mantém o bloqueio). Painel Adicionar, `ProfilesScreen` e `PortalLicensePanel` ficam cobertos pelo E2E da T030 (sem teste de componente novo). Contratos 037/045/023/024/026 e 070 C1 verdes sem edição.
- [X] T017 [US1] `tv-web/e2e/legibilidade-tv.mjs`: acrescentar **apenas** a tela de bloqueio e a lista com o botão Atualizar (pt/en/es, ≥ 20 px, sem corte). Sem script novo. (SC-009)

**Critério de Conclusão**: contratos C1–C3 verdes (Fase 2) permanecem; E2E `legibilidade-tv` PASS; nenhum teste não travado assume o ciclo diário.

**Registro da Fase**:

- Status: Concluída em 2026-10-14 (T011–T017), com **T018/T019 antecipadas da Fase 4** a pedido do desenho: o bloqueio já nasce com o QR fixo local.
- Feito: T011 `components/RefreshButton.tsx` (+ `RefreshStatusLine`) e `lib/portal/useRefreshAction.ts` (estados carregando/atualizado/sem novidades/espera/offline/erro com código; pausa de 10 s; impressão digital de listas/licença para distinguir "atualizado" de "sem novidades"); i18n pt/en/es em `messages/portal.ts`. T012 `PortalPairingPanel` sem convite nem renovação, QR local, "Recarregar" → `refresh(lists)` e `onReloaded` só quando há lista nova; "Gerar nova chave" atualiza o QR pelo registro local. T013 `ProfilesScreen`: "Atualizar" (canto inferior esquerdo, só com portal configurado; `ProfilesRefreshCorner.tsx`), foco na lista nova por id. T014 `LicenseGate`: mensagem do fim do teste, orientação, QR, endereço, ID e chave, Atualizar (só licença) e Voltar, cadastro preguiçoso ao abrir, retoma a entrada negada (`resumeEntry` no App). T015 `PortalLicensePanel`: sem janela rápida, QR fixo só na ação explícita, 7ª ação "Atualizar" (licença). T018 `fixedQr.ts` (`https:` ou http em loopback; só fragmento). T019 `qrcode-generator@1.4.4` (MIT, ES5) + `components/FixedQr.tsx` (SVG); a lib entra no `index.js`, sem arquivo novo (guarda `findUnlistedFiles` → `[]`). T017 `e2e/legibilidade-tv.mjs`: bloco com Vite comercial (porta 5177) + portal fictício mede Perfis com Atualizar, Adicionar com QR fixo e Bloqueio em pt/en/es.
- Contrato: `npx vitest run src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts` → C4 verde (1/1); C1–C3 seguem verdes; C5 vermelho (Fase 5). Travas 071/070/069/026/037/045/023/024 íntegras. 070 C1 (`PortalPairingPanel…contract`) verde sem edição.
- Testes executados: `npx tsc -b` limpo; `npm run lint` exit 0 (ratchet ok; `ProfilesScreen.tsx` ≤ teto 421 depois de extrair `ProfilesRefreshCorner`); `npx vitest run src/lib/portal src/lib/licensing src/features/portal src/features/settings src/features/profiles src/components src/App.licensing.test.tsx src/lib/i18n src/lib/catalog/db` → 728 passaram, 1 falhou (C5, esperado); novos: `useRefreshAction.test.tsx` (1), `LicenseGate.test.tsx` (2); reescritos: `PortalPairingPanel.test.tsx`, `PortalLicensePanel.test.tsx`, `licensing.test.tsx`. `node e2e/legibilidade-tv.mjs --langs pt,en,es` → 84 telas, 0 achados. `npm run build` ok.
- Pendências: (1) E2E `portal-configuracao` e `licenca-anual` ficaram vermelhos como previsto (assumem cadastro/consulta automáticos e o convite/PNG; `licenca-anual` espera `licenseCache` ao abrir) — reescrever na T030, não aqui; `portal-plataforma` verde; (2) `PortalConnection.invite()` e as chaves i18n `portal.renewQr`/`portal.licenseBuy` ficaram sem uso na UI — limpar no Polish (T029/T031) junto de `api/app/portal/qr.py` só se a recuperação não precisar; (3) "pagamento pendente" (US2/AC3) não tem sinal no serviço hoje: o bloqueio mostra só "sem licença ativa" — não inventei o estado; (4) QR e chave visíveis no bloqueio dependem do cadastro; sem internet na 1ª vez o QR não existe (estado explícito + Atualizar), como previsto em R-010.

---

## Phase 4: User Story 5 — QR fixo que entra direto (Priority: P2)

**Objetivo**: QR local, sem requisição, que abre o painel autenticado.

### Contrato da Fase

- `QR fixo: endereço + ID + chave só no fragmento, estável, muda só com a chave e recusa dados inválidos` — FR-013/014/016
- Comando (em `tv-web/`): `npx vitest run src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts`

### Implementation

- [X] T018 [US5] (antecipada na Fase 3, o bloqueio precisa do QR) `tv-web/src/lib/portal/fixedQr.ts` (`buildFixedQrUrl`: valida ID `XX:…`, chave de 10 dígitos e `https://` do site; só fragmento). → contrato C4
- [X] T019 [US5] (antecipada na Fase 3) Dependência de QR (`research.md` §1): `npm i qrcode-generator` (versão exata), `features/portal/FixedQr.tsx` (SVG, `role="img"`, alt "QR…"), arquivo emitido no `CCPlayTv/tizen_web_project.yaml`; remover a leitura de `qrDataUrl` do convite em Adicionar/bloqueio. (FR-013, R-008)
- [X] T020 [US5] `portal-web/src/features/api.ts`/`SessionPage.tsx`: `takeEntry` aceita `#id=&key=`, chama `POST /sessions/manual`, limpa o fragmento com `replaceState` antes de renderizar; recusa uniforme preservada. (FR-014/015, D-008)
- [X] T021 [US5] "Gerar nova chave": o QR da TV reage à nova chave (`liveQuery`) e o QR/sessões antigas são recusadas (teste E2E). (FR-016)

### Testes da Fase

- [X] T022 [P] [US5] `portal-web`: 1 teste unitário de `takeEntry` (fragmento válido, inválido, chave errada → recusa uniforme, histórico limpo) e 1 caso em `gerenciador.spec.ts` (entra pelo QR sem digitar). Sem teste de componente do `FixedQr` (o contrato C4 e o E2E já cobrem).

**Critério de Conclusão**: contrato C4 1/1 verde, trava íntegra; E2E do QR PASS; portal lint/test/build/E2E verdes.

**Registro da Fase**:

- Status: Concluída em 2026-10-14 (T018/T019 já entregues na Fase 3; aqui T020–T022).
- Feito: T020 `portal-web/src/features/api.ts` — `takeEntry` aceita `#id=&key=` (ID normalizado para `XX:XX:XX:XX:XX:XX`, chave de 10 dígitos), limpa o fragmento com `replaceState` antes de qualquer requisição/renderização e devolve `{ kind: 'device' }`; fragmento malformado ou ambíguo (com `invite`/`recovery`) vira "sem entrada" sem ecoar o valor; `main.tsx` chama `api.manual` (mesma rota, limites e recusa uniforme da 070 — nenhuma rota nova). T021 o QR da TV deriva do registro local (`usePairingCredentials`), então a nova chave troca o QR sem requisição; o servidor já invalida chave e sessões antigas na rotação (070/ADR-015). T022 testes: `api.test.ts` (fragmento válido/inválido/ambíguo, histórico limpo, chave errada → `access`) e `gerenciador.spec.ts` (entra pelo QR sem digitar, corpo enviado normalizado, URL sem `#` nem chave); `usePairingCredentials.test.tsx` na TV (nova chave troca o QR).
- Contrato: `npx vitest run src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts` (com C1–C3) → 4/4 verdes; `check-contract-tests.ps1` PASS para 071, 070 e 069.
- Testes executados: portal-web `npm run lint` limpo, `npm run test` 7/7, `npm run build` ok, `npm run test:e2e` (com `vite --port 5174`) 15/15; TV `npx tsc -b` limpo, `npm run lint` exit 0, `usePairingCredentials.test.tsx` 1/1.
- Pendências: (1) a invalidação do QR/sessões antigas pelo serviço é o comportamento já coberto na API da 070 — a prova ponta a ponta (ler o QR antigo depois de "Gerar nova chave" e ser recusado) entra no E2E único da T030; (2) o `portal-web` ainda não mostra texto ao entrar pelo QR além do painel (nada a dizer: entrou); (3) qualquer foto do QR dá acesso ao painel (R-004, aceito).

---

## Phase 5: User Story 4 — Lista da TV aparece no site com tudo (Priority: P2)

**Objetivo**: enviar nome/tipo/host/usuário/senha ao serviço, com fila, lotes e 1ª subida completa.

### Contrato da Fase

- `envio TV → site: a 1ª vez sobe todas as listas completas; depois só as com revisão nova; incompletas não sobem` — FR-008/009/010
- Comando (em `tv-web/`): `npx vitest run src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts`

### Implementation

- [X] T023 [US4] API `configurations.py` (`submit_from_device`), `routes/operations.py` (`POST /device/sources`): lote ≤ 10, allowlist, cifra/versão, `applied_revision`, tombstone → `gone`, digest idempotente, sem log/cache do corpo; revisão de segredos com marcadores. Testes `api/tests/portal/test_device_sources.py`. (FR-008/011/012, D-009, D-014)
- [X] T024 [US4] `tv-web/src/lib/portal/sourceUploadPlan.ts` (`planSourceUploads`) + `sourceUploads.ts` (tabela Dexie, mapeamento de `SourceRecord`, lotes, parada no 1º erro). → contrato C5
- [X] T025 [US4] `portalSync.ts`: porta `flushUploads` real e gatilho no ato em criar/editar lista (uma tentativa; falha mantém a fila); `refresh('lists')` esvazia a fila; `gone` registrado como enviado. (FR-008/009/010)
- [X] T026 [US4] `portal-web`: lista da TV mostra valores e permite editar sem o rótulo "Somente na TV" para itens enviados (reusa `values`); estados pendente/conflito da 069 intactos. (FR-012)

### Testes da Fase

- [X] T027 [P] [US4] API com emulador, **só as regras que protegem dados**: idempotência por digest, tombstone → `gone`, CAS contra edição do portal, lote > 10 recusado e corpo ausente de log/cabeçalho (marcadores). TV: 1 teste de lotes/fila offline → Atualizar. Sem E2E próprio: o cenário entra na T030.

**Critério de Conclusão**: contrato C5 1/1 verde, trava íntegra; API `tests/portal` verde; E2E da fila PASS.

**Registro da Fase**:

- Status: Concluída em 2026-10-14 (T023–T027).
- Feito: T023 API `POST /portal/v1/device/sources` (`routes/operations.py`) + `app/portal/device_uploads.py` (`DeviceSourceUploads`): lote de 1–10 itens sem `sourceId` repetido, bearer da TV, limite de 20 requisições/min por TV, `merge_configuration` como substituição completa, cifra AES-GCM e versão imutável reaproveitadas, grava `applied_revision = revision` sem operação nem contagem de pendentes; estados `stored | unchanged | conflict | gone | invalid`; tombstone → `gone`; edição do portal ainda pendente → `conflict` (nunca sobrescreve); idempotência por `upload_digest` (campo novo opcional em `ConfigurationDocument`); corpo fora de log/cache/cabeçalho, `Cache-Control: no-store`. T024 TV `sourceUploadPlan.ts` (C5), `sourceUploads.ts` (lotes de 10, para no 1º erro, marca só o aceito, `gone` conta como enviado), tabela Dexie `sourceUploads` (v24). T025 `portalSync.flushUploads` real, `PortalAgent.uploadNow()` e `sourceChangeSignal` disparado por `createSource`/`updateSource`/`updateSourceConfiguration` (uma tentativa no ato: uploads + snapshot, sem pull; offline não tenta); lista aplicada vinda do portal já conta como enviada. T026 `portal-web`: não precisou de código novo — uma lista com configuração salva já mostra "Salva" e abre a edição com os valores (`values`); só ajustei o texto `localOnly` (pt/en/es) para quem ainda não foi enviada (aperte Atualizar na TV). T027 testes (abaixo).
- Contrato: `npx vitest run src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts` → C5 verde; C1–C5 = 5/5; `check-contract-tests.ps1` PASS para 071, 070, 069, 026, 037, 045, 023, 024.
- Testes executados: API (emulador Firestore) `pytest tests/portal` → 145 passaram (4 novos em `test_device_sources.py`: idempotência/sem operação, tombstone → `gone` + incompleta → `invalid`, CAS contra edição do portal, lote > 10 recusado + `no-store` + marcadores fora de log/cabeçalho) e `ruff check app/portal tests/portal` limpo. TV `npx tsc -b` limpo; `npm run lint` exit 0 (ratchet); `npx vitest run src/lib src/features/portal src/features/profiles src/features/settings src/features/import src/components src/App.licensing.test.tsx` → 2212 passaram, 0 falhas; novos: `sourceUploads.test.ts` (2), `uploadNow` em `portalAgent.test.ts` (1). portal-web lint/test 7/7.
- Pendências: (1) o cenário ponta a ponta (criar na TV → lista no site com valores; fila offline → Atualizar) entra no E2E único da T030; (2) corrigi nesta fase dois deslizes meus das fases anteriores: `ProfilesScreen.tsx` estava acima do teto do ratchet (extraí `useProfilesRefresh.ts`) e `pinMigration.upgrade.test.ts` ainda afirmava `verno` 22 (agora 24) — ambos só apareciam fora das suítes estreitas que eu rodava; (3) o `portal-web` ainda mostra "Somente na TV" para lista incompleta ou nunca enviada, por desenho (sem dados suficientes para o serviço); (4) limite de 50 listas por snapshot (069) não é imposto no envio — registrado, sem uso real hoje.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T028 Revisão de segredos com marcadores fictícios (DOM, URL/fragmento, QR, histórico, logs da API, cabeçalhos, erros) — `evidencias/segredos.md`. (SC-008)
- [ ] T029 Atualizar `docs/portal/operacao.md`, `infra/portal/README.md`, `README.md` e as notas das specs 069/070 (consulta sob demanda, QR fixo, teste local, envio TV → site).
- [ ] T030 **1 E2E novo** `tv-web/e2e/consulta-sob-demanda.mjs` (uma subida de pilha): cenários 1–5, 7–10 do `quickstart.md` §3 + contagem de requisições (SC-001 em 24 h simulados, SC-007). Ajustar `entrada-listas-gerenciador.mjs`, `portal-dev-server.mjs`, `licenca-anual.mjs` e `portal-configuracao.mjs` **só se ficarem vermelhos** (rodar antes de editar).
- [ ] T031 Gates: TV `tsc`/lint/`npm run test`/build/`build:tizen`; API pytest + Ruff; portal lint/test/build/E2E; travas 071/070/069/026/037/045/023/024 íntegras; `npm run test:e2e` completo com `npm run dev`.
- [ ] T032 Publicar API (rota + âncora) e portal-web no staging (**ação externa: pedir confirmação do usuário**) e repetir E2E do pacote contra o staging; reescrever `homologate-070.ps1`/`measure-staging.ps1` para a rota nova se necessário.
- [ ] T033 TV física (quickstart §4): instalar o pacote comercial sem desinstalar, cenários 2–10, `evidencias/tv.md`.
- [ ] T034 Backlog/status via scripts; `plan.md` Estado Atual/Execution Notes.

### Checklist de Release

- [X] Fase 1 (constitution 1.11.0, ADR-016, notas 069/070) concluída
- [X] Fase 2 (agente sob demanda, teste local, âncora) concluída
- [X] Fase 3 (US1/US2: Atualizar e bloqueio) concluída
- [X] Fase 4 (US5: QR fixo) concluída
- [X] Fase 5 (US4: envio TV → site) concluída
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
