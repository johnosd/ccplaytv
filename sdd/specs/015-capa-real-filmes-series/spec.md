# Feature Specification: Capa Real de Filmes e Séries

**Slug**: `015-capa-real-filmes-series`

**Created**: 2026-09-24

**Status**: Convergida

**Input**: O usuário percebeu que nenhuma imagem de capa carrega hoje nas
grades de Filmes e Séries. Investigação confirmou que não é um bug: o
conector Xtream nunca captura o campo de capa (`stream_icon`/`cover`), o
parser M3U nunca captura o atributo `tvg-logo`, o esquema local não tem
campo para isso, e as três telas de grade renderizam sempre o mesmo
placeholder (textura + título). Já estava mapeado no backlog (item 8,
"Filmes: arte e detalhe real" — Fase 1), sem ter sido puxado para
planejamento. Priorizado pelo usuário em 2026-09-24.

## Escopo

### Incluído

- Capturar, na importação, a URL de capa que a própria fonte já declara
  para cada filme e cada série: `stream_icon`/`cover` no protocolo Xtream,
  atributo `tvg-logo` numa entrada M3U.
- Guardar essa URL associada ao filme/série no catálogo local do aparelho.
- Exibir a capa real nas grades de Filmes e de Séries, no lugar do
  placeholder, sempre que a fonte tiver declarado uma URL.
- Manter o placeholder atual (textura + título) quando a fonte não
  declarou capa, ou quando a URL declarada falhar ao carregar — nunca
  deixar aparecer um espaço vazio ou o ícone nativo de imagem quebrada do
  navegador.

### Fora de Escopo

- Live TV: a grade de canais continua com o placeholder atual, em
  qualquer caso. Não faz parte desta feature.
- Hero de detalhe com sinopse/imagem de fundo via TMDB (backlog item 28,
  ainda não construído) — esta feature cobre só os cards das grades.
- Detecção de "capa em branco": algumas fontes devolvem uma URL válida
  que aponta para uma imagem genérica/vazia do próprio provedor. Esta
  feature não distingue isso — mostra o que a fonte entrega.
- Empty state de "sem resultado de busca" (depende do backlog item 12,
  que não existe hoje).
- Capa por episódio dentro do detalhe de uma série.
- Qualquer busca de imagem por nome ou chamada a serviço externo (TMDB ou
  outro) — a URL usada é sempre e só a que a própria fonte já declara.
- Migração retroativa de fontes já importadas: uma fonte importada antes
  desta feature só ganha capa na próxima ressincronização.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver a capa real de um filme ou série (Priority: P1)

A pessoa entra em Filmes ou em Séries. Cada item cuja fonte declarou uma
capa mostra essa imagem real no card, em vez do placeholder genérico —
permitindo reconhecer o título visualmente, como em qualquer app de TV.

**Why this priority**: é o problema que o usuário relatou diretamente, e o
valor é imediatamente visível — hoje a grade inteira parece "quebrada" ou
incompleta mesmo funcionando corretamente por baixo.

**Independent Test**: importar uma fonte cujo provedor (ou arquivo M3U)
declara capa para ao menos um filme e uma série; abrir Filmes e abrir
Séries; a capa real aparece nos cards correspondentes.

**Acceptance Scenarios**:

1. **Given** uma fonte de provedor (protocolo Xtream) cujos itens de VOD e
   de série declaram `stream_icon`/`cover`, **When** a pessoa entra na
   categoria depois de importar, **Then** cada filme e cada série com capa
   declarada mostra a imagem real no card.
2. **Given** uma fonte M3U cujas entradas de filme/série têm o atributo
   `tvg-logo`, **When** a categoria é lida (seja pelo caminho Xtream
   confirmado, seja pelo conteúdo guardado da feature 014), **Then** a
   capa real aparece do mesmo jeito.
3. **Given** um filme ou série cuja fonte não declarou nenhuma capa,
   **When** a pessoa olha o card, **Then** aparece o mesmo placeholder de
   hoje (textura + título), nunca um espaço vazio.
4. **Given** uma fonte importada antes desta feature existir, **When** a
   pessoa abre Filmes/Séries sem ressincronizar, **Then** os cards
   continuam com o placeholder — só depois de ressincronizar a fonte
   passam a mostrar capa real, quando declarada.

---

### User Story 2 - Nunca ver uma imagem quebrada (Priority: P2)

Quando a URL de capa declarada pela fonte falha ao carregar — rede
instável, link morto, formato inesperado —, o card volta a mostrar o
mesmo placeholder de sempre, nunca o ícone nativo de "imagem quebrada" do
navegador nem uma tentativa infinita de recarregar.

**Why this priority**: sem isso, uma fonte com links de capa
inconsistentes (comum em painéis IPTV) trocaria um problema visível (placeholder
uniforme) por outro pior (ícones de erro espalhados pela grade,
inconsistentes entre si).

**Independent Test**: apontar a capa de um item para uma URL inválida ou
inacessível; o card mostra o placeholder padrão, sem ícone de imagem
quebrada visível e sem nova tentativa de carregamento a cada rolagem da
grade.

**Acceptance Scenarios**:

1. **Given** um item cuja URL de capa aponta para um endereço que não
   responde (rede) ou responde erro, **When** o card tenta carregar a
   imagem, **Then** o placeholder padrão aparece no lugar, nunca o ícone
   nativo de imagem quebrada.
2. **Given** uma URL de capa vazia ou evidentemente não é uma URL válida,
   **When** o card é montado, **Then** ele nunca tenta carregar essa URL —
   trata como se não houvesse capa (mesmo resultado da US1, cenário 3).

---

### Edge Cases

- Item cuja capa carrega com sucesso, mas a fonte é ressincronizada e a
  nova URL falha: o card volta ao placeholder — nunca mantém a imagem
  antiga de uma geração anterior do catálogo.
