# Lógica — Pix na TV, recebimento pelo Atualizar e cópia do código de recuperação

Delimita o "como" onde um executor erraria barato demais. Decisões citadas (D-0xx) estão em `plan.md`.

## §1 Serviço: gerar/reaproveitar o Pix (`PaymentService.pix`, módulo novo `api/app/portal/pix_orders.py`)

```python
async def pix(principal, request_id, renew, now) -> PixView:
    if not checkout_enabled: raise AuthError("service_unavailable", 503)
    order = await commercial.reserve_order(principal, request_id, now)      # reaproveita pending_order_id
    if order.pix_payment_id and not renew:
        return pix_view(order, now)          # pending se faltam >= 60 s, senão "expired" — SEM provedor
    if order.status not in {"created", "pending"}:
        return pix_view(order, now)          # approved/refused/cancelled: a TV mostra; nunca gera em cima
    consume rate limit "orders/<deviceId>" (5/600 s)  # só aqui, quando o provedor vai ser chamado
    lease = transact(checkout_lease como em checkout(); se outro lease ativo -> 409 try_again)
    attempt = order.pix_attempt + 1
    charge = await provider.pix(order, attempt=attempt, expires_at=now + 30 min,
                                payer_email=synthetic_email(order.device_id))   # research §2
    # PaymentProviderError -> solta o lease e 503 (pedido e job continuam; repetir reaproveita)
    transact: se lease ainda é meu e status ainda created/pending ->
        status="pending", pix_payment_id=charge.payment_id, pix_qr_code=charge.qr_code,
        pix_expires_at=charge.expires_at, pix_attempt=attempt, reconcile_after=now, lease=None
        + job "order-<id>" (kind reconcile) se ainda não existe   # mesmo job da 069
    return pix_view(updated, now)
```

`refresh_pix(principal, order_id, now)`: lê o pedido (mesmo `read` de `read_order`, recusa outra TV), se
`reconcile_after <= now` chama `reconcile_order` engolindo `PaymentProviderError`, relê e devolve `pix_view`.

**Regra D-006 na conciliação** (`PaymentService.reconcile_payment`, ramo `else`): se `payment.status in {refused,
cancelled}` e o pedido tem `pix_payment_id` e `pix_payment_id != payment.payment_id`, é uma tentativa antiga: **não**
mexer no pedido nem em `pending_order_id`; só completar o evento. Pagamento da tentativa corrente cancelado/expirado
mantém o comportamento da 069 (pedido `cancelled`, `pending_order_id` limpo) — a próxima abertura cria pedido novo
com Pix novo (ver R-005).

`pix_view` nunca inclui `qr_code` fora de `pending`, e `pix_qr_code` é zerado (`None`) sempre que o pedido sai de
`created`/`pending` (em `approve`, `refund`, ramo `else`).

## §2 TV: cliente (`tv-web/src/lib/licensing/pixPurchase.ts`) — contrato `pixPurchase.*.contract.test.ts`

```ts
open({ renew }) -> device = await deps.device()
  requestId: um por "intenção": reaproveita o mesmo id enquanto renew=false e a última resposta não foi terminal;
             renew=true ou estado terminal gera outro (deps.newRequestId ?? token aleatório de 43 chars base64url)
  body = await deps.request('/portal/v1/device/orders/pix', { bearer, body: { renew, requestId }, signal })
  return parseCharge(body)
refresh(orderId) -> body = request('/portal/v1/device/orders/pix/refresh', { bearer, body: { orderId }, signal })
  charge = parseCharge(body)
  if charge.state !== 'approved' return { charge, licensed: false }
  outcome = await deps.refreshLicense()          // refreshPortal('license') — o mesmo Atualizar do bloqueio
  return { charge, licensed: outcome.ok }
parseCharge(value): qualquer desvio -> throw new PortalRequestError('service_unavailable') (nunca ecoa o corpo)
  orderId /^[A-Za-z0-9_-]{1,128}$/; state ∈ 5 estados; priceMinor === 3500; termMonths === 12
  qrCode (se presente) string ≤ 1024, começa por '000201', só [\x20-\x7E]; obrigatório em 'pending'
  expiresAt/serverTime ISO válidos -> Date.parse (ms); displayId opcional no formato MAC
```

Não logar `qrCode`, `orderId` nem o corpo; erros só `PortalRequestError.code`.

