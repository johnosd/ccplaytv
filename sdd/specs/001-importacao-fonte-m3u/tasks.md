---
description: "Tasks: Importação de Fonte M3U por URL e por Provedor"
---

# Tasks: Importação de Fonte M3U por URL e por Provedor

**Input**: `sdd/specs/001-importacao-fonte-m3u/{spec.md,plan.md,research.md,data-model.md,contracts/import-api.md,quickstart.md}`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-api.md

**Organization**: Tasks agrupadas por user story (US1 = URL, US2 = Provedor, US3 = Cancelar) para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2, US3)

## Path Conventions

- Backend: `api/` (Python/FastAPI/uv) — código novo em `api/app/`, migrações em `api/alembic/`, testes em `api/tests/`.
- Frontend: `tv-web/` (React/TypeScript/Vite) — código novo em `tv-web/src/features/import/`.
- Infraestrutura: `docker-compose.yml` na raiz do repositório.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Provisionar dependências, banco local e test runners que nada nesta feature funciona sem.

- [x] T001 Criar `docker-compose.yml` na raiz com serviço `postgres` (imagem `postgres:16`, volume nomeado, porta mapeada, variáveis lidas de `api/.env`).
- [x] T002 Adicionar `DATABASE_URL` a `api/.env` (e a um `api/.env.example` sanitizado, sem senha real).
- [x] T003 [P] Adicionar dependências de runtime ao backend em `api/pyproject.toml`: `sqlalchemy[asyncio]`, `alembic`, `psycopg[binary]`, `httpx`, `m3u-ipytv`; rodar `uv sync` em `api/`.
- [x] T004 [P] Adicionar dependências de dev ao backend em `api/pyproject.toml`: `pytest`, `pytest-asyncio`, `ruff`; rodar `uv sync` em `api/`.
- [x] T005 [P] Adicionar `@tanstack/react-query` a `tv-web/package.json` e instalar.
- [x] T006 [P] Adicionar `vitest` (+ `@testing-library/react` se necessário para os testes de `importApi.ts`) a `tv-web/package.json` e configurar script `test` em `package.json`.
- [x] T007 Inicializar Alembic em `api/alembic/` (`alembic.ini` + `api/alembic/env.py` apontando para `DATABASE_URL` de `api/.env`).

**Checkpoint**: `docker compose up -d postgres` sobe um Postgres acessível; `uv run pytest` e `npx vitest run` rodam (mesmo sem testes ainda) sem erro de configuração.

**Registro da Fase**:

