# Feature Specification: Histórico e Continuar Assistindo

**Slug**: `019-historico-continuar-assistindo`

**Created**: 2026-09-26

**Status**: Convergida

**Input**: Item 13 do backlog (`.planning/backlog.md`, Fase 1) — a parte de
"Histórico e continuar assistindo" que ainda falta, depois que
`UserStateRepository` (feature 008), o progresso de filme
(`progressRecorder.ts`, feature 011) e a marca de "assistido" por episódio
(feature 012) já foram entregues. RF-014 (`REQUISITOS-FUNCIONAIS.md`) e
ADR-005 §4 são o texto normativo de origem. Fecha três lacunas: filme
concluído não fica marcado como assistido (só perde o progresso), série
não tem nenhuma visão agregada de quantos episódios já foram vistos, e
`getContinueWatching()` (feature 008) não tem nenhum consumidor visual.

## Escopo

### Incluído

- Marcar um FILME como assistido (reaproveitando `completedAt`,
  já usado por episódio desde a feature 012) ao ultrapassar 90% da
  duração reproduzida, ou ao motor sinalizar conclusão real.
- Ação manual no detalhe do filme para marcar/desmarcar "assistido" —
  cobre tanto corrigir uma marca automática errada quanto registrar algo
  visto fora do app.
- Agregação, por SÉRIE, de quantos episódios já conhecidos (lidos
  localmente ao menos uma vez) já foram assistidos, e o estado "Em dia"
  quando a cobertura for completa e tudo estiver assistido.
- Selo desse estado agregado na grade de Séries, sem precisar abrir o
  detalhe.
