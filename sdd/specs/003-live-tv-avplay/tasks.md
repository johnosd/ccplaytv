---
description: "Template de lista de tasks para implementação de feature"
---

# Tasks: Live TV com catálogo real e reprodução AVPlay

**Input**: Documentos de design de `sdd/specs/003-live-tv-avplay/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), research.md, contracts/playback-api.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Backend Python/FastAPI em `api/`, com rotas em `api/app/routers/`, schemas
  em `api/app/schemas/`, modelos em `api/app/models/` e testes em
  `api/tests/`.
- Frontend React/TS/Vite em `tv-web/`, com telas em `tv-web/src/features/`,
  código sem UI em `tv-web/src/lib/` e testes colocalizados (`*.test.tsx`).
- Projeto de empacotamento Tizen em `CCPlayTv/` (recebe o build via
  `npm run build:tizen`).
- **Sem migração Alembic nesta feature** — `playback_url` já existe na tabela.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: destravar a validação em hardware antes de escrever código de
player, para que uma falha na TV signifique o que parece significar.

- [X] T001 Definir `build.target` e `build.cssTarget` explícitos em
      `tv-web/vite.config.ts`, compatíveis com o engine de referência
      Chromium 108 (ADR-006 §2), confirmando os valores aceitos pela versão
      real do Vite instalada (8.x). Ver `research.md` R0-1 e R-004 do plano.
- [X] T002 Rodar `npm run build` em `tv-web/` e confirmar que o bundle é
      gerado sem erro com o alvo novo; registrar no `plan.md` qualquer
      dependência que o alvo tenha rebaixado ou quebrado.

**Checkpoint**: build de produção mira o engine da TV.

**Registro da Fase**:

- Status: **Concluída** (2026-09-16).
- Feito: `build.target` e `build.cssTarget` fixados em `chrome108` em
  `tv-web/vite.config.ts`, com comentário explicando o porquê e apontando
  para a ADR-006 §2 e o risco R-004.
- Testes executados: `npm run build` (✓ 80 módulos, 280.37 kB JS / 12.06 kB
  CSS), `npm run lint` (oxlint limpo), `npx vitest run` (5 arquivos, 15
  testes, todos passando). Nenhuma iteração de correção foi necessária.
- Pendências: nenhuma. O alvo só é **provado** na TV física (Fase 4) — aqui
  fica provado apenas que o build aceita o alvo e que nada regrediu.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contrato de API e abstração de player — tudo que as duas user
stories consomem.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T003 [P] Teste de contrato: `GET /catalog-items` inclui `playable` e
      **não** inclui `playback_url` nem `url`, em `api/tests/test_catalog_items_api.py`.
- [X] T004 [P] Teste de contrato: `GET /catalog-items/{id}/playback` devolve
      `200` com `url` e `container_hint` para item com URL, em
      `api/tests/test_catalog_items_api.py`.
- [X] T005 [P] Teste de contrato: mesmo endpoint devolve `404` para item
      inexistente ou não publicado e `409` para item publicado sem
      `playback_url`, em `api/tests/test_catalog_items_api.py`.
- [X] T006 [P] Teste unitário da máquina de estados do `PlayerService` com
      adaptador falso — transições `idle → preparing → buffering → playing`,
      `→ error`, e `close()` a partir de qualquer estado — em
      `tv-web/src/lib/player/PlayerService.test.ts`.

### Implementation

- [X] T007 Acrescentar `playable: bool` a `CatalogItemOut` em
      `api/app/schemas/catalog_item.py`, derivado de `playback_url IS NOT NULL`,
      e criar o schema de resposta da reprodução (`item_id`, `kind`, `url`,
      `container_hint`). Conforme `contracts/playback-api.md`.
- [X] T008 Preencher `playable` na montagem da resposta de
      `list_catalog_items` em `api/app/routers/catalog_items.py`, sem expor a
      URL.
- [X] T009 Implementar `GET /catalog-items/{item_id}/playback` em
      `api/app/routers/catalog_items.py`, com os três códigos do contrato,
      cabeçalho de resposta sem cache, e **nenhum log contendo a URL**
      (FR-005; regra 1 do contrato; constitution, Segredos Fora dos Clientes).
- [X] T010 Derivar `container_hint` da URL (`ts`, `m3u8`, …) devolvendo
      `null` quando indeterminado — nunca um palpite — em
      `api/app/routers/catalog_items.py` ou helper adjacente.
- [X] T011 [P] Definir o contrato do `PlayerService` em
      `tv-web/src/lib/player/PlayerService.ts`: estados
      `idle`/`preparing`/`buffering`/`playing`/`error`/`closed`, comandos
      `open(url, region)` / `close()`, callback de mudança de estado, e a
      noção de região de exibição — é o que cumpre o FR-006 (telas não falam
      com o motor) e o FR-007 (`research.md` R0-2/R0-3, D-007).
- [X] T012 [P] Implementar `tv-web/src/lib/player/htmlVideoAdapter.ts`
      (`<video>`, para desenvolvimento no navegador).
- [X] T013 Implementar `tv-web/src/lib/player/avplayAdapter.ts` sobre
      `window.webapis.avplay`, seguindo o padrão de acesso a global Tizen já
      usado em `tv-web/src/lib/tizenExit.ts` (interface local, optional
      chaining, no-op fora da TV): abrir, registrar listeners, declarar a
      região de exibição, preparar de forma assíncrona, reproduzir, parar e
      fechar — traduzindo erros para o estado `error` do contrato.
- [X] T014 Criar `tv-web/src/features/catalog/catalogApi.ts` com os hooks
      TanStack Query de canais e de informação de reprodução, seguindo o
      padrão de `tv-web/src/features/import/importApi.ts` (`apiFetch`,
      `ImportApiError`, chaves de query nomeadas). A busca de reprodução é
      **sob demanda**, nunca disparada por foco (FR-003).

**Checkpoint**: contrato de API e player disponíveis; user stories podem começar.

**Registro da Fase**:

- Status: **Concluída** (2026-09-16).
- Feito: backend com `playable` na listagem e
  `GET /catalog-items/{id}/playback` (200/404/409, `Cache-Control: no-store`,
  `container_hint` derivado só do caminho da URL). Frontend com
  `PlayerService` (máquina de estados própria + transições validadas),
  `avplayAdapter`, `htmlVideoAdapter` e `catalogApi`. O `fetchPlayback` ficou
  **fora** do TanStack Query de propósito: informação de reprodução é
  sensível e expirável, não pode ser cacheada nem revalidada em background.
- Testes executados: `uv run pytest tests/test_catalog_items_api.py` (7
  passaram de primeira), `uv run pytest` completo (47 passaram),
  `npx tsc -b` (limpo), `npm run lint` (limpo),
  `npx vitest run src/lib/player` (8 passaram). Nenhuma iteração de correção
  foi necessária.
- Pendências: `uv run ruff check .` continua vermelho por
  `api/delete_sources.py` (I001), **arquivo pré-existente e fora do escopo
  desta feature** — logado no backlog como `[Bug]` em vez de corrigido
  calado. O código desta feature passa limpo no ruff.

---

## Phase 3: User Story 1 - Ver os canais que realmente importei (Priority: P1) 🎯 MVP

**Objetivo**: a tela de Live TV passa a mostrar os grupos e canais da fonte
importada, substituindo `mockCatalog.ts` no caminho de canais.

**Independent Test**: com uma fonte importada com canais publicados, abrir
Live TV e conferir que grupos e canais correspondem aos da fonte, navegáveis
só por controle remoto (`quickstart.md`, Cenário A).

### Testes da Fase

- [X] T015 [P] [US1] Teste unitário do agrupamento de canais por
      `original_group`, preservando a ordem de declaração da fonte e
      mapeando grupo nulo para "Sem categoria", em
      `tv-web/src/features/live/groupChannels.test.ts`.
- [X] T016 [P] [US1] Teste unitário do teto por grupo: lista truncada no
      limite e sinalização de truncamento, no mesmo arquivo de T015.
- [X] T017 [US1] Teste de componente: estados de carregando, fonte sem
      canais, grupo vazio e erro de carga — cada um com pelo menos um
      elemento focável (FR-013) — em
      `tv-web/src/features/live/LiveScreen.test.tsx`.
- [X] T018 [US1] Teste de componente: canal com `playable: false` aparece na
      lista, focável e marcado como indisponível, e Enter não abre o player
      (FR-012), em `tv-web/src/features/live/LiveScreen.test.tsx`.

### Implementation

- [X] T019 [US1] Passar a fonte ativa para a tela de Live TV em
      `tv-web/src/App.tsx` — hoje `goto({ name: destination })` descarta a
      `source` que a `ListHomeScreen` já tem.
- [X] T020 [US1] Extrair a função pura de agrupamento de canais para
      `tv-web/src/features/live/groupChannels.ts` (ordem da fonte, grupo
      nulo → "Sem categoria", aplicação do teto e sinal de truncamento),
      mantendo-a testável fora do React.
- [X] T021 [US1] Reescrever `tv-web/src/features/live/LiveScreen.tsx` para
      consumir os canais reais via `catalogApi`, removendo o import de
      `CHANNEL_GROUPS` de `mockCatalog.ts`; preservar a navegação 2D atual
      (`useRemoteNav`, `col`/`groupIdx`/`channelIdx`) e resetar o índice de
      canal ao trocar de grupo.
- [X] T022 [US1] Substituir o painel de ruído estático pelo painel de
      informação do canal em foco (slot de logo reservado, nome, grupo, slot
      vazio de "Agora:") em `tv-web/src/features/live/LiveScreen.tsx`, sem
      alterar a geometria quando os dados faltarem (FR-015).
- [X] T023 [US1] Implementar os estados de tela — carregando, fonte sem
      canais, grupo vazio, erro de carga com ação de tentar de novo, e aviso
      de lista truncada — todos com elemento focável, consumindo os tokens da
      ADR-007 em `tv-web/src/features/screens.css`. O aviso de truncamento
      deve deixar claro que fala do limite de exibição, não de "isto é tudo
      que a fonte tem" (FR-016, D-009).
- [X] T023b [US1] Garantir que a tela não exibe contagem total de canais nem
      indicação de "fim do catálogo" (FR-016/D-009) — o catálogo publicado
      pode ser parcial durante uma importação em andamento. É uma restrição
      de **não fazer**: conferir na revisão de `LiveScreen.tsx` e do painel de
      informação que nenhum rótulo sugere completude.
- [X] T024 [US1] Remover `CHANNEL_GROUPS` de
      `tv-web/src/features/catalog/mockCatalog.ts` se nada mais o consumir,
      mantendo `MOVIES`/`SERIES` intactos (D-008).

**Critério de Conclusão**: abrir Live TV numa fonte real mostra grupos e
canais da fonte, com os estados de borda tratados e nenhum dado de exemplo no
caminho de canais. Mover o foco pela lista inteira não dispara nenhuma
requisição de reprodução (SC-006). Cobre FR-001, FR-002, FR-003 (parte),
FR-012 (parte), FR-013, FR-014, FR-015, FR-016; SC-002 e SC-006.

**Checkpoint**: User Story 1 funcional e testável isoladamente — a tela já
tem valor mesmo sem reprodução.

**Registro da Fase**:

- Status: **Concluída** (2026-09-16), pendente da verificação manual do
  Cenário A do `quickstart.md`.
- Feito: `groupChannels` como função pura (ordem da fonte preservada, grupo
  nulo → "Sem categoria", teto com contagem real preservada), `LiveScreen`
  reescrita sobre o catálogo real, painel de informação no lugar do ruído
  estático, estados de carregando/erro/sem canais/grupo vazio — todos com
  elemento focável —, aviso de truncamento redigido para não sugerir
  completude, e `CHANNEL_GROUPS` removido do mock. `App.tsx` passou a
  encaminhar a fonte ativa para a Live TV (só ela; Filmes e Séries seguem no
  mock). Tokens `--surface-deep` e `--player-backdrop` criados para a tela
  não ter cor literal.
- Testes executados: `npx vitest run src/features/live/groupChannels.test.ts`
  (7 passaram de primeira); `npx vitest run src/features/live/LiveScreen.test.tsx`
  (10 passaram, **2 iterações** — as duas primeiras falhas foram seletores
  frouxos meus, não do componente: `getByText` do nome do canal casava também
  no painel de informação, e `.live-column-title` casava primeiro com
  "Grupos"). `npx tsc -b` e `npm run lint` limpos.
- Pendências: os literais de cor `#0b0d12` continuam em Filmes/Séries/detalhes
  (fora do escopo desta feature); saem quando essas telas deixarem o mock
  (itens 9 e 10 do backlog).

