# Feature Specification: Carga de listas — progresso claro, pré-carga em segundo plano, contagens e atualização visível

**Slug**: `038-carga-listas-pre-carga`

**Created**: 2026-09-30

**Status**: Convergida

**Input**: Assessment `sdd/assessments/carga-listas-progresso-claro-entrada-instantanea/`
(veredito **go**, 2026-09-30). Dores relatadas pelo dono do produto ao incluir
uma lista Xtream ou por URL: (1) a tela de carga não mostra exatamente o que
está sendo carregado; (2) Live TV, Filmes e Séries demoram — os itens só
chegam quando a pessoa entra na categoria, e a primeira entrada leva **~1
minuto** na TV de referência; (3) a contagem de itens de uma categoria só
aparece depois de entrar; (4) preocupação com a atualização da lista
(visibilidade e travamento).

## Contexto

A feature 010 trocou a importação que gravava o catálogo inteiro (e
congelava a TV — gargalo medido na gravação local, ~311 mil linhas) por
**estrutura primeiro + itens por categoria ao entrar**, com pré-busca de
300 ms na categoria em que o cursor repousa (R-013). Isso resolveu o
congelamento, mas deixou toda primeira entrada fria. A pesquisa da 010 (R0-1)
registrou e descartou "gravar tudo em segundo plano" ("adia o sintoma"), com
uma regra travada (D-007) de não adotar isso sem reabrir o design.

**Esta feature reabre D-007/R0-1 de forma registrada.** O que muda em
relação ao que a 010 descartou: a pré-carga aqui não é um bloco contínuo de
gravação — é feita **uma categoria de cada vez**, pelo mesmo caminho que a
entrada já usa, **suspensa enquanto a pessoa aperta teclas** e **enquanto algo
toca**, e com um critério de recuo explícito (FR-014) se, na TV, ela ainda
assim degradar a navegação.

Fato do código que ampliou o escopo durante a especificação: hoje toda
ressincronização (a automática de 24 h ou "Ressincronizar") cria uma geração
nova cujas categorias nascem **sem itens** — tudo o que já tinha sido
carregado volta a ficar frio. A parte de "atualização" desta feature trata
isso.

## Escopo

### Incluído

- **Tela de importação por seção**: uma linha para Canais, Filmes, Séries e
  Guia (EPG), cada uma com estado real e contagens reais; termina quando
  estrutura e guia estão prontos, com "Abrir lista" em foco.
- **Pré-carga em segundo plano** das categorias da **lista ativa**, nas três
  seções, depois que a lista abre: uma categoria por vez, priorizando onde a
  pessoa está, suspensa durante navegação e reprodução, retomada sozinha.
- **Contagem real por categoria** na navegação lateral assim que a categoria
  está no aparelho; nada exibido antes disso.
- **Indicador discreto no Início**: "Preparando catálogo — N de M
  categorias" durante a pré-carga, "Atualizando catálogo…" durante uma
  atualização, "Catálogo atualizado há …" depois.
- **Atualização sem esfriar o catálogo**: categorias já carregadas continuam
  utilizáveis depois de uma ressincronização e são renovadas em segundo
  plano; categoria com mais de 24 h abre na hora com o que já tem e se renova
  atrás.
- **Diagnóstico e correção da entrada fria**: medir onde vão os ~60 s da
  primeira entrada e corrigir o que for do app.
- Vale para fonte Xtream, URL M3U confirmada como painel Xtream (feature 014)
  e M3U guardada (`stored`, feature 014: a pré-carga materializa o conteúdo
  guardado, sem rede).

### Fora de Escopo

- Voltar à importação que grava o catálogo inteiro antes de liberar a lista.
- Contagem total de itens de uma fonte Xtream na importação (exigiria baixar
  a seção inteira — também fora de escopo na 034).
- Frequência de atualização configurável (o prazo de 24 h continua).
- Reconciliação de favoritos/progresso pós-ressincronização (item 24 do
  backlog) e single-flight de importação (item 36).
