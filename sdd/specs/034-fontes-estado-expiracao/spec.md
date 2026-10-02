# Feature Specification: Fontes IPTV completas — estado, contagem e expiração da conta

**Slug**: `034-fontes-estado-expiracao`

**Created**: 2026-09-30

**Status**: Convergida

**Input**: Item 46 do backlog — "Fontes IPTV completas: estado, contagem e
expiração da conta". A linha de fonte em Configurações e o cartão em "Quem
está assistindo?" passam a mostrar o que o §24.1/§24.3 do DS V14 pede, só com
dado real: tipo, contagem conhecida, estado de sincronização (incluindo
"Sincronizando" e "Credencial inválida"), estado do EPG e a data de
vencimento da conta Xtream.

## Escopo

### Incluído

- **Linha da fonte** em Configurações › Fontes IPTV: tipo, contagem conhecida,
  estado de sincronização (Sincronizada / Sincronizando / Erro / Credencial
  inválida), estado do EPG (já existe desde a 030, mantido), data de
  vencimento da conta e chip de vencimento.
- **Cartão da lista** em "Quem está assistindo?": tipo e estado como hoje,
  mais **um chip só quando há algo a agir** (vence em N dias, expirada,
  credencial inválida, erro na sincronização, erro no EPG) e o estado
  "Sincronizando".
- **Data de vencimento da conta Xtream** guardada no aparelho, atualizada a
  cada sincronização e numa consulta leve à conta quando a pessoa escolhe a
  lista (no máximo uma vez a cada 24 h).
- **Bloqueio ao escolher uma lista** com conta expirada ou credencial
  recusada: tela com o motivo e as ações "Editar lista", "Verificar de novo"
  e "Voltar".
- Vale para toda fonte que fala o protocolo Xtream: fonte por credencial e
  URL M3U confirmada como painel Xtream (feature 014).

### Fora de Escopo

- Número máximo de conexões, conexões em uso e conta de teste (`is_trial`).
- Total real de itens de uma fonte Xtream (exigiria baixar todas as
  listagens, a carga pesada que a feature 010 retirou).
- Aviso de vencimento dentro do Início ou durante a reprodução — só no cartão,
  na linha e no bloqueio.
- Vencimento para M3U avulsa ou "Modo limitado": o arquivo não declara conta.
- Taxonomia de códigos de erro (`SRC-401` etc.) — é do item 19; esta feature
  só usa nomes de estado compatíveis com ela.
- Atualizar várias fontes de uma vez (item 23).
- Renovar a assinatura pelo app: o app só informa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber quando a conta vence (Priority: P1)

A pessoa abre Configurações › Fontes IPTV ou "Quem está assistindo?" e vê,
para cada lista Xtream, até quando a conta vale; perto do vencimento ou
depois dele, um chip avisa sem precisar abrir nada.

**Why this priority**: é a causa mais comum de "a lista parou de funcionar"
em IPTV, e hoje o app não mostra isso em lugar nenhum — o `exp_date` é lido
na importação e descartado.

**Independent Test**: sincronizar uma fonte com um painel de teste cujo
`exp_date` é daqui a 3 dias, daqui a 30 dias, no passado, `0` e ausente;
conferir o texto da linha e o chip no cartão em cada caso.

**Acceptance Scenarios**:

1. **Given** uma lista Xtream sincronizada com vencimento daqui a 30 dias,
   **When** a pessoa abre Configurações › Fontes IPTV, **Then** a linha
   mostra "Conta válida até DD/MM/AAAA" e o cartão da lista não mostra chip
   de vencimento.
2. **Given** vencimento daqui a 3 dias, **When** a pessoa abre qualquer das
   duas telas, **Then** a linha e o cartão mostram o chip âmbar "Vence em 3
   dias".
3. **Given** vencimento ontem, **When** a pessoa abre qualquer das duas telas,
   **Then** a linha e o cartão mostram o chip de erro "Conta expirada".
4. **Given** o painel declara `exp_date` `0`, negativo ou ausente, **When** a
   pessoa abre Configurações, **Then** a linha mostra "Sem data de
   vencimento" e nenhum chip de vencimento aparece.
5. **Given** o painel declara a conta como ativa mas com data no passado,
   **When** a data é lida, **Then** a conta conta como expirada.

---

### User Story 2 - Não entrar numa lista que não vai tocar (Priority: P1)

Ao escolher uma lista com conta expirada ou credencial recusada, a pessoa não
cai num catálogo que não reproduz nada: vê o motivo e o que fazer.

**Why this priority**: sem isso, a pessoa navega, escolhe um filme e só então
recebe um erro genérico de reprodução — o motivo real nunca aparece.

