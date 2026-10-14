# Feature Specification: Paridade visual da TV ao vivo com o Design System V14

**Slug**: `048-live-paridade-v14`

**Created**: 2026-10-02

**Status**: Encerrada

**Input**: Revisão da tela de TV ao vivo contra o protótipo `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` (função `live()`) e a Spec V14 §25, feita em 2026-10-02 com capturas 1920×1080 lado a lado. A estrutura (Categorias → Canais → Preview) e as regras de foco já batem; a distância é visual: colunas soltas em vez de painéis, preview como pilha de textos com três botões de ~920px de largura, coluna de categorias larga demais, anel de foco do canal cortado pela lista, itens sem o acabamento V14 e programação sem a faixa de cartões.

## Escopo

### Incluído

- Preview do canal focado como **painel de destaque** (hero): rótulo de categoria, nome grande, linha "ao vivo" com o programa atual, ações em pílula na horizontal, fundo com o logo real ampliado e esmaecido.
- Colunas de categorias e de canais dentro de **painéis** (superfície, borda, raio, cabeçalho de duas linhas com divisória) e larguras do V14 (categorias estreita, canais média, preview com o resto).
- Correção do **anel de foco cortado** na lista de canais (contorno, deslocamento e brilho inteiros visíveis).
- **Indicador de continuação** (Spec V14 §17, QA §34) na lista de canais e na trilha: esmaecimento discreto na borda de cima e/ou de baixo, só quando há itens além da área visível naquela direção.
- **Faixa de programação** abaixo do destaque com até 3 cartões (A seguir / Depois / Mais tarde), só com dados reais do EPG.
- **Item de categoria** no padrão V14: tile com iniciais (★ para Favoritos, ∞ para Todos), fundo e borda próprios, selecionado com tom e texto de destaque.
- **Item de canal** no padrão V14: número discreto (no mínimo 16px, Spec V14 §6), placeholder de iniciais sobre degradê quando não há logo, "Agora: …" + progresso quando há EPG, estrela de favorito dourada, estado distinto para o canal em reprodução (no zapping).
- O overlay de **zapping** (2 colunas sobre o player) adota os mesmos painéis e itens — sem destaque nem cartões.
- **Cabeçalho da página**: título no tamanho H1 do V14 (inalterado), subtítulo, chips alinhados à direita com o da entrada atual no estado selecionado do V14.
- Dica de favoritar sai do topo da lista e vai para as dicas do rodapé.

### Fora de Escopo

- Moldura global do app (padding de `.screen`, posição da topbar, fundo com degradês radiais) — afeta todas as telas; decisão própria.
- Preview em vídeo ou qualquer reprodução/consulta disparada por foco (constitution; ADR-011), incluindo o status "Preview pronto" e o texto "O preview atualiza quando você para o foco" do protótipo.
- Qualquer dado inventado: arte de fundo genérica, progresso fictício, textos de programação de exemplo.
- Esportes/Infantil na topbar (ADR-011).
- Barra de dica própria abaixo do preview ("OK assistir • ↑↓ navegar canais…") — as dicas ficam só no rodapé global.
- Mudar o visual de `SideCategoryNav`/`ChannelRow` em Filmes, Séries ou Configurações — o novo visual é uma variante só da Live.
- Ícones de categoria inferidos pelo tema do nome do grupo.
- Mudanças de comportamento de navegação, foco, memória de foco, busca por categoria, zapping ou guia completo — só visual (e o dado de programação dos cartões). Única adição de teclado: → também avança entre as ações do destaque (FR-004).
- ← andando para a ação da esquerda no destaque: ← continua voltando ao canal (contratos travados de 024/031).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Canal focado em destaque (Priority: P1)

Ao percorrer os canais, a pessoa vê o canal focado num painel de destaque grande: a categoria em rótulo pequeno, o nome em tamanho de título, a linha "● ao vivo" com o programa atual (se houver EPG) e as ações `Assistir`, `Favoritar`/`Favorito` e `Guia completo` (com ícones de play e estrela) lado a lado, em pílula. O fundo usa o logo real do canal, ampliado e esmaecido sob um degradê.

