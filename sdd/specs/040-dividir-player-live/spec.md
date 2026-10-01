# Feature Specification: Dividir PlayerLayer e LiveScreen por responsabilidade

**Slug**: `040-dividir-player-live`

**Created**: 2026-10-01

**Status**: Implementada

**Input**: Item 49a-1 do backlog — dividir `PlayerLayer.tsx` (1 072 linhas) e
`LiveScreen.tsx` (1 401 linhas) em módulos por responsabilidade (sessão,
chrome, painéis, zapping, guia), sem mudar comportamento nem a API pública,
provado pela suíte, pelas travas de contrato e pelos E2E atuais. Habilitador
da trilha P: hoje 62a, 55b, 61 e 19 passam pelos mesmos dois arquivos e não
podem andar em paralelo. A parte do `catalogRepository.ts` é o 49a-2, fora
deste.

## Escopo

### Incluído

- Dividir a camada de reprodução (`PlayerLayer`) em módulos por
  responsabilidade: sessão e ciclo de vida da reprodução; chrome (controles,
  faixa do canal, auto-ocultar); painéis (áudio/legendas, info do stream);
  teclado e roteamento de teclas.
- Dividir a tela de TV ao vivo (`LiveScreen`) em módulos por
  responsabilidade: zapping (lista por cima do vídeo e troca de canal); guia
  (parado e tocando); busca; trilha de categorias e lista de canais.
- `PlayerLayer.tsx` e `LiveScreen.tsx` continuam existindo, com o mesmo nome,
  o mesmo caminho e as mesmas exportações públicas, e passam a só **compor**
  os módulos.
- Corrigir bugs **pequenos** que a divisão revelar (ver Clarifications), com
  teste de regressão e registro de cada um.

### Fora de Escopo

- `catalogRepository.ts` (item 49a-2).
- Qualquer mudança de comportamento visível, de texto, de layout ou de
  desempenho intencional — exceto as correções de bug pequenas registradas.
- Telas e componentes já separados que não estão dentro dos dois arquivos:
  `PlayerChrome.tsx`, `chromeControls.ts`, `features/live/guide/*`,
  `lib/player/*`, `MovieDetailScreen`, `SeriesDetailScreen`, `HomeScreen`
  (consumidores do `PlayerLayer`, que não mudam).
- Lint de fronteiras e limite de tamanho por arquivo (item 49b).
- Bugs que exigem decisão de produto ou de design — vão para o backlog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Camada de reprodução dividida, sem mudança de comportamento (Priority: P1)

Quem for implementar 55b (qualidade/velocidade), 61 (rede e lifecycle) ou 19
(erros acionáveis) encontra cada responsabilidade do player num módulo
próprio, e pode alterar uma sem editar o mesmo trecho que outra feature em
paralelo. Para quem usa o app, nada muda: filme, episódio e canal tocam,
pausam, avançam, mostram chrome e painéis exatamente como antes.

**Why this priority**: O player é o ponto mais quente da trilha P (seis itens
abertos passam por ele) e o primeiro da fila de prioridade do usuário
("player completo").

**Independent Test**: Toda a suíte unitária, todas as travas de contrato e
todos os roteiros E2E que hoje passam continuam passando sem alteração de
asserção; cada responsabilidade listada para o player está num módulo
próprio, e `PlayerLayer.tsx` só compõe.

**Acceptance Scenarios**:

1. **Given** os testes de contrato travados de 011, 020, 027, 029, 031 e
   outros que montam `PlayerLayer`, **When** a divisão termina, **Then**
   todos passam e as travas continuam íntegras.
2. **Given** um filme, um episódio e um canal, **When** a pessoa abre,
   pausa, avança/volta, abre os painéis de áudio/legendas e info, e fecha
   com RETURN, **Then** o comportamento é idêntico ao anterior (provado pelos
   testes e pelos E2E `player-chrome`, `audio-legendas-info`,
   `ciclo-vida-player`).
