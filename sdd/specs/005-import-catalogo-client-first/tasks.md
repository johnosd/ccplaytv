---
description: "Template de lista de tasks para implementação de feature"
---

# Tasks: Import e catálogo client-first, sem backend sempre-ligado

**Input**: Documentos de design de `sdd/specs/005-import-catalogo-client-first/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), research.md, data-model.md, contracts/local-storage.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Todo o código desta feature vive em `tv-web/` (React 19 + TypeScript,
  Vite 8, alvo `chrome108`). O núcleo novo fica em
  `tv-web/src/lib/catalog/`, com testes colocalizados (`*.test.ts`).
- Telas em `tv-web/src/features/<area>/`, testes colocalizados (`*.test.tsx`).
- Empacotamento Tizen em `CCPlayTv/` — a lista `files:` de
  `tizen_web_project.yaml` é explícita e precisa acompanhar arquivos novos
  gerados pelo build (R-002).
- **`api/` NÃO é tocado por nenhuma task desta feature** (D-007/FR-021). A
  suíte dele roda apenas como prova de que nada quebrou.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: colocar no lugar a camada de armazenamento e o ambiente de
teste que todas as fases seguintes usam.

- [ ] T001 Adicionar `dexie` como dependência e `fake-indexeddb` como
      devDependency em `tv-web/package.json` (research.md R1 e R6).
- [ ] T002 Registrar `fake-indexeddb/auto` em `tv-web/src/setupTests.ts`,
      para os testes terem IndexedDB sob jsdom.
- [ ] T003 Criar o schema local em `tv-web/src/lib/catalog/db.ts`: as três
      coleções e os índices de `data-model.md`, incluindo o índice composto
      `[sourceId+generation+groupOrder]` que sustenta a leitura paginada.

**Checkpoint**: o aparelho sabe guardar o que o pipeline vai produzir.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: portar o núcleo que hoje vive em `api/app/services/` e
construir o pipeline local — **sem tocar em nenhuma tela**. Ao fim desta
fase o caminho novo existe e é testável, e o caminho atual continua
intacto.

**⚠️ CRITICAL**: nenhuma user story pode começar antes desta fase
terminar — inclusive a US1, que precisa de um pipeline real para medir
(D-008: medir o que vai ser usado, não um protótipo diferente).

### Testes da Fase

- [ ] T004 [P] Testes do parser em
      `tv-web/src/lib/catalog/m3uParser.test.ts`, cobrindo os casos de
      borda enumerados em `research.md` R2: conteúdo sem `#EXTM3U`,
      manifesto HLS real, `#EXT-X-SESSION-DATA` que **não** pode reprovar
      a lista, entrada sem URL, atributo com vírgula e aspas, lista válida
      e vazia, BOM inicial.
- [ ] T005 [P] Testes do classificador em
      `tv-web/src/lib/catalog/classifier.test.ts`: canal, filme, série,
      episódio com temporada/episódio, e o caminho "não classificado"
      quando falta evidência.
- [ ] T006 [P] Testes do conector em
      `tv-web/src/lib/catalog/xtreamConnector.test.ts`: normalização de
      endereço nas formas comuns e com subpath, recusa de credencial
      embutida na URL, resolução de estado de conta nas três respostas
      (ativa, expirada, inválida) e com a primeira consulta falhando,
      escolha de formato com TS preferido e com ausência de formato.
- [ ] T007 [P] Testes do repositório de catálogo em
      `tv-web/src/lib/catalog/catalogRepository.test.ts`: gravação em
      lote; leitura paginada por categoria na ordem declarada; a geração
      anterior continua legível enquanto a nova é escrita; publicar troca
      o ponteiro e descarta a anterior; falha de escrita por falta de
      espaço é sinalizada ao chamador, não engolida.
- [ ] T008 [P] Testes do repositório de fontes em
      `tv-web/src/lib/catalog/sourceRepository.test.ts`: listagem **nunca**
      devolve usuário/senha; atualização parcial mantém o valor atual;
      alterar credencial invalida a marca de migração; remover fonte leva
      junto catálogo e execuções.
