# Feature Specification: Top 10 da semana e carrossel "Dica" (TMDB) em Filmes, Séries e Início

**Slug**: `057-top10-dica-tmdb`

**Created**: 2026-10-04

**Status**: Convergida

**Input**: "implementar top 10 filmes, top 10 séries da semana com imdb. Implementar carrossel de dica de filme e série usando dados do TMDB também de forma aleatória usando média de votos, ano, popularidade. Incluir cada um na sua tela: filme na tela principal de filmes e série na tela principal de séries. Incluir os dois, filmes e séries, na tela de início." Preferência de versão informada na entrevista: trazer o título principal, sem `[L]` nem 4K, e só cair para legendado ou 4K quando não houver outra.

## Escopo

### Incluído

- Fileira real **"Em alta esta semana"** (no Início, "Filmes/Séries em alta esta semana"; internamente o "Top 10"), com os títulos em alta na semana segundo o **trending semanal do TMDB**, cruzados com a lista ativa. Na tela hero de **Filmes** é a de filmes, na de **Séries** é a de séries, e no **Início** entram as duas. Ela substitui os slots "Em breve" `vod-top10-movies` e `vod-top10-series` (item 67 do backlog).
- Fileira nova **"Dica"** (dica de filme / dica de série), um sorteio entre títulos bem avaliados do TMDB cruzados com a lista. A escolha usa **nota média, ano e popularidade**, e fica **estável no dia**. Aparece em Filmes (dica de filme), em Séries (dica de série) e no Início (as duas).
- **Cruzamento com a lista**: só aparece o que existe na lista ativa, e cada card abre o título real da lista.
- **Preferência de versão**: entre as versões de um mesmo título na lista, vale a **principal** (sem marcador `[L]`, sem 4K). Só se não houver principal entra a versão 4K ou legendada. Cada título aparece uma única vez.
- **Rótulo de procedência**: o Top 10 e a Dica mostram que os dados vêm do **TMDB** (nunca "IMDb"). Em nenhum ponto o IMDb é citado como fonte.
- **Cache no aparelho**: o Top 10 tem cache semanal e a Dica, diário. Sem chave, sem rede ou com erro do TMDB, as fileiras usam o último resultado em cache; sem cache, somem sem ruído.
- Retirada dos mocks `vod-top10-movies` e `vod-top10-series` do ponto único de "Em breve" e atualização do backlog (item 67 entregue; Dica registrada).
- Textos novos no catálogo i18n em pt, en e es.

### Fora de Escopo

- Qualquer fonte IMDb (não há API gratuita). Nota IMDb na UI, scraping ou serviço de terceiros.
- Mostrar títulos do TMDB que **não** estão na lista (nem como card bloqueado, nem como pedido de adição).
- Completar o Top 10 descendo no ranking do TMDB além da 10ª posição para achar 10 que existam na lista.
- Preview de trailer ou consulta ao TMDB ao **focar** um card (Constitution: focar nunca dispara consulta externa nem reprodução).
- Os slots "Porque você assistiu" (item 69, segue "Em breve") e "Bem avaliados" (feature 056, já entregue).
- Mudar o hero, o cartão "Ver tudo" ou o menu de ordenação das telas; opção "Nota" no menu de ordenação.
- Cartão "Configure o TMDB" ou qualquer chamada à ação para a chave BYOK nas fileiras.
- Fileiras em Ao vivo, Busca, Favoritos ou Configurações.
- Novo servidor, proxy ou chave de TMDB embutida no app (a chave continua sendo a BYOK da feature 032).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Top 10 da semana em Filmes e em Séries (Priority: P1)

Na tela hero de Filmes, a pessoa vê a fileira "Em alta esta semana" no formato número grande + pôster, com os filmes em alta na semana que existem na lista dela. Na tela de Séries, a mesma fileira traz as séries. *(Emendado em 2026-10-05, a pedido do usuário: os cards são numerados 1, 2, 3… na fileira, sem buracos; a posição real do título no ranking semanal do TMDB aparece no destaque do card focado, como "Nº 6".)*

**Why this priority**: É o pedido central, ocupa um slot já reservado na 053 e entrega descoberta imediata sem depender das demais histórias.

**Independent Test**: Com chave TMDB configurada e uma lista que contém parte do ranking semanal, abrir Filmes e conferir a fileira, os números e a abertura do detalhe; repetir em Séries.

