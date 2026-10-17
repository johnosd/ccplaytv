# Contrato HTTP — 073 (`api/app/portal/routes/`)

Mesmas regras da 069/071: prefixo `/portal/v1`, rota fixa sem query, corpo JSON curto, erros só com `code`
sanitizado (`AuthError`), TV autentica por `Authorization: Bearer` com `origin: null` (`tv_principal`), navegador por
cookie de sessão + CSRF (`browser_principal(request, mutation=True)` nas mutações). Toda resposta abaixo que carrega
copia-e-cola ou código de recuperação leva `Cache-Control: no-store`.

## TV

### `POST /device/orders/pix`

Corpo: `{ "renew": boolean, "requestId": "<token 43>" }` (campos extras → 422).

1. `checkout_enabled` falso → `503 service_unavailable` (venda desligada, FR-015).
2. Limite: o mesmo `orders/<deviceId>` da 069 (5 / 10 min) — só quando um Pix **novo** é pedido ao provedor.
3. Reserva/reaproveita o pedido pendente (`reserve_order` com `requestId`).
4. Pix corrente válido (`pix_expires_at - now ≥ 60 s`) e `renew` falso → devolve sem chamar o provedor.
5. Pix corrente vencido e `renew` falso → devolve `state: "expired"` sem chamar o provedor.
6. Sem Pix, ou `renew` verdadeiro → `provider.pix(order, attempt+1)`; grava `pix_*`; devolve `pending`.

Resposta `200` (`PixView`):

```json
{ "orderId": "…", "state": "pending|expired|approved|refused|cancelled",
  "qrCode": "000201…",            // só em pending
  "expiresAt": "2026-10-15T12:30:00Z", // só com Pix
  "serverTime": "2026-10-15T12:00:00Z",
  "priceMinor": 3500, "termMonths": 12, "displayId": "A0:8C:FD:19:0A:8C" }
```

Mapeamento de `order.status`: `created`/`pending` → `pending` ou `expired` (pelo prazo); `approved` → `approved`;
`refused` → `refused`; `cancelled`/`refunded`/`charged_back` → `cancelled`.

Erros: `401` (bearer), `409 try_again` (lease/corrida), `422` (corpo), `429` (com `Retry-After`), `503`.

### `POST /device/orders/pix/refresh`

Corpo: `{ "orderId": "<OpaqueId>" }`. Pedido de outra TV → `401`. Se `order.reconcile_after ≤ now`, roda
`reconcile_order` (falha do provedor é engolida, como `read_order`); devolve o `PixView` atualizado. Limite próprio:
`pix-refresh/<deviceId>` 12 / 60 s. **Nunca** cria Pix nem concede licença por conta própria — a concessão continua
sendo `approve` depois de lookup autenticado.

### `PUT /device/recovery-code/escrow`

Corpo: `{ "recoveryCode": SecretStr (≤ 64), "recoveryCodeVersion": int ≥ 1 }`.
Confere `normalize_recovery_code`, `RecoveryCodes.candidates` contra `device.recovery_code_hmac` e
`recoveryCodeVersion == device.recovery_code_version`. Ok → grava `RecoveryEscrowDocument` e responde `204`.
Divergência → `409 conflict` (a TV não marca como enviado). Limite: `escrow/<deviceId>` 10 / h. O código nunca vai
para log, journal, erro ou resposta.

## Navegador (sessão do portal da mesma TV)

### `GET /session/device` (estendida)

Acrescenta `"pendingOrder": { "orderId": "…", "method": "pix" | "checkout", "expiresAt": "…" } | null` — Pix pendente
válido da TV (FR-010). Nunca o copia-e-cola.

### `POST /session/recovery-code`

Mutação (CSRF), corpo `{}`. Revela o código só se existe escrow com `code_hmac == device.recovery_code_hmac`:
`200 { "recoveryCode": "XXXX-…", "recoveryCodeVersion": 3 }` + `no-store`. Sem escrow ou escrow velho →
`409 { "code": "not_escrowed" }` (o portal orienta "na TV, abra Portal & licença e aperte Atualizar"). Limite:
`reveal/<deviceId>` 5 / 10 min, recusa `429`.

## Provedor (`api/app/portal/providers/`)

`PaymentProvider` ganha:

```python
async def pix(self, order: OrderDocument, *, attempt: int, expires_at: datetime, payer_email: str) -> PixCharge: ...

@dataclass(frozen=True, repr=False)
class PixCharge:
    payment_id: str
    qr_code: str          # validado: começa por "000201", ≤ 1024, só ASCII imprimível
    expires_at: datetime  # aware
```

`MercadoPagoProvider.pix` usa `_request("POST", "/v1/payments", body=…, headers={"X-Idempotency-Key": …})`
(`_request` ganha `headers` opcionais, sem nunca aceitar `authorization` de fora). `FakePaymentProvider.pix` devolve
copia-e-cola fictício determinístico e registra as chamadas (contagem para os testes de reaproveitamento).
