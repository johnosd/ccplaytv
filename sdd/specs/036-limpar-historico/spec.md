# Feature Specification: Limpar histórico e remover item do Histórico

**Slug**: `036-limpar-historico`

**Created**: 2026-09-30

**Status**: Planejada

**Input**: Item 57 do backlog — "Limpar histórico e remover item do
`↺ Histórico`" (DS V14 §13.3 e §48.4): remover um item; limpar Filmes, Séries
ou ambos, sempre com confirmação; não tocar em favoritos nem em "assistido".
A feature 025 deixou isso explicitamente fora de escopo ao entregar o
`↺ Histórico`.

## Escopo

### Incluído

- **Remover um item do `↺ Histórico`** em Filmes e em Séries, por dois
  caminhos: a **tecla vermelha** do controle com o item focado na grade do
  `↺ Histórico`, e uma ação **"Remover do histórico"** no detalhe do filme ou
  da série (o caminho garantido em qualquer controle).
- **Confirmação com escolha sobre o progresso** (DS V14 §13.3): a pessoa
  escolhe entre só tirar do Histórico (a posição de retomada fica, o item
  continua em "Continuar assistindo") ou tirar do Histórico **e apagar o
  progresso**.
- **Nova aba "Privacidade" em Configurações**, com três ações de limpeza em
  lote — limpar Histórico de Filmes, de Séries, ou de ambos — cada uma com
  a mesma confirmação e a mesma escolha sobre o progresso.
- Em Séries, remover uma série age sobre **todos os episódios** dela.
- Feedback: toast curto após remover/limpar; foco vai para o vizinho na grade
  (mesmo padrão de desfavoritar em `★ Favoritos`); lista vazia cai no estado
  vazio do Histórico, com ação focável.
- Tudo o que lê histórico ou progresso (contagem do `↺ Histórico` na trilha,
  "Continuar assistindo" da Home, "Continuar de mm:ss" do detalhe, herói da
  Home) reflete a remoção sem precisar sair e voltar.

### Fora de Escopo

- Remoção direta na rail "Continuar assistindo" da Home — a Home só reflete o
  que foi removido por outro caminho.
- Apagar favoritos ou marcas "assistido" (filme ou episódio) — nunca, por
  nenhum caminho desta feature.
- Limpar histórico de outra lista que não a ativa, ou de todas as listas de
  uma vez.
- Histórico de canais ao vivo (o DS só prevê Histórico em Filmes e Séries).
- Remover um episódio isolado do histórico (o card do Histórico é por série).
- O registro de abas de Configurações (item 63) — é dependência branda; esta
  feature acrescenta a aba no formato que existir quando for executada.
- Perfis de pessoa e controle parental (item 52) — a aba "Perfis & parental"
  continua mock.
- Desfazer ("undo") depois da confirmação.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remover um título do Histórico (Priority: P1)

A pessoa abre `↺ Histórico` em Filmes (ou Séries), foca um título que não quer
mais ver ali e aperta a tecla vermelha — ou abre o detalhe e escolhe "Remover
do histórico". Uma confirmação pergunta se é só para tirar do Histórico ou
também apagar o progresso. Confirmado, o título some da grade e o foco vai
para o vizinho.

**Why this priority**: É o gesto mais frequente e o menor valor entregável:
alguém que assistiu algo por engano ou não quer que apareça ali resolve sem
apagar o resto.

**Independent Test**: Com dois filmes reproduzidos (um com progresso), remover
um pela tecla vermelha e o outro pelo detalhe; verificar que cada um sai do
`↺ Histórico`, que favoritos e "assistido" continuam, e que "Continuar
assistindo" só perde o item quando "apagar progresso" foi escolhido.

**Acceptance Scenarios**:

1. **Given** um filme no `↺ Histórico` com posição de retomada, **When** a
   pessoa aperta a tecla vermelha nele e escolhe "Remover do histórico",
   **Then** o filme some do `↺ Histórico`, a contagem da trilha diminui, e ele
   continua em "Continuar assistindo" e com "Continuar de mm:ss" no detalhe.
