# Feature Specification: Gravação da carga por seção mais rápida na TV

**Slug**: `085-gravacao-carga-secao-tv`

**Created**: 2026-10-20

**Status**: Convergida

**Input**: assessment `go` `sdd/assessments/gravacao-carga-secao-tv/` (2026-10-19). Na TV, a carga da seção de filmes da
lista real (43 510 itens, 35 categorias) leva 21–33 s. O orçamento de armazenamento da 082, refeito do zero a cada
categoria gravada, custa 10,7–18,0 s (48–61 %), e a área de preparo custa outros 2,7–5,0 s. Evidência:
`sdd/assessments/gravacao-carga-secao-tv/evidencias/etapas-gravacao-tv-2026-10-19.md`. Na entrevista, o usuário pediu
também que o app real devolva seus números ao PC, como a sonda faz.

## Escopo

### Incluído

- **Orçamento barato por categoria** (emendado em 2026-10-20, ver Clarifications): o orçamento continua recalculado do
  zero a cada categoria, como na 082. O que muda é o custo: ele deixa de crescer com o tamanho da área de preparo. Uma
  medição no `sdd-plan` mostrou que é daí que vem o custo. A regra da 082 continua: toda gravação passa pelo orçamento
  antes de gravar.
- **Teto absoluto**: como a conta é refeita a cada gravação, o teto da 082 vale do mesmo jeito, inclusive com gravação
  concorrente. Nenhum mecanismo novo de concorrência entra.
- **Preparo enxuto**: uma seção que cabe com folga na memória da carga não passa pela área de preparo. Uma seção grande
  continua passando (FR-013 da 039), e o preparo é limpo uma vez, no fim, em vez de categoria por categoria.
- **Canal genérico de métricas do app real**: só no build de medição, o app envia números ao coletor local da
  `tizen-sonda`. Nasce com dois emissores: as etapas da carga por seção e o que o painel de desempenho (`PerfOverlay`)
  já mede. O build normal não envia nada.
- **Documentação do caminho**: a skill `tizen-sonda` (as duas cópias) e o README do coletor explicam como medir no app
  real (build de medição + coletor), além da sonda separada.

### Fora de Escopo

- Compressão e formato de gravação da 082 (pedaços de 500, gzip: ~3,3 s).
- Leitura de rede e interpretação (descartadas no assessment `leitura-rede-fluxo-tv`).
- O portão `waitUntilAllowed`, que espera a pessoa navegar de propósito.
- Ordem e prioridade da pré-carga (038).
- Renovação sem mudança (`unchanged`), que já não chama o orçamento.
- Os outros gravadores: carga por categoria, episódios de série, guia e importação M3U. Eles continuam recalculando o
  orçamento a cada gravação.
- Um orçamento em memória mantido por todo o app (abordagem C do assessment).
- Uma conta mantida durante a carga e corrigida pela diferença (abordagem A do assessment). Foi descartada no
  `sdd-plan`: a conta do zero custa ~1,7 ms, contra ~100 ms da contagem do preparo.
- Investigar a variação entre rodadas (22 → 33 s na mesma instalação). Vai para o backlog como `[Medição]`.
- Rodar agora as medições pendentes da 082 (SC-002/003/004/007) e da 084 ("Todos", 1ª tecla da busca). O canal fica
  pronto para elas, mas medir é outro trabalho.
- Qualquer mudança visível na interface (textos, contagens, indicadores de carga).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lista grande carregada em até 10 s (Priority: P1)

A pessoa adiciona, abre ou atualiza uma lista grande na TV. Hoje, a seção de filmes leva 21–33 s para gravar, e nesse
tempo as contagens ficam "carregando", e "Todos" e a busca ficam incompletos. Com o orçamento barato por categoria, a
mesma seção fica pronta em até 10 s.

**Why this priority**: é o tempo que o usuário percebe e a maior etapa medida (48–61 % da carga). Sozinha, ela já
derruba ~11–18 s.

**Independent Test**: na sonda `etapasSecao` na TV, com a lista real reconstruída (43 510 filmes, 35 categorias, banco
novo), o orçamento passa de 10,7–18,0 s para ≤ 1 s no total, e os itens gravados são os mesmos de antes.

**Acceptance Scenarios**:

1. **Given** um banco novo e a seção de filmes da lista real, **When** a carga por seção roda até o fim, **Then** cada
   categoria tem os mesmos itens e a mesma ordem de antes da mudança, e o orçamento soma ≤ 1 s na TV.
