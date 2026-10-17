# Feature Specification: Portal na variante base da loja Samsung, sem licença

**Slug**: `080-portal-variante-base`

**Created**: 2026-10-17

**Status**: Cancelada

**Input**: Portal na variante base da loja Samsung: a versão base (sem licenciamento) passa a ter o portal funcionando (build de loja apontando para o portal de produção, sem o modo comercial). Para isso a TV informa sua variante (base|commercial) ao falar com o serviço do portal; o serviço guarda a variante do dispositivo e o site do portal esconde licença, preço, compra, estado de teste e qualquer cobrança para TVs da base, com recusa também no servidor. TV comercial continua como hoje. Inclui privacidade, ledger de privilégios, UI Description e o novo `.wgt` da 078 depois do deploy.

## Escopo

### Incluído

- A variante base distribuída na loja Samsung (feature 078, `release/samsung/distribution.json`) passa a ter **todos os recursos do portal, menos licença**: pareamento por QR/ID+chave, listas cadastradas pelo celular/computador, chave TMDB pelo portal (ADR-020), backup de uso (ADR-017), código de recuperação/Avançado (ADR-019) e Desvincular.
- A TV informa sua variante (`base` ou `commercial`) ao serviço nas conversas que já existem (pareamento e as ações da pessoa — ADR-016); o serviço guarda a variante de cada dispositivo.
- Para uma TV da base: o site do portal não mostra a aba Licença nem qualquer menção a preço, teste, validade ou compra (inclusive resumo da TV e perguntas frequentes); o serviço recusa criar teste, pedido ou pagamento; o pareamento não inicia o período de teste.
- Na TV da base, a aba de Ajustes se chama "Portal" (sem "licença"); no comercial segue "Portal & licença".
- Transições de variante e TVs antigas (sem variante registrada).
- Kit da loja coerente com a base com portal: política de privacidade (`bridge/privacidade`), ledger de privilégios (`release/samsung/privileges.json`), capturas e pptx da UI Description com o caso de uso do portal, build de loja apontando para o portal de produção.
- Deploy do serviço e do site em produção, executado pelo agente **com confirmação da pessoa antes de cada passo que muda produção**; o novo `.wgt` e as evidências da 078 (T048) só depois do deploy.

### Fora de Escopo

- Qualquer mudança no fluxo de licença/compra da variante comercial (preço, Pix, entitlement, teste) — continua exatamente como hoje.
- Distribuir a variante comercial na loja, voucher/licença de teste para o revisor (R-004 da 078) e Samsung Checkout.
- Mudar como a TV obtém identidade (ADR-014/015) ou o que o portal faz com listas, TMDB, backup e recuperação.
- Novos recursos do portal; consultas automáticas ao serviço (ADR-016 continua: só a ação da pessoa fala com o serviço).
- Itens desativados de Ajustes não ligados ao portal (Integrations: "AI assistant", "Weather"; Accessibility) — risco anotado na 078, decisão separada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar o portal na versão da loja, sem licença à vista (Priority: P1)

Quem instala o CCPlayTV da loja (variante base) abre Ajustes › Portal, lê o QR com o celular e cadastra listas pelo site; volta à TV, aperta Atualizar e a lista aparece. Em nenhum momento, nem na TV nem no site, vê preço, período de teste, validade ou botão de compra.

**Why this priority**: É o motivo da feature — a versão da loja ganha o portal, que funciona, sem oferecer uma licença que essa versão não usa (R-006 da 078).

**Independent Test**: Com um build base apontando para um serviço de teste: parear a TV, cadastrar uma lista pelo site, Atualizar na TV e ver a lista; conferir que o site só tem Listas e Ajustes e que nenhuma tela da TV ou do site cita licença, teste ou preço.

**Acceptance Scenarios**:

1. **Given** a TV com o build base de loja e o portal de produção configurado, **When** a pessoa abre Ajustes, **Then** existe a aba "Portal" com QR, ID e chave do dispositivo e não existe cartão de licença.
2. **Given** a TV da base pareada, **When** a pessoa abre o site do portal, **Then** a navegação mostra só Listas e Ajustes, sem aba Licença, e o resumo da TV não mostra estado de teste, validade nem preço.
3. **Given** a TV da base pareada, **When** a pessoa cadastra uma lista pelo site e aperta Atualizar na TV, **Then** a lista chega à TV como no comercial.
4. **Given** a TV da base pareada, **When** a pessoa usa TMDB pelo portal, backup de uso, código de recuperação ou Desvincular, **Then** cada um funciona como no comercial.
5. **Given** a variante comercial, **When** a pessoa usa a TV e o site, **Then** tudo aparece e funciona como hoje (aba "Portal & licença", aba Licença no site, teste, compra).

---

### User Story 2 - O serviço não cobra nem conta teste para a base (Priority: P1)

Mesmo que alguém chame o serviço diretamente (fora do site), uma TV registrada como base não consegue iniciar teste, criar pedido nem pagar; e parear uma TV da base não inicia o relógio do teste.

**Why this priority**: Esconder no site não basta: cobrar por uma licença que a base nunca confere seria cobrar por nada. O servidor é a garantia.

**Independent Test**: Contra o serviço de teste, com uma TV registrada como base: pedir teste, criar pedido Pix e pedido do site → todos recusados com motivo explícito; o registro do dispositivo não tem início de teste. Com uma TV comercial, as mesmas chamadas funcionam como hoje.

**Acceptance Scenarios**:

1. **Given** uma TV que se registra como base, **When** o pareamento termina, **Then** o dispositivo fica sem período de teste iniciado.
2. **Given** uma TV registrada como base, **When** qualquer chamada tenta iniciar teste, criar pedido ou pagamento para ela, **Then** o serviço recusa sem criar cobrança e sem alterar o registro.
3. **Given** uma TV comercial, **When** pareia e compra, **Then** teste e compra se comportam exatamente como hoje.

---

### User Story 3 - Trocar de variante e TVs antigas (Priority: P2)

A mesma TV pode ter a base e depois instalar o comercial (ou o contrário). A variante que vale é a última que a TV informou. TVs pareadas antes desta mudança, sem variante registrada, continuam tratadas como comerciais até a TV informar.

**Why this priority**: Evita que a primeira TV comercial de quem veio da base chegue com o teste já vencido, e que TVs existentes mudem de comportamento sem motivo.

**Independent Test**: No serviço de teste: parear como base, depois falar como comercial → a variante passa a comercial e o teste começa nesse momento (não antes); voltar a falar como base → licença some do site, mas uma licença já paga continua guardada e reaparece se a TV voltar ao comercial. Um dispositivo antigo sem variante → site e serviço o tratam como comercial.

**Acceptance Scenarios**:

1. **Given** uma TV da base pareada há 30 dias, **When** ela instala o comercial e fala com o serviço, **Then** a variante vira comercial e o período de teste começa nesse primeiro contato comercial.
2. **Given** uma TV comercial com licença paga, **When** passa a se informar como base, **Then** o site deixa de mostrar licença e a licença paga continua registrada; **When** volta ao comercial, **Then** a licença reaparece válida.
3. **Given** um dispositivo pareado antes desta feature, sem variante, **When** a pessoa abre o site, **Then** vê o comportamento comercial de hoje até a TV informar a variante.

---

### User Story 4 - Kit da loja coerente com a base com portal (Priority: P2)

O pacote enviado à Samsung descreve o que a base realmente faz: a política de privacidade diz que a base fala com o portal (só por ação da pessoa) e o que envia; o ledger de privilégios registra o uso do portal na base; a UI Description mostra o portal (caso de uso e tela); o build de loja aponta para o portal de produção. O serviço e o site vão a produção antes do novo `.wgt`, que então segue a T048 da 078.

**Why this priority**: Sem isso a submissão afirma uma coisa e o app faz outra — reprovação ou descumprimento da própria política. Depende da US1/US2.

**Independent Test**: Gate da 078 sobre o novo `.wgt` base: privacidade publicada descreve o portal na base; ledger, kit e UI Description conferidos; build de loja com o endereço do portal de produção; evidências refeitas para o novo hash.

**Acceptance Scenarios**:

1. **Given** a página de privacidade publicada, **When** alguém a lê, **Then** ela diz que a versão da loja usa o portal só por ação da pessoa, o que é enviado e onde fica — sem tratar o portal como "versão futura".
2. **Given** o build de loja da base, **When** é gerado, **Then** aponta para o portal de produção e continua sem o modo comercial (sem licença na TV).
3. **Given** o pptx da UI Description, **When** é regerado, **Then** tem a aba "Portal" da TV e um caso de uso de cadastro pelo celular, sem licença.
4. **Given** o serviço e o site novos, **When** vão a produção, **Then** cada passo que muda produção é confirmado pela pessoa antes, e o novo `.wgt` só é gerado depois.

---

### Edge Cases

- TV da base com o serviço fora do ar: as ações do portal mostram o erro de hoje; listas manuais continuam funcionando.
- Site aberto numa sessão que mudou de variante enquanto estava aberto: na próxima leitura da TV o site passa a refletir a variante nova; uma compra em andamento para uma TV que virou base é recusada pelo serviço.
- Pedido Pix pendente criado quando a TV era comercial e a TV passa a base: não é cobrado de novo nem exibido; se já foi pago, a licença fica registrada (US3/AC2).
- Uma TV informando uma variante desconhecida: tratada como erro de entrada, sem alterar o registro.
- Build base **sem** endereço do portal (ex.: build pessoal): continua a regra da 078 (`portalSurfacesVisible`) — portal escondido.
- TV da base que nunca pareia: nada muda para ela; nenhuma chamada nova ao serviço.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A TV DEVE informar sua variante (`base` ou `commercial`) ao serviço no pareamento e nas chamadas que já faz por ação da pessoa; NÃO DEVE existir chamada nova automática para isso (ADR-016).
- **FR-002**: O serviço DEVE guardar a variante de cada dispositivo, valendo a última informada; um valor fora de `base|commercial` DEVE ser recusado sem alterar o registro.
- **FR-003**: Dispositivo sem variante registrada DEVE ser tratado como `commercial`.
- **FR-004**: Parear uma TV `base` NÃO DEVE iniciar o período de teste; o teste de uma TV DEVE começar no seu primeiro contato como `commercial` (regra de âncora de hoje, ADR-016, aplicada a partir desse contato).
- **FR-005**: Para dispositivo `base`, o serviço DEVE recusar iniciar teste, criar pedido (site ou Pix) e registrar pagamento novo, com motivo explícito e sem efeito colateral.
- **FR-006**: Para dispositivo `base`, o serviço NÃO DEVE devolver ao site oferta, preço, estado de teste nem validade de licença; uma licença já paga DEVE continuar registrada e voltar a valer se a TV passar a `commercial`.
- **FR-007**: Para dispositivo `base`, o site DEVE omitir a aba Licença e toda menção a licença, teste, validade, preço e compra (navegação, resumo da TV, avisos e perguntas frequentes), nos três idiomas.
- **FR-008**: Para dispositivo `commercial`, serviço, site e TV DEVEM se comportar exatamente como antes desta feature.
- **FR-009**: Na TV da base, a aba de Ajustes do portal DEVE se chamar "Portal" (pt/en/es equivalentes) e não mostrar licença; no comercial DEVE seguir "Portal & licença".
- **FR-010**: Na TV da base com portal configurado, DEVEM funcionar pareamento, listas pelo site, TMDB pelo portal, backup de uso, código de recuperação/Avançado e Desvincular, como no comercial.
- **FR-011**: O build de loja da base DEVE apontar para o portal de produção sem ativar o modo comercial; um build sem endereço do portal DEVE seguir escondendo o portal (078, R-014).
- **FR-012**: A política de privacidade publicada DEVE descrever o uso do portal pela versão da loja: só por ação da pessoa, o que é enviado (identificador da TV, listas com credenciais cifradas, backup cifrado, chave TMDB quando a pessoa usa) e onde fica, sem tratar o portal como versão futura; o comercial continua descrito com licença.
- **FR-013**: O ledger de privilégios DEVE registrar o uso do portal na variante base.
- **FR-014**: As capturas e o pptx da UI Description DEVEM ser regerados com a aba "Portal" e um caso de uso de cadastro pelo celular, sem licença.
- **FR-015**: Mudanças em produção (serviço e site) DEVEM ser executadas só com confirmação explícita da pessoa antes de cada passo, e antes do novo `.wgt` da 078.
- **FR-016**: Credenciais, chaves e valores do serviço NÃO DEVEM aparecer em log, erro, UI, commit ou kit (constituição).

