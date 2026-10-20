# Feature Specification: Venda em produção com Mercado Pago

**Slug**: `081-venda-producao-mercadopago`

**Created**: 2026-10-17

**Status**: Em Execução

**Input**: "avalie o que precisamos para habilitar pagamento do mercado pago em produção e crie um plano para implementarmos" — avaliação feita na sessão de 2026-10-17 e decisões do usuário registradas em `## Clarifications`.

## Contexto

A integração com o Mercado Pago existe e foi provada no sandbox (069: Checkout Pro, webhook assinado, conciliação, estorno; 073: Pix na TV, só com provedor fictício). A venda real está bloqueada por cinco motivos verificados no repositório:

1. A configuração do serviço do portal recusa abrir o checkout fora do ambiente de homologação ou em modo real (`checkout_not_released`).
2. Não existe ambiente de produção: `portal.ccplaytv.com` aponta para o serviço de homologação, com dados e chaves de homologação.
3. A chave de assinatura de licenças da homologação está comprometida (073 R-016, exposta de novo em 2026-10-17). Ela não pode ser confiável num pacote distribuído.
4. O Pix nunca passou pelo provedor real (073 R-001).
5. Os gates de venda da 069 (backup/restore com conciliação, TV física) estão abertos no backlog.

## Escopo

### Incluído

- Um ambiente de produção isolado: projeto de nuvem próprio, dados próprios, chaves próprias e o domínio `portal.ccplaytv.com`.
- Liberar a venda nesse ambiente com credenciais reais do Mercado Pago (conta pessoa física, CPF): cartão pelo Checkout Pro no portal e Pix na TV.
- Uma checagem prévia das credenciais reais que nunca exibe valores secretos.
- Pacote comercial da TV que confia **só** na chave pública de produção.
- Termos de venda, FAQ e tela de compra com a identificação do vendedor, o canal de contato e a política de reembolso de 7 dias.
- Homologação em produção com compras reais (cartão e Pix) e estorno das duas.
- Backup diário, ensaio de restore com conciliação de pagamentos, alertas operacionais e runbook de produção.
- Reduzir a homologação atual a custo zero depois da migração.
- Fechar os gates de venda da 069 e emendar a ADR-013.

### Fora de Escopo

