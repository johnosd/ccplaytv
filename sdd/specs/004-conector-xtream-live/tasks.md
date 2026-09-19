---
description: "Template de lista de tasks para implementação de feature"
---

# Tasks: Conector Xtream JSON para canais ao vivo

**Input**: Documentos de design de `sdd/specs/004-conector-xtream-live/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), data-model.md, contracts/provider-protocol.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Backend Python/FastAPI em `api/`, com rotas em `api/app/routers/`, schemas
  em `api/app/schemas/`, modelos em `api/app/models/`, serviços em
  `api/app/services/` e testes em `api/tests/`.
- Migrações Alembic em `api/alembic/versions/` — **esta feature tem
  migração**, ao contrário da 003.
- Frontend React/TS/Vite em `tv-web/`, com telas em `tv-web/src/features/` e
  testes colocalizados (`*.test.tsx`).
- `m3u_parser.py` e `classifier.py` ficam **intocados**: o caminho M3U é o
  fallback desta feature (FR-010).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: colocar no lugar o que todas as stories precisam gravar, antes de
qualquer lógica de protocolo.

- [X] T001 Acrescentar a `api/app/models/source.py` os campos de conta e de
      importação: formatos de reprodução permitidos, modo de importação
      (protocolo JSON × modo limitado) e marca de migração. Ver
      `data-model.md`.
- [X] T002 Acrescentar a `api/app/models/catalog_item.py` o identificador do
      provedor e a referência à categoria do provedor, ambos opcionais —
      itens vindos do caminho M3U não os têm.
- [X] T003 Gerar e revisar a migração Alembic em `api/alembic/versions/`
      correspondente a T001/T002, conferindo que ela roda sobre o banco atual
      (que já tem 321 mil itens) sem exigir reimportação.

**Checkpoint**: o banco sabe guardar o que o conector vai descobrir.

**Registro da Fase**:

- Status: **Concluída** (2026-09-18).
- Feito: `ProviderImportMode` (`xtream_api`/`legacy_m3u`) e três colunas
  novas em `Source` (`provider_import_mode`, `provider_allowed_formats`
  como JSON, `provider_migrated_at`); duas colunas novas em `CatalogItem`
  (`provider_stream_id`, `provider_category_id`), ambas `String` opcional.
  Migração `307ba52e3904` gerada por `alembic revision --autogenerate` — 5
  `ADD COLUMN`, todas nullable, sem rewrite de dado existente.
- Testes executados: `uv run ruff check` nos três arquivos tocados (limpo);
  `uv run alembic upgrade head` sobre o banco real (72 fontes, 321.758
  itens) — aplicou sem erro; consulta pós-migração confirmou a contagem de
  itens intacta e as colunas novas presentes nas duas tabelas.
- Pendências: nenhuma.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a política de rede e a publicação em duas fases — as duas peças
que toda story seguinte usa, e a correção do bug que existe hoje.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar. O
T007 em especial: automatizar atualização (US5) antes de a substituição
funcionar transformaria o R-001 em crescimento automático do banco.

### Testes da Fase

- [X] T004 [P] Teste de regressão do R-001 em
      `api/tests/test_sources_api.py`: importar a mesma fonte duas vezes e
      afirmar que a contagem de itens **não** cresce.
- [X] T005 [P] Teste em `api/tests/test_sources_api.py`: durante uma
      importação em andamento, o catálogo anterior continua legível por
      `GET /catalog-items` (ADR-004 §6).
- [X] T006 [P] Teste em `api/tests/test_sources_api.py`: job que falha no
      meio preserva o catálogo anterior, **não** avança
      `last_successful_sync_at`, e os itens que ele chegou a gravar não
      aparecem como catálogo — nada de catálogo parcial apresentado como
      completo (FR-013, FR-019, FR-023).

### Implementation

- [X] T007 Implementar a publicação em duas fases em
      `api/app/services/importer.py` (D-002; FR-013, FR-019): gravar itens do
      job corrente com `published=False`; ao concluir, publicar os novos e
      remover os dos jobs anteriores daquela fonte numa transação. É o que
      garante ao mesmo tempo a substituição (FR-013) e a impossibilidade de
      catálogo parcial visível (FR-019). Respeitar a lógica de lotes
      existente — a fonte real tem 311k entradas e a remoção não pode virar
      uma transação única.
- [X] T008 Estender `api/app/services/ssrf_guard.py` com um irmão JSON de
      `fetch_text_ssrf_safe`, reusando `validate_url`, os limites e o
      User-Agent de player (D-003). Nenhum cliente HTTP novo fora daqui.
- [X] T009 [P] Teste em `api/tests/test_ssrf_guard.py`: a função JSON recusa
      host bloqueado, respeita o limite de redirecionamentos e carrega o
      User-Agent — mesma cobertura que a versão de texto já tem.

**Critério de Conclusão**: ressincronizar uma fonte deixa de duplicar o
catálogo, o catálogo anterior sobrevive a uma falha, e existe um caminho de
requisição JSON que não escapa da política de rede.

**Checkpoint**: fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: **Concluída** (2026-09-18).
- Feito: publicação em duas fases (D-002) em `importer.py` —
  `_persist_entry` grava `published=False`; ao concluir com sucesso,
  `UPDATE ... SET published=True WHERE import_job_id=job.id` seguido de
  `DELETE ... WHERE source_id=source.id AND import_job_id != job.id`, na
  mesma transação. `_fail` e o ramo de cancelamento de
  `_publish_in_batches` descartam (DELETE) os itens não publicados do job
  que não deu certo, para não acumular lixo órfão. As duas instruções de
  swap são DML de conjunto (Core `update`/`delete`), sem carregar linha por
  linha — **decisão tomada na implementação**: não foi preciso lotizar a
  remoção como o plano havia cogitado (ver Cuidados para Retomada). Irmão
  JSON `fetch_json_ssrf_safe` em `ssrf_guard.py`, delegando a
  `fetch_text_ssrf_safe` (reusa `validate_url` e a config do cliente por
  construção) e decodificando JSON, com `SSRFValidationError` para conteúdo
  não-JSON — o mesmo sinal que o conector usa para detectar painel
  incompatível.
- Testes executados: `uv run ruff check .` (limpo) e `uv run pytest`
  completo — **53 passaram** (47 pré-existentes + 6 novos: T004/T005/T006 +
  as 3 de T009), rodando contra o Postgres real (72 fontes, 321k+ itens no
  banco). O T004 é a prova em produção de que o R-001 morreu.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Ver os canais com as categorias que o provedor declara (Priority: P1) 🎯 MVP

**Objetivo**: a fonte de provedor passa a ser importada pelo protocolo JSON,
com identificador e categorias do provedor preservados.

**Independent Test**: cadastrar uma fonte de provedor, aguardar a importação
e conferir em Live TV que nomes e ordem das categorias correspondem aos do
painel (`quickstart.md`, Cenário A).

### Testes da Fase

- [X] T010 [P] [US1] Teste unitário da normalização de endereço em
      `api/tests/test_provider_connector.py` (novo): as sete formas da tabela
      do `contracts/provider-protocol.md`, incluindo subpath preservado e
      recusa de credencial embutida na URL (FR-003).
- [X] T011 [P] [US1] Teste unitário do mapeamento de categorias e canais para
      a saída normalizada, com payloads JSON fixos, preservando nome e ordem
      das categorias e o identificador por canal (FR-006, FR-007).
- [X] T012 [P] [US1] Teste dos casos que não podem inventar dado: categoria
      com nome vazio, canal cuja categoria não existe na lista, canal sem
      identificador, lista de canais vazia.

### Implementation

- [X] T013 [US1] Reescrever `api/app/services/provider_connector.py`: base
      normalizada, cliente do protocolo JSON sobre o irmão JSON do T008, e
      consultas de categorias e canais ao vivo. `build_m3u_url` deixa de ser
      a fonte de verdade do catálogo (FR-001, FR-002; ADR-006 §4.3).
- [X] T014 [US1] Mapear a resposta para o mesmo `ClassifiedEntry` que o
      parser M3U produz, de modo que `importer.py` não saiba qual protocolo
      respondeu (D-001). O classificador **não** muda (D-007).
- [X] T015 [US1] Ligar o novo conector ao `_acquire`/pipeline em
      `api/app/services/importer.py`, e persistir identificador e categoria
      do provedor em `_persist_entry`.
- [X] T016 [US1] Garantir, em `api/app/routers/catalog_items.py`, que a URL
      de reprodução usa o formato gravado na fonte (FR-008, FR-009) — sem
      mudar o contrato que a feature 003 estabeleceu.

**Critério de Conclusão**: uma fonte de provedor real importa pelo protocolo
JSON, os grupos em Live TV são as categorias do painel na ordem do painel,
cada canal carrega o identificador do provedor, e reproduzir um canal
continua funcionando.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: **Concluída** (2026-09-18).
- Feito: `provider_connector.py` reescrito por completo —
  `normalize_server_address` (7 formas + rejeição de credencial embutida),
  `acquire()` como ponto de entrada único devolvendo `AcquisitionResult`
  (D-001: `importer.py` não sabe se veio do protocolo JSON ou do fallback),
  resolução de status de conta com as 3 tentativas do contrato, distinguindo
  falha de rede (tenta a próxima ação) de erro HTTP (endpoint existe,
  provavelmente credencial — não desperdiça o fallback M3U à toa),
  categorias e canais ao vivo mapeados preservando nome/ordem/identificador,
  formato preferido (TS) derivado do que a conta permite, nunca assumido.
  `ClassifiedEntry` ganhou `provider_stream_id`/`provider_category_id`
  opcionais e `url` passou a aceitar `None` (canal sem formato permitido não
  tem URL inventada). `_persist_entry` grava os dois campos novos.
- Testes executados: `uv run ruff check .` (limpo); `uv run pytest`
  completo — **70 passaram** (era 53; 17 novos entre `test_provider_connector.py`
  e a integração ponta a ponta em `test_sources_api.py`).
  **Achado durante a task, corrigido na mesma** (bloqueava o checkpoint, não
  virou task própria): 5 testes pré-existentes de `test_sources_api.py`
  monkeypatchavam `importer_module.fetch_text_ssrf_safe`, que deixou de ser
  chamado no caminho de provedor (agora é `provider_connector.acquire()`).
  Com `from x import y`, corrigir o nome no módulo errado não tem efeito no
  módulo que de fato usa a função. 2 desses testes **quebraram de verdade**
  (dependiam de DNS real); os outros 3 continuavam "passando" sem exercitar
  o que diziam testar (o mock nunca era chamado). Os 5 foram corrigidos para
  mirar `provider_connector.fetch_json_ssrf_safe`/`fetch_text_ssrf_safe`, e
  um deles revelou a necessidade da distinção HTTP-status × falha de rede
  documentada acima.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Entender o estado real da minha conta (Priority: P1)

**Objetivo**: conta ativa, expirada e credencial inválida viram mensagens
distintas e corretas, e o estado fica registrado na fonte.

**Independent Test**: tentar importar com credencial inválida e, se houver,
com conta expirada, confirmando mensagens distintas (`quickstart.md`,
Cenário B).

### Testes da Fase

- [X] T017 [P] [US2] Teste unitário da sequência de tentativas de status em
      `api/tests/test_provider_connector.py`: primeira consulta sem resposta
      utilizável cai para a seguinte, até resolver (FR-004).
- [X] T018 [P] [US2] Teste unitário da interpretação do resultado: ativa,
      expirada, não autorizada — incluindo as variantes de tipo do indicador
      de autorização, com desconhecido tratado como não autorizado.
- [X] T019 [P] [US2] Teste de contrato em `api/tests/test_sources_api.py`: o
      estado resolvido chega a `connection_state` e, em falha, **não** avança
      `last_successful_sync_at` (FR-016).
- [X] T020 [P] [US2] Teste de sanitização: nenhuma mensagem de erro do
      caminho de provedor contém usuário, senha ou endereço completo
      (FR-018, SC-007).

### Implementation

- [X] T021 [US2] Implementar a resolução de estado da conta no conector,
      conforme a ordem e o mapeamento do `contracts/provider-protocol.md`.
- [X] T022 [US2] Gravar na fonte os formatos permitidos e o estado de conexão
      resultante; propagar para a mensagem que o usuário lê, sem vazar
      segredo (FR-005, FR-008, FR-016).

**Critério de Conclusão**: os três estados produzem mensagens distintas e
corretas, verificados um a um, e a fonte registra o que o painel respondeu.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: **Concluída** (2026-09-18).
- Feito: T021 já estava substancialmente implementado pela Fase 3
  (`_resolve_account_status` já falava a sequência de 3 tentativas e
  interpretava `auth`/`exp_date`) — esta fase completou o que faltava:
  `run_import_job` agora distingue `ProviderAuthError`/`ProviderExpiredError`
  das falhas genéricas de rede/protocolo, marcando
  `source.connection_state = ERROR` só nesses dois casos (FR-016). Falha
  genérica (rede, painel incompatível) **não** degrada o estado — é o mesmo
  cuidado que a atualização por idade da Fase 6 vai exigir (FR-023),
  antecipado aqui de propósito.
- Testes executados: `uv run ruff check .` (limpo); `uv run pytest`
  completo — **92 passaram** (era 70; 22 novos, entre
  `test_provider_connector.py` — sequência de tentativas, variantes de
  `auth`, `exp_date` passado/futuro/malformado — e os dois testes de
  contrato/sanitização em `test_sources_api.py`).
- Pendências: nenhuma.

---

## Phase 5: User Story 3 - Continuar funcionando com painel incompatível (Priority: P2)

**Objetivo**: painel que não fala o protocolo JSON continua sendo importado
pelo caminho M3U, com a fonte sinalizada — sem varredura de caminhos.

**Independent Test**: apontar uma fonte para um painel incompatível e
confirmar que a importação conclui e a Home sinaliza (`quickstart.md`,
Cenário C).

### Testes da Fase

- [X] T023 [P] [US3] Teste em `api/tests/test_sources_api.py`: painel que não
      responde de forma utilizável cai no caminho M3U e a fonte é marcada
      como modo limitado (FR-010).
- [X] T024 [P] [US3] Teste que a detecção **não** tenta caminhos ou portas
      alternativos (ADR-004 §3; D-005) — o número de requisições é o
      esperado, sem varredura.
- [X] T025 [P] [US3] Teste de componente em
      `tv-web/src/features/home/HomeScreen.test.tsx`: fonte marcada como modo
      limitado mostra a indicação; fonte normal não mostra (FR-011).

### Implementation

- [X] T026 [US3] Implementar o fallback no conector e a marcação da fonte
      (D-008: é estado normal, não erro).
- [X] T027 [US3] Expor o modo de importação em
      `api/app/schemas/source.py` e `api/app/routers/sources.py`.
- [X] T028 [US3] Indicação discreta na lista de listas em
      `tv-web/src/features/home/HomeScreen.tsx`, consumindo tokens da ADR-007
      — sem cor, raio ou tamanho de fonte literal.

**Critério de Conclusão**: nenhuma fonte que era importável antes desta
feature deixa de ser (SC-003), e o usuário entende por que uma lista tem
menos estrutura que outra.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: **Concluída** (2026-09-18).
- Feito: o fallback (T026) já existia desde a Fase 3 (`_acquire_legacy_m3u`
  marca `ProviderImportMode.LEGACY_M3U`). Esta fase completou a superfície:
  `SourceOut.provider_import_mode` exposto no schema e no router (T027); a
  Home mostra um selo discreto "Modo limitado" (`.source-card-badge`,
  reusando a linguagem visual de `.live-item-badge` da feature 003 — mesmos
  tokens, borda tracejada, sem cor/raio/fonte literal) só quando
  `provider_import_mode === 'legacy_m3u'` (T028). Confirmado por teste
  dedicado que a detecção usa exatamente 4 requisições (3 tentativas de
  status + 1 fallback M3U) — nunca mais, sem varredura (T024).
- Testes executados: backend `uv run ruff check .` (limpo) e
  `uv run pytest` — **94 passaram** (era 92). Frontend `npx tsc -b` (limpo),
  `npm run lint` (limpo), `npx vitest run` — **59 passaram** (era 57).
- Pendências: nenhuma.

---

## Phase 6: User Stories 4 e 5 - Migração única e atualização por idade (Priority: P2)

**Objetivo**: listas antigas passam a usar o conector novo sozinhas, uma
vez; e catálogo velho se atualiza sem o usuário pedir, sem re-baixar a cada
abertura.

**Independent Test**: abrir uma fonte não migrada e confirmar migração em
segundo plano; abrir de novo e confirmar que nada dispara; abrir uma fonte
fora do prazo e confirmar atualização (`quickstart.md`, Cenário E).

### Testes da Fase

- [X] T029 [P] [US4] Teste em `api/tests/test_sources_api.py`: abrir fonte
      não migrada dispara job; abrir de novo (já migrada **e dentro do
      prazo**) **não** dispara nada (FR-012, FR-014, SC-009).
- [X] T030 [P] [US5] Teste: fonte cuja última sincronização passou do prazo
      dispara atualização ao abrir; dentro do prazo, não dispara (FR-020,
      SC-011).
- [X] T031 [P] [US4] Teste: duas aberturas quase simultâneas não criam dois
      jobs para a mesma fonte (FR-017).
- [X] T032 [P] [US5] Teste: atualização que falha não avança
      `last_successful_sync_at` nem degrada o estado da fonte (FR-023).
- [X] T033 [P] [US5] **Teste de regressão do resync explícito** (FR-021): com
      o ponto de entrada novo no lugar, `POST /sources/{id}/resync` continua
      disparando importação na hora, independente da idade da fonte e do
      estado de migração. A ação existe hoje na Home e o T034 mexe justamente
      no fluxo de abertura — é o caminho onde uma regressão passaria
      despercebida.

### Implementation

- [X] T034 [US4] Implementar no backend a decisão de frescor (D-004): um
      ponto de entrada que recebe "esta fonte foi aberta" e decide migrar,
      atualizar por idade ou não fazer nada, em `api/app/routers/sources.py`
      + `api/app/services/importer.py`. As duas exceções que re-baixam são a
      idade e o resync explícito (FR-014).
- [X] T035 [US5] Aplicar o prazo de 24 h como valor de configuração, não
      literal espalhado (FR-020).
- [X] T036 [US4] Chamar esse ponto de entrada ao abrir uma fonte, em
      `tv-web/src/features/import/importApi.ts` e no fluxo que leva à
      `ListHomeScreen` — a TV avisa, não decide (D-004).
- [X] T037 [US5] Garantir que a substituição de catálogo em segundo plano não
      desorganiza a navegação em curso: reconciliação por identificador do
      item, nunca por índice (FR-022, SC-012; constitution, "Voltar Restaura
      Foco e Posição").

**Critério de Conclusão**: uma lista antiga se atualiza sozinha uma vez,
listas frescas não geram tráfego ao abrir, listas velhas se atualizam em
segundo plano, e nada disso faz a tela saltar embaixo do usuário.

**Checkpoint**: User Stories 4 e 5 funcionais e testáveis isoladamente.

**Registro da Fase**:

- Status: **Concluída** (2026-09-18).
- Feito: **Backend** — `maybe_refresh_on_open()` em `importer.py` decide
  migrar/atualizar/nada (D-004), com guarda de job ativo (FR-017) e as duas
  exceções nomeadas que re-baixam fora dessa decisão (idade e resync
  explícito). `STALE_AFTER = timedelta(hours=24)` como constante nomeada
  (FR-020). Endpoint `POST /sources/{id}/open` + `OpenSourceResponse`.
  **Frontend** — `useOpenSource()` chamado em `App.tsx` ao abrir uma fonte
  (fogo e esquece, a navegação não espera a decisão); job disparado
  acompanhado via `useImportJob` já existente, e ao terminar invalida
  `['catalog-items']`/`['sources']` — quem estiver com Live TV montada
  revalida sozinho. **`LiveScreen.tsx` refeito**: `groupIdx`/`channelIdx`
  deixaram de ser estado e passaram a ser **derivados a cada render** da
  identidade focada (nome do grupo + id do canal) contra os grupos atuais —
  elimina de vez o risco de índice apontando pro item errado depois de uma
  troca de catálogo, sem depender de timing de efeito.
- Testes executados: backend `uv run ruff check .` (limpo) e
  `uv run pytest` — **100 passaram** (era 94; 6 novos T029-T033, mais
  `test_open_unknown_source_returns_404`). Frontend `npx tsc -b` (limpo),
  `npm run lint` (limpo, inclusive o aviso `set-state-in-effect` que
  motivou trocar `useEffect`+ref por derivação em render em `App.tsx`),
  `npx vitest run` — **62 passaram** (era 59).
  **Achado metodológico durante a task**: as duas primeiras versões de
  teste de reconciliação (`useEffect` e depois a derivação em render) davam
  o MESMO resultado incorreto — o que apontava pro teste, não pro
  componente. Causa: o helper `renderLive()` reusava a MESMA referência de
  elemento JSX entre `render()` e `rerender()`; o React aplica bailout por
  identidade referencial na subárvore inteira nesse caso, e `LiveScreen`
  nunca re-executava de verdade — o teste "de reordenação" só passava por
  coincidência (nada mudava, e o estado antigo já batia com a expectativa).
  Corrigido construindo um elemento novo a cada chamada de `rerenderLive()`;
  com isso, os 3 testes da reconciliação (reordena, canal some, grupo some)
  passam de verdade. Ver Cuidados para Retomada.
- Pendências: nenhuma.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: fechar as pontas transversais e verificar no aparelho.

- [X] T038 Revisar todos os pontos de saída do caminho de provedor procurando
      interpolação de `str(exc)` de httpx ou qualquer log que embuta a URL
      (FR-018, SC-007), e confirmar que nenhuma chamada nova escapa da
      política de rede (FR-015, SC-010).
- [X] T039 Conferir que a indicação nova na Home consome apenas tokens da
      ADR-007.
- [X] T040 Atualizar a documentação que esta feature torna desatualizada: a
      seção de desvio conhecido em `CLAUDE.md` (que descreve o
      `build_m3u_url` como estado atual) e o item 1 da Fase 0 em
      `.planning/backlog.md`.
- [X] T041 Rodar a validação completa de `quickstart.md` (Cenários A a E),
      com a TV conectada. É onde fecham os critérios que só a execução
      observa: SC-001 e SC-002 (categorias e identificadores reais), SC-003
      (nenhuma fonte deixou de importar), SC-004 (três estados de conta),
      SC-005 (formato vindo do permitido), SC-006 (reprodução na TV),
      SC-008 (catálogo navegável durante a atualização) e SC-012 (a lista não
      salta na troca).
- [X] T042 *(descoberta durante T041)* Adicionar índices em
      `catalog_items.source_id`, `catalog_items.import_job_id` e
      `catalog_items.parent_id` — sem eles, apagar/substituir o catálogo de
      uma fonte real (300k+ linhas) faz o Postgres varrer a tabela inteira
      por linha apagada pra checar a FK auto-referenciada `parent_id`,
      travando por dezenas de minutos e bloqueando outras conexões.
- [X] T043 *(descoberta durante T041)* Restringir a limpeza da publicação em
      duas fases (`_publish_in_batches`) a `kind=CHANNEL` quando a aquisição
      veio do protocolo JSON (`ProviderImportMode.XTREAM_API`) — sem isso,
      migrar uma fonte pro conector novo apagava silenciosamente
      filme/série/episódio que o caminho M3U antigo já tinha importado,
      mesmo o job novo nunca tendo tocado nesses tipos.

### Checklist de Release

- [X] Fase 1 (Setup — modelo e migração) concluída
- [X] Fase 2 (Foundational — publicação em duas fases e política de rede) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Fase 6 (User Stories 4 e 5) concluída
- [X] Backend disponível e validado (`alembic upgrade head`, `ruff` e `pytest` verdes — 100 testes)
- [X] Frontend disponível e validado (`tsc -b`, `oxlint`, `vitest` — 62 testes, `npm run build` — 86 módulos, limpo)
- [X] Ressincronizar não duplica o catálogo (R-001 morto, com teste de regressão contra o Postgres real)
- [X] Nenhuma credencial em tela, resposta de API ou log, em ciclo de sucesso **e** de falha (SC-007) — verificado por teste automatizado (T038) e por inspeção manual em dois ciclos reais na TV (cadastro com credencial válida da "Vip"; nenhuma URL/senha impressa em log, banco ou relatório)
- [X] Reprodução na TV física continua funcionando (SC-006) — confirmado duas vezes (fonte "Lista Real" pós-migração, e fonte "Vip" criada do zero)
- [X] `quickstart.md` executado com sucesso — Cenários A, D e E verificados na TV física; B e C parcialmente/não observados (ver Registro da Fase abaixo) — não é reprovação, é ausência de infraestrutura de teste (conta expirada, painel não-JSON)

#### Registro da Fase — Polish (T038-T043)

- Status: Concluída.
- Feito: T038-T040 já fechados em sessão anterior. T041 executado nesta
  sessão com a TV física (QN50Q60DAGXZD) e o backend na LAN
  (`192.168.0.5:3000`):
  - **Cenário A (US1)** — verificado ponta a ponta duas vezes: (1) fonte
    "Lista Real" pré-existente, migrada do caminho antigo pra
    `xtream_api` via abertura (D-004); (2) fonte "Vip" **cadastrada do
    zero na TV**, usuário/senha/DNS reais digitados pelo controle remoto.
    Nos dois casos: import concluiu (2266 canais, únicos, sem
    filme/série/episódio — só o que o conector novo fala), categorias em
    Live TV batem com as do provedor (confirmado visualmente pelo
    usuário), reprodução de canal funcionou (áudio + vídeo, sem regressão
    da 003), e o banco confirma `provider_stream_id` preenchido em 100%
    dos canais das duas fontes.
  - **Cenário B (US2)** — não executado: não havia conta com credencial
    inválida nem assinatura expirada disponível pra reproduzir na TV.
    Os três estados (`ProviderAuthError`/`ProviderExpiredError`/sucesso)
    continuam cobertos por `test_provider_connector.py` e
    `test_sources_api.py`, mas isso é evidência de unidade, não de TV —
    registrado como não observado, não como aprovado.
  - **Cenário C (US3)** — não aplicável como caminho principal: o painel
    real fala o protocolo JSON (confirmado pelo `provider_import_mode:
    xtream_api` das duas fontes), então o caminho de modo limitado nunca
    foi exercitado por infraestrutura real nesta rodada. Continua coberto
    pelos testes automatizados do fallback `LEGACY_M3U`.
  - **Cenário D (substituição do catálogo, R-001)** — verificado: contagem
    de "Lista Real" foi de 1637 (import antigo) pra 2266 (novo, dado real
    do provedor mudou no intervalo) **sem duplicar** — confirmado por
    contagem direta no Postgres antes/depois. Resync explícito disparado
    duas vezes: uma via API (diagnóstico), outra **pelo controle remoto
    de verdade** (D-pad até o card → seta baixo revela
    Ressincronizar/Excluir → OK), completando sem travar a tela.
  - **Cenário E (frescor, US4/US5)** — migração única confirmada (fonte
    velha só teve um ciclo de import ao abrir, e ficou marcada
    `xtream_api`/`provider_migrated_at`); fonte velha (>24h) disparou
    atualização em segundo plano sozinha ao abrir (D-004); navegação e
    reprodução continuaram funcionando **durante** a atualização em
    segundo plano (o usuário tocou um canal enquanto o job de resync ainda
    rodava, sem erro).
  - **Achados fora do previsto em `quickstart.md`**, ambos corrigidos e já
    registrados como T042/T043 acima e em `## Riscos e Decisões`.
  - **Efeito colateral do trabalho de verificação**: o banco de
    desenvolvimento tinha ~415 fontes de teste acumuladas (R-007, geradas
    por rodadas de `pytest` contra o mesmo banco manual) — removidas a
    pedido do usuário antes do teste de cadastro, restando só a fonte
    real. Isso não afeta nenhum ambiente além deste banco local.