- Duas fontes distintas com o mesmo título de filme, uma com capa e outra
  sem: cada item mostra o que a própria fonte declarou, sem herdar a capa
  de um item parecido de outra fonte.
- Fonte de provedor em "Modo limitado" (feature 014): o M3U reconstruído
  ainda passa pelo mesmo parser, então `tvg-logo`, quando presente, é
  capturado normalmente — a limitação de Modo limitado não afeta a capa.
- Item que só existia como categoria (`on_demand`/`stored`, ainda não
  lido pela pessoa): não há card para mostrar capa ainda — a captura
  acontece quando a categoria é lida, junto com o resto dos campos do
  item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Na importação/leitura de uma categoria de provedor
  (protocolo Xtream), o sistema DEVE capturar a URL de capa que a fonte
  declara (`stream_icon` para filme, `cover` para série), quando
  presente.
- **FR-002**: Na importação/leitura de uma entrada M3U (fonte avulsa,
  painel não confirmado, ou Modo limitado) classificada como filme ou
  série, o sistema DEVE capturar o atributo `tvg-logo`, quando presente.
- **FR-003**: A URL de capa capturada DEVE ficar associada ao filme/série
  correspondente no catálogo local do aparelho.
- **FR-004**: A grade de Filmes DEVE exibir a capa real de cada filme que
  tiver uma URL guardada.
- **FR-005**: A grade de Séries DEVE exibir a capa real de cada série que
  tiver uma URL guardada.
- **FR-006**: Um filme ou série sem URL de capa guardada DEVE mostrar o
  mesmo placeholder usado hoje, nunca um espaço vazio.
- **FR-007**: Se a URL de capa guardada falhar ao carregar (erro de rede,
  resposta de erro, formato inesperado), a interface DEVE mostrar o mesmo
  placeholder da FR-006, nunca o ícone nativo de imagem quebrada do
  navegador, e nunca entrar em um ciclo de novas tentativas automáticas.
- **FR-008**: Uma URL de capa vazia ou que não seja reconhecível como URL
  DEVE ser tratada como ausente (mesmo resultado da FR-006) — nunca
  repassada para tentativa de carregamento.
- **FR-009**: A grade de Live TV NÃO DEVE mudar nesta feature — continua
  com o placeholder atual em todos os casos, mesmo que a fonte declare
  logo de canal.
- **FR-010**: Uma fonte importada antes desta feature DEVE continuar
  mostrando o placeholder em todos os seus itens até a próxima
  ressincronização — sem migração retroativa de dado.
- **FR-011**: A captura e exibição de capa NUNCA DEVE inventar, buscar ou
  completar uma imagem por conta própria — a única fonte da URL é o que o
  provedor (Xtream) ou o arquivo M3U já declaram.
- **FR-012**: Uma capa de uma geração anterior do catálogo NUNCA DEVE
  continuar aparecendo depois de uma ressincronização que produziu uma
  capa diferente (ou nenhuma) para o mesmo item — mesma regra de
  substituição por geração que o resto do catálogo já segue.

### Key Entities

- **Filme** e **Série** (entidades já existentes no catálogo): ganham um
  campo novo, a URL de capa declarada pela fonte — ausente quando a fonte
  não declarou nada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa fonte de referência com capa declarada para filmes e
  séries, depois de importada (ou ressincronizada), todo item com capa
  declarada mostra a imagem real na grade correspondente — nenhum
  placeholder onde deveria haver imagem.
- **SC-002**: Em nenhuma circunstância (capa ausente, URL inválida, ou
  falha de carregamento) aparece o ícone nativo de imagem quebrada do
  navegador em algum card das grades de Filmes ou Séries.
- **SC-003**: Rolar a grade de Filmes ou de Séries com capas reais
  carregando não introduz travamento nem lentidão perceptível em relação
  à rolagem de hoje, sem capa nenhuma.

## Assumptions

- A URL de capa vem sempre e só da própria fonte (Xtream `stream_icon`/
  `cover`, ou atributo `tvg-logo` do M3U) — nunca de um serviço externo
  como o TMDB.
- Fontes já importadas só ganham capa na próxima ressincronização —
  mesmo padrão já usado pelas features anteriores quando um campo novo
  entra no catálogo (ex.: D-012 da feature 014).
- "Capa em branco" (URL válida que aponta para uma imagem genérica ou
  vazia do próprio provedor) fica fora de escopo desta feature — mostrar
  o que a fonte entrega, mesmo que seja uma imagem sem conteúdo útil.
- Live TV fica de fora desta feature por decisão explícita do usuário,
  mesmo que o campo de logo exista tecnicamente para canal também.

## Clarifications

### Sessão 2026-09-24

- Q: Quais grades ganham arte real agora? → A: Filmes e Séries. Live TV
  fica de fora, continua com o placeholder atual (FR-009).
- Q: Quando não há capa ou a imagem falha ao carregar, o que aparece no
  lugar? → A: O mesmo placeholder que já existe hoje (textura + título) —
  sem desenhar um placeholder novo. Confirmado que nem o protótipo de
  design tem capa real mockada; ele usa o mesmo padrão de textura para
  todo card de filme/série.
- Q: Fontes já importadas antes desta feature não têm a URL de capa
  guardada — o que acontece com elas? → A: Só ganham capa na próxima
  ressincronização, sem aviso especial nem migração — mesmo padrão já
  usado pelas features anteriores.
- Q: Alguns provedores devolvem uma URL de capa "válida" que na prática é
  uma imagem em branco ou genérica — detectar isso agora? → A: Não, fora
  de escopo. Mostra o que o provedor der; fica registrado como melhoria
  futura (já sinalizado no backlog, item 8).
