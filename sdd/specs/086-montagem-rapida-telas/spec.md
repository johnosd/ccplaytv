# Feature Specification: Montagem rápida das telas principais com seleções guardadas

**Slug**: `086-montagem-rapida-telas`

**Created**: 2026-10-20

**Status**: Convergida

**Input**: "As principais telas, como a tela de home, a tela de filmes e a tela de séries, ainda têm as montagens demoradas.
Gostaria de usar essa skill nova de sonda para medir, entender e propor uma nova solução para que as montagens dessas telas
principais sejam rápidas e eficientes, tanto do ponto de vista de velocidade, performance e eficiência no uso de memória."
Emendado na mesma sessão: "foquem também bastante na renderização da tela"; "pense na velocidade, se é possível ser mais
rápido e manter os dados"; "numa sessão em que o usuário está logado em uma lista, ela precisa ser atualizada — cuidado para
que, ao mesmo tempo que a gente guarde informação, a gente não perca a atualização"; "utilizamos algumas APIs (top 10, mais
assistidos) e isso pode ser motivo de lentidão... normalmente o top 10 é da semana, então não precisamos atualizar todo dia".

Avaliação de origem: `sdd/assessments/montagem-lenta-das-telas-principais-inicio/` (veredito `go`, 2026-10-20).

## Escopo

### Incluído

- As três telas principais: **Início**, **Filmes** e **Séries**.
- As fileiras hoje calculadas varrendo o catálogo inteiro do tipo — **Adicionados recentemente**, **Bem avaliados**,
  **Top 10**, **Dica** e **Porque você assistiu** — que passam a vir de uma seleção já calculada e guardada no aparelho.
- **Manter a seleção guardada atualizada durante a sessão**: quando a lista recebe conteúdo novo, as fileiras acompanham sem
  a pessoa precisar sair e voltar.
- As consultas a serviços externos (TMDB) que alimentam Top 10 e Dica: elas deixam de atrasar a montagem.
- A ordem e o momento das leituras da montagem, para a tela aparecer cedo **e com conteúdo**.
- **Renderização**: o tempo entre ter os dados e a tela estar desenhada, e o custo de navegar (mover o foco, rolar fileiras)
  depois de pronta.
- As capas da primeira tela: o card aparece no lugar certo na hora, a imagem preenche sem deslocar nada e o que está visível
  tem prioridade sobre o que ainda está abaixo da dobra.
- Medição na TV física, antes e depois, pelo canal de métricas do build de medição.

### Fora de Escopo

- Desenho visual, ordem das fileiras na tela e quais fileiras existem.
- O motor de montagem da feature 079 (`stepAssembly`): o teto, a revelação em partes e os motivos de revelação continuam.
- A entrada numa categoria (o caso de 6,8 s medido em 2026-10-20) — frente separada.
- Trocar a política de validade do Top 10 (semanal) e da Dica (diária), que já existe e está correta.
- Guardar as imagens das capas no aparelho entre sessões.
- Reduzir o uso de memória do app como um todo; o alvo é a montagem destas três telas.
- A busca global e a tela "Todos" (feature 084), que têm frente própria no backlog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - As fileiras já vêm prontas e seguem atualizadas (Priority: P1)

Como alguém que abre o app, quero que Início, Filmes e Séries mostrem as fileiras calculadas imediatamente, sem reler todo o
catálogo — e que elas acompanhem a lista quando ela recebe conteúdo novo, mesmo com a tela aberta.

**Why this priority**: é o núcleo, e guardar dado só é aceitável se vier junto com a garantia de atualização. Hoje cada
abertura varre 43 510 filmes e 9 768 séries para escolher 24 cards.

**Independent Test**: com a lista real carregada, abrir as três telas e verificar que as fileiras aparecem preenchidas sem
varrer o tipo; depois, com a tela aberta, deixar a pré-carga trazer categorias novas e verificar que as fileiras se atualizam
sozinhas, sem mover o foco.

**Acceptance Scenarios**:

1. **Dado** um catálogo carregado e as seleções calculadas, **quando** a pessoa abre o Início, **então** "Adicionados
   recentemente" e "Bem avaliados" aparecem preenchidos sem que o app leia o catálogo inteiro.
2. **Dado** o mesmo catálogo, **quando** a pessoa abre Filmes ou Séries, **então** Top 10, Dica e "Porque você assistiu"
   também vêm da seleção guardada.