---

## Phase 4: User Story 2 - Assistir a um canal de verdade (Priority: P1)

**Objetivo**: Enter num canal abre o player em tela cheia; RETURN encerra a
sessão e devolve o foco ao canal de origem.

**Independent Test**: na TV física, selecionar um canal compatível e
confirmar vídeo e áudio; apertar Voltar e confirmar o foco restaurado
(`quickstart.md`, Cenários B e C).

### Testes da Fase

- [X] T025 [P] [US2] Teste de componente: mover o foco entre canais não
      dispara requisição de informação de reprodução (FR-003, SC-006), em
      `tv-web/src/features/live/LiveScreen.test.tsx`.
- [X] T026 [P] [US2] Teste de componente: Enter repetido no mesmo canal cria
      uma única sessão de reprodução, no mesmo arquivo.
- [X] T027 [US2] Teste de componente: ao fechar o player, o foco volta ao
      canal de origem com o mesmo grupo selecionado (FR-009, SC-003), no
      mesmo arquivo.
- [X] T028 [US2] Teste de componente: RETURN durante `preparing` cancela a
      sessão sem deixar estado pendente, em
      `tv-web/src/features/live/PlayerOverlay.test.tsx`.
- [X] T028b [US2] Teste de componente: no estado `playing` — que por desenho
      não tem elemento focável (D-010) — RETURN continua encerrando a sessão,
      provando que o controle remoto não fica preso, no mesmo arquivo.

