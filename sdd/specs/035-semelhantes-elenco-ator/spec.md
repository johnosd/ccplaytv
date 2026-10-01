# Feature Specification: Semelhantes, fotos do elenco e página de ator

**Slug**: `035-semelhantes-elenco-ator`

**Created**: 2026-09-30

**Status**: Convergida

**Input**: Item 45 do backlog — "Elenco e Semelhantes". A aba Elenco já é
real desde a feature 032 (nomes em texto). Sobra: a aba "Semelhantes" (hoje o
mock `similar`) cruzada com o catálogo local, a foto de cada pessoa do elenco
e uma página de ator navegável.

## Escopo

### Incluído

- **Aba "Semelhantes" real** no detalhe de filme e de série, com títulos do
  TMDB (recomendações e similares), marcando quais foram encontrados na lista
  da pessoa e quais não.
- **Foto de cada pessoa na aba Elenco** quando o título casou no TMDB.
- **Página de ator**: OK numa pessoa do elenco abre uma tela com foto, nome e
  filmografia (filmes e séries), com a mesma marcação de "encontrado na sua
  lista".
- **Resumo de título não encontrado**: um modal com pôster, ano e sinopse do
  TMDB, sem ação de assistir.
- Navegação em pilha entre detalhe, Semelhantes, outro detalhe e página de
  ator, com RETURN restaurando aba e foco.
- Remove o mock `similar` de `comingSoon.ts`.

### Fora de Escopo

- Equipe técnica além da direção (roteiro, produção, música).
- Biografia, data de nascimento ou qualquer texto biográfico do ator.
- Rail de tendências, rails de recomendação na Home (item 30) e curadoria por
  IA.
- Carregar categorias ainda não abertas para completar o cruzamento — o
  cruzamento usa só o que já está no aparelho.
- Semelhantes ou elenco por episódio.
- Nota/avaliação de qualquer fonte (item 29).
- Assistir um título não encontrado na lista, ou buscá-lo fora dela.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Descobrir títulos parecidos (Priority: P1)

No detalhe de um filme ou série, a pessoa entra na aba "Semelhantes" e vê
títulos parecidos; os que existem na lista dela vêm primeiro e abrem o
detalhe com OK; os demais aparecem marcados como não encontrados.

**Why this priority**: é o mock mais visível que restou no detalhe, e o que
transforma o detalhe em ponto de descoberta dentro da própria lista.

**Independent Test**: com a chave TMDB configurada e algumas categorias de
filmes abertas, abrir o detalhe de um filme conhecido, entrar em Semelhantes,
conferir a ordem, os rótulos, a linha de cobertura e o OK nos dois tipos de
cartão.

**Acceptance Scenarios**:

1. **Given** um filme que casou no TMDB e categorias de filmes abertas,
   **When** a pessoa entra na aba Semelhantes, **Then** vê até 20 cartões, os
   encontrados na lista primeiro (na ordem do TMDB) e depois os não
   encontrados, cada um destes com o chip "Não encontrado na sua lista".
2. **Given** a mesma aba, **When** a pessoa lê o topo, **Then** vê a
   cobertura: "Procurado em X de Y categorias de filmes".
3. **Given** foco num cartão encontrado, **When** a pessoa aperta OK, **Then**
   abre o detalhe daquele título na lista da pessoa.
4. **Given** foco num cartão não encontrado, **When** a pessoa aperta OK,
   **Then** abre um modal com pôster, ano e sinopse do TMDB e a frase de que o
   título não está nas categorias abertas, sem ação de assistir; RETURN fecha
   o modal com o foco de volta no cartão.
5. **Given** o detalhe de um título aberto a partir de Semelhantes, **When** a
   pessoa aperta RETURN, **Then** volta ao detalhe anterior, na aba
   Semelhantes, com o foco no cartão de onde saiu.
6. **Given** a mesma experiência numa série, **When** a pessoa entra na aba,
   **Then** o comportamento é o mesmo, cruzando com as séries da lista.

---

### User Story 2 - Aba Semelhantes sem dado (Priority: P1)

