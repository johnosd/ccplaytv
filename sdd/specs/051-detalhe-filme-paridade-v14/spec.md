# Feature Specification: Paridade visual do detalhe do filme com o Design System V14

**Slug**: `051-detalhe-filme-paridade-v14`

**Created**: 2026-10-02

**Status**: Substituída pela 059

> **Substituída pela [`059-detalhe-cinema-filme-serie`](../059-detalhe-cinema-filme-serie/spec.md) em 2026-10-05.** Nunca foi executada (0/31 tasks). O detalhe foi redesenhado (layout "Cinema", variação A, com capa ≥ 400×600, ações em ícone, barra de progresso real e Semelhantes em duas linhas) e passou a valer também para a série, o que contraria o escopo abaixo ("só visual", "série fora", "capa grande" = backdrop). Este documento fica como registro; não executar. As armadilhas do `handoff.md` foram levadas para a 059.

**Input**: "ajuste o design system na tela de detalhes do filme, adicionando marcar como assistido; também deve ter uma capa grande do filme; crie a página de elenco com imagem e nome dos artistas; crie a página de semelhantes com filmes semelhantes (obtidos pelo TMDB), alguns marcados como (na sua lista)". Referências: Component Lab V14, protótipo V13.2, Spec V14.

## Escopo

Levantamento no código (2026-10-02): as **funções** pedidas já existem — ação
"Marcar como assistido"/"Desmarcar assistido" (feature 019), aba Elenco com foto
e nome (`CastPeoplePanel`), aba Semelhantes via TMDB com selo "✓ Na sua lista"
(feature 035). O que falta é a **paridade visual** com o V14. Esta feature ajusta
o visual; não recria o que já funciona.

### Incluído

- Hero do detalhe com **capa grande** (backdrop do filme em destaque, no estilo do protótipo `details()` e do Spec §32 "Detalhe de filme"), com vinheta que preserva a legibilidade do texto e fallback quando não há capa.
- Ação **"Marcar como assistido"** com o visual dos botões V14 (primário, secundário, foco), estado "✓ Assistido" visível no hero.
- Aba **Elenco** com cartões de foto + nome (+ personagem quando existir), no padrão de cartão/rail do V14, com iniciais quando falta a foto.
- Aba **Semelhantes** com cartões de pôster no padrão V14; os que já existem no catálogo do usuário levam o selo **"Na sua lista"**.
- Estados de carregamento, vazio, erro e sem chave TMDB no padrão V14 (Spec §19, §45), sempre com um elemento focável.

### Fora de Escopo

- Transformar Elenco/Semelhantes em telas de rota própria: **permanecem como abas** do detalhe (decisão desta sessão).
- Mudar a navegação por foco, a memória de foco/retorno (feature 035) ou a tela da pessoa (`PersonScreen`).
- Detalhe de série (tem sua própria paridade).
- Prévia de trailer ao focar, avaliações, "relevância %" ou qualquer conteúdo inventado do protótipo (ADR-011).
- Novas chamadas ao TMDB além das já feitas hoje.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hero com capa grande e marcar como assistido (Priority: P1)

Ao abrir um filme, a pessoa vê uma capa grande no topo, com título, metadados e
ações no padrão V14, incluindo marcar/desmarcar como assistido.

**Why this priority**: é a primeira impressão da tela e concentra a ação nova pedida.

**Independent Test**: abrir o detalhe de um filme com e sem backdrop, marcar e desmarcar como assistido com o controle remoto.

**Acceptance Scenarios**:

1. **Given** um filme com backdrop, **When** o detalhe abre, **Then** a capa ocupa o hero em tamanho grande e o texto continua legível sobre ela.
2. **Given** um filme sem backdrop, **When** o detalhe abre, **Then** o hero usa o pôster/arte de fallback sem espaço vazio quebrado.
3. **Given** foco em "Marcar como assistido", **When** a pessoa aperta OK, **Then** o filme passa a "✓ Assistido", o rótulo vira "Desmarcar assistido" e o foco permanece no botão.
4. **Given** um filme assistido, **When** a pessoa desmarca, **Then** o selo "✓ Assistido" some e o progresso de retomada não é apagado.

---

### User Story 2 - Elenco com foto e nome (Priority: P2)

Na aba Elenco, a pessoa vê os artistas com foto e nome em cartões V14.

**Why this priority**: enriquece o detalhe; depende só dos dados TMDB já obtidos.

**Independent Test**: abrir a aba Elenco de um filme com dados TMDB, navegar pelos cartões e voltar.

**Acceptance Scenarios**:

1. **Given** elenco disponível, **When** a aba abre, **Then** cada cartão mostra foto e nome, com o foco no padrão V14 (anel, escala, 140 ms).
2. **Given** um artista sem foto, **When** o cartão renderiza, **Then** aparecem as iniciais no lugar da imagem.
3. **Given** elenco indisponível ou sem chave TMDB, **When** a aba abre, **Then** há mensagem V14 e um elemento focável (nunca foco preso).

---

### User Story 3 - Semelhantes com "Na sua lista" (Priority: P2)

