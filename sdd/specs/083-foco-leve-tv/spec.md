# Feature Specification: Foco leve na TV

**Slug**: `083-foco-leve-tv`

**Created**: 2026-10-18

**Status**: Implementada

**Input**: Achado da sonda 2 da feature 082 em TV física (grade de 140 cards, 7 por linha): parada a 61 fps; foco só com escala a 52 fps e pior quadro de 33 ms; a receita atual completa de foco (escala + contorno + halo e brilho por sombra) a 38 fps e pior quadro de 133 ms (5 quadros acima de 50 ms); com uma faixa de backdrop-filter, 32 fps e 217 ms; só rolar a grade, 50 fps e 34 ms. Números em `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda2-capacidades-tv-2026-10-18.md`.

## Escopo

### Incluído

- Tornar o estado de foco visualmente equivalente ao atual, com uma composição mais leve para a TV.
- Aplicar a receita leve a **todo elemento focável** que hoje usa a receita global de foco (cards de todas as grades, botões, chips, campos, linhas de lista), inclusive as cópias locais dessa receita em folhas de estilo de tela — um único visual de foco no app.
- Preservar a leitura clara do item focado durante navegação por controle remoto.
- Medir o resultado na TV física em duas superfícies: a sonda sintética da 082 (gate, comparável à linha de base) e o app real numa grade de Filmes com capas (registro).
- Registrar a emenda necessária na receita de foco do ADR-007 e do V14 §11.

### Fora de Escopo

- Alterar navegação direcional, seleção, retorno, memória de foco ou reprodução.
- Alterar dimensões, espaçamentos, tipografia ou tokens gerais dos cards.
- Redesenhar a identidade visual do foco ou criar novos estados de interação.
- Usar backdrop-filter para produzir o efeito.
- Otimizar o custo da rolagem da grade (só é medido e registrado).
- Decodificação de capas, mensagens entre Workers, ordenação, memória e rede — continuam no backlog (item "Ajustes finos de CPU na TV" e demais achados da sonda 2).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegar por uma grade com foco fluido (Priority: P1)

Como usuário da TV, quero mover o foco entre cards sem travamentos perceptíveis e ainda reconhecer claramente qual card está focado, para escolher um item com o controle remoto.

**Why this priority**: O foco é usado em todas as jornadas de catálogo e a sonda mediu uma degradação visível na receita atual.

**Independent Test**: Na TV de referência, na grade sintética de 140 cards da sonda com a receita nova, mover o foco entre cards visíveis (sem rolagem) por várias linhas e medir quadros; inspecionar o visual do foco no app real.

**Acceptance Scenarios**:

1. **Given** uma grade com cards renderizados, **When** o usuário move o foco para outro card, **Then** o card novo mostra o estado de foco reconhecível sem iniciar reprodução, consulta externa ou outra ação.
2. **Given** o foco em movimento contínuo entre cards visíveis da grade de referência, sem rolagem, **When** a animação ocorre, **Then** a medição atinge pelo menos 50 fps e não registra quadros acima de 50 ms.
3. **Given** um card focado e depois desfocado, **When** o foco muda, **Then** o efeito de entrada e saída mantém a mesma hierarquia visual percebida e não deixa brilho ou contorno preso em outro card.
4. **Given** o foco descendo para uma linha fora da área visível, **When** a grade rola, **Then** fps e pior quadro são medidos e registrados, sem condicionar o aceite.

### User Story 2 - Manter o contrato de foco em todas as áreas (Priority: P2)

Como usuário da TV, quero que o mesmo comportamento leve apareça em Início, Live TV, Filmes, Séries, Rádio, Ajustes, formulários e demais áreas com elementos focáveis, para não precisar reaprender o significado do foco.

**Why this priority**: A melhoria só entrega seu valor completo se não ficar restrita à grade que originou a medição, e uma receita só evita dois visuais de foco convivendo.

**Independent Test**: Repetir o roteiro de foco em cada família de superfície (grades de cards, linhas de lista, botões/chips, campos de formulário, controles do player) e confirmar que o estado visual, SELECT e RETURN mantêm o comportamento já conhecido.

**Acceptance Scenarios**:

1. **Given** qualquer elemento focável do app, **When** ele recebe foco, **Then** usa a mesma regra visual leve e reconhecível.
2. **Given** um elemento focado em qualquer uma dessas áreas, **When** o usuário pressiona SELECT ou RETURN, **Then** a ação existente da tela ocorre sem mudança de contrato.
3. **Given** um elemento que hoje não escala ao focar (exceção já existente), **When** recebe foco, **Then** continua sem escala, com contorno e brilho.

### Edge Cases

