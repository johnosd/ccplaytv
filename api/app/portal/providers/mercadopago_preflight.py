"""081/FR-004: checagem prévia das credenciais reais do Mercado Pago, só com booleanos.

Algoritmo em `sdd/specs/081-venda-producao-mercadopago/logic/preflight.md`. Nenhum dado da conta sai daqui; o token
vai só para a API do Mercado Pago, nunca para a origem pública.
"""
import asyncio
import json
import os
import sys

import httpx
from pydantic import SecretStr

API_ORIGIN = "https://api.mercadopago.com"
WEBHOOK_PATH = "/portal/v1/payments/mercadopago/webhook"
CHECKS = ("owner_matches", "real_account", "pix_enabled", "webhook_rejects_unsigned")
MAX_BYTES = 1048576


async def _json(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    async with client.stream(method, url, timeout=5, follow_redirects=False, **kwargs) as response:
        if response.status_code < 200 or response.status_code >= 300:
            return response.status_code, None
        data = bytearray()
        async for chunk in response.aiter_bytes():
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                return response.status_code, None
        return response.status_code, json.loads(bytes(data))


async def _check(name: str, result: dict[str, bool], run) -> None:
    try:
        result[name] = bool(await run())
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
        result[name] = False


async def preflight(token: SecretStr, merchant_id: str, public_origin: str, *,
                    client: httpx.AsyncClient | None = None) -> dict[str, bool]:
    owned = client is None
    http = client or httpx.AsyncClient(timeout=5, follow_redirects=False)
    headers = {"authorization": "Bearer " + token.get_secret_value()}
    result = dict.fromkeys(CHECKS, False)
    try:
        async def account():
            _, body = await _json(http, "GET", API_ORIGIN + "/users/me", headers=headers)
            return body if isinstance(body, dict) else {}

        me = {}

        async def owner():
            nonlocal me
            me = await account()
            return str(me["id"]) == merchant_id

        async def real():
            tags = me.get("tags") or []
            return isinstance(tags, list) and "test_user" not in tags and me.get("site_id") == "MLB"

        async def pix():
            _, body = await _json(http, "GET", API_ORIGIN + "/v1/payment_methods", headers=headers)
            return isinstance(body, list) and any(
                isinstance(row, dict) and row.get("id") == "pix" and row.get("status", "active") == "active"
                for row in body)

        async def webhook():
            # Sem credencial nem assinatura: o serviço precisa recusar (401).
            status, _ = await _json(http, "POST", public_origin.rstrip("/") + WEBHOOK_PATH,
                                    params={"data.id": "1"}, json={"type": "payment", "data": {"id": "1"}})
            return status == 401

        await _check("owner_matches", result, owner)
        await _check("real_account", result, real)
        await _check("pix_enabled", result, pix)
        await _check("webhook_rejects_unsigned", result, webhook)
        return result
    finally:
        if owned:
            await http.aclose()


def main() -> int:
    try:
        token = os.environ["CCPLAY_PORTAL_MERCADOPAGO_ACCESS_TOKEN"]
        merchant_id = os.environ["CCPLAY_PORTAL_MERCADOPAGO_MERCHANT_ID"]
        origin = os.environ["CCPLAY_PORTAL_PUBLIC_ORIGIN"]
        if not token or not merchant_id or not origin.startswith("https://"):
            raise ValueError()
        result = asyncio.run(preflight(SecretStr(token), merchant_id, origin))
    except Exception:  # noqa: BLE001 - nunca imprimir a exceção, que pode conter valores
        print(json.dumps({"code": "preflight_unavailable"}))
        return 1
    print(json.dumps(result))
    return 0 if all(result.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
