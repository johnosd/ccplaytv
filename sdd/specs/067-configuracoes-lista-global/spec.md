# Feature Specification: Separar configurações da lista das configurações globais do app

**Slug**: `067-configuracoes-lista-global`

**Created**: 2026-10-09

**Status**: Convergência Pendente

**Input**: "separar o que é configuração de lista e configuração global"

## Contexto

Hoje Configurações tem uma coluna única de abas que mistura dois escopos sem
dizer qual é qual:

- **Do aparelho/app** (valem para todas as listas): Integrações (chave TMDB,
  teste de conexão), Player, Acessibilidade & sistema (reduzir movimento,
  idioma), Sobre & créditos e o PIN parental (único por aparelho, feature 066).
- **De uma lista**: Fontes IPTV (editar, ressincronizar, excluir e EPG na
  linha de cada lista), Categorias & controle parental (ocultar/bloquear as
  categorias da lista ativa) e Privacidade (limpar o histórico da lista ativa).

A pessoa não consegue saber se o que muda vale só para a lista em uso ou para
o app inteiro, e as configurações de uma lista que não é a ativa
(categorias, histórico) não têm onde ser feitas.

Esta feature cria uma tela **Configurações da lista**, por lista, e deixa
Configurações só com o que é global. Junto, o PIN parental deixa de ser único
por aparelho e passa a ser **um por lista** (decisão do usuário nesta spec,
emendando a feature 066).

## Escopo

### Incluído

- Tela nova **Configurações da lista**, aberta para qualquer lista cadastrada
  (ativa ou não), em abas laterais no mesmo padrão de Configurações: Conta &
  lista · EPG · Categorias & controle parental · Histórico.
- Entrada pela tela de perfis (ação "Configurar" no fim da linha de ações do
  cartão) e por Configurações › Fontes IPTV (ação "Configurar" na linha da
  lista).
- Configurações globais só com o que é global: Integrações, Fontes IPTV (só a
  relação de listas + "Adicionar lista"), Player, Acessibilidade & sistema,
  Sobre & créditos — com título/subtítulo dizendo que valem para todas as
  listas.
- Saem das globais: a aba Categorias & controle parental e a aba Privacidade
  (o conteúdo delas vai para a tela da lista); da linha da lista em Fontes
  IPTV saem Editar/Ressincronizar/Excluir/EPG (vão para a tela da lista).
- PIN parental **por lista**: cada lista tem o seu PIN ou nenhum; ligar,
  trocar, desligar e "Esqueci o PIN" acontecem na tela da lista.
- Migração do PIN único já gravado para o novo modelo.

### Fora de Escopo

- Tornar por lista qualquer preferência hoje global (player, idioma de
  áudio/legenda, idioma do app, reduzir movimento, chave TMDB) — o objetivo é
  clareza, não mudar escopo dessas preferências.
- Bloquear a lista inteira (pedir PIN para entrar numa lista). O PIN continua
  protegendo categorias e as ações de gestão da lista.
- Limpar o histórico de todas as listas de uma vez nas globais.
- Novos campos de EPG: a aba EPG só mostra o estado e abre a tela de EPG que
  já existe.
- Topbar na tela da lista.
- Mudar o conteúdo das abas Integrações, Player, Acessibilidade ou Sobre.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar uma lista numa tela própria (Priority: P1)

A pessoa foca o cartão de uma lista na tela de perfis (ou a linha dela em
Configurações › Fontes IPTV), escolhe "Configurar" e chega a uma tela com o
nome da lista e o aviso de que aquilo vale só para ela. Lá estão, em abas, os
dados da conta e as ações Editar/Ressincronizar/Excluir, o estado do EPG com
acesso à tela de EPG, as categorias (ocultar/bloquear) e a limpeza do
histórico — tudo aplicado à lista escolhida, ativa ou não, sem trocar a lista
ativa.

