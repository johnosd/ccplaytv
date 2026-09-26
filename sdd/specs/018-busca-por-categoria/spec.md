# Feature Specification: Busca por categoria com ícone de entrada e categoria virtual "Todos"

**Slug**: `018-busca-por-categoria`

**Created**: 2026-09-25

**Status**: Convergida

**Input**: Redesenho da busca local entregue pela feature `017-busca-local-
catalogo` (já convergida/Implementada). Pedido do usuário (verbatim): "a
busca so deve existir dentro das categorias, devemos criar um categoria
chamada 'todos' onde o usuario pode clicar e peequisar em todo conteudo se
quiser. e caso ele clicar em outra categoria o filtro so filtra registros
dentreo daquela categoria. por esse motivo acredito que o botão
buscar/pesquisar deve sair da lista da categoria e virar um icone dentro
das categorias". A `017` permanece implementada como está (histórico); esta
feature substitui, na prática, o comportamento de busca que ela entregou.

## Escopo

### Incluído

- Um ícone de busca no topo da área de conteúdo de cada categoria entrada —
  categoria real da fonte, "★ Favoritos" e a nova categoria virtual "Todos"
  — nas três seções (Live TV, Filmes, Séries).
- Uma nova entrada virtual "Todos" na trilha de categorias de cada seção,
  logo após "★ Favoritos", reunindo todos os itens do tipo já lidos no
  aparelho (de todas as categorias já cobertas) — navegável como uma
  categoria normal, mesmo sem buscar.
- Confirmar o ícone abre um campo de texto (teclado do sistema da TV) que
  substitui a lista/grade da categoria atual; digitar filtra, em tempo
  real, só os itens daquele escopo (a categoria específica, os favoritos,
  ou tudo, dentro de "Todos").
- Aviso de cobertura parcial ("Busca em X de Y categorias") dentro de
  "Todos", quando existirem categorias do tipo ainda não lidas no aparelho.
- Reaproveita, sem redefinir aqui, o que a `017` já resolveu e continua
  válido: normalização de acento/caixa, mínimo de 3 caracteres, debounce,
  ordenação (prefixo primeiro, depois contém, alfabético), nunca consultar
  o provedor ou qualquer serviço externo, e a restauração de termo/foco ao
  voltar de um item aberto a partir de um resultado.

### Fora de Escopo

- Busca cruzando tipos (canal + filme + série na mesma busca).
- Busca no nível do hub da fonte, fora de uma seção (Live TV/Filmes/Séries).
- Achar categorias pelo nome — a busca continua filtrando só itens.
- Buscar episódios dentro de uma série.
- Ícone de busca dentro da lista de zapping sobreposta ao vídeo tocando
  (Live TV, feature 016) — continua sem busca, sem alteração.
- Redesenho visual do restante da tela de categoria (só a área afetada pelo
  ícone/campo de busca muda).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buscar dentro da categoria atual (Priority: P1)

Como pessoa assistindo TV, ao entrar numa categoria (de canais, filmes ou
séries) com muitos itens, quero acionar um ícone de busca e filtrar
rapidamente só os itens dessa categoria pelo nome, sem sair dela nem ver
resultados de outras categorias.

**Why this priority**: é o caso mais comum — a pessoa já sabe em qual
categoria o item está, só quer pular a rolagem manual por uma lista longa.

**Independent Test**: entrar numa categoria com vários itens, acionar o
ícone, digitar parte do nome de um item, confirmar que só itens daquela
categoria aparecem e que selecionar um funciona como na navegação normal.

**Acceptance Scenarios**:

1. **Given** a pessoa está dentro de uma categoria com itens carregados,
   **When** ela navega até o ícone de busca e confirma, **Then** um campo
   de texto substitui a lista/grade, vazio e com foco.
2. **Given** o campo de busca está aberto dentro de uma categoria,
   **When** a pessoa digita 3+ caracteres de um item que existe só em
   outra categoria, **Then** nenhum resultado aparece (a busca não cruza
   categorias).
3. **Given** resultados aparecendo dentro da categoria, **When** a pessoa
   confirma um deles, **Then** o mesmo comportamento da navegação normal
   acontece (canal toca; filme/série abre o detalhe).

