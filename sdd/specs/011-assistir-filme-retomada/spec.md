# Feature Specification: Assistir Filme, com Retomada

**Slug**: `011-assistir-filme-retomada`

**Created**: 2026-09-23

**Status**: Convergida

**Input**: Assistir filme, com retomada — reprodução de VOD na TV: contrato de
capacidades por motor no `PlayerService` (pausa, busca, posição, duração),
camada de reprodução compartilhada (hoje `PlayerOverlay` é específico de
Live), ação primária contextual no `MovieDetailScreen` (Assistir / Retomar
com posição / Reiniciar) e gravação de progresso em pontos intermediários no
`userStateRepository` por identidade lógica estável. Episódios de série ficam
fora (feature seguinte).

## Escopo

O app hoje importa, classifica e exibe filmes reais do catálogo local, mas
**não reproduz nenhum deles**: o botão "Assistir" do detalhe mostra um aviso
temporário no lugar de abrir o player. Esta feature fecha esse buraco e, ao
fazê-lo, cria as duas peças que faltavam para qualquer reprodução que não
seja canal ao vivo: o contrato de capacidades por motor e o primeiro
consumidor real do estado do usuário.

### Incluído

- Reprodução de filme (VOD) em tela cheia, a partir do detalhe do filme.
- **Contrato de capacidades por motor**: cada motor de reprodução declara o
  que suporta (pausar, buscar, informar posição, informar duração), e a
  interface só oferece o controle que o motor declarou.
- Controles de filme: play/pause, avançar/retroceder, e barra de progresso
  com tempo decorrido e total.
- Retomada: a ação primária do detalhe passa a ser "Retomar", com "Reiniciar"
  ao lado, quando existir posição salva.
- Gravação de progresso em pontos intermediários durante a reprodução, por
  identidade lógica estável, não só ao encerrar.
- Conclusão de filme tratada como fim normal, não como falha.
- Camada de reprodução compartilhada, capaz de servir canal ao vivo e filme
  sem que a de canal regrida.

### Fora de Escopo

- **Episódios e temporadas de série.** É a feature seguinte; depende de obter
  e gravar episódios no catálogo, que hoje não existem.
- **Favoritar.** `toggleFavorite` continua sem consumidor. Favoritos é o item
  11 do backlog e precisa de interface nos três tipos mais uma tela de
  listagem — escopo próprio.
- **Marcar como assistido / histórico / "continuar assistindo" na Home.** Esta
  feature grava a posição; a semântica de conclusão por tipo de mídia e o
  hero da Home são os itens 13 e 16.
- **Mudança de comportamento do canal ao vivo.** A Live TV declara "sem busca,
  sem pausa" e continua funcionando exatamente como hoje.
- **Metadados externos** (sinopse, backdrop, elenco via TMDB) e **arte em
  cascata no card**. São o item 8 restante e o item 28.
- **Zapping por cima do vídeo** (item 10) e **diagnóstico de reprodução com
  ações ranqueadas** (item 19).
- **Preferência de áudio/legenda** entre mídias.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assistir um filme do começo (Priority: P1)

Uma pessoa entra em Filmes, abre uma categoria, escolhe um filme e aciona
"Assistir". O filme abre em tela cheia e começa a tocar. Ela pode pausar,
retomar, avançar e retroceder, e vê onde está no filme. RETURN encerra a
reprodução e devolve o foco ao filme de onde saiu.

**Why this priority**: É o buraco central do produto hoje — dá para navegar o
catálogo inteiro de filmes e não dá para assistir a nenhum. Sem esta story,
nada mais nesta feature tem sentido: não há o que retomar.

**Independent Test**: Com uma fonte de provedor já sincronizada, entrar em
Filmes → categoria → filme → "Assistir", e confirmar que o vídeo toca, que
pausa e volta, que a barra avança, e que RETURN devolve ao detalhe com o foco
restaurado. Entrega valor sozinha, mesmo sem nenhuma retomada.

**Acceptance Scenarios**:

1. **Given** um filme disponível no catálogo local e sem posição salva,
   **When** a pessoa aciona a ação primária do detalhe, **Then** a camada de
   reprodução abre e o filme começa do início.
2. **Given** um filme em reprodução, **When** a pessoa aciona play/pause,
   **Then** a reprodução pausa e retoma do mesmo ponto, e o controle reflete o
   estado real do motor.
3. **Given** um filme em reprodução, **When** a pessoa aciona avançar ou
   retroceder, **Then** a posição muda na direção pedida e a barra e o tempo
   decorrido acompanham.