**Acceptance Scenarios**:

1. **Given** chave TMDB válida e ao menos 3 títulos do trending semanal de filmes presentes na lista, **When** a pessoa abre Filmes, **Then** a fileira "Em alta esta semana" aparece na posição do slot reservado (após "Continue assistindo"), com esses filmes na ordem do ranking do TMDB, numerados 1, 2, 3… na fileira; ao focar um card, o destaque mostra a posição real dele no TMDB.
2. **Given** o ranking cujos #2 e #5 não estão na lista, **When** a fileira é montada, **Then** os cards mostram as posições 1, 3, 4, 6... e não 1, 2, 3, 4.
3. **Given** um filme do ranking com várias versões na lista (principal, `[L]`, 4K), **When** a fileira é montada, **Then** só uma entrada aparece, a principal; se só existir 4K ou legendada, essa é usada.
4. **Given** a fileira visível, **When** a pessoa foca um card, **Then** o destaque (hero) atualiza como nas outras fileiras e nada é consultado na rede nem no TMDB só por focar.
5. **Given** a fileira visível, **When** a pessoa pressiona OK num card, **Then** abre o detalhe do título e, ao voltar, o foco retorna ao mesmo card (por id).
6. **Given** a mesma situação em Séries, **When** a pessoa abre Séries, **Then** a fileira existe só com séries, sem misturar filmes.
7. **Given** o cruzamento que encontra menos de 3 títulos, **When** a tela abre, **Then** a fileira não aparece (nem vazia, nem "Em breve").

---

### User Story 2 - Dica de filme e Dica de série (Priority: P1)

Em Filmes aparece a fileira "Dica de filme" e em Séries a "Dica de série": 10 títulos bem avaliados e populares, sorteados entre os candidatos do TMDB que existem na lista. O sorteio muda a cada dia e fica igual durante o dia.

**Why this priority**: É o segundo pedido explícito e dá variedade (o Top 10 muda por semana, a Dica por dia). Fica P1 porque é independente do Top 10 e igualmente visível.

**Independent Test**: Abrir Filmes duas vezes no mesmo dia (mesmos cards e mesma ordem), simular a virada do dia (cards diferentes), e conferir que todos os cards têm nota e ano dentro dos critérios.

**Acceptance Scenarios**:

1. **Given** chave TMDB válida e candidatos suficientes na lista, **When** a pessoa abre Filmes, **Then** aparece a fileira "Dica de filme" com 10 filmes da lista, todos com nota média TMDB ≥ 7,0, votos mínimos e lançados nos últimos 15 anos.
2. **Given** a fileira aberta, fechada e reaberta no mesmo dia, **When** a pessoa volta à tela, **Then** os mesmos cards aparecem na mesma ordem.
3. **Given** a virada do dia, **When** a pessoa abre a tela, **Then** o sorteio é outro, com mais chance para os títulos mais populares (a popularidade pesa no sorteio, não filtra).
4. **Given** um candidato com várias versões na lista, **When** o sorteio roda, **Then** a versão principal é a usada (fallback para 4K ou legendada só se não houver outra) e o título não aparece duas vezes.
5. **Given** a mesma situação em Séries, **Then** a fileira "Dica de série" traz só séries.
6. **Given** menos de 5 candidatos válidos na lista, **When** a tela abre, **Then** a fileira não aparece.
7. **Given** a fileira visível, **When** a pessoa foca ou seleciona um card, **Then** valem as mesmas regras da história 1 (foco não consulta nada, OK abre o detalhe, voltar restaura o foco por id).

---

### User Story 3 - Top 10 e Dica de filmes e de séries no Início (Priority: P2)

No Início aparecem quatro fileiras: Filmes em alta esta semana, Séries em alta esta semana, Dica de filme e Dica de série. Cada uma some sozinha se não tiver conteúdo, e o Início continua funcionando com o foco em qualquer combinação delas.

**Why this priority**: Amplia o alcance das fileiras e é o pedido de "incluir nos dois", mas depende dos mesmos dados das histórias 1 e 2 e é uma tela a mais de integração.

**Independent Test**: Abrir o Início com TMDB configurado e conferir as quatro fileiras; remover a chave e conferir que sumiram sem deixar buraco; navegar com o controle remoto pelas fileiras e voltar de um detalhe.

**Acceptance Scenarios**:

1. **Given** chave TMDB válida e conteúdo para as quatro fileiras, **When** a pessoa abre o Início, **Then** as quatro aparecem, cada uma com seu título, sob o conteúdo que o Início já tem.
2. **Given** uma das quatro sem conteúdo suficiente, **When** o Início abre, **Then** só ela some; as demais continuam e nenhum espaço vazio fica no lugar.
3. **Given** o foco numa fileira nova do Início, **When** a pessoa pressiona OK num card, **Then** abre o detalhe do título e, ao voltar, o foco e o scroll retornam ao mesmo card (por id).
4. **Given** o Início, **When** o foco passa pelas fileiras novas, **Then** nenhuma consulta ao TMDB ou reprodução começa por causa disso.
5. **Given** os mesmos títulos aparecendo em Filmes/Séries e no Início, **Then** são os mesmos do dia/semana (a mesma fonte, o mesmo sorteio).

---

### User Story 4 - Sem TMDB, sem rede ou sem cobertura: some sem ruído (Priority: P2)

Se a chave TMDB não foi configurada, a rede falha, o TMDB responde com erro ou a lista não cobre o ranking, as fileiras simplesmente não aparecem (ou usam o último resultado em cache). A tela nunca mostra erro, fileira vazia nem "Em breve".

**Why this priority**: Honestidade de dados e foco da Constitution; é o comportamento de borda que decide se as fileiras são seguras para todos os usuários.

**Independent Test**: Rodar as telas sem chave (fileiras ausentes, tela intacta), com chave e rede cortada depois de um uso bem-sucedido (fileiras vêm do cache), e com chave e cache vazio sem rede (fileiras ausentes).

**Acceptance Scenarios**:

1. **Given** nenhuma chave TMDB, **When** a pessoa abre Filmes, Séries e Início, **Then** as fileiras novas não aparecem, nenhum erro é exibido e nenhuma chamada ao TMDB é feita.
2. **Given** um uso bem-sucedido nesta semana e agora sem rede, **When** a pessoa abre a tela, **Then** o Top 10 vem do cache semanal e a Dica do cache do dia (ou, se o dia virou e não há rede, do último conjunto de candidatos guardado, sorteado com a semente do dia).
3. **Given** erro do TMDB (chave inválida, limite, 5xx) e sem cache, **When** a tela abre, **Then** as fileiras ficam ausentes e a tela segue navegável.
4. **Given** a fonte M3U avulsa sem categorias obtidas, **When** a tela abre, **Then** o cruzamento só usa o que já está obtido no aparelho, e a fileira aparece ou some conforme a regra de mínimo.
5. **Given** a chegada de novas categorias, **When** o cruzamento muda, **Then** as fileiras se atualizam sozinhas sem perder o foco da pessoa.

---

### Edge Cases

