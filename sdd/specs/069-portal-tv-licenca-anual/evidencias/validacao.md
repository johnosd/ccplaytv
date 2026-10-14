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

- Após bootstrap, foi validado o Dockerfile multi-stage e criado `infra/portal/cloudbuild.yaml` para build remoto no Cloud Build. Deploy do Cloud Run ainda não iniciado: Docker local indisponível e o ambiente staging exige as chaves criptográficas privadas previstas em `PortalSettings`; nenhum segredo foi lido ou exposto.

- Cloud Build concluído com sucesso pelo usuário em 2026-10-11: build `078b97d6-2f4e-4100-ba42-b940ac15c292`, duração1m34s, imagem `us-central1-docker.pkg.dev/ccplaytv-511322/portal/ccplaytv-portal:staging`.

- Cloud Run staging implantado pelo usuário: revisão `ccplaytv-portal-00001-njz`, 100% do tráfego, URL `https://ccplaytv-portal-245842812344.us-central1.run.app`. Health check ainda não confirmado pelo executor; o teste externo não alcançou a URL.

- Health Cloud Run confirmado pelo usuário: `Ready=True`, `ConfigurationsReady=True`, `RoutesReady=True`, revisão `ccplaytv-portal-00001-njz`, Uvicorn em `0.0.0.0:8080`, startup TCP probe aprovada. URL canônica: `https://ccplaytv-portal-dvpldo267q-uc.a.run.app`.

- Health staging confirmado pelo usuário: `GET https://ccplaytv-portal-dvpldo267q-uc.a.run.app/health` retornou HTTP 200 e `{"status":"ok"}`. Headers observados: CSP restritiva, HSTS, `x-content-type-options: nosniff` e `referrer-policy: no-referrer`.

- Smoke test staging confirmado pelo usuário: `GET https://ccplaytv-portal-dvpldo267q-uc.a.run.app/` retornou HTTP 200, HTML `CCPlayTV` com `Content-Type` correto e CSP/HSTS/nosniff/referrer-policy presentes.

- Diagnóstico do smoke test: `/portal/v1/configurations` retornou 503 porque `CCPLAY_PORTAL_SERVICE_RECOVERY_EPOCH` não estava no env de staging; `/health` não inicializa autenticação e por isso não detectou. Epoch de staging foi gerado localmente e adicionado ao arquivo ignorado; nova revisão ainda precisa ser publicada.

- Smoke staging aprovado pelo usuário após nova revisão: raiz HTTP 200, `/health` HTTP 200 `{"status":"ok"}`, `/portal/v1/configurations` sem autenticação HTTP 401. Correção de `CCPLAY_PORTAL_SERVICE_RECOVERY_EPOCH` confirmada.

- Enrollment sintético ainda não executado pelo executor: a conexão HTTPS externa não está disponível nesta sessão. Script seguro preparado em `infra/portal/smoke-enrollment.ps1`; ele usa identidade/nonce aleatórios e nunca imprime bearer, device key ou código de recuperação.

- Primeira tentativa do enrollment sintético retornou `invalid_input`; diagnóstico: `nonce` exige exatamente 43 caracteres Base64URL. Script corrigido para gerar 32 bytes aleatórios (43 caracteres codificados).

- Compatibilidade corrigida no `smoke-enrollment.ps1`: PowerShell/.NET local não possui `RandomNumberGenerator.Fill`; substituído por `Create().GetBytes()` com descarte seguro do RNG.

- Próximo teste preparado em `infra/portal/smoke-configuration.ps1`: enrollment sintético → sessão manual → `source.create` com URL M3U `example.invalid`; secrets permanecem apenas em memória e não são impressos.

- Primeira tentativa de `smoke-configuration.ps1` chegou à sessão autenticada, mas `source.create` retornou `invalid_input`. Diagnóstico: `Idempotency-Key` deve seguir `op-<13 dígitos de epoch ms>-<token Base64URL de 43 caracteres>`. Script corrigido para esse formato.

- Configuração Xtream sintética aprovada pelo usuário: enrollment/session HTTP200, `source.create` retornou `pending`, operação `op-...` e `sourceId` sintético; nenhum segredo impresso. A confirmação da TV ainda não ocorreu, portanto a configuração pode não aparecer na coleção aplicada. Script ampliado para ler a operação e distinguir esse estado.


### Configuração sintética com confirmação da TV — 2026-10-12

