# Feature Specification: Import e catálogo client-first, sem backend sempre-ligado

**Slug**: `005-import-catalogo-client-first`

**Created**: 2026-09-19

**Status**: Planejada

**Input**: ADR-008 (arquitetura client-first) — o app deve funcionar sem
nenhuma infraestrutura própria ligada 24x7, nem PC nem VPS. A verificação
na TV física em 19/09/2026 mostrou que o navegador do aparelho consegue
falar direto com o painel Xtream real (`status=200`, 498 bytes, sem
bloqueio de CORS), removendo a incerteza que sustentava a arquitetura de
backend dedicado.

## Escopo

Mover para o próprio aparelho o que hoje só existe no backend: obter a
lista da fonte, interpretá-la, guardar o catálogo e servi-lo às telas.
Depois desta feature, usar o CCPlayTv no dia a dia não exige nenhum
processo rodando em outro lugar.

O valor não é uma tela nova — é o app deixar de depender de algo que
alguém precisa manter ligado, sem perder qualidade nem velocidade
perceptível.

### Incluído

- **Obtenção direta pelo aparelho**, sem intermediário: painel de provedor
  (protocolo JSON) e lista por URL M3U.
- **Interpretação e classificação no aparelho**: o que hoje o backend faz
  ao ler M3U e ao conversar com o painel passa a acontecer localmente.
- **Catálogo guardado no próprio aparelho**, substituindo o banco do
  backend como fonte de verdade do que as telas leem.
- **Credencial do provedor guardada no aparelho**, autorizada pela ADR-008
  e pela exceção registrada na constitution v1.2.0 — é o que permite
  reautenticar sem backend.
- **Reprodução resolvida localmente**: a informação necessária para tocar
  um canal é montada no aparelho, não pedida a um servidor.
- **Frescor decidido localmente**: migração de fonte antiga, atualização
  por idade e ressincronização explícita passam a ser decisão do próprio
  app.
- **Processamento e leitura por partes**: nem a importação nem a navegação
  podem exigir o catálogo inteiro carregado de uma vez.
- **Gate de performance medido na TV física** antes de qualquer descarte
  do caminho atual.
- **Detecção de provedor que recusa conexão direta**, com explicação clara.

### Fora de Escopo

- **Remover o backend Python**: ele congela — para de evoluir, continua no
  repositório e testado, e permanece disponível como contorno para
  provedor que recuse conexão direta (ADR-008, item 6). Nenhuma decisão
  desta feature apaga esse código.
- **Importar filmes, séries e episódios**: hoje o backend grava ~321 mil
  itens da fonte real, mas as telas de Filmes e Séries ainda mostram dados
  fictícios — ou seja, ~99% desse volume é gravado e nunca lido. Esta
  feature importa **apenas canais**. VOD e séries entram quando as telas
  reais existirem (itens 9 e 10 do backlog), com o custo avaliado ali.
- **Telas de Filmes e Séries reais** — continuam como estão.
- **TMDB, voz/OpenAI e controle por celular** — a ADR-008 já definiu que
  cabem no modelo client-first com a chave do próprio usuário, mas nenhum
  deles é construído aqui.
- **Favoritos e histórico** — não existem ainda; continuam fora.
- **Migrar o catálogo já importado** para o aparelho: a fonte é
  re-obtenível e não há preferência do usuário a preservar, então a pessoa
  simplesmente importa de novo.
- **Implementar o contorno auto-hospedado** para provedor que bloqueia
  conexão direta: esta feature apenas **detecta e explica** a situação.
- **Seleção de arquivo `.m3u` local** (item 23 do backlog) — continua fora.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber se o aparelho aguenta, antes de descartar o que funciona (Priority: P1)

Como responsável pelo projeto, quero medir no aparelho real quanto custa
obter, interpretar e guardar um catálogo localmente, para decidir com
números se a migração se sustenta — antes de abrir mão de um caminho que
hoje funciona.

**Why this priority**: é o único risco capaz de invalidar a feature
inteira. A ADR-008 registra que o desempenho de processar catálogo grande
no aparelho nunca foi medido. Descobrir isso depois da reescrita seria
perder o trabalho e o caminho antigo ao mesmo tempo.

**Independent Test**: executar o processamento local contra as duas fontes
reais (painel de provedor e URL M3U grande) no aparelho de referência,
registrar tempo, comportamento de memória e resposta do controle remoto, e
comparar com as metas declaradas.

