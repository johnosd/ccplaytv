# Feature Specification: Gestão de categorias e controle parental

**Slug**: `066-categorias-controle-parental`

**Created**: 2026-10-09

**Status**: Convergida

**Input**: duas ideias do backlog escritas pelo usuário — "Incluir uma gestão de categorias nas configurações que permita o usuario, colocar senha em categorias ou esconder" e "incluir controle parental para canais adultos" — mais a parte de controle parental do antigo item 52 (pacote G6). Hoje a aba "Perfis & parental" de Configurações é um mock "Em breve" (`settings-parental`).

**Referências normativas**: constitution (foco em todo estado, segredo nunca exibido nem logado, categorias da fonte nunca substituídas, sem dado inventado); ADR-008 (tudo no aparelho); ADR-009 (navegação própria); ADR-011 (perfil = lista IPTV, mocks "Em breve"); V14 §11 (foco/desabilitado), §13 (navegação por categorias), §19/§45 (estados e erros), §37 (IME), §38 (ARIA), §40 (ciclo de vida), §41 (memória de foco); protótipo `settingsParental()` (PIN parental que "protege conteúdo e configurações").

## Escopo

### Incluído

- Uma tela de gestão em Configurações (a aba "Perfis & parental" passa a se chamar "Categorias & parental" e deixa de ser mock) com as categorias da **lista ativa**, separadas em Canais, Filmes e Séries.
- **Esconder** uma categoria: ela e seus itens somem de todo o app (exceto da tela de gestão). Não exige PIN.
- **Bloquear** uma categoria com PIN: ela continua na trilha com cadeado e só abre com o PIN; enquanto bloqueada, seus itens não aparecem em nenhum outro lugar do app.
- **PIN parental** único, de 4 dígitos, para o app inteiro: criado na primeira vez que a pessoa bloqueia algo; com ele ativo, protege a tela de gestão, a troca e o desligamento do PIN, e adicionar, editar e remover listas.
- Desbloqueio por sessão: o PIN certo libera as categorias bloqueadas da lista ativa até o app ir para segundo plano, fechar ou trocar de lista.
- **Sugestão de categorias adultas**: ao ligar o controle parental, as categorias cujo nome parece adulto vêm pré-marcadas para bloqueio, e a pessoa confirma. Com o controle ligado, uma categoria **nova** com nome adulto, trazida por uma atualização da lista, já chega bloqueada.
- **Recuperar o PIN** com os dados de uma lista cadastrada: usuário e senha (Xtream) ou o endereço completo (M3U por URL), conferidos no próprio aparelho.
- Desligar o controle parental (com o PIN): tira todos os bloqueios e mantém as categorias escondidas.
- Textos em pt/en/es.

### Fora de Escopo

- **Perfis de pessoa** (várias pessoas com preferências e limites próprios). O perfil continua sendo a lista IPTV (ADR-011).
- Bloqueio por **classificação indicativa** ("Classificação máxima" do protótipo): a classificação só existe para títulos casados com o TMDB, e um filtro parcial daria falsa sensação de proteção.
- Esconder ou bloquear **um item individual** (canal, filme ou série). Tudo é por categoria.
- **Reordenar ou renomear** categorias: nome e ordem continuam os da lista.
- Seções Esportes/Infantil (antigo item 53).
- Limite de tentativas de PIN errado: decisão do usuário, sem limite.
- Sincronizar preferências entre aparelhos, exportar ou fazer backup do PIN.
- Bloquear o app inteiro na abertura (PIN para abrir o app).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Esconder categorias que a pessoa não usa (Priority: P1)

A pessoa abre Configurações › Categorias & parental, vê as categorias da lista ativa em Canais, Filmes e Séries e marca as que não quer ver (ex.: canais de outro país). Elas somem da trilha, de "Todos", da busca, das fileiras do Início, Filmes e Séries, do guia e do zapping. Desmarcar traz tudo de volta.

**Why this priority**: é a parte de "gestão de categorias" pedida, não depende de PIN e já entrega valor sozinha: listas reais têm dezenas de categorias que a pessoa nunca usa.

**Independent Test**: esconder uma categoria de canais e uma de filmes, percorrer todas as superfícies (trilhas, "Todos", busca, Início, vitrines, guia, zapping, Continuar assistindo, Favoritos, Histórico) e não encontrar nenhum item delas; mostrar de novo e encontrá-los.

**Acceptance Scenarios**:

