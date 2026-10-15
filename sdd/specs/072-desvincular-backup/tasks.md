# Tasks: Desvincular a TV do portal e backup dos dados de uso

**Input**: Documentos de design de `sdd/specs/072-desvincular-backup/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/portal-api-072.md, logic/{desvincular,backup}.md
**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- TV: `tv-web/src/lib/portal/`, `tv-web/src/lib/backup/`, `tv-web/src/lib/catalog/dbSchema.ts`,
  `tv-web/src/features/settings/`, `tv-web/src/features/portal/`, `tv-web/src/lib/i18n/messages/portal.ts`, `tv-web/e2e/`
- Serviço: `api/app/portal/`, `api/app/portal/routes/`, `api/tests/portal/`
- Painel: `portal-web/src/features/`, `portal-web/e2e/`
- Normativo: `.planning/memory/constitution.md`, `sdd/adr/`

---

## Phase 1: Gate normativo (bloqueante)

**Purpose**: aprovar a saída de BYOK/PIN em hash e dados de uso da TV antes de qualquer código (plan D-001, R-001).

- [X] T001 Emendar `.planning/memory/constitution.md` → 1.12.0: item (g) em "Segredos" — dados de uso (favoritos,
  histórico, progresso, preferências de categoria, configurações), PIN por lista em hash com sal e chave TMDB BYOK
  PODEM ir ao serviço **só por ação da pessoa**, cifrados em repouso, só devolvidos à mesma TV, nunca em log/URL/erro/
  cache/site (site vê só data e contagens), apagáveis pela pessoa; risco aceito do PIN curto (R-002). Relatório de
  impacto, histórico e rodapé. **Pedir aprovação do usuário.**
- [X] T002 Registrar `sdd/adr/ADR-017-desvincular-backup.md` via `sdd-adr` (reassociação pela própria TV com o código
  de recuperação; backup de uso preso à identidade; alternativas da `research.md` §1–§3); notas `Atualização (ADR-017)`
  em ADR-013 e ADR-015; tabela de ADRs do `CLAUDE.md`. **Pedir aprovação do usuário.**

**Registro da Fase**:

- Status: concluída e aprovada pelo usuário em 2026-10-14.
- Feito: T001 constitution 1.12.0 — itens (g) backup de uso/PIN em hash/chave TMDB cifrados só para a mesma TV, apagável, painel só com data e contagens; (h) código de recuperação guardado após Desvincular, uso único; relatório de impacto, histórico e rodapé. T002 `sdd/adr/ADR-017-desvincular-backup.md`, notas `Atualização (ADR-017)` em ADR-013 e ADR-015, tabela do `CLAUDE.md`. Analyze: A001 (FR-002 preserva a fila de exclusões) e A002 (chave TMDB da TV vence) resolvidos na spec com o usuário.
- Contrato: sem contrato nesta fase; trava 072 íntegra.
- Testes executados: nenhum (fase normativa).
- Pendências: nenhuma.

---

## Phase 2: Foundational

**Purpose**: esquema, tipos e serviço base que todas as stories usam.

- [X] T003 `tv-web/src/lib/catalog/dbSchema.ts`: versão **25** com `pendingRestore: 'sourceId, expiresAt'`; incluir a
  tabela em `sourceDeletionTables` (excluir a lista descarta o pendente) — conferir `pinMigration.upgrade.test.ts`
  (lista de tabelas esperadas).
- [X] T004 [P] `tv-web/src/lib/backup/backupState.ts`: ler/gravar `portalDevice/backup` (`state`, `lastBackupAt`,
  `offer`) — ausente = `unknown` (`data-model.md` §1).
- [X] T005 [P] `api/app/portal/models.py`: `UsageBackupDocument` (`data-model.md` §2); `api/app/portal/backup.py`:
  `UsageBackupService` (put/get/summary/delete com `PortalCrypto`, contexto `usage-backup/v1`, teto 512 KB);
  `retention.py` apaga `backups/current` junto do aparelho.
- [X] T006 `api/app/portal/routes/backup.py` + `application.py`: rotas da TV e do painel (`contracts/portal-api-072.md`),
  `no-store`, limites, sem log de corpo.

### Testes da Fase

- [X] T007 `api/tests/portal/test_backup.py`: só a mesma TV lê/apaga (outra TV 404); site só resumo; `no-store`;
  payload > 512 KB → 422; marcadores fora de logs/respostas (`caplog`); retenção apaga o backup.

**Critério de Conclusão**: pytest de backup verde com emulador; `tsc`/lint limpos; nenhuma story iniciada antes.

**Registro da Fase**:

- Status: concluída em 2026-10-14.
- Feito: T003 Dexie **v25** `pendingRestore` + inclusão em `sourceDeletionTables` e apagamento na exclusão da lista (`sourceDeletion.ts`); comentário corrompido da v23 corrigido. T004 `lib/backup/backupState.ts` (`readBackupState`/`writeBackupState`, `backupTables`). T005 `UsageBackupDocument` (`models.py`), coleção `backups` em `document_path`, `api/app/portal/backup.py` (`UsageBackupService`, contexto `usage-backup/v1`, teto 512 KB → 413, contagens validadas). T006 `routes/backup.py` (TV: `PUT/GET /device/backup`, `GET /device/backup/summary`, `DELETE /device/backup`; painel: `GET/DELETE /backup`), `no-store`, 20 PUT/h por TV, `payload()` ganhou `limit` (padrão 64 KB inalterado). T007 `tests/portal/test_backup.py` (3 testes).
- Contrato: sem contrato nesta fase; trava 072 íntegra.
- Testes executados: `pytest tests/portal` (emulador) **148 passaram**; `ruff check .` limpo; TV `npx tsc -b` limpo; `vitest` de `lib/parental`, `sourceRepository`, `sourceDeletion`, `db` verdes (o `pinMigration.upgrade.test.ts` esperava `verno` 24 → 25, ajustado).
- Pendências: (1) o serviço não tem rotina de apagar aparelhos, então "retenção apaga o backup junto do aparelho" não tem onde se ligar — o backup segue o registro; (2) a rota do painel (`/backup`) é coberta pelo serviço no pytest e pelo E2E do portal-web na Fase 6.

---

## Phase 3: User Story 1 — Destravar a TV sem perder nada (Priority: P1) 🎯 MVP

**Objetivo**: Desvincular em Portal & licença e voltar ao mesmo registro em até 3 ações.
**Independent Test**: TV pareada com dados → Desvincular → Atualizar → mesmo ID, chave nova, dados intactos.

### Contrato da Fase

- `unlink.desvincular-backup.contract.test.ts` — "desvincular solta identidade… guarda o código de recuperação"
- `relink.desvincular-backup.contract.test.ts` — "cadastro recusado (recovery_required) é resolvido pela própria TV"
- Comando: `cd tv-web; npx vitest run src/lib/portal/unlink.desvincular-backup.contract.test.ts src/lib/portal/relink.desvincular-backup.contract.test.ts`

### Implementation

- [X] T008 [US1] `tv-web/src/lib/portal/unlink.ts`: `unlinkPortal`/`readRelinkHint` (`logic/desvincular.md` §1) → contrato: unlink.
- [X] T009 [US1] `api/app/portal/self_relink.py` + rota `POST /devices/recovery/self` (`logic/desvincular.md` §3;
  reaproveitar a emissão da rotação `revoke` de `access_rotation.py` e os limites/recusa uniforme do `confirm` de `recovery.py`).
- [X] T010 [US1] `tv-web/src/lib/portal/portalConnection.ts`: `recovery_required` com lembrete → `/devices/recovery/self`,
  persistir emissão, apagar lembrete; `invalid_credentials` apaga o lembrete (`logic/desvincular.md` §2) → contrato: relink.
- [X] T011 [US1] `tv-web/src/lib/portal/portalAgent.ts`: `reset()` (aborta o que corre e esquece as pausas) para o Desvincular.
- [X] T012 [US1] `tv-web/src/features/settings/PortalBackupActions.tsx` (novo) + `PortalLicensePanel.tsx`: ação
  **Desvincular** (soft-disabled sem pareamento) com `PortalPrivateDialog` (Cancelar inicial), backup antes se online,
  aviso "backup não feito" offline; i18n pt/en/es em `messages/portal.ts`. Atenção ao teto de linhas do painel (ratchet).

### Testes da Fase

- [X] T013 `api/tests/portal/test_self_relink.py`: mesmo `deviceId`/`display_id`, `auth_epoch+1`, código novo, sessões
  antigas recusadas, código errado/antigo → 401 uniforme, limites 429, idempotência por `nonce`, código fora de log.
- [X] T014 `tv-web/src/features/settings/PortalBackupActions.test.tsx`: foco inicial em Cancelar, RETURN cancela,
  soft-disabled sem pareamento, aviso offline.

**Critério de Conclusão**: comando do contrato → 2/2 verdes e `check-contract-tests.ps1 -Slug 072-desvincular-backup`
íntegro; pytest de self-relink verde; Desvincular → Atualizar volta ao mesmo ID na pilha local.

**Registro da Fase**:

- Status: concluída em 2026-10-14.
- Feito: T008 `lib/portal/unlink.ts` (`unlinkPortal` numa transação: apaga `device`/`bootstrap`/`licenseCache`/`sourceUploads`, guarda o lembrete `relink`, estado do backup `unknown`; `readRelinkHint`/`clearRelinkHint`). T009 `api/app/portal/self_relink.py` + `POST /devices/recovery/self` (`routes/backup.py`): prova = identidade + código ativo; reaproveita a rotação write-ahead `revoke` (`AccessRotation.begin/poll`), operação determinística pelo nonce (repetição devolve a mesma emissão sem nova prova), limites 5/h por identidade, 20/h por IP, 200/h global, recusa uniforme `invalid_credentials`. T010 `PortalConnection.prepare()` trata `recovery_required` com o lembrete e apaga-o ao concluir (ou quando o código é recusado). **Achado e corrigido no ato**: o cliente HTTP da TV transformava todo 409 em `conflict` e todo 401 em `unauthorized`, então a TV real nunca veria `recovery_required` nem `invalid_credentials` — `portalClient.ts` passou a ler só esses dois códigos do corpo (JSON curto, ≤ 512 B; o resto continua pelo status) e ganhou `DELETE` e 404 → `not_found`. T011 `PortalAgent.reset()` + `registerPortalReset`/`resetPortalAgent` no runtime. T012 `PortalBackupActions.tsx` (Desvincular soft-disabled sem pareamento; confirmação com `PortalConfirmDialog`, Cancelar inicial; backup antes se online, aviso quando não) integrado ao `PortalLicensePanel` (ações 7–10, `PORTAL_ACTION_COUNT` = 11). T013 `test_self_relink.py` (3). T014 `PortalBackupActions.test.tsx` (2).
- Contrato: `npx vitest run src/lib/portal/unlink.desvincular-backup.contract.test.ts src/lib/portal/relink.desvincular-backup.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: pytest `test_self_relink.py` 3/3 (1 iteração para a repetição pelo nonce); `portalClient.codes.test.ts`, `portalConnection.test.ts`, `PortalBackupActions.test.tsx` verdes; `usePortalIntegration.test.tsx` ajustado (mock do runtime ganhou `registerPortalReset`); `portalTables.test.ts` versão do esquema 24 → 25.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 — Fazer backup dos dados de uso (Priority: P1)

