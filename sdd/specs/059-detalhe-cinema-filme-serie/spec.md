# Feature Specification: Detalhe de filme e de série no layout Cinema do Design System

**Slug**: `059-detalhe-cinema-filme-serie`

**Created**: 2026-10-05

**Status**: Convergida

**Input**: "quero deixar o design system da página de detalhe do filme mais rico e visualmente atraente … aumentar a capa do filme" → três variações avaliadas, escolhida a **A ("Cinema")** com os ícones da variação C e Semelhantes em duas linhas, aplicada a **filme e série** (sessão de 2026-10-05). **Substitui a `051-detalhe-filme-paridade-v14`**, que nunca foi executada (0/31 tasks) e cujo escopo (só filme, só visual, "capa grande" = backdrop) não corresponde mais à decisão.

**Referências normativas**: Spec V14, seção "Detalhe de filme e de série (layout "Cinema", revisão 2026-10-05)"; função `details()` do protótipo `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html`. Registro das alternativas descartadas: `docs/design/design-system/propostas/detalhe-filme-variacoes.html`. Precedência do ADR-011 (constitution > ADRs > Spec V14 > Component Lab > protótipo).

## Escopo

### Incluído

- **Hero "Cinema"** no detalhe de filme e no de série: backdrop em tela cheia escurecido à esquerda e embaixo; **capa grande** (mínimo 400 × 600 no palco 1920 × 1080) com brilho na cor dela; rótulo `FILME`/`SÉRIE`, título, linha de metadata, chips, sinopse e ações.
- **Fundo sem backdrop**: cor dominante da capa; quando ela não puder ser obtida, gradiente neutro do tema.
- **Chips**: a categoria da lista num chip próprio e destacado; gêneros em chips separados, com a origem do dado (fonte ou TMDB).
- **Ação primária com progresso real**: "Continuar de 42:10" (filme) / "Continuar T1:E3" (série) com barra e "faltam X" dentro do botão, só quando há posição salva **e** duração conhecida.
- **Ações secundárias em ícones redondos** com o rótulo visível só no foco — filme: Reiniciar, Minha Lista, Trailer, Semelhantes, Marcar/Desmarcar assistido, Remover do histórico; série: Minha Lista, Trailer, Semelhantes, Remover do histórico. Mesmas condições de existência de hoje.
- **Abas abaixo do hero**, visíveis no rodapé da primeira tela — filme: Detalhes, Elenco, Semelhantes; série: Episódios, Detalhes, Elenco, Semelhantes.
- **Detalhes** em cartões, cada um com a origem do dado; **Elenco** com foto redonda (iniciais sem foto); **Semelhantes** em duas linhas: "Na sua lista" e "Não encontrados na sua lista", com a cobertura da busca.
- **Navegação por linhas**: ações ↔ aba ativa ↔ painel, voltando à última ação focada; o hero e as abas devolvem a página ao topo.
- **Emenda autorizada do contrato travado da 035** (navegação e selos da aba Semelhantes), registrada como exceção.
- Marcar a 051 como "Substituída pela 059".

### Fora de Escopo

- Novos dados ou novas consultas externas: tudo vem de campos que o app já obtém (catálogo, metadata TMDB, estado do usuário, episódios).
- Relevância %, qualidade/áudio (4K, 5.1), classificação indicativa, selo editorial ou qualquer conteúdo inventado do protótipo (ADR-011).
- Prévia de trailer ou de vídeo ao focar (constitution).
- Topbar no detalhe (continua sem, como desde a 025).
- Página do ator (`PersonScreen`), modal de resumo do TMDB, modal de sinopse completa, modal de remoção do histórico, seletor de temporada e player: só são abertos a partir daqui, sem mudar.
- Lógica de casamento "Na sua lista" e de cobertura (feature 035) — só a apresentação muda.
- Animações de entrada, parallax ou blur pesado no fundo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hero Cinema no detalhe do filme (Priority: P1)

Ao abrir um filme, a pessoa vê a capa grande ao lado do título sobre o backdrop, entende de cara a categoria e os gêneros, e retoma o filme com um OK vendo quanto falta. As outras ações ficam em ícones compactos, com o nome aparecendo ao focar.

**Why this priority**: é o pedido original ("aumentar a capa") e a primeira impressão do detalhe; sozinha já entrega o novo visual no tipo de conteúdo mais aberto.

**Independent Test**: abrir filmes com e sem backdrop, com e sem posição salva, com e sem duração conhecida; navegar pelas ações com o controle e acionar cada uma.

**Acceptance Scenarios**:

1. **Given** um filme com backdrop, **When** o detalhe abre, **Then** o backdrop ocupa a tela, a capa aparece com no mínimo 400 × 600 e o texto continua legível.
2. **Given** um filme sem backdrop, **When** o detalhe abre, **Then** o fundo usa a cor da capa; se ela não puder ser obtida, um gradiente neutro — nunca área vazia nem imagem inventada.
3. **Given** posição salva e duração conhecida, **When** o detalhe abre, **Then** o foco está no botão "Continuar de <tempo>", que mostra a barra e "faltam <tempo>".
4. **Given** posição salva mas duração desconhecida, **When** o detalhe abre, **Then** o botão diz "Continuar de <tempo>" sem barra nem "faltam".
5. **Given** o foco num ícone secundário, **When** ele recebe o foco, **Then** o rótulo da ação aparece; ao sair, some; OK executa a mesma ação de hoje.
6. **Given** a categoria da lista e gêneros conhecidos, **When** o detalhe abre, **Then** a categoria aparece num chip próprio, distinto dos gêneros, e os gêneros indicam a origem.

---

### User Story 2 - O mesmo hero no detalhe da série (Priority: P2)

Ao abrir uma série, a pessoa vê o mesmo hero do filme e continua o episódio certo vendo quanto falta dele.

**Why this priority**: consistência entre os dois detalhes; reaproveita a P1 e dá à série a barra de progresso que ela ainda não tem no topo.

**Independent Test**: abrir séries com e sem episódio em andamento, com e sem duração do episódio; navegar pelas ações.

**Acceptance Scenarios**:

1. **Given** uma série com episódio em andamento e duração conhecida, **When** o detalhe abre, **Then** o foco está em "Continuar T<n>:E<n>" com barra e "faltam <tempo>" daquele episódio.
2. **Given** uma série sem nada assistido, **When** o detalhe abre, **Then** a primária é a de hoje (assistir o episódio indicado), sem barra.
3. **Given** a série no Histórico, **When** a pessoa percorre os ícones, **Then** encontra Minha Lista, Trailer, Semelhantes e Remover do histórico — sem Reiniciar nem Marcar assistido.

---

### User Story 3 - Abas renovadas e Semelhantes em duas linhas (Priority: P3)

Abaixo do hero, a pessoa troca entre as abas; em Semelhantes, vê separado o que já pode assistir ("Na sua lista") do que só o TMDB conhece ("Não encontrados na sua lista").

**Why this priority**: enriquece a descoberta, mas o detalhe já é útil sem ela.

**Independent Test**: em filme e série, percorrer Detalhes, Elenco e Semelhantes (e Episódios na série), com e sem chave TMDB, com listas cheias e vazias.

**Acceptance Scenarios**:

1. **Given** o detalhe aberto, **When** a pessoa olha a primeira tela, **Then** a linha de abas já está visível no rodapé.
2. **Given** a aba Detalhes, **When** ela abre, **Then** os dados aparecem em cartões, cada um com a origem (TMDB ou fonte); campos sem valor não aparecem.
3. **Given** a aba Elenco com pessoas do TMDB, **When** ela abre, **Then** cada pessoa tem foto redonda (ou iniciais), nome e personagem; OK abre a página do ator.
4. **Given** semelhantes encontrados e não encontrados, **When** a aba abre, **Then** há duas linhas tituladas; OK num da primeira abre o detalhe do item, OK num da segunda abre o resumo, sem reproduzir.
5. **Given** nenhum semelhante na lista, **When** a aba abre, **Then** a primeira linha mostra uma frase não focável e a segunda continua navegável.
6. **Given** o foco na primeira linha do painel, **When** a pessoa aperta ↑, **Then** o foco vai para a aba ativa; mais um ↑ volta à última ação focada.
7. **Given** a ação "Semelhantes" do hero, **When** a pessoa aperta OK, **Then** a aba Semelhantes abre com o foco no primeiro título.

---

### Edge Cases

