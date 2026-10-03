# Feature Specification: Paridade visual de Filmes e Séries com o Design System V14

**Slug**: `050-filmes-series-paridade-v14`

**Created**: 2026-10-02

**Status**: Implementada

**Input**: Pedido de ajustar as telas de Filmes e Séries para ficarem iguais ao protótipo `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` (funções `catalog()`, `catalogSearchModal()`, `sortModal()`), usando como consulta o Component Lab V14 e a Spec V14. A feature 025 já migrou essas telas para a estrutura V14 (sidebar, toolbar, hero compacta, grade); a distância que resta é de acabamento e composição, como a 048 fez para a Live.

## Escopo

### Incluído

- **Catálogo de Filmes e de Séries** (`VodCatalogScreen`): sidebar de categorias, toolbar (campo Pesquisar + Ordenar), hero band e grade de cards no acabamento do protótipo/Spec V14.
- **Hero band** maior, no padrão do protótipo: capa real do card focado ampliada e esmaecida como fundo sob degradê, rótulo em caixa alta, título grande, metadados reais.
- **Sidebar** no padrão V14: blocos "Sua biblioteca" e "Catálogo", item selecionado com tom de destaque, painel com cabeçalho; rodapé de estado só com dado real.
- **Toolbar**: campo Pesquisar e botão Ordenar no formato do protótipo (altura, raio, rótulo + valor atual).
- **Modal de Ordenar** e **campo Pesquisar** (inline, como hoje) no padrão do protótipo/Component Lab.
- Anel de foco inteiro visível e indicador de continuação (Spec V14 §17) na sidebar e na grade, se hoje não existirem.

### Fora de Escopo

