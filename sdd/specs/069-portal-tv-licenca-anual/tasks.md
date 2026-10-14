# Tasks: Portal da TV e licença anual

**Input:** spec/plan/data-model/contracts/logic/infraestrutura/quickstart/handoff da 069, revisão 2026-10-11.

## Format: [ID] [P?] [Story] Description

T001–T052 preservados; progresso corrente nos checkboxes e nos Registros da Fase abaixo. Contratos existentes não são tarefas de escrita. [P] somente se arquivos/dependências permitirem; não autoriza agentes ou mudança de ordem dos gates.

## Path Conventions

TV existente `tv-web/src/{App.tsx,lib/catalog,lib/player,features/settings,features/profiles}`; stubs/contratos em lib/portal e lib/licensing. Novos colaboradores nesses diretórios, testes colocados ao lado/E2E em tv-web/e2e. Bootstrap do portal em portal-web/src e portal-web/e2e. Backend isolado em api/portal_main.py/api/app/portal/api/tests/portal usando pyproject/uv.lock existentes, sem importar fallback. Infra preparada em infra/portal; evidências sdd/specs/069-portal-tv-licenca-anual/evidencias. Schema/registro real de abas precisam releitura, não assumir caminho/versão do plano anterior.

## Phase 1: Setup e gates normativos/plataforma

**Objetivo:** Preparar serviço isolado e resolver normas/provar plataforma antes de fluxos sensíveis.

### Implementation

- [x] T001 Compatibilizar constitution com exceções restritas da ADR-013: controle/retenção cifrada/backup/convite QR/licenciamento/checkout externo e exibição protegida do código de recuperação. Constitution 1.8.0 formalizada em 2026-10-11; registro em plan/evidências, sem declarar implementação conforme. (FR-008, FR-014-017, FR-028, FR-031; SC-009)
- [x] T002 Escrever `docs/portal/operacao.md` com runtime isolado, mapa de serviços/ADC/IAM/ambientes/segredos privados, responsável mantenedor e alertas, sem valores reais. Distinguir licença R$35/ano de infraestrutura R$10/mês. (FR-008, FR-014-015, FR-032)
- [x] T003 Criar `tv-web/src/lib/portal/platformProbe.ts` DEV e `evidencias/plataforma.md`: medir getDuid/productinfo/ES256/AES/tempo/suspend/persistência em file://; E2E antes de hardware, dados preservados. Caracterizar limite de FR-027 antes de cobrar, reinstalação só lab. (FR-001, FR-027, FR-031; SC-007, SC-009, SC-011)
- [x] T004 Criar `portal-web/package.json`/scripts React/Vite/test/E2E, `api/portal_main.py`, `api/app/portal/settings.py` e dependências Firestore/Storage/cryptography/QR com versões/licenças no lock; emulator fail-closed e índices/versionamento próprios em `infra/portal/`. Sem importar fallback/SQL. (FR-008, FR-029)
- [x] T051 Preparar `infra/portal/Dockerfile.portal`, `.dockerignore`, IAM/Run/Scheduler/índices/backup/journal: público+privado mesma imagem, ADC, região us-central1/min0/max2 propostos, bucket create-only, segredos fora de imagem/CLI, alertas sem corte. Não provisionar durante planejamento. (FR-014-015, FR-032; SC-010)

### Testes da Fase

- [x] T054 Extrair a política pura isInHistory para historyPolicy.ts preservando reexportação, comportamento e alteração anterior de favoritos; desvio R-015 autorizado pelo usuário em 2026-10-11. Revalidar lint, TypeScript e histórico.
- [x] T055 Corrigir desvio ad-hoc descoberto no gate T041: aquecer imediatamente a rota leve SourceAccessRoute em perfis para evitar Suspense pendente sob carga, sem alterar contratos ou telas pesadas.
- [x] T053 Investigar e corrigir falha reproduzida no primeiro play do E2E player-dev-mpegts, descoberta durante T003; desvio autorizado pelo usuário em 2026-10-11. Preservar contratos e orçamento de 15 segundos; repetir regressão estreita e suíte.

- [x] T048 Criar `api/tests/portal/test_bootstrap.py` para isolamento de entrypoint/settings/logs e ausência de runtime SQL; registrar prova T003 no roteiro `quickstart.md`. (FR-008, FR-014; SC-009)

**Critério de Conclusão:** T001 resolvido, bootstrap isolado e prova T003 documentada sem apagar dados; nenhuma venda habilitada.

**Registro da Fase:**

- Status: Concluída; execução contínua segue para fase 2.
- Feito: Fase 1: operação/infra preparadas; API 7/7 e Ruff, sonda Node 2/2; E2E player-dev-mpegts falhou no primeiro play (15050 ms/limite15000), demais cenários do script passaram. Repetição isolada falhou em 15040 ms; T053 concluída com seleção do Chrome instalado no roteiro e comprovação de avanço do relógio, sem alterar o adaptador.
- Contrato: sem contrato nesta fase; cinco contratos 069 íntegros e ainda vermelhos nos stubs das fases 3/5.
- Testes executados: pytest api/tests/portal -q: 7/7; Ruff bootstrap PASS; portal build/lint PASS, Vitest 1/1 com encerramento A005 pendente e E2E bootstrap 1/1 (43,9 s). Suíte TV final 47/47 PASS (1062 s, jobs 3), incluindo player-dev-mpegts e portal-plataforma; build TV PASS. Lint TV aprovado após T054; adaptador intacto.
- Pendências: nenhuma bloqueante da fase 1. A005 encerramento Vitest registrado para T041. T009/T035 devem respeitar limites de standby/relógio medidos; provas comerciais/homologação/reinstalação continuam posteriores.


## Phase 2: Fundação — identidade, persistência e transporte

**Objetivo:** Autorizar destino correto e sincronizar com lifecycle/retenção/retries definidos.

### Implementation

