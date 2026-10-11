# Preparação da infraestrutura 069

Nenhum recurso provisionado. services.json é a configuração desejada, não um manifest aceito diretamente pelo gcloud. Falta projeto/conta de faturamento/identidades/imagem e configuração privada; homologação real só T052. Produção continua bloqueada pelos gates da feature.

Build a partir da raiz: docker build -f infra/portal/Dockerfile.portal -t ccplaytv-portal:local .
O Dockerfile.portal.dockerignore ao lado é aplicado a esse Dockerfile e copia somente runtime do portal; fallback/SQL não são copiados como código. Dependências congeladas no uv.lock ainda incluem o pacote existente; separar distribuição só se medição justificar.

Emulator: firebase emulators:start --project demo-ccplaytv-portal --only firestore --config infra/portal/firebase.json (CLI/Java21 a instalar se ausentes). Para API local, definir FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 e CCPLAY_PORTAL_ENVIRONMENT=development; uv run python portal_main.py em api. Sem emulator/ID demo, recusa bootstrap local.

Na futura implantação, criar duas service accounts runtime e uma Scheduler. Runtime recebe datastore.user apenas no projeto dedicado e papel customizado de journal somente no bucket. Scheduler recebe run.invoker somente no jobs. Admin de deploy/backup/restore não pertence ao runtime. IAM do serviço privado é a autorização OIDC da plataforma; a API pública não monta executor.

Cloud Run usa imagem única, papéis public/jobs, region/us-central1, request billing/min0/max2/1CPU/512Mi. Ajustar sizing por T043. Injetar chaves somente por arquivo de ambiente privado fora do repositório/contexto Docker, sem valores em argumentos, Terraform state, stdout ou frontend. Sem KMS/Secret Manager/JSON ADC. Settings recusa cloud sem chaves. Não aplicar manifests incompletos nem relaxar bootstrap para implantar.

Journal: bucket regional privado, uniforme, prevenção de acesso público, role create/get/list sem update/delete, lifecycle30dias. Provar ifGenerationMatch=0/digest e comportamento IAM em T052. Sem retention lock irreversível. Backup Firestore diário: daily-schedule.json, sete dias; agendar/monitorar em T039. Restauração em nova base e replay obrigatório. budget.json descreve avisos BRL, converter para moeda efetiva da conta ao configurar budget: alertas não são teto/corte. Configurar destinatário mantenedor e previsão antes de vender.

Referências: [Cloud Run runtime](https://docs.cloud.google.com/run/docs/container-contract), [IAM Firestore](https://firebase.google.com/docs/firestore/security/get-started), [backups](https://cloud.google.com/firestore/docs/backups). Segurança Rules protege clientes diretos; servidor usa ADC/IAM e precisa validar autorização por dispositivo na aplicação.

Templates reais Cloud Run v1: cloud-run-public.json/cloud-run-jobs.json; policies IAM correspondentes e scheduler.json REST com OIDC. Substituir REPLACE_* e incorporar configuração privada fora do repositório antes de qualquer implantação. Templates não são implantáveis enquanto faltarem chaves/projeto/imagem. Não foram aplicados.


## Bootstrap do projeto

`bootstrap-gcp.ps1` prepara APIs, contas `portal-runtime`/`portal-scheduler`, papéis mínimos, Firestore Native e Artifact Registry. Execute com `-Apply` somente após autenticar o gcloud. O script não remove `roles/editor`. Nesta sessão, a execução foi interrompida porque o primeiro comando `gcloud projects describe` não retornou; nenhum recurso foi confirmado como criado.