- **Busca em modal com IME** (`catalogSearchModal()` do protótipo) e **sidebar recolhível com tiles de iniciais**: a busca atual é um campo inline com comportamento próprio (feature 018) e o recolhimento foi descartado na 025; mudar qualquer um altera foco/navegação.`n- **Fileiras horizontais** do protótipo ("Em destaque", "Continue assistindo", "Adicionados recentemente"): exigem nova zona de foco; ficam para feature futura.`n- **Telas de detalhe de filme e de série** (e modal de temporada) — escolha explícita desta feature; ficam como estão.
- Mudança de comportamento: navegação, foco, memória de foco (§41), paginação (049), busca por categoria, favoritos, histórico, ordenação e virtualização. Só visual.
- Qualquer conteúdo inventado do protótipo: "97% relevante", notas, classificação, rails editoriais fictícios ("Mais assistidos", "Coleções recomendadas", "Séries para descobrir"), "perfil + fonte" e "Sincronizado" sem estado real, "SAMSUNG IME" como selo.
- Botões "Abrir destaque" e "Pesquisar" no hero (a hero segue o card focado e não é focável).
- Preview/trailer ao focar (constitution; ADR-011).
- Moldura global do app (topbar, padding de `.screen`, fundo) — decisão própria.
- Mudar `SideCategoryNav`/`ChannelRow` da Live ou de Configurações.
- Esportes/Infantil na topbar (ADR-011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hero band e grade no visual do protótipo (Priority: P1)

Ao abrir Filmes ou Séries, a pessoa vê a hero band com a capa do card focado ampliada ao fundo, rótulo (`CCPLAY CINEMA`/`CCPLAY SÉRIES`, `★ SEUS FAVORITOS` ou `↺ VISTOS RECENTEMENTE` conforme a entrada), título grande e metadados reais, acima da grade de cards portrait no acabamento V14.

**Why this priority**: É a maior diferença visual e funciona sozinha.

**Independent Test**: Abrir Filmes, mover o foco entre cards com e sem capa; comparar com a captura do protótipo 1920×1080.

**Acceptance Scenarios**:

1. **Given** um card focado com capa, **When** a tela é exibida, **Then** a hero mostra a capa ampliada e esmaecida, rótulo, título e metadados reais.
2. **Given** um card sem capa ou com falha de carga, **When** é focado, **Then** a hero usa só o degradê de superfície, sem imagem genérica.
3. **Given** a entrada ★ Favoritos ou ↺ Histórico, **When** exibida, **Then** o rótulo da hero muda conforme o protótipo.
4. **Given** o foco movendo entre cards, **When** muda, **Then** nada é consultado nem reproduzido (só a hero atualiza).

---

### User Story 2 - Sidebar e toolbar no padrão V14 (Priority: P1)

A sidebar fica em painel com cabeçalho "Categorias", blocos "Sua biblioteca" e "Catálogo", item selecionado com tom de destaque distinto do foco, contagem só quando conhecida. A toolbar tem o campo Pesquisar e o botão Ordenar (rótulo "Ordenar" + opção atual ▾) nas medidas do protótipo.

**Why this priority**: Organiza a tela e dá a identidade do protótipo.

**Independent Test**: Comparar sidebar e toolbar com o protótipo; navegar com o controle e conferir que o foco não mudou de comportamento.

**Acceptance Scenarios**:

1. **Given** a tela aberta, **When** exibida, **Then** a sidebar está em painel com cabeçalho e os dois blocos de categorias.
2. **Given** uma categoria entrada, **When** exibida, **Then** ela tem tom e texto de destaque, distintos do foco.
3. **Given** foco em qualquer item da sidebar ou da toolbar, **When** exibido, **Then** o anel de foco aparece inteiro.
4. **Given** uma fonte sem contagem conhecida para uma categoria, **When** exibida, **Then** nenhuma contagem aparece.
5. **Given** sem dado real de sincronização, **When** exibida, **Then** não há rodapé "Sincronizado".

---

### User Story 3 - Modal de Ordenar e campo Pesquisar (Priority: P3)

O modal de Ordenar e o campo Pesquisar (inline) ficam no visual do protótipo/Component Lab: opções em lista V14 com a atual marcada; campo com ícone, texto/placeholder e dica "OK".

**Why this priority**: Acabamento; já funcionam.

**Independent Test**: Abrir o modal de Ordenar e ativar o campo Pesquisar; comparar com o protótipo.

**Acceptance Scenarios**:

1. **Given** Ordenar aberto, **When** exibido, **Then** só as opções com dado real aparecem e a atual está marcada.
2. **Given** o campo Pesquisar em repouso ou ativo, **When** exibido, **Then** tem ícone de lupa, placeholder/termo e a dica "OK" no repouso, nas medidas do protótipo, com o mesmo comportamento de hoje.
3. **Given** o modal de Ordenar, **When** fechado, **Then** o foco volta ao elemento de origem.

---

### Edge Cases

- Título ou categoria muito longo: trunca com reticências nos itens e quebra em no máximo 2 linhas na hero.
- Hero sem metadados reais: omite a linha de metadados, sem espaço vazio rotulado.
- Capa com proporção atípica: a hero a recorta por cobertura, sem distorcer.
- Fonte sem histórico, sem data de inclusão ou sem categorias: contagens somem; os estados vazio/erro/carregando continuam com elemento focável.
- Lista longa virtualizada/paginada: o novo padding não pode quebrar a virtualização, a paginação (049) nem o cálculo de altura.
- ★ Favoritos e ↺ Histórico vazios: estados atuais V14 continuam dentro da nova composição.
- Busca ativa: a hero dá lugar ao cabeçalho de resultados, como no protótipo.
- Offline: nada muda além do que a feature 042 já faz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A hero band DEVE mostrar, nesta ordem, rótulo em caixa alta na cor de destaque, título em tamanho de título (até 2 linhas) e metadados reais; o fundo DEVE ser a capa real do card focado ampliada e esmaecida sob degradê.
- **FR-002**: Sem capa ou com falha de carga, a hero DEVE usar só o degradê de superfície; nenhuma outra imagem pode ser usada.
- **FR-003**: O rótulo da hero DEVE variar: `CCPLAY CINEMA` (Filmes), `CCPLAY SÉRIES` (Séries), `★ SEUS FAVORITOS` e `↺ VISTOS RECENTEMENTE` nas entradas pessoais.
- **FR-004**: A hero NÃO DEVE conter elementos focáveis nem disparar reprodução ou consulta ao ser atualizada pelo foco.
- **FR-005**: A sidebar DEVE estar em painel com cabeçalho, blocos "Sua biblioteca" e "Catálogo", item selecionado com tom e texto de destaque distintos do foco e contagem só quando conhecida.
- **FR-006**: A toolbar DEVE ter o campo Pesquisar e o botão Ordenar (rótulo + opção atual) nas medidas do protótipo, com os mesmos comportamentos de hoje.
- **FR-009**: O anel de foco (contorno, deslocamento e halo) de itens da sidebar, toolbar e grade DEVE aparecer inteiro em qualquer posição de rolagem.
- **FR-010**: A sidebar e a grade DEVEM indicar continuação com esmaecimento discreto na borda, só quando há itens ocultos naquela direção, nunca cobrindo o anel do item focado.
- **FR-011**: O modal de Ordenar e o campo Pesquisar DEVEM seguir o padrão do protótipo/Component Lab e da Spec V14, listando só opções de ordenação com dado real; a busca continua inline (sem modal).
- **FR-012**: Um rodapé de estado na sidebar DEVE existir apenas com dado real de sincronização/lista ativa.
- **FR-013**: Navegação, foco, memória de foco por id (§41), paginação (049), virtualização, favoritos, histórico, busca e ordenação DEVEM se comportar como hoje; todos os testes de contrato existentes DEVEM passar sem edição, salvo ajuste de âncoras estritamente visuais justificado no plano.
- **FR-014**: Todo valor visual novo DEVE vir dos tokens do V14 (cores, raios, espaçamentos, tamanhos de fonte), sem literais; nenhuma fonte ou imagem vem de CDN.
- **FR-015**: Estados de carregando, vazio e erro DEVEM continuar com ao menos um elemento focável dentro da nova composição.
- **FR-016**: O novo visual DEVE ser restrito a Filmes e Séries; Live, Configurações e os detalhes DEVEM ficar visualmente idênticos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa captura 1920×1080 de Filmes e de Séries, uma revisão lado a lado com o protótipo não aponta diferença de estrutura na hero, sidebar, toolbar e cards além das exclusões do Fora de Escopo e dos pontos em que a Spec V14 prevalece.
- **SC-002**: Em 100% das posições testadas (primeiro, meio, último visível, após rolagem), o anel de foco aparece inteiro nos quatro lados.
- **SC-004**: Capturas de Live, Configurações e dos detalhes antes e depois são visualmente idênticas.
- **SC-005**: Todos os testes unitários, de contrato e o E2E completo passam sem edição de contrato, e a navegação por controle remoto (foco, voltar, paginação) é indistinguível da anterior.

## Assumptions

- Capa, histórico e data de inclusão já são guardados (features 011, 012, 015, 025).
- Os metadados reais da hero são os que a 025 já exibe (ano, contagem etc.); sem eles a linha some.
- Conclusão não exige passada na TV física, como na 048; o gate é testes + E2E + capturas comparadas.
- Onde o protótipo diverge da Spec V14 ou do Component Lab, vale a Spec (ADR-011).

## Clarifications

### Sessão 2026-10-02

- Q: O protótipo tem hero + 3 rails editoriais e a 025 recusou rails. Como tratar? → A: Primeiro "só com dado real", mas na exploração do sdd-plan isso exigiria nova zona de foco (fileira focável acima da grade), contradizendo "só visual"; decisão final: fileiras ficam fora desta feature (futura, com desenho de foco próprio).
- Q: Itens do detalhe sem dado real (relevância %, nota, 4K, sinopse fixa)? → A: Só dado real; mas o detalhe saiu do escopo desta feature por escolha explícita.
- Q (sdd-plan): A busca vira modal com IME, como no protótipo? → A: Não; é um campo inline (018) e mudar isso altera foco; só o visual do campo muda. A sidebar não ganha tiles (o protótipo só os usa recolhida, que é Fora de Escopo).`n- Q: Quais telas entram? → A: Catálogo de Filmes/Séries e modais (Ordenar/Pesquisar). Detalhe de filme, de série e modal de temporada ficam fora.
- Q: Pode mudar a estrutura de foco/navegação? → A: Não; só visual, contratos existentes intactos (FR-013).
- Q: Como combinar o layout de fileiras do protótipo com a grade paginada (049)? → A: A grade paginada permanece como única área de itens; sem fileiras.
- Q: Hero com ações "Abrir destaque"/"Pesquisar"? → A: Não; a hero segue o card focado, sem elementos focáveis (FR-004).
- Q: Rodapé "Sincronizado" e "perfil + fonte" da sidebar? → A: Só com estado real; senão omitir (FR-012).