- [x] T005 Criar `api/app/portal/models.py` e `repositories/` para devices/claims/sessions/configurations/versions/operations/tombstones/deletionIntents/jobs; CAS/epoch/leases/IDs determinísticos, callbacks puros e limites/retenções do data-model. (FR-001-005, FR-009-015, FR-033)
- [x] T010 [US1] Migrar próxima versão livre em `tv-web/src/lib/catalog/dbSchema.ts`/`portalTables.ts`: sourceRevisions/portalOperations/pendingImportOutbox/pendingPortalDeletes/licenseCache. Não mudar migração067 nem criar m3u_file/sourceFiles. (FR-006, FR-009-011, FR-033)
- [x] T023 [US2] Implementar `api/app/portal/recovery_journal.py` e exclusão em `operations.py`: reserve fence→append condicional/digest→finalize, expurgo segredo/versões/cancelamento/delete até ACK. Jobs retomam crash, snapshot/recovery/restore não reativam fonte excluída. (FR-015, FR-032-033; SC-010, SC-012)
- [x] T006 Implementar `api/app/portal/auth.py` e `routes/auth.py`: bearer/cookie/CSRF/Origin, hashes distintos/epoch, QR256bits/5min/uso único, sessão30min/8h, rate limit compartilhado conforme contracts. Nenhuma key permanente em URL. (FR-001-005, FR-014)
- [x] T007 Criar deviceIdentity.ts/portalTables.ts e api/app/portal/recovery.py: código privado >=128 bits/HMAC/versionamento, desafio TV256bits/5min, confirmação web/mesma identidade, fence→journal→CAS/rotação, entrega cifrada5min/ACK/retry e retomada24h conforme logic §7. Revoke acessos/código antigos, preservar trial/ledger/configurações; sem CLI/atendimento. (FR-001-004, FR-031; SC-011)
- [x] T008 Implementar `api/app/portal/crypto.py` AES-GCM/nonce/AAD/keyVersion, assinatura ES256 e rotações/chaves por finalidade; env privado/cópia separada, sem cofres/KMS. Browser não lê salvo; TV autorizada recebe por HTTPS, servidor não é E2E opaco. (FR-007, FR-012-015, FR-027)
- [x] T009 Criar `tv-web/src/lib/portal/portalClient.ts`, `usePortalAgent.ts` e `api/app/portal/worker.py`: 24h persistido, imediato10s só tela rápida, lifecycle/retries limitados; exclusões antes de pull, lote/lease/checkpoint/OIDC ou --once, sem BackgroundTasks/loop. Create/update7dias não apaga corrente, delete não expira. (FR-009-010, FR-015, FR-030, FR-033; SC-003, SC-006)

### Testes da Fase

- [x] T049 Criar `api/tests/portal/test_auth.py`/`test_retention.py`: concorrência/uso único/cross-device/revoke/CSRF/nullOrigin/rate limit entre instâncias, expiração lógica distinta de expurgo/corrente/delete. Emulator e homologação real separada. (SC-001, SC-004, SC-011)
- [x] T050 Criar `api/tests/portal/test_crypto.py` e `tv-web/src/lib/portal/usePortalAgent.test.tsx`: tamper/AAD/destino/nonce/rotação/segredo não revelado, 24h/restart/rápido limitado/suspend/retry/overlap. (FR-015, FR-030; SC-003, SC-004, SC-006)

**Critério de Conclusão:** Auth/crypto/lifecycle/retenção testados, fila durável, nenhuma dependência de rede nos comandos locais.

**Registro da Fase:**

- Status: Concluída localmente; execução contínua segue para US1.
- Feito: T005 modelos/repos Firestore (CAS/identidade/trial/leases), T008 crypto, T010 migração v22, T023 journal/exclusão e T006 autenticação/cadastro/revoke concluídas. T007 recuperação pelo site concluída no núcleo/HTTP/persistência local; T009 transporte/agente TV e executor/retenção paginada implementados; T049/T050 aprovadas.
- Contrato: cinco contratos congelados íntegros, fases 3/5 ainda não implementadas.
- Testes executados: API 63/63 PASS (54,30 s), incluindo recuperação HTTP/cross-device/restore e concorrência real no emulator; Ruff PASS. Após guarda adicional de restore, regressões estreitas 8/8 PASS. Repetição completa encontrou 2 falhas de contenção (21/23), corrigidas no retry da unidade transacional com jitter/prazo; regressões adicionais e suíte completa passaram. TV transporte/agente/hook 9/9 PASS (16,46 s), banco 11/11, identity/tabelas 7/7, tsc/lint/build PASS e E2E afetados 3/3 (antes das funções locais de identidade, ainda não integradas à UI). Primeiro teste de erro dependia de dist local e retornou 404; fixture isolada corrigida, reprodução repetida e 11/11 aprovados.
- Pendências: nenhuma bloqueante local desta fase. A005 permanece em T041; agente será ligado ao App em T018, UI recovery em T024/T025, compactação de recibos com claims em T013/T022. Expiração lógica não promete expurgo físico pontual. Emulator provado localmente; IAM/homologação real e standby integrado continuam posteriores.

## Phase 3: US1 — gerir listas (P1/MVP)

**Objetivo:** Configurar listas remotamente e excluir nos dois sentidos, preservando dados e conflitos.

### Contrato da Fase

C1 criação/replay, C2 revisão antiga, C3 destino, C4 allowlist; nomes completos/origens em plan.md. Em tv-web: `node.exe node_modules/vitest/vitest.mjs run src/lib/portal/portal-tv-licenca-anual.contract.test.ts -t 'US1|FR-005|FR-013-014'`. T014/T015 fazem passar sem editar contrato. C5 permanece vermelho até fase 5.

### Implementation

- [x] T011 [US1] Refatorar primitivas de `tv-web/src/lib/catalog/sourceRepository.ts`: sourceId remoto explícito, revisão em toda mutação, exclusão+tombstone+outbox atômicos preservando limpeza existente. Revisão antiga conflita; sourceId excluído não é reutilizado. (FR-010-011, FR-033 → C1/C2)
- [x] T012 [US1] Integrar `tv-web/src/lib/portal/remoteImportOutbox.ts` ao `catalog/importRunner.ts`/`importWorker.ts`/`importPipeline.ts`: download/parse TV, dedupe source/configRevision, quota/cancel/fallback/geração anterior; sem fetch IPTV servidor. (FR-006-008; SC-002)
- [x] T013 [US1] Implementar `api/app/portal/operations.py`/`routes/operations.py`: permanente+versão imutável+fila transacionais, aplicada/desejada separadas, ACK/expiry não apagam corrente; deletes/fences/journal/outbox antes de pull conforme logic §§2–3, sem falso applied. (FR-005-015, FR-033; SC-012)
- [x] T014 [US1] Implementar `tv-web/src/lib/portal/remoteConfiguration.ts` e dreno `remoteImportOutbox.ts` conforme logic §1: destino/revisão/tombstone, commit+recibo+outbox, import pós-commit idempotente. (FR-005, FR-009-011, FR-033 → C1/C2/C3)
- [x] T015 [US1] Implementar toPortalSourceView no stub e `tv-web/src/lib/portal/snapshotPublisher.ts`: allowlist literal, revisões/capturedAt separados, nada de URL/DNS/key/segredo local exportado. (FR-013-014 → C4)
- [x] T016 [US1] Criar `portal-web/src/features/{SessionPage,SourceManager,SourceForm,OperationStatus}.tsx` e `api.ts`: QR/manual/destino, Xtream/M3U URL/EPG, secreto vazio preserva, substituição explícita, stale/pendente/conflito/import separado, sem upload. (FR-002-003, FR-006-015)
- [x] T017 [US1] Criar `tv-web/src/features/settings/PortalLicensePanel.tsx` e `tv-web/src/features/settings/tabs/PortalLicenseTab.tsx`; integrar `tabs/settingsTabs.ts`, `tabs/settingsTab.ts` e `tv-web/src/features/profiles/ProfilesScreen.tsx`. QR legível/validade, key só ação protegida explícita, revoke/RETURN e atalho adicionar pelo site; consultar três artefatos V14/guias. (FR-002-004, FR-028-029)
- [x] T018 [US1] Integrar agente único em `tv-web/src/App.tsx`, confirmação destrutiva/foco por ID/invalidação Query pós-commit; mensagens `tv-web/src/lib/i18n/messages/portal.ts` pt/en/es, sem alterar outros catálogos/player silenciosamente. (FR-009-011, FR-028-030)