1. **Given** uma lista ativa com categorias, **When** a pessoa abre a gestão, **Then** vê as categorias de Canais, Filmes e Séries com o nome e a ordem da lista, cada uma com os estados Visível/Escondida e Livre/Bloqueada.
2. **Given** uma categoria de filmes visível, **When** a pessoa a esconde e volta a Filmes, **Then** a categoria não aparece na lista lateral nem nas fileiras, e nenhum filme dela aparece na busca, em "Todos", no Top 10, na Dica, em "Adicionados recentemente" ou em "Bem avaliados".
3. **Given** uma categoria de canais escondida, **When** a pessoa faz zapping (canal acima/abaixo) ou abre o guia, **Then** nenhum canal dela aparece nem é sintonizado.
4. **Given** um item de uma categoria escondida que estava em Favoritos, Histórico ou Continuar assistindo, **When** a pessoa abre essas listas, **Then** o item não aparece; **When** a categoria volta a ser visível, **Then** o item reaparece com o mesmo progresso e favorito (nada foi apagado).
5. **Given** todas as categorias de uma seção escondidas, **When** a pessoa abre a seção, **Then** vê um estado vazio que explica que as categorias estão escondidas e oferece ir à gestão, com foco num elemento.

---

### User Story 2 - Bloquear categorias com PIN (Priority: P1)

A pessoa bloqueia categorias (ex.: adultas). Na primeira vez, cria um PIN de 4 dígitos. A categoria bloqueada aparece com cadeado; entrar nela pede o PIN. Acertando, todas as categorias bloqueadas da lista ficam liberadas até o app ir para segundo plano, fechar ou trocar de lista. Enquanto bloqueadas, os itens delas não aparecem em busca, fileiras, "Todos", guia, zapping, Favoritos, Histórico ou Continuar assistindo. Com o PIN ativo, entrar na gestão e mexer nas listas também pede o PIN.

**Why this priority**: é o controle parental pedido; sem ele, esconder é só organização e qualquer pessoa desfaz.

**Independent Test**: bloquear uma categoria, criar o PIN, confirmar o cadeado, tentar entrar (pede PIN), errar (nega sem revelar nada), acertar (abre), mandar o app para segundo plano e voltar (bloqueada de novo).

**Acceptance Scenarios**:

1. **Given** nenhum PIN criado, **When** a pessoa marca a primeira categoria como Bloqueada, **Then** o app pede para criar um PIN de 4 dígitos e confirmá-lo; só depois disso o bloqueio vale.
2. **Given** uma categoria bloqueada, **When** a pessoa foca a categoria na trilha, **Then** vê o cadeado e nada é carregado da categoria; **When** dá SELECT, **Then** o app pede o PIN.
3. **Given** o pedido de PIN, **When** a pessoa digita um PIN errado, **Then** uma mensagem diz que o PIN está incorreto, o campo é limpo e o foco continua no campo; o PIN nunca é mostrado.
4. **Given** o PIN certo digitado, **When** a pessoa navega pela lista, **Then** todas as categorias bloqueadas dessa lista estão liberadas e seus itens aparecem em busca, fileiras e demais superfícies; **When** o app vai para segundo plano, fecha ou a pessoa troca de lista, **Then** tudo volta a ficar bloqueado.
5. **Given** o PIN ativo, **When** a pessoa abre Configurações › Categorias & parental, ou tenta adicionar, editar ou remover uma lista, **Then** o app pede o PIN antes.
6. **Given** o PIN ativo, **When** a pessoa desliga o controle parental digitando o PIN, **Then** todos os bloqueios saem, as categorias escondidas continuam escondidas e nada mais pede PIN.

---

### User Story 3 - Sugestão automática de categorias adultas (Priority: P2)

Ao ligar o controle parental, o app pré-marca para bloqueio as categorias cujo nome parece adulto (ex.: "XXX", "Adult", "+18"); a pessoa revisa e confirma. Depois disso, com o controle ligado, uma categoria nova com nome adulto que chegue numa atualização da lista já entra bloqueada.

**Why this priority**: listas grandes têm muitas categorias; achar as adultas à mão é trabalhoso e fácil de esquecer, e listas mudam com frequência (atualização a cada abertura, bug `lista-xtream-nao-atualiza-novos-filmes`).

**Independent Test**: com uma lista fictícia que tenha categorias "XXX Adultos" e "Filmes 18+", ligar o controle parental e ver as duas pré-marcadas; confirmar. Simular uma atualização que traga "Adult Live" e ver que ela chega bloqueada.

