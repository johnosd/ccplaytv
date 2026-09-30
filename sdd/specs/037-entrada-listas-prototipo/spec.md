# Feature Specification: Entrada fiel ao protótipo — tela de listas e cadastro de lista

**Slug**: `037-entrada-listas-prototipo`

**Created**: 2026-09-30

**Status**: Em Execução

**Input**: Pedido do usuário (2026-09-30): "ele deve ter a entrada o máximo
parecida com o protótipo — fluxo padrão: usuário abre o app > Tela de listas >
cadastra lista ou clica para entrar em uma. Visual: ajuste o visual para ficar
fiel ao protótipo das telas de seleção de listas e cadastro". Referência: o
protótipo `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html`,
funções `profiles()` (tela "Selecione ou Adicione sua lista", ajustada nesta
mesma data para perfil = lista e com o cartão-botão "Adicionar lista") e
`sourceSetup()` (tela "Conecte sua lista IPTV", para onde o cartão-botão leva).
Perfil = lista IPTV (ADR-011 §2).

## Escopo

### Incluído

- **Tela de listas** (hoje "Quem está assistindo?", `ProfilesScreen`)
  redesenhada no visual do protótipo `profiles()`: marca CCPlayTV no topo,
  kicker, título "Selecione ou Adicione sua lista", subtítulo, fileira
  centralizada de cartões verticais (avatar com iniciais em gradiente, nome,
  selo do tipo no topo), cartão-botão "Adicionar lista" sempre por último,
  nota de rodapé e botão "⚙ Configurações" no canto.
- **Tela de cadastro** (hoje `AddSourceScreen`) redesenhada no visual do
  protótipo `sourceSetup()`: marca, kicker, título "Conecte sua lista IPTV",
  painel lateral "Como funciona", painel principal "Adicionar serviço" com o
  painel "Conectar com celular" (mock "Em breve") e o painel "Configuração
  manual" com a escolha **Xtream Codes / Lista M3U**, os campos do tipo
  escolhido e as ações "Voltar" / "Conectar e sincronizar".
- **Edição de lista** na mesma tela nova, sem o painel do celular e sem trocar
  o tipo.
- Manter o fluxo de entrada já existente (Splash → tela de listas → cadastrar
  ou entrar) e todas as regras de comportamento que ele já tem (foco inicial,
  RETURN em camadas, exclusão com confirmação, estados de carregamento/erro).

### Fora de Escopo

- Pareamento real pelo celular (QR/código) — segue mock "Em breve" (item 22
  do backlog).
- Criar "perfil de pessoa" com nome/avatar escolhido, perfil infantil ou
  controle parental — a tela `profileCreate()` do protótipo não é adotada
  (ADR-011: perfil = lista). O avatar é derivado da lista, não escolhido.
- Mudar a tela de progresso da importação (continua como está, terminando em
  "Abrir lista").
- Mudar o Splash, o Início, Configurações › Fontes IPTV ou qualquer tela
  depois da escolha da lista.
- A barra de dicas de teclas do rodapé do protótipo (←↑→ Navegar / OK
  Selecionar / Voltar) — é moldura do protótipo, não da tela.
- Mudar a validação dos campos, a detecção de painel Xtream em URL M3U
  (feature 014) ou o que é gravado ao cadastrar.
- Os chips de estado da conta da feature 034 — esta feature só garante que
  continuem aparecendo no novo cartão (ver FR-006).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher uma lista na tela nova (Priority: P1)

A pessoa abre o app e, depois do Splash, vê a tela "Selecione ou Adicione sua
lista" com a mesma aparência do protótipo: cada lista como um cartão vertical
com avatar de iniciais, nome e selo do tipo, e o cartão-botão "Adicionar
lista" por último. Ela navega com ←/→ e aperta OK numa lista para entrar no
Início dela.

**Why this priority**: É a primeira tela que qualquer pessoa vê em todo uso do
app e o ponto de entrada do fluxo padrão. Sozinha, já entrega a entrada fiel
ao protótipo para quem já tem listas.

**Independent Test**: Com duas listas cadastradas, abrir o app, comparar a
tela com o protótipo `profiles()` (mesma estrutura, textos e hierarquia),
navegar até a segunda lista e apertar OK — o Início dessa lista abre.