**Why this priority**: É a maior diferença visual e a que a Spec exige ("preview maior que painéis auxiliares"). Sozinha já faz a tela parecer a do protótipo.

**Independent Test**: Entrar numa categoria, focar um canal com logo e outro sem logo; conferir a composição do destaque e navegar entre as três ações (→/↓ avançam, ↑ volta, ← volta ao canal), com OK em cada uma fazendo o mesmo que hoje.

**Acceptance Scenarios**:

1. **Given** um canal focado com logo e EPG atual, **When** a tela é exibida, **Then** o destaque mostra rótulo de categoria, nome, "● <programa> • ao vivo agora", as três ações em linha e o logo ampliado no fundo.
2. **Given** um canal sem logo e sem EPG, **When** é focado, **Then** o destaque mostra só o degradê de superfície, o nome e "● Ao vivo", sem programa e sem espaço vazio rotulado.
3. **Given** o foco numa ação do destaque, **When** a pessoa aperta → ou ↓, **Then** o foco passa para a ação seguinte (↑ volta uma); **When** aperta ←, **Then** volta ao canal de onde saiu, de qualquer ação, como hoje.
4. **Given** um canal não reproduzível, **When** é focado, **Then** `Assistir` aparece soft disabled, como hoje.
5. **Given** a entrada ★ Favoritos, **When** um canal é focado, **Then** o rótulo mostra "★ FAVORITOS • <grupo do canal>".

---

### User Story 2 - Colunas em painéis, com foco inteiro visível (Priority: P1)

Categorias e canais aparecem em painéis com cabeçalho de duas linhas ("Categorias / Grupos" e "<entrada> / Canais") e as larguras do V14, deixando mais espaço para o destaque. O anel de foco do canal aparece inteiro, sem corte.

**Why this priority**: Organiza a tela e corrige um defeito real (anel de foco cortado — "foco é o estado mais importante").

**Independent Test**: Abrir a Live e focar o primeiro e o último canal visível de uma lista longa; o anel aparece completo nos quatro lados. Medir as larguras das colunas na captura 1920×1080.

**Acceptance Scenarios**:

1. **Given** a Live aberta, **When** a tela é exibida, **Then** categorias e canais estão em painéis com cabeçalho de duas linhas e divisória, e o destaque ocupa a maior parte da largura.
2. **Given** foco no primeiro canal da lista, **When** a tela é exibida, **Then** o contorno, o deslocamento e o brilho do foco aparecem inteiros.
3. **Given** foco no último canal visível, **When** a pessoa desce mais um, **Then** a lista rola e o anel continua inteiro.
4. **Given** os estados de carregando, vazio e erro da coluna de canais, **When** aparecem, **Then** ficam dentro do painel e continuam com um elemento focável.
5. **Given** uma lista de canais maior que a área visível, **When** o foco está no topo, **Then** só a borda de baixo esmaece; **When** a pessoa desce até o meio, **Then** as duas bordas esmaecem; **When** chega ao último canal, **Then** só a de cima. Uma lista que cabe inteira não esmaece nada, e o esmaecimento nunca cobre o anel do item focado.

---

### User Story 3 - Programação em cartões (Priority: P2)

Abaixo do destaque, até três cartões mostram os próximos programas reais do canal focado: "A SEGUIR", "DEPOIS" e "MAIS TARDE", com título e horário de início.

**Why this priority**: Aproveita o EPG que já existe para dar contexto, mas depende de dado que nem toda lista tem.

**Independent Test**: Com um EPG de teste com 4+ programas futuros, focar o canal e ver 3 cartões; com 1 programa futuro, 1 cartão; sem EPG, nenhuma faixa.

**Acceptance Scenarios**:

1. **Given** um canal com 3 ou mais programas após o atual, **When** é focado, **Then** aparecem 3 cartões com os 3 próximos programas, em ordem.
2. **Given** um canal com 1 programa após o atual, **When** é focado, **Then** aparece só 1 cartão ("A SEGUIR").
3. **Given** um canal sem programas futuros, **When** é focado, **Then** a faixa não aparece e o destaque ocupa o espaço.
4. **Given** um programa que termina enquanto o canal está focado, **When** o relógio passa do fim, **Then** "Agora" e os cartões avançam como o "Agora/A seguir" de hoje avança.