- Estado da fonte na linha de Configurações › Fontes IPTV e no cartão de
  "Quem está assistindo?" (Sincronizando, credencial inválida, vencimento) —
  é a feature 034, planejada **depois** desta.
- Pré-carga de episódios de séries (`get_series_info`), metadata TMDB, capas
  ou trailers.
- Pré-carga de listas que não são a ativa.
- Pré-carga durante a reprodução.
- Sinal de erro no trilho para categoria cuja pré-carga falhou.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar numa categoria e ver os itens na hora (Priority: P1)

Com a lista aberta há algum tempo, a pessoa entra em Filmes, escolhe uma
categoria e a grade aparece imediatamente, porque a pré-carga já a trouxe
para o aparelho enquanto ela estava no Início ou navegando em outro lugar.

**Why this priority**: é a dor mais sentida (primeira entrada de ~1 min) e a
que define a impressão de "app lento".

**Independent Test**: abrir uma lista recém-importada, deixar o app ocioso no
Início pelo tempo definido em SC-002, entrar em categorias de cada seção e
medir OK→itens visíveis; repetir navegando durante a pré-carga e conferir que
a navegação não degrada.

**Acceptance Scenarios**:

1. **Given** uma lista recém-importada (só estrutura) e o app ocioso no
   Início, **When** passa o tempo de SC-002, **Then** a maioria das categorias
   de cada seção está no aparelho, sem nenhuma ação da pessoa.
2. **Given** uma categoria já pré-carregada, **When** a pessoa aperta OK nela,
   **Then** os itens aparecem em ≤ 300 ms, lidos do aparelho, sem indicador de
   carregando.
3. **Given** a pré-carga em andamento, **When** a pessoa começa a navegar
   (qualquer tecla), **Then** a pré-carga não inicia uma nova categoria até a
   pessoa ficar ~2 s sem apertar teclas.
4. **Given** a pessoa está na seção Filmes com o foco numa categoria ainda não
   carregada, **When** a pré-carga escolhe a próxima categoria, **Then** a
   escolhida é essa categoria ou uma vizinha dela, antes das demais seções.
5. **Given** um filme ou canal começa a tocar, **When** a pré-carga está no
   meio, **Then** nenhuma categoria nova começa enquanto o player estiver
   aberto; ao fechar o player, a pré-carga retoma de onde parou.
6. **Given** o app é fechado com a pré-carga pela metade, **When** a lista é
   aberta de novo, **Then** a pré-carga continua pelas categorias que faltam,
   sem refazer as já prontas.
7. **Given** o aparelho fica sem internet, **When** a pré-carga chega numa
   categoria que precisa de rede, **Then** ela para sem mensagem e retoma
   quando a conexão volta.

---

### User Story 2 - Primeira entrada fria sem esperar um minuto (Priority: P1)

Quando a pessoa entra numa categoria que ainda não foi pré-carregada (lista
acabou de abrir, ou foi direto nela), a espera volta ao patamar que a feature
010 aprovou, não ~1 minuto.

**Why this priority**: a pré-carga não cobre a primeira navegação logo após
importar; e uma regressão de 20× não pode ser escondida por ela.

**Independent Test**: na TV de referência, com a lista real, cronometrar a
primeira entrada fria em categorias de Canais, Filmes e Séries (antes e
depois), com a decomposição do tempo registrada.

**Acceptance Scenarios**:

1. **Given** a medição de hoje, **When** o plano começa, **Then** existe um
   registro de onde vai o tempo da primeira entrada fria (resposta do painel,
   leitura da resposta, gravação no aparelho, desenho da grade/capas), por
   seção.
2. **Given** a parte do tempo que é do app, **When** a feature termina,
   **Then** a primeira entrada fria com rede boa volta a ≤ 3 s (meta da 010)
   ou o motivo de não voltar está registrado como lentidão do painel, com
   números.
3. **Given** uma entrada fria em andamento, **When** a pessoa espera, **Then**
   a tela mostra o estado de carregando com um elemento focável (como hoje),
   nunca um percentual inventado.

