# Feature Specification: Splash, ícone do app e Home de perfis/listas

**Slug**: `002-splash-home-perfis`

**Created**: 2026-09-15

**Status**: Em Execução

**Input**: "gostaria de ajustar o icone inicial do app conforme no arquivo
docs\design\CCPlayTv Prototype - Standalone.html esse icone deve aparecer
quando o usuario ver o app na tv. quero que crie uma tela splash conforme
aba '1 splash' essa tela deve aparecer quando o usuario abre o app. quero
que remodere a tela inicial que contem os perfis (listas que o usuario
cadastrou) caso não tenha lista aparece conforme aba '3 add lista'. o fluxo
deve ser: splash > lista de perfis > adicionar listas | entrar em
lista/perfil"

## Escopo

### Incluído

- Ícone do aplicativo Tizen (exibido na tela de Apps da TV) redesenhado com
  o mesmo tratamento visual do ícone da tela de Splash do protótipo
  (gradiente de marca + triângulo de play).
- Tela de Splash animada com o logotipo CCPlayTv, exibida sempre que o app
  é aberto, antes de qualquer outra tela.
- Remodelagem da Home ("Minhas Listas"/perfis): quando existe 1+ lista
  cadastrada, mostra os cards das listas; quando não existe nenhuma, a
  própria Home passa a exibir diretamente o formulário de "Adicionar
  lista" (sem uma tela intermediária de estado vazio).
- Estado de carregamento da Home enquanto o app ainda não sabe se existem
  listas cadastradas.
- Comportamento do botão Voltar do controle remoto quando a Home está no
  estado vazio (formulário): pede confirmação de saída antes de fechar o
  app.
- Fluxo de entrada: Splash → Home (perfis) → [Adicionar lista] | [Entrar
  numa lista existente].

### Fora de Escopo

- Tudo que acontece depois de entrar numa lista (tela de Live TV/Filmes/
  Séries e telas internas) — já implementado em sessão anterior, não é
  tocado por esta spec.
- Metadados reais de filme/série via TMDB — item futuro do backlog.
- Qualquer endpoint novo de backend — `GET/POST/DELETE /sources` e
  `POST /sources/{id}/resync` já existem e são reaproveitados como estão.
- O conteúdo/layout do formulário "Adicionar lista" em si (campos, modos
  URL/provedor) — já implementado; esta spec só muda **quando** ele
  aparece automaticamente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Primeira abertura, sem listas (Priority: P1)

Como usuário que acabou de instalar o app e nunca cadastrou uma lista, ao
abrir o app vejo a animação de Splash e caio direto no formulário de
adicionar lista — sem precisar navegar até um botão "Adicionar" numa tela
vazia primeiro.

**Why this priority**: é o primeiro contato de qualquer usuário novo com o
app; sem uma lista cadastrada, nada mais no app funciona.

**Independent Test**: instalar o app sem nenhuma fonte cadastrada no
backend, abrir o app, e confirmar que a tela após a Splash já é o
formulário de adicionar lista, navegável só por controle remoto.

**Acceptance Scenarios**:

1. **Given** nenhuma lista cadastrada no backend, **When** o app termina a
   animação de Splash, **Then** a tela exibida é o formulário "Adicionar
   lista" (não uma tela de estado vazio separada).
2. **Given** o formulário de adicionar lista sendo exibido como Home
   (nenhuma lista ainda), **When** o usuário pressiona Voltar no controle,
   **Then** o app pergunta se ele quer sair, e só fecha mediante
   confirmação.
3. **Given** o usuário cadastra sua primeira lista com sucesso, **When** a
   importação termina e ele volta pra Home, **Then** a Home passa a
   mostrar o card da lista recém-criada (nunca mais o formulário
   automaticamente, enquanto existir ao menos uma lista).

---

### User Story 2 - Abertura com listas já cadastradas (Priority: P1)

Como usuário que já tem uma ou mais listas cadastradas, ao abrir o app vejo
a Splash e depois a Home com os cards das minhas listas, podendo escolher
uma pra entrar ou adicionar outra.

**Why this priority**: é o fluxo do dia a dia, depois do primeiro
cadastro — precisa funcionar tão bem quanto o de primeira abertura.

**Independent Test**: com pelo menos uma fonte já cadastrada no backend,
abrir o app e confirmar que a Home mostra o card dela, navegável só por
controle remoto, com a opção de entrar na lista ou adicionar outra.

**Acceptance Scenarios**:

1. **Given** 1+ listas cadastradas, **When** a Splash termina, **Then** a
   Home mostra um card por lista mais um card fixo "Adicionar lista".
2. **Given** a Home mostrando cards, **When** o usuário seleciona o card
   de uma lista, **Then** ele entra na tela já existente daquela lista
   (Live TV/Filmes/Séries).

---

### User Story 3 - Ícone do app na TV (Priority: P2)

Como usuário navegando na tela de Apps da própria TV (antes mesmo de abrir
o CCPlayTv), vejo um ícone com a mesma identidade visual do app (gradiente
de marca + ícone de play), em vez do ícone genérico atual.

**Why this priority**: é a primeira impressão visual do app antes mesmo de
abri-lo, mas não bloqueia nenhum fluxo funcional interno — por isso P2, não
P1.

**Independent Test**: reinstalar o `.wgt` na TV física e conferir
visualmente o ícone na tela de Apps.

**Acceptance Scenarios**:

1. **Given** o app reinstalado na TV física, **When** o usuário olha a
   tela de Apps, **Then** o ícone do CCPlayTv usa o gradiente de marca e o
   triângulo de play, consistente com a tela de Splash.

---

### Edge Cases

- Entre o fim da animação de Splash e a resposta do backend sobre quais
  listas existem, a Home mostra um indicador de carregamento — nunca o
  formulário nem os cards antes da resposta chegar (evita "piscar" de uma
  tela pra outra).
- Se a chamada que busca as listas falhar (erro de rede), a Home não pode
  ficar presa num carregamento infinito nem assumir silenciosamente que
  não há listas — precisa de algum indicativo de erro.
- Usuário exclui a última lista restante (fluxo já existente de excluir):
  a Home deve voltar a mostrar o formulário automaticamente, mesma regra
  do estado "nenhuma lista".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app DEVE exibir uma tela de Splash com o logotipo CCPlayTv
  animado ao ser aberto, antes de qualquer outra tela.
- **FR-002**: A tela de Splash DEVE avançar automaticamente pra Home após
  um tempo fixo, sem exigir interação do usuário.
- **FR-003**: O ícone do aplicativo exibido na tela de Apps da TV DEVE usar
  o mesmo tratamento visual (gradiente de marca + ícone de play) do ícone
  da tela de Splash.
- **FR-004**: Quando existir 1 ou mais listas cadastradas, a Home DEVE
  exibir um card por lista, mais um card fixo de "Adicionar lista".
- **FR-005**: Quando não existir nenhuma lista cadastrada, a Home DEVE
  exibir diretamente o formulário de "Adicionar lista", sem uma tela
  intermediária de estado vazio.
- **FR-006**: Enquanto o app ainda não sabe se existem listas cadastradas
  (aguardando resposta do backend), a Home DEVE mostrar um indicador de
  carregamento, nunca o formulário nem os cards antes da resposta chegar.
- **FR-007**: Selecionar o card de uma lista cadastrada DEVE levar o
  usuário pra dentro daquela lista (tela já existente de Live TV/Filmes/
  Séries).
- **FR-008**: Ao pressionar Voltar do controle remoto estando na Home no
  estado vazio (formulário), o app DEVE perguntar ao usuário se ele quer
  sair, e só fechar o aplicativo mediante confirmação.
- **FR-009**: Assim que a primeira lista for cadastrada com sucesso (ou
  enquanto existir ao menos uma), a Home DEVE exibir a visão de cards, não
  mais o formulário automaticamente.
- **FR-010**: Se a busca pelas listas cadastradas falhar, a Home DEVE
  mostrar um indicativo de erro (não travar em carregamento indefinido nem
  tratar a falha como "nenhuma lista").

### Key Entities

Nenhuma entidade nova — reaproveita `Source` (fonte/lista cadastrada), já
existente desde a feature 001.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com nenhuma lista cadastrada, abrir o app e chegar ao
  formulário de adicionar lista não exige nenhuma interação além de
  aguardar a Splash terminar.
- **SC-002**: 100% das transições entre "nenhuma lista" e "1+ listas" não
  passam por uma tela de estado vazio intermediária.
- **SC-003**: O ícone do app aparece com a identidade visual correta na
  tela de Apps da TV física, verificado por reinstalação manual.
- **SC-004**: Pressionar Voltar na Home vazia nunca fecha o app sem uma
  confirmação explícita do usuário.

## Assumptions

- "Perfil" e "lista" se referem ao mesmo conceito nesta spec — a entidade
  `Source` já existente. A UI continua usando a palavra "lista", já
  presente nas telas atuais.
- O ícone será gerado programaticamente (gradiente + triângulo de play),
  no tamanho já usado pelo projeto Tizen atual — o `sdd-plan` pode ajustar
  esse tamanho se houver um padrão diferente recomendado pela Samsung.
- Fechar o app usa a API padrão do Tizen
  (`tizen.application.getCurrentApplication().exit()`); em ambiente de
  navegador/dev fora da TV, a ação de "sair" não tem efeito real além de
  fechar o diálogo de confirmação.
- O indicador de carregamento da Home é uma peça permanente da UI (não um
  recurso de debug temporário a ser removido depois) — combinado
  explicitamente com o usuário durante a clarificação desta spec.

## Clarifications

### Sessão 2026-09-15

- Q: Quando não há nenhuma lista cadastrada, a Home deve pular direto pro
  formulário "Adicionar lista", ou mostrar uma tela de estado vazio que
  leva pro formulário? → A: Pula direto pro formulário — a Home em si É o
  formulário quando vazia, sem tela intermediária.
- Q: O ícone do app — como deve ser produzido? → A: Gerado
  programaticamente, recriando o ícone gradiente + triângulo de play do
  protótipo.
- Q: Até onde vai o escopo desta spec? → A: Só até a entrada na lista —
  Live TV/Filmes/Séries (já implementados) ficam de fora.
- Q: O que o botão Voltar deve fazer na Home vazia (formulário), já que
  não há outra tela de início pra voltar? → A: Pergunta se o usuário quer
  sair; se confirmado, fecha o app.
- Q: O que mostrar enquanto a lista de perfis ainda está carregando, pra
  não "piscar" entre formulário e cards? → A: Spinner de carregamento —
  mantido como parte permanente da UI, não um recurso de debug temporário.
