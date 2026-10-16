# Staging — 073 (T030, 2026-10-15)

Projeto `ccplaytv-511322`, `us-central1`. Build remoto `80164b62-3039-4313-99c0-1097d0e8263f` (SUCCESS, 1m34s).
Upload conferido antes (`gcloud meta list-files-for-upload`): sem `staging.env.yaml`, `.cache`, `node_modules`,
`docs/m3u/dados.md`; só `.env.example`.

| Serviço | Revisão | Observação |
| --- | --- | --- |
| `ccplaytv-portal` (público) | `ccplaytv-portal-00020-nzt` (100%) | `--env-vars-file=infra/portal/staging.env.yaml` |
| `ccplaytv-portal-jobs` | `ccplaytv-portal-jobs-00019-sk9` (100%) | `infra/portal/deploy-jobs-env.ps1 -Image …:staging` (arquivo temporário apagado) |

Configuração publicada (só nomes/valores não secretos): `CHECKOUT_ENABLED=true` (ligado **só no staging**, a pedido
do usuário, para o teste do sandbox), `MERCADOPAGO_LIVE_MODE=false`, `PIX_PAYER_DOMAIN=pagamentos.ccplaytv.com`.

## Smoke `infra/portal/smoke-pix-sandbox.ps1` (TV fictícia nova)

| Verificação | Resultado |
| --- | --- |
| `PUT /device/recovery-code/escrow` com o código da TV | 200/204 — aceito |
| `POST /session/recovery-code` (sessão da mesma TV, CSRF) | código igual ao da TV; `Cache-Control: no-store` |
| `GET /session/device` | sem copia-e-cola; `pendingOrder` nulo (não houve Pix) |
| `POST /device/orders/pix` | **503** |

## Causa do 503 (diagnóstico direto no sandbox, só status/causa impressos)

Mercado Pago `POST /v1/payments` (Pix) → **HTTP 401, causa 7 "Unauthorized use of live credentials"**, com e sem
`date_of_expiration`. As credenciais do staging são `APP_USR` de **usuário de teste**; com elas a API de pagamentos
só aceita como pagador outro usuário de teste — o e-mail sintético `tv-<hash>@pagamentos.ccplaytv.com` é recusado.
É o risco R-001 previsto no plano. O Checkout Pro do portal não é afetado (o comprador faz login no Mercado Pago).

### Segunda tentativa — comprador de teste (decisão do usuário)

Implementado `CCPLAY_PORTAL_PIX_TEST_PAYER_EMAIL` (só `staging`/`test`, recusado em produção e em live mode; pytest
165/165). Antes de publicar, diagnóstico direto no sandbox com o comprador de teste do `.env` da raiz
(`MP_BUYER_TEST_ID`/`MP_BUYER_TEST_USER`, lidos só em memória):

| Pagador | Resposta |
| --- | --- |
| `test_user_<ID>@testuser.com` | HTTP 401, causa 7 "Unauthorized use of live credentials" |
| `<USER>@testuser.com` | HTTP 401, causa 7 |

Conclusão: o bloqueio **não é o pagador**, é a credencial do vendedor do staging, que não está autorizada a criar
pagamentos pela API de pagamentos (o Checkout Pro da 069 só cria preferência e por isso funciona). Depende de
configuração no Mercado Pago (credenciais de teste da aplicação, ou ativação das credenciais da conta vendedora de
teste). Nenhuma revisão nova publicada nesta tentativa.

### Terceira checagem — dono do token e meios de pagamento (2026-10-15)

| Verificação (só booleanos) | Resultado |
| --- | --- |
| Token do staging é `APP_USR` | sim |
| `GET /users/me`: dono do token = `MERCHANT_ID` do staging = `MP_SELLER_TEST_ID` do `.env` (nickname confere) | sim |
| Conta do dono é de teste (`test_user`), site MLB | sim |
| `GET /v1/payment_methods`: cartão listado | sim (11 meios) |
| `GET /v1/payment_methods`: **Pix listado** | **não** |

Conclusão: a credencial é a do vendedor de teste certo; **a conta vendedora de teste não tem Pix habilitado** (sem chave
Pix cadastrada nela), por isso o `POST /v1/payments` Pix é recusado. Ação do usuário: entrar no Mercado Pago com a
conta vendedora de teste (`MP_SELLER_TEST_*`) e cadastrar uma chave Pix (ex.: aleatória) nela; depois republicar o
staging com `CCPLAY_PORTAL_PIX_TEST_PAYER_EMAIL` e rodar `infra/portal/smoke-pix-sandbox.ps1`.

## Decisão do usuário: Pix não será testado; validar com cartão (2026-10-15)

- Cartão pela **API de pagamentos** (`/v1/card_tokens` 201 → `/v1/payments` com titular APRO e comprador de teste):
  **HTTP 401, causa 7** — a credencial do vendedor de teste só cobra pelo Checkout Pro (página do Mercado Pago).
  Nesse teste o pedido criado pelo portal ficou `pending` e a licença da TV fictícia seguiu `trial` (nenhuma concessão
  sem pagamento confirmado — correto).
- Caminho adotado: **Checkout Pro** com o comprador de teste logado no navegador (feito pelo usuário; o login não é
  automatizado). TV fictícia `CE:F3:83:5F:8E:20`, pedido pendente criado pelo portal; conferência da aprovação e do
  Atualizar da TV por `card_flow.py check` (scratchpad).
- **Resultado (2026-10-15)**: o usuário pagou no Checkout Pro sandbox, logado como comprador de teste, com o cartão
  de teste salvo na conta. Conferência (`card_flow.py check`):

  | Verificação | Resultado |
  | --- | --- |
  | Pedido no serviço (aprovado só pela consulta autenticada ao Mercado Pago) | `approved` |
  | Atualizar da TV (`/device/entitlement/refresh`) | licença `active`, **365 dias** |
  | Portal (`/session/device`) | `active`; `pendingOrder` limpo (`null`) |

- **Pix na TV fica sem validação no provedor real** (R-001): coberto por testes com o provedor fictício, pelo E2E
  com portal fictício e pelo diagnóstico do sandbox (Pix indisponível na conta vendedora de teste). Staging segue em `ccplaytv-portal-00020-nzt` com
`CHECKOUT_ENABLED=true`.
