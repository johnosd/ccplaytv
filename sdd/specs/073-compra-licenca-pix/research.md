# Research — 073 Compra de licença por Pix na TV

Incertezas técnicas que sobraram depois da exploração. Formato: Decisão / Justificativa / Alternativas.

## 1. Como gerar um Pix pagável na TV

- **Decisão**: criar um pagamento Pix pela API de pagamentos do Mercado Pago (`POST /v1/payments` com
  `payment_method_id: "pix"`, `transaction_amount: 35`, `external_reference = order.reference`,
  `notification_url` = webhook existente, `date_of_expiration` = agora + 30 min, cabeçalho
  `X-Idempotency-Key`). Da resposta só se guardam `id`, `status`, `date_of_expiration` e
  `point_of_interaction.transaction_data.qr_code` (copia-e-cola). `qr_code_base64` e `ticket_url` são descartados.
- **Justificativa**: é o mesmo provedor, a mesma conta, o mesmo webhook assinado e a mesma conciliação por
  `external_reference` da 069 (`PaymentService.reconcile_payment`/`reconcile_order`); a TV não precisa abrir checkout
  web. O QR é desenhado na TV com o `FixedQr` existente a partir do copia-e-cola (sem PNG do serviço, sem lib nova).
- **Alternativas**: (a) QR do Checkout Pro (`init_point`) — rejeitada pelo usuário: exige abrir página, não paga
  direto no app do banco; (b) PSP Pix próprio/BACEN direto — fora de escopo, novo provedor e homologação;
  (c) PNG `qr_code_base64` do provedor — maior, não cabe na rota de resposta curta e duplica o `FixedQr`.

## 2. E-mail do pagador exigido pelo Mercado Pago

- **Decisão**: `payer.email` sintético, não pessoal: `tv-<primeiros 16 hex de sha256(deviceId)>@<domínio
  configurado>` (setting nova `CCPLAY_PORTAL_PIX_PAYER_DOMAIN`, obrigatória quando Pix habilitado). Nenhum nome, CPF
  ou contato da pessoa. Validar no sandbox (T005/T030) que o provedor aceita; se recusar, parar e perguntar ao usuário
  (R-001) — não coletar e-mail na TV sem decisão.
- **Justificativa**: a 069 não coleta dado pessoal (FR-014/Assumptions) e a TV não tem teclado prático para e-mail.
- **Alternativas**: pedir e-mail na TV (atrito e dado pessoal novo); e-mail fixo único para todas as TVs (funciona,
  mas mistura pagadores no painel do provedor e atrapalha suporte; aceitável como plano B só com aprovação).

## 3. Reaproveitar Pix pendente sem cobrança dupla

- **Decisão**: o Pix pertence ao pedido pendente que `LicensingRepository.reserve_order` já reaproveita
  (`pending_order_id`). Reabrir com Pix ainda válido (≥ 60 s de folga, relógio do serviço) devolve o mesmo
  copia-e-cola; vencido devolve `expired` sem criar nada; `renew: true` cria uma nova tentativa no mesmo pedido
  (`pix_attempt + 1`, nova chave de idempotência). Ver `logic/pix-e-codigo.md` §1.
- **Justificativa**: pedido único por TV é o invariante de conciliação da 069; um Pix dinâmico só aceita um
  pagamento, então reaproveitar não abre brecha de pagamento duplo do mesmo QR.
- **Alternativas**: novo pedido por abertura (gera pedidos órfãos e cobra duas vezes se pagos em paralelo).

## 4. Dois pagamentos aprovados no mesmo pedido (Pix na TV + cartão no portal)

- **Decisão**: um segundo pagamento aprovado num pedido já aprovado por outro pagamento vira um **pedido derivado**
  (`surplus`, id determinístico por `payment_id`) que concede mais 12 meses pelo mesmo `schedule_grants`. Idempotente
  por `paymentClaims/{paymentId}`. Ver `logic/pix-e-codigo.md` §5.
- **Justificativa**: a spec (edge case, SC-002) exige que cada pagamento confirmado some 12 meses; hoje `approve`
  levanta `try_again` para sempre e o job de conciliação falha a cada 15 min — dinheiro recebido sem licença.
- **Alternativas**: bloquear o checkout do portal com Pix pendente (contraria FR-009: Pix e cartão no portal);
  estornar automaticamente (fora de escopo: estorno pelo app).

## 5. Onde fica a cópia do código de recuperação

- **Decisão**: a TV envia o código que já guarda (`PUT /device/recovery-code/escrow`, só corpo HTTPS) quando a versão
  enviada difere da atual, dentro de uma ação da pessoa (Atualizar de licença/listas). O serviço confere
  `RecoveryCodes.candidates(code)` contra `device.recovery_code_hmac` e a versão, e guarda `PortalCrypto.encrypt` com
  `CipherContext(deviceId, "recovery-code", str(version))` em `devices/{id}/recoveryEscrow/current`. O portal só
  revela se o HMAC guardado ainda é o corrente.
- **Justificativa**: o usuário escolheu "serviço guarda cópia cifrada". Fazer isso **no momento em que o serviço gera
  o código** exigiria mexer em quatro fluxos write-ahead (cadastro, rotação, recuperação pelo site, reassociação 072)
  e no replay de restore; pelo caminho da TV, um único ponto cobre TVs novas e antigas, e uma cópia velha nunca é
  mostrada (comparação por HMAC). Custo: logo depois de uma rotação, o portal pede "aperte Atualizar na TV" até a TV
  enviar a versão nova.
- **Alternativas**: gravar no ato da geração (mais pontos de falha transacional); portal gera código novo a cada
  consulta (rejeitada pelo usuário).
