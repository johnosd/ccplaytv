# Feature Specification: Shell, Navegação e Entrada do Design System V14 (Onda 2 da migração)

**Slug**: `023-shell-navegacao-entrada-ds-v14`

**Created**: 2026-09-26

**Status**: Convergida

**Input**: "onda2 backlog". É o item M3 do backlog: "Onda 2 — Shell, navegação e
entrada (feature 023): topbar, tela de perfis = listas (a `HomeScreen` atual
reaproveitada), fonte ativa, roteamento com RETURN em camadas,
Splash/onboarding/progresso de importação". Contexto:
`.planning/migracao-design-system-v14.md` (Onda 2) e
`sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md` (§2, §3 e §5).

## Escopo

Terceira onda da migração para o Design System V14 Spectrum
(`docs/design/design-system/`). É a primeira onda que muda o que a pessoa vê
e o caminho que ela percorre. As Ondas 0 e 1 só prepararam tokens, palco,
ícones e a biblioteca de componentes, sem mudar nenhuma tela.

A entrada do app deixa de ser "Home de fontes → hub da fonte (3 tiles) →
Live/Filmes/Séries" e passa a seguir a ADR-011:

**Splash → "Quem está assistindo?" (perfil = lista) → Início da fonte ativa,
com topbar.**

Live TV, Filmes, Séries e os detalhes continuam com o layout de hoje e
**são alcançados a partir do novo caminho**. O redesenho deles fica para as
Ondas 3 e 4.

### Incluído

- **Tela de perfis** "Quem está assistindo?":
  - cada cartão é uma lista IPTV cadastrada (ADR-011 §2);
  - há um cartão "Adicionar lista";
  - a tela aparece a cada abertura, com foco na última lista usada;
  - escolher uma lista define a **fonte ativa** da sessão;
  - substitui a Home de fontes atual.
- **Gestão de listas na própria tela de perfis**, até Configurações existir
  (Onda 5):
  - Ressincronizar, Editar e Excluir;
  - Excluir passa a pedir confirmação num modal.
- **Shell com topbar** na tela Início:
  - logo;
  - destinos Início, TV ao vivo, Filmes e Séries;
  - indicador da lista ativa;
  - Busca e Configurações como mocks "Em breve";
  - relógio.
- **Início provisório**: o conteúdo do hub da fonte atual no visual V14.
  - rail "Continuar assistindo", quando houver;
  - 3 cartões de atalho (TV ao vivo, Filmes, Séries) com as contagens reais;
  - aviso de Modo limitado, quando for o caso.
- **HintBar** (faixa de teclas úteis) e **OfflineBanner** no shell.
- **RETURN em camadas**, conforme a ADR-011 §3:
  - modal aberto → fecha o modal;
  - detalhe → volta ao contexto de origem;
  - destino de topo → Início;
  - Início → modal "Sair do CCPlayTV?".
- **Splash** no visual V14.
- **Onboarding de lista** ("Adicionar lista", M3U/Xtream) no visual V14, com um
  cartão "Conectar pelo celular" como mock "Em breve".
- **Progresso de importação** no visual V14, levando ao Início da lista
  importada ao concluir.
- **Dois bugs do backlog absorvidos**:
  - estado de erro da Home sem elemento focável;
  - `e2e.mjs` testando um diálogo de saída que não existe mais.
- **Scripts E2E atualizados para o novo caminho de entrada**, todos verdes.

### Fora de Escopo

- **Redesenho de Live TV, Filmes, Séries, detalhe de filme e detalhe de
  série** (Ondas 3 e 4). A topbar **não** aparece sobre essas telas nesta
  onda.
- **Configurações** (Onda 5): nem Fontes IPTV, nem Acessibilidade, nem Sobre.
  O ícone da topbar é só mock.
- **Busca global** (Onda 5). O ícone da topbar é só mock. A busca por
  categoria da feature 018 continua onde está.
- **Home definitiva** (Onda 5): hero, "Minha Lista", "Agora na TV",
  Curadoria IA e dock de serviços.
- **Tela "Descobrir com IA" (Em breve)**: adiada para a Onda 5, onde mora o
  card que leva a ela.