4. **Given** um filme em reprodução com os controles visíveis, **When** passam
   alguns segundos sem nenhuma tecla, **Then** os controles somem; **When** a
   pessoa aciona qualquer seta ou SELECT, **Then** os controles voltam com o
   foco na ação primária.
5. **Given** um filme em reprodução, **When** a pessoa aciona RETURN, **Then** a
   reprodução encerra sem áudio residual e o detalhe do filme recupera o foco.
6. **Given** um filme cujo motor não informa duração confiável, **When** a
   reprodução começa, **Then** a interface mostra o tempo decorrido sem barra
   de progresso e sem percentual — mas avançar e retroceder continuam
   disponíveis, por serem deslocamento relativo e não exigirem conhecer o
   total.

   > Redação original ("a busca não é oferecida") corrigida durante o
   > `sdd-execute` (Fase 3): `canSeek` e `reportsDuration` são capacidades
   > independentes no contrato (`contracts/player-capabilities.md` §1) — só a
   > barra/percentual dependem de duração, o salto relativo não. Confirmado
   > com o usuário em 23/09/2026.

---

### User Story 2 - Retomar de onde parou (Priority: P2)

A pessoa que parou um filme no meio volta a ele depois. O detalhe já oferece
"Retomar", dizendo de que ponto, com "Reiniciar" ao lado. A posição sobrevive
a fechar o app e a ressincronizar a fonte.

**Why this priority**: É o que transforma "consigo assistir" em "consigo
assistir um filme em duas sessões" — o comportamento que uma pessoa espera de
qualquer app de TV. Depende da US1 existir, mas é testável e entregável
separadamente: sem ela, a US1 continua entregando um player completo que
sempre começa do início.

**Independent Test**: Assistir a alguns minutos de um filme, sair, reabrir o
detalhe e confirmar que a ação primária virou "Retomar" com a posição certa;
acionar "Reiniciar" e confirmar que começa do zero. Fechar e reabrir o app e
confirmar que a posição continua lá.

**Acceptance Scenarios**:

1. **Given** um filme assistido parcialmente acima do limiar inicial, **When**
   a pessoa abre o detalhe dele, **Then** a ação primária é "Retomar",
   indicando a posição salva, e "Reiniciar" está disponível ao lado.
2. **Given** um filme com posição salva, **When** a pessoa aciona "Retomar",
   **Then** a reprodução começa daquela posição, não do início.
3. **Given** um filme com posição salva, **When** a pessoa aciona "Reiniciar",
   **Then** a reprodução começa do início e a posição salva é substituída pelo
   novo avanço.
4. **Given** um filme que a pessoa assistiu por menos que o limiar inicial,
   **When** ela reabre o detalhe, **Then** a ação primária continua sendo
   "Assistir" e nenhuma retomada é oferecida.
5. **Given** um filme assistido além do limiar final, **When** a pessoa reabre
   o detalhe, **Then** a ação primária volta a ser "Assistir" do início, sem
   oferecer retomada a poucos instantes do fim.
6. **Given** um filme em reprodução, **When** o app é encerrado de forma
   abrupta, **Then** a posição do último ponto intermediário gravado é
   preservada.
7. **Given** um filme com posição salva, **When** a fonte é ressincronizada,
   **Then** a posição continua associada ao mesmo filme, reconciliada pela
   identidade estável e não pela URL nem pelo nome exibido.

---

### User Story 3 - O filme termina (Priority: P3)

O filme chega ao fim sozinho. A camada de reprodução fecha, o detalhe volta, e
o filme deixa de aparecer como algo a retomar.

**Why this priority**: É o menor dos três em superfície, mas é o que impede
dois defeitos concretos: hoje o adaptador AVPlay trata fim de stream como
falha ("A transmissão foi interrompida"), o que mostraria uma tela de erro no
fim de todo filme; e, sem zerar a posição, todo filme assistido até o fim
ficaria eternamente "em andamento".

**Independent Test**: Reproduzir um filme curto (ou buscar até perto do fim) e
deixar terminar. Confirmar que nenhuma mensagem de erro aparece, que o detalhe
volta, e que a ação primária voltou a ser "Assistir".

**Acceptance Scenarios**:

1. **Given** um filme em reprodução, **When** ele chega ao fim, **Then** a
   camada fecha, o detalhe recupera o foco, e **nenhuma** mensagem de erro é
   exibida.
2. **Given** um filme que terminou, **When** a pessoa reabre o detalhe,
   **Then** a ação primária é "Assistir", sem retomada pendente.
