# Feature Specification: Carrosséis de categoria, lista lateral recolhível e slots TMDB na tela hero de Filmes e Séries

**Slug**: `053-carrosseis-filmes-series`

**Created**: 2026-10-03

**Status**: Convergida

**Input**: Pedido do usuário: "nas telas principais/hero de filmes e séries, adicionar carrossel das categorias uma abaixo do outro e um clique em ver tudo que direciona o usuário para a vitrine; deixar a tela mais cara de Netflix sem perder nossa identidade visual; lista de categoria colapsável deixando mais espaço em tela; usar diferentes formatos nos carrosséis quando necessário (imagem 2); reservar espaço para dois carrosséis que precisam do TMDB (top 10 filmes populares da semana); adicionar mais duas sugestões usando metadados da lista ou TMDB, sempre validando se está na lista; vale para filmes e séries; não tocar nas vitrines."

**Terminologia** (memória do usuário): "vitrine" = a grade de cards (tela de categoria da 052); "tela hero" = hero + fileiras (a tela principal de Filmes/Séries da 052). Esta feature mexe **só na tela hero**; a vitrine/grade não muda.

## Escopo

### Incluído

- **Lista lateral de categorias recolhível** (`SideCategoryNav` da 052/E-1): pode ser recolhida para uma **faixa estreita de ícones/iniciais**, liberando largura para os carrosséis; expande de volta pelo controle remoto; a escolha (aberta/recolhida) é lembrada.
- **Um carrossel por categoria da fonte**, um abaixo do outro, na ordem declarada pela fonte, cada um com título, os itens e o acesso **"Ver tudo"** que abre a vitrine (grade em tela cheia) daquela categoria.
- **Formatos de card variados**, inspirados na imagem 2 e coerentes com o V14: pôster alto grande (fileira de destaque), pôster compacto (categorias comuns), card largo com backdrop (Continue assistindo, só com imagem horizontal real) e **Top 10** (número grande ao lado do pôster).
- **Slots reservados e soft-disabled "Em breve"** para os carrosséis que dependem do TMDB: **Top 10 filmes da semana** (em Filmes) e **Top 10 séries da semana** (em Séries), e para **duas sugestões** extras cruzadas com a lista: **Bem avaliados** e **Porque você assistiu X**. Espaço, posição e formato prontos; sem dado inventado.
- Reordenação das fileiras sob o hero: Continue assistindo → Top 10 (TMDB, reservado) → ★ Favoritos → Adicionados recentemente → sugestões (reservadas) → carrosséis de categoria.
- Valem para **Filmes e Séries** (mesma tela, duas seções).

### Fora de Escopo

