# Feature Specification: Memória de foco por área e key repeat

**Slug**: `046-memoria-foco-key-repeat`

**Created**: 2026-10-02

**Status**: Convergida

**Input**: Item 14 do backlog — "Memória de foco por área + key repeat (§41/§42): posição por chave `seção:categoria`, reconciliada por id; `KeyboardEvent.repeat` para segurar a seta sem disparar prefetch/metadata a cada item." Entregue numa spec só, com duas stories independentes: 14a (key repeat) e 14b (memória de foco).

## Escopo

### Incluído

- **14a — Key repeat**: enquanto uma seta é segurada (auto-repetição), a trilha de categorias não agenda nem dispara o prefetch da categoria sobrevoada; só a categoria onde o foco estabilizou é pré-buscada.
- **14b — Memória de foco da Live TV**: cada entrada da Live (categoria, ★ Favoritos, Todos) lembra o último canal focado, dentro da sessão do app, por lista ativa; reconciliada por id, com vizinho mais próximo quando o canal some; ao sair do player, o foco fica no canal que tocava por último (inclusive após zapping).
- Estado de "navegação rápida" detectado por `KeyboardEvent.repeat`, com o mesmo mecanismo reaproveitável por outras telas no futuro.

### Fora de Escopo

- Suprimir preview/EPG "Agora", leitura de dados por item focado ou carga de capas durante a rajada (hoje não disparam rede por foco; ficam fora).
- Delays novos de 520 ms (canal) e 850 ms (trailer) do §42.3: o app não tem preview por foco (ADR-011).
- Memória de foco nova em Filmes/Séries (já existe `vodSessionMemory`), em modais ou no guia EPG — nenhuma revisão nesta feature.
- Persistência da memória entre aberturas do app (fica só em memória, como Filmes/Séries); nada novo no IndexedDB.
- Detecção de rajada por intervalo entre teclas quando `repeat` não vier (ver Assumptions).
- Mudar o debounce de 300 ms do prefetch em foco parado (feature 010, R-013).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Segurar a seta na trilha sem disparar prefetch por categoria (Priority: P1) — 14a

Quem segura ↑/↓ na trilha de categorias (Live, Filmes ou Séries) atravessa dezenas de categorias sem que cada uma dispare uma consulta ao painel. Ao soltar a tecla, só a categoria em que o foco parou é pré-buscada, após o debounce já existente.

**Why this priority**: É o que causou bugs reais na TV (rajada de buscas, limite de taxa do painel, categoria desejada atrás de fila). Entrega valor sozinha, sem depender da memória.

**Independent Test**: Simular uma rajada de `keydown` com `repeat: true` pela trilha e contar chamadas de prefetch: nenhuma durante a rajada, exatamente uma (a categoria final) depois que o foco estabiliza.

**Acceptance Scenarios**:

1. **Given** a trilha com 40 categorias e o foco na primeira, **When** a pessoa segura ↓ por 30 categorias, **Then** nenhum prefetch é disparado durante a rajada.
2. **Given** a rajada acima, **When** a tecla é solta numa categoria, **Then** só essa categoria é pré-buscada, após o debounce atual.
3. **Given** toques isolados (`repeat: false`) em ↓, **When** o foco para em cada categoria por mais que o debounce, **Then** o comportamento atual é mantido (prefetch da categoria parada).
4. **Given** uma busca já em andamento da categoria entrada, **When** a pessoa segura a seta, **Then** essa busca não é abortada (continua compartilhada com a entrada real).

---

### User Story 2 - Live TV lembra onde o foco estava em cada entrada (Priority: P2) — 14b

Na Live, ao trocar de categoria e voltar, o foco reaparece no último canal que estava focado ali. Vale para cada categoria, ★ Favoritos e Todos, separadamente. Ao fechar o player, o foco fica no canal que tocava por último, mesmo após zapping.

**Why this priority**: Evita "teleportar" o foco para o topo sem motivo (§41), mas só melhora conforto; a P1 resolve falhas reais.

**Independent Test**: Focar o 15º canal numa categoria, ir para outra, voltar: o foco está no 15º canal. Abrir um canal, zapear para outro, fechar o player: foco no canal que tocava.

**Acceptance Scenarios**:

1. **Given** foco no canal X da categoria A, **When** a pessoa vai à categoria B e volta à A, **Then** o foco está em X, visível na janela virtualizada.
2. **Given** uma categoria nunca visitada nesta sessão, **When** a pessoa a entra, **Then** o foco inicial é o primeiro item.
3. **Given** um canal tocando em A após zapping de X para Y, **When** o player é fechado, **Then** o foco está em Y e a memória de A guarda Y.
4. **Given** X lembrado em A, **When** X deixa de existir (renovação da lista, desfavoritado em ★ Favoritos), **Then** o foco cai no vizinho mais próximo da mesma lista, nunca no topo sem motivo.
5. **Given** memória em duas listas diferentes, **When** a lista ativa muda, **Then** a memória de uma nunca é aplicada à outra.
6. **Given** o app fechado e reaberto, **When** a Live é aberta, **Then** a memória começou vazia (primeiro item).

---

### Edge Cases