**Acceptance Scenarios**:

1. **Given** a fonte de provedor real, **When** a importação local roda no
   aparelho, **Then** os números de tempo e responsividade são registrados
   e comparados com as metas, com veredito explícito de aprovado ou
   reprovado.
2. **Given** a lista M3U grande real, **When** a importação local roda,
   **Then** o mesmo registro acontece — inclusive quando o resultado é
   reprovação.
3. **Given** qualquer meta não atingida, **When** o veredito é reprovado,
   **Then** o trabalho **para** e as opções de caminho são apresentadas
   com o custo de cada uma, sem seguir para a reescrita por inércia.
4. **Given** o veredito aprovado, **When** as demais stories começam,
   **Then** elas partem do mesmo processamento já medido, não de uma
   reimplementação diferente.

---

### User Story 2 - Usar uma lista de provedor sem nada ligado além da TV (Priority: P1)

Como usuário, cadastro minha lista por endereço, usuário e senha, e
navego e assisto aos canais com a TV conversando direto com o provedor —
sem depender de computador ligado nem serviço contratado.

**Why this priority**: é a razão da feature existir e o caminho principal
do produto. É também o caso mais leve, porque o painel entrega só os
canais pedidos.

**Independent Test**: com o backend **desligado**, cadastrar a fonte de
provedor, acompanhar a importação, abrir a lista de canais e reproduzir um
canal no aparelho.

**Acceptance Scenarios**:

1. **Given** o backend desligado, **When** a pessoa cadastra uma fonte de
   provedor com credenciais válidas, **Then** a importação acontece e
   conclui usando apenas o aparelho.
2. **Given** a importação concluída, **When** a pessoa abre a lista de
   canais, **Then** vê os canais agrupados pelas categorias declaradas
   pelo provedor, preservando nome e ordem.
3. **Given** um canal na lista, **When** a pessoa seleciona para assistir,
   **Then** ele reproduz, com a informação de reprodução resolvida no
   próprio aparelho.
4. **Given** o app fechado e reaberto, **When** a pessoa volta à lista,
   **Then** o catálogo continua disponível sem nova importação e sem
   nenhuma consulta ao provedor.
5. **Given** credenciais recusadas ou assinatura expirada, **When** a
   importação tenta, **Then** a explicação distingue os dois casos, sem
   mostrar senha nem endereço completo em tela.

---

### User Story 3 - Usar uma lista por URL grande sem nada ligado além da TV (Priority: P2)

Como usuário de uma lista por URL, importo e uso meu catálogo no aparelho
mesmo quando o arquivo é grande, sem a TV travar nem o app fechar sozinho.

**Why this priority**: é o caso pesado e o que mais ameaça a qualidade
percebida. Diferente do painel de provedor, uma lista por URL obriga o
aparelho a **baixar e interpretar o arquivo inteiro** para só então
separar os canais — o custo de leitura não diminui por guardarmos menos.
Depende da US2 estar de pé, por isso P2.

**Independent Test**: com o backend desligado, importar a URL M3U real
(centenas de milhares de entradas) no aparelho e navegar o resultado.

**Acceptance Scenarios**:

1. **Given** uma lista por URL com centenas de milhares de entradas,
   **When** a importação roda no aparelho, **Then** ela conclui dentro da
   meta de tempo declarada e grava apenas os canais.
2. **Given** a importação em andamento, **When** a pessoa usa o controle
   remoto, **Then** a navegação continua respondendo e o foco nunca fica
   preso.
3. **Given** uma lista que excede o espaço disponível no aparelho,
   **When** o limite é atingido, **Then** o app mantém utilizável o que já
   existia, explica que a lista não coube inteira e **não** apresenta o
   resultado como completo.
4. **Given** uma importação interrompida no meio (app fechado, rede caiu),
   **When** a pessoa volta, **Then** o catálogo anterior continua
   utilizável e nada parcial aparece como pronto.

---

### User Story 4 - Catálogo em dia sem depender de servidor (Priority: P2)

Como usuário, meu catálogo continua atualizado sem que eu precise lembrar
de nada e sem que nada precise ficar ligado esperando por isso.

**Why this priority**: preserva um comportamento que já existe hoje
(migração única, atualização por idade, ressincronização explícita) — se
sumir na migração, o produto regride. Mas só faz sentido depois que
importar e ler localmente funcionarem.

