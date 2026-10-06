# Feature Specification: Home no layout "Vitrine expandida" do Design System

**Slug**: `060-home-vitrine-expandida`

**Created**: 2026-10-05

**Status**: Em Execução

**Input**: "quero deixar o design system da página home mais rica e visualmente atraente … aumentar os cards" → três variações avaliadas (A Cinema, B Vitrine expandida, C Hub IPTV), escolhida a **B ("Vitrine expandida", referência Prime Video)**, já aplicada à função `home()` do protótipo e à seção "Home" da Spec V14 (sessão de 2026-10-05). "Agora, como fizemos para filmes e séries, vamos planejar o ajuste na tela home." Absorve os itens **69** ("Porque você assistiu X") e **32** (Trailer no herói do Início) do pacote G3 do backlog.

**Referências normativas**: Spec V14, seção "Home (layout "Vitrine expandida", revisão 2026-10-05)"; função `home()` do protótipo `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html`. Registro das alternativas descartadas: `docs/design/design-system/propostas/home-v15-variacoes.html`. Precedência do ADR-011 (constitution > ADRs > Spec V14 > Component Lab > protótipo).

## Escopo

### Incluído

- **Billboard de um título** no topo do Início: o mesmo título escolhido hoje (o "continuar" mais recente; sem ele, um favorito; sem nenhum, as boas-vindas), agora com backdrop em tela cheia, rótulo, título, metadata, chips (categoria da lista separada dos gêneros), sinopse e ações.
- **Billboard que recolhe**: ocupa a primeira tela só com o foco nele; com o foco nas fileiras, some e as fileiras ocupam a tela, com a fileira focada no topo.
- **Fundo ambiente** com o backdrop do item focado; sem backdrop, a cor dominante da capa; sem nenhum dos dois, gradiente neutro do tema.
- **Cards maiores com selos**: pôster 250 × 375 com o nome sobre a arte e os selos `NOVO`, `★ nota` do provedor, `✓` assistido e `♥` Minha Lista.
- **Continuar assistindo** em 16:9 (480 × 270) com barra de progresso real e legenda (`T1:E3 · faltam 26 min`).
- **Top 10** (Em alta esta semana) com numeral gigante ao lado do pôster.
- **Card que expande no foco**: pôster vira 667 × 375 com imagem 16:9, título, metadata, até 2 linhas de sinopse e "OK Detalhes"; Continuar vira 600 × 338. Sem backdrop, o card expandido mostra o pôster e as informações sobre a cor da capa.
- **"Ao vivo agora"** no lugar de "Canais favoritos": cards 480 × 270 com logo, `AO VIVO`, programa atual do EPG e barra de horário, terminando em "Todos os canais".
- **Fileiras novas**: "Filmes adicionados" e "Séries adicionadas" (pela data da fonte) e "Porque você assistiu X".
- **"Porque você assistiu X" também em Filmes e Séries** (item 69): o slot reservado "Em breve" da 053 vira fileira real; remove o mock `vod-because`. **Emenda autorizada dos contratos travados da 053** (o slot deixa de existir), registrada como exceção.
- **Trailer real no billboard** (item 32), com os estados da feature 033; remove o mock `home-trailer`.
- **Dock de serviços no canto do billboard**, sumindo junto com ele.
- **Guardar o backdrop que já chega** nas respostas do TMDB recebidas pela Home (Top 10, Dica, Semelhantes), sem nenhuma consulta nova, para ampliar a cobertura de imagens.
- **Navegação por linhas** e restauração do foco por identidade ao voltar de outra tela, já na posição, sem animar a partir do billboard.

### Fora de Escopo