---

### User Story 4 - Itens de categoria e canal no padrão V14 (Priority: P2)

Cada categoria tem um tile com iniciais (★ Favoritos, ∞ Todos), fundo e borda próprios; a selecionada fica com tom e texto de destaque. Cada canal mostra número discreto, logo (ou iniciais sobre degradê), nome, "Agora: …" com progresso quando há EPG e estrela dourada se favorito. O mesmo visual vale no overlay de zapping, onde o canal em reprodução tem estado próprio.

**Why this priority**: Acabamento; a tela já funciona sem isso.

**Independent Test**: Comparar a trilha e a lista com a captura do protótipo; conferir que Filmes, Séries e Configurações não mudaram (capturas antes/depois).

**Acceptance Scenarios**:

1. **Given** uma categoria "Telecine Premium", **When** a trilha é exibida, **Then** o tile mostra "TP" e a contagem só aparece quando conhecida.
2. **Given** a categoria entrada, **When** a trilha é exibida, **Then** ela fica com fundo de destaque e texto na cor de destaque, distinta do foco.
3. **Given** um canal sem logo, **When** a lista é exibida, **Then** o lugar do logo mostra as iniciais do nome sobre degradê.
4. **Given** o zapping aberto sobre o player, **When** a lista é exibida, **Then** o canal em reprodução tem um estado visual distinto do foco.
5. **Given** Filmes, Séries ou Configurações, **When** abertas, **Then** a trilha lateral e as linhas estão idênticas às de antes.

---

### User Story 5 - Cabeçalho e dicas (Priority: P3)

O cabeçalho mostra "TV ao vivo" no tamanho H1 de hoje, o subtítulo "Canais, programação e guia em um só lugar" e, à direita, o chip da entrada atual (estado selecionado do V14) e o de contagem. A dica de favoritar sai do topo da lista e vai para o rodapé.

**Why this priority**: Pequeno ganho visual; independente das demais.

**Independent Test**: Captura do cabeçalho e do rodapé com uma categoria entrada.

**Acceptance Scenarios**:

1. **Given** uma categoria entrada, **When** a tela é exibida, **Then** os chips ficam à direita, o da entrada no estado selecionado do V14, o de contagem só com contagem conhecida.
2. **Given** a lista de canais com itens, **When** exibida, **Then** não há dica de favoritar acima da lista e o rodapé mostra "Segurar OK — Favoritar" (ou equivalente com a tecla amarela).

---

### Edge Cases