3. **Given** um canal ao vivo em reprodução, **When** a transmissão é
   interrompida, **Then** o comportamento atual é preservado — fim de stream
   continua sendo tratado como falha de fornecimento, porque transmissão
   contínua não tem conclusão.

---

### Edge Cases

- **Filme sem URL de reprodução montável** (sem identificador do painel, sem
  extensão de contêiner declarada, ou credencial ausente): a camada declara
  que não há fonte de reprodução disponível, com saída focável, sem sugerir
  que é problema de rede e sem expor endereço ou credencial.
- **Motor não suporta busca** para um item que a interface classificaria como
  filme: sem controle de busca e sem barra arrastável, em vez de um botão que
  não faz nada.
- **Busca além dos limites** (retroceder antes do início, avançar além do
  fim): a posição é grampeada aos limites reais da mídia; avançar além do fim
  não é um atalho para "concluir".
- **SELECT repetido ou tecla mantida pressionada** na ação primária: não abre
  duas sessões de reprodução sobrepostas.
- **Falha no meio da reprodução** (rede cai, fonte expira): estado de erro com
  saída focável; a posição já gravada não é perdida nem zerada por causa do
  erro.
- **Tentativa de reprodução que falha antes de começar**: não grava posição
  nenhuma — não houve avanço a registrar.
- **Filme de fonte por URL M3U**, cuja identidade estável cai no nome original
  por não haver identificador do painel: a retomada funciona, e renomear o
  item na fonte é o caso conhecido em que ela se perde.
- **Voltar ao detalhe e entrar de novo** durante a mesma sessão: a posição
  exibida é a real, não uma defasada do momento em que a tela montou.
- **Duração informada pelo motor muda** depois do início (acontece com alguns
  contêineres): a barra se ajusta sem apresentar percentual acima de 100%.

## Requirements *(mandatory)*

### Functional Requirements

**Contrato de capacidades**

- **FR-001**: O sistema DEVE permitir que cada motor de reprodução declare,
  por sessão, quais capacidades suporta — no mínimo: pausar, buscar, informar
  posição e informar duração.
- **FR-002**: A interface de reprodução DEVE decidir quais controles oferece
  **exclusivamente** a partir das capacidades declaradas, nunca a partir do
  nome ou da identidade do motor.
- **FR-003**: O sistema NÃO DEVE oferecer busca temporal para transmissão ao
  vivo sem janela DVR.
- **FR-004**: Quando não houver duração confiável, o sistema DEVE apresentar
  indicação indeterminada — tempo decorrido sem barra e sem percentual — e
  NÃO DEVE calcular nem exibir percentual estimado.

**Reprodução de filme**

- **FR-005**: O sistema DEVE reproduzir um filme do catálogo local em tela
  cheia, acionado a partir da ação primária do detalhe do filme.
- **FR-006**: O sistema DEVE oferecer play/pause, avançar e retroceder durante
  a reprodução de um filme cujo motor declare essas capacidades.
- **FR-007**: O sistema DEVE exibir a posição atual e a duração total do filme
  enquanto os controles estiverem visíveis.
- **FR-008**: Os controles DEVEM se ocultar após um período sem interação e
  DEVEM reaparecer, com foco na ação primária, ao acionar qualquer direcional
  ou SELECT. Com os controles **ocultos**, esquerda e direita DEVEM **executar
  o salto** além de exibir a barra; com os controles **visíveis** e o foco em
  um botão, esquerda e direita DEVEM navegar entre as ações sem saltar. Com os
  controles **visíveis** e o foco na **barra de progresso** — alcançada por
  cima a partir de qualquer botão —, esquerda e direita DEVEM **buscar
  diretamente** pela mesma quantidade do salto, e baixo DEVE devolver o foco à
  ação de play/pause. Numa mídia sem capacidade de busca, esquerda e direita
  NÃO DEVEM fazer nada, e a barra não existe como alvo de foco.

  > Refinado durante o `sdd-plan` a partir de
  > `docs/guia-praticas-app-tv/06` §1, normativo para o que é enviado a uma
  > TV. A redação original pedia apenas que qualquer direcional revelasse os
  > controles; o guia distingue o comportamento conforme eles estejam
  > visíveis ou não, o que permite avançar o filme sem primeiro ter de revelar
  > a barra. Ver `research.md` R0-6 e a decisão D-006 do `plan.md`.
  >
  > **Atualização (Fase 6, TV física, R-020)**: a distinção "visível vs.
  > oculto" não bastava sozinha. Testado ao vivo, o usuário esperava focar
  > especificamente a barra — desenhada acima dos botões — para buscar com
  > esquerda/direita, em vez de alcançá-la por transbordo do último botão. O
  > modelo final: CIMA entra na barra a partir de qualquer botão, BAIXO sai de
  > volta pro play/pause, e só com a barra focada esquerda/direita buscam. Ver
  > `plan.md` R-020 e `logic/reproducao-vod.md` §4.