- [ ] T009 [P] Testes do pipeline em
      `tv-web/src/lib/catalog/importPipeline.test.ts`: entrada em fluxo é
      classificada e **só canais** são gravados; contadores distinguem
      lidas de gravadas de descartadas; interrupção no meio preserva a
      geração ativa; segunda execução da mesma fonte é recusada enquanto
      houver uma ativa.
- [ ] T010 [P] Testes de frescor em
      `tv-web/src/lib/catalog/freshness.test.ts`, com instante injetado:
      dentro do prazo não dispara nada; fora do prazo dispara; fonte que
      nunca sincronizou é pendente, não "velha"; relógio para trás não
      gera disparo em laço.

### Implementation

- [ ] T011 [P] Portar o parser para
      `tv-web/src/lib/catalog/m3uParser.ts`, a partir de
      `api/app/services/m3u_parser.py`. **Deve consumir linhas
      incrementalmente** (D-002), nunca exigir o texto inteiro, e
      preservar a detecção de manifesto HLS com a mesma tolerância ao
      `#EXT-X-SESSION-DATA`.
- [ ] T012 [P] Portar o classificador para
      `tv-web/src/lib/catalog/classifier.ts`, a partir de
      `api/app/services/classifier.py`, mantendo as mesmas regras e o
      mesmo caminho de "não classificado".
- [ ] T013 Portar o conector para
      `tv-web/src/lib/catalog/xtreamConnector.ts`, a partir de
      `api/app/services/provider_connector.py`, usando o protocolo já
      mapeado em
      `sdd/specs/004-conector-xtream-live/contracts/provider-protocol.md`.
      Preserva categoria e identificador do provedor; deriva o formato do
      que a conta permite, nunca assumido.
- [ ] T014 Implementar `tv-web/src/lib/catalog/catalogRepository.ts`
      conforme `contracts/local-storage.md` §2 — leitura sempre da geração
      ativa, escrita em lote, publicação e descarte de geração.
- [ ] T015 Implementar `tv-web/src/lib/catalog/sourceRepository.ts`
      conforme `contracts/local-storage.md` §1, com o acesso à credencial
      isolado e fora de tudo que a interface renderiza (D-005/FR-009).
- [ ] T016 [P] Implementar `tv-web/src/lib/catalog/playbackUrl.ts`: monta
      a URL na hora para fonte de provedor; devolve a URL gravada para
      fonte por URL M3U (`data-model.md` §4).
- [ ] T017 Implementar `tv-web/src/lib/catalog/importPipeline.ts`:
      obtém em fluxo, classifica, descarta o que não é canal, grava em
      lotes numa geração nova e publica ao concluir (D-002/D-004/D-006).
      Erros saem como **categoria**, nunca como mensagem crua de rede.
- [ ] T018 Implementar `tv-web/src/lib/catalog/importWorker.ts` como
      invólucro fino sobre o pipeline (D-003), mantendo parser e
      classificador exportados como funções puras.
- [ ] T019 Acrescentar o arquivo gerado para o Worker à lista `files:` de
      `CCPlayTv/tizen_web_project.yaml` e conferir o nome real emitido
      pelo build (R-002) — ausência aqui só falha na TV.

**Critério de Conclusão**: o pipeline completo existe, é coberto por
testes de unidade e de armazenamento local, e **nenhuma tela mudou** — o
app continua funcionando exatamente como antes pelo caminho atual. Se o
gate da Fase 3 reprovar, o que foi construído aqui é o insumo da decisão,
não trabalho perdido.

**Checkpoint**: o caminho novo existe e é medível.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 - Saber se o aparelho aguenta (Priority: P1) 🎯 GATE

**Objetivo**: medir no aparelho real o custo de obter, interpretar e
guardar um catálogo localmente, e decidir com número se a migração
continua.

**Independent Test**: executar o pipeline contra as duas fontes reais na
TV física, ler os números na tela e compará-los com SC-003 a SC-006.

### Implementation