Quando não há como mostrar Semelhantes, a aba diz o porquê e oferece o que dá
para fazer — nunca uma aba vazia sem foco.

**Why this priority**: sem chave TMDB (o caso de quem não configurou nada), a
aba precisa continuar útil e navegável; é parte do mínimo entregável da P1.

**Independent Test**: sem chave TMDB; com chave mas título sem casamento; com
chave e TMDB sem semelhantes; com o TMDB fora do ar.

**Acceptance Scenarios**:

1. **Given** nenhuma chave TMDB configurada, **When** a pessoa entra na aba,
   **Then** vê que Semelhantes vem do TMDB e uma ação focável "Configurar
   TMDB" que abre Configurações › Integrações & BYOK.
2. **Given** chave configurada mas o título não casou no TMDB, **When** a
   pessoa entra na aba, **Then** vê que não foi possível identificar o título
   no TMDB, com um elemento focável.
3. **Given** o TMDB não devolve nenhum semelhante, **When** a pessoa entra na
   aba, **Then** vê essa mensagem, com um elemento focável.
4. **Given** o TMDB está indisponível (rede, chave recusada, limite),
   **When** a pessoa entra na aba, **Then** vê que Semelhantes está
   indisponível agora; o estado do TMDB em Integrações reflete o motivo, sem
   toast repetido nem nova tentativa em laço.

---

### User Story 3 - Rosto de quem atua (Priority: P2)

Na aba Elenco, cada pessoa aparece com a foto, quando o título casou no TMDB.

**Why this priority**: melhora a leitura da aba que já é real, e é o ponto de
entrada da página de ator.

**Independent Test**: abrir o detalhe de um título casado no TMDB e um só com
elenco do provedor; conferir fotos e fallback.

**Acceptance Scenarios**:

1. **Given** um título que casou no TMDB, **When** a pessoa entra na aba
   Elenco, **Then** cada pessoa mostra foto, nome e personagem (quando o TMDB
   informar).
2. **Given** uma pessoa sem foto no TMDB ou uma foto que falha ao carregar,
   **When** a aba é exibida, **Then** aparece um marcador neutro no lugar,
   nunca o ícone de imagem quebrada.
3. **Given** um título sem casamento no TMDB, **When** a pessoa entra na aba,
   **Then** o elenco do provedor aparece em texto como hoje, sem foto e sem
   navegação.

---

### User Story 4 - Página de ator (Priority: P2)

OK numa pessoa do elenco abre a página dela: foto, nome e os filmes e séries
em que atuou, com os que estão na lista primeiro.

**Why this priority**: segundo caminho de descoberta; depende da aba Elenco
com identidade TMDB (US3).

**Independent Test**: a partir da aba Elenco de um título casado, dar OK
numa pessoa, conferir a página, abrir um título encontrado e voltar.

**Acceptance Scenarios**:

1. **Given** foco numa pessoa do elenco com identidade TMDB, **When** a
   pessoa aperta OK, **Then** abre a página do ator com foto, nome e a
   filmografia (filmes e séries), os encontrados na lista primeiro e os demais
   com o chip "Não encontrado na sua lista", mais a linha de cobertura.
2. **Given** a página do ator, **When** a pessoa dá OK num título encontrado,
   **Then** abre o detalhe dele; RETURN volta à página do ator com o foco no
   mesmo título.
3. **Given** a página do ator, **When** a pessoa dá OK num título não
   encontrado, **Then** abre o mesmo modal de resumo da US1.
4. **Given** a página do ator, **When** a pessoa aperta RETURN, **Then** volta
   ao detalhe de origem, na aba Elenco, com o foco na mesma pessoa.
5. **Given** a busca da página do ator falha (rede, TMDB), **When** a página
   abre, **Then** mostra o erro com "Tentar de novo" e "Voltar", focáveis.

---

### Edge Cases

- Cadeia longa (detalhe → semelhante → detalhe → ator → detalhe…): cada
  RETURN volta uma tela, sem limite de profundidade, sempre com aba e foco
  restaurados.
- O título aberto a partir de Semelhantes é o mesmo título de origem (o TMDB
  às vezes o devolve): nunca listado nos próprios Semelhantes.
