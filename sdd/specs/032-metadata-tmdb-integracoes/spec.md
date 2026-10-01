# Feature Specification: Metadata de Filmes e Séries — Provedor Primeiro, TMDB (BYOK) Completa, e Tela Integrações

**Slug**: `032-metadata-tmdb-integracoes`

**Created**: 2026-09-29

**Status**: Convergida

**Input**: Item 28 do backlog — "Conector TMDB client-first (BYOK) + tela
Integrações & BYOK". Durante a entrevista, uma medição na lista real
mostrou que o provedor Xtream **já entrega** a maior parte da metadata
(sinopse, backdrop, gênero, elenco, diretor, país, duração e `tmdb_id`)
e o app não captura nada disso. O escopo virou: metadata do provedor
primeiro, TMDB com a chave da própria pessoa só para completar lacunas,
e a aba real "Integrações & BYOK" em Configurações.

## Escopo

### Incluído

- Capturar e exibir a metadata que o provedor já entrega para filmes e
  séries: sinopse, backdrop, gênero, duração, diretor, país e elenco
  **em texto**.
- Enriquecimento pelo TMDB, com a chave da própria pessoa (BYOK),
  **só para os campos que o provedor deixou vazios**.
- Hero de detalhe (filme e série) com backdrop e sinopse truncada +
  "Ver mais" que abre o texto completo; aba Detalhes com os demais campos.
- Aba real **Integrações & BYOK** em Configurações: card real do TMDB
  (chave mascarada, Testar, Editar, Remover, estado, capacidades,
  atribuição) e cards "Em breve" para os demais serviços do DS.
- Item "TMDB" do dock da Home como status real que abre o card do TMDB.
- **Sinopse por episódio**, quando o provedor a enviar (decisão do usuário em
  2026-09-29, resolvendo a pendência A-02 do Analyze): vem junto da lista de
  episódios, fica guardada com eles e aparece para o episódio focado no
  detalhe da série — sem nenhuma consulta nova e sem TMDB.
- Cache local da metadata externa, com expiração e descarte.
- Emenda da constitution para permitir a chave BYOK no aparelho
  (feita no `sdd-plan`, pré-requisito do gate).

### Fora de Escopo

- Aba **Elenco** navegável, pessoas e Semelhantes (item 45 — mocks
  `cast`/`similar` continuam).
- **Trailer** (item 32 — mock `trailer` continua), mesmo quando o provedor
  traz `youtube_trailer`.
- **Nota/avaliação** de qualquer origem (item 29).
- Metadata TMDB por **episódio**; episódios só exibem o que o provedor
  já manda.
- Enriquecimento em lote/segundo plano de categorias ou grades; nenhuma
  busca externa disparada por foco.
- Chave de IA, clima e teste de velocidade (itens 30/31/54) — só
  aparecem como cards "Em breve".
- Substituir categorias/grupos da fonte por gênero externo (constitution).
- Canais ao vivo (Live TV) — nada muda.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detalhe com a metadata do provedor (Priority: P1)

A pessoa abre o detalhe de um filme ou série e vê backdrop, sinopse,
gênero, duração, diretor, país e elenco em texto — sem configurar nada,
porque esses dados vêm do próprio provedor.

**Why this priority**: entrega o maior ganho visível (hero do detalhe
hoje sem sinopse nem backdrop) para a maioria dos títulos, sem chave e
sem serviço de terceiro.

**Independent Test**: com uma fonte Xtream que traga esses campos e
nenhuma chave TMDB configurada, abrir o detalhe de um filme e de uma
série e conferir os campos exibidos contra o que o provedor retornou.

**Acceptance Scenarios**:

1. **Given** um filme cujo provedor informa sinopse e backdrop, **When**
   a pessoa abre o detalhe, **Then** o hero mostra o backdrop e a
   sinopse truncada em até ~3 linhas, com "Ver mais" focável quando o
   texto não couber.
2. **Given** o foco em "Ver mais", **When** a pessoa pressiona OK,
   **Then** um modal mostra a sinopse completa, rolável pelo controle, e
   RETURN devolve o foco a "Ver mais".