---

### User Story 3 - Saber o que está sendo carregado ao incluir a lista (Priority: P2)

Ao incluir uma lista, a tela de importação mostra uma linha por parte —
Canais, Filmes, Séries, Guia — dizendo em que pé cada uma está e quantas
categorias (ou itens, para M3U) já foram lidas.

**Why this priority**: primeira impressão; hoje a tela diz só "Lendo
categorias — Categorias lidas: N", sem dizer de quê.

**Independent Test**: importar uma lista Xtream e uma M3U e observar a tela
do começo ao fim, incluindo uma falha forçada do guia.

**Acceptance Scenarios**:

1. **Given** uma importação Xtream em andamento, **When** a pessoa olha a
   tela, **Then** vê quatro linhas (Canais, Filmes, Séries, Guia), cada uma
   com estado "Aguardando", "Carregando", "Pronto" ou "Falhou" e, quando
   pronto, a contagem real ("41 categorias").
2. **Given** uma importação M3U em andamento, **When** a pessoa olha a tela,
   **Then** as linhas mostram contagens reais de itens por tipo conforme a
   leitura avança (M3U sabe a contagem na importação).
3. **Given** uma seção que o provedor não tem (ex.: lista só de canais),
   **When** a importação termina, **Then** essa linha diz que a lista não tem
   essa parte — nunca "0 categorias" como se fosse falha, nunca "Carregando"
   para sempre.
4. **Given** o guia falha e o resto termina, **When** a importação termina,
   **Then** a linha Guia diz "Falhou" com o motivo categorizado, e "Abrir
   lista" fica disponível e em foco.
5. **Given** estrutura e guia prontos, **When** a importação termina, **Then**
   "Abrir lista" recebe o foco e a tela diz que os itens de cada categoria
   continuam chegando em segundo plano.
6. **Given** qualquer estado da tela, **When** a pessoa a vê, **Then** nenhum
   percentual aparece.

---

### User Story 4 - Ver o tamanho de cada categoria (Priority: P2)

Na navegação lateral de Live TV, Filmes e Séries, cada categoria já presente
no aparelho mostra quantos itens tem; as outras não mostram número até
chegarem.

**Why this priority**: ajuda a escolher o que abrir; com a pré-carga, a
maioria das categorias ganha número sem a pessoa entrar.

**Independent Test**: com a pré-carga pela metade, abrir Filmes e conferir
que só as categorias no aparelho mostram número, e que o número bate com a
grade ao entrar.

**Acceptance Scenarios**:

1. **Given** uma categoria no aparelho com 103 filmes, **When** a pessoa vê a
   navegação lateral, **Then** a categoria mostra 103.
2. **Given** uma categoria Xtream ainda não carregada, **When** a pessoa vê a
   navegação lateral, **Then** a categoria não mostra número nenhum (nem "0",
   nem estimativa).
3. **Given** uma categoria M3U guardada ainda não aberta, **When** a pessoa vê
   a navegação lateral, **Then** mostra a contagem que a importação já
   conhece.
4. **Given** a pré-carga termina uma categoria enquanto a pessoa está na
   navegação lateral, **When** isso acontece, **Then** o número aparece sem
   mover o foco nem a rolagem.

---

### User Story 5 - Atualizar a lista sem perder o que já estava pronto (Priority: P2)

Quando a lista se atualiza (automática por idade ou "Ressincronizar"), as
categorias que já estavam no aparelho continuam abrindo na hora; a renovação
acontece em segundo plano, e o Início diz que o catálogo está sendo
atualizado e, depois, há quanto tempo foi.

**Why this priority**: hoje cada atualização esfria o catálogo inteiro — a
pessoa volta a esperar em todas as categorias a cada 24 h.

**Independent Test**: com várias categorias carregadas, ressincronizar a
lista e entrar nelas durante e logo depois; forçar uma categoria com mais de
24 h e entrar nela.