Na aba Semelhantes, a pessoa vê filmes semelhantes do TMDB; os que existem no
catálogo ativo aparecem marcados "Na sua lista".

**Why this priority**: ajuda a descobrir o que assistir; o selo separa o que dá para assistir agora do que só existe no TMDB.

**Independent Test**: abrir Semelhantes de um filme com TMDB configurado e conferir que só os presentes no catálogo têm o selo.

**Acceptance Scenarios**:

1. **Given** semelhantes obtidos, **When** a aba abre, **Then** os cartões usam o pôster V14 e os encontrados no catálogo mostram "Na sua lista".
2. **Given** um cartão sem o selo, **When** a pessoa aperta OK, **Then** vê o resumo do título, sem tentar reproduzir.
3. **Given** um cartão com o selo, **When** a pessoa aperta OK, **Then** abre o detalhe do item do catálogo.

---

### Edge Cases

- Backdrop com imagem quebrada ou lenta: fallback sem layout shift.
- Título assistido com progresso parcial: "assistido" e "retomar" coexistem como hoje.
- Sem chave TMDB: Semelhantes oferece "Configurar TMDB"; Elenco mostra estado vazio.
- Elenco ou semelhantes muito longos: rolagem por foco, sem renderizar tudo de uma vez.
- Voltar de uma pessoa/semelhante restaura aba e item por identidade, não por índice.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O hero do detalhe do filme DEVE exibir a capa (backdrop) em tamanho grande, com vinheta para legibilidade, conforme o protótipo V14.
- **FR-002**: O hero DEVE ter fallback visual quando não há backdrop ou a imagem falha.
- **FR-003**: A ação "Marcar como assistido"/"Desmarcar assistido" DEVE seguir o visual de botões V14 (primário, secundário, foco, pressionado) e manter a semântica atual (chave lógica estável, não a URL).
- **FR-004**: O estado "✓ Assistido" DEVE ser visível no hero e coerente com o estado persistido.
- **FR-005**: A aba Elenco DEVE mostrar foto e nome de cada artista em cartões V14, com iniciais como fallback.
- **FR-006**: A aba Semelhantes DEVE mostrar os filmes obtidos do TMDB em cartões de pôster V14.
- **FR-007**: Cartões de Semelhantes presentes no catálogo ativo DEVEM exibir "Na sua lista"; os ausentes NÃO DEVEM exibi-lo.
- **FR-008**: Todo estado (carregando, vazio, erro, sem chave) DEVE ter ao menos um elemento focável.
- **FR-009**: Focar um cartão NÃO DEVE iniciar reprodução nem consulta externa; OK é que age.
- **FR-010**: O retorno de Elenco/Semelhantes/Configurações DEVE continuar restaurando aba e item por identidade.
- **FR-011**: Todos os valores visuais DEVEM vir dos tokens V14; nenhuma cor, raio, espaçamento ou tamanho de fonte hardcoded.
- **FR-012**: A chave TMDB e credenciais do provedor NUNCA aparecem em UI, log ou erro.

### Key Entities *(include if feature involves data)*

- **Filme do catálogo**: identidade lógica (fonte + tipo + id estável), pôster, ano, grupo original.
- **Estado do usuário do filme**: assistido (concluído em), progresso de retomada.
- **Pessoa do elenco**: nome, personagem opcional, foto opcional (TMDB).
- **Título semelhante**: dados TMDB mais a correspondência opcional com um item do catálogo ativo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos filmes testados (com e sem backdrop), o hero não tem área vazia nem texto ilegível.
- **SC-002**: Marcar/desmarcar como assistido leva no máximo 2 apertos de tecla a partir do foco inicial e reflete na tela em até 1 s.
- **SC-003**: 100% dos cartões de elenco mostram foto ou iniciais, nunca um espaço em branco.
- **SC-004**: 100% dos semelhantes presentes no catálogo mostram "Na sua lista" e 0% dos ausentes o mostram.
- **SC-005**: Nenhum estado do detalhe deixa o controle remoto sem elemento focável.
- **SC-006**: Validação na TV física: legibilidade, foco e fluidez de rolagem aprovados na QN50Q60DAGXZD.

## Assumptions

- Os dados de elenco e semelhantes continuam vindo da camada TMDB existente (BYOK da pessoa); sem novas fontes.
- A correspondência "Na sua lista" usa a lógica já existente da feature 035.
- A referência visual é o Spec V14 §32 e as seções `#cards`, `#rails`, `#feedback` do Component Lab; em conflito, vale a precedência do ADR-011.
- O ajuste de CSS fica em `styles/vod.css`, que já está modificado no working tree (feature 050); o plano deve coordenar para não colidir.

## Clarifications

### Sessão 2026-10-02

- Q: O que falta de fato no detalhe do filme? → A: As funções já existem; falta a paridade visual com o V14.
- Q: Elenco e Semelhantes viram páginas próprias em tela cheia? → A: Não, permanecem como abas do detalhe, só com o visual ajustado.
- Q: Há algo quebrado na prática? → A: Não, só o visual está fora do V14.