### Key Entities *(include if feature involves data)*

- **Variante do dispositivo**: `base` ou `commercial`, por dispositivo do portal; a última informada pela TV; ausente = `commercial`. Decide o que o serviço e o site oferecem de licença.
- **Período de teste**: já existe; passa a começar no primeiro contato comercial, não no pareamento de uma TV base.
- **Licença paga**: já existe; não é apagada por troca de variante, só deixa de ser exibida para a base.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa TV da base pareada, 0 ocorrências de preço, teste, validade ou compra em todas as telas da TV e do site, nos três idiomas.
- **SC-002**: 100% das tentativas de iniciar teste, criar pedido ou pagamento para dispositivo `base` são recusadas pelo serviço, sem registro de cobrança.
- **SC-003**: Pareamento, lista pelo site até a TV, TMDB pelo portal, backup, recuperação e Desvincular passam na TV da base com o mesmo resultado do comercial.
- **SC-004**: Os testes existentes de licença/compra do comercial continuam verdes sem alteração de comportamento.
- **SC-005**: Uma TV que passa de base para comercial tem o teste começando no primeiro contato comercial (não antes); uma licença paga sobrevive a ida e volta de variante.
- **SC-006**: O gate da 078 sobre o novo `.wgt` base não tem bloqueio de privacidade, ledger ou UI Description, e o build aponta para o portal de produção.

## Assumptions

- O portal de produção é `https://portal.ccplaytv.com` (`docs/portal/operacao.md`); é endereço público, não segredo.
- A TV declarar a própria variante é confiável o bastante: uma TV que se diga base só perde a oferta de licença, sem ganho para quem mente; uma comercial que se diga base não consegue comprar, o que não lhe dá nada.
- O site já sabe qual TV está na sessão e o serviço já tem o registro do dispositivo (ADR-013/014); a variante é um atributo a mais.
- O revisor da Samsung pode testar o app sem o portal (cadastro manual na TV); o portal é opcional no fluxo e aparece na UI Description.
- O site do portal já existe em pt/en/es.
- Constituição e ADRs 013–020 continuam valendo; se o plano precisar mudar uma decisão delas, isso vira emenda de ADR.

## Clarifications

### Sessão 2026-10-17

- Q: Por que a 078 escondeu o portal se ele funciona? → A: Só porque o build da base saía sem o endereço do portal; a pessoa decidiu incluir o portal na versão da loja.
- Q: Como evitar que o site ofereça licença a uma TV da base? → A: A TV informa a variante; serviço guarda e o site esconde licença; o servidor recusa cobrança para base.
- Q: O que a TV da base vê no lugar de Licença no site? → A: A aba Licença some; nenhuma menção a preço, teste, validade ou compra (inclusive resumo e FAQ).
- Q: Parear uma TV da base inicia o teste de 7 dias? → A: Não; o teste começa no primeiro contato comercial.
- Q: TVs já pareadas sem variante registrada? → A: Comercial, até a TV informar.
- Q: TV que troca de variante? → A: Vale a última informada; licença paga continua guardada.
- Q: Quais recursos do portal a base ganha? → A: Todos menos licença (listas, TMDB, backup, recuperação/Avançado, Desvincular).
- Q: Nome da aba de Ajustes na TV da base? → A: "Portal"; o comercial segue "Portal & licença".
- Q: Quem faz o deploy em produção? → A: O agente executa, com confirmação da pessoa antes de cada passo que muda produção.
- Q: Privacidade, UI Description e o novo `.wgt` ficam onde? → A: Privacidade, ledger e UI Description nesta feature; o `.wgt` e as evidências seguem como T048 da 078, depois do deploy.

### Sessão 2026-10-17 (cancelamento)

- Q: Qual versão vai para a loja e para a TV da pessoa? → A: A mesma: a **comercial completa** (portal, licença, teste de 7 dias e compra por Pix), compra mantida e declarada à Samsung. Não existe mais "base com portal" a construir — **feature cancelada antes do `sdd-plan`**; o envio comercial é tratado na 078 (R-015). Esta spec fica como referência caso uma versão sem licença com portal volte a ser necessária.