**Why this priority**: é o núcleo da separação; sem ela as configurações de
uma lista não ativa não existem e o escopo de cada ajuste continua ambíguo.

**Independent Test**: com duas listas A (ativa) e B, abrir "Configurar" no
cartão de B, ocultar uma categoria de B e limpar o histórico de B; voltar,
entrar em B e conferir a categoria oculta e o histórico vazio; conferir que A
não mudou e que a lista ativa continuou A até a pessoa escolher B.

**Acceptance Scenarios**:

1. **Given** a tela de perfis com o foco no cartão da lista B, **When** a
   pessoa abre a linha de ações, **Then** vê Ressincronizar · Editar ·
   Excluir · Configurar, nessa ordem.
2. **Given** a pessoa escolhe Configurar no cartão de B, **When** a tela abre,
   **Then** o título mostra "Configurações da lista" com o nome de B e o aviso
   de que vale só para esta lista, a aba inicial é Conta & lista e há
   elemento focado.
3. **Given** a tela da lista B aberta a partir de A ativa, **When** a pessoa
   oculta uma categoria de B, **Then** a categoria some das trilhas de B
   quando B for aberta, e nada muda em A.
4. **Given** a aba Histórico da lista B, **When** a pessoa limpa o histórico
   de filmes, **Then** só o histórico de filmes de B é apagado.
5. **Given** a aba EPG da lista B, **When** a tela mostra o estado do EPG e a
   pessoa escolhe o botão, **Then** abre a tela de EPG de B; RETURN volta para
   a aba EPG da tela de B com o foco no botão.
6. **Given** a tela da lista aberta pela tela de perfis (ou por Fontes IPTV),
   **When** a pessoa aperta RETURN na base, **Then** volta à origem com o
   foco no mesmo cartão/linha (por id da lista).
7. **Given** a pessoa exclui a lista de dentro da tela dela, **When** a
   exclusão termina, **Then** volta à origem com o foco na lista vizinha (ou
   em "Adicionar lista" se não sobrou nenhuma); se era a lista ativa, segue o
   fluxo atual de lista removida.

---

### User Story 2 - Configurações globais só com o que é global (Priority: P2)

Em Configurações, a pessoa vê só o que vale para o app todo, com um
título/subtítulo dizendo isso. A aba Fontes IPTV vira a relação das listas
(com "Adicionar lista"), e cada linha tem uma única ação "Configurar", que
abre a tela da lista.

**Why this priority**: completa a separação; depende da US1 para que o
conteúdo removido tenha um novo lugar.

**Independent Test**: abrir Configurações e conferir as abas (Integrações,
Fontes IPTV, Player, Acessibilidade & sistema, Sobre & créditos), o
subtítulo de escopo e que a linha de cada lista tem só "Configurar".

**Acceptance Scenarios**:

1. **Given** Configurações aberta, **When** a pessoa percorre a coluna de
   abas, **Then** não existem mais as abas Categorias & controle parental e
   Privacidade.
2. **Given** a aba Fontes IPTV, **When** a pessoa foca a linha de uma lista,
   **Then** a única ação é "Configurar"; as informações de leitura da linha
   (nome, contagens, estado) continuam visíveis.
3. **Given** a pessoa escolhe Configurar numa linha e depois RETURN na tela
   da lista, **Then** volta a Fontes IPTV com o foco na mesma linha.
4. **Given** Configurações aberta sem lista ativa (atalho "Gerenciar listas"
   da tela de perfis), **When** a pessoa usa Fontes IPTV, **Then** consegue
   abrir a tela de qualquer lista.

---

### User Story 3 - PIN parental por lista (Priority: P3)

Cada lista tem o seu PIN, ou nenhum. Na aba Categorias & controle parental
de uma lista, a pessoa liga, troca ou desliga o PIN daquela lista; ao ligar,
o app sugere bloquear as categorias de nome adulto daquela lista. O PIN de
uma lista não vale para outra.