- Rajada que termina com a tecla solta fora da trilha (já na coluna de canais): nenhum prefetch pendente da trilha deve disparar em categoria que não é mais a focada.
- TV que entrega `keydown` repetido sem `repeat: true`: coberto pela proteção atual (debounce de 300 ms), sem regressão.
- Rajada interrompida por outra tecla (OK, RETURN): o estado de "navegação rápida" não pode ficar preso.
- Categoria vazia ou em erro ao voltar com foco lembrado: foco vai ao elemento focável de estado (vazio/erro), nunca a lugar nenhum.
- "Todos" carrega aos poucos: o canal lembrado ainda não carregado deve ser perseguido pela paginação, como já ocorre em Filmes/Séries (feature 039).
- Busca ativa na Live: a memória da entrada não deve ser sobrescrita por posições de uma lista filtrada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE identificar a navegação contínua pela auto-repetição de tecla (`KeyboardEvent.repeat`) nas setas e expô-la como estado "foco em movimento rápido" a quem agenda trabalho por foco.
- **FR-002**: Enquanto o foco da trilha estiver em movimento rápido, Sistema NÃO DEVE agendar nem disparar prefetch da categoria sobrevoada (Live, Filmes e Séries).
- **FR-003**: Quando o foco estabilizar (tecla solta ou sem novo evento por 300 ms), Sistema DEVE pré-buscar apenas a categoria focada, com o debounce atual — sem somar atrasos novos.
- **FR-004**: Sistema NÃO DEVE abortar uma busca em andamento da categoria já entrada por causa de uma rajada.
- **FR-005**: O estado de movimento rápido NÃO DEVE ficar preso se a rajada for interrompida (outra tecla, perda de foco, desmontagem da tela).
- **FR-006**: Toques isolados sem `repeat` DEVEM manter exatamente o comportamento atual.
- **FR-007**: Sistema DEVE memorizar, na Live, o último canal focado por lista ativa e entrada (categoria, ★ Favoritos, Todos), chave `live:<entrada>` dentro da lista.
- **FR-008**: Ao reentrar numa entrada, Sistema DEVE restaurar o foco no canal lembrado, reconciliado por id (nunca por índice) e visível na janela virtualizada.
- **FR-009**: Entrada nunca visitada na sessão DEVE abrir com foco no primeiro item.
- **FR-010**: Se o canal lembrado deixar de existir, Sistema DEVE focar o vizinho mais próximo da mesma lista (mecanismo de reconciliação existente), nunca o topo sem motivo.
- **FR-011**: Ao fechar o player de um canal, Sistema DEVE focar o canal que tocava por último (inclusive após zapping/CH±) e atualizar a memória dessa entrada com ele.
- **FR-012**: A memória DEVE viver só na sessão do app, em memória; Sistema NÃO DEVE gravar nada novo no armazenamento do aparelho.
- **FR-013**: A memória de uma lista NUNCA DEVE ser aplicada a outra lista; trocar ou excluir a lista ativa descarta a memória daquela lista.
- **FR-014**: A posição de uma lista filtrada por busca NÃO DEVE sobrescrever a memória da entrada.
- **FR-015**: Em toda restauração, Sistema DEVE manter exatamente um foco visível; entrada vazia ou em erro foca a ação do estado.
- **FR-016**: Restaurar foco NÃO DEVE iniciar reprodução nem consulta externa (constitution: focar não toca nem consulta).

### Key Entities

- **Estado de navegação rápida**: indicador efêmero de que uma seta está sendo segurada; sem persistência.
- **Memória de foco da Live**: mapa efêmero `lista ativa → entrada (categoria/★ Favoritos/Todos) → id do último canal focado`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Segurando a seta por 30 categorias consecutivas, o número de consultas de prefetch disparadas durante a rajada é 0, e após soltar é no máximo 1 (a categoria final).
- **SC-002**: Em foco parado (toque isolado), o prefetch da categoria continua disparando em até 300 ms + tempo normal da busca — sem regressão frente ao comportamento atual.
- **SC-003**: Em 10 de 10 idas e voltas entre duas categorias da Live, o foco volta ao mesmo canal lembrado.
- **SC-004**: Em 10 de 10 saídas do player após 1 a 5 zappings, o foco fica no canal que tocava por último.
- **SC-005**: Em 100% dos casos em que o canal lembrado some, o foco cai num item da mesma lista (vizinho) e nunca fica sem foco visível.
- **SC-006**: Na TV física (QN50Q60DAGXZD), segurar ↓ na trilha de uma lista real grande não degrada a fluidez nem gera rajada de requisições ao painel (verificado na pass recomendada).

## Assumptions

- A TV de referência entrega `KeyboardEvent.repeat` nas setas; se não entregar, o debounce de 300 ms existente continua a proteção (sem regressão), e a detecção por intervalo fica para uma spec futura se a TV física mostrar necessidade.
- Metadata e EPG "Agora" não disparam rede por foco hoje (metadata só ao abrir o detalhe; EPG lido do aparelho), então não entram em 14a.
- Filmes e Séries já têm memória por entrada (`vodSessionMemory`, feature 025); só a Live precisa dela agora.
- "Perfil" do §41 equivale à lista IPTV ativa (ADR-011).
- A pass na TV física é recomendada, não gate.

## Clarifications

### Sessão 2026-10-02

- Q: Como fatiar o item 14? → A: Uma spec só, com duas stories independentes (14a P1, 14b P2).
- Q: O que suprimir durante `repeat`? → A: Apenas o prefetch de categoria da trilha (preview/EPG, dados por foco e capas ficam fora).
- Q: Regra de "foco estabiliza"? → A: Fim do repeat + o debounce de 300 ms atual; sem delays novos de 520/850 ms.
- Q: Quais áreas na memória 14b? → A: Só Live TV por categoria/★ Favoritos/Todos; Filmes/Séries, modais e EPG ficam como estão.
- Q: Vida da memória? → A: Sessão do app, em memória, igual a `vodSessionMemory`.
- Q: Escopo e canal sumido? → A: Por lista ativa + seção:entrada; canal sumido cai no vizinho mais próximo.
- Q: Foco inicial e volta do player? → A: Primeiro item se nunca visitada; ao sair do player, o canal que tocava por último.