**Independent Test**: com o backend desligado, abrir uma fonte
recém-importada (nada deve ser baixado), envelhecer a marca de
sincronização e abrir de novo (deve atualizar sozinho em segundo plano), e
usar a ação explícita de ressincronizar.

**Acceptance Scenarios**:

1. **Given** uma fonte sincronizada há pouco, **When** a pessoa abre a
   lista, **Then** nenhuma consulta ao provedor é disparada.
2. **Given** uma fonte cuja última sincronização passou do prazo, **When**
   a pessoa abre a lista, **Then** a atualização começa sozinha em segundo
   plano e o catálogo atual continua navegável.
3. **Given** uma atualização em segundo plano que termina enquanto a
   pessoa navega, **When** o catálogo é substituído, **Then** a lista não
   salta e o item em foco continua em foco.
4. **Given** uma atualização que falha, **When** o erro acontece, **Then**
   o catálogo anterior permanece intacto e a marca de última
   sincronização bem-sucedida não avança.
5. **Given** a ação de ressincronizar, **When** a pessoa a aciona, **Then**
   a atualização acontece na hora, sem esperar prazo.

---

### User Story 5 - Provedor que recusa conexão direta (Priority: P3)

Como usuário de um provedor que não aceita conexão direta do aparelho,
entendo o que aconteceu e o que posso fazer, em vez de ver um erro
genérico.

**Why this priority**: o teste real confirmou um provedor que aceita, mas
não há garantia de que todos aceitem. Sem isso, essas pessoas ficam com
uma falha inexplicável — mas é o caso menos frequente esperado, e depende
do caminho principal existir.

**Independent Test**: apontar uma fonte para um endereço que recuse a
conexão direta do aparelho e conferir a mensagem e as saídas oferecidas.

**Acceptance Scenarios**:

1. **Given** um provedor que recusa a conexão direta, **When** a
   importação tenta, **Then** o app explica que aquele provedor não aceita
   conexão direta deste aparelho, distinguindo isso de "sem internet" e de
   "senha errada".
2. **Given** essa explicação em tela, **When** a pessoa a lê, **Then** há
   pelo menos um caminho focável para sair da situação, sem prender o
   controle remoto.

### Edge Cases

- **Lista por URL que é um manifesto de streaming, não um catálogo**: a
  distinção existente precisa continuar valendo no aparelho.
- **Arquivo de lista muito maior que o esperado**: o aparelho precisa
  conseguir interromper com explicação, em vez de consumir memória até
  fechar sozinho.
- **Espaço de armazenamento do aparelho esgotado no meio da gravação**:
  o que já era utilizável continua utilizável; o resultado incompleto
  nunca é apresentado como completo.
- **Duas importações da mesma fonte disparadas em sequência rápida**:
  continua valendo uma importação por fonte de cada vez.
- **App fechado no meio de uma importação**: ao reabrir, nada parcial
  aparece como pronto, e o catálogo anterior continua servindo.
- **Categoria declarada com nome vazio**: tratada como a fonte declarou,
  nunca substituída por rótulo inventado.
- **Canal sem identificador do provedor**: continua acessível, sem
  identidade forjada.
- **Fonte que nunca sincronizou com sucesso**: não tem idade a comparar;
  é tratada como pendente, não como "velha".
- **Troca de credencial de uma fonte já importada**: o resultado de
  autenticação anterior deixa de valer e a fonte precisa ser verificada de
  novo.
- **Relógio do aparelho errado**: a decisão por idade não pode disparar
  reimportação em loop nem travar para sempre por causa disso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app DEVE obter os dados da fonte (painel de provedor e URL
  M3U) diretamente do aparelho, sem intermediário próprio.
- **FR-002**: O app DEVE interpretar e classificar as entradas obtidas no
  próprio aparelho, preservando as categorias declaradas pela fonte em
  nome e ordem.
- **FR-003**: O app DEVE guardar o catálogo no próprio aparelho, e as
  telas DEVEM ler dali — não de um serviço externo.
- **FR-004**: A importação NÃO DEVE exigir que o catálogo inteiro esteja
  carregado de uma vez: a gravação acontece em partes, à medida que os
  dados são interpretados.
- **FR-005**: A navegação NÃO DEVE exigir o catálogo inteiro carregado de
  uma vez: as telas leem apenas a parte que exibem.
- **FR-006**: Durante uma importação, o app DEVE continuar respondendo ao
  controle remoto, e o catálogo anterior DEVE continuar navegável.
