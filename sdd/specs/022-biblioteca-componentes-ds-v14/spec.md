# Feature Specification: Biblioteca de Componentes do Design System V14 (Onda 1 da migração)

**Slug**: `022-biblioteca-componentes-ds-v14`

**Created**: 2026-09-26

**Status**: Convergida

**Input**: "Feature 022 — Onda 1 da migração para o DS V14 Spectrum (biblioteca
de componentes): Button (primary pill/secondary/ghost/accent), IconButton,
Chip, Tabs, ContentCard (portrait/landscape/wide/compact sobre PosterArt),
ChannelRow, Rail horizontal virtualizado, SideCategoryNav, Modal/Toast/
EmptyState/ErrorState/OfflineBanner/Spinner/Skeleton, ComingSoon + registro
comingSoon.ts, TextField com IME. Consome os ícones e utilitários da
feature 021 (Onda 0, já convergida). Nenhuma tela troca ainda — biblioteca
isolada e testada." Contexto: `.planning/migracao-design-system-v14.md`
(Onda 1) e `sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md`.

## Escopo

Segunda onda da migração para o Design System V14 Spectrum
(`docs/design/design-system/`), absorvendo o item 15 do backlog
("Biblioteca de componentes de TV"). Constrói, em `tv-web/src/components/`,
os componentes reutilizáveis que a Onda 2 em diante vai consumir para
reconstruir Live TV, Filmes, Séries, Home e Configurações no visual V14.

**Nenhuma tela existente muda nesta feature.** Cada componente é
desenvolvido e testado isoladamente (harness próprio, sem montar
`LiveScreen`/`MoviesScreen`/`SeriesScreen`/`ListHomeScreen`/etc.), da mesma
forma que `Icon`/`Stage` foram entregues na feature 021 sem nenhuma tela os
consumir ainda. A prova de que a biblioteca "funciona" é o comportamento
isolado de cada componente, não uma tela nova.

### Incluído

Dezesseis componentes, cada um com os estados que se aplicarem
(default/focused/pressed/disabled/loading/error), consumindo exclusivamente
tokens (feature 021) — nenhuma cor, raio, espaçamento ou tamanho de fonte
literal:

- **Ações**: `Button` (variantes primary-pill, secondary, ghost, accent),
  `IconButton` (alvo 52×52, rótulo acessível), `Chip` (selecionado/não
  selecionado).
- **Navegação de conteúdo**: `Tabs`, `SideCategoryNav` (componente burro:
  recebe entradas via props, não sabe o que é favorito/histórico/categoria
  real).
- **Cards e listas**: `ContentCard` (variantes portrait 205×302, landscape
  292×164, wide 356×200, compact 250×126 — envolve o `PosterArt` já
  existente, sem reescrevê-lo), `ChannelRow` (número, logo, nome, slot
  "Agora" reservado, barra de progresso), `Rail` (trilho horizontal
  virtualizado de verdade, com fade de borda e indicador de posição).
- **Diálogos e feedback**: `Modal` (foco real: abre com o primeiro item
  focável em foco, RETURN fecha, foco volta a quem abriu — mesmo mecanismo
  de `useRemoteNav({modal:true})` que `PlayerLayer` já usa), `EmptyState`,
  `ErrorState` (1–2 ações, código opcional no padrão §45 da Spec),
  `OfflineBanner` (detecção real de conectividade), `Spinner` (20/32/48px),
  `Skeleton` (mesma geometria do item real).
- **Entrada e mock**: `TextField` (rótulo permanente, erro, atributos de
  IME corretos — `Next`/`Done` isolados neste campo, sem encadear outros
  campos), `ComingSoon` (mais o registro `tv-web/src/lib/comingSoon.ts`:
  id → mensagem + item do backlog que a substitui).

### Fora de Escopo

- Trocar qualquer tela existente para usar estes componentes — isso é da
  Onda 2 em diante (features 023+).
- Reescrever ou restilizar o `Toast`/`AnnouncerRegion` (feature 021): já
  convergido, com 5/5 contratos verdes; esta feature não toca nele.
- Reescrever o `PosterArt` (feature 015): `ContentCard` o envolve, não o
  substitui.
