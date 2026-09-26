# Feature Specification: Busca Local em Live TV, Filmes e Séries

**Slug**: `017-busca-local-catalogo`

**Created**: 2026-09-25

**Status**: Implementada

**Input**: Item 12 do backlog ("Pesquisa nos três tipos", RF-012): buscar
canais, filmes e séries por nome no catálogo já salvo no aparelho, sem
depender de rede, conta ou serviço externo, indicando o escopo pesquisado e
avisando quando a cobertura for parcial. Referências: RF-012; ADR-005 §3;
`docs/guia-praticas-app-tv/05` §2 (busca no catálogo: pausa de ~300 ms,
respostas antigas nunca substituem as atuais, foco no primeiro resultado ao
confirmar, RETURN volta ao termo, acentos e caixa consistentes, informar
quantidade e área pesquisada). O protótipo de design não desenha uma tela
de busca (backlog item 20).

**Atualização (feature `018-busca-por-categoria`, 2026-09-25):** o design
de busca desta spec — uma única entrada "🔍 Buscar" fixa no topo da trilha,
pesquisando o tipo inteiro (todas as categorias de uma vez) — foi
substituído em produção pela feature 018, a pedido do usuário: a busca
passou a ser um ícone dentro de cada categoria/★ Favoritos/nova categoria
virtual "Todos", escopada por padrão à entrada atual. Esta spec, seu
`plan.md` e o código que ela descreveu permanecem como registro histórico
de uma decisão de design já superada — não descreva o comportamento aqui
documentado como o comportamento atual do app. Ver
`sdd/specs/018-busca-por-categoria/` para o design vigente.

## Escopo

### Incluído

- Uma entrada "🔍 Buscar" no topo da trilha de categorias de cada seção
  (Live TV, Filmes, Séries), acima de "★ Favoritos".
- Busca por nome restrita ao tipo da seção: Live TV busca canais, Filmes
  busca filmes, Séries busca séries — da fonte aberta.
- Digitação do termo com o teclado do sistema da TV.
- Resultados atualizados enquanto a pessoa digita, a partir de 3
  caracteres, sem acento nem maiúscula fazerem diferença.
- Contagem de resultados e aviso explícito, com números, quando a busca não
  cobriu o catálogo inteiro da fonte (categorias ainda não abertas).
- Abrir um resultado faz o mesmo que abrir o item na navegação normal, e
  voltar dele restaura a busca e o foco no item de origem.
- Voltar do detalhe de um filme ou série aberto pela **grade normal**
  (fora da busca) também restaura a categoria, o foco e a posição — fecha o
  bug de backlog "Voltar do detalhe pra grade não restaura foco nem
  posição", que usa o mesmo mecanismo (decisão do usuário no `sdd-plan`).

### Fora de Escopo

- "🔍 Buscar" na trilha do zapping (lista por cima do vídeo, feature 016)
  — a busca fica só no Live TV normal.

- Buscar no provedor pela rede, ou obter automaticamente categorias ainda
  não abertas para ampliar a cobertura — a busca é sempre só sobre o que
  já está no aparelho.
- Encontrar categorias pelo nome — os resultados são só itens (canais,
  filmes, séries).
- Busca global que junta os três tipos numa tela só (entrada no hub da
  lista).
- Buscar episódios pelo nome dentro de séries — Séries busca pelo nome da
  série.
- Buscar em mais de uma fonte ao mesmo tempo.
- Teclado próprio desenhado pelo app, ou ajustes finos do teclado do
  sistema (backlog item 18).
- Busca por voz, sugestões, histórico de termos, correção ortográfica,
  busca aproximada ("fuzzy").
- Lembrar o termo entre entradas: cada nova entrada em "🔍 Buscar" começa
  vazia.
- Busca por sinopse, gênero, ano ou qualquer metadado além do nome.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Achar um canal, filme ou série pelo nome (Priority: P1)