3. **Given** um título sem nenhum desses campos, **When** o detalhe
   abre, **Then** nada é inventado: os campos ausentes simplesmente não
   aparecem e o detalhe continua como hoje.
4. **Given** o detalhe aberto e a metadata ainda chegando, **When** a
   pessoa pressiona OK em "Assistir", **Then** a reprodução começa sem
   esperar a metadata.

---

### User Story 2 - Configurar a chave TMDB em Integrações & BYOK (Priority: P2)

A pessoa entra em Configurações › Integrações & BYOK, informa a chave
TMDB da própria conta, testa e vê o estado do serviço; também pode
editar ou remover a chave. O dock da Home reflete esse estado.

**Why this priority**: pré-condição do enriquecimento (US3) e primeira
tela real de integrações, que as features de IA reaproveitam depois.

**Independent Test**: sem nenhum título enriquecido, cadastrar uma
chave válida, "Testar" (sucesso), trocar por uma inválida (erro claro),
remover (volta a "Não configurado"), conferindo o dock da Home em cada
passo e que a chave nunca aparece por inteiro.

**Acceptance Scenarios**:

1. **Given** nenhuma chave, **When** a pessoa abre a aba, **Then** o card
   TMDB mostra "Não configurado", descrição, capacidades, a atribuição
   ao TMDB e a ação "Configurar"; os cards de IA, Clima e Teste de
   velocidade aparecem soft-disabled "Em breve".
2. **Given** o campo de chave, **When** a pessoa digita uma API Key v3 ou
   um Read Access Token v4 e confirma, **Then** o app testa a chave contra
   o TMDB e mostra "Conectado" ou o motivo da falha (chave recusada, sem
   conexão, limite de uso), sem salvar uma chave recusada.
3. **Given** uma chave salva, **When** a pessoa volta à aba, **Then** a
   chave aparece só mascarada (ex.: últimos 4 caracteres) e há "Testar",
   "Editar" e "Remover" (com confirmação).
4. **Given** qualquer estado do TMDB, **When** a pessoa foca o item
   "TMDB" do dock da Home e pressiona OK, **Then** abre o card do TMDB em
   Configurações; o item mostra o estado (configurado / não configurado
   / erro).

---

### User Story 3 - TMDB completa o que o provedor não deu (Priority: P3)

Com a chave configurada, ao abrir o detalhe de um título com lacunas
(ex.: fonte M3U sem metadata, ou filme sem sinopse no provedor), o app
busca no TMDB e preenche só os campos vazios, indicando discretamente
que vieram do TMDB.

**Why this priority**: cobre fontes M3U e os títulos incompletos do
provedor, mas depende de US1 (exibição) e US2 (chave).

**Independent Test**: com chave válida, abrir o detalhe de um item de
fonte M3U (sem metadata) cujo título+ano seja único no TMDB e de outro
ambíguo; o primeiro ganha sinopse/backdrop marcados "Dados: TMDB", o
segundo continua sem.

**Acceptance Scenarios**:

1. **Given** um filme com `tmdb_id` do provedor e sem sinopse, **When**
   o detalhe abre, **Then** a sinopse do TMDB (pt-BR) aparece com o selo
   discreto "Dados: TMDB" e os campos que o provedor já tinha continuam
   os do provedor.
2. **Given** um título sem `tmdb_id`, com título e ano, **When** a busca
   no TMDB retorna um único candidato com ano igual ou ±1, **Then** o
   título é enriquecido; **When** retorna nenhum ou mais de um candidato
   plausível, ou não há ano, **Then** nada é preenchido.
3. **Given** um `tmdb_id` do provedor cujo ano no TMDB contradiz o ano
   do título, **When** o detalhe abre, **Then** o id é descartado e vale
   a regra de busca do cenário 2.
4. **Given** um título já enriquecido, **When** a pessoa reabre o
   detalhe (mesmo sem rede), **Then** os dados vêm do cache, sem nova
   chamada, até expirarem.
5. **Given** a chave inválida, sem rede ou com limite de uso excedido,
   **When** o detalhe abre, **Then** ele mostra o que tem, sem erro no
   detalhe, e o estado do TMDB em Integrações/dock passa a indicar o
   problema.

