# Feature Specification: Vitrine de Filmes e Séries e tela de categoria em grade cheia

**Slug**: `052-vitrine-filmes-series`

**Created**: 2026-10-02

**Status**: Convergida

**Input**: Pedido do usuário após validar a 050 no localhost e na TV: com sidebar, hero e toolbar na mesma tela, a grade de Filmes/Séries não tem altura para cards maiores (2 linhas × 6 colunas com capa inteira só cabe sem hero e sem sidebar). Proposta: Filmes e Séries viram **vitrines** (hero + fileiras com dado real, como o protótipo `catalog()`), e escolher uma categoria abre uma **tela nova** só com pesquisa, ordenação e grade em tela cheia. Substitui o modelo "sidebar + grade na mesma tela" das features 025/049/050; reabre as fileiras que a 050 deixou de fora (R-001) com desenho de foco próprio.

## Escopo

### Incluído

- **Vitrine** de Filmes e de Séries (destino da topbar): hero que segue o card focado e fileiras horizontais de cards, cada uma só quando houver itens reais: **Continue assistindo**, **★ Favoritos**, **Adicionados recentemente** e **Categorias**.
- **Fileira de Categorias**: cartões com o nome declarado pela fonte e a contagem quando conhecida; começa por **★ Favoritos**, **↺ Histórico** e **Todos**, seguidos das categorias da fonte na ordem dela. É a porta para a tela de categoria.
- **Cartão final "Ver tudo"** nas fileiras de itens: Continue assistindo → ↺ Histórico; ★ Favoritos → ★ Favoritos; Adicionados recentemente → Todos ordenado por Recém-adicionados.
- **Tela de categoria** (nova, empilhada sobre a vitrine): só **campo Pesquisar**, **botão Ordenar** e a **grade em tela cheia** — 2 linhas × 6 colunas visíveis, capa inteira (sem recorte), cards um pouco maiores que os de hoje. Sem sidebar e sem hero.
- Entradas ★ Favoritos, ↺ Histórico e Todos abrem a mesma tela de categoria, com o comportamento atual de cada uma (ordem própria em ★/↺, busca agregada em Todos, remoção do histórico, favoritar).
- Voltar da tela de categoria devolve a vitrine com foco e rolagem no cartão/fileira de origem (por id); voltar do detalhe devolve à grade como hoje.
- Valem para Filmes **e** Séries (mesma tela, duas seções).

### Fora de Escopo

