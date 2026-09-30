# Feature Specification: EPG — Guia Completo em Tela Cheia

**Slug**: `031-epg-guia-completo`

**Created**: 2026-09-28

**Status**: Convergida

**Input**: Item 42 do backlog, incremento 42c — entrega #5 da tabela
"Próximas entregas": "Guia completo (§26): grade em tela cheia com coluna de
canal, timeline horizontal com largura proporcional, marcador 'Agora',
Hoje/Amanhã, linha de hora atual, componentes `.no-scale`, RETURN ao
canal/programa de origem (§41). Remove `epg-guide`." Depende da feature
`030-epg-dados-agora` (dados de programação guardados no aparelho).

## Escopo

### Incluído

- **Guia completo em tela cheia** (§26): coluna de canais (número, logo,
  nome) à esquerda, timeline horizontal no topo, programas como blocos de
  largura proporcional à duração, marcador explícito do programa em exibição
  ("Agora"), linha vertical da hora atual, abas "Hoje"/"Amanhã".
- Painel de detalhe no topo do guia que acompanha o foco: título, horário
  início–fim, estado "Agora" quando aplicável, sinopse quando existir, canal.
- **Duas entradas**, ambas hoje mock (`epg-guide`):
  - botão "Guia completo" do preview da Live TV;
  - botão "Guia" do chrome do player Live (feature 027).
  Remove `epg-guide` de `comingSoon.ts`.
- **Canais exibidos = a lista de origem** (categoria, "★ Favoritos" ou
  "Todos") de onde o guia foi aberto, com **seletor de categoria** no topo
  (Modal com "★ Favoritos", "Todos" e as categorias da fonte); escolher uma
  categoria obtém seus canais sob demanda, pelo mesmo caminho da Live TV
  (feature 010/014).
- Navegação: ←/→ um programa por vez (timeline rola junto, ~2 h visíveis);
  ↑/↓ troca de canal mantendo a hora focada; CH± pagina canais; abas
  Hoje/Amanhã saltam para "agora" / início de amanhã.
- Programas já encerrados visíveis **esmaecidos** até o início da janela
  guardada, sem ação de OK.
- **OK** sobre programa atual ou futuro, ou sobre a linha de canal sem EPG:
  assiste o canal em tela cheia; a vizinhança de zapping (↑/↓/CH± no player)
  passa a ser a lista exibida no guia.
- Canal sem EPG: linha com **um bloco neutro focável** "Sem programação",
  de largura total, para o foco não pular a linha e OK ainda assistir.
- Aberto do player: **a sessão continua tocando** atrás do guia (opaco),
  como no zapping (feature 016); RETURN volta ao vídeo sem reabrir sessão;
  escolher outro canal troca a sessão.
- **RETURN** restaura a origem (§41): aberto do preview, volta à Live TV com
  foco no canal de origem (ou no canal escolhido no guia, se a pessoa
  assistiu outro e voltou); aberto do player, volta ao player.
- Componentes do guia usam `.no-scale` (§26.2): foco sem `scale`, mantendo a
  receita de borda/halo.
- Virtualização em ambos os eixos (muitos canais × muitos programas) sem
  travar a navegação.

### Fora de Escopo

- Qualquer mudança na obtenção/armazenamento/configuração do EPG — é da
  feature 030.
- Entrada global "Guia" na topbar ou na Home (mudaria o shell da ADR-011).
- Catch-up/Timeshift de programa passado (item 43), lembretes, gravação,
  busca por programa, filtro por gênero.
- Dias além de "Amanhã" (o §26.3 cita "próximo dia útil"; a janela guardada
  pela 030 vai só até +48 h).
- Modal de detalhe de programa (o detalhe fica no painel do topo).
- Pré-visualização de vídeo no foco (ADR-011, constitution).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir o guia e ver a grade de programação (Priority: P1)