### Testes da Fase

- [x] T019 [US1] Criar `api/tests/portal/test_operations.py`: cross-device/replay/CAS/ACK perdido/leases/cancel/expiry/erro sanitizado; delete online/offline/pendência>7dias, ACK antigo não reativa. (FR-033; SC-001-004, SC-012)
- [x] T020 [US1] Criar `tv-web/src/lib/portal/remoteConfiguration.test.ts`: crash commit/import/ACK, edição local, remoção offline/restart/outbox antes de pull, tombstone; rodar regressões sourceRepository/importPipeline/067. Sem casos de arquivo remoto. (SC-002, SC-004, SC-012)
- [x] T021 [US1] Criar `tv-web/e2e/portal-configuracao.mjs`/`portal-web/e2e/configuracao.spec.ts` e registrar runner: QR/manual/listas/replay/conflito/RETURN/stale, exclusões nos dois sentidos/offline, sem segredo renderizado. (SC-001-004, SC-008, SC-012)

**Critério de Conclusão:** C1–C4: 4/4 verdes com trava íntegra; testes adicionais/E2E passam, delete offline não recria lista e cobrança continua desligada.

**Registro da Fase:**

- Status: Concluída localmente; execução contínua segue para US2.
- Feito: T011 revisão/ID remoto/exclusão atômica/outbox; EPG local também incrementa revisão. T012/T014/T015 concluídas: reserva/import/outbox/aplicação CAS e snapshot allowlist. T013/T019 concluídas: configuração permanente/fila/entrega/ACK/cancel/expiry/snapshot e regressões emulator/HTTP.
- Contrato: C1–C4 4/4 verdes (15,45s), C5 apenas filtrado até fase5; trava069 íntegra e trava067 íntegra após emenda autorizada. Comando: `node.exe node_modules/vitest/vitest.mjs run src/lib/portal/portal-tv-licenca-anual.contract.test.ts -t 'US1|FR-005|FR-013-014'`.
- Testes executados: UI TV193/193 (38arquivos/61,38s), portas/hook/painel12+19 testes PASS, E2E App/0672/2 (114s) e portal5/5 PASS, type/lint/build PASS. API71/71 + regressão adicional de exclusão9/9 e Ruff PASS. Núcleo TV110/110 + Worker1/1, build/type/lint PASS; C1–C4 verdes, trava íntegra. API71/71 PASS (66,23s)/Ruff PASS, incluindo8 testes novos de configurações/HTTP/concorrência/fence/paginação. Rodada inicial falhou por async_generator, corrigida e repetida com sucesso. Exclusões/journal/>7dias cobertas em test_operations.py; complementos em test_configurations.py.
- Pendências: A005 encerramento Vitest permanece em T041 e apareceu também na rodada estreita C1–C4; não foi tratado como warning resolvido. Hardware/nuvem/comercial posteriores; nenhuma venda/instalação nova.

## Phase 4: US2 — permanência e recuperação (P2)

**Objetivo:** Reenviar configurações guardadas e recuperar acesso pelo site com exclusão durável.

### Implementation

- [x] T022 [US2] Implementar `api/app/portal/repositories/configuration_repository.py`: corrente/versões cifradas/reenvio pósACK/restart, nova tentativa/revisão válida, tombstone veta reenvio; sem ler segredo no browser. (FR-012-015, FR-033)
- [x] T024 [US2] Completar `portal-web/src/features/SourceManager.tsx`/`ConfigurationManager.tsx`: permanência/substituição/reenvio/exclusão pendente versus confirmada, página RecoveryPage.tsx: código/destino/estado/erros/retomada, sem atendimento. Sem IntegrationManager/API keys nem leitura de salvo. (FR-012-015, FR-031, FR-033)

### Testes da Fase

- [x] T025 [US2] Criar `api/tests/portal/test_configuration_store.py`/`test_recovery.py` e E2E: ACK/cancel/expiry/restart mantém corrente, reenvio/conflito/deletes/backup, código inválido/usado/cross-device/expirado/brute-force/concorrência recusados; perda de resposta/ACK e retomada testadas; sucesso rotaciona código/revoga acessos/preserva trial e ledger; somente lab para reinstalação. (SC-004, SC-010-012)

**Critério de Conclusão:** Permanência/reenvio/recovery/journal/deletes testados; C1–C4 preservados e nenhum segredo devolvido ao browser.

**Registro da Fase:**

- Status: Concluída localmente; execução contínua segue para US3.
- Feito: T024 UI de reenvio/recuperação web/TV implementada; QR temporário, confirmação de destino, segredo só no corpo, retomada idempotente/ACK persistido e exclusão pendente visível sem snapshot. T022 reenvio explícito da corrente cifrada, novo ID/versão/prazo, CAS e snapshot fresco; ausência confirmada permite create após recuperação, tombstone veda reenvio. Replay independe de snapshot atualizado após aplicar.
- Contrato: C1–C4 preservados; trava069/067 íntegras, rodada completa C1–C5 em validação para registrar vermelho esperado de C5 antes de US3.
- Testes executados: API completa76/76 PASS (67,45s), Ruff PASS; portal build/lint/unit4/4, E2E10/10 (2,2min); TV recuperação/painel/polling10/10, E2E integrado1/1 (113,4s), type/lint PASS anteriores; `pytest tests/portal/test_configuration_store.py tests/portal/test_configurations.py -q`:12/12 PASS (11,80s); Ruff PASS.
- Pendências: nenhuma bloqueante local da US2. A005 permanece em T041; nuvem/backup real e reinstalação física somente laboratório autorizado, posteriores. Nenhuma instalação nova, nenhum pagamento real.

## Phase 5: US3 — teste, compra e licença (P2)

**Objetivo:** Conceder licença de R$35/12 meses uma vez e validar localmente até vencer.

### Contrato da Fase

C5 licença offline/expiração (T030), preservar C1–C4. Em tv-web: `npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts` → 5/5 verdes. Não editar contrato/lock.

### Implementation