**Why this priority**: muda a regra de proteção da 066; a US1/US2 entregam
valor mesmo com o PIN único, mas a pessoa pediu PIN por lista.

**Independent Test**: com listas A e B, ligar o PIN em A (1111) e não em B;
conferir que gerir categorias, editar e excluir A pedem 1111, que B não pede
nada, e que 1111 não é aceito quando B tiver o próprio PIN (2222).

**Acceptance Scenarios**:

1. **Given** a lista A sem PIN, **When** a pessoa liga o controle parental na
   tela de A, **Then** vê a sugestão das categorias adultas **de A**,
   confirma, cria o PIN duas vezes, e só A fica protegida.
2. **Given** A com PIN e B sem, **When** a pessoa entra em Categorias &
   controle parental, Editar ou Excluir de B, **Then** nenhum PIN é pedido.
3. **Given** A com PIN 1111 e B com PIN 2222, **When** a pessoa digita 1111
   para uma ação de B, **Then** recebe "PIN incorreto".
4. **Given** A com PIN, **When** a pessoa usa "Esqueci o PIN" de A, **Then**
   a conferência aceita só os dados de A (usuário/senha ou endereço M3U de A).
5. **Given** A com PIN, **When** a pessoa desliga o controle parental de A
   (com o PIN de A), **Then** o PIN de A some e os bloqueios de A saem,
   mantendo as categorias escondidas; B não muda.
6. **Given** listas com PIN, **When** a pessoa escolhe "Adicionar lista",
   **Then** nenhum PIN é pedido.

---

### Edge Cases

- **Lista ativa removida de dentro da tela dela**: o app segue o fluxo atual
  de lista removida (feature 026/037), e a tela da lista não fica aberta
  apontando para uma lista que não existe.
- **Lista sem categorias ainda** (importação incompleta ou falhou): a aba
  Categorias mostra estado vazio com elemento focável e explica o motivo; a
  aba Histórico mostra "sem histórico" quando não há nada.
- **Lista sem EPG configurado**: a aba EPG diz isso e o botão continua levando
  à tela de EPG para configurar.
- **Lista ressincronizando ou com EPG atualizando**: as abas mostram o estado
  em andamento, sem número de progresso inventado.
- **Offline**: a tela abre e mostra o que está no aparelho; Ressincronizar e
  o que precisar de rede degradam como hoje.
- **Desbloqueio da sessão**: o PIN certo de uma lista libera as categorias
  bloqueadas **daquela** lista até o app ir para segundo plano, fechar ou a
  pessoa trocar de lista (mesma regra da 066, agora por lista).
- **PIN único já gravado (066 instalada)**: vira o PIN de cada lista que tem
  ao menos uma categoria bloqueada; listas sem bloqueio ficam sem PIN; nada
  bloqueado fica sem proteção depois da migração.
- **Lista nova trazendo categoria adulta**: com o PIN daquela lista ligado,
  chega bloqueada; sem PIN naquela lista, chega visível e livre (FR-025 da
  066, agora por lista).
- **Excluir uma lista com PIN**: pede o PIN daquela lista; o PIN dela é
  apagado junto com a lista.
- **Foco de volta de Editar/Ressincronizar/EPG**: volta à mesma aba e ação
  da tela da lista. *(emenda de 2026-10-10, decisão do usuário no `sdd-converge`: o progresso da ressincronização fica de fora — o "Voltar" dele leva à tela de perfis, regra da 037 FR-039, igual ao fluxo antigo de Configurações; Editar e EPG voltam à tela da lista como descrito.)*

## Requirements *(mandatory)*

### Functional Requirements

**Tela Configurações da lista**

- **FR-001**: O app DEVE ter uma tela "Configurações da lista" que se aplica a
  uma lista cadastrada específica, ativa ou não, e abri-la NÃO DEVE trocar a
  lista ativa.
- **FR-002**: A tela DEVE mostrar o nome da lista e um aviso de que as
  configurações valem só para ela.