Na Live TV, com um canal focado, a pessoa escolhe "Guia completo" e vê a
grade da lista em que estava: canais à esquerda, programas ao longo do tempo,
o programa atual marcado e uma linha na hora atual. O foco começa no programa
em exibição do canal de origem. RETURN volta à Live TV no mesmo canal.

**Why this priority**: é o guia em si; sem ele não há feature. Inclui
entrada, grade, foco inicial e saída.

**Independent Test**: com EPG de teste sincronizado, abrir o guia a partir
do preview, conferir blocos proporcionais, marcador "Agora", linha da hora,
foco inicial no programa atual do canal de origem, e RETURN restaurando o
foco na Live TV.

**Acceptance Scenarios**:

1. **Given** um canal focado na Live TV de uma fonte com EPG, **When** a
   pessoa aciona "Guia completo", **Then** o guia abre em tela cheia com os
   canais da mesma lista, a timeline posicionada em "agora", e o foco no
   programa em exibição do canal de origem.
2. **Given** o guia aberto, **When** exibido, **Then** cada programa ocupa
   largura proporcional à duração, o programa em exibição de cada canal tem
   marcador "Agora" e uma linha vertical marca a hora atual, avançando com o
   tempo.
3. **Given** um canal sem EPG na lista, **When** exibido, **Then** sua linha
   tem um único bloco focável "Sem programação".
4. **Given** o guia aberto a partir do preview, **When** a pessoa pressiona
   RETURN, **Then** volta à Live TV com foco e rolagem no canal de origem.
5. **Given** a fonte ativa com EPG desativado ou não configurado, **When** a
   pessoa aciona "Guia completo", **Then** o guia abre com a orientação de
   que não há programação e uma ação focável para ir às Configurações de EPG
   da fonte — nunca uma grade vazia sem saída.

---

### User Story 2 - Navegar no tempo e assistir pelo guia (Priority: P1)

A pessoa percorre a grade com as setas: ←/→ programa a programa, ↑/↓ entre
canais mantendo a hora, abas Hoje/Amanhã para saltar de dia. O painel do
topo mostra o detalhe do programa focado. OK num programa atual ou futuro
abre o canal em tela cheia.

**Why this priority**: um guia que só mostra o agora não cumpre o §26; e
assistir a partir dele é a ação principal.

**Independent Test**: navegar da hora atual até amanhã, conferir o painel
de detalhe, dar OK num programa futuro e ver o canal tocar; ↑/↓ no player
percorre a lista do guia.

**Acceptance Scenarios**:

1. **Given** foco num programa, **When** ←/→, **Then** o foco vai ao
   programa anterior/seguinte do mesmo canal e a timeline rola para mantê-lo
   visível.
2. **Given** foco num programa às 21:10, **When** ↓, **Then** o foco vai ao
   programa do canal de baixo que cobre 21:10 (ou o mais próximo, se houver
   lacuna).
3. **Given** o guia, **When** a pessoa aciona "Amanhã", **Then** a timeline
   salta para o início de amanhã e o foco vai ao primeiro programa desse
   horário no canal focado; "Hoje" volta a "agora".
4. **Given** foco num programa, **When** o foco muda, **Then** o painel do
   topo mostra título, horário, "Agora" quando aplicável, sinopse quando
   existir e o nome do canal — sem requisição de rede.