**Independent Test**: com uma lista cuja última verificação diz "expirada",
escolher o cartão em "Quem está assistindo?" e conferir a tela de bloqueio,
suas três ações e o foco.

**Acceptance Scenarios**:

1. **Given** uma lista Xtream cuja verificação diz "conta expirada", **When**
   a pessoa escolhe o cartão, **Then** o app não abre o Início e mostra uma
   tela com o motivo ("A assinatura desta lista venceu em DD/MM/AAAA"), com
   foco em "Editar lista" e as ações "Verificar de novo" e "Voltar".
2. **Given** a mesma tela de bloqueio e a pessoa acabou de renovar no
   provedor, **When** ela escolhe "Verificar de novo" e o painel responde
   conta válida, **Then** a lista abre normalmente e o novo vencimento fica
   guardado.
3. **Given** uma lista cuja credencial o painel recusou, **When** a pessoa a
   escolhe, **Then** a tela de bloqueio diz "O provedor recusou o usuário ou a
   senha desta lista", com as mesmas três ações.
4. **Given** a tela de bloqueio, **When** a pessoa escolhe "Editar lista",
   **Then** abre o formulário de edição daquela lista; ao salvar e
   sincronizar com sucesso, o bloqueio deixa de valer.
5. **Given** a tela de bloqueio, **When** a pessoa aperta RETURN ou escolhe
   "Voltar", **Then** volta a "Quem está assistindo?" com o foco no cartão
   daquela lista.
6. **Given** uma lista com vencimento conhecido no passado e o aparelho sem
   internet, **When** a pessoa escolhe a lista, **Then** o bloqueio vale pelo
   dado guardado, e a tela diz que não foi possível confirmar agora.

---

### User Story 3 - Ver o estado da sincronização como ele é (Priority: P2)

Enquanto uma lista sincroniza, a linha e o cartão dizem "Sincronizando"; se a
última sincronização falhou por credencial, dizem "Credencial inválida" em
vez de um "Erro" genérico.

**Why this priority**: hoje o único sinal de sincronização em andamento é o
botão "Ressincronizar" em carregamento, e uma credencial recusada aparece
igual a uma falha de rede.

**Independent Test**: ressincronizar uma lista e observar a linha e o cartão
durante e depois; repetir com a senha trocada no painel de teste.

**Acceptance Scenarios**:

1. **Given** uma ressincronização em andamento de uma lista, **When** a pessoa
   olha a linha dela em Configurações ou o cartão dela, **Then** os dois
   dizem "Sincronizando" no lugar de "Sincronizada em…".
2. **Given** a sincronização terminou com sucesso, **When** a pessoa olha a
   linha, **Then** volta a "Sincronizada em DD/MM, HH:MM".
3. **Given** a última sincronização falhou porque o painel recusou a
   credencial, **When** a pessoa olha a linha ou o cartão, **Then** o estado é
   "Credencial inválida" (e o cartão mostra o chip correspondente).
4. **Given** a última sincronização falhou por outro motivo (rede, lista
   inválida), **When** a pessoa olha a linha, **Then** o estado é "Erro na
   última sincronização", como hoje.

---

### User Story 4 - Saber o tamanho da lista (Priority: P3)

A linha da fonte em Configurações diz quanto conteúdo a lista tem, com o dado
que existe de verdade.

**Why this priority**: informativo; o §24.1 pede, mas nada quebra sem ele.

**Independent Test**: uma fonte Xtream e uma M3U guardada; conferir o texto
de contagem de cada uma.

**Acceptance Scenarios**:

1. **Given** uma fonte Xtream sincronizada com 41 categorias de canais, 20 de
   filmes e 30 de séries, **When** a pessoa abre Configurações, **Then** a
   linha mostra "41 categorias de canais · 20 de filmes · 30 de séries".
2. **Given** uma fonte M3U guardada (feature 014) com 1 200 canais e 300
   filmes, **When** a pessoa abre Configurações, **Then** a linha mostra os
   totais exatos de itens por tipo.
3. **Given** um tipo sem nenhuma categoria declarada, **When** a linha é
   montada, **Then** esse tipo não aparece (nunca "0 de séries").
4. **Given** uma seção que não respondeu na última sincronização, **When** a
   linha é montada, **Then** ela diz que aquele tipo não foi obtido, nunca
   "0".

---

### Edge Cases

- A consulta à conta ao escolher a lista demora: passado o limite de espera,
  a decisão usa o dado guardado; a pessoa nunca fica presa numa espera sem
  saída.
- A consulta à conta falha por rede e o último dado guardado diz "válida" ou
  não há data: a lista abre normalmente.
- Lista nunca verificada (sincronizada antes desta feature): sem data
  guardada, abre normalmente; a primeira consulta ao escolher a lista (ou a
  próxima sincronização) grava a data.