### Implementation

- [X] T029 [US2] Criar `tv-web/src/features/live/PlayerOverlay.tsx` como
      camada sobreposta (D-005), consumindo o `PlayerService` e usando
      `useRemoteNav({ modal: true })` para interceptar a tecla antes da lista
      por baixo, como já faz `tv-web/src/components/ConfirmDialog.tsx`.
- [X] T030 [US2] Ligar Enter da lista à abertura da camada em
      `tv-web/src/features/live/LiveScreen.tsx`: buscar a informação de
      reprodução pelo `item_id`, abrir o player, e garantir sessão única.
- [X] T031 [US2] Implementar o fechamento por RETURN: encerrar a sessão,
      interromper o áudio, fechar a camada e devolver o foco ao canal de
      origem (FR-008, FR-009).
- [X] T032 [US2] Renderizar os estados da sessão (preparando, carregando,
      reproduzindo) na camada, garantindo que carregamento não encubra falha
      (FR-007), com estilos em `tv-web/src/features/screens.css`.
- [X] T033 [US2] Selecionar o adaptador em tempo de execução — AVPlay quando
      `window.webapis` existir, `<video>` caso contrário — em
      `tv-web/src/lib/player/PlayerService.ts`, sem que as telas saibam qual
      está ativo (D-007).