- Chave TMDB inválida ou revogada: tratada como erro do TMDB (fileiras ausentes ou do cache); a chave nunca aparece em log, mensagem ou UI.
- Título do ranking que existe na lista só em versão 4K ou `[L]`: entra com essa versão (fallback); se existir a principal, a principal prevalece mesmo com nota ou data pior.
- Mesmo título em mais de uma categoria da lista: um card só.
- Título do TMDB que bate com mais de um título da lista (homônimos, ano diferente): vale o de mesmo ano; sem ano coincidente ele não entra (nunca adivinhar).
- Fileira com poucos itens (3 a 9 no Top 10): o formato Top 10 mostra só os existentes, sem posições vazias.
- Idioma do app (pt/en/es): os títulos das fileiras mudam, mas nomes de títulos vindos do provedor não são traduzidos.
- Troca de lista ativa: as fileiras recalculam para a nova lista; o ranking do TMDB em cache não é reaproveitado como se fosse cruzamento daquela lista.
- Virada do dia/semana com a tela aberta: não troca cards embaixo do foco; a mudança vale na próxima abertura.
- Lista sem séries (ou sem filmes): a fileira correspondente some, as outras seguem.
- Mesma sessão em Filmes e Início: o cruzamento não pode travar a tela (nenhuma varredura que bloqueie o foco).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE exibir a fileira "Em alta esta semana" (título da tela hero; no Início, "Filmes em alta esta semana" e "Séries em alta esta semana") de filmes na tela hero de Filmes e a de séries na de Séries, no lugar do slot reservado pela 053 (após "Continue assistindo"), no formato número grande + pôster.
- **FR-002**: Os dados do Top 10 DEVEM vir do **trending semanal do TMDB** (um por tipo), cruzados com a lista ativa, e a fileira DEVE conter somente títulos que existam na lista.
- **FR-003** *(emendado em 2026-10-05, aprovado pelo usuário)*: Cada card da fileira DEVE mostrar a **posição dele na fileira** (1, 2, 3…, sem buracos), na ordem do ranking semanal do TMDB; a **posição real** do título no ranking do TMDB DEVE aparecer no destaque (hero) do card focado ("Nº 6") na tela de Filmes e de Séries; a fileira DEVE ter no máximo 10 cards.
- **FR-004**: A fileira Top 10 DEVE existir somente com **3 ou mais** títulos cruzados; com menos DEVE estar ausente (nem vazia, nem "Em breve").
- **FR-005**: O sistema DEVE exibir a fileira "Dica de filme" em Filmes e "Dica de série" em Séries, com até **10** títulos da lista escolhidos entre candidatos do TMDB.
- **FR-006**: Os candidatos da Dica DEVEM ter **nota média TMDB ≥ 7,0**, **quantidade mínima de votos** (definida no plano, para descartar nota alta com poucos votos) e **ano de lançamento nos últimos 15 anos**; a **popularidade** do TMDB DEVE pesar no sorteio (mais popular, mais chance), sem funcionar como filtro.
- **FR-007**: A seleção da Dica DEVE variar de um dia para o outro e ficar **estável durante o dia** (mesmos cards e mesma ordem ao sair e voltar), usando semente do dia, do tipo e da lista.
- **FR-008**: A fileira Dica DEVE existir somente com **5 ou mais** candidatos válidos cruzados; com menos DEVE estar ausente.
- **FR-009**: O Início DEVE exibir até quatro fileiras novas, Top 10 filmes, Top 10 séries, Dica de filme e Dica de série, sob o conteúdo que já tem, cada uma ausente quando sem conteúdo, usando as mesmas fontes, regras e resultados das telas de Filmes e Séries.
- **FR-010**: O cruzamento com a lista DEVE aceitar só títulos do mesmo **tipo** (filme com filme, série com série) e do mesmo **ano**; sem correspondência segura o título do TMDB NÃO entra.
- **FR-011**: Entre as versões de um mesmo título na lista, o sistema DEVE preferir a **versão principal** (sem marcador `[L]`, sem 4K); somente na falta dela DEVE usar a versão **4K ou legendada**; cada título DEVE aparecer **uma única vez** por fileira. A regra vale para o Top 10 e para a Dica, em Filmes, Séries e Início.
- **FR-012**: As fileiras DEVEM indicar a procedência "TMDB" (no título, subtítulo ou rótulo do destaque); o IMDb NUNCA DEVE ser apresentado como fonte, e nota alguma deve ser exibida com procedência errada.
- **FR-013**: Focar um card DEVE apenas atualizar o destaque, sem iniciar reprodução nem consulta ao TMDB ou à rede; OK DEVE abrir o detalhe do título da lista.
- **FR-014**: Voltar do detalhe DEVE restaurar a tela com foco e posição no mesmo card, reconciliados por **id do item**, e não por índice.
- **FR-015** *(emendado em 2026-10-04, T036 do `sdd-converge`, aprovado pelo usuário)*: Sem rede ou com erro do TMDB (chave recusada, limite de uso, 5xx), as quatro fileiras DEVEM usar o **último resultado em cache** do aparelho (Top 10 semanal, Dica diária), e sem cache DEVEM estar ausentes, sem erro visível, sem fileira vazia e sem "Em breve". **Sem chave TMDB** as fileiras ficam ausentes e nada é pedido ao TMDB (remover a chave também esvazia o cache da descoberta).
- **FR-016**: A consulta ao TMDB DEVE ocorrer ao abrir a tela (não ao focar), no máximo uma **carga** por tipo e período de cache (o ranking semanal é uma consulta; a Dica reúne algumas páginas de `discover`), sem travar a tela nem a navegação enquanto carrega (nenhuma fileira "carregando" sem elemento focável).
- **FR-017**: A chave TMDB usada DEVE ser exclusivamente a BYOK da feature 032, só enviada ao próprio TMDB, e NUNCA DEVE aparecer em log, mensagem de erro ou UI.
- **FR-018**: O sistema DEVE remover os mocks `vod-top10-movies` e `vod-top10-series` do ponto único de "Em breve" (e suas mensagens nos três idiomas), sem alterar `vod-because`, e registrar a entrega no backlog.
- **FR-019**: Os textos novos (títulos das fileiras, rótulos de procedência) DEVEM passar pelo catálogo i18n em pt, en e es; títulos e nomes vindos do provedor não são traduzidos.
- **FR-020**: A navegação por controle remoto DEVE seguir sem armadilha de foco: o foco entra nas fileiras novas, percorre os cards e sai para as fileiras vizinhas, nas três telas.
- **FR-021**: As fileiras DEVEM se atualizar sozinhas quando novas categorias da lista forem obtidas (cobertura parcial aceita), sem mover o foco nem trocar cards sob ele. *(Na Dica, se uma categoria nova fizer um candidato deslocar justamente o card focado, o foco fica na posição lembrada: risco aceito, `plan.md` R-016.)*
- **FR-022** *(acrescentado em 2026-10-04, pela convergência, aprovado pelo usuário; já era a decisão D-012 do plano)*: Enquanto nem todas as categorias do tipo estiverem obtidas no aparelho, o cabeçalho do Top 10 e da Dica (na tela hero e no Início) DEVE indicar o escopo parcial ("Com base em X de Y categorias", no idioma do app) e o aviso DEVE sumir quando todas estiverem obtidas; é só informativo, nunca focável (Constitution: "Progresso e Capacidades São Reais").