**Objetivo**: backup no Atualizar de listas e no botão, sem nunca sobrescrever um backup não decidido.
**Independent Test**: dados de uso → Fazer backup agora → serviço tem backup com contagens certas e sem segredo em claro.

### Contrato da Fase

- `backupDecision.desvincular-backup.contract.test.ts` — "o passo de backup só sobe quando não há backup pendente de decisão"
- `usageBackup.desvincular-backup.contract.test.ts` — "o backup leva favoritos… sem nenhuma URL ou credencial de lista"
- Comando: `cd tv-web; npx vitest run src/lib/backup/backupDecision.desvincular-backup.contract.test.ts src/lib/backup/usageBackup.desvincular-backup.contract.test.ts`

### Implementation

- [X] T015 [P] [US2] `tv-web/src/lib/backup/backupDecision.ts`: `nextBackupAction` (`logic/backup.md` §2) → contrato: backupDecision.
- [X] T016 [P] [US2] `tv-web/src/lib/backup/usageBackup.ts`: `buildUsageBackup` com allowlist de configurações (plan D-008)
  e corte de 512 KB (research §3) → contrato: usageBackup.
- [X] T017 [US2] `tv-web/src/lib/backup/backupClient.ts`: `summary`/`put`/`get`/`delete` via `PortalConnection.client` (bearer).
- [X] T018 [US2] `portalAgent.ts`/`portalSync.ts`/`usePortalIntegration.tsx`: passo `backup` após `snapshot` no
  `refresh('lists')` e escopo `backup` para o botão; sem timer, sem retry (ADR-016).
