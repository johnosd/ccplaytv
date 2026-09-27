# Feature Specification: Filmes e Séries no Design System V14 (Onda 4)

**Slug**: `025-filmes-series-ds-v14`

**Created**: 2026-09-27

**Status**: Em Execução

**Input**: Onda 4 da migração para o Design System V14 Spectrum — item M5
do backlog (`.planning/backlog.md`) e seção "Onda 4" de
`.planning/migracao-design-system-v14.md`: side nav com **↺ Histórico**
(dado real, `lastWatched`), Ordenar, hero band e detalhes V14 para Filmes e
Séries.

## Contexto

Filmes e Séries ainda abrem em tela cheia, fora do shell da feature 023, com
a trilha de categorias antiga, o ícone de busca por categoria da feature 018
e uma grade de pôsteres no visual anterior. Os detalhes também são do visual
antigo: o de filme tem um backdrop de placeholder ("backdrop / still do
filme"), uma sinopse fixa dizendo que não há resumo e "Elenco: Desconhecido";
o de série tem cabeçalho, abas de temporada e lista de episódios.

Esta onda troca a **apresentação** das quatro telas pelo layout V14 (§13.2,
§13.3, §32 "Filmes / Séries", "Detalhe de filme", "Detalhe de série", §41 e
§48 do Spec; `catalog()`, `details()`, `sortModal()` e `seasonModal()` do
protótipo; componentes `SideCategoryNav`, `ContentCard`, `Tabs`, `Modal`,
`Button`, `TextField`, `EmptyState`, `ErrorState`, `Skeleton` e
`ComingSoon` da feature 022), coloca as grades sob a topbar, e não muda o
comportamento que as features 010, 011, 012, 013, 014, 015, 017, 018, 019 e
020 entregaram.

Três coisas novas de dado ou de comportamento entram porque o layout V14 as
exige e existe dado real para elas:

- **↺ Histórico**: o `lastWatched` já é gravado por filme e por episódio
  desde as features 011/012; falta a entrada que o exibe.
- **Ano e data de inclusão**: o painel do provedor já declara ambos, mas a
  importação descarta. Sem eles, "Ano" e "Recém-adicionados" em Ordenar
  seriam dado inventado.
- **Memória de foco por entrada** (§41), estendendo o
  `CategoryScreenSnapshot` da feature 017.

## Escopo

### Incluído

- Filmes e Séries como destinos de topo **sob a topbar persistente** da
  feature 023 (aba "Filmes"/"Séries" ativa), com a composição de foco
  topbar ↔ conteúdo já usada pela Live (feature 024). Os detalhes continuam
  em tela cheia, empilhados, sem topbar.
- Side nav de categorias no padrão `SideCategoryNav`, em dois blocos: "Sua
  biblioteca" (`★ Favoritos`, `↺ Histórico`) e "Catálogo" (`Todos` + as
  categorias da fonte, na ordem da fonte), com contagem só quando conhecida.
- **↺ Histórico** real em Filmes e em Séries: o que foi reproduzido, do mais
  recente para o mais antigo, incluindo concluídos. Em Séries, uma entrada
  por série.
- Barra de ferramentas acima da grade: campo "Pesquisar" (o comportamento
  da feature 018, agora no formato de campo da toolbar V14) e botão
  "Ordenar" que abre um `Modal` com as opções.
- Ordenar com "Ordem da fonte", "A–Z", "Ano" e "Recém-adicionados", cada
  opção só quando há dado real para ela.
- Captura do **ano** e da **data de inclusão** declarados pela fonte para
  filmes e séries, com as mesmas regras da captura de capa da feature 015.
- Hero band compacta e fixa acima da grade, mostrando o card focado (capa
  real, título, metadados reais), sem sinopse inventada nem ações próprias.
- Grade virtualizada de `ContentCard` portrait, mantendo a virtualização da
  feature 009 e a capa real da feature 015.
- Memória de foco por entrada na sessão (§41), em Filmes e Séries, e volta
  do detalhe restaurando o card de origem.
- Detalhe de filme no layout hero V14: capa real, metadados reais, ações
  "Assistir"/"Continuar", "Minha Lista", "Trailer" (mock "Em breve") e
  "Marcar/Desmarcar assistido"; abas "Detalhes" (real), "Elenco" e
  "Semelhantes" (mocks).
- Detalhe de série no layout hero V14: ação "Continuar TX:EY" ou "Assistir
  T1:E1", "Minha Lista", "Trailer" (mock); abas "Episódios" e "Detalhes"
  (reais), "Elenco" e "Semelhantes" (mocks); botão "Temporada N ▾" que abre
  um `Modal`; episódios em lista vertical virtualizada de cards 16:9 com
  progresso real e selo de concluído.
- Estados de carregando, erro, vazio, fonte ausente, `★ Favoritos` vazio e
  `↺ Histórico` vazio com os componentes V14, cada um com elemento focável.
- Atualização dos E2E que tocam as quatro telas (`capa-real.mjs`,
  `historico-continuar-assistindo.mjs`, `favoritos.mjs`,
  `busca-por-categoria.mjs`, `paridade-visual.mjs` e o que mais as tocar).

### Fora de Escopo

- **Remover item do Histórico e limpar Histórico** (§13.3, §48.4) — fica
  para Configurações/Privacidade (Onda 5). O Histórico aqui é só leitura.
- **Sinopse, backdrop, elenco, nota e semelhantes reais** — item 28 (TMDB)
  e item 45. Nenhuma consulta extra por item ao provedor para obter
  sinopse.