2. **Given** um teto simulado menor que a seção, **When** a carga por seção roda, **Then** o catálogo nunca passa do
   teto, e o que não cabe é tratado como na 082 (liberação na ordem do orçamento, ou recusa sem estourar).
3. **Given** uma carga por seção em andamento, **When** a pessoa abre outra categoria, ou o guia grava, no meio dela,
   **Then** a categoria seguinte da carga recalcula o orçamento do zero, como hoje, e o teto continua respeitado.
4. **Given** uma área de preparo com milhares de itens da lista ativa e de outra lista, **When** o orçamento roda,
   **Then** o custo dele não cresce com esses itens, e o preparo de outra lista continua sendo um candidato a liberação,
   com o preparo da lista ativa preservado.

---

### User Story 2 - Preparo só quando precisa (Priority: P2)

A carga de uma seção que cabe com folga na memória deixa de descarregar, reler e limpar a área de preparo. Uma seção
grande continua usando o preparo, mas o limpa de uma vez no fim.

**Why this priority**: são 2,7–5,0 s a mais. Sem isso, a meta de ≤ 10 s fica apertada, mas a P1 já entrega a maior
parte do ganho.

**Independent Test**: com o mesmo cenário da P1, a etapa de preparo (descarregar + reler + limpar) some na seção de
filmes da lista real, e uma seção artificial acima do limite ainda passa pelo preparo, sem segurar a seção inteira na
memória.

**Acceptance Scenarios**:

1. **Given** uma seção abaixo do limite de memória, **When** a carga roda, **Then** nada é gravado na área de preparo, e
   as categorias recebem os mesmos itens.
2. **Given** uma seção acima do limite (por exemplo, 300 mil itens), **When** a carga roda, **Then** a memória da carga
   não segura a seção inteira (FR-013 da 039), e o preparo é limpo uma vez, no fim.
3. **Given** uma carga interrompida (erro de rede, troca de lista, app fechado), **When** a próxima carga começa, **Then**
   não sobra resto de preparo de uma carga anterior.

---

### User Story 3 - App real devolve seus números ao PC (Priority: P2)

Quem mede a TV instala o build de medição do app, usa a lista real normalmente, e o coletor no PC recebe os tempos de
cada etapa da carga por seção e o que o painel de desempenho já mede. Não é preciso anotar números da tela nem escrever
uma sonda à parte.

**Why this priority**: fecha o gate da feature no app real, onde o portão e a navegação pesam, e deixa as medições
pendentes da 082/084 sem código novo.

**Independent Test**: com o coletor da `tizen-sonda` no PC e o build de medição na TV, uma carga da lista chega ao
coletor como linhas com os tempos por etapa e por seção. No build normal, a mesma carga não faz nenhuma requisição ao
coletor.

**Acceptance Scenarios**:

1. **Given** o build de medição e o coletor no ar, **When** uma seção termina de carregar, **Then** o coletor recebe uma
   linha com a seção, a quantidade de itens e de categorias, o tempo de cada etapa, o total e quantas vezes o orçamento
   foi chamado.
2. **Given** o build de medição, **When** o painel de desempenho registra uma medição (quadros > 100 ms, entrada em
   categoria, montagem), **Then** ela também chega ao coletor.
3. **Given** o coletor fora do ar, **When** o app envia, **Then** o app segue igual, sem erro visível, sem travar, sem
   repetir o envio sem fim e sem crescer a memória.
4. **Given** o build normal, **When** qualquer carga ou medição acontece, **Then** nada é enviado.
5. **Given** qualquer envio, **When** o coletor grava a linha, **Then** ela não tem URL, credencial, nome de lista,
   categoria, canal ou título. Só números e rótulos fixos de etapa e seção.

---

### Edge Cases

- **Gravação concorrente**: a conta é refeita do zero a cada gravação, como na 082, então vê o que foi gravado antes
  dela. A janela entre a conta e a transação continua a mesma da 082, sem piorar.
- **Preparo de outra lista**: continua sendo candidato a liberação ("temporário"). Na conta do candidato, só o tamanho
  muda de forma: deixa de ser calculado lendo os itens.
- **Falha ao fazer a conta**: segue o comportamento da 082 ("nunca lança"; a gravação segue e o caminho normal de quota
  decide).
