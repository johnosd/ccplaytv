# Feature Specification: Fileira "Bem avaliados" em Filmes e Séries

**Slug**: `056-bem-avaliados`

**Created**: 2026-10-03

**Status**: Convergida

**Input**: Fileira "Bem avaliados" em Filmes e Séries (item 68 do backlog), substituindo o mock "Em breve" `vod-rated` da feature 053, usando a nota do provedor (`provider_rating`) entregue pela feature 055, com rótulo "Provedor". Fora de escopo por padrão: ordenar por nota como opção geral (item 29) e nota IMDb/TMDB com procedência.

## Escopo

### Incluído

- Fileira real **"Bem avaliados"** na tela hero de **Filmes** e na de **Séries**, no lugar exato do slot "Em breve" atual (entre "Adicionados recentemente" e "Porque você assistiu").
- Conteúdo: títulos **recentes** (últimos 10 anos) de **boa nota do provedor (6,0 a 9,9)** do catálogo da lista, **sem versões duplicadas**, escolhidos entre os melhores candidatos com **variação diária** (estável durante o dia), exibidos em ordem decrescente de nota, com o mesmo limite de itens das outras fileiras de destaque (refinado em 2026-10-04: FR-015..FR-018).
- Desempate na exibição: nota igual → o **adicionado mais recentemente** primeiro.
- A fileira **só existe com nota real suficiente** (mínimo de 5 títulos com nota válida); abaixo disso some, sem slot "Em breve" e sem fileira vazia.
- "Ver tudo" da fileira abre a **grade de todos os títulos da seção já ordenada por nota** (maior → menor); essa ordenação existe só como destino do "Ver tudo", não como opção do menu de ordenação.
- Cobertura parcial aceita e sinalizada: a fileira usa os títulos das categorias **já obtidas no aparelho**, mostra "Com base em X de Y categorias" enquanto parcial e se atualiza sozinha conforme mais categorias chegam.
- Cada card da fileira mostra o selo "★ 7,4" da 055; o destaque (hero) mostra "★ 7,4 Provedor" quando o card em foco tem nota.
- Retirada do mock `vod-rated` do ponto único de "Em breve" e atualização do backlog (item 68 entregue).

### Fora de Escopo

- Opção "Nota" no menu de ordenação das categorias e da grade em geral, e qualquer ordenação por nota fora do "Ver tudo" desta fileira (item 29).
- Nota IMDb/TMDB, nota com procedência por fonte, comparação ou mistura de notas de fontes diferentes.
- Forçar a obtenção de categorias, rede ou consulta ao TMDB para montar a fileira.
- Ponderar nota por número de votos (a lista não traz votos); a exclusão do 10,0 é só uma proteção contra notas de poucos votos.
- Diversificar por franquia/sequência ou por categoria da fonte (fica para depois, se a variação diária não bastar).
- Os slots "Top 10 da semana" e "Porque você assistiu" (continuam "Em breve").
- Selo de nota em telas que a 055 deixou de fora (Início, Busca, Favoritos, card `wide`).
- Fileira "Bem avaliados" em Ao vivo ou em qualquer tela além de Filmes e Séries.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver os títulos mais bem avaliados da minha lista (Priority: P1)

Na tela de Filmes (ou Séries), a pessoa vê, sob "Adicionados recentemente", uma fileira "Bem avaliados" com os títulos de maior nota declarada pelo provedor, cada um com o selo "★ nota". Ao focar um card, o destaque mostra a nota com o rótulo "Provedor"; OK abre o detalhe como em qualquer outra fileira.

**Why this priority**: É a entrega do item 68 e a razão de a 055 ter guardado a nota: descobrir bons títulos num catálogo enorme sem esperar rede ou TMDB.

**Independent Test**: Com uma lista cujos títulos têm notas variadas e já obtidos, abrir Filmes e conferir a fileira, a ordem decrescente, o selo nos cards e o rótulo "Provedor" no destaque; repetir em Séries.

**Acceptance Scenarios**:

1. **Given** uma lista com ao menos 5 filmes com nota válida, **When** a pessoa abre Filmes, **Then** aparece a fileira "Bem avaliados" entre "Adicionados recentemente" e "Porque você assistiu", com os filmes de maior nota em ordem decrescente, até o limite das fileiras de destaque.
2. **Given** dois títulos com a mesma nota, **When** a fileira é montada, **Then** o adicionado mais recentemente vem primeiro.
3. **Given** a fileira visível, **When** a pessoa foca um card com nota 8,2, **Then** o destaque mostra "★ 8,2 Provedor" e nada é consultado na rede nem ao TMDB só por focar.
4. **Given** a mesma situação em Séries, **When** a pessoa abre Séries, **Then** a fileira existe com séries, sem misturar filmes.
5. **Given** a fileira visível, **When** a pessoa pressiona OK num card, **Then** abre o detalhe do título e, ao voltar, o foco retorna ao mesmo card (por id).

