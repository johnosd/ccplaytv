# Feature Specification: Consulta sob demanda e QR fixo

**Slug**: `071-consulta-sob-demanda-qr-fixo`

**Created**: 2026-10-14

**Status**: Convergida

**Input**: "Hoje o usuário usa o app por 7 dias e depois ele fica bloqueado. Esse bloqueio não precisaria ficar batendo numa API minha todo dia; poderia ser do próprio aplicativo, e depois da compra ele seria desbloqueado. Quero botões tipo refresh/atualizar em vez de requisições automáticas." Fluxos do usuário: (1) adicionar lista pelo site e apertar Atualizar na TV, (2) adicionar lista na TV e ela ir ao site, (3) teste acabou → comprar no site → apertar Atualizar na tela de bloqueio e liberar. Decisões da entrevista de 2026-10-14: nada automático (100% manual), QR fixo, a TV envia nome/host/usuário/senha ao site, chave visível também na tela de bloqueio, teste contado no app.

## Escopo

### Incluído

- **Fim de toda consulta automática ao serviço**: ciclo diário, consulta a cada 10 s nas telas de portal/adicionar, renovação do convite do QR, consulta ao negar entrada e consulta ao abrir o app deixam de existir. O app só fala com o serviço por ação da pessoa.
- **Botões "Atualizar"** com resultado visível: na **tela de listas**, em **Adicionar lista** (hoje "Recarregar"), na **tela de bloqueio** (só licença) e em **Portal & licença** (só licença), com pausa de 10 s.
- **Envio da TV ao site** de nome, tipo, host, usuário, senha e URL M3U ao adicionar, editar ou excluir uma lista; fila local quando offline que sobe no próximo Atualizar; **todas as listas já existentes sobem na primeira vez** que a pessoa aperta Atualizar.
- **QR fixo e local**: endereço do site + ID + chave no fragmento da URL; sem requisição, sem expirar (muda só quando a chave é regenerada); abre o painel já autenticado, com acesso a tudo.
- **Tela de bloqueio** com mensagem de fim do teste, orientações, QR, endereço, ID e **chave visíveis**, e botão Atualizar que libera o app e retoma a entrada negada.
- **Teste de 7 dias contado no app**, com proteção contra relógio atrasado e **âncora no primeiro contato manual** com o serviço (início registrado e devolvido em reinstalações).
- **Cadastro único do dispositivo** no primeiro momento em que ID/chave são necessários (abrir Adicionar lista ou a tela de bloqueio).
- **Emendas normativas** exigidas (constitution 1.11.0, ADR-016, notas nas specs 069 e 070).

### Fora de Escopo

- Qualquer canal de push, WebSocket ou polling em segundo plano.
- Detecção automática de estorno/chargeback (só aparece quando a pessoa aperta Atualizar).
- Mudar o período do teste (continua 7 dias; a spec 069 FR-016 fixa sete dias), preço, oferta ou regras de vencimento da 069.
- Ativar por código, revenda, várias TVs por licença.
- Mudar importação, catálogo, player ou classificação de listas.
- Reabrir a venda: continua desligada até os riscos R-022 a R-026 da 069 serem executados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adicionar lista pelo site e atualizar na TV (Priority: P1)

A pessoa abre Adicionar lista na TV, lê o QR no celular, cria a lista no site e volta à TV. Aperta Atualizar e a lista aparece. Nada aconteceu sozinho.

**Why this priority**: é o fluxo central de entrada de listas e a razão de o app falar com o serviço.

**Independent Test**: com a TV parada em qualquer tela por 24 h sem nenhuma requisição, criar uma lista no site e apertar Atualizar na TV; a lista aparece em segundos.

**Acceptance Scenarios**:

1. **Given** uma lista criada no site, **When** a pessoa aperta Atualizar em Adicionar lista, **Then** a TV busca as alterações e volta à tela de listas com foco na lista nova.
2. **Given** nenhuma alteração no site, **When** a pessoa aperta Atualizar, **Then** vê "sem novidades" e permanece na tela.
3. **Given** a tela de listas, **When** a pessoa aperta Atualizar, **Then** a lista nova aparece sem passar pela tela Adicionar.
4. **Given** a TV sem internet, **When** a pessoa aperta Atualizar, **Then** vê a falha com orientação e os botões continuam focáveis.

---

### User Story 2 - Liberar o app depois de comprar (Priority: P1)

O teste acabou e a próxima entrada na lista mostra a tela de bloqueio. A pessoa compra no site e aperta Atualizar nessa mesma tela; o app libera na hora.

**Why this priority**: sem isso a venda não fecha o ciclo; é o ponto crítico do usuário.

**Independent Test**: com o teste vencido, comprar (sandbox) e apertar Atualizar na tela de bloqueio; a entrada negada é retomada.

**Acceptance Scenarios**:

1. **Given** o bloqueio por fim do teste, **When** a tela abre, **Then** mostra a mensagem, as orientações, o QR, o endereço, o ID e a chave, com Atualizar focável.
2. **Given** uma compra aprovada, **When** a pessoa aperta Atualizar, **Then** o app libera e entra na lista que tentou abrir.
3. **Given** nenhuma compra confirmada (ou pagamento pendente), **When** a pessoa aperta Atualizar, **Then** vê o estado ("sem compra", "pagamento pendente") e o bloqueio permanece.
4. **Given** a tela de bloqueio aberta, **When** nada é pressionado, **Then** nenhuma requisição é feita.

---

### User Story 3 - Teste contado no app, sem rede (Priority: P1)

No primeiro uso o app conta 7 dias por conta própria, sem chamada ao serviço. Ao fim, bloqueia a próxima entrada na lista, com ou sem internet.

**Why this priority**: remove a chamada inicial e o custo; define quando o bloqueio aparece.

**Independent Test**: instalar, abrir offline, avançar o relógio 7 dias e confirmar o bloqueio; voltar o relógio e confirmar que não ganha dias.

**Acceptance Scenarios**:

1. **Given** a primeira abertura sem internet, **When** o app abre, **Then** o teste começa e a pessoa usa normalmente.
2. **Given** o teste vencido, **When** a pessoa tenta entrar numa lista, **Then** aparece a tela de bloqueio sem nenhuma chamada.
3. **Given** o relógio da TV voltado para antes do início, **When** o app abre, **Then** o teste não ganha tempo.
4. **Given** o primeiro contato manual com o serviço, **When** o serviço recebe o início do teste, **Then** guarda esse início e o devolve a reinstalações futuras da mesma TV.

---

### User Story 4 - Lista da TV aparece no site com tudo (Priority: P2)

A pessoa adiciona (ou edita, ou exclui) uma lista na TV; nesse momento o app envia ao site nome, host, usuário e senha. Offline, fica na fila e sobe no próximo Atualizar.

**Why this priority**: o site passa a ser uma visão completa e editável; mas o uso da TV não depende dele.

**Independent Test**: adicionar uma lista Xtream na TV e abrir o site; ver nome, host, usuário e senha e editar.

**Acceptance Scenarios**:

1. **Given** a TV online, **When** a pessoa adiciona uma lista, **Then** o site passa a listá-la com todos os campos.
2. **Given** a TV offline, **When** a pessoa adiciona, edita ou exclui, **Then** a alteração fica em fila e sobe no próximo Atualizar sem perda, mesmo após reiniciar.
3. **Given** listas existentes antes desta feature, **When** a pessoa aperta Atualizar pela primeira vez, **Then** todas sobem ao site uma única vez.
4. **Given** uma lista editada no site, **When** a TV atualiza, **Then** aplica a alteração ou mostra o conflito, como na 069.

---

### User Story 5 - QR fixo que entra direto (Priority: P2)

O QR da tela Adicionar lista e da tela de bloqueio é sempre o mesmo e abre o painel já autenticado, com acesso a tudo.

**Why this priority**: elimina a requisição de convite e a expiração, e simplifica a entrada.