**Critério de Conclusão**: no navegador, a camada abre, percorre os estados e
fecha devolvendo o foco. Na TV física, o Cenário C do `quickstart.md` foi
executado e a evidência registrada — **inclusive se o resultado for
negativo**, caso em que a feature não é declarada concluída e o achado vira
encaminhamento. Cobre FR-004 a FR-009; SC-001 e SC-003.

**Checkpoint**: porta V1 da ADR-006 executada e registrada.

**Registro da Fase**:

- Status: **Código completo, checkpoint NÃO fechado** — falta a execução na
  TV física, que é o critério de conclusão desta fase.
- Feito: `PlayerOverlay` como camada dentro da `LiveScreen` (D-005), Enter →
  busca de reprodução pelo id + sessão única, RETURN encerrando de qualquer
  estado, estados de preparando/carregando renderizados, e seleção de
  adaptador em tempo de execução. O pacote Tizen foi gerado e sincronizado em
  `CCPlayTv/` com `VITE_API_URL=http://192.168.0.5:3000`, verificado dentro
  do bundle.
- Testes executados: `npx vitest run src/features/live/PlayerOverlay.test.tsx`
  (9 passaram, **2 iterações**). A primeira rodada falhou por um motivo que
  virou aprendizado registrado no arquivo de teste: espionar
  `resolveAdapterFactory` no módulo **não** intercepta a chamada, porque
  `createPlayerSession` a invoca pela ligação interna do módulo — o
  `<video>` real chegou a ser montado no jsdom. Resolvido usando a costura de
  injeção que o `PlayerService` já expunha (`options.createAdapter`),
  propagada como prop opcional do overlay.