**Acceptance Scenarios**:

1. **Given** categorias carregadas e uma ressincronização concluída, **When**
   a pessoa entra numa delas, **Then** os itens aparecem na hora (os
   anteriores, se a renovação ainda não chegou nela).
2. **Given** uma categoria renovada em segundo plano enquanto a pessoa está
   dentro dela, **When** a versão nova é gravada, **Then** a grade/lista passa
   a mostrar a versão nova mantendo o foco no mesmo item (por id); se o item
   sumiu, o foco vai para o vizinho mais próximo.
3. **Given** uma categoria carregada há mais de 24 h, **When** a pessoa entra,
   **Then** os itens guardados aparecem na hora e a renovação acontece atrás.
4. **Given** uma categoria que o provedor removeu, **When** a atualização
   termina, **Then** ela sai da navegação lateral; uma categoria nova entra
   como "não carregada" e vai para a fila da pré-carga.
5. **Given** uma atualização em andamento, **When** a pessoa olha o Início,
   **Then** vê "Atualizando catálogo…"; ao terminar, "Catálogo atualizado há
   …" com o tempo real desde a última atualização bem-sucedida.
6. **Given** uma atualização em andamento, **When** a pessoa navega, **Then**
   a navegação não degrada (mesmo critério de SC-003).
7. **Given** uma atualização que falhou, **When** a pessoa usa a lista,
   **Then** tudo o que estava no aparelho continua utilizável e o Início diz a
   hora da última atualização bem-sucedida.

---

### User Story 6 - Acompanhar a pré-carga sem ser interrompido (Priority: P3)

No Início, uma linha discreta mostra "Preparando catálogo — N de M
categorias" enquanto a pré-carga roda, e some quando termina.

**Why this priority**: informativo — a pré-carga funciona sem isso, mas a
pessoa entende por que algumas categorias ainda não têm número.

**Independent Test**: abrir uma lista recém-importada e observar o Início até
a pré-carga terminar.

**Acceptance Scenarios**:

1. **Given** a pré-carga em andamento, **When** a pessoa está no Início,
   **Then** vê "Preparando catálogo — N de M categorias", com N e M reais.
2. **Given** a pré-carga termina, **When** a pessoa está no Início, **Then** a
   linha dá lugar a "Catálogo atualizado há …".
3. **Given** a linha de estado, **When** a pessoa navega pelo Início, **Then**
   ela não é focável, não rouba foco e não abre nada.

### Edge Cases

- **Lista enorme** (dezenas de milhares de itens): a pré-carga leva horas;
  isso é aceitável, desde que SC-003 valha o tempo todo.
- **Armazenamento cheio** durante a pré-carga: a pré-carga para, nada que a
  pessoa já usa é apagado, e a entrada numa categoria segue o fluxo de erro
  existente (`storage_full`).
- **Troca de lista ativa** com pré-carga em andamento: a pré-carga da lista
  anterior para; a nova lista começa a sua.
- **Ressincronização iniciada durante a pré-carga**: a pré-carga não grava
  numa geração que está sendo substituída; retoma sobre a nova.
- **Pessoa entra numa categoria que a pré-carga está buscando agora**: uma
  única busca é compartilhada, nunca duas.
- **Categoria que falha repetidamente** na pré-carga: pula, re-tenta no fim
  da fila até um limite, e depois só ao entrar; nenhum toast.
- **Categoria vazia** (provedor declara, entrega 0): conta como carregada,
  mostra 0 — é dado real.
- **App em segundo plano** (oculto): pré-carga suspensa, como qualquer
  trabalho de fundo (§40 do DS).
- **Relógio do aparelho errado**: "atualizado há …" nunca negativo; idade
  calculada com a mesma regra injetável de frescor que já existe.
- **Série**: a pré-carga traz a lista de séries da categoria, nunca os
  episódios.

## Requirements *(mandatory)*

### Functional Requirements

**Pré-carga**