**Independent Test**: ler o QR duas vezes, em dias diferentes, e entrar sem digitar nada; regenerar a chave e ver o QR antigo recusado.

**Acceptance Scenarios**:

1. **Given** a tela Adicionar lista, **When** abre, **Then** o QR aparece sem nenhuma requisição.
2. **Given** o QR lido, **When** o site abre, **Then** entra no painel desta TV com acesso a tudo, sem digitar.
3. **Given** a chave regenerada, **When** o QR antigo é lido, **Then** é recusado e o QR da tela já mudou.
4. **Given** o painel aberto pelo QR, **When** a página carrega, **Then** a chave não permanece na barra de endereço nem no histórico.

---

### Edge Cases

- Sem internet em qualquer botão: falha visível, orientação e foco preservado; nada é perdido.
- Duplo aperto: o segundo é ignorado durante a pausa de 10 s, com mensagem de espera.
- Cadastro do dispositivo sem internet: a tela mostra o estado e o botão Atualizar tenta de novo; sem ID/chave o QR não existe.
- Chave regenerada: o QR e as sessões do painel anteriores deixam de valer.
- Reinstalação sem nenhum contato prévio com o serviço: o teste recomeça. Risco aceito e registrado.
- Relógio atrasado: o teste e a licença não ganham tempo.
- Estorno ou chargeback: só é visto no próximo Atualizar; a licença local continua válida até vencer.
- Muitas listas existentes subindo na primeira atualização: sobem em lotes, com progresso visível e retomada.
- Credenciais com caracteres especiais ou muito longas: enviadas e exibidas sem corte.
- Conflito de edição entre site e TV: segue o protocolo de revisão da 069.
- Idiomas pt/en/es e texto mínimo de 20 px em todos os botões e mensagens.

## Requirements *(mandatory)*

### Functional Requirements

**Consulta sob demanda**

- **FR-001**: O app NÃO DEVE fazer requisição ao serviço sem ação da pessoa. São ações válidas: apertar Atualizar, adicionar/editar/excluir uma lista, abrir a primeira vez uma tela que precisa de ID/chave, abrir o QR no site.
- **FR-002**: DEVEM ser removidos: ciclo periódico, consulta a cada 10 s, renovação do convite do QR, consulta ao negar a entrada e consulta ao abrir o app.
- **FR-003**: O botão "Atualizar" DEVE existir, focável e com estados de carregando, sucesso, "sem novidades", sem internet e erro com código, na tela de listas, em Adicionar lista, na tela de bloqueio e em Portal & licença. **Esclarecimento (execute, A001):** em Adicionar lista o botão mantém o rótulo "Recarregar" (contrato 070 C1, plan D-013); nas demais telas é "Atualizar".
- **FR-004**: Após apertado, o botão DEVE ficar desabilitado por 10 s, com mensagem de espera, respeitando o limite do serviço.
- **FR-005**: Atualizar na tela de bloqueio e em Portal & licença DEVE consultar só a licença; na tela de listas e em Adicionar lista DEVE buscar alterações do site e enviar a fila local.
- **FR-006**: Após Atualizar em Adicionar lista com listas novas, o app DEVE voltar à tela de listas com foco na nova, reconciliada por id.
- **FR-007**: Ao liberar a licença pela tela de bloqueio, o app DEVE retomar a entrada que foi negada.

**Envio da TV ao site**

- **FR-008**: Ao adicionar ou editar uma lista, a TV DEVE enviar ao serviço nome, tipo, host, usuário, senha e URL M3U no ato; a exclusão continua sendo enviada no ato.
- **FR-009**: Sem internet, o envio DEVE ficar em fila durável (sobrevive a reinicialização) e subir no próximo Atualizar, sem perda.
- **FR-010**: Na primeira vez que a pessoa apertar Atualizar, TODAS as listas existentes DEVEM subir ao serviço, uma única vez, com retomada.
- **FR-011**: Credenciais recebidas DEVEM ser cifradas em repouso e NUNCA aparecer em log, URL, erro ou analytics; só a sessão da mesma TV as lê (070 mantido).
- **FR-012**: O site DEVE listar e permitir editar as listas vindas da TV; alterações do site chegam com Atualizar e seguem o protocolo de aplicação, conflito e pendência da 069.