## §3 TV: tela (`tv-web/src/features/portal/LicensePixScreen.tsx`) — contrato `LicensePixScreen.*.contract.test.tsx`

`Modal` próprio (`ariaLabel = "Comprar licença com Pix"`). Monta → `purchase.open({ renew: false }, signal)` uma vez
(é a continuação do SELECT em "Comprar licença"). Nada mais consulta sozinho; o contador do prazo é só relógio local
de exibição (`setInterval` de 1 s sobre `expiresAt - serverTime` menos o tempo decorrido desde a resposta) e, ao
zerar, troca para o estado `expired` **sem requisição**.

| Estado | Conteúdo | Ações (ordem de foco) |
| --- | --- | --- |
| `loading` | "Gerando o Pix…" (`role="status"`) | Voltar |
| `pending` | QR (`FixedQr value={qrCode}`), texto do copia-e-cola visível (quebra de linha livre), "R$ 35,00 · 12 meses · uma TV · sem renovação automática", "TV: {displayId}", "Pix vence em {n} min", "Para pagar com cartão, use o site {site}." | **Atualizar**, Voltar |
| `pending` após Atualizar sem aprovação | + "Pagamento ainda não confirmado." | Atualizar, Voltar |
| `approved` sem licença (`licensed: false`) | "Pagamento confirmado. Aperte Atualizar para receber a licença." | Atualizar, Voltar |
| `expired` | "Este Pix venceu." | **Gerar novo Pix**, Voltar |
| `refused`/`cancelled` | "Este pagamento não foi concluído." | Gerar novo Pix, Voltar |
| erro de rede (`offline`/`network_error`) | "Sem conexão com o serviço." | **Tentar novamente**, Voltar |
| outro erro | "Não foi possível falar com o serviço agora." + "Código: {code}" | Tentar novamente, Voltar |
| venda desligada (`service_unavailable` no open) | "A compra está indisponível no momento." | Tentar novamente, Voltar |

Regras: erro **nunca** usa "recusado/recusa" (falha de rede ≠ recusa, FR-007). `Tentar novamente` repete o último
`open` com o mesmo `renew`. `Gerar novo Pix` = `open({ renew: true })`. `Atualizar` = `purchase.refresh(orderId)`;
sem pausa própria na tela (o serviço limita e a licença usa a pausa do agente), mas ignora SELECT enquanto
`loading`. `licensed: true` → mostra "Licença ativa até {data}" (lida do `licenseMonitor`) e chama `onLicensed()`
uma vez. RETURN/Voltar → `onBack()`. Setas só movem o foco. Textos via `useT()` em
`tv-web/src/lib/i18n/messages/portal.ts` (pt/en/es; strings pt acima são as do contrato). Tokens V14 apenas.

## §4 Cópia do código de recuperação

TV (`tv-web/src/lib/portal/recoveryEscrow.ts`) — contrato `recoveryEscrow.*.contract.test.ts`:

```ts
escrowRecoveryCode(db, transport, signal):
  device = portalTables(db).device.get('device'); if !device -> 'skipped'
  if device.escrowedCodeVersion === device.recoveryCodeVersion -> 'skipped'
  await transport.request('/portal/v1/device/recovery-code/escrow', { method: 'PUT', bearer: device.bearer,
        body: { recoveryCode: device.recoveryCode, recoveryCodeVersion: device.recoveryCodeVersion }, signal })
  // erro propaga sem marcar
  transação rw: relê o device; se ainda é o mesmo deviceId/recoveryCodeVersion -> escrowedCodeVersion = versão enviada
  return 'sent'
```

Agente (`portalAgent.ts`): porta opcional nova `escrowRecoveryCode?(signal)` executada como passo `escrow` **antes**
de `license` no escopo `license` e depois de `uploads` no escopo `lists`. Falha do passo **não** derruba o Atualizar
(captura, registra `onError('escrow_failed')`, segue), porque a licença é o que a pessoa pediu. Ligação em
`usePortalIntegration.tsx` com `getPortalConnection().client`.

Serviço: `PUT /device/recovery-code/escrow` e `POST /session/recovery-code` conforme `contracts/portal-api-073.md`,
módulo novo `api/app/portal/recovery_escrow.py` (classe `RecoveryEscrowService(auth, crypto, codes)`), rotas em
`api/app/portal/routes/licensing.py` ou arquivo novo `routes/recovery_escrow.py` registrado em `application.py`.

## §5 Pagamento excedente (`LicensingRepository.approve`)