- Pendências: **T043 e T045 — a porta V1 não foi executada.** Nada aqui prova
  que o AVPlay reproduz as fontes deste usuário na Q60D.

---

## Phase 5: User Story 3 - Entender quando não dá para assistir (Priority: P2)

**Objetivo**: falha de reprodução vira mensagem sanitizada com saída focável,
e canal sem URL explica a indisponibilidade em vez de tentar tocar.

**Independent Test**: apontar um canal para uma URL inválida e confirmar que
a falha aparece com as duas ações alcançáveis pelo D-pad.

### Testes da Fase

- [X] T034 [P] [US3] Teste de componente: falha de reprodução mostra
      mensagem com "Tentar de novo" e "Voltar", ambas focáveis, com foco
      inicial numa delas (FR-010), em
      `tv-web/src/features/live/PlayerOverlay.test.tsx`.
- [X] T035 [P] [US3] Teste de componente: "Voltar" a partir do erro retorna
      ao canal que tentou abrir, no mesmo arquivo.
- [X] T036 [US3] Teste: a mensagem de erro renderizada não contém a URL nem
      credenciais (FR-011, SC-005), no mesmo arquivo.
- [X] T037 [US3] Teste: "Tentar de novo" refaz a busca pelo `item_id` e não
      reutiliza uma URL guardada (D-002, regra 3 do contrato), no mesmo
      arquivo.

### Implementation

- [X] T038 [US3] Implementar o estado de erro da camada em
      `tv-web/src/features/live/PlayerOverlay.tsx`, com as duas ações
      focáveis e sem retentativa automática em ciclo (FR-010).
- [X] T039 [US3] Garantir que a mensagem exibida seja sanitizada — sem URL,
      endereço de provedor ou credencial — mesmo quando a origem do erro for
      uma exceção de rede ou do motor (FR-011).
- [X] T040 [US3] Implementar a explicação de canal indisponível ao pressionar
      Enter sobre item com `playable: false`, sem abrir o player (FR-012), em
      `tv-web/src/features/live/LiveScreen.tsx`.

**Critério de Conclusão**: nenhum caminho de falha prende o controle remoto,
e nenhum deles expõe segredo. Cobre FR-010, FR-011, FR-012; SC-004 e SC-005.

**Checkpoint**: caminhos de falha fechados.

**Registro da Fase**:

- Status: **Concluída** (2026-09-16).
- Feito: estado de erro com "Tentar de novo" e "Voltar" focáveis, sem
  retentativa automática; mensagens sanitizadas — a exceção original do motor
  e a de rede são descartadas de propósito, porque costumam embutir a URL;
  retentativa refaz a busca pelo `item_id` em vez de reusar a URL anterior; e
  canal com `playable: false` explica a indisponibilidade sem abrir o player.
  O `409` do contrato (corrida entre listar e reproduzir, achado A-004 do
  Analyze) virou caminho próprio: explica e **não** oferece retentativa,
  porque tentar de novo não resolveria.