- **FR-007**: Uma importação concluída DEVE substituir o catálogo daquela
  fonte; uma que falhe ou seja interrompida NÃO DEVE destruir o anterior
  nem expor resultado parcial como completo.
- **FR-008**: Esta feature DEVE importar apenas canais. Entradas de outros
  tipos NÃO DEVEM ser gravadas, e essa limitação NÃO DEVE ser apresentada
  como catálogo completo da fonte.
- **FR-009**: A credencial do provedor DEVE ser guardada no aparelho de
  forma que permita reautenticar sem intervenção, e NÃO DEVE aparecer em
  tela depois de informada, em registro de diagnóstico, nem em qualquer
  canal de exportação.
- **FR-010**: A informação necessária para reproduzir um canal DEVE ser
  resolvida no aparelho, sem consulta a serviço próprio.
- **FR-011**: O app DEVE distinguir, para o usuário, credencial recusada,
  assinatura expirada, provedor que recusa conexão direta, e falha de
  rede — quatro situações com explicações diferentes.
- **FR-012**: Abrir uma fonte já sincronizada e dentro do prazo NÃO DEVE
  disparar nenhuma consulta ao provedor.
- **FR-013**: Abrir uma fonte cuja última sincronização bem-sucedida seja
  mais antiga que o prazo definido DEVE disparar atualização em segundo
  plano, mantendo o catálogo atual navegável.
- **FR-014**: A ação explícita de ressincronizar DEVE continuar disponível
  e imediata, independente da idade da fonte.
- **FR-015**: A substituição de catálogo em segundo plano NÃO DEVE
  desorganizar a navegação: foco e posição são reconciliados por
  identidade do item, nunca por posição na lista.
- **FR-016**: Uma atualização que falhe NÃO DEVE avançar a marca de última
  sincronização bem-sucedida nem transformar uma fonte saudável em fonte
  com erro.
- **FR-017**: NÃO DEVE existir mais de uma importação simultânea para a
  mesma fonte.
- **FR-018**: Quando o espaço de armazenamento do aparelho não comportar o
  catálogo, o app DEVE preservar o que já era utilizável e declarar
  explicitamente que a lista não coube inteira.
- **FR-019**: O app DEVE continuar reconhecendo a diferença entre um
  catálogo e um manifesto de streaming ao interpretar uma lista por URL.
- **FR-020**: Alterar a credencial de uma fonte já importada DEVE invalidar
  o resultado de autenticação anterior, exigindo nova verificação na
  próxima abertura.
- **FR-021**: O caminho atual por backend NÃO DEVE ser removido nem
  quebrado por esta feature; ele permanece disponível e testado como
  contorno.
- **FR-022**: O desempenho declarado nos critérios mensuráveis DEVE ser
  verificado no aparelho de referência antes de qualquer story de
  migração ser considerada concluída. Meta não atingida **interrompe** o
  trabalho e exige decisão explícita, com as opções e seus custos
  apresentados.

### Key Entities

- **Fonte** — o que a pessoa cadastrou (tipo, nome de exibição, endereço,
  credencial, estado de conexão, marca de última sincronização
  bem-sucedida, modo de importação). Passa a viver no aparelho. A
  credencial é parte dela, com o tratamento de segredo de FR-009.
- **Item de catálogo (canal)** — nome, categoria declarada pela fonte,
  identificador estável do provedor quando existir, e o necessário para
  montar a reprodução. Passa a viver no aparelho, gravado e lido por
  partes.
- **Importação** — o trabalho de obter, interpretar e gravar, com etapa
  atual, contadores reais e resultado. Deixa de ser um registro de
  servidor e passa a ser estado local observável pela tela de progresso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o backend desligado, é possível cadastrar uma fonte de
  provedor, importar, navegar e reproduzir um canal — ciclo completo, no
  aparelho de referência.
- **SC-002**: Com o backend desligado, é possível importar e navegar uma
  lista por URL grande (centenas de milhares de entradas).
- **SC-003**: A importação de uma lista de provedor (ordem de milhares de
  canais) conclui em até **30 segundos** no aparelho de referência.
- **SC-004**: A importação de uma lista por URL de centenas de milhares de
  entradas conclui em até **2 minutos** no aparelho de referência.
- **SC-005**: Durante toda a importação, a navegação por controle remoto
  responde em até **200 ms** por comando, e o foco nunca fica preso.
