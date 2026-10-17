# Feature Specification: Redesenho do portal web mobile-first — listas, licença, chave TMDB e backup

**Slug**: `077-redesenho-portal-web`

**Created**: 2026-10-16

**Status**: Convergida

**Input**: "Quero reduzir a complexidade do site portal, permitindo ao usuário realizar de forma simples, rápida e integrada com a TV, e otimizado, as principais operações na ordem de importância: (1) adicionar/editar/excluir listas; (2) comprar/renovar licença anual; (3) adicionar/editar chave TMDB; (4) excluir backups. Quero também que o site fique mais organizado, sempre pensando em quem vai usar no celular (mobile first), mas que funcione bem no PC. Use seus conhecimentos em UI/UX e nosso design system." Dica adicional: lembrar na tela de entrada o último ID (MAC) digitado, para quem acessa sem QR.

## Escopo

### Incluído

- Nova estrutura do `portal-web` em três destinos, na ordem de importância: **Listas**, **Licença** e **Ajustes**; no celular, uma barra de navegação inferior; no PC, um menu lateral fixo. Um **resumo fixo** da TV (ID, licença e último contato) aparece sempre.
- Tela de entrada que **lembra o último ID** informado com sucesso (nunca a chave) para quem não usa o QR.
- **Listas**: adicionar, editar e excluir com formulário simples em coluna única, cartões com selo de estado ("Na TV", "Aguardando a TV", "Erro") e ações extras (Reenviar, Cancelar envio) só quando há algo pendente ou com problema.
- **Licença**: um único cartão com estado, validade, oferta e um botão grande **Comprar licença** / **Renovar licença**; o aceite deixa de ser uma caixa a marcar e passa a ser a frase ao lado do botão.
- **Chave TMDB (capacidade nova)**: adicionar, substituir e remover a chave pelo portal; a chave segue cifrada pelo serviço até a TV aplicá-la no próximo **Atualizar**; o portal mostra o estado real (aguardando a TV, aplicada e válida, recusada pelo TMDB) e **nunca** exibe a chave de volta.
- **Ajustes**: Chave TMDB, **Backup** (ver o resumo e excluir), Código de recuperação e Recuperar acesso (já existentes, só reposicionados), Ajuda (a FAQ atual) e Sair.
- Estado de integração com a TV em toda mudança: "Enviado — na TV, aperte Atualizar" → "Aplicado na TV" ou o erro, com o próximo passo na TV.
- Textos nos três idiomas (pt/en/es), design system do projeto (tokens e paleta já usados no portal), acessibilidade por teclado no PC e verificação visual em 360, 768 e 1280 px.
- Mudanças no serviço (`api/`) e na TV (`tv-web/`) **somente** para a chave TMDB: nova operação, aplicação na TV, devolução do resultado.
- Formalização da exceção de segredos (chave TMDB digitada no navegador passando pelo serviço): ADR e emenda da constitution.

### Fora de Escopo

- Novos meios de pagamento, mudança do Pix na TV ou do Checkout do Mercado Pago (só o layout e o texto do aceite mudam); programa de revendedores (a prévia "Em breve" sai da navegação).
- Conta de usuário, login por e-mail/senha, sessão que sobrevive ao fechamento da aba (só o ID é lembrado).
- Ver, editar ou baixar o **conteúdo** do backup (favoritos, histórico, PIN); **fazer** backup pelo portal (o backup continua sendo feito pela TV); restaurar.
- Outras chaves de terceiros (por exemplo OpenAI), outras configurações da TV pelo portal e gerenciamento de favoritos/histórico.
- Tema claro, aplicativo instalável (PWA), notificações e qualquer chamada automática da TV ao serviço (a TV continua só consultando por ação da pessoa).
- Redesenho da tela da TV e passada em TV física como gate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar e ter o painel da TV à mão (Priority: P1)

A pessoa abre o portal pelo QR da TV ou digitando o ID e a chave. Na entrada manual, o último ID usado já vem preenchido e ela só digita a chave. Depois de entrar, vê no topo o resumo da TV (ID, licença, último contato) e a navegação com Listas, Licença e Ajustes; no celular a navegação fica na parte de baixo, no PC na lateral.