---

### User Story 2 - Ver tudo ordenado por nota (Priority: P2)

No fim da fileira há "Ver tudo", que abre a grade de todos os títulos da seção já ordenada da maior para a menor nota.

**Why this priority**: Sem ele a fileira é um corte fixo; com ele a pessoa explora além do limite. Fica P2 porque a fileira já entrega valor sozinha.

**Independent Test**: Selecionar "Ver tudo" na fileira e conferir que a grade abre ordenada por nota decrescente, com selos, e que voltar restaura o foco na fileira.

**Acceptance Scenarios**:

1. **Given** a fileira visível, **When** a pessoa seleciona "Ver tudo", **Then** abre a grade de todos os títulos da seção, ordenados por nota decrescente (desempate por mais recente), com os sem nota ao final.
2. **Given** a grade aberta por esse caminho, **When** a pessoa volta, **Then** retorna à tela hero com foco no "Ver tudo" (ou card equivalente) da fileira "Bem avaliados".
3. **Given** a pessoa que abre a grade por outro caminho (categoria, "Adicionados recentemente"), **When** abre o menu de ordenação, **Then** ele não ganhou a opção "Nota".

---

### User Story 3 - Fileira só quando há nota real (Priority: P2)

Se a lista tem poucas ou nenhuma nota (ou as categorias com nota ainda não foram obtidas), a fileira simplesmente não aparece. Nunca surge fileira vazia, "sem nota" ou o antigo "Em breve". Conforme a obtenção das categorias avança, a fileira pode aparecer e mudar.

**Why this priority**: Honestidade de dados (constituição) e foco: fileira inventada ou vazia seria pior que ausente. P2 porque é o comportamento de borda da P1.

**Independent Test**: Lista sem notas → fileira ausente; lista com 4 notas → ausente; com 5 → presente; adicionar categoria com notas maiores → a fileira passa a refletir.

**Acceptance Scenarios**:

1. **Given** uma lista sem nenhum título com nota válida, **When** a pessoa abre Filmes, **Then** não há "Bem avaliados" nem "Em breve" no lugar dela, e o foco navega normalmente pelas demais fileiras.
2. **Given** apenas 4 títulos com nota válida, **When** a tela abre, **Then** a fileira não aparece; ao chegar o 5º (outra categoria obtida), ela aparece.
3. **Given** a fileira visível, **When** uma categoria nova com notas maiores é obtida em segundo plano, **Then** a fileira passa a refletir essas notas sem que a pessoa precise recarregar a lista.

---

### Edge Cases