- **Esportes e Infantil** na topbar (ADR-011, item 53 do backlog).
- **Perfis de pessoa** independentes das listas (item 52) e criação de
  perfil com avatar (`profileCreate()` do protótipo).
- **Agregação de fontes** (item 23): uma fonte ativa por vez.
- **Pareamento real por celular/QR** (item 22). Aqui é só o mock.
- **Player chrome V14** (Onda 6).
- Qualquer mudança em `tv-web/src/lib/` além do estritamente necessário
  para guardar a última lista usada e a fonte ativa. Catálogo, player, foco
  e estado do usuário não são reescritos (roteiro, §3).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher a lista e entrar no Início dela (Priority: P1)

Ao abrir o app, depois do Splash, a pessoa vê "Quem está assistindo?" com
uma cartela por lista cadastrada e o cartão "Adicionar lista".

- O foco começa na última lista usada.
- OK numa lista torna essa lista a fonte ativa e abre o Início dela, sob a
  topbar.
- O Início mostra:
  - "Continuar assistindo", quando houver;
  - os atalhos TV ao vivo, Filmes e Séries, com as contagens reais;
  - o aviso de Modo limitado, quando se aplicar.

**Why this priority**: é o novo ponto de entrada. Sem ela, nenhuma
funcionalidade 001–020 é alcançável pelo caminho V14. Sozinha, já substitui
a Home de fontes e o hub da fonte sem perder nada.

**Independent Test**: abrir o app com duas listas cadastradas, ver a tela
de perfis com foco na última usada, escolher a outra e confirmar que o
Início mostra os dados dela, e que um atalho abre a tela daquela lista.

**Acceptance Scenarios**:

1. **Given** duas listas cadastradas e a lista B usada por último, **When**
   o Splash termina, **Then** a tela "Quem está assistindo?" aparece com
   um cartão para cada lista, o cartão "Adicionar lista" e o foco no cartão
   da lista B.
2. **Given** a tela de perfis, **When** a pessoa dá OK na lista A, **Then**
   o Início abre com a topbar mostrando o nome da lista A como lista ativa,
   e o conteúdo (Continuar assistindo, contagens, Modo limitado) é o da
   lista A.
3. **Given** a lista A escolhida, **When** o app é fechado e reaberto,
   **Then** a tela de perfis aparece de novo, agora com foco na lista A.
4. **Given** nenhuma lista cadastrada, **When** o Splash termina, **Then** a
   tela de perfis mostra só o cartão "Adicionar lista", com foco nele.
5. **Given** falha ao ler as listas do aparelho, **When** a tela de perfis
   abre, **Then** aparece um estado de erro com código e a ação "Tentar de
   novo" focável e ativável por OK. O controle nunca fica preso.
6. **Given** o Início da lista A, com foco inicial no atalho "TV ao vivo",
   **When** a pessoa dá OK, **Then** a TV ao vivo da lista A abre como
   hoje.
7. **Given** o Início com itens em "Continuar assistindo", **When** a pessoa
   sobe até a rail e dá OK num item, **Then** abre o detalhe do filme ou da
   série correspondente, como no hub atual.
8. **Given** a tela de perfis na abertura do app, **When** a pessoa aperta
   RETURN, **Then** abre o modal "Sair do CCPlayTV?".

---

### User Story 2 - Topbar e RETURN em camadas (Priority: P1)

No Início, a topbar é alcançável com UP a partir do topo do conteúdo e
leva aos destinos de topo. De qualquer destino, RETURN volta ao Início. No
Início, RETURN pergunta se a pessoa quer sair.

- O indicador da lista ativa leva de volta à tela de perfis para trocar de
  lista.
- Busca e Configurações ainda não existem. Aparecem como "Em breve".

**Why this priority**: sem RETURN em camadas, a pessoa não sai de um
destino, ou sai do app por acidente. Sem o modal de saída, o app não tem
saída controlada. É a outra metade do caminho novo.

**Independent Test**: no Início, subir à topbar, abrir Filmes por ela,
voltar com RETURN ao Início e, no Início, apertar RETURN e cancelar o modal
de saída.

**Acceptance Scenarios**:

1. **Given** o foco na primeira linha do conteúdo do Início, **When** a
   pessoa aperta UP, **Then** o foco vai para a topbar, no item "Início"
   (destino atual), e DOWN devolve o foco ao conteúdo, no mesmo item de
   onde saiu.
2. **Given** o foco na topbar, **When** a pessoa navega com LEFT/RIGHT e dá
   OK em "Filmes", **Then** a tela de Filmes da fonte ativa abre, igual ao
   atalho do conteúdo.
3. **Given** TV ao vivo, Filmes ou Séries aberto a partir do Início,
   **When** a pessoa aperta RETURN no nível raiz dessa tela, **Then** volta
   ao Início com o foco no elemento que abriu aquele destino (atalho ou
   item da topbar).
4. **Given** um detalhe de filme aberto a partir de Filmes, **When** a
   pessoa aperta RETURN, **Then** volta a Filmes com a categoria, o scroll e
   o item focado restaurados, como hoje (feature 017).
5. **Given** o Início sem nenhum modal aberto, **When** a pessoa aperta
   RETURN, **Then** abre o modal "Sair do CCPlayTV?" com "Cancelar" em foco.
   RETURN ou OK em "Cancelar" fecha o modal e o foco volta aonde estava. OK
   em "Sair" encerra o app.
6. **Given** o foco no indicador da lista ativa, **When** a pessoa dá OK,
   **Then** a tela de perfis abre, com foco na lista ativa. RETURN ali volta
   ao Início da mesma lista, sem trocar nada.
7. **Given** a tela de perfis aberta pelo indicador, **When** a pessoa
   escolhe outra lista, **Then** o Início da nova lista abre com a pilha de
   navegação zerada. RETURN a partir dali abre o modal de saída.
8. **Given** o foco em Busca ou Configurações na topbar, **When** a pessoa
   dá OK, **Then** o app anuncia "Em breve — …" e nada mais acontece.
9. **Given** o Início, **When** um minuto vira no relógio do aparelho,
   **Then** o relógio da topbar mostra a nova hora (HH:MM).

---

### User Story 3 - Gerir listas na tela de perfis (Priority: P2)

Enquanto Configurações não existe, a gestão das listas continua na tela de
perfis. DOWN num cartão de lista mostra as ações Ressincronizar, Editar e
Excluir, com o mesmo comportamento de hoje. Excluir agora pede confirmação.

**Why this priority**: gestão de fonte não pode ficar inalcançável (critério
da Onda 2). Mas quem só assiste não depende dela para usar o app. A P1
entrega valor sem ela.

**Independent Test**: na tela de perfis, ressincronizar uma lista e ver o
progresso, editar outra e salvar, e excluir uma terceira passando pelo
modal de confirmação.

**Acceptance Scenarios**:

1. **Given** o foco no cartão de uma lista, **When** a pessoa aperta DOWN,
   **Then** aparecem as ações Ressincronizar, Editar e Excluir daquele
   cartão, com foco em Ressincronizar. UP devolve o foco ao mesmo cartão.
2. **Given** o foco em Ressincronizar, **When** a pessoa dá OK, **Then** a
   ressincronização começa e a tela de progresso abre.
3. **Given** o foco em Editar, **When** a pessoa dá OK, **Then** abre o
   formulário da lista preenchido. Salvar volta à tela de perfis.
4. **Given** o foco em Excluir, **When** a pessoa dá OK, **Then** abre o
   modal "Excluir a lista <nome>?" com "Cancelar" em foco. Nada é apagado
   ainda.
5. **Given** o modal de exclusão, **When** a pessoa confirma "Excluir",
   **Then** a lista, os favoritos e a retomada dela são apagados (feature
   013), o modal fecha e o foco vai para o cartão vizinho, ou para
   "Adicionar lista" se não restar nenhuma.
6. **Given** o modal de exclusão, **When** a pessoa aperta RETURN ou dá OK
   em "Cancelar", **Then** nada é apagado e o foco volta a "Excluir".
7. **Given** uma lista em Modo limitado, **When** a tela de perfis é
   exibida, **Then** o cartão mostra o selo "Modo limitado". Os outros
   avisos do cartão atual (lista truncada, entradas descartadas) também
   continuam visíveis.

---