**Why this priority**: tudo o mais depende de entrar e se orientar; é o esqueleto que as demais histórias preenchem.

**Independent Test**: abrir o portal sem QR em 360 px, informar ID e chave, sair, voltar e conferir que o ID aparece preenchido e a chave vazia; navegar entre os três destinos.

**Acceptance Scenarios**:

1. **Given** uma entrada manual bem-sucedida antes, **When** a pessoa abre a tela de entrada de novo, **Then** o campo de ID vem preenchido com o último ID usado e o foco vai para o campo da chave; a chave nunca vem preenchida.
2. **Given** um ID lembrado, **When** a pessoa quer usar outra TV, **Then** há um controle "Usar outra TV" que limpa o ID lembrado.
3. **Given** a entrada pelo QR da TV (ID e chave no fragmento), **When** ela conclui com sucesso, **Then** o ID também passa a ser lembrado para a próxima vez, e o fragmento continua sendo removido do endereço.
4. **Given** a pessoa autenticada em 360 px, **When** vê a tela, **Then** a barra inferior mostra Listas, Licença e Ajustes (Listas é o destino inicial) e o resumo da TV ocupa o topo sem cobrir o conteúdo; em 1280 px a navegação está na lateral.
5. **Given** a licença vencida ou o serviço sem contato recente, **When** a pessoa olha o resumo, **Then** o resumo diz isso com cor e texto (nunca só cor) e leva ao destino Licença.

---

### User Story 2 - Gerenciar listas rápido (Priority: P1)

A pessoa adiciona uma lista (M3U por URL ou Xtream), edita ou exclui. Cada lista é um cartão com nome, tipo e um selo de estado. O botão **Adicionar lista** está sempre visível. Depois de qualquer mudança, o portal diz o que fazer na TV.

**Why this priority**: é a operação mais frequente e a razão de existir do portal.

**Independent Test**: em 360 px, adicionar uma lista M3U e uma Xtream, editar o nome de uma e excluir outra, conferindo selos de estado e a mensagem do próximo passo na TV.

**Acceptance Scenarios**:

1. **Given** a aba Listas vazia, **When** a pessoa a abre, **Then** vê um estado vazio com um único botão **Adicionar lista** e uma frase sobre o que acontece depois.
2. **Given** o formulário de adicionar, **When** a pessoa escolhe o tipo, **Then** só aparecem os campos daquele tipo, em uma coluna, com rótulos visíveis, teclado adequado ao campo e sem zoom do navegador ao focar; Salvar fica ao alcance do polegar.
3. **Given** uma lista salva, **When** a pessoa a edita, **Then** vê os valores já salvos (como hoje, só para a sessão da própria TV) e, ao salvar, o cartão passa a "Aguardando a TV".
4. **Given** uma operação pendente de uma lista, **When** a pessoa olha o cartão, **Then** vê "Reenviar" e "Cancelar envio" só então; sem pendência ou erro esses botões não aparecem.
5. **Given** a pessoa aperta **Excluir**, **When** confirma, **Then** o cartão mostra a exclusão em andamento e some quando a TV aplica; cancelar não muda nada.
6. **Given** qualquer mudança enviada, **When** a mensagem aparece, **Then** diz "Na TV, aperte Atualizar" e muda para "Aplicado na TV" quando o serviço confirmar, ou mostra o erro com uma ação.

---

### User Story 3 - Comprar ou renovar a licença em um passo (Priority: P2)

A pessoa vai a **Licença**, vê estado e validade atuais, a oferta ("R$ 35 por 12 meses, uma TV, sem renovação automática") e um botão grande **Comprar licença** ou **Renovar licença**, com o aceite escrito ao lado do botão. O pagamento por cartão continua no Mercado Pago; o Pix continua na TV.

**Why this priority**: é a fonte de receita; vem logo depois de conseguir gerenciar listas.

**Independent Test**: em 360 px, abrir Licença com licença em teste e depois ativa, conferir rótulo do botão, validade e o retorno do checkout.

**Acceptance Scenarios**:

1. **Given** licença em teste, vencida ou ausente, **When** a pessoa abre Licença, **Then** o botão diz **Comprar licença**; com licença ativa diz **Renovar licença**.
2. **Given** o cartão da licença, **When** é exibido, **Then** mostra estado, validade, preço, prazo, "uma TV" e "sem renovação automática", e o aceite é a frase junto ao botão (sem caixa de seleção).
3. **Given** uma compra pendente criada na TV (Pix) ou no portal, **When** a pessoa abre Licença, **Then** vê o aviso de pedido em aberto e nenhuma cobrança nova é criada.
4. **Given** o retorno do Checkout, **When** a pessoa volta ao portal, **Then** cai em Licença com o estado do pedido e o próximo passo ("Na TV, aperte Atualizar").
5. **Given** a compra desabilitada pelo serviço, **When** a pessoa abre Licença, **Then** vê o motivo e o botão fica indisponível com explicação, não escondido.

---

### User Story 4 - Adicionar, trocar ou remover a chave TMDB (Priority: P3)

A pessoa vai a **Ajustes → Chave TMDB**, vê se a chave está "Não configurada", "Aguardando a TV", "Aplicada" ou "Recusada pelo TMDB", e pode **Adicionar**, **Substituir** ou **Remover**. A chave digitada nunca é mostrada de volta; a TV a aplica no próximo **Atualizar** e devolve o resultado.

**Why this priority**: é capacidade nova que melhora capas e detalhes, mas não é necessária para usar a TV; depende de mudanças no serviço e na TV.

**Independent Test**: com serviço e TV de teste, adicionar uma chave no portal, apertar Atualizar na TV e ver "Aplicada"; trocar por uma inválida e ver "Recusada"; remover.

**Acceptance Scenarios**:

1. **Given** nenhuma chave, **When** a pessoa abre Chave TMDB, **Then** vê "Não configurada", um campo para colar a chave (oculto por padrão, com olho) e um link de como criar a chave.
2. **Given** a chave digitada, **When** envia, **Then** o estado vira "Aguardando a TV — na TV, aperte Atualizar", o campo é limpo e a chave não aparece em tela, endereço, log ou erro.
3. **Given** a TV aplicou e o TMDB aceitou, **When** o portal consulta o estado, **Then** mostra "Aplicada na TV"; se o TMDB recusou, mostra "O TMDB recusou esta chave" e oferece Substituir.
4. **Given** uma chave aplicada, **When** a pessoa aperta **Substituir**, **Then** envia outra e o estado volta a "Aguardando a TV"; **Remover** pede confirmação e a TV remove a chave no próximo Atualizar.
5. **Given** que a TV tem uma chave digitada na própria TV, **When** a pessoa abre o portal, **Then** o estado inicial diz "Configurada na TV" (o portal não a conhece) e só mostra Aplicada/Recusada depois de uma operação feita pelo portal.

---

### User Story 5 - Excluir o backup e cuidar da conta nos Ajustes (Priority: P4)

Em **Ajustes**, a pessoa vê o resumo do backup (data e contagens) e exclui o backup com confirmação. Ali também ficam o código de recuperação, Recuperar acesso, Ajuda e Sair.

**Why this priority**: é a operação menos frequente das quatro; as demais já existem e só mudam de lugar.

**Independent Test**: com um backup de teste, abrir Ajustes em 360 px, excluir com confirmação e ver o resumo "Nenhum backup"; conferir que Ajuda, Recuperar acesso, Código de recuperação e Sair funcionam.

**Acceptance Scenarios**:

1. **Given** um backup guardado, **When** a pessoa abre Ajustes → Backup, **Then** vê data e contagens (favoritos, histórico, andamento), a explicação de que a TV só volta a guardar quando a pessoa pedir e o botão **Excluir backup**.
2. **Given** a pessoa aperta Excluir backup, **When** confirma, **Then** o resumo muda para "Nenhum backup guardado" e a mensagem diz que nada na TV foi apagado; cancelar não muda nada.
3. **Given** nenhum backup, **When** abre Backup, **Then** vê "Nenhum backup guardado" e nenhum botão de excluir, só a explicação.
4. **Given** Ajustes, **When** a pessoa percorre a lista, **Then** encontra Chave TMDB, Backup, Código de recuperação, Recuperar acesso, Ajuda e Sair, nessa ordem, cada um com uma linha de descrição.
5. **Given** o menu principal, **When** é exibido, **Then** não há mais destino "Revendedores" nem botão "Recarregar"; a Ajuda (FAQ) abre dentro de Ajustes.