- [x] T026 [US3] Criar `api/app/portal/repositories/licensing_repository.py` e modelos comerciais: trial imutável/order/claims/ledger/grants/generation, CAS/retries puros, preço3500BRL/destino imutáveis, sem SQL. (FR-016-019, FR-021, FR-023)
- [x] T027 [US3] Implementar `api/app/portal/payments.py`/`providers/{mercadopago,fake}.py`: CheckoutPro anual3500BRL/Pix/cartão/manual, webhook oficial+lookup autenticado, merchant/reference/valor/moeda, reconcile durable; pendente não recompra, redirect não concede. (FR-020-024)
- [x] T028 [US3] Criar `api/app/portal/licensing.py`/`routes/licensing.py`: trial7dias, UTC12meses/clamp, ordenação deterministicamente recalculada de compras válidas, refund específico, ES256/kid/rotação/revogação journal conforme logic §§5–6. (FR-016-019, FR-022-027)
- [x] T029 [US3] Criar `tv-web/src/lib/licensing/{verifyEntitlement,licenseRepository,trustedClock}.ts`: assinatura/iss/aud/device/kid/generation, cache/tempo high-watermark/monotonic/checkpoint/lifecycle; internet só no agente. (FR-024-027, FR-030)
- [x] T030 [US3] Implementar stub `tv-web/src/lib/licensing/playbackAccess.ts` como decisão pura: offline vigente permite, inválida/errada/revogada/expirada negam, sem fetch/efeito destrutivo. (FR-025-027 → C5)
- [x] T031 [US3] Integrar guarda local na entrada da lista em App/LicenseGate: escolha, abertura após importação/verificação do provedor e RETURN do seletor. Remover guarda de vencimento por playback/trailer; sessão admitida continua até sair/fechar app. Preservar modo pessoal, sem bypass público no comercial. (FR-017, FR-025-028)
- [x] T032 [US3] Completar `tv-web/src/features/settings/PortalLicensePanel.tsx`/`portal-web/src/features/LicensePage.tsx`: trial/status/validade, mostrar/guardar/fotografar código por ação explícita e orientar recuperação pelo site, TV beneficiária/R$35 anuais/12meses/manual/Pix/cartão, checkout e ativação real por próximo contato. (FR-016, FR-018-021, FR-024, FR-028-031)
- [x] T033 [US3] Vencimento dentro da lista não interrompe navegação, novos plays ou retomada; próxima entrada exige licença vigente. Recusa mostra comprar/voltar com foco na lista pelo ID, sem apagar dados. Revogação confirmada mantém encerramento controlado e retomada aplicável. (FR-017, FR-026-028)

### Testes da Fase

- [x] T034 [US3] Criar `api/tests/portal/test_payments.py`/`test_licensing.py`: Firestore emulator/real, assinatura/3500BRL/merchant, duplicação/concorrência/retries/out-of-order/webhook perdido, refund parcial no ledger/renovações/29fev/trial. (SC-005-007)
- [x] T035 [US3] Testar relógio/assinatura/cache e entrada da lista: offline vigente, expiração durante sessão sem interrupção, novos plays/retomada, sair/reentrar por escolha/RETURN/verificação do provedor e reiniciar; revogação confirmada encerra, dados preservados. Contratos congelados preservados. (SC-007-008, SC-011)
- [x] T036 [US3] Criar `tv-web/e2e/licenca-anual.mjs`/`portal-web/e2e/licenca.spec.ts`/runner: fake e pagamento de teste separados, QR→checkout→ativação, página fechada/offline/renovação/estorno/preço. (SC-005-009)

**Critério de Conclusão:** C1–C5: 5/5 verdes/trava íntegra; ledger/calendar/guardas/E2E passam, fake e pagamento de teste diferenciados; cobrança real ainda bloqueada pelos gates finais.

**Registro da Fase:**

- Status: Concluída.
- Feito: T026–T036 concluídas; ledger/claims/CAS, Checkout Pro/lookup/webhook/reconcile, refund write-ahead, trial/calendário, ES256/cache/relógio/agente, guarda local na entrada da lista, UI web/TV e E2E de licença. Compras sandbox existentes foram reutilizadas; nenhuma nova cobrança foi criada.
- Contrato: vermelho prévio C5 confirmado no stub; após T030 C1–C5 5/5 PASS, arquivo/lock preservados.
- Testes executados: portal E2E 13/13 PASS; TV `licenca-anual` 1/1 PASS em 25,9s; API comercial/worker e testes de renovação/estorno previamente PASS; webhook oficial Mercado Pago `payment.updated` HTTP 200 confirmado no Cloud Logging; type/lint/build anteriores PASS.
- Pendências: nenhuma dentro da T036. Limitação aceita: a concessão comprovada das compras ocorreu por reconciliação autenticada, enquanto o webhook oficial foi validado por evento de teste separado; T041 e os gates de release continuam fora desta task.

## Phase 6: Aceite transversal e operação

**Objetivo:** Provar segurança, recuperação, metas, custos e operação no hardware antes da venda.

### Implementation

- [x] T037 Revisar `PortalLicensePanel.tsx`, `portal-web/src/features/` e `src/lib/i18n/messages/portal.ts`: foco/RETURN/IME/touch/teclado/pt-en-es, V14/067/068/acessibilidade, nenhum foco dispara rede/ação. (FR-028-029; SC-008)
- [x] T038 Revisar `api/app/portal/` e `docs/portal/operacao.md`: HTTPS/CSP/cookies/CSRF/CORS file:// bearer, HTTPX/Pydantic/logs/erros/limites/headers sem segredo, IAM/env/revisões CloudRun. (FR-005, FR-014-015)
- [ ] T039 Implementar runbook/scripts de `infra/portal/backup/` e `docs/portal/operacao.md`: diário7dias/alerta>24h, journal30dias separado/write-ahead, cópia chaves/rotação/restore nova base, manutenção/reconcile/revogações/exclusões/gerações, medir RPO/RTO. Ensaiar backup anterior a delete sem ressuscitar segredo ou grant. (FR-032-033; SC-010, SC-012)
- [x] T040 Atualizar `tizen_web_project.yaml`/`CCPlayTv/config.xml` para assets/Workers/fontes/productinfo/origens realmente necessários; chrome108 e hardware-plane preservados. (FR-029)
- [x] T044 Atualizar `README.md`, `docs/status-features.md` e documentos 069 com resultados reais; Estado Atual/Execution Notes/Riscos por checkpoint e backlog via script. Não marcar previsão como entregue. (SC-009)
- [x] T045 Verificar oferta **R$35/12meses/uma TV** em `api/app/portal/settings.py`/portal, conta MercadoPago/termos/retenção definida no data-model/autoatendimento sem canal ou SLA manual, orçamento em `infraestrutura.md` incluindo journal/restore/build/log/câmbio/impostos. Referência mensalR$10 com alertas/serviço ativo; venda exige gates, preço já aprovado. (FR-021, FR-031-032; SC-005, SC-009-011)

### Testes da Fase