**Acceptance Scenarios**:

1. **Given** duas listas cadastradas, **When** o Splash termina, **Then** a
   tela mostra a marca, o kicker "Bem-vindo de volta", o título "Selecione ou
   Adicione sua lista", o subtítulo "Escolha uma lista para continuar ou
   adicione uma nova.", dois cartões de lista, o cartão-botão "Adicionar
   lista", a nota de rodapé e o botão "⚙ Configurações".
2. **Given** a tela de listas, **When** o foco está num cartão de lista,
   **Then** o cartão mostra o anel de foco V14 e os demais não.
3. **Given** o foco numa lista, **When** a pessoa aperta OK, **Then** o
   Início dessa lista abre (mesmo comportamento de hoje).
4. **Given** uma lista em "Modo limitado" ou com chip de estado da conta
   (feature 034), **When** a tela aparece, **Then** esses avisos continuam
   visíveis no cartão, abaixo do nome.
5. **Given** o foco num cartão de lista, **When** a pessoa aperta ↓, **Then**
   aparecem Ressincronizar/Editar/Excluir sob o cartão em foco, como hoje.
6. **Given** a tela de listas, **When** a pessoa leva o foco ao botão
   "⚙ Configurações" e aperta OK, **Then** abre Configurações › Fontes IPTV
   sem lista ativa (o mesmo destino de "Gerenciar listas" hoje).

---

### User Story 2 - Cadastrar uma lista pela tela nova (Priority: P1)

Na tela de listas, a pessoa foca o cartão-botão "Adicionar lista" (destacado
como botão: contorno tracejado em cor de destaque, ícone "＋" e rótulo
"＋ Adicionar") e aperta OK. Abre "Conecte sua lista IPTV", no visual do
protótipo, com Xtream Codes já selecionado. Ela pode trocar para Lista M3U,
preenche os campos e aperta "Conectar e sincronizar"; a importação começa na
tela de progresso de sempre.

**Why this priority**: É o outro ramo do fluxo padrão e o único caminho de
primeiro uso. Tem o mesmo peso da US1.

**Independent Test**: Sem nenhuma lista, abrir o app, apertar OK em
"Adicionar lista", conferir a tela contra o protótipo `sourceSetup()`,
preencher uma lista Xtream (e, em outra rodada, uma M3U) e confirmar que a
tela de progresso abre e a lista aparece depois na tela de listas.

**Acceptance Scenarios**:

1. **Given** a tela de listas, **When** a pessoa aperta OK em "Adicionar
   lista", **Then** abre "Conecte sua lista IPTV" com kicker "Configuração
   inicial", o painel "Como funciona", o painel "Adicionar serviço" com
   "Conectar com celular" e "Configuração manual".
2. **Given** a tela de cadastro recém-aberta, **When** ela aparece, **Then**
   Xtream Codes está selecionado e os campos Nome da lista, Servidor, Usuário
   e Senha estão visíveis.
3. **Given** Xtream Codes selecionado, **When** a pessoa escolhe Lista M3U,
   **Then** os campos passam a ser Nome da lista e URL M3U, e a escolha
   selecionada fica evidente sem depender só de cor.
4. **Given** os campos preenchidos corretamente, **When** a pessoa aperta
   "Conectar e sincronizar", **Then** a lista é criada exatamente como hoje e
   a tela de progresso da importação abre.
5. **Given** um campo obrigatório vazio, **When** a pessoa aperta "Conectar e
   sincronizar", **Then** aparece a mesma mensagem de validação de hoje, sem
   sair da tela.
6. **Given** a tela de cadastro, **When** a pessoa aperta "Voltar" ou RETURN,
   **Then** volta à tela de listas com o foco no cartão "Adicionar lista".
7. **Given** o painel "Conectar com celular", **When** a pessoa leva o foco a
   ele e aperta OK, **Then** é anunciado "Em breve" e nada é cadastrado — sem
   QR code nem código de pareamento inventados na tela.

---

### User Story 3 - Primeiro uso sem listas (Priority: P2)

Quem abre o app pela primeira vez vê a mesma tela de listas, só com o
cartão-botão "Adicionar lista", já em foco, e textos de primeiro uso.

