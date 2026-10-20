# Assessment Explora: Stripe como segundo provedor de pagamento para vendas internacionais

- **Slug**: stripe-como-segundo-provedor-pagamento-vendas
- **Criado**: 2026-10-17
- **Origem**: texto colado (pergunta do usuário na conversa) + pesquisa web

## Ideia Bruta

Adicionar o Stripe ao lado do Mercado Pago para vender a licença anual por TV fora do Brasil (EUA e Europa, em USD e EUR, cartão), porque o Mercado Pago limita a receita ao Brasil. O usuário vende como pessoa física (CPF) e ainda não sabe quem assume os impostos sobre vendas no exterior.

## Evidência a Favor

- Tecnicamente simples: o repositório já tem a abstração `PaymentProvider` ([base.py](../../../api/app/portal/providers/base.py)) e o modelo de pedido, reconciliação e concessão por consulta autenticada, que não depende do provedor.
- O Stripe Brasil aceita CPF (pessoa física), exige representante residente no Brasil e conta bancária em BRL na mesma titularidade ([Stripe: verificação no Brasil](https://support.stripe.com/questions/brazil-specific-account-verification-troubleshooting)).
- A lista oficial de negócios restritos do Stripe, nos trechos visíveis, não cita IPTV nem streaming ([lista do Stripe](https://stripe.com/us/restricted-businesses/)).
- Paddle e Lemon Squeezy são Merchants of Record: cuidam de VAT da UE e sales tax dos EUA e cobram 5% + US$ 0,50 por transação, sem mensalidade, segundo [comparação de terceiros](https://dodopayments.com/blogs/paddle-vs-lemon-squeezy/). Um deles (Lemon Squeezy) pertence ao Stripe, segundo a mesma fonte.
- Impostos, fatos gerais (fontes de consultoria, não oficiais):
  - **UE:** vendedor de fora da UE que vende serviço digital a consumidor não tem limite de isenção e usa o esquema Non-Union OSS (uma declaração trimestral), com a alíquota de cada país do cliente ([Taxually](https://support.taxually.com/support/solutions/articles/80001155457), [HelloTax](https://helpdesk.hellotax.com/hc/en-150/articles/49817186344209-Non-Union-OSS-for-Non-EU-Digital-Service-Providers)).
  - **EUA:** desde *South Dakota v. Wayfair* (2018) cada estado cobra imposto de vendedor remoto por presença econômica, inclusive estrangeiro. O limite mais comum é US$ 100 mil ou 200 transações em 12 meses, mas muitos estados abandonaram o teste de transações, e mais de 20 tributam SaaS ([BDO](https://www.bdo.com/getmedia/5a6021b9-93c8-49d0-a445-f3a5a04857cb/TECH_Wayfair-Sales-Tax_Insight_8-18_WEB-(2).pdf?ext=.pdf), [VATCalc](https://www.vatcalc.com/united-states/us-sales-tax-on-digital-services/)).
- ASSUMPTION: os EUA tendem a ficar abaixo dos limites no início. Na UE a obrigação existe desde o primeiro euro.

## Evidência Contra

- **Política de IPTV não confirmada.** A lista do Stripe diz não ser exaustiva. Uma análise de terceiros ([Conduct Atlas](https://conductatlas.com/platform/stripe/stripe-restricted-businesses-list/)) cita uma cláusula que proíbe serviços que facilitem violação de direitos autorais, mas não consegui confirmá-la na página do próprio Stripe. Como IPTV é um segmento onde processadores costumam agir com discricionariedade, o risco de revisão ou bloqueio de conta é real (ASSUMPTION), e vale também para os Merchants of Record.
- **Tarifas do Stripe Brasil conflitam entre fontes e nenhuma é oficial.** As fontes citam de 2,9% + R$ 0,30 até 4,4% + R$ 0,40 no doméstico, mais cerca de 1,5% a 2% por cartão internacional e cerca de 1% a 2% de conversão de moeda ([checkoutpage](https://checkoutpage.com/blog/stripe-international-fees), [Spendfigo](https://spendfigo.com/blog/building-a-saas-from-brazil-the-payment-infrastructure-problem-nobody-talks-abou)). Soma plausível de cerca de 7% a 9% mais o fixo, ainda sem confirmação.
- **Prazo de repasse incerto.** Uma fonte cita ciclo de 30 dias corridos no Brasil, outra de 2 a 7 dias úteis.
- **Ticket baixo pesa nas tarifas fixas.** Para uma licença na faixa de US$ 6 a 10 (ASSUMPTION, preço de tabela ainda não definido), os US$ 0,50 fixos dos Merchants of Record somam cerca de 10% a 11% no total. Isso fica na mesma ordem do custo estimado do Stripe Brasil com conversão, e o Merchant of Record já inclui os impostos. A comparação é estimativa, não confirmada.
- **Merchant of Record e Brasil não verificados:** nenhuma fonte tratou de repasse para pessoa física no Brasil nem de moeda de pagamento (PIX/BRL).
- **Nenhum dado de demanda externa** (instalações ou testes de 7 dias fora do Brasil) foi encontrado ou fornecido.
- **R-006 (spec 078):** a venda fora do Samsung Checkout pode ser reprovada na revisão do Seller Office, e isso vale em qualquer país e com qualquer gateway.
- Todas as fontes de impostos são de consultoria e fornecedores; nenhuma é fonte oficial (Comissão Europeia, estados americanos).

## Perguntas em Aberto

- Quais são a tarifa de cartão internacional e a de conversão **na tabela oficial** do Stripe Brasil? Qual o prazo de repasse?
- Uma conta Stripe de CPF pode cobrar em USD/EUR e liquidar em BRL? Há limite de volume?
- O Stripe e os Merchants of Record aceitam um player de IPTV sem conteúdo? Perguntar ao suporte descrevendo o produto com franqueza.
- Paddle ou Lemon Squeezy pagam pessoa física no Brasil? Em que moeda, com que verificação?
- Qual o preço de tabela em USD e EUR?
- Há demanda fora do Brasil? Isso é mensurável hoje com os dados da loja ou do portal?
- Um contador confirma que o CCPlayTV, como pessoa física, pode e deve recolher VAT por OSS, ou deve usar Merchant of Record?

## Adendo (2026-10-17): PayPal como alternativa ao Stripe

- **A favor:** cadastro de pessoa física com CPF, sem entidade jurídica; o comprador já costuma ter conta; o PayPal Brasil mantém o recebimento em BRL e faz a conversão de moeda ([Canaltech](https://canaltech.com.br/internet/como-receber-dinheiro-do-exterior-pelo-paypal/)).
- **Contra:**
  - O PayPal é processador de pagamento, não Merchant of Record. VAT e sales tax continuam com o vendedor, que informa as alíquotas e recolhe ([Dodo Payments](https://dodopayments.com/blogs/mor-vs-psp), fonte de concorrente, confirmar). Então ele **não resolve a pergunta bloqueante de impostos**.
  - Conversão de moeda de 3,50% acima da taxa de câmbio base, segundo a [página de tarifas do PayPal Brasil](https://www.paypal.com/br/webapps/mpp/useragreement-fees), sobre a tarifa de venda, que não consegui obter oficialmente. Tende a ser mais caro que o Stripe.
  - Histórico de corte de contas ligadas a streaming e a violação de direitos autorais, às vezes sem aviso e sem apelação ([TorrentFreak](https://torrentfreak.com/?p=85535), [Cord Cutters News](https://cordcuttersnews.com/paypal-moves-to-cut-off-vpn-smart-dns-services/?amp=1)). Os casos são antigos e não são de um player sem conteúdo; a política de bens que violam propriedade intelectual consta como vigente ([Conduct Atlas](https://conductatlas.com/platform/paypal/paypal-acceptable-use-policy/prohibition-on-ip-infringing-items/)). Risco de IPTV igual ou maior que o do Stripe (ASSUMPTION).
  - A integração (Orders API e webhooks, sempre confirmando o pagamento pela API do PayPal) tem o mesmo tamanho de um `StripeProvider`.