- Testes executados: cobertos pelos 9 testes do `PlayerOverlay` e pelos 10 da
  `LiveScreen`. Um deles verifica explicitamente que a tela de erro não contém
  `senha`, `usuario`, o host nem `http`, partindo de uma URL de fixture que
  carrega credenciais embutidas.
- Pendências: nenhuma no código. A verificação com uma falha real de stream
  faz parte do Cenário B/C do `quickstart.md`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: fechar as pontas transversais e registrar a evidência da porta V1.

- [X] T041 Revisar o backend inteiro desta feature procurando log ou
      mensagem que interpole URL/exceção com credencial
      (`api/app/routers/catalog_items.py`), conforme a regra do repositório de
      nunca interpolar `str(exc)` de cliente HTTP.
- [X] T042 Conferir que a tela de Live TV consome apenas tokens da ADR-007,
      sem cor, raio ou tamanho de fonte literal, em
      `tv-web/src/features/screens.css`.
- [ ] T043 Registrar a evidência do Cenário C (modelo, firmware,
      `navigator.userAgent`, contêiner/codec, resultado, erro do AVPlay) na
      seção `## Execution Notes` de `plan.md` e como atualização da porta V1
      na tabela de `sdd/adr/ADR-006-bibliotecas-sdks-ccplay-tv.md` §8.
- [X] T044 Atualizar a documentação que esta feature torna desatualizada, na
      mesma tarefa (constitution, "Documentação do Repositório É Canônica"):
      os itens 5, 6 e 8 de `.planning/backlog.md` com o que foi efetivamente
      consumido, e a seção `## Project status` de `CLAUDE.md`, que hoje
      afirma que Live TV renderiza dados de `mockCatalog.ts` e que "there is
      no real player yet".
- [ ] T045 Rodar a validação completa de `quickstart.md` (Cenários A, B e C).

### Checklist de Release

- [ ] Fase 1 (Setup — alvo de build) concluída
- [ ] Fase 2 (Foundational — contrato + player) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [ ] Backend disponível e validado (`ruff` + `pytest` verdes, Postgres de pé)
- [ ] Frontend disponível e validado (`tsc -b`, `oxlint`, `vitest`, `build`)
- [ ] CORS e conectividade TV↔backend validados (`VITE_API_URL` de LAN,
      `HOST=0.0.0.0`, firewall TCP 3000 — herdado da feature 001)
- [ ] Nenhuma credencial em tela, console ou log, em ciclo de sucesso **e**
      de falha (SC-005)
- [ ] Evidência da porta V1 registrada, positiva ou negativa
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências. Deve vir primeiro — um bundle com
  sintaxe não suportada invalidaria o teste na TV (R-004).
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Story 1 (Phase 3)**: depende do Foundational
- **User Story 2 (Phase 4)**: depende do Foundational e da US1 (a camada abre
  a partir da lista)
- **User Story 3 (Phase 5)**: depende da US2 (o erro acontece dentro da
  camada de reprodução)
- **Polish (Phase 6)**: depende de todas as stories desejadas

### Parallel Opportunities

- T003–T006 (testes da Fase 2) são arquivos diferentes e independentes.
- T011/T012 (contrato do player e adaptador `<video>`) são paralelos ao
  trabalho de backend T007–T010.
- Dentro de cada story, os testes marcados `[P]` são independentes entre si.

---

## Parallel Example: Phase 2