---

### Edge Cases

- ID digitado fora do formato, chave errada ou limite de tentativas: mensagem uniforme já existente, sem revelar qual campo errou; o ID lembrado só é gravado após sucesso (nunca um ID com erro de digitação).
- Armazenamento do navegador indisponível (modo privado, bloqueado): o portal funciona normalmente, sem lembrar o ID.
- Computador compartilhado: o ID lembrado não é segredo, mas há "Usar outra TV" e "Sair" apaga a sessão; a chave nunca é guardada.
- Sessão expirada ou chave trocada na TV enquanto a pessoa usa o portal: volta à entrada com o ID lembrado e uma mensagem clara.
- TV sem contato há muito tempo: o resumo avisa e orienta abrir o app e apertar Atualizar; operações continuam sendo enfileiradas.
- Operação pendente ou conflito de revisão: estado "Erro" no cartão com ação (Reenviar/Cancelar) e texto do motivo.
- Chave TMDB: troca enquanto uma operação anterior está pendente (a nova substitui a pendente), formato inválido (recusado antes de enviar), TMDB fora do ar (a TV reporta falha e o portal diz para tentar de novo).
- Excluir uma lista com operação pendente; excluir a última lista.
- Duas abas ou dois aparelhos abertos: o estado é recarregado ao voltar o foco e nunca sobrescreve silenciosamente.
- Textos longos em en/es, zoom do navegador a 200%, teclado virtual aberto no celular (campo focado não fica escondido) e rotação de tela.
- Navegação por teclado no PC: ordem lógica, foco visível, Esc fecha confirmações.
- Retorno do Checkout em outra aba ou com a licença já ativa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O portal autenticado DEVE ter três destinos — **Listas**, **Licença** e **Ajustes** — nessa ordem; no celular, em barra de navegação inferior; a partir da largura de PC, em menu lateral fixo; o destino inicial é Listas.
- **FR-002**: Um **resumo da TV** DEVE ficar sempre visível no topo (ID da TV, estado e validade da licença, último contato com o serviço), com texto e cor para estados de atenção (vencida, sem contato recente), e levar ao destino adequado.
- **FR-003**: A tela de entrada manual DEVE preencher o campo de ID com o **último ID usado com sucesso** (via QR ou manual) e focar a chave; a chave NUNCA DEVE ser guardada nem preenchida; DEVE existir "Usar outra TV" que limpa o ID lembrado; sem armazenamento disponível, o portal funciona sem lembrar.
- **FR-004**: A entrada pelo QR da TV e pela troca de ID/chave DEVE manter as regras atuais (fragmento removido antes de qualquer requisição, limites de tentativa, recusa uniforme).
- **FR-005**: Em Listas, cada lista DEVE aparecer como cartão com nome, tipo e **selo de estado** ("Na TV", "Aguardando a TV", "Erro"), com **Editar** e **Excluir** sempre disponíveis; **Reenviar** e **Cancelar envio** DEVEM aparecer só quando há operação pendente ou com problema; **Adicionar lista** DEVE ser um botão sempre visível.
- **FR-006**: O formulário de lista DEVE ter uma coluna, rótulos visíveis, só os campos do tipo escolhido, tipos de teclado adequados, campos de 16 px ou mais no celular e botão Salvar ao alcance do polegar; DEVE mostrar os valores salvos na edição (só para a sessão da própria TV, como hoje).
- **FR-007**: Toda mudança enviada (lista, chave TMDB, exclusão) DEVE mostrar o estado de integração: "Enviado — na TV, aperte Atualizar", "Aguardando a TV", "Aplicado na TV" ou o erro com uma ação; o portal NÃO DEVE sugerir que a TV é atualizada sozinha.
- **FR-008**: Em Licença, o portal DEVE exibir estado, validade, preço, prazo, "uma TV", "sem renovação automática" e um único botão **Comprar licença** (teste/vencida/ausente) ou **Renovar licença** (ativa), com o aceite como frase junto ao botão e sem caixa de seleção; DEVE manter as validações de oferta e de pedido da TV atuais e o retorno do Checkout em Licença.
- **FR-009**: Um pedido pendente (da TV ou do portal) DEVE ser mostrado e reaproveitado, sem criar cobrança nova; compra desabilitada DEVE aparecer com motivo.
- **FR-010**: Em Ajustes → **Chave TMDB**, o portal DEVE permitir adicionar, substituir e remover a chave; o campo DEVE ser oculto por padrão (com olho), validar formato antes de enviar, limpar-se após o envio e a chave NUNCA DEVE ser exibida de volta, nem estar em endereço, histórico, log, erro, analytics ou armazenamento do navegador.
- **FR-011**: O portal DEVE mostrar o estado da chave TMDB: "Não configurada", "Configurada na TV" (digitada na TV, desconhecida do portal), "Aguardando a TV", "Aplicada na TV" ou "Recusada pelo TMDB"; a TV DEVE aplicar a chave só no **Atualizar**, testá-la no TMDB e devolver o resultado ao serviço, e uma operação nova substitui uma pendente.
- **FR-012**: O serviço DEVE guardar a chave TMDB pendente cifrada em repouso, entregá-la só à sessão autenticada da mesma TV, apagá-la do serviço depois de aplicada ou cancelada, nunca logá-la nem devolvê-la ao navegador, e incluir a nova operação no mesmo limite de tentativas e na mesma fila das demais configurações.
- **FR-013**: Em Ajustes → **Backup**, o portal DEVE mostrar data e contagens do backup (ou "Nenhum backup guardado") e, havendo backup, **Excluir backup** com confirmação; o conteúdo do backup NUNCA DEVE chegar ao navegador.
- **FR-014**: Ajustes DEVE listar, nesta ordem, Chave TMDB, Backup, Código de recuperação, Recuperar acesso, Ajuda e Sair, cada um com uma linha de descrição; o código de recuperação e a recuperação mantêm as regras atuais (oculto por padrão, ação explícita).
- **FR-015**: O destino "Revendedores" e o botão "Recarregar" DEVEM deixar de existir na navegação; a FAQ vira Ajuda dentro de Ajustes e seu conteúdo é atualizado para a nova estrutura e para o termo "código de recuperação".
- **FR-016**: O layout DEVE ser mobile first: sem rolagem horizontal desde 320 px, alvos de toque de pelo menos 44 px, campos de formulário com 16 px ou mais, respeito às áreas seguras do aparelho e teclado virtual sem esconder o campo focado; DEVE funcionar bem em 768 px e 1280 px.
- **FR-017**: O portal DEVE usar os tokens e a paleta do design system do projeto (sem cores, raios ou fontes fixos), manter contraste mínimo AA, foco visível, ordem de tabulação lógica e nomes acessíveis para todo controle; estados de carregamento, vazio e erro DEVEM ter ação disponível.
- **FR-018**: Todo texto novo ou alterado DEVE existir em pt/en/es; mensagens de erro DEVEM usar os códigos não secretos já existentes e nunca conter ID completo de outra TV, chave, credenciais ou URL com segredo.
- **FR-019**: A exceção de segredos da chave TMDB (digitada no navegador, em trânsito e cifrada no serviço, aplicada pela TV e usada só contra o TMDB) DEVE ser registrada em ADR e na constitution **antes** da implementação da US4, sem ampliar o que sai da TV (a chave continua nunca em logs, URLs, backup em claro ou exportação).
- **FR-020**: Os testes e roteiros que dependem da estrutura antiga (abas no topo, Revendedores, Recarregar, local do backup e da recuperação) DEVEM ser atualizados por emenda registrada no plano, incluindo a verificação visual em 360, 768 e 1280 px.