- **FR-009**: RETURN DEVE encerrar a reprodução a partir de qualquer estado,
  inclusive com os controles ocultos, sem deixar áudio em segundo plano, e
  DEVE devolver o foco ao item que originou a navegação.
- **FR-010**: O sistema NÃO DEVE abrir mais de uma sessão de reprodução
  simultânea para uma mesma ação do usuário.
- **FR-011**: Mensagens de erro de reprodução DEVEM ser sanitizadas — sem URL,
  endereço de provedor, usuário ou senha — e DEVEM distinguir "não há fonte de
  reprodução para este item" de "a reprodução falhou".

**Retomada e progresso**

- **FR-012**: O sistema DEVE gravar a posição de reprodução em pontos
  intermediários durante a reprodução, não apenas ao encerrá-la.
- **FR-013**: A posição DEVE ser chaveada por identidade lógica estável
  (fonte + tipo + identificador estável), NUNCA pela URL de stream nem pelo
  nome exibido.
- **FR-014**: O sistema NÃO DEVE registrar posição antes de um limiar inicial
  de reprodução, nem oferecer retomada depois de um limiar final próximo ao
  fim. Ambos os limiares DEVEM ser constantes nomeadas e ajustáveis num único
  lugar.
- **FR-015**: Quando houver posição válida, a ação primária do detalhe DEVE
  ser "Retomar", indicando a posição, com "Reiniciar" disponível como ação
  distinta; sem posição válida, a ação primária DEVE ser "Assistir".
- **FR-016**: "Reiniciar" DEVE começar do início e substituir a posição salva
  conforme a nova reprodução avança.
- **FR-017**: Uma tentativa de reprodução que falha antes de qualquer avanço
  NÃO DEVE registrar posição.
- **FR-018**: A posição DEVE sobreviver ao encerramento do app e à
  ressincronização da fonte, reconciliada pela identidade estável.

**Conclusão**

- **FR-019**: O fim de um filme DEVE ser tratado como conclusão normal — sem
  mensagem de erro — encerrando a camada de reprodução e devolvendo o foco ao
  detalhe.
- **FR-020**: Ao concluir um filme, o sistema DEVE limpar a posição de
  retomada, de modo que ele deixe de ser apresentado como pendente.
- **FR-021**: O fim de stream de uma transmissão ao vivo DEVE continuar sendo
  tratado como falha de fornecimento, não como conclusão.

**Não-regressão**

- **FR-022**: A reprodução de canal ao vivo DEVE preservar o comportamento
  atual, incluindo a liberação da área de vídeo quando o motor pinta em plano
  de hardware, a saída garantida por RETURN e o tratamento de erro existente.
- **FR-023**: Todo estado da camada de reprodução — preparando, reproduzindo
  com controles ocultos, erro, conclusão — DEVE ter uma saída alcançável por
  controle remoto.

### Key Entities

- **Capacidades de reprodução**: o conjunto do que um motor suporta para uma
  mídia — pausar, buscar, informar posição, informar duração. Declarado pelo
  motor por sessão, consumido pela interface. Não é a identidade do motor.
- **Posição de retomada**: par (identidade lógica estável, segundos
  assistidos), com o instante da última reprodução. Já existe como registro de
  estado do usuário; esta feature é o primeiro a escrevê-la e lê-la em
  produção.
- **Sessão de reprodução**: uma tentativa de reproduzir uma mídia, com estado
  observável e capacidades associadas. Uma por vez.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa consegue, partindo da Home e usando apenas o controle
  remoto, escolher um filme e vê-lo reproduzindo — caminho hoje impossível.
- **SC-002**: Um filme interrompido e reaberto retoma a menos de 10 segundos
  do ponto em que parou, inclusive após o app ser encerrado.
- **SC-003**: Nenhum controle exibido durante a reprodução deixa de funcionar
  ao ser acionado: a interface não oferece capacidade que o motor não tem.
- **SC-004**: Um filme reproduzido até o fim não exibe nenhuma mensagem de
  erro e deixa de ser apresentado como pendente de retomada.
- **SC-005**: Todos os cenários de reprodução de canal ao vivo verificados na
  feature 003 continuam aprovados após esta feature.
