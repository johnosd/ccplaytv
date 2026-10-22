# Feature: Tarefas longas no caminho de navegação das vitrines (Filmes e Séries) na TV

**Status**: Convergida
**Criada**: 2026-10-22
**Origem**: assessment `sdd/assessments/tarefa-longa-na-leitura-categoria-gorda/` — veredito **go** reaberto em
2026-10-22 com a evidência que faltava. O escopo aqui **não** é o que o assessment nasceu suspeitando: a medição mandou
a investigação para outro lugar.

## Contexto

Navegar entre cards e fileiras em Filmes e Séries na TV de referência (QN50Q60DAGXZD, Tizen 9 / Chromium 120, ~310 MB
livres) mantém a thread presa **33% do tempo** (mediana; máximo 67%), em **475 tarefas longas** de 50–736 ms que somam
**87,6 s**. O resultado são quadros congelados de até ~780 ms, que também atrasam a aparição das capas — foi assim que
o usuário percebeu, antes de qualquer número: *"piora na fluidez em que eu desço entre os cards, na velocidade em que
os cards carregam as imagens"*.

Três coisas já foram estabelecidas por medição no aparelho, e esta feature parte delas em vez de redescobri-las:

1. **É código nosso.** 48 de 49 quadros de 200 ms ou mais coincidem com uma tarefa longa de JavaScript de tamanho
   equivalente. Pausa de coleta de memória está **refutada** — se fosse, o quadro apareceria sem tarefa longa.
2. **Não é a leitura do catálogo.** O produtor do Top 10/Dica, que inclui a leitura dos blocos comprimidos, responde
   por **8,6%** do tempo em tarefa longa (7,5 s de 87,6 s). Os **91% restantes são do próprio caminho de navegação**:
   tecla → foco → render → pintura.
3. **O número atravessou duas features sem ser explicado.** A 086 fechou com pior quadro de 917 ms e a 087 com 583–900
   ms; nenhuma das duas o introduziu, e nenhuma o resolveu.

A medição é **repetível**: existe uma sonda automática (`lib/perf/autopilot.ts`) que navega sozinha em janelas de 60 s
com cadência e número de teclas fixos, e instrumentação que separa tarefa longa de pausa de memória
(`lib/perf/longTasks.ts`). Duas rodadas independentes deram pior quadro de 583–900 ms e 717–783 ms.

## Escopo

### Incluído

- **Atribuir, com medição no aparelho, qual código está nas tarefas longas** do caminho de navegação de Filmes e
  Séries — antes de mudar qualquer coisa.
- **Reduzir essas tarefas longas** até os alvos de `## Measurable Outcomes`.
- Tratar a pista concreta já levantada: filmes custam **164 µs por item** contra **34 µs** de séries para montar o
  índice do tipo (4,8×), com o teto do cache de pedaços (30 000) **menor** que os 31 915 itens de filmes.
- **Mudança visual é permitida** quando comprar fluidez medida, com a tela aprovada pelo usuário antes de ficar — há
  precedente medido na feature 083 (foco com sombra estática: 35 → 51 fps).
- Um card pode aparecer **com moldura e título antes da capa** durante rolagem rápida, se renderizar menos de uma vez
  for o que compra fluidez.

### Fora de Escopo

- **Início, Live TV e a grade de categoria.** Caminhos de foco diferentes e sem linha de base medida.
- **Ceder a vez dentro da leitura do bloco** e **mover a montagem do índice para o Worker**: eram as abordagens que a
  feature 087 havia registrado, atacam 8,6% do problema, e a primeira já é refutada pelo código (os pedaços têm 500
  itens e a descompressão é assíncrona de verdade).
- **Mudar o formato de gravação do catálogo** (feature 082, contrato travado) ou reabrir a feature 087.
- **Dado inventado em card** — nunca, em nenhuma hipótese: moldura e título reais, ou nada.
- **Escalar para mudança grande** (Worker, outro formato de dados) se a atribuição mostrar que o custo dominante está
  fora do alcance barato. Nesse caso a feature **para e registra** (ver `## Assumptions`).

## Clarifications

### Sessão 2026-10-22

- Q: O que define "pronto"? → A: **Os três números juntos** — tarefa longa abaixo de 15% da janela, pior quadro abaixo
  de 300 ms e fps mediano ≥ 45. Juntos de propósito: medir um só permite ganhar nele e piorar o resto, que foi o que
  aconteceu na 087.