- [X] T019 [US2] `PortalBackupActions.tsx`: **Fazer backup agora** + "Último backup: <data>"; com oferta em aberto pede
  confirmação para substituir (`logic/backup.md` §2).

### Testes da Fase

- [X] T020 `portalAgent.test.ts`: Atualizar de listas chama o passo de backup depois do snapshot; nada sobe sozinho.
- [X] T021 `usageBackup.test.ts` (não travado): corte de histórico no limite preserva favoritos e progresso.

**Critério de Conclusão**: comando do contrato → 2/2 verdes e trava íntegra; parado 24 h simulado → 0 requisições de backup.

**Registro da Fase**:

- Status: concluída em 2026-10-14.
- Feito: T015 `nextBackupAction` (+ estado `disabled`). T016 `buildUsageBackup` (allowlist de configurações em `usageSettings.ts`; corte de 512 KB por busca binária, preservando favoritos e progresso). T017 `backupClient.ts` (summary/put/get/remove; `expectExisting`). T018 escopo `backup` no agente, passo `backup` depois do `snapshot` no Atualizar de listas, porta `backup` em `usePortalIntegration` com `runBackupStep` (aplica pendências, pergunta o resumo só em `unknown`, sobe, oferece ou pula; `not_found` → `disabled`). T019 Fazer backup agora + "Último backup" em `PortalBackupActions` (oferta em aberto pede confirmação para substituir; `disabled` volta a guardar só pelo botão). **Decisão nova (R-009)**: apagar o backup (TV ou site) desliga o envio automático; o serviço não recria quando a TV esperava um backup existente (`expectExisting` → 404), cumprindo SC-006. T020 caso no `portalAgent.test.ts`. T021 `usageBackup.test.ts` (corte no limite). Extra: `backupStep.test.ts` (3).
- Contrato: `npx vitest run src/lib/backup/backupDecision.desvincular-backup.contract.test.ts src/lib/backup/usageBackup.desvincular-backup.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/backup src/lib/portal` verdes; pytest `test_backup.py` 4/4 (inclui não recriar backup apagado); `ruff check .` limpo.
- Pendências: nenhuma.