- Grade com poucos cards deve manter o foco visível sem criar um efeito desproporcional.
- Cards na primeira e na última posição devem animar sem cortar o contorno ou brilho pela borda da viewport.
- Troca rápida de foco deve cancelar ou substituir a animação anterior sem acumular efeitos.
- Estado desabilitado, placeholder, carregando, vazio e erro deve continuar distinguível do estado focado.
- Movimento reduzido (preferência do sistema ou interna) deve chegar ao mesmo estado final de foco, sem animar.
- Capas claras, escuras e saturadas devem manter o foco localizável a distância.
- Se a medição automatizada não conseguir reproduzir a carga de 140 cards, o aceite de desempenho deve ser classificado como não testável nessa superfície, aguardando TV física.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE apresentar um estado visual de foco reconhecível em cada elemento navegável.
- **FR-002**: O sistema DEVE preservar a hierarquia visual percebida do foco atual, incluindo destaque de escala, contorno e brilho, sem usar backdrop-filter.
- **FR-003**: O sistema DEVE limitar a animação do foco a propriedades que mantenham a fluidez medida no cenário de referência, sem alterar o contrato de navegação ou seleção.
- **FR-004**: O sistema DEVE aplicar a mesma regra de foco a todos os elementos que hoje usam a receita global, incluindo cópias locais da receita em estilos de tela, preservando as exceções sem escala já existentes.
- **FR-005**: O sistema DEVE manter estados focado, desfocado, desabilitado, carregando, vazio e erro distinguíveis entre si.
- **FR-006**: A validação DEVE registrar a medição da sonda sintética (gate) e a do app real (registro), com foco sem rolagem e com rolagem separados, e o resultado visual por família de superfície, separando evidência automatizada de confirmação na TV física.
- **FR-007**: A documentação da feature DEVE registrar a emenda da receita de foco do ADR-007 e do V14 §11 antes do aceite final.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na TV de referência, a grade sintética de 140 cards da sonda atinge pelo menos 50 fps durante a movimentação de foco entre cards visíveis, sem rolagem (linha de base: 38 fps).
- **SC-002**: Na mesma medição, nenhum quadro ultrapassa 50 ms (linha de base: 5 quadros acima de 50 ms, pior de 133 ms).
- **SC-003**: Em todas as famílias de superfície avaliadas, nenhuma transição de foco observada deixa efeito preso ou contorno ausente.
- **SC-004**: Testes de navegação existentes para foco, SELECT e RETURN permanecem aprovados nas áreas afetadas.
- **SC-005**: Usuários conseguem identificar o elemento focado em uma inspeção visual na TV sem instrução adicional, no app real, com capas claras, escuras e saturadas.
- **SC-006**: A medição no app real (grade de Filmes com capas) e a de movimento com rolagem ficam registradas com fps e pior quadro, como referência, sem condicionar o aceite.

## Assumptions

- A TV de referência e a sonda 2 (app de teste separado) continuam disponíveis para a validação física, e a sonda pode receber a receita nova para comparação direta.
- O app continua usando a navegação direcional própria e o Design System V14 como contratos vigentes.
- A equivalência visual será avaliada pela hierarquia percebida do estado, não pela reprodução de cada propriedade CSS atual.
- O teto prático é o foco só com escala (52 fps / 33 ms na sonda): a meta de 50 fps exige que contorno e brilho custem quase nada além da escala.
- A implementação técnica, incluindo a forma de pré-desenhar ou animar o brilho, será decidida no sdd-plan.
- A sessão de TV física pode ser compartilhada com a medição pendente da 082 (item "Velocidade da 082 na TV física" do backlog), sem misturar as evidências.

## Clarifications

### Sessão 2026-10-18

- Q: Ao focar um card na TV, qual deve ser o objetivo principal? → A: Preservar o visual atual com brilho mais barato.
- Q: Em quais superfícies o novo foco deve valer? → A: Todas as grades com foco.
- Q: Qual critério de desempenho define a aprovação na TV física? → A: Alvo mínimo de 50 fps e sem quadros acima de 50 ms.
- Q: O que fica fora da feature? → A: Navegação, dimensões e tokens gerais permanecem inalterados; a resposta foi incorporada ao escopo fora da feature.

### Sessão 2026-10-19 (revisão)

- Q: Algum item do backlog entra na 083 (a parte de capas do item "Ajustes finos de CPU na TV")? → A: Nada; a 083 fica só com o foco. Capas, Worker e ordenação seguem no backlog.
- Q: A receita é global (botões, campos, chips, linhas, cards); qual o alcance? → A: Receita global, todos os elementos focáveis — um visual de foco só. Escopo, US2 e FR-004 atualizados.
- Q: A meta ≥ 50 fps / sem quadro > 50 ms vale para qual movimento? → A: Foco entre cards visíveis, sem rolagem; a rolagem é medida e registrada sem condicionar o aceite (só rolar já mede 50 fps / 34 ms na sonda). SC-001, US1 cenários 2 e 4 e SC-006 atualizados.
- Q: Onde medir o gate físico? → A: A sonda sintética com a receita nova é o gate (comparável aos 38 fps); o app real numa grade de Filmes com capas é registro. FR-006 e SC-006 atualizados.
- Ajuste da revisão (sem pergunta): SC-003 passou de "95% das transições" para "nenhuma transição" com efeito preso — efeito preso é defeito, não tolerância.