- **Trailer real** — item 32. Aqui é mock "Em breve".
- **Rails editoriais** ("Em destaque", "Mais assistidos") dentro de
  Filmes/Séries — o roteiro decidiu não adotar; a grade por categoria fica.
- **"Mais vistos"** em Ordenar — não há contagem de reproduções.
- **Side nav recolhível** ao entrar na grade.
- **Topbar sobre os detalhes** de filme e série.
- **Memória de foco na Live TV** — a Live herda o mecanismo depois.
- **Memória de foco persistida** entre aberturas do app, e ordenação
  persistida entre aberturas.
- **Ano extraído do título** por heurística (por exemplo, "Filme (2020)").
- **Chrome do player** (auto-hide, botões de trilhas) — Onda 6. O player de
  filme e de episódio continua o da feature 011/012/020.
- **Busca global na topbar e Configurações** — continuam mocks da 023
  (Onda 5).
- Esportes/Infantil na topbar (ADR-011).
- Mudança em regras de negócio de `lib/` além da captura de ano/data de
  inclusão e da leitura do Histórico.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegar e abrir filmes e séries no layout V14 sob a topbar (Priority: P1)

A pessoa escolhe "Filmes" (ou "Séries") na topbar e vê a tela V14: side nav
de categorias à esquerda, barra com "Pesquisar" e "Ordenar", uma faixa de
destaque com o título focado e a grade de capas. Entra numa categoria,
percorre os cards e aperta OK para abrir o detalhe. RETURN no detalhe volta
à grade com o mesmo card focado.

**Why this priority**: é o caminho principal das duas telas e o critério da
onda: nada que Filmes/Séries fazem hoje pode quebrar na troca de
apresentação.

**Independent Test**: abrir Filmes pela topbar, entrar numa categoria,
focar um card no meio da grade, apertar OK, ver o detalhe, apertar RETURN e
encontrar o mesmo card focado e visível; repetir em Séries; RETURN na side
nav volta ao Início.

**Acceptance Scenarios**:

1. **Given** o Início com a topbar, **When** a pessoa seleciona "Filmes",
   **Then** a tela abre sob a topbar, com a aba "Filmes" ativa e o foco na
   side nav.
2. **Given** a side nav, **When** a pessoa aperta ↑ em `★ Favoritos`
   (primeiro item), **Then** o foco sobe para a topbar na aba ativa;
   **When** aperta ↓, **Then** o foco volta ao mesmo item de onde saiu.
3. **Given** uma categoria focada, **When** a pessoa aperta OK ou →,
   **Then** os itens dela aparecem na grade (obtidos sob demanda como hoje)
   e o foco vai para o primeiro card.
4. **Given** um card focado, **Then** a hero band mostra a capa, o título e
   os metadados reais desse item, sem consulta externa.
5. **Given** um card focado, **When** a pessoa aperta OK, **Then** abre o
   detalhe em tela cheia, sem topbar; **When** aperta RETURN, **Then**
   volta à grade com o mesmo card focado e visível, na mesma entrada, com a
   mesma busca e ordenação.
6. **Given** o foco na side nav ou na topbar dentro de Filmes/Séries,
   **When** a pessoa aperta RETURN, **Then** volta ao Início.
7. **Given** uma categoria com muitos itens, **When** a pessoa rola a
   grade, **Then** só os cards próximos da área visível são renderizados e
   o card focado nunca sai da área visível.

---

### User Story 2 - ↺ Histórico em Filmes e Séries (Priority: P1)

A pessoa abre `↺ Histórico` na side nav e encontra o que reproduziu, do mais
recente para o mais antigo — incluindo o que já terminou. Em Séries, cada
série aparece uma vez, na posição do episódio mais recentemente assistido.

**Why this priority**: é a única entrada nova de dado da onda e a razão de
o layout V14 ter um bloco "Sua biblioteca"; o dado já existe e hoje não tem
onde ser visto além do "Continuar assistindo" (que exclui concluídos).

**Independent Test**: assistir parte de um filme A, depois assistir até o
fim um filme B; abrir `↺ Histórico` em Filmes e ver B antes de A, B com
selo de assistido. Assistir um episódio de uma série; abrir `↺ Histórico`
em Séries e ver a série uma vez; OK abre o detalhe da série.

**Acceptance Scenarios**:

1. **Given** filmes reproduzidos em momentos diferentes, **When** a pessoa
   abre `↺ Histórico` em Filmes, **Then** aparecem do mais recente para o
   mais antigo, com os concluídos incluídos e marcados.
2. **Given** vários episódios de uma mesma série reproduzidos, **When** a
   pessoa abre `↺ Histórico` em Séries, **Then** a série aparece uma única
   vez, ordenada pela reprodução mais recente de qualquer episódio dela.
3. **Given** um item do Histórico, **When** a pessoa aperta OK, **Then**
   abre o detalhe do filme ou da série; RETURN volta ao mesmo card do
   Histórico.