2. **Given** o mesmo cenário, **When** a pessoa escolhe "Remover e apagar
   progresso", **Then** o filme some do `↺ Histórico` **e** de "Continuar
   assistindo", e o detalhe volta a oferecer "Assistir" do início.
3. **Given** um filme no `↺ Histórico` sem posição de retomada (assistido até o
   fim), **When** a pessoa pede para removê-lo, **Then** a confirmação oferece
   só "Remover do histórico" e "Cancelar" — nunca uma opção de apagar um
   progresso que não existe.
4. **Given** a confirmação aberta, **When** a pessoa escolhe "Cancelar" ou
   aperta RETURN, **Then** nada muda e o foco volta ao item que estava focado.
5. **Given** um filme favorito e marcado "assistido" no `↺ Histórico`, **When**
   ele é removido (com ou sem apagar progresso), **Then** ele continua em
   `★ Favoritos` e continua marcado "assistido".
6. **Given** uma série no `↺ Histórico` com vários episódios reproduzidos,
   **When** a pessoa a remove, **Then** nenhum episódio dela mantém a série no
   `↺ Histórico`; com "apagar progresso", nenhum episódio dela aparece em
   "Continuar assistindo"; as marcas "assistido" dos episódios ficam intactas.
7. **Given** um item removido na grade, **When** a remoção termina, **Then**
   aparece um toast curto e o foco vai para o próximo item (ou o anterior, se
   era o último); se era o único, o `↺ Histórico` mostra o estado vazio com uma
   ação focável.
8. **Given** o detalhe de um título que **não** está no `↺ Histórico`, **When**
   a pessoa percorre as ações, **Then** "Remover do histórico" não aparece.
9. **Given** o detalhe aberto a partir do `↺ Histórico`, **When** a pessoa
   remove o título e volta com RETURN, **Then** o `↺ Histórico` já não mostra o
   título e o foco cai num vizinho, nunca num item inexistente.

---

### User Story 2 - Limpar o Histórico em lote na aba Privacidade (Priority: P2)

Em Configurações, uma nova aba "Privacidade" mostra, para a lista ativa, quantos
títulos há no Histórico de Filmes e de Séries, e três ações: limpar Filmes,
limpar Séries, limpar ambos. Cada uma pede confirmação com a mesma escolha
sobre o progresso.

**Why this priority**: Cobre o §48.4 inteiro e o caso "quero começar do zero",
mas depende menos do dia a dia que a remoção individual.

**Independent Test**: Com filmes e séries reproduzidos, abrir Configurações ›
Privacidade, limpar só Filmes com "apagar progresso", conferir que Séries
continua intacta, e depois limpar ambos mantendo a retomada.

**Acceptance Scenarios**:

1. **Given** uma lista ativa com histórico em Filmes e Séries, **When** a
   pessoa abre Configurações › Privacidade, **Then** vê o nome da lista ativa,
   a quantidade de títulos em cada Histórico e as três ações de limpeza.
2. **Given** a aba aberta, **When** a pessoa limpa o Histórico de Filmes e
   confirma só o histórico, **Then** `↺ Histórico` de Filmes fica vazio, a
   retomada dos filmes continua valendo, e o Histórico de Séries não muda.
3. **Given** a aba aberta, **When** a pessoa limpa ambos com "apagar
   progresso", **Then** os dois `↺ Histórico` ficam vazios, "Continuar
   assistindo" da Home fica vazio para filmes e episódios dessa lista, e
   favoritos e marcas "assistido" continuam.
4. **Given** um Histórico que já está vazio, **When** a pessoa foca a ação de
   limpá-lo, **Then** a ação aparece desabilitada (soft disabled, com o motivo
   no nome acessível) e não abre confirmação.
