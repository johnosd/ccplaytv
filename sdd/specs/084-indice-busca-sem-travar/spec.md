# Feature Specification: Índice de busca sem travar a tela na TV

**Slug**: `084-indice-busca-sem-travar`

**Created**: 2026-10-20

**Status**: Convergência Pendente

**Input**: handoff do assessment `ajustes-cpu-tv` (`sdd/assessments/ajustes-cpu-tv/decision.md`, veredito `go`
em 2026-10-19). Na TV física, montar o índice de busca de um tipo inteiro trava o controle:
- a busca global trava ~2 s ao abrir;
- "Todos" ordenado A–Z congela ~1 s;
- com a pré-carga invalidando o índice a cada lote, a tela fica em 15–17 fps.

Evidência: `sdd/assessments/ajustes-cpu-tv/evidencias/quadros-indice-tv-2026-10-19.md`.

## Escopo

### Incluído

- Montar o índice de busca de um tipo (canais, filmes, séries) sem tarefas longas na tela: a busca global e "Todos"
  (Filmes, Séries, TV ao vivo e guia) continuam respondendo ao controle enquanto o índice é montado.
- Ordenar "Todos" sem travar a tela, **mantendo exatamente a ordem de hoje** em cada opção de ordenação.
- Com a busca ou "Todos" abertos durante a pré-carga, atualizar resultados e cobertura no máximo a cada ~10 s, e não a
  cada lote.
- Parar e descartar a montagem quando a pessoa sai da tela.
- Medição antes e depois na TV: sonda (`quadrosIndice`) e o app real (`PerfOverlay`).

### Fora de Escopo

- Mudar a ordem A–Z ou de qualquer outra ordenação (decisão do usuário, assessment `ajustes-cpu-tv`).
- Trocar mensagens entre Workers e interface por bytes, e decodificar capas com `createImageBitmap` (descartados no
  assessment).
- O formato de gravação da 082 (pedaços comprimidos), a carga por seção e o orçamento de armazenamento. A gravação é
  outro item (assessment `gravacao-carga-secao-tv`).
- Mudar os resultados da busca (o que casa com o termo, a ordem de prefixo primeiro, o mínimo de caracteres) ou a
  regra de cobertura ("Busca em X de Y categorias").
- Guardar o índice pronto no IndexedDB.
- Categorias escondidas e bloqueadas continuam fora do índice, como manda a regra da 066. Esta feature não mexe nisso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir a busca global sem travar o controle (Priority: P1)

A pessoa abre a Busca com uma lista grande. Enquanto o índice é montado, o foco anda, o teclado da TV abre e as teclas
respondem na hora. Os resultados aparecem quando o índice fica pronto, iguais aos de hoje.

**Why this priority**: é a tela que mais trava hoje ao abrir: ~2 s com 15–19 quadros lentos e o pior de 183–250 ms. É
também a entrada mais comum para achar um título.

**Independent Test**: na TV, com a lista real, abrir a Busca e medir os quadros durante a montagem (sonda e
`PerfOverlay`). Basta esta história para entregar valor.

**Acceptance Scenarios**:

1. **Given** uma lista com ~55 mil itens no aparelho, **When** a pessoa abre a Busca, **Then** nenhum quadro passa de
   100 ms enquanto o índice é montado, e o controle move o foco nesse tempo.
2. **Given** a Busca aberta com o índice pronto, **When** a pessoa digita um termo, **Then** os resultados e a ordem são
   idênticos aos de hoje para o mesmo catálogo.
3. **Given** o índice ainda em montagem, **When** a pessoa digita um termo, **Then** a tela mostra o estado de
   carregamento com um elemento focável e os resultados aparecem quando o índice fica pronto, sem perder o que foi
   digitado.
4. **Given** o índice em montagem, **When** a pessoa sai da Busca, **Then** a montagem para e nenhum trabalho dela
   continua com a tela fechada.

---

### User Story 2 - "Todos" ordenado sem congelar (Priority: P1)

A pessoa entra em "Todos" de Filmes ou Séries e escolhe A–Z (ou outra ordenação). A lista aparece na mesma ordem de
hoje, sem a tela congelar.

**Why this priority**: A–Z congela a tela por 0,9–1,2 s, o maior travamento medido.

**Independent Test**: na TV, entrar em "Todos" de Filmes com a lista real, escolher A–Z e medir os quadros. Repetir
com Ano, Adicionados e Nota.

**Acceptance Scenarios**:

1. **Given** "Todos" de Filmes com ~43 mil itens, **When** a pessoa escolhe A–Z, **Then** nenhum quadro passa de
   100 ms e a ordem é idêntica à de hoje (`Intl.Collator('pt-BR', sensitivity base)`, empates na ordem da fonte).