- Q: Entrar numa categoria (mediana de 627 ms contra ~229 ms da referência da 086) entra? → A: **Critério secundário**,
  acompanhado e reportado, **não** gate — é o mesmo caminho de thread e a sonda já mede, mas não trava a feature se a
  causa for outra.
- Q: A feature pode mexer no visual? → A: **Sim, com a tela aprovada pelo usuário** antes de ficar. Precedente medido
  na 083.
- Q: Card pode aparecer vazio na rolagem rápida? → A: **Só a moldura e o título; a capa chega depois.** Nunca título
  ou nota inventados.
- Q: E se a atribuição mostrar que o custo dominante está fora do alcance barato? → A: **A feature para e registra**,
  declarando o alvo não cumprido com a causa nomeada — como a 087 fez com o SC-007. O próximo nível fica decidido por
  evidência, não por teimosia.
- Q: Quais telas? → A: **Filmes e Séries**, onde foi medido e onde o usuário sentiu.

## User Stories

### US1 — Descer entre os cards sem engasgo (P1)

Como quem navega em Filmes e Séries na TV, quero mover o foco entre cards e fileiras sem a tela travar, para a
navegação acompanhar o controle em vez de engasgar.

**Acceptance scenarios**

1. Navegando continuamente por 60 s em Filmes, a thread fica presa em tarefa longa **menos de 15%** da janela, o pior
   quadro fica **abaixo de 300 ms** e o fps mediano fica **em 45 ou mais**.
2. O mesmo em Séries, no mesmo roteiro de duração fixa.
3. Os números são obtidos **duas vezes**, em rodadas independentes na mesma sessão, e a melhora aparece nas duas — uma
   rodada sozinha não decide nada neste aparelho.
4. Nenhuma fileira, card, rótulo ou posição de foco muda de comportamento por causa da otimização: a navegação continua
   fazendo o que fazia, só sem travar.

### US2 — Entrar numa categoria sem espera perceptível (P2)

Como quem abre uma categoria a partir da vitrine, quero que a grade apareça rápido, porque hoje a mediana é de 627 ms
contra ~229 ms medidos na feature 086.

**Acceptance scenarios**

1. A mediana do tempo de leitura ao entrar numa categoria é **reportada** antes e depois, no mesmo roteiro.
2. Se a causa for a mesma das tarefas longas da navegação, ela melhora junto; se for outra, isso fica **registrado com
   número**, e não bloqueia a feature.

### US3 — Quem vier depois não começa do zero (P3)

Como quem for mexer em desempenho de catálogo na próxima vez, quero a atribuição registrada e a medição repetível, para
não gastar rodadas de TV redescobrindo de onde vem o tempo.

**Acceptance scenarios**

1. Existe um registro que nomeia **qual código** estava nas tarefas longas, com números do aparelho.
2. A sonda automática e a instrumentação continuam funcionando ao final, e a evidência da feature diz como reproduzir a
   medição.

## Edge Cases

- **A atribuição aponta para fora do alcance barato** (decodificação de capa, layout do navegador): a feature para e
  registra, com o alvo declarado não cumprido.
- **Uma otimização melhora o pior quadro e piora o fps mediano** (ou vice-versa): não conta como progresso — os três
  números valem juntos.
- **A lista da pessoa é muito menor que a de referência** (31 915 filmes): a melhora pode ser imperceptível ali, e o
  alvo continua sendo medido na lista de referência.
- **Ganho que só aparece com o cache de pedaços frio**: medir também com a lista já aberta uma vez na sessão.
- **Mudança visual recusada pelo usuário**: a alternativa volta atrás e o ganho dela não entra na conta.
- **Rolagem rápida com a capa ainda não decodificada**: moldura e título aparecem; nunca um valor inventado.
- **TV indisponível**: sem rodada na TV não há veredito — o alvo não pode ser declarado cumprido por medição de PC.

## Requirements

### Functional Requirements

- **FR-001**: A feature DEVE atribuir, por medição no próprio aparelho, qual código está nas tarefas longas do caminho
  de navegação **antes** de aplicar qualquer otimização.