**Acceptance Scenarios**:

1. **Given** uma lista com categorias de nome adulto, **When** a pessoa liga o controle parental, **Then** essas categorias aparecem pré-marcadas para bloqueio, identificadas como sugestão, e nada é bloqueado antes de a pessoa confirmar.
2. **Given** a sugestão, **When** a pessoa desmarca uma categoria sugerida e confirma, **Then** ela fica livre e não volta a ser sugerida nesta lista.
3. **Given** o controle parental ligado, **When** uma atualização da lista traz uma categoria nova com nome adulto, **Then** ela chega bloqueada; categorias novas sem nome adulto chegam visíveis e livres.
4. **Given** nenhuma categoria com nome adulto, **When** a pessoa liga o controle parental, **Then** nada vem pré-marcado e o app diz isso, sem inventar sugestão.

---

### User Story 4 - Recuperar o PIN esquecido (Priority: P3)

Na tela do PIN, "Esqueci o PIN" pede os dados de uma lista cadastrada: usuário e senha (Xtream) ou o endereço completo (M3U por URL). Se baterem com o que está guardado no aparelho, a pessoa cria um PIN novo. Os bloqueios e as categorias escondidas continuam.

**Why this priority**: sem conta nem servidor, esquecer o PIN prenderia a pessoa fora da gestão; os dados da lista são algo que o dono da TV tem e uma criança, em geral, não.

**Independent Test**: com uma lista Xtream fictícia cadastrada, acionar "Esqueci o PIN", errar a senha (nega sem detalhe), acertar usuário e senha, criar PIN novo e entrar na gestão com ele.

**Acceptance Scenarios**:

1. **Given** o pedido de PIN, **When** a pessoa escolhe "Esqueci o PIN", **Then** o app pede os dados de uma lista cadastrada, explica que serve para criar um PIN novo e nunca mostra nenhum dado guardado.
2. **Given** usuário e senha que batem com uma lista Xtream cadastrada (ou o endereço completo de uma lista M3U), **When** a pessoa confirma, **Then** cria e confirma um PIN novo; bloqueios e escondidas ficam como estavam.
3. **Given** dados que não batem com nenhuma lista, **When** a pessoa confirma, **Then** uma mensagem genérica diz que os dados não conferem, sem dizer qual campo errou e sem repetir o que foi digitado.
4. **Given** a recuperação, **When** a pessoa confirma, **Then** nenhuma requisição de rede é feita: a conferência é só no aparelho.

---

### Edge Cases

- **Categoria removida e depois devolvida pela lista**: a preferência (escondida/bloqueada) volta junto, reconhecida pela mesma identidade da categoria (id do provedor; nome declarado em M3U).
- **Item em mais de uma categoria** (mesmo canal/filme em duas categorias): aparece pelas categorias visíveis e livres; só some quando todas as categorias em que está estão escondidas ou bloqueadas.
- **Conteúdo de categoria bloqueada tocando** quando o app vai para segundo plano: ao voltar, a reprodução não é retomada sem o PIN, e o foco vai para um elemento válido.
- **Zapping** a partir de um canal livre: pula canais de categorias escondidas ou bloqueadas, nos dois sentidos; nunca sintoniza um deles.
- **Número do canal**: continua sendo a posição na lista (ADR-011); esconder canais não renumera os outros.
- **"★ Favoritos", "↺ Histórico" e "Todos"** fixos na trilha: nunca listam itens de categoria escondida, nem de bloqueada sem desbloqueio.
- **Categoria escondida e bloqueada ao mesmo tempo**: some do app (escondida prevalece); continua bloqueada na gestão.
- **Duas listas cadastradas**: as preferências de categoria são por lista; o PIN é um só. Trocar de lista sempre volta a bloquear.
- **Lista sem categorias** ou ainda sem estrutura: a gestão mostra estado vazio com elemento focável.
- **Busca** pelo nome exato de um item escondido ou bloqueado: nenhum resultado e nenhuma dica de que existe.
- **PIN fraco** (ex.: 0000, 1234): aceito; é decisão da pessoa.
- **Nome que parece adulto mas não é** (ex.: "Adult Swim" de desenhos): sugerido ou bloqueado ao chegar, e a pessoa libera na gestão; desmarcada uma vez, não volta a ser sugerida nesta lista.
- **Dados da conta mudados no painel** depois do cadastro: a recuperação confere com o que está guardado no aparelho, não com o painel.
- **Trava no foco**: toda tela nova (gestão, criar PIN, pedir PIN, recuperar) tem elemento focável em carregando, vazio e erro; RETURN fecha a camada e devolve o foco à origem.