- Classificação indicativa e nota TMDB (marcadas como "dado novo" no protótipo): só quando o app tiver esse dado real; viram ideia nova no backlog.
- Qualquer consulta externa nova além das que a Home já faz (Top 10, Dica) e da busca de semelhantes do título semente; nenhuma consulta ao focar.
- Prévia de trailer ou vídeo ao focar; troca automática do billboard (carrossel) (ADR-011).
- Relevância %, qualidade/áudio (4K, 5.1), selo editorial ou qualquer conteúdo inventado do protótipo.
- Curadoria por IA, recomendações e os ícones "Em breve" do dock (itens 30, 31, 54): continuam soft-disabled "Em breve".
- Telas de Filmes e Séries além do slot "Porque você assistiu"; detalhe, player e Live TV.
- Regras de escolha do Top 10, da Dica e do título do billboard (features 026 e 057) — só a apresentação muda.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Billboard que recolhe e fundo ambiente (Priority: P1)

Ao abrir o Início, a pessoa vê o título que estava assistindo em tela cheia, com sinopse e quanto falta, e retoma com um OK. Ao descer para as fileiras, o billboard sai do caminho, as fileiras ocupam a tela e o fundo acompanha o item focado.

**Why this priority**: é a mudança de estrutura da tela e a primeira impressão; sozinha já entrega uma Home mais cinematográfica e libera espaço para as fileiras.

**Independent Test**: abrir o Início com e sem título para continuar, com e sem backdrop no aparelho; descer e subir entre billboard e fileiras; ir a um detalhe e voltar.

**Acceptance Scenarios**:

1. **Given** um título para continuar com backdrop no aparelho, **When** o Início abre, **Then** o backdrop ocupa a tela, o texto é legível, o foco está em "Continuar" com barra e "faltam <tempo>", e a primeira fileira aparece no rodapé.
2. **Given** o título do billboard sem backdrop, **When** o Início abre, **Then** o fundo usa a cor da capa (ou gradiente neutro) — nunca área vazia nem imagem inventada.
3. **Given** o foco no billboard, **When** a pessoa aperta ↓, **Then** o billboard e o dock somem, a primeira fileira sobe para logo abaixo da topbar e o fundo passa a ser o do card focado.
4. **Given** o foco numa fileira, **When** a pessoa troca de card ou de fileira, **Then** o fundo acompanha o item focado usando só imagem já no aparelho; nenhuma consulta externa nem reprodução acontece.
5. **Given** o foco na primeira fileira, **When** a pessoa aperta ↑, **Then** o billboard volta com o foco na última ação focada; mais ↑ vai ao dock e depois à topbar.
6. **Given** a pessoa abriu um detalhe a partir de um card e voltou, **When** o Início reaparece, **Then** a fileira e o card de origem estão focados, já na posição, sem animar a partir do billboard.
7. **Given** a ação Trailer, **When** a pessoa aperta OK, **Then** o trailer abre como no detalhe (feature 033); consultando/indisponível ficam soft-disabled com o estado no rótulo.
8. **Given** nenhum título para continuar nem favorito, **When** o Início abre, **Then** o billboard de boas-vindas aparece com os atalhos de hoje e fundo neutro.

---

### User Story 2 - Cards maiores, selos e expansão no foco (Priority: P2)

Nas fileiras, a pessoa vê pôsteres maiores com o nome e selos que dizem o que é novo, a nota, o que já assistiu e o que está na lista. Ao focar um card, ele se abre em 16:9 com as informações do título, sem sair da Home.

**Why this priority**: é o "aumentar os cards" do pedido e o que mais enriquece a navegação; depende da estrutura da P1 só para o fundo.

**Independent Test**: percorrer cada fileira com itens com e sem backdrop, com e sem sinopse no aparelho, com e sem nota, assistidos, favoritos e recém-adicionados.

**Acceptance Scenarios**:

1. **Given** uma fileira de títulos, **When** ela aparece, **Then** cada card tem 250 × 375 com o nome sobre a arte e só os selos que se aplicam (`NOVO`, `★ nota`, `✓`, `♥`).
2. **Given** um card focado com backdrop no aparelho, **When** ele recebe o foco, **Then** expande para 667 × 375 com a imagem 16:9, título, metadata, até 2 linhas de sinopse (se houver no aparelho) e "OK Detalhes".
3. **Given** um card focado sem backdrop, **When** ele expande, **Then** mostra o pôster e as informações sobre a cor da capa.
4. **Given** Continuar assistindo, **When** a fileira aparece, **Then** cada card é 16:9 com barra de progresso só se houver posição **e** duração reais, e a legenda com o episódio (série) e o tempo restante.
5. **Given** Em alta esta semana, **When** a fileira aparece, **Then** cada card tem o numeral da posição na fileira ao lado do pôster, destacado no foco.
6. **Given** o foco no último card de uma fileira, **When** a pessoa aperta →, **Then** o foco não sai da fileira; o card focado fica na primeira posição visível sempre que houver espaço.
7. **Given** a TV física com expansão lenta, **When** o card expande, **Then** troca de tamanho sem animação de largura (critério de aceite da TV).

