# Feature Specification: Catálogo em blocos por categoria — leitura e gravação instantâneas

**Slug**: `039-catalogo-em-blocos`

**Created**: 2026-09-30

**Status**: Em Execução

**Input**: Entrega 2 da estratégia `sdd/specs/038-carga-listas-pre-carga/research.md`
R0-3, pedida pelo dono do produto: "guardar cada categoria como um bloco, o que
deixa gravar ~25× mais rápido e é o que tornaria filmes e séries instantâneos na
TV mesmo em listas enormes".

## Contexto

A feature 038 fez a pré-carga pedir cada seção inteira ao painel (3 pedidos em
vez de 99) e ler em fluxo numa thread separada. Com isso o gargalo que sobra é
**como o catálogo é guardado no aparelho**: hoje cada filme, série ou canal é uma
linha própria, com vários índices, e toda tela que lista itens lê essas linhas
uma a uma. Medido no navegador do PC com a CPU 4× mais lenta (perto da TV), numa
categoria de 11.130 filmes:

| Forma de guardar | Gravar | Ler |
| --- | --- | --- |
| Uma linha por item (hoje) | 6,7 s | 0,6–0,9 s |
| Um bloco por categoria | 0,25–0,33 s | 0,12–0,19 s |

Na TV, que é mais lenta que o PC, a diferença é o que separa "instantâneo" de
"espera". Esta feature muda a forma de guardar o catálogo para **um bloco por
categoria**, sem mudar nada do que a pessoa vê — só a velocidade.

## Escopo

### Incluído

- Canais, filmes e séries de **listas Xtream e M3U** (URL avulsa, painel
  confirmado e Modo limitado) passam a ser guardados em um bloco por categoria.
- **Todas as telas que listam itens do catálogo** leem dos blocos: categorias de
  TV ao vivo, Filmes e Séries; "Todos"; busca da seção e busca global;
  ★ Favoritos; ↺ Histórico; fileiras do Início ("Continuar assistindo", "Minha
  Lista", "Canais favoritos") e o destaque; Semelhantes/filmografia (cruzamento
  com o catálogo); abrir o detalhe de um filme/série e tocar um canal/filme.
- **Conversão automática** das listas já guardadas no formato atual, em segundo
  plano, na primeira abertura depois da atualização do app, sem perder
  favoritos, progresso, "assistido" nem histórico.
- Aguentar listas de **até ~300 mil itens** sem a TV fechar o app por falta de
  memória.

### Fora de Escopo

- **Episódios de série**: continuam como estão (vêm sob demanda, ao abrir a série).
- Qualquer mudança visual ou de navegação — telas, textos, foco e ordem ficam
  iguais.
- Mudar a forma de pedir ao painel (já resolvida na 038: seção inteira).
- EPG, metadata TMDB, trailers e estado do usuário (favoritos, progresso,
  histórico) — continuam como estão; só passam a achar os itens nos blocos.
- Atualizar várias listas de uma vez, ou pré-carregar listas que não são a ativa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir qualquer categoria na hora (Priority: P1)

A pessoa entra numa categoria de filmes, séries ou canais já carregada — inclusive
a maior da lista — e a grade/lista aparece na hora.

