# Feature Specification: Importação por Estrutura com Carga sob Demanda por Categoria

**Slug**: `010-catalogo-sob-demanda`

**Created**: 2026-09-23

**Status**: Convergida

**Input**: A importação de uma fonte de provedor grava hoje o catálogo
inteiro no aparelho de uma vez. Na TV de referência (Samsung
QN50Q60DAGXZD), com a fonte real de 311.367 entradas, isso demora tempo
demais. A importação passa a gravar apenas a **estrutura** — as categorias
—, e os itens de cada categoria passam a ser obtidos quando a pessoa entra
nela.

## Contexto da medição

Observado na TV em 23/09/2026, com o app instalado pelo procedimento
`tizen-tv`, durante uma ressincronização da fonte de provedor real:

- A tela de progresso passou da etapa "Obtendo a lista" normalmente e
  parou em **"Lendo entradas" com os contadores subindo devagar**.
- Portanto o gargalo é a **gravação no armazenamento local**, não a rede
  nem a interpretação da resposta do painel.
- Disso decorre que **obter as três seções em paralelo não resolve**: a
  escrita no armazenamento é serializada de qualquer forma. Essa hipótese
  foi levantada e descartada com base nesta medição.

A TV não entrega console, então esta é a evidência disponível: o que a
tela de progresso mostrou, observado pelo usuário.

## Escopo

### Incluído

- A importação de fonte de provedor grava apenas as categorias declaradas
  pelo painel (canais, filmes e séries) e a contagem que ele declara para
  cada uma.
- Os itens de uma categoria são obtidos quando a pessoa entra nela, e
  ficam guardados no aparelho com prazo de validade próprio.
- Vale para **canais também**, não só filmes e séries — canais são a maior
  fatia do volume, e deixá-los de fora manteria quase todo o tempo de
  importação.
- **Toda** fonte passa a registrar sua estrutura de categorias, inclusive
  as que importam a lista inteira — é o que mantém um caminho de leitura
  só para as telas (FR-018).
- Estados de carregando e de erro por categoria, ambos com saída focável.
- A tela de progresso passa a relatar as etapas da estrutura, contando
  categorias em vez de itens.
- A Home continua dizendo que a fonte está sincronizada, e o hub da lista
  passa a usar a contagem declarada pelo painel.

### Fora de Escopo

- **Virtualização das grades e navegação de foco em listas longas** — é a
  feature `009-virtualizacao-foco`. Esta feature entrega o que aquela vai
  paginar; as duas se completam, mas têm critérios de aceite distintos.
- **Carga sob demanda para fonte por URL M3U**: ela continua importando a
  lista inteira em fluxo. Um arquivo M3U não tem protocolo por categoria —
  não existe "pedir só a categoria X" sem baixar o arquivo todo. São dois
  comportamentos de *obtenção* por tipo de fonte, e a spec assume isso
  explicitamente. (A *estrutura* de categorias, essa sim, passa a ser
  gravada nos dois casos — ver FR-018.)
- **Política de descarte quando o espaço do aparelho acaba durante a
  navegação.** Decisão adiada para uma feature própria de armazenamento;
  aqui vale o comportamento que já existe (FR-018 da feature 005: para de gravar e
  declara).
- Metadados ricos (capa, sinopse, elenco) das telas de Filmes e Séries.
- Busca global sobre itens que nunca foram obtidos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sincronizar uma fonte grande termina rápido (Priority: P1)

Como pessoa com uma lista de centenas de milhares de entradas, quero que
adicionar ou ressincronizar a fonte termine em segundos, para poder
começar a usar o aplicativo em vez de esperar olhando uma tela de
progresso.

**Why this priority**: é o bloqueio observado na TV. Sem isto, a fonte
real não é utilizável no aparelho de referência.

