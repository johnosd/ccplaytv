# Feature Specification: Zapping por Cima do Vídeo em Live TV

**Slug**: `016-zapping-live-tv`

**Created**: 2026-09-25

**Status**: Convergida

**Input**: Item 7 do backlog ("Tela de Canais — melhorias pendentes da
feature 003"), com o "botão voltar ao canal que está tocando" absorvido
aqui por depender diretamente do zapping. Resolve, junto, as perguntas de
design que o item 10 ("Ciclo de vida do player na TV") deixava em aberto
sobre zapping — o item 10 fica só com o resto (screensaver,
`visibilitychange`, sessões sobrepostas fora do contexto de zapping). O
hand-off de foco no contêiner rolável, terceiro ponto do item 7 original,
saiu de escopo: a lista de canais já tem scroll sincronizado ao foco
(`scrollToIndex`, feature 009), sem gap conhecido.

## Escopo

### Incluído

- Trazer a trilha de categorias e a lista de canais de volta, em tela
  cheia, por cima do vídeo que já está tocando, ao pressionar OK com um
  canal em reprodução.
- Trocar de canal a partir dessa lista sem que a pessoa perca o que já
  estava assistindo até a troca de fato acontecer.
- Fechar essa lista (RETURN, ou selecionar o canal que já está tocando)
  revela o canal em reprodução — sem precisar de um botão à parte para
  "voltar ao canal que está tocando": o foco, ao abrir a lista, já cai
  nele por padrão.
- Recuperação automática quando o canal escolhido falha ao carregar.

### Fora de Escopo

- Zapping em Filmes ou Séries — não existe o conceito de "próximo item"
  nessas seções; esta feature é só de Live TV.
- Reprodução em segundo plano entre **telas diferentes** (sair de Live TV
  para Filmes/Séries/Home mantendo o canal tocando) — hoje o player para
  ao sair da tela, e isso continua assim.
- Hand-off de foco real no contêiner rolável da lista de canais — sem
  gap conhecido, considerado já resolvido pela feature 009.
- Diagnóstico estruturado de falha de reprodução (backlog item 19) — a
  recuperação automática desta feature usa um aviso simples, não um
  sistema novo de diagnóstico.
- Zapping numérico (digitar o número do canal) e teclas de mídia
  dedicadas (backlog item 44) — mecanismo de entrada separado.
- As demais pendências do item 10 (screensaver, `visibilitychange`,
  interrupção completa fora do contexto de zapping) — ficam para uma
  spec própria daquele item.
- Persistir qualquer estado novo de zapping no catálogo local — nada
  aqui grava em IndexedDB além do que a reprodução normal já grava
  (retomada, quando aplicável).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trocar de canal sem perder o que já estava assistindo (Priority: P1)

Com um canal em tela cheia, a pessoa pressiona OK. A trilha de categorias
e a lista de canais voltam por cima do vídeo, que continua tocando,
escurecido atrás. A pessoa navega livremente (inclusive trocando de
categoria) e escolhe outro canal: a lista continua por cima até o novo
canal estar pronto, e só então some, revelando-o já em reprodução — sem
um instante perceptível de tela preta ou muda. O canal antigo (e a lista
que o cobre) só saem de cena quando o novo já está pronto. Se a pessoa não trocar de canal e
só fechar a lista (RETURN, ou selecionar o próprio canal que já estava
tocando), volta a ver o canal de sempre, sem interrupção nenhuma.

**Why this priority**: é o comportamento central que o usuário pediu —
sem ele, a pessoa precisa sair da reprodução inteira só para ver o que
mais está passando, perdendo o canal atual nesse meio tempo.

**Independent Test**: com um canal tocando, pressionar OK, navegar até
outro canal e selecioná-lo; o novo canal toca sem gap perceptível.
Repetir abrindo a lista e fechando sem trocar: o canal original nunca
parou de tocar.

**Acceptance Scenarios**:

1. **Given** um canal em reprodução de tela cheia, **When** a pessoa
   pressiona OK, **Then** a trilha de categorias e a lista de canais
   aparecem por cima do vídeo, que continua tocando, visivelmente
   escurecido atrás da lista.
2. **Given** a lista aberta por cima do vídeo, **When** a lista aparece,
   **Then** o foco inicial está no canal que está tocando, em qualquer
   categoria que ele esteja.
3. **Given** a lista aberta, **When** a pessoa navega para outro canal e
   seleciona, **Then** a lista permanece visível até o canal novo estar
   pronto para tocar, e só então some, revelando o canal novo já em
   reprodução — sem nenhum instante de tela preta ou muda entre um
   canal e outro.
4. **Given** a lista aberta, **When** a pessoa seleciona o mesmo canal
   que já estava tocando, **Then** a lista simplesmente fecha, sem
   recarregar nem interromper a reprodução em andamento.
5. **Given** a lista aberta, **When** a pessoa pressiona RETURN sem
   escolher outro canal, **Then** a lista fecha e o canal que já estava
   tocando continua visível, sem interrupção.
6. **Given** a lista aberta por cima do vídeo, **When** a pessoa troca de
   categoria na trilha, **Then** a navegação funciona exatamente como na
   tela de Live TV normal (fora do zapping).
7. **Given** a pessoa seleciona um canal novo e, antes dele carregar,
   seleciona outro canal diferente, **When** as trocas acontecem em
   sequência rápida, **Then** só a última escolha efetivamente assume a
   tela — tentativas anteriores em andamento são descartadas, nunca
   somadas ou fora de ordem.

---

### User Story 2 - Recuperação automática quando o canal escolhido falha (Priority: P2)

A pessoa escolhe um canal na lista de zapping e ele falha ao carregar
(fonte fora do ar, formato incompatível, etc.). Em vez de ficar numa tela
de erro, a reprodução volta automaticamente para o canal que estava
tocando antes, com um aviso rápido explicando que a troca não deu certo.

**Why this priority**: sem isso, a pessoa é raspada da experiência de
zapping por uma falha momentânea de um canal que nem era o que estava
assistindo — pior do que o comportamento de hoje (que ao menos mantém o
canal atual, já que trocar de canal exige sair da reprodução).

**Independent Test**: escolher, na lista de zapping, um canal cuja fonte
falha propositalmente; a reprodução permanece (ou volta) no canal
anterior, com um aviso visível de que a troca falhou.

**Acceptance Scenarios**:

1. **Given** a pessoa escolhe um canal novo na lista de zapping, **When**
   esse canal falha ao carregar, **Then** a reprodução volta
   automaticamente para o canal que estava tocando antes da troca.
2. **Given** essa falha, **When** a recuperação acontece, **Then** um
   aviso rápido (não uma tela de erro bloqueante) explica que a troca
   para o canal escolhido não deu certo.
3. **Given** a falha e a recuperação, **When** a pessoa olha a tela,
   **Then** ela pode tentar escolher outro canal imediatamente — a falha
   de um canal não trava a navegação nem exige sair da reprodução.

---

### Edge Cases

- Selecionar, na lista de zapping, o canal que já está tocando: fecha a
  lista sem recarregar (cenário 4 da US1).
- Trocar de canal repetidamente antes de qualquer um terminar de
  carregar: só a última escolha sobrevive (cenário 7 da US1) — mesmo
  princípio de descarte que a feature 011 já usa para busca temporal
  (`seek`) no player de filme, aplicado aqui à troca de canal.
- O próprio canal que está tocando falha **enquanto a lista de zapping
  está fechada** (fora do fluxo de troca): comportamento inalterado por
  esta feature — seja lá o que acontece hoje quando um canal falha fora
  do zapping continua acontecendo.
- Segurar OK sobre um canal na lista de zapping: continua favoritando/
  desfavoritando (feature 013), sem conflito com o toque curto que
  seleciona/troca — mesma distinção por tempo de tecla já usada em todo
  o app.
- Lista de zapping sem nenhum canal na categoria focada (categoria
  vazia): mesmo estado vazio que a tela de Live TV normal já mostra fora
  do zapping.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Com um canal em reprodução de tela cheia, o sistema DEVE
  trazer de volta a trilha de categorias e a lista de canais por cima do
  vídeo ao receber SELECT (OK) do controle remoto.
- **FR-002**: Enquanto a lista estiver por cima do vídeo, o canal em
  reprodução DEVE continuar tocando (áudio e vídeo), visivelmente
  escurecido atrás da lista.
- **FR-003**: Ao abrir a lista por cima do vídeo, o foco inicial DEVE
  estar no canal que está tocando, na categoria em que ele se encontra —
  isso substitui a necessidade de um botão dedicado de "voltar ao canal".
- **FR-004**: A navegação na lista sobreposta (setas, troca de categoria,
  favoritar) DEVE se comportar exatamente como a navegação da tela de
  Live TV fora do zapping, sem estado ou regra nova. **Atualização
  (feature 017, D-009):** exceto a busca — a trilha do zapping omite
  "🔍 Buscar" de propósito; ver Clarifications, sessão 2026-09-25 (emenda).
- **FR-005**: Selecionar um canal diferente do que está tocando DEVE
  iniciar a troca; a lista DEVE permanecer visível, por cima do vídeo,
  até o canal novo estar pronto para tocar — só então a lista fecha e
  revela o canal novo. A lista nunca fecha antes disso (ver FR-006 e
  Clarifications, sessão 2026-09-25, nota técnica).
- **FR-006**: A sessão do canal anterior NÃO DEVE ser encerrada até o
  canal novo estar pronto para tocar — a pessoa nunca vê um instante de
  tela preta ou muda entre um canal e outro. Como o motor de reprodução
  da TV só sustenta uma sessão de vídeo por vez (não há duas sessões
  simultaneamente abertas), é a lista de zapping — não o vídeo em si —
  que permanece visível cobrindo a troca; o "sem gap perceptível" da
  SC-001 é garantido por nunca revelar um quadro nu entre o fechamento
  da sessão antiga e a nova sessão pronta, e não por manter duas
  sessões de vídeo tocando ao mesmo tempo.
- **FR-007**: Selecionar o próprio canal que já está tocando DEVE apenas
  fechar a lista, sem reiniciar ou recarregar a reprodução em andamento.
- **FR-008**: RETURN, com a lista aberta por cima do vídeo, DEVE fechar
  só essa camada (revelando o canal em reprodução), nunca sair da
  reprodução inteira de uma vez — mesmo princípio de RETURN fechar a
  camada mais recente antes de subir na hierarquia que o resto do app já
  segue.
- **FR-009**: Se a pessoa selecionar um canal novo, e depois outro,
  antes do primeiro terminar de carregar, o sistema DEVE garantir que só
  a seleção mais recente efetivamente assuma a tela — tentativas
  anteriores em andamento DEVEM ser descartadas, nunca acumuladas.
- **FR-010**: Se o canal escolhido falhar ao carregar, o sistema DEVE
  reverter automaticamente para o canal que estava tocando antes da
  tentativa de troca, sem exigir ação da pessoa.
- **FR-011**: Essa reversão automática DEVE vir acompanhada de um aviso
  não bloqueante, visível o bastante para a pessoa entender que a troca
  não deu certo, mas sem interromper a reprodução do canal revertido.
- **FR-012**: Depois de uma reversão automática, a pessoa DEVE poder
  tentar escolher outro canal imediatamente, sem passo extra de
  recuperação.
- **FR-013**: Esta feature NÃO DEVE se aplicar às telas de Filmes ou
  Séries — o comportamento de reprodução delas permanece o que é hoje.

### Key Entities

Nenhuma entidade nova. A troca de canal usa a mesma identidade de canal
já existente no catálogo local; nada relativo a zapping é persistido em
IndexedDB.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao trocar de canal pela lista de zapping, não há nenhum
  instante perceptível de tela preta, muda, ou congelada entre a saída
  de um canal e a entrada do outro — verificável só a olho, com o
  controle remoto (constitution).
- **SC-002**: Em 100% das aberturas da lista de zapping, o foco inicial
  está no canal que está tocando, verificável só com o controle remoto.
- **SC-003**: Trocar de canal repetidamente em sequência rápida (antes de
  qualquer um terminar de carregar) nunca resulta em mais de um canal
  tentando tocar ao mesmo tempo, nem numa ordem diferente da última
  escolha feita.
- **SC-004**: Toda falha ao trocar de canal pela lista de zapping resulta
  em recuperação automática para o canal anterior, nunca numa tela de
  erro bloqueante nem em silêncio/tela preta sem explicação.

## Assumptions

- A lista sobreposta reaproveita o mesmo layout, componentes e regras de
  foco/favorito da tela de Live TV normal — não é um padrão visual novo
  (decisão explícita: tela cheia com a trilha de sempre, não uma faixa
  compacta).
- Sem tempo limite automático para a lista sobreposta se fechar sozinha —
  ela fica aberta até a pessoa fechar (RETURN) ou escolher um canal,
  igual à navegação normal de Live TV, coerente com a decisão de reusar
  o layout de tela cheia em vez de uma faixa compacta temporizada.
- O aviso de falha (FR-011) é um toast/mensagem simples, no mesmo
  espírito dos avisos já usados em outras partes do app (ex.: favoritar),
  não uma tela de diagnóstico nova.
- Esta feature toca só `LiveScreen.tsx`/`PlayerLayer` (Live TV); não
  altera `MovieDetailScreen`/`SeriesDetailScreen`.

## Clarifications

### Sessão 2026-09-25

- Q: O item 7 original tinha três pontos (hand-off de foco, botão
  "voltar ao canal", zapping). Como escopar? → A: Hand-off de foco sai
  (sem gap conhecido, já resolvido pela virtualização da feature 009).
  Zapping e "voltar ao canal" ficam juntos nesta spec — o botão "voltar"
  só fazia sentido dado o zapping, então vira parte do mesmo fluxo, não
  um item à parte.
- Q: O que a lista mostra por cima do vídeo, e quanto da tela ocupa? →
  A: Tela cheia, reaproveitando a trilha de categorias e lista de canais
  de sempre — não uma faixa/banner compacto.
- Q: O vídeo continua tocando enquanto a lista está por cima? → A: Sim,
  escurecido atrás, mantendo a sensação de zapping real.
- Q: Se o canal novo falhar, o que acontece? → A: Volta automaticamente
  para o canal anterior, com um aviso rápido — nunca uma tela de erro
  bloqueante.
- Q: "Voltar ao canal que está tocando" é um botão à parte? → A: Não — é
  o próprio RETURN da lista de zapping, com o foco já caindo por padrão
  no canal que está tocando ao abrir a lista.
- Q: Dá para trocar de categoria enquanto a lista de zapping está aberta,
  ou só navega os canais da categoria atual? → A: Trilha inteira, mesmo
  comportamento de sempre.
- Q: Quando a sessão do canal antigo é encerrada numa troca? → A: Só
  depois que o canal novo estiver pronto para tocar — nunca antes,
  para não haver instante de tela preta.

### Sessão 2026-09-25 (nota técnica, durante sdd-plan)

- Q: A exploração de código do `sdd-plan` encontrou um conflito real
  entre duas decisões já tomadas: (1) a lista fecha assim que a troca é
  confirmada (redação original da FR-005) e (2) a sessão antiga só
  encerra quando a nova estiver pronta, sem gap perceptível (FR-006).
  O motor de reprodução da TV (AVPlay) é singleton — só sustenta uma
  sessão de vídeo por vez — então fechar a sessão antiga e abrir a nova
  exige, inevitavelmente, um instante sem nenhum vídeo tocando. Com a
  lista já fechada nesse instante (redação original), esse instante
  ficaria visível como tela preta/congelada, quebrando a SC-001. Como
  resolver? → A: A lista permanece aberta, cobrindo o vídeo, até o
  canal novo confirmar que está pronto — só então fecha. FR-005 e o
  cenário 3 da US1 foram corrigidos para refletir isso; a SC-001
  continua garantida (nenhum quadro nu percebido), mas pela lista
  cobrindo a troca, não por duas sessões de vídeo simultâneas.

### Sessão 2026-09-25 (emenda, durante sdd-plan/execute da feature 017)

- Q: A feature `017-busca-local-catalogo` adicionou "🔍 Buscar" ao topo da
  trilha de categorias de Live TV. FR-004 diz que a navegação da lista de
  zapping se comporta "exatamente como a navegação da tela de Live TV fora
  do zapping, sem estado ou regra nova" — isso inclui a busca? → A: Não —
  D-009 daquela feature decidiu deliberadamente que a trilha usada durante
  o zapping omite a entrada "🔍 Buscar" (só "★ Favoritos" + categorias),
  porque a lista de zapping já é uma sobreposição rápida por cima de um
  vídeo tocando, e abrir um campo de texto ali multiplicaria a superfície
  de estados (foco em campo vs. foco em canal, ambos por cima do vídeo) sem
  um ganho real — quem quer buscar já pode fechar o zapping (RETURN) e
  buscar na tela normal. FR-004 continua valendo para tudo que a trilha de
  zapping de fato tem (setas, troca de categoria, favoritar); a busca é a
  única exceção, e é intencional, não uma lacuna.