- Encadeamento de foco entre vários `TextField` de um mesmo formulário
  (`Servidor → Usuário → Senha → Done`): cada campo cuida só de si; a
  sequência entre campos é responsabilidade de quem montar um formulário
  real (Onda 2+).
- Lógica de dados de favoritos, histórico, categorias reais ou catálogo:
  `SideCategoryNav`/`ContentCard`/`ChannelRow`/`Rail` recebem tudo por
  props; nenhum lê `catalogRepository`/`userStateRepository`.
- Conteúdo real dentro do `Modal` (seletor de áudio/legenda, qualidade,
  temporada, busca, confirmação): esta feature entrega só a casca (abre,
  fecha, foco, camada); o conteúdo de cada modal específico é da tela que
  o for usar.
- Ícones novos além dos 17 já entregues na feature 021.
- Qualquer alteração em `tv-web/src/features/screens.css`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um diálogo abre e fecha sem perder o controle remoto (Priority: P1)

Quem constrói uma tela precisa de um `Modal` genérico: ao abrir, o
controle remoto já opera dentro dele (não precisa de um toque extra pra
"entrar" no diálogo); apertar RETURN fecha o diálogo e devolve o foco
exatamente a quem o abriu; nunca dois modais abertos ao mesmo tempo.

**Why this priority**: é o componente com o risco de foco mais alto da
lista — errar aqui prende o controle remoto (constitution, "Foco Visível e
Sem Becos Sem Saída") ou perde a posição de quem abriu (constitution,
"Voltar Restaura Foco e Posição"). Nenhum outro componente desta feature
depende dele para existir, mas é o que mais compromete telas futuras se
sair errado.

**Independent Test**: montar um `Modal` isolado (harness de teste) com um
botão de gatilho e conteúdo de teste dentro; abrir, navegar por
setas/RETURN, fechar, e verificar o foco.

**Acceptance Scenarios**:

1. **Given** um `Modal` fechado com um botão de gatilho focado, **When** o
   gatilho é ativado, **Then** o modal abre com foco no primeiro elemento
   focável do seu conteúdo, sem exigir uma segunda ação para "entrar" nele.
   **Emenda (converge 2026-09-26):** neste projeto o foco é de estado, não
   foco DOM (ADR-009). "Já opera dentro dele" significa que o `Modal`
   intercepta o teclado desde o primeiro evento (`useRemoteNav({modal:true})`);
   qual elemento do conteúdo começa focado é do conteúdo (`children`), dono
   do consumidor — o `Modal` não move foco DOM nem escolhe um filho.
2. **Given** um `Modal` aberto, **When** RETURN é pressionado, **Then** o
   modal fecha e o foco volta exatamente ao elemento que o abriu.
3. **Given** um `Modal` aberto, **When** as setas movem o foco, **Then**
   apenas elementos dentro do modal recebem foco — nada por trás dele.
4. **Given** um `Modal` já aberto, **When** o código tenta abrir um
   segundo `Modal`, **Then** o componente não permite dois modais visíveis
   ao mesmo tempo (mesma instância reaproveitada, ou o segundo pedido é
   ignorado/substitui o primeiro — decisão de implementação do `sdd-plan`,
   mas o efeito visível é sempre no máximo um modal na tela).

---

### User Story 2 - Todo estado vazio ou de erro tem uma saída pelo controle (Priority: P1)

`EmptyState` e `ErrorState` cobrem os casos "nada aqui ainda" e "algo deu
errado", cada um sempre com pelo menos uma ação focável e ativável por
SELECT. `ErrorState` aceita até duas ações (ex.: "Tentar novamente" +
"Voltar") e um código curto opcional (ex.: `NET-01`), no padrão da Spec
V14 §45.

**Why this priority**: é literalmente o princípio "Foco Visível e Sem
Becos Sem Saída" da constitution, viola-lo prende o controle remoto. Todas
as telas migradas nas próximas ondas vão usar um destes dois estados pelo
menos uma vez.

**Independent Test**: renderizar `EmptyState` e `ErrorState` isolados com
diferentes combinações de props (1 ação, 2 ações, com/sem código) e
confirmar foco inicial e ativação por SELECT/Enter.