3. **Given** os consumidores (`MovieDetailScreen`, `SeriesDetailScreen`,
   `HomeScreen`, `LiveScreen`), **When** a divisão termina, **Then** nenhum
   precisou mudar a forma como usa o `PlayerLayer`.

---

### User Story 2 - Tela de TV ao vivo dividida, sem mudança de comportamento (Priority: P2)

Quem for implementar 62a (Configurar EPG sem fechar o player) ou mexer no
zapping/guia encontra zapping, guia, busca e lista em módulos próprios. Para
quem usa o app, a TV ao vivo se comporta exatamente como antes.

**Why this priority**: Segundo ponto quente da trilha P; depende menos da
fila imediata que o player, mas destrava 62a.

**Independent Test**: Mesma prova da US1, para a TV ao vivo: suíte, travas
(024, 018, 030, 031) e E2E `live-tv-ds-v14`, `zapping-live-tv`,
`epg-guia-completo`, `busca-por-categoria`, `favoritos` verdes; cada
responsabilidade listada para a Live num módulo próprio, `LiveScreen.tsx` só
compõe.

**Acceptance Scenarios**:

1. **Given** os contratos travados que montam `LiveScreen`, **When** a
   divisão termina, **Then** todos passam e as travas continuam íntegras.
2. **Given** um canal tocando, **When** a pessoa abre o zapping, troca de
   canal, abre o guia, busca dentro de uma categoria e usa CH±, **Then** o
   comportamento é idêntico ao anterior.

---

### User Story 3 - Bugs pequenos revelados pela divisão corrigidos e registrados (Priority: P3)

Se, ao separar o código, aparecer um bug pequeno (local, sem decisão de
produto), ele é corrigido com um teste de regressão próprio e registrado; o
resto da divisão continua provadamente sem mudança.

**Why this priority**: Só existe se algo aparecer; não bloqueia as outras.

**Independent Test**: Cada correção tem um teste que falhava antes e passa
depois, e um registro no plano; nenhuma outra asserção existente mudou.

**Acceptance Scenarios**:

1. **Given** um bug pequeno achado na divisão, **When** é corrigido, **Then**
   existe um teste de regressão que falhava antes, e a correção está
   registrada separada da movimentação de código.
2. **Given** um problema que exige decisão de produto, **When** é achado,
   **Then** vai para o backlog, sem correção nesta feature.

---

### Edge Cases

- **Corrida de closure/ref no player** (já houve uma na 027: estado lido por
  `useState` numa tecla que chega entre a criação da sessão e o próximo
  commit): mover código entre módulos não pode trocar uma leitura por `ref`
  por uma leitura de estado, nem o contrário.
- **Ordem dos efeitos**: abrir/fechar sessão, visibilidade do app e proteção
  de tela dependem da ordem dos efeitos; a divisão preserva a ordem.
- **Teclado com uma só captura**: o `PlayerLayer` registra o teclado uma vez
  (fase de captura); a divisão não pode criar uma segunda registração.
- **Mocks dos testes**: testes travados mockam módulos por caminho (ex.:
  `catalogApi`); um módulo novo que importe dos mesmos caminhos continua
  recebendo os mocks.
- **Arquivo do Tizen**: nenhum arquivo novo emitido pelo build (é só código
  TS/TSX que vira o mesmo bundle) — o guard do `sync-tizen` não deve acusar
  nada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `PlayerLayer.tsx` DEVE continuar exportando, do mesmo caminho,
  tudo o que exporta hoje e que algum outro arquivo importa (componente,
  tipos como `PlayerLayerTopLayer` e `PlayerEpisodeStep`).
- **FR-002**: `LiveScreen.tsx` DEVE continuar exportando, do mesmo caminho,
  tudo o que exporta hoje e que algum outro arquivo importa (componente,
  `LiveShellProps`, `LiveScreenProps`).
- **FR-003**: As responsabilidades do player — sessão e ciclo de vida,
  chrome, painéis (áudio/legendas, info), teclado — DEVEM ficar cada uma num
  módulo próprio; `PlayerLayer.tsx` DEVE só compô-los.