- [ ] T020 [US1] Criar a superfície de diagnóstico temporária em
      `tv-web/src/features/diagnostics/ImportBenchScreen.tsx`: dispara o
      pipeline para uma fonte escolhida e **mostra na tela** tempo total
      por etapa, entradas lidas, canais gravados, descartados e o
      indicador de memória quando o aparelho expuser (research.md R5).
      Nasce marcada como temporária — é removida na fase Polish.
- [ ] T021 [US1] Alcançar essa tela por controle remoto a partir da Home,
      sem quebrar a navegação existente (`tv-web/src/App.tsx` e
      `tv-web/src/features/home/HomeScreen.tsx`), também de forma
      temporária.
- [ ] T022 [US1] Empacotar e instalar na TV pelo procedimento de
      `.claude/skills/tizen-tv/SKILL.md`.

### Testes da Fase

- [ ] T023 [US1] Medir a **fonte de provedor** real na TV e registrar os
      números observados (SC-003: até 30 s).
- [ ] T024 [US1] Medir a **URL M3U grande** real na TV e registrar os
      números observados (SC-004: até 2 min).
- [ ] T025 [US1] Durante as duas medições, confirmar que o controle
      remoto continua respondendo e o foco nunca fica preso (SC-005), e
      que o app não fecha nem recarrega (SC-006).
- [ ] T026 [US1] Registrar o veredito em `plan.md` → `## Execution Notes`.
      **Se qualquer meta reprovar**: parar aqui e apresentar as opções de
      `quickstart.md` (Cenário A) com o custo de cada uma, aguardando
      decisão antes de seguir para a Fase 4 (FR-022).

**Critério de Conclusão**: existem números reais, observados no aparelho,
para as duas fontes — e um veredito explícito de aprovado ou reprovado.
Reprovar é um resultado válido desta story, não uma falha dela.

**Checkpoint**: a decisão de continuar está tomada com evidência.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - Lista de provedor sem nada ligado além da TV (Priority: P1)

**Objetivo**: cadastrar, importar, navegar e reproduzir uma fonte de
provedor com o backend desligado.

**Independent Test**: com o backend parado, cadastrar a fonte real,
aguardar a importação, abrir a lista de canais e reproduzir um canal.

### Testes da Fase

- [ ] T027 [P] [US2] Teste em
      `tv-web/src/features/home/HomeScreen.test.tsx`: a Home lista fontes
      vindas do repositório local, sem nenhuma chamada HTTP.
- [ ] T028 [P] [US2] Teste em
      `tv-web/src/features/live/LiveScreen.test.tsx`: a lista de canais lê
      do repositório local, preserva categorias na ordem declarada e
      mantém a reconciliação de foco por identidade já existente.
- [ ] T029 [P] [US2] Teste em
      `tv-web/src/features/import/AddSourceScreen.test.tsx`: cadastrar uma
      fonte de provedor dispara o pipeline local e não faz requisição a
      serviço próprio.

### Implementation

- [ ] T030 [US2] Reescrever `tv-web/src/features/import/importApi.ts` para
      falar com `sourceRepository`/`importPipeline` em vez de HTTP,
      preservando os nomes que as telas já consomem sempre que possível
      (a migração é de origem de dados, não de tela).
- [ ] T031 [US2] Reescrever `tv-web/src/features/catalog/catalogApi.ts`
      para ler do `catalogRepository` de forma paginada (FR-005) e
      resolver reprodução por `playbackUrl` (FR-010).
- [ ] T032 [US2] Ajustar `tv-web/src/features/import/AddSourceScreen.tsx`
      para disparar o pipeline local, mantendo a edição de fonte que já
      existe.
- [ ] T033 [US2] Ajustar
      `tv-web/src/features/import/ImportProgressScreen.tsx` para
      acompanhar a execução local, com contadores reais e sem percentual
      inventado.
- [ ] T034 [US2] Ajustar `tv-web/src/features/home/HomeScreen.tsx` e
      `tv-web/src/App.tsx` para o repositório local, removendo a
      dependência de invalidação de consulta remota.

**Critério de Conclusão**: com o backend **desligado**, o ciclo completo
funciona na TV — cadastrar, importar, navegar, reproduzir, fechar e
reabrir sem reimportar.

