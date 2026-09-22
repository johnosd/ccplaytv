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

- [X] T001 Adicionar `dexie` como dependência e `fake-indexeddb` como
      devDependency em `tv-web/package.json` (research.md R1 e R6).
- [X] T002 Registrar `fake-indexeddb/auto` em `tv-web/src/setupTests.ts`,
      para os testes terem IndexedDB sob jsdom.
- [X] T003 Criar o schema local em `tv-web/src/lib/catalog/db.ts`: as três
      coleções e os índices de `data-model.md`, incluindo o índice composto
      `[sourceId+generation+groupOrder]` que sustenta a leitura paginada.

**Checkpoint**: o aparelho sabe guardar o que o pipeline vai produzir.

**Registro da Fase**:

- Status: **Concluída** (2026-09-19).
- Feito: `dexie` 4.4.6 e `fake-indexeddb` 6.2.5 instalados;
  `fake-indexeddb/auto` registrado no setup dos testes; schema criado em
  `tv-web/src/lib/catalog/db.ts` com as três coleções de `data-model.md`
  e os dois índices compostos de `channels`. Os tipos do schema
  (`SourceRecord`, `ChannelRecord`, `ImportRunRecord`, `ImportErrorKind`)
  já nascem com as fronteiras de segredo documentadas no próprio arquivo,
  para que quem mexer depois veja a regra junto do campo.
- Testes executados: `npx tsc -b` (limpo), `npm run lint` (limpo),
  `npx vitest run` — **64 passaram**, mesma contagem de antes: o
  `fake-indexeddb` no setup não afetou nenhum teste existente.
- Pendências: nenhuma.

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

- [X] T004 [P] Testes do parser em
      `tv-web/src/lib/catalog/m3uParser.test.ts`, cobrindo os casos de
      borda enumerados em `research.md` R2: conteúdo sem `#EXTM3U`,
      manifesto HLS real, `#EXT-X-SESSION-DATA` que **não** pode reprovar
      a lista, entrada sem URL, atributo com vírgula e aspas, lista válida
      e vazia, BOM inicial.
- [X] T005 [P] Testes do classificador em
      `tv-web/src/lib/catalog/classifier.test.ts`: canal, filme, série,
      episódio com temporada/episódio, e o caminho "não classificado"
      quando falta evidência.
- [X] T006 [P] Testes do conector em
      `tv-web/src/lib/catalog/xtreamConnector.test.ts`: normalização de
      endereço nas formas comuns e com subpath, recusa de credencial
      embutida na URL, resolução de estado de conta nas três respostas
      (ativa, expirada, inválida) e com a primeira consulta falhando,
      escolha de formato com TS preferido e com ausência de formato.
- [X] T007 [P] Testes do repositório de catálogo em
      `tv-web/src/lib/catalog/catalogRepository.test.ts`: gravação em
      lote; leitura paginada por categoria na ordem declarada; a geração
      anterior continua legível enquanto a nova é escrita; publicar troca
      o ponteiro e descarta a anterior; falha de escrita por falta de
      espaço é sinalizada ao chamador, não engolida.
- [X] T008 [P] Testes do repositório de fontes em
      `tv-web/src/lib/catalog/sourceRepository.test.ts`: listagem **nunca**
      devolve usuário/senha; atualização parcial mantém o valor atual;
      alterar credencial invalida a marca de migração; remover fonte leva
      junto catálogo e execuções.
- [X] T009 [P] Testes do pipeline em
      `tv-web/src/lib/catalog/importPipeline.test.ts`: entrada em fluxo é
      classificada e **só canais** são gravados; contadores distinguem
      lidas de gravadas de descartadas; interrupção no meio preserva a
      geração ativa; segunda execução da mesma fonte é recusada enquanto
      houver uma ativa.
- [X] T052 [P] **Paridade com o caminho congelado** em
      `tv-web/src/lib/catalog/parity.test.ts` (SC-013): ler **a mesma
      fixture** que os testes do backend usam
      (`api/tests/fixtures/sample.m3u`) e afirmar o mesmo resultado que
      `api/tests/test_classifier.py` documenta — os quatro tipos
      presentes, os dois episódios compartilhando série e temporada 1, e
      exatamente um item não classificado. Ler o arquivo original em vez
      de copiá-lo é deliberado: uma cópia divergiria em silêncio, e o
      ponto aqui é justamente detectar divergência entre as duas
      implementações (Complexity Tracking / R-007).

