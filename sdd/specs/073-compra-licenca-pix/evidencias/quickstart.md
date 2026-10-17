# Quickstart §3 — resultado (T033, 2026-10-15)

Navegador (Chromium headless, Playwright) com portal fictício ou pilha local real (API + emulador). Nada aqui usa o
Mercado Pago de verdade: passos que exigem pagamento real dependem da T030 (staging de teste, com confirmação).

| Passo | Verificação | Resultado |
| --- | --- | --- |
| 1. Teste vencido → bloqueio com Comprar licença focado | `e2e/compra-licenca-pix.mjs` (relógio adiantado 8 dias) | PASS |
| 2. Mover o foco não consulta | idem (contagem de requisições antes/depois das setas) + contrato `LicensePixScreen` | PASS |
| 3. SELECT → QR, copia-e-cola, R$ 35, 12 meses, ID, "Pix vence em 30 min" | idem | PASS |
| 4. RETURN volta com foco em Comprar; reabrir = mesmo Pix | idem (mesmo `requestId`, `renew: false`); serviço: `test_pix.py` (sem nova chamada ao provedor) | PASS |
| 5. Atualizar sem pagar → "Pagamento ainda não confirmado." | idem | PASS |
| 6. Pix pago (staging) → Atualizar → lista abre, +12 meses | Fixture aprovado no E2E (lista abre); conciliação real + calendário: `test_pix.py`/`test_licensing.py` | PASS com fixture; **pagamento real pendente (T030)** |
| 7. Pix vencido → "Este Pix venceu." → Gerar novo Pix | Contrato `LicensePixScreen` (3º teste); `test_pix.py` (`expired` sem criar; `renew` cria tentativa nova) | PASS |
| 8. Sem rede → "Sem conexão com o serviço." + Tentar novamente/Voltar, sem "recusa" | Contrato `LicensePixScreen`; legibilidade "Compra por Pix sem conexão" | PASS |
| 9. Portal & licença → Renovar licença → Pix → +12 meses | `PortalLicensePanel.test.tsx` (índice 7, rótulo, abridor); soma ao vencimento: testes de calendário da 069 | PASS (unitário); fluxo real pendente (T030) |
| 10. Portal: aba Comprar/Renovar, aviso de Pix pendente sem nova cobrança, cartão no mesmo pedido | `portal-web/e2e/licenca.spec.ts` (caso novo); `test_pix.py::test_portal_sees_pending_pix_without_code_and_no_new_charge` | PASS |
| 11. Pix + cartão no mesmo pedido → 24 meses, conciliação não trava | `test_pix.py::test_second_approved_payment_on_same_order_grants_once_more_and_refund_hits_only_it` | PASS (fake do provedor); real pendente (T030) |
| 12. Código no portal: orientação antes do Atualizar; igual ao da TV depois; rotação pede Atualizar | `licenca.spec.ts` (caso do código); `test_recovery_escrow.py`; `consulta-sob-demanda.mjs` (envio real no Atualizar) | PASS |
| 13. Recuperar após formatar com o código visto no portal | Fluxo de recuperação da 069 inalterado (`test_recovery.py`); o código revelado é o mesmo verificado por HMAC | PASS (componentes); ensaio ponta a ponta em laboratório pendente |

Itens cross-cutting (§5): segredos → `evidencias/segredos.md`; legibilidade → 96 telas, 0 achados; arquivos emitidos →
`npm run build:tizen` sincronizou sem arquivo novo; publicação → API antes do pacote (T030/T034).