Hoje: `order.provider_payment_id is not None and != payment_id` → `try_again` eterno. Novo:

```python
if order.provider_payment_id is not None and order.provider_payment_id != payment_id:
    return await self.approve_surplus(parent=order, payment_id, confirmed_at, provider_updated_at, now)

approve_surplus: surplus_id = "s" + sha256(parent.order_id + "/" + payment_id)[:42]
  paths: device, state, paymentClaims/{payment_id}, orders/{surplus_id}, grants/{surplus_id}, grants existentes
  claim existente para este payment_id -> devolve o pedido derivado (idempotente)
  senão cria OrderDocument(surplus, status approved, parent_order_id=parent.order_id, provider_payment_id),
        GrantDocument(starts/expires por schedule_grants), PaymentClaim, state.grant_order_ids += surplus_id,
        device.entitlement_generation + 1   — mesma transação, mesmo limite de 100 paths
```

`reconcile_payment` não muda o roteamento: continua achando o pai por `external_reference`; `refund` de um pagamento
excedente acha o pedido pelo `paymentClaims/{paymentId}.order_id` (ajustar `refund` para preferir o claim quando
existir). Nunca conceder sem lookup autenticado (FR-008).

## §6 Integração nas telas

- `LicenseGate.tsx`: ações `Comprar licença` (0, accent), `Atualizar` (1), `Voltar` (2). SELECT em Comprar →
  `setView('pix')`: o gate **desmonta seu Modal** e monta `LicensePixScreen` (um `Modal` ativo por vez — o segundo
  não renderiza). `onLicensed` = mesma retomada do `update()` atual (`waitUntilAllowed` → `onResume(denied)`);
  `onBack` = volta ao gate com foco em Comprar (0). Texto `portal.gate.steps` passa a citar "Comprar licença" e o site
  como alternativa (cartão). O QR fixo/ID/chave continuam no gate.
- `PortalLicensePanel.tsx`: ação nova `Comprar licença`/`Renovar licença` (rótulo `Renovar` se
  `license.state === 'active'`) **no índice 7**, `BACKUP_FIRST` passa a 8 (atualizar `PORTAL_ACTION_COUNT`,
  `PortalLicenseTab.tsx` e testes). O arquivo está em 152 linhas: se passar de ~250, extrair o bloco de ações para um
  hook.
- **Ratchet**: `features/settings` não importa `features/portal` hoje e um import feature→feature novo **falha** o
  `npm run lint`. Por isso o painel não monta a tela: chama `openPixPurchase({ onLicensed, onBack })` de um registro em
  `tv-web/src/lib/licensing/pixPurchaseRuntime.ts` (mesmo padrão de `registerPortalRefresh` em
  `lib/portal/portalRuntime.ts`). Quem registra o abridor e renderiza `LicensePixScreen` é
  `features/portal/usePortalIntegration.tsx` (já montado no App e já dono do `LicenseGate`). Os callbacks devolvem o
  foco ao índice 7 do painel; a validade nova aparece pelo `licenseMonitor`. A tela fica em `features/portal/` (o
  contrato importa `./LicensePixScreen`).
- Porta de produção: `createPixPurchase({ request: connection.client.request, device: () => connection.ensurePairing(),
  refreshLicense: () => refreshPortal('license') })`, criada uma vez em `usePortalIntegration.tsx` (memo por
  `connection`) e passada ao gate e à tela aberta pelo painel. Sem `connection` (portal não configurado) o botão
  aparece soft-disabled com `portal.unconfigured`.
- Portal web (`portal-web/src/App.tsx`, `features/LicensePage.tsx`, `lib/i18n/index.ts`): aba `activate` com rótulo
  "Renovar licença" (licença paga) / "Comprar licença" (teste/sem licença); `pendingOrder` de `/session/device` vira
  aviso "Há um Pix gerado pela TV aguardando pagamento até {hora}" sem iniciar cobrança; botão continua abrindo o
  checkout (mesmo pedido). Cartão `RecoveryCodeCard` (novo) na mesma aba: botão "Mostrar código de recuperação" →
  `POST /session/recovery-code`; mostra código + aviso de credencial privada + link "Recuperar após formatar"; esconde
  ao trocar de aba/`visibilitychange` hidden; `409 not_escrowed` → "Na TV, abra Configurações → Portal & licença e
  aperte Atualizar". Nada em `sessionStorage`/URL.