---

### Edge Cases

- Sinopse em pt-BR vazia no TMDB: usar a do idioma original, sinalizando
  o idioma; se também vazia, campo ausente.
- Título do provedor com sufixos de qualidade/idioma ("[LEG]", "4K",
  "(2019)"): a busca no TMDB usa o título normalizado; o título exibido
  continua o do provedor.
- `tmdb_id` do provedor que o TMDB responde como inexistente (404): o id
  é marcado como morto e o título cai na busca por título/ano.
- Backdrop que falha ao carregar: o hero volta ao layout sem backdrop,
  nunca mostra imagem quebrada.
- Pessoa sai do detalhe antes de a metadata chegar: a busca não atualiza
  outra tela nem deixa foco órfão; o resultado pode ir para o cache.
- Abrir vários detalhes rápido: no máximo uma busca por título em voo;
  reabrir o mesmo título reaproveita a que já está em andamento.
- Chave removida: o que veio do TMDB some do cache e das telas; o que
  veio do provedor permanece.
- Fonte removida: toda a metadata dela (provedor e TMDB) é descartada.
- Série: sinopse/gênero/elenco da listagem do provedor valem; episódios
  mostram sinopse só se o provedor a enviar por episódio.
- Offline sem cache: detalhe igual ao de hoje, sem estado de erro.

## Requirements *(mandatory)*

### Functional Requirements

**Metadata do provedor (US1)**

- **FR-001**: O sistema DEVE capturar, de fontes Xtream, os campos de
  metadata de filme e série que o provedor informar: sinopse, backdrop,
  gênero, duração, diretor, país, elenco (texto) e `tmdb_id`.
- **FR-002**: Para filmes, os campos que o provedor só entrega no detalhe
  do item DEVEM ser obtidos quando a pessoa abre o detalhe, nunca ao
  focar um card nem em lote.
- **FR-003**: O detalhe de filme e de série DEVE exibir backdrop e
  sinopse no hero e gênero, duração, diretor, país e elenco (texto) na
  aba Detalhes, somente quando houver valor real; campo ausente não é
  exibido nem substituído por texto de preenchimento.
- **FR-004**: A sinopse no hero DEVE ser truncada em ~3 linhas; quando
  truncada, DEVE haver uma ação "Ver mais" focável que abre um modal com
  o texto completo, rolável pelo controle, com RETURN devolvendo o foco a
  "Ver mais".
- **FR-005**: A abertura do detalhe e a ação primária (Assistir/Continuar)
  NÃO DEVEM esperar a obtenção de metadata; ela entra na tela quando
  chegar, sem mover o foco.
- **FR-006**: Falha ao obter metadata (provedor ou TMDB) NÃO DEVE mostrar
  erro no detalhe nem bloquear nenhuma ação dele.
- **FR-007**: Título, duração de reprodução, URL e categoria do provedor
  NUNCA DEVEM ser substituídos por dados externos; gênero externo nunca
  substitui a categoria da fonte.
- **FR-008**: Backdrop que falhar ao carregar DEVE cair no layout sem
  backdrop, nunca exibir o ícone de imagem quebrada do navegador.
- **FR-028**: O detalhe de série DEVE mostrar a sinopse do episódio focado
  quando o provedor a informou para ele, lida do que já está guardado (mover
  o foco entre episódios NUNCA dispara consulta); episódio sem sinopse não
  mostra o bloco nem texto de preenchimento, e a sinopse da série nunca é
  usada no lugar da do episódio.

**Integrações & BYOK (US2)**

- **FR-009**: Configurações DEVE ter a aba real "Integrações & BYOK",
  substituindo o mock `settings-integrations`.
- **FR-010**: O card TMDB DEVE mostrar provedor, descrição, estado
  (Não configurado / Conectado / Chave recusada / Sem conexão / Limite de
  uso), capacidades do DS relevantes, a atribuição exigida pelo TMDB e
  as ações Configurar ou Testar/Editar/Remover.
- **FR-011**: O sistema DEVE aceitar tanto API Key v3 quanto Read Access
  Token v4, identificando o formato sozinho.