---

## Phase 5: User Story 3 — Restaurar depois de reinstalar ou re-parear (Priority: P1)

**Objetivo**: oferta com confirmação; mescla por lista; pendências de 5 dias.
**Independent Test**: backup → apagar dados locais → parear → Restaurar → cada dado na lista certa.

### Contrato da Fase

- `usageMerge.desvincular-backup.contract.test.ts` — "restaurar mescla por lista + identidade lógica…"
- Comando: `cd tv-web; npx vitest run src/lib/backup/usageMerge.desvincular-backup.contract.test.ts`

### Implementation

- [X] T022 [US3] `tv-web/src/lib/backup/usageMerge.ts`: `planRestore` (`logic/backup.md` §3) → contrato: usageMerge.
- [X] T023 [US3] `tv-web/src/lib/backup/usageRestore.ts`: aplicar plano numa transação, gravar `pendingRestore`,
  configurações da allowlist (inclui `ccplay.parental.pinSources`, R-008), chave TMDB sem rede (plan D-009),
  `applyPendingRestores` (aplica/expira) no fim do Atualizar e ao abrir Portal & licença.
- [X] T024 [US3] `tv-web/src/features/portal/RestoreOffer.tsx` (montado em `usePortalIntegration`): "Restaurar backup
  de <data>?" com Restaurar / Agora não (foco inicial em **Agora não**, para não restaurar sem querer; restaurar
  nunca apaga dado local, mas é uma escrita grande), aparece uma vez por oferta; Portal & licença ganha **Restaurar backup** enquanto houver oferta/backup.

