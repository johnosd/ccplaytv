# Feature Specification: Home, Filmes e Séries já montadas ao entrar

**Slug**: `079-home-carregamento-progressivo`

**Created**: 2026-10-16

**Status**: Em Execução

**Input**: Handoff aprovado em `sdd/assessments/home-carregamento-progressivo-ordem-visual-das/decision.md`; escopo ampliado e modelo decidido na entrevista de 2026-10-16 (ver Clarifications).

## Escopo

Ao entrar na **Home**, em **Filmes** ou em **Séries**, a pessoa deve ver as fileiras resolvidas rapidamente, na ordem certa, enquanto as demais continuam chegando em segundo plano; as capas chegam dentro dos cards, que já estão no lugar (padrão dos apps de streaming). A tela segura um estado "Carregando" focável só durante a janela curta inicial, com teto de 2 s para evitar espera infinita.

**Onde está a dor**: na primeira abertura do app (abertura fria). Voltar a uma tela com dados já no aparelho já deve ser imediato.

**Situação no código (conferida em 2026-10-16)**:

- **Home**: não espera nada. Cada fileira aparece quando sua consulta termina; uma fileira superior que chega depois é inserida acima e empurra o que já estava na tela. Enquanto o hero carrega, o billboard mostra boas-vindas e atalhos e depois troca para o título. "Adicionados" só são pedidos 600 ms depois da montagem (feature 060, D-013).
- **Filmes/Séries** (`VodShowcaseScreen`): já seguram "Carregando" com Voltar e revelam de uma vez (ad-hoc 2026-10-09), com teto de 3 s. Lacunas: "Bem avaliados" não entra na espera; as capas não entram na espera; depois do teto, uma fileira atrasada (ex.: Top 10) ainda pode surgir acima das outras.

### Incluído

- Um mesmo modelo de montagem nas três telas: revelar as fileiras prontas após a janela curta e inserir as demais quando resolverem.
- Teto fixo de 2 s (Filmes/Séries descem de 3 s para 2 s).
- "Carregando" focável com Voltar, com a topbar visível, mostrado só se a espera passar de ~300 ms.
- As capas dos cards visíveis só seguram a tela por ~300 ms; depois chegam dentro dos cards (emenda de 2026-10-16).
- Fileira que chega depois do teto entra na visita atual, na posição canônica; a reacomodação das fileiras abaixo é permitida para não esconder conteúdo.
- Ordem das fileiras de cada tela preservada como está hoje.
- Fileiras sem dados — vazias ou com falha — não aparecem.
- Medição na TV de referência para registrar quanto tempo a montagem leva (confirmação, não definição do teto).

### Fora de Escopo

- Novas fileiras, recomendações, conteúdo editorial ou mudança da ordem de qualquer tela.
- TV ao vivo, Rádio, grade de categoria (`VodCategoryScreen`) e telas de detalhe.
- Guardar a última montagem para abrir instantaneamente (decidido contra na entrevista).
- Esperar imagens fora da primeira tela ou o fundo (backdrop) do billboard/hero.
- Carga eager do catálogo inteiro; backend novo; mudança de favoritos, histórico e progresso.
- Aviso visível por fileira com falha.
- Otimizar consultas para caberem no teto (se a medição mostrar que não cabem, vira outra decisão).

## Ordem das fileiras (inalterada)

- **Home**: Canais favoritos → Continuar assistindo → Minha Lista → Filmes adicionados → Séries adicionadas.
- **Filmes/Séries**: a ordem atual de `buildShowcaseRows` — Continuar → Top 10 → Favoritos → Adicionados → Bem avaliados → Dica → "Porque você assistiu" → categorias.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar e ver a tela pronta (Priority: P1) 🎯

Como pessoa que acabou de abrir o app, quero que a Home, Filmes e Séries apareçam já montadas, para não ver fileiras surgindo, trocando ou pulando.

**Why this priority**: É o resultado pedido.

**Independent Test**: abertura fria com dados em todas as fileiras e consultas terminando em ordem invertida; entrar em cada tela e observar.

**Acceptance Scenarios**:

1. **Given** abertura fria e todas as leituras terminando em até 2 s, **When** a pessoa entra na tela, **Then** a tela aparece de uma vez, com todas as fileiras com dados na ordem da tela; as capas que carregarem em ~300 ms já vêm desenhadas e as demais chegam dentro dos cards.
2. **Given** consultas terminando em ordem invertida (de baixo para cima), **When** a tela é revelada, **Then** a ordem é a da tela e nada foi desenhado antes da revelação.
3. **Given** uma fileira vazia ou com falha, **When** a tela é revelada, **Then** ela não ocupa espaço, título, aviso ou posição navegável.
4. **Given** a Home com hero de continuar/favorito, **When** a tela é revelada, **Then** o billboard já mostra o título e as ações dele, nunca boas-vindas antes.

### User Story 2 - Esperar sem ficar preso (Priority: P1)

Como pessoa usando o controle remoto, quero que a espera seja curta, focável e que eu possa sair dela.

**Why this priority**: Estados de carregamento não podem prender o controle (constitution).

**Independent Test**: abrir a tela com uma consulta lenta e pressionar setas, SELECT e RETURN durante a espera.

**Acceptance Scenarios**:

1. **Given** a montagem demora mais que ~300 ms, **When** a espera continua, **Then** a tela mostra "Carregando" com Voltar focado, com a topbar visível.
2. **Given** a montagem termina em menos de ~300 ms, **When** a pessoa entra, **Then** o "Carregando" não aparece (sem piscar).
3. **Given** a espera, **When** a pessoa pressiona SELECT em Voltar ou RETURN, **Then** volta, sem depender da consulta mais lenta; nenhuma reprodução ou navegação não pedida acontece.
4. **Given** a espera, **When** a pessoa sobe para a topbar, **Then** pode navegar normalmente para outra tela.
5. **Given** a revelação acontece, **When** a pessoa não pressionou nenhuma tecla, **Then** o foco vai para o lugar inicial da tela (hoje: a ação primária do billboard na Home; o primeiro card na vitrine); se a pessoa já foi para a topbar, o foco fica lá.

### User Story 3 - Teto de 2 s e o que chega depois (Priority: P1)

Como pessoa que já está olhando a tela, quero que o que chegar atrasado nunca empurre o que já estou vendo.

**Why this priority**: Uma consulta lenta (ex.: TMDB) não pode nem prender a tela nem reorganizá-la depois.

**Independent Test**: deixar uma consulta acima e outra abaixo passarem dos 2 s; observar a revelação e a chegada de cada uma; sair e voltar à tela.

**Acceptance Scenarios**:

1. **Given** uma consulta passa dos 2 s, **When** o teto vence, **Then** a tela é revelada com o que está pronto.
2. **Given** a tela revelada, **When** chega uma fileira cuja posição fica abaixo de todas as já mostradas, **Then** ela entra ao fim, sem mover nada.
3. **Given** a tela revelada, **When** chega uma fileira cuja posição fica acima de alguma já mostrada (ex.: Top 10 em Filmes, Canais favoritos na Home), **Then** ela não aparece nesta visita e aparece na próxima entrada na tela.
4. **Given** capas de cards visíveis que não chegaram em ~300 ms, **When** a tela é revelada, **Then** os cards ficam no lugar com o fallback atual de capa e a imagem entra quando chegar, sem mover nada.
5. **Given** a pessoa fecha o player ou alterna um favorito, **When** as leituras são refeitas, **Then** a mudança aparece na hora (é consequência da ação dela), com o foco reconciliado por identidade estável.

### User Story 4 - Confirmar na TV (Priority: P2)

Como responsável pelo produto, quero ver na TV de referência que a montagem funciona e quanto ela leva.

**Why this priority**: O teto está decidido (2 s); a medição só confirma e registra.

**Independent Test**: roteiro de abertura fria nas três telas na TV física, com instrumentação ligada.

**Acceptance Scenarios**:

1. **Given** abertura fria, **When** o roteiro roda na TV, **Then** registra, por tela, tempo até revelar, se revelou por completo ou pelo teto, quais fileiras ficaram para depois e quantas capas visíveis chegaram dentro do teto.
2. **Given** o registro, **When** o usuário avalia visualmente na TV, **Then** a aprovação dele é o aceite da feature; os números são registro, não critério de aprovação.

### Edge Cases