### Key Entities *(include if feature involves data)*

- **TV (dispositivo)**: ID de exibição, estado e validade da licença, último contato; é a identidade da sessão do portal.
- **Lista**: nome, tipo (M3U por URL ou Xtream), credenciais cifradas no serviço, estado (na TV, aguardando, erro) e operação pendente.
- **Operação**: pedido enviado à TV (criar/editar/excluir lista; definir/remover chave TMDB) com estado (enviada, aplicada, conflito, erro) e a data.
- **Chave TMDB**: estado (não configurada, configurada na TV, aguardando, aplicada, recusada); **o valor nunca é exposto**.
- **Backup**: data de criação e contagens (favoritos, histórico, andamento); um por TV.
- **ID lembrado**: último ID (MAC) usado com sucesso, guardado só no navegador, não secreto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Num celular de 360 px, uma pessoa que já entrou adiciona uma lista M3U em no máximo 4 toques (Adicionar lista, preencher e Salvar, mais a confirmação do próximo passo), sem precisar rolar horizontalmente.
- **SC-002**: A tela de entrada manual abre com o ID lembrado em 100% dos acessos seguintes a um sucesso, e a chave está vazia em 100% deles.
- **SC-003**: Comprar ou renovar a licença exige no máximo 2 toques a partir de qualquer destino (Licença, botão), sem caixa a marcar.
- **SC-004**: Adicionar, substituir e remover a chave TMDB levam no máximo 3 toques cada, e o estado final (Aplicada/Recusada) aparece no portal depois do Atualizar na TV sem que a chave apareça em nenhum lugar do navegador.
- **SC-005**: Excluir o backup leva no máximo 3 toques (Ajustes, Backup, Excluir + confirmar), e o resumo reflete a exclusão na hora.
- **SC-006**: Em 360, 768 e 1280 px não há rolagem horizontal, nenhum alvo de toque abaixo de 44 px, nenhum texto cortado em pt/en/es e nenhum controle sem nome acessível.
- **SC-007**: A navegação principal tem exatamente 3 destinos e nenhuma das ações fora das quatro prioridades aparece fora de Ajustes.
- **SC-008**: Nenhuma ocorrência da chave TMDB digitada em endereço, histórico, armazenamento do navegador, log ou mensagem de erro, verificada por teste.

