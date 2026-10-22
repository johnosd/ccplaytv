# Feature Specification: tarefas longas fora do caminho de navegação das vitrines

**Slug**: `089-tarefas-longas-fora-navegacao`

**Created**: 2026-10-22

**Status**: Em Execução

**Input**: continuação direta da feature 088, convergida no mesmo dia pelo FR-008. A 088 mediu três rodadas na TV de
referência e **inocentou o caminho de navegação**: `tecla` 0,1%, `render` 4,5%, pintura de capa 10 ms. Sobraram
**95,4%** do tempo em que a thread fica presa **sem dono**, e nenhuma fonte conhecida explica. Esta feature nomeia esse
dono e o reduz.

## Escopo

### Incluído

- Nomear, com número do próprio aparelho, **qual** trabalho segura a thread nos 95,4% que a 088 não atribuiu.
- Reduzi-lo, em **qualquer** código do app que apareça na medição: estrutura de DOM dos cards, janela de
  virtualização, efeitos e consultas que rodam **depois** do primeiro quadro, timers, recálculo de layout e estilo
  provocado pelo nosso DOM.
- Consertar a sonda automática até ela fechar com `falhas = 0`, para as quatro janelas de cada rodada valerem.
- Reportar a abertura das telas e a entrada em categoria como critérios acompanhados, para garantir que não regridam.

### Fora de Escopo

- **O caminho de navegação em si** (manipulador de tecla, memoização do re-render entre a tecla e o primeiro quadro,
  decodificação/pintura de capa): a 088 provou que valem menos de 5% somados. Mexer neles aqui é trabalho sem retorno,
  e a evidência está em `sdd/specs/088-tarefas-longas-navegacao/evidencias/`.
- **Mover trabalho para Web Worker** e **mudar o formato de gravação do catálogo** (features 082/039): continuam
  exigindo decisão nova, com ADR se for o caso. Se a medição apontar para lá, esta feature encerra declarando.
- Reescrever componentes de tela por preferência de design.
- A produção do Top 10 e da Dica (feature 087) e a pré-carga: refutadas pela 088 com medianas planas.
- Melhorar o aparelho ou trocar o alvo de build.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nomear o dono dos 95,4% (Priority: P1)

Como quem vai decidir onde investir o esforço, quero saber **qual** trabalho segura a thread, com número do aparelho,
para não gastar outra feature otimizando o lugar errado — como já aconteceu duas vezes.

**Why this priority**: sem isso não existe alvo, e a 088 provou que escolher alvo por plausibilidade custa rodadas de
TV e produz conclusões falsas (duas vezes: a causa inventada da 087 e o "render é 23%" da rodada 1).

**Independent Test**: pode ser testada sozinha — ao final existe um registro que nomeia o trabalho dominante com
números, mesmo que nenhuma redução tenha sido aplicada.

**Acceptance Scenarios**:

1. A primeira medição reporta, para cada tarefa longa, **quanto tempo passou desde a última tecla**. Se os atrasos se
   concentrarem perto de zero, o trabalho é disparado pela navegação e acontece **depois** do primeiro quadro; se
   estiverem espalhados pelo intervalo entre teclas, não é a navegação. As duas leituras são conclusões válidas.
2. O trabalho dominante é nomeado e responde por uma fração **declarada com número** do tempo em que a thread fica
   presa.
3. Se a soma do que foi atribuído continuar muito abaixo do total, isso é dito explicitamente, e **uma** medida nova é
   acrescentada por rodada — nunca várias de uma vez.
4. Nenhuma otimização é aplicada antes de 2 estar cumprido.

### User Story 2 - Descer entre os cards sem engasgo (Priority: P1)

Como quem navega em Filmes e Séries na TV, quero mover o foco entre cards e fileiras sem a tela travar, para a
navegação acompanhar o controle.

**Why this priority**: é a queixa original, e a razão de existir das features 088 e 089. O teto não é hipótese: três
janelas limpas do próprio aparelho deram 55, 59 e 55 fps.

**Independent Test**: medida pela sonda de duração fixa, em duas rodadas independentes, contra a linha de base de
2026-10-22 (28% de thread presa, pior quadro 400 ms de mediana, 41 fps).

**Acceptance Scenarios**:

1. Navegando continuamente por 60 s em Filmes, a thread fica presa em tarefa longa em **menos de 15%** da janela, o
   pior quadro fica **abaixo de 300 ms** e o fps mediano fica **em 45 ou mais**.
2. O mesmo em Séries, no mesmo roteiro de duração fixa.
3. Os três números aparecem em **duas rodadas independentes** na mesma sessão — uma rodada sozinha não decide neste
   aparelho (ruído de ±2–3 fps).
4. A ordem de foco, o que SELECT faz, a rolagem e a restauração ao voltar continuam **iguais**.
5. Toda mudança com efeito visível é medida **e mostrada na TV ao usuário antes de permanecer** — inclusive a troca de
   fluidez por tempo de moldura visível, se ela aparecer.

