# Feature Specification: Limpeza e QA do Design System V14 (Onda 7)

**Slug**: `028-limpeza-qa-ds-v14`

**Created**: 2026-09-28

**Status**: Implementada

**Input**: Onda 7 da migração para o Design System V14 Spectrum — item M8
do backlog (`.planning/backlog.md`) e seção "Onda 7" de
`.planning/migracao-design-system-v14.md`: quebra do `features/screens.css`
por componente/tela, remoção de CSS morto, matriz de QA Tizen (§34 do
Spec), varredura de `aria-label`, passada na TV física, emenda final da
ADR-007/`CLAUDE.md`. Absorve o bug "Scrollbars nativas visíveis e pouco
aproveitamento de tela em Filmes e Home", achado na passada física da 027,
e mais quatro bugs abertos do backlog (ver Clarifications).

## Contexto

As ondas 0–6 (features 021–027) migraram todas as telas para o DS V14 e
estão convergidas. Sobrou o que é transversal:

- `tv-web/src/features/screens.css` (~17,7 KB, 651 linhas) é o arquivo de
  estilo legado. As ondas 3–6 já tiraram boa parte dele para
  `tv-web/src/styles/<tela>.css`, mas ele ainda carrega regras vivas
  (inclusive as do plano de hardware do AVPlay) misturadas com regras que
  nenhuma tela usa mais.
- Na passada na TV física da 027 (28/09/2026) apareceram barras de rolagem
  nativas em Filmes (trilha de categorias, grade — vertical e horizontal) e
  no Início (painel principal), e um grande espaço vertical vazio abaixo do
  rail "Minha Lista" no Início. Nenhuma tela de um app navegado por D-pad
  deveria expor uma barra de rolagem.
- Nunca houve uma passada sistemática da matriz de QA Tizen (§34: Remote,
  Visual, Performance) sobre o conjunto das telas migradas.
- Bugs abertos que tocam exatamente esse território: botões de estado de
  carregando/erro que parecem focados mas não respondem a SELECT; `Icon.tsx`
  gravando `var()` em atributos SVG; `CLAUDE.md` sem os parágrafos das
  features 024–026; a trava de contrato da 017 apontando para testes que a
  018 removeu.

## Escopo

### Incluído

- **Scrollbars e aproveitamento de tela**: nenhuma barra de rolagem nativa
  visível em Filmes e no Início; layout do Início redistribuído para ocupar
  a área útil do palco 1920×1080 só com o conteúdo real que já existe.
- **Estados de carregando/vazio/erro**: todo botão visível desses estados,
  em toda tela, responde a SELECT.
- **Matriz de QA Tizen (§34)** executada em todas as telas do app, com
  documento de resultado; falhas "pequenas" (apresentação e atributos)
  corrigidas aqui, as demais registradas no backlog.
- **Nomes acessíveis**: todo elemento focável/interativo de toda tela tem
  nome acessível, verificado por teste automatizado por tela.
- **Legado de CSS**: `features/screens.css` eliminado — cada regra viva
  movida para o arquivo de estilo da tela/componente dono dela, regras mortas
  removidas — sem nenhuma mudança visual não intencional.
- `Icon.tsx` deixa de gravar `var()` em atributos SVG.
- **Documentação e processo**: parágrafos das features 024, 025 e 026 em
  `CLAUDE.md`; emenda final da ADR-007 (e nota correspondente no `CLAUDE.md`)
  declarando a migração V14 concluída; roteiro de migração e backlog
  marcando a Fase 1.5 como fechada; trava de contrato da 017 aposentada como
  superada pela 018.
- Passada na TV física (gate obrigatório).

### Fora de Escopo

- Qualquer funcionalidade nova: rails novos no Início, conteúdo inventado,
  telas ou componentes novos, mudança de fluxo de navegação.
- Falhas da matriz que exigem mais que apresentação/atributos — viram
  entradas no backlog, não correções aqui.
- Regra global de "nenhuma scrollbar em nenhuma tela" definida de antemão:
  outras telas só entram se a matriz encontrar a barra lá (ver
  Clarifications).
- Bug "Mensagem genérica de erro de reprodução sempre diz 'canal'" — não
  absorvido; continua no backlog.
- Reescrever os testes de tela da 017 (a trava é aposentada, não
  recriada).