5. **Given** registros de histórico que não resolvem mais no catálogo atual
   (os "não disponíveis"), **When** a pessoa limpa aquele Histórico, **Then**
   eles também são apagados, e a contagem mostrada antes já os incluía.
6. **Given** Configurações aberta por "Gerenciar listas" (sem lista ativa),
   **When** a pessoa entra em Privacidade, **Then** a aba explica que é
   preciso entrar numa lista para limpar o histórico dela, sem nenhuma ação de
   limpeza, e mantém um elemento focável (nunca foco preso).
7. **Given** duas listas com histórico, **When** a pessoa limpa o histórico da
   lista ativa, **Then** o histórico da outra lista não muda.

---

### Edge Cases

- **Tecla vermelha fora do `↺ Histórico`**: em `★ Favoritos`, "Todos" e
  categorias da fonte, a tecla vermelha não faz nada (nunca remove de outro
  lugar).
- **Tecla vermelha não suportada pelo controle**: a remoção continua possível
  pelo detalhe; a dica da tecla vermelha só aparece quando a tecla foi
  registrada com sucesso.
- **Tecla vermelha segurada / repetida**: abre uma confirmação só; repetições
  enquanto ela está aberta não empilham outra.
- **Item que também é episódio em curso de outra temporada**: remover a série
  age sobre todos os episódios dela, de qualquer temporada.
- **Remoção durante carregamento do `↺ Histórico`**: sem item focado, a tecla
  vermelha não faz nada.
- **Falha ao gravar a remoção**: nada é dado como removido; o item continua na
  grade, e a pessoa recebe uma mensagem de erro com a ação de tentar de novo —
  nunca um toast de sucesso falso.
- **Série sem nenhum episódio resolvível no catálogo**: não aparece na grade
  (regra da 025), mas a limpeza em lote também apaga seus registros.
- **Reproduzir de novo depois de remover**: o título volta ao `↺ Histórico`
  normalmente na próxima reprodução.
- **Modal aberto e RETURN**: fecha a confirmação sem efeito; o foco volta a
  quem abriu.

## Requirements *(mandatory)*

### Functional Requirements

**Remoção individual**

- **FR-001**: A grade do `↺ Histórico` (Filmes e Séries) DEVE abrir a
  confirmação de remoção do item focado quando a pessoa aperta a tecla
  vermelha do controle.
- **FR-002**: A tecla vermelha DEVE ser registrada pelo mesmo mecanismo das
  teclas de cor já existentes, e só DEVE agir dentro do `↺ Histórico` com um
  item focado; em qualquer outro lugar ela não tem efeito nesta feature.
- **FR-003**: Quando a tecla vermelha estiver registrada, o `↺ Histórico` DEVE
  exibir uma dica visível da ação ("● Remover do histórico"); quando não
  estiver, a dica NÃO DEVE aparecer.
- **FR-004**: O detalhe de filme e o de série DEVEM oferecer a ação "Remover do
  histórico" sempre que o título estiver no `↺ Histórico` da lista ativa, e NÃO
  DEVEM oferecê-la quando não estiver.
- **FR-005**: Incluir "Remover do histórico" no detalhe NÃO DEVE deslocar o
  índice da ação primária (Assistir/Continuar continua a primeira).

**Confirmação e escolha sobre o progresso**

- **FR-006**: Toda remoção ou limpeza DEVE pedir confirmação num modal antes de
  apagar qualquer coisa.
- **FR-007**: Quando houver posição de retomada no que será removido, a
  confirmação DEVE oferecer três ações: "Remover do histórico", "Remover e
  apagar progresso" e "Cancelar". Quando não houver, DEVE oferecer só
  "Remover do histórico" e "Cancelar".
- **FR-008**: "Remover do histórico" DEVE tirar o item do `↺ Histórico` e
  preservar a posição de retomada — o item continua em "Continuar assistindo"
  e com "Continuar de mm:ss" no detalhe.
- **FR-009**: "Remover e apagar progresso" DEVE tirar o item do `↺ Histórico`
  **e** apagar a posição de retomada — o item sai de "Continuar assistindo".
