# Feature Specification: Nota, gênero e fundo vindos da listagem Xtream

**Slug**: `055-campos-da-listagem-xtream`

**Created**: 2026-10-03

**Status**: Convergida

**Input**: Importar campos curtos que a listagem Xtream já entrega e a importação descarta — `rating` (filmes e séries) e, só nas séries, `genre` e o fundo (`backdrop_path`) — para dar nota, gênero e fundo no card e no destaque sem esperar `get_*_info`/TMDB. Nota só quando > 0 e rotulada como do provedor; gênero só para exibição. Origem: `sdd/assessments/aproveitar-campos-lista-xtream-hoje-descartados/` (veredito `go`).

## Escopo

### Incluído

- Guardar, a partir da listagem Xtream, a nota de filmes e séries e, nas séries, o gênero e uma imagem de fundo.
- Mostrar a nota (selo no card; nota com a origem "Provedor" no destaque e no detalhe).
- Mostrar o gênero como subtítulo e o fundo como imagem do destaque das séries antes de o detalhe carregar.
- Tratar nota ausente, zero, não numérica ou fora de 0–10 como "sem nota".
- Listas já importadas ganham os campos no refresh normal, sem reimportação forçada.

### Fora de Escopo

- `year` (a Explora mostrou que quase não rende).
- Ordenação e fileira "Bem avaliados" (itens 29 e 68 do backlog; esta feature só entrega o dado).
- `plot`, `cast` e `director` na listagem; trailer; catch-up (`tv_archive`).
- Pré-busca em lote de `get_vod_info`/`get_series_info` e qualquer consulta ao TMDB em lote.
- Nota IMDb ou nota do TMDB nos cards (a nota do TMDB só existe nos títulos abertos).
- Fontes que só têm M3U (M3U avulsa, painel não confirmado, "Modo limitado"): o formato M3U não tem atributo padrão para nota, gênero ou fundo, então ficam sem esses campos. Uma M3U por URL que aponta para um painel Xtream confirmado segue o caminho Xtream (feature 014) e recebe os campos normalmente.
- Botão manual de atualizar lista e reimportação automática em segundo plano.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver a nota do provedor no catálogo (Priority: P1)

Na grade e no destaque de Filmes e Séries, a pessoa vê a nota que o provedor declara, sem abrir o título e sem esperar rede.

**Why this priority**: É o ganho de descoberta que só a listagem cobre para o catálogo inteiro (a nota do TMDB só existe nos títulos já abertos).

**Independent Test**: Com uma lista Xtream real, entrar numa categoria de filmes e ver selos de nota nos cards que têm nota; abrir um título e ver a nota com "Provedor"; confirmar que nenhum card mostra "0".

**Acceptance Scenarios**:

1. **Given** um filme cuja nota declarada é 7,4, **When** o card aparece na grade, **Then** mostra um selo com ★ e 7,4.
2. **Given** o mesmo filme em destaque ou no detalhe, **When** a tela aparece, **Then** mostra 7,4 acompanhada do texto "Provedor".
3. **Given** um título com nota 0, ausente, vazia, não numérica ou fora de 0–10, **When** o card, o destaque ou o detalhe aparece, **Then** não há selo, nem número, nem texto de "sem nota".
4. **Given** a pessoa navega com o controle remoto, **When** o foco passa por cards com e sem selo, **Then** a ordem e o comportamento do foco são os mesmos de antes (o selo não é focável).

---

### User Story 2 - Gênero e fundo das séries no destaque (Priority: P2)

No destaque das séries, a pessoa vê o gênero como subtítulo e a imagem de fundo imediatamente, antes de qualquer consulta ao detalhe.

**Why this priority**: Melhora a qualidade percebida do destaque e funciona sem chave TMDB, mas depende de a P1 já ter ampliado o dado guardado.

**Independent Test**: Com uma série que tem gênero e fundo na listagem, abrir a tela de Séries e ver o destaque preenchido sem chamada a `get_series_info` nem ao TMDB.

**Acceptance Scenarios**:

1. **Given** uma série com gênero "Comédia, Drama" e uma imagem de fundo na listagem, **When** ela vira o destaque, **Then** o gênero aparece como subtítulo e a imagem como fundo, sem requisição extra.
2. **Given** uma série sem gênero ou sem fundo na listagem, **When** ela vira o destaque, **Then** o destaque aparece como hoje, sem espaço vazio nem texto de preenchimento.
3. **Given** o detalhe da série já obteve gênero ou fundo do provedor (`get_series_info`) ou do TMDB, **When** o detalhe aparece, **Then** valem esses valores, e não os da listagem.

---

### User Story 3 - Listas já importadas sem reimportar (Priority: P3)

A pessoa que já tem uma lista importada passa a ver nota e gênero depois do refresh normal, sem apagar nem reimportar nada.

**Why this priority**: Evita atrito no upgrade, mas não é visível até P1 existir.

**Independent Test**: Partir de uma lista importada antes da feature, atualizar o app, deixar o refresh normal da categoria acontecer e verificar que os campos aparecem sem reimportação.

**Acceptance Scenarios**:

1. **Given** uma lista importada antes desta feature, **When** o app é atualizado e a categoria ainda não foi renovada, **Then** o catálogo funciona exatamente como antes, sem nota, gênero ou fundo novos e sem erro.
2. **Given** a mesma lista, **When** a categoria passa pelo refresh normal, **Then** os títulos passam a ter nota (e gênero/fundo nas séries).

### Edge Cases

- Nota com vírgula, texto ("N/A"), negativa ou acima de 10: tratada como "sem nota".
- Lista em que o painel não envia `rating`: o catálogo funciona como hoje, sem selo algum.
- Fundo em lista de URLs ou em string única: usa-se a primeira URL válida; URL inválida equivale a "sem fundo".
- Gênero vazio ou só espaços: equivale a "sem gênero".
- Fonte só M3U (sem protocolo Xtream): não há nota, gênero nem fundo na listagem; não há selo, subtítulo ou fundo da listagem e nada quebra. Medido na M3U real do painel de teste: só `tvg-name`, `group-title` e `tvg-logo` (100% cada); nenhum atributo de nota, gênero ou fundo.
- Carga grande (≈43 mil filmes): entrar numa categoria e a importação não ficam perceptivelmente mais lentas.
- Gênero do provedor nunca vira nova categoria nem substitui a categoria declarada pela fonte.
- Segredos: a URL do fundo é conteúdo de exibição; não aparece em log nem em mensagem de erro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE guardar, para filmes e séries de fonte Xtream, a nota declarada na listagem (`rating`, escala 0–10).
- **FR-002**: Sistema DEVE guardar, para séries de fonte Xtream, o gênero declarado na listagem e a primeira URL de fundo válida.
- **FR-003**: Sistema DEVE considerar "sem nota" qualquer nota ausente, vazia, igual a 0, não numérica ou fora do intervalo (0, 10].
- **FR-004**: Sistema DEVE exibir a nota com uma casa decimal (ex.: 7,4) e nunca exibir "0" nem texto de "sem nota".
- **FR-005**: Sistema DEVE mostrar nos cards de filme e série um selo com ★ e a nota, apenas quando houver nota.
- **FR-006**: Sistema DEVE mostrar, no destaque e no detalhe, a nota acompanhada do rótulo "Provedor", apenas quando houver nota.
- **FR-007**: Sistema DEVE mostrar, no destaque das séries, o gênero da listagem como subtítulo e o fundo da listagem como imagem de fundo, quando existirem.
- **FR-008**: Quando o detalhe obtiver gênero ou fundo do provedor (`get_*_info`) ou do TMDB, Sistema DEVE usar esses valores no lugar dos da listagem.
- **FR-009**: O selo de nota NÃO DEVE ser focável nem alterar a ordem de foco, a restauração de foco ou o scroll das telas.
- **FR-010**: O gênero do provedor NÃO DEVE criar, renomear ou substituir categorias; categorias seguem exatamente as declaradas pela fonte.
- **FR-011**: Sistema DEVE manter o funcionamento atual para títulos sem esses campos, para fontes só M3U e para listas importadas antes desta feature.
- **FR-016**: Uma M3U por URL que aponta para um painel Xtream confirmado DEVE receber nota, gênero e fundo pelo mesmo caminho das fontes Xtream, sem tratamento especial.
- **FR-012**: Sistema DEVE preencher os campos em listas já importadas no refresh normal, sem exigir reimportação nem ação da pessoa.
- **FR-013**: Sistema NÃO DEVE fazer requisição extra ao provedor ou ao TMDB para obter esses campos; usa apenas o que a listagem já baixa.
- **FR-014**: Sistema NÃO DEVE rotular a nota do provedor como IMDb ou como nota do TMDB.
- **FR-015**: URLs de fundo, credenciais e URLs de reprodução NÃO DEVEM aparecer em log, mensagem de erro ou exportação.