- **FR-003**: A tela DEVE organizar o conteúdo em abas laterais, nesta ordem:
  Conta & lista, EPG, Categorias & controle parental, Histórico; a aba
  inicial é Conta & lista.
- **FR-004**: A aba Conta & lista DEVE mostrar as informações da lista que
  hoje aparecem em Fontes IPTV (estado da conta, contagens, última
  sincronização) e oferecer Editar, Ressincronizar e Excluir, com o mesmo
  comportamento de hoje.
- **FR-005**: A aba EPG DEVE mostrar o estado do EPG da lista e um botão que
  abre a tela de EPG existente para aquela lista; ao voltar, o foco DEVE ficar
  no botão da aba EPG.
- **FR-006**: A aba Categorias & controle parental DEVE oferecer, para a lista
  da tela, tudo o que a aba de mesmo nome das globais oferece hoje (ocultar,
  bloquear, sugestão adulta, ligar/trocar/desligar o PIN).
- **FR-007**: A aba Histórico DEVE oferecer a limpeza de histórico que a aba
  Privacidade oferece hoje (filmes, séries, ambos), aplicada à lista da tela.
- **FR-008**: A tela NÃO DEVE ter topbar; RETURN na base DEVE voltar à tela de
  origem (perfis ou Configurações › Fontes IPTV) com o foco restaurado pelo id
  da lista.
- **FR-009**: Ao voltar de Editar, Ressincronizar (progresso) ou da tela de
  EPG, a tela da lista DEVE reabrir na mesma aba, com o foco na mesma ação.
  *(emenda de 2026-10-10, decisão do usuário no `sdd-converge`: o progresso da ressincronização fica de fora — o "Voltar" dele leva à tela de perfis, regra da 037 FR-039, igual ao fluxo antigo de Configurações; Editar e EPG voltam à tela da lista como descrito.)*
- **FR-010**: Excluir a lista pela tela DEVE, ao terminar, voltar à origem com
  o foco na lista vizinha ou em "Adicionar lista" se não sobrou nenhuma; se
  era a lista ativa, DEVE seguir o fluxo atual de lista removida.
- **FR-011**: Todo estado da tela (carregando, vazio, erro, offline) DEVE ter
  ao menos um elemento focável.

**Entradas**

- **FR-012**: A linha de ações do cartão de lista na tela de perfis DEVE ser
  Ressincronizar · Editar · Excluir · Configurar, com Configurar abrindo a
  tela da lista.
- **FR-013**: Em Configurações › Fontes IPTV, cada linha de lista DEVE ter uma
  única ação, Configurar, que abre a tela da lista; Editar, Ressincronizar,
  Excluir e EPG DEVEM sair da linha. "Adicionar lista" continua na aba.

**Configurações globais**

- **FR-014**: Configurações DEVE mostrar um título/subtítulo dizendo que as
  configurações valem para todas as listas.
- **FR-015**: As abas de Configurações DEVEM ser, nesta ordem: Integrações,
  Fontes IPTV, Player, Acessibilidade & sistema, Sobre & créditos. As abas
  Categorias & controle parental e Privacidade DEVEM sair.
- **FR-016**: O conteúdo das abas Integrações, Player, Acessibilidade &
  sistema e Sobre & créditos NÃO DEVE mudar.

**PIN por lista** (emenda FR-011, FR-015, FR-017, FR-019, FR-022, FR-027 da
feature 066)

- **FR-017**: Cada lista DEVE ter no máximo um PIN próprio, ou nenhum; o PIN de
  uma lista NÃO DEVE ser aceito por outra.
- **FR-018**: Ligar, trocar e desligar o PIN DEVEM acontecer na aba Categorias
  & controle parental da lista e afetar só aquela lista; desligar DEVE apagar
  o PIN e os bloqueios daquela lista, mantendo as categorias escondidas.
