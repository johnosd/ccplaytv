# Feature Specification: Virtualização de Grades e Foco Direcional

**Slug**: `009-virtualizacao-foco`

**Created**: 2026-09-22

**Status**: Convergida

**Input**: Virtualização das listas longas (Canais, Filmes, Séries) usando TanStack Virtual e Norigin Spatial Navigation para contornar a lentidão severa na TV (referências em `docs/design`, `docs/guia-praticas-app-tv`, `docs/iptvnator`).

## Escopo

### Incluído
- Integração do `@tanstack/react-virtual` (ou estratégia de virtualização própria para TV) nas telas de Canais.
- Ajuste do `norigin-spatial-navigation` para lidar com itens virtualizados, garantindo que o foco possa navegar para elementos fora da viewport, acionando o scroll/renderização correta.
- Estruturação base que servirá também para as futuras telas de Filmes e Séries.
- Desempenho otimizado para não travar a TV ao lidar com listas de dezenas de milhares de canais/VODs.

### Fora de Escopo
- Criação das telas completas de Filmes e Séries com seus metadados ricos (isso é outra feature). O foco aqui é apenas resolver a infraestrutura de UI (Foco + Lista virtual) na tela de Live TV atual.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rolagem infinita em lista de Canais sem travamento (Priority: P1)

Como usuário, desejo usar as setas do controle remoto para descer rapidamente por uma lista de milhares de canais sem que a TV congele ou atrase a resposta do controle.

**Why this priority**: É o bloqueio crítico atual de usabilidade.

**Independent Test**: Pode ser totalmente testado abrindo uma lista gigante (ex. 300k itens) e segurando a tecla "Para Baixo". O scroll deve ser imediato.

**Acceptance Scenarios**:
1. **Given** a tela de canais aberta num grupo com 10.000 itens, **When** eu pressiono a seta para baixo continuamente, **Then** a lista rola suavemente, mantendo o foco no item correto.
2. **Given** um item recebendo foco que está no limite inferior da tela, **When** eu desço um passo a mais, **Then** o próximo elemento é renderizado e o scroll do contêiner acompanha o foco.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: O sistema DEVE renderizar apenas os elementos visíveis na viewport (+ overscan) para economizar RAM e CPU da TV.
- **FR-002**: A engine de foco (Norigin Spatial Navigation) DEVE ser capaz de medir e transferir foco para elementos recém-renderizados.
- **FR-003**: A navegação por DPAD (setas) DEVE comandar a rolagem da janela virtualizada.

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: O uso de memória na TV não deve crescer linearmente com o tamanho da lista (ex: lista de 10 mil deve consumir RAM similar a lista de 100 itens).
- **SC-002**: Tempo de resposta do controle (input latency) deve ficar abaixo de 200ms por movimento.

## Assumptions
- As diretrizes de DPAD e foco de `docs/guia-praticas-app-tv/03_metodos_de_entrada.md` exigem feedback visual instantâneo e bounding box clara.
- As diretrizes de `docs/iptvnator/07-tela-canais.md` mencionam VirtualScroll como requisito técnico pra IPTV.

## Clarifications
- Q: Vamos virtualizar primeiro apenas a Live TV? → A: Sim, a Live TV já tem UI real, servirá como base.
- Q: Qual a biblioteca recomendada? → A: TanStack Virtual é a meta, mas Norigin precisa ser avisado.