3. **Dado** a tela aberta **enquanto** a lista recebe categorias novas, **quando** o recálculo termina, **então** as fileiras
   passam a mostrar o conteúdo novo sem que a pessoa saia da tela, e sem mover o foco nem a rolagem.
4. **Dado** uma lista recém-adicionada, sem nada calculado, **quando** a pessoa abre o Início, **então** a tela aparece com o
   billboard e as fileiras baratas, e as calculadas entram assim que ficarem prontas.
5. **Dado** uma seleção guardada com um item que não está mais no aparelho, **quando** a fileira é montada, **então** esse
   item não aparece, e a fileira se corrige no próximo recálculo.

### User Story 2 - As telas aparecem cedo e com conteúdo (Priority: P2)

Como alguém que abre o app, quero que a tela apareça rápido já com conteúdo, sem ficar esperando leitura cara nem resposta de
serviço externo.

**Why this priority**: é o sintoma relatado. Depende da US1 para as fileiras caras, mas tem valor próprio: a ordem das
leituras e o tratamento da rede determinam se a revelação acontece com conteúdo ou pelo teto.

**Independent Test**: na TV, abrir cada tela pela primeira vez e conferir, pelo canal de métricas, que nenhuma revela pelo
teto e que o tempo está na meta — inclusive com a rede lenta ou indisponível.

**Acceptance Scenarios**:

1. **Dado** a lista real ativa, **quando** a pessoa abre o Início pela primeira vez na sessão, **então** a tela aparece com o
   billboard e ao menos uma fileira preenchida, dentro da meta.
2. **Dado** qualquer das três telas, **quando** ela aparece, **então** não foi o teto de espera que a revelou.
3. **Dado** que a consulta ao serviço externo do Top 10 está em andamento ou falhou, **quando** a tela é montada, **então**
   ela não espera por essa resposta.
4. **Dado** que a semana virou e o Top 10 novo ainda não chegou, **quando** a fileira é mostrada, **então** ela traz o da
   semana anterior e troca sozinha quando a resposta chegar, sem mover o foco.
5. **Dado** que a pré-carga está baixando categorias, **quando** uma fileira cobre só parte do catálogo, **então** o aviso de
   cobertura parcial continua correto.

### User Story 3 - A tela desenha e navega sem engasgo (Priority: P3)

Como alguém usando o controle remoto, quero que a tela termine de desenhar logo depois de ter os dados e que mover o foco ou
rolar as fileiras não engasgue.

**Why this priority**: separa o custo de **obter** o dado (US1 e US2) do custo de **desenhar** com ele. Mesmo com os dados
instantâneos, uma renderização cara mantém a sensação de lentidão.

**Independent Test**: na TV, medir o intervalo entre as leituras ficarem prontas e a tela estar desenhada, e os quadros
durante uma navegação roteirizada nas três telas, comparando com a linha de base da mesma sessão.

**Acceptance Scenarios**:

1. **Dado** que as leituras de uma tela ficaram prontas, **quando** a tela é desenhada, **então** o intervalo até estar
   pronta na tela está dentro da meta.
2. **Dado** qualquer das três telas já montada, **quando** a pessoa move o foco entre cards e entre fileiras, **então** a
   navegação não produz mais quadros longos que a linha de base.
3. **Dado** uma fileira que entra depois da revelação, **quando** ela aparece, **então** as fileiras já na tela não são
   redesenhadas por causa disso.

### User Story 4 - A primeira tela primeiro, o resto conforme desce (Priority: P4)

Como alguém que abre uma tela e só depois rola para baixo, quero que o app gaste o esforço inicial no que está visível — as
capas da primeira tela — e só prepare as fileiras de baixo conforme eu for descendo.

**Why this priority**: acabamento e eficiência, não bloqueio. Na medição, só 3 de 17 capas estavam prontas na revelação.
Parte disso já existe (a pilha das vitrines e os cards de cada fileira são virtualizados, e as capas usam carregamento
preguiçoso); o que falta é **prioridade explícita** para o que está visível e a garantia de que o que está fora da vista não
disputa recursos com ele.

**Independent Test**: na TV, abrir as três telas e registrar quantas capas da primeira tela ficam prontas até 1 s depois da
revelação, sem nenhum card mudar de posição; depois rolar até o fim e verificar que as fileiras de baixo só se preparam ao
se aproximarem da vista.

**Acceptance Scenarios**:

1. **Dado** a revelação de qualquer das três telas, **quando** a capa de um card ainda não chegou, **então** o card já ocupa
   sua posição final e a imagem entra dentro dele.
2. **Dado** a primeira tela, **quando** as capas chegam, **então** nenhum card muda de posição e o foco permanece onde está.
3. **Dado** uma tela recém-aberta, **quando** as capas são buscadas, **então** as da primeira tela têm prioridade sobre as
   das fileiras que ainda não estão visíveis.
4. **Dado** que a pessoa rola para baixo, **quando** uma fileira se aproxima da vista, **então** ela se prepara nesse momento,
   e não na abertura da tela.

### Edge Cases

- **Lista recém-adicionada, nada calculado**: a tela abre sem as fileiras calculadas; elas entram quando ficarem prontas.
- **Tela aberta durante a pré-carga**: as fileiras se atualizam conforme o recálculo avança, sem mover o foco.
- **Categoria escondida ou travada com PIN**: itens dela nunca aparecem; a mudança reflete na próxima vez que a tela abrir.
- **Item liberado pelo orçamento de armazenamento (082)**: é descartado na leitura e sai da fileira no próximo recálculo.
- **Seleção guardada defasada** (app fechado no meio de uma carga): a fileira mostra o que está guardado e se corrige ao
  recalcular; nunca fica vazia por dúvida.
- **Troca da lista ativa**: cada lista tem sua seleção; trocar nunca mostra conteúdo da outra.
- **Lista apagada**: a seleção guardada dela sai junto.
- **Sem chave TMDB**: Top 10 e Dica continuam não existindo, e nada é guardado nem consultado para elas.
- **Serviço externo fora do ar, lento ou recusando a chave**: a tela aparece igual; a fileira traz o último conteúdo guardado
  ou não aparece, como hoje.
- **Semana virada sem resposta nova**: a fileira mostra a semana anterior até a resposta chegar.
- **Catálogo vazio ou sem itens com nota**: as fileiras continuam ausentes, sem fileira vazia na tela.
- **Geração do catálogo trocada** (nova sincronização): seleção de geração anterior não é usada.

## Requirements *(mandatory)*

### Functional Requirements

**Seleções guardadas (US1)**

- **FR-001**: As fileiras calculadas (Adicionados recentemente, Bem avaliados, Top 10, Dica, Porque você assistiu) DEVEM ser
  montadas a partir de uma seleção já calculada e guardada no aparelho, por lista e por tipo.
- **FR-002**: A abertura de Início, Filmes e Séries NÃO DEVE percorrer o catálogo inteiro de um tipo para montar essas fileiras.
- **FR-003**: A seleção guardada DEVE ser recalculada ao fim de cada carga por seção e de cada carga de categoria, junto com a
  gravação já em andamento, e nunca na abertura da tela.
- **FR-004**: O conteúdo das fileiras montadas a partir da seleção guardada DEVE ser o mesmo que a varredura atual produz para
  o mesmo catálogo — **mesmos itens, mesma quantidade, mesma ordem e mesmos critérios de desempate**.
- **FR-005**: A seleção guardada NUNCA DEVE conter item de categoria escondida ou travada por PIN. Esconder, mostrar ou travar
  uma categoria DEVE refletir nas fileiras na próxima vez que a tela abrir.
- **FR-006**: A seleção guardada DEVE registrar quantas categorias do tipo ela cobre, para o aviso de cobertura parcial
  continuar correto durante a pré-carga.
- **FR-007**: Sem seleção guardada válida para a lista e o tipo, a tela DEVE aparecer sem as fileiras calculadas, que entram
  quando ficarem prontas, sem deslocar o foco nem a rolagem.

**Atualização e frescor (US1)**

- **FR-008**: Com a tela aberta, o fim de um recálculo DEVE atualizar as fileiras **na própria sessão**, sem a pessoa sair e
  voltar, e sem mover o foco nem a posição de rolagem.
- **FR-009**: Uma seleção guardada DEVE pertencer à geração ativa do catálogo da lista; seleção de geração anterior não é
  usada. Apagar a lista DEVE apagar a seleção dela.
- **FR-010**: Um item presente na seleção guardada que não está mais no aparelho DEVE ser descartado na montagem da fileira, e
  a seleção corrigida no recálculo seguinte.