**Acceptance Scenarios**:

1. **Given** um `EmptyState` renderizado, **When** a tela carrega, **Then**
   existe exatamente um elemento com a aparência e o comportamento de foco
   (não decorativo) pronto para receber foco, e a ação associada dispara o
   callback correto quando ativada.
2. **Given** um `ErrorState` com duas ações, **When** renderizado, **Then**
   as duas aparecem, cada uma navegável e ativável independentemente, sem
   ordem de tabulação quebrada.
3. **Given** um `ErrorState` com um código (ex.: `NET-01`), **When**
   renderizado, **Then** o código aparece de forma discreta, nunca como o
   elemento mais destacado da tela.
4. **Given** um `ErrorState` sem código, **When** renderizado, **Then** a
   mensagem e a ação aparecem normalmente, sem espaço vazio no lugar do
   código.

---

### User Story 3 - Uma trilha horizontal de itens nunca monta tudo de uma vez (Priority: P1)

`Rail` é o trilho horizontal virtualizado: com centenas de itens, só a
janela visível (mais um pequeno buffer) existe no DOM a qualquer momento,
com fade de borda e indicador de quanto falta rolar.

**Why this priority**: performance é constraint explícita da Spec V14
(§17, §30) e da constitution — um `Rail` que monta tudo de uma vez trava a
TV de referência com uma lista real de canais/filmes. É o único
componente desta feature com risco de desempenho real, e o precedente
(virtualização de grade, feature 009) já provou que isso é necessário no
hardware-alvo.

**Independent Test**: renderizar um `Rail` com uma lista sintética de 500
itens, mover o foco/scroll até o fim, e contar quantos nós de item existem
no DOM em cada momento.

**Acceptance Scenarios**:

1. **Given** um `Rail` com 500 itens, **When** ele é renderizado pela
   primeira vez, **Then** só os itens da janela visível (mais buffer)
   existem no DOM — nunca os 500.
2. **Given** um `Rail` parcialmente rolado, **When** o foco avança além da
   janela atual, **Then** novos itens são montados e os que saíram da
   janela (fora do buffer) são desmontados.
3. **Given** um `Rail` com conteúdo além da borda visível, **When**
   renderizado, **Then** um indicativo visual de continuação aparece
   (fade e/ou indicador de posição).
4. **Given** um `Rail` sem nenhum item, **When** renderizado, **Then** o
   componente não desenha nada (nem trilho vazio, nem placeholder) — rail
   vazio não aparece.

---

### User Story 4 - Cards de conteúdo nas quatro proporções do catálogo (Priority: P2)

`ContentCard` cobre as quatro proporções do catálogo (portrait, landscape,
wide, compact) sobre o `PosterArt` existente; `ChannelRow` cobre a lista
compacta de canal (número, logo, nome, "Agora", progresso).

**Why this priority**: é o componente visualmente mais usado nas telas
futuras (grades de Filmes/Séries, listas de canais, rails da Home), mas
sem o risco comportamental do Modal/EmptyState/Rail — é composição sobre
peças que já existem e funcionam (`PosterArt`, tokens).

**Independent Test**: renderizar `ContentCard` nas 4 proporções com dados
sintéticos (com e sem capa) e `ChannelRow` com e sem programação "Agora",
conferindo geometria estável (sem *layout shift*) e badges corretos.

**Acceptance Scenarios**:

1. **Given** um `ContentCard` portrait com capa, **When** renderizado,
   **Then** a proporção 205×302 é respeitada e a capa aparece via
   `PosterArt`.
2. **Given** um `ContentCard` sem capa, **When** renderizado, **Then** o
   placeholder do `PosterArt` aparece, nunca um espaço vazio nem o ícone
   nativo de imagem quebrada.
3. **Given** um `ContentCard` com badge de progresso ou "assistido",
   **When** renderizado, **Then** o badge aparece sem sobrepor o título.
4. **Given** um `ChannelRow` sem informação de "Agora" (sem EPG), **When**
   renderizado, **Then** o slot correspondente existe reservado e vazio —
   nunca "0" nem texto inventado.