---

### User Story 3 - Fileiras novas, Ao vivo agora e "Porque você assistiu" (Priority: P3)

A pessoa encontra no Início o que chegou de novo na lista, o que passa agora nos canais favoritos e títulos parecidos com o último que terminou. O mesmo "Porque você assistiu" aparece nas telas de Filmes e Séries no lugar do "Em breve".

**Why this priority**: amplia a descoberta, mas a Home já é útil sem ela.

**Independent Test**: com e sem chave TMDB, com e sem título concluído, com e sem canais favoritos e EPG, com categorias obtidas e não obtidas.

**Acceptance Scenarios**:

1. **Given** filmes com data de inclusão na fonte, **When** o Início abre, **Then** "Filmes adicionados" mostra os mais novos das categorias já obtidas no aparelho; o mesmo para "Séries adicionadas"; a cobertura parcial é indicada como no Top 10.
2. **Given** um título concluído e chave TMDB, **When** o Início abre, **Then** "Porque você assistiu <título>" mostra semelhantes do mesmo tipo que estão na lista; sem semente, sem chave ou sem nenhum na lista, a fileira não existe.
3. **Given** a tela de Filmes (ou Séries), **When** ela abre, **Then** "Porque você assistiu" usa o último título concluído daquele tipo, com a mesma regra; o slot "Em breve" não existe mais.
4. **Given** canais favoritos com EPG, **When** o Início abre, **Then** "Ao vivo agora" mostra cada canal com programa atual e barra de horário; sem EPG, só o canal, sem barra; OK abre o canal como hoje; o último card leva a todos os canais.
5. **Given** a ordem das fileiras, **When** todas têm dado, **Then** aparecem como em FR-018; fileira sem dado não aparece (nem skeleton, nem "Em breve"), exceto a Curadoria por IA, que segue "Em breve".

---

### Edge Cases

