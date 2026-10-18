# Feature Specification: Foco leve na TV

**Slug**: `083-foco-leve-tv`

**Created**: 2026-10-18

**Status**: Em Execução

**Input**: Achado da sonda 2 da feature 082 em TV física: a receita atual de foco (scale + outline + box-shadow com brilho) alcança 38 fps e pior quadro de 133 ms numa grade de 140 cards; backdrop-filter alcança 32 fps e pior quadro de 217 ms.

## Escopo

### Incluído

- Tornar o estado de foco de cards visualmente equivalente ao atual, com uma composição mais leve para a TV.
- Aplicar o comportamento a todas as grades que usam foco de cards no app.
- Preservar a leitura clara do item focado durante navegação por controle remoto.
- Medir o resultado na TV física usando a mesma classe de grade e o mesmo roteiro da sonda 2.
- Registrar a emenda necessária na receita de foco do ADR-007 e do V14 §11.

### Fora de Escopo

- Alterar navegação direcional, seleção, retorno, memória de foco ou reprodução.
- Alterar dimensões, espaçamentos, tipografia ou tokens gerais dos cards.
- Redesenhar a identidade visual do foco ou criar novos estados de interação.
- Usar backdrop-filter em grades para produzir o efeito.
- Otimizar memória, rede, ordenação, capas ou outras sondas da 082.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegar por uma grade com foco fluido (Priority: P1)

Como usuário da TV, quero mover o foco entre cards sem travamentos perceptíveis e ainda reconhecer claramente qual card está focado, para escolher um item com o controle remoto.

**Why this priority**: O foco é usado em todas as jornadas de catálogo e a sonda mediu uma degradação visível na receita atual.

**Independent Test**: Abrir uma grade com pelo menos 140 cards na TV de referência, mover o foco por várias linhas e verificar simultaneamente o visual do foco e a medição de quadros.

**Acceptance Scenarios**:

1. **Given** uma grade com cards renderizados, **When** o usuário move o foco para outro card, **Then** o card novo mostra o estado de foco reconhecível sem iniciar reprodução, consulta externa ou outra ação.
2. **Given** o foco em movimento contínuo por uma grade, **When** a animação ocorre, **Then** a medição atinge pelo menos 50 fps e não registra quadros acima de 50 ms no cenário de referência.
3. **Given** um card focado e depois desfocado, **When** o foco muda, **Then** o efeito de entrada e saída mantém a mesma hierarquia visual percebida e não deixa brilho ou contorno preso em outro card.

### User Story 2 - Manter o contrato de foco em todas as áreas (Priority: P2)

Como usuário da TV, quero que o mesmo comportamento leve apareça nas grades de Live TV, Filmes, Séries, Início e demais áreas que exibem cards, para não precisar reaprender o significado do foco.

**Why this priority**: A melhoria só entrega seu valor completo se não ficar restrita à grade que originou a medição.

**Independent Test**: Repetir o roteiro de foco em cada família de grade existente e confirmar que o estado visual, SELECT e RETURN mantêm o comportamento já conhecido.

**Acceptance Scenarios**:

1. **Given** qualquer grade de cards coberta pelo app, **When** um card recebe foco, **Then** ele usa a mesma regra visual leve e reconhecível.
2. **Given** um card focado em qualquer uma dessas áreas, **When** o usuário pressiona SELECT ou RETURN, **Then** a ação existente da tela ocorre sem mudança de contrato.

### Edge Cases

- Grade com poucos cards deve manter o foco visível sem criar um efeito desproporcional.
- Cards na primeira e na última posição devem animar sem cortar o contorno ou brilho pela borda da viewport.
- Troca rápida de foco deve cancelar ou substituir a animação anterior sem acumular efeitos.
- Estado desabilitado, placeholder, carregando, vazio e erro deve continuar distinguível do estado focado.
- Se a medição automatizada não conseguir reproduzir a carga de 140 cards, o aceite de desempenho deve ser classificado como não testável nessa superfície, aguardando TV física.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE apresentar um estado visual de foco reconhecível em cada card navegável.
- **FR-002**: O sistema DEVE preservar a hierarquia visual percebida do foco atual, incluindo destaque de escala, contorno e brilho, sem usar backdrop-filter em grades.
- **FR-003**: O sistema DEVE limitar a animação do foco a propriedades que mantenham a fluidez medida no cenário de referência, sem alterar o contrato de navegação ou seleção.
- **FR-004**: O sistema DEVE aplicar a mesma regra de foco a todas as famílias de grades cobertas pela feature.
- **FR-005**: O sistema DEVE manter estados focado, desfocado, desabilitado, carregando, vazio e erro distinguíveis entre si.
- **FR-006**: A validação DEVE registrar a medição da grade de referência e o resultado por família de grade, separando evidência automatizada de confirmação na TV física.
- **FR-007**: A documentação da feature DEVE registrar a emenda da receita de foco do ADR-007 e do V14 §11 antes do aceite final.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na TV de referência, a grade de 140 cards atinge pelo menos 50 fps durante a movimentação de foco.
- **SC-002**: Na mesma medição, nenhum quadro ultrapassa 50 ms.
- **SC-003**: Em todas as famílias de grade avaliadas, pelo menos 95% das transições de foco observadas mantêm o estado visual correto, sem efeito preso ou contorno ausente.
- **SC-004**: Testes de navegação existentes para foco, SELECT e RETURN permanecem aprovados nas áreas afetadas.
- **SC-005**: Usuários conseguem identificar o card focado em uma inspeção visual na TV sem instrução adicional, usando o mesmo roteiro de avaliação da sonda 2.

## Assumptions

- A TV de referência e o roteiro da sonda 2 continuam disponíveis para a validação física.
- O app continua usando a navegação direcional própria e o Design System V14 como contratos vigentes.
- A equivalência visual será avaliada pela hierarquia percebida do estado, não pela reprodução de cada propriedade CSS atual.
- A implementação técnica, incluindo a forma de pré-desenhar ou animar o brilho, será decidida no sdd-plan.

## Clarifications

### Sessão 2026-10-18

- Q: Ao focar um card na TV, qual deve ser o objetivo principal? → A: Preservar o visual atual com brilho mais barato.
- Q: Em quais superfícies o novo foco deve valer? → A: Todas as grades com foco.
- Q: Qual critério de desempenho define a aprovação na TV física? → A: Alvo mínimo de 50 fps e sem quadros acima de 50 ms.
- Q: O que fica fora da feature? → A: Navegação, dimensões e tokens gerais permanecem inalterados; a resposta foi incorporada ao escopo fora da feature.