- **FR-001**: Depois que a lista ativa abre com a estrutura no aparelho, o
  sistema DEVE obter em segundo plano os itens de cada categoria ainda não
  carregada (ou vencida) das três seções, sem ação da pessoa.
- **FR-002**: A pré-carga DEVE processar uma categoria de cada vez e usar o
  mesmo caminho de obtenção e gravação da entrada normal, compartilhando uma
  busca em andamento para a mesma categoria.
- **FR-003**: A pré-carga NÃO DEVE iniciar uma nova categoria enquanto houver
  teclas sendo apertadas; DEVE retomar só depois de um intervalo sem tecla
  (padrão ~2 s, ajustável após medição na TV).
- **FR-004**: A pré-carga NÃO DEVE iniciar nenhuma categoria enquanto o
  player estiver aberto (qualquer tipo de mídia), com o app oculto ou sem
  conexão; DEVE retomar sozinha quando a condição acaba.
- **FR-005**: A ordem DEVE priorizar a seção aberta e as categorias vizinhas
  da focada; fora disso, Canais → Filmes → Séries, na ordem declarada pelo
  provedor. Esta ordem é um padrão a validar na TV.
- **FR-006**: A pré-carga DEVE continuar de onde parou entre aberturas do app,
  sem refazer categorias frescas.
- **FR-007**: Falha numa categoria DEVE mover essa categoria para o fim da
  fila, com limite de tentativas por sessão; NÃO DEVE gerar toast nem marca
  de erro na navegação lateral.
- **FR-008**: Armazenamento cheio DEVE interromper a pré-carga sem apagar
  nada que a pessoa usa.
- **FR-009**: A pré-carga DEVE valer só para a lista ativa; trocar de lista
  DEVE parar a anterior.
- **FR-010**: Para M3U guardada, a pré-carga DEVE materializar o conteúdo já
  guardado da categoria, sem rede.
- **FR-011**: Mover o foco NUNCA DEVE disparar uma consulta além do que já
  existe hoje (pré-busca por repouso de 300 ms); a pré-carga é agendada pela
  abertura da lista, não pelo foco — o foco só reordena a fila.

**Entrada fria**

- **FR-012**: O plano DEVE começar medindo, na TV de referência e com a lista
  real, a decomposição do tempo da primeira entrada fria por seção (resposta
  do painel, leitura, gravação, desenho da grade/capas), sem registrar URL,
  credencial ou conteúdo — só tempos, contagens e tamanhos.
- **FR-013**: O que a medição atribuir ao app DEVE ser corrigido nesta
  feature, com meta de ≤ 3 s em rede boa; o que for do painel DEVE ficar
  registrado com números.
- **FR-014**: Se a medição na TV mostrar que a pré-carga degrada a navegação
  além de SC-003 mesmo com FR-003/FR-004, a pré-carga DEVE recuar para
  "vizinhança da categoria focada" (sem percorrer o catálogo inteiro), e as
  demais partes desta feature continuam valendo. O recuo é registrado no
  plano.

**Tela de importação**

- **FR-015**: A tela de importação DEVE mostrar uma linha por parte — Canais,
  Filmes, Séries, Guia — com estado real ("Aguardando", "Carregando",
  "Pronto", "Falhou", "Não disponível nesta lista") e contagem real
  (categorias para Xtream; itens por tipo para M3U).
- **FR-016**: A tela NUNCA DEVE mostrar percentual.
- **FR-017**: Uma parte que a lista não tem DEVE aparecer como "Não
  disponível nesta lista", nunca como "0" nem como falha.
- **FR-018**: Falha do guia NÃO DEVE impedir abrir a lista; a linha mostra o
  motivo categorizado (mesma taxonomia `EPG-02` da feature 030), nunca o erro
  cru.
- **FR-019**: Ao terminar (estrutura e guia resolvidos), "Abrir lista" DEVE
  receber o foco e a tela DEVE dizer que os itens continuam chegando em
  segundo plano.

**Contagem**