- **SC-006**: Nenhuma mensagem, rótulo ou registro produzido pela camada de
  reprodução contém URL de stream, endereço de provedor, usuário ou senha.
- **SC-007**: Em todo estado da camada de reprodução, o controle remoto
  alcança uma saída — nenhum estado prende o aparelho.

## Assumptions

- **A fonte de reprodução já está resolvida.** `resolvePlaybackUrl` monta a
  URL de filme desde a feature 006/007, e `fetchPlayback` já devolve o tipo
  real do item. Esta feature consome isso, não o reconstrói.
- **O registro de estado do usuário já existe.** A feature 008 entregou
  `updateProgress`, `getUserState` e a identidade estável, testados e sem
  consumidor. Esta feature é o consumidor.
- **A duração não é armazenada hoje.** O registro de estado guarda segundos
  assistidos, mas não a duração total. Se distinguir "assistido além do limiar
  final" exigir persistir duração, isso é uma decisão do `sdd-plan`, não uma
  mudança de escopo.

  > **Resolvido no `sdd-plan`**: a duração **não** será persistida e o schema
  > não muda. O limiar final é aplicado apagando o progresso no instante em
  > que é cruzado, dentro da sessão, onde a duração já está disponível — o que
  > torna a regra da tela de detalhe trivial ("existe progresso → Retomar").
  > Ver `research.md` R0-5 e a decisão D-005 do `plan.md`.
- **O comportamento do AVPlay quanto a posição, duração e busca não está
  verificado em hardware.** O adaptador atual só usa abrir/fechar. É o
  principal risco técnico da feature e a razão do gate de TV física.
- **O adaptador `<video>` de desenvolvimento suporta tudo** — pausa, busca,
  posição e duração. Isso significa que o navegador **não** é capaz de revelar
  uma capacidade ausente no motor real; o contrato existe justamente para essa
  diferença ser explícita.
- **Um filme tem uma única mídia.** Não há múltiplas versões, qualidades ou
  faixas a escolher nesta feature.
- **O catálogo local já tem filmes reais.** Fonte de provedor traz VOD por
  categoria sob demanda desde a feature 010.

## Clarifications

### Sessão 2026-09-23

- Q: Quais controles um filme deve oferecer durante a reprodução? → A: Pausa +
  busca com barra de progresso, com tempo decorrido e total. É o conjunto que
  justifica o contrato de capacidades — o filme declara busca, o canal ao vivo
  sem DVR não.
- Q: Quando o filme já tem posição salva, como a retomada é oferecida? → A: A
  ação primária do detalhe vira "Retomar (a partir de …)", com "Reiniciar" ao
  lado. A escolha acontece antes de abrir o player; nada interrompe depois que
  o vídeo começou.
- Q: O que acontece quando o filme chega ao fim? → A: Fecha e volta ao
  detalhe, zerando a retomada. Fim de filme é conclusão normal, não falha —
  hoje o adaptador AVPlay trata fim de stream como erro, o que é correto para
  canal ao vivo e errado para filme. Marcar como assistido fica para o item 13.
- Q: Favoritar um filme entra nesta feature? → A: Não. Só reprodução e
  retomada. Favoritos é o item 11, com interface nos três tipos e tela de
  listagem própria.
- Q: A partir de quando um filme conta como "em andamento", e até quando? → A:
  Ignora início e fim — não grava progresso antes de ~30 s, e passando de ~95 %
  trata como terminado, voltando a oferecer "Assistir". Os dois valores são
  constantes nomeadas e ajustáveis.
- Q: Como os controles se comportam durante a reprodução? → A: Começam
  visíveis, somem após alguns segundos sem interação, e qualquer seta ou
  SELECT os traz de volta com o foco na ação primária. Com eles ocultos a tela
  fica sem elemento focável, e RETURN é a saída garantida — mesmo desenho já
  usado na Live TV (D-010 da feature 003).
- Q: O canal ao vivo muda de comportamento nesta feature? → A: Não muda nada.
  O contrato passa a existir, mas o canal ao vivo declara "sem busca, sem
  pausa" e continua como hoje. A feature assume o compromisso de não regredir
  a Live TV, que é o único caminho de reprodução comprovado na TV física.
- Q: Verificar na TV física é obrigatório para fechar esta feature? → A: Sim,
  gate obrigatório. A constitution trata a TV física como fortemente
  recomendada e não obrigatória, mas esta feature depende de o AVPlay reportar
  posição e duração e aceitar busca, e nada disso é conclusivo no navegador,
  onde roda o adaptador `<video>`, que sempre funciona.