### Key Entities *(include if feature involves data)*

- **Ranking semanal**: lista ordenada de títulos em alta na semana segundo o TMDB, por tipo (filme/série), com posição, identificação do título, ano e período de validade (semana).
- **Candidato de Dica**: título do TMDB com nota média, número de votos, ano e popularidade, elegível ao sorteio do dia quando atende aos critérios.
- **Correspondência com a lista**: elo entre um título do TMDB e um item da lista ativa (mesmo tipo e ano), com a versão escolhida (principal, 4K ou legendada).
- **Fileira de descoberta**: Top 10 ou Dica, por tipo e tela, com formato de card, origem dos dados, cache e estado (visível ou ausente).
- **Cache de descoberta**: último ranking semanal e último sorteio diário guardados no aparelho, por tipo e lista, com a data a que valem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma lista que contém ao menos 3 títulos do ranking semanal, 100% das aberturas de Filmes, Séries e Início com chave TMDB válida mostram a fileira "Em alta esta semana" correspondente, e 100% dos cards têm o título da lista aberto pelo OK.
- **SC-002** *(emendado em 2026-10-05)*: Em 100% das fileiras "Em alta esta semana" os números dos cards são 1, 2, 3… sem buracos, na ordem do ranking semanal do TMDB, e o destaque do card focado mostra a posição real dele no TMDB.
- **SC-003**: Abrir a mesma tela várias vezes no mesmo dia mostra a mesma Dica em 100% das vezes; em dois dias consecutivos, ao menos metade dos cards muda quando há candidatos suficientes.
- **SC-004**: 100% dos cards de Dica têm nota média ≥ 7,0 e ano dentro dos últimos 15 anos.
- **SC-005**: Em 100% dos títulos com mais de uma versão na lista, a versão principal é a escolhida; 4K ou legendada só aparecem quando não há outra, e nenhum título repete na fileira.
- **SC-006**: Sem chave TMDB ou sem rede e sem cache, 0 mensagens de erro, 0 fileiras vazias e 0 slots "Em breve" aparecem nas três telas, que continuam 100% navegáveis pelo controle remoto.
- **SC-007**: Focar ou percorrer as fileiras gera 0 consultas ao TMDB e 0 reproduções.
- **SC-008**: Abrir Filmes, Séries ou Início com as fileiras novas não aumenta de forma perceptível o tempo até a primeira imagem útil nem congela o controle remoto, na TV de referência, com a lista real do usuário.
- **SC-009**: Voltar de um detalhe restaura o foco no mesmo card em 100% dos casos testados nas três telas.

## Assumptions

- Correções internas feitas na execução e documentadas no plano não mudam requisito: invalidação do cache da descoberta ao salvar, testar ou remover a chave, `staleTime` só para resultado vigente (`plan.md` R-013) e o CSS do formato Top 10 (R-014); o cruzamento deixou de rodar na renderização (D-015).