- Status: Concluída
- Feito: `docker-compose.yml` (postgres:16); `DATABASE_URL` em `api/.env`/`.env.example`; deps de runtime (sqlalchemy[asyncio], alembic, psycopg[binary], httpx, m3u-ipytv) e dev (pytest, pytest-asyncio, ruff) via `uv add`; `@tanstack/react-query`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` no frontend; `alembic init` + `env.py` lendo `DATABASE_URL` via `python-dotenv` (metadata já apontado para `app.db.Base`, criado na Fase 2).
- Testes executados: `docker compose up -d postgres` (container `ccplaytv-postgres-1` up); `uv run pytest` (exit 5, "no tests ran" — esperado, 0 arquivos ainda); `npx vitest run` (exit 1, "No test files found" — esperado).
- Pendências: nenhuma.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Modelos de dados, engine de banco, guarda de SSRF e detecção de manifesto HLS — infraestrutura que **todas** as user stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [x] T008 Criar `api/app/db.py` com engine assíncrono SQLAlchemy 2 e `async_sessionmaker`, lendo `DATABASE_URL` de `Settings` (`api/main.py`).
- [x] T009 [P] Criar modelo `api/app/models/source.py` (`Source`: `id`, `type`, `display_name`, `m3u_url`, `provider_dns`, `provider_username`, `provider_password`, `connection_state`, `created_at`, `updated_at`, `last_successful_sync_at`) conforme `data-model.md`.
- [x] T010 [P] Criar modelo `api/app/models/import_job.py` (`ImportJob`: estados, `current_step`, contadores, `warnings`, `request_key` único, `cancel_requested_at`, timestamps) conforme `data-model.md`.
- [x] T011 [P] Criar modelo `api/app/models/catalog_item.py` (`CatalogItem`: `kind`, `parent_id` self-FK, `original_group`, `season_number`/`episode_number`, `playback_url`, `published`) conforme `data-model.md`.
- [x] T012 Gerar e aplicar a migração inicial Alembic para as três tabelas (`uv run alembic revision --autogenerate` + `uv run alembic upgrade head`).
- [x] T013 [P] Criar `api/app/services/ssrf_guard.py`: valida esquema `http`/`https`, resolve host, bloqueia loopback/link-local/privado/metadata, revalida a cada redirecionamento (research.md R3).
- [x] T014 [P] Criar `api/app/services/m3u_parser.py`: interface `M3UParser` sobre `ipytv`, incluindo detecção de manifesto HLS (master/media playlist) para não classificar segmentos como canais (FR-009).
- [x] T015 [P] Criar `api/app/services/classifier.py`: classifica cada entrada parseada em `channel`/`movie`/`series`/`episode`/`unclassified` usando as regras de `research.md` R5; produz `series_key` para agrupar episódios (resolução para `parent_id` real fica no importer, T024 — ver nota em `data-model.md`).
- [x] T016 [P] Criar fixture sintética `api/tests/fixtures/sample.m3u` (canais, filmes e episódios de exemplo, sem dado real) para os testes desta e das próximas fases.

### Testes da Fase

- [x] T017 [P] `api/tests/test_ssrf_guard.py` — cobre URL http/https válida, esquema bloqueado, host privado/loopback/metadata bloqueado, redirecionamento revalidado, limite de tamanho.
- [x] T018 [P] `api/tests/test_classifier.py` — cobre canal por grupo, filme, série com episódios agrupados por `series_key`, item ambíguo → `unclassified`, manifesto HLS rejeitado.

**Checkpoint**: Modelos migrados no Postgres local; guarda de SSRF e classificador testados isoladamente, sem nenhuma rota HTTP ainda.

**Registro da Fase**:

- Status: Concluída
- Feito: `app/db.py` (engine assíncrono + `Base`); modelos `Source`/`ImportJob`/`CatalogItem`; migração inicial Alembic gerada e aplicada no Postgres local; `ssrf_guard.py` (validação de esquema/host + fetch streaming com revalidação de redirect e limite de tamanho); `m3u_parser.py` (interface sobre `ipytv` + detecção de manifesto HLS); `classifier.py` (heurística Canal/Filme/Série+Episódio/Não Classificado); fixture `sample.m3u`; `Settings.database_url` e CORS (`allow_methods` incluindo `POST`) em `api/main.py`.
- Testes executados: `uv run pytest -v` → 13 passed; `uv run ruff check .` → 10 achados, todos auto-corrigidos com `--fix`, depois `All checks passed!`; testes re-executados após o fix → 13 passed novamente.
- Pendências: nenhuma. Nota de desvio: `T015` produz `series_key` em vez de `parent_id` diretamente (classifier não tem sessão de banco) — `parent_id` real é resolvido pelo importer na Fase 3.

---

## Phase 3: User Story 1 - Adicionar fonte por URL M3U (Priority: P1) 🎯 MVP

**Objetivo**: Uma pessoa informa uma URL M3U válida e acompanha a importação até o catálogo básico publicado.

**Independent Test**: `POST /sources` com `type=m3u_url`, `GET /import-jobs/{id}` até `status=completed`, `GET /catalog-items?source_id=...` retorna itens classificados.

### Testes da Fase

- [x] T019 [P] [US1] `api/tests/test_sources_api.py::test_create_source_by_url_and_job_completes` — cria fonte por URL apontando pra `sample.m3u` servido localmente no teste, aguarda job `completed`, confere contadores (FR-006) e catálogo publicado (FR-011).
- [x] T020 [P] [US1] `api/tests/test_sources_api.py::test_invalid_url_never_reports_success` — URL retornando HTML de erro / vazia nunca chega a `completed` (FR-013, SC-004).
- [x] T021 [P] [US1] `api/tests/test_sources_api.py::test_missing_display_name_rejected` — `display_name` vazio é rejeitado (FR-001).
- [x] T022 [P] [US1] `tv-web/src/features/import/importApi.test.tsx` — hook de criação de fonte e polling de job, mockando a API.
- [x] T052 [P] [US1] `api/tests/test_import_jobs_api.py::test_network_failure_allows_manual_retry` — falha de rede na aquisição da URL M3U resulta em `ImportJob` `failed` com erro específico; `POST /import-jobs/{id}/retry` cria um novo `ImportJob` para a mesma `Source` sem duplicar a `Source` (FR-015, sem retry automático).

### Implementation

- [x] T023 [US1] `api/app/schemas/source.py` + `api/app/schemas/import_job.py` (+ `catalog_item.py`): schemas Pydantic de request/response conforme `contracts/import-api.md` (nunca serializa `provider_password`).
- [x] T024 [US1] `api/app/services/importer.py`: orquestra o ciclo do `ImportJob` (acquiring → parsing → classifying → publishing) via `BackgroundTasks`, usando `ssrf_guard`, `m3u_parser` e `classifier`; publica `CatalogItem` em lotes (`published=true` só ao final de um lote coerente, FR-011).
- [x] T025 [US1] `api/app/routers/sources.py`: `POST /sources` (cria `Source` + `ImportJob`, idempotente por `request_key`, FR-018) e `api/app/routers/import_jobs.py`: `GET /import-jobs/{id}`.
- [x] T026 [US1] `api/app/routers/catalog_items.py`: `GET /catalog-items` (filtra `published=true` por padrão, FR-011).
- [x] T027 [US1] Registrar os três routers em `api/main.py` (+ `app_db.configure(settings.database_url)` na inicialização).
- [x] T028 [P] [US1] `tv-web/src/features/import/importApi.ts`: client HTTP + hooks `@tanstack/react-query` (`useCreateSource`, `useImportJob` com polling).
- [x] T029 [P] [US1] `tv-web/src/features/import/AddSourceScreen.tsx`: formulário com opção URL (nome de exibição obrigatório + URL), navegável só por teclado/setas.
- [x] T030 [US1] `tv-web/src/features/import/ImportProgressScreen.tsx`: exibe `status`, `current_step` e contadores reais (sem inventar percentual quando o total não é conhecido, FR-007).
- [x] T031 [US1] Atualizar `tv-web/src/App.tsx` para alternar entre `AddSourceScreen` e `ImportProgressScreen` por estado local (Decisão Invariante — sem router nesta feature).
- [x] T053 [US1] `api/app/routers/import_jobs.py`: `POST /import-jobs/{id}/retry` — só aceito quando `status=failed`; cria um novo `ImportJob` para a mesma `Source` (reaproveitando a configuração já salva, sem pedir os dados de novo) e retorna seu `id`; `409 Conflict` se o job não estiver em `failed` (FR-015).
- [x] T054 [US1] `tv-web/src/features/import/ImportProgressScreen.tsx`: exibir "Tentar novamente" (acessível por controle remoto) quando `status=failed`; ao acionar, chama o retry e passa a acompanhar o novo `ImportJob`.
- [x] T055 [P] [US1] Estender `tv-web/src/features/import/importApi.ts` com `useRetryImportJob`.

**Critério de Conclusão**: Uma URL M3U válida resulta em `ImportJob` `completed`/`completed_with_warnings` com contadores corretos e catálogo consultável; uma URL inválida nunca é reportada como sucesso; falha de rede oferece nova tentativa manual sem retry automático (FR-015); navegação inteira funciona só com teclado.

**Checkpoint**: User Story 1 funcional e testável isoladamente — MVP mínimo entregável.

**Registro da Fase**:

- Status: Concluída
- Feito: schemas Pydantic (`source`, `import_job`, `catalog_item`); `importer.py` completo (aquisição via `ssrf_guard`, parsing via `m3u_parser`, classificação, publicação em lotes, cancelamento cooperativo, retry); rotas `POST /sources`, `GET /import-jobs/{id}`, `POST /import-jobs/{id}/cancel`, `POST /import-jobs/{id}/retry`, `GET /catalog-items`; `AddSourceScreen`/`ImportProgressScreen`/`App.tsx`/`main.tsx` (QueryClientProvider) no frontend; correção de compatibilidade Windows (psycopg async exige `WindowsSelectorEventLoopPolicy`, não o `ProactorEventLoop` padrão) em `main.py` e `tests/conftest.py`; correção de ordenação de flush (Source/ImportJob e CatalogItem pai/filho não têm `relationship()` ORM, então precisam de `session.flush()` explícito antes de referenciar o ID gerado).
- Testes executados: `uv run pytest -v` → 22 passed; `uv run ruff check .` → limpo (após configurar `extend-immutable-calls` pro padrão `Depends()` do FastAPI); `npm run lint` (oxlint) → limpo; `npx tsc -b --noEmit` → limpo (após trocar `defineConfig` de `vite` para `vitest/config`); `npm run test` (vitest) → 2 passed; `npm run build` → build de produção OK. Verificação manual adicional com servidor real (`uv run python main.py`) + Postgres via Docker: `GET /health` OK; `POST /sources` com URL apontando pra `127.0.0.1` confirmou o SSRF guard bloqueando loopback de verdade (não mockado), como esperado por FR-017.
- Pendências: verificação manual do caminho "sucesso" completo (URL pública real, não loopback) ainda não executada — depende de uma fonte M3U de teste alcançável publicamente; registrado em Cuidados para Retomada.

---

## Phase 4: User Story 2 - Adicionar fonte por provedor (DNS/usuário/senha) (Priority: P2)

**Objetivo**: Uma pessoa informa endereço do servidor, usuário e senha e obtém o mesmo resultado da User Story 1.

**Independent Test**: `POST /sources` com `type=provider_credentials` contra um provedor de teste autorizado; mesmo fluxo de `ImportJob`/catálogo da US1; autenticação inválida gera erro específico.

### Testes da Fase

- [x] T032 [P] [US2] `api/tests/test_sources_api.py::test_create_source_by_provider_and_job_completes` — mocka `fetch_text_ssrf_safe` retornando a lista pra URL M3U autenticada montada pelo `provider_connector`; job completa como na US1.
- [x] T033 [P] [US2] `api/tests/test_sources_api.py::test_invalid_provider_credentials_specific_error` — resposta que não é M3U válido gera erro de autenticação específico, sem a senha aparecer na resposta (FR-002 cenário 2, FR-014).
- [x] T034 [P] [US2] `api/tests/test_sources_api.py::test_incompatible_provider_protocol` — falha de conexão ao servidor do provedor gera erro de incompatibilidade específico, sem tentar portas/caminhos alternativos (FR-002 cenário 3, FR-016).

### Implementation

- [x] T035 [US2] `api/app/services/provider_connector.py`: monta a URL M3U autenticada a partir de `provider_dns`/`provider_username`/`provider_password` (research.md R2); `ProviderAuthError`/`ProviderIncompatibleError` distintos.
- [x] T036 [US2] Estendido `api/app/services/importer.py::_acquire` para aceitar `Source` do tipo `provider_credentials`, delegando a `provider_connector` antes de reutilizar `m3u_parser`/`classifier`.
- [x] T037 [US2] `api/app/schemas/source.py` e `api/app/routers/sources.py` já aceitavam o corpo `provider_credentials` desde a T023/T025 (schema único cobre os dois tipos desde o início) — nenhuma mudança adicional necessária.
- [x] T038 [P] [US2] `tv-web/src/features/import/AddSourceScreen.tsx` já implementado com a alternância URL/Provedor desde a T029 (decisão de construir as duas juntas, já que a UX é uma tela só) — nenhuma mudança adicional necessária.
- [x] T039 [P] [US2] `tv-web/src/features/import/importApi.ts` já aceitava o corpo `provider_credentials` desde a T028 (`CreateSourceInput.provider`) — nenhuma mudança adicional necessária.

**Critério de Conclusão**: Credenciais de provedor válidas produzem o mesmo resultado de catálogo da US1; autenticação inválida e protocolo incompatível geram erros específicos sem afetar outras fontes.

**Checkpoint**: User Story 2 funcional e testável isoladamente, sem alterar o comportamento já validado da US1.

**Registro da Fase**:

- Status: Concluída
- Feito: `provider_connector.py` (monta URL M3U autenticada, hipótese Xtream-compatível); `importer.py::_acquire` estendido pro tipo `provider_credentials` com 3 categorias de erro (`ProviderAuthError`, `ProviderIncompatibleError`, mais os já existentes `NetworkAcquisitionError`/`SSRFValidationError`); 3 novos testes. Frontend não precisou de mudança — já suportava os dois tipos desde a Fase 3 (decisão consciente de implementar a tela com alternância de uma vez, já que o UX foi definido como uma tela só desde a entrevista do sdd-specify).
- Testes executados: `uv run pytest -v` → 25 passed; `uv run ruff check .` → limpo.
- Pendências: mesma do Fase 3 — verificação manual com provedor real autorizado ainda não feita (só testes com mock).

---

## Phase 5: User Story 3 - Cancelar uma importação em andamento (Priority: P3)

**Objetivo**: Uma pessoa cancela um `ImportJob` em execução pela tela de progresso.

**Independent Test**: Iniciar um job, chamar `POST /import-jobs/{id}/cancel`, confirmar que `status` só vira `cancelled` após o job reconhecer, e que itens do lote incompleto não aparecem em `GET /catalog-items`.

### Testes da Fase

- [x] T040 [P] [US3] `api/tests/test_import_jobs_api.py::test_cancel_running_job` — job `queued` recebe `cancel_requested_at` via `POST .../cancel` (202, status ainda `queued`); ao rodar o import, transita direto pra `cancelled` sem publicar nada; `GET /catalog-items` retorna vazio (FR-010, FR-011).
- [x] T041 [P] [US3] `api/tests/test_import_jobs_api.py::test_cancel_terminal_job_conflict` — cancelar um job já terminal retorna `409 Conflict`.

### Implementation

- [x] T042 [US3] `api/app/routers/import_jobs.py`: `POST /import-jobs/{id}/cancel` (seta `cancel_requested_at`, retorna `202`; `409` se já terminal) — já implementado na Fase 3 junto do retry, mesmo arquivo/router.
- [x] T043 [US3] `api/app/services/importer.py::_publish_in_batches` já checa `cancel_requested_at` entre lotes e transita pra `cancelled` sem publicar o lote em andamento — implementado na Fase 3 (T024).
- [x] T044 [P] [US3] `tv-web/src/features/import/ImportProgressScreen.tsx`: botão "Cancelar" acessível por controle remoto, com estado "cancelamento solicitado" — já implementado na Fase 3 (T030).
- [x] T045 [P] [US3] `tv-web/src/features/import/importApi.ts` já tem `useCancelImportJob` — implementado na Fase 3 (T028).

**Critério de Conclusão**: Cancelamento é confirmado apenas quando o backend reconhece; nenhum item de lote incompleto fica visível como pronto para reprodução.

**Checkpoint**: User Story 3 funcional isoladamente, sem regressão nas US1/US2.

**Registro da Fase**:

- Status: Concluída
- Feito: A implementação (T042-T045) já existia desde a Fase 3, construída junto do fluxo principal de importação (cancelamento é parte do mesmo ciclo de vida do `ImportJob`, não uma peça separável). Esta fase adicionou os 2 testes dedicados que faltavam: `test_cancel_running_job` (mecânica completa: 202 → `cancel_requested_at` → job processado reconhece e vira `cancelled` sem publicar `CatalogItem` nenhum) e `test_cancel_terminal_job_conflict` (409 em job já terminal).
- Testes executados: `uv run pytest -v` → 27 passed; `uv run ruff check .` → limpo.
- Pendências: nenhuma nova. `test_cancel_running_job` usa `create_source_and_job`/`run_import_job` diretamente (em vez de só HTTP) porque o `TestClient`/`ASGITransport` roda `BackgroundTasks` de forma síncrona — não há como interceptar um job HTTP real "no meio" da execução em teste; a alternativa mais realista seria um teste de carga/latência real, fora de escopo aqui.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Fechar lacunas transversais (idempotência de duplo envio, reabertura de tela, ruff/lint) e validar o roteiro manual completo.

- [x] T046 [P] `api/tests/test_sources_api.py::test_reusing_request_key_does_not_duplicate` — reenviar o mesmo `request_key` não cria segunda fonte/job (FR-018, edge case de duplo envio). Implementado na Fase 3 (T019-T021), nome ligeiramente diferente do sugerido na task original.
- [x] T047 [P] `tv-web/src/features/import/ImportProgressScreen.tsx` — reabrir a tela consulta o estado real via `GET /import-jobs/{id}` em vez de reiniciar (FR-012, SC-006). Já era estrutural (a tela só lê estado, nunca recria a fonte), mas faltava o teste — adicionado `ImportProgressScreen.test.tsx` (2 casos: sem percentual nunca exibido/A-002, e remontagem consulta GET sem tocar `/sources`).
- [x] T048 [P] `api/app/services/m3u_parser.py` — validado `ipytv` contra amostra real do usuário: painel Xtream/XUI (`cbsrv.top`) alcançado com autorização explícita, catálogo real de 310.562 `#EXTINF`/78,4 MB. Revelou e corrigiu 4 bugs reais: falso positivo de HLS (`#EXT-X-SESSION-DATA` de branding do painel), `User-Agent` ausente causando 403, limite de tamanho (20MB→150MB) e contagem de `series_count` (ver `plan.md` R-008/R-009/R-011/R-012). Import final confirmado pelo usuário: `status=completed`, 310.562/310.562 entradas, 320.042 `CatalogItem` gravados, 0 inválidos.
- [x] T049 Rodar `uv run ruff check .` em `api/` e corrigir achados — limpo (rodado a cada checkpoint desde a Fase 2).
- [x] T050 Rodar `npm run lint` em `tv-web/` e corrigir achados — limpo (rodado a cada checkpoint desde a Fase 3).
- [x] T051 Roteiro de `quickstart.md`: checagens automatizadas (pytest/ruff/vitest/oxlint/tsc/build) executadas e verdes a cada fase; cenário US1 verificado ao vivo contra servidor real (`GET /health` OK, SSRF guard bloqueando loopback confirmado numa chamada real). **Fechado em 2026-09-14**: app instalado e testado na TV física (Samsung QN50Q60DAGXZD, Tizen 9.0) — navegação só por controle remoto confirmada (setas movem foco, OK submete/aciona botão), cenário US2 (endereço/usuário/senha) executado ao vivo com provedor real: import concluído, `status=completed`, 311.367 entradas lidas, 0 inválidos. Ver `plan.md` R-006 (resolvido) e R-013 (deploy TV).