4. **Given** nada reproduzido nesta lista, **When** a pessoa abre
   `↺ Histórico`, **Then** aparece o estado vazio instrutivo ("Os filmes e
   séries reproduzidos neste perfil aparecerão aqui.") com um elemento
   focável, e a entrada continua na side nav.
5. **Given** itens do Histórico que não correspondem mais a nenhum registro
   do catálogo atual, **Then** eles não aparecem como cards, e a tela diz
   quantos não puderam ser exibidos, sem inventar título ou capa.
6. **Given** um filme só marcado como assistido manualmente, sem nunca ter
   sido reproduzido, **Then** ele não entra no Histórico (Histórico é o que
   foi reproduzido).
7. **Given** `↺ Histórico` aberto, **Then** a side nav mostra ao lado dele
   a quantidade real de entradas exibíveis.

---

### User Story 3 - Favoritos, busca e comportamento existente preservados (Priority: P1)

Tudo que as features 013, 015, 017, 018 e 019 entregaram continua: segurar
OK ou a tecla amarela favorita o card focado; `★ Favoritos` e `Todos`
continuam na side nav; buscar filtra os itens já carregados da entrada
aberta; `Todos` mantém o aviso "Busca em X de Y categorias"; capas reais com
fallback; selo de assistido nos cards.

**Why this priority**: a onda não pode regredir funcionalidade (critério do
roteiro).

**Independent Test**: rodar `capa-real.mjs`,
`historico-continuar-assistindo.mjs`, `favoritos.mjs` e
`busca-por-categoria.mjs` verdes, com os contratos travados das features
anteriores passando sem edição.

**Acceptance Scenarios**:

1. **Given** um card focado, **When** a pessoa segura OK ou aperta a tecla
   amarela, **Then** o item é favoritado ou desfavoritado com toast, sem
   abrir o detalhe.
2. **Given** `★ Favoritos` vazio, **Then** aparece o estado vazio
   instrutivo ("Adicione filmes ou séries aos Favoritos para encontrá-los
   rapidamente aqui.") com um elemento focável.
3. **Given** uma entrada aberta com itens, **When** a pessoa foca
   "Pesquisar" e digita, **Then** a grade filtra só o que já está carregado
   nessa entrada, sem consulta externa; em `Todos`, o aviso de cobertura
   continua aparecendo, inclusive antes de digitar.
4. **Given** uma entrada sem nenhum item carregado, **Then** "Pesquisar"
   não é oferecido (mesma regra da feature 018).
5. **Given** o foco parado numa categoria da fonte, **Then** o prefetch com
   debounce continua exatamente como hoje (nunca para `★ Favoritos`,
   `↺ Histórico`, `Todos` nem para a categoria já aberta).
6. **Given** um item sem capa ou com capa que falha, **Then** aparece o
   fallback, nunca o ícone de imagem quebrada.

---

### User Story 4 - Ordenar a grade (Priority: P2)

Na barra de ferramentas, "Ordenar · Ordem da fonte ▾" abre um modal com as
opções disponíveis e ✓ na atual. A escolha reordena a grade da entrada
aberta e vale para todas as categorias da seção até o app fechar.

**Why this priority**: ajuda em listas longas e é elemento do layout V14,
mas a tela funciona sem (ordem da fonte é o padrão).

**Independent Test**: numa categoria cujos filmes declaram ano, abrir
Ordenar, escolher "Ano" e ver a grade reordenada do mais novo para o mais
antigo com os sem ano no fim; trocar de categoria e ver a mesma ordenação
aplicada; RETURN no modal fecha e devolve o foco ao botão.

**Acceptance Scenarios**:

1. **Given** uma categoria ou `Todos` aberto, **When** a pessoa aciona
   "Ordenar", **Then** abre um modal com as opções disponíveis, ✓ na atual
   e o foco nela.
2. **Given** o modal aberto, **When** a pessoa escolhe uma opção, **Then** o
   modal fecha, a grade reordena, o rótulo do botão mostra a opção e o foco
   volta ao botão.
3. **Given** o modal aberto, **When** a pessoa aperta RETURN, **Then** o
   modal fecha sem mudar nada e o foco volta ao botão.
4. **Given** nenhum item carregado na entrada tem ano (ou data de
   inclusão), **Then** a opção "Ano" (ou "Recém-adicionados") não aparece
   no modal.
5. **Given** "A–Z", "Ano" ou "Recém-adicionados" escolhidos, **Then** itens
   sem o dado vão para o fim, e empates mantêm a ordem da fonte.
6. **Given** uma ordenação escolhida em Filmes, **When** a pessoa troca de
   categoria, **Then** a mesma ordenação vale; Séries tem a sua própria;
   ao reabrir o app, volta a "Ordem da fonte".
7. **Given** `★ Favoritos` ou `↺ Histórico` aberto, **Then** "Ordenar" não é
   oferecido — essas entradas têm ordem própria (mais recente primeiro).
8. **Given** busca e ordenação ativas juntas, **Then** a grade mostra o
   resultado filtrado na ordem escolhida.

---

### User Story 5 - Detalhe de filme V14 (Priority: P2)

O detalhe de filme vira um hero V14: capa real, título, metadados que a
fonte informou (ano, categoria, duração quando houver) e ações em pill —
"Assistir" ou "Continuar de mm:ss", "Minha Lista", "Trailer" (em breve) e
"Marcar assistido". Abaixo, as abas "Detalhes", "Elenco" e "Semelhantes".

**Why this priority**: tira da tela os placeholders que parecem conteúdo
(backdrop falso, sinopse fixa, "Elenco: Desconhecido"), mas o detalhe atual
já cumpre a função de assistir.

**Independent Test**: abrir um filme com progresso, ver "Continuar",
acioná-lo e ver o player retomar; acionar "Minha Lista" e ver "Na Minha
Lista"; acionar "Trailer" e "Elenco" e ver o aviso "Em breve"; acionar
"Marcar assistido" e ver o selo; RETURN volta à grade.

**Acceptance Scenarios**:

1. **Given** o detalhe aberto, **Then** o foco inicial está na ação
   primária ("Assistir" ou "Continuar").
2. **Given** um filme com posição de retomada, **Then** a ação primária é
   "Continuar" e retoma de onde parou (feature 011); sem retomada, é
   "Assistir".
3. **Given** o foco em "Minha Lista", **When** a pessoa aperta OK, **Then**
   o filme vira favorito com toast e o rótulo passa a "Na Minha Lista"; OK
   de novo desfaz.
4. **Given** o foco em "Trailer", ou numa aba "Elenco"/"Semelhantes",
   **When** a pessoa aperta OK, **Then** só aparece o aviso "Em breve" do
   registro de mocks.
5. **Given** a aba "Detalhes", **Then** ela mostra só o que o catálogo tem
   (categoria, ano, data de inclusão, formato quando conhecidos), nunca um
   campo com valor inventado.
6. **Given** "Marcar assistido" acionado, **Then** o comportamento da
   feature 019 se mantém, e a ação continua sendo a última.
7. **Given** o player aberto a partir do detalhe, **Then** o vídeo não fica
   pintado atrás do layout (plano de hardware), e RETURN no player volta ao
   detalhe.

---

### User Story 6 - Detalhe de série V14 com episódios em cards 16:9 (Priority: P2)

O detalhe de série vira um hero V14 com "Continuar T2:E3" (ou "Assistir
T1:E1"), "Minha Lista" e "Trailer" (em breve). A aba "Episódios" tem o
botão "Temporada N ▾", que abre um modal para escolher a temporada, e a
lista vertical de episódios em cards 16:9 com progresso e selo de
concluído.

**Why this priority**: completa a onda; o detalhe atual já assiste
episódios, então o valor é de apresentação.

**Independent Test**: abrir uma série com episódios vistos em duas
temporadas, ver "Continuar TX:EY" apontando o episódio certo; abrir o
seletor de temporada, escolher outra e ver a lista trocar; focar um
episódio com progresso e ver a barra (ou "Continuar de mm:ss" quando a
fonte não declara a duração); OK reproduz; o autoplay do próximo
episódio (feature 012) continua funcionando.

**Acceptance Scenarios**:

1. **Given** uma série com episódio em andamento, **Then** a ação primária
   é "Continuar TX:EY" para esse episódio; sem nenhum, é "Assistir T1:E1"
   (ou o primeiro episódio conhecido).
2. **Given** a aba "Episódios", **When** a pessoa aciona "Temporada N ▾",
   **Then** abre um modal com as temporadas, a atual marcada e focada;
   escolher troca a lista; RETURN fecha sem trocar, com o foco de volta no
   botão.
3. **Given** a lista de episódios, **Then** cada card mostra a imagem 16:9
   (do episódio quando a fonte declara, senão a da série, senão fallback),
   "TX:EY", o título, a duração se conhecida, o progresso de retomada
   (barra só com duração conhecida, senão "Continuar de mm:ss") e o selo
   "concluído" quando for o caso.
4. **Given** uma temporada com muitos episódios, **Then** a lista é
   virtualizada e o episódio focado fica sempre visível.
5. **Given** um episódio reproduzido até o fim, **Then** o autoplay do
   próximo episódio, com contagem cancelável e passagem de temporada,
   funciona como na feature 012.
6. **Given** a aba "Detalhes", **Then** ela mostra só o que o catálogo tem
   (número de temporadas e de episódios conhecidos, categoria, ano quando
   declarado, resumo "Em dia"/"N de M assistidos" da feature 019).
7. **Given** episódios ainda sendo obtidos ou falha ao obtê-los, **Then**
   aparece o estado de carregando ou o `ErrorState` com "Tentar de novo"
   acionável por SELECT.

---

### Edge Cases

- Categoria nunca lida: sem contagem (nunca "0"); `Todos` sem número.
- `★ Favoritos` e `↺ Histórico` vazios: estado vazio instrutivo, focável;
  hero band não aparece (nada a destacar).
- Histórico com mais entradas que o limite prático da tela: a grade
  continua virtualizada; nenhum corte silencioso.
- Episódio reproduzido de uma série cuja série-mãe não está no catálogo
  atual: conta como não exibível no aviso do Histórico, nunca vira card de
  episódio solto.
- Filme reproduzido e depois favoritado: aparece em `★ Favoritos` e em
  `↺ Histórico` (conceitos diferentes, §13.3).
- Item em "Continuar assistindo" e no Histórico ao mesmo tempo: esperado
  enquanto incompleto.
- Busca com termo curto ou sem resultado: mensagens atuais no visual novo,
  sempre com elemento focável; a hero band acompanha o card focado do
  resultado.
- Falha ao obter a categoria: `ErrorState` com "Tentar de novo" acionável
  por SELECT (bug da feature 014 não pode voltar); fonte ausente (`stored`
  sem bloco) → "Ressincronizar".
- Card focado some após revalidação (por exemplo, item concluído deixa de
  estar em algum lugar, ou categoria relida): o foco cai num vizinho
  válido, nunca num item inexistente sem foco visível.
- Voltar do detalhe para um card que não existe mais na entrada: foco no
  vizinho mais próximo pela ordem atual, nunca "teleporte" ao topo sem
  motivo.
- Memória de foco de uma entrada cujo item lembrado sumiu: foco inicial
  apropriado da entrada (primeiro card).
- Ordenação trocada com o foco no meio da grade: o foco segue o mesmo item
  (por identidade) na nova ordem, e ele fica visível.
- Ano declarado em formato não reconhecível ou fora de faixa plausível:
  tratado como ausente, nunca exibido nem usado para ordenar.
- Categoria gravada antes desta feature (sem ano/data de inclusão): as
  opções correspondentes não aparecem até a categoria ser relida pelo fluxo
  normal.
- Fonte M3U (caminho `stored`): em geral não declara ano nem data de
  inclusão — Ordenar oferece só "Ordem da fonte" e "A–Z".
- Série com uma única temporada: "Temporada 1" aparece sem abrir modal
  inútil (o botão fica soft disabled ou o modal mostra a única opção — a
  decisão visual fica para o plano, desde que não haja beco sem saída).
- App oculto durante reprodução de filme/episódio: pausa como na feature
  020; ao voltar, o detalhe continua sob o player.
- Topbar focada e a pessoa escolhe outro destino: navega normalmente
  (comportamento da 023).

## Requirements *(mandatory)*

### Functional Requirements

**Shell e navegação**

- **FR-001**: As grades de Filmes e de Séries DEVEM ser exibidas sob a
  topbar persistente da feature 023, com a aba correspondente marcada como
  destino ativo.
- **FR-002**: ↑ no primeiro item da side nav DEVE levar o foco à topbar
  (aba ativa); ↓ na topbar DEVE devolver o foco ao mesmo item do conteúdo,
  sem mover o foco interno de nenhum dos dois escopos na mesma tecla.
- **FR-003**: RETURN na side nav ou na topbar (dentro de Filmes/Séries)
  DEVE voltar ao Início; RETURN na grade, na barra de ferramentas ou na
  hero band DEVE voltar à side nav, preservando as camadas atuais da busca
  (resultado → campo → fecha busca).
- **FR-004**: Os detalhes de filme e de série DEVEM continuar em tela
  cheia, sem topbar, e o player aberto a partir deles NÃO DEVE mostrar a
  topbar.
- **FR-005**: A raiz de cada tela que monta o player DEVE estar coberta
  pela regra de transparência do plano de hardware do vídeo.

**Side nav**

- **FR-006**: A side nav DEVE listar, nesta ordem, o bloco "Sua biblioteca"
  (`★ Favoritos`, `↺ Histórico`) e o bloco "Catálogo" (`Todos` + as
  categorias da fonte na ordem declarada), sempre visíveis mesmo vazias,
  nunca substituídas por taxonomia externa.
- **FR-007**: Cada categoria da fonte DEVE mostrar a contagem real apenas
  quando já foi lida; `★ Favoritos` DEVE mostrar a quantidade de favoritos
  do tipo (mesma regra da Live, feature 024); `↺ Histórico` DEVE mostrar a
  quantidade real de entradas exibíveis só depois de ela ser conhecida
  (a pessoa entrou em `↺ Histórico` ao menos uma vez na sessão), sem número
  antes disso; `Todos` e categorias nunca lidas NÃO DEVEM mostrar número.
- **FR-008**: A side nav NÃO DEVE recolher quando o foco entra na grade.

**↺ Histórico**

- **FR-009**: `↺ Histórico` de Filmes DEVE listar os filmes da lista ativa
  que têm registro de reprodução, do mais recente para o mais antigo,
  incluindo concluídos.
- **FR-010**: `↺ Histórico` de Séries DEVE listar cada série uma única vez,
  ordenada pela reprodução mais recente de qualquer episódio dela; um
  episódio NUNCA DEVE aparecer como card próprio.
- **FR-011**: Um item marcado como assistido sem nunca ter sido reproduzido
  NÃO DEVE entrar no Histórico.
- **FR-012**: Entradas do Histórico que não correspondem a nenhum registro
  do catálogo atual NÃO DEVEM virar cards; a tela DEVE informar quantas não
  puderam ser exibidas, sem inventar título ou capa.
- **FR-013**: `↺ Histórico` vazio DEVE mostrar o estado vazio instrutivo do
  Spec V14 com pelo menos um elemento focável.
- **FR-014**: O Histórico DEVE ser só leitura nesta feature: nenhuma ação
  de remover ou limpar, e nenhuma alteração de progresso, favorito ou
  "assistido" a partir dele.
- **FR-015**: Histórico, como favoritos e retomada, DEVE ser chaveado pela
  identidade lógica estável e isolado pela lista ativa, nunca pela URL de
  reprodução.

**Barra de ferramentas, busca e ordenação**

- **FR-016**: A barra de ferramentas DEVE ter o campo "Pesquisar" e o botão
  "Ordenar · <opção atual> ▾", cada um só quando aplicável à entrada
  aberta.
- **FR-017**: "Pesquisar" DEVE manter o comportamento da feature 018:
  filtro sobre o que já está carregado na entrada aberta, sem consulta
  externa, oferecido só quando a entrada tem ao menos um item carregado, e
  em `Todos` com o aviso "Busca em X de Y categorias" antes e durante a
  digitação.
- **FR-018**: "Ordenar" DEVE abrir um modal (um por vez, RETURN fecha, foco
  volta ao botão) com as opções disponíveis e a atual marcada e focada.
- **FR-019**: As opções DEVEM ser "Ordem da fonte" e "A–Z" sempre, "Ano"
  apenas quando ao menos um item carregado na entrada aberta tem ano
  declarado, e "Recém-adicionados" apenas quando ao menos um tem data de
  inclusão declarada. "Mais vistos" NÃO DEVE existir.
- **FR-020**: "Ano" DEVE ordenar do mais novo para o mais antigo e
  "Recém-adicionados" da inclusão mais recente para a mais antiga; nessas e
  em "A–Z", itens sem o dado DEVEM ir para o fim, e empates DEVEM manter a
  ordem da fonte.
- **FR-021**: A ordenação escolhida DEVE valer para todas as categorias e
  para `Todos` da mesma seção (Filmes ou Séries), durante a sessão; ao
  reabrir o app, DEVE voltar a "Ordem da fonte".
- **FR-022**: `★ Favoritos` e `↺ Histórico` NÃO DEVEM oferecer "Ordenar" e
  DEVEM manter a ordem própria (mais recente primeiro).
- **FR-023**: Com busca e ordenação ativas, a grade DEVE mostrar o
  resultado filtrado na ordem escolhida.
- **FR-024**: Ao trocar a ordenação, o foco DEVE continuar no mesmo item
  (por identidade), visível na nova posição.

**Hero band e grade**

- **FR-025**: A hero band DEVE ficar fixa e compacta acima da grade e
  mostrar, para o card focado (ou para o primeiro item antes de o foco
  entrar na grade), a capa real ou fallback, o título e só metadados reais
  (ano, categoria, selo assistido/progresso quando existirem).
- **FR-026**: A hero band NÃO DEVE ter sinopse, texto descritivo inventado
  nem ações focáveis próprias, e mudar o foco NÃO DEVE disparar consulta
  externa nem reprodução (a capa é a única imagem carregada).
- **FR-027**: A grade DEVE usar o card portrait V14 sobre a capa real da
  feature 015, continuar virtualizada e manter o card focado sempre na área
  visível; o único elemento rolável da área de conteúdo DEVE ser a grade.
- **FR-028**: Cada card DEVE mostrar, quando aplicável, a estrela de
  favorito e o selo de assistido/progresso da feature 019.
- **FR-029**: Foco visual DEVE seguir a receita V14 (outline + glow +
  escala), com glow só no item focado; cores, espaçamentos, raios e
  tamanhos de fonte DEVEM vir dos tokens existentes.

**Memória de foco**

- **FR-030**: Cada entrada da side nav (`★ Favoritos`, `↺ Histórico`,
  `Todos` e cada categoria), em Filmes e em Séries separadamente, DEVE
  lembrar o último item focado durante a sessão; voltar a ela DEVE
  restaurar esse item quando ele ainda existir, e senão o foco inicial
  apropriado (primeiro card).
- **FR-031**: Voltar do detalhe DEVE restaurar a entrada, a busca, a
  ordenação, a posição de rolagem e o card de origem; se o card não
  existir mais, o foco DEVE cair no vizinho mais próximo. A reconciliação
  DEVE ser por identidade do item, nunca por índice.
- **FR-032**: A memória de foco NÃO DEVE ser persistida entre aberturas do
  app.

**Detalhe de filme**

- **FR-033**: O detalhe de filme DEVE ter um hero V14 com a capa real (ou
  fallback), título, metadados reais e as ações, nesta ordem: ação
  primária ("Assistir" ou "Continuar de mm:ss"), "Reiniciar" (só quando há
  retomada, preservando a feature 011), "Minha Lista"/"Na Minha Lista",
  "Trailer" (mock) e "Marcar assistido"/"Desmarcar assistido" (sempre a
  última).
- **FR-034**: O foco inicial do detalhe DEVE estar na ação primária.
- **FR-035**: "Minha Lista" DEVE alternar o mesmo favorito da feature 013,
  com o mesmo toast; o rótulo DEVE refletir o estado atual.
- **FR-036**: O detalhe NÃO DEVE mostrar backdrop falso, sinopse fixa,
  "Elenco: Desconhecido" nem qualquer texto que imite conteúdo inexistente.
- **FR-037**: As abas do filme DEVEM ser "Detalhes" (real: só campos que o
  catálogo tem), "Elenco" e "Semelhantes" (mocks soft disabled "Em
  breve").

**Detalhe de série**

- **FR-038**: O detalhe de série DEVE ter um hero V14 com a capa real (ou
  fallback), título, metadados reais e as ações: ação primária ("Continuar
  TX:EY" para o episódio em andamento, ou "Assistir" do primeiro episódio
  conhecido), "Minha Lista"/"Na Minha Lista" e "Trailer" (mock).
- **FR-039**: As abas da série DEVEM ser "Episódios" e "Detalhes" (reais),
  "Elenco" e "Semelhantes" (mocks soft disabled "Em breve").
- **FR-040**: A aba "Episódios" DEVE ter o botão "Temporada N ▾" com a
  contagem de episódios da temporada, abrindo um modal com as temporadas
  conhecidas, a atual marcada e focada; escolher troca a lista, RETURN
  fecha sem trocar, e o foco volta ao botão.
- **FR-041**: Os episódios DEVEM aparecer numa lista vertical virtualizada
  de cards 16:9, cada um com imagem (do episódio se declarada, senão da
  série, senão fallback), "TX:EY", título, duração quando conhecida, o
  progresso de retomada e o selo de concluído. O progresso DEVE ser uma
  barra só quando a duração do episódio é conhecida (declarada pela fonte);
  sem duração, DEVE ser o texto "Continuar de mm:ss", nunca uma barra com
  percentual inventado.
- **FR-042**: A obtenção sob demanda dos episódios, a retomada por
  episódio, o selo de concluído e o autoplay do próximo episódio com
  contagem cancelável DEVEM manter o comportamento das features 012 e 019.

**Mocks**

- **FR-043**: "Trailer", "Elenco" e "Semelhantes" DEVEM ser mocks soft
  disabled registrados no registro único de mocks, apontando para os itens
  32 (trailer) e 45 (elenco/semelhantes) do backlog, que ao serem
  acionados só anunciam "Em breve".

**Comportamento preservado**

- **FR-044**: Segurar OK e a tecla amarela DEVEM continuar favoritando o
  card focado na grade, sem abrir o detalhe.
- **FR-045**: O prefetch com debounce da categoria focada DEVE manter o
  comportamento das features 010/015 (nunca para `★ Favoritos`,
  `↺ Histórico`, `Todos` nem para a categoria já aberta).
- **FR-046**: O ciclo de vida do player (feature 020) DEVE permanecer
  intacto nos dois detalhes.
- **FR-047**: Carregando, erro, fonte ausente, vazio, `★ Favoritos` vazio e
  `↺ Histórico` vazio DEVEM usar os componentes V14 de estado e ter pelo
  menos um elemento focável acionável por SELECT.
- **FR-048**: Os testes de contrato travados de features anteriores que
  cobrem Filmes/Séries DEVEM passar sem edição.

**Dados**

- **FR-049**: A importação e a obtenção sob demanda DEVEM capturar, para
  filmes e séries, o ano e a data de inclusão quando a fonte os declara em
  campo próprio, com a mesma normalização e as mesmas regras já usadas para
  capas; valor ausente, ilegível ou fora de faixa plausível DEVE ser
  tratado como ausente. Para episódios obtidos do provedor, DEVEM capturar
  também a duração e a imagem declaradas pela fonte, com as mesmas regras.
- **FR-050**: O ano NUNCA DEVE ser inferido do título nem de fonte externa
  nesta feature.
- **FR-051**: URLs de capa e de reprodução, como qualquer URL do catálogo,
  NUNCA DEVEM aparecer em log, mensagem de erro ou texto visível.

**Testes**

- **FR-052**: Os E2E `capa-real.mjs`, `historico-continuar-assistindo.mjs`,
  `favoritos.mjs`, `busca-por-categoria.mjs` e `paridade-visual.mjs` (e
  qualquer outro que toque as quatro telas) DEVEM ser atualizados para os
  novos seletores e passar, sem perder asserções de comportamento.

### Key Entities

- **Filme/série (registro de catálogo, `kind: movie`/`series`)**: ganha o
  ano e a data de inclusão declarados pela fonte, como campos de valor.
  Identidade inalterada.
- **Estado do usuário (`UserStateRecord`)**: inalterado; o Histórico é uma
  leitura dos registros com reprodução gravada (`lastWatched`), por filme e
  por episódio, agregados por série para Séries.
- **Entrada do Histórico**: item resolvido do catálogo (filme, ou série
  resolvida a partir dos seus episódios) + instante da última reprodução +
  estado assistido/progresso.
- **Preferência de ordenação**: uma por seção (Filmes, Séries), só na
  sessão; valores "Ordem da fonte", "A–Z", "Ano", "Recém-adicionados".
- **Memória de foco por entrada**: por seção e por entrada da side nav,
  último item focado (por identidade), só na sessão; estende o
  `CategoryScreenSnapshot` da feature 017.
- **Mocks "Trailer", "Elenco", "Semelhantes"**: novas entradas no registro
  único de mocks, com os itens 32 e 45 do backlog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos cenários E2E de capa real, histórico/continuar
  assistindo, favoritos e busca por categoria que passavam antes da onda
  passam depois, e os contratos travados de features anteriores passam sem
  edição.
- **SC-002**: Em todos os estados das quatro telas (carregando, erro,
  vazio, fonte ausente, Favoritos vazio, Histórico vazio, grade, modal de
  Ordenar, modal de temporada, detalhe), existe exatamente um elemento com
  foco visível e ele é acionável pelo controle.
- **SC-003**: Voltar do detalhe restaura o card de origem em 100% dos casos
  em que ele ainda existe; nos demais, o foco cai num vizinho visível.
- **SC-004**: O Histórico mostra 100% das reproduções resolvíveis da lista
  ativa, na ordem da mais recente, com cada série exatamente uma vez.
- **SC-005**: Numa categoria com 500 itens, o número de cards renderizados
  fica limitado à janela visível mais a margem de pré-renderização,
  independentemente do tamanho da categoria.
- **SC-006**: Nenhuma opção de Ordenar é oferecida sem que ao menos um item
  da entrada tenha o dado correspondente, e nenhum card, hero ou detalhe
  exibe valor que o catálogo não tenha.
- **SC-007**: A pessoa alcança a topbar a partir de Filmes/Séries e volta ao
  mesmo item com no máximo uma tecla em cada sentido.

## Assumptions

- A composição de escopos topbar ↔ conteúdo da feature 023
  (`logic/foco-shell.md`), já reaproveitada pela Live na 024, serve também
  para Filmes e Séries.
- Os componentes da feature 022 cobrem o layout; ajustes neles são
  permitidos se não quebrarem os próprios testes.
- A lógica de `lib/` fica intocada, exceto a captura de ano/data de
  inclusão e a leitura agregada do Histórico (estratégia "strangler" do
  roteiro); a resolução de episódio para série-mãe reaproveita a da feature
  019 (`resolveContinueWatching`/`resolveFavorites`).
- O painel do provedor declara ano e data de inclusão nas listagens de
  filmes e séries; fontes M3U em geral não declaram, e aí as opções
  correspondentes simplesmente não aparecem.
- Registros já gravados só ganham ano/data de inclusão quando a categoria
  for relida pelo fluxo normal (janela de frescor da feature 010) ou por
  ressincronização; não há migração forçada.
- O `lastWatched` gravado pelas features 011/012 é o registro de
  reprodução usado pelo Histórico; não há migração do banco local.
- A folha de estilos compartilhada entre a Live (já migrada) e as telas
  antigas só perde regras depois de confirmado, por busca no código, que
  nenhuma tela ainda as usa (cuidado registrado no plano da 024).
- A passada na TV física (capas em grade com hero, rolagem, plano de
  hardware nos detalhes) é **recomendada, não gate** desta feature.
- A navegação entre side nav, barra de ferramentas e grade é por vizinhos
  explícitos (R-4 do roteiro), sem saltos diagonais do protótipo.

## Clarifications

### Sessão 2026-09-27

- Q: Filmes e Séries ficam sob a topbar nesta onda? → A: Sim, as grades
  sob a topbar (aba ativa, ↑ no primeiro item da side nav sobe, ↓ volta);
  os detalhes continuam em tela cheia empilhados, sem topbar.
- Q: Como o `↺ Histórico` de Séries agrupa (o dado é por episódio)? → A:
  Uma entrada por série, ordenada pelo `lastWatched` mais recente de
  qualquer episódio dela; abre o detalhe da série.
- Q: Remover item/limpar Histórico (§48.4) entra aqui? → A: Não. Histórico
  só leitura; limpeza vai para Configurações/Privacidade (Onda 5).
- Q: Itens do Histórico que não resolvem para o catálogo atual? → A: Ficam
  de fora, com aviso honesto de quantos não puderam ser exibidos (padrão
  dos Favoritos da 013).
- Q: Quais opções de Ordenar? → A: "Ordem da fonte", "A–Z", "Ano" e
  "Recém-adicionados"; passa a capturar ano e data de inclusão quando a
  fonte declara; opção sem dado na entrada fica ausente; itens sem o dado
  vão ao fim.
- Q: Escopo da ordenação? → A: Por seção (Filmes, Séries), valendo para
  todas as categorias e `Todos`, só na sessão; `★ Favoritos` e
  `↺ Histórico` não têm Ordenar e mantêm a ordem própria.
- Q: Interface do Ordenar? → A: Botão "Ordenar · <atual> ▾" na barra abre
  um `Modal` com as opções e ✓ na atual; foco volta ao botão.
- Q: Busca? → A: Campo "Pesquisar" na barra de ferramentas V14, ao lado de
  Ordenar, com o comportamento da feature 018 inalterado.
- Q: O que a hero band mostra? → A: O card focado (antes de focar, o
  primeiro item): capa real, título, metadados reais; sem sinopse e sem
  ações próprias.
- Q: Hero band ao rolar? → A: Compacta, fixa; a grade rola abaixo (um dono
  de scroll).
- Q: Side nav recolhe ao entrar na grade? → A: Não.
- Q: Contagem na side nav? → A: Mesma regra da Live; `★ Favoritos` e
  `↺ Histórico` com a quantidade real; `Todos` sem número.
- Q: Abas do detalhe? → A: Série: Episódios, Detalhes (reais), Elenco,
  Semelhantes (mocks). Filme: Detalhes (real), Elenco, Semelhantes (mocks).
- Q: Seletor de temporada? → A: Botão "Temporada N ▾" que abre um `Modal`.
- Q: Ações do hero do detalhe? → A: Filme: Assistir/Continuar, Minha
  Lista, Trailer (mock, item 32), Marcar assistido (última). Série:
  Continuar TX:EY/Assistir, Minha Lista, Trailer (mock).
- Q: Sinopse/metadados sem dado na fonte? → A: Só dado real, sem bloco de
  sinopse; saem o backdrop de placeholder e "Elenco: Desconhecido". Nenhuma
  consulta extra por item para obter sinopse.
- Q: Memória de foco (§41)? → A: Por entrada, na sessão, em Filmes e
  Séries; voltar do detalhe restaura o card de origem; reconciliação por
  identidade. A Live herda depois.
- Q: Episódios? → A: Lista vertical virtualizada de cards 16:9 com
  progresso real e selo de concluído.
- Q: Rótulo do favorito no detalhe? → A: "Minha Lista"/"Na Minha Lista"
  (vocabulário V14); por baixo, o mesmo favorito da 013; a side nav
  continua `★ Favoritos`.
- Q: Passada na TV física é gate? → A: Recomendada, não gate.
- Q: (sdd-plan) "Barra de progresso real" nos episódios, sem duração
  guardada? → A: Capturar a duração e a imagem declaradas pelo provedor em
  cada episódio; barra só com duração conhecida, senão texto "Continuar de
  mm:ss". FR-041 e FR-049 ajustados.
- Q: (sdd-plan) Quando aparece a contagem de `↺ Histórico`? → A: Só depois
  de conhecida (a pessoa entrou nele ao menos uma vez na sessão); nada é
  resolvido só por abrir a tela. `★ Favoritos` segue a regra da Live
  (quantidade de favoritos do tipo). FR-007 ajustado.
- Q: (sdd-plan) E o "Reiniciar" da feature 011 no detalhe de filme? → A:
  Mantido, logo após "Continuar", só quando há retomada. FR-033 ajustado.