5. **Given** os quatro tipos de `ContentCard` lado a lado, **When**
   comparados, **Then** nenhum usa uma proporção fora das quatro definidas
   (constitution: fonte de dado real, geometria estável).

---

### User Story 5 - Navegar entre categorias e abas sem lógica de catálogo (Priority: P2)

`SideCategoryNav` (lista lateral de categorias, com contagem opcional e
indicação de entrada fixa) e `Tabs` (seções irmãs, ex.: Episódios/
Detalhes/Elenco) são componentes burros — recebem tudo via props.

**Why this priority**: estrutura de navegação que toda tela de categoria
(Live/Filmes/Séries) e toda tela de detalhe (filme/série) vai reaproveitar
na Onda 2+, mas sem risco comportamental novo (a navegação por
setas/SELECT já é resolvida pelo `useRemoteNav` existente, reaproveitado
aqui, não reinventado).

**Independent Test**: renderizar `SideCategoryNav` com uma lista de
entradas sintéticas (algumas marcadas como fixas, com e sem contagem) e
`Tabs` com 3 abas, navegando por setas e conferindo o `onSelect`.

**Acceptance Scenarios**:

1. **Given** uma lista de entradas com 2 marcadas como fixas, **When**
   `SideCategoryNav` renderiza, **Then** as fixas aparecem sempre no topo,
   na ordem recebida, com o indicador visual de "fixa".
2. **Given** uma entrada sem contagem informada, **When** renderizada,
   **Then** nenhum número aparece (nunca "0" inventado).
3. **Given** `Tabs` com 3 abas, **When** as setas laterais movem o foco,
   **Then** o `onSelect` correspondente dispara ao ativar por SELECT, sem
   trocar de conteúdo só por mover o foco (constitution: focar não ativa).

---

### User Story 6 - Ações e status com um único vocabulário visual (Priority: P3)

`Button` (primary-pill, secondary, ghost, accent), `IconButton` e `Chip`
cobrem toda ação/seleção curta das telas futuras.

**Why this priority**: puramente presentacional, sem lógica de estado
própria além de disabled/loading — menor risco da feature, mas usado em
quase toda tela futura.

**Independent Test**: renderizar cada variante de `Button`, `IconButton` e
`Chip`, incluindo estados disabled e loading, conferindo foco/ativação.

**Acceptance Scenarios**:

1. **Given** as 4 variantes de `Button`, **When** renderizadas lado a
   lado, **Then** cada uma usa exatamente os tokens da sua variante (cor
   de fundo, texto, raio pill), sem literal.
2. **Given** um `Button` em estado loading, **When** renderizado, **Then**
   ele comunica ocupado sem inventar progresso, e não é ativável enquanto
   ocupado.
3. **Given** um `IconButton` sem texto ao lado, **When** focado, **Then**
   expõe um rótulo acessível (via `Icon` com `label`, feature 021).
4. **Given** um `Chip` selecionado e um não selecionado, **When**
   comparados, **Then** a diferença nunca depende só de cor.

---

### User Story 7 - Feedback de sistema sem inventar dado (Priority: P3)

`Spinner` (20/32/48px), `Skeleton` (mesma geometria do item real) e
`OfflineBanner` (detecção real de `navigator.onLine` + eventos, nunca só
um prop estático).

**Why this priority**: presentacional na maior parte, com uma peça de
lógica real (`OfflineBanner`), mas sem consumidor ainda — prioridade baixa
frente ao que bloqueia foco (US1–3).

**Independent Test**: renderizar os 3 tamanhos de `Spinner`; renderizar
`Skeleton` ao lado do item real correspondente conferindo geometria
idêntica; alternar `navigator.onLine`/eventos `online`/`offline` num
ambiente de teste e conferir que `OfflineBanner` aparece/some.

**Acceptance Scenarios**:

1. **Given** os 3 tamanhos de `Spinner`, **When** renderizados, **Then**
   nenhum comunica percentual — só ocupado, indeterminado.
2. **Given** um `Skeleton` de um `ContentCard` portrait, **When**
   comparado ao card real, **Then** a geometria (altura/largura) é
   idêntica — zero deslocamento quando o conteúdo real substitui o
   skeleton.
