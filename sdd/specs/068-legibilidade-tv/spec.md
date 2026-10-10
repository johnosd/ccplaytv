# Feature Specification: Legibilidade para TV — letra maior no app e TV ao vivo em coluna única

**Slug**: `068-legibilidade-tv`

**Created**: 2026-10-10

**Status**: Em Execução

**Input**: "Subir a escala de letra do V14 para a TV: mínimo de 20 px, texto padrão de 24 px e nomes entre 28 e 32 px, perto do que Amazon e Apple pedem. Isso também alarga as colunas para os nomes não ficarem tão cortados" + "remover o header da tela de canais para ter mais espaço" (com fotos de referência de outro app de IPTV e do YouTube na TV).

## Contexto

**Esclarecimento do usuário (2026-10-10, Fase 4):** aplicar o visual da lista de categorias da Live também à lateral de Filmes/Séries, mantendo o recolhimento automático somente nessas seções. Mudar apenas a lista de categorias; pôsteres/fileiras, grade, navegação e demais funcionalidades permanecem como estão. A interpretação intermediária de substituir títulos por lista foi descartada. O fora de escopo sobre o modelo de navegação de Filmes/Séries continua válido.

Visto na TV física, de longe: a letra do app é pequena. A escala do Design System V14 tem 6 tamanhos (base 1920×1080): destaque 64, título de tela 40, seção/card 28, texto grande 24, **texto padrão 20** e **mínimo 16**. Cerca de 200 dos 262 usos no app estão nos dois menores. Referências de plataformas de TV (Amazon Fire TV: texto corrido ≥ ~28 px em 1080p; Apple tvOS: ≥ 29 pt; Android TV: ≥ ~24 px; guia do próprio repositório, `docs/guia-praticas-app-tv/04`: nomes 28–32 px e auxiliares 24–28 px) pedem mais. A Samsung não publica os números (só em figuras).

Na TV ao vivo, acima das colunas há a topbar (logo, Início/TV ao vivo/Filmes/Séries, lista ativa, relógio) e um bloco de título ("TV ao vivo / Canais, programação e guia…" + selos informativos), e a tela divide o resto em três colunas (categorias, canais, destaque): a coluna de canais tem ~350 px e corta os nomes. Um ajuste ad-hoc de 2026-10-10 já subiu a letra só da Live (nome 24, programa/número 20, categorias 20) e foi aprovado na TV ("melhorou").

## Escopo

### Incluído

- **Escala tipográfica maior no app inteiro**, um degrau acima em cada tamanho do V14: mínimo 16 → 20, padrão 20 → 24, texto grande 24 → 28, seção/card 28 → 32, título de tela 40 → 48; destaque 64 mantido. Vale para todas as telas, inclusive o player e Configurações.
- **Ajustes de layout que a letra maior exigir**: botões, chips, linhas e cards crescem o necessário para caber o texto; menos itens por página/fileira quando preciso. Ícones e capas mantêm o tamanho, salvo onde ficarem desproporcionais.
- **Nomes longos**: uma linha com reticências fora de foco; no item focado o nome aparece inteiro.
- **TV ao vivo sem cabeçalho**: saem a topbar e o bloco de título ("TV ao vivo", subtítulo e selos). A contagem de canais vai para o cabeçalho da lista de canais.
- **TV ao vivo em coluna única**: a lista começa nas categorias; escolher uma substitui a lista pelos canais dela; RETURN volta às categorias com o foco na categoria de onde veio; outro RETURN volta ao Início. À direita, o destaque do item focado, maior.
- Emendas de contratos travados que fixam alturas, colunas e a topbar da Live, por decisão registrada.

### Fora de Escopo

- Mudar o modelo de navegação de **Filmes e Séries** (vitrine + grade): só ganham a letra maior. A ideia de coluna única para eles fica no backlog (`## Ideias Futuras`).
- Menu (☰) ou outra forma de navegar a partir da TV ao vivo além de RETURN → Início.
- Relógio e nome da lista ativa na TV ao vivo.
- Aumentar ícones, capas e espaçamentos proporcionalmente (só o que acompanha o texto cresce).
- Trocar a fonte, as cores ou o foco do V14 (receita do ADR-007 mantida).
- Configuração de tamanho de letra pela pessoa (acessibilidade ajustável).
- Pré-visualização de canal ao focar (constitution: focar nunca toca).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ler o app de longe (Priority: P1)

Sentada no sofá, a pessoa lê sem esforço os textos de todas as telas: nomes de canais, filmes, séries e categorias, botões, metadados e o player. Nada fica sobreposto ou cortado de forma que esconda informação essencial; nomes longos aparecem inteiros no item focado.

**Why this priority**: é o problema relatado e vale para o app inteiro; sozinho já entrega valor.

**Independent Test**: comparar cada tela antes/depois a 1920×1080 e na TV: nenhum texto de produto abaixo de 20 px, nenhum texto vazando da sua caixa, foco e navegação iguais.

**Acceptance Scenarios**:

1. **Given** qualquer tela do app, **When** ela é exibida, **Then** nenhum texto de produto tem menos de 20 px (base 1920×1080) e o texto padrão tem 24 px.
2. **Given** uma lista ou grade com nomes longos, **When** um item não está em foco, **Then** o nome ocupa uma linha com reticências; **When** recebe o foco, **Then** o nome aparece inteiro.
3. **Given** uma linha, card, botão ou chip, **When** o texto maior é aplicado, **Then** o texto cabe na caixa (sem vazar nem ser cortado no meio da altura) e o anel de foco continua inteiro à vista.
4. **Given** o player (controles, faixa do canal, painéis de áudio/legenda, avisos), **When** aberto, **Then** segue a mesma escala.
5. **Given** a navegação por página e a memória de foco das listas, **When** as linhas ficam mais altas, **Then** pular página, voltar e restaurar foco continuam funcionando (menos itens por página é esperado).

---

### User Story 2 - TV ao vivo em coluna única, sem cabeçalho (Priority: P2)

Na TV ao vivo, a pessoa vê uma única lista à esquerda, que começa nas categorias. Ao escolher uma, a lista passa a mostrar os canais dela; RETURN volta às categorias com o foco onde estava; outro RETURN volta ao Início. Não há topbar nem bloco de título: a lista e o destaque do item focado ocupam a tela.

**Why this priority**: dá o espaço que a letra maior precisa na tela mais usada; depende de decisões de navegação próprias, mas a US1 já entrega valor sem ela.

**Independent Test**: abrir a TV ao vivo, navegar categorias → canais → RETURN → RETURN e conferir foco, conteúdo da lista e ausência de topbar/título.

**Acceptance Scenarios**:

1. **Given** a TV ao vivo aberta pelo Início, **When** a tela aparece, **Then** não há topbar nem bloco de título, e a lista mostra as categorias (com ★ Favoritos e Todos fixos, como hoje).
2. **Given** o foco numa categoria, **When** a pessoa aperta OK, **Then** a mesma coluna passa a mostrar os canais da categoria, com o cabeçalho "nome da categoria · N canais" e o foco no primeiro canal.
3. **Given** a lista de canais, **When** a pessoa aperta RETURN, **Then** a coluna volta às categorias com o foco na categoria de onde veio (por id).
4. **Given** a lista de categorias, **When** a pessoa aperta RETURN, **Then** volta ao Início.
5. **Given** um canal focado, **When** o foco muda, **Then** o destaque à direita mostra o canal (nome, número e programa do EPG quando houver) e nada começa a tocar; OK toca o canal, como hoje.
6. **Given** uma categoria bloqueada pelo controle parental, **When** a pessoa aperta OK, **Then** o PIN é pedido antes de mostrar os canais (regra da 066 mantida).
7. **Given** a busca e o guia de programação da TV ao vivo, **When** a pessoa está na lista de canais, **Then** continuam alcançáveis pelos mesmos controles de hoje no cabeçalho da lista.

---

### Edge Cases

- **Categoria vazia** (sem canais ou todos escondidos): a lista mostra o estado vazio com um elemento focável; RETURN volta às categorias.
- **Todas as categorias escondidas** (066): o vazio "Todas as categorias estão escondidas" continua, com "Gerenciar categorias" focado.
- **Entrar direto num canal** (Início → Canais favoritos, Busca): a Live abre na lista de canais da categoria certa; RETURN volta às categorias com ela focada.
- **Voltar do player**: RETURN no player volta à lista de canais com o canal que tocava focado (memória de foco atual).
- **Lista de canais muito grande** (Todos, milhares): segue virtualizada; a navegação por página continua, com menos itens por página.
- **Nomes enormes** (provedores com tags como "[H265] FHD 4K"): reticências fora de foco; no foco, inteiro sem empurrar o resto da linha para fora.
- **Telas com altura fixa** (linhas da Live, grade de Filmes/Séries, trilhas, abas de Configurações, teclado na tela): crescem o necessário; nada pode ficar inalcançável pelo controle.
- **Textos em en/es** (mais longos que pt): cabem nas mesmas regras.

## Requirements *(mandatory)*

### Functional Requirements

**Escala tipográfica (US1)**

- **FR-001**: A escala de texto do app DEVE passar a ser, na base 1920×1080: destaque 64 px, título de tela 48 px, seção/card 32 px, texto grande 28 px, texto padrão 24 px, mínimo 20 px.
- **FR-002**: Nenhum texto de produto DEVE ter menos de 20 px; o texto padrão (rótulos, botões, itens de lista) DEVE ter 24 px.
- **FR-003**: A escala DEVE valer para todas as telas, inclusive o player, os modais, Configurações e o teclado na tela.
- **FR-004**: Linhas, cards, botões e chips DEVEM crescer o necessário para o texto caber inteiro na altura; o anel de foco DEVE continuar inteiro à vista.
- **FR-005**: Fora de foco, nomes de item (canal, filme, série, episódio, categoria) DEVEM ocupar uma linha com reticências; no item focado o nome DEVE aparecer inteiro.
- **FR-006**: Ícones e capas DEVEM manter o tamanho atual, exceto onde ficarem desproporcionais ao texto novo.
- **FR-007**: Navegação por página, memória de foco e restauração de foco por id DEVEM continuar funcionando com as novas alturas (a quantidade por página pode diminuir).