- **FR-002**: Nenhuma mudança DEVE alterar o comportamento de navegação observável: ordem de foco, o que SELECT faz, a
  posição de rolagem e a restauração ao voltar continuam iguais.
- **FR-003**: Toda otimização aplicada DEVE ter ganho medido no aparelho, na mesma sonda de duração fixa, contra a
  linha de base de 2026-10-22; otimização sem ganho medido NÃO DEVE ficar.
- **FR-004**: A medição DEVE ser feita duas vezes em rodadas independentes, e um ganho só conta quando aparece nas
  duas.
- **FR-005**: Mudança visual DEVE ser apresentada ao usuário e aprovada por ele antes de permanecer.
- **FR-006**: Um card em estado intermediário DEVE mostrar apenas moldura e dados reais já disponíveis; NUNCA título,
  nota, posição ou capa inventados.
- **FR-007**: A instrumentação de medição DEVE continuar restrita ao build de medição, sem entrar no pacote normal.
- **FR-008**: Se a atribuição mostrar que o custo dominante está fora do escopo desta feature, ela DEVE encerrar
  declarando o alvo não cumprido, com a causa nomeada e os números — não DEVE escalar para mudança grande sem decisão
  nova.
- **FR-009**: O tempo de leitura ao entrar numa categoria DEVE ser reportado antes e depois, como critério
  acompanhado.
- **FR-010**: A abertura das telas NÃO DEVE regredir: continua na faixa medida de 313–386 ms.
- **FR-011**: A evidência final DEVE registrar qual código estava nas tarefas longas e como reproduzir a medição.
- **FR-012**: Nenhum segredo, URL, nome de item, categoria ou canal DEVE sair nas métricas — só números e rótulos
  fixos.

### Key Entities

Nenhuma entidade de dados nova. A feature mexe em caminho de execução e em instrumentação, não em dado guardado.

## Measurable Outcomes

- **SC-001**: Navegando continuamente por 60 s em Filmes, a thread fica presa em tarefa longa em **menos de 15%** da
  janela (linha de base: 33% de mediana, máximo 67%).
- **SC-002**: No mesmo roteiro, o **pior quadro fica abaixo de 300 ms** (linha de base: 717–783 ms).
- **SC-003**: No mesmo roteiro, o **fps mediano fica em 45 ou mais** (linha de base: 33–41).
- **SC-004**: SC-001 a SC-003 valem também para Séries.
- **SC-005**: Os três resultados aparecem em **duas rodadas independentes** na mesma sessão.
- **SC-006**: A abertura de Filmes e Séries continua entre **313 e 386 ms**.
- **SC-007**: O tempo de leitura ao entrar numa categoria é reportado antes e depois (critério acompanhado, sem alvo
  numérico obrigatório).
- **SC-008**: Existe registro nomeando qual código estava nas tarefas longas, com números do aparelho.
- **SC-009**: Sem regressão: a suíte unitária, os roteiros de tela e os contratos travados das features 057, 082, 085,
  086 e 087 continuam passando.
- **SC-010**: O pacote normal não leva nenhuma instrumentação de medição.

## Assumptions

- A linha de base é a rodada de **2026-10-22**
  (`sdd/assessments/tarefa-longa-na-leitura-categoria-gorda/app-metricas-tv-2026-10-22.jsonl`): 475 tarefas longas,
  87,6 s, thread presa 33% da janela (mediana), pior quadro 717–783 ms, fps 33–41, e o produtor respondendo por 8,6%
  do tempo em tarefa longa.
- A sonda automática (`lib/perf/autopilot.ts`) e a instrumentação de tarefa longa (`lib/perf/longTasks.ts`) já existem
  e funcionam: foram usadas nesta linha de base, com `falhas = 0` na última rodada.
- O veredito de desempenho vem **só do aparelho**. O navegador do PC dá 60 fps em tudo e serve para ensaiar
  navegação, nunca para aprovar fluidez.
- **Cada instalação na TV pede autorização do usuário**, e o pacote normal é reinstalado ao final de cada rodada.
- As regras de seleção, o formato de gravação e os contratos travados das features 057, 082, 086 e 087 ficam como
  estão.
- Se a atribuição apontar para fora do alcance barato, **encerrar com o alvo não cumprido é o resultado correto** desta
  feature, não uma falha dela — decisão do usuário em 2026-10-22.