- Capa ausente ou quebrada: a área da capa mostra o placeholder atual (iniciais/arte de fallback), e o fundo cai no gradiente neutro.
- Imagem da capa de outro domínio que não permite ler a cor: fundo neutro, sem erro visível nem no log com URL.
- Título muito longo: quebra em no máximo duas linhas, sem empurrar as ações para fora do hero.
- Trailer em "consultando" ou "indisponível": o ícone fica no estado soft-disabled de hoje, com o rótulo do estado no foco.
- Filme assistido com posição salva: "Assistido" e a retomada coexistem como hoje.
- Remover do histórico: a confirmação atual abre; depois, o ícone some e o foco cai numa ação vizinha.
- Semelhantes sem chave / sem casamento / indisponível / carregando: os estados de hoje, sempre com algo focável ou o foco na aba.
- Lista "Na sua lista" e "Não encontrados" muito longas: rolagem horizontal pelo foco, sem renderizar tudo de uma vez se já não for assim hoje.
- Voltar de Semelhantes/Elenco/Configurações: restaura aba e item por identidade.
- Player aberto a partir do detalhe: o backdrop e o fundo somem junto com a tela (plano de hardware), sem pintar sobre o vídeo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O detalhe de filme e o de série DEVEM exibir o backdrop em tela cheia, escurecido para manter o texto legível.
- **FR-002**: Sem backdrop, o fundo DEVE usar a cor dominante da capa; se ela não puder ser obtida, um gradiente neutro do tema. A obtenção da cor NUNCA DEVE bloquear a tela nem a ação primária.
- **FR-003**: A capa DEVE ter no mínimo 400 × 600 no palco 1920 × 1080, com brilho na cor da capa (ou neutro).
- **FR-004**: A categoria da lista DEVE aparecer num chip próprio, visualmente distinto dos gêneros; gêneros externos NUNCA DEVEM substituí-la (constitution).
- **FR-005**: Gêneros, duração, direção, país e demais dados descritivos DEVEM indicar a origem (fonte ou TMDB), como hoje.
- **FR-006**: A ação primária DEVE ser o primeiro foco ao abrir a tela.
- **FR-007**: Com posição salva **e** duração conhecida, a ação primária DEVE mostrar barra de progresso e o tempo restante; sem um dos dois, NÃO DEVE mostrar barra, percentual nem tempo restante.
- **FR-008**: As ações secundárias DEVEM ser botões de ícone com nome acessível sempre presente e rótulo visível só no foco.
- **FR-009**: O conjunto e a ordem das ações DEVEM ser — filme: primária, Reiniciar (só com retomada), Minha Lista, Trailer, Semelhantes, Marcar/Desmarcar assistido, Remover do histórico (só no Histórico, sempre por último); série: primária, Minha Lista, Trailer, Semelhantes, Remover do histórico (só no Histórico).
- **FR-010**: O comportamento de cada ação (reproduzir, retomar, reiniciar, favoritar, trailer, assistido, remover do histórico) DEVE ser o de hoje.
- **FR-011**: A linha de abas DEVE estar visível na primeira tela sem rolar; filme: Detalhes, Elenco, Semelhantes; série: Episódios, Detalhes, Elenco, Semelhantes.
- **FR-012**: A aba Detalhes DEVE mostrar os dados em cartões com a origem de cada um, omitindo campos sem valor.
- **FR-013**: A aba Elenco DEVE mostrar foto redonda (ou iniciais), nome e personagem quando houver; OK abre a página do ator.
- **FR-014**: A aba Semelhantes DEVE separar os títulos em duas linhas tituladas — "Na sua lista" e "Não encontrados na sua lista" — mantendo a cobertura da busca; os cartões não levam selo individual, mas o nome acessível dos não encontrados DEVE dizer que não estão na lista.
- **FR-015**: Sem títulos na primeira linha, ela DEVE mostrar uma frase não focável e a segunda continuar navegável; sem títulos em nenhuma, valem os estados atuais.
- **FR-016**: A navegação DEVE seguir linhas: ↓ nas ações → aba ativa; ↑ nas abas → última ação focada; ↑ na primeira linha do painel → aba ativa; ↓/↑ entre as duas linhas de Semelhantes; ←/→ dentro de cada linha, parando nas pontas.
- **FR-017**: Focar o hero ou as abas DEVE devolver a página ao topo.
- **FR-018**: A ação "Semelhantes" do hero DEVE abrir a aba Semelhantes com o foco no primeiro título disponível.
- **FR-019**: Voltar de Semelhantes, Elenco ou Configurações DEVE restaurar aba e item por identidade.
- **FR-020**: Todo estado (carregando, vazio, erro, sem chave) DEVE ter ao menos um elemento focável ou manter o foco na aba.
- **FR-021**: Focar qualquer elemento NUNCA DEVE iniciar reprodução nem consulta externa.
- **FR-022**: Nenhum valor visual fixo: cores, raios, espaçamentos, tamanhos e tempos vêm dos tokens V14.
- **FR-023**: Todo texto novo DEVE existir em pt, en e es no catálogo de idioma; nomes de títulos, categorias e pessoas não são traduzidos.
- **FR-024**: Credenciais, chaves e qualquer URL que possa carregar credencial NUNCA DEVEM aparecer em log, erro ou interface (inclusive numa falha ao ler a cor da capa). A cor só é lida de capa "sem risco" — http(s), sem usuário/senha, sem query string e fora do domínio de qualquer painel cadastrado; as demais ficam no fundo neutro, sem requisição. *(Emendado em 2026-10-05: o navegador escreve sozinho no console a URL de uma imagem cujo servidor recusa CORS; isso só pode acontecer com capa pública.)*
- **FR-025**: Ao abrir o player a partir do detalhe, nada do detalhe (backdrop, fundo de cor, brilho) DEVE pintar sobre o vídeo.