- **A vitrine/grade de categoria** (tela de categoria da 052): não é tocada (layout, foco, paginação, busca, ordenação).
- Telas de detalhe, player, Live, Configurações e Busca global.
- **Implementar as consultas ao TMDB** (trending semanal, similares para "Porque você assistiu", cruzamento com a lista): ficam para outra feature; aqui só o slot reservado.
- Dado inventado: relevância %, notas ou rankings sem fonte, curadoria editorial, preview/trailer ao focar (constitution; ADR-011).
- Nova consulta ao provedor além da pré-carga que as features 010/038 já fazem.
- Mudar regras de dados (classificação, importação, histórico, favoritos, ordenação).
- Taxonomia externa no lugar das categorias da fonte (TMDB nunca substitui categoria).
- Esportes/Infantil na topbar (ADR-011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Carrosséis por categoria com "Ver tudo" (Priority: P1)

Sob o hero, a pessoa rola para baixo e encontra um carrossel por categoria da fonte, um sob o outro. Em qualquer um, chega ao "Ver tudo" e abre a vitrine (grade) da categoria; RETURN volta ao mesmo carrossel e card.

**Why this priority**: É o pedido central e já entrega valor sozinho (descoberta estilo Netflix) mesmo sem os slots do TMDB nem a lista recolhível.

**Independent Test**: Com uma lista real de várias categorias, abrir Filmes, descer pelos carrosséis de categoria, abrir "Ver tudo" de dois deles, abrir um card, voltar duas vezes e conferir o foco restaurado por id.

**Acceptance Scenarios**:

1. **Given** uma fonte com N categorias, **When** a tela hero abre, **Then** existe um carrossel por categoria, na ordem da fonte, com o nome declarado (prefixo redundante "Filmes |"/"Séries |" removido só na exibição).
2. **Given** um carrossel de categoria, **When** a pessoa vai ao fim ou ao botão "Ver tudo" do cabeçalho e aperta OK, **Then** abre a vitrine daquela categoria (grade da 052) e RETURN devolve o foco ao carrossel/card de origem.
3. **Given** um carrossel cujo conteúdo ainda não foi obtido, **When** a fileira se aproxima da área visível, **Then** o conteúdo é lido/pré-carregado e os cards aparecem; até lá o carrossel mostra o cabeçalho com "Ver tudo" focável e estado de carregando; **focar nunca dispara reprodução nem consulta externa**.
4. **Given** uma categoria sem itens (ou que falhou), **When** exibida, **Then** mostra o cabeçalho com "Ver tudo" focável e o estado vazio/erro atual, sem inventar cards.
5. **Given** o foco em um card de carrossel, **When** a pessoa aperta ↑/↓, **Then** vai ao card visualmente mais próximo da fileira vizinha; ↑ da primeira fileira sobe à topbar.
6. **Given** o foco em um card, **When** muda de card, **Then** o hero acompanha o card focado (como hoje).

---

### User Story 2 - Lista lateral recolhível (Priority: P1)

A pessoa recolhe a lista lateral de categorias para uma faixa estreita de ícones/iniciais e ganha largura para os carrosséis; expande de volta quando quiser. A escolha fica lembrada.

**Why this priority**: Pedido explícito ("deixando mais espaço em tela") e muda a largura útil de todos os carrosséis.

**Independent Test**: Recolher, navegar pelos carrosséis, reabrir o app e conferir que continua recolhida; expandir e escolher uma categoria.

**Acceptance Scenarios**:

1. **Given** a lista expandida, **When** a pessoa aciona o controle de recolher, **Then** a lista vira uma faixa estreita (ícone/inicial por entrada) e os carrosséis ocupam a largura liberada.
2. **Given** a lista recolhida e o foco no primeiro card de uma fileira, **When** a pessoa aperta ←, **Then** o foco vai à faixa e um controle de expandir fica acessível; expandir restaura a lista completa com o foco na entrada anterior.
3. **Given** a faixa recolhida, **When** a pessoa seleciona uma entrada (★, ↺, Todos ou categoria), **Then** abre a vitrine dela, como com a lista expandida.
4. **Given** a escolha de recolher, **When** o app é reaberto, **Then** o estado é o último escolhido (padrão: expandida na primeira vez).
5. **Given** a lista recolhida, **Then** cada entrada continua identificável (ícone/inicial + rótulo acessível) e focável.

---

### User Story 3 - Formatos variados de card (Priority: P2)

As fileiras usam formatos diferentes conforme o papel, como na Netflix: pôster alto grande, pôster compacto, card largo com backdrop e Top 10, sempre com tokens V14.

**Why this priority**: Dá a cara Netflix, mas depende dos carrosséis (US1) para existir.

**Independent Test**: Com histórico, favoritos e várias categorias, conferir um formato por papel e que nenhum card sai sem dado real.

**Acceptance Scenarios**:

1. **Given** a fileira de destaque (Continue assistindo, ou Favoritos se não houver histórico), **Then** usa pôster alto grande (5 visíveis) e, em Continue assistindo, barra de progresso só com progresso real.
2. **Given** itens do Continue assistindo com imagem horizontal real, **Then** podem usar o card largo com backdrop; sem imagem horizontal real, caem no pôster (nada de imagem genérica).
3. **Given** os carrosséis de categoria comuns, **Then** usam pôster compacto (mais itens por tela, estilo "Popular on Netflix").
4. **Given** o slot Top 10, **Then** usa o formato número grande + pôster, com as 10 posições reservadas.
5. **Given** qualquer formato, **Then** o foco mantém a receita V14 (anel + escala + 140 ms) com o card e o anel inteiros dentro da fileira.

---

### User Story 4 - Slots reservados do TMDB e das sugestões (Priority: P2)

A tela já tem o lugar certo para Top 10 da semana (Filmes: top 10 filmes; Séries: top 10 séries), **Bem avaliados** e **Porque você assistiu X**, todos soft-disabled "Em breve", sem dado falso, prontos para a feature que ligar o TMDB.

**Why this priority**: Pedido explícito de reservar espaço; a política V14 exige "Em breve" em vez de conteúdo inventado.

**Independent Test**: Abrir Filmes e Séries, localizar os quatro slots, focar cada um e conferir o estado "Em breve" sem nenhuma consulta externa.

**Acceptance Scenarios**:

1. **Given** a tela hero, **Then** os slots aparecem na ordem definida (Top 10 logo após Continue assistindo; sugestões entre Recentes e as categorias), cada um com título, formato final e estado "Em breve".
2. **Given** um slot soft-disabled, **When** focado, **Then** recebe foco visível (não é disabled duro) e, ao OK, mostra o aviso "Em breve" padrão do app, sem navegar.
3. **Given** a tela hero, **When** abre ou o foco passa por um slot, **Then** nenhuma consulta ao TMDB é feita.
4. **Given** Filmes vs Séries, **Then** o slot Top 10 é de filmes em Filmes e de séries em Séries.
5. **Given** o contrato futuro, **Then** cada slot declara a regra que o ativará: só mostra o que existe na lista (cruzamento por título/ano ou id), e some se o cruzamento não achar nada.

---

### Edge Cases

- Lista com centenas de categorias: carrosséis são montados sob demanda (virtualização vertical) e obtidos ao se aproximar, sem congelar a TV.
- Fonte com 1 categoria: um carrossel só, mais os que tiverem dado.
- Categoria com poucos itens (< largura da fileira): sem indicador de continuação e sem espaço vazio rotulado.
- Item em mais de uma fileira: cada fileira o mostra; foco e memória são por fileira + id.
- Lista recolhida com a categoria em foco numa fileira: a faixa não rouba o foco ao rolar.
- Sessão restaurada de uma versão sem a lista recolhível: abre expandida.
- Capa ausente/falha: placeholder do card atual; hero cai no degradê.
- Título longo: trunca com reticências no card, no máximo 2 linhas no hero.
- Offline: nada muda além do que a feature 042 já faz.
- Slot "Em breve" focado pelo ↑/↓ de passagem: não bloqueia a navegação (foco sempre sai por qualquer direção).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela hero de Filmes e de Séries DEVE exibir um carrossel por categoria da fonte, um abaixo do outro, na ordem declarada pela fonte e com o nome declarado.
- **FR-002**: Cada carrossel de categoria DEVE ter um acesso "Ver tudo" focável (no cabeçalho e/ou como cartão final) que abre a vitrine da categoria, sem alterar a vitrine.
- **FR-003**: O conteúdo de um carrossel DEVE ser obtido ao se aproximar da área visível (não ao focar), usando o mecanismo de pré-carga já existente (features 010/038/039), sem nova consulta ao provedor além dele; carrosséis ainda sem conteúdo DEVEM mostrar carregando/vazio/erro com elemento focável.
- **FR-004**: A lista lateral de categorias DEVE poder ser recolhida para uma faixa estreita (ícone/inicial + rótulo acessível por entrada) e expandida de volta, com o foco preservado e o estado lembrado entre sessões.
- **FR-005**: Com a lista recolhida, os carrosséis DEVEM usar a largura liberada; com ela expandida, o layout atual da 052 permanece.
- **FR-006**: A tela DEVE usar formatos de card distintos por papel: pôster alto grande (destaque), pôster compacto (categorias), card largo com backdrop (Continue assistindo, só com imagem horizontal real) e Top 10 (número grande + pôster).
- **FR-007**: A ordem vertical sob o hero DEVE ser: Continue assistindo → Top 10 (TMDB, reservado) → ★ Favoritos → Adicionados recentemente → Bem avaliados (reservado) → Porque você assistiu X (reservado) → carrosséis de categoria; fileiras de itens sem dado real continuam sumindo.
- **FR-008**: Os slots reservados (Top 10 da semana, Bem avaliados, Porque você assistiu X) DEVEM aparecer soft-disabled "Em breve", registrados no ponto único de mocks do app (`comingSoon`), focáveis, sem dado e sem consulta externa.
- **FR-009**: O slot Top 10 DEVE ser de filmes em Filmes e de séries em Séries, com o formato final de 10 posições.
- **FR-010**: Nenhum conteúdo inventado: toda fileira ativa, rótulo, contagem, progresso e metadado vem de dado real já guardado; taxonomia externa nunca substitui categorias da fonte.
- **FR-011**: Focar um card ou slot NUNCA dispara reprodução ou consulta externa; o hero continua acompanhando o card focado, sem botões nem elementos focáveis próprios.
- **FR-012**: A navegação DEVE manter ↑/↓ entre fileiras no card visualmente mais próximo, ← → dentro da fileira, ↑ da primeira fileira à topbar, e a vitrine rolar na vertical mantendo a fileira focada visível; todo estado (carregando, vazio, erro, "Em breve", lista recolhida) DEVE ter ao menos um elemento focável.
- **FR-013**: Voltar da vitrine (via "Ver tudo") ou do detalhe DEVE restaurar a tela, a fileira e o card de origem, reconciliados por id (nunca por índice), inclusive com a lista recolhida.
- **FR-014**: Todo valor visual novo DEVE vir dos tokens V14 (cores, raios, espaçamentos, tamanhos de fonte), sem literais; fontes e imagens locais; cara Netflix sem perder a identidade (gradiente de marca reservado à identidade, `--accent` para estado).
- **FR-015**: A vitrine (grade de categoria), os detalhes, o player, Live, Configurações e Busca DEVEM ficar visual e funcionalmente idênticos.
- **FR-016**: Os contratos travados da 052 e anteriores que fixem a estrutura da tela hero (lista lateral fixa, ordem e formato das fileiras) DEVEM ser emendados de forma explícita e registrada no plano, nunca contornados.

### Key Entities

- **Carrossel de categoria**: uma categoria da fonte (nome declarado, contagem quando conhecida) com seus itens obtidos, estado (carregando/vazio/erro/pronto) e o destino "Ver tudo".
- **Fileira / slot da tela hero**: unidade ordenada com rótulo, formato de card (pôster alto, pôster compacto, largo, Top 10), origem de dado (histórico, favoritos, data de inclusão, categoria, reservado TMDB) e estado ativo ou "Em breve".
- **Preferência de lista lateral**: estado recolhida/expandida por tela (Filmes e Séries), lembrado no aparelho.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das listas testadas, a tela hero mostra exatamente um carrossel por categoria da fonte, na ordem dela, cada um com "Ver tudo" que leva à vitrine correta.
- **SC-002**: De qualquer carrossel de categoria, chegar à vitrine leva no máximo 2 teclas além do deslocamento até a fileira, e voltar restaura fileira e card em 100% dos casos testados.
- **SC-003**: Recolher a lista libera largura mensurável (a faixa ocupa menos da metade da largura da lista expandida) e o estado persiste após reabrir o app em 100% dos testes.
- **SC-004**: Em 100% das combinações de dados (com/sem histórico, favoritos, itens recentes), só aparecem fileiras ativas com itens reais, os quatro slots "Em breve" sempre presentes, e nenhum rótulo ou item sem dado real.
- **SC-005**: Com lista de centenas de categorias, abrir a tela e rolar por todos os carrosséis não congela a interface (sem tarefa longa perceptível) e a pré-carga respeita o limite já adotado nas features 038/039.
- **SC-006**: Capturas de vitrine (grade), detalhes, player, Live, Configurações e Busca antes e depois são idênticas.
- **SC-007**: Todos os testes unitários, de contrato (incluindo os emendados) e o E2E completo passam, e nenhum estado deixa a pessoa sem elemento focável.

## Assumptions

- O ponto de entrada é a tela hero de 052 (E-1: lista lateral + hero + fileiras); esta feature a evolui, não cria outra.
- "Vitrine" no pedido do usuário é a grade da 052; "Ver tudo" reaproveita a tela de categoria dela sem alterá-la.
- A **segunda** sugestão extra ("Porque você assistiu X") foi escolhida por mim, já que o usuário marcou só "Bem avaliados" entre as opções; é trocável sem impacto estrutural (outra candidata: "Lançamentos do ano", só com metadados da lista).
- As quatro fileiras não ativas ficam **soft-disabled "Em breve"** nesta feature; "Bem avaliados" poderia usar nota da fonte, mas só ativa quando houver nota real e fica para a feature que ligar o TMDB/metadados, evitando decisão de cobertura agora.
- Ativar os slots (TMDB BYOK, cruzamento com a lista, ocultar quando vazio) é feature futura; a chave do TMDB é a BYOK da feature 032 e nunca vai para o cliente de outra forma.
- Os dados de histórico, favoritos, data de inclusão, capa, progresso e contagem de categoria já existem; imagem horizontal (backdrop) só entra onde já houver dado real guardado; nada novo é persistido além da preferência de lista recolhida.
- A pré-carga por proximidade usa o mecanismo existente das features 010/038/039; o plano decide a janela exata e a virtualização vertical.
- Passada na TV física recomendada, não obrigatória; o gate é testes + E2E + capturas, como nas 048/050/052.

## Clarifications

### Sessão 2026-10-03

- Q: Os 2 carrosséis TMDB entram funcionais ou só reservados? → A: Reservar agora, soft-disabled "Em breve"; outra feature liga o TMDB.
- Q: Qual o segundo carrossel TMDB? → A: Top 10 Séries da semana (Filmes mostra o de filmes, Séries o de séries).
- Q: Quais sugestões extras? → A: "Bem avaliados" (escolha do usuário); a segunda, "Porque você assistiu X", foi assumida (ver Assumptions).
- Q: Como a lista lateral se comporta recolhida? → A: Faixa estreita de ícones/iniciais, ← no primeiro card expande, escolha lembrada.
- Q: Como entram os carrosséis de categoria? → A: Todas, na ordem da fonte, obtidas ao se aproximar da tela (nunca ao focar).
- Q: Que formatos de card? → A: Pôster alto grande (destaque), Top 10 com número, card largo com backdrop (só com imagem real) e pôster compacto nas categorias.
- Q: Ordem das fileiras? → A: Continue → Top 10 → Favoritos → Recentes → sugestões → categorias.

## Emendas pós-execução (2026-10-03)

Decisão do usuário depois de ver a tela funcionando (registrada no `plan.md` como D-012 e R-016/R-017). Onde divergir do texto acima, **vale esta seção**.

- **E-1 (altera US2, FR-004, FR-005, Key Entities "Preferência de lista lateral", Assumption de preferência)**: a lista lateral **não tem mais recolher/expandir manual nem preferência salva**. **← → na lista paginam a lista** (como nas demais listas, feature 049: o foco anda uma página inteira, presa às pontas). Ela **só fica recolhida enquanto o foco está nos cards**: o usuário aperta → até **terminar a lista** e, na última entrada, → entra nos cards (aí a lista recolhe para a faixa de ícones/iniciais); ← no 1º card volta à lista e ela expande. ↑↓ continuam andando de item em item. O foco inicial não mudou (1ª fileira com itens; sem dado, a lista).