- Lista sem histórico, favoritos ou adicionados: Home revela com o billboard de boas-vindas e atalhos (boas-vindas real), sem fileiras vazias.
- Hero da Home com falha ou passando do teto: revela com os atalhos TV ao vivo/Filmes e título neutro, sem afirmar que não há favoritos.
- TMDB lento ou sem internet: Top 10/Dica/"Porque você assistiu" passam do teto; a tela revela com o local; Top 10 fica para a próxima visita; Dica e "Porque você assistiu" entram se ficarem abaixo de tudo que está na tela.
- Capa que falha: fallback atual do card, sem esperar mais.
- Voltar a uma tela com dados no aparelho: revela imediatamente, sem "Carregando".
- Trocar de aba na topbar durante a espera: a espera da tela abandonada é cancelada sem efeito colateral.
- Lista sem categorias em Filmes/Séries: comportamento atual de lista vazia/erro, com Voltar focável.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Home, Filmes e Séries DEVEM usar o mesmo modelo: após a janela curta, cada fileira resolvida é desenhada na posição canônica e as demais entram quando resolverem.
- **FR-002**: "Pronta" DEVE significar: todas as leituras das fileiras da tela resolvidas (com dados, vazias ou com falha), o hero/billboard resolvido (Home) e as capas dos cards visíveis na primeira tela carregadas ou com falha — mas as capas só seguram a tela por uma janela curta (~300 ms, a mesma do "Carregando"); passada ela, a tela aparece com os cards no lugar e cada capa chega dentro do seu card, sem mover nada (emenda de 2026-10-16, padrão dos apps de streaming).
- **FR-003**: O teto DEVE ser 2 s nas três telas.
- **FR-004**: A espera DEVE mostrar a topbar e um "Carregando" com Voltar focável, mas só se passar de ~300 ms; abaixo disso, nada pisca.
- **FR-005**: Durante a espera, Voltar/RETURN DEVEM voltar sem depender de consulta pendente, e a topbar DEVE continuar navegável.
- **FR-006**: Na revelação, o foco DEVE ir para o lugar inicial da tela somente se a pessoa não tiver saído do "Carregando"; se estiver na topbar, fica lá.
- **FR-007**: Uma fileira que chega depois da revelação, inclusive depois do teto de 2 s, DEVE entrar na visita atual em sua posição canônica; as fileiras abaixo podem ser reacomodadas. Ela NÃO DEVE ficar escondida até a próxima entrada na tela.
- **FR-008**: Depois da revelação, capas que chegam DEVEM preencher o card no lugar, sem mover nada.
- **FR-009**: Leituras refeitas por ação da pessoa (fechar o player, alternar favorito) DEVEM ser aplicadas na hora, com foco reconciliado por identidade estável.
- **FR-010**: Fileira vazia ou com falha NÃO DEVE ocupar espaço, título, aviso ou destino de foco.
- **FR-011**: O billboard da Home NÃO DEVE mostrar boas-vindas, atalhos ou ações antes de o hero resolver; boas-vindas só quando o hero resolve como boas-vindas; falha ou teto → atalhos com título neutro.
- **FR-012**: A ordem das fileiras de cada tela DEVE permanecer a atual.
- **FR-013**: Voltar a uma tela com as leituras principais já em cache (Home: o hero; Filmes/Séries: categorias, Continuar, Favoritos e Adicionados) DEVE revelá-la no primeiro quadro, sem "Carregando" e sem esperar capas.
- **FR-014**: A instrumentação DEVE registrar, por tela e só com números/estados, tempo até revelar, motivo (pronta/teto), fileiras adiadas e capas visíveis dentro do teto.
- **FR-015**: A validação DEVE distinguir browser/E2E, emulador e TV física; nenhum ambiente substitui a evidência de outro.
- **FR-016**: A feature DEVE preservar restauração de foco por identidade, SELECT, RETURN e dados locais existentes.

### Key Entities

- **ScreenAssembly**: estado de montagem de uma tela — fase (`waiting`/`revealed`), situação de cada fileira e do hero (`pending`/`ready`/`empty`/`failed`/`deferred`), capas visíveis pendentes, se a pessoa saiu do "Carregando".
- **AssemblyMeasurement**: registro por abertura — tela, tipo (fria/quente), dispositivo, firmware, versão, tempo até revelar, motivo, fileiras adiadas, capas dentro do teto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários automatizados de chegada fora de ordem, nas três telas, toda fileira resolvida aparece na visita atual e a ordem final permanece a ordem canônica da tela.
- **SC-002**: Em 100% dos cenários automatizados, a revelação acontece em até 2 s (+ tolerância de teste) desde a entrada.
- **SC-003**: Em 100% dos cenários com montagem abaixo de ~300 ms, o "Carregando" não é desenhado.
- **SC-004**: Em 100% dos estados de espera, vazio e erro, existe controle focável e RETURN funciona.
- **SC-005**: Na Home, zero trocas de billboard (boas-vindas → título) depois da revelação.
- **SC-006**: Na TV de referência, o roteiro de abertura fria das três telas é executado e registrado, e o usuário aprova visualmente.
- **SC-007**: Browser, E2E, emulador e TV física aparecem como evidências separadas; ambiente ausente não é aprovado por inferência.

