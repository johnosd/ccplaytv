

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
- T045: `infra/portal/budget.json` mantém referência de R$35/mês, alertas em 50/80/100%, previsão e serviço sem corte automático. A consulta administrativa de budgets não foi autorizada pela conta de faturamento/API `billingbudgets.googleapis.com`; nenhum alerta foi declarado configurado.

### Mercado Pago sandbox configurado — 2026-10-12

As quatro variáveis de sandbox foram detectadas no arquivo privado local sem imprimir valores. O serviço público foi redeployado na revisão `ccplaytv-portal-00005-drv` e o serviço jobs na revisão `ccplaytv-portal-jobs-00003-zzr`, ambos Ready. O webhook sem assinatura retornou HTTP 401 (segredo carregado e assinatura ausente), e o jobs confirmou as variáveis do Mercado Pago com `SERVICE_ROLE=jobs`. `CHECKOUT_ENABLED` permanece `false`; nenhuma venda foi liberada e T036 continua aguardando compra de teste completa.

Na tentativa posterior, o staging foi atualizado para permitir temporariamente o Checkout Pro sandbox. A preferência de `R$35,00` foi criada e o checkout carregou, mas o pagamento foi rejeitado porque a sessão usava a conta vendedora; a próxima execução deve usar a conta compradora de teste separada. Nenhum pagamento real foi feito e T036 não foi marcado como concluído.