A pessoa entra em Live TV, Filmes ou Séries, sobe até "🔍 Buscar" no topo
da trilha, digita parte do nome com o teclado da TV e vê, enquanto digita,
os itens daquele tipo cujo nome contém o termo — sem ter que percorrer a
trilha categoria por categoria. Escolher um resultado faz o mesmo que na
navegação normal: canal toca, filme ou série abre o detalhe.

**Why this priority**: é o valor central do item — num catálogo real de
dezenas de categorias (41 só de canais na fonte de referência), achar algo
específico hoje depende de navegar a trilha inteira.

**Independent Test**: numa fonte com categorias já abertas, entrar em
"🔍 Buscar" de uma seção, digitar parte de um nome conhecido, ver o item
nos resultados e abri-lo com OK.

**Acceptance Scenarios**:

1. **Given** uma seção aberta, **When** a pessoa olha a trilha, **Then**
   "🔍 Buscar" é a primeira entrada, acima de "★ Favoritos".
2. **Given** a pessoa entra em "🔍 Buscar", **When** a entrada abre,
   **Then** o campo de busca está vazio e com foco, e a digitação usa o
   teclado do sistema da TV.
3. **Given** o campo com menos de 3 caracteres, **When** a pessoa olha a
   área de resultados, **Then** ela orienta a continuar digitando, sem
   listar nada.
4. **Given** 3 ou mais caracteres, **When** a pessoa para de digitar por um
   instante, **Then** os resultados mostram todos os itens daquele tipo,
   já salvos no aparelho, cujo nome contém o termo em qualquer posição,
   ignorando acentos e maiúsculas.
5. **Given** resultados na tela, **When** a pessoa olha a lista, **Then**
   os nomes que começam com o termo vêm primeiro, depois os demais, cada
   grupo em ordem alfabética, e cada resultado mostra o nome da categoria
   a que pertence.
6. **Given** resultados na tela, **When** a pessoa confirma a busca,
   **Then** o foco vai para o primeiro resultado.
7. **Given** um resultado focado, **When** a pessoa pressiona OK, **Then**
   acontece o mesmo que na navegação normal da seção: canal começa a
   tocar; filme ou série abre o detalhe.
8. **Given** a pessoa abriu um resultado, **When** volta do player ou do
   detalhe, **Then** a busca reaparece com o mesmo termo, os mesmos
   resultados e o foco no item que ela tinha aberto.

---

### User Story 2 - Saber o que a busca cobriu (Priority: P2)

Quando a fonte ainda tem categorias nunca abertas neste aparelho, a busca
diz claramente, com números, quanto do catálogo foi pesquisado — para a
pessoa não concluir que um item não existe só porque ele está numa
categoria que ainda não foi obtida.

