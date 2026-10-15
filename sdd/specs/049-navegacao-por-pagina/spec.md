# Feature Specification: Navegação por página nas listas

**Slug**: `049-navegacao-por-pagina`

**Created**: 2026-10-02

**Status**: Convergida

**Input**: Pedido do usuário, depois de validar a 048 na tela: "gostaria de mudar a forma de navegação nas listas. O usuário, quando aperta →, vai para a próxima página da lista; isso permite navegar mais rápido na lista de categorias e de canais. Com essa mudança o botão OK se torna necessário para entrar na categoria e no canal." Hoje, na TV ao vivo, → entra na categoria, do canal vai ao destaque e ← volta de coluna; em Filmes e Séries → entra na categoria e ← na borda da grade volta à trilha. Listas longas (dezenas de categorias, centenas de canais) exigem muitos toques em ↓ para chegar longe.

## Escopo

### Incluído

- **→ = próxima página, ← = página anterior** nas listas verticais: trilha de categorias e lista de canais da TV ao vivo (inclui ★ Favoritos, Todos e resultados de busca por categoria), a mesma lista dentro do **zapping** sobre o vídeo e a **trilha de categorias de Filmes e Séries**.
- **OK passa a ser o único gesto que entra**: OK numa categoria (ou em ★ Favoritos/Todos) entra na lista de canais; OK num canal toca. **RETURN** sai da lista de canais de volta à trilha.
- Destaque do canal deixa de ser focável: OK no canal toca; **Segurar OK** favorita (já é o gesto da barra de dicas); o **Guia completo** vira um ícone focável no topo da lista de canais, ao lado da lupa.
- Comportamento definido para primeira/última página, posição do foco dentro da página nova e tecla segurada.
- Emenda aprovada dos contratos travados e dos E2E que assumem o fluxo antigo.

### Fora de Escopo

- A **grade de cartões** de Filmes e Séries: ←/→ continuam andando entre cartões da mesma linha, ↑/↓ entre linhas, e ← na primeira coluna continua voltando à trilha.
- Guia completo (EPG), Configurações, Busca global, Início, listas (perfis), formulários e a topbar — nenhuma muda.
- Mudar o tamanho/visual das listas, painéis ou do destaque (048) além de o destaque perder os botões.
- Rolagem por roda/toque/ponteiro, teclas CH+/CH− e qualquer atalho novo de controle remoto.
- Qualquer consulta de rede ou reprodução disparada por paginar ou por foco (constitution): mudar de página só move o foco.
- Circularidade (dar a volta no fim da lista) e saltos por letra/índice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Percorrer a lista de canais e a trilha por páginas (Priority: P1)

Com o foco numa lista vertical (trilha de categorias ou lista de canais), → leva à próxima página e ← à anterior. Uma página é o que cabe na área visível da lista; o foco cai na mesma posição relativa da tela (3ª linha visível → 3ª linha da página nova). Na última página, → leva ao último item e para; na primeira, ← leva ao primeiro item e para. ↑/↓ continuam andando item a item.

**Why this priority**: É o motivo da mudança — chegar longe em listas com centenas de itens sem dezenas de toques.

**Independent Test**: Numa categoria com 200 canais, apertar → repetidamente e ver o foco avançar uma tela por vez até o último canal, depois ← de volta ao primeiro; o mesmo na trilha com ~20 categorias.

**Acceptance Scenarios**:

1. **Given** foco no 3º canal visível de uma lista de 200 canais (8 linhas visíveis), **When** aperta →, **Then** o foco vai para o canal 8 posições adiante, de novo na 3ª linha visível, e a lista rola o necessário para mostrá-lo.
2. **Given** foco na última página da lista, **When** aperta →, **Then** o foco vai ao último canal e para; ← na primeira página vai ao primeiro canal e para.
3. **Given** uma lista que cabe inteira na tela, **When** aperta → ou ←, **Then** o foco vai ao último/primeiro item, respectivamente, sem outra mudança.
4. **Given** foco numa categoria da trilha, **When** aperta →, **Then** a trilha avança uma página e **nada** é aberto: a lista de canais continua a da entrada atual.
5. **Given** a seta → segurada, **When** a tecla repete, **Then** o foco atravessa páginas em sequência (sem consultas de rede por página; a regra de key repeat da 046 vale).

