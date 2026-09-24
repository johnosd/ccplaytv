# Feature Specification: Favoritos em Canais, Filmes e Séries

**Slug**: `013-favoritos`

**Created**: 2026-09-24

**Status**: Planejada

**Input**: Item 11 do backlog (`.planning/backlog.md`), eleito em
2026-09-24 na revisão pós-012: "Favoritos nos três tipos — persistência
local que sobrevive a reimportação, por chave estável (fonte + tipo + id
estável). Favoritar não marca como assistido nem como 'gostei'." A camada
de dados já existe (feature 008: `toggleFavorite`, `getGlobalFavorites`,
`buildStableId`); falta inteiramente a interface — nenhuma tela a usa.

## Contexto

- Live TV, Filmes e Séries são **categoria-primeiro** (feature 010): uma
  trilha de categorias à esquerda e, ao entrar numa categoria, a grade de
  pôsteres (filmes/séries) ou a lista de canais, virtualizadas (feature
  009).
- Numa fonte de provedor, os itens de uma categoria só existem no aparelho
  depois que a pessoa entra nela (feature 010). Um favorito pode, portanto,
  apontar para um item que ainda não foi obtido nesta instalação ou nesta
  geração do catálogo.
- Hoje, OK sobre um canal toca; OK sobre um filme ou série abre o detalhe.
  Não há outra ação disponível num item da grade/lista.
- Não há registro de teclas coloridas nem de teclas de mídia (item 44 do
  backlog); só setas, OK e RETURN estão garantidos.

## Escopo

### Incluído

- Favoritar e desfavoritar **canal, filme e série** segurando OK (clique
  demorado) sobre o item focado na grade de pôsteres ou na lista de
  canais.
- Categoria virtual **"Favoritos"** no topo da trilha de categorias de
  Live TV, de Filmes e de Séries, listando os favoritos daquele tipo e
  daquela fonte.
- Marca visual (estrela) no cartão/linha de item favoritado, em qualquer
  categoria onde ele apareça.