**Why this priority**: Acontece uma vez por aparelho e o caminho já funciona
com a US2; o ganho aqui é o texto e o foco certos no primeiro contato.

**Independent Test**: Apagar todas as listas (ou usar um perfil de navegador
limpo), abrir o app e conferir o cartão único em foco e os textos; OK abre o
cadastro.

**Acceptance Scenarios**:

1. **Given** nenhuma lista cadastrada, **When** o Splash termina, **Then** a
   tela de listas mostra só "Adicionar lista", com o foco nele, e um texto de
   primeiro uso no lugar de "Bem-vindo de volta" e do subtítulo de escolha.
2. **Given** a tela vazia, **When** a pessoa aperta OK, **Then** abre o
   cadastro (US2).
3. **Given** a tela vazia, **When** a pessoa aperta RETURN, **Then** abre o
   modal "Sair do CCPlayTV?" (comportamento de hoje).

---

### User Story 4 - Editar uma lista no visual novo (Priority: P3)

A pessoa desce às ações de uma lista, escolhe Editar e vê a mesma tela nova,
já no tipo da lista, sem o painel do celular e sem a escolha Xtream/M3U.

**Why this priority**: Uso raro; o fluxo principal já está completo sem ela,
mas deixar a edição no visual antigo quebraria a unidade das telas de entrada.

**Independent Test**: Editar uma lista Xtream, trocar o nome, salvar e
conferir o nome novo no cartão; conferir que usuário e senha em branco
continuam valendo.

**Acceptance Scenarios**:

1. **Given** uma lista Xtream, **When** a pessoa escolhe Editar, **Then** a
   tela mostra título de edição, o painel manual só com os campos Xtream
   (Servidor preenchido, Usuário e Senha em branco com a dica "Deixe em branco
   para manter"), sem painel do celular e sem escolha de tipo.
2. **Given** a edição, **When** a pessoa salva, **Then** as alterações são
   gravadas como hoje e ela volta para onde estava.

---

### Edge Cases

- **Nome longo**: o nome da lista no cartão é truncado com reticências; o
  nome inteiro continua disponível como nome acessível do cartão.
- **Iniciais**: nome com uma palavra → duas primeiras letras; com várias →
  primeira letra das duas primeiras palavras; nome sem letras (só números ou
  símbolos) → primeiros dois caracteres visíveis. Sempre em maiúsculas.
- **Mais listas do que cabem na fileira**: a fileira rola na horizontal
  acompanhando o foco; o cartão em foco nunca fica fora da área visível, e
  "Adicionar lista" é sempre o último.
- **Carregando**: esqueletos no lugar dos cartões, com as mesmas dimensões do
  cartão novo; o botão "⚙ Configurações" continua focável.
- **Erro ao ler as listas**: o estado de erro atual (STO-01, "Tentar de
  novo" focável) continua, dentro do visual novo.
- **Tela de cadastro maior que a área útil**: se o conteúdo não couber em
  1920×1080 dentro da zona segura, a área rola acompanhando o foco, de modo
  que o campo ou botão em foco esteja sempre inteiro na tela e "Conectar e
  sincronizar" sempre alcançável — o protótipo, como está, corta os campos
  Usuário/Senha na borda inferior.
- **Trocar o tipo com campos preenchidos**: trocar de Xtream para M3U (e
  volta) não apaga o Nome da lista já digitado.
- **OK repetido em "Conectar e sincronizar"**: um segundo OK durante o envio
  é ignorado e o botão continua focável (comportamento de hoje).
- **Exclusão da lista em foco**: o foco vai ao cartão seguinte ou a
  "Adicionar lista" (comportamento de hoje).

## Requirements *(mandatory)*

### Functional Requirements

**Fluxo**

- **FR-001**: O fluxo padrão de entrada DEVE continuar Splash → tela de
  listas → (OK numa lista → Início dela) ou (OK em "Adicionar lista" →
  cadastro → progresso da importação). Nenhuma tela nova entra nesse caminho.
- **FR-002**: Todo comportamento de foco, RETURN e navegação que a tela de
  listas e o cadastro já têm (foco inicial na última lista usada, RETURN em
  camadas, modal de saída, exclusão com confirmação, modo "trocar de lista"
  vindo do Início) DEVE ser preservado. A mudança é de estrutura visual e de
  textos, salvo onde um FR abaixo disser o contrário.

**Tela de listas**

- **FR-003**: A tela DEVE seguir a estrutura do protótipo `profiles()`:
  marca CCPlayTV, kicker, título "Selecione ou Adicione sua lista" (em duas
  linhas, quebra antes de "sua lista"), subtítulo "Escolha uma lista para
  continuar ou adicione uma nova.", fileira centralizada de cartões, nota de
  rodapé "Cada lista mantém seu próprio histórico, favoritos e
  recomendações." e o botão "⚙ Configurações" no canto inferior direito.
- **FR-004**: O kicker DEVE ser "Bem-vindo de volta" quando há ao menos uma
  lista. Sem nenhuma lista, kicker e subtítulo DEVEM trocar por textos de
  primeiro uso (ex.: kicker "Configuração inicial", subtítulo "Adicione sua
  primeira lista para começar.").
- **FR-005**: Cada cartão de lista DEVE mostrar, como no protótipo: um selo no
  topo com o tipo da lista (XTREAM ou M3U), um avatar quadrado arredondado
  com as iniciais do nome sobre um gradiente e o nome da lista abaixo. O
  gradiente DEVE ser derivado de forma estável da identidade da lista (a
  mesma lista tem sempre as mesmas cores, entre sessões) a partir de um
  conjunto fixo de pares de cores do design system.
- **FR-006**: Avisos reais que o cartão já mostra hoje ("Modo limitado", "A
  lista não coube inteira", "Entradas não reconhecidas ficaram de fora") e os
  chips de estado da conta da feature 034 DEVEM continuar visíveis no cartão,
  numa linha compacta abaixo do nome. A data de sincronização DEIXA de
  aparecer no cartão.
- **FR-007**: O cartão "Adicionar lista" DEVE ter aparência de botão, como no
  protótipo ajustado: contorno tracejado na cor de destaque, fundo
  transparente, ícone "＋" dentro de um círculo, título "Adicionar lista" e
  uma pílula "＋ Adicionar". Em foco, o contorno fica contínuo e o círculo
  fica preenchido na cor de destaque. Seu nome acessível DEVE ser "Adicionar
  lista" e ele DEVE ser anunciado como botão.
- **FR-008**: O link "Gerenciar listas" DEVE ser substituído pelo botão
  "⚙ Configurações" no canto, com o mesmo destino (Configurações › Fontes
  IPTV sem lista ativa) e o mesmo caminho de navegação de hoje: ↓ a partir do
  cartão "Adicionar lista" leva ao botão, ↑ volta ao cartão. ↓ num cartão de
  lista continua abrindo as ações dela (contrato travado da 023).
- **FR-009**: A linha de ações (Ressincronizar/Editar/Excluir) aberta com ↓
  DEVE continuar existindo, aparecendo só sob o cartão em foco, no visual V14.
- **FR-010**: Com mais cartões do que cabem na largura, a fileira DEVE rolar na
  horizontal acompanhando o foco, sem quebrar em várias linhas.
- **FR-011**: Os estados de carregamento, vazio e erro DEVEM existir no visual
  novo, cada um com ao menos um elemento focável.

**Tela de cadastro**

- **FR-012**: A tela DEVE seguir a estrutura do protótipo `sourceSetup()`:
  marca, kicker "Configuração inicial", título "Conecte sua lista IPTV",
  subtítulo, um painel lateral "Como funciona" e um painel principal
  "Adicionar serviço" contendo o painel "Conectar com celular", o painel
  "Configuração manual", os campos e as ações "Voltar" e "Conectar e
  sincronizar".
- **FR-013**: O painel "Conectar com celular" DEVE ser um mock "Em breve"
  soft-disabled (política de mocks, ADR-011; id já registrado `pair-phone`):
  sem QR code, sem código de pareamento e sem endereço inventados; seu rótulo
  de destaque DEVE dizer "Em breve", nunca "Recomendado". OK nele anuncia "Em
  breve" e não faz mais nada.
- **FR-014**: Os textos da tela NÃO DEVEM apresentar o pareamento pelo celular
  como disponível: o subtítulo e os passos de "Como funciona" DEVEM descrever
  o caminho real (escolher Xtream Codes ou Lista M3U → preencher servidor e
  login ou a URL → sincronizar canais, EPG, filmes e séries), podendo
  mencionar o celular só como "em breve".
- **FR-015**: O painel "Configuração manual" DEVE oferecer a escolha entre
  **Xtream Codes** ("Servidor, usuário e senha com categorias e EPG.") e
  **Lista M3U** ("URL única para playlist rápida e compatível."), com Xtream
  Codes selecionado ao abrir. A opção selecionada DEVE ser identificável sem
  depender só de cor (ex.: marca, texto ou `aria-pressed`/`aria-checked`).
- **FR-016**: Com Xtream Codes, os campos DEVEM ser: Nome da lista, Servidor,
  Usuário e Senha. Com Lista M3U: Nome da lista e URL M3U. Rótulos
  permanentes acima do campo e IME por finalidade (URL, usuário, senha), como
  os campos atuais.
- **FR-017**: Trocar o tipo NÃO DEVE apagar o Nome da lista já digitado.
- **FR-018**: "Conectar e sincronizar" DEVE criar a lista com os mesmos dados,
  a mesma validação, as mesmas mensagens de erro e o mesmo destino (tela de
  progresso da importação) de "Adicionar lista" hoje — com uma única exceção de
  texto: a mensagem de nome vazio passa de "Informe um nome de exibição para a
  fonte." para "Informe um nome para a lista.", acompanhando o rótulo novo
  "Nome da lista".
- **FR-019**: "Voltar" e RETURN DEVEM voltar à tela de listas com o foco no
  cartão "Adicionar lista".
- **FR-020**: A tela DEVE caber na área útil de 1920×1080 ou rolar
  acompanhando o foco, de modo que o elemento em foco esteja sempre inteiro na
  tela e todas as ações sejam alcançáveis pelo controle.

**Edição**

- **FR-021**: Editar uma lista DEVE usar a mesma tela nova, com título e
  kicker de edição, sem o painel "Conectar com celular", sem o painel lateral
  "Como funciona" (o painel manual ocupa a largura), sem a escolha de tipo
  e com os campos do tipo da lista. As regras atuais de edição (Servidor
  preenchido; Usuário e Senha em branco mantêm o valor atual, com dica; nunca
  exibir usuário/senha/URL guardados) DEVEM ser mantidas. A ação primária
  DEVE ser "Salvar alterações".

**Visual e acessibilidade**

- **FR-022**: As duas telas DEVEM consumir os tokens V14 (cor, raio,
  espaçamento, tipografia, foco) — nenhum valor visual fixo no código da tela.
  Onde o protótipo usar um valor sem token equivalente, vale o token V14 mais
  próximo; o anel de foco segue ADR-007/V14 §11, não o do protótipo.
- **FR-023**: Todo controle das duas telas DEVE ter nome acessível; controles
  mock DEVEM seguir o padrão do `ComingSoon` (features 022/028): `aria-disabled`
  no controle, "Em breve" visível no painel e anunciado ao ativar ("Em breve —
  …") — "em breve" no nome acessível não é exigido, como aceita a verificação
  de nomes acessíveis da feature 028.
- **FR-024**: Nenhuma credencial, URL de lista ou URL de servidor guardada
  DEVE aparecer nos cartões da tela de listas.

### Key Entities

- **Lista (fonte IPTV)**: a entidade já existente; nesta feature só são lidos o
  nome, o tipo (Xtream ou M3U), os avisos e o estado da conta para compor o
  cartão. Nenhum dado novo é gravado.
- **Avatar da lista**: derivado, não persistido — iniciais do nome + par de
  cores escolhido de forma estável pela identidade da lista.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Lado a lado com o protótipo em 1920×1080, as duas telas têm os
  mesmos blocos, na mesma ordem e posição relativa, e os mesmos textos (salvo
  os ajustados por FR-004/FR-013/FR-014), conferido por captura de tela em
  cada estado (com listas, sem listas, carregando, erro, cadastro Xtream,
  cadastro M3U, edição).
- **SC-002**: Uma pessoa sem listas cadastra uma lista Xtream e chega à tela de
  progresso em no máximo 3 OK de navegação além do preenchimento dos campos
  (Adicionar lista → campos → Conectar e sincronizar).
- **SC-003**: 100 % dos controles das duas telas têm nome acessível e todo
  estado tem ao menos um elemento focável (verificado pela checagem de nomes
  acessíveis e pelos testes das telas).
- **SC-004**: Nenhum teste existente de comportamento da tela de listas, do
  cadastro e do fluxo de entrada (incluindo contratos travados das features
  023 e 026 e os scripts E2E de entrada) regride, salvo ajustes de texto
  previstos nesta spec.
- **SC-005**: Em nenhum estado há QR code, código de pareamento ou dado
  inventado apresentado como real.

## Assumptions

- O Splash atual (feature 023) fica como está; o protótipo não tem Splash e
  começa na tela de listas.
- A tela de progresso da importação fica como está (US4/FR-034..FR-036 da
  023).
- A precedência da ADR-011 vale: constitution > ADRs > Spec V14 > Component
  Lab > protótipo. Onde o protótipo conflitar com a Spec V14 (ex.: anel de
  foco branco, valores sem token), vale a Spec V14.
- O protótipo foi ajustado nesta data para refletir perfil = lista (título,
  cartão-botão "Adicionar lista" levando a `sourceSetup()`); ele é a
  referência visual desta feature.
- O Nome da lista continua obrigatório, como hoje; o campo abre vazio (não
  pré-preenchido com "Minha Lista Principal" como no protótipo), para não
  gravar um nome que a pessoa não escolheu.
- A feature 034 (estado e expiração da conta) está em execução e também toca o
  cartão da lista; esta feature deve incorporar os chips dela como estiverem
  quando for executada (dependência branda, mesma zona de código).

## Clarifications

### Sessão 2026-09-30

- Q: O que o cartão de cada lista deve mostrar? → A: Layout do protótipo
  (avatar com iniciais em gradiente, nome, selo do tipo) + avisos reais (Modo
  limitado e chips da 034) numa linha pequena abaixo do nome; a data de
  sincronização sai do cartão. (FR-005, FR-006)
- Q: Ações Ressincronizar/Editar/Excluir e "Gerenciar listas", que o
  protótipo não tem? → A: Manter a linha de ações via ↓ e trocar "Gerenciar
  listas" pelo botão "⚙ Configurações" no canto, que abre Configurações ›
  Fontes IPTV. (FR-008, FR-009)
- Q: Como tratar "Conectar com celular", que ainda não existe? → A: Layout
  fiel ao protótipo, com o painel do celular como mock "Em breve", sem QR nem
  código falsos; configuração manual Xtream/M3U é o caminho real. (FR-013,
  FR-014)
- Q: Depois de "Conectar e sincronizar", para onde a pessoa vai? → A: Tela de
  progresso atual, que termina em "Abrir lista". (FR-018)
- Q: Como fica a edição de uma lista? → A: Mesma tela nova, sem painel do
  celular e sem trocar o tipo; regras atuais de usuário/senha em branco.
  (FR-021)
- Q: Qual tipo vem selecionado ao abrir o cadastro? → A: Xtream Codes, como no
  protótipo. (FR-015)
- Q: Sem nenhuma lista, o que acontece ao abrir o app? → A: Tela de listas só
  com "Adicionar lista", em foco, com textos de primeiro uso. (FR-004, US3)
- Q: E com mais listas do que cabem? → A: Uma fileira centralizada que rola
  na horizontal acompanhando o foco; "Adicionar lista" sempre por último.
  (FR-010)
- Q: (Analyze do sdd-plan, A-01) Mock precisa de "em breve" no nome acessível
  **e** `aria-disabled`? → A: Não — segue o padrão do `ComingSoon`:
  `aria-disabled` + "Em breve" visível e anunciado. (FR-023)
- Q: (Analyze, A-02) A mensagem "Informe um nome de exibição para a fonte."
  fica com o rótulo novo "Nome da lista"? → A: Muda para "Informe um nome para
  a lista."; as demais mensagens ficam idênticas. (FR-018)
- Q: (Analyze, A-03) A edição mostra "Como funciona"? → A: Não; o painel
  manual ocupa a largura. (FR-021)
- Q: (Analyze, A-04) Como verificar SC-002? → A: Asserção no E2E do fluxo de
  primeiro uso contando os OK de navegação. (SC-002)