---

### User Story 2 - Buscar em tudo pela categoria "Todos" (Priority: P1)

Como pessoa que não lembra em qual categoria um item está, quero uma
categoria "Todos" que reúna tudo que já foi carregado no aparelho daquele
tipo, podendo navegar por ela livremente ou buscar dentro dela para achar
algo em qualquer categoria já coberta.

**Why this priority**: sem isso, achar um item de categoria desconhecida
exige visitar categoria por categoria — a mesma dor que motivou a busca
global da feature 017, agora resolvida sem um item de trilha dedicado.

**Independent Test**: entrar em "Todos", confirmar que itens de mais de
uma categoria aparecem juntos; acionar o ícone de busca e confirmar que um
termo acha um item independente de em qual categoria ele estava.

**Acceptance Scenarios**:

1. **Given** duas ou mais categorias do mesmo tipo já foram abertas antes,
   **When** a pessoa entra em "Todos", **Then** os itens de todas elas
   aparecem juntos, no mesmo formato visual da navegação normal.
2. **Given** existem categorias do tipo ainda não abertas nenhuma vez,
   **When** a pessoa está dentro de "Todos", **Then** a tela informa
   "Busca em X de Y categorias" com os números reais.
3. **Given** todas as categorias do tipo já foram abertas ao menos uma vez,
   **When** a pessoa está dentro de "Todos", **Then** nenhum aviso de
   cobertura aparece.
4. **Given** o campo de busca está aberto dentro de "Todos", **When** a
   pessoa digita o nome de um item que só existe numa categoria específica
   já coberta, **Then** esse item aparece no resultado.

---

### User Story 3 - Buscar dentro de "★ Favoritos" (Priority: P2)

Como pessoa com muitos itens favoritados, quero o mesmo ícone de busca
dentro de "★ Favoritos" para achar um favorito específico sem rolar a
lista inteira.

**Why this priority**: mesmo valor da US1, mas um cenário secundário —
favoritos tende a ser uma lista menor que o catálogo completo.

**Independent Test**: com vários itens favoritados, entrar em "★
Favoritos", acionar o ícone, digitar um termo e confirmar que só favoritos
que batem aparecem.

**Acceptance Scenarios**:

1. **Given** a pessoa está dentro de "★ Favoritos" com itens favoritados,
   **When** ela aciona o ícone de busca e digita um termo, **Then** só os
   favoritos que batem aparecem, no mesmo formato da lista de favoritos.

---

### Edge Cases

- Categoria (real, Favoritos ou Todos) sem nenhum item carregado: o ícone
  de busca não aparece — nada para filtrar.
- "Todos" antes de qualquer categoria do tipo ter sido aberta: lista vazia
  e aviso "Busca em 0 de Y categorias", mesmo sem estar buscando.
- Um item presente em mais de uma categoria aparece uma vez por categoria
  de origem dentro de "Todos" — nunca deduplicado silenciosamente (mesma
  regra da feature 017).
- Termo com menos de 3 caracteres: nenhum resultado, com uma indicação de
  quantos faltam — mesma regra da 017.
- Nenhum resultado para o termo digitado: estado vazio explícito, nunca um
  erro, sem prender o controle remoto (RETURN sempre sai).
- RETURN com um resultado focado volta o foco ao campo; RETURN a partir do
  campo fecha a busca e volta a mostrar a lista/grade normal da categoria
  (sem sair dela); um RETURN adicional a partir daí sai da categoria para a
  trilha, como já acontece hoje.
- Sair de uma categoria com uma busca em andamento e reentrar do zero:
  campo sempre volta vazio (cada categoria guarda seu próprio termo, sem
  compartilhar entre categorias, e sem sobreviver a uma saída completa).
- Voltar de um item aberto a partir de um resultado de busca: termo,
  resultados e foco no item restaurados (mecanismo já existente, não
  redefinido aqui).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada tela de categoria (Live TV, Filmes, Séries) DEVE mostrar
  um ícone de busca no topo da área de conteúdo, junto ao título/contagem
  da categoria atualmente entrada — para categorias reais da fonte, "★
  Favoritos" e "Todos" — sempre que essa categoria tiver ao menos um item
  carregado localmente.