- Aviso breve de confirmação ("Adicionado aos favoritos" / "Removido dos
  favoritos").
- Dica fixa "Segure OK para favoritar" nas três seções.
- Persistência local por identidade lógica estável, sobrevivendo a
  ressincronização e a fechar/reabrir o app.

### Fora de Escopo

- Favoritar episódio individual (série é o nível de favorito).
- Favoritar pelas telas de detalhe de filme/série, pelo player ou por
  categoria da trilha — nesses lugares, segurar OK se comporta como OK.
- Teclas coloridas, tecla de mídia ou menu de contexto (item 44).
- Favoritos globais entre fontes, ou bloco "Favoritos" no hub da lista /
  rail na Home (itens 16 e 21).
- Mostrar favorito cujo item ainda não está no aparelho (categoria não
  carregada) ou saiu da fonte — decisão desta spec: só aparece o que
  estiver carregado (ver Clarifications).
- Reordenar favoritos manualmente, pastas, exportar/backup.
- "Gostei" (item 27) e histórico (item 13).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Favoritar e achar um canal (Priority: P1)

Na Live TV, a pessoa foca um canal na lista e segura OK. Aparece "Adicionado
aos favoritos" e uma estrela na linha do canal. A categoria "Favoritos", no
topo da trilha, passa a listar esse canal; OK nele toca como em qualquer
categoria.

**Why this priority**: canal é o uso mais frequente (zapping entre os
mesmos canais) e a Live TV é a tela mais madura. Sozinha, entrega o valor
completo de favoritos para um tipo.

**Independent Test**: numa fonte com canais, segurar OK sobre um canal,
voltar à trilha, entrar em "Favoritos", tocar o canal por OK; segurar OK
de novo sobre ele para remover.

**Acceptance Scenarios**:

1. **Given** um canal focado na lista, **When** a pessoa segura OK por
   ~0,8 s, **Then** o canal vira favorito, aparece "Adicionado aos
   favoritos" e a linha ganha uma estrela — **sem** iniciar reprodução.
2. **Given** um canal focado, **When** a pessoa aperta e solta OK
   rapidamente, **Then** o canal toca, como hoje (nenhum favorito muda).
3. **Given** um canal favorito, **When** a pessoa segura OK sobre ele,
   **Then** ele deixa de ser favorito, aparece "Removido dos favoritos" e a
   estrela some.
4. **Given** ao menos um canal favorito, **When** a pessoa entra em
   "Favoritos" na trilha, **Then** vê os canais favoritos desta fonte, do
   mais recente para o mais antigo, e OK toca o canal focado.
5. **Given** a pessoa mantém OK pressionado além do limiar, **When**
   continua segurando, **Then** o favorito alterna uma única vez (segurar
   mais tempo não alterna de novo).

---

### User Story 2 - Favoritar filmes e séries (Priority: P2)

Em Filmes ou Séries, a pessoa foca um pôster na grade e segura OK. O
cartão ganha uma estrela e passa a aparecer na categoria "Favoritos" daquela
seção. OK curto continua abrindo o detalhe.

**Why this priority**: mesmo mecanismo da US1 aplicado às grades de
pôsteres; depende da US1 apenas pelo gesto.

**Independent Test**: favoritar um filme e uma série, entrar em
"Favoritos" de cada seção, abrir o detalhe por OK e voltar.

**Acceptance Scenarios**:

1. **Given** um filme focado na grade, **When** a pessoa segura OK,
   **Then** ele vira favorito com aviso e estrela, sem abrir o detalhe.
2. **Given** um filme focado, **When** a pessoa aperta e solta OK
   rapidamente, **Then** o detalhe abre, como hoje.
3. **Given** uma série favoritada, **When** a pessoa entra em "Favoritos"
   de Séries, **Then** vê o cartão da série (nunca de um episódio) e OK
   abre o detalhe da série.
4. **Given** um filme favorito, **When** a pessoa volta do detalhe para a
   categoria "Favoritos", **Then** o foco volta ao mesmo filme (reconciliado
   pelo id do item).
5. **Given** o mesmo item aparece em "Favoritos" e na sua categoria de
   origem, **When** a pessoa o desfavorita em qualquer uma das duas,
   **Then** a estrela some nas duas e ele sai de "Favoritos".

---

### User Story 3 - Favoritos persistem e são honestos (Priority: P2)

Os favoritos continuam lá depois de fechar e reabrir o app e depois de
ressincronizar a fonte. A categoria "Favoritos" nunca é um beco sem saída,
mesmo vazia.

**Why this priority**: sem persistência, favoritar não tem valor; mas o
armazenamento já existe (feature 008) — aqui se garante o comportamento
visível.

**Independent Test**: favoritar itens, fechar e reabrir o app, conferir;
ressincronizar a fonte, conferir de novo; desfavoritar tudo e ver o estado
vazio.

**Acceptance Scenarios**:

1. **Given** favoritos marcados, **When** o app é fechado e reaberto,
   **Then** estrelas e categoria "Favoritos" refletem o mesmo conjunto.
2. **Given** favoritos marcados, **When** a fonte é ressincronizada e os
   itens mantêm o mesmo id estável, **Then** continuam favoritos quando o
   item volta a estar carregado.
3. **Given** nenhum favorito carregado para aquele tipo, **When** a pessoa
   entra em "Favoritos", **Then** vê uma explicação ("Segure OK sobre um
   canal/filme/série para favoritar") e um elemento focável que devolve o
   foco à trilha.
4. **Given** há favoritos gravados cujo item ainda não está no aparelho,
   **When** a pessoa entra em "Favoritos", **Then** vê só os carregados, e
   uma nota informa que outros favoritos aparecem quando a categoria deles
   for aberta — sem contar nem listar os ausentes como se estivessem ali.
5. **Given** duas fontes diferentes, **When** a pessoa abre "Favoritos"
   numa delas, **Then** só aparecem favoritos daquela fonte.

### Edge Cases

- Segurar OK sobre item focado numa lista que ainda está carregando, vazia
  ou em erro: nada acontece além do comportamento atual do OK.
- Soltar OK exatamente perto do limiar: exatamente uma das duas ações
  (tocar/abrir **ou** favoritar), nunca as duas.
- Auto-repetição de tecla do controle (vários eventos de "pressionado" ao
  segurar): tratada como um único gesto.
- Segurar OK enquanto o player está em tela cheia: comportamento do player
  inalterado (fora de escopo).
- Item sem identidade estável (sem id do painel e sem nome): não é
  favoritável; segurar OK mostra aviso explicando, sem erro técnico.
- Desfavoritar o último item dentro de "Favoritos": a lista vira o estado
  vazio com foco recuperado, nunca sem foco.
- Desfavoritar o item focado dentro de "Favoritos": o foco vai para o
  vizinho (seguinte, ou anterior se era o último).
- Categoria "Favoritos" com muitos itens (centenas): mesma virtualização e
  desempenho das demais categorias.
- Nome de categoria da fonte igual a "Favoritos": as duas coexistem; a
  virtual é distinguível (posição fixa no topo e ícone de estrela).
- Falha ao gravar o favorito (armazenamento cheio/indisponível): aviso
  honesto "Não foi possível salvar o favorito", estrela não muda.

## Requirements *(mandatory)*

### Functional Requirements

**Gesto**

- **FR-001**: Segurar OK por um limiar (~0,8 s) sobre um canal, filme ou
  série focado na lista/grade DEVE alternar o favorito desse item.
- **FR-002**: Apertar e soltar OK antes do limiar DEVE manter o
  comportamento atual (canal toca; filme/série abre o detalhe), executado
  ao soltar a tecla.
- **FR-003**: Um mesmo pressionamento NÃO DEVE executar as duas ações nem
  alternar o favorito mais de uma vez, independentemente de auto-repetição
  da tecla.
- **FR-004**: Em categoria da trilha, detalhe, player e demais telas,
  segurar OK DEVE se comportar como OK comum.

**Categoria "Favoritos"**

- **FR-005**: Live TV, Filmes e Séries DEVEM exibir uma categoria
  "Favoritos" fixa no topo da trilha, visualmente distinguível das
  categorias da fonte, sem renomear nem substituir nenhuma delas.
- **FR-006**: A categoria "Favoritos" DEVE listar os favoritos do tipo da
  seção e da fonte ativa que estejam carregados no aparelho, do favoritado
  mais recente para o mais antigo.
- **FR-007**: Itens em "Favoritos" DEVEM ter o mesmo comportamento de OK
  (curto e demorado) que na sua categoria de origem.
- **FR-008**: "Favoritos" vazia DEVE exibir explicação de como favoritar e
  elemento focável ativável pelo OK do controle.
- **FR-009**: Quando houver favoritos gravados cujo item não está
  carregado, "Favoritos" DEVE informar que eles aparecem ao abrir a
  categoria de origem, sem exibir contagem ou cartão inventado.

**Feedback**

- **FR-010**: Todo item favorito DEVE exibir uma estrela no cartão/linha,
  em qualquer categoria onde apareça.
- **FR-011**: Alternar o favorito DEVE exibir aviso breve de confirmação
  ("Adicionado aos favoritos" / "Removido dos favoritos").
- **FR-012**: As três seções DEVEM exibir a dica "Segure OK para
  favoritar" enquanto houver itens favoritáveis na tela.
- **FR-013**: Falha ao gravar DEVE ser comunicada sem detalhe técnico, e a
  estrela NÃO DEVE mudar.

**Persistência e identidade**

- **FR-014**: O favorito DEVE ser chaveado pela identidade lógica estável
  (fonte + tipo + id estável), nunca pela URL nem pelo nome de exibição
  quando houver id.
- **FR-015**: Favoritos DEVEM sobreviver a fechar/reabrir o app e a
  ressincronização da fonte, reaparecendo quando o item com a mesma
  identidade estiver carregado.
- **FR-016**: Favoritar NÃO DEVE alterar progresso, retomada, "assistido"
  nem "gostei".
- **FR-017**: Remover uma fonte DEVE remover os favoritos dela. Verificado
  em 2026-09-24: `deleteSource` hoje **não** apaga `userStates` da fonte
  (ficam órfãos); o plano decide se apaga o registro inteiro — o que
  também leva a retomada — ou só limpa o favorito.

**Foco (constitution)**

- **FR-018**: Desfavoritar o item focado dentro de "Favoritos" DEVE mover
  o foco ao vizinho, ou ao estado vazio focável se não restar nenhum.
- **FR-019**: Voltar do detalhe ou do player para "Favoritos" DEVE
  restaurar foco e rolagem pelo id do item.

### Key Entities *(include if feature involves data)*

- **Favorito** (existente, feature 008 — `UserStateRecord` com
  `isFavorite`/`favoritedAt`): identidade estável do item, fonte, instante
  em que foi favoritado.
- **Categoria "Favoritos"**: categoria virtual por seção e fonte; não é
  gravada como categoria da fonte nem conta como categoria dela.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 20 pressionamentos curtos e 20 demorados seguidos na TV de
  referência, 100% executam exatamente a ação esperada (nenhum toque
  acidental, nenhum favorito duplo).
- **SC-002**: A estrela e o aviso aparecem em até 300 ms após o limiar do
  gesto.
- **SC-003**: 100% dos favoritos carregados permanecem após fechar/reabrir
  o app e após ressincronizar a fonte (itens com id estável inalterado).
- **SC-004**: A categoria "Favoritos" com 500 itens rola sem travamento
  perceptível, como as demais categorias.
- **SC-005**: Todos os fluxos das US1–US3 são completáveis só com o
  controle remoto, sem beco sem saída, incluindo "Favoritos" vazia.

## Assumptions

- O controle da TV de referência entrega OK como pressionar/soltar
  distinguíveis (com auto-repetição ao segurar); o plano confirma na TV
  real e no roteiro E2E exigido pela constitution v1.4.0.
- Limiar de ~0,8 s é ajustável no plano após teste na TV.
- A ação do OK curto passar a ocorrer ao soltar (e não ao apertar) é
  aceitável; o atraso percebido é o tempo de um clique.
- Para fonte M3U (catálogo integral), todos os favoritos estão sempre
  carregados; a nota de FR-009 só aparece em fonte de provedor.
- Canal favorito aparece em "Favoritos" da Live TV mesmo que a categoria
  de origem tenha sido ressincronizada, desde que o item da geração atual
  com a mesma identidade estável esteja carregado.

## Clarifications

### Sessão 2026-09-24

- Q: Onde a pessoa encontra os favoritos? → A: Categoria "Favoritos" no
  topo da trilha de Live TV, Filmes e Séries.
- Q: Como favoritar/desfavoritar pelo controle? → A: Clique demorado (OK
  pressionado) sobre o canal, filme ou série — no lugar do botão em
  detalhe/painel que tinha sido recomendado.
- Q: E se o item favoritado não estiver no aparelho (categoria não
  carregada ou item removido da fonte)? → A: Mostrar só o que estiver
  carregado. Registrado em FR-009 que a categoria diz, sem contar nem
  listar, que há favoritos fora do aparelho — para não parecer que eles
  foram perdidos (princípio de progresso honesto).
- Q: O que pode ser favoritado? → A: Canal, filme e série; episódio não.
  Escopo por fonte.
- Q: Como a pessoa descobre e confirma o clique demorado? → A: Dica fixa
  "Segure OK para favoritar" + aviso de confirmação + estrela no item.
- Q: Segurar OK sobre categoria da trilha ou no detalhe faz o quê? → A: Só
  favorita item da grade/lista; nos demais lugares, comporta-se como OK
  comum.