- Nome de canal ou de categoria muito longo: trunca com reticências no item e quebra em no máximo 2 linhas no destaque.
- Nome com uma só palavra ou com símbolos/emoji: iniciais usam os primeiros caracteres alfanuméricos; sem nenhum, o tile/placeholder fica sem letras, só o degradê.
- Logo que falha ao carregar: cai no placeholder de iniciais (lista) e no degradê sem logo (destaque).
- ★ Favoritos vazio: o estado vazio atual fica dentro do painel de canais e o destaque mostra o estado "Nenhum canal selecionado" sem ações fantasmas.
- Busca por categoria ativa: o campo e o status ficam dentro do painel de canais, abaixo do cabeçalho.
- Lista longa virtualizada: o novo padding do painel não pode quebrar a janela deslizante nem o cálculo de altura das linhas.
- Offline: nada muda além do que a feature 042 já faz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O preview da Live DEVE ser um painel de destaque com, nesta ordem: rótulo da entrada/grupo em caixa alta na cor de destaque, nome do canal em tamanho de título (até 2 linhas), linha "ao vivo" e as ações.
- **FR-002**: A linha "ao vivo" DEVE mostrar o indicador ao vivo seguido do título do programa atual e "• ao vivo agora" quando há EPG atual; sem EPG, DEVE mostrar só o indicador e "Ao vivo".
- **FR-003**: As ações do destaque DEVEM ficar em linha, em formato pílula, com `Assistir` como primária (botão primário do V14) e as outras duas como secundárias; ícones SVG locais de play e estrela acompanham os textos, que — junto com ordem, comportamento de OK e soft disabled — continuam os de hoje.
- **FR-004**: Com as ações em linha, → e ↓ DEVEM avançar para a próxima ação, ↑ DEVE voltar uma, e ← DEVE voltar ao canal de origem a partir de qualquer ação (preserva os contratos travados das features 024 e 031).
- **FR-005**: O fundo do destaque DEVE usar o logo real do canal ampliado e esmaecido sob degradê; sem logo ou com falha de carga, só o degradê de superfície. Nenhuma outra imagem pode ser usada.
- **FR-006**: As colunas de categorias e de canais DEVEM ficar em painéis com fundo de superfície, borda, raio e cabeçalho de duas linhas com divisória.
- **FR-007**: As larguras DEVEM seguir o V14: categorias ~200px, canais ~340px, destaque com o restante.
- **FR-008**: O anel de foco (contorno, deslocamento e halo; linhas e itens da trilha sem escala, Spec V14 §11.2) de qualquer item da lista de canais e da trilha DEVE aparecer inteiro, em qualquer posição de rolagem.
- **FR-009**: Abaixo do destaque DEVE haver uma faixa de até 3 cartões com os próximos programas reais do canal focado (rótulos A SEGUIR, DEPOIS, MAIS TARDE; título e horário de início); com menos programas, menos cartões; sem nenhum, a faixa não existe.
- **FR-010**: "Agora" e os cartões DEVEM avançar quando o programa atual termina, sem ação da pessoa.
- **FR-011**: Cada item da trilha DEVE ter tile com até 2 iniciais do nome declarado pela fonte (★ para Favoritos, ∞ para Todos), fundo e borda próprios; a entrada selecionada DEVE ter tom e texto de destaque, distintos do foco.
- **FR-012**: Contagens na trilha e nos chips DEVEM continuar só quando conhecidas (regra da feature 024).
- **FR-013**: Cada linha de canal DEVE mostrar número discreto, logo ou placeholder de iniciais sobre degradê, nome, e — só com EPG — "Agora: <programa>" e barra de progresso; favorito com estrela na cor dourada do sistema.
- **FR-014**: No overlay de zapping, os painéis e itens DEVEM usar o mesmo visual, e o canal em reprodução DEVE ter estado visual distinto do foco e do selecionado.
- **FR-015**: O cabeçalho DEVE manter o título no tamanho H1 do V14, ganhar o subtítulo "Canais, programação e guia em um só lugar" e ter os chips alinhados à direita, com o chip da entrada atual no estado selecionado do V14 (tom e texto de destaque).
- **FR-016**: A dica de favoritar DEVE sair do topo da lista de canais e constar nas dicas do rodapé da Live.
- **FR-017**: O novo visual de trilha e de linha de canal DEVE ser exclusivo da Live; Filmes, Séries e Configurações DEVEM ficar visualmente idênticos.
- **FR-018**: Os pontos de ancoragem do contrato travado da feature 024 (botões dentro do painel de preview, itens da trilha lateral, nome do canal na linha) DEVEM continuar presentes, e todos os testes de contrato existentes DEVEM continuar passando sem edição.
- **FR-019**: Todo valor visual novo DEVE vir dos tokens do V14 (cores, raios, espaçamentos, tamanhos de fonte), sem literais.
- **FR-020**: Estados de carregando, vazio e erro DEVEM continuar com pelo menos um elemento focável, agora dentro dos painéis.
- **FR-021**: A lista de canais e a trilha de categorias DEVEM indicar continuação com um esmaecimento discreto na borda de cima e/ou de baixo, presente só quando há itens fora da área visível naquela direção; o item focado NUNCA pode ficar sob o esmaecimento (o anel de FR-008 continua inteiro). Vale também no zapping.

### Key Entities