- **FR-002**: A trilha de categorias DEVE incluir uma nova entrada virtual
  "Todos", posicionada logo após "★ Favoritos" e antes das categorias
  reais da fonte, em cada seção (Live TV, Filmes, Séries) de forma
  independente.
- **FR-003**: Entrar em "Todos" DEVE listar todos os itens do tipo daquela
  seção já lidos no aparelho (de todas as categorias já cobertas), no
  mesmo formato visual da navegação normal (lista de canais / grade de
  pôsteres).
- **FR-004**: Confirmar (SELECT) o ícone de busca DEVE abrir um campo de
  texto que substitui a lista/grade atual, com foco no campo e usando o
  teclado do sistema da TV.
- **FR-005**: Digitar no campo (a partir de 3 caracteres, após uma pausa
  breve) DEVE filtrar, em tempo real, só os itens do escopo atualmente
  entrado que contenham o termo (normalizado sem acento/caixa) — nunca
  consultando o provedor ou qualquer serviço externo.
- **FR-006**: Dentro de uma categoria real ou "★ Favoritos", a busca DEVE
  ficar restrita aos itens daquela categoria/dos favoritos — nunca
  misturando com outras categorias.
- **FR-007**: Dentro de "Todos", a busca DEVE cobrir os itens de todas as
  categorias do tipo já lidas no aparelho.
- **FR-008**: Cada categoria (real, Favoritos, Todos) DEVE manter seu
  próprio termo de busca de forma independente; sair da categoria e
  reentrar do zero DEVE sempre começar com o campo vazio.
- **FR-009**: Voltar de um item aberto a partir de um resultado de busca
  DEVE restaurar o termo digitado, os resultados e o foco no item que
  estava aberto.
- **FR-010**: Quando "Todos" tiver categorias do tipo ainda não lidas no
  aparelho, a tela DEVE informar "Busca em X de Y categorias" com os
  números reais — tanto ao listar sem buscar quanto ao buscar; quando
  todas as categorias já estiverem cobertas, esse aviso NÃO DEVE aparecer.
- **FR-011**: Categorias reais e "★ Favoritos" NÃO DEVEM mostrar o aviso
  de cobertura — a busca ali sempre cobre 100% do que existe localmente na
  categoria.
- **FR-012**: Os resultados DEVEM vir ordenados com os nomes que começam
  com o termo primeiro, os demais depois, cada grupo em ordem alfabética.
- **FR-013**: Um item presente em várias categorias DEVE aparecer uma vez
  por categoria de origem dentro de "Todos" — nunca deduplicado
  silenciosamente.
- **FR-014**: Nenhum resultado DEVE levar a um estado vazio explícito
  (nunca um erro), com pelo menos um elemento focável.
- **FR-015**: SELECT num resultado DEVE fazer o mesmo que SELECT no mesmo
  item na navegação normal da categoria (canal toca; filme/série abre o
  detalhe).
- **FR-016**: Segurar SELECT (ou a tecla amarela) sobre um resultado DEVE
  favoritar/desfavoritar o item como na navegação normal.
- **FR-017**: RETURN a partir de um resultado focado DEVE voltar o foco ao
  campo de busca; RETURN a partir do campo (sem resultado focado) DEVE
  fechar a busca e voltar a mostrar a lista/grade normal da categoria
  (sem sair dela); um RETURN adicional a partir daí segue o comportamento
  padrão de sair da categoria para a trilha.
- **FR-018**: A lista de zapping sobreposta ao vídeo tocando (Live TV) NÃO
  DEVE ganhar o ícone de busca.
- **FR-019**: O termo de busca NUNCA DEVE ser enviado a um serviço
  externo, provedor ou terceiro — a busca é inteiramente local.

### Key Entities