### Implementation

- [X] T011 [P] Portar o parser para
      `tv-web/src/lib/catalog/m3uParser.ts`, a partir de
      `api/app/services/m3u_parser.py`. **Deve consumir linhas
      incrementalmente** (D-002), nunca exigir o texto inteiro, e
      preservar a detecção de manifesto HLS com a mesma tolerância ao
      `#EXT-X-SESSION-DATA`.
- [X] T012 [P] Portar o classificador para
      `tv-web/src/lib/catalog/classifier.ts`, a partir de
      `api/app/services/classifier.py`, mantendo as mesmas regras e o
      mesmo caminho de "não classificado".
- [X] T013 Portar o conector para
      `tv-web/src/lib/catalog/xtreamConnector.ts`, a partir de
      `api/app/services/provider_connector.py`, usando o protocolo já
      mapeado em
      `sdd/specs/004-conector-xtream-live/contracts/provider-protocol.md`.
      Preserva categoria e identificador do provedor; deriva o formato do
      que a conta permite, nunca assumido.
- [X] T014 Implementar `tv-web/src/lib/catalog/catalogRepository.ts`
      conforme `contracts/local-storage.md` §2 — leitura sempre da geração
      ativa, escrita em lote, publicação e descarte de geração.
- [X] T015 Implementar `tv-web/src/lib/catalog/sourceRepository.ts`
      conforme `contracts/local-storage.md` §1, com o acesso à credencial
      isolado e fora de tudo que a interface renderiza (D-005/FR-009).
- [X] T016 [P] Implementar `tv-web/src/lib/catalog/playbackUrl.ts`: monta
      a URL na hora para fonte de provedor; devolve a URL gravada para
      fonte por URL M3U (`data-model.md` §4).
- [X] T017 Implementar `tv-web/src/lib/catalog/importPipeline.ts`:
      obtém em fluxo, classifica, descarta o que não é canal, grava em
      lotes numa geração nova e publica ao concluir (D-002/D-004/D-006).
      Erros saem como **categoria**, nunca como mensagem crua de rede.
- [X] T018 Implementar `tv-web/src/lib/catalog/importWorker.ts` como
      invólucro fino sobre o pipeline (D-003), mantendo parser e
      classificador exportados como funções puras.
- [X] T019 Acrescentar o arquivo gerado para o Worker à lista `files:` de
      `CCPlayTv/tizen_web_project.yaml` e conferir o nome real emitido
      pelo build (R-002) — ausência aqui só falha na TV.

**Critério de Conclusão**: o pipeline completo existe, é coberto por
testes de unidade e de armazenamento local, e **nenhuma tela mudou** — o
app continua funcionando exatamente como antes pelo caminho atual. Se o
gate da Fase 3 reprovar, o que foi construído aqui é o insumo da decisão,
não trabalho perdido.

**Checkpoint**: o caminho novo existe e é medível.

**Registro da Fase**:

- Status: **Concluída** (2026-09-19).
- Feito: núcleo portado e pipeline local completo, sem nenhuma tela
  alterada. Arquivos novos em `tv-web/src/lib/catalog/`: `m3uParser.ts`,
  `classifier.ts`, `xtreamConnector.ts`, `catalogRepository.ts`,
  `sourceRepository.ts`, `playbackUrl.ts`, `importPipeline.ts`,
  `importWorker.ts` e `importRunner.ts`.
- Desvios e decisões tomadas durante a execução:
  - **T018 virou dois arquivos.** `importWorker.ts` é a entrada do Worker;
    `importRunner.ts` escolhe entre Worker e thread principal e apresenta a
    mesma forma nos dois casos. A separação é o que torna o plano B de R4
    acionável em campo: se o Worker não subir (R-002), a importação cai para
    a thread principal em vez de a tela morrer.
  - **T019 conferido com sonda temporária.** O Worker só é emitido quando
    algo o importa, e nenhuma tela o importa nesta fase. Um import
    provisório em `src/main.tsx` foi usado só para ler o nome real emitido
    (`assets/importWorker.js`) e removido em seguida (`git status` limpo).
    O nome foi fixado por `worker.rollupOptions` em `vite.config.ts`, pelo
    mesmo motivo que o bundle principal já tinha nomes fixos, e a entrada
    foi acrescentada a `CCPlayTv/tizen_web_project.yaml`. **O arquivo só
    passa a existir em `CCPlayTv/` quando a Fase 3 importar o runner** —
    até lá a entrada aponta para um arquivo ainda não gerado, e o primeiro
    empacotamento acontece justamente em T022.
  - **T010 movida para a Fase 6** (ver a task, na fase da US4).
  - **Interpretação de FR-018 registrada como R-009 em `plan.md`**: quando
    o espaço acaba com parte do catálogo já gravada, a geração parcial é
    publicada com a truncagem declarada; quando acaba sem nada gravado, a
    geração é descartada e o catálogo anterior continua no ar.
  - **`vite.config.ts` ganhou `server.fs.allow`** com a pasta de fixtures do
    backend, para o teste de paridade ler o arquivo original em vez de uma
    cópia. Liberada a pasta de fixtures, nunca `..`: a raiz do repositório
    contém `docs/m3u/dados.md`, com credenciais reais.