- **FR-012**: Ao salvar, a chave DEVE ser testada contra o TMDB; chave
  recusada NÃO DEVE ser salva, e a pessoa vê o motivo.
- **FR-013**: Depois de salva, a chave NUNCA DEVE ser exibida por inteiro
  (só mascarada), nem aparecer em log, mensagem de erro, requisição a
  outro serviço que não o TMDB, ou exportação/backup.
- **FR-014**: Remover a chave DEVE pedir confirmação e apagar a chave e
  toda a metadata que veio do TMDB, preservando a do provedor.
- **FR-015**: A aba DEVE mostrar cards soft-disabled "Em breve" para IA,
  Clima e Teste de velocidade, cada um apontando para seu item do
  backlog, registrados no mesmo registro único de mocks.
- **FR-016**: O item "TMDB" do dock da Home DEVE refletir o estado real do
  TMDB e, ao OK, abrir Configurações no card do TMDB; o mock `dock-tmdb`
  é removido.
- **FR-017**: Toda a tela DEVE ter foco visível e ao menos um elemento
  focável em cada estado, e o campo de chave DEVE usar o IME da TV com
  rótulo permanente e máscara, como os demais campos de credencial.

**Enriquecimento TMDB (US3)**

- **FR-018**: Com chave configurada, ao abrir o detalhe, o sistema DEVE
  consultar o TMDB somente se algum campo de FR-003 estiver vazio após a
  metadata do provedor, e DEVE preencher só esses campos.
  **Atualização (035):** a condição "somente se algum campo estiver vazio"
  deixa de valer (`035-semelhantes-elenco-ator`, D-002). Semelhantes e o
  elenco com identidade existem só no TMDB. Por isso, com chave, o detalhe
  consulta o TMDB ao abrir sempre que o registro do TMDB estiver ausente,
  vencido (6 meses) ou for anterior à 033/035, mesmo com o provedor
  completo. A segunda metade continua valendo: o TMDB só preenche o que o
  provedor deixou vazio.
- **FR-019**: Havendo `tmdb_id` do provedor, ele DEVE ser usado como
  primeira opção, e descartado se o ano do TMDB diferir do ano do título
  por mais de 1 ou se o TMDB responder que não existe.
- **FR-020**: Sem `tmdb_id` válido, o sistema DEVE buscar por título
  normalizado + ano, aceitando só quando houver exatamente um candidato
  com ano igual ou ±1; sem ano, ou com zero ou vários candidatos, NÃO
  DEVE enriquecer.
- **FR-021**: As consultas DEVEM pedir pt-BR; sinopse vazia em pt-BR DEVE
  usar a do idioma original, sinalizando o idioma na tela.
- **FR-022**: Campos vindos do TMDB DEVEM ser identificados no detalhe por
  um selo discreto "Dados: TMDB".
- **FR-023**: O resultado (inclusive "sem correspondência" e "id morto")
  DEVE ser guardado no aparelho com data de obtenção e expirar em 6
  meses; dentro da validade, reabrir o detalhe não gera nova chamada.
- **FR-024**: Chave recusada, falta de rede ou limite de uso DEVEM
  atualizar o estado do TMDB (Integrações e dock), sem aviso a cada
  detalhe aberto, e sem novas tentativas em laço.
- **FR-025**: Deve haver no máximo uma consulta em voo por título; abrir
  de novo o mesmo título reaproveita a consulta em andamento.
- **FR-026**: Remover uma fonte DEVE descartar toda a metadata associada a
  ela, do provedor e do TMDB.

**Constitution**

- **FR-027**: A chave TMDB só PODE ser guardada no aparelho depois de a
  constitution ser emendada para permitir a chave BYOK digitada pela
  pessoa, com as mesmas mitigações da credencial de provedor; sem a
  emenda, esta feature não passa do `sdd-plan`.

### Key Entities

- **Metadata de título**: campos descritivos de um filme ou série
  (sinopse, idioma da sinopse, backdrop, gênero, duração, diretor, país,
  elenco em texto), cada um com sua origem (provedor ou TMDB), ligada à
  identidade lógica estável do título (fonte + tipo + id estável), nunca
  à URL.