O smoke de configuração foi ampliado para validar o ciclo completo: criação source.create, entrega pela rota TV, ACK applied com revisão seguinte e leitura da configuração após confirmação. A tentativa automática pelo executor falhou antes da inscrição por indisponibilidade de conexão ao Cloud Run; nenhuma operação real ou dado da TV foi alterado.


### Smoke completo de configuração e ACK — 2026-10-12

Execução local aprovada de infra/portal/smoke-configuration.ps1: enrollment ok; sessão HTTP 200; operação sintética criada como pending; operação listada no portal; entregue pela rota da TV; ACK applied na revisão 1; configuração listada após o ACK; secretsPrinted=false. OperationId e sourceId foram sintéticos e descartáveis.


### Regressão após provisionamento — 2026-10-12

- api: uv run pytest tests/portal -q: 42 passed, 59 skipped em 2.20s.


### E2E portal com servidor explícito — 2026-10-12

A primeira tentativa sem servidor falhou integralmente com ERR_CONNECTION_REFUSED em 13 testes. Repetição conforme estratégia (Vite iniciado em 127.0.0.1:5174 antes do runner) passou 13/13 em 6,2s. Não houve falha de comportamento nem alteração de contrato.


### Correção T055 e revalidação completa — 2026-10-12

O preload imediato da rota SourceAccessRoute eliminou a falha intermitente sob carga. Resultado final: 563 arquivos e 3301 testes Vitest PASS; portal E2E 13/13; lint/build TV PASS; contratos C1–C5 íntegros.

### Verificação local de continuidade — 2026-10-12

- `uv run pytest tests/portal -q` em `api/`: **42 passed, 59 skipped** (skips dependem de serviços externos/Firestore).
- Parser PowerShell de `infra/portal/measure-staging.ps1`: **PASS**.
- O agendamento diário de backup foi consultado e permanece ativo com retenção de 604800s (7 dias); ainda sem snapshot READY.

### Retomada local do execute — 2026-10-12

- `uv run pytest tests/portal/test_payments.py tests/portal/test_licensing.py tests/portal/test_worker.py tests/portal/test_restore_journal.py -q`: **11 passed, 10 skipped**; skips dependem de Firestore/serviços externos.
- `node.exe node_modules/vitest/vitest.mjs run src/lib/licensing src/lib/portal/portal-tv-licenca-anual.contract.test.ts --pool=threads --maxWorkers=2`: **17/17 PASS**, 7 arquivos.
- `check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual -Json`: **PASS**, cinco testes e trava íntegra.
- T036 permanece parcial: fake/local aprovado, pagamento sandbox real não executado por falta de credenciais.

### Continuidade sem snapshot — 2026-10-12

- Suíte TV unitária repetida com `npm.cmd run test -- --pool=threads --maxWorkers=4`: **563 arquivos e 3301 testes PASS**, exit 0 em 294,54s. `npm.cmd run lint` e `npm.cmd run build` também passaram; o build confirmou ausência do demuxer.
- Portal web: `npm.cmd run lint`, `npm.cmd run build` e `npm.cmd run test` passaram (5/5). A API completa passou **49 testes, 60 skips**; os skips dependem de Firestore/serviços externos.
- T052 local: criados `api/tests/portal/test_deployment.py` e `test_restore.py`; manifestos público/jobs, IAM, Scheduler OIDC, Firestore server-only e runbook de restore isolado/dry-run passaram (6/6). Isso não substitui homologação real, replay ou restore.
- T041 continua aberta: o caso mínimo A005 ainda reproduz timeout de encerramento apesar da suíte completa verde; a falha global `teste-conexao-tv` permanece registrada conforme decisão do usuário.
- T043 continua aberta: medição de 100 alterações/ativações foi bloqueada pelo limite de enrollment por IP; não foi inferido aceite de carga.
- T045 (checkpoint anterior): a conta ainda não tinha autorização para a Billing Budgets API; o estado atual do budget está registrado abaixo.
- T039 não foi executada nesta continuidade: snapshot/inspect/restore e RPO/RTO ficam deliberadamente para o último gate.
- Consultas somente leitura confirmaram Cloud Run público/jobs `Ready=True`, Scheduler `portal-tick` habilitado com OIDC dedicado, IAM do jobs restrito ao `portal-scheduler` e índice Firestore `kind,nextDueAt,__name__` `READY`.
- `billingbudgets.googleapis.com` foi habilitada no projeto correto; a listagem ainda recusa a conta de faturamento por falta de permissão, então T045 não foi aceita.
- A permissão foi corrigida e há um budget ativo de R$10/mês na conta de faturamento, com thresholds 50/90/100/150%, valor confirmado pelo usuário. Não há canal personalizado em `notificationsRule`.