## Assumptions

- O portal continua sendo um app web de página única com os mesmos serviços (`/portal/v1`), a entrada por QR/ID+chave e os mesmos limites de tentativa; nada muda na autenticação.
- A TV só consulta o serviço por ação da pessoa (ADR-016); por isso toda mudança depende de **Atualizar** na TV e o portal diz isso com clareza.
- Cada TV tem **um** backup; "excluir backups" significa excluir esse backup.
- A TV já sabe testar e guardar a chave TMDB (formato aceito hoje); a feature só acrescenta o caminho portal → serviço → TV e a devolução do resultado.
- O design system é o já usado pelo portal (tema escuro, paleta e tokens da TV V14); não há tema claro.
- O ID lembrado fica em `localStorage` do navegador; é identificador, não segredo (constitution: ID formato MAC, não secreto).
- A prévia "Revendedores" sai da navegação e do código se não houver outro uso; um futuro programa de revendedores terá spec própria.

## Clarifications

### Sessão 2026-10-16

- Q: Como o portal adiciona/edita a chave TMDB, que hoje só existe na TV? → A: Enviar pelo portal via serviço, cifrada, aplicada pela TV no próximo Atualizar; o portal nunca mostra a chave de volta (exige exceção nova na constitution e ADR).
- Q: Como organizar a navegação mobile-first? → A: Barra inferior no celular e menu lateral no PC, com três destinos (Listas, Licença, Ajustes) e um resumo fixo da TV no topo.
- Q: O que fazer com Revendedores, FAQ, Recarregar, Recuperar acesso e Sair? → A: Tirar do caminho principal: Revendedores sai da navegação; FAQ vira Ajuda e Recuperar acesso/Sair ficam em Ajustes; Recarregar some.
- Q: Como deixar clara a integração com a TV? → A: Resumo fixo e estado "aguardando a TV" depois de cada mudança, com o próximo passo na TV.
- Q: O que mostrar depois da TV receber a chave TMDB? → A: O estado real (aplicada e válida, ou recusada pelo TMDB), sempre sem exibir a chave; com Substituir e Remover.
- Q: Como simplificar a compra? → A: Um cartão com preço, validade e um botão grande; o aceite vira a frase ao lado do botão (sem caixa de seleção).
- Q: O que ficar visível nos cartões das listas? → A: Editar e Excluir sempre; Reenviar e Cancelar só quando há pendência ou erro.
- Q: Quais larguras são alvo de qualidade? → A: 360, 768 e 1280 px.
- Q: (dica do usuário) Lembrar o último ID na entrada? → A: Sim: o último ID usado com sucesso é lembrado no navegador (nunca a chave), com "Usar outra TV" para limpar.