**QR fixo**

- **FR-013**: O QR DEVE ser gerado localmente, sem requisição, com endereço do site + ID + chave no fragmento da URL; DEVE ser o mesmo até a chave ser regenerada.
- **FR-014**: Ler o QR DEVE abrir o painel desta TV já autenticado, com acesso a tudo, sem ação adicional; o fragmento DEVE ser consumido no navegador, nunca enviado ao servidor nem a logs, e removido do histórico/endereço após o uso.
- **FR-015**: A entrada manual por ID + chave, os limites de tentativa e a recusa uniforme DEVEM continuar.
- **FR-016**: "Gerar nova chave" DEVE invalidar o QR anterior e as sessões abertas.

**Tela de bloqueio e licença**

- **FR-017**: A tela de bloqueio DEVE informar que o período de teste acabou, orientar a compra no site e mostrar QR, endereço, ID e chave, com Atualizar e Voltar focáveis.
- **FR-018**: A chave DEVE ser visível apenas na tela Adicionar lista e na tela de bloqueio; em nenhuma outra tela comum.
- **FR-019**: A licença assinada DEVE continuar sendo verificada localmente, inclusive offline; revogação só é recebida ao apertar Atualizar.

**Teste local**

- **FR-020**: O teste de 7 dias DEVE ser contado no app desde a primeira abertura, persistir entre aberturas e NÃO ganhar tempo com o relógio atrasado.
- **FR-021**: O fim do teste DEVE barrar a próxima entrada na lista, sem rede, mantendo que a sessão aberta continua até sair (069 D-016).
- **FR-022**: No primeiro contato manual com o serviço, o início local DEVE ser registrado; reinstalações da mesma TV DEVEM receber esse mesmo início e nunca um posterior.
- **FR-023**: O cadastro do dispositivo (ID e chave) DEVE ocorrer uma única vez, na primeira vez em que ID/chave forem necessários.

**Normas e compatibilidade**

- **FR-024**: A constitution 1.11.0 e a ADR-016 DEVEM ser aprovadas antes de qualquer implementação, formalizando: credenciais IPTV enviadas ao serviço (cifradas), chave dentro do QR (fragmento) e chave visível na tela de bloqueio.
- **FR-025**: Contratos travados e textos das specs 069 e 070 que dependem de convite efêmero, ciclo diário ou consulta automática (069 FR-002/FR-003/D-011/R-008/R-009; 070 FR-026/D-012/US1 AC2/I-5/I-10) DEVEM ter emenda registrada e aprovada; nenhum contrato travado é editado sem essa emenda.
- **FR-026**: Todo texto novo DEVE existir em pt/en/es, ter no mínimo 20 px e todo estado (carregando, vazio, erro) DEVE ter elemento focável.

### Key Entities *(include if feature involves data)*