**Why this priority**: sem isso, a busca de uma fonte de provedor (que só
guarda as categorias abertas) apresentaria um catálogo parcial como se
fosse o completo — o que a constitution proíbe ("Progresso e Capacidades
São Reais"). É P2 porque a P1 já entrega valor sozinha numa fonte cuja
cobertura é total.

**Independent Test**: numa fonte com algumas categorias nunca abertas,
buscar um termo; a tela informa quantas categorias foram cobertas do
total. Numa fonte com cobertura total, nenhum aviso aparece.

**Acceptance Scenarios**:

1. **Given** uma seção com categorias ainda não abertas, **When** a busca
   mostra resultados (ou nenhum), **Then** a tela informa "busca em X de
   Y categorias" com os números reais daquela seção.
2. **Given** uma seção com todas as categorias já disponíveis no
   aparelho, **When** a busca mostra resultados, **Then** nenhum aviso de
   cobertura parcial aparece.
3. **Given** nenhum resultado para o termo, **When** a pessoa olha a
   tela, **Then** aparece um estado vazio ("nenhum resultado para o
   termo") com a indicação de cobertura, nunca uma mensagem de erro, e
   com um elemento focável.
4. **Given** qualquer busca com resultados, **When** a pessoa olha a
   tela, **Then** a quantidade de resultados encontrados é informada.

---

### Edge Cases

- Digitação rápida trocando o termo várias vezes: resultados de um termo
  anterior nunca substituem os do termo atual.
- Termo só com espaços ou abaixo de 3 caracteres depois de apagar: volta
  ao estado "continue digitando", sem resultados antigos na tela.
- Termo com acentos, cedilha ou maiúsculas ("SÃO", "sao", "São") encontra
  os mesmos itens.
- O mesmo canal/filme presente em mais de uma categoria da fonte: aparece
  uma vez por categoria, cada um com o nome da sua categoria.
- Item marcado como indisponível (sem fonte de reprodução) aparece nos
  resultados do mesmo jeito que na navegação normal, e abri-lo se
  comporta do mesmo jeito.
- Muitos resultados: a lista rola com o foco, sem travar a tela.
- Seção sem nenhuma categoria aberta ainda (fonte de provedor recém
  importada): qualquer busca dá zero resultados, com o aviso "busca em 0
  de Y categorias".
- Um canal tocado a partir da busca, e depois o zapping (feature 016)
  aberto por cima dele: o zapping funciona como sempre, com foco no canal
  tocando na categoria dele.
- Segurar OK ou a tecla amarela sobre um resultado: favorita/desfavorita
  do mesmo jeito que na navegação normal (feature 013).
- RETURN no campo de busca (vazio ou não): sai da busca de volta à
  trilha; entrar de novo em "🔍 Buscar" começa vazio.
- RETURN com o foco num resultado: volta ao campo com o termo intacto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada seção (Live TV, Filmes, Séries) DEVE ter uma entrada
  "🔍 Buscar" como primeiro item da trilha de categorias, acima de
  "★ Favoritos".
- **FR-002**: A busca de uma seção DEVE considerar apenas itens do tipo
  daquela seção (canais em Live TV, filmes em Filmes, séries em Séries)
  e apenas da fonte aberta.
- **FR-003**: O termo DEVE ser digitado com o teclado do sistema da TV,
  alcançável só com o controle remoto.
- **FR-004**: Cada nova entrada em "🔍 Buscar" pela trilha DEVE começar
  com o campo vazio.
- **FR-005**: Com menos de 3 caracteres (desconsiderando espaços nas
  pontas), a busca NÃO DEVE listar resultados e DEVE orientar a
  continuar digitando.
- **FR-006**: Com 3 ou mais caracteres, os resultados DEVEM ser
  atualizados automaticamente depois de uma pausa curta na digitação, sem
  exigir confirmação.
- **FR-007**: Um item DEVE ser resultado quando seu nome contém o termo em
  qualquer posição, sem diferença entre letras acentuadas e não
  acentuadas nem entre maiúsculas e minúsculas.
- **FR-008**: Resultados de um termo anterior NUNCA DEVEM substituir ou se
  misturar aos do termo atual.
- **FR-009**: A busca DEVE considerar só o que já está no aparelho — NUNCA
  DEVE consultar o provedor, qualquer serviço externo ou a rede, nem
  obter categorias não abertas para ampliar a cobertura.
- **FR-010**: Os resultados DEVEM vir ordenados com os nomes que começam
  com o termo primeiro e os demais depois, cada grupo em ordem
  alfabética.
- **FR-011**: Cada resultado DEVE mostrar o nome da categoria da fonte a
  que pertence; um item presente em várias categorias DEVE aparecer uma
  vez por categoria.
- **FR-012**: Os resultados DEVEM ser apresentados no mesmo formato visual
  da navegação normal da seção (lista de canais em Live TV, grade de
  pôsteres em Filmes e Séries).
- **FR-013**: A tela DEVE informar quantos resultados foram encontrados.
- **FR-014**: Quando a seção tiver categorias cujo conteúdo ainda não está
  no aparelho, a tela DEVE informar "busca em X de Y categorias" com os
  números reais; quando todas estiverem disponíveis, NÃO DEVE exibir esse
  aviso.
- **FR-015**: Nenhum resultado DEVE levar a um estado vazio explícito (não
  a um erro), com o aviso de cobertura quando aplicável e pelo menos um
  elemento focável e acionável por SELECT. **Atualização (sdd-execute,
  Fase 3, 2026-09-25):** nas três telas, o campo de busca é esse elemento —
  ele mantém foco DOM real durante o estado vazio (só perde foco quando há
  um resultado para o qual mover), então um botão "Voltar ao campo"
  dedicado seria redundante (dois elementos com aparência de foco ao mesmo
  tempo) e RETURN a partir do campo já sai sem beco sem saída. Implementado
  sem esse botão em `LiveScreen.tsx` (Fase 3) e replicado em
  `MoviesScreen.tsx`/`SeriesScreen.tsx` (Fase 4); ver `plan.md` → Riscos e
  Decisões.
- **FR-016**: Confirmar a busca (OK no teclado) com resultados na tela
  DEVE mover o foco para o primeiro resultado.
- **FR-017**: OK num resultado DEVE fazer o mesmo que OK no mesmo item na
  navegação normal da seção (canal toca; filme/série abre o detalhe).
- **FR-018**: Segurar OK ou a tecla amarela sobre um resultado DEVE
  favoritar/desfavoritar o item como na navegação normal.
- **FR-019**: Voltar do player ou do detalhe aberto a partir de um
  resultado DEVE restaurar o termo, os resultados e o foco no item de
  origem.
- **FR-020**: RETURN com o foco num resultado DEVE voltar ao campo de
  busca sem apagar o termo; RETURN no campo DEVE sair da busca de volta
  à trilha.
- **FR-021**: O termo digitado NUNCA DEVE ser gravado, enviado a terceiros
  ou registrado em log.
- **FR-022**: Voltar do detalhe de um filme ou série aberto pela grade
  normal de Filmes/Séries DEVE restaurar a categoria entrada, o foco no
  item de origem (por identidade, não por índice) e a posição da grade.
- **FR-023**: A trilha do zapping (lista por cima do vídeo, feature 016)
  NÃO DEVE conter a entrada "🔍 Buscar".
- **FR-024**: Categorias cujo conteúdo guardado (fonte M3U, feature 014)
  ainda não foi aberto DEVEM contar como não cobertas no aviso de
  cobertura (FR-014) e seus itens NÃO DEVEM aparecer nos resultados.

### Key Entities

Nenhuma entidade nova. A busca lê os canais, filmes e séries já salvos no
catálogo local e a estrutura de categorias da fonte (que diz quais
categorias já têm conteúdo no aparelho); nada relativo à busca é
persistido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa fonte com as categorias necessárias já abertas, a
  pessoa encontra e abre um item conhecido pelo nome, a partir da trilha,
  só com o controle remoto, sem percorrer categorias.
- **SC-002**: Os resultados aparecem sem atraso perceptível depois da
  pausa na digitação, mesmo com milhares de itens salvos na seção.
- **SC-003**: Em 100% das buscas numa seção com cobertura parcial, a tela
  informa quantas categorias foram cobertas do total; em nenhuma busca
  numa seção com cobertura total esse aviso aparece.
- **SC-004**: Digitar rápido, trocando o termo, nunca deixa na tela
  resultados que não correspondam ao termo atual.
- **SC-005**: Pesquisar nunca gera tráfego de rede.

## Assumptions

- ~~"Já está no aparelho" inclui o conteúdo guardado de categorias M3U
  (`stored`) ainda não abertas.~~ Resolvido no `sdd-plan`: esse conteúdo
  não é pesquisável sem abrir a categoria, então essas categorias contam
  como não cobertas (FR-024) — ver Clarifications, nota técnica.
- Uma categoria de provedor aberta há mais de 24 h (vencida pela janela de
  frescor da feature 010) continua com seu conteúdo no aparelho e conta
  como coberta — a busca não revalida nada.
- O teclado do sistema da TV é o mesmo já usado no formulário de adicionar
  fonte; ajustes finos ficam no backlog item 18.
- A entrada "🔍 Buscar" segue o mesmo padrão visual e de foco que
  "★ Favoritos" já usa na trilha (feature 013); não é um padrão novo.
- A pausa antes de atualizar os resultados parte de ~300 ms, como sugere o
  guia Samsung 05, ajustável em testes.

## Clarifications

### Sessão 2026-09-25

- Q: Uma fonte de provedor só guarda os itens das categorias já abertas
  (feature 010). O que a busca cobre? → A: Só o que está salvo no
  aparelho, avisando quando a cobertura for parcial — sem consultar o
  provedor (FR-009, FR-014).
- Q: Onde a busca fica acessível? → A: Dentro de cada seção (Live TV,
  Filmes, Séries), não no hub da lista — o escopo de tipo fica implícito
  na seção (FR-002).
- Q: Como escolher o escopo (abas vs. agrupado)? → A: Não se aplica — com
  a busca dentro de cada seção, cada uma pesquisa só o seu tipo.
- Q: Como digitar? → A: Teclado do sistema da TV (FR-003).
- Q: Onde fica a entrada dentro da seção? → A: No topo da trilha, acima de
  "★ Favoritos" (FR-001).
- Q: Resultados incluem categorias cujo nome combina? → A: Não, só itens.
- Q: Como o termo combina com o nome? → A: Contém em qualquer posição,
  ignorando acentos e maiúsculas (FR-007).
- Q: O termo sobrevive a sair da busca? → A: Cada nova entrada pela
  trilha começa vazia; voltar de um resultado aberto (player/detalhe)
  restaura termo, resultados e foco — confirmado depois de apontado o
  conflito com "Voltar Restaura Foco e Posição" da constitution e com o
  guia Samsung 05 (FR-004, FR-019).
- Q: Como avisar cobertura parcial? → A: Com números — "busca em X de Y
  categorias" (FR-014).
- Q: A partir de quantos caracteres? → A: 3 (FR-005).
- Q: Ordem dos resultados? → A: Nomes que começam com o termo primeiro,
  depois os demais, cada grupo em ordem alfabética (FR-010).
- Q: Item repetido em várias categorias? → A: Aparece uma vez por
  categoria, com o nome da categoria abaixo (FR-011).

### Sessão 2026-09-25 (nota técnica, durante sdd-plan)

- Q: Em Filmes/Séries, abrir o detalhe troca de tela e a tela de origem é
  desmontada — voltar a reconstrói do zero. Isso impede FR-019 e é o mesmo
  bug já registrado no backlog ("Voltar do detalhe pra grade não restaura
  foco nem posição"). Como resolver? → A: Resolver junto nesta feature, com
  um mecanismo único que cobre a busca e a grade normal, fechando também o
  bug do backlog (Escopo "Incluído", FR-022).
- Q: A trilha do zapping (feature 016) é a mesma do Live TV normal, então
  "🔍 Buscar" apareceria por cima do vídeo, dentro da camada modal do
  player — território não testado com o teclado da TV. O que fazer? → A:
  Busca só fora do zapping; a FR-004 da 016 ganha nota de emenda (FR-023).
- Q: (premissa das Assumptions) O conteúdo guardado de categorias M3U
  ainda não abertas é pesquisável? → A: Não — ele ainda não existe como
  item do catálogo (sem id para tocar/abrir) e é apagado quando a
  categoria é aberta. Essas categorias contam como não cobertas, como a
  própria spec já previa (FR-024).