## Requirements *(mandatory)*

### Functional Requirements

**Gestão**

- **FR-001**: Configurações DEVE ter a aba "Categorias & parental" no lugar do mock "Perfis & parental", e o mock `settings-parental` DEVE sair do registro de "Em breve".
- **FR-002**: A gestão DEVE listar as categorias da lista ativa separadas em Canais, Filmes e Séries, com o nome e a ordem que a lista declara, e para cada uma os estados Visível/Escondida e Livre/Bloqueada.
- **FR-003**: Mudar um estado na gestão DEVE valer na hora para todas as telas, sem recarregar a lista nem pedir nada à rede.
- **FR-004**: As preferências DEVEM ficar guardadas no aparelho, por lista e por categoria, ligadas à identidade estável da categoria (id do provedor; nome declarado em M3U), e sobreviver a fechar o app e a atualizações da lista.
- **FR-005**: Remover uma lista DEVE apagar as preferências de categoria dela.

**Esconder**

- **FR-006**: Esconder uma categoria NÃO DEVE exigir PIN quando nenhum PIN estiver ativo.
- **FR-007**: Uma categoria escondida e seus itens NÃO DEVEM aparecer em: trilhas de categorias, "Todos", "★ Favoritos", "↺ Histórico", busca local e global, fileiras do Início, de Filmes e de Séries (incluindo Top 10, Dica, "Adicionados recentemente", "Bem avaliados", "Porque você assistiu" e Continuar assistindo), guia de programação e zapping. Só a gestão a mostra.
- **FR-008**: Esconder NÃO DEVE apagar favoritos, histórico nem progresso dos itens; mostrar de novo os devolve como estavam.
- **FR-009**: Com todas as categorias de uma seção escondidas, a seção DEVE mostrar estado vazio que explica isso e oferece ir à gestão, com foco num elemento.

**PIN e bloqueio**

- **FR-010**: Bloquear a primeira categoria DEVE exigir criar um PIN de 4 dígitos, digitado duas vezes iguais; sem PIN criado, nenhuma categoria fica bloqueada.
- **FR-011**: Existe um único PIN para o app inteiro, valendo para todas as listas.
- **FR-012**: O PIN NÃO DEVE ser exibido, logado, incluído em mensagem de erro nem enviado a qualquer lugar; o aparelho DEVE guardá-lo de forma que não seja lido de volta em texto.
- **FR-013**: Uma categoria bloqueada DEVE aparecer na trilha com cadeado e nome acessível que diga "bloqueada"; focá-la NÃO DEVE carregar nem pedir à rede nada dela; SELECT DEVE pedir o PIN.
- **FR-014**: Enquanto bloqueada (sem desbloqueio na sessão), os itens da categoria NÃO DEVEM aparecer nas superfícies listadas no FR-007, fora da própria categoria.
- **FR-015**: O PIN certo DEVE liberar todas as categorias bloqueadas da lista ativa até o primeiro destes eventos: o app ir para segundo plano, fechar, ou a pessoa trocar de lista. Depois disso, tudo volta a bloquear.
- **FR-016**: PIN errado DEVE mostrar "PIN incorreto", limpar o campo e manter o foco nele, sem limite de tentativas e sem espera.
- **FR-017**: Com o PIN ativo, DEVEM pedir o PIN antes: entrar na gestão de categorias, trocar o PIN, desligar o controle parental, adicionar lista, editar lista e remover lista. Um PIN certo na gestão vale para tudo dentro dela até a pessoa sair da gestão.
- **FR-018**: O PIN DEVE poder ser digitado com as teclas numéricas do controle e com um teclado numérico na tela navegável pelo direcional, sem depender do teclado do sistema.
- **FR-019**: Desligar o controle parental (com o PIN) DEVE apagar o PIN e tirar todos os bloqueios de todas as listas, mantendo as categorias escondidas.
- **FR-020**: Conteúdo de categoria bloqueada que estava tocando quando o app foi para segundo plano NÃO DEVE ser retomado ao voltar sem o PIN.
- **FR-021**: O zapping DEVE pular canais de categorias escondidas e de bloqueadas sem desbloqueio, nos dois sentidos, sem renumerar canais.