**Independent Test**: sincronizar a fonte real na TV e medir o tempo até a
tela de progresso chegar a "Concluída". Entregável sozinho: mesmo sem as
histórias seguintes, a fonte passa a sincronizar e a estrutura fica
navegável.

**Acceptance Scenarios**:

1. **Given** uma fonte de provedor com centenas de milhares de entradas,
   **When** eu a ressincronizo, **Then** a importação conclui sem que eu
   precise esperar mais do que alguns segundos, e a lista fica acessível.
2. **Given** a importação concluída, **When** eu abro o hub da lista,
   **Then** vejo Live TV, Filmes e Séries com as contagens que o provedor
   declarou.
3. **Given** um painel que não responde a alguma das seções, **When** a
   importação termina, **Then** a ausência daquela seção é declarada, e as
   demais continuam utilizáveis.

### User Story 2 - Entrar numa categoria traz o conteúdo dela (Priority: P1)

Como pessoa navegando a lista, quero que entrar numa categoria mostre os
itens dela, sem que isso dependa de o catálogo inteiro ter sido baixado
antes.

**Why this priority**: sem isto a US1 entrega uma estrutura vazia. As duas
juntas são o mínimo utilizável.

**Independent Test**: abrir uma categoria nunca visitada, com rede, e
verificar que os itens aparecem; reabrir e verificar que aparecem sem
nova consulta.

**Acceptance Scenarios**:

1. **Given** uma categoria que nunca visitei, **When** eu entro nela,
   **Then** vejo um estado de carregamento com saída focável, e em seguida
   os itens daquela categoria.
2. **Given** uma categoria que já visitei dentro do prazo de validade,
   **When** eu entro nela de novo, **Then** os itens aparecem sem consulta
   à rede.
3. **Given** uma categoria já visitada e o aparelho sem rede, **When** eu
   entro nela, **Then** os itens guardados continuam disponíveis.
4. **Given** uma categoria nunca visitada e o aparelho sem rede, **When**
   eu entro nela, **Then** vejo um estado de erro explicando a situação,
   com ação de tentar de novo, e a categoria continua na lista.

### User Story 3 - A interface não promete o que não tem (Priority: P2)

Como pessoa usando uma lista parcialmente obtida, quero saber o que está
disponível no aparelho e o que depende de conexão, para não interpretar
uma categoria vazia como catálogo vazio.

**Why this priority**: honestidade de estado é princípio de constitution,
mas o aplicativo é utilizável sem isso refinado.

**Independent Test**: com o aparelho sem rede, percorrer categorias
visitadas e não visitadas e conferir que a distinção aparece.

**Acceptance Scenarios**:

1. **Given** uma fonte com só a estrutura obtida, **When** eu olho o hub
   da lista, **Then** as contagens exibidas são as que o provedor
   declarou, e não um número inventado nem um número de itens gravados
   apresentado como total.
2. **Given** uma categoria cuja contagem declarada difere do que o painel
   entregou, **When** eu a abro, **Then** vejo os itens que vieram, e a
   diferença é declarada em vez de silenciada.

## Edge Cases

- Categoria que o painel declara com contagem maior que zero e entrega
  vazia.
- Categoria que desaparece do painel entre a obtenção da estrutura e a
  entrada nela.
- Painel que aceita `get_live_categories` mas ignora o filtro por
  categoria e devolve a lista inteira.
- Duas entradas na mesma categoria em sequência rápida (a pessoa entra,
  sai e entra de novo antes da primeira busca terminar).
- Fonte de provedor em modo limitado (`legacy_m3u`), que chegou pelo
  caminho M3U e não tem protocolo por categoria.
- Prazo de validade vencido de uma categoria enquanto a pessoa está dentro
  dela.
- Espaço do aparelho insuficiente ao guardar uma categoria (comportamento
  atual da FR-018 **da feature 005** vale; política de descarte fica fora
  de escopo).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A importação de fonte de provedor DEVE gravar as categorias
  de canais, filmes e séries declaradas pelo painel, sem gravar os itens
  delas.