### User Story 4 - Adicionar lista e acompanhar a importação (Priority: P2)

"Adicionar lista" abre o onboarding V14, com o formulário M3U/Xtream real e
o cartão "Conectar pelo celular" como "Em breve". Salvar leva à tela de
progresso V14. Ao concluir, a lista nova vira a fonte ativa e o Início dela
abre.

**Why this priority**: é o caminho de quem ainda não tem lista. Hoje ele já
funciona e continua funcionando com o visual antigo até esta story ser
entregue. O valor novo é visual e de encadeamento (ir direto ao Início).

**Independent Test**: sem listas, adicionar uma lista M3U, acompanhar o
progresso e chegar ao Início dela sem passar de novo pela tela de perfis.

**Acceptance Scenarios**:

1. **Given** a tela de perfis, **When** a pessoa dá OK em "Adicionar lista",
   **Then** abre o onboarding com os campos M3U/Xtream (rótulo permanente e
   atributos de IME, feature 022) e o cartão "Conectar pelo celular" soft
   disabled.
2. **Given** o foco em "Conectar pelo celular", **When** a pessoa dá OK,
   **Then** o app anuncia "Em breve — …" e o onboarding continua aberto.
3. **Given** o formulário preenchido, **When** a pessoa salva, **Then** a
   tela de progresso abre e mostra o avanço real da importação, sem
   percentual inventado.
4. **Given** a importação concluída com sucesso, **When** a pessoa confirma
   a ação de abrir a lista, que aparece já focada, **Then** a lista
   importada vira a fonte ativa e o Início dela abre. A tela não avança
   sozinha.
5. **Given** a importação falhou, **When** a pessoa escolhe voltar, **Then**
   volta à tela de perfis com o foco no cartão daquela lista, se ela foi
   criada, ou em "Adicionar lista".
6. **Given** o onboarding aberto a partir da tela de perfis, **When** a
   pessoa aperta RETURN, **Then** volta à tela de perfis sem salvar nada.

---

### User Story 5 - Splash no visual V14 (Priority: P3)

O Splash mostra a identidade V14 (logo, tagline, indicador de carregamento)
pelo mesmo tempo de hoje e leva à tela de perfis.

**Why this priority**: puramente visual. O Splash atual já cumpre a função.

**Independent Test**: abrir o app e ver o Splash V14 seguido da tela de
perfis.

**Acceptance Scenarios**:

1. **Given** o app sendo aberto, **When** o Splash aparece, **Then** mostra a
   marca V14 e um indicador de carregamento sem número, e depois do mesmo
   tempo de hoje abre a tela de perfis.
2. **Given** a preferência de reduzir movimento ativa (feature 021),
   **When** o Splash aparece, **Then** não há animação, só o estado final.

---

### Edge Cases

- **A última lista usada foi excluída**: o foco inicial da tela de perfis
  vai para o primeiro cartão de lista, ou para "Adicionar lista" se não
  sobrar nenhuma.
- **A lista ativa é excluída** pela tela de perfis aberta via indicador: a
  exclusão acontece, a sessão perde a fonte ativa e a tela de perfis fica
  aberta. RETURN ali já não pode voltar a um Início de lista inexistente e
  passa a abrir o modal de saída.
- **Duas listas com o mesmo nome**: os cartões aparecem com o mesmo rótulo.
  O tipo (Xtream/M3U) e o estado ajudam a distinguir. Nenhuma deduplicação.
- **Muitas listas**: a fileira de cartões rola horizontalmente acompanhando
  o foco. Nenhum cartão fica inalcançável.
- **Nome de lista longo** (no cartão e no indicador da topbar): o texto é
  truncado com reticências, sem empurrar os outros itens da topbar.
- **Atualização automática da fonte** (feature 004) que termina depois de a
  pessoa já ter saído do Início: continua acompanhada e reconciliada, como
  hoje.
- **Conexão cai com o Início aberto**: o OfflineBanner aparece. O catálogo
  local continua navegável. Reproduzir ou abrir categoria ainda não obtida
  falha pelos caminhos de erro que já existem.
- **RETURN com modal aberto em qualquer tela**: fecha o modal primeiro,
  nunca a tela de baixo (feature 022, `Modal`).