- O mesmo título vem nas recomendações e nos similares: aparece uma vez.
- Dois registros locais casam com o mesmo título do TMDB (lista com cópias em
  categorias diferentes): o cartão abre o primeiro na ordem da fonte, nunca
  duas vezes o mesmo título.
- Casamento ambíguo (vários candidatos locais com o mesmo título e ano
  próximo, sem identidade TMDB): conta como não encontrado — nunca escolhe um
  por aproximação.
- Nenhuma categoria do tipo aberta ainda: todos os cartões ficam "não
  encontrados" e a cobertura diz "Procurado em 0 de Y categorias".
- A pessoa remove a chave TMDB com um detalhe aberto: na próxima abertura a
  aba volta ao estado "Configurar TMDB"; fotos e página de ator somem junto
  com o cache do TMDB (comportamento da 032 ao remover a chave).
- Pessoa do elenco sem identidade TMDB (só nome do provedor): não é
  navegável e não mostra foto.
- Filmografia muito longa (centenas de créditos): a página continua fluida e
  mostra no máximo um número limitado de títulos, encontrados primeiro.
- Título sem pôster no TMDB: marcador neutro, como nos cartões atuais.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A aba "Semelhantes" do detalhe de filme e de série DEVE ser
  real, e o mock `similar` DEVE sair de `comingSoon.ts`.
- **FR-002**: Os candidatos DEVEM vir das recomendações e dos similares do
  TMDB para o título, recomendações primeiro, sem duplicatas e sem o próprio
  título, até 20 cartões.
- **FR-003**: Os dados de Semelhantes e as fotos do elenco DEVEM ser obtidos na
  mesma consulta ao TMDB que o detalhe já faz ao abrir (feature 032), sem
  requisição adicional por abrir a aba, e guardados com o mesmo prazo do cache
  do TMDB.
- **FR-004**: Um registro do TMDB guardado antes desta feature (sem
  Semelhantes/fotos) DEVE ser consultado de novo uma única vez ao abrir o
  detalhe.
- **FR-005**: Cada candidato DEVE ser cruzado com o catálogo já guardado no
  aparelho, do mesmo tipo (filme com filme, série com série), por identidade
  TMDB quando conhecida, ou por título normalizado + ano (tolerância de 1 ano)
  com exatamente um candidato local; zero ou vários candidatos DEVEM contar
  como não encontrado.
  **Atualização (R-012, 2026-09-30, aprovada pelo usuário):** o ano passa a
  ser **exato** (sem tolerância de 1 ano) — a medição na lista real mostrou
  homônimos de anos vizinhos abrindo o filme errado. Cópias da mesma obra
  (mesmo título e mesmo ano) continuam valendo a primeira na ordem da fonte;
  candidatos de anos diferentes continuam "não encontrado".
- **FR-006**: O cruzamento NUNCA DEVE baixar categorias ainda não abertas.
- **FR-007**: A aba DEVE mostrar a cobertura do cruzamento: "Procurado em X de
  Y categorias de filmes" (ou "de séries").
- **FR-008**: Os cartões encontrados DEVEM vir primeiro, na ordem do TMDB;
  depois os não encontrados, na ordem do TMDB, cada um com o chip "Não
  encontrado na sua lista" em texto e no nome acessível.
- **FR-009**: OK num cartão encontrado DEVE abrir o detalhe do registro local
  correspondente.
- **FR-010**: OK num cartão não encontrado DEVE abrir um modal com pôster, ano
  e sinopse do TMDB e a frase de que o título não está nas categorias abertas,
  sem ação de assistir; RETURN fecha o modal devolvendo o foco ao cartão.
- **FR-011**: Sem chave TMDB, a aba DEVE explicar que Semelhantes vem do TMDB
  e oferecer a ação focável "Configurar TMDB", que abre Configurações ›
  Integrações & BYOK.
- **FR-012**: Título sem casamento no TMDB, TMDB sem semelhantes e TMDB
  indisponível DEVEM ter, cada um, mensagem própria e pelo menos um elemento
  focável; falhas do TMDB seguem a política da 032 (sem toast por detalhe, sem
  cache da falha, sem nova tentativa em laço, pausa após limite).
