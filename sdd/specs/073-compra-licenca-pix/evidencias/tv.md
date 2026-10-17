# TV física — 073 (T034, 2026-10-15/16)

TV de referência `192.168.0.2` (QN50Q60DAGXZD), perfil `ccplay_samsung_certificate_4`, instalada por cima (IndexedDB
preservado). Build comercial apontando para o staging (`portal.ccplaytv.com`), chave pública `v1`. Veredito de tela: **do
usuário**, pelo controle remoto.

## Rodada 1 — pacote sem configuração comercial

Sintoma relatado: "QR code não está aparecendo" e "Portal & licença: não funcionam os botões nem o de compra".
Causa: o `.wgt` instalado vinha de um `build:tizen` comum (`portal.ccplaytv.com` 0 vezes no bundle) — sem
`VITE_PORTAL_ORIGIN`, `getPortalConnection()` é `undefined` e todas as ações ficam soft-disabled. Refeito com
`build:tizen:commercial` (variáveis no mesmo processo); conferido no `.wgt`: origem presente, nenhum `"d":"`.

## Rodada 2 — pacote comercial (relato do usuário)

| # | Passo | Resultado |
| --- | --- | --- |
| 1 | Portal & licença: situação e site | OK — "Período de teste", site aparece |
| 2 | Gerar QR para o portal | OK — QR aparece |
| 3 | Comprar licença | Abre "A compra está indisponível no momento." (esperado: staging sem Pix, R-001) |
| 4 | Compra com cartão no portal + Atualizar | **Falhou** — ver achados |

Achados do passo 4 e causas (logs do Cloud Run, só método/status/caminho sem IDs):

1. **Depois de pagar, o portal voltou ao login.** A sessão do portal (CSRF) só existia em memória; o `back_url`
   `/?checkout=return` recarrega a página. Corrigido: sessão guardada no `sessionStorage` da aba (ID, CSRF, validade;
   o cookie `httpOnly` segue obrigatório), retomada só se `/session/device` confirmar a mesma TV; o retorno abre a aba
   de compra e limpa a query.
2. **Ao entrar de novo, nada dizia se a licença foi comprada.** Os webhooks do Mercado Pago seguem `401` (assinatura,
   pendência da 069/T036) e ninguém consultou o pedido (`GET /orders/<id>` não aconteceu depois do novo login): o
   pedido ficou pendente e a licença em teste. Corrigido: `/session/device` e o Atualizar da TV
   (`/device/entitlement/refresh`) conciliam sob demanda o pedido em aberto da TV (mesma consulta autenticada do
   `GET /orders/<id>`, intervalo de 10 s; provedor fora do ar não impede a resposta). Texto do portal pós-pagamento
   passa a dizer para apertar Atualizar na TV.
3. **Na TV não dava para saber se renovou.** O serviço assina um JWS novo a cada Atualizar, e a TV comparava o JWS
   cru: mostrava "Licença atualizada." mesmo continuando em teste. Corrigido: compara situação + validade; sem mudança
   mostra "A licença não mudou. Se acabou de pagar, aguarde um pouco e aperte Atualizar de novo." A linha "Validade
   até" já aparece (conferido no navegador em modo comercial).

Também observado: um `500` no primeiro Pix (02:36:04Z) coincidiu com o *cold start* de uma instância nova (o app ainda
não aceitava requisições); os seguintes foram `503` (indisponível, esperado). Não é falha do código.

## Rodada 3 — reteste após as correções (2026-10-16, usuário)

| # | Passo | Resultado |
| --- | --- | --- |
| 1 | Atualizar na TV (pagamento da rodada 2) | OK — licença ativa, "Validade até 15/10/2027" |
| 2 | Nova compra com cartão no portal | OK — voltou do Mercado Pago para a aba de compra (sem login) e somou +12 meses |

Não executado: QR do Pix lido do sofá (staging sem Pix, R-001) — risco aceito pelo usuário. Depois do reteste, staging
voltou a `CHECKOUT_ENABLED=false` (`ccplaytv-portal-00022-c55`, jobs `00021-4f6`; `/offer` → `checkoutEnabled: false`).

Testes: pytest Pix com o teste novo `test_tv_refresh_reconciles_open_card_order_without_webhook`; portal unit 8/8,
E2E 19/19 (novo: volta do Mercado Pago retoma a sessão); TV 3421/3421, tsc, lint.