---

### User Story 2 - OK entra, RETURN sai (Priority: P1)

OK na trilha entra na categoria (ou em ★ Favoritos/Todos), levando o foco ao canal lembrado ou ao primeiro; OK num canal toca. RETURN na lista de canais devolve o foco à trilha, na entrada de onde saiu. Por não haver mais → nem ← para trocar de coluna, essas são as únicas travessias entre as duas listas.

**Why this priority**: Sem isso a pessoa fica presa na primeira coluna — é a metade inseparável de US1.

**Independent Test**: Da trilha, OK numa categoria abre sua lista com o foco num canal; RETURN volta à trilha na mesma categoria; OK num canal abre o player.

**Acceptance Scenarios**:

1. **Given** foco numa categoria, **When** aperta OK, **Then** entra na categoria e o foco vai ao canal lembrado (ou ao primeiro) — como o → fazia.
2. **Given** foco num canal, **When** aperta OK, **Then** o canal toca; **When** segura OK, **Then** alterna favorito (inalterado).
3. **Given** foco na lista de canais, **When** aperta RETURN, **Then** o foco volta à trilha, na categoria da lista aberta; **When** aperta RETURN de novo, **Then** sai da tela como hoje.
4. **Given** foco na trilha em ★ Favoritos ou Todos, **When** aperta OK, **Then** entra na entrada virtual com o mesmo comportamento.
5. **Given** a lista de canais em carregamento, vazia ou em erro, **When** a pessoa aperta OK/RETURN, **Then** a ação focável do estado funciona e RETURN volta à trilha — nenhum estado sem foco ou sem saída.

---

### User Story 3 - Ações do destaque sem foco no destaque (Priority: P2)

O destaque do canal focado passa a ser só informação (rótulo, nome, linha "ao vivo", programa atual e cartões de programação); os três botões saem dele. `Assistir` = OK no canal; `Favoritar` = segurar OK (já anunciado na barra de dicas); `Guia completo` = ícone focável no topo da lista de canais, ao lado da lupa. A partir do primeiro canal, ↑ vai para a linha do topo (lupa e guia); nela, → e ← movem entre os dois ícones e OK ativa o focado; ↓ volta ao primeiro canal.

**Why this priority**: Consequência necessária de US1/US2 (→ não leva mais ao destaque), mas não bloqueia o ganho de velocidade.

**Independent Test**: Num canal, OK toca; segurar OK favorita (toast/estado como hoje); ↑ até o topo e → no ícone do guia + OK abre o Guia completo no canal de origem, e RETURN do guia devolve ao mesmo canal.

**Acceptance Scenarios**:

1. **Given** foco no 1º canal, **When** aperta ↑, **Then** o foco vai para a lupa; **When** aperta →, **Then** vai ao ícone de Guia; **When** aperta ←, volta à lupa; **When** aperta ↓, volta ao 1º canal.
2. **Given** o ícone de Guia focado, **When** aperta OK, **Then** o Guia completo abre posicionado no canal de origem e RETURN devolve o foco a esse canal (como a ação `Guia completo` hoje).
3. **Given** a busca por categoria ativa, **When** o campo de busca tem o foco, **Then** ←/→ continuam movendo o cursor do texto (inalterado).
4. **Given** um canal não reproduzível, **When** aperta OK, **Then** o mesmo feedback de "sem fonte" de hoje, sem tocar.
5. **Given** o zapping aberto, **When** a lista é exibida, **Then** não há lupa nem ícone de Guia (como hoje: busca nunca no zapping; o Guia abre pelo player).

---

### User Story 4 - Trilha de Filmes e Séries (Priority: P3)

Na trilha de categorias de Filmes e Séries, → pagina, ← pagina para trás e OK entra na categoria; na grade, nada muda (← na primeira coluna ainda volta à trilha e RETURN também).

**Why this priority**: Consistência entre telas, mas fora do pedido central (Live) e sem bloqueio para as demais.

**Independent Test**: Em Filmes com muitas categorias, → anda uma página, OK entra, a grade navega como hoje e ← na primeira coluna volta à trilha.

**Acceptance Scenarios**:

1. **Given** foco na trilha de Filmes, **When** aperta →, **Then** a trilha avança uma página e a grade não abre.
2. **Given** foco numa categoria de Filmes ou Séries, **When** aperta OK, **Then** entra e o foco vai ao primeiro item (ou ao lembrado).
3. **Given** foco na grade, **When** aperta ←/→/↑/↓, **Then** o movimento é o de hoje (cartão a cartão).

---

### Edge Cases

- Lista com menos de uma página, ou com um único item: → e ← vão ao último/primeiro item sem erro.
- Tamanho da página muda (tela com outro layout, zapping com colunas de altura diferente): a página é sempre o que cabe agora na área visível, nunca um número fixo.
- Foco numa posição relativa que não existe na página nova (última página incompleta): cai no último item.
- Lista que muda enquanto a pessoa pagina (categoria ainda carregando, resultado de busca que reduz): o foco é reconciliado por identidade do item, não por índice (constitution).
- Voltar ao canal/categoria de origem depois de OK/RETURN restaura foco e rolagem por identidade (constitution e 046).
- Busca por categoria: com o campo de busca com foco DOM real, ←/→ são do cursor; só com o foco fora do campo (nos resultados) → e ← paginam.
- Estado de erro da categoria ou fonte ausente: o botão focável do estado continua alcançável por setas; OK nele age; RETURN volta à trilha.
- Tecla segurada atravessando a última página: para no último item, sem rolagem excessiva nem vibração do foco.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Nas listas verticais cobertas (trilha e lista de canais da Live, as mesmas no zapping, trilha de Filmes e de Séries), → DEVE mover o foco para a próxima página e ← para a anterior; ↑/↓ DEVEM continuar movendo item a item.
- **FR-002**: Uma página DEVE ser a quantidade de itens que cabe na área visível da lista no momento; o foco DEVE cair na mesma posição relativa da tela, ou no último/primeiro item quando essa posição não existir.
- **FR-003**: Na última página, → DEVE levar ao último item e parar; na primeira, ← DEVE levar ao primeiro item e parar. A navegação NÃO DEVE dar a volta, e → e ← NÃO DEVEM sair da lista nem mudar de coluna.
- **FR-004**: → e ← NUNCA DEVEM entrar numa categoria, tocar um canal, abrir o Guia ou disparar consulta de rede; mudar de página só move o foco (constitution: focar nunca toca nem consulta).
- **FR-005**: OK numa entrada da trilha (categoria, ★ Favoritos ou Todos) DEVE entrar nela, com o foco no item lembrado ou no primeiro; OK num canal DEVE tocá-lo (feedback "sem fonte" para canal não reproduzível); Segurar OK DEVE alternar favorito, como hoje.
- **FR-006**: RETURN na lista de canais DEVE devolver o foco à trilha, na entrada da lista aberta, antes de qualquer saída da tela; nos estados de carregando, vazio e erro isso também vale e a ação do estado continua focável.
- **FR-007**: O destaque do canal NÃO DEVE conter elementos focáveis nem os botões `Assistir`/`Favoritar`/`Guia completo`; DEVE manter rótulo, nome, linha "ao vivo", programa atual e cartões de programação (048).
- **FR-008**: O topo da lista de canais DEVE ter, ao lado da lupa (018), um ícone focável de Guia completo com nome acessível; ↑ do primeiro canal leva à linha do topo; → e ← nela movem entre lupa e ícone; ↓ volta ao primeiro canal; OK no ícone abre o Guia no canal de origem com o mesmo retorno de foco de hoje (031). O topo NÃO DEVE existir no zapping.
- **FR-009**: Memória de foco, restauração por identidade e a regra de key repeat (046) DEVEM continuar valendo; paginar com a tecla segurada DEVE atravessar páginas em sequência sem consultas de rede por página nem perda do foco.
- **FR-010**: Com o campo de busca com foco DOM real, ←/→ DEVEM continuar sendo do cursor do texto; a paginação só vale com o foco nos itens.
- **FR-011**: Na grade de Filmes e Séries os movimentos DEVEM permanecer idênticos aos de hoje, e ← na primeira coluna da grade DEVE voltar à trilha.
- **FR-012**: As dicas do rodapé DEVEM refletir os gestos (OK Assistir/Entrar conforme o foco, Segurar OK Favoritar, RETURN Voltar) e DEVEM caber sem texto cortado.
- **FR-013**: Todo estado (carregando, vazio, erro, resultado de busca, fonte ausente) DEVE ter ao menos um elemento focável e alcançável só com setas, OK e RETURN (constitution).
- **FR-014**: Os contratos travados que assumem o fluxo antigo (018, 024, 031, 046 e 048) e os E2E que assumem "→ entra"/"→ vai às ações" DEVEM ser reescritos por emenda aprovada, com a trava regravada e cada mudança registrada no `plan.md` — nunca editados em silêncio.