**TV ao vivo (US2)**

- **FR-008**: A TV ao vivo NÃO DEVE exibir topbar nem bloco de título (título, subtítulo e selos de categoria/contagem).
- **FR-009**: A TV ao vivo DEVE ter uma única lista à esquerda (cerca de 1/3 da largura) que mostra ou as categorias ou os canais de uma categoria, e à direita o destaque do item focado.
- **FR-010**: OK numa categoria DEVE substituir a lista pelos canais dela, com o foco no primeiro canal (ou no canal já lembrado daquela categoria) e o cabeçalho com o nome da categoria e a contagem de canais.
- **FR-011**: RETURN na lista de canais DEVE voltar à lista de categorias com o foco na categoria de onde veio, por id; RETURN na lista de categorias DEVE voltar ao Início.
- **FR-012**: Focar uma categoria ou um canal NÃO DEVE tocar nada nem disparar consulta externa; OK num canal toca, como hoje.
- **FR-013**: Categorias fixas (★ Favoritos, Todos), números de canal, favoritos, busca, guia de programação, controle parental e zapping DEVEM manter o comportamento atual.

**Validação**

- **FR-014**: Todo texto novo DEVE existir em pt, en e es; nomes vindos da lista nunca são traduzidos.

### Key Entities

Nenhuma entidade de dados nova. Muda a escala visual (tokens de texto) e a navegação da TV ao vivo (lista de categorias ↔ lista de canais).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 textos de produto abaixo de 20 px em todas as telas, medido a 1920×1080.
- **SC-002**: 0 textos vazando ou cortados na altura da sua caixa nas telas principais (Início, TV ao vivo, vitrine e grade de Filmes/Séries, detalhe de filme e de série, player, Configurações, tela de perfis), em pt, en e es.
- **SC-003**: Na TV ao vivo, a lista ocupa a altura útil da tela sem topbar nem título, e um nome de canal de até 30 caracteres aparece inteiro no item focado.
- **SC-004**: Da TV ao vivo aberta, entrar numa categoria, voltar e entrar em outra leva no máximo uma tecla a mais que hoje.
- **SC-005**: **Passada na TV física obrigatória (gate)**: o usuário confere de longe, na TV, as telas do SC-002 e aprova a leitura.

## Assumptions

- A escala sobe por meio dos tokens do V14 (uma mudança central), não tela por tela; a emenda do contrato visual (ADR-007/ADR-011, Spec V14 §6) é tratada no planejamento.
- O ajuste ad-hoc de 2026-10-10 na Live (nome 24, categorias 20) é absorvido pela nova escala.
- Contratos travados que fixam alturas (linha de canal de 84 px, navegação por página), colunas e a topbar da Live serão emendados por decisão registrada desta spec, como na 067.
- O destaque à direita reaproveita o que a Live já mostra (arte, nome, número, EPG), só maior.
- A TV de referência (Samsung QN50Q60DAGXZD) é onde o gate visual acontece.

## Clarifications

### Sessão 2026-10-10

- Q: O que é o "header" da TV ao vivo que deve sair? → A: A topbar e o bloco de título ("TV ao vivo" + subtítulo + selos).
- Q: Para quais telas vale a letra maior? → A: App inteiro.
- Q: Uma feature ou duas? → A: Uma só, com duas histórias (P1 escala, P2 TV ao vivo).
- Q: Sem a topbar, como sair da TV ao vivo? → A: RETURN volta ao Início (como a grade de Filmes/Séries sem topbar).
- Q: O que da topbar/título continua? → A: Nada; os selos "✓ Todos" e contagem (informativos, não um filtro — correção feita na entrevista) saem do topo e a contagem de canais vai para o cabeçalho da lista de canais.
- Q: Qual escala? → A: Um degrau acima: mínimo 20, padrão 24, grande 28, seção/card 32, título 48, destaque 64.
- Q: Pode mudar alturas e fileiras travadas por contrato? → A: Sim, emendar os contratos.
- Q: Nomes longos? → A: Reticências fora de foco; nome inteiro no item focado.
- Q: O player entra? → A: Sim, tudo.
- Q: Como dividir o espaço da TV ao vivo? → A: Proposta do usuário: **uma coluna só** — categorias; OK troca pela lista de canais da categoria; RETURN volta às categorias.
- Q: O que ocupa o resto da tela? → A: O destaque do item focado, à direita (lista ~1/3 da tela).
- Q: Coluna única também em Filmes/Séries? → A: Não nesta feature; ideia registrada no backlog.
- Q: Voltar dos canais para as categorias? → A: Foco na categoria de onde veio (por id); outro RETURN vai ao Início.
- Q: Quando está pronta? → A: Passada na TV física obrigatória (gate).
- Q: Ícones e botões crescem? → A: Só o que acompanha o texto; ícones e capas mantêm o tamanho, salvo desproporção.