- **FR-010**: Cancelar (pela ação ou por RETURN) NÃO DEVE mudar nenhum dado e
  DEVE devolver o foco ao controle que abriu a confirmação.
- **FR-011**: O foco inicial da confirmação DEVE estar numa ação não
  destrutiva ("Cancelar").

**O que nunca é tocado**

- **FR-012**: Nenhuma remoção ou limpeza DEVE alterar favoritos (canal, filme
  ou série).
- **FR-013**: Nenhuma remoção ou limpeza DEVE alterar marcas "assistido" de
  filme ou de episódio.
- **FR-014**: Nenhuma remoção ou limpeza DEVE afetar o histórico, a retomada
  ou os favoritos de outra lista que não a ativa.

**Séries**

- **FR-015**: Remover uma série do `↺ Histórico` DEVE agir sobre todos os
  episódios reproduzidos dela na lista ativa, de todas as temporadas; com
  "apagar progresso", DEVE apagar a retomada de todos esses episódios.
- **FR-016**: Depois de remover uma série, nenhum episódio dela DEVE fazê-la
  reaparecer no `↺ Histórico` até uma nova reprodução.

**Feedback e foco**

- **FR-017**: Após uma remoção bem-sucedida na grade, o sistema DEVE mostrar um
  toast curto (anunciado na região `aria-live`) e mover o foco para o item
  seguinte, ou para o anterior se o removido era o último.
- **FR-018**: Se o `↺ Histórico` ficar vazio, DEVE mostrar o estado vazio
  existente com pelo menos um elemento focável.
- **FR-019**: A contagem do `↺ Histórico` na trilha lateral, a rail "Continuar
  assistindo" e o herói da Home, e o botão Assistir/Continuar do detalhe DEVEM
  refletir a remoção sem exigir sair e voltar à tela.
- **FR-020**: Se a gravação falhar, o sistema NÃO DEVE mostrar sucesso nem
  tirar o item da tela; DEVE informar a falha com uma ação focável de tentar de
  novo, sem expor detalhe técnico bruto.
- **FR-021**: A tecla vermelha repetida ou segurada DEVE abrir no máximo uma
  confirmação.

**Aba Privacidade (limpeza em lote)**

- **FR-022**: Configurações DEVE ganhar uma aba real "Privacidade".
- **FR-023**: Com lista ativa, a aba DEVE mostrar o nome da lista e a
  quantidade de títulos no Histórico de Filmes e no de Séries (contando também
  os registros não disponíveis no catálogo atual), com três ações: "Limpar
  histórico de Filmes", "Limpar histórico de Séries", "Limpar ambos".
- **FR-024**: Cada ação de limpeza DEVE seguir FR-006 a FR-011, com a opção de
  apagar progresso presente só quando algum item daquele escopo tiver retomada.
- **FR-025**: Limpar um Histórico DEVE apagar todos os registros de histórico
  daquele tipo na lista ativa, inclusive os que não resolvem mais no catálogo
  atual.
- **FR-026**: Uma ação de limpeza cujo Histórico está vazio DEVE aparecer
  soft disabled, com o motivo no nome acessível, e NÃO DEVE abrir confirmação.
- **FR-027**: Sem lista ativa, a aba DEVE explicar que o histórico é por lista
  e que é preciso entrar numa lista para limpá-lo, sem ações de limpeza, e
  DEVE manter um elemento focável.
- **FR-028**: Após limpar, a aba DEVE atualizar as contagens e mostrar um toast
  curto; o foco DEVE permanecer na ação usada (agora soft disabled).

### Key Entities

- **Registro de histórico**: o fato de um filme ou episódio ter sido
  reproduzido na lista ativa, com o instante da última reprodução. É o que
  põe um título no `↺ Histórico`. Chaveado pela identidade estável do item
  (constitution), nunca pela URL.