- **FR-020**: A navegação lateral de Live TV, Filmes e Séries DEVE mostrar o
  número real de itens de cada categoria presente no aparelho.
- **FR-021**: Categoria ainda não carregada NÃO DEVE mostrar número (nem "0",
  nem estimativa); M3U guardada DEVE mostrar a contagem que a importação já
  conhece.
- **FR-022**: Um número que passa a existir DEVE aparecer sem mover foco nem
  rolagem.
- **FR-023**: "★ Favoritos", "↺ Histórico" e "Todos" seguem suas regras atuais
  de contagem; esta feature não inventa contagem para eles.

**Atualização**

- **FR-024**: Uma ressincronização (por idade ou manual) NÃO DEVE tornar
  inutilizáveis as categorias já carregadas: até serem renovadas, a entrada
  DEVE mostrar os itens anteriores na hora.
- **FR-025**: As categorias carregadas DEVEM ser renovadas em segundo plano
  pelo mesmo agendador da pré-carga (FR-002 a FR-004).
- **FR-026**: Entrar numa categoria vencida (> 24 h) DEVE mostrar os itens
  guardados na hora e renovar em segundo plano.
- **FR-027**: Quando a versão renovada de uma categoria aberta é gravada, a
  tela DEVE atualizar mantendo o foco pelo id do item; se o item saiu, o foco
  vai para o vizinho mais próximo (constitution: restaurar foco por id, nunca
  por índice).
- **FR-028**: Categorias que o provedor removeu DEVEM sair da navegação após a
  atualização; novas entram como não carregadas.
- **FR-029**: Favoritos, progresso e histórico NÃO DEVEM ser afetados por
  manter itens anteriores durante a renovação (continuam por identidade
  estável). A reconciliação pós-resync em si continua sendo o item 24.
- **FR-030**: Falha na atualização DEVE deixar o catálogo anterior intacto e
  utilizável.

**Indicador no Início**

- **FR-031**: O Início DEVE mostrar uma linha de estado não focável:
  "Preparando catálogo — N de M categorias" durante a pré-carga,
  "Atualizando catálogo…" durante uma ressincronização e "Catálogo
  atualizado há …" (idade real da última atualização bem-sucedida) fora
  disso.
- **FR-032**: A linha NUNCA DEVE receber foco, mostrar percentual ou exibir
  qualquer credencial, URL ou erro cru.
- **FR-033**: A linha de Configurações e o cartão de "Quem está assistindo?"
  NÃO DEVEM ser alterados por esta feature (feature 034).

**Constitution**

- **FR-034**: Todo estado novo DEVE ter elemento focável quando for uma tela
  (tela de importação); segredos nunca em log, mensagem ou tela; nenhum dado
  inventado.

### Key Entities

- **Categoria**: já existe; ganha relevância o instante da última obtenção e
  a contagem real gravada. Passa a precisar sobreviver (com seus itens) a uma
  ressincronização até ser renovada.
- **Fila de pré-carga**: por lista ativa — quais categorias faltam/venceram,
  quais falharam nesta sessão e quantas vezes, e a prioridade atual (seção e
  vizinhança). Recalculável a partir do disco; não precisa ser a fonte da
  verdade.
- **Progresso de importação por parte**: estado e contagem de Canais, Filmes,
  Séries e Guia numa importação.
- **Estado de atualização da lista**: preparando (N de M), atualizando, ou
  atualizado há (instante da última atualização bem-sucedida).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Entrar numa categoria já no aparelho leva ≤ 300 ms da tecla OK
  até itens visíveis, na TV de referência (QN50Q60DAGXZD).
- **SC-002**: Com a lista real aberta e o app ocioso, ≥ 80 % das categorias de
  cada seção ficam prontas em um prazo que o plano fixa **depois** da medição
  de FR-012 (com ~1 min/categoria hoje, o prazo depende da correção de
  FR-013).
- **SC-003**: Com a pré-carga ou uma atualização rodando, a latência
  tecla→foco p95 na navegação lateral e na grade fica dentro de ±20 % da
  mesma medição sem trabalho de fundo, na TV de referência.
