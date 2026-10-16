# Revisão de segredos — 073 (T032, 2026-10-15)

Escopo: copia-e-cola do Pix, ids de pagamento, código de recuperação (cópia cifrada) e sessão do painel.

| Item | Onde | Resultado |
| --- | --- | --- |
| Logs | `pix_orders.py`, `recovery_escrow.py`, `routes/recovery_escrow.py`, `routes/licensing.py`, `providers/*`, `auth.py`; TV `pixPurchase*.ts`, `recoveryEscrow.ts`, `LicensePixScreen.tsx`, `LicenseGate.tsx`; portal `RecoveryCodeCard.tsx`, `LicensePage.tsx` | Nenhum `console.*`, `logger`, `logging` ou `print` nesses arquivos. |
| `repr` | `OrderDocument.pix_qr_code` (`repr=False`), `PixCharge`/`CheckoutPreference` (`repr=False`), `RecoveryEscrowDocument.code_hmac`/`envelope` (`repr=False`), `EscrowInput.recoveryCode` (`SecretStr`) | Coberto em `test_pix.py` (copia-e-cola fora do `repr` do pedido) e `test_mercadopago.py` (sem PNG/ticket/token no `repr`). |
| Erros | API: só `AuthError.code`/`PaymentProviderError` sem corpo; TV: `parsePixCharge` → `PortalRequestError('service_unavailable')` sem ecoar; portal: `PortalApiError` por status | Contrato `pixPurchase.*` (resposta adulterada não ecoa); `test_pix.py` (503 sem copia-e-cola na mensagem). |
| Logs do serviço em teste | `caplog` em `test_pix.py` (rotas da TV) e `test_recovery_escrow.py` (put/reveal) | Copia-e-cola e código ausentes do log. `consulta-sob-demanda.mjs` confere os logs da API da pilha real. |
| URL / cache | Rotas fixas sem query; código só no corpo (`PUT /device/recovery-code/escrow`), revelação por `POST` com CSRF; respostas `Cache-Control: no-store` | `test_recovery_escrow.py` (GET não existe, `no-store`, CSRF obrigatório); `licenca.spec.ts` (código fora da URL; chamadas só `POST` com CSRF); contrato `recoveryEscrow.*` (código fora do path). |
| Storage do navegador | `RecoveryCodeCard` | Sem `sessionStorage`/`localStorage`/`history`; some em `visibilitychange`/`pagehide`. |
| Terceiros | Mercado Pago recebe valor, referência do pedido e e-mail sintético `tv-<hash>@domínio` | Sem dado pessoal, `deviceId` ou credencial IPTV (`test_mercadopago.py`, `test_pix.py`). |
| Backup operacional | Pedidos (com `pixQrCode` enquanto pendente) e `recoveryEscrow` entram no backup diário do Firestore | `pixQrCode` é apagado quando o pedido termina; `recoveryEscrow` é ciphertext (chave AES fora do banco, como as configurações — ADR-013). Risco aceito R-003. |

Conclusão: nenhum vazamento encontrado. Risco residual registrado: R-003 (quem tem a chave do dispositivo lê o código no painel), aceito pelo usuário e formalizado na constitution 1.13.0 (i).
