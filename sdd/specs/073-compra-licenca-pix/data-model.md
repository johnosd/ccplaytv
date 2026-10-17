# Data Model — 073

Só o que muda. Nomes em Python são os campos do modelo Pydantic (Firestore grava em camelCase, como o resto de
`api/app/portal/models.py`/`commercial_models.py`).

## Serviço (`api/app/portal/commercial_models.py`)

### `OrderDocument` (estendido)

| Campo novo | Tipo | Regra |
| --- | --- | --- |
| `pix_payment_id` | `OpaqueId \| None` | Pagamento Pix da tentativa **corrente**. Notificações de tentativas antigas não mudam o pedido (D-006). |
| `pix_qr_code` | `str \| None`, `max_length=1024`, `repr=False` | Copia-e-cola EMV (`000201…`). Só sai na rota da TV (`no-store`); nunca em log/erro/portal. Zerado quando o pedido sai de `created`/`pending`. |
| `pix_expires_at` | `AwareDatetime \| None` | Prazo do provedor (30 min). |
| `pix_attempt` | `int ≥ 0`, padrão 0 | Sobe a cada Pix gerado; compõe a chave de idempotência `sha256(orderId/attempt)`. |
| `parent_order_id` | `OpaqueId \| None` | Só em pedido derivado `surplus` (D-005): aponta o pedido cuja referência o provedor usou. |

O lease de geração reaproveita `checkout_lease`/`checkout_lease_until` (um lease por pedido, Pix ou preferência).

`order_view` (portal) **não** ganha o copia-e-cola. Nova `pix_view(order, device, now)` para a TV — ver
`contracts/portal-api-073.md`.

### Pedido derivado `surplus`

`OrderDocument` com `order_id = reference = "s" + sha256(parentOrderId + "/" + paymentId)[:42]`, `status =
"approved"`, `provider_payment_id = paymentId`, `parent_order_id = parentOrderId`, mesmo `device_id`. Ganha
`GrantDocument` próprio (`grants/{surplusId}`) e entra em `LicensingState.grant_order_ids`. Estorno desse pagamento
usa o mesmo `refund` (busca o pedido pelo `paymentClaims/{paymentId}.order_id`, não pela referência).

### `RecoveryEscrowDocument` (novo, `api/app/portal/models.py`)

Caminho `devices/{deviceId}/recoveryEscrow/current`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `code_version` | `Revision` | Igual a `device.recovery_code_version` no envio. |
| `code_hmac` | `Digest`, `repr=False` | HMAC do código; revelar só se `== device.recovery_code_hmac`. |
| `hash_key_version` | `str` | Versão da chave HMAC usada (como `DeviceDocument.recovery_hash_key_version`). |
| `envelope` | `CipherEnvelope` | `PortalCrypto.encrypt(code, CipherContext(deviceId, "recovery-code", str(version)))`. |
| `updated_at` | `AwareDatetime` | — |

Retenção (`api/app/portal/retention.py`): quando o registro do dispositivo é excluído/expurgado, o escrow vai junto;
cópia com `code_hmac` diferente do corrente pode ser apagada no próximo ciclo (nunca é mostrada de qualquer forma).

## TV (`tv-web/src/lib/portal/portalTables.ts`)

`PortalDeviceRecord` ganha `escrowedCodeVersion?: number` — versão do código já aceita pelo serviço. Sem índice novo,
portanto **sem** versão nova de schema Dexie. `persistCredentialIssuance` não precisa zerá-lo: a comparação
`escrowedCodeVersion !== recoveryCodeVersion` já força o reenvio depois de rotação/recuperação. Desvincular (072)
apaga o registro inteiro, junto.

Nada do Pix é persistido na TV: o serviço é quem reaproveita o pedido pendente.