- [x] T041 Resolver timeout de encerramento do runner Vitest (A005) sem inflar timeout/forçar saída, preservando contratos; rodar tsc/lint/unit/build nos pacotes, contratos/travas, E2E TV com dev ativo/portal; só depois build:tizen. Registrar comandos/resultados em `evidencias/validacao.md`. (SC-009)
- [x] T042 Inspecionar requests/responses/URL/DOM/logs/Pydantic/proxy/CI/checkout com marcadores fictícios; `evidencias/segredos.md` demonstra ausência de credenciais/chaves e campo futuro não vazando. Nunca imprimir ambiente real. (SC-004)
- [ ] T052 Criar `api/tests/portal/test_deployment.py`/`test_restore.py` e homologação real dedicada: ADC/IAM/claims/leases/retries/bucket create-only/crash journal/backup/restore/deletes/generações/reconcile, tick público negado e OIDC real permitido, SPA/health. `evidencias/infra.md` com custos/alertas/RPO/RTO. (SC-010-012)
- [ ] T043 Medir >=100 alterações e >=100 ativações, 10–50TVs/margem100simuladas, cold/warm/p95/rede/lifecycle/24h/Firestore/retries/custo completo em `evidencias/medicoes.md`; metas30s/60s só tela rápida. Sem upload M3U ou exclusão de amostras lentas. (SC-003, SC-006)
- [ ] T046 Executar `quickstart.md`/tizen-tv depois de E2E, atualização preservando dados/assinatura: QR→pagamento teste→ativação/foco/controle/tempo/identity/licença/remoção. Registrar `evidencias/tv.md`; reinstalação apenas lab autorizado, hardware obrigatório antes de cobrar. (SC-009, SC-011-012)
- [ ] T047 Conferir `plan.md`/`tasks.md`/backlog pelos scripts: gates normativos/plataforma/operação/TV resolvidos, todas evidências reais; sem venda ou status pronta com T001/T003/T039/T043/T045/T046/T052 pendentes. (SC-009-012)

**Critério de Conclusão:** Todos contratos/travas/checks/E2E/quickstart e TV física aprovados, RPO/RTO/medição reais, exceções resolvidas e oferta R$35 correta; nenhum aceite inferido.

**Registro da Fase:**

- Status: parcial; T041 concluída, aceite operacional ainda bloqueado.
- Feito: T037/T038/T040/T041/T042/T044/T045 concluídas. T052 revalidada sem mutação: smoke público 200/200/401, jobs privado 403, Scheduler OIDC habilitado, IAM restrito e índice READY; suíte API 49 passed/60 skipped. Backup/restore preparados em dry-run; decoder fail-closed do journal implementado, sem replay ou autorização de reabertura. Revisão aprovada: vencimento mantém a sessão atual até sair/fechar app; próxima entrada é recusada. Revogação confirmada conserva encerramento controlado.
- Contrato: check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual -Json: trava íntegra, cinco contratos; C1–C5 verdes; locks032/034/037/047/054/067/069 íntegros. Trava067 íntegra após emenda mínima autorizada.
- Testes executados: TV unit **3301/3301** e **1398/1398 suítes** PASS com JSON; três repetições isoladas do A005 PASS; `npm.cmd run lint`, `build` e `build:tizen` PASS com sincronização do pacote; TV E2E **49/49 scripts PASS em 350s**; Portal lint/build/unit **5/5 PASS** e E2E13/13.
- Pendências: T039 replay/restore/RPO/RTO real (runbook/decoder local PASS); T043 (carga/ativações); T046 (TV física; preflight bloqueado por Host PC IP da TV); T052 (restore/replay/conciliação real dependentes do snapshot T039). T041/T045 não têm pendência residual; venda permanece desligada pelos gates de release.

### Checklist de Release

- [x] Fases 1–2 concluídas, T001 formalizado/plataforma provada.
- [x] US1 concluída com exclusão bidirecional/offline e estado local preservado.
- [x] US2 concluída, permanência/reenvio/recuperação pelo site comprovados.
- [x] US3 concluída, oferta R$35/12 meses/uma TV, fake/pagamento de teste diferenciados.
- [x] Cinco contratos verdes e locks íntegros, inclusive 032/034/037/054/067 afetados.
- [ ] API/portal/TV/homologação disponíveis e HTTPS/CORS/ADC/IAM/OIDC validados.
- [ ] tsc/lint/unit/build/E2E aprovados, assets tizenFiles listados.
- [ ] Backup/journal/chaves/restore ensaiados, RPO/RTO e latência/custo medidos, TV física aprovada.
- [x] Conta/termos/autoatendimento/oferta/retenção aprovados, nenhum segredo exposto e documentação atualizada.

## Dependencies & Execution Order

Fase1→fase2→US1 P1→US2/US3 P2→fase6. T001 normativa já concluída; T003 bloqueia compromisso de identidade/tempo/crypto. T051 prepara ambiente sem deploy nesta revisão. Na fase 2, T005/T008/T010 precedem T023; T023 é compartilhada e bloqueia revoke/recovery de T006/T007 e exclusões de T013. Journal fake é permitido só em testes locais; ambiente real exige journal durável antes de ACK. T039/T052 precisam T023/T026/T028; T043 depende ambiente real; T046 exige E2E/T036. T045 não rediscute preço. Venda exige T001/T003/T039/T043/T045/T046/T052.

## Implementation Strategy

Primeiro US1 com cobrança desligada, testar independentemente de compra. US2 usa fixture de configuração existente; US3 usa fontes locais/fake sem depender dos formulários US1. Configurações/aplicação/importação são estados distintos. Não reaplicar comando terminal nem limpar corrente no ACK. Executar checkpoints do sdd-execute; usuário pediu modo contínuo; cada task exige evidências reais e checkpoint sem pausas opcionais.

## Requirement Coverage

| Origem | Tarefas de implementação/verificação |
| --- | --- |
| FR-001 | T003, T005–T007, T049 |
| FR-002 | T006, T016–T017, T021 |
| FR-003 | T006, T017, T049 |
| FR-004 | T006–T007, T017, T049 |
| FR-005 | T005–T006, T013–T014, T019, T049 |
| FR-006 | T010–T013, T016, T020–T021 |
| FR-007 | T008, T012–T013, T016, T019–T020 |
| FR-008 | T001–T004, T012, T020 |
| FR-009 | T005, T009, T013–T014, T019–T021 |
| FR-010 | T009–T014, T019–T020 |
| FR-011 | T011, T014, T018, T020–T021 |
| FR-012 | T008, T013, T016, T022–T025 |
| FR-013 | T015, T016, T022–T025, T042 |
| FR-014 | T001–T002, T006, T008, T015, T038, T042 |
| FR-015 | T008, T013, T022–T023, T025, T039, T052 |
| FR-016 | T026, T028, T032, T034–T035 |
| FR-017 | T001, T030–T033, T035 |
| FR-018 | T026, T028, T032, T034 |
| FR-019 | T028, T032, T034–T036 |
| FR-020 | T027, T032, T036 |
| FR-021 | T026–T027, T032, T034, T045 |
| FR-022 | T027–T028, T034, T036 |
| FR-023 | T026–T028, T034, T052 |
| FR-024 | T027–T029, T032, T036 |
| FR-025 | T029–T031, T035 |
| FR-026 | T028–T029, T031, T033–T035 |
| FR-027 | T003, T008, T029–T030, T035 |
| FR-028 | T017–T018, T031–T033, T037 |
| FR-029 | T004, T017–T018, T037, T040 |
| FR-030 | T009, T018, T029, T032, T050, T043 |
| FR-031 | T003, T007, T024–T025, T035, T045–T046 |
| FR-032 | T002, T023, T039, T045, T051–T052 |
| FR-033 | T009–T011, T013–T014, T019–T025, T039, T052 |
| SC-001 | T019, T021, T049 |
| SC-002 | T012, T019–T021 |
| SC-003 | T009, T043, T050 |
| SC-004 | T015, T020, T025, T042 |
| SC-005 | T027, T034, T036, T045 |
| SC-006 | T028, T036, T043, T050 |
| SC-007 | T003, T034–T035 |
| SC-008 | T021, T035–T037 |
| SC-009 | T001, T003, T039, T041, T044–T047, T052 |
| SC-010 | T023, T025, T039, T052 |
| SC-011 | T007, T025, T035, T045–T046 |
| SC-012 | T019–T021, T023, T025, T039, T052 |