### Key Entities *(include if feature involves data)*

- **Nota do provedor**: número de 0 a 10 declarado pelo painel para um filme ou série; valor 0 e valores inválidos significam "sem nota".
- **Gênero da listagem (série)**: texto curto com os gêneros declarados pelo painel, só para exibição.
- **Fundo da listagem (série)**: uma URL de imagem de fundo declarada pelo painel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma lista real, 100% dos títulos com nota válida mostram o selo no card e 0% dos títulos sem nota válida mostram selo, número ou texto de nota.
- **SC-002**: O destaque de uma série com gênero e fundo na listagem aparece completo com 0 requisições extras ao provedor e ao TMDB.
- **SC-003**: O acréscimo de armazenamento após importar a lista real (≈43 mil filmes e ≈9,7 mil séries) fica abaixo de 1,5 MB.
- **SC-004**: O tempo de importar a lista e de entrar numa categoria grande não aumenta de forma perceptível frente à medição anterior à feature (diferença abaixo de 10%).
- **SC-005**: Uma lista importada antes da feature continua utilizável sem erro e passa a mostrar nota após o refresh normal, sem reimportação.
- **SC-006**: A navegação por controle remoto (ordem de foco, voltar e restaurar posição) permanece idêntica; a suíte E2E existente segue passando.

## Assumptions

- A nota do painel replica de forma razoável a nota do TMDB (diferença mediana 0,10 em 29 filmes), mas a origem é desconhecida; por isso o rótulo "Provedor" é obrigatório e a medição de SC-001 usa só a regra de validade.
- O refresh normal das categorias (feature 038, prefetch em segundo plano e atualização no mesmo caminho) renova os registros ao longo do tempo; o prazo exato até cobrir uma lista inteira não é garantido por esta feature.
- O destaque de Filmes/Séries (feature 053) e o card (`ContentCard`) comportam o selo e o subtítulo sem reflow de layout; confirmar no `sdd-plan` com o Design System V14 §16.
- Quando o provedor e o TMDB trazem notas diferentes para o mesmo título, esta feature não decide qual mostrar além do detalhe; a nota do TMDB não é exibida por enquanto.
- O `rating_5based` do painel é ignorado.
- O item 68 do backlog ("Bem avaliados") será ajustado depois para consumir este dado; esta feature não o implementa.

## Clarifications

### Sessão 2026-10-03

- Q: Onde a nota do provedor aparece primeiro? → A: Card, destaque e detalhe.
- Q: Como o rótulo de origem é mostrado? → A: Texto "Provedor" junto à nota no destaque e no detalhe; só ★ + número no card.
- Q: Qual escala usar? → A: 0–10 com uma casa decimal, a partir de `rating`.
- Q: Quando o detalhe já tem gênero/fundo do provedor ou do TMDB, qual prevalece? → A: O detalhe obtido sobrepõe a listagem.
- Q: Como os campos chegam a listas já importadas? → A: No refresh normal da categoria/lista, sem reimportação forçada.
- Q: Onde gênero e fundo das séries aparecem antes do detalhe? → A: Destaque da vitrine (gênero como subtítulo, fundo como imagem); o card só ganha o selo de nota.
- Q: Qual valor de `rating` é "sem nota"? → A: Ausente, vazio, 0, não numérico ou fora de 0–10; sem selo e sem texto "sem nota".