- **"Ressincronizar" a partir de uma tela de categoria** (feature 014): a
  tela de progresso abre como hoje e, ao concluir, volta ao Início da lista
  ativa.
- **OK repetido rápido num cartão de lista**: abre um só Início, sem empilhar
  a mesma tela duas vezes.
- **Relógio no primeiro render**: mostra a hora atual imediatamente, sem
  "00:00" provisório.

## Requirements *(mandatory)*

### Functional Requirements

**Tela de perfis (US1, US3)**

- **FR-001**: Depois do Splash, o app DEVE abrir sempre a tela "Quem está
  assistindo?", mesmo com uma lista só (ADR-011 §2).
- **FR-002**: A tela de perfis DEVE mostrar um cartão por lista cadastrada,
  com nome, tipo (Xtream/M3U), estado de sincronização e os selos já
  existentes: Modo limitado, lista truncada, entradas descartadas. DEVE
  mostrar também um cartão "Adicionar lista".
- **FR-003**: A tela DEVE deixar claro que perfil significa lista, por
  exemplo com o subtítulo "Escolha uma lista" (ADR-011, Consequências).
- **FR-004**: O foco inicial da tela de perfis DEVE ir para a última lista
  usada. Se ela não existir mais, vai para o primeiro cartão de lista; sem
  nenhuma lista, vai para "Adicionar lista".
- **FR-005**: A última lista usada DEVE ser gravada no aparelho sempre que
  uma lista é escolhida, e DEVE sobreviver ao fechamento do app.
- **FR-006**: Escolher uma lista DEVE defini-la como a fonte ativa da sessão
  e abrir o Início dela. Início, TV ao vivo, Filmes e Séries DEVEM ler só da
  fonte ativa.
- **FR-007**: Escolher uma lista DEVE disparar a mesma verificação de
  atualização automática que abrir uma fonte dispara hoje (feature 004), e
  o acompanhamento DEVE sobreviver à navegação para outras telas.