5. **Given** foco num programa atual ou futuro (ou no bloco "Sem
   programação"), **When** OK, **Then** o canal abre em tela cheia e ↑/↓/CH±
   no player percorrem os canais da lista exibida no guia.
6. **Given** foco num programa já encerrado (esmaecido), **When** OK,
   **Then** nada acontece além de um retorno discreto de "indisponível" —
   nunca abre um canal fingindo ser o programa passado.
7. **Given** a timeline, **When** a pessoa volta no tempo, **Then** pode ir
   até o início da janela guardada, não além.

---

### User Story 3 - Guia a partir do player, sem parar o canal (Priority: P2)

Assistindo a um canal em tela cheia, a pessoa aciona "Guia" no chrome. O
guia abre por cima, o áudio continua. RETURN volta ao vídeo na hora; escolher
outro canal troca a reprodução.

**Why this priority**: é a segunda entrada e remove o mock do chrome, mas a
US1/US2 já entregam o guia completo pela Live TV.

**Independent Test**: tocar um canal, abrir o Guia pelo chrome, conferir que
o áudio segue, RETURN volta ao vídeo sem reabrir sessão; abrir de novo,
escolher outro canal e conferir a troca.

**Acceptance Scenarios**:

1. **Given** um canal tocando, **When** a pessoa aciona "Guia" no chrome,
   **Then** o guia abre com foco no programa atual desse canal e a sessão
   continua tocando.
2. **Given** o guia aberto do player, **When** RETURN, **Then** volta ao
   vídeo do mesmo canal sem reabrir a sessão.
3. **Given** o guia aberto do player, **When** OK noutro canal, **Then** a
   reprodução troca para ele e o guia só fecha quando o novo canal estiver
   tocando (mesma regra sem quadro preto da feature 016).

---

### User Story 4 - Trocar de lista dentro do guia (Priority: P3)

No topo do guia, um seletor permite escolher outra lista — "★ Favoritos",
"Todos" ou uma categoria da fonte — sem sair do guia.

**Why this priority**: conveniência; dá para trocar de categoria saindo do
guia.

**Independent Test**: abrir o seletor, escolher uma categoria nunca aberta e
ver os canais dela carregarem no guia com estado de carregamento focável.

**Acceptance Scenarios**:

1. **Given** o guia, **When** a pessoa aciona o seletor de categoria,
   **Then** abre um Modal com "★ Favoritos", "Todos" e as categorias da
   fonte, com foco na lista atual.
2. **Given** uma categoria escolhida que ainda não tem canais no aparelho,
   **When** confirmada, **Then** o guia mostra carregamento com elemento
   focável e depois a grade dela; em falha, erro com "Tentar de novo"
   focável.
3. **Given** "Todos" escolhido, **When** exibido, **Then** o guia informa
   quantas categorias ele cobre ("X de Y categorias"), como a Live TV já faz
   (feature 018).

---

### Edge Cases

- Programa muito curto (poucos minutos): bloco com largura mínima legível e
  focável, sem sobrepor o vizinho; o título pode truncar, o painel do topo
  mostra completo.
- Programa que começa antes da janela visível ou termina depois: bloco
  cortado na borda, foco nele mantém o painel com o horário real.
- Lacuna na programação de um canal: espaço vazio não focável; ←/→ salta
  para o próximo programa.
- Hora atual cruza a meia-noite com o guia aberto: aba ativa passa a
  refletir o novo "hoje" sem perder o foco.
- Programa em exibição termina com o guia aberto: marcador "Agora" e linha
  da hora avançam; o programa que acabou passa a esmaecido.
- EPG da fonte sincronizado enquanto o guia está aberto: grade atualiza sem
  perder o foco (reconciliado pelo canal + horário, não por índice).
- Deslocamento de horário mudado em Configurações: vale no próximo abrir do
  guia.
- Lista com centenas de canais: rolagem vertical virtualizada, sem
  congelar; segurar ↓ atravessa a lista.
- Lista vazia (ex.: "★ Favoritos" sem favoritos): estado vazio com ação
  focável (abrir seletor de categoria), nunca foco preso.
- Canal indisponível (sem fonte de reprodução): linha esmaecida com selo
  "Indisponível", OK sem efeito além do aviso — mesmo padrão da Live TV.
- Guia aberto do player e sessão falha: segue o tratamento de erro do
  `PlayerLayer`; o guia não esconde o erro.
- Todo horário exibido respeita o deslocamento da fonte (feature 030,
  FR-014/FR-020).

## Requirements *(mandatory)*

### Functional Requirements

**Estrutura (§26.1/§26.2)**

- **FR-001**: O guia DEVE ocupar a tela inteira, com coluna fixa de canais
  (número, logo, nome), timeline horizontal com marcas de hora, e programas
  como blocos de largura proporcional à duração.
- **FR-002**: O programa em exibição de cada canal DEVE ter marcador "Agora"
  explícito, e uma linha vertical DEVE marcar a hora atual, avançando com o
  tempo (no máximo 1 minuto de atraso).
- **FR-003**: Programas encerrados DEVEM aparecer esmaecidos; a timeline
  DEVE permitir voltar até o início da janela guardada e avançar até o fim
  dela, nunca além.
- **FR-004**: O guia DEVE ter abas "Hoje" e "Amanhã"; a aba ativa reflete o
  dia da hora focada.
- **FR-005**: Os elementos focáveis do guia DEVEM usar `.no-scale`: foco
  visível pela receita de borda/halo, sem `scale`.
- **FR-006**: Um painel no topo DEVE mostrar, para o bloco focado: título,
  horário início–fim, "Agora" quando aplicável, sinopse quando existir e o
  nome do canal.
- **FR-007**: Canal sem EPG DEVE ter uma linha com um único bloco focável
  "Sem programação" de largura total; canal indisponível segue o padrão
  visual da Live TV ("Indisponível").
- **FR-008**: Todo texto de programa DEVE vir da programação guardada (feature
  030); nenhum título, horário ou sinopse inventado.

**Entradas e saída**

- **FR-009**: O botão "Guia completo" do preview da Live TV DEVE abrir o guia
  com os canais da lista de origem e foco no programa em exibição do canal
  de origem (ou no bloco "Sem programação").
- **FR-010**: O botão "Guia" do chrome do player Live DEVE abrir o guia sem
  encerrar a sessão em reprodução, com foco no programa atual do canal
  tocando, e com a lista de canais da vizinhança de zapping vigente.
- **FR-011**: O mock `epg-guide` DEVE ser removido de `comingSoon.ts`; os
  dois botões deixam de ser soft disabled.
- **FR-012**: RETURN no guia aberto do preview DEVE voltar à Live TV com
  foco e rolagem no canal de origem, reconciliado por id; RETURN no guia
  aberto do player DEVE voltar ao vídeo sem reabrir a sessão.
- **FR-013**: Sem programação disponível para a fonte (EPG não configurado,
  desativado ou nunca sincronizado), o guia DEVE abrir com uma explicação e
  uma ação focável que leva ao painel de EPG da fonte em Configurações
  (feature 030).

**Navegação (§26.2, §41)**

- **FR-014**: ←/→ DEVEM mover o foco ao programa anterior/seguinte do mesmo
  canal, pulando lacunas, rolando a timeline para mantê-lo visível (~2 h de
  janela visível).
- **FR-015**: ↑/↓ DEVEM mover o foco ao canal vizinho, no bloco que cobre o
  horário de referência do foco atual (ou o mais próximo, em lacuna); CH±
  DEVEM paginar canais.
- **FR-016**: As abas Hoje/Amanhã DEVEM levar o foco ao programa que cobre
  "agora" (Hoje) ou o início de amanhã (Amanhã) no canal focado.
- **FR-017**: A grade DEVE ser virtualizada nos dois eixos; segurar uma seta
  não pode congelar a interface nem disparar rede.
- **FR-018**: Mover o foco NUNCA DEVE iniciar reprodução nem requisição de
  rede (constitution).
- **FR-019**: Todo estado do guia (carregando, vazio, sem EPG, erro) DEVE ter
  pelo menos um elemento focável.

**Assistir**

- **FR-020**: OK sobre programa atual ou futuro, ou sobre "Sem programação",
  DEVE assistir o canal em tela cheia; a vizinhança de zapping do player
  passa a ser a lista exibida no guia.
- **FR-021**: OK sobre programa encerrado DEVE apenas dar retorno discreto
  de indisponível, sem abrir reprodução.
- **FR-022**: Com o guia aberto do player, OK noutro canal DEVE trocar a
  sessão e fechar o guia só quando o novo canal estiver tocando (feature
  016).

**Seletor de lista**

- **FR-023**: O topo do guia DEVE ter um seletor que abre um `Modal` com
  "★ Favoritos", "Todos" e as categorias da fonte, com foco na lista atual.
- **FR-024**: Escolher uma categoria sem canais no aparelho DEVE obtê-los
  pelo mesmo caminho sob demanda da Live TV (features 010/014), com estados
  de carregamento e erro focáveis.
- **FR-025**: Em "Todos", o guia DEVE informar a cobertura ("X de Y
  categorias"), como a Live TV (feature 018).

### Key Entities

- Não introduz dados novos: consome a programação e a configuração de EPG da
  feature 030, e canais/categorias do catálogo existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Da Live TV, abrir o guia e voltar com RETURN devolve o foco ao
  mesmo canal em 100% das vezes, inclusive em "★ Favoritos" e "Todos".
- **SC-002**: Com uma lista de centenas de canais e EPG de 60 h, navegar
  segurando ↓ e → na TV de referência não congela a interface.
- **SC-003**: O programa marcado "Agora" e a linha da hora conferem com o
  XMLTV de teste e a hora do aparelho, com o deslocamento aplicado.
- **SC-004**: Abrir o guia a partir do player e voltar não interrompe o
  áudio do canal nem reabre a sessão.
- **SC-005**: Nenhum estado do guia deixa o foco preso ou invisível.

## Assumptions

- A feature 030 está entregue: programação por fonte na janela de −12 h a
  +48 h, id de EPG capturado nos canais, deslocamento por fonte e painel de
  EPG em Configurações.
- "Amanhã" completo depende de a última sincronização ter sido feita no dia
  de hoje; se a janela guardada acabar antes, o guia mostra só até onde há
  dado.
- O plano de hardware do AVPlay permite o guia opaco por cima do vídeo como
  já acontece com a lista de zapping (feature 016).
- **Dados reais de teste**: E2E e passada na TV usam a lista e o EPG reais do
  `.env` da raiz (`CCPLAY_PROBE_*`, gitignored), lidos em tempo de execução,
  valores nunca registrados — mesma regra da feature 030.

## Clarifications

### Sessão 2026-09-28

- Q: Quais canais aparecem no guia? → A: Os da lista de origem (categoria,
  "★ Favoritos" ou "Todos"), com seletor de categoria no topo; nunca o
  catálogo inteiro de uma vez.
- Q: O que OK faz sobre um programa? → A: Assiste o canal (programa atual ou
  futuro); passado sem ação. Detalhe no painel do topo, sem modal.
- Q: De onde o guia abre? → A: Preview da Live TV e chrome do player Live.
  Sem entrada global na topbar/Home.
- Q: Canal sem EPG na grade? → A: Linha com um bloco único focável "Sem
  programação" (texto factual; não conflita com o FR-030 da 030, que vale
  para o slot "Agora" das linhas de canal).
- Q: Navegação no tempo? → A: ←/→ por programa, ↑/↓ entre canais mantendo a
  hora, abas Hoje/Amanhã, CH± pagina.
- Q: Programas encerrados? → A: Visíveis esmaecidos, só dentro da janela
  guardada, sem OK.
- Q: RETURN? → A: Volta à origem com foco restaurado — Live TV no canal de
  origem, ou o player sem reabrir sessão.
- Q: Zapping após assistir pelo guia? → A: Usa a lista exibida no guia.
- Q: Guia aberto do player: o canal continua? → A: Continua tocando atrás,
  como no zapping (016).
- Q: Trocar de lista dentro do guia? → A: Sim, seletor de categoria no topo
  (Modal).