- **FR-011**: Quando o orçamento de armazenamento liberar itens, a seleção guardada afetada DEVE ser recalculada.
- **FR-012**: Nenhum caminho desta feature DEVE exigir que a pessoa peça "Atualizar" para ver conteúdo que a lista já tem.

**Serviços externos (US2)**

- **FR-013**: A montagem das três telas NÃO DEVE esperar por consulta a serviço externo. A tela aparece com o conteúdo
  guardado, e a fileira se atualiza quando a resposta chegar.
- **FR-014**: A consulta ao serviço externo dessas fileiras DEVE acontecer fora da abertura da tela, em segundo plano.
- **FR-015**: Com o período vencido (semana do Top 10, dia da Dica) e sem resposta nova, a fileira DEVE mostrar o conteúdo
  guardado do período anterior, trocando sozinha quando a resposta chegar, sem aviso técnico na tela e sem mover o foco.
- **FR-016**: Serviço fora do ar, lento, recusando a chave ou sem chave NÃO DEVE atrasar nem esvaziar a montagem.

**Revelação e renderização (US2, US3)**

- **FR-017**: Na abertura comum das três telas, a revelação NÃO DEVE acontecer pelo teto de espera.
- **FR-018**: Uma fileira que fica pronta depois da revelação DEVE entrar sem mudar o foco nem a posição de rolagem, e sem
  provocar o redesenho das fileiras já na tela.
- **FR-019**: O tempo entre as leituras de uma tela ficarem prontas e a tela estar desenhada DEVE ser medido por tela e ficar
  dentro da meta.
- **FR-020**: Mover o foco e rolar as fileiras nas três telas NÃO DEVE produzir mais quadros longos que a linha de base medida
  na mesma sessão.
- **FR-021**: A montagem NÃO DEVE reter o conjunto de itens de um tipo em memória durante a abertura das telas.

**Primeira tela e capas (US4)**

- **FR-022**: Um card DEVE ocupar sua posição final assim que a tela aparece; a capa preenche dentro dele, sem deslocar os
  demais cards.
- **FR-023**: As capas da primeira tela DEVEM ter prioridade de carregamento sobre as das fileiras ainda não visíveis.
- **FR-024**: Fileiras fora da primeira tela NÃO DEVEM pedir capas nem preparar conteúdo na abertura; elas se preparam quando
  se aproximam da vista, conforme a pessoa desce.
- **FR-025**: O que já existe hoje — a pilha vertical virtualizada das vitrines, os cards virtualizados de cada fileira e o
  carregamento preguiçoso das capas — DEVE ser preservado; esta feature acrescenta a prioridade, não a substitui.

**Medição e preservação**

- **FR-026**: O build de medição DEVE registrar, por tela: o tempo de cada leitura da montagem, o tempo até estar desenhada, o
  pico de memória da abertura, os quadros da navegação e quantas capas da primeira tela ficaram prontas — pelo canal de
  métricas já existente. O build normal NÃO DEVE enviar nada.
- **FR-027**: A medição por leitura na TV DEVE ser feita **antes** de mudar o desenho, para a decisão recair sobre a leitura
  que de fato pesa.
- **FR-028**: O comportamento das demais telas e das fileiras não calculadas (billboard, Continuar assistindo, Minha Lista,
  Canais, prévias de categoria) DEVE permanecer como está.

### Key Entities

- **Seleção de fileiras**: o que uma lista e um tipo precisam para montar as fileiras calculadas — os itens já escolhidos de
  cada fileira, na ordem em que aparecem, mais a cobertura (quantas categorias entraram) e a geração do catálogo a que
  pertence. É derivada: pode ser descartada e recalculada a qualquer momento sem perda de informação da pessoa.
- **Conteúdo externo do período**: o resultado guardado da consulta ao serviço externo (Top 10 da semana, Dica do dia), com o
  período a que pertence, usado enquanto o período seguinte não chega.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Medidos na TV física, com a lista real, em pelo menos 2 aberturas, pelo canal de métricas do build de medição.

- **SC-001**: O Início aparece **com conteúdo** (billboard e ao menos uma fileira preenchida) em **≤ 1 s** na primeira
  abertura. Linha de base: ~2 047 ms e vazio.
- **SC-002**: Nenhuma das três telas revela pelo teto de espera na abertura comum. Linha de base: o Início revelou pelo teto
  nas duas medições.
