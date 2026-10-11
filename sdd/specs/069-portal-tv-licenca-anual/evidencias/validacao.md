# Validação acumulada — feature069

Status: execução contínua, aceite comercial ainda pendente.

- API: .venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal →90/90 PASS79.20s; Ruff PASS. Teste de marcadores adicionado depois:1/1 PASS0.46s. Firestore emulator.
- Portal web: npm.cmd run build/lint/test → build/lint PASS e5/5 unit PASS; timeout de encerramento A005 continua aberto. npm.cmd run test:e2e →13/13 PASS2.2min.
- TV licença/player: contratos/guarda/player/monitor39/39 PASS17.16s; checkpoint específico de licença/gravador/guarda29/29 PASS18.93s; tsc e arquitetura PASS.
- TV browser comercial fake: node e2e/run.mjs --only licenca-anual →1/1 PASS74.1s. Não é prova AVPlay ou pagamento real.
- Build TV: npm.cmd run build →485 módulos/603ms; guard sem demux PASS. findUnlistedFiles=[] após inventariar SettingsScreen.css. Build:tizen ainda aguarda suíte E2E final.
- Travas069 e067: check-contract-tests.ps1 -Slug ... -Json →PASS5 contratos cada. Apenas emenda067 previamente autorizada foi aplicada.
- Suítes completas TV unit/E2E em andamento. Três falhas App.source-access na suíte; isolado5/5 PASS: instabilidade aberta, não baseline verde.
- A005: teste puro em config mínima sem plugins/setup/watcher também termina com timeout e FILEHANDLE. Pool threads reduz startup para692ms, mas não elimina timeout. Vite createServer/close sem Vitest encerrou normalmente. Sem timeout maior ou force-exit introduzido.
- Backup CLI: dois dry-runs schedule/restore PASS; nenhum comando de nuvem executado. Replay e ensaio real não concluídos.

Suíte TV unit completa finalizada:560 arquivos,3285 PASS/4 FAIL,651.73s. Três falhas App.source-access permaneceram no loader de rota lazy além do prazo de assert1s; isolado5/5 PASS. A quarta era assertver21 desatualizado para v22, fixture não congelada corrigida. Nova passada em pool threads com4 workers iniciada, sem alterar prazo/contrato/config de produção.

### Desvio fora do escopo — teste de conexão

Suíte completa `node e2e/run.mjs`: `teste-conexao-tv` falhou em e2e/teste-conexao-tv.mjs:176, `NET-W-QUOTA` ausente após 5 s; diálogo exibiu Resultado completo. Usuário decidiu em 2026-10-11 registrar para depois e manter o gate E2E pendente. Entrada em Ideias Futuras do backlog; nenhum código ou timeout do teste de conexão alterado. Não concluir T041 nem solicitar instalação na TV enquanto o gate estiver pendente.

Suíte TV completa encerrada: **48/49 scripts PASS em1129s (jobs3)**. Única falha: teste-conexao-tv, mantida pendente por decisão do usuário. licenca-anual PASS76.3s; portal-configuracao PASS115.4s; configuracoes-lista-global PASS57.1s. O gate global não passou.

### Checkpoint de revisão local

- npx.cmd vitest run src/components/player/licensing.test.tsx src/lib/player/playbackGuard.test.ts src/lib/licensing/licenseMonitor.test.tsx src/lib/portal/portal-tv-licenca-anual.contract.test.ts --pool=threads --maxWorkers=2:17/17 PASS4.38s, A005 permanece.
- npx.cmd tsc -b: PASS; npm.cmd run lint: PASS/avisos, arquitetura430arquivos sem violação ou baseline alterado.
- npm.cmd run build: PASS485módulos/841ms, demux guard PASS.
- node e2e/run.mjs --only licenca-anual --jobs 1:1/1 PASS74.7s após registro de sessões ativas.
- Repetição unitária com threads4 anterior:3291/3292 PASS; único erro foi monitor compilado antes do ajuste e teste lido depois dele. Rodada coincidiu com edição e não foi aceita como gate. Nova rodada sem alterações TV em andamento, relatório .cache/069-unit-final-results.json.
- Diagnóstico A005: configuração mínima sem React/setup/watch/HMR também reproduz; pool threads não resolve. Wrapper mostra Vite close start e close end antes do timeout. Não inflados timeouts, não forçada saída, não alteradas dependências.
- pytest tests/portal/test_restore_journal.py -q:10/10 PASS0.16s; validação canônica de integridade/destino, não comprova replay/restore/IAM real.

Decoder de journal: revalidação final pytest10/10 PASS0.14s; `.venv/Scripts/ruff.exe check app/portal tests/portal` PASS. Nenhum dado real, recurso cloud ou replay executado.

### Rodada unitária final sem alterações durante execução