- **FR-002**: A importação DEVE preservar a ordem das categorias como o
  provedor a declarou, sem reordenar por texto.
- **FR-003**: A importação DEVE registrar, por categoria, a contagem de
  itens que o provedor declara.
- **FR-004**: O sistema DEVE obter os itens de uma categoria quando a
  pessoa entra nela. **Atualização de execução (23/09/2026, verificação na
  TV física):** o sistema PODE também **pré-buscar em segundo plano** a
  categoria sobre a qual o cursor **repousa** — nunca a cada tecla de
  movimento, só depois de um breve amortecimento (o cursor parou ali) —,
  desde que isso não substitua nem adiante visualmente a entrada: a tela
  continua exigindo a entrada explícita para exibir o conteúdo, e a
  pré-busca só faz esse conteúdo já estar pronto quando a entrada
  acontecer. Motivo: a leitura original ("nunca ao mover o foco") deixava
  toda entrada parecer a primeira, mesmo em uso normal de navegação —
  achado do usuário testando na TV real. Não se aplica a mover o foco
  sobre um **item reproduzível** dentro de uma categoria (canal, filme,
  série) — isso continua nunca disparando consulta, e é o que "focar não
  inicia reprodução" continua a proteger.
- **FR-005**: Os itens obtidos de uma categoria DEVEM ser gravados no
  aparelho, com um instante de obtenção próprio por categoria.
- **FR-006**: Uma categoria com obtenção dentro do prazo de validade DEVE
  ser servida do aparelho, sem consulta à rede.
- **FR-007**: Uma categoria vencida DEVE continuar sendo servida do
  aparelho enquanto a obtenção nova não chega, e ser substituída quando
  chegar.
- **FR-008**: O estado de carregamento e o estado de erro de uma categoria
  DEVEM ter ao menos um elemento focável cada.
- **FR-009**: Falha ao obter uma categoria NÃO DEVE remover a categoria da
  lista nem invalidar as demais.
- **FR-010**: Ressincronizar a fonte DEVE publicar a estrutura nova de
  forma atômica e descartar os itens obtidos da estrutura anterior,
  mantendo a geração como único ponto de troca.
- **FR-011**: A fonte por URL M3U DEVE continuar importando a lista
  inteira em fluxo, com o comportamento atual.
- **FR-012**: Fonte de provedor em modo limitado (`legacy_m3u`) DEVE
  seguir a regra da fonte por URL M3U, por não ter protocolo por
  categoria.
- **FR-013**: A tela de progresso DEVE relatar as etapas da obtenção da
  estrutura, contando categorias, e NÃO DEVE exibir percentual.
- **FR-014**: O hub da lista DEVE exibir uma contagem real por seção — a
  soma dos itens já gravados nas categorias cujo conteúdo é completo (todas
  as categorias `eager`), somada ao que o provedor declarar nas categorias
  ainda não obtidas (`on_demand`). Uma categoria `on_demand` sem itens
  obtidos e sem contagem declarada NÃO DEVE contribuir um "0" para essa
  soma — "0" diria que a seção está vazia quando na verdade só não foi
  aberta ainda. Quando nenhum item for conhecível por nenhuma categoria da
  seção, o hub DEVE recorrer ao número de categorias, também real e
  conhecido desde a importação da estrutura, em vez de esconder o número
  ou inventar um. **Nota de execução (sdd-execute, Fase 2):** a redação
  original desta FR só previa "número declarado pelo provedor"; o
  protocolo Xtream real não declara contagem por categoria
  (`xtreamConnector.ts`), o que deixaria o hub sempre vazio logo após
  sincronizar uma fonte de provedor — a regra acima é o refinamento que
  torna o Acceptance Scenario 2 da US1 verdadeiro na prática.