- **FR-004**: As responsabilidades da Live — zapping, guia, busca, trilha e
  lista de canais — DEVEM ficar cada uma num módulo próprio; `LiveScreen.tsx`
  DEVE só compô-los.
- **FR-005**: Nenhum comportamento visível DEVE mudar: texto, foco, ordem de
  teclas, tempos (auto-ocultar, debounce, limite de início), estados e
  mensagens — exceto as correções registradas pela FR-009.
- **FR-006**: Nenhum teste de contrato travado DEVE ser alterado, e todas as
  travas do repositório DEVEM continuar íntegras.
- **FR-007**: Nos testes existentes não travados, só caminhos de `import` ou
  de `vi.mock` PODEM mudar, e só quando o que eles referenciam mudou de
  arquivo; nenhuma asserção, valor esperado ou passo de teste DEVE mudar
  (salvo os testes de regressão novos da FR-009).
- **FR-008**: A suíte unitária, os roteiros de `npm run test:e2e`, `tsc`,
  lint e `build:tizen` DEVEM terminar no mesmo estado que antes da divisão
  (mesmas falhas conhecidas, e nenhuma nova).
- **FR-009**: Um bug pequeno (local, sem decisão de produto) revelado pela
  divisão PODE ser corrigido nesta feature, desde que tenha um teste de
  regressão que falhava antes da correção e um registro próprio no plano,
  separado da movimentação de código. Bug que exija decisão de produto ou de
  design DEVE ir para o backlog, sem correção aqui.
- **FR-010**: Os consumidores do `PlayerLayer` e o `App.tsx` NÃO DEVEM mudar.

### Measurable Outcomes

- **SC-001**: 100% das travas de contrato do repositório íntegras e verdes
  depois da divisão.
- **SC-002**: Zero asserções alteradas em testes existentes (só imports/mocks
  de caminho), verificável pelo diff.
- **SC-003**: Cada responsabilidade listada nas FR-003/FR-004 está num
  módulo próprio, e `PlayerLayer.tsx`/`LiveScreen.tsx` não contêm lógica
  dessas responsabilidades — conferido item a item na convergência.
- **SC-004**: `npm run test:e2e` inteiro verde, com o mesmo número de
  verificações de antes da divisão.
- **SC-005**: Cada bug corrigido tem exatamente um teste de regressão novo
  que falhava antes, e um registro no plano.

## Assumptions

- A prova principal de "nada mudou" é a automação existente (suíte, travas,
  E2E), que já cobre player e Live com profundidade (features 011–039).
- Passada na TV física: **recomendada, não gate** — uma checagem rápida
  (filme, episódio, canal com zapping, guia, teclas de mídia), porque o
  player já teve corridas que só apareceram com timing real.
- Os nomes e a quantidade exata de módulos são decisão do `sdd-plan`; esta
  spec fixa só as responsabilidades.
- Pode ser executada por partes (player primeiro, Live depois), já que as
  duas user stories são independentes.

## Clarifications

### Sessão 2026-10-01

- Q: Qual meta de tamanho a divisão deve cumprir? → A: Sem número de linhas;
  o critério é por responsabilidade (pergunta seguinte).
- Q: Sem meta de linhas, como saber que está pronto? → A: Cada
  responsabilidade nomeada sai dos dois arquivos para um módulo próprio
  (player: sessão/ciclo de vida, chrome, painéis, teclado; Live: zapping,
  guia, busca, trilha/lista); os dois arquivos ficam só compondo. Conferido
  por lista (SC-003).
- Q: O que pode mudar nos testes existentes não travados? → A: Só caminhos de
  `import`/`vi.mock`; asserções idênticas (FR-007).
- Q: E se a divisão revelar um bug? → A: Corrigir os pequenos junto (FR-009).
- Q: Como corrigir os bugs pequenos? → A: Usar sub-agentes para corrigi-los.
  (Registrado como dado pelo usuário; a spec mantém o mínimo de honestidade
  de veredito — teste de regressão que falhava antes e registro no plano — e
  o `sdd-plan` decide como os sub-agentes trabalham.)
- Q: Passada na TV física? → A: Recomendada, não gate.