- **Resultado TMDB por título**: id TMDB aceito, ou "sem
  correspondência"/"id morto", com data de obtenção e expiração.
- **Integração TMDB**: chave da pessoa (guardada, nunca exibida por
  inteiro), formato (v3/v4), estado atual e data do último teste.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na lista de referência, sem chave TMDB, pelo menos 85% dos
  detalhes de série e 80% dos de filme abertos numa amostra aleatória
  exibem sinopse e backdrop (a medição de 29/09 indica ~93% e ~88%).
- **SC-002**: O detalhe continua abrindo com a ação primária focável no
  mesmo tempo de hoje; a metadata nunca atrasa "Assistir".
- **SC-003**: Numa amostra conferida à mão de títulos enriquecidos pelo
  TMDB por busca (sem `tmdb_id`), zero atribuições à obra errada.
- **SC-004**: Reabrir um detalhe já enriquecido não gera nenhuma chamada
  externa dentro da validade do cache.
- **SC-005**: Em nenhum log, tela, erro ou requisição não-TMDB aparece a
  chave inteira (verificado por teste automatizado e inspeção de rede).
- **SC-006**: Os mocks `settings-integrations` e `dock-tmdb` deixam de
  existir no registro de mocks.

## Assumptions

- A pessoa tem (ou cria) uma conta TMDB e consegue copiar uma chave para
  digitar com o controle; colar pelo celular não faz parte desta feature.
- O TMDB é chamado direto do aparelho (ADR-008 §3); nenhum serviço
  próprio intermedia.
- Os nomes exatos dos campos do provedor variam entre painéis; o
  `sdd-plan` confirma na lista real quais existem na listagem e quais só
  no detalhe (medição de 29/09: séries trazem sinopse/backdrop/elenco/
  gênero na listagem; filmes, só no detalhe do item).
- Fontes M3U não trazem metadata descritiva; para elas só o TMDB ajuda.
- Hero de catálogo e Home podem exibir backdrop/sinopse que já estejam em
  cache, mas não disparam busca por conta própria.

## Clarifications

### Sessão 2026-09-29

- Q: O que fazer com a metadata que o provedor já entrega? → A: Provedor
  primeiro; TMDB (BYOK) só preenche o que falta, na mesma feature.
- Q: Conflito constitution (chave TMDB proibida no cliente) × ADR-008
  §3 (BYOK direto do cliente)? → A: Emendar a constitution para permitir
  a chave BYOK no aparelho, com as mitigações da credencial de provedor;
  emenda feita no `sdd-plan` (FR-027).
- Q: Quando buscar metadata externa? → A: Só ao abrir o detalhe, com
  cache; nada por foco nem em lote.
- Q: O que a aba Integrações mostra? → A: Card TMDB real + IA, Clima e
  Teste de velocidade como "Em breve".
- Q: Quais campos entram? → A: Sinopse, backdrop, gênero, duração,
  diretor, país e elenco em texto; Elenco navegável, Trailer e nota
  ficam nas features próprias.
- Q: Nota (rating)? → A: Fora desta feature (item 29).
- Q: Provedor × TMDB no mesmo campo? → A: Provedor vence; TMDB só
  preenche vazio.
- Q: Item "TMDB" do dock? → A: Status real que abre o card do TMDB.
- Q: Casamento sem `tmdb_id`? → A: Título + ano ±1, só com candidato
  único; `tmdb_id` do provedor é dica forte, descartada se o ano
  contradiz.
- Q: Episódios? → A: Só o que o provedor manda; TMDB só no nível da
  série.
- Q: Formato da chave? → A: API Key v3 e Read Access Token v4.
- Q: Atribuição ao TMDB? → A: Aviso no card de Integrações + selo
  "Dados: TMDB" no detalhe.
- Q: Falhas? → A: Detalhe abre na hora, falha silenciosa nele; estado do
  problema vai para Integrações/dock.
- Q: Cache? → A: 6 meses; remover a chave apaga só o que veio do TMDB;
  remover a fonte apaga tudo dela.
- Q: Sinopse longa? → A: ~3 linhas + "Ver mais" focável abrindo modal.
- Q: Idioma? → A: pt-BR com fallback para o idioma original,
  sinalizado.