### User Story 3 - A sonda mede as quatro janelas (Priority: P2)

Como quem paga cada rodada de TV com uma instalação e dez minutos, quero que a sonda cubra as quatro janelas que
promete, para não desperdiçar metade de cada rodada.

**Why this priority**: as três rodadas da 088 fecharam com `falhas = 2` — só Filmes foi medido de forma confiável.
Metade de cada rodada foi perdida, e o orçamento desta feature é de quatro rodadas.

**Independent Test**: a sonda roda e fecha com `falhas = 0`; verificável no PC antes de gastar instalação na TV.

**Acceptance Scenarios**:

1. A sonda alcança Filmes **e** Séries e fecha a rodada com `falhas = 0`.
2. A navegação em malha fechada continua sem apertar SELECT em nada que não seja o destino pretendido — o precedente
   da 087, em que a sonda começou a tocar uma série, não se repete.
3. O conserto é ensaiado no PC antes de qualquer instalação.

### Edge Cases

- **O trabalho dominante é recálculo de layout/estilo do navegador, não JavaScript nosso**: a feature **tenta reduzir
  o que o causa** — número de nós por card, propriedades que forçam recálculo, tamanho da janela virtualizada — sempre
  com ganho medido em duas rodadas. "É o browser" não encerra a feature por si só.
- **O trabalho dominante só se reduz com Worker ou outro formato de dados**: fora de escopo; a feature encerra
  declarando o alvo não cumprido, com a causa nomeada e os números.
- **Uma mudança melhora o pior quadro e piora o fps mediano** (ou vice-versa): não conta como progresso. Os três
  números valem juntos.
- **O orçamento de quatro rodadas acaba sem o alvo atingido**: encerra declarando o alvo não cumprido, com o que foi
  tentado, descartado e medido — não pede mais rodadas por omissão.
- **Uma redução deixa o card em branco por mais tempo**: só permanece com aprovação do usuário olhando a TV.
- **A lista da pessoa é muito menor que a de referência** (43 549 filmes / 9 777 séries): o ganho pode ser
  imperceptível ali, e o alvo continua sendo o da lista de referência.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A feature DEVE nomear o trabalho dominante por medição no próprio aparelho **antes** de aplicar qualquer
  otimização.
- **FR-002**: A primeira medição DEVE reportar o **atraso de cada tarefa longa desde a última tecla**, porque é ele que
  distingue trabalho disparado pela navegação (e tardio) de trabalho independente dela.
- **FR-003**: Quando a atribuição não fechar com o total, a feature DEVE acrescentar **uma** medida nova por rodada e
  registrar por que ela entrou.
- **FR-004**: Nenhuma mudança DEVE alterar o comportamento de navegação observável: ordem de foco, o que SELECT faz,
  posição de rolagem e restauração ao voltar continuam iguais.
- **FR-005**: Toda otimização aplicada DEVE ter ganho medido no aparelho, na mesma sonda de duração fixa, em **duas**
  rodadas independentes; mudança sem ganho nas duas NÃO DEVE ficar, e o que foi descartado DEVE ser registrado com os
  números.
- **FR-006**: Mudança com efeito visível — inclusive aumento do tempo em que um card aparece sem capa — DEVE ser
  mostrada ao usuário na TV e aprovada por ele antes de permanecer.
- **FR-007**: Um card em estado intermediário DEVE mostrar apenas moldura e dados reais já disponíveis; NUNCA título,
  nota, posição ou capa inventados.
- **FR-008**: A instrumentação de medição DEVE continuar restrita ao build de medição, sem entrar no pacote normal.
- **FR-009**: A sonda automática DEVE fechar a rodada com `falhas = 0`, cobrindo Filmes e Séries, e o conserto DEVE ser
  ensaiado no PC antes de gastar instalação na TV.
- **FR-010**: A feature DEVE gastar no máximo **quatro** instalações de medição na TV; esgotado o orçamento sem o alvo,
  DEVE encerrar declarando o alvo não cumprido com a causa nomeada.
- **FR-011**: Se o trabalho dominante só se reduzir com Web Worker ou com mudança no formato de gravação do catálogo, a
  feature DEVE encerrar declarando, sem escalar para isso sem decisão nova.
- **FR-012**: A abertura de Filmes e Séries NÃO DEVE regredir, e o tempo de leitura ao entrar numa categoria DEVE ser
  reportado antes e depois.
- **FR-013**: A evidência final DEVE registrar qual trabalho estava nas tarefas longas, o que foi tentado e descartado,
  e como reproduzir a medição.
- **FR-014**: Nenhum segredo, URL, nome de item, categoria ou canal DEVE sair nas métricas — só números e rótulos de um
  conjunto fechado.
- **FR-015**: Cada instalação na TV DEVE ser autorizada pelo usuário, e o pacote normal DEVE ser reinstalado ao final
  de cada rodada.