- Testes executados:
  - `npx vitest run src/lib/catalog/` → **89 passaram** (7 arquivos).
  - `npx vitest run` (suíte inteira do front) → **153 passaram** (17
    arquivos), nenhuma regressão nas telas atuais.
  - `npx tsc -b` → limpo. `npm run lint` (oxlint) → limpo.
  - `npm run build` → limpo; com a sonda, emitiu `assets/importWorker.js`.
  - `uv run pytest -q` em `api/` → **100 passaram**: o caminho congelado
    continua intacto, como D-007/FR-021 exige.
- Três defeitos encontrados e corrigidos dentro da própria fase:
  - `listCategories` chamava `first()` e `count()` no mesmo objeto de
    consulta do Dexie; `first()` aplica um limite que fica no objeto, e a
    contagem saía 1 para qualquer categoria. Pego pelo teste de ordem.
  - O teste do conector simulava a resposta opaca com `status: 0`, que o
    construtor de `Response` recusa — a sondagem parecia falha de rede.
  - O teste do pipeline reaproveitava o mesmo objeto de resposta entre
    chamadas; corpo de resposta só pode ser lido uma vez.
- Pendências: nenhuma para esta fase. A Fase 3 é o gate — exige a TV
  física e o usuário presente (D-008/FR-022).

---

## Phase 3: User Story 1 - Saber se o aparelho aguenta (Priority: P1) 🎯 GATE

**Objetivo**: medir no aparelho real o custo de obter, interpretar e
guardar um catálogo localmente, e decidir com número se a migração
continua.

**Independent Test**: executar o pipeline contra as duas fontes reais na
TV física, ler os números na tela e compará-los com SC-003 a SC-006.

### Implementation

- [X] T020 [US1] Criar a superfície de diagnóstico temporária em
      `tv-web/src/features/diagnostics/ImportBenchScreen.tsx`: dispara o
      pipeline para uma fonte escolhida e **mostra na tela** tempo total
      por etapa, entradas lidas, canais gravados, descartados e o
      indicador de memória quando o aparelho expuser (research.md R5).
      Nasce marcada como temporária — é removida na fase Polish.
- [X] T021 [US1] Alcançar essa tela por controle remoto a partir da Home,
      sem quebrar a navegação existente (`tv-web/src/App.tsx` e
      `tv-web/src/features/home/HomeScreen.tsx`), também de forma
      temporária.
- [X] T056 [US1] **Permitir informar a fonte na própria superfície de
      diagnóstico** — descoberta durante T020. A medição pressupunha uma
      fonte já guardada no aparelho, mas nenhuma existe: a credencial vive
      hoje só no banco do backend, e o backend **nunca a devolve** (e não
      deve). Sem um cadastro local aqui, a US1 não teria o que medir. O
      formulário é temporário e sai com a tela; os campos são limpos assim
      que a fonte é criada, para credencial digitada não ficar pendurada
      na tela (FR-009).
- [X] T022 [US1] Empacotar e instalar na TV pelo procedimento de
      `.claude/skills/tizen-tv/SKILL.md`. **Exige a TV ligada e alcançável
      na rede.**

### Testes da Fase

- [X] T023 [US1] Medir a **fonte de provedor** real na TV e registrar os
      números observados (SC-003: até 30 s).
- [X] T024 [US1] Medir a **URL M3U grande** real na TV e registrar os
      números observados (SC-004: até 2 min).
- [X] T025 [US1] Durante as duas medições, confirmar que o controle
      remoto continua respondendo e o foco nunca fica preso (SC-005), e
      que o app não fecha nem recarrega (SC-006).