3. **Given** o navegador reportando offline, **When** `OfflineBanner` está
   montado, **Then** ele aparece com uma ação de "Testar conexão".
4. **Given** o navegador voltando a ficar online, **When** o evento
   dispara, **Then** o banner some sozinho, sem exigir ação da pessoa.

---

### User Story 8 - Um campo de texto que aciona o teclado nativo certo (Priority: P3)

`TextField` isolado, com rótulo permanente, mensagem de erro, e atributos
`inputmode`/`autocomplete`/`type` corretos conforme o propósito do campo
(busca, URL, usuário, senha).

**Why this priority**: sem consumidor real ainda (a tela de adicionar
fonte, que mais se beneficiaria, só migra na Onda 2+), e o componente é
simples — mas todo formulário futuro depende dele existir primeiro.

**Independent Test**: renderizar `TextField` com cada `purpose` (busca,
URL, usuário, senha) e conferir os atributos HTML resultantes; renderizar
com erro e conferir associação `aria-describedby`.

**Acceptance Scenarios**:

1. **Given** um `TextField` de propósito "senha", **When** renderizado,
   **Then** usa `type="password"` e `autocomplete="current-password"`.
2. **Given** um `TextField` com erro, **When** renderizado, **Then** a
   mensagem de erro é associada ao campo para tecnologia assistiva, e o
   campo indica visualmente o estado de erro sem depender só de cor.
3. **Given** um `TextField` de propósito "busca", **When** renderizado,
   **Then** usa `inputmode="search"`.
4. **Given** um `TextField` com o rótulo, **When** o campo está vazio,
   **Then** o rótulo continua visível (nunca só placeholder que some ao
   digitar).

---

### User Story 9 - Funcionalidade ainda não construída nunca finge ser real (Priority: P3)

`ComingSoon` (componente) mais `comingSoon.ts` (registro central):
qualquer controle ou tela ainda não implementada aparece com aparência
reduzida, focável, e OK explica o que falta — nunca com conteúdo
inventado.

**Why this priority**: é a peça que operacionaliza a política de mock da
ADR-011/migração; sem ela pronta, as Ondas seguintes reinventariam essa
solução tela a tela. Baixo risco técnico, mas obrigatório existir antes de
qualquer mock real ser criado.

**Independent Test**: registrar uma entrada fictícia em `comingSoon.ts`,
renderizar `ComingSoon` com esse id, e conferir mensagem, foco e ativação
de OK.

**Acceptance Scenarios**:

1. **Given** um id registrado em `comingSoon.ts` com mensagem e item do
   backlog, **When** `ComingSoon` renderiza com esse id, **Then** mostra a
   mensagem "Em breve" associada, focável.
2. **Given** um `ComingSoon` focado, **When** SELECT é pressionado,
   **Then** dispara o retorno visual (toast/modal curto) descrito na
   spec da migração — nunca abre uma funcionalidade real.
3. **Given** um id não registrado em `comingSoon.ts`, **When** alguém tenta
   renderizar `ComingSoon` com ele, **Then** o erro aparece em tempo de
   desenvolvimento (não em produção silenciosa) — decisão de mecanismo
   exata cabe ao `sdd-plan`.
4. **Given** o registro `comingSoon.ts`, **When** inspecionado, **Then**
   cada entrada aponta para um item numerado do backlog (`.planning/
   backlog.md`), nunca uma referência solta.

### Edge Cases