<!-- sdd-converge anexa fases de convergência abaixo. -->

### Revalidação da regra de entrada — 2026-10-11

Por decisão explícita do usuário, T031/T033/T035/T037/T044 e checklist de contratos foram reabertos e revalidados para a nova fronteira (26/26 direcionados, E2E licença1/1, tsc/lint/build e locks PASS). Vencimento permite continuar até sair da lista ou fechar o app; próxima entrada é bloqueada. Histórico de testes acima comprova a regra anterior, não esta revisão. Sem alterações em contratos congelados.

Checkpoint desta revisão:3301/3301 unit (563 arquivos),26/26 direcionados, E2E licença1/1 e relacionados3/3, tsc/lint/build e locks032/034/037/047/054/067/069 PASS. Ver `evidencias/vencimento-entrada.md`. A005 e gate E2E global continuam pendentes; nenhuma alteração ou instalação na TV.


## Pausa de execução — 2026-10-11

- **Status:** pausada por solicitação explícita do usuário.
- **Infra staging:** projeto `ccplaytv-511322`; Firestore Native e Artifact Registry em `us-central1`; contas `portal-runtime` e `portal-scheduler`; Cloud Run `ccplaytv-portal`.
- **Deploy:** revisão saudável, URL `https://ccplaytv-portal-dvpldo267q-uc.a.run.app`; `/` e `/health` retornam 200; `/portal/v1/configurations` sem autenticação retorna 401.
- **Build:** Cloud Build concluído com imagem `us-central1-docker.pkg.dev/ccplaytv-511322/portal/ccplaytv-portal:staging`.
- **Próxima retomada:** enrollment autenticado com dados sintéticos, criação/leitura de configuração Xtream de teste, validação Firestore e Scheduler.
- **Limites:** produção não publicada; checkout desativado; `roles/editor` ainda não removido; TV atual preservada; T036/T039/T041/T043/T045/T046/T052 e gates reais continuam pendentes.
- Evidências detalhadas em `evidencias/validacao.md` e procedimento em `docs/portal/deploy-staging.md`.


### Retomada de configuração sintética — 2026-10-12

- infra/portal/smoke-configuration.ps1 foi ampliado para simular o ACK da TV: pull autenticado em /portal/v1/device/operations, ACK applied com revision=expectedRevision+1 e importState=completed, seguido de leitura autenticada da configuração.
- O script preserva o isolamento sintético (sourceId e identidade aleatórios), não imprime credenciais e falha se a operação não for entregue à TV ou se a configuração não aparecer após o ACK.
- Execução automática nesta sessão ficou bloqueada por falha de conectividade do executor ao Cloud Run (Unable to connect to the remote server); executar no PowerShell local com o mesmo comando usado nos smokes anteriores.


### Evidência de ACK sintético — 2026-10-12

- Smoke completo aprovado: operação entregue à TV sintética e confirmada como applied na revisão 1; configuração apareceu após o ACK; nenhum segredo foi impresso.
- Próxima etapa: validar o job agendado e a persistência/consulta no Firestore.


### Jobs/Scheduler/Firestore — 2026-10-12

- Serviço jobs e Scheduler staging provisionados e saudáveis; Scheduler habilitado com OIDC e invoker restrito ao service account dedicado.
- Firestore verificado: documentos sintéticos persistidos nas coleções devices, operations, configurations e configurationVersions.
- Execução do tick ainda sem log de request observado; não conceder TokenCreator apenas para teste manual.


### Backup diário provisionado — 2026-10-12

- T039 avançou: schedule diário de backup Firestore criado com retenção de sete dias.
- Snapshot READY ainda não disponível; manter restore e RPO/RTO pendentes até a primeira execução e ensaio em base isolada.


### Homologação avançada sem esperar backup — 2026-10-12

- Smoke de superfície e isolamento aprovado: público 200/200, endpoint jobs sem autenticação 403, IAM invoker restrito ao portal-scheduler.
- T052 avançou na validação de serviço e IAM; restore/RPO/RTO permanecem aguardando o primeiro snapshot READY.


### E2E portal revalidado — 2026-10-12

- Portal E2E: 13/13 PASS (6,2s) com Vite iniciado explicitamente na porta 5174, conforme a estratégia do plano.
- ERR_CONNECTION_REFUSED inicial foi classificado como erro de preparação do runner, não bug da feature. A005 do Vitest permanece pendente separadamente.


### Desvio ad-hoc T055 — 2026-10-12

- Causa: o fallback sem requestIdleCallback adiava o preload de SourceAccessRoute em 500 ms; na suíte paralela o teste de credencial recusada expirava ainda em "Abrindo esta tela…".
- Correção: preload imediato apenas da rota leve de acesso em profiles; telas pesadas continuam lazy.
- Validação: teste isolado 5/5; suíte completa 563/563 arquivos e 3301/3301 testes; lint, build e trava de contratos PASS.


### T043/T052 em homologação — 2026-10-12

- TV atualizada por deploy-tv.ps1, instalação/launch confirmados sem desinstalação; visual pendente.
- 100 amostras health e 100 negativas de jobs aprovadas; p95 312.54ms e399.83ms respectivamente. Não substitui alteração/ativação T043.
- Journal/bucket/env provisionados; tick real500 e índice jobs ainda CREATING; repetir após READY.


### T052 tick real aprovado — 2026-10-12

- Índice jobs READY; Scheduler OIDC executou /internal/portal/jobs/tick com HTTP 200 em duas execuções observadas (10,17s cold e 1,35s warm).
- Firestore jobs contém 1 documento de manutenção; bucket journal regional permanece ativo com lifecycle 30 dias e papel mínimo no bucket.
- T052 avançou na prova real de IAM/OIDC/Firestore/worker; restore e cargas de alterações/ativações ainda pendentes.