- Relógio do aparelho errado: a comparação usa o relógio do aparelho; o texto
  do bloqueio mostra a data de vencimento para a pessoa conferir.
- Vencimento hoje, ainda no futuro em horas: conta como válida até passar a
  hora declarada; o chip diz "Vence hoje".
- A lista bloqueada é a lista ativa (a última usada): o bloqueio vale do mesmo
  jeito ao escolhê-la.
- Duas listas com o mesmo painel e contas diferentes: cada uma tem seu
  vencimento.
- Sincronização em andamento e a pessoa escolhe a lista: comportamento atual
  de abrir, com o estado "Sincronizando" visível no cartão.
- Excluir a lista remove também o vencimento guardado.
- M3U avulsa ou "Modo limitado": nenhum texto de vencimento, nenhum
  bloqueio por conta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE guardar, por fonte que fala o protocolo Xtream, a
  data de vencimento declarada pelo painel (`exp_date`), o instante da última
  verificação da conta e o resultado dela (válida, expirada, credencial
  recusada, sem data).
- **FR-002**: O sistema DEVE atualizar esses dados a cada sincronização da
  fonte e em cada verificação feita ao escolher a lista.
- **FR-003**: `exp_date` igual a `0`, negativo, vazio, ausente ou não numérico
  DEVE significar "sem data de vencimento".
- **FR-004**: Uma data de vencimento no passado DEVE contar como conta
  expirada, mesmo que o painel declare a conta como ativa.
- **FR-005**: A linha da fonte em Configurações DEVE mostrar, para fonte
  Xtream: "Conta válida até DD/MM/AAAA" quando faltar mais de 7 dias; o chip
  âmbar "Vence em N dias" (ou "Vence hoje"/"Vence amanhã") quando faltar 7
  dias ou menos; o chip de erro "Conta expirada" quando a data passou; e "Sem
  data de vencimento" quando não houver data.
- **FR-006**: O cartão da lista em "Quem está assistindo?" DEVE mostrar um
  chip só nestes casos: vence em até 7 dias, conta expirada, credencial
  inválida, erro na última sincronização, erro no EPG. Fora deles, nenhum
  chip novo.
- **FR-007**: Todo chip DEVE ter texto legível e nome acessível; a cor nunca é
  o único sinal.
- **FR-008**: Ao escolher uma lista Xtream em "Quem está assistindo?", o
  sistema DEVE consultar a conta no painel se a última verificação tiver mais
  de 24 horas (ou nunca tiver ocorrido); dentro das 24 horas, DEVE usar o dado
  guardado sem consultar.
- **FR-009**: A consulta do FR-008 DEVE ter um limite de espera; se ele
  passar ou a consulta falhar por rede, a decisão DEVE usar o último dado
  guardado.
- **FR-010**: Se o resultado (fresco ou guardado) for conta expirada ou
  credencial recusada, o sistema DEVE mostrar uma tela de bloqueio no lugar do
  Início, com o motivo em texto e as ações "Editar lista", "Verificar de novo"
  e "Voltar", com o foco inicial em "Editar lista".
- **FR-011**: A tela de bloqueio por conta expirada DEVE mostrar a data de
  vencimento; quando a decisão veio do dado guardado porque a consulta não
  pôde ser feita, DEVE dizer que não foi possível confirmar agora.
- **FR-012**: "Verificar de novo" DEVE consultar a conta na hora,
  independentemente das 24 horas; se o resultado for válido, a lista DEVE
  abrir normalmente.
- **FR-013**: "Voltar" e RETURN na tela de bloqueio DEVEM voltar a "Quem está
  assistindo?" com o foco no cartão daquela lista.
- **FR-014**: "Editar lista" DEVE abrir o formulário de edição da fonte; uma
  sincronização bem-sucedida depois disso DEVE limpar o bloqueio.
- **FR-015**: A linha e o cartão DEVEM mostrar "Sincronizando" enquanto uma
  sincronização daquela fonte estiver em andamento.
- **FR-016**: Quando a última sincronização falhou por credencial recusada, o
  estado mostrado DEVE ser "Credencial inválida"; por assinatura expirada,
  "Conta expirada"; por outro motivo, o "Erro na última sincronização" atual.
- **FR-017**: A linha da fonte DEVE mostrar a contagem conhecida: para fonte
  Xtream, o número de categorias por tipo; para fonte M3U guardada, o total
  exato de itens por tipo registrado na importação.
- **FR-018**: A contagem NUNCA DEVE mostrar "0" para um tipo sem categoria
  declarada nem para uma seção que não respondeu; o primeiro caso omite o
  tipo, o segundo diz que ele não foi obtido.