- **FR-013**: Quando o título casou no TMDB, a aba Elenco DEVE mostrar foto,
  nome e personagem de cada pessoa (personagem só quando o TMDB informar);
  sem foto ou com falha ao carregar, um marcador neutro. Nesse caso a lista
  do TMDB substitui, **só nesta aba**, o elenco em texto do provedor; as duas
  listas nunca se misturam. A aba Detalhes continua mostrando o elenco em
  texto com a regra da 032 (o provedor vence).
- **FR-014**: Para séries, o elenco com foto DEVE vir dos créditos agregados
  da série (todas as temporadas), não só da temporada atual.
- **FR-015**: Quando o título não casou no TMDB, a aba Elenco DEVE continuar
  como hoje (nomes do provedor em texto, sem foto, sem navegação).
- **FR-016**: OK numa pessoa do elenco com identidade TMDB DEVE abrir a página
  do ator; a filmografia dela DEVE ser consultada só nesse momento (nunca por
  foco) e guardada com o prazo do cache do TMDB.
- **FR-017**: A página do ator DEVE mostrar foto, nome e filmografia (filmes e
  séries em que atuou), com o mesmo cruzamento, a mesma ordem, o mesmo chip, a
  mesma linha de cobertura e o mesmo OK das FR-005 a FR-010, limitada a um
  número máximo de títulos. Na filmografia, "ordem do TMDB" é a
  popularidade que o próprio TMDB informa para cada título (a lista de
  créditos não tem ordem própria). Como a filmografia mistura os dois tipos,
  a linha de cobertura informa os dois: "Procurado em X de Y categorias de
  filmes e Z de W de séries".
- **FR-018**: A página do ator DEVE ter estados de carregando, erro (com
  "Tentar de novo" e "Voltar") e filmografia vazia, todos com elemento
  focável.
- **FR-019**: A navegação entre detalhe, página de ator e outro detalhe DEVE
  formar uma pilha sem limite de profundidade; RETURN volta uma tela por vez,
  restaurando aba e item focado por identidade, nunca por índice.
- **FR-020**: Mover o foco entre cartões, pessoas ou abas NUNCA DEVE disparar
  consulta ao TMDB nem ao painel.
- **FR-021**: Remover a chave TMDB DEVE fazer Semelhantes, fotos e páginas de
  ator deixarem de aparecer, como o resto do dado do TMDB (feature 032).
- **FR-022**: Nenhuma chave, URL com chave ou credencial do provedor DEVE
  aparecer em tela, `aria-*`, log ou mensagem de erro.
- **FR-023**: A atribuição exigida pelo TMDB DEVE continuar visível onde dado
  do TMDB é exibido, como na feature 032.

### Key Entities

- **Semelhante**: título do TMDB (identidade TMDB, tipo, título, ano, pôster,
  sinopse) mais o resultado do cruzamento (registro local encontrado ou não
  encontrado).
- **Pessoa do elenco**: identidade TMDB (quando houver), nome, personagem,
  foto.
- **Filmografia do ator**: lista de créditos (filmes e séries) com o mesmo
  resultado de cruzamento dos Semelhantes.
- **Cobertura do cruzamento**: categorias do tipo já guardadas no aparelho ×
  categorias declaradas pela fonte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Percorrer cartões, pessoas e abas faz zero consultas externas —
  verificado num navegador real contando requisições.
- **SC-002**: Numa amostra de pelo menos 50 títulos da lista real com chave
  TMDB, nenhum cartão "encontrado" abre um título diferente do indicado (0
  casamentos errados).
  **Atualização (R-011/R-012, 2026-09-30, aprovada pelo usuário):** atendida
  com ressalva. Na lista real (50 filmes de origem, ~250 "encontrados"
  conferidos contra o `tmdb_id` do provedor) sobra cerca de 1 homônimo de
  obras diferentes com o mesmo título e o mesmo ano, que título + ano não
  distingue; só o `tmdb_id` distinguiria e a listagem do provedor não o traz.
- **SC-003**: 10 de 10 sequências detalhe → semelhante → detalhe → ator →
  detalhe voltam, por RETURN, até o detalhe de origem com aba e foco
  restaurados.
