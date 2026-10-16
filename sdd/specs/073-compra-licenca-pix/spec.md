# Feature Specification: Compra de licença por Pix na TV e renovação pelo portal

**Slug**: `073-compra-licenca-pix`

**Created**: 2026-10-15

**Status**: Implementada

**Input**: Eu como usuário do app quero poder comprar a licença através do site ou diretamente na TV usando Pix/Mercado Pago; após a compra minha TV deve receber a licença, e eu também posso consultar e guardar a licença para uma eventual inclusão caso a TV seja formatada. Fluxo TV: entro no app, vejo que a licença expirou/teste acabou, aparece o QR code para pagar via Pix, escaneio, pago e a TV recebe a nova licença anual. Fluxo portal: entro em https://portal.ccplaytv.com/ (ou pelo QR), acesso "Renovar licença", pago e minha TV recebe a licença.

## Contexto — o que já existe (069/070/071/072)

Esta feature **evolui** o licenciamento entregue pela `069-portal-tv-licenca-anual` (encerrada com riscos aceitos) e ajustado pela `071-consulta-sob-demanda-qr-fixo`. Já existem e **não** são refeitos aqui:

- Oferta R$35 / 12 meses / uma TV, renovação manual; renovação antecipada soma ao vencimento (069 FR-018).
- Checkout Mercado Pago no portal (aba **Ativar**) com Pix e cartão, ativação só por confirmação confiável do provedor (069 FR-022/FR-023).
- Tela de bloqueio na entrada da lista (`LicenseGate`) com QR fixo do portal, ID, chave, **Atualizar** (só licença) e **Voltar**; a liberação entra na lista negada (071).
- Teste local de 7 dias, licença assinada válida offline até vencer, guarda de entrada da lista (069 FR-017, 071).
- Código de recuperação exibido na TV (Configurações → Portal & licença) por ação explícita e recuperação pelo próprio site (069 FR-031).
- **Nenhuma consulta automática** ao serviço: só ação da pessoa (Atualizar, adicionar/editar/excluir lista) fala com ele (ADR-016, constitution 1.11.0).

O que muda: a TV passa a **gerar e mostrar um Pix pagável** direto no app do banco, a partir de um botão **Comprar licença**; o portal ganha a opção explícita **Renovar licença** e passa a mostrar o código de recuperação para guardar.

## Escopo

### Incluído

- Botão **Comprar licença** (ou **Renovar licença**, quando já há licença paga) na tela de bloqueio e em Configurações → Portal & licença, abrindo uma tela de pagamento Pix na TV.
- Tela de pagamento Pix na TV: QR Pix dinâmico de R$35 para aquela TV, código copia-e-cola, valor, validade de 12 meses, TV beneficiária, prazo do Pix, **Atualizar** e **Voltar**; linha orientando cartão pelo portal com o QR fixo já existente.
- Reuso do Pix pendente ainda válido (sem nova cobrança); Pix vencido oferece **Gerar novo Pix** por ação explícita.
- Recebimento da licença **somente pelo Atualizar** (ADR-016 inalterada): confirmado, a TV mostra a nova validade e, se a tela veio do bloqueio, entra na lista negada; se veio de Portal & licença, volta para lá com a nova validade.
- Portal: a aba **Ativar** vira **Renovar licença** (ou **Comprar licença** durante o teste/sem licença paga), sempre visível, com situação e validade atuais, mantendo o checkout Mercado Pago com Pix e cartão.
- Portal: exibição do **código de recuperação** e da validade da licença na sessão autenticada da TV, por ação explícita, com aviso para guardar em segurança e indicação da recuperação pelo site após formatar/reinstalar.
- Textos em pt/en/es; telas da TV seguindo V14 e navegáveis por setas/SELECT/RETURN.

### Fora de Escopo

- Ligar a venda real: os gates R-022–R-026 da 069 (replay/restore, chaves, compra sandbox/carga/custo, roteiro físico A–H) continuam lá; esta feature entrega fluxos validados em ambiente de pagamento de teste e na TV física.
- Consulta automática/polling do pagamento ou da licença (na tela de Pix ou em segundo plano), push, webhook até a TV. Alterar a ADR-016 nesse ponto.
- Cartão de crédito na TV; Pix copia-e-cola ou QR Pix próprio no portal (portal continua no checkout Mercado Pago).
- Mudança de preço, oferta, duração, cupons, renovação automática, várias TVs por licença, transferência entre TVs.
- Aviso proativo de vencimento próximo; e-mail/SMS com comprovante ou código.
- Novo mecanismo de recuperação: reinstalação usa a recuperação pelo site já existente (069 FR-031).
- Estorno/reembolso solicitado pelo app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pagar a licença com Pix direto na TV (Priority: P1)