### Key Entities

- **Página da lista**: o conjunto de itens visíveis de uma lista vertical numa dada rolagem; tamanho derivado do que cabe na tela, não persistido.
- **Posição relativa**: a linha da área visível em que o foco está; usada para o foco cair no mesmo lugar da tela depois de paginar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa lista de 300 canais com 8 linhas visíveis, chegar ao último canal exige no máximo ⌈300/8⌉ = 38 toques em →, contra 299 toques em ↓ hoje.
- **SC-002**: Em 100% dos testes de fluxo, → e ← nunca entram em categoria, tocam canal, abrem o Guia nem disparam rede; só OK entra/toca.
- **SC-003**: Em 100% das travessias lista de canais → RETURN → trilha → OK, o foco volta à categoria e ao canal de onde saiu (por identidade).
- **SC-004**: Em todas as telas e estados cobertos, o foco é alcançável e acionável só com setas, OK e RETURN, e RETURN nunca deixa a pessoa presa (sem estado sem foco).
- **SC-005**: A grade de Filmes e Séries, o guia, Configurações e a Busca global mantêm exatamente a navegação anterior (suítes e E2E existentes verdes após a emenda).
- **SC-006**: Com → segurada por 3 segundos numa lista longa, o foco atravessa páginas até o fim, para no último item, e não há erro de página nem consulta de rede por página.

## Assumptions

- A página usa a altura visível medida da lista (trilha ou canais), então varia com a tela e com o zapping; o tamanho não é configurável.
- Remover os botões do destaque é aceito pelo usuário (decisão de 2026-10-02: "OK toca, Segurar OK favorita, ícone de Guia ao lado da lupa"). O destaque continua informativo e o `plan.md` da 048 registra a mudança ao convergir.
- A 048 é a base visual (painéis, destaque, cartões, tiles); esta feature só muda a navegação e retira os botões do destaque. Os contratos da 048 que citam as ações em linha ou o → entre ações precisam da emenda de FR-014.
- Segurar OK para favoritar já existe nas listas (barra de dicas "Segurar OK Favoritar"); aqui só se confirma que vale no canal focado sem o destaque.
- Filmes e Séries compartilham a mesma lógica de trilha (`SideCategoryNav` com ←/→ de coluna); a mudança nelas é só nas teclas da trilha, sem tocar na grade.

## Clarifications

### Sessão 2026-10-02

- Q: Como o usuário volta da lista de canais para a trilha e como chega às ações do destaque, já que → pagina? → A: ← é "página anterior" (simétrico a →); **RETURN volta de coluna**. Ações do destaque: **OK toca, Segurar OK favorita, ícone de Guia ao lado da lupa**; o destaque deixa de ser focável.
- Q: O que → e ← fazem nas bordas da lista? → A: Vão ao último/primeiro item e param; sem dar a volta.
- Q: Onde cai o foco depois de paginar? → A: Na mesma posição relativa da tela (na falta, no último item).
- Q: Em que telas vale? → A: Lista de canais e trilha da Live (incl. Favoritos/Todos e busca), a lista do zapping, e a **trilha** de Filmes e Séries. A **grade** de Filmes/Séries fica como está.
- Q: Favoritos, Todos e busca por categoria mudam de comportamento? → A: Não — mesmo comportamento em tudo (OK entra, RETURN sai; a lupa continua em ↑ do 1º canal).
- Q: Processo? → A: Nova feature 049 pelo SDD, com emenda aprovada dos contratos travados (FR-014), não ajuste ad-hoc.