- **SC-003**: Filmes e Séries aparecem em **≤ 1 s** com no máximo 2 leituras pendentes. Linha de base: ~0,37 s com 2 a 6.
  **Atualização (T085, 2026-10-21, autorizada pelo usuário)**: a contagem passa a ser de **leituras locais** pendentes.
  Motivo: o critério foi escrito antes de existir o slot `external` (FR-013), e uma leitura de serviço externo **por
  desenho** não segura a tela — contá-la premiaria exatamente o comportamento que a feature quis eliminar.
  **Medido com o critério novo e ainda reprovado**: a 1ª abertura tem **3** locais pendentes (`continue`, `favorites`,
  `categories`) contra a meta de 2; o tempo passa com folga (313–380 ms). A emenda esclareceu o critério, **não** o fez
  passar.
- **SC-004**: Montar as fileiras calculadas de um tipo custa **≤ 100 ms**. Linha de base: ~300 ms no PC para filmes,
  estimados ~1,2 s na TV.
- **SC-005**: Com a tela aberta durante uma atualização da lista, as fileiras passam a refletir o conteúdo novo **sem sair da
  tela**, e o foco e a rolagem permanecem onde estavam.
  **Atualização (T086, 2026-10-21)**: **não verificado**, por decisão do usuário. O mecanismo existe e está coberto por
  teste (`screenDocument.aviso.test.ts`: documento vencido → refresh → aviso → conteúdo novo, FR-008), mas o roteiro na
  TV não foi executado — então não há veredito sobre foco e rolagem, que é a parte que só a tela mostra.
- **SC-006**: Com o serviço externo indisponível ou lento, a abertura das três telas fica dentro das mesmas metas de tempo.
  **Atualização (T086, 2026-10-21)**: **não verificado** na TV, por decisão do usuário. Indício a favor, não prova: as
  leituras de serviço externo são slots `external` e a montagem não espera por elas (`screenAssembly.ts`), e nas 12
  aberturas medidas o `revealMs` não variou com elas pendentes (313–380 ms).
- **SC-007**: As fileiras calculadas mostram os mesmos itens, na mesma quantidade e ordem, que a varredura atual produz para o
  mesmo catálogo — verificável sem a TV.
- **SC-008**: O tempo entre as leituras ficarem prontas e a tela estar desenhada é registrado para as três telas e **não é
  maior** que a linha de base da mesma sessão.
  **Atualização (T087, 2026-10-21)**: **não verificável como escrito**. O registro existe (`paintMs`), mas a linha de
  base não produziu o número comparável: lá a 1ª Home revelava com **todas** as leituras pendentes, então não havia
  "leituras prontas" de onde contar. O que há: em reabertura, 1 ms nas duas medições; na 1ª abertura, 291–379 ms agora
  contra nada antes.
- **SC-009**: Numa navegação roteirizada nas três telas (mover foco entre cards e fileiras, rolar), os quadros longos **não
  aumentam** em relação à linha de base da mesma sessão.
  **Atualização (T087, 2026-10-21)**: **não verificável** com as amostras que temos — a linha de base e a validação têm
  durações muito diferentes (minutos contra ~14 min), e quadros longos acumulam com o tempo. A mediana melhorou (38
  contra ~32 fps), e isso é registro, não aprovação. Verificar exigiria um roteiro de duração fixa e cronometrada.
- **SC-010**: O pico de memória durante a abertura das três telas não é maior que o de hoje, medido na mesma sessão, e a
  montagem deixa de reter o conjunto do tipo (hoje: dezenas de MB por tipo).
  **Atualização (T087, 2026-10-21)**: **não verificável nesta TV** (R-010): `performance.memory` devolveu 10 MB fixos em
  todas as amostras de todas as sessões. A segunda metade do critério — a montagem não retém o conjunto do tipo — está
  provada pelo contrato C3 (a montagem não lê bloco do catálogo) e pela remoção de `blockItems` do `PreparedBlock`.
- **SC-011**: Nenhum card muda de posição quando uma capa chega, e o número de capas da primeira tela prontas até 1 s depois
  da revelação **aumenta** em relação à linha de base da mesma sessão. Linha de base: 3 de 17 na revelação.
- **SC-012**: Na abertura, nenhuma capa de fileira fora da primeira tela é pedida antes das da primeira tela; ao rolar, as
  fileiras de baixo se preparam conforme entram na vista.
  **Atualização (T087, 2026-10-21)**: **verificado por teste automatizado**, não na TV —
  `useScreenAssembly.capas-primeira-tela.test.tsx`. É onde o critério é observável com precisão: quais capas são
  pedidas e em que ordem. Na TV só se vê quantas ficaram prontas, que é o SC-011.