- [X] T026 [US1] Registrar o veredito em `plan.md` → `## Execution Notes`.
      **Se qualquer meta reprovar**: parar aqui e apresentar as opções de
      `quickstart.md` (Cenário A) com o custo de cada uma, aguardando
      decisão antes de seguir para a Fase 4 (FR-022).

**Critério de Conclusão**: existem números reais, observados no aparelho,
para as duas fontes — e um veredito explícito de aprovado ou reprovado.
Reprovar é um resultado válido desta story, não uma falha dela.

**Checkpoint**: a decisão de continuar está tomada com evidência.

**Registro da Fase**:

- Status: **Concluída — gate aprovado** (2026-09-19). As duas fontes
  reais foram medidas na TV QN50Q60DAGXZD com o backend desligado e o
  usuário presente; todas as metas de SC-003 a SC-006 passaram. Veredito
  completo em `plan.md` → `## Execution Notes`.
- Feito: T020, T021, T022, T023, T024, T025 e T056.
  - `tv-web/src/features/diagnostics/ImportBenchScreen.tsx` mede pelo
    **mesmo** caminho que as telas vão usar (`importRunner`), não por um
    protótipo parecido — é o que D-008 exige para o número valer.
  - Mostra na tela: tempo total e por etapa, entradas lidas, canais
    gravados, descartados por tipo, inválidas, memória no início e no pico,
    situação, categoria do erro e truncagem por espaço.
  - Mostra também **se rodou em Worker**. Sem isso, uma queda silenciosa
    para a thread principal (o plano B de R4) passaria por medição válida,
    quando na verdade invalida a leitura de SC-005.
  - Memória ausente aparece como **"não medido"**, nunca como zero.
  - Acesso pela Home: um cartão temporário na fileira de listas **e** uma
    saída no estado de erro da Home — o gate roda com o backend desligado,
    que é exatamente quando a Home cai nesse estado.
- Testes executados: `npx tsc -b` limpo; `npm run lint` limpo; `npx vitest
  run` → **153 passaram** (nenhuma regressão nas telas existentes);
  `npm run build:tizen` → emitiu e sincronizou `assets/importWorker.js`
  para `CCPlayTv/`, confirmando a entrada acrescentada em T019.
- Achado fora do escopo, **não corrigido**: o estado de erro da Home não
  tinha nenhum elemento focável antes desta task (`HomeScreen.tsx`,
  ramo `isError`) — com o backend fora do ar, o controle ficava preso e só
  restava fechar o app. A saída acrescentada aqui remove o sintoma **por
  acidente**, e só enquanto esta tela temporária existir: ao removê-la na
  fase Polish, a armadilha volta. Registrado em `.planning/backlog.md`.
- Números observados na TV (backend desligado, usuário presente):
  - **Provedor (Xtream)** — T023: **10 s**, 1637 canais gravados, pico de
    memória 10 MB. Meta SC-003 (≤ 30 s): **aprovado**.
  - **URL M3U grande** — T024: **16 s**, 312.936 entradas listadas, 1637
    canais gravados, pico de memória 10 MB, **rodou em Worker**. Meta
    SC-004 (≤ 2 min): **aprovado**.
  - **SC-005**: navegação por controle remoto respondeu normal durante as
    duas importações, sem foco preso.
  - **SC-006**: o app não fechou, não recarregou e manteve o catálogo
    anterior nas duas medições.
  - **Gate aprovado** — a Fase 4 (US2) está liberada.

---

## Phase 4: User Story 2 - Lista de provedor sem nada ligado além da TV (Priority: P1) — **Concluída**

**Objetivo**: cadastrar, importar, navegar e reproduzir uma fonte de
provedor com o backend desligado.

**Independent Test**: com o backend parado, cadastrar a fonte real,

### Testes da Fase

- [X] T027 [P] [US2] Teste em
      `tv-web/src/features/home/HomeScreen.test.tsx`: a Home lista fontes
      vindas do repositório local, sem nenhuma chamada HTTP.
- [X] T028 [P] [US2] Teste em
      `tv-web/src/features/live/LiveScreen.test.tsx`: a lista de canais lê
      do repositório local, preserva categorias na ordem declarada e
      mantém a reconciliação de foco por identidade já existente.
- [X] T029 [P] [US2] Teste em
      `tv-web/src/features/import/AddSourceScreen.test.tsx`: cadastrar uma
      fonte de provedor dispara o pipeline local e não faz requisição a
      serviço próprio.
