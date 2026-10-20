# Infra de produção — 081

Projeto `ccplaytv-prod`, região `us-central1`. Só nomes, revisões, horários e estados; nenhum valor secreto.

## T012 — projeto e faturamento (2026-10-17)

| Passo | Resultado |
| --- | --- |
| APIs `cloudresourcemanager` e `cloudbilling` no projeto de cota do gcloud (`ccplaytv-511322`) | habilitadas (necessárias para criar/vincular pela CLI) |
| `gcloud projects create ccplaytv-prod` | criado |
| Vínculo à conta `019D1E-9F4271-E5FBF5` (a mesma da homologação) | 1ª tentativa recusada: cota de 5 projetos por conta (R-011) |
| `pocanalytics1` desvinculado do faturamento | **decisão do usuário**, após aviso de que ele tem 3 buckets e 1 dataset BigQuery (`demo_gold`) que podem ficar inacessíveis/ser apagados sem faturamento |
| Vínculo de `ccplaytv-prod` | `billingEnabled: true` |
| `bootstrap-gcp.ps1 -ProjectId ccplaytv-prod -Apply` | APIs, `portal-runtime`, `portal-scheduler`, papéis mínimos, Firestore `(default)` e Artifact Registry `portal` criados |

## T013 — arquivo de ambiente (2026-10-17)

`new-production-env.ps1` → `infra/portal/production.env.yaml` (ignorado pelo Git), 16 variáveis, `CHECKOUT_ENABLED=false`,
`MERCADOPAGO_LIVE_MODE=true`, `PUBLIC_ORIGIN=https://portal.ccplaytv.com`. JWKS **público** para o build comercial da TV:

```json
{"prod1": {"kty": "EC", "crv": "P-256", "x": "CqcJiBcYM-Wh1fnuMadDbWgOVKIrHXttm8vFU1EJ7CM", "y": "Sjbjcs6ROod8yAjYeMY9sxZJ-8Z7ofQUs7kErihcohI"}}
```

Cópia protegida fora do repositório: pendente de confirmação do usuário.

## T014 — provisionamento (2026-10-17)

| Passo (`provision-production.ps1 -ProjectId ccplaytv-prod -Apply`) | Resultado |
| --- | --- |
| `journal` | bucket `gs://ccplaytv-prod-portal-journal`: uniforme `True`, prevenção de acesso público `enforced`, lifecycle 30 dias, `US-CENTRAL1`; papel `portalJournalWriter` (create/get/list) ligado ao `portal-runtime` só no bucket (a 1ª tentativa do binding falhou por propagação do papel novo; reexecução idempotente aplicou) |
| `backup` | agenda diária do Firestore `(default)`, retenção `604800s` (7 dias). Corrigido bug do script (no 5.1, `ConvertFrom-Json '[]'` contava 1 e o passo dizia "exists") |
| `budget` | `ccplaytv-portal-ccplaytv-prod`, 10 BRL/mês, avisos 50/90/100% e 150% previsto; reexecução → `exists` (sem duplicar) |
| `scheduler` (após o jobs) | `run.invoker` do `portal-scheduler` no jobs; job `portal-tick` horário (`0 * * * *`, UTC), OIDC com audience = URL do jobs |

## T015 — build e deploy com venda fechada (2026-10-17)

| Item | Resultado |
| --- | --- |
| Upload do build (`gcloud meta list-files-for-upload`) | 3213 arquivos; nenhum `.env`/`*.env.yaml`/`dados.md`/`.cache`/`node_modules` (só `.env.example` com placeholders) |
| Cloud Build `bf7309f8-9e17-442f-b4ed-9c900e9b01f7` | SUCCESS, 1m27s, imagem `us-central1-docker.pkg.dev/ccplaytv-prod/portal/ccplaytv-portal:081` |
| Público `ccplaytv-portal` | revisão `ccplaytv-portal-00001-7lz`, 100%, `https://ccplaytv-portal-45605290878.us-central1.run.app` |
| Jobs `ccplaytv-portal-jobs` (`deploy-jobs-env.ps1 -Create`) | revisão `ccplaytv-portal-jobs-00001-fmj`, privado; arquivo temporário removido. Corrigido o regex do `SERVICE_ROLE` para aceitar aspas |
| `smoke-staging.ps1 -BaseUrl <run.app>` | raiz 200, `/health` 200, `/configurations` sem sessão 401, `passed: true` |
| Jobs anônimo `POST /internal/portal/jobs/tick` | 403 |
| `GET /portal/v1/license-keys` | só `kid` `prod1` |
| Tick pelo Scheduler | `jobs run` forçado duas vezes sem tentativa registrada; conferir o tick automático das 19:00 UTC |

## T017 — domínio (2026-10-17)

| Passo | Resultado |
| --- | --- |
| Mapeamento na homologação (REST `domains.cloudrun.com/v1`, o gcloud não tinha o componente `beta`) | `Ready`/`CertificateProvisioned`/`DomainRoutable` = True, CNAME `portal → ghs.googlehosted.com.` |
| `DELETE` do mapeamento em `ccplaytv-511322` | removido |
| `POST` do mapeamento em `ccplaytv-prod` → `ccplaytv-portal` | criado; certificado `True` em ~15 min; TLS respondendo ~7 min depois |
| `PUBLIC_ORIGIN` da homologação (público e jobs) | `https://ccplaytv-portal-dvpldo267q-uc.a.run.app` (só `--update-env-vars` desse nome, sem segredo) |
| DNS | CNAME inalterado (`ghs.googlehosted.com`) |
| `smoke-staging.ps1` no domínio | `passed: true` |
| `GET https://portal.ccplaytv.com/portal/v1/license-keys` | só `prod1` (homologação no `run.app` dela segue `v1`) |
| `smoke-enrollment.ps1` no domínio | 200, `deviceId`/chave/bearer/código presentes (cria 1 aparelho sintético na produção) |

## T018 — pacote comercial (build, 2026-10-17)

`npm run build:tizen:commercial` com `VITE_PORTAL_ORIGIN`/`VITE_PORTAL_SITE_URL` = `https://portal.ccplaytv.com` e
`VITE_LICENSE_PUBLIC_KEYS` = `{"prod1": …}` (variáveis só no processo). **Árvore atual, incluindo a 079 em andamento —
decisão do usuário.** Conferido nos `.js` de `CCPlayTv/`: origem de produção presente, `x` de `prod1` presente, `x`
da chave revogada `v1` ausente, nenhum campo privado `d`.

## T015 — tick do Scheduler (2026-10-17)

| Momento (UTC) | Resultado |
| --- | --- |
| 18:14 e 19:00 (forçado e automático) | **500** no jobs: OIDC aceito, mas a consulta de jobs exige o índice composto `jobs(kind, nextDueAt)`, que nunca foi criado na produção (na homologação foi criado à mão; não estava em nenhum script) |
| Correção | passo novo `indexes` em `provision-production.ps1`, que aplica `firestore.indexes.json`: 4 índices compostos (`jobs(kind,nextDueAt)`, `operations(state,createdAt)`, `operations(sourceId,action,state)`, `operations(action,state)`) + 5 exclusões de campo `envelope`. READY em ~5 min; reexecução → `exists` (idempotente) |
| 19:15 (forçado) | **200** `Google-Cloud-Scheduler` |

Observação: a homologação só tem o índice de `jobs`; os de `operations` não existem lá (fora do escopo; ela será reduzida na T034).