- **FR-019**: Ao ligar o PIN de uma lista, a sugestão de categorias de nome
  adulto DEVE olhar só as categorias daquela lista.
- **FR-020**: Com o PIN de uma lista ativo, DEVEM pedir o PIN dela antes:
  entrar em Categorias & controle parental daquela lista, trocar ou desligar o
  PIN, Editar e Excluir aquela lista — em qualquer ponto de entrada (tela da
  lista ou cartão de perfis). Abrir a tela, ver o EPG, Ressincronizar e limpar
  o histórico NÃO DEVEM pedir PIN.
- **FR-021**: "Adicionar lista" NÃO DEVE pedir PIN.
- **FR-022**: O PIN certo DEVE liberar as categorias bloqueadas só da lista a
  que pertence, até o app ir para segundo plano, fechar ou a pessoa trocar de
  lista.
- **FR-023**: "Esqueci o PIN" DEVE conferir só os dados da própria lista
  (usuário e senha Xtream, ou endereço completo M3U), no aparelho, sem
  requisição de rede, com mensagem genérica quando não bate.
- **FR-024**: Ao atualizar o app, um PIN único já gravado DEVE passar a ser o
  PIN de cada lista que tem ao menos uma categoria bloqueada; listas sem
  bloqueio DEVEM ficar sem PIN. Nenhuma categoria bloqueada pode ficar sem
  PIN depois da migração.
- **FR-025**: Excluir uma lista DEVE apagar o PIN dela.
- **FR-026**: Valem para o PIN por lista todas as demais regras do PIN da 066
  (4 dígitos, digitado duas vezes ao criar, teclas numéricas e teclado na
  tela, nunca exibido/logado/enviado, guardado de forma não legível, PIN
  incorreto sem limite de tentativas).

**Textos**

- **FR-027**: Todo texto novo DEVE existir em pt, en e es; nomes vindos da
  lista não são traduzidos.

### Key Entities

- **Lista (fonte IPTV)**: já existe; ganha, de forma opcional, um **PIN
  parental próprio**.
- **PIN parental da lista**: pertence a exatamente uma lista; guardado só de
  forma não legível; existe ou não existe por lista. Substitui o PIN único do
  aparelho da 066.
- **Preferência de categoria** (oculta/bloqueada/sugestão recusada): já é por
  lista na 066; não muda.
- **Preferências globais** (player, idioma, reduzir movimento, chave TMDB,
  último teste de conexão): não mudam de escopo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** *(emendado em 2026-10-10, decisão do usuário)*: A partir de qualquer
  cartão da tela de perfis, a pessoa chega à tela daquela lista em no máximo
  5 teclas (↓ para as ações, → → → até "Configurar", a 4ª ação, e OK) quando o
  foco já está no cartão. Medido pelo E2E `configuracoes-lista-global.mjs`.
  *(Redação original: "no máximo 3 teclas" — não cabia com "Configurar" como
  4ª ação, ordem escolhida na entrevista.)*
- **SC-002**: 100% dos ajustes de lista (conta, EPG, categorias/PIN,
  histórico) podem ser feitos para uma lista não ativa sem trocar a lista
  ativa.
- **SC-003**: Nenhuma aba das Configurações globais contém um ajuste que vale
  só para uma lista, e nenhuma aba da tela da lista contém um ajuste que vale
  para o app todo.
- **SC-004**: Em um teste com duas listas com PINs diferentes, 0 ações
  protegidas de uma lista aceitam o PIN da outra.
- **SC-005**: Depois da migração, 100% das categorias que estavam bloqueadas
  continuam bloqueadas e exigem PIN.
- **SC-006**: Voltar de qualquer subtela (Editar, progresso, EPG) devolve o
  foco à mesma aba e ação em 100% dos casos testados; voltar da tela da lista
  devolve o foco ao mesmo cartão/linha. *(emenda de 2026-10-10, decisão do usuário no `sdd-converge`: o progresso da ressincronização fica de fora — o "Voltar" dele leva à tela de perfis, regra da 037 FR-039, igual ao fluxo antigo de Configurações; Editar e EPG voltam à tela da lista como descrito.)*