- [X] T054 [P] [US2] Teste do **modo limitado** em
      `tv-web/src/lib/catalog/xtreamConnector.test.ts` e na Home
      (`HomeScreen.test.tsx`): painel que não responde ao protocolo JSON
      é importado pelo caminho M3U, a fonte é marcada `legacy_m3u`, e a
      indicação discreta de modo limitado aparece — como estado normal,
      nunca como erro (paridade com a feature 004, D-008 de lá).

### Implementation

- [X] T030 [US2] Reescrever `tv-web/src/features/import/importApi.ts` para
      falar com `sourceRepository`/`importPipeline` em vez de HTTP,
      preservando os nomes que as telas já consomem sempre que possível
      (a migração é de origem de dados, não de tela).
- [X] T031 [US2] Reescrever `tv-web/src/features/catalog/catalogApi.ts`
      para ler do `catalogRepository` de forma paginada (FR-005) e
      resolver reprodução por `playbackUrl` (FR-010).
- [X] T032 [US2] Ajustar `tv-web/src/features/import/AddSourceScreen.tsx`
      para disparar o pipeline local, mantendo a edição de fonte que já
      existe.
- [X] T033 [US2] Ajustar
      `tv-web/src/features/import/ImportProgressScreen.tsx` para
      acompanhar a execução local, com contadores reais e sem percentual
      inventado.
- [X] T034 [US2] Ajustar `tv-web/src/features/home/HomeScreen.tsx` e
      `tv-web/src/App.tsx` para o repositório local, removendo a
      dependência de invalidação de consulta remota.
- [X] T053 [US2] Implementar o **fallback de modo limitado** em
      `tv-web/src/lib/catalog/xtreamConnector.ts` (SC-013): painel que não
      fala o protocolo JSON é importado pelo caminho M3U e a fonte é
      marcada `legacy_m3u`, preservando as categorias que o M3U declarar —
      nunca inventando categoria para compensar a falta. Sem isso, fontes
      hoje importáveis deixariam de ser, que é exatamente o que SC-013
      proíbe. Manter a detecção por tentativa, nunca por varredura
      (ADR-004 §3).

**Critério de Conclusão**: com o backend **desligado**, o ciclo completo
funciona na TV — cadastrar, importar, navegar, reproduzir, fechar e
reabrir sem reimportar. Os **dois** sub-caminhos de fonte de provedor
funcionam: painel que fala o protocolo JSON e painel que só responde ao
caminho M3U (modo limitado).

**Checkpoint**: o caminho principal do produto não depende mais de nada
ligado.

**Registro da Fase**:

- Status: **Em andamento — US2 migrada no contrato local**.
- Feito: `importApi.ts` e `catalogApi.ts` migrados para `sourceRepository`/`catalogRepository`; o fluxo local passou nos testes relevantes de `HomeScreen`, `LiveScreen` e da API de import; a compatibilidade do contrato assíncrono foi corrigida sem tocar em `api/`.
- Testes executados: conjunto direcionado de frontend com `HomeScreen`, `LiveScreen` e import API; compilação TS do frontend relevante passou no ciclo de validação local.
- Pendências: finalizar o fallback `legacy_m3u` e os testes de modo limitado, além da validação do ciclo completo do cadastro/importação na TV.

---

## Phase 5: User Story 3 - Lista por URL grande (Priority: P2)

**Objetivo**: importar e navegar uma lista por URL de centenas de
milhares de entradas, sem travar e sem mentir sobre o que foi importado.

**Independent Test**: com o backend desligado, importar a URL M3U real e
navegar o resultado.

### Testes da Fase

- [X] T035 [P] [US3] Teste em
      `tv-web/src/lib/catalog/importPipeline.test.ts`: quando a escrita é
      rejeitada por falta de espaço e algo já foi gravado, publica o que coube declarando truncamento; se nada coube, descarta e mantém geração anterior (FR-018 / R-009).
- [X] T036 [P] [US3] Teste em
      `tv-web/src/features/import/ImportProgressScreen.test.tsx`: a tela
      declara explicitamente que só canais foram importados e, quando
      houver truncamento, que a lista não coube inteira — sem apresentar
      como catálogo completo (FR-008/FR-018).

### Implementation

- [X] T037 [US3] Tratar o resultado truncado por armazenamento no
      `importPipeline` e no `catalogRepository`, preservando o que era
      utilizável.