- Botão de reembolso automático no portal (o estorno é manual, no painel do Mercado Pago).
- Segundo provedor ou venda internacional (Stripe/MoR: assessment próprio, `needs-clarification`).
- Mudança de preço, prazo, renovação automática ou assinatura recorrente (continua R$ 35 / 12 meses / uma TV / renovação manual).
- Medição de carga da 069/T043 (risco aceito para o piloto de 10–50 TVs).
- Migrar dados ou licenças da homologação para a produção.
- Samsung Checkout ou qualquer meio de pagamento da loja (078 R-006, risco aceito).
- Emissão de nota fiscal e obrigações tributárias (assunto do vendedor com o contador).
- Endereço físico e CPF do vendedor na página de venda (decisão do usuário; ver Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Produção isolada no ar, com venda fechada (Priority: P1)

O mantenedor publica o portal num ambiente de produção separado da homologação, com chaves novas e o domínio `portal.ccplaytv.com`. Uma TV com o pacote comercial novo pareia, usa o teste de 7 dias e gerencia listas pelo portal. A compra aparece honestamente como indisponível enquanto a venda não é liberada.

**Why this priority**: sem um ambiente separado e uma chave de assinatura não comprometida, nenhuma venda pode ser feita com segurança. Sozinha, esta story já tira a TV comercial da dependência da homologação, que tem chave exposta.

**Independent Test**: instalar o pacote comercial novo na TV, parear pelo QR, adicionar uma lista pelo portal, conferir a licença de teste e conferir que "Comprar licença" informa venda indisponível sem chamar o provedor.

**Acceptance Scenarios**:

1. **Given** a produção publicada com venda fechada, **When** uma TV nova abre "Adicionar lista", **Then** ela recebe ID e chave do serviço de produção e o portal em `portal.ccplaytv.com` aceita a entrada.
2. **Given** o pacote comercial novo, **When** a TV recebe uma licença assinada pela chave da homologação, **Then** ela recusa essa licença.
3. **Given** a produção com venda fechada, **When** a pessoa tenta comprar na TV ou no portal, **Then** vê o estado de compra indisponível, com um elemento focável, e nenhuma cobrança é criada.
4. **Given** uma configuração de produção incompleta ou de modo teste, **When** o serviço inicia com a venda ligada, **Then** ele se recusa a subir e informa só um código de erro, sem valores.

---

### User Story 2 - Venda real liberada e homologada (Priority: P2)

A pessoa compra a licença anual por R$ 35: por cartão no portal (Checkout Pro) ou por Pix na TV. A licença de 12 meses chega à TV no próximo Atualizar. Antes de pagar, ela vê quem vende, como pedir reembolso em até 7 dias e o e-mail de contato.

**Why this priority**: é o objetivo comercial, mas depende da P1.

**Independent Test**: o mantenedor faz uma compra real por cartão e outra por Pix na própria TV. Confere a ativação na TV e no portal, estorna as duas no painel do Mercado Pago e confere que a licença volta ao estado anterior.

**Acceptance Scenarios**:

1. **Given** a venda liberada, **When** a pessoa paga por cartão no Checkout Pro, **Then** o pedido fica aprovado só depois da consulta autenticada ao provedor e, no Atualizar, a TV mostra a licença ativa por 12 meses.
2. **Given** a venda liberada, **When** a pessoa paga o Pix mostrado na TV, **Then** no Atualizar da tela de Pix a TV recebe a licença ativa.
3. **Given** uma compra aprovada, **When** o mantenedor estorna no painel do Mercado Pago, **Then** o serviço revoga só a concessão daquela compra, e a TV deixa de ter essa licença no próximo Atualizar.
4. **Given** a tela de compra (TV e portal) e os termos, **When** a pessoa os abre, **Then** vê o nome do vendedor, o e-mail de contato e a regra de reembolso em 7 dias, em pt/en/es.
5. **Given** que o provedor real recusa o Pix com o pagador sintético, **When** isso é constatado na homologação, **Then** a venda abre só com o Checkout Pro, e a TV encaminha a compra para o portal em vez de mostrar Pix.

---

### User Story 3 - Operação segura e homologação a custo zero (Priority: P3)

O mantenedor tem backup diário da produção, um restore ensaiado que concilia pagamentos com o provedor e alertas de falhas de webhook, conciliação e backup. A homologação antiga fica sem custo recorrente.

**Why this priority**: protege as compras já feitas e o orçamento. Fecha os gates da 069 que o backlog exige antes de cobrar.

**Independent Test**: restaurar o backup da produção numa base isolada, rodar a conciliação contra o provedor e conferir que as compras reais (estornadas) aparecem no estado correto. Conferir que a homologação não tem cobrança recorrente no mês seguinte.

**Acceptance Scenarios**:

1. **Given** a produção com compras reais, **When** o restore é ensaiado numa base isolada, **Then** pedidos e concessões voltam conciliados com o provedor, sem ressuscitar licença estornada nem segredo excluído.
2. **Given** falhas repetidas no webhook ou na conciliação, **When** isso acontece, **Then** o mantenedor recebe um alerta; a idade do backup é conferida na checagem semanal do runbook.
3. **Given** a migração concluída, **When** a homologação é reduzida, **Then** não restam rotina agendada, backups nem bucket de journal, e os serviços ficam parados sem custo, podendo ser religados para testes de sandbox.

### Edge Cases

- Webhook de produção que não chega ou chega antes do pedido: o Atualizar da TV e o retorno do portal conciliam sob demanda (comportamento da 069/073).
- Pagamento aprovado em modo teste chegando à produção, ou de outro vendedor: recusado (o vendedor e o modo precisam bater).
- Credencial real sem Pix habilitado na conta: a checagem prévia aponta isso antes da abertura da venda.
- TV com o pacote comercial antigo (apontando para a homologação) depois da migração: deixa de achar o serviço. Só a TV do mantenedor tem esse pacote; reinstalar o novo resolve, e as listas locais ficam.
- Pix aberto na TV quando a venda é desligada: o pedido em aberto continua conciliável; não se cria Pix novo.
- Estorno parcial ou chargeback: tratado como estorno da concessão (regra existente).
- Troca futura da chave de assinatura de produção: precisa de pacote da TV com a pública nova antes de emitir licenças com ela (rotação documentada da 069).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O serviço DEVE aceitar venda ligada em produção somente com modo real ligado e com todas as credenciais do provedor presentes (token, vendedor, segredo do webhook). Faltando qualquer um, DEVE recusar iniciar com um código de erro sem valores. O domínio do pagador sintético só é exigido quando o Pix é oferecido; sem ele, o Pix fica desligado (FR-010).
- **FR-002**: O serviço DEVE recusar em produção qualquer opção exclusiva de teste: aceitar pagamento de teste em ambiente real, pagador de teste do Pix, ou checkout de sandbox.
- **FR-003**: A homologação DEVE continuar aceitando venda somente em modo de teste (regra atual preservada).
- **FR-004**: DEVE existir uma checagem prévia, executável pelo mantenedor, que confirma, sem exibir nenhum valor secreto, que: o dono da credencial é o vendedor configurado; a conta não é de teste; o Pix está habilitado; e o endereço de notificação de produção responde recusando chamada sem assinatura.
- **FR-005**: A produção DEVE usar projeto de nuvem, banco, journal, contas de serviço e chaves (cifragem, assinatura com identificador novo, HMACs, época de recuperação) próprios, nunca reaproveitados da homologação.
- **FR-006**: `portal.ccplaytv.com` DEVE passar a servir a produção. A troca segue a ordem documentada: domínio com TLS válido, depois origem pública nos serviços, depois pacote da TV.
- **FR-007**: O pacote comercial da TV DEVE confiar somente na chave pública de produção e DEVE recusar licenças assinadas pela chave da homologação.
- **FR-008**: A preferência de pagamento do Checkout Pro DEVE incluir os dados de qualidade que o Mercado Pago pede para produção (descrição na fatura, categoria e descrição do item), sem dados pessoais do comprador.
- **FR-009**: A tela de compra na TV, a aba Licença do portal, o FAQ e os termos DEVEM mostrar, em pt/en/es, o nome do vendedor, o e-mail de contato e a regra de reembolso em até 7 dias por esse e-mail.
- **FR-010**: Se a homologação constatar que o provedor real recusa o Pix com pagador sintético, a venda DEVE abrir só com o Checkout Pro, e a compra na TV DEVE levar a pessoa ao portal (QR/endereço) em vez de mostrar o Pix. **Emenda (2026-10-17, T018)**: com a venda aberta, falha momentânea ao gerar o Pix também DEVE oferecer o site (QR/endereço) como alternativa, além de Tentar novamente; só a venda fechada para todos mostra "indisponível" sem mandar ao site.
- **FR-011**: A produção DEVE ter backup diário com retenção de 7 dias e um restore ensaiado numa base isolada, incluindo a conciliação dos pagamentos com o provedor e a revalidação das concessões.
- **FR-012**: A produção DEVE alertar o mantenedor quando houver falhas repetidas de webhook ou de conciliação. A idade do backup DEVE ser conferida semanalmente pelo runbook (`manage-backup.ps1 -Action inspect`), sem alerta automático: o Firestore não emite sinal de falha do backup agendado (risco aceito, ver Clarifications). Os logs não podem conter corpo de webhook, tokens, copia-e-cola do Pix nem identificadores de dispositivo brutos.
- **FR-013**: A homologação DEVE ser reduzida depois da migração: sem rotina agendada, sem backups, sem bucket de journal e com a venda desligada. Os serviços ficam parados e podem ser religados.
- **FR-014**: A documentação DEVE registrar o runbook de produção (deploy, rollback, abertura e fechamento da venda, estorno manual, rotação de chaves), emendar a ADR-013 com o ambiente de produção e fechar os gates de venda da 069 com as evidências desta feature.

### Key Entities

- **Ambiente de produção**: projeto, serviços público e de jobs, banco, journal, chaves e origem pública próprios; tem o estado de venda (fechada/aberta).
- **Credencial de venda**: vendedor (identificador do recebedor), token de acesso real, segredo do webhook de produção. Nunca exibida.
- **Pedido / Concessão**: as entidades existentes da 069/073 (sem mudança de modelo).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma TV com o pacote comercial novo pareia e usa o teste de 7 dias contra a produção no roteiro da TV física, e licenças da homologação são recusadas por ela.
- **SC-002**: Duas compras reais de R$ 35 (cartão e Pix, ou só cartão na hipótese do FR-010) ativam 12 meses na TV pelo Atualizar. Depois de estornadas, as duas concessões são revogadas. Evidência registrada sem dados sensíveis.
- **SC-003**: Todas as combinações proibidas de configuração (FR-001–FR-003) são recusadas na partida, por testes automatizados.
- **SC-004**: O restore ensaiado reproduz o estado das compras reais (estornadas) conciliado com o provedor. Tempo de recuperação medido e registrado.
- **SC-005**: No mês seguinte à migração, a homologação não tem custo recorrente de backup, agendamento ou armazenamento de journal.
- **SC-006**: Nenhum valor secreto (token, segredo de webhook, chaves, copia-e-cola) aparece em logs, saídas de script, evidências ou commits durante a feature.

## Assumptions

- O mantenedor cria a conta Mercado Pago em CPF, verifica a identidade, cadastra a chave Pix e o banco de saque, ativa as credenciais de produção da aplicação e configura o webhook do modo produtivo. Essas ações são dele; a feature só as consome.
- Contato do vendedor: `ccplaytv@gmail.com`. Identificação mostrada: nome + e-mail, sem CPF nem endereço físico. **Risco aceito pelo usuário**: fica aquém do Decreto 7.962/2013, que pede CPF/CNPJ e endereço físico.
- O app ainda não está na loja Samsung. Por isso, abrir a venda logo após a homologação não expõe a venda a terceiros antes da publicação da 078.
- O pacote da 078 ainda vai ser reempacotado com a chave pública de produção antes de ser submetido.
- O piloto tem de 10 a 50 TVs. A medição de carga (069/T043) é risco aceito.
- Região e dimensionamento iguais aos da homologação (`us-central1`, min 0, max 2) e orçamento de referência R$ 10/mês na produção.
- As compras reais da homologação em produção são pagas e estornadas pelo próprio mantenedor. A tarifa do Mercado Pago pode não ser devolvida no estorno.

## Clarifications

### Sessão 2026-10-17

- Q: Produção no mesmo projeto da homologação ou num projeto separado? → A: Projeto GCP novo e separado; após a migração a homologação é reduzida para não gerar cobranças.
- Q: Conta Mercado Pago em CPF ou CNPJ? → A: CPF (pessoa física).
- Q: Quais gates da 069 continuam obrigatórios? → A: Backup diário + ensaio de restore com conciliação de pagamentos e roteiro na TV física com compra real. Carga (T043) vira risco aceito.
- Q: E se o Pix com pagador sintético for recusado em produção? → A: Lançar só com o Checkout Pro do portal (FR-010).
- Q: O que fazer com a homologação depois da migração? → A: Manter o mínimo, sem custo: apagar o agendamento, os backups e o bucket do journal; os serviços ficam em min 0, religáveis para sandbox (FR-013).
- Q: Como a pessoa pede reembolso (CDC, 7 dias)? → A: Pelo e-mail de suporte; estorno manual no painel do Mercado Pago, e o serviço revoga a licença sozinho (FR-009).
- Q: As duas compras reais da homologação são estornadas? → A: Sim, as duas (SC-002).
- Q: Qual e-mail de contato? → A: O e-mail da conta do projeto, `ccplaytv@gmail.com`.
- Q: Identificação do vendedor na venda online (Decreto 7.962)? → A: Só nome + e-mail; risco aceito pelo usuário (Assumptions).
- Q: (Analyze A1) O domínio do pagador do Pix é obrigatório em produção? → A: Só quando o Pix é oferecido; sem ele o Pix fica desligado e vale o FR-010 (FR-001 emendado).
- Q: (Analyze A2) O Firestore não emite log, métrica nem alerta do backup agendado (documentação oficial de backups e de audit logging, conferida em 2026-10-17). Como cumprir o alerta de backup > 24 h? → A: Aceitar o risco: checagem manual semanal no runbook, sem alerta automático; um backup velho pode passar até 7 dias sem ser notado (FR-012 e US3/AC2 emendados; plano R-006).
- Q: (execute, T018 na TV) "Comprar licença" só dizia "indisponível" e as pessoas desistiriam, mesmo podendo comprar no site. → A: Toda falha do Pix com a venda aberta oferece o site como alternativa; a venda fechada (manutenção/antes da abertura) continua sem mandar ao site, porque o site também não vende (FR-010 emendado; task T044).
- Q: (sdd-plan) Qual nome aparece como vendedor? → A: "CCPlayTV" (nome do produto), com `ccplaytv@gmail.com`. Difere do nome que o Mercado Pago mostra no recibo de uma conta em CPF; aceito pelo usuário.
