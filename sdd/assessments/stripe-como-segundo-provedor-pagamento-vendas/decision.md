# Assessment Decision: Stripe como segundo provedor de pagamento para vendas internacionais

- **Slug**: stripe-como-segundo-provedor-pagamento-vendas
- **Decidido**: 2026-10-17
- **Problem**: ./problem.md
- **Veredito**: needs-clarification

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | O Mercado Pago limita a venda ao Brasil e a intenção de distribuição é ampla (spec 078). Falta demanda externa medida; é uma suposição. |
| Força da evidência | weak | Evidência técnica boa (abstração `PaymentProvider` pronta). Evidência de negócio fraca: tarifas do Stripe não confirmadas em fonte oficial, política do Stripe para apps de IPTV não verificada, nenhum dado de demanda fora do Brasil. |
| Valor vs. custo de inação | adequate | Custo de inação é de oportunidade, não de prejuízo. Vale só se houver demanda externa. |
| Viabilidade / apetite | unknown | Integração técnica é média (segundo provedor, generalizar preço e moeda, webhook novo). **Impostos sobre venda no exterior: o usuário não sabe quem assume** — não dá para estimar a viabilidade sem isso. Conta como pessoa física (CPF) também não foi validada para vender em USD/EUR e receber em BRL. |
| Fit estratégico | adequate | Casa com a distribuição ampla e com a arquitetura (provedor plugável, ADR-013). Ressalva: ADR-013 cita o Mercado Pago e precisa de emenda. |

## Abordagens Candidatas

### 1. Stripe como segundo provedor, só para cartão em USD/EUR

- Implementar `StripeProvider` seguindo `PaymentProvider`; generalizar preço, moeda e identificação do comerciante por provedor; webhook com `Stripe-Signature`; o Brasil continua só no Mercado Pago.
- **Recomendada**: sim, **condicionada** às respostas abaixo. É a menor mudança que atende o objetivo e não regride o que funciona.

### 2. Merchant of Record (Paddle, Lemon Squeezy) para vendas internacionais

- O MoR vende em nome do CCPlayTV e cuida de VAT e sales tax. A tarifa é maior, mas remove o risco tributário de quem vende como pessoa física, que é o maior desconhecido hoje.
- **Recomendada**: não por padrão, mas **deve ser comparada** na fase de clarificação. Se a resposta sobre impostos for "não quero assumir", ela passa a ser a candidata principal. Também tem política própria para IPTV.

### 3. Não fazer agora (manter só Mercado Pago)

- Esperar sinal de demanda externa (instalações e testes de 7 dias fora do Brasil) antes de investir.
- **Recomendada**: não, mas é a alternativa honesta se as respostas abaixo forem desfavoráveis.

## Veredito

`needs-clarification`. O problema é válido e a abordagem 1 é tecnicamente simples, mas o scorecard tem um `weak` (evidência) e um `unknown` (viabilidade) em critérios centrais, então um `go` seria inflado. O ponto decisivo não é técnico: é quem recolhe imposto sobre a venda no exterior e se uma pessoa física consegue operar isso. Dependendo da resposta, o provedor certo pode até ser um Merchant of Record e não o Stripe.

### Se needs-clarification — Perguntas Bloqueantes

- **Impostos:** quem registra e recolhe VAT (UE, sem limite de isenção para vendedor de fora, via OSS — ASSUMPTION, confirmar com contador) e sales tax nos EUA? Isso é viável como pessoa física no Brasil? O Stripe Tax só calcula; o registro e o recolhimento continuam sendo seus.
- **Conta:** o Stripe Brasil aceita CPF, mas uma conta de pessoa física pode cobrar em USD/EUR e liquidar em BRL? Quais limites e conversão cambial? (confirmar com o suporte do Stripe)
- **Política do Stripe para IPTV:** um player de IPTV sem conteúdo é aceito, ou há risco de bloqueio de conta? A resposta vale também para Paddle/Lemon Squeezy.
- **Tarifas oficiais:** tarifa de cartão internacional e de conversão do Stripe versus um Merchant of Record, em ticket de aproximadamente US$ 7 a 10.
- **Preço de tabela:** valor em USD e EUR (hoje R$ 35). Sem isso não há como validar o servidor nem estimar a margem.
- **Demanda:** há sinal de instalação ou teste de 7 dias fora do Brasil? A loja Samsung hoje limita a primeira distribuição aos modelos e países comprovados (spec 078).

**Fase a revisitar**: explora (levantar evidência de tarifas, política de IPTV, tributação e demanda), depois define se o escopo mudar.

## Observação sobre o Pix

Fora do escopo desta avaliação: a elegibilidade e a tarifa de Pix no Stripe Brasil não foram confirmadas, mas deixam de ser relevantes, porque o Pix continua no Mercado Pago.