- **SC-004**: Em todos os estados sem dado (sem chave, sem casamento, sem
  semelhantes, TMDB fora do ar, erro na página do ator) há um elemento
  focável — 5 de 5.
- **SC-005**: Abrir a aba Semelhantes não acrescenta requisição de rede além
  das que o detalhe já fazia ao abrir.

## Assumptions

- A chave TMDB, o cache de 6 meses e a política de falhas da feature 032 são
  reaproveitados sem mudança de regra. **Uma regra da 032 muda**: a FR-018
  consultava o TMDB só quando o provedor deixava algum campo vazio. Como
  Semelhantes e o elenco com identidade existem só no TMDB, com chave o
  detalhe passa a consultá-lo ao abrir sempre que o registro do TMDB estiver
  ausente, vencido ou for anterior a esta feature, mesmo com o provedor
  completo. A mescla continua igual (o provedor vence nos campos da 032).
  A FR-018 da 032 leva uma nota de atualização.
- O casamento por título usa o título do provedor contra o título localizado
  e o título original do TMDB, com a mesma normalização da 032.
- O catálogo local guarda ano para filmes e séries (feature 025); títulos
  sem ano só casam por identidade TMDB.
- O limite de títulos da filmografia (FR-017) e o formato visual do cartão
  (retrato, como na grade) ficam para o `sdd-plan`, seguindo o DS V14 (§16,
  §32).
- Imagens do TMDB (pôsteres e fotos) são carregadas quando o cartão é
  desenhado, como já acontece com o backdrop; isso não conta como consulta
  por foco.

## Clarifications

### Sessão 2026-09-30

- Q: Como tratar o catálogo local incompleto (carga sob demanda)? → A: Mostrar
  tudo do TMDB e marcar o que não foi encontrado na lista.
- Q: Que rótulo recebem os não encontrados? → A: "Não encontrado na sua
  lista", com a linha de cobertura "Procurado em X de Y categorias".
- Q: O que faz OK em cada tipo de cartão? → A: Encontrado abre o detalhe; não
  encontrado abre um modal de resumo (pôster, ano, sinopse), sem assistir.
- Q: Ordem dos cartões? → A: Encontrados primeiro; dentro de cada grupo, a
  ordem do TMDB.
- Q: Quantos semelhantes e de onde? → A: Recomendações + similares do TMDB,
  sem duplicar, até 20.
- Q: Sem chave TMDB? → A: Aba focável com ação "Configurar TMDB".
- Q: Quais partes entram? → A: Semelhantes (P1), fotos no Elenco (P2) e
  página de ator (P2); equipe técnica fica de fora.
- Q: O que a página de ator mostra? → A: Foto, nome e filmografia marcada;
  sem biografia.
- Q: Quando os dados são buscados? → A: Semelhantes e fotos na mesma chamada
  ao abrir o detalhe; página de ator só ao dar OK no ator.
- Q: Como o RETURN se comporta numa cadeia de telas? → A: Pilha completa, sem
  limite, com aba e foco restaurados.
- Q: Com o provedor completo, o detalhe ainda consulta o TMDB? → A: Sim, com
  chave, uma vez a cada 6 meses por título. Semelhantes e fotos só vêm de
  lá. É uma atualização da FR-018 da 032; a mescla "provedor vence" não muda.
  (Resolve a pendência A1 do plano.)
- Q: Qual é a "ordem do TMDB" na filmografia? → A: A popularidade informada
  pelo TMDB, porque a lista de créditos não traz ordem própria (FR-017,
  pendência A2).
- Q: Como fica a cobertura na página de ator, que mistura filmes e séries?
  → A: Uma linha com os dois tipos: "Procurado em X de Y categorias de
  filmes e Z de W de séries" (FR-017, pendência A3).
- Q: Com casamento, a aba Elenco mostra o texto do provedor ou a lista do
  TMDB? → A: A lista do TMDB (com foto e navegável), só nessa aba e sem
  misturar as duas. Na aba Detalhes o elenco em texto segue a 032 (FR-013,
  pendência A4).