- T036: uma notificação sintética com HMAC usando o segredo carregado no Cloud Run foi aceita pelo webhook staging (`HTTP 200`, `state=received`). A assinatura oficial do Mercado Pago continua pendente por `401` nas entregas observadas e erro 5xx no painel Webhooks; checkout permanece desligado.

- T036: Mercado Pago sandbox enviou evento oficial `payment.updated` e recebeu `200 - OK`; Cloud Logging confirmou duas requisições `POST` do webhook com status 200. Assinatura oficial validada; E2E de renovação/estorno/offline e fluxo completo TV ainda pendentes.

- Decisão T036: não repetir compra sandbox; reutilizar as duas compras aprovadas e a concessão anual já conciliada. Webhook oficial validado separadamente com `payment.updated`/HTTP 200; ausência de nova concessão causal apenas por webhook registrada como limitação.

### Fechamento T041 — 2026-10-12

- A005: três execuções isoladas do contrato C1–C5 terminaram `exit 0`, sem timeout de encerramento; não foi aumentado timeout nem usado `force-exit`.
- Unit TV: `npm.cmd run test -- --pool=threads --maxWorkers=4 --reporter=json --outputFile=../.cache/069-t041-unit-results.json` → **3301/3301 testes, 1398/1398 suítes PASS**.
- E2E TV: `node.exe e2e/run.mjs --jobs 3` com Vite ativo → **49/49 scripts PASS em 350s**, incluindo `teste-conexao-tv`.
- Portal: lint/build/unit **5/5 PASS**; E2E **13/13 PASS**. TV lint/build/build:tizen, guard de demux e sincronização do pacote PASS. Trava069 C1–C5 **5/5 PASS**.

### T045 — oferta, termos, retenção e budget — 2026-10-12

- Oferta verificada no domínio comercial/API: `priceMinor=3500`, `currency=BRL`, `termMonths=12`, `deviceCount=1`; o provider Mercado Pago monta Checkout Pro anual a R$35,00 e aceita Pix/cartão.
- Os testes direcionados `test_bootstrap.py`, `test_commercial_repository.py`, `test_mercadopago.py`, `test_payments.py` e `test_retention.py` passaram: **11 passed, 12 skipped** (skips dependem de serviços externos).
- Cloud Run público e jobs estão `Ready=True` no projeto `ccplaytv-511322`, em staging, com `CCPLAY_PORTAL_MERCADOPAGO_LIVE_MODE=false`, `CCPLAY_PORTAL_CHECKOUT_ENABLED=false` e conta sandbox configurada. Nenhum segredo foi impresso.
- Retenção e recuperação pelo próprio site estão documentadas: configurações enquanto cadastradas, recibos/metadados terminais por 30 dias, metadados de recuperação por 30 dias, desafio/envelope por 5 minutos e retomada por 24 horas; não há canal ou SLA manual.
- Budget Cloud Billing confirmado em **R$10/mês**, créditos incluídos, alertas em 50%, 90%, 100% e 150%. Alertas não são teto de cobrança; o serviço permanece ativo para decisão posterior do mantenedor.

### T052 — revalidação OIDC e isolamento — 2026-10-12

A revalidação somente leitura confirmou público e jobs prontos, API pública protegida, jobs privados, Scheduler OIDC habilitado, IAM restrito ao `portal-scheduler` e índice Firestore READY. Os testes de deployment/restore permanecem 6/6 PASS; restore real, replay e reconciliação dependem do snapshot READY de T039.

### T046 — deploy físico — 2026-10-12

O Host PC IP foi corrigido na TV e o deploy foi repetido com sucesso: build Tizen, assinatura, instalação e lançamento no aparelho `192.168.0.2`. A atualização não desinstalou o app nem limpou o IndexedDB. T046 continua aberta somente para a confirmação visual do roteiro comercial na TV; não se infere aceite a partir do lançamento técnico.

### Confirmação física de dados — 2026-10-12

O usuário confirmou que o CCPlay abriu após o deploy e que listas/favoritos continuaram presentes. O resultado comprova preservação do estado local na atualização; não encerra os cenários comerciais específicos de T046.