2. **Given** a mesma tela, **When** a pessoa escolhe Ano, Adicionados ou Nota, **Then** nenhum quadro passa de 100 ms e
   a ordem é idêntica à de hoje.
3. **Given** "Todos" ordenado com o foco num item, **When** a ordenação termina ou a lista é atualizada, **Then** o foco
   continua no mesmo item, reconciliado pelo id.

---

### User Story 3 - Telas abertas durante a pré-carga sem cair de quadros (Priority: P2)

Logo depois de abrir ou atualizar uma lista, a pré-carga preenche categorias em segundo plano. Com a Busca ou "Todos"
abertos nesse período, a tela continua fluida, e os resultados e a cobertura ganham as categorias novas aos poucos.

**Why this priority**: o efeito mais grave (15–17 fps por 10 s), mas só nessa janela de tempo.

**Independent Test**: na TV, abrir uma lista com pré-carga em andamento, ficar na Busca e medir fps e quadros lentos
por pelo menos 30 s; conferir que a cobertura sobe.

**Acceptance Scenarios**:

1. **Given** a pré-carga gravando categorias, **When** a Busca está aberta, **Then** o índice é remontado no máximo uma
   vez a cada ~10 s, a tela fica em ≥ 50 fps na média e nenhum quadro passa de 100 ms.
2. **Given** a mesma situação, **When** uma remontagem termina, **Then** "Busca em X de Y categorias" e os resultados
   passam a incluir as categorias recém-gravadas, e o foco continua no mesmo item.
3. **Given** a pré-carga terminou, **When** a pessoa sai e volta à Busca, **Then** o índice inclui todas as categorias
   gravadas, como hoje.

---

### Edge Cases

- **Lista pequena** (centenas de itens): o índice fica pronto praticamente na hora, sem atraso perceptível nem tela de
  carregamento piscando.
- **Lista de ~100 mil itens**: mesma regra de quadros (nenhum > 100 ms); o tempo total pode crescer na proporção.
- **Remontagem pendente quando a pessoa sai**: é descartada, sem trabalho em segundo plano depois da saída.
- **O item focado sai do índice numa remontagem** (categoria escondida ou bloqueada nesse meio-tempo): o foco vai para
  um vizinho válido, nunca para lugar nenhum.
- **Troca de lista** com a Busca aberta: a montagem da lista anterior é descartada; nunca se mistura resultado de duas
  listas.
- **Termo digitado durante uma remontagem**: o termo vale para o índice novo, sem a pessoa digitar de novo.
- **Categoria escondida ou bloqueada pela pessoa com a tela aberta**: continua fora dos resultados (regra da 066),
  mesmo antes da próxima remontagem periódica.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Montar o índice de busca de um tipo DEVE ceder a vez à interface. Nenhuma tarefa da montagem pode
  produzir um quadro acima de 100 ms na TV de referência com a lista real.
- **FR-002**: O índice montado DEVE ser idêntico ao de hoje para o mesmo catálogo: mesmos registros, mesma ordem de
  leitura, mesma cobertura, e as categorias escondidas e bloqueadas de fora.
- **FR-003**: A busca global (três tipos) DEVE seguir FR-001 e FR-002, com os resultados de cada termo idênticos aos de
  hoje.
- **FR-004**: "Todos" (Filmes, Séries, TV ao vivo e guia) DEVE seguir FR-001 e FR-002 no índice que usa.
- **FR-005**: Ordenar "Todos" em qualquer opção (A–Z, Ano, Adicionados, Nota) DEVE produzir exatamente a ordem de hoje,
  sem quadro acima de 100 ms na TV. Uma ordenação que já cumpre isso fica como está.
- **FR-006**: Com a Busca ou "Todos" abertos, uma invalidação do índice por lote da pré-carga NÃO DEVE remontá-lo na
  hora. A remontagem acontece no máximo uma vez a cada ~10 s enquanto houver categorias novas, e sempre na próxima
  entrada na tela.
- **FR-007**: Esconder ou bloquear uma categoria com a tela aberta DEVE tirá-la dos resultados sem esperar a remontagem
  periódica (FR-006 não atrasa a regra da 066).
- **FR-008**: Sair da tela, ou trocar de lista, DEVE parar e descartar a montagem em andamento ou pendente.
- **FR-009**: Durante a montagem, a tela DEVE manter pelo menos um elemento focável e o estado de carregamento atual; o
  termo digitado nesse tempo é aplicado ao índice quando ele fica pronto.