`npm.cmd test -- --pool=threads --maxWorkers=4 --reporter=json --outputFile=../.cache/069-unit-final-results.json`: **3293/3293 PASS, zero falhas, 290.92s**, relatório success=true; processo exit0 sem mensagem A005 nesta rodada. Casos mínimos com reporter padrão ainda reproduzem o timeout; não fechar T041 apenas pelo relatório verde.

Travas032/034/037/047/054/067/069 PASS pelo script oficial. Checklist de contratos concluído.

Diagnóstico final A005: caso mínimo com `--reporter=json --outputFile=../.cache/069-minimal-json-results.json` também reproduziu timeout após Vite close end, apesar de2/2 PASS. `CI=1` igualmente reproduziu. Logo, sucesso da suíte completa sem aviso não demonstra correção, e trocar reporter/CI não resolve. T041 continua aberta; nenhuma alteração especulativa de dependência/configuração foi aplicada.

## Revisão aprovada: vencimento na entrada

A regra anterior de interrupção por vencimento foi substituída pelo bloqueio apenas na próxima entrada, conforme decisão explícita do usuário. Testes, comandos e limitações em [vencimento-entrada.md](vencimento-entrada.md). A005 e falha global de conexão permanecem pendentes.


## Continuidade T039/T041/T052 — 2026-10-11

- T039: `manage-backup.ps1` gerou corretamente os comandos `schedule` (retenção7d/diário) e `restore` para base isolada `portal-restore-*`, ambos com `executes:false`; nenhum comando `gcloud` foi executado. `pytest api/tests/portal/test_restore_journal.py -q`:10/10 PASS; Ruff do decoder/runbook PASS. A restauração, replay idempotente, IAM/imutabilidade e medição RPO/RTO real continuam pendentes.
- T041: o gate A005 continua aberto. As suítes verdes não eliminam o timeout de encerramento reproduzido no caso mínimo; não foi aplicado `force exit`, aumento artificial de timeout ou troca especulativa de dependência.
- T052: preparação local concluída; falta criar o projeto Google Cloud, vincular faturamento e executar homologação real de ADC/IAM/OIDC/Firestore/backup/restore.


## Projeto Google Cloud criado

- Evidência fornecida pelo usuário em 2026-10-11: projeto `ccplaytv` está `ACTIVE`, project ID `ccplaytv-511322`, número `245842812344`, criado em `2026-10-11T22:08:33.558Z`.
- A validação local confirmou a configuração ativa apontando para `ccplaytv-511322` e ADC autorizado.
- Ainda falta consultar APIs habilitadas, billing e IAM via `gcloud`; neste ambiente o processo CLI não retornou dentro do limite, portanto T052 não foi marcado como concluído.


## Validação fornecida do projeto e APIs

- APIs atualmente listadas: Logging, Monitoring, Storage, Datastore e APIs gerais; `run.googleapis.com`, `firestore.googleapis.com`, `artifactregistry.googleapis.com`, `cloudbuild.googleapis.com`, `iamcredentials.googleapis.com` e `cloudscheduler.googleapis.com` não aparecem na lista fornecida.
- Faturamento confirmado: `billingAccounts/019D1E-9F4271-E5FBF5`, `billingEnabled: true`, projeto `ccplaytv-511322`.
- O erro de IAM usou `projects/ccplaytv-51132` (um dígito a menos); repetir com `ccplaytv-511322`.
- Nenhuma API foi habilitada pelo agente nesta etapa.

- IAM confirmado pelo usuário: default compute service account `245842812344-compute@developer.gserviceaccount.com`, `DISABLED: False`. Isso prova a identidade padrão existente, não ainda as permissões mínimas do Cloud Run/Jobs.

- IAM adicional informado pelo usuário: a conta Compute padrão possui `roles/editor`. Isso é um risco de privilégio excessivo; não será usada como runtime final. Os manifestos locais preveem invocação pública apenas no Cloud Run e invocação de jobs por uma conta Scheduler dedicada. Remoção/substituição do papel aguarda contas dedicadas e validação para evitar lockout.

- Script `infra/portal/bootstrap-gcp.ps1` criado para bootstrap idempotente. Execução com `-Apply` interrompida após o `gcloud projects describe` permanecer sem resposta; não houve erro explícito de permissão nem confirmação de mutação.


## Bootstrap GCP concluído

- Execução do `infra/portal/bootstrap-gcp.ps1 -ProjectId ccplaytv-511322 -Region us-central1 -Apply` concluída pelo usuário.
- APIs habilitadas ou disponíveis; contas criadas: `portal-runtime@ccplaytv-511322.iam.gserviceaccount.com` e `portal-scheduler@ccplaytv-511322.iam.gserviceaccount.com`.
- Runtime recebeu `roles/datastore.user`, `roles/logging.logWriter` e `roles/monitoring.metricWriter`.
- Firestore Native criado/verificado em `us-central1`, edição STANDARD, free tier ativo.
- Artifact Registry `portal` criado/verificado em `us-central1`.
- `roles/editor` da conta Compute padrão ainda permanece; remoção fica para depois do primeiro deploy validado.