### Testes da Fase

- [X] T025 `usageRestore.test.ts`: pendente aplicado quando a lista volta; descartado após 5 dias; apagar backup limpa pendentes.
- [X] T026 `RestoreOffer.test.tsx`: foco, RETURN = Agora não, não reaparece sozinha.

**Critério de Conclusão**: comando do contrato → 1/1 verde e trava íntegra; cenário 5–7 do quickstart na pilha local.

**Registro da Fase**:

- Status: concluída em 2026-10-14.
- Feito: T022 `planRestore` (união; vence o mais recente; registros inválidos do serviço descartados). T023 `usageRestore.ts` (`restoreUsageBackup` numa transação; chave TMDB do backup só se a TV não tiver — A002; configurações da allowlist; `applyPendingRestores` no passo de backup e ao abrir Portal & licença; `deleteUsageBackup`; `dismissRestoreOffer`). T024 `features/portal/RestoreOffer.tsx` montado em `usePortalIntegration` (foco inicial em "Agora não", RETURN = Agora não, não reabre sozinho) + Restaurar em Portal & licença. T025 `usageRestore.test.ts` (2). T026 `RestoreOffer.test.tsx` (1).
- Contrato: `npx vitest run src/lib/backup/usageMerge.desvincular-backup.contract.test.ts` → 1/1 verde; trava íntegra.
- Testes executados: `npx vitest run src/lib/backup src/features/portal src/features/settings/PortalBackupActions.test.tsx` verdes.
- Pendências: nenhuma.

---

## Phase 6: User Story 4 — Apagar o backup (Priority: P2)

**Objetivo**: apagar na TV e no site; o site só vê resumo.
**Independent Test**: apagar pela TV e pelo site → serviço sem backup; TV e site mostram "sem backup".

### Implementation

- [X] T027 [US4] `PortalBackupActions.tsx`: **Apagar backup** com confirmação (limpa pendentes locais).
- [X] T028 [P] [US4] `portal-web/src/features/BackupCard.tsx` + `api.ts`: data, contagens e Apagar (CSRF), pt/en/es do painel.

### Testes da Fase

- [X] T029 `portal-web` unit + caso em `portal-web/e2e/gerenciador.spec.ts`: só data/contagens; apagar funciona.

**Critério de Conclusão**: TV e site apagam; nenhum título/PIN/chave aparece no site.

**Registro da Fase**:

- Status: concluída em 2026-10-14.
- Feito: T027 Apagar backup em `PortalBackupActions` (confirmação; limpa pendências; estado `disabled`). T028 `portal-web/src/features/BackupCard.tsx` (data e contagens; apagar com `<dialog>` e CSRF), `api.backup`/`api.deleteBackup`, i18n pt/en/es, montado no `SourceManager`. T029 caso novo em `portal-web/e2e/gerenciador.spec.ts`.
- Contrato: sem contrato nesta fase.
- Testes executados: portal-web `npm run lint` 0, `npm run test` 7/7, `npm run build` ok, `npx playwright test` **16/16** (vite em 5174).
- Pendências: o rótulo do botão de confirmação reaproveita "Confirmar remoção" do painel.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 Revisão de segredos com marcadores (`evidencias/segredos.md`): código de recuperação, chave TMDB, PIN, URLs.
- [X] T031 E2E opt-in `tv-web/e2e/desvincular-backup.mjs` (pilha `lib/portalStack.mjs`): quickstart §3 1–10; legibilidade
  das telas novas em `tv-web/e2e/legibilidade-tv.mjs` (pt/en/es).