## Assumptions

- A feature 066 termina primeiro como especificada (PIN único); esta feature
  vem depois e emenda a 066 por nota no `spec.md`/`plan.md` dela.
- As abas da tela da lista reaproveitam o comportamento das abas que saem das
  globais; nada novo é inventado nelas além de aplicar à lista escolhida.
- A tela da lista segue o Design System V14 (mesmo padrão de abas laterais de
  Configurações) e a moldura sem topbar já usada por Configurações aberta sem
  lista ativa.
- Sem topbar, a navegação de volta é só RETURN.
- O "Gerenciar listas" da tela de perfis continua abrindo Configurações ›
  Fontes IPTV.

## Clarifications

### Sessão 2026-10-09

- Q: Qual o problema principal? → A: Clareza na UI — separar visualmente/organizar; preferências globais não viram por lista.
- Q: Onde mora a configuração da lista? → A: Tela própria da lista; Configurações fica só com o global.
- Q: Quais ajustes são da lista? → A: Categorias e bloqueio, histórico/privacidade, EPG, dados da conta/lista (editar, ressincronizar, excluir, estado).
- Q: Por onde se abre a tela da lista? → A: Cartão da tela de perfis + linha em Configurações › Fontes IPTV.
- Q: O que acontece com a aba Fontes IPTV das globais? → A: Vira só a relação de listas + "Adicionar lista"; cada linha tem só "Configurar".
- Q: A tela pode ser aberta para uma lista não ativa? → A: Sim, qualquer lista; abrir não troca a lista ativa.
- Q: Linha de ações do cartão na tela de perfis? → A: Mantém Ressincronizar/Editar/Excluir e ganha Configurar, por último.
- Q: Layout da tela da lista? → A: Abas laterais como Configurações: Conta & lista · EPG · Categorias & controle parental · Histórico; inicial Conta & lista.
- Q: Como dividir o controle parental? → A: Primeiro "PIN no global, categorias na lista"; depois o usuário mudou para **PIN por lista** — PIN, sugestão, categorias e "Esqueci o PIN" ficam na tela da lista; a aba some das globais.
- Q: Privacidade nas globais? → A: A aba sai; limpar histórico só na tela da lista.
- Q: Topbar na tela da lista? → A: Não; RETURN volta à origem com o foco restaurado.
- Q: Rótulo de escopo? → A: Sim — título/subtítulo nas globais ("valem para todas as listas") e na tela da lista ("só para esta lista").
- Q: O que pede PIN na tela da lista? → A: Mesmas regras da 066 — categorias, editar, excluir (e trocar/desligar PIN); abrir a tela, EPG, ressincronizar e histórico não.
- Q: Aba EPG? → A: Estado do EPG + botão que abre a tela de EPG existente.
- Q: Adicionar lista pede PIN? → A: Não.
- Q: PIN único já gravado? → A: Vira o PIN de cada lista com categoria bloqueada; as demais ficam sem PIN.
- Q: Encaixe com a 066 em execução? → A: Feature nova depois da 066, emendando-a por nota.
- Q: SC-001 (≤ 3 teclas) contra "Configurar" como 4ª ação (5 teclas)? → A (execução, 2026-10-10): emendar o SC-001 para 5 teclas, mantendo a ordem das ações.
- Q: Voltar do progresso da ressincronização reabre a tela da lista (FR-009/SC-006)? → A (convergência, 2026-10-10): não — o progresso fica de fora e seu "Voltar" leva aos perfis (037 FR-039); texto emendado por nota, código inalterado.
- Q: Excluir pela tela da lista? → A: Volta à origem, foco na vizinha (ou "Adicionar lista"); lista ativa segue o fluxo de lista removida.