- **FR-015**: Quando a quantidade de itens entregue por uma categoria
  divergir da contagem declarada, o sistema DEVE declarar a divergência em
  vez de escondê-la.
- **FR-016**: Uma seção que o painel não sirva (filmes ou séries) DEVE
  ficar declarada, sem virar lista vazia silenciosa.
- **FR-017**: Nenhuma credencial de provedor DEVE ser gravada junto com as
  categorias ou com os itens obtidos.
- **FR-018**: **Toda** fonte DEVE registrar sua estrutura de categorias,
  inclusive as que importam a lista inteira. O que varia entre elas é
  quando os itens chegam, nunca se a estrutura existe. Uma fonte por URL
  M3U DEVE continuar listando suas categorias, na ordem em que apareceram,
  depois desta mudança.
- **FR-019**: Ao voltar para uma categoria cujos itens foram revalidados
  (obtidos de novo por vencimento de prazo) enquanto a pessoa estava fora
  dela, o item que tinha o foco antes da saída DEVE recuperar o foco pelo
  seu identificador, nunca pelo índice de posição — a lista pode ter
  mudado de tamanho ou de ordem entre a saída e a volta. Quando o item não
  existir mais na lista revalidada, o foco DEVE cair no primeiro item, em
  vez de apontar para o que ocupa o índice antigo.

### Key Entities

- **Categoria**: identificador declarado pelo provedor, nome como o
  provedor declarou, tipo (canal, filme ou série), posição na ordem
  declarada, contagem declarada, instante da última obtenção dos itens.
  Pertence a uma fonte e a uma geração de catálogo.
- **Item de catálogo**: o que já existe hoje, passando a nascer vinculado
  a uma categoria obtida, em vez de a uma importação inteira.
- **Geração**: continua sendo o ponto de troca atômica da fonte;
  passa a valer para a estrutura, e os itens obtidos pertencem à geração
  vigente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sincronizar a fonte de referência (311.367 entradas) na TV
  conclui em no máximo 15 segundos, medido da confirmação até o estado
  "Concluída".
- **SC-002**: Entrar numa categoria nunca visitada apresenta os itens em
  no máximo 3 segundos com rede utilizável.
- **SC-003**: Entrar numa categoria já visitada e dentro do prazo
  apresenta os itens sem nenhuma consulta à rede.
- **SC-004**: O espaço ocupado no aparelho após sincronizar, e antes de
  qualquer navegação, é proporcional ao número de categorias e não ao
  número de itens da fonte.
- **SC-005**: Em todos os estados de categoria — carregando, com erro,
  vazia — existe ao menos um elemento focável, verificável só com o
  controle remoto.
- **SC-006**: Nenhuma contagem exibida na interface é derivada de
  estimativa; toda contagem ou vem do provedor ou é a contagem real do que
  está gravado, e as duas são distinguíveis.

## Assumptions

- O painel do provedor aceita filtrar por categoria nas consultas de
  canais, filmes e séries. Painel que ignore o filtro cai no caso de borda
  listado acima; **a verificação contra o provedor real é trabalho do
  `sdd-plan`**, não uma premissa já confirmada.
- O prazo de validade de uma categoria acompanha o prazo de atualização
  por idade que já existe para a fonte (24 horas, `STALE_AFTER_MS`), até
  que medição justifique outro valor.
- A ADR-002 já prevê cobertura parcial do catálogo: *"Se apenas parte dos
  dados estiver salva, a interface indicará essa limitação. Não prometerá
  pesquisa completa sobre itens que nunca foram sincronizados."* Esta
  feature opera dentro dessa previsão, e não contra ela — mas **amplia
  bastante o alcance dela**, e a ADR-002 provavelmente merece uma emenda
  registrando isso.
- A feature `009-virtualizacao-foco` é a camada de renderização e depende
  desta para ter páginas a virtualizar. A ordem entre as duas é decisão do
  `sdd-plan`.

## Clarifications