- **SC-004**: Zero início de categoria da pré-carga com o player aberto
  (verificável por registro de tempos/contagens); nenhum engasgo atribuível.
- **SC-005**: Primeira entrada fria com rede boa ≤ 3 s, ou o excedente
  atribuído ao painel com números registrados.
- **SC-006**: Depois de uma ressincronização, 100 % das categorias que
  estavam carregadas abrem sem indicador de carregando.
- **SC-007**: Nenhuma contagem exibida difere do que está gravado; nenhuma
  categoria não carregada mostra número; nenhum percentual em qualquer tela
  desta feature.
- **SC-008**: **Gate obrigatório na TV física** (exceção "Validação em
  hardware real" da constitution, mesmo padrão das features 011/013/027/028):
  SC-001, SC-003, SC-004 e SC-005 só contam medidos no aparelho.

## Assumptions

- O catálogo inteiro da lista real cabe no armazenamento da TV (confirmado
  pelo dono do produto, 2026-09-30).
- O painel continua aceitando `category_id` nas listagens (confirmado na 010).
- A pré-busca por repouso de 300 ms (R-013 da 010) continua existindo; se
  vira só prioridade dentro do agendador ou mecanismo separado é decisão do
  plano.
- "~1 minuto" é observação do dono do produto, não cronometragem; FR-012 a
  substitui por medição.
- Uma lista ativa por vez (ADR-011).
- A feature 034 é planejada depois desta e rebaseia sobre ela.

## Clarifications

### Sessão 2026-09-30

Do assessment (`sdd/assessments/carga-listas-progresso-claro-entrada-instantanea/`):

- Q: Que troca aceitar para entrada instantânea? → A: Pré-carga em segundo plano (não carga eager, não só percepção).
- Q: Contagem por categoria? → A: Número exato quando souber; nada antes.
- Q: Preocupação com atualização é sobre o quê? → A: Visibilidade e travamento durante a atualização (não frequência).
- Q: Tela de carga? → A: Etapas por seção com estado e contagens reais.
- Q: Meta de "instantâneo"? → A: ≤ 300 ms em categoria já pré-carregada.
- Q: Pré-carga durante reprodução? → A: Pausa.
- Q: Prioridade? → A: Alta, antes de tudo — entra antes da 034.
- Q: Tempo atual da primeira entrada? → A: ~1 minuto.
- Q: Catálogo inteiro cabe no aparelho? → A: Sim.
- Q: Ordem da pré-carga? → A: O dono do produto ainda não sabe — fica padrão a validar.

Nesta especificação:

- Q: Após uma atualização, as categorias já carregadas? → A: Continuam prontas e renovam em segundo plano (FR-024/FR-025).
- Q: Entrar em categoria com mais de 24 h? → A: Mostra o que tem e renova atrás (FR-026).
- Q: Onde acompanhar a pré-carga? → A: Indicador discreto no Início + contagem por categoria no trilho (FR-020, FR-031).
- Q: Quando a tela de importação termina? → A: Estrutura + guia prontos; pré-carga segue atrás (FR-019).
- Q: Ordem padrão? → A: Onde a pessoa está primeiro (seção aberta, vizinhança da focada), depois Canais → Filmes → Séries (FR-005).
- Q: A feature investiga e corrige a entrada fria de ~1 min? → A: Sim, com meta própria de ≤ 3 s (FR-012/FR-013).
- Q: Como ceder à navegação? → A: Pausa enquanto há teclas, retoma após ~2 s parado (FR-003).
- Q: Quais listas pré-carregam? → A: Só a ativa (FR-009).
- Q: Falha da pré-carga numa categoria? → A: Re-tenta mais tarde, sem alarde (FR-007).
- Q: Gate na TV física? → A: Obrigatório (SC-008).
- Q: Onde fica "Atualizada há…"? → A: Na mesma linha discreta do Início (FR-031); Configurações e cartão ficam com a 034.