- O usuário escreveu "IMDb", mas a fonte é o **TMDB**: o IMDb não tem API gratuita e a chave BYOK (feature 032) já é do TMDB. O rótulo da UI é "TMDB" (confirmado na entrevista).
- "Semana" é o trending semanal do TMDB (janela rolante), e o cache semanal vale por semana corrente; o plano define a borda exata.
- O Top 10 de filmes aparece só em Filmes e Início, e o de séries só em Séries e Início; a Dica segue a mesma divisão por tipo.
- A "Dica" é uma fileira nova, posicionada na tela hero entre "Adicionados recentemente"/"Bem avaliados" e "Porque você assistiu" (posição final no plano); nos três casos nunca antes do hero nem da fileira "Continue assistindo".
- No Início, as quatro fileiras ficam sob o conteúdo existente; a ordem entre elas e a posição exata ficam para o plano, respeitando o design system V14.
- Os valores concretos de "votos mínimos" e "candidatos para o sorteio" são decisões do plano, atendendo FR-006; o corte de 15 anos conta o ano corrente, como na 056.
- A identificação de versão (principal, `[L]`, 4K, legendado) reaproveita o entendimento de marcadores no nome já usado na 056 (FR-018) e é a mesma em todas as telas.
- Cobertura parcial da lista (categorias ainda não obtidas) é aceita; o aviso "Com base em X de Y categorias" da 056 só se aplica se o plano julgar necessário pela Constitution (progresso real).
- Sem backend novo: tudo roda na TV (ADR-008), e o TMDB é chamado direto do app, como já ocorre nos metadados dos detalhes.

## Clarifications

### Sessão 2026-10-04

- Q: Qual fonte para o Top 10 da semana, já que o IMDb não tem API gratuita? → A: TMDB trending semanal, rotulado "TMDB" (nunca "IMDb").
- Q: Top 10 e Dica mostram só o que existe na lista? → A: Sim, só o que está na lista; preferir a versão principal (sem `[L]`/4K), caindo para legendada ou 4K só quando não houver outra (usuário).
- Q: O que entra no Início? → A: Top 10 e Dica de filmes e de séries (4 fileiras), cada uma sumindo sem dado.
- Q: Como a Dica é "aleatória"? → A: Sorteio ponderado, estável no dia.
- Q: Quantos títulos do Top 10 e como numerar? → A: Mínimo 3; número = posição real no TMDB, sem renumerar. **Substituído em 2026-10-05** (ver a Q seguinte).
- Q: Critérios da Dica? → A: Nota ≥ 7,0 com votos mínimos, últimos 15 anos, ponderado por popularidade.
- Q: Sem chave, sem rede ou com erro do TMDB? → A: Somem sem ruído; usam o último resultado em cache se houver (semanal no Top 10, diário na Dica).
- Q: Ordem do fallback de versão? → A: Principal > 4K ou legendada, regra única nas 4 fileiras.
- Q: O FR-015 dizia que "sem chave" usa o último cache, contra a US4/AC1 e o comportamento entregue; qual vale? → A: (convergência, 2026-10-04, aprovado pelo usuário) sem chave as fileiras ficam ausentes e nada é pedido; o cache só vale para falha de rede ou erro do TMDB.
- Q: O FR-016 ("uma consulta") e a US4/AC2 ("último sorteio") descreviam o fluxo de um jeito que o código não segue; e o aviso de cobertura não tinha requisito. Como ficam? → A: (convergência, 2026-10-04, aprovado pelo usuário) FR-016 vira "uma carga por tipo e período" (a Dica usa várias páginas); a US4/AC2 fala do último conjunto de candidatos sorteado com a semente do dia; o aviso de cobertura ganha o FR-022; o deslocamento de card sob o foco na Dica é risco aceito (R-016).
- Q: Os números pulados (1, 3, 4…) dão uma sensação estranha quando faltam posições na lista. O que fazer? → A: (2026-10-05, a pedido do usuário) a fileira passa a se chamar **Em alta esta semana**, os cards são numerados **1, 2, 3…** na fileira e a posição real no TMDB aparece no destaque do card focado ("Nº 6"). Substitui a decisão "número = posição real, sem renumerar" (FR-003, US1/AC1, SC-002).