- [X] T032 Docs: `docs/portal/operacao.md` (desvincular, reassociação, backup, rollback), `README.md`, `CLAUDE.md` (ADR-017).
- [X] T033 Gates: TV `tsc`/lint/`npm run test`/build/`build:tizen`; API pytest + Ruff; portal-web lint/test/build/E2E;
  `npm run test:e2e` completo com `npm run dev`; travas 072/071/070/069/067/026/019 íntegras.
- [X] T034 Publicar API + portal-web no staging (`portal.ccplaytv.com`) **com confirmação do usuário**; smokes.
- [ ] T035 TV física (recomendação): quickstart §4; `evidencias/tv.md`.
- [ ] T036 Backlog/status via scripts; `plan.md` Estado Atual/Execution Notes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

**Registro da Fase (Polish T030–T034)**:

- Status: T030–T034 concluídas em 2026-10-14; T035 (TV física, recomendação) aguarda a observação do usuário; T036 fecha o status.
- Feito: T030 `evidencias/segredos.md`. T031 `tv-web/e2e/desvincular-backup.mjs` (opt-in, pilha local: backup no Atualizar, Desvincular com backup antes, reassociação ao mesmo ID, oferta → Restaurar com lista ausente pendente, apagar desliga o envio, marcadores fora de URL/log) + passo "Oferta de restauração do backup" no bloco comercial de `legibilidade-tv.mjs`; régua de rotas do `consulta-sob-demanda.mjs` passou a aceitar `/device/backup*`. T032 `docs/portal/operacao.md` (seção 072), `README.md`, `CLAUDE.md` (ADR-017 e constitution v1.12.0). T033 gates. T034 staging (`evidencias/staging.md`): revisões `portal-00019-kqv`/`jobs-00018-t7g`, `smoke-backup.ps1` novo; pacote comercial instalado na TV.
- Contrato: 5/5 verdes na suíte completa; travas 072/071/070/069/067/045/037/026/019 íntegras.
- Testes executados: `npx tsc -b` limpo; `npm run lint` 0; `npm run test` **3359/3359**; `npm run build` ok; `node e2e/run.mjs` **49/49**; opt-in `desvincular-backup` (23 requisições), `consulta-sob-demanda` (24), `entrada-listas-gerenciador`, `portal-dev-server` PASS; `legibilidade-tv` 1/1; API `pytest tests/portal` **152** + `ruff` limpo; portal-web lint/test 7/build/E2E **16/16**.
- Pendências: (1) T035 TV física; (2) `build:tizen` (pacote pessoal) não rodado porque substituiria o pacote comercial instalado; `build:tizen:commercial` rodou e foi para a TV.

### Checklist de Release

- [X] Fase 1 (constitution 1.12.0, ADR-017) aprovada
- [X] Fase 2 (esquema v25, serviço de backup) concluída
- [X] Fase 3 (US1: desvincular e reassociar) concluída
- [X] Fase 4 (US2: backup) concluída
- [X] Fase 5 (US3: restaurar) concluída
- [X] Fase 6 (US4: apagar) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (072 e travas vizinhas)
- [X] Revisão de segredos aprovada
- [X] E2E opt-in e suíte E2E completa aprovados
- [X] Staging publicado com confirmação do usuário (`evidencias/staging.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- Fase 1 bloqueia tudo. Fase 2 bloqueia 3–6. US1 (Fase 3) e US2 (Fase 4) podem andar em paralelo depois da 2; US3
  depende de US2 (precisa do backup); US4 depende de 2. Polish por último.

### Parallel Opportunities

- T004/T005; T015/T016; T028 em paralelo com as tarefas da TV.

## Implementation Strategy

### MVP First (User Story 1 apenas)

Fases 1–3 já entregam o destravamento sem perder dados (a dor original).

### Incremental Delivery

US1 → US2 → US3 → US4, publicando a API antes de instalar o pacote na TV.

## Notes

- Nada automático (ADR-016). Nenhum segredo em URL/log/erro. Arquivos de contrato nunca editados.
