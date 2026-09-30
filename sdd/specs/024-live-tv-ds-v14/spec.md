# Feature Specification: Live TV no Design System V14 (Onda 3)

**Slug**: `024-live-tv-ds-v14`

**Created**: 2026-09-27

**Status**: Convergida

**Input**: Onda 3 da migração para o Design System V14 Spectrum — item M4
do backlog (`.planning/backlog.md`) e seção "Onda 3" de
`.planning/migracao-design-system-v14.md`. Layout de 3 colunas
(categorias / lista de canais / preview sem vídeo), preservando zapping,
favoritos, busca por categoria e o prefetch com debounce que já existem. É a
primeira tela redesenhada a ficar sob a topbar construída pela feature 023.

## Contexto

A Live TV já tem hoje três colunas (grupos, canais, painel de canal), mas no
visual antigo, em tela cheia, fora do shell da feature 023, com um painel de
canal sem ações e sem logo nem número de canal. Esta onda troca a
**apresentação** da tela pelo layout V14 (§13.2, §25 do Spec; `live()` do
protótipo; componentes `SideCategoryNav`, `ChannelRow`, `EmptyState`,
`ErrorState`, `Button` da feature 022) e a coloca sob a topbar, sem mudar o
comportamento que as features 010, 013, 016, 018 e 020 entregaram.

Duas coisas novas de dado entram porque o layout V14 as exige e existe dado
real para elas:

- **Logo do canal**: a fonte já declara (`tvg-logo` no M3U, ícone do stream
  no protocolo Xtream), mas a importação descarta esse valor para canais
  desde a feature 015, que excluiu a Live de propósito.
- **Número do canal**: ADR-011 §6 — posição na ordem declarada pela fonte,
  só exibição, nunca identidade.

## Escopo

### Incluído

- Live TV como destino de topo **sob a topbar persistente** da feature 023
  (aba "TV ao vivo" ativa), com a composição de foco topbar ↔ conteúdo.
- Cabeçalho da tela: título "TV ao vivo" + chip da entrada aberta + chip
  "N canais" só quando o número é conhecido.
- Coluna de categorias no padrão `SideCategoryNav`: `★ Favoritos`, `Todos`
  e as categorias da fonte, na ordem da fonte, com contagem só quando
  conhecida.
- Lista de canais no padrão `ChannelRow`, virtualizada: número, logo, nome,
  slot "Agora" reservado **vazio** (sem EPG), estrela de favorito, selo de
  indisponível.