```bash
# Backend e frontend não se bloqueiam nesta fase
Task: "T007 Acrescentar playable a CatalogItemOut"
Task: "T011 [P] Definir o contrato do PlayerService"
Task: "T012 [P] Implementar htmlVideoAdapter"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (alvo de build)
2. Completar Fase 2: Foundational (contrato + player)
3. Completar Fase 3: User Story 1
4. **PARAR E VALIDAR**: Cenário A do `quickstart.md` — a tela já vale por si,
   mesmo sem reprodução

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → catálogo real na tela → entregável
3. US2 → reprodução → **executar a porta V1 na TV antes de seguir**
4. US3 → caminhos de falha fechados

O ponto de parada mais informativo é o fim da Fase 4: é quando se sabe se o
AVPlay reproduz as fontes deste usuário. Se não reproduzir, a Fase 5 continua
valendo (o caminho de erro passa a ser o caminho principal), mas a discussão
sobre formatos — item 1 do backlog — sobe de prioridade.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- **Nunca** copiar valores de `docs/m3u/dados.md` para código, fixtures,
  testes ou commits

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Purpose**: fechar a distância entre o que aconteceu no aparelho em
17/09/2026 — a porta V1 executada, com vídeo e áudio — e o que a
documentação do repositório ainda afirma. Nenhuma task aqui é de código de
produção: a implementação convergiu, a evidência é que não.

Contexto da auditoria: a reprodução foi confirmada na QN50Q60DAGXZD com o
app instalado por `sdb` (ver a skill `tizen-tv`), e dois defeitos que só
existiam em hardware foram corrigidos e verificados em `sdd/bugs/` durante a
mesma sessão.

- [ ] T046 [C-001] Registrar a evidência do Cenário C em `plan.md` →
      `## Execution Notes`: modelo (QN50Q60DAGXZD), resultado (canal
      reproduzindo com vídeo e áudio), sequência de comandos usada
      (`build:tizen` → `tizen build-web` → `tizen package -s
      ccplay_samsung_certificate_4` → `tizen install` → `tizen run`) e
      **declarar explicitamente o que não foi obtido e por quê**: firmware,
      `navigator.userAgent` e contêiner/codec continuam sem registro porque
      a TV não expõe console (`sdb root on` negado, `dlog` vazio, porta 7011
      do Web Inspector fechada). Origem: SC-001, T043.
- [ ] T047 [C-002] Emendar `sdd/adr/ADR-006-bibliotecas-sdks-ccplay-tv.md`
      §8 com uma nota `**Atualização (ADR-006):**` registrando a porta V1
      como executada em 17/09/2026, com o resultado e a limitação de
      evidência do T046 — sem reescrever a linha original. Origem: T043,
      Constitution "Documentação do Repositório É Canônica".
- [ ] T048 [C-004] Em `plan.md`: referenciar
      `sdd/bugs/tecla-voltar-return-nao-funciona-na` e
      `sdd/bugs/live-tv-toca-audio-sem-imagem` nas Execution Notes, e marcar
      **R-005 como `Resolvido:`** — o risco previsto (fundo opaco sobre o
      plano de hardware → áudio sem imagem) se materializou e foi corrigido.
      Registrar também que o FR-008 não era satisfeito no aparelho até a
      correção do `keyCode` 10009. Origem: FR-008, FR-009, plan R-005.
- [ ] T049 [C-003] Executar o **Cenário A** do `quickstart.md` na TV, item a
      item, registrando o resultado de cada um: grupos na ordem da fonte,
      canal sem URL focável e sinalizado, grupo acima do teto com aviso,
      canais sem grupo em "Sem categoria", e foco percorrendo a lista **sem
      disparar requisição** (conferir no log do backend, já que a TV não tem
      aba de rede). Origem: T045, US1 AC1-4, SC-002, SC-006.
- [ ] T050 [C-003] Reexecutar o **Cenário B** do `quickstart.md` no
      navegador de desenvolvimento, que não roda desde as duas correções, e
      confirmar que o adaptador `<video>` não regrediu (fundo preto
      preservado, máquina de estados intacta). Origem: T045, US2, US3.
- [ ] T051 [C-005] Exercitar um **ciclo de falha na TV** (canal com URL
      inválida ou fonte fora do ar) e confirmar: duas ações focáveis,
      mensagem sanitizada, e nenhuma URL, host de provedor ou credencial em
      tela nem no log do backend. Origem: SC-005, US3 AC1-4.
- [ ] T052 [C-006] Decidir o encaminhamento do R-008 — `uv run ruff check .`
      segue vermelho por `api/delete_sources.py` (1 erro I001), arquivo
      alheio a esta feature e já logado como `[Bug]` no backlog. Ou o bug é
      resolvido, ou o item correspondente do Checklist de Release recebe a
      ressalva explícita. Não deixar o checklist em aberto sem motivo
      declarado. Origem: plan R-008.
