# Implantação do Portal CCPlayTV

## Pré-requisitos

- Projeto `ccplaytv-511322`, billing ativo e `gcloud` autenticado.
- APIs Cloud Run, Firestore, Artifact Registry, Cloud Build, IAM Credentials, Scheduler, Logging e Monitoring.
- KMS e Secret Manager não fazem parte da primeira versão; as chaves são fornecidas por arquivo local ignorado.

## Bootstrap

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File infra/portal/bootstrap-gcp.ps1 `
  -ProjectId ccplaytv-511322 -Region us-central1 -Apply
```

O script habilita APIs, cria `portal-runtime` e `portal-scheduler`, aplica os papéis mínimos, cria/verifica Firestore Native e Artifact Registry. Ele não remove `roles/editor`.

## Chaves de staging

Preencher localmente `CCPLAY_PORTAL_AES_KEY`, `CCPLAY_PORTAL_SIGNING_KEY`, `CCPLAY_PORTAL_IDENTITY_HMAC_KEY` e `CCPLAY_PORTAL_RECOVERY_HMAC_KEY`. Gerar `infra/portal/staging.env.yaml` ignorado pelo Git. Nunca publicar chaves em commits, logs ou mensagens.

## Build remoto

```powershell
$PROJECT="ccplaytv-511322"
$IMAGE="us-central1-docker.pkg.dev/$PROJECT/portal/ccplaytv-portal:staging"
gcloud builds submit --project=$PROJECT --config=infra/portal/cloudbuild.yaml --substitutions="_IMAGE=$IMAGE" .
```

## Deploy staging

```powershell
gcloud run deploy ccplaytv-portal `
  --project=ccplaytv-511322 `
  --region=us-central1 `
  --image=us-central1-docker.pkg.dev/ccplaytv-511322/portal/ccplaytv-portal:staging `
  --service-account=portal-runtime@ccplaytv-511322.iam.gserviceaccount.com `
  --allow-unauthenticated --min=0 --max=2 --concurrency=20 `
  --memory=512Mi --cpu=1 --timeout=60 `
  --env-vars-file=infra/portal/staging.env.yaml
```

O checkout permanece desativado em staging. Após obter a URL `run.app`, atualizar `CCPLAY_PORTAL_PUBLIC_ORIGIN` e publicar uma nova revisão.

## Validação

```powershell
gcloud run services describe ccplaytv-portal --region=us-central1 --format="value(status.url)"
```

Testar `/` (HTML CCPlayTV) e `/health` (HTTP 200), depois enrollment, configuração Xtream por URL, recuperação e leitura/escrita Firestore. Confirmar que logs não contêm credenciais, chaves ou tokens. Registrar URL, revisão, horário e resultado em `sdd/specs/069-portal-tv-licenca-anual/evidencias/infra.md`.

## Produção

Produção será um serviço separado, por exemplo `ccplaytv-portal-prod`, com chaves, origem, dados e revisão separados. Checkout só será habilitado após os gates T036, T039, T041, T043, T045, T046 e T052. Não reutilizar chaves de staging.

## Rollback

```powershell
gcloud run services update-traffic ccplaytv-portal --to-revisions REVISION=100 --region=us-central1
```

Não remover Firestore, Artifact Registry ou contas de serviço durante homologação. Remover `roles/editor` da conta Compute somente após validar runtime dedicado, jobs e rollback.

Bootstrap e build remoto foram concluídos.

Deploy staging concluído em 2026-10-11:

- Serviço: `ccplaytv-portal`
- Revisão: `ccplaytv-portal-00001-njz`
- URL inicial: `https://ccplaytv-portal-245842812344.us-central1.run.app`
- URL canônica após descoberta do Cloud Run: `https://ccplaytv-portal-dvpldo267q-uc.a.run.app`
- Tráfego: 100%
- Health check: `Ready=True`, `RoutesReady=True`, startup TCP probe aprovada, Uvicorn ouvindo em `0.0.0.0:8080` e `GET /health` retornando HTTP 200 `{"status":"ok"}`. Smoke funcional: raiz 200 e `/portal/v1/configurations` sem autenticação 401.