- **Foco perdido ao fechar o Modal** se o elemento que o abriu não existir
  mais (ex.: a lista por trás mudou enquanto o modal estava aberto): o
  foco cai num destino de recuperação razoável (ex.: o container da tela),
  nunca em `<body>`/lugar nenhum. **Emenda (converge 2026-09-26):** como o
  estado de foco da tela por trás nunca muda enquanto o `Modal` intercepta o
  teclado, não há foco a "perder" no fechamento; se a lista mudou por baixo,
  a reconciliação por id é da própria tela (constitution, "Voltar Restaura
  Foco e Posição"), não do `Modal`.
- **Dois `ErrorState`/`EmptyState` na mesma tela** (não deveria acontecer,
  mas o componente não pode presumir que é o único foco possível da
  página): cada instância se comporta corretamente mesmo se houver mais de
  uma, sem assumir singleton global (diferente do `Modal`, que é
  singleton por design).
- **`Rail` com 1 único item**: renderiza normalmente, sem indicador de
  continuação (não há para onde rolar).
- **`ContentCard` com título muito longo**: trunca de forma legível, sem
  quebrar a geometria fixa do card.
- **`ChannelRow` sem logo**: mesma regra do `PosterArt` — placeholder
  reservado, nunca o ícone nativo de imagem quebrada.
- **`OfflineBanner` montado sem que o navegador suporte os eventos
  `online`/`offline`**: assume o estado inicial de `navigator.onLine` e
  não quebra; degrada sem re-verificar automaticamente (ainda pode
  funcionar via a ação manual "Testar conexão", que é do consumidor).
- **`TextField` com `purpose` não reconhecido**: cai num padrão neutro
  (texto simples), nunca lança nem quebra a tela.
- **`SideCategoryNav` com zero entradas**: não é um estado que o
  componente precisa tratar como especial — ele só renderiza o que
  recebe; uma lista vazia é responsabilidade de quem monta as entradas
  (ex.: mostrar um `EmptyState` no lugar).

## Requirements *(mandatory)*

### Functional Requirements

**Transversais**

- **FR-001**: Todo componente desta feature DEVE consumir exclusivamente
  os tokens da feature 021 — nenhuma cor, raio, espaçamento, sombra,
  duração de animação ou tamanho de fonte literal.
- **FR-002**: Todo componente com estado de foco DEVE usar a receita de
  foco existente (`.tv-focus`/`:focus`) ou `.no-scale` quando a geometria
  não puder mudar (feature 021) — nunca uma receita de foco própria.
- **FR-003**: Nenhum componente desta feature DEVE ser consumido por
  nenhuma tela existente (`features/*Screen.tsx`) nesta feature.
- **FR-004**: Nenhum componente desta feature DEVE ler `catalogRepository`,
  `userStateRepository` ou qualquer fonte de dado real — tudo por props.
- **FR-005**: Todo componente interativo DEVE expor nome acessível (texto
  visível, ou `aria-label` quando só ícone).

**US1 — Modal**

- **FR-006**: `Modal` DEVE, ao abrir, colocar o foco no primeiro elemento
  focável do seu conteúdo, sem exigir uma ação adicional.
  **Emenda (converge 2026-09-26):** o `Modal` DEVE interceptar o teclado
  desde o primeiro evento após abrir, sem exigir ação adicional; o foco
  visível dentro do conteúdo é de estado e do consumidor (ver US1/AC1).
- **FR-007**: `Modal` DEVE fechar ao receber RETURN, devolvendo o foco ao
  elemento que o abriu (ou a um destino de recuperação, se esse elemento
  não existir mais). **Emenda (converge 2026-09-26):** "devolver" acontece
  por construção — o estado de foco da tela por trás não muda enquanto o
  `Modal` está aberto —, sem `.focus()` de DOM nem destino de recuperação no
  `Modal`.
- **FR-008**: `Modal` NÃO DEVE permitir foco em elementos fora dele
  enquanto estiver aberto.
- **FR-009**: `Modal` NÃO DEVE permitir duas instâncias visíveis ao mesmo
  tempo.

**US2 — EmptyState/ErrorState**

- **FR-010**: `EmptyState` DEVE renderizar com pelo menos uma ação
  focável e ativável por SELECT.
- **FR-011**: `ErrorState` DEVE aceitar 1 ou 2 ações, cada uma
  independentemente focável e ativável.
- **FR-012**: `ErrorState` DEVE aceitar um código curto opcional, exibido
  de forma discreta, nunca como elemento mais destacado.
- **FR-013**: Nem `EmptyState` nem `ErrorState` DEVEM comunicar seu estado
  só por cor.

**US3 — Rail**

- **FR-014**: `Rail` DEVE virtualizar: só a janela visível mais um buffer
  pequeno existe no DOM, independente do total de itens.
- **FR-015**: `Rail` DEVE indicar visualmente quando há conteúdo além da
  borda (fade e/ou indicador de posição).
- **FR-016**: `Rail` sem itens NÃO DEVE renderizar nada visível.

**US4 — ContentCard/ChannelRow**

- **FR-017**: `ContentCard` DEVE suportar as 4 proporções (portrait
  205×302, landscape 292×164, wide 356×200, compact 250×126) com geometria
  fixa por variante (sem *layout shift* ao carregar a capa).
- **FR-018**: `ContentCard` DEVE renderizar a capa via `PosterArt`
  existente, sem duplicar a lógica de fallback dele.
- **FR-019**: `ChannelRow` DEVE reservar o espaço do slot "Agora" mesmo
  sem dado, sem exibir "0" nem texto inventado.

**US5 — SideCategoryNav/Tabs**

- **FR-020**: `SideCategoryNav` DEVE aceitar uma lista de entradas via
  props (rótulo, ícone opcional, contagem opcional, se é fixa) e um índice
  selecionado, emitindo um evento de seleção — sem conhecer o significado
  de nenhuma entrada específica.
- **FR-021**: `SideCategoryNav` DEVE manter entradas marcadas como fixas
  sempre no topo, na ordem recebida.
- **FR-022**: `Tabs` DEVE mudar o conteúdo associado só por ativação
  (SELECT), nunca só por mover o foco.

**US6 — Button/IconButton/Chip**

- **FR-023**: `Button` DEVE suportar as 4 variantes visuais (primary-pill,
  secondary, ghost, accent) e os estados disabled/loading.
- **FR-024**: `Button` em loading NÃO DEVE ser ativável, e NÃO DEVE
  mostrar percentual de progresso algum.
- **FR-025**: `IconButton` DEVE expor rótulo acessível sempre, mesmo sem
  texto visível ao lado.
- **FR-026**: `Chip` DEVE comunicar selecionado/não selecionado por mais
  de um sinal visual (nunca só cor).

**US7 — Spinner/Skeleton/OfflineBanner**

- **FR-027**: `Spinner` DEVE existir nos 3 tamanhos (20/32/48px) e nunca
  comunicar percentual.
- **FR-028**: `Skeleton` DEVE reproduzir a mesma geometria (altura/
  largura) do item real correspondente.
- **FR-029**: `OfflineBanner` DEVE refletir o estado real de conectividade
  (`navigator.onLine` e os eventos `online`/`offline`), nunca só um valor
  estático recebido por prop.

**US8 — TextField**

- **FR-030**: `TextField` DEVE aplicar `inputmode`/`type`/`autocomplete`
  corretos conforme o `purpose` recebido (busca, URL, usuário, senha, ou
  neutro).
- **FR-031**: `TextField` DEVE manter o rótulo sempre visível, não
  substituível por um placeholder que desaparece ao digitar.
- **FR-032**: `TextField` com erro DEVE associar a mensagem de erro ao
  campo para tecnologia assistiva, e sinalizar o erro por mais de um sinal
  visual.

**US9 — ComingSoon**

- **FR-033**: `comingSoon.ts` DEVE manter um registro único, com cada
  entrada apontando para um item numerado do backlog.
- **FR-034**: `ComingSoon` DEVE renderizar com aparência reduzida (soft
  disabled), focável, sem nenhum dado inventado (nota, contagem, sinopse).
- **FR-035**: `ComingSoon` ativado por SELECT DEVE comunicar "Em breve"
  sem abrir nenhuma funcionalidade real.

### Key Entities

- **Entrada de categoria** (prop de `SideCategoryNav`): rótulo, ícone
  opcional, contagem opcional, indicador de fixa — sem significado de
  domínio (não sabe o que é "Favoritos").
- **Registro de mock** (`comingSoon.ts`): id único, mensagem exibida,
  referência ao item numerado do backlog que a substitui quando
  implementado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos 16 componentes têm pelo menos um teste renderizando
  cada estado aplicável (default/focused/disabled/loading/error), isolado
  de qualquer tela real.
- **SC-002**: Com 500 itens sintéticos, o `Rail` nunca monta mais do que a
  janela visível mais um buffer pequeno no DOM, medido diretamente
  (contagem de nós), em nenhum momento da navegação.
- **SC-003**: Zero ocorrência de cor/raio/espaçamento/fonte literal nos
  arquivos CSS/TSX novos desta feature (conferido por revisão do código —
  todo valor visual é um token).
- **SC-004**: `EmptyState`/`ErrorState`/`ComingSoon` renderizados em
  qualquer combinação de props sempre têm pelo menos um elemento
  ativável por SELECT.
- **SC-005**: `ContentCard`/`Skeleton` da mesma variante têm dimensões
  idênticas (0 px de diferença), medido em teste.
- **SC-006**: Nenhuma tela existente (`features/*Screen.tsx`) é alterada
  por esta feature.
- **SC-007**: Todos os testes automatizados e roteiros E2E existentes
  continuam passando sem edição de asserção (mesma disciplina da feature
  021).

## Assumptions

- O `sdd-plan` decide onde o CSS novo destes componentes vive (um arquivo
  por componente, ou um `components.css` só deles) — não é uma decisão de
  produto, é arquitetura.
- O mecanismo exato de "no máximo um Modal aberto" (singleton reutilizado
  vs. substituição do pedido anterior) e de "id não registrado em
  `comingSoon.ts`" (erro em tempo de build vs. `throw` em runtime só em
  `import.meta.env.DEV`) ficam para o `sdd-plan` decidir — o efeito
  observável (nunca dois modais, nunca um `ComingSoon` sem registro em
  produção) é o requisito real.