- Painel de preview **sem vídeo**: logo, nome, número, grupo, e as ações
  focáveis "Assistir", "Favoritar"/"Favorito" e "Guia completo" (mock "Em
  breve", item 42 do backlog).
- Captura do logo declarado pela fonte para canais, nos dois caminhos de
  importação (M3U e protocolo do provedor), com fallback visual para
  ausência ou falha de carga.
- Número do canal derivado da ordem declarada pela fonte, estável, nunca
  inventado.
- Zapping (feature 016) no visual V14, em 2 colunas (categorias + canais)
  sobre o vídeo, sem preview e sem topbar.
- Estados de carregando, erro, vazio, fonte ausente e Favoritos vazio com os
  componentes V14, cada um com elemento focável.
- Atualização dos E2E da Live (`zapping-live-tv.mjs`,
  `busca-por-categoria.mjs`, `favoritos.mjs`, e o que mais tocar a tela).

### Fora de Escopo

- **EPG de qualquer tipo** (programa atual, barra de progresso do programa,
  cartões "A seguir", guia em tela cheia) — item 42. O slot "Agora" fica
  vazio e "Guia completo" é mock "Em breve".
- **Preview de vídeo ao focar** — rejeitado pela ADR-011 e pela
  constitution (focar não inicia reprodução nem consulta externa; AVPlay é
  singleton).
- **Entrada numérica de canal** (§44) — item 44.
- **Número declarado pela fonte** (`tvg-chno`) — item 25.
- **Memória de foco por categoria** (§41) — fica para a Onda 4, que estende
  o `CategoryScreenSnapshot`; a Live herda depois.
- **Chrome do player** (live bug, canal/programa sobre o vídeo, auto-hide) —
  Onda 6.
- **Topbar sobre Filmes/Séries e redesenho delas** — Onda 4.
- **Busca global na topbar e Configurações** — continuam mocks da 023 (Onda
  5).
- Esportes/Infantil na topbar (ADR-011).
- Mudança em regras de negócio de `lib/` além da captura do logo e do dado
  necessário para o número do canal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegar e assistir canais no layout V14 sob a topbar (Priority: P1)

A pessoa escolhe "TV ao vivo" na topbar e vê a tela em três colunas:
categorias à esquerda, canais da categoria aberta no centro e o preview do
canal focado à direita. Navega pelas categorias, entra numa, percorre os
canais e aperta OK para assistir em tela cheia — exatamente como hoje, só que
no visual novo e com a topbar acima.

**Why this priority**: é o caminho principal da tela e o critério da onda:
nada do que a Live faz hoje pode quebrar na troca de apresentação.

**Independent Test**: abrir a Live pela topbar, entrar numa categoria,
focar um canal, apertar OK e ver o player abrir; RETURN volta à lista com o
mesmo canal focado; RETURN na coluna de categorias volta ao Início.

**Acceptance Scenarios**:

1. **Given** o Início com a topbar, **When** a pessoa seleciona "TV ao
   vivo", **Then** a Live abre sob a topbar, com a aba "TV ao vivo" marcada
   como ativa e o foco na coluna de categorias.
2. **Given** a coluna de categorias, **When** a pessoa aperta ↑ em
   `★ Favoritos` (primeiro item), **Then** o foco sobe para a topbar, na aba
   "TV ao vivo"; **When** aperta ↓ na topbar, **Then** o foco volta ao mesmo
   item de onde saiu.
3. **Given** uma categoria focada, **When** a pessoa aperta OK ou →,
   **Then** os canais dela aparecem na coluna central (obtidos sob demanda
   como hoje) e o foco vai para o primeiro canal.
4. **Given** um canal focado, **When** a pessoa aperta OK, **Then** o player
   abre em tela cheia, sem topbar, e RETURN fecha o player com o mesmo canal
   focado na lista.
5. **Given** o foco na coluna de categorias, **When** a pessoa aperta RETURN,
   **Then** volta ao Início (comportamento da 023); **Given** o foco na
   topbar dentro da Live, **When** aperta RETURN, **Then** também volta ao
   Início.
6. **Given** um canal focado, **Then** a linha mostra número, logo (ou
   fallback), nome e o slot "Agora" vazio, e o preview mostra o mesmo canal.
7. **Given** uma categoria com muitos canais, **When** a pessoa rola a lista,
   **Then** só os canais próximos da área visível são renderizados e o foco
   nunca sai da área visível.

---

### User Story 2 - Preview com ações do canal focado (Priority: P2)

Com um canal focado, a pessoa aperta → e chega ao painel de preview, que
mostra o canal (logo, nome, número, grupo) e oferece "Assistir",
"Favoritar"/"Favorito" e "Guia completo" (este último "Em breve").

**Why this priority**: é o elemento novo do layout V14 e torna favoritar
descobrível para quem não conhece o gesto de segurar OK ou a tecla amarela,
mas a tela funciona sem ele (OK no canal já assiste).

**Independent Test**: focar um canal, → para o preview, acionar
"Favoritar" e ver o toast e a estrela aparecerem na linha; acionar
"Assistir" e ver o player abrir; acionar "Guia completo" e ver o aviso "Em
breve"; ← volta ao mesmo canal.

**Acceptance Scenarios**:

1. **Given** um canal focado na coluna central, **When** a pessoa aperta →,
   **Then** o foco vai para "Assistir" no preview.
2. **Given** o foco em "Assistir", **When** a pessoa aperta OK, **Then** o
   player abre para o canal do preview.
3. **Given** o foco em "Favoritar", **When** a pessoa aperta OK, **Then** o
   canal vira favorito com feedback imediato (toast), a estrela aparece na
   linha e o botão passa a "Favorito"; OK de novo desfaz.
4. **Given** o foco em "Guia completo", **When** a pessoa aperta OK,
   **Then** aparece o aviso "Em breve" do registro de mocks, sem abrir
   nenhuma tela nova.
5. **Given** o foco em qualquer ação do preview, **When** a pessoa aperta ←
   ou RETURN, **Then** o foco volta ao canal de onde saiu.
6. **Given** o foco na coluna de categorias (nenhum canal focado), **Then**
   o preview mostra uma orientação neutra e não tem ações focáveis.
7. **Given** um canal sem fonte de reprodução, **Then** "Assistir" aparece
   soft disabled e OK nele mostra o mesmo toast explicativo de hoje;
   "Favoritar" continua funcionando.

---

### User Story 3 - Zapping, favoritos e busca preservados no visual novo (Priority: P1)

Tudo que as features 013, 016 e 018 entregaram continua funcionando:
segurar OK ou a tecla amarela favorita o canal focado; `★ Favoritos` e
`Todos` continuam fixos no topo das categorias; o ícone de busca aparece na
entrada aberta e filtra os canais já carregados; OK durante a reprodução abre
o zapping sobre o vídeo, agora em 2 colunas no visual V14.

**Why this priority**: a onda não pode regredir funcionalidade (critério do
roteiro; contrato travado `LiveScreen.busca-categoria.contract.test.tsx`).

**Independent Test**: rodar `zapping-live-tv.mjs`, `busca-por-categoria.mjs`
e `favoritos.mjs` verdes, e o contrato travado sem edição.

**Acceptance Scenarios**:

1. **Given** um canal tocando em tela cheia, **When** a pessoa aperta OK,
   **Then** as colunas de categorias e canais aparecem sobre o vídeo
   escurecido (sem preview, sem topbar); escolher outro canal troca a sessão
   e a lista só fecha quando o novo canal está tocando.
2. **Given** um canal focado (na lista ou no zapping), **When** a pessoa
   segura OK ou aperta a tecla amarela, **Then** o canal é favoritado ou
   desfavoritado com toast, sem abrir o player.
3. **Given** `★ Favoritos` aberto sem favoritos, **Then** aparece o estado
   vazio instrutivo com um elemento focável.
4. **Given** uma entrada aberta com canais, **When** a pessoa sobe ao topo da
   coluna central, **Then** o ícone de busca está lá; ativar filtra os
   canais carregados; em `Todos`, o aviso "Busca em X de Y categorias"
   continua aparecendo.
5. **Given** o foco parado numa categoria da fonte, **Then** o prefetch com
   debounce continua acontecendo exatamente como hoje (nunca para uma
   categoria já aberta).

---

### User Story 4 - Logo e número de canal reais (Priority: P2)

Cada canal mostra o logo declarado pela fonte e um número de 3 dígitos
derivado da ordem da fonte, o mesmo em qualquer categoria em que apareça.

**Why this priority**: orienta a pessoa numa lista longa e é o que o layout
V14 pressupõe, mas a tela funciona sem (fallback e ausência do número).

**Independent Test**: importar uma fonte cujos canais declaram logo; abrir
uma categoria e ver os logos; abrir outra categoria e `Todos` e conferir que
o mesmo canal tem o mesmo número em todas; canal sem logo ou com logo que
falha mostra o fallback, nunca o ícone de imagem quebrada do navegador.

**Acceptance Scenarios**:

1. **Given** um canal cuja fonte declara logo, **When** a categoria dele é
   lida, **Then** a linha e o preview mostram o logo.
2. **Given** um canal sem logo declarado ou cujo logo falha ao carregar,
   **Then** aparece o fallback visual, nunca a imagem quebrada.
3. **Given** um canal que aparece em uma categoria e em `Todos`/`★ Favoritos`,
   **Then** o número exibido é o mesmo nos três lugares.
4. **Given** uma fonte para a qual não é possível derivar uma posição
   estável, **Then** o número não aparece (nunca um número inventado ou que
   mude conforme as categorias já lidas).
5. **Given** uma categoria gravada antes desta feature (sem logo), **When**
   ela for relida pelo fluxo normal de obtenção, **Then** os logos passam a
   aparecer; antes disso, fallback.

---

### Edge Cases

- Categoria nunca lida: sem contagem (nunca "0"); `Todos` sem número.
- `★ Favoritos` vazio: estado vazio instrutivo, focável; preview em
  orientação neutra.
- Busca com termo curto ou sem resultado: mensagens atuais no visual novo,
  sempre com elemento focável.
- Falha ao obter a categoria: `ErrorState` com "Tentar de novo" acionável por
  SELECT (bug da feature 014 não pode voltar); fonte ausente (`stored` sem
  bloco) → "Ressincronizar".
- Canal focado some após revalidação: o foco cai num vizinho válido, nunca
  num item inexistente sem foco visível.
- Logo com URL inválida, lenta ou que falha: fallback, sem travar a rolagem.
- App oculto com canal tocando: fecha a camada como hoje (feature 020), sem
  reabrir; ao voltar, a Live sob a topbar com o foco no canal.
- ↑ na topbar a partir da coluna central ou do preview: não acontece — só o
  primeiro item da coluna de categorias sobe para a topbar (no topo da
  coluna central, ↑ vai para o ícone de busca, como hoje).
- Topbar focada e a pessoa escolhe "Filmes"/"Séries": navega normalmente
  (comportamento da 023).
- Categorias numerosas: a coluna rola mantendo o item focado visível.
- Zapping aberto: a topbar não aparece; o ícone de busca continua fora do
  zapping (feature 018, FR-018).

## Requirements *(mandatory)*

### Functional Requirements

**Shell e navegação**

- **FR-001**: A Live TV DEVE ser exibida sob a topbar persistente da feature
  023, com a aba "TV ao vivo" marcada como destino ativo.
- **FR-002**: ↑ no primeiro item da coluna de categorias DEVE levar o foco à
  topbar (aba "TV ao vivo"); ↓ na topbar DEVE devolver o foco ao mesmo item
  do conteúdo, sem mover o foco interno de nenhum dos dois escopos na mesma
  tecla.
- **FR-003**: RETURN na coluna de categorias ou na topbar (dentro da Live)
  DEVE voltar ao Início; RETURN na coluna central ou no preview DEVE voltar
  uma coluna, preservando as camadas atuais da busca (resultado → campo →
  fecha busca).
- **FR-004**: Com o player em tela cheia ou o zapping aberto, a topbar NÃO
  DEVE aparecer nem receber teclas.
- **FR-005**: A raiz da tela sob o shell DEVE estar coberta pela regra de
  transparência do plano de hardware do vídeo, de modo que o vídeo nunca
  fique pintado atrás do layout.

**Layout**

- **FR-006**: A tela DEVE ter cabeçalho com o título "TV ao vivo", um chip
  com o nome da entrada aberta e um chip "N canais" apenas quando o número de
  canais da entrada é conhecido.
- **FR-007**: A coluna de categorias DEVE listar, nesta ordem, `★ Favoritos`,
  `Todos` e as categorias da fonte na ordem declarada, sempre visíveis mesmo
  vazias, nunca substituídas por taxonomia externa.
- **FR-008**: Cada categoria da fonte DEVE mostrar a contagem real de canais
  apenas quando já foi lida; `★ Favoritos` DEVE mostrar a quantidade de
  canais favoritos; `Todos` e categorias nunca lidas NÃO DEVEM mostrar
  número.
- **FR-009**: Cada linha de canal DEVE mostrar número (quando derivável),
  logo ou fallback, nome, slot "Agora" vazio (sem texto nem barra de
  progresso), estrela quando favorito e selo quando sem fonte de reprodução.
- **FR-010**: A lista de canais DEVE continuar virtualizada e manter o canal
  focado sempre na área visível.
- **FR-011**: Foco visual DEVE seguir a receita V14 (outline + glow +
  escala), com glow só no item focado.
- **FR-012**: Todas as cores, espaçamentos, raios e tamanhos de fonte DEVEM
  vir dos tokens existentes; nada hardcoded.

**Preview**

- **FR-013**: O preview DEVE mostrar, para o canal focado na coluna central,
  logo (ou fallback), nome, número (quando derivável) e grupo, e nunca
  iniciar reprodução, carregar vídeo ou fazer consulta externa ao mudar o
  foco (o carregamento do logo é a única imagem permitida).
- **FR-014**: → num canal focado DEVE levar o foco à primeira ação do
  preview ("Assistir"); ← ou RETURN numa ação do preview DEVE voltar ao
  mesmo canal.
- **FR-015**: "Assistir" DEVE abrir o player para o canal do preview,
  exatamente como OK no canal.
- **FR-016**: "Favoritar"/"Favorito" DEVE alternar o favorito do canal, com
  o mesmo toast e efeito dos gestos existentes, e o rótulo refletindo o
  estado atual.
- **FR-017**: "Guia completo" DEVE ser um mock soft disabled registrado no
  registro único de mocks, apontando para o item 42, que ao ser acionado só
  anuncia "Em breve".
- **FR-018**: Sem canal focado (foco nas categorias ou entrada vazia), o
  preview DEVE mostrar uma orientação neutra, sem ações focáveis.
- **FR-019**: Canal sem fonte de reprodução DEVE aparecer soft disabled na
  lista e no "Assistir"; OK/Assistir DEVE mostrar o toast explicativo atual;
  favoritar DEVE continuar permitido.

**Comportamento preservado**

- **FR-020**: OK num canal DEVE abrir o player em tela cheia; RETURN no
  player DEVE voltar com o mesmo canal focado.
- **FR-021**: Segurar OK e a tecla amarela DEVEM continuar favoritando o
  canal focado na lista e no zapping, sem abrir o player.
- **FR-022**: O zapping DEVE manter o comportamento da feature 016 (lista
  por cima do vídeo, troca de sessão só fecha a lista quando o novo canal
  está tocando, mesmo canal só fecha) e ser exibido em 2 colunas
  (categorias + canais) no visual V14, sem preview e sem topbar.
- **FR-023**: A busca por categoria e a entrada `Todos` DEVEM manter o
  comportamento da feature 018, incluindo o aviso de cobertura e a ausência
  do ícone de busca no zapping.
- **FR-024**: O prefetch com debounce da categoria focada DEVE manter o
  comportamento das features 010/015 (nunca para `★ Favoritos`/`Todos` nem
  para a categoria já aberta).
- **FR-025**: O ciclo de vida do player (feature 020) DEVE permanecer
  intacto: protetor de tela desligado só com reprodução ativa; ocultar o app
  com canal tocando fecha a camada.
- **FR-026**: O teste de contrato `LiveScreen.busca-categoria.contract.test.
  tsx` DEVE passar sem edição.
- **FR-027**: Carregando, erro, fonte ausente, vazio e Favoritos vazio DEVEM
  usar os componentes V14 de estado e ter pelo menos um elemento focável
  acionável por SELECT.

**Dados**

- **FR-028**: A importação e a obtenção sob demanda DEVEM capturar o logo
  declarado pela fonte para canais (atributo de logo do M3U e ícone do
  stream do protocolo do provedor), com a mesma normalização e as mesmas
  regras já usadas para capas de filmes/séries.
- **FR-029**: A ausência ou falha de carga do logo DEVE mostrar o fallback
  visual, nunca o ícone de imagem quebrada do navegador.
- **FR-030**: O número do canal DEVE ser derivado da ordem declarada pela
  fonte (ordem da categoria e posição dentro dela) e ser o mesmo em qualquer
  entrada em que o canal apareça. Um número já exibido NUNCA DEVE mudar
  porque outra categoria foi lida; ele pode faltar até ser derivável (por
  exemplo, enquanto uma categoria anterior ainda não foi lida numa fonte sob
  demanda). Quando não for derivável de forma estável, NÃO DEVE aparecer.
- **FR-031**: O número do canal NÃO DEVE ser usado como identidade:
  favoritos e reprodução continuam pela chave lógica estável.
- **FR-032**: URLs de logo, como qualquer URL do catálogo, NUNCA DEVEM
  aparecer em log, mensagem de erro ou texto visível.

**Testes**

- **FR-033**: Os E2E `zapping-live-tv.mjs`, `busca-por-categoria.mjs` e
  `favoritos.mjs` (e qualquer outro que toque a Live) DEVEM ser atualizados
  para os novos seletores e passar, sem perder asserções de comportamento.

### Key Entities

- **Canal (registro de catálogo, `kind: channel`)**: ganha o logo declarado
  pela fonte (mesmo campo de valor já usado para capa de filme/série) e o
  dado necessário para derivar o número de exibição a partir da ordem da
  fonte. Identidade inalterada.
- **Categoria de canal**: contagem real conhecida só depois de lida;
  ordem declarada pela fonte já existente.
- **Mock "Guia completo"**: nova entrada no registro único de mocks, com o
  item 42 do backlog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos cenários E2E de zapping, busca por categoria e
  favoritos que passavam antes da onda passam depois, e o contrato travado da
  Live passa sem edição.
- **SC-002**: Em todos os estados da tela (carregando, erro, vazio, fonte
  ausente, Favoritos vazio, lista, preview, zapping), existe exatamente um
  elemento com foco visível e ele é acionável pelo controle.
- **SC-003**: A pessoa alcança a topbar a partir da Live e volta ao mesmo
  item com no máximo uma tecla em cada sentido.
- **SC-004**: Numa categoria com 500 canais, o número de linhas renderizadas
  fica limitado à janela visível mais a margem de pré-renderização,
  independentemente do tamanho da categoria.
- **SC-005**: Um mesmo canal exibe o mesmo número em 100% das entradas em que
  aparece (categoria, `Todos`, `★ Favoritos`).
- **SC-006**: Nenhum canal exibe o ícone de imagem quebrada, com logo
  ausente, inválido ou que falhe.

## Assumptions

- A composição de escopos topbar ↔ conteúdo da feature 023
  (`logic/foco-shell.md`) é reaproveitada tal como está, com a Live como
  segundo escopo de conteúdo.
- Os componentes da feature 022 (`SideCategoryNav`, `ChannelRow`,
  `ErrorState`, `EmptyState`, `Button`, `ComingSoon`) cobrem o layout;
  ajustes neles são permitidos se não quebrarem os próprios testes.
- A lógica de `lib/` (catálogo, player, foco, estado do usuário) fica
  intocada, exceto a captura do logo e o dado de ordem para o número do
  canal (estratégia "strangler" do roteiro).
- Canais já gravados só ganham logo quando a categoria for relida pelo fluxo
  normal (janela de frescor da feature 010) ou por ressincronização; não há
  migração forçada.
- A passada na TV física (desempenho com logos reais, rolagem, zapping sob o
  novo shell, plano de hardware) é **recomendada, não gate** desta feature;
  a medição de render (R-2 do roteiro) fica registrada como pendência.
- A navegação entre colunas é por vizinhos explícitos (R-4 do roteiro), sem
  saltos diagonais do protótipo.

## Clarifications

### Sessão 2026-09-27

- Q: A topbar da 023 passa a aparecer sobre a Live TV já nesta onda? → A:
  Sim, persistente. ↑ no topo da coluna de categorias leva à topbar, ↓ volta;
  RETURN na raiz vai ao Início; a topbar some com o player em tela cheia.
- Q: Como fica o painel de preview? → A: Com ações focáveis — "Assistir",
  "Favoritar/Favorito" e "Guia completo" (soft disabled "Em breve", item
  42), alcançado com → a partir do canal; OK no canal continua abrindo o
  player direto e os gestos de favoritar continuam.
- Q: Logo do canal (hoje descartado para canais desde a 015)? → A: Capturar
  agora (M3U `tvg-logo` e ícone do stream Xtream), com fallback em ausência
  ou falha; canais já gravados ganham logo quando a categoria for relida.
- Q: Número do canal, dado que a ordem global só é conhecida com todas as
  categorias lidas? → A: Derivado da ordem declarada (ordem da categoria +
  posição dentro dela), estável e independente do que já foi lido; se não
  for derivável para uma fonte, não aparece. Emenda leve na ADR-011 §6 se a
  definição mudar.
- Q: Contagem na coluna de categorias? → A: Só quando conhecida; `★
  Favoritos` com a quantidade de favoritos; `Todos` sem número.
- Q: Zapping no visual novo? → A: 2 colunas (categorias + canais), sem
  preview e sem topbar; comportamento da 016 intacto.
- Q: Memória de foco por categoria (§41)? → A: Fora; fica para a Onda 4.
- Q: Cabeçalho da tela? → A: "TV ao vivo" + chip da entrada aberta + chip "N
  canais" só quando conhecido.
- Q: Preview sem canal focado? → A: Orientação neutra, sem ações focáveis.
- Q: Passada na TV física é gate? → A: Recomendada, não gate.
- Q: Canal sem fonte de reprodução? → A: Soft disabled na linha e no
  "Assistir", mesmo toast de hoje; favoritar continua permitido.
- Q: (Analyze do sdd-plan, achado A1) "Não depender das categorias já
  lidas" vale para o valor ou para a presença do número? → A: Para o valor.
  Um número exibido nunca muda porque outra categoria foi lida, mas pode
  faltar até ser derivável. FR-030 reescrito.
