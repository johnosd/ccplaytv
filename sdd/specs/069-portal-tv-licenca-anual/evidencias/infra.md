

### Jobs, Scheduler e Firestore — 2026-10-12

- Serviço Cloud Run privado criado: ccplaytv-portal-jobs, revisão ccplaytv-portal-jobs-00001-qcj, região us-central1, URL interna de jobs registrada apenas na configuração do Scheduler. IAM roles/run.invoker concedido exclusivamente a portal-scheduler.
- Cloud Scheduler portal-tick criado e ENABLED, cron 0 * * * * UTC, POST para /internal/portal/jobs/tick com OIDC de portal-scheduler e deadline 60s. Disparo manual solicitado; não foi possível observar request log de execução nesta janela.
- Firestore Native verificado em us-central1. Consulta administrativa sem conteúdo sensível encontrou devices=4, operations=1, configurations=1 e configurationVersions=1; os registros correspondem aos smokes sintéticos.
- Não foi concedida permissão TokenCreator ao usuário para simular OIDC manualmente; o teste permanece restrito ao Scheduler real.


### Backup Firestore diário — 2026-10-12

- Executado infra/portal/backup/manage-backup.ps1 -Action schedule -ProjectId ccplaytv-511322 -Apply com sucesso.
- Agendamento criado na base (default), retenção 604800s (7 dias), recorrência diária.
- gcloud firestore backups list em us-central1 ainda não retornou snapshots READY; o primeiro backup depende da próxima janela diária. O restore/RPO/RTO não foi declarado aprovado.


### Homologação independente do backup — 2026-10-12

- Cloud Run público: raiz HTTP 200 e /health HTTP 200.
- Cloud Run jobs sem autenticação: HTTP 403, confirmando serviço privado.
- IAM do jobs contém somente portal-scheduler como invoker; revisão pronta ccplaytv-portal-jobs-00001-qcj.
- Aguardar snapshot diário continua sendo a única dependência temporal; nenhuma alteração na TV ou na base principal foi feita.


### TV e T043/T052 — 2026-10-12

TV atualizada via deploy-tv.ps1 com mesmo perfil, instalação e lançamento confirmados; veredito visual pendente do usuário. Sem desinstalação.

Medições preliminares: 100 health HTTP200, p50=302.28ms/p95=312.54ms; 100 jobs sem autenticação HTTP403, p50=300.39ms/p95=399.83ms. Isto mede somente superfície HTTP, não alterações/ativações exigidas por T043.

T052: Scheduler atualizado para URL canônico regional; journal bucket regional criado com lifecycle30dias; papel custom create/get/list aplicado; env do journal adicionada; público revisão00004-tnk/jobs00002-7lq. Tick real retornou500 após resolver configuração do journal; índice composto jobs(kind,nextDueAt) criado e ainda CREATING. Repetir tick após índice READY.


### Tick Scheduler/Firestore aprovado — 2026-10-12

Após o índice jobs(kind,nextDueAt) atingir READY, o Scheduler portal-tick executou com OIDC no URL canônico regional e retornou HTTP 200: 12:00:19Z em 10,17s e 12:14:56Z em 1,35s. O job Firestore existe (1 documento); nenhum erro foi observado na execução posterior.

### Backup e medição — 2026-10-12

O agendamento diário do Firestore está criado no projeto `ccplaytv-511322`, com retenção de sete dias. `gcloud firestore backups list --location=us-central1` ainda retorna lista vazia; o primeiro snapshot READY não foi gerado, então T039 permanece pendente. A medição T043 foi preparada em `infra/portal/measure-staging.ps1`, mas a execução foi bloqueada pelo limitador de enrollment por IP após os smokes; não foi inferido resultado de carga.

### Validações independentes — 2026-10-12

- T052: `uv run pytest tests/portal -q` passou com 42 testes e 59 skips condicionados a serviços externos; o tick real do Scheduler/OIDC já havia retornado HTTP 200 após o índice Firestore ficar READY.
- T045 (checkpoint anterior): a consulta administrativa de budgets ainda não estava autorizada. O estado atual está registrado abaixo com budget ativo de R$10/mês.

### Mercado Pago sandbox configurado — 2026-10-12

As quatro variáveis de sandbox foram detectadas no arquivo privado local sem imprimir valores. O serviço público foi redeployado na revisão `ccplaytv-portal-00005-drv` e o serviço jobs na revisão `ccplaytv-portal-jobs-00003-zzr`, ambos Ready. O webhook sem assinatura retornou HTTP 401 (segredo carregado e assinatura ausente), e o jobs confirmou as variáveis do Mercado Pago com `SERVICE_ROLE=jobs`. `CHECKOUT_ENABLED` permanece `false`; nenhuma venda foi liberada e T036 continua aguardando compra de teste completa.