- Nenhuma entidade de dados nova. "Todos" é uma agregação calculada em
  tempo real a partir das categorias já existentes — mesma natureza de "★
  Favoritos" (nunca persistida como categoria real, nunca confundida com
  uma categoria declarada pela fonte).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dentro de uma categoria com dezenas ou centenas de itens,
  alguém acha um item específico digitando parte do nome, sem sair da
  categoria e sem ver itens de outra categoria no resultado.
- **SC-002**: Alguém encontra um item de qualquer categoria do tipo — sem
  saber de antemão em qual categoria ele está — entrando em "Todos" e
  buscando, sem precisar visitar categoria por categoria.
- **SC-003**: A cobertura parcial de "Todos" é sempre comunicada quando
  existir categoria não lida, nunca escondida nem inventada; e nunca
  aparece fora de "Todos".
- **SC-004**: Nenhuma tecla ou estado da busca prende a navegação por
  controle remoto — RETURN sempre sai, em qualquer camada (resultado →
  campo → categoria → trilha).

## Assumptions

- Dentro de "Todos", o aviso de cobertura parcial aparece sempre que a
  pessoa estiver com essa categoria entrada — inclusive antes de buscar,
  já que a própria lista-base exibida já é parcial quando há categoria não
  lida. Ajustável no `sdd-plan`/durante a execução se, ao revisar, o
  usuário preferir mostrar o aviso só durante uma busca ativa.
- O símbolo/rótulo exato do ícone de busca e onde ele se encaixa nos
  tokens de design (ADR-007) ficam para o `sdd-plan`.
- O mecanismo técnico de restauração de foco/termo ao voltar do detalhe
  (`CategoryScreenSnapshot`, feature 017) é reaproveitado — decisão
  técnica de "como", não redefinida aqui.
- Performance de "Todos" com um volume grande de itens agregados apoia-se
  na virtualização de lista/grade já existente (feature 009) — não é um
  requisito novo desta feature, é uma garantia já dada pelo sistema atual.
- A feature `017-busca-local-catalogo` permanece registrada como
  `Implementada` no histórico; esta feature não a reabre, apenas substitui
  o comportamento de busca em produção assim que for implementada e
  convergida.

## Clarifications

### Sessão 2026-09-25

- Q: Onde a nova categoria virtual "Todos" fica na trilha lateral? → A:
  Logo após "★ Favoritos", antes das categorias reais.
- Q: Ao entrar em "Todos" sem digitar nada, o que a tela mostra? → A:
  Lista todos os itens já cobertos, como uma categoria normal — o ícone de
  busca filtra essa lista quando acionado.
- Q: Onde o ícone de busca aparece dentro da tela de uma categoria? → A:
  No topo da área de conteúdo, junto do título/contagem.
- Q: Como a pessoa ativa o ícone com o controle remoto? → A: Navega até
  ele com as setas e aperta OK — mais um elemento focável na navegação
  direcional normal (ADR-009), não uma tecla dedicada.
- Q: Quando confirmado, o campo substitui a lista ou aparece por cima dela?
  → A: Substitui — mesmo padrão visual da feature 017, nunca lista e campo
  ao mesmo tempo.
- Q: O termo de busca sobrevive a sair de uma categoria e reentrar? → A:
  Não — cada categoria tem seu próprio termo, sempre reseta ao reentrar do
  zero (voltar de um item aberto continua restaurando, isso não muda).
- Q: Faz sentido mostrar "Busca em X de Y categorias" fora de "Todos"? →
  A: Não — dentro de uma categoria específica a cobertura é sempre
  completa (ela só existe localmente por já ter sido aberta); o aviso é
  exclusivo de "Todos".
- Q: "★ Favoritos" também ganha o ícone de busca? → A: Sim — mesmo ícone,
  mesmo comportamento, filtrando só os favoritos daquele tipo.
- Q: A lista de zapping (Live TV, feature 016) também ganha o ícone? → A:
  Não — continua sem busca, mesma decisão da feature 017 (D-009).
- Q: O que fica fora de escopo mesmo sendo relacionado? → A: Busca
  cruzando tipos, busca no nível do hub da fonte, achar categorias pelo
  nome, e buscar episódios dentro de uma série — todas as quatro
  permanecem como já decidido na feature 017.