### Continuidade de execução — 2026-10-12

- **T043:** criado `infra/portal/measure-staging.ps1` para 100 updates sintéticos com ACK da TV, cálculo p50/p95 e saída sem segredos. O endpoint de mutação limita a 30/min por sessão; o script respeita 2,2 s entre amostras. A execução foi bloqueada antes da primeira amostra pelo limite de enrollment por IP (20/h), já consumido pelos smokes. T043 continua pendente e nenhum aceite de carga foi inferido.
- **T039:** o schedule diário de backup com retenção de sete dias existe, porém `gcloud firestore backups list` ainda não mostra snapshot READY. Restore/RPO/RTO continuam pendentes.
- **T052/T045 (checkpoint anterior):** suíte local do portal passou 42 testes (59 skips externos); a prova real do tick OIDC permanece HTTP 200. Naquele momento a API de budgets ainda não estava autorizada; o budget atual de R$10/mês está registrado nos checkpoints posteriores.
- **T036:** por decisão do usuário, mantida pendente a transação Mercado Pago sandbox/real. Revalidação local fake/licensing/worker/restore: 11 passed, 10 skipped; TV licensing e C1–C5: 17/17 PASS; trava íntegra. Nenhuma venda foi habilitada.
- **Configuração sandbox:** credenciais presentes apenas no `staging.env.yaml` ignorado; público `00005-drv` e jobs `00003-zzr` Ready; webhook sem assinatura 401; `CHECKOUT_ENABLED=false`. T036 segue pendente até completar compra de teste.

### Tentativa de compra sandbox — 2026-10-12

- O smoke criou uma preferência Checkout Pro de `R$35,00/12 meses` com `checkout_enabled=true` e `secretsPrinted=false`.
- O checkout abriu com a sessão da conta vendedora. Após preencher o CVV de teste e clicar em **Pagar**, o Mercado Pago recusou o fluxo com: “Uma das partes com as quais você está tentando efetuar o pagamento é de teste”.
- Diagnóstico: o Checkout Pro exige contas de teste distintas para vendedor e comprador. T036 permanece pendente; a próxima tentativa deve encerrar a sessão do vendedor e entrar com a conta compradora de teste antes de usar o cartão de teste.

### Compra sandbox com comprador separado — 2026-10-12

- A sessão comprador separada aprovou duas compras de teste de `R$35,00`: uma com saldo de teste e outra com cartão de teste. Os pagamentos retornaram `approved`, `BRL`, merchant configurado e `live_mode=true`; nenhum valor real foi cobrado.
- O worker diário reconciliou as duas ordens por lookup autenticado, mesmo com os webhooks do Mercado Pago retornando `401` por assinatura não validada. Cada ordem terminou `approved`, com `providerPaymentId`, `confirmedAt` e grant `valid` no Firestore; validade registrada por 12 meses.
- Foi corrigido o retry do job: o marcador textual `finalization_failed` não é mais reutilizado como cursor numérico de paginação do Mercado Pago. Testes direcionados: `9 passed, 8 skipped`.
- Staging foi publicado nas revisões públicas `ccplaytv-portal-00012-6x2` e jobs `ccplaytv-portal-jobs-00013-qtk`; smoke final passou com raiz/health `200` e configurações sem autenticação `401`.
- Após a evidência, `CCPLAY_PORTAL_CHECKOUT_ENABLED` voltou a `false`. T036 permanece parcial: falta validar webhook assinado e os cenários completos de renovação/estorno/offline do E2E; nenhuma venda foi deixada aberta.

### Continuidade sem snapshot — 2026-10-12

- T041: suíte TV unitária repetida com threads4 terminou com 563 arquivos/3301 testes PASS; lint/build TV e portal também passaram. A005 mínimo e o E2E global `teste-conexao-tv` continuam pendentes, portanto a task permanece aberta.
- T052: adicionados `api/tests/portal/test_deployment.py` e `test_restore.py`; **6/6 PASS** cobrindo manifestos, IAM/OIDC, Firestore server-only e dry-run de restore. A homologação real e o replay continuam pendentes.
- T043: execução de 100 alterações/ativações bloqueada antes da primeira amostra por limite de enrollment por IP; nenhum resultado de carga foi declarado.
- T045: tentativa inicial de consulta de budgets foi bloqueada por autorização ausente; após a concessão, o budget de R$10/mês foi criado e confirmado pelo usuário.
- T039: snapshot/inspect/restore não executados nesta etapa por decisão explícita de deixar o snapshot por último.
- T052: consultas somente leitura confirmaram as revisões públicas/jobs `Ready=True`, Scheduler habilitado com OIDC dedicado, IAM jobs restrito ao invoker dedicado e índice Firestore de jobs `READY`.
- T045: `billingbudgets.googleapis.com` foi habilitada em `ccplaytv-511322`; o budget ativo de R$10/mês está na conta de faturamento, com thresholds 50/90/100/150%.
- T045: permissão corrigida e budget criado na conta de faturamento em R$10/mês, thresholds 50/90/100/150%; valor confirmado pelo usuário, sem canal personalizado de notificação.

### T036 — assinatura do webhook sandbox — 2026-10-12

- A rota staging recebeu uma notificação sintética assinada com o segredo atualmente carregado no Cloud Run, usando um pagamento aprovado existente: `HTTP 200`, `state=received`, sem imprimir segredo ou identificador do pagamento.
- Isso confirma o HMAC/manifesto implementado (`data.id`, `x-request-id`, `ts`, `v1`) e o carregamento do segredo no serviço. Os `401` anteriores do Mercado Pago permanecem atribuídos à configuração da aplicação/segredo no painel do provedor, não à rota staging.
- O painel Webhooks do Mercado Pago retornou erro 5xx durante a inspeção; a confirmação do segredo da mesma aplicação e o reenvio oficial continuam pendentes. Checkout permanece desligado.

### T036 — webhook oficial Mercado Pago aprovado — 2026-10-12

- O painel Mercado Pago enviou um evento de teste `payment.updated` em modo sandbox para a URL pública; a resposta observada foi `200 - OK`.
- Consulta somente leitura dos logs do Cloud Run confirmou duas requisições `POST` ao caminho do webhook com status HTTP 200, sem imprimir corpo, segredo ou identificador de pagamento.
- A assinatura oficial está validada. T036 permanece aberta apenas pelos cenários E2E restantes (ativação ponta a ponta, página fechada/offline, renovação, estorno e preço); checkout continua desligado após a prova.

### Decisão T036 — não repetir compra sandbox — 2026-10-12