Como usuário com teste ou licença vencidos, quero apertar **Comprar licença**, escanear o Pix na TV com o app do meu banco e, depois de pagar, apertar **Atualizar** e voltar a assistir — sem abrir o portal.

**Why this priority**: é o caminho mais curto do bloqueio à licença e o pedido central; sozinho já permite vender pela TV.

**Independent Test**: com TV de teste em teste vencido e provedor de pagamento em ambiente de teste, abrir a lista (bloqueio), comprar, simular o Pix aprovado, apertar Atualizar e conferir entrada na lista com nova validade. Não depende do portal.

**Acceptance Scenarios**:

1. **Given** a tela de bloqueio, **When** a pessoa foca **Comprar licença**, **Then** nada é consultado nem gerado; **When** aperta SELECT, **Then** abre a tela de pagamento com estado de carregamento focável e, em seguida, QR Pix, copia-e-cola, R$35, 12 meses, TV beneficiária (ID exibido) e prazo do Pix.
2. **Given** a tela de Pix aberta, **When** paga no banco e aperta **Atualizar** após a confirmação do provedor, **Then** a TV mostra "Licença ativa até DD/MM/AAAA" e entra na lista cuja entrada foi negada.
3. **Given** o Pix ainda não confirmado, **When** aperta **Atualizar**, **Then** vê "Pagamento ainda não confirmado" (ou pendente), continua na tela com o mesmo QR e nenhuma licença é concedida.
4. **Given** um Pix pendente ainda válido, **When** sai e abre a tela de novo, **Then** vê o mesmo Pix, sem nova cobrança.
5. **Given** o Pix vencido sem pagamento, **When** a tela é aberta ou atualizada, **Then** informa o vencimento e oferece **Gerar novo Pix**, que só cria outro por SELECT.
6. **Given** falha de rede ou do serviço ao gerar o Pix ou atualizar, **When** a tela mostra o erro, **Then** o erro é sanitizado, tem **Tentar novamente** e **Voltar** focáveis e não é apresentado como recusa do pagamento.
7. **Given** a tela de pagamento, **When** aperta RETURN ou **Voltar**, **Then** retorna à tela de origem com o foco em **Comprar licença**.

---

### User Story 2 - Renovar pelo portal e receber na TV (Priority: P2)

Como usuário, quero entrar no portal (pelo endereço ou pelo QR da TV), escolher **Renovar licença**, pagar com Pix ou cartão e depois apertar **Atualizar** na TV.

**Why this priority**: amplia o caminho que já existe (aba Ativar) com nome e visibilidade claros; cobre cartão.

**Independent Test**: com sessão de portal autenticada para uma TV de teste e pagamento de teste, abrir Renovar licença, concluir o checkout, apertar Atualizar na TV (bloqueio ou Portal & licença) e conferir a nova validade.

**Acceptance Scenarios**:

1. **Given** sessão autenticada no portal, **When** abre o menu, **Then** encontra **Renovar licença** (ou **Comprar licença** sem licença paga) com situação, validade atual, TV beneficiária, R$35/12 meses e "renovação manual" antes de pagar.
2. **Given** licença vigente, **When** renova e o pagamento é confirmado, **Then** o portal mostra o novo vencimento somando 12 meses ao atual; a TV o recebe ao apertar **Atualizar**.
3. **Given** um Pix pendente gerado pela TV, **When** abre Renovar licença no portal, **Then** o portal informa o pagamento pendente dessa TV e não inicia nova cobrança automaticamente.

---

### User Story 3 - Consultar e guardar a licença para reinstalação (Priority: P3)

Como usuário, quero ver no portal a validade da minha licença e o código de recuperação, para anotá-lo e recuperar a licença se a TV for formatada.

**Why this priority**: reduz o risco de perder a licença paga; o mecanismo de recuperação já existe, falta acesso conveniente ao código.

**Independent Test**: com sessão de portal de uma TV de teste com licença, pedir para mostrar o código, anotá-lo, simular reinstalação e recuperar pelo site com ele.

**Acceptance Scenarios**:

1. **Given** sessão autenticada no portal, **When** abre a área da licença, **Then** vê situação e validade, sem o código visível por padrão.
2. **Given** essa área, **When** escolhe **Mostrar código de recuperação**, **Then** vê o código atual com aviso de que é uma credencial privada, orientação para anotar/fotografar e o caminho de recuperação pelo site.
3. **Given** o código foi usado numa recuperação ou substituído, **When** o portal mostra o código, **Then** mostra só o atual; o antigo não aparece nem vale.

### Edge Cases