### Key Entities

- **Tarefa longa**: um bloco de trabalho acima de 50 ms que a thread principal executa sem interrupção. Tem início,
  duração e — a novidade desta feature — um **atraso desde a última tecla**.
- **Janela de medição**: ~5 s de agregação. Carrega quadros, tarefas longas, as etapas nomeadas e a atribuição, em
  chaves planas e numéricas.
- **Rodada**: uma instalação na TV com a sonda de duração fixa (quatro janelas de 60 s: Filmes e Séries, duas vezes).
  O orçamento da feature é de quatro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Navegando continuamente por 60 s em Filmes, a thread fica presa em tarefa longa em **menos de 15%** da
  janela (linha de base: 28%, pior janela 69%).
- **SC-002**: No mesmo roteiro, o **pior quadro fica abaixo de 300 ms** (linha de base: 400 ms de mediana, até 817 ms).
- **SC-003**: No mesmo roteiro, o **fps mediano fica em 45 ou mais** (linha de base: 41; teto observado no aparelho:
  55–59 em janelas limpas).
- **SC-004**: SC-001 a SC-003 valem também para Séries.
- **SC-005**: Os três resultados aparecem em **duas rodadas independentes** na mesma sessão.
- **SC-006**: A sonda automática fecha com **`falhas = 0`**, cobrindo as quatro janelas.
- **SC-007**: A abertura de Filmes e Séries continua entre **313 e 386 ms**.
- **SC-008**: O tempo de leitura ao entrar numa categoria é reportado antes e depois (critério acompanhado, sem alvo
  numérico obrigatório; faixa recente: 239–384 ms de mediana).
- **SC-009**: Existe registro que **nomeia** o trabalho dominante das tarefas longas, com números do aparelho, e lista
  o que foi tentado e descartado.
- **SC-010**: Sem regressão: a suíte unitária, os roteiros de tela e os contratos travados das features 052, 053, 057,
  082, 085, 086, 087 e 088 continuam passando.
- **SC-011**: O pacote normal não leva nenhuma instrumentação de medição.
- **SC-012**: No máximo quatro instalações de medição na TV foram usadas.

## Assumptions

- A medição da 088 é confiável e não precisa ser repetida: três rodadas, as duas da sonda idênticas dentro do ruído, e
  o próprio medidor testado e inocentado (−5% sem ele, pior quadro idêntico).
- O teto de ~55 fps observado em janelas limpas representa o que o aparelho entrega quando a thread não está presa;
  por isso o alvo de 45 fps é tratado como alcançável, e não como aspiração.
- O comportamento de Filmes e Séries é equivalente: na única janela em que Séries foi medida deu 40 fps contra 36 de
  Filmes. A US3 existe para confirmar isso, não para descobri-lo.
- O React Compiler **desiste** de memoizar `VodShowcaseScreen` (o virtualizador dispara `react(incompatible-library)`).
  Isso é fato verificado, mas **não** é o alvo: o re-render medido vale 4,5%.
- A lista de referência continua disponível e com o catálogo obtido (43 549 filmes, 9 777 séries, 2 355 canais).
- O usuário continua disponível para autorizar cada instalação e para dar o veredito de tela nas mudanças visíveis.

## Clarifications

### Sessão 2026-10-22

- Q: A 088 morreu porque o escopo era "o caminho de navegação" e a causa estava fora dele. O que a spec nova autoriza
  mudar? → A: Qualquer código do app que segure a thread durante a navegação — inclusive estrutura de DOM,
  virtualização, efeitos e consultas depois do primeiro quadro. Worker e novo formato de dados do catálogo continuam
  exigindo decisão nova.
- Q: Que alvo numérico a spec nova fixa? → A: Os mesmos da 088 (thread < 15%, pior quadro < 300 ms, fps ≥ 45), porque o
  teto de 55–59 fps já foi observado no próprio aparelho.
- Q: Quantas instalações na TV a spec pode gastar antes de encerrar? → A: Até quatro; esgotado o orçamento, encerra
  declarando.
- Q: A spec já compromete qual é a primeira medição? → A: Sim — o atraso de cada tarefa longa desde a última tecla,
  que discrimina "é a navegação, mas depois do primeiro quadro" de "não é a navegação".
- Q: E se a causa for o próprio navegador (layout/estilo do scroll), e não código nosso? → A: Tentar reduzir o que a
  causa (nós por card, propriedades que forçam recálculo, janela de virtualização), com ganho medido. "É o browser" não
  encerra a feature.
- Q: Mexer na virtualização pode trocar fluidez por card em branco por mais tempo. Aceitável? → A: Sim, mas só com
  aprovação do usuário olhando a tela na TV.
- Q: A sonda fecha com `falhas = 2` e não alcança Séries. Como tratar? → A: Consertar a sonda primeiro, até dar
  `falhas = 0`, porque sem isso metade de cada rodada de TV é desperdiçada.