- Título do billboard ou do card muito longo: no máximo duas linhas, sem empurrar ações ou metadata para fora.
- Capa ausente ou quebrada: placeholder atual; fundo e card expandido caem no gradiente neutro.
- Capa de domínio que não permite ler a cor (ou "com risco" pela regra da 059): fundo neutro, sem requisição e sem URL em log.
- Pessoa navegando rápido (seta segurada): o fundo não pisca a cada card; só acompanha o card em que o foco para.
- Fileira com um só card: expande sem deslocar a fileira; ←/→ não fazem nada.
- Card focado expandido no fim da fileira: a fileira não rola além do último card.
- Item removido da lista enquanto estava focado (reconciliação): o foco cai no vizinho da mesma fileira; sem vizinhos, na fileira anterior; nunca em nada.
- Fileira que surge ou some enquanto a pessoa está nela (dados chegando): o foco é preservado por identidade, como hoje.
- "Porque você assistiu" com o título semente removido do Histórico: a fileira recalcula a semente.
- Sem chave TMDB: Top 10, Dica e "Porque você assistiu" não existem; o resto da Home funciona.
- Player aberto a partir do billboard ou de um canal: nada da Home (backdrop, fundo, cards) pinta sobre o vídeo.
- Linha de estado do catálogo (feature 038) continua informativa e fora da navegação.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O billboard DEVE mostrar o título escolhido pela regra atual (continuar → favorito → boas-vindas), com backdrop em tela cheia escurecido para legibilidade, rótulo, título, metadata (ano · duração ou temporadas · nota com a origem "Provedor"), chip da categoria da lista separado dos gêneros e sinopse em até 3 linhas.
- **FR-002**: Sem backdrop, o fundo DEVE usar a cor dominante da capa; sem ela, um gradiente neutro do tema. A obtenção da cor NUNCA DEVE bloquear a tela nem a ação primária, e segue a regra de capa "sem risco" da 059 (FR-024 da 059).
- **FR-003**: A ação primária DEVE ser o primeiro foco ao abrir o Início sem foco a restaurar, e o comportamento de retomar/abrir detalhe DEVE ser o de hoje (contrato travado da 026).
- **FR-004**: Com posição salva **e** duração conhecida, a ação primária DEVE mostrar barra de progresso e tempo restante; sem um dos dois, NÃO DEVE mostrar barra, percentual nem tempo restante.
- **FR-005**: As ações do billboard DEVEM ser: primária · Mais informações · Minha Lista · Trailer. O Trailer DEVE funcionar como no detalhe (feature 033), com os mesmos estados soft-disabled.
- **FR-006**: Com o foco em qualquer fileira, o billboard e o dock DEVEM sair da tela, as fileiras DEVEM ocupar a área abaixo da topbar e a fileira focada DEVE ficar no topo; as fileiras anteriores à focada NÃO DEVEM aparecer.
- **FR-007**: O fundo DEVE acompanhar o item focado nas fileiras usando só imagem já no aparelho (backdrop; senão, cor da capa; senão, neutro), esmaecido para não competir com os cards, e só depois que o foco para num card.
- **FR-008**: Os cards de título DEVEM ter 250 × 375 no palco, com o nome sobre a arte e os selos aplicáveis: `NOVO` (data de inclusão na fonte nos últimos 7 dias), `★ nota` do provedor (só com nota > 0), `✓` assistido e `♥` na Minha Lista.
- **FR-009**: O card de título focado DEVE expandir para 667 × 375 com imagem 16:9, título, metadata, até 2 linhas de sinopse (só se já estiver no aparelho) e "OK Detalhes"; sem backdrop, com o pôster e as informações sobre a cor da capa. O card de Continuar DEVE expandir de 480 × 270 para 600 × 338.
- **FR-010**: Continuar assistindo DEVE usar cards 16:9 (480 × 270) com barra de progresso nas condições do FR-004 e legenda com o episódio (série) e o tempo restante quando conhecido.
- **FR-011**: As fileiras "Em alta esta semana" DEVEM mostrar o numeral da posição ao lado de cada pôster, destacado no foco; a posição é a ordem na fileira, nunca a posição bruta no TMDB.
- **FR-012**: "Ao vivo agora" DEVE substituir "Canais favoritos" com cards 480 × 270: logo, nome e número do canal, `AO VIVO`, programa atual e barra de horário quando houver EPG; sem EPG, sem programa nem barra. O último card DEVE levar a todos os canais; OK num canal DEVE abri-lo como hoje.
- **FR-013**: "Filmes adicionados" e "Séries adicionadas" DEVEM listar os itens mais novos pela data de inclusão da fonte, só das categorias já obtidas no aparelho, indicando cobertura parcial como as fileiras do TMDB; itens sem data não entram.
- **FR-014**: "Porque você assistiu <título>" DEVE usar como semente o último título concluído (no Início, de qualquer tipo; em Filmes e Séries, do tipo da tela) e listar semelhantes do mesmo tipo que estão na lista (regra de casamento da 035). Sem semente, sem chave TMDB ou sem nenhum semelhante na lista, a fileira NÃO DEVE existir.
- **FR-015**: Em Filmes e Séries, o slot "Porque você assistiu" "Em breve" DEVE deixar de existir; a fileira real segue o FR-014. O mock `vod-because` DEVE ser removido de `comingSoon`.
- **FR-016**: O mock `home-trailer` DEVE ser removido de `comingSoon`; a Curadoria por IA e os ícones "Em breve" do dock continuam soft-disabled.
- **FR-017**: O dock de serviços DEVE ficar no canto superior do billboard e sair da tela junto com ele; o ícone do TMDB mantém o comportamento de hoje.
- **FR-018**: A ordem das fileiras DEVE ser: Continuar assistindo · Em alta esta semana — Filmes · Filmes adicionados · Dica de filme · Porque você assistiu · Ao vivo agora · Minha Lista (com os cartões "Filmes (N)"/"Séries (N)") · Em alta esta semana — Séries · Séries adicionadas · Dica de série · Curadoria por IA (Em breve). Fileira sem dado NÃO DEVE aparecer, nem como skeleton.
- **FR-019**: A navegação DEVE seguir linhas: ←/→ dentro da fileira, parando nas pontas, com o card focado na primeira posição visível sempre que houver espaço; ↑/↓ trocam de fileira voltando ao último card focado nela; ↑ na primeira fileira volta à última ação do billboard; ↑ nas ações vai ao dock e, dele, à topbar.
- **FR-020**: Voltar de qualquer destino aberto pela Home DEVE restaurar fileira e card (ou ação do billboard) por identidade, já na posição, sem animar a partir do billboard.
- **FR-021**: O backdrop que já chega nas respostas do TMDB recebidas pela Home (Top 10, Dica, Semelhantes) DEVE ser guardado para uso local, sem nenhuma requisição nova; se exigir mudança de esquema do banco local, DEVE usar a versão v17.
- **FR-022**: Focar qualquer elemento NUNCA DEVE iniciar reprodução, trailer nem consulta externa; consultas só acontecem ao abrir a tela (as de hoje e a dos semelhantes da semente).
- **FR-023**: Todo estado (carregando, vazio, sem chave, erro) DEVE deixar ao menos um elemento focável; com só o billboard, o foco fica nele.
- **FR-024**: Nenhum valor visual fixo: cores, raios, espaçamentos, tamanhos e tempos vêm dos tokens V14 (os tamanhos de card viram tokens se ainda não existirem).
- **FR-025**: Todo texto novo DEVE existir em pt, en e es no catálogo de idioma; nomes de títulos, canais, categorias e programas não são traduzidos.
- **FR-026**: Credenciais, chaves e URLs que possam carregar credencial NUNCA DEVEM aparecer em log, erro ou interface, inclusive ao ler a cor de uma capa ou guardar um backdrop.
- **FR-027**: Ao abrir o player a partir do Início, nada da Home (backdrop, fundo, cards) DEVE pintar sobre o vídeo.
- **FR-028**: Na TV física, se a expansão animada não for fluida, o card DEVE trocar de tamanho sem animação de largura; o restante do comportamento não muda.