- Telas de detalhe de filme e de série, player, Live, Configurações e Busca global.
- Qualquer conteúdo inventado: relevância %, notas, curadoria editorial ("Mais assistidos", "Coleções recomendadas"), fileiras geradas por IA, preview/trailer ao focar (constitution; ADR-011).
- Nova consulta ao provedor para montar a vitrine: as fileiras usam só o que o app já guarda.
- Escala global de fonte e margens do palco (decididas à parte; a 050 deixou margens e palco em `screen-margins.css`/`Stage.tsx`).
- Mudar regras de dados: classificação, importação, histórico, favoritos, ordenação e busca por categoria continuam iguais — muda a apresentação e a navegação entre as telas.
- Fileiras por gênero/TMDB: categorias da fonte nunca são substituídas por taxonomia externa.
- Esportes/Infantil na topbar (ADR-011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher uma categoria e ver a grade em tela cheia (Priority: P1)

Na vitrine, a pessoa vai à fileira de Categorias, escolhe uma (ou ★ Favoritos, ↺ Histórico, Todos) e abre a tela de categoria: pesquisa, ordenação e uma grade de 2 linhas × 6 colunas com as capas inteiras. RETURN volta à vitrine, no cartão de onde saiu.

**Why this priority**: É o ganho que motivou a feature (grade grande e limpa) e já é útil mesmo com a vitrine mínima (só a fileira de Categorias).

**Independent Test**: Com uma lista real, abrir Filmes, entrar numa categoria, mover o foco pela grade, pesquisar e ordenar, abrir um card e voltar duas vezes; conferir 12 cards visíveis sem recorte e o foco restaurado por id.

**Acceptance Scenarios**:

1. **Given** a vitrine de Filmes, **When** a pessoa seleciona uma categoria, **Then** abre a tela de categoria com campo Pesquisar, botão Ordenar e a grade em tela cheia (sem sidebar nem hero).
2. **Given** uma categoria com 12 ou mais títulos, **When** a tela abre, **Then** 2 linhas × 6 colunas aparecem inteiras, com a capa inteira em cada card (nenhum recorte) e o foco de estado visível e completo.
3. **Given** a grade, **When** a pessoa aperta ← → ou ↑ ↓, **Then** a navegação é a de hoje (paginação por ← → nas bordas, memória de foco por categoria, busca inline, Ordenar em modal).
4. **Given** um card focado, **When** a pessoa aperta OK, **Then** abre o detalhe; ao voltar, a grade reaparece no mesmo card (por id).
5. **Given** a tela de categoria, **When** a pessoa aperta RETURN, **Then** volta à vitrine com o cartão da categoria em foco.
6. **Given** ★ Favoritos ou ↺ Histórico vazios, **When** abertos, **Then** mostram o estado vazio atual com ação focável.

---

### User Story 2 - Vitrine com hero e fileiras reais (Priority: P1)

A vitrine mostra o hero do card focado (capa ao fundo, título, metadados reais, sem botões) e, abaixo, as fileiras Continue assistindo, ★ Favoritos e Adicionados recentemente, cada uma só quando houver itens, mais a fileira de Categorias. OK em um card abre o detalhe.

**Why this priority**: É a vitrine em si; sem ela a tela de categoria não tem de onde partir.

**Independent Test**: Com histórico, favoritos e itens com data de inclusão, ver as 4 fileiras; remover cada fonte de dado e ver a fileira sumir; abrir um item de cada uma.

**Acceptance Scenarios**:

1. **Given** itens no histórico, **When** a vitrine abre, **Then** "Continue assistindo" lista até 12 do mais recente ao mais antigo, com o progresso real quando houver.
2. **Given** favoritos, **When** a vitrine abre, **Then** "★ Favoritos" lista até 12, do favoritado mais recentemente ao mais antigo.
3. **Given** itens obtidos com data de inclusão da fonte, **When** a vitrine abre, **Then** "Adicionados recentemente" lista até 12, do mais novo ao mais antigo, sem aviso de cobertura.
4. **Given** nenhuma fileira de itens com dado, **When** a vitrine abre, **Then** só a fileira de Categorias aparece e o foco cai nela.
5. **Given** o foco numa fileira, **When** muda de card, **Then** o hero acompanha o card focado e nada é consultado nem reproduzido (focar nunca dispara nada).
6. **Given** o fim de uma fileira de itens, **When** a pessoa chega ao último card, **Then** há um cartão "Ver tudo" que abre a tela de categoria correspondente (US1).
7. **Given** uma fileira de Categorias, **When** exibida, **Then** ★ Favoritos, ↺ Histórico e Todos vêm primeiro, depois as categorias da fonte na ordem dela, contagem só quando conhecida.

---

### User Story 3 - Foco, voltar e estados da vitrine (Priority: P2)

Navegar entre fileiras, voltar do detalhe e da tela de categoria e atravessar estados de carregando, vazio e erro mantém o foco sempre visível e restaurado.

**Why this priority**: Nenhum estado novo pode prender o controle remoto, mas é refinamento sobre as duas stories acima.

**Independent Test**: Percorrer ↑ ↓ ← → pela vitrine inteira, abrir/voltar de detalhe e de categoria, simular lista vazia, carregando e erro.

**Acceptance Scenarios**:

1. **Given** o foco numa fileira, **When** a pessoa aperta ↑/↓, **Then** vai à fileira vizinha no card visualmente mais próximo; ↑ da primeira fileira vai à topbar.
2. **Given** a vitrine rolada e um card focado, **When** a pessoa volta do detalhe, **Then** vitrine, fileira e card voltam ao mesmo lugar, reconciliados por id (não por índice).
3. **Given** a fonte sem filmes (ou séries), **When** a vitrine abre, **Then** o estado vazio atual aparece com uma ação focável.
4. **Given** categorias carregando ou com erro, **When** a vitrine abre, **Then** os estados atuais de carregando/erro aparecem com elemento focável.
5. **Given** uma fileira com mais cards que a largura, **When** o foco anda, **Then** a fileira rola mantendo o card focado inteiro (anel completo) e indicando continuação nas bordas.

---

### Edge Cases

- Fonte com 1 categoria, ou só ★/↺/Todos: a fileira de Categorias existe sempre (pelo menos as 3 entradas fixas).
- Item que aparece em mais de uma fileira (ex.: favorito e histórico): cada fileira o mostra; o foco e a memória são por fileira + id.
- Histórico/favorito cujo título saiu da lista: some da fileira (como o `unresolved` de hoje); a nota de quantos sumiram continua na tela de ↺/★.
- Série no "Continue assistindo": uma entrada por série (regra atual do ↺ Histórico em Séries).
- Capa ausente ou que falha ao carregar: placeholder do card atual; o hero cai no degradê, sem imagem genérica.
- Hero sem metadados: omite a linha, sem espaço vazio rotulado.
- Título muito longo: trunca com reticências no card e quebra em no máximo 2 linhas no hero.
- Busca em "Todos" com cobertura parcial: o aviso "Busca em N de M categorias" continua na tela de categoria.
- Offline: nada muda além do que a feature 042 já faz.
- Sessão restaurada com estado antigo (snapshot de uma versão com sidebar): ignora o que não existe mais e cai na vitrine.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Filmes e Séries DEVEM abrir numa vitrine com hero (do card focado) e fileiras verticais de cards horizontais; o foco inicial cai na primeira fileira com itens, ou na de Categorias quando não houver nenhuma.
- **FR-002**: A vitrine DEVE ter as fileiras "Continue assistindo", "★ Favoritos", "Adicionados recentemente" e "Categorias"; as três primeiras só existem quando houver itens reais; "Categorias" sempre existe.
- **FR-003**: "Continue assistindo" DEVE usar o histórico/retomada já guardados, do mais recente ao mais antigo; "★ Favoritos", do favoritado mais recentemente ao mais antigo; "Adicionados recentemente", a data de inclusão declarada pela fonte, do mais novo ao mais antigo, só entre os itens já obtidos, sem aviso de cobertura e sem consulta nova ao provedor. Cada fileira mostra até 12 itens.
- **FR-004**: Cada fileira de itens DEVE terminar com um cartão "Ver tudo" que abre a tela de categoria: Continue assistindo → ↺ Histórico; ★ Favoritos → ★ Favoritos; Adicionados recentemente → Todos ordenado por Recém-adicionados.
- **FR-005**: A fileira de Categorias DEVE listar, nesta ordem, ★ Favoritos, ↺ Histórico, Todos e as categorias da fonte na ordem dela, com o nome declarado pela fonte (prefixos redundantes "Filmes |"/"Séries |" só removidos na exibição) e a contagem só quando conhecida; selecionar um cartão abre a tela de categoria dele.
- **FR-006**: A tela de categoria DEVE conter somente o campo Pesquisar, o botão Ordenar e a grade em tela cheia (sem sidebar, hero ou fileiras), empilhada sobre a vitrine, com a topbar persistente como nas demais telas do shell.
- **FR-007**: A grade DEVE mostrar 2 linhas × 6 colunas inteiras ao abrir (em 1920×1080), com a capa inteira em cada card (sem recorte) na proporção do pôster, e cards no mínimo tão grandes quanto os de hoje (205px de largura).
- **FR-008**: Dentro da tela de categoria, navegação por ← → (paginação nas bordas), ↑ ↓, memória de foco por categoria, busca inline (mín. 3 letras), Ordenar em modal, favoritar por OK longo/tecla amarela e remoção do histórico DEVEM se comportar como hoje; ★ Favoritos e ↺ Histórico mantêm ordem própria (sem Ordenar).
- **FR-009**: RETURN na tela de categoria DEVE voltar à vitrine com foco no cartão da categoria (ou "Ver tudo"/card) de origem; voltar do detalhe DEVE restaurar a tela, a fileira e o card de origem, reconciliados por id, nunca por índice.
- **FR-010**: O hero DEVE mostrar a capa real do card focado ao fundo (esmaecida, sem blur), rótulo, título e metadados reais já exibidos hoje, sem botões e sem elementos focáveis; sem capa, só o degradê. Focar um card NUNCA dispara reprodução ou consulta externa.
- **FR-011**: ↑ da primeira fileira DEVE levar à topbar e ↓ da topbar DEVE devolver ao ponto de origem; ↑/↓ entre fileiras DEVEM ir ao card visualmente mais próximo e ← → andar dentro da fileira (sem salto diagonal, Spec V14 §33).
- **FR-012**: As fileiras DEVEM rolar acompanhando o foco, com o card focado e o anel de foco inteiros e indicador de continuação (esmaecimento) só nas bordas com itens ocultos, e a vitrine DEVE rolar na vertical para manter a fileira focada visível.
- **FR-013**: Os estados vazio (sem filmes/séries), carregando e erro, e os estados vazios de ★ Favoritos e ↺ Histórico DEVEM continuar com ao menos um elemento focável, na vitrine e na tela de categoria.
- **FR-014**: Nenhum conteúdo inventado: toda fileira, rótulo, contagem e metadado vem de dado real já guardado; nenhuma taxonomia externa substitui as categorias da fonte.
- **FR-015**: Todo valor visual novo DEVE vir dos tokens do V14 (cores, raios, espaçamentos, tamanhos de fonte), sem literais; fontes e imagens locais.
- **FR-016**: Live, Configurações, Busca, detalhes e player DEVEM ficar visualmente e funcionalmente idênticos; o rótulo CCPLAY CINEMA/SÉRIES do hero e a remoção do prefixo da fonte (050) continuam.
- **FR-017**: Os contratos travados das features 025, 046, 049 e 050 que fixam o modelo "sidebar + grade na mesma tela" DEVEM ser emendados de forma explícita e registrada (ver Assumptions), nunca contornados.

### Key Entities

- **Fileira da vitrine**: sequência ordenada de até 12 itens (ou cartões de categoria) com rótulo, derivada de histórico, favoritos, data de inclusão ou da lista de categorias; existe só quando há itens (exceto Categorias).
- **Destino da tela de categoria**: ★ Favoritos, ↺ Histórico, Todos ou uma categoria da fonte (por nome declarado), opcionalmente com a ordenação inicial pedida por "Ver tudo".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 1920×1080, a tela de categoria mostra 12 cards inteiros (2 × 6) com capa sem recorte e anel de foco completo em qualquer posição, em 100% das posições testadas.
- **SC-002**: Em 100% das combinações de dados testadas (com/sem histórico, favoritos, itens com data), a vitrine mostra exatamente as fileiras com itens mais a de Categorias, e nenhum rótulo ou item aparece sem dado real.
- **SC-003**: Chegar a uma grade de categoria a partir da vitrine leva no máximo 3 teclas de seta + OK a partir do foco inicial para qualquer fileira, e voltar restaura o foco anterior em 100% dos casos testados.
- **SC-004**: Capturas de Live, Configurações, Busca, detalhes e player antes e depois são visualmente idênticas.
- **SC-005**: Todos os testes unitários, de contrato (incluindo os emendados) e o E2E completo passam, e nenhum estado (carregando, vazio, erro) deixa a pessoa sem elemento focável.

## Assumptions

- Os dados de histórico, favoritos, data de inclusão, capa e contagem de categoria já existem (features 011, 012, 015, 017, 025); nada novo é persistido.
- "Adicionados recentemente" reflete só o que já foi obtido (as categorias são preenchidas aos poucos em segundo plano, features 010/038); com cobertura baixa a fileira pode ter poucos ou nenhum item e some quando vazia.
- 12 itens por fileira é um teto de leitura, não de dado; "Ver tudo" leva à grade completa.
- Esta feature **substitui** o modelo da 025 (side nav + grade na mesma tela), da 049 (paginação da trilha de categorias) e da 050 (sidebar de 340px, hero compacta sobre a grade): os contratos travados correspondentes serão emendados no `sdd-plan`, com aprovação do usuário e regravação da trava (nunca editados em silêncio). Memória de foco da 046 e a navegação por página dentro da grade (049) continuam valendo na tela de categoria.
- A tela de categoria reaproveita a grade virtualizada atual; a geometria 2 × 6 com capa inteira é determinada pelo plano, assumindo o palco lógico de 1080px de altura.
- Passada na TV física recomendada, não obrigatória (como nas 048/050); o gate é testes + E2E + capturas.

## Clarifications

### Sessão 2026-10-02

- Q: Qual formato de grade na tela de categoria? → A: 2 linhas × 6 colunas, capa inteira (sem recorte), cards pelo menos do tamanho atual. (O experimento 4×2 recortou as capas e foi descartado.)
- Q: Que fileiras a vitrine mostra? → A: Continue assistindo, ★ Favoritos e Adicionados recentemente, só com dado real; a fileira de Categorias é obrigatória (é o caminho para a tela de categoria, e a resposta sobre ★/↺ pressupõe essa fileira).
- Q: O que a hero mostra? → A: O card focado (como hoje): capa ao fundo, título e metadados reais, sem botões.
- Q: Onde ficam ★ Favoritos e ↺ Histórico completos? → A: Entradas no começo da fileira de Categorias, abrindo a mesma tela de categoria.
- Q: "Adicionados recentemente" com cobertura parcial? → A: Só o que já foi obtido, sem aviso e sem consulta nova.
- Q: As fileiras de itens têm cartão "Ver tudo"? → A: Sim; abre ↺ Histórico, ★ Favoritos ou Todos por Recém-adicionados.

## Emendas pós-execução (2026-10-03)

Decisões do usuário tomadas **depois** da spec, ao validar no navegador e na TV física. O texto acima fica como histórico; onde divergir, **vale esta seção** (registradas no `plan.md` como D-015..D-018 e R-016).

- **E-1 (altera FR-002, FR-005, US2/AC4+AC7)**: "Categorias" **não é uma fileira**: é a **lista lateral** da vitrine (`SideCategoryNav`, título "Filmes"/"Séries"), na ordem ★ Favoritos, ↺ Histórico, Todos e as categorias da fonte (com contagem só quando conhecida). As fileiras de itens (Continue assistindo, ★ Favoritos, Adicionados recentemente) ficam à direita, sob o hero. Sem dado nenhum, o foco inicial cai na lista lateral.
- **E-2 (altera FR-006, FR-011, US3/AC1)**: a topbar **continua** em Filmes/Séries (vitrine e categoria), mas **sem o rodapé de dicas** (`AppShell` com `hints` opcional). ↑ do alto da vitrine sobe à topbar; na categoria, ↑ da 1ª linha vai à barra Pesquisar/Ordenar e dali à topbar.
- **E-3 (altera FR-007, SC-001)**: a grade da categoria tem **6 colunas fluidas e coladas** (vão `--space-1`, a largura da célula é `(100% − vãos) / 6`), pôster em `object-fit: cover` (**a capa pode ser recortada nas laterais**) com o título sobre o pôster, `ROW_HEIGHT` de 402px e **2 linhas inteiras** sempre visíveis (a 3ª nunca aparece; a rolagem é de linha em linha). O foco da grade é um anel **por dentro** do pôster, sem escala nem halo externo (divergência assumida de V14 §11.1 para esta grade: com cards colados o anel externo + escala passava por cima dos vizinhos).
- **E-4 (reafirma FR-006/FR-008)**: **Pesquisar e Ordenar ficam nas grades** (a tela de categoria); a tela de hero + fileiras **não** os tem. (Em 2026-10-03 a barra foi experimentada na tela de hero e removida; nenhum código ficou.)
- **E-5**: a pré-carga por foco (`useCategoryFocusPrefetch`) e a dica de seção (`usePrefetchHint`) da feature 038 **permanecem**: a vitrine as aplica à categoria focada na lista lateral e a tela de categoria à aberta (a 052 as havia perdido; o E2E `carga-listas` detectou).