- **SC-013**: Sem regressão: a suíte unitária, os roteiros de tela das três telas e os testes de contrato travados das
  features 079, 065, 056, 066, 082 e 085 continuam passando.

## Assumptions

- A TV de referência é ~4× mais lenta que o PC em processamento (medição da 082); toda meta de tempo vale na TV, e a medição
  no PC serve de diagnóstico.
- O canal de métricas da feature 085 é reaproveitado; não é preciso criar outro caminho de medição.
- A TV física é **gate**, com duas passadas planejadas: linha de base (leituras, renderização, quadros e memória) antes de
  mudar o desenho, e validação no fim. Cada instalação pede autorização, e o pacote normal é reinstalado ao final.
- A política de validade do conteúdo externo já existe e está correta (Top 10 por semana, Dica por dia); esta feature muda
  **quando** a consulta acontece e **o que a tela faz enquanto espera**, não o período.
- A seleção guardada é um dado derivado e pequeno; é gravada como qualquer outro dado do catálogo e respeita o teto da 082.
- O risco de memória é preventivo: o usuário nunca viu a TV encerrar o app.
- "Primeira abertura" é a primeira montagem da tela na sessão, sem resultado em memória de visita anterior.
- A linha de base de renderização e de quadros ainda não existe: ela é medida na primeira passada na TV, antes de qualquer
  mudança (FR-024).

## Clarifications

### Sessão 2026-10-20

- Q: O que é "resolvido" para a abertura do Início? → A: ≤ 1 s já com conteúdo (hoje: ~2 s e vazia).
- Q: Qual eixo pesa mais? → A: Velocidade e memória juntos.
- Q: A tela pode aparecer em partes? → A: Sim, em partes, sem mover o foco.
- Q: Tamanho do trabalho aceito? → A: Feature completa.
- Q: As fileiras caras precisam estar prontas quando a tela aparece? → A: Sim, com dado guardado.
- Q: Quais telas? → A: As três (Início, Filmes e Séries).
- Q: Memória é risco observado? → A: Preventivo, o app nunca fechou sozinho.
- Q: Quando recalcular a seleção guardada? → A: Ao fim de cada carga de seção e de categoria.
- Q: Quando uma mudança de categoria escondida/PIN reflete? → A: Na próxima vez que a tela abrir.
- Q: Como fica o aviso de cobertura parcial? → A: Mantido, com a cobertura guardada junto da seleção.
- Q: As capas entram no escopo? → A: Sim, medir e melhorar junto.
- Q: O que resolve nas capas? → A: O card aparece na hora e a capa preenche sem pular.
- Q: E as outras fileiras da mesma varredura (Top 10, Dica, Porque você assistiu)? → A: Também vêm de dado guardado.
- Q: Primeira abertura de lista recém-adicionada? → A: A tela aparece sem as fileiras calculadas, que entram quando prontas.
- Q: Item liberado pelo orçamento que está na seleção? → A: Sai da fileira na próxima abertura.
- Q: A TV é gate? → A: Sim, com 2 passadas planejadas (linha de base e validação).
- Q: Mínimo para valer a pena? → A: As fileiras calculadas vindo de dado guardado.
- Q: O que incomoda na renderização? → A: Os dois — o tempo até estar desenhada e a navegação depois de pronta.
- Q: Quando a fileira guardada reflete uma atualização da lista durante a sessão? → A: Assim que o recálculo terminar, com a
  tela aberta, sem mover o foco.
- Q: "Manter os dados" — o que não pode mudar? → A: Mesmos itens e mesma quantidade de hoje.
- Q: Seleção guardada defasada? → A: Mostrar o guardado e corrigir ao recalcular.
- Q: A montagem pode esperar por consulta a serviço externo? → A: Não, nunca espera por rede.
- Q: Semana virada e Top 10 novo ainda não chegou? → A: Mostra o da semana anterior e troca quando chegar.
- Q: Quando a consulta externa deve acontecer? → A: Fora da abertura, em segundo plano.
- Q: As imagens da primeira página devem ter prioridade, com o resto renderizando conforme a pessoa desce? → A: Sim; o
  esforço inicial vai para o que está visível, e as fileiras de baixo se preparam ao se aproximarem da vista.