- Pix pago duas vezes (QR reaproveitado em dois bancos) ou Pix da TV e checkout do portal pagos em paralelo: cada pagamento confirmado soma 12 meses, sem dias perdidos ou duplicados por reenvio de confirmação (069 FR-018/FR-023).
- Pagamento confirmado depois de fechar a tela ou desligar a TV: a licença chega no próximo **Atualizar** (bloqueio, tela de Pix ou Portal & licença).
- Pix vencido pago tardiamente (o provedor recusa ou estorna): nenhuma licença é concedida; a tela informa e oferece novo Pix.
- TV ainda sem cadastro no serviço quando **Comprar licença** é apertado: o cadastro preguiçoso (071) ocorre nesse momento.
- TV offline: a tela não gera Pix e mostra erro de rede com ação focável; licença local vigente continua valendo.
- Revogação/estorno confirmado só chega no Atualizar (071 R-005, aceito).
- Comprar durante o teste: a licença paga começa conforme 069 FR-018 (a partir da confirmação, por não haver licença paga vigente); o teste restante não é somado. [Assumido, ver Assumptions.]
- Relógio da TV errado: prazo do Pix exibido vem do serviço, não do relógio local.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela de bloqueio e Configurações → Portal & licença DEVEM oferecer **Comprar licença** (rótulo **Renovar licença** quando houver licença paga) que abre a tela de pagamento Pix. Focar NÃO DEVE gerar Pix nem consultar o serviço.
- **FR-002**: Abrir a tela de pagamento DEVE, por essa ação da pessoa, obter do serviço um Pix de R$35 para a TV beneficiária, com preço definido pelo serviço e não alterável pelo cliente.
- **FR-003**: A tela DEVE exibir QR Pix pagável por app bancário, código copia-e-cola, valor, validade de 12 meses, renovação manual, ID exibido da TV, prazo do Pix (vindo do serviço) e orientação de cartão pelo portal com o QR fixo existente.
- **FR-004**: Enquanto houver Pix pendente válido para a TV, abrir a tela DEVE reapresentá-lo sem nova cobrança. Pix vencido DEVE ser informado e substituído só por **Gerar novo Pix** explícito.
- **FR-005**: A licença DEVE ser recebida somente por **Atualizar** (ADR-016). A tela de Pix DEVE oferecer **Atualizar**; não haverá consulta periódica.
- **FR-006**: Atualizar com pagamento confirmado DEVE ativar a licença uma única vez, mostrar a nova validade e, se a tela veio do bloqueio, entrar na lista negada; se veio de Portal & licença, voltar a ela com a nova validade.
- **FR-007**: Atualizar sem confirmação DEVE mostrar o estado real (pendente, vencido, recusado) sem conceder licença; falha de rede/serviço DEVE ser distinguida de recusa e nunca invalidar licença local vigente.
- **FR-008**: Ativação DEVE continuar exigindo confirmação confiável do provedor (069 FR-022/FR-023): QR exibido, Pix emitido ou retorno de tela não bastam; confirmações duplicadas não geram meses extras.
- **FR-009**: O portal DEVE oferecer **Renovar licença** (**Comprar licença** sem licença paga) sempre visível na sessão autenticada, substituindo o rótulo Ativar, mostrando situação, validade atual e oferta antes de pagar e mantendo Pix e cartão no checkout do provedor.
- **FR-010**: Com Pix pendente da TV, o portal DEVE informar a pendência e NÃO DEVE iniciar nova cobrança automaticamente.
- **FR-011**: O portal DEVE exibir o código de recuperação atual somente por ação explícita na sessão autenticada da TV, com aviso de credencial privada e orientação de recuperação pelo site; nunca em URL, log, erro, telemetria, comprovante ou resposta cacheável.
- **FR-012**: Código copia-e-cola, identificadores de pagamento e código de recuperação NÃO DEVEM aparecer em logs ou diagnósticos; credenciais IPTV NÃO DEVEM chegar ao provedor de pagamento.
- **FR-013**: Carregamento, erro, Pix vencido e confirmação DEVEM ter ação focável; RETURN volta à origem restaurando o foco em **Comprar licença**.
- **FR-014**: Telas da TV DEVEM seguir V14 Spectrum e tokens `--fs-*` (mínimo 20 px), com textos em pt/en/es e inclusão na auditoria de legibilidade; o QR DEVE ser legível por celular a distância típica de sofá.
- **FR-015**: Nada desta feature liga cobrança real; a venda continua condicionada aos gates R-022–R-026 da 069.

### Key Entities