- Testes executados: backend `uv run ruff check .` + `uv run pytest` —
  **100 passaram** (sem mudança de contagem — T042/T043 não têm teste
  unitário dedicado, validados pela reprodução real na TV + regressão
  completa verde). Frontend `npx tsc -b`, `npm run lint`, `npx vitest run`
  — **64 passaram** (era 62; +2 do bugfix
  `enter-controle-remoto-nao-ativa-botoes`, ver abaixo).
- **Bug fora do escopo desta feature, corrigido à parte**: durante o T041 o
  usuário reportou que o controle remoto físico não conseguia trocar pra
  aba "Endereço, usuário e senha" em "Adicionar lista" — `useRemoteNav`
  suprimia a ativação nativa do botão focado mesmo sem um `onSelect` pra
  substituí-la. Não é código desta feature (é de `001-importacao-fonte-m3u`),
  então foi tratado via `sdd-bugfix` própria, não como task desta feature:
  ver `sdd/bugs/enter-controle-remoto-nao-ativa-botoes/` (`verified`,
  2026-09-18). Sem esse fix, T041 não teria como prosseguir com cadastro
  novo pelo controle.
- Pendências: nenhuma bloqueante. Cenário B fica como item futuro se algum
  dia existir uma conta de teste expirada/inválida real; Cenário C fica
  como está (coberto só por unidade) até o painel real deixar de falar
  JSON ou surgir um segundo provedor pra testar.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup — BLOQUEIA todas as user
  stories. O T007 (publicação em duas fases) é pré-requisito **duro** da
  Fase 6: automatizar atualização antes disso faria o banco crescer sozinho.