**Sugestão adulta**

- **FR-022**: Ao ligar o controle parental, as categorias cujo nome parece adulto DEVEM vir pré-marcadas para bloqueio e identificadas como sugestão; nada é bloqueado antes da confirmação da pessoa.
- **FR-023**: A detecção de "nome adulto" DEVE usar só o nome que a lista declara (nunca dado externo) e uma lista de termos fixa, documentada no plano, que cubra pelo menos "XXX", "adult", "adulto(s)", "+18" e "18+", sem diferenciar maiúsculas e acentos.
- **FR-024**: Uma categoria sugerida que a pessoa desmarcou NÃO DEVE ser sugerida de novo nem chegar bloqueada depois, naquela lista.
- **FR-025**: Com o controle parental ligado, uma categoria nova com nome adulto, trazida por uma atualização da lista, DEVE chegar bloqueada; categorias novas sem nome adulto chegam visíveis e livres.
- **FR-026**: Sem categoria de nome adulto, ligar o controle parental DEVE dizer que nenhuma foi encontrada, sem pré-marcar nada.

**Recuperação**

- **FR-027**: A tela de PIN DEVE oferecer "Esqueci o PIN", que pede usuário e senha de uma lista Xtream cadastrada ou o endereço completo de uma lista M3U cadastrada.
- **FR-028**: A conferência DEVE ser feita só no aparelho, contra os dados guardados das listas, sem nenhuma requisição de rede.
- **FR-029**: Dados que batem DEVEM levar a criar e confirmar um PIN novo, mantendo bloqueios e escondidas; dados que não batem DEVEM gerar mensagem genérica, sem dizer qual campo errou e sem repetir o que foi digitado.
- **FR-030**: Nenhum dado de lista (usuário, senha, endereço) DEVE ser exibido, logado ou ecoado em mensagem durante a recuperação.

**Transversais**

- **FR-031**: Toda tela nova (gestão, criar/pedir/trocar PIN, recuperação, confirmação da sugestão) DEVE ter ao menos um elemento focável em carregando, vazio e erro; RETURN DEVE fechar a camada e devolver o foco à origem, reconciliado por id.
- **FR-032**: Todo texto novo DEVE estar em pt/en/es; nomes de categoria nunca são traduzidos.
- **FR-033**: Nomes e ordem das categorias NUNCA são alterados; esconder e bloquear não substituem a taxonomia da lista.
  **Emenda (2026-10-09, pedido do usuário durante a execução):** exceção única — nas trilhas de TV ao vivo, Filmes e Séries, as categorias **bloqueadas pelo controle parental** vão para o fim, na ordem relativa da lista, e ficam lá mesmo com a sessão desbloqueada. Sem controle parental, a ordem é a da lista. Nomes nunca mudam, a gestão mostra a ordem da lista, e o número do canal continua o da ordem da lista (ADR-011 §6). Ver D-013 no plano.
- **FR-035** *(emenda de 2026-10-10, pedido do usuário)*: Conteúdo adulto NUNCA aparece no ↺ Histórico nem no Continuar assistindo — padrão, sem configuração, com ou sem controle parental e mesmo com o PIN digitado. É adulto o item de categoria com nome adulto (FR-023), o item que a lista marca como adulto (`is_adult` do painel Xtream, quando vier) e o item de categoria que a pessoa bloqueou. A reprodução continua gravada no aparelho (o filme retoma de onde parou); só não é mostrada nessas listas, e não conta como "reprodução sem correspondência".
- **FR-034**: Visual novo DEVE usar só os tokens do V14 e o padrão de IME/teclado numérico do V14 §37.

### Key Entities *(include if feature involves data)*