- **Categoria gravada como `unchanged`**: continua sem chamar o orçamento, e não mexe na conta.
- **Seção exatamente no limite de memória do preparo**: o limite é determinístico e testado dos dois lados.
- **Lista apagada ou trocada no meio da carga**: a carga para como hoje e não deixa preparo nem conta para trás.
- **Coletor lento**: o envio nunca atrasa a carga nem a interface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (emendado em 2026-10-20): O custo de uma chamada do orçamento NÃO DEVE crescer com a quantidade de itens
  guardados na área de preparo. Ele lê só chaves e contagens por índice, nunca os itens preparados.
- **FR-002** (emendado em 2026-10-20): O orçamento DEVE continuar recalculando do zero a cada chamada. O total, os
  candidatos e o plano de liberação DEVEM ser os mesmos de antes para o mesmo banco. A única exceção é o tamanho do
  candidato "temporário", que passa a ser estimado sem ler os itens.
- **FR-003** (emendado em 2026-10-20): Nenhum mecanismo de invalidação ou de conta guardada entre chamadas é criado.
  Gravações concorrentes são vistas pela conta seguinte, como na 082.
- **FR-004**: O catálogo + guia NUNCA DEVE passar do teto da 082 por causa desta mudança, inclusive com gravação
  concorrente.
- **FR-005**: A carga por seção DEVE continuar passando pelo orçamento antes de cada gravação (regra da 082). A ordem e
  as regras de liberação (escopo, lista ativa, categoria protegida, favoritos e "Continuar assistindo") ficam iguais, e o
  preparo da lista ativa nunca é liberado.
- **FR-006**: Os outros gravadores (carga por categoria, episódios, guia, importação M3U) DEVEM manter o comportamento
  atual.
- **FR-007**: Uma seção cujo tamanho fica abaixo de um limite fixo DEVE ser gravada sem passar pela área de preparo.
  Acima do limite, DEVE continuar usando o preparo sem segurar a seção inteira na memória (FR-013 da 039).
- **FR-008**: Quando a carga usa o preparo, ela DEVE limpá-lo uma vez, ao terminar ou falhar, e não categoria por
  categoria. Nenhuma carga pode deixar preparo para trás (incluindo interrupção e troca de lista).
- **FR-009**: Para os mesmos dados de entrada, a carga por seção DEVE gravar as mesmas categorias, com os mesmos itens,
  na mesma ordem e com as mesmas contagens de antes da mudança.
- **FR-010**: O app DEVE ter um canal genérico de métricas, ativo só no build de medição, que envia linhas numéricas ao
  coletor local da `tizen-sonda`. No build normal, ele não DEVE existir nem enviar nada.
- **FR-011**: O canal DEVE nascer com dois emissores: (a) as etapas da carga por seção (ler + interpretar, preparo,
  orçamento, preparar + comprimir, transação, total, quantidade de itens e de categorias, chamadas do orçamento),
  por seção; (b) as medições que o painel de desempenho já coleta.
- **FR-012**: As linhas do canal NÃO DEVEM conter URL, credencial, nome de lista, categoria, canal ou título, nem nenhum
  texto vindo do provedor. Só números e rótulos fixos definidos no código (constituição: segredos nunca saem do
  aparelho).
- **FR-013**: O envio NÃO DEVE bloquear nem atrasar a carga ou a interface. Uma falha de envio DEVE ser descartada em
  silêncio, com um limite de memória para o que espera envio.
- **FR-014**: A skill `tizen-sonda` (cópias em `.claude/skills/` e `.agent/skills/`) e o README do coletor DEVEM
  documentar como medir no app real com o build de medição e o coletor.
- **FR-015**: A variação entre rodadas (22 → 33 s) DEVE ser registrada como ideia `[Medição]` em `## Ideias Futuras` do
  backlog, e não investigada nesta feature.

### Key Entities *(include if feature involves data)*

- **Linha de métrica**: um registro só com números e rótulos fixos (origem, seção, etapa, duração, contagens), enviado
  pelo build de medição ao coletor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na TV física, a sonda `etapasSecao` com a lista real (43 510 filmes, 35 categorias, primeira carga) mede a
  carga da seção de filmes em **≤ 10 s** em **todas** as ≥ 2 medições, inclusive a mais lenta. Linha de base: 21,4–32,7 s.
- **SC-002**: Nas mesmas medições, o orçamento soma **≤ 1 s** por carga. Linha de base: 10,7–18,0 s.
- **SC-003**: Com o teto simulado (E2E `orcamento-armazenamento` / `simular-cota-tv.mjs`), o catálogo nunca passa do
  teto, inclusive com uma gravação concorrente no meio de uma carga por seção. Nenhum teste da 082 regride.