### Key Entities *(include if feature involves data)*

- **Título do catálogo** (filme ou série): identidade lógica, nome, capa, categoria da lista, ano, nota do provedor.
- **Metadata descritiva**: backdrop, sinopse, gêneros, duração, direção, país, elenco — cada campo com origem (fonte ou TMDB).
- **Estado do usuário**: posição salva, assistido, favorito, presença no Histórico (filme; e por episódio na série).
- **Episódio** (série): código T/E, duração, posição salva.
- **Título semelhante**: dados TMDB e a correspondência opcional com um item do catálogo.
- **Cor da capa**: valor derivado da capa, efêmero, com fallback neutro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos títulos testados (com/sem backdrop, com/sem capa), o hero não tem área vazia nem texto ilegível.
- **SC-002**: A capa ocupa no mínimo 400 × 600 do palco em 100% dos casos com capa.
- **SC-003**: 0 ocorrências de barra de progresso ou "faltam" sem posição salva e duração conhecidas.
- **SC-004**: Do foco inicial, qualquer ação secundária é alcançada em no máximo 6 apertos de seta, e a linha de abas em 1 aperto de ↓.
- **SC-005**: 100% dos semelhantes encontrados ficam na linha "Na sua lista" e 0% dos não encontrados.
- **SC-006**: Nenhum estado do detalhe deixa o controle remoto sem elemento focável.
- **SC-007**: Abrir o detalhe não fica perceptivelmente mais lento que antes: a ação primária fica focável em até 1 s com o catálogo local, com ou sem a cor da capa resolvida.
- **SC-008**: Validação na TV física (QN50Q60DAGXZD) aprovada: legibilidade, foco, rolagem e fluidez com backdrop e brilho — **gate para fechar a feature**.

## Assumptions

- Todos os dados exibidos já são obtidos hoje (catálogo, metadata 032/055, Semelhantes/Elenco 035, estado do usuário 019/036, episódios); a feature não cria fontes nem consultas novas.
- A duração do filme vem da metadata (fonte ou TMDB); a do episódio, do próprio episódio.
- A ausência de topbar no detalhe (desde a 025) continua; a navegação "↑ nas ações" não leva a lugar nenhum além do próprio hero.
- Os contratos travados das features 032 e 033 (texto "▶ Assistir" no primeiro foco, "Ver mais", estados textuais do Trailer no botão focado) continuam valendo e devem passar sem edição.
- O contrato travado da 035 para Semelhantes **será emendado** (decisão do usuário), preservando as garantias que não mudam: abrir o detalhe do encontrado com snapshot, resumo do não encontrado sem reprodução, foco devolvido ao cartão, restauração por identidade, estados sem chave/sem casamento e cobertura.
- Armadilhas herdadas do handoff da 051: `.vod-detail*` é compartilhado entre filme e série (aqui isso é desejado); o backdrop é imagem filha do hero e some com o plano de hardware do player; chaves de foco/identidade dos cartões de pessoa e semelhante são usadas pela rolagem e pela restauração.

## Clarifications

### Sessão 2026-10-05

- Q: Qual layout? → A: Variação A "Cinema" das três propostas (A Cinema, B Pôster herói, C Painel Prime), com os ícones redondos da C no lugar dos botões em pílula e Semelhantes em duas linhas.
- Q: Só filme ou também série? → A: Filme e série, com o mesmo hero; as abas da série mantêm Episódios.
- Q: O que fazer com a 051? → A: Criar esta feature nova e marcar a 051 como "Substituída pela 059", sem apagar.
- Q: Semelhantes em duas linhas conflita com o contrato travado da 035 (→ do encontrado para o não encontrado). Como resolver? → A: Emendar o contrato da 035 — exceção autorizada pelo usuário, registrada no plano das duas features; → para no fim de cada linha.
- Q: Sem backdrop, qual fundo? → A: Cor dominante da capa, com gradiente neutro quando a cor não puder ser obtida.
- Q: TV física é gate? → A: Sim — a feature só fecha depois da passada na QN50Q60DAGXZD.
- Q: Como fatiar? → A: P1 hero do filme → P2 hero da série → P3 abas renovadas.
- Q: Cartões de Semelhantes mantêm selo individual? → A: Não — só o título de cada linha; o nome acessível dos não encontrados continua dizendo que não estão na lista.
- Q: (achado no E2E do sdd-execute) Ler a cor pede a capa em modo CORS, e o navegador escreve a URL no console quando o servidor recusa — conflita com FR-024. Como resolver? → A: Só capas sem risco (http(s), sem usuário/senha, sem query, fora do domínio do painel); FR-024 emendado para "URL que possa carregar credencial".