- Mudança de tokens, paleta ou receita de foco do DS V14.
- `api/` (contorno congelado, ADR-008).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filmes e Início sem barras de rolagem e sem espaço desperdiçado (Priority: P1)

Quem navega por Filmes e pelo Início na TV não vê nenhuma barra de rolagem
nativa — a rolagem acompanha o foco, como no resto do app — e o Início
ocupa a tela com o conteúdo que existe, sem uma faixa grande vazia abaixo
do último rail.

**Why this priority**: É o único defeito visto a olho nu na TV física pelo
usuário; uma barra de rolagem de navegador numa TV denuncia "web
empacotada" (Fase 2 do backlog) e compete com o foco.

**Independent Test**: Abrir Filmes com uma categoria longa e o Início com
"Minha Lista" preenchida, no palco 1920×1080, e confirmar que nenhuma barra
de rolagem aparece em lugar nenhum, que o foco continua rolando o conteúdo
até o fim, e que não sobra faixa vazia maior que o respiro previsto pelos
tokens abaixo do último rail do Início.

**Acceptance Scenarios**:

1. **Given** Filmes com mais itens do que cabem na grade e mais categorias
   do que cabem na trilha, **When** a tela é exibida, **Then** nenhuma
   barra de rolagem nativa aparece na trilha nem na grade (vertical ou
   horizontal).
2. **Given** a mesma tela, **When** a pessoa leva o foco até o último item
   da grade e a última categoria da trilha, **Then** o conteúdo rola para
   manter o foco visível, exatamente como antes da mudança.
3. **Given** o Início com conteúdo real, **When** a tela é exibida,
   **Then** nenhuma barra de rolagem nativa aparece e o conteúdo ocupa a
   área útil do palco, sem faixa vertical vazia além do espaçamento
   definido pelos tokens.
4. **Given** o Início com pouco conteúdo (ex.: só um rail), **When** a
   tela é exibida, **Then** nenhum rail, card ou dado fictício é
   acrescentado para preencher espaço.
5. **Given** mais conteúdo do que cabe numa direção, **When** há conteúdo
   escondido, **Then** o indicador de overflow do DS (§34 Visual) — e não
   uma barra nativa — sinaliza que há mais.

---

### User Story 2 - Todo botão de estado de carregando/vazio/erro responde ao controle (Priority: P1)

Quem cai num estado de carregando, vazio ou erro em qualquer tela consegue
acionar com SELECT o botão que está vendo focado ("Tentar de novo",
"Voltar" e similares) — nunca fica preso num botão que só parece focado.