- **SC-004**: Os testes de regressão da carga por seção gravam os mesmos itens, ordem e contagens de antes, e uma seção
  acima do limite do preparo não segura a seção inteira na memória (testes da 039).
- **SC-005**: Séries e canais: medidos antes e depois na sonda, na TV. Nenhum dos dois fica mais lento (tolerância da
  variação entre rodadas registrada no plano), e os números vão para a evidência.
- **SC-006**: Na TV física, o build de medição do app real faz ≥ 1 carga da lista real, e os tempos por etapa e por seção
  chegam ao coletor. Os números são registrados como evidência, sem meta: lá, o portão e a navegação influem.
- **SC-007**: No build normal, nenhuma requisição chega ao coletor, e o código do canal não aparece no pacote (verificável
  no build).
- **SC-008**: Nenhuma linha recebida pelo coletor contém texto vindo do provedor (verificado por teste sobre as linhas
  emitidas e pela leitura da evidência coletada na TV).

## Assumptions

- O coletor local da `tizen-sonda` serve também para o app real: aceita linhas de outra origem que não a sonda separada.
- O painel de desempenho (`PerfOverlay`, build de medição) continua existindo e passa a ser também uma fonte do canal.
- Cada instalação na TV (sonda ou build de medição) pede autorização antes, como sempre (memória do usuário). Ao fim, a
  TV volta ao pacote normal, também avisando.
- A meta de ≤ 10 s vale para a sonda (sem portão e sem navegação). No app real, o número é só evidência.
- O limite de memória do preparo é calibrado no plano, com folga para o pico do Worker na TV (80 MiB de cota fixa não
  limitam a memória, só o disco).
- A sonda `etapasSecao` existente (`sonda-tv/memoria/cargaWorker.ts`) é reaproveitada, apontando para o código novo.

## Clarifications

### Sessão 2026-10-20

- Q: Quais gravadores entram no orçamento por carga? → A: Só a carga por seção. Carga por categoria, episódios, guia e
  M3U ficam como estão (FR-006).
- Q: Gravação concorrente no meio da carga? → A: Teto absoluto. Qualquer gravação de fora invalida a conta da carga, e a
  próxima categoria recalcula (FR-003, FR-004).
- Q: Área de preparo? → A: Dispensar quando a seção cabe e, quando o preparo for usado, limpá-lo uma vez no fim (FR-007,
  FR-008).
- Q: Variação entre rodadas (22 → 33 s)? → A: Ideia `[Medição]` separada no backlog (FR-015).
- Q: Que medição na TV fecha a feature? → A: A sonda, e também "uma sonda no app que já retornasse os dados do app
  real": o build de medição envia os números ao coletor (US3, FR-010).
- Q: Séries e canais? → A: Sem regressão, medidos e registrados. A meta de ≤ 10 s é só para filmes (SC-005).
- Q: Como o app real devolve os dados? → A: O build de medição envia ao coletor local da `tizen-sonda`. São só números, e
  o build normal não envia nada (FR-010, FR-012).
- Q: O que a sonda do app real mede? → A: Um canal genérico de métricas, reutilizável pelas medições futuras (FR-010).
- Q: Com quais emissores o canal nasce? → A: A carga por seção e o que o `PerfOverlay` já mede. Rodar as medições
  pendentes da 082/084 fica fora (FR-011).
- Q: Gate final? → A: Sonda ≥ 2× com ≤ 10 s e orçamento ≤ 1 s, mais ≥ 1 carga no app real com os números no coletor, só
  registrada (SC-001, SC-002, SC-006).
- Q: Fica uma regra para medições futuras? → A: Sim. A `tizen-sonda` e o README do coletor documentam o caminho pelo app
  real (FR-014).

### Sessão 2026-10-20 (sdd-plan)

- Q: A medição do `sdd-plan` (`fake-indexeddb`, 35 categorias, ~43 mil itens no preparo) deu `catalogLedger` em 1,7 ms e
  `releaseCandidates` em 100,7 ms com o preparo cheio (0,7 ms com ele vazio). O custo vem de
  `sectionStaging.filter(...).count()`, que lê todos os itens preparados a cada chamada. Como fica a P1? → A: Corrigir a
  contagem do preparo para ler só chaves, sem conta mantida durante a carga. FR-001 a FR-003 emendados, e as entidades
  "Conta da carga" e "Marcador de gravação" saíram.
