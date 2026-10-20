# Quickstart: 081 — Venda em produção com Mercado Pago

Verificação manual. A parte de nuvem, Mercado Pago e TV física só é feita ou autorizada pelo usuário na hora.
Nada aqui imprime segredo: **nunca abrir `infra/portal/*.env.yaml`** (R-002).

## 0. Pré-requisitos

- `gcloud` autenticado na conta dona do projeto novo e da verificação do domínio (Search Console).
- Conta Mercado Pago em CPF com Pix, banco, credenciais de produção e webhook produtivo (T001).
- `uv`, Node e `npm install` em `tv-web/` e `portal-web/`; emulador do Firestore para a suíte do portal.
- TV de referência na rede (skill `tizen-tv`).

## 1. Checagens automatizadas

```powershell
uv --directory api run pytest tests/portal/test_venda_producao_contract.py -q      # 3/3
cd tv-web; npx vitest run src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs   # 2/2
cd ..; powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 081-venda-producao-mercadopago
$env:PORTAL_TEST_FIRESTORE='1'; uv --directory api run pytest tests/portal -q; uv --directory api run ruff check .
cd tv-web; npm run test; npm run lint; npm run build
cd ../portal-web; npm run lint; npm run build
```

## 2. Produção com venda fechada (US1)

1. `GET https://portal.ccplaytv.com/health` → 200, servido pelo projeto novo (`gcloud run services describe`).
2. `GET https://portal.ccplaytv.com/portal/v1/license-keys` → só `kid=prod1`.
3. `smoke-staging.ps1`, `smoke-enrollment.ps1` e `smoke-sources.ps1` com `-BaseUrl https://portal.ccplaytv.com`.
4. TV com o pacote comercial novo:
   - pareia pelo QR;
   - mostra teste de 7 dias;
   - lista adicionada pelo portal chega no Atualizar;
   - "Comprar licença" mostra indisponível com Voltar focável.
5. Licença assinada pela chave da homologação: o build recusa a chave (contrato 5); a TV não a aceita por não ter o
   `kid` (US1/AC2).

## 3. Venda aberta (US2)

1. `infra/portal/preflight-mercadopago.ps1 -SourceEnv infra/portal/production.env.yaml` → quatro `true`.
2. `CHECKOUT_ENABLED=true` nos dois serviços; o portal mostra a oferta com vendedor "CCPlayTV",
   `ccplaytv@gmail.com` e reembolso em 7 dias (pt/en/es).
3. Cartão no portal: pedido `approved`; Atualizar na TV → licença de 12 meses; `pendingOrder` limpo.
4. Pix na TV: QR + copia-e-cola → pago → Atualizar → licença. Se recusado, FR-010: sem o domínio do pagador, a tela
   mostra QR/endereço do site, só com Voltar.
5. Estornar as duas no painel do Mercado Pago → Atualizar na TV → licença revogada; portal mostra "Pagamento
   estornado".

## 4. Operação (US3)

1. `manage-backup.ps1 -Action inspect -ProjectId <prod> -Apply` → `backup_current`.
2. Restore em `portal-restore-081-<data>` + replay + conciliação → pedidos estornados conferem; RTO anotado; base
   de ensaio apagada.
3. Políticas de alerta listadas (`gcloud alpha monitoring policies list --project <prod>`), canal de e-mail ativo.
4. Homologação: `gcloud scheduler jobs list`, `gcloud firestore backups schedules list`, `gcloud storage ls`
   vazios no projeto `ccplaytv-511322`; serviços com `CHECKOUT_ENABLED=false` e `PUBLIC_ORIGIN` no `run.app`.

## 5. Cross-cutting (constitution)

- Logs da produção sem corpo de webhook, token, copia-e-cola ou deviceId bruto (amostra do Cloud Logging no dia
  das compras).
- `git status` sem `*.env.yaml`; evidências só com booleanos, revisões, horários e IDs truncados.
- Foco: todo estado novo da TV (pix_disabled, vendedor/reembolso) com elemento focável e SELECT ativo.