- Por decisão do usuário, não será criada uma nova cobrança de teste. As duas compras sandbox já aprovadas permanecem como evidência de Checkout Pro, aprovação e concessão anual via reconciliação autenticada.
- O webhook oficial foi validado separadamente pelo evento `payment.updated` com resposta `200 - OK` e logs do Cloud Run confirmando o recebimento.
- Limitação registrada: não foi demonstrada uma concessão nova causada exclusivamente por um webhook oficial depois da compra; não repetir a compra não altera a evidência já obtida nem habilita venda. T036 segue parcial pelos cenários E2E restantes.

### Desvio ad-hoc T056 — pilha local integrada — 2026-10-13

- [x] T056 Corrigir `401` espúrio em leituras concorrentes da sessão do portal, descoberto na pilha local integrada durante T046: `authenticate_session` agora tolera 30 s de ordem de relógio entre requisições concorrentes e nunca retrocede `last_seen_at` (`api/app/portal/auth.py`); regressão em `api/tests/portal/test_auth.py`. API 111/111 PASS, Ruff PASS. Evidência e comando em `evidencias/pilha-local.md`. (FR-005, FR-014; SC-001)

### Desvio ad-hoc T057 — exclusão local envia a outbox na hora — 2026-10-13

- [x] T057 Enviar imediatamente a exclusão feita na TV, fora da tela rápida, a pedido do usuário: `PortalAgent` observa a outbox `pendingPortalDeletes` e roda só `flushDeletions` + `publishSnapshot` (sem pull, licença nem polling de 10 s), depois de ciclo em andamento, visível/online, backoff do ciclo em falha, prazo de 24 h intacto (`tv-web/src/lib/portal/portalAgent.ts`, 5 testes novos em `portalAgent.test.ts`). Pilha local: 5/5 execuções do cenário completo, portal reflete em ~4 s sem abrir a tela rápida. TV unit relacionados 91/91, tsc e lint/arquitetura PASS. (FR-009-011, FR-033; SC-012)

### Desvio ad-hoc T058 — portal inoperante na TV/dev server — 2026-10-13

- [x] T058 Corrigir, a pedido do usuário ("nenhum botão funciona na TV nem no dev server"), três defeitos reproduzidos com o pacote empacotado sob `file://` e com o dev server: (1) "Adicionar pelo site" inalcançável com listas cadastradas — BAIXO na linha de ações chega a "Configurações"/"Adicionar pelo site" (`ProfilesScreen.tsx`, contratos 023/037 íntegros); (2) convite/desafio recusado pelo relógio da TV (`expiresAt > agora+300 s`) — prazo ancorado no relógio local (`portalConnection.ts`); (3) falha sem diagnóstico — painel mostra "Código do erro". Dev: `npm run dev:portal` (pilha local em `e2e/lib/portalStack.mjs`, proxy same-origin, DUID só-DEV); `npm run dev` simples continua sem portal e agora mostra a dica. Testes Playwright: `e2e/portal-pacote-file.mjs` (pacote + staging, relógio −5 s) e `e2e/portal-dev-server.mjs` (dev server real), ambos PASS; unit 267/267 relacionados, tsc/lint OK. Pacote comercial reinstalado na TV. (FR-002-004, FR-028-029)

### T043 — alterações medidas (parcial) — 2026-10-13

- Por decisão do usuário, o piso de amostras caiu de ≥100 para 20 (R-018). Staging, TV simulada, 20/20 `source.update` com ACK: p50 6,6 s, p95 9,4 s, máx 10,0 s, 100% ≤30 s (SC-003). Detalhes e limites em `evidencias/medicoes.md`.
- Bloqueio anterior era o script (polling a 100 ms contra limite de 1 pull/10 s por dispositivo), não o enrollment; `measure-staging.ps1` corrigido.
- T043 **continua aberta**: ativações de licença (SC-006), carga 10–50 TVs/margem 100 e custo completo não medidos.


## Phase 7: Alinhamento com a 070 (revisão de 2026-10-13)

**Origem**: a `070-entrada-listas-gerenciador` (convergida) mudou ID, chave, entrada, retorno e a regra de segredos sobre os quais a 069 foi escrita. Estas tasks só **anexam** e protegem o que a 070 entregou; nada aqui reabre contratos nem altera preço, oferta ou vencimento. Invariantes: `plan.md` → **Invariantes herdadas da 070** (I-1…I-10).

- [x] T059 Registrar as invariantes herdadas da 070: notas `Atualização (070)` em `spec.md` (FR-014, SC-004 e seção final), `plan.md` (D-003, D-004, R-005, R-020, Estado Atual, PRÓXIMO, Cuidados e tabela de invariantes), notas nos documentos de contrato/modelo/lógica/quickstart. (R-020)
- [ ] T060 Estender T039 com o que a 070 criou: incluir `displayIdClaims` e `display_id`/`display_id_source` no backup, no journal/replay e na política de retenção (D-008, `docs/portal/operacao.md`); ensaiar restore e replay provando que o ID exibido e a chave de 10 dígitos de um dispositivo sobrevivem (ou o dispositivo é recriado com o **mesmo** ID derivado) e que nenhuma rotina de manutenção regrava ou apaga `display_id` (I-1, I-2). Teste de repositório recusando a troca continua verde. (FR-032-033; SC-010, SC-012)
- [ ] T061 Estender T052: homologação real não destrutiva das rotas da 070 — sessão manual por ID + chave (uniforme 401, limite 429), `GET /configurations/{sourceId}/values` (dono, outra TV, fonte excluída, `Cache-Control: no-store`), `GET /session/device` com `displayId` e licença; marcadores fictícios ausentes dos logs reais. Prefixo isolado e limpeza limitada ao fixture. (I-3, I-4; SC-004)
- [ ] T062 Reconciliar T046: reescrever o roteiro de TV em `quickstart.md`/`evidencias/tv.md` sem duplicar `070/evidencias/tv.md`. Entrada por **Adicionar lista** ou Configurações → "Portal & licença"; ID exibido pode ser `2A:…` na TV de referência (ADR-015). Cobrir só o que ainda não foi observado: licença/validade e código/chave, vencimento e reentrada bloqueada, offline, pagamento de teste → ativação, recuperação pelo site, suspend/standby, tempos na TV. Fechar T046 só com observação do usuário. (SC-009, SC-011-012; I-5, I-6)
- [ ] T063 Gate de não-regressão da 070 antes de T047: `check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador` (5/5) e travas 037/045/023/024/069 íntegras; `npx vitest run` dos quatro `*.entrada-listas-gerenciador.contract.test.*`; `npm run test:e2e` com `npm run dev`; `tv-web/e2e/entrada-listas-gerenciador.mjs` e `portal-dev-server.mjs` com a pilha local. Registrar a limpeza dos registros `generated` do staging (**ação externa: pedir confirmação do usuário**) como pré-condição de abertura comercial (ADR-015). (R-020; I-1…I-10)

**Dependências**: T060–T062 podem rodar em paralelo e antecedem T043/T046/T052 onde se aplicam; T063 antecede T047. **T047 não fecha enquanto T059–T063 estiverem pendentes.**