- **FR-010**: Ao chegar um índice remontado ou uma nova ordenação, o foco DEVE continuar no mesmo item, reconciliado
  pelo id. Se o item saiu, o foco vai para um vizinho válido.
- **FR-011**: O tempo até o índice ficar pronto PODE crescer até ~50 % em relação a hoje na TV (busca global ≤ ~3,2 s
  com a lista real; linha de base 2,1–2,3 s).

### Key Entities

- **Índice de busca de um tipo**: o conjunto de registros compactos de canais, filmes ou séries da lista ativa, sem
  categorias escondidas ou bloqueadas, mais a cobertura (categorias com conteúdo / total). Derivado do catálogo
  gravado, nunca guardado.
- **Remontagem**: um novo cálculo do índice porque categorias novas foram gravadas. Esta feature limita quando ela
  acontece com a tela aberta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Linha de base: 4 medições na TV em 2026-10-19 (`sdd/assessments/ajustes-cpu-tv/evidencias/`).

- **SC-001**: na TV de referência, com a lista real, abrir a busca global não produz nenhum quadro acima de 100 ms
  durante a montagem, em ≥ 2 medições da sonda `quadrosIndice`. Hoje: pior de 183–250 ms, 15–19 quadros > 50 ms.
- **SC-002**: "Todos" de Filmes ordenado A–Z não produz nenhum quadro acima de 100 ms (hoje: 933–1 233 ms). Ano,
  Adicionados e Nota também não.
- **SC-003**: com remontagens disparadas pela pré-carga por 30 s com a Busca aberta, a média fica em ≥ 50 fps e nenhum
  quadro passa de 100 ms. Hoje: 15–17 fps com remontagem contínua.
- **SC-004**: resultados de busca (para um conjunto fixo de termos) e ordens de "Todos" (todas as opções) idênticos aos
  de hoje, por testes de regressão.
- **SC-005**: no app real na TV (pacote de medição, `PerfOverlay`), a pessoa abre a Busca e "Todos" A–Z com a lista
  real e lê `quadros>100ms = 0` nessas entradas, com o tempo até pronto dentro do FR-011.
- **SC-006**: a busca global fica pronta em ≤ ~3,2 s na TV com a lista real (até ~50 % acima da linha de base de
  2,1–2,3 s).

## Assumptions

- A TV de referência (QN50Q60DAGXZD, Tizen 9 / Chromium 120) e a lista real do `.env` (~55 mil itens) são o alvo da
  medição. Listas de até ~100 mil seguem a mesma regra de quadros (FR-001), sem meta própria de tempo.
- A sonda roda sem React; o app real só pode ser igual ou pior. Por isso o aceite inclui o `PerfOverlay` (SC-005).
- As ordenações Ano, Adicionados e Nota não foram medidas. O usuário não soube dizer se travam (2026-10-20). Elas entram
  no critério (FR-005/SC-002) e só mudam se a medição mostrar travamento.
- A TV de referência não tem `scheduler.yield`, mas tem `scheduler.postTask` e `requestIdleCallback` (sonda 2 da 082).
  Detalhe para o `sdd-plan`.
- "~10 s" no FR-006 é a ordem de grandeza combinada; o `sdd-plan` pode fixar o valor exato.

## Clarifications

### Sessão 2026-10-19 (assessment `ajustes-cpu-tv`)

- Q: Algum caso de lentidão percebida na Busca ou em "Todos" A–Z? → A: Não reparado; o problema foi provado só por
  medição.
- Q: Rumo, se travar? → A: Montar em fatias e não remontar à toa (sem Worker, sem índice guardado).
- Q: Trocar a ordenação por chave pronta (muda 126 pares em 11 mil)? → A: Não; a ordem de hoje fica.
- Q: Worker para mensagens e capas? → A: Saem do escopo.

### Sessão 2026-10-20

- Q: Com a tela aberta durante a pré-carga, como atualizar resultados e cobertura? → A: No máximo a cada ~10 s, sem
  travar (FR-006, US3).
- Q: Quanto o tempo total pode aumentar? → A: Até ~50 % a mais (FR-011, SC-006).
- Q: "Todos" da TV ao vivo e do guia entram? → A: Pelo mesmo caminho, sem meta própria (FR-004).
- Q: O aceite inclui o `PerfOverlay` no app real? → A: Sim, sonda + app real (SC-005).
- Q: As ordenações Ano, Adicionados e Nota entram? → A: "Não sei". Adotado: entram no critério de não travar e só
  mudam se a medição mostrar travamento (FR-005, Assumptions).
- Q: Ao sair da tela com a montagem em andamento? → A: Para e descarta (FR-008).