- `Rail` reaproveita `@tanstack/react-virtual` (já dependência do projeto
  desde a feature 009), na orientação horizontal, em vez de uma
  implementação de virtualização própria — decisão técnica confirmada na
  entrevista, detalhada no `sdd-plan`.
- `Modal` reaproveita o mecanismo de `useRemoteNav({modal:true})` que
  `PlayerLayer` já usa para escopo de foco modal — decisão técnica
  confirmada na entrevista, detalhada no `sdd-plan`.
- A tela de "Sobre & créditos" (onde a atribuição das fontes OFL da
  feature 021 vai aparecer) e qualquer formulário real com `TextField`
  encadeado continuam fora do escopo: chegam só quando uma tela de fato
  migrar (Onda 2+).

## Clarifications

### Sessão 2026-09-26

- Q: Os testes desta feature tocam alguma tela real (`LiveScreen` etc.)?
  → A: Não. 100% isolado — cada componente é testado sozinho, como
  `Icon`/`Stage` na feature 021 (FR-003).
- Q: Como `ContentCard` se relaciona com o `PosterArt` já existente
  (feature 015)? → A: `ContentCard` envolve o `PosterArt`, adicionando
  moldura/badges/proporções por cima, sem reescrever a lógica de
  imagem/fallback (FR-018).