**Checkpoint**: o caminho principal do produto não depende mais de nada
ligado.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - Lista por URL grande (Priority: P2)

**Objetivo**: importar e navegar uma lista por URL de centenas de
milhares de entradas, sem travar e sem mentir sobre o que foi importado.

**Independent Test**: com o backend desligado, importar a URL M3U real e
navegar o resultado.

### Testes da Fase

- [ ] T035 [P] [US3] Teste em
      `tv-web/src/lib/catalog/importPipeline.test.ts`: quando a escrita é
      rejeitada por falta de espaço, a execução marca truncamento, a
      geração ativa anterior permanece e nada parcial é publicado
      (FR-018).
- [ ] T036 [P] [US3] Teste em
      `tv-web/src/features/import/ImportProgressScreen.test.tsx`: a tela
      declara explicitamente que só canais foram importados e, quando
      houver truncamento, que a lista não coube inteira — sem apresentar
      como catálogo completo (FR-008/FR-018).

### Implementation

- [ ] T037 [US3] Tratar o resultado truncado por armazenamento no
      `importPipeline` e no `catalogRepository`, preservando o que era
      utilizável.
- [ ] T038 [US3] Apresentar os dois estados na interface
      (`ImportProgressScreen.tsx` e onde a fonte aparece na Home): "só
      canais foram importados" e "a lista não coube inteira", ambos como
      informação, não como erro.

**Critério de Conclusão**: a lista grande importa dentro da meta, a
navegação permanece fluida, e as duas limitações estão declaradas na
interface.

**Checkpoint**: o caso pesado é suportado com honestidade.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 4 - Catálogo em dia sem servidor (Priority: P2)

**Objetivo**: mover para o aparelho a decisão de migrar, atualizar por
idade e ressincronizar.

**Independent Test**: com o backend desligado, abrir fonte fresca (nada
acontece), envelhecer a marca e abrir de novo (atualiza sozinho), e usar
a ação de ressincronizar.

### Testes da Fase

- [ ] T039 [P] [US4] Teste em
      `tv-web/src/features/live/LiveScreen.test.tsx`: quando o catálogo é
      substituído durante a navegação, a lista não salta e o item em foco
      continua em foco (FR-015/SC-012).
- [ ] T040 [P] [US4] Teste em `tv-web/src/lib/catalog/freshness.test.ts`
      cobrindo falha de atualização: a marca de sincronização não avança e
      a fonte não vira fonte com erro (FR-016).

### Implementation

- [ ] T041 [US4] Implementar `tv-web/src/lib/catalog/freshness.ts`
      conforme `contracts/local-storage.md` §5, portando a decisão de
      `maybe_refresh_on_open` de `api/app/services/importer.py`.
- [ ] T042 [US4] Ligar a decisão à abertura de fonte em
      `tv-web/src/App.tsx`, substituindo a chamada ao backend, e manter a
      ação explícita de ressincronizar na Home.

**Critério de Conclusão**: os três gatilhos (migração, idade, resync
explícito) funcionam sem backend, e uma falha não degrada a fonte.

**Checkpoint**: o catálogo se mantém em dia sozinho.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 7: User Story 5 - Provedor que recusa conexão direta (Priority: P3)

**Objetivo**: explicar com precisão quando o provedor não aceita conexão
direta do aparelho.

**Independent Test**: apontar uma fonte para um endereço que recuse a
conexão e conferir a mensagem e a saída focável.

### Testes da Fase

- [ ] T043 [P] [US5] Teste em
      `tv-web/src/lib/catalog/xtreamConnector.test.ts`: recusa de conexão
      direta é distinguida de falha de rede e de credencial recusada
      (FR-011).
- [ ] T044 [P] [US5] Teste na tela de progresso: o estado de recusa tem
      pelo menos um elemento focável e texto próprio.

### Implementation

- [ ] T045 [US5] Distinguir a recusa de conexão direta das demais
      categorias de erro no `importPipeline` e no `xtreamConnector`.
- [ ] T046 [US5] Apresentar a explicação e a saída focável na interface,
      sem prender o controle.

**Critério de Conclusão**: as quatro situações de FR-011 produzem
explicações distintas, e nenhuma delas deixa o controle sem saída.

