# Assessment Problem: Stripe como segundo provedor de pagamento para vendas internacionais

- **Slug**: stripe-como-segundo-provedor-pagamento-vendas
- **Criado**: 2026-10-17
- **Explora**: [./explora.md](./explora.md) (rodada em 2026-10-17, depois do Define)

## Problem Statement

A licença anual por TV (R$ 35, BRL) só pode ser comprada por quem paga com Mercado Pago (Checkout Pro e Pix), o que limita a receita ao Brasil. A plataforma não tem hoje nenhum caminho de pagamento para quem está em outro país, embora a intenção declarada seja distribuir a variante comercial de forma ampla na loja Samsung.

## Usuários / Partes Afetadas

- Pessoa que instala o CCPlayTV fora do Brasil (EUA e Europa primeiro) — hoje consegue usar o teste de 7 dias, mas não consegue comprar a licença.
- Responsável pelo produto — receita restrita ao Brasil e nenhuma validação de demanda externa.
- Serviço do portal (`api/app/portal/`) — o preço (3500) e a moeda (BRL) estão fixos em `payments.py` e `mercadopago.py`; webhook, assinatura, `merchant_id` e configurações são específicos do Mercado Pago.

## Goals

- Permitir comprar a licença anual por TV em USD e EUR, com cartão, a partir dos EUA e da Europa.
- Manter o Mercado Pago como caminho do Brasil (Pix e cartão em BRL), sem regressão.
- Manter os invariantes atuais: só confirmação autenticada ao provedor concede licença, a TV nunca fala com o gateway, segredos fora de logs e UI.
- Preço de tabela fixo por moeda (USD e EUR), validado no servidor.

## Non-Goals

- Trocar o Mercado Pago pelo Stripe.
- Assinatura recorrente (a licença continua anual avulsa).
- Samsung Checkout / compra dentro da TV (risco R-006 da spec 078 é independente do gateway).
- Preço por paridade regional ou conversão automática do BRL.
- Meios de pagamento locais (OXXO, PSE, SEPA) nesta etapa.
- América Latina hispânica e demais mercados fora de EUA e Europa.

## Success Metrics

- Uma compra de teste em modo de teste do Stripe em USD e outra em EUR concedem a licença pelo mesmo caminho de reconciliação do Mercado Pago.
- 0 concessões por redirect do navegador ou corpo de webhook (continua só consulta autenticada ao provedor).
- 100% dos testes de pagamento existentes do Mercado Pago continuam passando.
- Primeira venda real fora do Brasil dentro de 60 dias após liberar (ASSUMPTION: sem dado de demanda externa hoje).

## Cost of Inaction

A receita fica limitada ao Brasil e a distribuição ampla na loja Samsung gera usuários que não podem pagar. Não há prejuízo imediato nem dívida técnica crescente, porque o Mercado Pago atende o mercado atual; o custo é de oportunidade, e ele só existe se houver demanda fora do Brasil, algo que ainda não foi medido.