- **Preferência de categoria**: lista, seção (canal/filme/série), identidade estável da categoria, escondida (sim/não), bloqueada (sim/não), origem do bloqueio (pessoa ou sugestão aceita/chegada automática), sugestão recusada (sim/não).
- **PIN parental**: um por aparelho; guardado de forma que não seja lido de volta em texto; existe ou não existe (controle parental ligado/desligado).
- **Desbloqueio da sessão**: lista desbloqueada no momento; só em memória, nunca guardado; some ao ir para segundo plano, fechar ou trocar de lista.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com uma categoria de canais e uma de filmes escondidas, um roteiro que percorre todas as superfícies do FR-007 encontra **zero** itens delas; mostrando-as de novo, os itens voltam com favorito e progresso intactos.
- **SC-002**: Em 100% das tentativas, entrar numa categoria bloqueada sem desbloqueio na sessão pede o PIN, e nenhum item dela aparece fora dela.
- **SC-003**: Depois do PIN certo, ir para segundo plano e voltar, fechar e reabrir, ou trocar de lista bloqueia de novo em 100% dos casos.
- **SC-004**: Esconder uma categoria a partir do Início leva no máximo 10 pressionamentos do controle, sem teclado do sistema.
  **Emenda (2026-10-09, decisão do usuário no E2E):** a gestão fica em Configurações › Categorias & parental, e o caminho mínimo medido do Início é 16 teclas (topbar até a engrenagem, OK, abas, seção, categoria, OK). A meta passa a ser **no máximo 16 teclas**; um atalho na trilha foi considerado e não adotado. Ver R-014 no plano.
- **SC-005**: Com uma lista fictícia com 3 categorias de nome adulto e 10 comuns, ligar o controle parental pré-marca exatamente as 3; uma atualização que acrescente 1 categoria adulta e 1 comum faz a adulta chegar bloqueada e a comum livre.
- **SC-006**: Recuperar o PIN não faz nenhuma requisição de rede, e nenhuma tela, mensagem ou log mostra PIN, usuário, senha ou endereço de lista.
- **SC-007**: Nenhuma tela nova deixa o foco sem destino em carregando, vazio ou erro (verificado por teste de cada estado).

## Assumptions

- Quem configura é o dono da TV; o PIN protege contra crianças e visitantes, não contra quem tem acesso aos dados da lista ou pode apagar os dados do app pela TV.
- As preferências e o PIN ficam só no aparelho (ADR-008) e não entram em exportação ou backup (não existe hoje).
- A identidade estável da categoria é a mesma que a atualização da lista já usa para casar categorias (id do provedor; nome em M3U, feature 038).
- Contagens de uma lista em Configurações › Fontes IPTV continuam mostrando o que a lista declara; esconder não muda esse número.
- A lista de termos "adultos" do FR-023 é conservadora e pode ter falso positivo (ex.: "Adult Swim"); a pessoa corrige na gestão.
- O ciclo de vida (feature 020) já para a reprodução quando o app vai para segundo plano; esta feature só garante que não retome conteúdo bloqueado sem PIN.

## Clarifications

### Sessão 2026-10-09

- Q: O que a pessoa pode fazer com cada categoria? → A: Esconder e bloquear, ações independentes.
- Q: Como funciona o PIN? → A: Um PIN de 4 dígitos para o app inteiro, criado ao bloquear a primeira categoria; protege também a gestão.
- Q: Como tratar categorias adultas? → A: Sugerir pela palavra no nome; a pessoa confirma.
- Q: Perfis de pessoa entram? → A: Não; perfil continua sendo a lista (ADR-011).
- Q: Uma categoria escondida some de onde? → A: De todo o app, inclusive Favoritos, Histórico e Continuar assistindo; só a gestão mostra.
- Q: Como se comporta uma categoria bloqueada? → A: Visível na trilha com cadeado; seus itens não aparecem em nenhum outro lugar enquanto bloqueada.
- Q: Quanto dura o desbloqueio? → A: Até o app ir para segundo plano, fechar ou trocar de lista; vale para todas as bloqueadas da lista ativa.
- Q: O que mais o PIN protege? → A: Gestão de categorias e PIN; adicionar, editar e remover listas. Limpar histórico em Privacidade não.
- Q: E se esquecer o PIN? → A: Recuperar com os dados de uma lista cadastrada (decisão do usuário, no lugar de "sem recuperação").
- Q: Categoria nova com nome adulto numa atualização, com o controle ligado? → A: Chega bloqueada.
- Q: Onde fica a gestão? → A: Configurações, na aba parental (renomeada); sem atalho na trilha.
- Q: PIN errado várias vezes? → A: Sem limite (decisão do usuário).
- Q: Recuperação para lista M3U? → A: Xtream com usuário e senha; M3U com o endereço completo; conferido no aparelho.
- Q: Esconder exige PIN? → A: Não; com PIN ativo, só a entrada na gestão pede o PIN.
- Q: Desligar o controle parental? → A: Desbloqueia tudo e mantém as escondidas.
- Q: Classificação indicativa entra? → A: Não, fica para depois.
- Q: Esconder/bloquear item individual? → A: Não, só categoria.
- Q: Reordenar/renomear categorias? → A: Não.
