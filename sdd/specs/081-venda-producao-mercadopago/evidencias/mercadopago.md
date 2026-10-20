# Mercado Pago — conta de produção (T001)

Só estado e datas; nenhum valor de credencial.

| Item | Estado | Data | Como foi conferido |
| --- | --- | --- | --- |
| Conta em CPF verificada | feito (usuário) | 2026-10-17 | declaração do usuário |
| Chave Pix cadastrada | feito (usuário) | 2026-10-17 | declaração do usuário |
| Banco de saque | feito (usuário) | 2026-10-17 | declaração do usuário |
| Credenciais de produção (access token, client ID/secret) no `.env` da raiz | feito | 2026-10-17 | `Select-String -Quiet` por nome; `.env` ignorado e sem commits |
| Webhook produtivo → `https://portal.ccplaytv.com/portal/v1/payments/mercadopago/webhook`, segredo em `MP_WEBHOOK_SECRET_PRODUCTION` | feito (usuário) | 2026-10-17 | presença por `Select-String -Quiet` |
| Client secret parcialmente exposto na conversa (não usado pela integração) | **não renovar — decisão do usuário** (plano R-010) | 2026-10-17 | — |
| `.env.example` (versionado) com trechos truncados das credenciais | trocados por placeholders vazios, não commitado | 2026-10-17 | `git diff` só com nomes |

## T025 — credenciais na produção e checagem prévia (2026-10-17)

- Do `.env` da raiz para `infra/portal/production.env.yaml`, por script, sem exibir: token (`APP_USR`), segredo do
  webhook, `MERCHANT_ID` (do `GET /users/me` do próprio token) e `PIX_PAYER_DOMAIN=pagamentos.ccplaytv.com`. Só a
  presença de cada chave foi conferida (`Select-String -Quiet`).
- Publicado com a venda fechada: público `ccplaytv-portal-00003-qp4`, jobs `ccplaytv-portal-jobs-00003-fwg`.
- `preflight-mercadopago.ps1` → `{"owner_matches": true, "real_account": true, "pix_enabled": true, "webhook_rejects_unsigned": true}`, exit 0.
- Código da Fase 4 publicado (imagem `:081-us2`): público `00004-tpv`, jobs `00004-ngj`, smoke `passed`; venda ainda fechada.
- TV: pacote comercial com a tela nova de Pix instalado (substitui o de diagnóstico); conferido `prod1` presente, `v1` ausente.

## T026 — venda aberta (2026-10-17)

`CHECKOUT_ENABLED=true` (troca por regex, sem abrir o arquivo) → público `ccplaytv-portal-00005-lgj`, jobs `ccplaytv-portal-jobs-00005-8nw`; o serviço subiu com a matriz D-003 (produção + modo real + credenciais). Smoke no domínio `passed`, sem erros na revisão nova. Confirmação do `checkoutEnabled` na oferta: pela tela de Licença do portal (T027).