- **Programação do canal**: sequência ordenada de programas do EPG do canal (título, início, fim). A feature passa a ler o atual e até os 3 seguintes, em vez de só o atual e o seguinte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa captura 1920×1080 com o mesmo tipo de conteúdo, o destaque ocupa pelo menos 55% da largura útil da tela (hoje ~50% sem painel; protótipo ~60%).
- **SC-002**: Em 100% das posições testadas (primeiro, meio, último visível, após rolagem), o anel de foco do canal aparece inteiro nos quatro lados.
- **SC-003**: Com EPG de teste, o número de cartões exibidos é igual a min(3, programas futuros) em 100% dos casos; sem EPG, zero cartões e nenhum texto de programação.
- **SC-004**: Capturas de Filmes, Séries e Configurações antes e depois da feature são visualmente idênticas.
- **SC-006**: Numa lista de canais com mais itens que a área visível, o indicador de continuação aparece exatamente nas bordas com itens ocultos em 100% das posições testadas (topo, meio, fim), e nunca numa lista que cabe inteira.
- **SC-005**: Todos os testes unitários, de contrato e o E2E completo passam, e uma revisão lado a lado com o protótipo não aponta diferença de estrutura nos itens P1 e P2 além das exclusões do Fora de Escopo e dos pontos em que a Spec V14 / Component Lab prevalecem sobre o protótipo.

## Assumptions

- O EPG já guardado por canal tem os programas futuros; obter os 3 próximos é leitura do que existe, sem nova consulta de rede.
- O logo do canal pode ser exibido ampliado sem nova requisição além da que a lista já faz.
- "Ao vivo" é verdadeiro para todo canal da Live, então pode aparecer sem EPG.
- A dica de favoritar no rodapé usa o mesmo mecanismo de dicas do `AppShell`.
- Conclusão não exige passada na TV física (decisão de 2026-10-02); o gate é testes + E2E + capturas comparadas.

## Clarifications

### Sessão 2026-10-02

- Q: O que vai no fundo do destaque, sem arte real? → A: Logo real ampliado e esmaecido sob degradê; sem logo, só o degradê.
- Q: Cartões de programação com EPG insuficiente? → A: Mostra só os que existem (0–3); sem nenhum, a faixa some. Nunca texto inventado.
- Q: Barra de dica abaixo do preview, como no protótipo? → A: Não; dicas só no rodapé global, inclusive a de favoritar.
- Q: Anel de foco cortado: nesta feature ou ad-hoc antes? → A: Nesta feature.
- Q: Novo visual de trilha/canal vale para todas as telas? → A: Só para a Live; Filmes/Séries/Configurações intactas.
- Q: Conteúdo do tile de categoria? → A: Até 2 iniciais do nome declarado pela fonte; ★ Favoritos, ∞ Todos. Sem ícone inferido por tema.
- Q: Zapping acompanha o visual? → A: Sim, painéis e itens; sem destaque nem cartões.
- Q: Sinal de conclusão? → A: Testes + E2E + capturas 1920×1080 comparadas ao protótipo; passada na TV física não obrigatória.
- Q: Onde o protótipo diverge da Spec V14 / Component Lab (título 48px, chip branco, "▶ Assistir agora", número 12px), qual vale? → A: A Spec V14 (precedência da ADR-011). Título fica H1, chip no estado selecionado do V14, ações mantêm os textos de hoje com ícones SVG, número ≥ 16px. (Achado A-002 do Analyze do sdd-plan.)
- Q: A Spec V14 (§17, QA §34) pede indicador de "há mais itens" em listas longas, e a Live não tem. Incluir? → A: Sim, nesta feature (FR-021): esmaecimento nas bordas da lista de canais e da trilha, só quando há itens ocultos naquela direção. (Achado A-003 do Analyze do sdd-plan.)
- Q: Contratos de 024/031 exigem ↓ entre ações e ← de volta ao canal de qualquer ação; com ações em linha, como fica o teclado? → A: Ações em linha; → e ↓ avançam, ↑ volta uma, ← sempre volta ao canal. Contratos intactos.