- **US1 (Fase 3)**: depende do Foundational.
- **US2 (Fase 4)**: depende da Fase 3 — o estado da conta é resolvido pelo
  mesmo cliente do conector.
- **US3 (Fase 5)**: depende da Fase 3 (precisa existir o caminho JSON para
  haver fallback dele).
- **US4/US5 (Fase 6)**: dependem da Fase 3 e, criticamente, do T007.
- **Polish (Fase 7)**: depende de todas as anteriores.

### Parallel Opportunities

- Dentro de cada fase, as tasks `[P]` são arquivos diferentes sem
  dependência — quase todos os testes unitários do conector.
- T008 (irmão JSON do guardião) e T007 (publicação em duas fases) tocam
  arquivos distintos e podem andar em paralelo dentro da Fase 2.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1: modelo e migração.
2. Fase 2: publicação em duas fases + política de rede.
3. Fase 3: conector falando o protocolo, categorias e identificadores reais.
4. **PARAR E VALIDAR**: Cenário A do `quickstart.md`, com reprodução na TV.

### Incremental Delivery

1. Setup + Foundational → o bug de duplicação morre e existe caminho JSON seguro.
2. US1 → catálogo com estrutura do provedor → validar isoladamente (MVP).
3. US2 → mensagens de conta precisas.
4. US3 → nenhuma fonte antiga deixa de funcionar.
5. US4/US5 → frescor sem carga redundante.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- **Nunca** copiar valores de `docs/m3u/dados.md` para código, fixtures,
  testes ou commits
- O banco de desenvolvimento tem fontes criadas pela suíte de testes (R-007):
  ao verificar à mão, confirmar pelo nome qual fonte é a real

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