## Assumptions

- **Abertura fria** = app fechado e relançado, entrando na lista; **quente** = voltar à tela na mesma sessão.
- **Entrada na tela** = cada montagem da tela; fechar o player sobre ela não é nova entrada.
- **Cards visíveis** = os que cabem na primeira tela (1920×1080) na posição inicial do foco.
- "Carregando" reaproveita o estado de carregamento que Filmes/Séries já usam (`EmptyState` com Voltar).
- O adiamento de "adicionados" na Home (D-013 da 060) deixa de fazer sentido se a tela já espera tudo; o plano decide se mantém, dentro do teto.
- Não haverá conteúdo fictício, percentual, skeleton nem metadado inventado durante a espera.

## Clarifications

### Sessão 2026-10-16

- Q: Qual deve ser a prioridade visual? → A: De cima para baixo, preservando a ordem da Home.
- Q: Fileiras sem dados reservam espaço? → A: Não; somente fileiras com dados ocupam espaço.

### Entrevista 2026-10-16 (substitui as decisões assumidas na revisão anterior)

- Q: Escopo? → A: Home + Filmes + Séries na 079.
- Q: O que é "já ver tudo montado"? → A: Esperar e revelar de uma vez (recomendado e aprovado), o mesmo modelo que Filmes/Séries já usam.
- Q: Quanto esperar? → A: Teto fixo de 2 s; a medição na TV só confirma.
- Q: Quando a dor aparece? → A: Na primeira abertura do app.
- Q: O que acontece com uma fileira que passa do teto? → A: Se cair abaixo de tudo na tela, entra; se cair acima, só na próxima visita.
- Q: "Montado" inclui imagens? → A: Sim, as capas dos cards visíveis, dentro dos 2 s; fundo do billboard não.
- Q: Como é a espera? → A: Topbar + "Carregando" com Voltar.
- Q: O "Carregando" pisca em cargas rápidas? → A: Não; só aparece se passar de ~300 ms.
- Q: Top 10/Dica (TMDB) lentos? → A: Respeitar os 2 s e deixá-los para depois.
- Q: Critério de aprovação na TV? → A: Avaliação visual do usuário; números são registro.

### Plano 2026-10-16 (ajustes impostos pelo código, revisáveis)

- Caminho do cache: os contratos travados das features 026 (Home) e 052/056/057/paridade (Filmes/Séries) exigem a tela montada no 1º render quando só as leituras principais estão em cache. Por isso a tela aparece na hora nesse caso (FR-013) e o que termina antes do teto se encaixa na posição (FR-007); o adiamento vale a partir do teto. Na abertura fria — a dor relatada — nada aparece antes de tudo pronto ou do teto.
- **Emenda 2026-10-16 (decisão do usuário, depois da medição no navegador)**: Q: As capas devem segurar a tela até os 2 s? → A: Não — seguir o padrão dos apps de streaming: as capas esperam só ~300 ms; depois a tela aparece com os cards no lugar e as capas chegam dentro deles. Motivo: na lista real, Filmes/Séries frios ficavam sempre 2 s parados com todas as leituras prontas e ainda apareciam com só 9 de 25 capas (R-007/R-008 do plano). Substitui a resposta "Sim, as capas dos cards visíveis, dentro dos 2 s" da entrevista.
- Carrosséis de categoria de Filmes/Séries não entram na espera: a prévia de uma categoria pode depender de rede sem teto próprio, e a altura das fileiras é fixa, então os cards chegam no lugar sem mover nada.

### Emenda 2026-10-17 — comportamento progressivo

- O usuário decidiu seguir o comportamento de grandes players: fileiras prontas aparecem após a janela curta de 300 ms; fileiras pendentes entram assim que resolverem.
- Uma fileira atrasada acima das demais entra na visita atual, na posição correta, mesmo que isso mova as fileiras abaixo. Esconder conteúdo até sair e entrar novamente foi rejeitado.