**Checkpoint**: o caso incompatível é tratado com clareza.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: fechar as pontas transversais e a documentação que esta
migração torna desatualizada.

- [ ] T047 Remover a superfície de diagnóstico temporária (T020/T021) e o
      caminho que leva até ela — o que permanece é o pipeline medido, não
      a tela que o mostrou (research.md R5).
- [ ] T048 Revisar todos os pontos onde credencial pode escapar: nenhuma
      exibição após digitada, nenhum registro de diagnóstico, nenhum
      caminho de exportação (FR-009/SC-009), em ciclo de sucesso **e** de
      falha.
- [ ] T049 Atualizar a documentação que esta feature torna desatualizada —
      `README.md` e `CLAUDE.md` descrevem o backend como dono do import e
      do catálogo; corrigir na mesma entrega (constitution, "Documentação
      do Repositório É Canônica").
- [ ] T050 Confirmar que `api/` não foi alterado nesta feature e que a
      suíte do backend continua passando (D-007/FR-021).
- [ ] T051 Rodar a validação completa de `quickstart.md` (Cenários A a F)
      com a TV conectada.

### Checklist de Release

- [ ] Fase 1 (Setup) concluída
- [ ] Fase 2 (Foundational — núcleo portado e pipeline) concluída
- [ ] Fase 3 (US1 — gate de performance) concluída **com veredito
      registrado**
- [ ] Fase 4 (US2 — provedor ponta a ponta) concluída
- [ ] Fase 5 (US3 — lista por URL grande) concluída
- [ ] Fase 6 (US4 — frescor local) concluída
- [ ] Fase 7 (US5 — conexão recusada) concluída
- [ ] Frontend validado (`tsc -b`, `oxlint`, `vitest`, `build:tizen`)
- [ ] Backend intocado e ainda verde (`ruff`, `pytest`)
- [ ] Ciclo completo na TV com o backend **desligado**
- [ ] Nenhuma credencial em tela ou diagnóstico, em sucesso e em falha
- [ ] Superfície de diagnóstico temporária removida
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup — BLOQUEIA todas as user
  stories, inclusive a US1, que mede o pipeline real e não um protótipo.
- **US1 (Fase 3)**: depende do Foundational. **É um gate**: reprovar
  interrompe a Fase 4 em diante até haver decisão (FR-022/D-008).
- **US2 (Fase 4)**: depende da US1 ter aprovado. É a primeira fase que
  faz alguma tela deixar de usar o caminho atual.
- **US3 (Fase 5)**: depende da US2 — reusa o mesmo pipeline e as mesmas
  telas migradas.
- **US4 (Fase 6)**: depende da US2 (precisa das telas já lendo local).
- **US5 (Fase 7)**: depende da US2; independente da US3 e da US4.
- **Polish (Fase 8)**: depende de todas as stories desejadas.

### Parallel Opportunities

- Fase 2: T004-T010 (testes) e T011/T012/T016 (unidades puras sem
  dependência entre si) podem andar em paralelo. T013-T015 e T017-T018
  dependem do schema (T003).
- Fase 4: os três testes de tela (T027-T029) são arquivos diferentes.
- US3, US4 e US5 podem ser trabalhadas em paralelo depois da US2, por
  tocarem áreas distintas.

---

## Implementation Strategy

### Gate primeiro

1. Fase 1: Setup.
2. Fase 2: Foundational — construir o pipeline **sem tocar em tela**.
3. Fase 3: US1 — medir na TV.
4. **PARAR E DECIDIR**: aprovado segue; reprovado apresenta opções e
   aguarda.

### Entrega incremental depois do gate

1. US2 → o caminho principal funciona sem backend → validar isoladamente.
2. US3 → o caso pesado.
3. US4 e US5 → frescor e incompatibilidade, em qualquer ordem.
4. Polish → documentação, limpeza e o roteiro completo na TV.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica.
- Commitar após cada task ou grupo lógico coerente.
- Parar em qualquer checkpoint pra validar a story isoladamente.
- Nenhuma task desta feature altera `api/`.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