- **SC-006**: Durante e após a importação, o app **não** é encerrado, não
  recarrega sozinho e não perde o catálogo anterior — verificado nas duas
  fontes reais.
- **SC-007**: Abrir a lista de canais com o catálogo já gravado mostra
  conteúdo em até **3 segundos**, sem consulta ao provedor.
- **SC-008**: Rolar a lista de canais até o fim não apresenta travamento
  perceptível nem perda de foco.
- **SC-009**: Nenhuma credencial, senha ou endereço completo de servidor
  aparece em tela ou em registro de diagnóstico, num ciclo de sucesso
  **e** num de falha.
- **SC-010**: As categorias exibidas correspondem, em nome e ordem, às
  declaradas pela fonte, em 100% dos casos verificados.
- **SC-011**: Fonte dentro do prazo abre sem nenhuma consulta ao provedor;
  fonte fora do prazo dispara atualização e permanece navegável durante
  ela. Os dois casos verificados.
- **SC-012**: Uma atualização concluída em segundo plano não faz a lista
  saltar nem perde o item em foco — verificado com a pessoa navegando no
  momento da troca.
- **SC-013**: Nenhuma fonte que era importável pelo caminho atual deixa de
  ser importável depois desta feature.
- **SC-014**: Os números de SC-003 a SC-008 são registrados a partir de
  execução observada no aparelho de referência, não de estimativa nem de
  medição em navegador de mesa.

## Assumptions

- O painel do provedor de teste aceita conexão direta do aparelho —
  confirmado em 19/09/2026 (`status=200`, 498 bytes). Não se presume que
  todo provedor aceite; é o que a US5 endereça.
- A fonte de teste por URL tem cerca de 311 mil entradas, das quais cerca
  de 2,3 mil são canais. O custo de leitura recai sobre o total; o custo
  de gravação, apenas sobre os canais.
- Favoritos e histórico não existem, então substituir o catálogo continua
  seguro — a mesma janela que a feature 004 aproveitou.
- O aparelho de referência é a Samsung QN50Q60DAGXZD. Nenhuma outra TV é
  presumida equivalente em desempenho ou em espaço de armazenamento.
- O prazo de atualização por idade permanece o mesmo em vigor hoje (24
  horas); mudá-lo é ajuste de configuração, não desta feature.
- O backend atual permanece disponível durante todo o desenvolvimento,
  permitindo comparar comportamento e voltar atrás sem perda.

## Clarifications

### Sessão 2026-09-19

- Q: Como entregar a migração, dado que a performance é a maior incógnita?
  → A: Prova de performance primeiro, como entrega P1 — o gate decide
  antes de qualquer descarte do caminho atual.
- Q: O que acontece com o backend Python? → A: Congela e fica como
  fallback opcional; não é removido nem evoluído.
- Q: Qual o limite de performance aceitável para importar uma lista
  grande? → A: Até ~2 minutos, com a tela navegável durante todo o tempo.
- Q: O catálogo já importado deve ser migrado para o aparelho? → A: Não —
  a pessoa re-importa; a fonte é re-obtenível e não há preferência a
  preservar.
- Q: O que importar, dado que as telas de Filmes/Séries ainda são
  fictícias? → A: Apenas canais. Reduz o volume gravado de ~321 mil para
  ~2,3 mil itens; VOD e séries entram quando as telas reais existirem.
- Q: O que fazer quando o catálogo não couber no espaço do aparelho? → A:
  Não basta tratar o erro — a arquitetura precisa lidar com volume por
  partes (carregar/gravar em pedaços) em vez de depender de caber tudo de
  uma vez. Virou FR-004, FR-005 e FR-018.
- Q: Se a medição reprovar a meta, como proceder? → A: Parar o trabalho e
  apresentar as opções medidas com o custo de cada uma, sem seguir por
  inércia. Virou FR-022 e o cenário 3 da US1.

### Nota de risco técnico levantada na especificação

O custo de uma lista por URL **não** cai por importarmos menos. O painel
de provedor entrega os canais já separados (a fonte real devolve ~2,3 mil
itens nessa consulta), mas uma lista por URL é um arquivo único: o
aparelho precisa baixá-lo e interpretá-lo por inteiro — centenas de
milhares de entradas — para só então descartar o que não é canal. Por
isso SC-003 e SC-004 têm metas diferentes, e por isso a US1 mede as duas
fontes separadamente: é plausível que o caminho de provedor passe
folgado e o caminho por URL seja o que force uma decisão.