Na tentativa posterior, o staging foi atualizado para permitir temporariamente o Checkout Pro sandbox. A preferência de `R$35,00` foi criada e o checkout carregou, mas o pagamento foi rejeitado porque a sessão usava a conta vendedora; a próxima execução deve usar a conta compradora de teste separada. Nenhum pagamento real foi feito e T036 não foi marcado como concluído.

### Homologação de compra sandbox — 2026-10-12

- Duas compras foram aprovadas com comprador de teste separado (saldo e cartão), ambas `R$35,00`, `BRL`, merchant esperado e `live_mode=true` do provedor de teste.
- O worker privado, disparado por Scheduler OIDC, conciliou as ordens por consulta autenticada. Firestore confirmou `approved`, payment IDs, grants `valid` e vencimento anual para os dois devices sintéticos.
- Webhooks recebidos do Mercado Pago retornaram `401` por assinatura não validada; a rota permaneceu fail-closed. O fluxo de fallback diário foi o responsável pela concessão.
- Correção aplicada no worker: checkpoints textuais de falha são descartados antes de chamar a paginação numérica do provider. Testes direcionados `9 passed, 8 skipped`.
- Revisões finais saudáveis: Cloud Run público `ccplaytv-portal-00012-6x2`, jobs `ccplaytv-portal-jobs-00013-qtk`; smoke `root=200`, `health=200`, endpoint protegido `401`.
- `CCPLAY_PORTAL_CHECKOUT_ENABLED=false` foi restaurado após a prova; nenhuma venda de teste permanece aberta.

### Validação local de deployment sem snapshot — 2026-10-12

- `api/tests/portal/test_deployment.py` e `test_restore.py`: **6/6 PASS**. As verificações cobrem separação público/jobs, IAM, OIDC do Scheduler, ausência de chaves em manifestos, regras Firestore fechadas e restore isolado em dry-run.
- A prova não executa `gcloud firestore databases restore`; o primeiro snapshot READY, replay e RPO/RTO continuam reservados ao último gate T039.

- Consulta somente leitura em 2026-10-12 confirmou público `ccplaytv-portal-00012-6x2` e jobs `ccplaytv-portal-jobs-00013-qtk` como `Ready=True`; Scheduler `portal-tick` `ENABLED` usa OIDC com `portal-scheduler`; IAM do jobs contém somente `roles/run.invoker` para essa conta; índice Firestore `kind,nextDueAt,__name__` está `READY`.
- `billingbudgets.googleapis.com` foi habilitada no projeto `ccplaytv-511322`. A criação/listagem do budget continua bloqueada porque a conta ativa não tem acesso à conta de faturamento `019D1E-9F4271-E5FBF5`; nenhum budget foi criado.

### Budget de faturamento criado — 2026-10-12

- Budget criado na conta `019D1E-9F4271-E5FBF5`: **R$10/mês**, período mensal, créditos incluídos, thresholds de 50%, 90%, 100% e 150%.
- `notificationsRule` está vazio, portanto não há canal personalizado; aplicam-se os destinatários padrão de alertas da conta conforme a configuração do Cloud Billing.
- O usuário confirmou o valor atual como referência do piloto: **R$10/mês**, thresholds 50%/90%/100%/150%. T045 permanece aberta apenas para os demais itens comerciais e operacionais.

### Webhook Mercado Pago — validação sintética — 2026-10-12

- A rota pública de staging aceitou uma notificação sintética assinada com o segredo configurado no Cloud Run: `HTTP 200`, estado `received`, sem impressão de segredo ou identificador de pagamento.
- A prova confirma a implementação fail-closed do HMAC e o carregamento da variável no serviço. A entrega oficial ainda não foi aceita: as chamadas observadas do Mercado Pago retornaram `401`, e o painel de Webhooks estava em erro 5xx durante a conferência da aplicação.

### Webhook oficial recebido — 2026-10-12

- Mercado Pago Webhooks em modo de teste enviou `payment.updated` e recebeu `200 - OK`.
- Cloud Logging confirmou duas requisições `POST` ao caminho público do webhook com status HTTP 200. A consulta foi somente leitura e filtrou apenas método/status, sem expor payload ou credenciais.
- A rota e o segredo oficial estão coerentes no staging; checkout permanece desligado fora da janela de teste.