- Nota `0`, ausente, não numérica ou fora de 0–10 **nunca** conta: o título não entra na fileira nem na contagem do mínimo (regra da 055).
- Mudança de dados enquanto o foco está na fileira: o foco é reconciliado por id do item, nunca por índice; se o item sumir, o foco vai para um vizinho válido na mesma fileira (ou, se a fileira sumir, para a fileira mais próxima), nunca fica sem alvo.
- Fileira que some com o foco nela (ex.: a contagem cai abaixo do mínimo) não pode prender o controle remoto.
- Lista antiga ainda sem notas gravadas (importada antes da 055): a fileira só aparece depois que o refresh normal regravar as categorias; até lá, ausente.
- Título aparecendo em "Bem avaliados" e em outra fileira: permitido; o foco guarda a fileira do card.
- Fonte M3U (sem nota na listagem): a fileira não aparece, sem erro.
- Trocar de lista ativa: a fileira reflete só a lista ativa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Em Filmes e em Séries, o sistema DEVE exibir a fileira "Bem avaliados" no lugar hoje ocupado pelo slot "Em breve" `vod-rated`, ou seja, entre "Adicionados recentemente" (ou a fileira que a anteceder) e "Porque você assistiu".
- **FR-002** *(refinado em 2026-10-04, ver FR-015..FR-018)*: A fileira DEVE conter apenas títulos da seção correspondente (filmes em Filmes, séries em Séries) com nota válida do provedor, limitados ao mesmo número de itens das demais fileiras de destaque, exibidos em ordem de nota decrescente (desempate por adição mais recente). Quais títulos entram entre os elegíveis é definido por FR-015..FR-018.
- **FR-003**: A fileira DEVE existir somente quando houver ao menos 5 títulos elegíveis (FR-015, FR-016) na seção; com menos, DEVE estar ausente (nem vazia, nem "Em breve", nem "sem nota").
- **FR-015** *(2026-10-04)*: Só são elegíveis títulos com nota do provedor de **6,0 a 9,9** e **ano de lançamento conhecido**. A nota 10,0 (quase sempre 1–2 votos) e notas abaixo de 6,0 NÃO entram na fileira. (O "Ver tudo" mostra a seção inteira e não aplica este corte.)
- **FR-016** *(2026-10-04)*: A fileira DEVE preferir títulos recentes: os candidatos são os elegíveis dos **últimos 10 anos** (contando o ano corrente). Se houver menos títulos recentes do que o limite da fileira, ela DEVE completar com os elegíveis mais novos que existirem; título sem ano identificável nunca entra.
- **FR-017** *(2026-10-04)*: A seleção DEVE variar **de um dia para o outro**, mas ficar **estável durante o dia**: entre os melhores candidatos recentes, os títulos exibidos são sorteados com semente do dia (e da seção/lista), de forma que abrir, fechar e voltar do detalhe no mesmo dia mostram os mesmos cards (o foco continua restaurado por id), e a chegada de novas categorias altera poucos títulos.
- **FR-018** *(2026-10-04)*: Cada título DEVE aparecer uma única vez na fileira: versões do mesmo filme (ex.: marcadores `[L]`, `4K`, `HD`, `Dublado`/`Legendado` no nome, mesmo ano) contam como o mesmo título, e fica a de maior nota (depois a mais recente).
- **FR-004**: O sistema DEVE calcular a fileira com os títulos das categorias já obtidas no aparelho, sem requisição ao provedor, ao TMDB ou a qualquer host externo para montá-la ou atualizá-la, e DEVE refletir categorias obtidas depois sem ação da pessoa.
- **FR-005**: Cada card da fileira DEVE mostrar o selo "★ N,N" (formato da 055), e o destaque DEVE mostrar "★ N,N Provedor" ao focar o card; o selo não é focável.
- **FR-006**: Mover o foco dentro da fileira DEVE apenas atualizar o destaque, sem iniciar reprodução nem consulta externa; OK abre o detalhe do título.
- **FR-007**: A fileira DEVE terminar com o cartão "Ver tudo", que abre a grade de todos os títulos da seção ordenados por nota decrescente (desempate por adição mais recente, sem nota ao final); voltar DEVE restaurar a tela hero com foco em item válido da fileira.
- **FR-008**: A ordenação por nota DEVE existir somente como destino do "Ver tudo" desta fileira; o menu de ordenação geral das categorias e da grade NÃO DEVE ganhar a opção "Nota".
- **FR-009**: O sistema DEVE remover o mock `vod-rated` do ponto único de "Em breve" (e suas mensagens nos três idiomas), sem alterar `vod-top10-*` e `vod-because`.
- **FR-010**: Os textos novos (título da fileira, rótulos) DEVEM passar pelo catálogo i18n em pt/en/es; títulos e nomes vindos do provedor não são traduzidos.
- **FR-011**: A fileira e o "Ver tudo" DEVEM manter a navegação por controle remoto sem armadilha de foco: o foco entra, percorre os cards e sai para as fileiras vizinhas; ao voltar, o foco e a posição são restaurados por id de item.
- **FR-012**: A nota exibida DEVE sempre estar rotulada como vinda do provedor onde houver rótulo (destaque e detalhe) e NUNCA ser apresentada como IMDb ou TMDB.
- **FR-013**: Em lista sem nota (incluindo fonte M3U) ou com categorias com nota ainda não obtidas, a tela DEVE funcionar normalmente sem a fileira e sem erro.
- **FR-014**: Enquanto nem todas as categorias do tipo estiverem obtidas no aparelho, o cabeçalho da fileira DEVE indicar o escopo parcial ("Com base em X de Y categorias", no idioma do app) e esse aviso DEVE sumir quando todas estiverem obtidas; o aviso é só informativo, não focável (Constitution: "Progresso e Capacidades São Reais").

### Key Entities *(include if feature involves data)*

- **Título avaliado**: item de catálogo (filme ou série) da lista ativa com nota do provedor válida (0 < nota ≤ 10, uma casa), data de adição (para desempate) e identidade lógica estável (para foco e retorno).
- **Fileira "Bem avaliados"**: visão derivada, por seção, dos títulos avaliados das categorias já obtidas; não é persistida e não é categoria declarada pela fonte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa lista com notas já obtidas, 100% dos títulos da fileira têm nota válida e estão em ordem não crescente de nota; o primeiro item tem a maior nota entre os títulos obtidos da seção.
- **SC-002**: A tela de Filmes/Séries abre sem nenhuma requisição adicional (provedor, TMDB ou outro host) causada pela fileira; focar cards não gera consulta externa.
- **SC-003**: Numa lista sem notas, ou com menos de 5 títulos com nota, a fileira está ausente em 100% das aberturas, sem "Em breve" nem fileira vazia, e o controle remoto percorre todas as fileiras restantes sem perder o foco.
- **SC-004**: A abertura da tela hero com a fileira não fica perceptivelmente mais lenta que antes dela (referência: tempo da abertura atual da tela, sem aumento visível na TV física).
- **SC-005**: "Ver tudo" abre a grade em ordem decrescente de nota em 100% dos casos, e voltar restaura o foco na fileira em 100% dos casos testados.
- **SC-006**: Nenhuma ocorrência do rótulo "IMDb" ou "TMDB" associada a esta nota em qualquer tela.
- **SC-007** *(2026-10-04)*: Nenhum título da fileira tem nota 10,0, nota abaixo de 6,0 ou ano desconhecido; nenhum título aparece em duas versões. Com ao menos 12 candidatos recentes, os 12 títulos exibidos são todos dos últimos 10 anos.
- **SC-008** *(2026-10-04)*: No mesmo dia, duas aberturas da tela mostram exatamente os mesmos títulos (com os mesmos dados); com mais candidatos do que o limite, dois dias diferentes mostram conjuntos diferentes.