- **Posição de retomada**: onde a reprodução parou. Coexiste com o registro de
  histórico; é o que põe um título em "Continuar assistindo".
- **Marca "assistido"** e **favorito**: estado da pessoa sobre o mesmo item,
  que esta feature lê para decidir o que exibir, mas nunca altera.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos casos de teste, remover ou limpar não altera nenhum
  favorito nem nenhuma marca "assistido" (comparação antes/depois do estado da
  pessoa).
- **SC-002**: Em 100% dos casos de teste, "Remover do histórico" preserva a
  retomada e "Remover e apagar progresso" a apaga — nunca o inverso.
- **SC-003**: Remover um item a partir da grade leva no máximo 3 teclas
  (vermelha → foco na ação → OK), e a grade reflete a remoção em até 1 s.
- **SC-004**: Em todo estado da aba Privacidade e da confirmação (com lista,
  sem lista, histórico vazio, erro), existe exatamente um foco visível e ao
  menos um elemento focável.
- **SC-005**: Limpar o histórico de uma lista não muda nenhum registro de outra
  lista (verificado com duas listas).

## Assumptions

- Lista = perfil (ADR-011): o histórico já é gravado por lista, então
  "lista ativa" define o escopo de tudo.
- O `↺ Histórico` é lido pelo instante da última reprodução, e "Continuar
  assistindo" pelo mesmo instante mais a posição de retomada (features 019 e
  025); separar os dois ("fica em Continuar, sai do Histórico") é decisão de
  modelo de dados do `sdd-plan` — pode exigir campo novo e, se for índice, uma
  versão do Dexie (reservar no `plan.md`, regra 4 do backlog).
- A confirmação usa o `Modal` da biblioteca V14 (feature 022), com o mesmo
  padrão de foco por estado das outras confirmações destrutivas (excluir
  fonte).
- A tecla vermelha (`ColorF0Red` no Tizen) é registrada pelo mesmo mecanismo
  estrito das teclas de mídia/amarela; nome, `keyCode` e privilégio só se
  provam na TV física — verificação recomendada, não gate, porque o detalhe é
  o caminho garantido.
- O item 63 (registro de abas) pode ou não ter sido feito antes; a spec não
  depende dele.
- Onde está a aba "Privacidade" na ordem das abas é decisão do `sdd-plan`,
  seguindo o protótipo V14 ("Serviços, fontes, EPG, reprodução e
  privacidade").

## Clarifications

### Sessão 2026-09-30

- Q: Ao remover um item do `↺ Histórico`, o que acontece com a retomada? (DS
  §13.3 diz que não apaga, a menos que a pessoa escolha; o backlog dizia "tira
  também de Continuar assistindo") → A: A pessoa escolhe na confirmação:
  "Remover do histórico" (mantém a retomada) ou "Remover e apagar progresso".
- Q: A mesma regra vale para limpar em lote? → A: Sim, mesma escolha na
  confirmação da limpeza.
- Q: Onde se remove um item único? → A: Na grade do `↺ Histórico` (tecla de
  cor) e no detalhe do filme/série ("Remover do histórico").
- Q: Onde fica a limpeza em lote? → A: Nova aba "Privacidade" em
  Configurações.
- Q: Sobre qual lista a aba age? → A: Só a lista ativa, com o nome dela; sem
  lista ativa, a aba explica e mantém um elemento focável.
- Q: Qual tecla remove na grade? → A: Vermelha.
- Q: Remover uma série faz o quê? → A: Age sobre todos os episódios da série;
  marcas "assistido" dos episódios ficam intactas.
- Q: A limpeza em lote apaga os registros "não disponíveis"? → A: Sim; a
  contagem mostrada já os inclui.
- Q: A rail "Continuar assistindo" da Home ganha remoção direta? → A: Não,
  fora de escopo; a Home só reflete.
- Q: Para onde vai o foco depois de remover na grade? → A: Vizinho, como em
  `★ Favoritos`, com toast; lista vazia cai no estado vazio focável.
