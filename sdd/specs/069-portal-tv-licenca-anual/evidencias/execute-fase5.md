# Execute — fase5/US3

## Vermelho antes da implementação

`node.exe node_modules/vitest/vitest.mjs run src/lib/portal/portal-tv-licenca-anual.contract.test.ts`:C1–C4 PASS, C5 FAIL esperado `not implemented: evaluatePlaybackAccess` (15,69s). Trava intacta; A005 encerramento continua em T041. Sem editar contrato ou adicionar skip.

## T030

Contrato completo+playbackAccess.test.ts:7/7 PASS (15,54s), incluindo cinco contratos verdes. Decisão pura não usa rede nem apaga dados; rejeita assinatura/destino/período malformados, ausente/início futuro/revogação/vencimento. Assinatura/cache/guardas ainda serão implementados, logo isso não demonstra fluxo comercial completo. A005 continua aberto.

## T026

`pytest tests/portal/test_commercial_repository.py tests/portal/test_control_repository.py tests/portal/test_models.py -q`:10/10 PASS (9,49s), Ruff PASS. Reserva concorrente/diferentes IDs reutiliza um pendente; oferta3500BRL/12meses/destino imutáveis; aprovação repete sem segunda concessão, paymentClaim impede outro pedido, geração/ledger recalculados por confirmedAt/orderId. Fevereiro29 clampa para28. Callback sem rede/aleatoriedade/clock. Primeiras rodadas tiveram caminho de teste incorreto e falha de cleanup async_generator nas fixtures; corrigidos e repetidos, sem alterar asserts de produto. Provider/consulta autenticada e refund/journal ainda pendentes T027/T028; nenhuma venda.

## T027/T028/T029 em validação

Verificador/cache/clock/playback8/8 PASS (15,58s), tsc PASS. Assinatura ES256 real, schema/canonicalJSON, destino/kid/geração/adulteração, cache concorrente/restart e checkpoints com floor. Lifecycle/guarda App ainda pendentes, T029 aberta. Adaptador MP com MockTransport3/3 PASS; nenhuma chamada real. Trial/refund/commercial6/6 PASS (9,67s) após corrigir início elegível: registro sem trial usa createdAt original, nunca data de consulta. Journal indisponível conserva fence/grant e bloqueia emissão nova, retomada confirma antes de revogar; estorno preserva segunda compra/recalcula calendário. Rotas/worker/paymentService em checks, T027/T028 abertas.

## Emenda de comportamento: vencimento na entrada

A decisão posterior do usuário substitui o corte por vencimento descrito acima. Sessão já admitida continua até sair da lista/fechar app; próxima entrada é recusada. T031/T033/T035 revalidadas:26/26 direcionados e E2E licença1/1 PASS; consultar [vencimento-entrada.md](vencimento-entrada.md).

### Revalidação local posterior — 2026-10-12

Revalidação sem integração Mercado Pago: pagamentos/licenciamento/worker/decoder local **11 passed, 10 skipped**; licensing, portal contract e C5 **17/17 PASS**; trava de contratos **PASS**. Os skips são dependentes de serviços externos. T036 continua pendente somente na prova sandbox/real do pagamento.

### Tentativa Checkout Pro sandbox — 2026-10-12

O smoke de staging criou a oferta de `R$35,00` por 12 meses e retornou `checkoutEnabled=true`, sem imprimir segredos. O checkout abriu, mas a sessão estava autenticada como vendedor. Depois do CVV de teste e do clique em **Pagar**, o Mercado Pago mostrou erro informando que uma das partes era conta de teste incompatível. A documentação do provedor exige uma conta comprador separada; T036 permanece aberto para repetir com essa conta e validar webhook, reconciliação e concessão da licença.

### Compra sandbox com comprador separado — 2026-10-12

Com a conta comprador de teste separada, foram concluídas duas compras Checkout Pro de `R$35,00`: saldo de teste e cartão de teste. As duas respostas do Mercado Pago foram `approved`, com `BRL`, merchant esperado e `live_mode=true`; nenhum valor real foi cobrado.

O Scheduler OIDC executou o worker e o lookup autenticado conciliou as duas ordens. Evidência Firestore (campos selecionados, sem segredos): ambas `status=approved`, `providerPaymentId` preenchido, `confirmedAt` preenchido, grant `status=valid`, `pendingOrderId=null`, validade de 12 meses e geração/revisão incrementadas. O webhook recebeu notificações, mas todas as chamadas observadas retornaram `401` por assinatura não validada; por isso a confirmação é atribuída ao reconcile diário, não ao webhook.

Durante a homologação foi corrigido o retry que reutilizava `finalization_failed` como cursor de paginação. Revalidação local: `9 passed, 8 skipped` nos testes bootstrap/payments/worker. Revisões finais: público `ccplaytv-portal-00012-6x2`, jobs `ccplaytv-portal-jobs-00013-qtk`; smoke staging `200/200/401` PASS. O checkout foi desligado novamente após o teste. T036 continua parcial até webhook assinado e os cenários E2E restantes.

### Validação sintética da assinatura no staging — 2026-10-12

Uma notificação sintética foi assinada em memória com o segredo já carregado no Cloud Run e enviada à rota pública de webhook usando um pagamento aprovado existente. A resposta foi `HTTP 200` com `state=received`, sem expor segredo ou identificador do pagamento. Isso confirma a composição e verificação do manifesto HMAC (`data.id`, `x-request-id`, `ts`, `v1`) no serviço. O reenvio oficial do Mercado Pago segue pendente porque as notificações observadas retornaram `401` e o painel Webhooks apresentou erro 5xx durante a inspeção.

### Webhook oficial do Mercado Pago — 2026-10-12

O painel de teste do Mercado Pago enviou `payment.updated` para o endpoint staging e exibiu `200 - OK`. A confirmação independente no Cloud Logging encontrou duas requisições `POST` ao caminho do webhook com status 200. O corpo e os identificadores não foram registrados na evidência. Com isso, a assinatura oficial deixa de ser pendência de T036; continuam os cenários E2E de página fechada/offline, renovação, estorno, ativação completa e verificação de preço.

### Decisão de não repetir compra — 2026-10-12

O usuário autorizou pular uma nova compra sandbox. A evidência será composta pelas duas compras já aprovadas, pela concessão anual confirmada via reconciliação autenticada e pelo webhook oficial `payment.updated` aceito com `200 - OK`. Fica registrada a limitação de que não houve uma concessão nova atribuída exclusivamente a um webhook oficial após a compra; nenhum valor adicional será criado ou cobrado.

### Fechamento automatizado T036 — 2026-10-12

- `portal-web`: `npm.cmd run test:e2e` → **13/13 PASS** em 14,7s; inclui Checkout fake, retry/idempotência, retorno sem concessão, reload da pendência e venda desabilitada.
- `tv-web`: `node.exe e2e/run.mjs --only licenca-anual` → **1/1 PASS** em 25,9s; cobre trial, QR, ativação, página de compra fechada, offline, vencimento mantendo sessão/player, posição salva e bloqueio de nova entrada.
- Os cenários de renovação/estorno permanecem cobertos pelos testes comerciais/API já aprovados em T034; as compras sandbox existentes e o webhook oficial `payment.updated` completam a evidência externa sem nova cobrança.