**Why this priority**: É uma violação direta da constitution ("Foco
Visível e Sem Becos Sem Saída"): um botão focado que não reage a SELECT
prende a pessoa. O bug já foi corrigido parcialmente na 014, sem cobrir
todas as telas.

**Independent Test**: Forçar erro de carga em cada tela que tem estado de
erro/vazio/carregando com botão, pressionar SELECT no botão focado e
confirmar a ação (nova tentativa, voltar).

**Acceptance Scenarios**:

1. **Given** qualquer tela num estado de erro com "Tentar de novo" focado,
   **When** a pessoa pressiona SELECT, **Then** a nova tentativa é
   disparada.
2. **Given** qualquer tela num estado com "Voltar" focado, **When** a
   pessoa pressiona SELECT, **Then** ela volta ao nível anterior, como
   RETURN.
3. **Given** um estado com mais de um botão, **When** a pessoa move o foco
   com as setas, **Then** exatamente um fica focado por vez e SELECT
   aciona o focado.

---

### User Story 3 - Matriz de QA Tizen aplicada a todas as telas (Priority: P2)

Quem mantém o app tem, pela primeira vez, a matriz §34 (Remote, Visual,
Performance) executada tela por tela, com o resultado registrado; as falhas
de apresentação já corrigidas e as maiores registradas no backlog com
origem.

**Why this priority**: É o critério de saída da migração V14 e o que
separa "telas migradas" de "app de TV aprovado"; mas as P1 já atacam os
dois defeitos conhecidos de maior impacto.

**Independent Test**: Abrir o documento da matriz e conferir, para cada
tela, cada critério do §34 marcado como aprovado, reprovado-corrigido,
reprovado-registrado ou "só verificável na TV", com evidência.

**Acceptance Scenarios**:

1. **Given** a lista de telas do app, **When** a matriz é executada,
   **Then** cada tela tem um resultado para cada critério das três
   dimensões do §34.
2. **Given** uma falha de apresentação ou atributo (foco sem contorno,
   overflow sem indicador, layout shift, `aria-*` faltando, barra de
   rolagem, um SELECT sem ação num botão existente), **When** encontrada,
   **Then** é corrigida nesta feature e marcada como tal na matriz.
3. **Given** uma falha que exige mudar fluxo, dados ou criar
   componente/tela, **When** encontrada, **Then** vira entrada no backlog
   com a origem (feature 028 + data) e não é corrigida aqui.
4. **Given** um critério que só se prova em hardware (desempenho,
   repetição rápida, plano de hardware), **When** a passada na TV física
   acontece, **Then** o resultado dela é o que fica registrado.

---

### User Story 4 - Todo controle tem nome acessível, garantido por teste (Priority: P2)

Quem usa o leitor de tela da TV (Voice Guide) ouve um nome para todo
elemento focável de toda tela, e controles indisponíveis ("Em breve",
limites) anunciam essa condição. Uma regressão futura quebra a suíte.

**Why this priority**: §38 do Spec e FR-030 da 027 já exigem isso por
tela; faltava a varredura transversal e a proteção contra regressão.

**Independent Test**: Rodar o teste automatizado de nomes acessíveis e
confirmar que ele cobre todas as telas e passa; remover o nome de um
controle e confirmar que ele falha.

**Acceptance Scenarios**:

1. **Given** qualquer tela em seus estados principais, **When** o teste
   percorre os elementos focáveis/interativos, **Then** todos têm nome
   acessível não vazio.
2. **Given** um controle soft ou hard disabled, **When** inspecionado,
   **Then** a indisponibilidade está no nome ou em `aria-disabled`.
3. **Given** um controle sem nome acessível introduzido depois, **When** a
   suíte roda, **Then** o teste falha apontando a tela e o controle.

---

### User Story 5 - Legado de CSS eliminado sem mudança visual (Priority: P3)

Quem mantém o app encontra cada regra de estilo no arquivo da tela ou do
componente que a usa; o arquivo de estilo legado não existe mais e nenhuma
tela mudou de aparência por causa disso.

**Why this priority**: Higiene de manutenção — não muda nada para quem
assiste, mas remove a última dívida estrutural da migração.

**Independent Test**: Capturar todas as telas antes e depois da mudança
nos mesmos estados e confirmar diferença zero, exceto onde US1 ou uma
correção da matriz mudou algo de propósito.

**Acceptance Scenarios**:

1. **Given** o app depois da mudança, **When** se procura o arquivo de
   estilo legado, **Then** ele não existe e nada o importa.
2. **Given** capturas de todas as telas antes e depois, **When**
   comparadas, **Then** não há diferença além das intencionais (listadas).
3. **Given** as regras do plano de hardware do AVPlay, **When** o player
   está aberto sobre qualquer tela, **Then** o vídeo continua visível como
   antes (nenhuma camada web o encobre).
4. **Given** um ícone do conjunto local, **When** renderizado, **Then** o
   tamanho vem do `--icon-size` do contexto (por CSS ou estilo), nunca de
   `var()` num atributo SVG — igual no navegador e na TV.

---

### User Story 6 - Documentação e processo refletindo o fim da migração (Priority: P3)

Quem retoma o projeto lê em `CLAUDE.md`, na ADR-007, no roteiro de
migração e no backlog que a migração V14 terminou, com o que cada feature
021–028 entregou, e a verificação de travas de contrato de todas as
features passa.

**Why this priority**: A constitution trata a documentação do repositório
como canônica; hoje ela tem lacunas conhecidas (024–026) e uma trava
quebrada que faz a verificação da 017 falhar.

**Independent Test**: Ler `CLAUDE.md` e confirmar um parágrafo por feature
021–028; rodar a verificação de trava da 017 e vê-la íntegra.

**Acceptance Scenarios**:

1. **Given** `CLAUDE.md`, **When** lido, **Then** a seção de status tem
   parágrafos das features 024, 025, 026 e 028, sem descrever como
   entregue o que não foi.
2. **Given** a ADR-007, **When** lida, **Then** traz uma emenda inline
   registrando a conclusão da migração V14 e onde vive a forma executável
   do contrato visual.
3. **Given** a trava de contrato da 017, **When** verificada, **Then** está
   íntegra, e a 017 registra que o contrato foi superado pela 018.
4. **Given** o roteiro de migração e o backlog, **When** lidos, **Then** a
   Fase 1.5 / Onda 7 aparece como concluída e os bugs absorvidos saem da
   lista de abertos.

---

### Edge Cases

- Tela com conteúdo menor que a área visível: nenhuma barra, nenhum
  indicador de overflow, nenhum conteúdo inventado.
- Rolagem por roda do mouse no navegador de desenvolvimento: pode continuar
  funcionando; o requisito é sobre a barra visível e sobre o foco, não
  sobre desabilitar rolagem.
- Foco no último item de uma grade longa depois de esconder a barra: o
  item continua sendo trazido para a área visível (sem regressão da
  virtualização, feature 009).
- Regra de CSS cujo uso não se prova nem por busca no código nem pelas
  capturas (ex.: classe montada dinamicamente): não é removida sem
  evidência; fica registrada.
- Regra usada por mais de uma tela: vai para um arquivo compartilhado de
  estilo, não é duplicada.
- Regras do plano de hardware (transparência sob o AVPlay): mudar de
  arquivo sem mudar seletor nem ordem de precedência efetiva.
- Estado de erro com um único botão: ele já nasce focado e responde a
  SELECT.
- Estado "carregando" sem nenhum botão: continua com pelo menos um
  elemento focável (constitution), sem inventar ação.
- Achado da matriz na fronteira entre "pequeno" e "grande": na dúvida,
  vai para o backlog, não é corrigido aqui.
- Captura antes/depois com conteúdo que muda sozinho (relógio, data):
  mascarado ou fixado para a comparação.
- Reduzir movimento ativo: comparação feita no mesmo modo antes e depois.

## Requirements *(mandatory)*

### Functional Requirements

**Scrollbars e aproveitamento de tela (US1)**

- **FR-001**: Filmes (trilha de categorias e grade) e o Início NÃO DEVEM
  exibir barra de rolagem nativa, vertical ou horizontal, em nenhum estado.
- **FR-002**: A rolagem dirigida pelo foco nessas telas DEVE continuar
  levando o item focado à área visível, sem mudança de comportamento.
- **FR-003**: Onde houver conteúdo além da área visível, a sinalização
  DEVE ser o indicador de overflow do DS, nunca a barra nativa.
- **FR-004**: O Início DEVE redistribuir o layout do conteúdo real
  existente (dimensões de cards/rails e espaçamento por tokens) para ocupar
  a área útil do palco 1920×1080, sem faixa vertical vazia além do
  espaçamento definido pelos tokens.
- **FR-005**: O Início NÃO DEVE ganhar rail, card, seção ou dado que não
  exista hoje para preencher espaço.
- **FR-006**: Barra de rolagem nativa encontrada pela matriz em outra tela
  DEVE ser tratada como falha pequena da matriz (FR-012) e corrigida da
  mesma forma.

**Estados de carregando/vazio/erro (US2)**

- **FR-007**: Todo botão visível de estado de carregando, vazio ou erro, em
  toda tela, DEVE executar sua ação ao receber SELECT com o foco nele.
- **FR-008**: "Voltar" nesses estados DEVE ter o mesmo efeito que RETURN.
- **FR-009**: Cada tela com esses estados DEVE ter teste automatizado que
  prova a ação por SELECT.

**Matriz de QA Tizen (US3)**

- **FR-010**: A matriz §34 (Remote, Visual, Performance) DEVE ser executada
  em todas as telas do app: Splash, Perfis, Adicionar lista, onboarding e
  progresso de importação, Início, Busca, Configurações, Live TV, Filmes,
  Séries, detalhe de filme, detalhe de série, player e modais.
- **FR-011**: O resultado DEVE ficar registrado num documento da feature,
  tela × critério, com um de: aprovado, reprovado-corrigido,
  reprovado-registrado (com referência ao backlog) ou só-na-TV, e a
  evidência de cada um.
- **FR-012**: Falha de apresentação ou atributo — CSS, tokens, `aria-*`,
  foco visível, indicador de overflow, layout shift, barra de rolagem, ação
  de SELECT ausente num botão já existente — DEVE ser corrigida nesta
  feature.
- **FR-013**: Falha que exija mudar fluxo de navegação, dados ou criar
  tela/componente NÃO DEVE ser corrigida aqui; DEVE virar entrada no
  backlog com origem (feature 028 + data).
- **FR-014**: Critério que só se prova em hardware DEVE ter o resultado da
  passada na TV física registrado na matriz.

**Nomes acessíveis (US4)**

- **FR-015**: Todo elemento focável ou interativo de toda tela DEVE ter
  nome acessível não vazio.
- **FR-016**: Controle soft ou hard disabled DEVE indicar a
  indisponibilidade no nome acessível ou em `aria-disabled`.
- **FR-017**: DEVE existir teste automatizado que verifica FR-015/FR-016 em
  todas as telas, nos seus estados principais, e falha apontando tela e
  controle.

**Legado de CSS (US5)**

- **FR-018**: O arquivo de estilo legado `features/screens.css` DEVE deixar
  de existir e de ser importado.
- **FR-019**: Cada regra viva dele DEVE passar a morar no arquivo de estilo
  da tela ou do componente que a usa; regra usada por mais de um DEVE ir
  para um arquivo compartilhado, sem duplicação.
- **FR-020**: Regra sem uso comprovado DEVE ser removida; regra cujo uso
  não se consegue provar nem refutar DEVE ser mantida e registrada.
- **FR-021**: As regras do plano de hardware DEVEM manter o efeito atual:
  com o player aberto, nenhuma camada web encobre o vídeo em nenhuma tela.
- **FR-022**: Capturas de todas as telas, nos mesmos estados, antes e
  depois DEVEM ser idênticas, exceto pelas diferenças intencionais (US1 e
  correções da matriz), listadas.
- **FR-023**: `Icon` NÃO DEVE gravar `var()` em atributos de tamanho do
  SVG; o tamanho renderizado DEVE passar a ser, em todo motor, o valor de
  `--icon-size` do contexto do ícone. Onde o tamanho de hoje vinha do
  fallback do navegador (atributo inválido ignorado), a mudança é uma
  diferença visual intencional, listada na paridade (FR-022).
- **FR-024**: Todo estilo continua usando só tokens do DS V14 — nenhum
  valor literal de cor, raio, espaçamento ou fonte introduzido.

**Documentação e processo (US6)**

- **FR-025**: `CLAUDE.md` DEVE ganhar parágrafos das features 024, 025 e
  026 (a partir de seus `## Resultado Final`) e da 028, no mesmo formato
  dos demais.
- **FR-026**: A ADR-007 DEVE receber uma emenda inline
  (`**Atualização (028):**`) registrando a conclusão da migração V14, sem
  reescrever o histórico.
- **FR-027**: A trava de contrato da 017 DEVE ser aposentada: a 017 ganha um
  registro de emenda dizendo que o contrato foi superado pela 018, e a
  trava é regravada só com o que ainda existe, sem recriar os testes
  removidos.
- **FR-028**: O roteiro de migração e o backlog DEVEM marcar a Onda 7 e a
  Fase 1.5 como concluídas e retirar da lista de abertos os bugs absorvidos
  por esta feature.

**Preservação**

- **FR-029**: Nenhuma função das features 001–027 DEVE regredir; todas as
  travas de contrato e todos os scripts E2E existentes DEVEM continuar
  verdes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero barras de rolagem nativas visíveis em Filmes e no
  Início, no navegador de referência e na TV física.
- **SC-002**: No Início, a faixa vertical vazia abaixo do último elemento
  de conteúdo não passa do espaçamento de seção definido pelos tokens.
- **SC-003**: 100% dos botões de estados de carregando/vazio/erro
  respondem a SELECT, com teste por tela.
- **SC-004**: 100% das telas listadas em FR-010 têm resultado para 100% dos
  critérios do §34.
- **SC-005**: 100% dos elementos focáveis/interativos têm nome acessível,
  verificado por teste que cobre todas as telas.
- **SC-006**: Diferença visual zero entre capturas antes/depois, exceto as
  diferenças intencionais listadas.
- **SC-007**: Verificação de trava de contrato íntegra para todas as
  features que têm trava, incluindo a 017.
- **SC-008**: Passada na TV física de referência feita, cobrindo os
  critérios só-na-TV da matriz — gate obrigatório para convergir.

## Assumptions

- As capturas antes/depois reutilizam o mecanismo de paridade visual da
  feature 021, estendido a todas as telas convergidas, no palco
  1920×1080.
- O indicador de overflow do DS (esmaecimento de borda do `Rail`, feature
  022) é o sinal de "há mais conteúdo"; nenhum componente novo é criado
  para isso.
- A dimensão Performance do §34 é verificada pelo que o código permite
  provar (assets locais, sem GIF animado, sem blur pesado, listas
  virtualizadas, imagens no tamanho de uso) e o que só a TV prova fica
  como só-na-TV. "Trailers cancelados ao perder foco" não se aplica (não
  há trailer nem preview no foco, ADR-011).
- A emenda da ADR-007 é curta e aponta para a ADR-011 e para os tokens em
  `tv-web/src/index.css` como forma executável; não muda nenhuma decisão.
- Os parágrafos de `CLAUDE.md` das 024–026 vêm do `## Resultado Final` e do
  `## Estado Atual` de cada `plan.md`, sem descrever como entregue o que
  não foi.
- A passada na TV física usa a skill `tizen-tv` na QN50Q60DAGXZD.

## Clarifications

### Sessão 2026-09-28

- Q: O que fazer com `features/screens.css`? → A: Eliminar o arquivo —
  mover cada regra viva para o arquivo da tela/componente dono, remover o
  que nenhuma tela usa (US5, FR-018–FR-020).
- Q: Como provar que a limpeza de CSS não mudou nenhuma tela? → A:
  Capturas antes/depois de todas as telas, diferença zero exceto as
  intencionais (FR-022, SC-006).
- Q: Qual a entrega da matriz §34? → A: Rodar em todas as telas, corrigir
  as falhas pequenas aqui, registrar as demais no backlog (US3).
- Q: Quais bugs abertos do backlog esta feature absorve, além do de
  scrollbars/Home? → A: `CLAUDE.md` sem 024/025/026; `Icon.tsx` com `var()`
  em atributos SVG; "Tentar de novo"/"Voltar" não ativáveis; trava de
  contrato da 017 quebrada. O bug da mensagem de erro "canal" fica fora.
- Q: O que muda no espaço vazio do Início? → A: Redistribuir o layout só com
  o conteúdo real existente — nenhum rail, card ou dado novo (FR-004,
  FR-005).
- Q: Alcance da correção de scrollbars? → A: Filmes e Início (FR-001).
- Q: Critério de pronto da varredura de `aria-label`? → A: Teste
  automatizado por tela que impede regressão (FR-017).
- Q: A passada na TV física é gate? → A: Obrigatória para convergir
  (SC-008), mesmo padrão de 013/027.
- Q: Se a matriz achar barra de rolagem em outra tela (ex.: Séries)? → A:
  Vira falha pequena da matriz e é corrigida aqui (FR-006), sem regra
  global definida de antemão.
- Q: O que conta como falha "pequena"? → A: Apresentação e atributos —
  CSS, tokens, `aria-*`, foco visível, overflow, layout shift, SELECT
  ausente num botão existente; nunca fluxo, dados ou tela/componente novo
  (FR-012, FR-013).
- Q: Quais telas entram na matriz? → A: Todas as telas do app (FR-010).
- Q: Como corrigir a trava da 017? → A: Aposentar como superada pela 018,
  com emenda registrada, sem recriar os testes (FR-027).
- Q: Alcance do bug "Tentar de novo"/"Voltar"? → A: Todo estado de
  carregando/vazio/erro de toda tela, com teste por tela (FR-007–FR-009).
- Correção (sdd-plan): o FR-023 dizia que o tamanho do ícone "continua o
  mesmo". Hoje o `var()` no atributo é ignorado pelo navegador (ícone no
  tamanho de fallback) e resolvido de forma instável na TV (ícones
  enormes, contornados na 024 com `--icon-size` explícito em
  `components.css`). Corrigir faz o token valer em todo motor, então o
  tamanho **pode mudar** onde vinha do fallback. O texto passou a exigir o
  tamanho do token e tratar a mudança como diferença intencional da
  paridade.