### Checklist de Release

- [x] Fase 3 (User Story 1) concluída
- [x] Fase 4 (User Story 2) concluída
- [x] Fase 5 (User Story 3) concluída
- [x] Backend disponível e validado (`uv run pytest` verde — 31/31)
- [x] Frontend disponível e validado (`npx vitest run` verde — 4/4)
- [x] `docker-compose.yml` sobe Postgres e migrações Alembic aplicam limpo
- [x] `quickstart.md` executado com sucesso, incluindo navegação só por controle remoto — confirmado na TV física em 2026-09-14 (ver T048/T051)
- [x] Nenhum segredo (senha de provedor, URL completa) exposto em resposta HTTP ou log — inclui correção de vazamento real encontrada no Polish (`httpx.HTTPStatusError` embutia URL/senha na mensagem)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories.
- **User Story 1 (Phase 3)**: depende do Foundational. É o MVP mínimo.
- **User Story 2 (Phase 4)**: depende do Foundational; reaproveita `importer`/`m3u_parser`/`classifier` da US1, mas é testável isoladamente com o conector de provedor mockado.
- **User Story 3 (Phase 5)**: depende do Foundational e do `ImportJob`/`importer` já existirem (US1); testável isoladamente sobre um job em execução de qualquer origem (URL ou provedor).
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas.

