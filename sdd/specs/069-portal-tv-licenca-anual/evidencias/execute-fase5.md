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