### Sessão 2026-09-23

- Q: A carga sob demanda vale para canais também, ou só para filmes e
  séries? → A: Canais também. O gargalo é gravação, e canais são a maior
  fatia do volume; deixá-los ansiosos manteria quase todo o tempo de
  importação.
- Q: E a fonte por URL M3U, que só sabe entregar a lista inteira em fluxo?
  → A: Continua importando tudo, como hoje. Não existe protocolo por
  categoria num arquivo M3U. Dois comportamentos por tipo de fonte,
  declarados.
- Q: Os itens buscados de uma categoria ficam gravados no aparelho ou são
  descartados ao sair? → A: Ficam gravados, com validade por categoria.
- Q: Com só a estrutura gravada, o que a fonte pode dizer de si na Home? →
  A: "Sincronizada", com a contagem vinda do painel — número real, da
  fonte e não do disco.
- Q: Ao ressincronizar a fonte, o que acontece com as categorias já
  baixadas? → A: Descarta tudo, como a geração faz hoje. Publicação
  atômica pura; geração nova zera o catálogo.
- Q: O que a pessoa vê ao entrar numa categoria ainda não baixada, e se a
  busca falhar? → A: Carregando, e no erro um estado com "Tentar de novo",
  ambos com elemento focável. A categoria não some por ter falhado.
- Q: A tela de progresso ainda faz sentido? → A: Continua, mostrando as
  etapas da estrutura. A fonte M3U por URL segue precisando dela; para
  provedor ela passa rápido, contando categorias.
- Q: E se o espaço acabar enquanto a pessoa navega e baixa categorias? →
  A: Fora de escopo desta feature; vira item de backlog próprio (item 51).
  Aqui vale o comportamento atual, definido pela **FR-018 da feature 005**
  — para de gravar e declara.

### Sessão 2026-09-23 (achado A1 do Analyze do `sdd-plan`)

- Q: Trocar `listCategories` para ler a coleção `categories` deixaria toda
  fonte por URL M3U sem categoria alguma, porque o caminho integral não
  grava estrutura. Gravar estrutura nos dois caminhos, ou manter a
  derivação antiga como leitura de reserva? → A: **Gravar nos dois.** Toda
  fonte registra estrutura; o que varia é `fetchMode` (`on_demand` versus
  `eager`), nunca a existência da categoria. A leitura de reserva foi
  rejeitada por criar dois caminhos de leitura no repositório, que é o que
  a D-004 do `plan.md` promete evitar. Virou **FR-018 desta spec**, com
  regressão coberta por T016/T017.

### Sessão 2026-09-23 (verificação na TV física, T046)

- Q: Cenário B do quickstart mostrou que mover o cursor pela trilha de
  categorias sem pré-busca deixava toda entrada parecer "primeira vez" —
  era esse o comportamento pretendido? → A: **Não.** O usuário, vendo o
  comportamento estrito ao vivo, pediu pré-busca por permanência do
  cursor: navegar pelas categorias deve carregar e guardar em cache os
  itens da categoria onde o foco parou, para a entrada parecer instantânea
  na maioria das vezes. Implementado como pré-busca **amortecida** (300ms
  de permanência, não a cada tecla) para não disparar uma rajada de
  requisições ao passar o cursor rápido por muitas categorias (risco
  R-002 do `plan.md`). FR-004 emendada; ver `plan.md` D-003/R-013 e
  `contracts/catalog-on-demand.md` §2 para o registro técnico completo.
- Q: (achado A2 do Analyze) A constitution exige que voltar restaure foco
  e posição, reconciliando por identificador — mas nenhum FR desta spec
  cobria isso para categoria revalidada. Só existia como risco no
  `plan.md` (R-004) e como task (T037/T039), sem requisito rastreável. →
  A: vira **FR-019**. Sem um FR, um `sdd-converge` futuro não teria contra
  o que verificar esse comportamento.
