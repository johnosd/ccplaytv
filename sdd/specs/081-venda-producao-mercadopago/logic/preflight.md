# Lógica: checagem prévia das credenciais reais (FR-004)

Arquivo: `api/app/portal/providers/mercadopago_preflight.py` (stub do sdd-plan). Contrato:
`test_preflight_reports_only_booleans_and_never_leaks_the_token`.

## Assinatura

```python
CHECKS = ("owner_matches", "real_account", "pix_enabled", "webhook_rejects_unsigned")

async def preflight(token: SecretStr, merchant_id: str, public_origin: str, *,
                    client: httpx.AsyncClient | None = None) -> dict[str, bool]
```

Devolve **sempre** as quatro chaves, cada uma `bool`. Nunca levanta exceção para falha de rede/HTTP/JSON:
qualquer falha numa checagem vira `False` só naquela checagem (as outras seguem).

## Passos

1. `GET https://api.mercadopago.com/users/me` com `Authorization: Bearer <token>`, sem seguir redirect, timeout 5 s.
   - `owner_matches = str(body["id"]) == merchant_id`
   - `real_account = "test_user" not in body.get("tags", [])` **e** `body.get("site_id") == "MLB"`.
2. `GET https://api.mercadopago.com/v1/payment_methods` (mesmo cabeçalho). A resposta é uma **lista** (o
   `MercadoPagoProvider._request` só aceita objeto, por isso não reaproveitar).
   - `pix_enabled = any(row.get("id") == "pix" and row.get("status", "active") == "active")`.
3. `POST <public_origin>/portal/v1/payments/mercadopago/webhook?data.id=1` com corpo
   `{"type": "payment", "data": {"id": "1"}}`, **sem** `Authorization` nem `x-signature`.
   - `webhook_rejects_unsigned = status == 401`. 503 (segredo ausente) também é `False`.

## Regras

- O token só vai para `api.mercadopago.com`. Nunca para a origem pública.
- Nada do corpo (id, nickname, e-mail) sai da função: só os booleanos.
- `client` injetado é usado e não fechado; sem ele, cria `httpx.AsyncClient(timeout=5, follow_redirects=False)` e fecha.
- Limite de leitura de 1 MiB por resposta, como no provider.

## CLI

`python -m app.portal.providers.mercadopago_preflight` lê **só** três variáveis do ambiente do processo
(`CCPLAY_PORTAL_MERCADOPAGO_ACCESS_TOKEN`, `CCPLAY_PORTAL_MERCADOPAGO_MERCHANT_ID`, `CCPLAY_PORTAL_PUBLIC_ORIGIN`),
não `PortalSettings()` (que exigiria as chaves privadas, inclusive o PEM multilinha), roda a checagem e imprime **só** `{"owner_matches": true, ...}` em JSON. Código de saída 0 só se tudo for `true`.
Erro de configuração imprime `{"code": "preflight_unavailable"}` (nunca a mensagem da exceção, que pode conter
valores). O wrapper `infra/portal/preflight-mercadopago.ps1` carrega no ambiente **do processo filho** apenas as
chaves `CCPLAY_PORTAL_*` de linha única do arquivo de ambiente privado (ignora o bloco PEM), sem imprimir nada.