### Key Entities *(include if feature involves data)*

- **Título do billboard**: o item escolhido pela regra da 026, com a ação primária (retomar ou abrir detalhe) e o progresso.
- **Card de título**: identidade lógica, nome, pôster, categoria, ano, duração/temporadas, nota do provedor, data de inclusão na fonte, estado do usuário (assistido, favorito, progresso).
- **Imagem 16:9 (backdrop)**: do cache de metadata ou guardada das respostas TMDB já recebidas; sempre opcional.
- **Cor da capa**: valor derivado e efêmero, com fallback neutro (reuso da 059).
- **Semente de "Porque você assistiu"**: o último título concluído (por tipo, quando a tela é de um tipo) e seus semelhantes casados com a lista.
- **Canal ao vivo**: canal favorito, programa atual e horários do EPG, quando houver.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das aberturas testadas (com/sem título para continuar, com/sem backdrop), o billboard não tem área vazia nem texto ilegível.
- **SC-002**: Os cards de título ocupam 250 × 375 e o card focado 667 × 375 em 100% das fileiras de títulos.
- **SC-003**: 0 ocorrências de barra de progresso ou "faltam" sem posição salva e duração conhecidas.
- **SC-004**: 0 consultas externas ou reproduções disparadas por foco (verificado por teste automatizado).
- **SC-005**: Do billboard, a primeira fileira é alcançada com 1 ↓, e a volta de um detalhe reabre a Home no card de origem em 100% dos casos testados.
- **SC-006**: Nenhum estado da Home deixa o controle remoto sem elemento focável.
- **SC-007**: A ação primária fica focável em até 1 s com o catálogo local, como antes, com ou sem fundo/cor resolvidos.
- **SC-008**: 0 fileiras "Em breve" de "Porque você assistiu" em Filmes e Séries; com semente e chave, a fileira aparece nas três telas.
- **SC-009**: Validação na TV física (QN50Q60DAGXZD) aprovada — foco, fluidez da expansão e da troca de fundo com seta segurada, legibilidade e rolagem — **gate para fechar a feature**.