### T045 — confirmação operacional — 2026-10-12

A configuração implantada mantém staging isolado e checkout fechado: público/jobs `Ready`, Mercado Pago sandbox (`live_mode=false`), `CHECKOUT_ENABLED=false`, sem venda liberada. A oferta é R$35 por 12 meses e uma TV; Pix/cartão são tratados pelo Checkout Pro. O custo de infraestrutura de referência do piloto permanece R$10/mês com budget e alertas 50/90/100/150. O orçamento inclui runtime, Firestore, journal/backup/restore, imagens/builds, logs/tráfego, câmbio e impostos; os valores reais de carga e restauração continuam em T043/T039/T052.

### T052 — homologação real não destrutiva — 2026-10-12

- Smoke público: raiz `200`, `/health` `200`, configurações sem autenticação `401`.
- Serviço jobs sem autenticação: `403`; Scheduler `portal-tick` está `ENABLED`, usa `POST` com OIDC e aponta para `/internal/portal/jobs/tick`.
- IAM de invocação do jobs contém somente `serviceAccount:portal-scheduler@ccplaytv-511322.iam.gserviceaccount.com`; nenhum `allUsers` foi observado.
- Índice composto Firestore para `jobs(kind,nextDueAt)` está `READY`.
- Suíte `uv run pytest tests/portal -q`: **49 passed, 60 skipped**. Os skips são condicionados a serviços externos; nenhum restore foi executado.
- O gate de restore/replay/RPO/RTO continua reservado a T039, conforme decisão de manter o snapshot por último.

### Deploy do fix T056 no staging — 2026-10-13

- Build: `gcloud builds submit` com `infra/portal/cloudbuild.yaml`, build `cf5ff1e5-2010-4017-bd34-744ea091298b`, SUCCESS em 1m30s, imagem `.../portal/ccplaytv-portal:staging`. O contexto não inclui `staging.env.yaml` (ignorado pelo git) e a imagem só copia `api/app/portal/`, `portal_main.py` e o `dist` do portal-web.
- Deploy: `gcloud run deploy ccplaytv-portal` (fluxo de `docs/portal/deploy-staging.md`, mesmas chaves e `--env-vars-file`), revisão **`ccplaytv-portal-00013-ph4`** com 100% do tráfego; anterior `ccplaytv-portal-00012-6x2` (alvo de rollback: `gcloud run services update-traffic ccplaytv-portal --to-revisions ccplaytv-portal-00012-6x2=100 --region=us-central1`).
- Mantidos: checkout desligado (`CHECKOUT_ENABLED=false`), Mercado Pago em sandbox (`LIVE_MODE=false`), chaves inalteradas (a chave pública embutida no pacote comercial da TV continua a mesma: `kid=v1`, `x` igual).
- Serviço jobs **não** foi alterado (`ccplaytv-portal-jobs-00013-qtk`): o fix está no caminho de sessão de navegador, que ele não serve.
- Smoke: raiz `200`, `/health` `200`, `/portal/v1/configurations` sem sessão `401`, tick interno no serviço público `404`.
- Verificação do fix: sessão sintética (enroll + sessão manual) e 20 rodadas × 3 leituras simultâneas (`configurations`, `operations`, `snapshot`): **60/60 `200`, 0 `401`**. Limite: não há linha de base no staging antes do fix (a reprodução anterior foi na pilha local, ~2 de 3 rodadas com 401); esta é evidência de ausência do sintoma, não prova formal.


### T039 — inspeção do backup (executada pelo usuário) — 2026-10-13

- `manage-backup.ps1 -Action inspect -ProjectId ccplaytv-511322 -Apply`, executado pelo usuário no terminal da sessão: `code=backup_current`, `ageHours=22.9`, `snapshotAt=2026-10-13T03:31:48Z`. Primeiro snapshot READY do agendamento diário (retenção 7 dias).
- A 1ª execução falhou por defeito do script (reparse do `snapshotTime` pela cultura pt-BR); corrigido em `ebff70d` com teste estático de regressão.
- Observação: 22,9 h está a ~1 h do limite de 24 h do `backup_stale`; o agendamento é diário, então o próximo snapshot deve renovar a idade. Isso é o monitor do R-… de RPO, não uma falha.
- **Ainda não executado:** `restore` em banco isolado (`portal-restore-*`), leitura do banco restaurado (IDs/claims), replay do journal e medição de RPO/RTO — dependem de autorização explícita para criar o banco e do nome do recurso do backup.