- Nova seção "Continuar assistindo" no hub da fonte ("O que você quer
  assistir?"), com os itens (filme/episódio) que têm progresso de
  retomada salvo nessa fonte, mais recente primeiro.

### Fora de Escopo

- Histórico, "já assistido" ou último acesso de CANAL AO VIVO — decisão
  explícita do usuário; um canal ao vivo não ganha nenhum rastreamento
  novo nesta feature.
- Hero completo de "continuar assistindo"/rails na Home de múltiplas
  listas (`HomeScreen.tsx`, "Minhas Listas") — continua sendo o item 16
  do backlog, não antecipado aqui. Esta feature entrega só a seção
  simples dentro do hub de UMA fonte já aberta.
- Ação de marcar/desmarcar vários episódios de uma vez (ex: uma temporada
  inteira) — a ADR-005 já registrava esse desenho como pendente; continua
  fora de escopo, marcação manual continua sendo por episódio individual
  (já existente desde a feature 012).
- Mudar o limiar ou o mecanismo de retomada em si (`RESUME_MAX_RATIO`,
  gravação intermediária de posição) — ortogonal, intocado.
- Qualquer componente novo da "Biblioteca de componentes de TV" (item 15
  do backlog) além do selo mínimo necessário para o estado agregado de
  série.
- "Gostei"/recomendações (item 27/30 do backlog) — sinal diferente,
  não redefinido aqui.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filme assistido até o fim fica marcado (Priority: P1)

Como pessoa que assiste um filme até o fim, quero que o app lembre que já
assisti, sem precisar fazer nada manual, para reconhecer isso ao navegar
pela grade depois.

**Why this priority**: é a lacuna central do RF-014 para filme — hoje um
filme concluído só perde o progresso de retomada, ficando indistinguível
de "nunca assistido".

**Independent Test**: assistir um filme até ultrapassar 90% da duração,
sair, voltar à grade/detalhe, e confirmar que ele aparece identificado
como assistido, mesmo sem progresso de retomada.

**Acceptance Scenarios**:

1. **Given** um filme em reprodução, **When** a posição ultrapassa 90% da
   duração conhecida, **Then** o filme fica marcado como assistido e sua
   retomada intermediária desaparece.
2. **Given** o motor de reprodução sinaliza conclusão real, **When** a
   sessão encerra, **Then** o filme fica marcado como assistido, mesmo
   que a posição reportada nunca tenha cruzado 90% (ex: duração não
   informada pelo motor).
3. **Given** uma tentativa de reprodução que falha antes de qualquer
   avanço, **When** a sessão termina, **Then** nada é marcado como
   assistido, nem qualquer progresso é gravado.

---

### User Story 2 - Corrigir manualmente o "assistido" de um filme (Priority: P1)

Como pessoa que já assistiu um filme fora do app, ou que foi marcado como
assistido por engano, quero marcar ou desmarcar esse estado diretamente no
detalhe do filme.

**Why this priority**: ADR-005 exige correção manual explícita; sem ela,
um selo automático incorreto (ou a falta de um selo para algo visto fora
do app) fica permanente e sem saída.

**Independent Test**: no detalhe de um filme não assistido, acionar
"Marcar como assistido" e confirmar o selo; acionar de novo e confirmar
que desfaz, voltando ao estado anterior.

**Acceptance Scenarios**:

1. **Given** um filme nunca assistido, **When** a pessoa aciona "Marcar
   como assistido" no detalhe, **Then** o filme passa a contar como
   assistido, sem inventar posição de reprodução ou duração.
2. **Given** um filme marcado como assistido (automática ou
   manualmente), **When** a pessoa aciona "Desmarcar assistido", **Then**
   o filme volta a não contar como assistido, sem afetar uma retomada que
   porventura já exista separadamente.

---

### User Story 3 - Saber se uma série está em dia (Priority: P1)

Como pessoa acompanhando uma série, quero ver, sem abrir o detalhe, se já
assisti tudo que está disponível ou quanto ainda falta.

**Why this priority**: é a lacuna central do RF-014 para série — hoje só
existe o selo por episódio individual (feature 012), sem nenhuma visão
agregada da série inteira.

**Independent Test**: assistir todos os episódios conhecidos de uma série
com cobertura completa e ver o selo virar "Em dia" na grade; com um
episódio ainda não assistido, ver a contagem parcial em vez disso.

**Acceptance Scenarios**:

1. **Given** uma série cujos episódios já lidos localmente foram todos
   assistidos, e cuja cobertura é completa (todos os episódios que a
   fonte declara para essa série já foram obtidos ao menos uma vez),
   **When** a pessoa vê a grade de Séries, **Then** o card mostra "Em
   dia".
2. **Given** uma série com pelo menos um episódio conhecido ainda não
   assistido, **When** a pessoa vê a grade, **Then** o card mostra a
   contagem do que já se sabe (assistidos/conhecidos).
3. **Given** uma série cuja cobertura de episódios é parcial (nem todos
   os episódios que a fonte declara já foram obtidos localmente),
   **When** a pessoa vê a grade, **Then** o card NUNCA mostra "Em dia" —
   mostra a contagem parcial conhecida, de um jeito que não pareça
   completa.
4. **Given** uma série "em dia", **When** um novo episódio é detectado
   numa releitura futura da série, **Then** ela deixa de estar "em dia"
   até esse episódio também ser assistido, sem apagar o histórico dos
   episódios já vistos.

---

### User Story 4 - Continuar assistindo a partir do hub da fonte (Priority: P2)

Como pessoa que estava assistindo algo e saiu, quero ver e retomar
rapidamente pelo hub da fonte, sem precisar lembrar em qual categoria
estava.

**Why this priority**: fecha o ciclo do `UserStateRepository` (feature
008), que hoje grava progresso sem nenhum consumidor visual — é o caso de
uso mais direto do requisito de histórico, mas secundário às marcações em
si (US1-3), que são pré-requisito de dado para esta tela fazer sentido.

**Independent Test**: começar a assistir um filme ou episódio, sair antes
do fim, abrir o hub da fonte e confirmar que ele aparece na seção
"Continuar assistindo", com um caminho direto para retomar.

**Acceptance Scenarios**:

1. **Given** um filme ou episódio com progresso de retomada salvo nesta
   fonte, **When** a pessoa abre o hub da fonte ("O que você quer
   assistir?"), **Then** ele aparece na seção "Continuar assistindo",
   mais recente primeiro.
2. **Given** um item concluído (assistido, sem progresso de retomada),
   **When** a pessoa abre o hub, **Then** ele NÃO aparece em "Continuar
   assistindo".
3. **Given** nenhum item com progresso de retomada nesta fonte, **When**
   a pessoa abre o hub, **Then** a seção "Continuar assistindo" não
   aparece — o hub permanece como hoje, só com os três tiles.
4. **Given** um item focado na seção, **When** a pessoa confirma
   (SELECT), **Then** o comportamento é o mesmo de abrir esse item pela
   navegação normal, retomando a posição salva.

---

### Edge Cases

- Item com progresso cuja categoria/fonte de origem não existe mais
  localmente (reconciliação): a seção nunca trava nem mostra um item
  quebrado — mesma disciplina de reconciliação por id já usada em outras
  telas (`CategoryScreenSnapshot`, feature 017).
- Falha de reprodução antes de qualquer avanço real: nunca marca
  assistido nem grava progresso (herdado, já implementado desde a
  feature 011/012).
- Reassistir um filme ou episódio já marcado como assistido: a marca
  permanece (histórico não se apaga); o progresso da nova sessão passa a
  existir em paralelo, sem apagar a marca (mesmo padrão já usado por
  episódio).
- Episódio "mais recente conhecido" de uma série que some da fonte entre
  uma sincronização e outra: a cobertura recalcula a partir do que existe
  agora, sem contar episódio que sumiu.
- Marcar manualmente "assistido" um filme nunca reproduzido: não inventa
  posição de retomada nem duração — só o selo.
- Duas fontes diferentes com o mesmo filme/série: cada uma mantém seu
  próprio histórico e progresso, sem se misturar (identidade já inclui a
  fonte, herdado do `UserStateRepository`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE marcar um filme como assistido quando a
  posição de reprodução ultrapassar 90% da duração conhecida,
  reaproveitando o mesmo mecanismo já usado para episódio (marca
  persistente, distinta de progresso).
- **FR-002**: O sistema DEVE marcar um filme como assistido quando o
  motor de reprodução sinalizar conclusão real, independentemente de a
  posição reportada ter cruzado o percentual do FR-001.
- **FR-003**: O sistema NUNCA DEVE marcar como assistido, nem gravar
  qualquer progresso, a partir de uma tentativa de reprodução que falhou
  antes de qualquer avanço real.
- **FR-004**: O sistema DEVE permitir marcar e desmarcar manualmente o
  estado de "assistido" de um filme, a partir do detalhe do filme.
- **FR-005**: Marcar manualmente como assistido NÃO DEVE inventar uma
  posição de reprodução ou duração.
- **FR-006**: O sistema DEVE calcular, por série, quantos episódios já
  conhecidos (lidos localmente ao menos uma vez) já foram assistidos,
  versus o total conhecido.
- **FR-007**: O sistema DEVE expor o estado "Em dia" para uma série
  somente quando TODOS os episódios que a fonte declara para ela já
  tiverem sido lidos localmente ao menos uma vez E todos estiverem
  marcados como assistidos.
- **FR-008**: Quando a cobertura de episódios de uma série for parcial
  (nem todos os episódios declarados já lidos localmente), o sistema
  NUNCA DEVE exibir "Em dia" — deve exibir a contagem parcial conhecida,
  de forma que não pareça uma contagem completa.
- **FR-009**: A chegada de um novo episódio (detectado numa releitura da
  série) DEVE retirar o estado "Em dia" até esse episódio também ser
  assistido, sem apagar o histórico dos episódios já assistidos.
- **FR-010**: O sistema DEVE mostrar, na grade de Séries, um indicador do
  estado agregado (contagem ou "Em dia") de cada série, sem exigir abrir
  o detalhe.
- **FR-011**: O sistema NUNCA DEVE registrar histórico, progresso ou
  conclusão para canal ao vivo (fora de escopo desta feature).
- **FR-012**: O hub da fonte ("O que você quer assistir?") DEVE mostrar
  uma seção "Continuar assistindo" com os itens (filme/episódio) que têm
  progresso de retomada salvo nessa fonte, ordenados do mais recente.
- **FR-013**: Um item concluído (assistido, sem progresso de retomada)
  NÃO DEVE aparecer na seção "Continuar assistindo".
- **FR-014**: Sem nenhum item com progresso de retomada na fonte, a
  seção "Continuar assistindo" NÃO DEVE aparecer.
- **FR-015**: Confirmar (SELECT) um item da seção "Continuar assistindo"
  DEVE levar ao mesmo comportamento de abrir esse item pela navegação
  normal da categoria, retomando a posição salva.
- **FR-016**: Um item cuja fonte/categoria original não exista mais
  (reconciliação) NUNCA DEVE travar a seção nem aparecer quebrado.

### Key Entities

- **UserStateRecord** (já existente, feature 008): reaproveitado sem
  mudança de schema conhecida até aqui — `completedAt` passa a também
  ser gravado para filme (hoje só para episódio).
- **Agregação de série** (nova, calculada em tempo real, nunca persistida
  como entidade própria — mesma natureza de "Todos", feature 018): a
  partir dos estados de cada episódio conhecido de uma série mais a lista
  de episódios que a fonte declara, deriva contagem e o estado "Em dia".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa que assiste um filme até o fim, sem qualquer
  ação manual, vê esse filme identificado como já assistido ao navegar
  pela grade depois.
- **SC-002**: Uma pessoa consegue corrigir manualmente (marcar ou
  desmarcar) o estado de "assistido" de um filme, sem precisar
  reproduzi-lo.
- **SC-003**: Uma pessoa que assistiu todos os episódios conhecidos de
  uma série, com a série totalmente coberta localmente, vê essa série
  identificada como "Em dia" sem abrir o detalhe.
- **SC-004**: Uma pessoa nunca vê uma série marcada "Em dia" quando ainda
  existem episódios declarados pela fonte não lidos localmente — a
  cobertura parcial nunca é escondida.
- **SC-005**: Uma pessoa que saiu no meio de um filme ou episódio
  consegue retomar a partir do hub da fonte, sem precisar lembrar em qual
  categoria estava.
- **SC-006**: Tentativas de reprodução com falha nunca produzem um
  registro de "assistido" ou progresso falso.

## Assumptions

- O percentual de conclusão automática de filme (90%) segue a sugestão
  do guia de práticas Samsung (`docs/guia-praticas-app-tv/06`, "conclusão
  automática a partir de 90% como ponto inicial de teste") e é distinto
  do limiar que hoje só apaga a retomada (`RESUME_MAX_RATIO`, 95%) — os
  dois convivem, com propósitos diferentes.
- "Continuar assistindo" entra no hub de UMA fonte já aberta ("O que você
  quer assistir?"), não na Home de múltiplas listas — decisão explícita
  do usuário nesta entrevista. O hero completo de "continuar
  assistindo"/rails na Home de múltiplas listas continua sendo o item 16
  do backlog, não redefinido aqui.
- Marcar/desmarcar episódios em lote (uma temporada inteira, por
  exemplo) fica fora de escopo — a ADR-005 já registrava esse desenho
  como pendente, e esta feature não o resolve.
- Canal ao vivo não ganha histórico, "já assistido" ou último acesso
  nesta feature — decisão explícita do usuário.
- "Episódios conhecidos" de uma série usa o mesmo conceito já existente
  da feature 012: os que a fonte declara e o app já obteve/leu ao menos
  uma vez — não uma expectativa de conhecimento externo ao que já foi
  importado.

## Clarifications

### Sessão 2026-09-26

- Q: Onde entra o consumidor de UI desta feature? → A: Uma seção simples
  "Continuar assistindo", sem o design completo de hero+rails (isso fica
  para o item 16 do backlog).
- Q: Qual percentual marca um filme como assistido automaticamente? → A:
  90%, distinto do limiar de 95% que hoje só apaga a retomada.
- Q: Como a pessoa corrige manualmente o "assistido" de um filme? → A:
  Uma ação no detalhe do filme (marcar/desmarcar).
- Q: Onde aparece "já assistido"/último acesso de um canal ao vivo? → A:
  Canal ao vivo não entra nesta feature.
- Q: Onde aparece a agregação "em dia" de uma série? → A: Um selo na
  grade de Séries, sem precisar abrir o detalhe.
- Q: Como calcular "em dia" quando o catálogo de episódios é parcial
  (feature 012 obtém sob demanda)? → A: Só declara "Em dia" com
  cobertura completa; caso contrário, mostra contagem parcial honesta,
  nunca "Em dia".
- Q: Marcação em lote de vários episódios entra nesta feature? → A: Não,
  fica fora de escopo — continua só a marcação individual por episódio.
- Q: "Continuar assistindo" entra na Home de múltiplas listas ou no hub
  de uma fonte específica? → A: No hub da fonte ("O que você quer
  assistir?"), não na Home de múltiplas listas.