- **Pedido Pix da TV**: TV beneficiária, valor R$35, prazo do Pix, estado (pendente, confirmado, vencido, recusado/cancelado), conteúdo do QR/copia-e-cola; reaproveitado enquanto pendente válido. Extensão do Pedido/pagamento da 069.
- **Licença**: situação, validade, origem da última concessão; já existente (069).
- **Código de recuperação**: credencial privada da TV, já existente (069), agora também exibível no portal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em ambiente de pagamento de teste, bloqueio → Comprar licença → Pix aprovado → Atualizar → entrada na lista é concluído só com setas/SELECT/RETURN, sem abrir o portal.
- **SC-002**: Pix pendente, recusado, vencido, pago tarde, pago duas vezes e confirmações duplicadas passam: nenhuma licença sem confirmação confiável, nenhum mês extra por duplicação, cada pagamento confirmado soma 12 meses.
- **SC-003**: Reabrir a tela com Pix pendente válido não cria nova cobrança em 100% dos casos testados.
- **SC-004**: Nenhuma requisição ao serviço ocorre por foco, abertura do app ou permanência na tela de Pix; só por SELECT em Comprar licença, Gerar novo Pix, Atualizar ou Tentar novamente.
- **SC-005**: Portal mostra Renovar/Comprar licença com validade e oferta; renovação antecipada soma 12 meses ao vencimento atual e chega à TV no Atualizar.
- **SC-006**: Código de recuperação exibido no portal recupera a licença após reinstalação pelo site; código e copia-e-cola não aparecem em URL, logs, diagnósticos ou respostas cacheáveis.
- **SC-007**: Telas novas passam a auditoria de legibilidade (pt/en/es, sem texto < 20 px ou cortado) e o QR Pix é lido por celular na TV física a partir do sofá.

## Assumptions

- Provedor de pagamento continua sendo o Mercado Pago, já integrado na 069; o modo de gerar o Pix dinâmico é decisão do `sdd-plan`.
- Prazo do Pix pendente é definido no plano (ordem de dezenas de minutos), exibido a partir do serviço.
- Compra durante o teste: a licença paga conta 12 meses desde a confirmação (069 FR-018); dias restantes do teste não são somados.
- O cadastro preguiçoso da TV (071) acontece ao apertar Comprar licença, se ainda não ocorreu.
- Revelar o código de recuperação no portal por ação explícita já era permitido (constitution 1.8.0); o que é novo é o serviço guardar uma cópia cifrada enviada pela TV — formalizado na constitution 1.13.0, exceção (i), aprovada em 2026-10-15.
- A tela de Pix na TV é uma "ação da pessoa" no sentido da ADR-016 (gerar Pix e Atualizar), sem emenda da ADR.

## Clarifications

### Sessão 2026-10-15

- Q: QR na tela de licença vencida: Pix direto ou portal? → A: Pix direto na TV; botão **Comprar licença** abre a tela de pagamento.
- Q: Como a TV recebe a licença? → A: Só o botão **Atualizar** (ADR-016 intacta).
- Q: O que é "consultar e guardar a licença"? → A: Código de recuperação também no portal, com validade, para reinstalação.
- Q: Inclui ligar a venda real? → A: Não; gates R-022–R-026 seguem na 069.
- Q: Onde fica Comprar licença na TV? → A: Bloqueio + Configurações → Portal & licença.
- Q: Reabrir a tela antes de pagar / Pix vencido? → A: Reusa o Pix válido; vencido oferece Gerar novo Pix explícito.
- Q: Portal "Renovar licença"? → A: Aba Ativar renomeada, sempre visível, Pix e cartão no checkout do provedor.
- Q: Meios de pagamento na TV? → A: Só Pix; cartão pelo portal (QR fixo existente).
- Q: Após o Atualizar confirmar? → A: Entra na lista direto (vinda do bloqueio); volta a Portal & licença com a nova validade.
- Q: Código de recuperação no portal? → A: Ação explícita + aviso; exige estender a exceção da constitution.
- Q (sdd-plan): como o portal mostra o código se o serviço só guarda HMAC? → A: serviço guarda cópia cifrada.
- Q (sdd-execute): aprova a constitution 1.13.0 (exceção (i))? → A: Aprovada.
- Q (sdd-execute): a cópia pode ser enviada pela TV no Atualizar? → A: Sim; logo após trocar o código, o portal pede Atualizar na TV.
- Q (sdd-execute): reabrir após o provedor cancelar o Pix vencido gera Pix novo sem "venceu"? → A: Aceito (refina US1/AC5: a mensagem vale com a tela aberta ou enquanto o pedido ainda está pendente).
- Q (sdd-execute): orientação de cartão na tela de Pix? → A: só texto com o site; o QR do portal fica no bloqueio (refina FR-003).
- Varredura das oito categorias feita; terminologia ("receber a licença" = Atualizar), integração (069/071/ADR-016) e conclusão (sandbox + TV física, venda desligada) resolvidas. Sem `[NEEDS CLARIFICATION]` restante; prazo do Pix e mecanismo de geração ficam para o plano.