**Why this priority**: é a dor original da 038 ("sensação de entrar de modo
instantâneo") no caso em que ela ainda falha: categorias enormes na TV.

**Independent Test**: na TV de referência, com a lista real carregada, entrar em
10 categorias das três seções (incluindo a de 11 mil filmes) e medir tecla OK →
itens visíveis.

**Acceptance Scenarios**:

1. **Given** uma categoria já no aparelho com 11 mil filmes, **When** a pessoa
   entra nela, **Then** a grade aparece em ≤ 300 ms, sem indicador de carregando.
2. **Given** uma categoria de canais já no aparelho, **When** a pessoa entra,
   **Then** a lista aparece em ≤ 300 ms.
3. **Given** a pessoa navega na grade e volta de um detalhe, **When** a grade
   reaparece, **Then** o foco e a rolagem voltam ao mesmo item (por identidade),
   como hoje.

---

### User Story 2 - Catálogo inteiro pronto rápido (Priority: P1)

Depois de abrir (ou ressincronizar) a lista, o catálogo inteiro fica no aparelho
em menos de um minuto na TV, sem travar a navegação.

**Why this priority**: gravar item por item é o que ainda torna a pré-carga lenta
na TV; é o outro lado da mesma dor.

**Independent Test**: ressincronizar a lista real na TV, ficar parado no Início e
cronometrar até "Catálogo atualizado"; repetir navegando.

**Acceptance Scenarios**:

1. **Given** a lista de referência (~43 mil itens), **When** a pessoa abre a lista
   e fica parada, **Then** todas as categorias estão prontas em ≤ 60 s na TV.
2. **Given** a pré-carga em andamento, **When** a pessoa navega ou assiste,
   **Then** as regras da 038 continuam valendo (nada é gravado com tecla recente
   ou player aberto) e a navegação não degrada.

---

### User Story 3 - "Todos", busca e as demais listas também rápidas (Priority: P2)

"Todos", a busca, ★ Favoritos, ↺ Histórico, as fileiras do Início e o cruzamento
de Semelhantes leem os blocos e ficam tão rápidos quanto as categorias.

**Why this priority**: sem isso, as telas que agregam várias categorias
continuariam lentas em listas grandes.

**Independent Test**: com a lista real pronta, abrir "Todos" de Filmes, buscar um
termo, abrir ★ Favoritos e ↺ Histórico e voltar ao Início, medindo cada um.

**Acceptance Scenarios**:

1. **Given** o catálogo pronto, **When** a pessoa abre "Todos" de Filmes (31 mil
   itens), **Then** a grade aparece em ≤ 1 s na TV.
2. **Given** favoritos e histórico gravados antes desta feature, **When** a pessoa
   abre ★ Favoritos e ↺ Histórico, **Then** os mesmos itens aparecem, na mesma
   ordem.
3. **Given** um título com Semelhantes, **When** a pessoa abre a aba, **Then** os
   que estão na lista continuam marcados "✓ Na sua lista", como hoje.

---

### User Story 4 - Atualizar o app sem perder nada (Priority: P1)

Quem já tem listas no aparelho atualiza o app e continua usando normalmente: a
conversão acontece por trás e nada do que a pessoa guardou se perde.

**Why this priority**: sem isso, a atualização quebraria ou esvaziaria listas já
carregadas — inaceitável para quem já usa o app.

**Independent Test**: instalar a versão anterior, carregar a lista, favoritar,
assistir parte de um filme, marcar um episódio; instalar esta versão e abrir.

**Acceptance Scenarios**:

1. **Given** uma lista carregada na versão anterior, **When** a pessoa abre o app
   atualizado, **Then** a lista abre e navega normalmente enquanto a conversão
   acontece em segundo plano.
2. **Given** favoritos, progresso, "assistido" e histórico gravados antes, **When**
   a conversão termina, **Then** todos continuam valendo nos mesmos itens.
3. **Given** a conversão em andamento, **When** a pessoa entra numa categoria
   ainda não convertida, **Then** os itens aparecem (do formato antigo ou
   buscados), nunca uma lista vazia.
4. **Given** o app é fechado no meio da conversão, **When** reabre, **Then** a
   conversão continua de onde parou, sem duplicar nem perder itens.

---

### User Story 5 - Lista enorme sem o app fechar (Priority: P2)

Uma lista de ~300 mil itens carrega (mais devagar), mas o app nunca é fechado
pela TV por falta de memória.

**Why this priority**: players web para TV já foram derrubados pelo sistema ao
manter catálogos grandes na memória (caso webOS pesquisado na 038).

**Independent Test**: carregar uma lista de teste com ~300 mil itens na TV,
navegar pelas seções durante e depois da carga.

**Acceptance Scenarios**:

1. **Given** uma lista de ~300 mil itens, **When** a pré-carga roda do começo ao
   fim, **Then** o app não é fechado e a navegação continua respondendo.
2. **Given** essa lista pronta, **When** a pessoa abre "Todos" ou busca, **Then**
   a tela responde (pode levar mais que 1 s, nunca trava nem fecha).

### Edge Cases

- **Categoria que muda de tamanho numa atualização** (itens entram e saem): o bloco
  novo substitui o antigo inteiro; foco reconciliado por identidade.
- **Item que aparece em duas categorias** (painel mal formado): continua
  aparecendo nas duas, como hoje.
- **Armazenamento cheio** no meio da gravação de um bloco: a categoria fica com o
  bloco anterior (nunca meio bloco); a pré-carga para como na 038.
- **Favorito/histórico de um item que saiu da lista**: continua "não encontrado",
  como hoje — nunca atribuído a outro item.
- **Detalhe aberto de um item cujo bloco foi renovado**: o detalhe continua
  mostrando o mesmo item (identidade estável).
- **Conversão interrompida por armazenamento cheio**: o formato antigo continua
  servindo o que já estava lá.
- **Relógio do aparelho errado**: não afeta a conversão nem a leitura.

## Requirements *(mandatory)*

### Functional Requirements

**Armazenamento**

- **FR-001**: Os itens de cada categoria de canais, filmes e séries (Xtream e M3U)
  DEVEM ser guardados como um bloco por categoria, lido e gravado de uma vez.
- **FR-002**: Gravar ou renovar uma categoria DEVE substituir o bloco inteiro de
  uma vez — nunca deixar uma categoria com parte dos itens novos e parte dos
  antigos.
- **FR-003**: Cada item DEVE ter uma identidade estável (independente de posição,
  de URL e de renovação), usada por detalhe, player, foco, favoritos, histórico
  e retomada.
- **FR-004**: Os episódios de série NÃO DEVEM mudar de formato nesta feature.

**Leitura**

- **FR-005**: Abrir uma categoria já no aparelho DEVE ler apenas o bloco dela.
- **FR-006**: "Todos", busca da seção, busca global, ★ Favoritos, ↺ Histórico,
  fileiras e destaque do Início, cruzamento de Semelhantes/filmografia, número
  do canal, detalhe e reprodução DEVEM encontrar os itens nos blocos, com o
  mesmo resultado visível de hoje.
- **FR-007**: Nenhuma tela DEVE mudar de aparência, texto, ordem ou navegação por
  causa desta feature.

**Conversão**

- **FR-008**: Na primeira abertura depois da atualização, listas guardadas no
  formato antigo DEVEM ser convertidas em segundo plano, com as mesmas pausas da
  pré-carga (tecla recente, player aberto, app oculto).
- **FR-009**: Durante a conversão, toda categoria DEVE continuar abrindo com
  itens (do formato antigo, do bloco novo ou buscados), nunca vazia por causa da
  conversão.
- **FR-010**: A conversão DEVE ser retomável: fechar o app no meio não duplica
  nem perde itens.
- **FR-011**: Favoritos, progresso, "assistido" e histórico DEVEM continuar
  valendo nos mesmos itens depois da conversão (continuam por identidade
  estável — fonte + tipo + id estável).
- **FR-012**: Terminada a conversão de uma lista, o formato antigo dela DEVE ser
  apagado do aparelho, em partes, sem travar a navegação.

**Memória e desempenho**

- **FR-013**: Nenhuma operação DEVE manter o catálogo inteiro de uma lista de
  ~300 mil itens na memória ao mesmo tempo.
- **FR-014**: As regras da 038 (pré-carga por seção, portão de atividade, uma
  seção/categoria por vez, renovação sem esfriar) DEVEM continuar valendo.

### Key Entities

- **Bloco de categoria**: os itens de uma categoria de uma lista, na ordem da
  fonte, com o instante da obtenção e a contagem. Substituído inteiro a cada
  obtenção.
- **Item do catálogo**: canal, filme ou série dentro de um bloco, com identidade
  estável (fonte + tipo + id do provedor ou nome, no M3U).
- **Estado de conversão da lista**: quais categorias já estão em blocos e quais
  ainda no formato antigo — para retomar e para saber quando apagar o antigo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Abrir qualquer categoria já no aparelho — inclusive a de 11 mil
  filmes — leva ≤ 300 ms (OK → itens visíveis) na TV de referência.
- **SC-002**: Com a lista de referência (~43 mil itens), o catálogo inteiro fica
  pronto em ≤ 60 s na TV depois de abrir/ressincronizar, com a pessoa parada.
- **SC-003**: "Todos" de Filmes (31 mil itens) aparece em ≤ 1 s na TV.
- **SC-004**: Uma lista de ~300 mil itens carrega e navega sem o app ser fechado
  pela TV.
- **SC-005**: Depois da conversão, 100 % dos favoritos, progressos, "assistido" e
  entradas de histórico que resolviam antes continuam resolvendo nos mesmos
  itens.
- **SC-006**: Nenhuma diferença visual nas telas (comparação de capturas antes ×
  depois nas telas principais).
- **SC-007**: **Gate obrigatório na TV física** (exceção "Validação em hardware
  real" da constitution): SC-001 a SC-005 só contam medidos no aparelho.

## Assumptions

- A 038 (pré-carga por seção) está no código e é a base desta feature.
- O painel de referência continua aceitando pedir a seção inteira.
- A identidade estável dos itens já usada por favoritos/progresso/histórico
  (fonte + tipo + id estável) continua sendo a chave desses dados.
- Medições de referência do PC (CPU 4×) estão em
  `sdd/specs/038-carga-listas-pre-carga/research.md` R0-3.
- Uma lista de teste de ~300 mil itens pode ser gerada (painel falso) para SC-004.

## Clarifications

### Sessão 2026-09-30

- Q: Onde a velocidade precisa aparecer? → A: Em tudo que lista itens do catálogo (categorias, "Todos", buscas, ★ Favoritos, ↺ Histórico, Início, Semelhantes, detalhe e reprodução) — FR-006.
- Q: Meta para abrir uma categoria pronta na TV? → A: ≤ 300 ms em qualquer categoria, inclusive a de 11 mil filmes — SC-001.
- Q: Meta para o catálogo inteiro ficar pronto na TV? → A: ≤ 60 s (lista de referência, ~43 mil itens) — SC-002.
- Q: Maior lista a aguentar sem o app fechar? → A: ~300 mil itens — FR-013, SC-004.
- Q: Listas já guardadas no formato atual? → A: Converte sozinho, em segundo plano, sem perder nada — FR-008 a FR-012.
- Q: M3U entra? → A: Sim, mesmo formato — FR-001.
- Q: Episódios de série? → A: Ficam como estão — FR-004.
- Q: Gate na TV física? → A: Obrigatório — SC-007.