## Assumptions

- O billboard pode obter a metadata do seu título ao abrir a Home (a mesma consulta que o detalhe faz), nunca ao focar; os cards só usam metadata já no aparelho.
- "Recente" para o selo `NOVO` = data de inclusão na fonte nos últimos 7 dias pelo relógio do aparelho; as fileiras "adicionados" listam os mais novos sem janela fixa (regra da 052).
- A busca de semelhantes da semente é a mesma da aba Semelhantes (035) e respeita a chave BYOK e o cache existentes.
- A lógica de cor da capa e a regra de capa "sem risco" vêm da 059 e são reaproveitadas, não reescritas.
- O contrato travado da 026 (hero "Continuar" no primeiro foco, OK retoma, fechar o player devolve o foco) continua valendo e deve passar sem edição.
- Os contratos travados da 053 sobre o slot "Porque você assistiu" **serão emendados** (decisão do usuário), preservando o resto: ordem das fileiras, foco lembrado por fileira e por id, categorias e a subida à topbar.
- As fileiras hoje assumem largura fixa de card (`Rail` virtualizado); suportar o card expandido é decisão do `sdd-plan`.
- Pacote G3 do backlog: os itens 69 e 32 saem das Ideias Futuras ao final; 30, 31 e 54 continuam lá.

## Clarifications

### Sessão 2026-10-05

- Q: Qual layout? → A: Variação B "Vitrine expandida" das três propostas (A Cinema, B Vitrine expandida, C Hub IPTV), já aplicada ao protótipo e à Spec V14.
- Q: Absorver os itens 69 ("Porque você assistiu") e 32 (Trailer no herói) do G3? → A: Sim, os dois — "Porque você assistiu" na Home e em Filmes/Séries; Trailer real no billboard.
- Q: As fileiras "Dica de filme"/"Dica de série" (057), ausentes do protótipo, ficam? → A: Ficam, com o novo card.
- Q: Classificação indicativa e nota TMDB entram? → A: Não — fora, como na 059; viram ideia nova.
- Q: Onde fica o dock? → A: No canto do billboard, como no protótipo e na Spec.
- Q: Sem backdrop no aparelho, o que o card expandido e o fundo mostram? → A: Pôster + cor da capa (lógica da 059); fundo usa a mesma cor.
- Q: Guardar o backdrop que já chega nas respostas do TMDB da Home? → A: Sim, sem consulta nova.
- Q: Como fatiar? → A: P1 billboard e fundo → P2 cards e expansão → P3 fileiras novas e Trailer.
- Q: Se a expansão ficar lenta na TV? → A: Expandir sem animar a largura.
- Q: Semente do "Porque você assistiu"? → A: Último título concluído (na Home, qualquer tipo; em Filmes/Séries, o do tipo da tela).
- Q: "Adicionados recentemente" mistura filmes e séries? → A: Duas fileiras. Posição (decisão de agrupamento seguindo a ordem escolhida): "Filmes adicionados" no bloco de filmes e "Séries adicionadas" no de séries.
- Q: Ordem das fileiras? → A: Continuar · Em alta Filmes · Adicionados · Dica de filme · Porque você assistiu · Ao vivo agora · Minha Lista · Em alta Séries · Dica de série · Curadoria IA (com as duas fileiras de adicionados conforme o item anterior).
- Q: TV física é gate? → A: Sim.
- Q: Emendar os contratos travados da 053 (slot "Porque você assistiu")? → A: Autorizado, como a 057 fez com o Top 10; exceção registrada no plano da 060 e da 053.