## Assumptions

- A nota usada é exclusivamente `provider_rating` da 055 (escala 0–10, uma casa, só > 0); não há nota de TMDB nem de IMDb nesta feature.
- O limite de itens da fileira é o mesmo das fileiras de destaque existentes (hoje 12, `SHOWCASE_LIMIT`); mudar esse limite fora desta feature muda a fileira junto.
- O mínimo de 5 títulos com nota para exibir a fileira é uma decisão de produto desta spec, ajustável sem mudar o resto.
- "Categorias já obtidas" significa as presentes no aparelho (entrada manual, pré-busca em segundo plano ou refresh); a cobertura pode ser parcial e é aceita como estado normal (ADR-002).
- A lista de origem muda pouco dentro de 24 h (frescor da 055); a nota só muda quando a categoria é renovada.
- Séries e filmes têm fileiras independentes, cada uma com seu mínimo e seu limite.
- A fileira não altera as categorias declaradas pela fonte (constituição: taxonomia da fonte nunca é substituída por taxonomia externa); é uma visão derivada, como "Adicionados recentemente".
- O selo de nota fora da grade e das fileiras `portrait` segue como na 055; o card da fileira "Bem avaliados" usa o formato `poster` que já recebe o selo.

## Clarifications

### Sessão 2026-10-03

- Q: Qual critério define os títulos da fileira? → A: Top N por nota do provedor, em ordem decrescente.
- Q: Quando a fileira aparece? → A: Só com nota real suficiente; abaixo do mínimo some, sem "Em breve" nem fileira vazia.
- Q: Para onde vai o "Ver tudo"? → A: Grade de todos os títulos da seção ordenada por nota (a ordenação por nota vale só nesse destino; o menu geral de ordenação não muda — item 29 segue à parte).
- Q: Como desempatar notas iguais? → A: Adicionados mais recentemente primeiro; sem ponderar votos (a lista não os traz).
- Q: Qual o mínimo de títulos com nota para exibir a fileira? → A: 5.
- Q: Como tratar cobertura parcial de categorias obtidas? → A: Usar o que já está no aparelho e se atualizar conforme mais categorias chegam, sem rede extra nem forçar obtenção.
- Q: Quantos títulos a fileira mostra? → A: O mesmo limite das outras fileiras de destaque (hoje 12).

### Sessão 2026-10-04 (pós-TV: "pega filmes muito antigos")

- Contexto: na TV a fileira trouxe filmes antigos; a sonda do painel real mostrou 255 filmes com nota 10,0 (quase sempre 1–2 votos) e o topo cheio de duplicatas (`[L]`). Pedidos do usuário: não mostrar sempre os mesmos filmes, tentar mostrar filmes mais novos, mostrar filmes diferentes.
- Q: Quando a seleção pode mudar? → A: A cada dia (estável durante o dia; sorteio com semente do dia).
- Q: Como priorizar filmes novos? → A: Só dos últimos 10 anos, com plano B (completa com os mais novos que existirem); sem ano fica de fora.
- Q: O que conta como repetido? → A: Versões do mesmo título (`[L]`, 4K, dublado, legendado); franquia e categoria da fonte ficam fora desta rodada.
- Q: A nota 10,0 entra? → A: Não; só de 6,0 a 9,9.

### Sessão 2026-10-03 (sdd-plan)

- Q: Três contratos travados de 052/053 exigem a fileira "Bem avaliados" sempre presente (slot "Em breve"); como resolver? → A: Emendar só as linhas dessa fileira nos 3 contratos e regravar as travas (R-001 do plano); a spec (fileira ausente sem nota) prevalece.
- Q: A constitution exige indicar cobertura parcial; como a fileira indica? → A: Texto discreto no cabeçalho enquanto parcial ("Com base em X de Y categorias"), que some quando completo — vira o FR-014.
