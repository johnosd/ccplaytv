# Compras reais em produção — feature 081 (parcial)

- Data do relato: 2026-10-23. Ambiente: `ccplaytv-prod` (`portal.ccplaytv.com`, serviço `ccplaytv-portal`), TV de referência com o pacote comercial `c2e240c` (origem de produção, chave pública `prod1`).

## T027 — compra real por cartão (Checkout Pro) — **parcial**

- **Observado pelo usuário (relato):** 1 compra por **Mercado Pago, cartão**, uma só. Depois de atualizar a TV (Configurações → Portal & licença → Atualizar), a TV **recebeu a licença de 12 meses**.
  (Antes disso, o teste na TV tinha falhado por falta de espaço — bug `armazenamento-app-cheio-na-tv-impede`, corrigido; o pacote atual inclui a correção.)
- **Conferido nos logs de produção (somente leitura, sem corpo nem identificadores):** `POST /portal/v1/orders` com 202 entre 2026-10-17 22:02 e 2026-10-18 00:06 UTC (5 chamadas, entre elas as repetições idempotentes).
- **Webhook assinado — NÃO atendido:** todas as notificações do Mercado Pago recebidas em `POST /portal/v1/payments/mercadopago/webhook` nos últimos 14 dias retornaram **401**
  (≈ 20 registros entre 2026-10-18 e 2026-10-22, em rajadas — o Mercado Pago repete a entrega), inclusive as do agente `MercadoPago WebHook v1.0 payment`, que é a notificação assinada.
  Nenhum 200. O pedido foi aprovado e a licença chegou pela **consulta autenticada** (o webhook é redundância), mas a verificação da assinatura (`payment_signature.py`, HMAC com `data.id`, `x-request-id` e `ts`) está recusando as notificações reais.
  Hipótese mais provável: o segredo de assinatura do webhook em `production.env.yaml` não é o da aplicação de **produção** no painel do Mercado Pago (o código segue a documentação do provedor).
  As notificações `MercadoPago Feed v2.0 merchant_order|payment` (formato legado) não trazem a mesma assinatura e podem recusar 401 sem que isso seja o defeito.
- **Não verificado:** "pendingOrder limpo no portal" (o usuário não relatou).

## T028 — Pix real na TV — **não executado**

O usuário comprou só por cartão. O caminho `pix_disabled` (a TV mostra "pague com cartão no site" com QR) existe e é coberto por testes, mas o Pix real em produção não foi tentado (R-001).

## T029 — estorno — **não executado, por decisão**

A compra feita é a licença que o usuário vai usar; estornar revogaria a licença. A revogação por estorno segue sem prova real em produção.

## Correção e T028 — Pix real em produção (2026-10-23, depois do relato)

- **Pix real na TV: funcionou.** O usuário fez 1 compra por **Pix** na TV e a licença **ganhou mais 1 ano** (relato). Nos logs de produção (somente leitura): `POST /portal/v1/device/orders/pix` 200 às 20:51:28Z, depois `POST /portal/v1/device/orders/pix/refresh` 200 às 20:53:40Z.
- **Correção do que está escrito acima sobre o webhook:** o webhook assinado **funciona**. Hoje, nas mesmas janelas da compra, `MercadoPago WebHook v1.0 payment` (assinado) devolveu **200** (20:51:30Z e 20:53:35Z), e só o formato legado `MercadoPago Feed v2.0 payment` devolveu 401 — comportamento esperado, porque
  ele não traz a assinatura. Os 401 do `WebHook v1.0` vistos em 18–22/10 (por exemplo 2026-10-22 10:37Z) são anteriores e não foram investigados (provável segredo/configuração da época). Portanto o T027 passa também no item do webhook assinado, e a decisão de "aceitar o webhook como reforço" ficou sem efeito prático.
- **Efeito na decisão do Pix:** a decisão "lançar sem Pix real" fica **cancelada**: o Pix real foi provado em produção, então `CCPLAY_PORTAL_PIX_PAYER_DOMAIN` permanece e **nada será desligado**.
- **Estorno (T029):** continua dispensado; há agora duas compras reais (cartão e Pix) e a revogação por estorno segue sem prova. Se o usuário quiser provar a revogação, o candidato é estornar a compra Pix (a de teste), sabendo que o efeito na licença deve ser conferido com cuidado.