- **FR-008**: Com falha ao ler as listas, a tela de perfis DEVE mostrar um
  estado de erro com código e a ação "Tentar de novo", focável e ativável
  por OK (absorve o bug do backlog "Estado de erro da Home não tem elemento
  focável").
- **FR-009**: DOWN num cartão de lista DEVE mostrar as ações Ressincronizar,
  Editar e Excluir daquele cartão, com foco inicial em Ressincronizar. UP
  DEVE devolver o foco ao mesmo cartão.
- **FR-010**: Excluir DEVE abrir um modal de confirmação com o nome da lista,
  com "Cancelar" em foco inicial. Só a confirmação apaga a lista e o estado
  dela (favoritos e retomada, feature 013).
- **FR-011**: Depois de uma exclusão, o foco DEVE ir para o cartão vizinho,
  ou para "Adicionar lista" se não restar nenhuma lista.
- **FR-012**: Os cartões DEVEM rolar horizontalmente acompanhando o foco
  quando não couberem na largura.

**Shell e topbar (US2)**

- **FR-013**: O Início DEVE ter uma topbar com logo, Início, TV ao vivo,
  Filmes, Séries, indicador da lista ativa, Busca, Configurações e relógio.
  Esportes e Infantil DEVEM ficar fora (ADR-011 §3).
- **FR-014**: O item da topbar correspondente ao destino atual (Início)
  DEVE ter marcação visual de ativo, distinta do foco.
- **FR-015**: UP a partir da primeira linha do conteúdo do Início DEVE levar
  o foco à topbar, no destino atual. DOWN na topbar DEVE devolver o foco ao
  item do conteúdo de onde ele saiu.
- **FR-016**: OK em TV ao vivo, Filmes ou Séries na topbar DEVE abrir o
  mesmo destino que o atalho correspondente do conteúdo abre.
- **FR-017**: OK no indicador da lista ativa DEVE abrir a tela de perfis com
  foco na lista ativa.
- **FR-018**: Busca e Configurações DEVEM ser focáveis e soft disabled. OK
  DEVE anunciar "Em breve — <o que vai fazer>". Ambos DEVEM estar
  registrados no registro único de mocks, apontando para a Onda 5.
- **FR-019**: O relógio DEVE mostrar a hora local do aparelho no formato
  HH:MM, atualizada na virada de cada minuto.
- **FR-020**: A topbar DEVE aparecer só no Início nesta onda. TV ao vivo,
  Filmes, Séries e os detalhes DEVEM manter o layout atual, sem topbar.
- **FR-021**: O Início DEVE ter uma HintBar com as teclas úteis daquele
  contexto (ao menos OK e RETURN, com o que cada uma faz ali).
- **FR-022**: O Início DEVE mostrar o OfflineBanner (feature 022) quando o
  aparelho estiver sem conexão, e escondê-lo quando a conexão voltar, sem
  bloquear a navegação.

**Início provisório (US1)**

- **FR-023**: O Início DEVE mostrar a rail "Continuar assistindo" da fonte
  ativa quando houver itens (feature 019), 3 cartões de atalho (TV ao vivo,
  Filmes, Séries) com as mesmas contagens honestas do hub atual e, quando a
  fonte estiver em Modo limitado, o aviso explicativo da feature 014.
- **FR-024**: O foco inicial do Início DEVE ir para o atalho "TV ao vivo".
  UP DEVE levar a "Continuar assistindo", quando existir, e de lá à topbar.
- **FR-025**: OK num item de "Continuar assistindo" DEVE abrir o detalhe do
  filme ou da série, como hoje.
- **FR-026**: O Início NÃO DEVE mostrar nenhum conteúdo que não venha do
  catálogo ou do estado do usuário: hero, rails editoriais, notas e
  sinopses ficam fora desta onda.

**RETURN em camadas (US1, US2)**

- **FR-027**: RETURN com um modal aberto DEVE fechar só o modal, em qualquer
  tela.
- **FR-028**: RETURN num detalhe DEVE voltar ao contexto de origem,
  preservando a restauração de categoria, scroll e foco que já existe
  (feature 017).
- **FR-029**: RETURN no nível raiz de TV ao vivo, Filmes ou Séries DEVE
  voltar ao Início, com o foco no elemento que abriu aquele destino.
- **FR-030**: RETURN no Início DEVE abrir o modal "Sair do CCPlayTV?" com as
  ações "Cancelar" (foco inicial) e "Sair". RETURN no modal equivale a
  Cancelar. "Sair" encerra o app.
- **FR-031**: RETURN na tela de perfis DEVE abrir o modal de saída quando
  ela for a tela de abertura, e DEVE voltar ao Início da lista ativa quando
  ela tiver sido aberta pelo indicador da topbar e a lista ativa ainda
  existir.
- **FR-032**: Trocar de lista DEVE zerar a pilha de navegação: o Início da
  nova lista é a nova base, e nada da lista anterior fica acessível por
  RETURN.
- **FR-033**: O caminho de voltar da atualização a partir de uma tela de
  categoria (feature 014, "Ressincronizar") DEVE continuar funcionando e,
  ao terminar, levar ao Início da fonte ativa.

**Onboarding e importação (US4)**

- **FR-034**: "Adicionar lista" DEVE abrir o onboarding V14 com o formulário
  M3U/Xtream existente (mesma validação e mesmos erros de hoje), usando os
  campos de texto da feature 022.
- **FR-035**: O onboarding DEVE ter um cartão "Conectar pelo celular" soft
  disabled, registrado no registro único de mocks e apontando para o item
  22 do backlog. OK DEVE anunciar "Em breve — …".
- **FR-036**: RETURN no onboarding DEVE voltar à tela de onde ele foi aberto,
  sem salvar nada.
- **FR-037**: A tela de progresso DEVE mostrar só o avanço real da
  importação (fases e contagens que o importador informa), nunca um
  percentual estimado.
- **FR-038**: Quando uma importação termina com sucesso (lista nova ou
  ressincronizada), a tela de progresso DEVE oferecer uma ação focada para
  abrir a lista, sem avançar sozinha, para que os avisos da importação
  possam ser lidos. Ao confirmar essa ação, o app DEVE tornar aquela lista
  a fonte ativa, gravá-la como última usada e abrir o Início dela, com a
  pilha zerada.
- **FR-039**: Se a importação falhar e a pessoa escolher voltar, o app DEVE
  abrir a tela de perfis com foco no cartão daquela lista, se ela existir,
  senão em "Adicionar lista". "Tentar de novo" continua disponível como
  hoje.
- **FR-040**: A edição de uma lista existente DEVE continuar funcionando
  como hoje e, ao salvar, voltar à tela de perfis.

**Splash (US5)**

- **FR-041**: O Splash DEVE mostrar a identidade V14 e um indicador de
  carregamento sem número, pelo mesmo tempo de hoje, e depois abrir a tela
  de perfis.

**Transversais**

- **FR-042**: Toda tela e todo estado desta feature (carregando, vazio,
  erro, modal) DEVEM ter pelo menos um elemento focável e ativável por OK
  (constitution, "Foco Visível e Sem Becos Sem Saída").
- **FR-043**: As telas novas e restilizadas DEVEM consumir só tokens (feature
  021) e os componentes da feature 022 onde houver um equivalente. Nenhuma
  cor, raio, espaçamento ou tamanho de fonte literal.
- **FR-044**: Todo elemento focável novo DEVE ter nome acessível. Os anúncios
  "Em breve" DEVEM passar pela região de anúncio da feature 021.
- **FR-045**: Nenhuma funcionalidade das features 001–022 pode ficar
  inalcançável pelo novo caminho: importar, editar, ressincronizar e
  remover lista, Modo limitado, Live TV (com zapping e favoritos), Filmes,
  Séries, detalhes, reprodução, retomada, histórico e busca por categoria.
- **FR-046**: O comportamento das telas não redesenhadas (Live TV, Filmes,
  Séries, detalhes, player) DEVE continuar idêntico, exceto para onde o
  RETURN do nível raiz leva (FR-029). Os testes de contrato travados de
  features anteriores DEVEM continuar verdes sem edição.
- **FR-047**: Todos os scripts E2E (`tv-web/e2e.mjs` e `tv-web/e2e/*.mjs`)
  DEVEM ser atualizados para o novo caminho de entrada e passar. `e2e.mjs`
  DEVE cobrir o fluxo "sem lista → Adicionar lista" e o modal de saída
  (absorve o bug do backlog sobre o diálogo de saída inexistente).
- **FR-048**: Credenciais e URLs de fonte NÃO DEVEM aparecer em nenhum
  cartão, indicador, anúncio ou mensagem de erro desta feature
  (constitution, ADR-008/ADR-010).

### Key Entities

- **Lista (perfil)**: uma fonte IPTV cadastrada, já existente (`SourceOut`).
  Esta feature não muda o que ela guarda, só onde e como aparece.
- **Fonte ativa**: a lista escolhida nesta sessão. Vale até a pessoa trocar
  de lista ou fechar o app. Não é gravada como "ativa" entre sessões: a tela
  de perfis sempre pergunta de novo.
- **Última lista usada**: o identificador da última lista escolhida, gravado
  no aparelho. Serve só para o foco inicial da tela de perfis. Não guarda
  credencial nem URL.
- **Mock "Em breve"**: as novas entradas no registro único de mocks (Busca,
  Configurações, Conectar pelo celular), cada uma com mensagem e o item do
  backlog, ou a onda, que a substitui.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com duas ou mais listas, abrir o app e chegar ao Início da
  última lista usada custa exatamente um OK depois do Splash.
- **SC-002**: 100% das funcionalidades listadas em FR-045 são alcançáveis a
  partir da tela de perfis, verificado por roteiro manual ou E2E que passa
  por cada uma.
- **SC-003**: De qualquer tela desta feature ou das telas não redesenhadas,
  apertar RETURN repetidamente chega ao modal "Sair do CCPlayTV?" sem nunca
  encerrar o app antes de a pessoa escolher "Sair".
- **SC-004**: Nenhum estado desta feature (carregando, vazio, erro, modal)
  deixa o controle remoto sem elemento focável, verificado em teste para
  cada estado.
- **SC-005**: Todos os scripts E2E passam contra um servidor de
  desenvolvimento recém-iniciado, incluindo `e2e.mjs`, que hoje está
  vermelho.
- **SC-006**: A suíte unitária e os testes de contrato travados de features
  anteriores continuam verdes, sem edição dos arquivos travados.
- **SC-007**: Excluir uma lista exige duas ações distintas (Excluir e depois
  confirmar), e um OK duplo acidental em Excluir não apaga nada.

## Assumptions

- A "fonte ativa" vale por sessão. Como a tela de perfis aparece a cada
  abertura (ADR-011), não há motivo para reabrir direto numa lista.
- O tempo do Splash continua o de hoje (2,6 s). Mudá-lo não faz parte da
  onda.
- O relógio usa o relógio local do aparelho e o formato 24 h, que é o usual
  no pt-BR. Nenhuma consulta de rede.
- Os textos da HintBar e dos anúncios ficam em português, no mesmo tom da
  interface atual.
- As telas não redesenhadas continuam ocupando o palco inteiro, sem topbar.
  O encaixe delas sob a topbar é trabalho das Ondas 3 e 4.
- O hub da fonte atual deixa de ser uma tela separada: o conteúdo dele passa
  a ser o Início provisório. A Home de fontes atual deixa de existir como
  tela de entrada.
- A tela "Descobrir com IA" e os demais mocks da Home definitiva só entram
  na Onda 5.
- `ConfirmDialog` pode continuar existindo onde já é usado fora desta
  feature. A saída e a exclusão desta feature usam o `Modal` da feature 022.
- Os scripts E2E rodam num servidor de desenvolvimento recém-iniciado. Um
  servidor aberto há horas já se mostrou instável na feature 022.

## Clarifications

### Sessão 2026-09-26

- Q: Configurações › Fontes IPTV só chega na Onda 5. Onde ficam
  Ressincronizar/Editar/Excluir durante a Onda 2? → A: Na tela de perfis,
  com a linha de ações abaixo do cartão, como hoje e restilizada. Migram
  para Configurações na Onda 5.
- Q: O que Busca e Configurações da topbar fazem na Onda 2? → A: Os dois
  são mocks "Em breve", soft disabled, registrados no registro único de
  mocks e apontando para a Onda 5.
- Q: A topbar aparece sobre Live/Filmes/Séries já na Onda 2? → A: Não, só
  no Início. Essas telas abrem como hoje, em tela cheia, e RETURN nelas
  volta ao Início.
- Q: Depois de uma importação concluída, para onde vai a pessoa? → A: Para
  o Início daquela lista, que vira a fonte ativa.
- Q: A tela "Em breve" de Descobrir com IA entra agora? → A: Não, fica para
  a Onda 5, junto do card que leva a ela.
- Q: Como tratar "Conectar pelo celular" (QR) no onboarding? → A: Cartão
  soft disabled "Em breve", registrado e apontando para o item 22 do
  backlog. O formulário manual continua sendo o caminho real.
- Q: O que compõe o Início provisório? → A: O hub atual restilizado:
  "Continuar assistindo", 3 atalhos com contagens reais e aviso de Modo
  limitado.
- Q: O que RETURN faz na tela de perfis? → A: Depende da origem. Na abertura
  do app, abre o modal de saída. Quando aberta pelo indicador da topbar,
  volta ao Início da lista ativa.
- Q: Excluir lista continua imediato? → A: Não. Passa a pedir confirmação
  num modal, com "Cancelar" em foco inicial.
- Q: Onde começa o foco no Início? → A: No atalho "TV ao vivo", como no hub
  atual (feature 019, D-010). UP leva a "Continuar assistindo" e depois à
  topbar.
- Q: O que o shell mostra além da topbar? → A: OfflineBanner e HintBar.
- Q: Trocar de lista preserva a navegação? → A: Não. Zera a pilha, e o
  Início da nova lista vira a base.
- Q: Absorver o bug "Estado de erro da Home não tem elemento focável"? →
  A: Sim. A tela de perfis usa `ErrorState` com "Tentar de novo" focável.
- Q: Absorver o bug "`e2e.mjs` testa um diálogo de saída que não existe
  mais"? → A: Sim. `e2e.mjs` é reescrito para o fluxo novo e volta a ficar
  verde.
- Q: Quais ações o modal de saída oferece? → A: "Cancelar" (foco inicial) e
  "Sair". RETURN no modal equivale a Cancelar.