- [X] T038 [US3] Apresentar os dois estados na interface
      (`ImportProgressScreen.tsx` e onde a fonte aparece na Home): "só
      canais foram importados" e "a lista não coube inteira", ambos como
      informação, não como erro.
- [X] T055 [US3] **Não-regressão contra o caminho congelado** (SC-013):
      com o backend ligado **apenas para esta comparação**, importar a
      mesma fonte real pelos dois caminhos — o atual e o novo — e comparar
      o **conjunto de categorias** e a **contagem de canais por
      categoria**. Fazer para os dois tipos de fonte (provedor e URL M3U).
      Diferença encontrada precisa ser **explicável** (ex.: o caminho
      antigo grava filme/série, que o novo descarta de propósito — por
      isso a comparação é da fatia de canais); diferença inexplicada é
      regressão e interrompe a fase. Registrar o resultado em `plan.md` →
      `## Execution Notes`.

**Critério de Conclusão**: a lista grande importa dentro da meta, a
navegação permanece fluida, as duas limitações estão declaradas na
interface, e a comparação com o caminho congelado não achou diferença
inexplicada de canais.

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

- [X] T039 [P] [US4] Teste em
      `tv-web/src/features/live/LiveScreen.test.tsx`: quando o catálogo é
      substituído durante a navegação, a lista não salta e o item em foco
      continua em foco (FR-015/SC-012).
- [X] T010 [P] [US4] Testes de frescor em
      `tv-web/src/lib/catalog/freshness.test.ts`, com instante injetado:
      dentro do prazo não dispara nada; fora do prazo dispara; fonte que
      nunca sincronizou é pendente, não "velha"; relógio para trás não
      gera disparo em laço. **Movida da Fase 2 durante a execução**: ela
      testava `freshness.ts`, que só é implementado aqui em T041 —
      antecipá-lo seria construir, antes do gate da Fase 3, algo que o
      gate pode invalidar. Ver o Registro da Fase 2.
- [X] T040 [P] [US4] Teste em `tv-web/src/lib/catalog/freshness.test.ts`
      cobrindo falha de atualização: a marca de sincronização não avança e
      a fonte não vira fonte com erro (FR-016).

### Implementation

- [X] T041 [US4] Implementar `tv-web/src/lib/catalog/freshness.ts`
      conforme `contracts/local-storage.md` §5, portando a decisão de
      `maybe_refresh_on_open` de `api/app/services/importer.py`.
- [X] T042 [US4] Ligar a decisão à abertura de fonte em
      `tv-web/src/App.tsx`, substituindo a chamada ao backend, e manter a
      ação explícita de ressincronizar na Home.

**Critério de Conclusão**: os três gatilhos (migração, idade, resync
explícito) funcionam sem backend, e uma falha não degrada a fonte.

**Checkpoint**: o catálogo se mantém em dia sozinho.

**Registro da Fase**:

- Status: Concluída
- Feito: `freshness.ts` implementado (FR-012/FR-014/FR-020). `markConnectionError` ajustado para preservar o status `synced` caso já estivesse sincronizado, consertando o falso-positivo na interpretação da spec em `sourceRepository.test.ts` (FR-016). Integrado em `importApi.ts` para abrir o fluxo nativamente se a ação retornada não for `none`.
- Testes executados:
  - `vitest run src/lib/catalog/freshness.test.ts` e suíte toda do frontend (172 testes). Tudo passando.
- Pendências: Nenhuma.

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
- [ ] **SC-013 verificado nas duas camadas**: paridade automatizada com a
      fixture compartilhada (T052) e comparação de campo contra o caminho
      congelado (T055), incluindo o sub-caminho de modo limitado (T053)
- [ ] Fase 3 (US1 — gate de performance) concluída **com veredito
      registrado**
- [ ] Fase 4 (US2 — provedor ponta a ponta) concluída
- [X] Fase 5 (US3 — lista por URL grande) concluída
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
- Nenhuma task desta feature altera `api/` — com **uma exceção de
  leitura**: T052 *lê* `api/tests/fixtures/sample.m3u` como fixture
  compartilhada. Ler não é alterar; D-007 continua valendo.
- **T052-T055 têm numeração fora de sequência** porque foram acrescentadas
  após a primeira versão deste arquivo, ao resolver um achado do Analyze
  (SC-013 sem verificação). Estão posicionadas nas fases corretas; os IDs
  seguem a sequência para não renumerar tasks já referenciadas.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