- **Início do teste**: instante local da primeira abertura; guardado no app; âncora opcional no serviço após o primeiro contato manual.
- **QR fixo**: derivado de endereço, ID e chave; não persiste em servidor; muda só com a chave.
- **Fila de envio**: alterações locais de listas ainda não entregues ao serviço; durável; esvaziada pelo Atualizar.
- **Resultado de atualização**: estado exibido ao fim de cada aperto (atualizado, sem novidades, offline, pendente, erro).
- **Licença assinada**: já existente na 069; passa a ser renovada só por ação da pessoa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o app aberto e parado por 24 h, em qualquer tela, o número de requisições ao serviço é **0**.
- **SC-002**: Uma lista criada no site aparece na TV em até **5 s** depois de apertar Atualizar, com internet.
- **SC-003**: Com compra aprovada, apertar Atualizar na tela de bloqueio libera o app em até **5 s**, com **1** requisição.
- **SC-004**: Uma lista adicionada, editada ou excluída na TV aparece no site em até **5 s**; sem internet, **100%** das alterações sobem no próximo Atualizar, inclusive após reiniciar.
- **SC-005**: Ler o QR abre o painel autenticado em até **5 s**, sem digitação, em dias diferentes, até a chave ser regenerada.
- **SC-006**: O teste de 7 dias conta sem rede e, com o relógio atrasado, ganha **0** dias.
- **SC-007**: Em uso típico, uma TV faz no máximo **10 requisições por mês**, todas por ação da pessoa.
- **SC-008**: Nenhuma chave, ID de sessão ou credencial aparece em log, URL enviada ao servidor, erro ou cabeçalho de cache em inspeção com marcadores fictícios.
- **SC-009**: 100% dos textos novos legíveis e sem corte em pt/en/es, mínimo de 20 px.

## Assumptions

- A nova feature **emenda** comportamentos das specs 069 (encerrada com riscos aceitos) e 070 (convergida); notas de atualização entram nelas, sem reescrever o que foi entregue.
- O período do teste continua **7 dias**. A menção a "7 ou 15 dias" é tratada como mudança de configuração futura, fora deste escopo.
- Credenciais IPTV deixam de receber tratamento de "segredo especial" no fluxo e na interface, mas **mantêm cifragem em repouso e proibição de log** (custo zero de UX e requisição). Isso exige a emenda da constitution (FR-024).
- Colocar a chave dentro do QR (fragmento) amplia a exposição: foto ou captura do QR dá acesso ao painel. Risco aceito pelo usuário; a chave já é visível permanentemente na tela. Mitigações: fragmento não vai ao servidor, "Gerar nova chave", limites de tentativa e sessão curta.
- Contagem local do teste pode ser reiniciada por reinstalação **antes** do primeiro contato manual com o serviço. Risco aceito; a âncora no primeiro contato reduz o efeito.
- Sem detecção automática, estorno e chargeback só são vistos quando a pessoa aperta Atualizar; a licença vigente continua válida offline até vencer.
- O ID continua sendo atribuído pelo serviço (MAC real ou derivado, ADR-015); por isso o cadastro precisa de uma chamada única na primeira necessidade de ID/chave.
- Design System V14 é normativo; focar nunca dispara consulta externa, só SELECT no botão.
- A venda continua desligada; esta feature não a reabre.

## Clarifications

### Sessão 2026-10-14

- Q: Fluxos desejados → A: três fluxos manuais (site → TV com Atualizar; TV → site no ato; compra → Atualizar no bloqueio).
- Q: O QR deve expirar? → A: **Não**; fixo, baseado no ID, com acesso total ao painel sem ação (decidido: ID + chave no fragmento).
- Q: O que a TV envia ao site? → A: nome, usuário, senha e host; "pare de considerar esses dados como segredos".
- Q: Cifragem em repouso e log → A: **manter cifragem e sem log** (recomendado).
- Q: Tela de bloqueio e a chave → A: **mostrar a chave também na tela de bloqueio** (emenda da constitution).
- Q: Quais listas sobem? → A: **todas**, na primeira vez que a pessoa apertar Atualizar.
- Q: Automático algum? → A: **nada automático, 100% manual**.
- Q: Tela de listas → A: **só botão** (sem janela automática).
- Q: Pausa do botão → A: **10 segundos**.
- Q: Após Atualizar em Adicionar lista → A: volta à tela de listas com foco na nova.
- Q: Offline ao adicionar/editar/excluir → A: fica em fila e sobe no próximo Atualizar.
- Q: Resultado do Atualizar no bloqueio → A: libera e entra na lista que tentou abrir.
- Q: Início do teste → A: contado no app; **âncora no 1º contato manual** (recomendado).
- Q: Nova feature ou remendo? → A: **nova feature 071**.
- Q: Visão do usuário sobre estorno → A: sem detecção automática (consequência aceita ao escolher 100% manual).