- **FR-019**: Nenhuma tela, chip, `aria-*`, log ou mensagem de erro desta
  feature DEVE conter endereço do painel, usuário, senha ou URL.
- **FR-020**: A consulta à conta NUNCA DEVE acontecer por foco — só ao
  escolher a lista, ao escolher "Verificar de novo" e durante a sincronização.
- **FR-021**: Excluir a fonte DEVE apagar os dados de vencimento e de
  verificação dela.
- **FR-022**: M3U avulsa e fonte em "Modo limitado" NÃO DEVEM mostrar texto de
  vencimento nem ser bloqueadas por conta.
- **FR-023**: O estado do EPG já exibido na linha (feature 030) DEVE
  continuar como está; o cartão ganha só o chip de erro de EPG do FR-006.
- **FR-024**: Toda tela e estado novos (incluindo a verificação em
  andamento ao escolher a lista) DEVEM ter um elemento focável.

### Key Entities

- **Conta da fonte**: vencimento declarado (ou "sem data"), instante da última
  verificação, resultado da última verificação (válida / expirada / credencial
  recusada / sem data / não verificada). Pertence a uma fonte; some com ela.
- **Contagem da fonte**: número de categorias por tipo (Xtream) ou total de
  itens por tipo (M3U guardada), mais quais seções não responderam.
- **Estado exibido da fonte**: derivado — Sincronizando, Sincronizada, Erro,
  Credencial inválida, Conta expirada — mais o estado do EPG já existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para os cinco casos de `exp_date` (futuro > 7 dias, ≤ 7 dias,
  passado, `0`/ausente, "ativa" com data passada), a linha e o cartão mostram
  exatamente o texto e o chip do FR-005/FR-006 — 5 de 5.
- **SC-002**: Escolher uma lista com conta expirada ou credencial recusada
  nunca abre o Início — 100 % dos casos, com e sem internet.
- **SC-003**: Escolher uma lista válida não fica mais de 5 segundos esperando a
  verificação da conta, mesmo com o painel fora do ar.
- **SC-004**: Nenhuma credencial, endereço de painel ou URL aparece no texto,
  nos nomes acessíveis ou nos logs das telas tocadas por esta feature —
  verificado por varredura automatizada.
- **SC-005**: Nenhuma contagem exibida é "0" para um tipo não declarado ou não
  obtido.
- **SC-006**: Na lista real do `.env`, a data de vencimento exibida coincide
  com a que o painel declara.

## Assumptions

- O painel de referência declara `exp_date` em segundos Unix, como o
  conector já assume (`isExpired` em `xtreamConnector.ts`).
- A consulta leve à conta é a mesma que o conector já usa na importação
  (`player_api.php` sem ação), sem baixar catálogo.
- O limite de espera da verificação (FR-009) fica em torno de 5 s; o valor
  exato é do `sdd-plan`.
- Os nomes de estado ("Credencial inválida", "Conta expirada") são os mesmos
  que o item 19 vai usar ao definir códigos (`SRC-401`); se o item 19 mudar a
  redação, muda em um lugar só.
- "Quem está assistindo?" continua sendo a única entrada numa lista (ADR-011,
  feature 023): não há abertura automática da lista ativa que pule o cartão.
- A fonte M3U guardada já conhece o total de itens por tipo ao final da
  importação (a varredura da feature 014 classifica tudo).

## Clarifications

### Sessão 2026-09-30

- Q: Que "quantidade de conteúdo" a linha mostra? → A: Categorias por tipo
  para Xtream; total exato de itens por tipo para M3U guardada; nunca "0" para
  o que não foi declarado ou obtido.
- Q: Quando a data de vencimento é atualizada? → A: A cada sincronização e
  numa consulta leve ao escolher a lista, no máximo uma vez a cada 24 h; nunca
  por foco.
- Q: Com quantos dias de antecedência o chip fica âmbar? → A: 7 dias.
- Q: Conta expirada ou credencial recusada ao escolher a lista? → A: Não abre
  (bloqueia).
- Q: Quais ações a tela de bloqueio oferece? → A: "Editar lista", "Verificar
  de novo" e "Voltar".
- Q: Sem internet e com a última data já vencida, bloqueia? → A: Sim, pelo
  último dado, dizendo que não foi possível confirmar agora.
- Q: Onde aparece "Sincronizando"? → A: Na linha e no cartão.
- Q: O que o cartão de "Quem está assistindo?" mostra? → A: Tipo e estado
  como hoje, mais um chip só quando há algo a agir.
- Q: A linha mostra a data fora da janela de 7 dias? → A: Sim, "Conta válida
  até DD/MM/AAAA"; sem data, "Sem data de vencimento".
- Q: Entram conexões máximas/ativas ou conta de teste? → A: Não.