- Q: `SideCategoryNav` conhece favoritos/histórico/categorias reais? → A:
  Não — componente burro, só props; a lógica de dados é de quem for
  consumi-lo na Onda 2+ (FR-020).
- Q: O `Toast` (já pronto desde a feature 021) recebe algum ajuste visual
  nesta onda? → A: Não — fica exatamente como está, fora do escopo desta
  feature.
- Q: O foco do `Modal` (abre focado, RETURN fecha, foco volta a quem
  abriu) é comportamento real desta feature? → A: Sim, com o mesmo
  mecanismo de `useRemoteNav({modal:true})` que `PlayerLayer` já usa
  (FR-006–FR-008; Assumptions).
- Q: `TextField` já encadeia vários campos de um formulário (`Servidor →
  Usuário → Senha → Done`)? → A: Não — só o campo isolado nesta feature;
  o encadeamento é de um formulário real futuro (Fora de Escopo).
- Q: `Rail` já virtualiza de verdade, ou só scroll simples por agora? →
  A: Virtualiza de verdade, reaproveitando `@tanstack/react-virtual`
  (mesma técnica da feature 009) (FR-014; Assumptions).
- Q: Como priorizar as 9 user stories? → A: Por risco de foco/
  acessibilidade — P1 = Modal, EmptyState/ErrorState, Rail; P2 =
  ContentCard/ChannelRow, SideCategoryNav/Tabs; P3 = Button/IconButton/
  Chip, Spinner/Skeleton/OfflineBanner, TextField, ComingSoon.