### Parallel Opportunities

- Tasks marcadas `[P]` na mesma fase podem rodar em paralelo (arquivos diferentes).
- Depois do Foundational, US2 e US3 podem ser trabalhadas em paralelo por pessoas diferentes, desde que ambas dependam apenas da US1 já ter `importer`/rotas básicas — na prática, US1 é pré-requisito de conteúdo (não só de infraestrutura) para US2/US3 funcionarem ponta a ponta, mas seus testes podem ser escritos em paralelo com mocks.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup.
2. Completar Fase 2: Foundational (bloqueia todas as stories).
3. Completar Fase 3: User Story 1.
4. **PARAR E VALIDAR**: rodar `quickstart.md` (cenário US1) isoladamente.

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. User Story 1 → testar isoladamente → considerar entrega (MVP desta feature).
3. User Story 2 → testar isoladamente → não deve quebrar US1.
4. User Story 3 → testar isoladamente → não deve quebrar US1/US2.
5. Polish → roteiro completo de `quickstart.md` + release checklist.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica.
- Nunca commitar `docs/m3u/dados.md` nem seus valores em fixtures/testes — usar `api/tests/fixtures/sample.m3u` sintético.
- Commitar após cada task ou grupo lógico coerente.
- Parar em qualquer checkpoint pra validar a story isoladamente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
