# Implementation Plan: Importação de Fonte M3U por URL e por Provedor

**Slug**: `001-importacao-fonte-m3u` | **Date**: 2026-09-14 | **Spec**: `sdd/specs/001-importacao-fonte-m3u/spec.md`

## Summary

Permitir adicionar uma fonte de conteúdo por URL M3U ou por credenciais de
provedor (DNS/usuário/senha) numa única tela, acompanhar a importação por
um `ImportJob` com estado/etapa/contadores reais, cancelar um job em
andamento, e publicar um catálogo básico classificado em
Canal/Filme/Série+Episódio/Não Classificado — sem enriquecimento externo,
sem telas de navegação do catálogo e sem upload de arquivo `.m3u` (fora de
escopo desta feature). Backend novo em Python/FastAPI/SQLAlchemy sobre
PostgreSQL; frontend novo em React/TypeScript já scaffolded em `tv-web/`.

## Technical Context

**Language/Version**: Backend — Python 3.13 (`api/.python-version`),
FastAPI ≥0.141.1, Uvicorn[standard] ≥0.52.4, `pydantic-settings` ≥2.15.0,
gerenciado por `uv` (`api/pyproject.toml` + `api/uv.lock`). Frontend —
TypeScript ~6.0.2, React 19.2, Vite 8.3 (`tv-web/package.json`), lint via
`oxlint`.

**Primary Dependencies** (a adicionar; nenhuma destas está instalada hoje):

- Backend: SQLAlchemy 2 (engine assíncrono), Alembic, Psycopg 3
  (`psycopg[binary]`), HTTPX, `m3u-ipytv` (ver `research.md` R1). Dev:
  `pytest`, `pytest-asyncio`, `ruff`.
- Frontend: `@tanstack/react-query` (polling do `ImportJob` — escopo
  limitado a jobs/fontes, conforme ADR-006 §3). Dev: `vitest`.

**Storage**: PostgreSQL local via `docker-compose.yml` novo (decisão
confirmada nesta sessão); migrações com Alembic.

**Testing**: `pytest` no backend (a configurar — projeto ainda não tem
nenhum teste), `vitest` no frontend (a configurar — `tv-web/package.json`
hoje só tem `oxlint` para lint, nenhum test runner).

**Target Platform**: Navegador via Vite dev server. Esta feature não toca
`webapis.avplay` nem nenhuma API Tizen-específica — é o mesmo app React que
depois empacota para Tizen.

**Performance Goals**: N/A — sem meta numérica de volume nesta spec
(Assumptions de `spec.md`); medir depois durante execução/testes.

**Constraints**: Validação SSRF obrigatória na URL informada (FR-017);
sem retry automático de rede (FR-015); segredos (senha de provedor, URL
completa) nunca em resposta comum/log (constitution); toda ação essencial
navegável só por controle remoto (constitution).

**Scale/Scope**: Instalação local única, sem múltiplos perfis/usuários
nesta feature — identidade técnica completa da instalação (ADR-004 §1)
fica para uma feature futura; aqui a `Source` não tem dono explícito além
da instalação única.

## Decisões Invariantes

- Sem router de páginas nesta feature: só duas telas (Adicionar Fonte,
  Progresso), alternadas por estado local em `App.tsx`. Adotar uma
  biblioteca de rotas fica para quando houver mais telas simultâneas
  (features de navegação de catálogo).
- Progresso consultado por polling HTTP simples (`GET /import-jobs/{id}`
  em intervalo curto), não WebSocket/SSE — alinhado com ADR-004 §5
  ("notificações por WebSocket/SSE são uma possível otimização, não uma
  dependência obrigatória").
- `ImportJob` roda em `BackgroundTasks` do FastAPI, no mesmo processo da
  API — não é fila durável (ver Risco R-001). Aceito conscientemente para
  o escopo local/1-usuário desta feature.
- Conector de provedor reaproveita o pipeline de M3U (credenciais geram
  uma URL M3U autenticada), sem implementar o protocolo JSON estruturado
  do Xtream nesta feature (ver `research.md` R2 e Risco R-003).
- `CatalogItem` incorpora `playback_url` diretamente, sem uma entidade
  `PlaybackOption` separada, enquanto não houver reconciliação
  multi-fonte (ver `data-model.md` e Risco R-002).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | PASS | PASS | `Source` pertence à instalação local; nenhum login de pessoa introduzido. |
| Segredos Fora dos Clientes e dos Logs | PASS | PASS | `provider_password` nunca retornado (contrato em `contracts/import-api.md`); erros sanitizados (FR-014). |
| Categorias da Fonte São Preservadas | PASS | PASS | `CatalogItem.original_group` preservado, nunca sobrescrito (`data-model.md`). |
| IA e Classificação Nunca Inventam Dados | PASS | PASS | Regras de classificação (research.md R5) exigem evidência; sem evidência → `unclassified`. |
| Comandos Locais Independem de Rede/Backend/IA | N/A | N/A | Feature não envolve player/foco de reprodução. |
| Trailers e Metadados Não Alteram Estado Principal | N/A | N/A | Feature não envolve trailers nem histórico/progresso de obra. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | PASS | PASS | `quickstart.md` inclui percurso completo por teclado/setas, incluindo alternância URL/Provedor e Cancelar. |
| Catálogo Nunca É Tratado Como Manifesto de Streaming | PASS | PASS | Detecção de manifesto HLS antes de classificar (FR-009); task dedicada na Fase Foundational. |

Nenhuma violação não justificada identificada. Sem entradas em Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/001-importacao-fonte-m3u/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── import-api.md
└── tasks.md
```

### Source Code (repository root)

Estrutura real encontrada na exploração (frontend + backend separados,
ambos já com scaffolding mínimo):

```text
docker-compose.yml                 # NOVO — serviço postgres local

api/                                # Backend Python/FastAPI/uv (já existe)
├── main.py                         # Existente — expandir com routers
├── pyproject.toml                  # Existente — adicionar dependências
├── uv.lock
├── .python-version
├── .env
├── alembic.ini                     # NOVO
├── alembic/                        # NOVO — migrações
│   └── versions/
├── app/                             # NOVO — código da feature
│   ├── __init__.py
│   ├── db.py                       # engine/session SQLAlchemy assíncrono
│   ├── models/
│   │   ├── source.py
│   │   ├── import_job.py
│   │   └── catalog_item.py
│   ├── schemas/
│   │   ├── source.py
│   │   ├── import_job.py
│   │   └── catalog_item.py
│   ├── routers/
│   │   ├── sources.py
│   │   ├── import_jobs.py
│   │   └── catalog_items.py
│   └── services/
│       ├── ssrf_guard.py
│       ├── m3u_parser.py           # interface M3UParser sobre ipytv
│       ├── provider_connector.py
│       ├── classifier.py
│       └── importer.py             # orquestra o ImportJob (BackgroundTasks)
└── tests/                           # NOVO — pytest
    ├── test_sources_api.py
    ├── test_import_jobs_api.py
    ├── test_classifier.py
    ├── test_ssrf_guard.py
    └── fixtures/
        └── sample.m3u               # sintético, sem credenciais reais

tv-web/                              # Frontend React/TS/Vite (já existe)
├── src/
│   ├── App.tsx                     # Existente — passa a alternar telas
│   ├── features/
│   │   └── import/                 # NOVO
│   │       ├── AddSourceScreen.tsx
│   │       ├── ImportProgressScreen.tsx
│   │       ├── importApi.ts        # client HTTP + hooks react-query
│   │       └── importApi.test.tsx  # NOVO — vitest
│   └── ... (main.tsx, index.css, assets/ já existentes)
└── package.json                    # Existente — adicionar dependências
```

**Structure Decision**: Frontend e backend permanecem em pastas separadas
na raiz do repositório (`api/`, `tv-web/`), como já estabelecido pelo
scaffolding existente e pela ADR-001 (monólito modular Python + app Tizen
React separado). Esta feature adiciona um pacote `app/` dentro de `api/`
(rotas/serviços/modelos) e uma pasta `features/import/` dentro de
`tv-web/src/` — convenção que as próximas features de catálogo devem
seguir (`features/<nome>/`).

## Complexity Tracking

Nenhuma violação da constitution identificada — tabela vazia.

## Estratégia de Testes

Prioridade: unitário (parser, SSRF guard, classificador) → contrato/
integração (rotas FastAPI com banco de teste) → E2E manual via
`quickstart.md` (último recurso, já que não há Playwright configurado
ainda para esta feature).

Comandos-base:

```powershell
cd api
uv run pytest
uv run ruff check .
```

```powershell
cd tv-web
npm run lint
npx vitest run
```

## Estado Atual

| Área | Estado |
| --- | --- |
| Infraestrutura | `docker-compose.yml` com Postgres 16 local, funcional (`docker compose up -d postgres` testado). |
| Backend — dependências | `sqlalchemy[asyncio]`, `alembic`, `psycopg[binary]`, `httpx`, `m3u-ipytv` instalados via `uv add`; dev: `pytest`, `pytest-asyncio`, `ruff`. |
| Backend — Alembic | Inicializado (`api/alembic/`), `env.py` lê `DATABASE_URL` do `.env` e aponta `target_metadata` para `app.db.Base` (ainda não criado — próxima fase). |
| Frontend — dependências | `@tanstack/react-query`, `vitest`, `@testing-library/react`/`jest-dom`, `jsdom` instalados; script `npm run test` configurado. |
| Modelos | `Source`, `ImportJob`, `CatalogItem` criados e migrados no Postgres local (`api/app/models/`). |
| Serviços Foundational | `ssrf_guard.py`, `m3u_parser.py`, `classifier.py` implementados e testados (13/13 testes passando, ruff limpo). |
| Rotas HTTP | `POST /sources`, `GET /import-jobs/{id}`, `POST /import-jobs/{id}/cancel`, `POST /import-jobs/{id}/retry`, `GET /catalog-items` — implementadas e testadas (22 testes backend). |
| Frontend — telas | `AddSourceScreen` (URL/provedor) e `ImportProgressScreen` (status, contadores, cancelar, tentar novamente) implementadas; `App.tsx` alterna entre as duas; `QueryClientProvider` em `main.tsx`. |
| Verificação manual | Servidor real (`uv run python main.py`) + Postgres via Docker testados juntos: `/health` OK, SSRF guard confirmado bloqueando loopback numa chamada real (não mockada). Falta testar o caminho de sucesso com uma URL pública real e navegação manual em navegador (sem ferramenta de browser neste ambiente). |
| Cobertura de testes | 31 testes backend (pytest) + 4 frontend (vitest), todos verdes; `ruff`/`oxlint`/`tsc --noEmit`/`vite build` limpos. |
| Segurança | Corrigido durante o Polish: `httpx.HTTPStatusError` embutia a URL completa (com senha de provedor ou credenciais em query string) na mensagem de erro, vazando pra `job.warnings`/resposta HTTP — nunca mais interpola `str(exc)` de erros httpx; 2 testes de regressão adicionados. |
| Deploy TV física | **Concluído em 2026-09-14**: app instalado e funcional na Samsung QN50Q60DAGXZD (Tizen 9.0, 192.168.0.15). Certificado via ferramenta comunitária `Apps2Samsung` (Tizen Studio oficial bloqueado por bug do lado do backend da Samsung). Navegação por controle remoto implementada (`useTvKeyNav`). Conectividade TV↔backend corrigida (HOST=0.0.0.0, CORS, privilégio de internet no `config.xml`, firewall). Import real de 311.367 entradas confirmado ao vivo, 0 inválidos. Ver R-006, R-013, R-014. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `ImportJob` roda em `BackgroundTasks` (não durável) — reinício do servidor durante um job o deixa preso em `running` sem retomada automática. | Médio — afeta confiabilidade de importações longas. | **Resolvido**: aceito conscientemente para o MVP local/1-usuário (ADR-003 §4 já avisa disso); auditoria do `sdd-converge` confirmou a mitigação implementada como decidido (job "preso" identificável por `updated_at` parado; cancelamento manual via API funcional e testado). Fila/worker durável continua sendo o item 21 do backlog, antes de qualquer ambiente multi-usuário/produção. |
| R-002 | `CatalogItem` simplifica o modelo de `PlaybackOption`/reconciliação multi-fonte proposto na ADR-005 §2. | Médio — pode exigir migração de dados quando múltiplas fontes precisarem reconciliar a mesma obra. | **Resolvido**: simplificação implementada exatamente como documentado em `data-model.md`, dentro do escopo desta feature (sem múltiplas fontes/reconciliação). Revisitar ao planejar o item 12 do backlog. |
| R-003 | Protocolo real do provedor Xtream-compatível não confirmado (ADR-004 §3); conector assume que credenciais geram uma URL M3U exportável. | Médio — um provedor real pode não seguir esse padrão. | **Resolvido**: tratamento defensivo implementado e testado — falha vira erro de incompatibilidade específico (`ProviderAuthError`/`ProviderIncompatibleError`), sem tentar portas/caminhos arbitrários; não afeta outras fontes (testado em `test_source_failure_does_not_affect_other_source`). Reavaliar protocolo JSON completo se a evidência de um provedor real exigir. |
| R-004 | `ipytv` validado contra amostra sintética (5/5 testes de classificação); tentativa contra amostra real (com autorização do usuário) **falhou por DNS** — `ocvtab.info` e `acpekt.com` (docs/m3u/dados.md) não resolvem neste ambiente (`getaddrinfo failed`; confirmado real, não sandbox, via teste de controle com `google.com`). Mesma falha já registrada na ADR-006 §1. | Baixo/Médio — ainda não há evidência de que `ipytv` funcione com dado real; domínios de teste parecem inativos. | Pendente até o usuário fornecer uma fonte de teste alcançável (novo provedor, ou os mesmos domínios voltando a responder). Trocar por parser próprio atrás da mesma interface `M3UParser` se, quando testado, `ipytv` falhar. |
| R-005 | Encontrado no Polish: `httpx.HTTPStatusError`/`TransportError` embutem a URL completa (incl. senha de provedor ou credenciais em query string) na mensagem de erro — se interpolada em `job.warnings`, vazaria segredo via API (violação de FR-014/constitution). | Alto, se não corrigido — vazamento de credencial via resposta HTTP comum. | **Resolvido**: `importer.py::_acquire` não interpola mais `str(exc)` de exceções httpx; usa `type(exc).__name__`/`status_code` apenas. 2 testes de regressão (`test_provider_http_error_does_not_leak_password_in_url`, `test_m3u_url_http_error_does_not_leak_credentials_in_url`). |
| R-006 | *(Convergence C-001)* Nenhuma verificação E2E num navegador real confirma o percurso completo só por teclado/controle remoto (constitution — Toda Ação Essencial Tem Caminho por Controle Remoto). Cobertura atual: HTML semântico (Tab-acessível por padrão) + testes de componente isolados. | Médio — risco de algo funcionar nos testes automatizados mas falhar na navegação real (foco perdido, ordem de tab estranha). | **Resolvido em 2026-09-14**: risco se confirmou real — HTML semântico Tab-acessível **não** basta, controles remotos de TV enviam ArrowUp/Down/Left/Right, não Tab, e nada movia o foco. Corrigido com `tv-web/src/lib/useTvKeyNav.ts` (hook de roving-focus: Arrow mapeia pra próximo/anterior elemento focável em ordem DOM, auto-foca o primeiro ao montar a tela) aplicado em `AddSourceScreen`/`ImportProgressScreen`, mais `outline` visível em `:focus` (`index.css`). Validado ao vivo na TV física (ver R-013). |
| R-007 | *(Convergence C-002, atualizado pós-convergência)* Usuário conseguiu uma fonte real alcançável (painel Xtream/XUI) e testou manualmente. `ipytv` parseou corretamente a estrutura real (`#EXTINF:-1 tvg-name="..." group-title="..."` + URL) — validado. | Baixo — resolvido para a estrutura observada; catálogo real chega a ~310 mil entradas/78 MB, volume bem acima do testado sinteticamente. | **Resolvido**: import completo ponta a ponta confirmado bem-sucedido pelo usuário após os fixes R-008/R-009/R-010/R-011/R-012 — job `completed`, 310.562/310.562 entradas contabilizadas, 320.042 `CatalogItem` gravados, 0 `invalid_count`, todos `published=true`. T048 pode ser marcado concluído em `tasks.md`. |
| R-008 | **Bug real encontrado via teste do usuário com dado real**: `is_hls_manifest()` tratava qualquer tag `#EXT-X-*` como manifesto HLS. Painéis Xtream/XUI injetam `#EXT-X-SESSION-DATA:DATA-ID="com.xui.1_5_5r2"` (branding/versão do painel) em catálogos M3U comuns — isso causava falso positivo, rejeitando o catálogo real inteiro como se fosse um manifesto de streaming. | Alto — bloqueava 100% da importação de pelo menos um painel Xtream/XUI real. | **Resolvido**: `is_hls_manifest()` agora exige tags específicas de segmento/variante (`TARGETDURATION`, `STREAM-INF`, `MEDIA-SEQUENCE`, `ENDLIST`, etc. — RFC 8216), não qualquer `#EXT-X-*`. Teste de regressão `test_xui_session_data_tag_does_not_false_positive_as_hls` usando a estrutura real observada. |
| R-009 | `MAX_DOWNLOAD_BYTES` (20 MB) era baixo demais — o catálogo real do usuário tem 78,4 MB, e catálogos maiores são plausíveis. | Médio — bloqueava importação de fontes reais grandes com "excede o limite". | **Resolvido**: limite elevado para 150 MB (ainda uma proteção SSRF real, não removida — FR-017/ADR-004 §7); timeout de 30s para 90s. |
| R-010 | `_BATCH_SIZE` (200) geraria ~1.553 commits no banco para um catálogo de 310k entradas — muito overhead de round-trip. | Baixo/Médio — importação real ficaria desnecessariamente lenta. | **Resolvido**: aumentado para 2000 (redução para ~155 commits), mantendo a semântica de "lote coerente" (FR-011) intacta. |
| R-011 | O backend não define `User-Agent` nas requisições HTTP (`httpx` usa o padrão `python-httpx/x.x`) — vários painéis Xtream/IPTV bloqueiam clientes não identificados como player conhecido, retornando 403. | Alto — bloqueava 100% do acesso a pelo menos um painel real (`cbsrv.top`), mesmo com credenciais corretas. | **Resolvido**: `fetch_text_ssrf_safe` agora envia `User-Agent: VLC/3.0.20 LibVLC/3.0.20` por padrão (cliente mais universalmente aceito pelo ecossistema IPTV). |
| R-012 | **Bug real encontrado via import completo do catálogo de 310k entradas**: `job.series_count` só somava séries sintetizadas como pai de episódio (`series_keys`), ignorando entradas cujo grupo indica "Séries" mas o nome não bate o padrão `SxxExx` (classificadas como `CatalogItemKind.SERIES` direto). Resultado real: contador mostrava 9.480, mas havia 10.208 `CatalogItem(kind=series)` de verdade (diferença de 728, exatamente o número dessas entradas diretas) — e a soma `channels+movies+episodes+unclassified` batia em 309.834 contra `entries_read=310.562`, a mesma diferença de 728. | Médio — número exibido ao usuário (e a garantia SC-003 de "nada desaparece") ficava incorreto para catálogos com essa característica; nenhum dado foi de fato perdido, só a contagem. | **Resolvido**: `job.series_count` agora soma `len(series_keys) + series_direct_count` (as duas origens de linha `kind=series`). 2 testes de regressão (`test_series_group_without_episode_pattern_is_classified_as_series_directly` no classificador, `test_series_classified_directly_counts_toward_series_total` na API). |

| R-013 | **Deploy na TV física (Samsung QN50Q60DAGXZD, Tizen 9.0)**: o Tizen Studio oficial (Certificate Manager, `tz`/`sdb`) gera certificados Samsung Distributor2 que passam no empacotamento (`tz pack`) mas falham na instalação real com `[118,-12] Invalid certificate chain with certificate in signature.:<-3>` — bug confirmado do lado do backend da Samsung (`svdca.samsungqbe.com`), reproduzido em issues públicas de outros projetos (NuvioWeb#406, moonlight-chrome-tizen#37, TizenBrewInstaller#12), não algo corrigível só configurando o Tizen Studio. | Alto — bloqueava 100% da instalação em hardware real; sem isso a feature nunca sai do ambiente de teste automatizado. | **Resolvido via ferramenta comunitária** (`Apps2Samsung`, github.com/Apps2Samsung/Apps2Samsung, uso autorizado explicitamente pelo usuário): ela re-assina o `.wgt` com certificado próprio (endpoints v1+v3 corrigidos, `privilege_level` minúsculo, PKCS12 3DES) via seu recurso "Custom WGT File". Armadilha adicional: ela falha ao **re-assinar** um `.wgt` que já contém uma assinatura de Distributor2 prévia (erro `<-4>` "Invalid signature. Signed with wrong key..."); a correção foi empacotar com um profile **sem** entrada `distributor="2"` (só autor + Distributor1 Tizen genérico — profile `ccplaytv-nosamsung` em `profiles.xml`), deixando o Apps2Samsung adicionar a assinatura de distribuidor do zero. Também foi preciso um ID de pacote nunca usado antes (`config.xml` `tizen:application id`) — reaproveitar um ID já tentado sem sucesso disparava "already installed with a different signing certificate" mesmo com o app ausente da tela de Apps da TV. Ver `## Cuidados para Retomada` para o procedimento completo de rebuild. |
| R-014 | **Conectividade TV↔backend**: o app empacotado, ao chamar a API, dava "Failed to fetch" mesmo com o certificado resolvido. Três causas simultâneas: (1) frontend buildado sem `VITE_API_URL`, caindo no fallback `127.0.0.1:3000` — na TV isso aponta pra ela mesma, não pro PC; (2) `api/main.py`/`.env` com `HOST=127.0.0.1`, recusando conexões de fora da própria máquina; (3) `config.xml` sem `tizen:privilege http://tizen.org/privilege/internet` nem `<access origin="*">` — sem os dois, o runtime Tizen bloqueia toda chamada de rede do widget, independente do CORS do backend. CORS do backend também não incluía a origem `null` que um `.wgt` carregado de `file://` envia. | Alto — bloqueava 100% do fluxo de importação a partir da TV, mesmo com o app instalado e navegável. | **Resolvido**: build de produção do Tizen agora precisa de `VITE_API_URL=http://<IP-LAN-do-PC>:3000` (ex. `192.168.0.14`) no ambiente antes de `npm run build:tizen`; `api/.env` com `HOST=0.0.0.0`; `main.py` CORS `allow_origins` inclui `"null"`; `config.xml` ganhou `<tizen:privilege name="http://tizen.org/privilege/internet">` e `<access origin="*" subdomains="true">`; regra de firewall Windows liberando TCP 3000 de entrada restrita a `LocalSubnet`. Validado ao vivo: import completo de 311.367 entradas concluído na TV física, 0 inválidos. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-14 | Fase 1 (Setup) | Docker Compose + Postgres, deps backend/frontend, Alembic inicializado. Comandos de teste rodam limpo (sem testes ainda). | Nenhuma. |
| 2026-09-14 | Fase 2 (Foundational) | Modelos + migração aplicada; ssrf_guard/m3u_parser/classifier implementados e testados (13 testes, ruff limpo). | Nenhuma. |
| 2026-09-14 | Fase 3 (User Story 1) | Importer + rotas + telas completas; A-001 (retry, FR-015) incluído. 22 testes backend + 2 frontend + build OK. Corrigidos: event loop do Windows (psycopg async), ordenação de flush sem relationship() ORM. | Verificação manual do caminho de sucesso com URL pública real ainda não feita (só SSRF-bloqueio verificado ao vivo). |
| 2026-09-14 | Fase 4 (User Story 2) | `provider_connector.py` + `importer.py` estendido pro tipo provedor; 3 testes novos (25 total). Frontend já suportava os dois tipos desde a Fase 3, sem mudança necessária. | Mesma do Fase 3 (verificação manual com fonte real). |
| 2026-09-14 | Fase 5 (User Story 3) | Implementação já existia desde a Fase 3 (cancel/retry construídos juntos); adicionados os 2 testes dedicados de cancelamento (27 total). | Mesma do Fase 3. |
| 2026-09-14 | Fase 6 (Polish) | Fechados A-003/A-005/A-006/A-007 do Analyze + achado real de segurança corrigido (R-005, vazamento de credencial via mensagem de erro httpx). 31 testes backend + 4 frontend, tudo verde. T048 (validar `ipytv` com amostra real) e parte de T051 (navegação manual, cenários US2/US3 reais) deixados pendentes — exigem autorização do usuário ou ferramenta de browser que não tenho neste ambiente. | T048 e verificação manual completa de `quickstart.md`. |
| 2026-09-14 | Deploy TV física (pós-convergência) | T048 fechado (import real de 310.562 entradas validado, R-008/R-009/R-011/R-012 corrigidos). Certificado Samsung via Tizen Studio oficial 100% bloqueado (bug de backend da Samsung); resolvido com `Apps2Samsung` (uso autorizado pelo usuário) — exigiu profile sem Distributor2 (`ccplaytv-nosamsung`) e ID de pacote novo. Bug real de navegação por controle remoto encontrado e corrigido (`useTvKeyNav`, R-006). Bug real de conectividade TV↔backend encontrado e corrigido (R-014). T051 fechado: import completo de 311.367 entradas confirmado ao vivo na TV física, 0 inválidos. | Nenhuma — todos os riscos residuais da convergência (C-001/C-002) resolvidos. |

**PRÓXIMO**: Feature completa e validada em hardware real de ponta a ponta (63/63 tasks). Nenhuma pendência conhecida para esta feature; próximo trabalho é escolher o próximo item do backlog (`.planning/backlog.md`).

## Arquivos Principais

- `api/app/services/{importer,provider_connector}.py`, `api/app/routers/{sources,import_jobs,catalog_items}.py`
- `api/app/schemas/{source,import_job,catalog_item}.py`
- `api/main.py` (routers + `app_db.configure` + fix do event loop Windows)
- `tv-web/src/features/import/{importApi.ts,AddSourceScreen.tsx,ImportProgressScreen.tsx,ImportProgressScreen.test.tsx}`
- `tv-web/src/App.tsx`, `tv-web/src/main.tsx`, `tv-web/vite.config.ts`

## Cuidados para Retomada

- `docs/m3u/dados.md` contém credenciais reais de um provedor de teste em
  texto plano — **já adicionado ao `.gitignore`** (feito durante o
  `sdd-plan`). Mesmo assim, não copiar esses valores para código, specs,
  fixtures ou commits; usar só manualmente, fora do repositório.
- **Windows + psycopg async**: o driver psycopg3 em modo assíncrono não
  funciona com o `ProactorEventLoop` padrão do `asyncio` no Windows — é
  preciso `asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())`
  antes de qualquer código assíncrono tocar o banco. Já corrigido em
  `api/main.py` (`if __name__ == "__main__":`) e `api/tests/conftest.py`.
  Se um novo entrypoint assíncrono for criado (ex.: um worker separado no
  futuro, item 21 do backlog), aplicar a mesma correção lá.
- **Flush explícito sem `relationship()` ORM**: os modelos usam `ForeignKey`
  puro nas colunas, sem `relationship()` entre `Source`/`ImportJob` nem o
  self-FK de `CatalogItem.parent_id`. Isso significa que o SQLAlchemy NÃO
  ordena os INSERTs automaticamente por dependência — sempre que um objeto
  novo referencia o `id` de outro objeto novo na mesma transação, é preciso
  `await session.flush()` entre os dois antes de ler o `id` gerado (ver
  `importer.py::create_source_and_job` e `_persist_entry`). Ao adicionar
  novas entidades relacionadas, lembrar dessa armadilha.
- Verificação manual do caminho de sucesso (URL pública real, não loopback)
  ainda não foi feita — os 22 testes automatizados cobrem isso via
  `fetch_text_ssrf_safe` mockado, e a verificação ao vivo confirmou o SSRF
  guard bloqueando `127.0.0.1` corretamente, mas falta rodar contra uma
  URL M3U pública de verdade (`quickstart.md`, cenário US1).
- Servidor de dev: `uv run python main.py` dentro de `api/` (porta 3000);
  frontend: `npm run dev` dentro de `tv-web/` (porta 5173, já liberada no
  CORS). Postgres local via `docker compose up -d postgres` na raiz.
- **Procedimento completo pra gerar e instalar um `.wgt` novo na TV física**
  (projeto Tizen fica em `../CCPlayTv/`, fora deste repo):
  1. `cd tv-web; $env:VITE_API_URL = "http://<IP-LAN-do-PC>:3000"; npm run build:tizen`
     — descobrir o IP com `Get-NetIPAddress` (interface Wi-Fi); **sem essa
     env var o build cai no fallback `127.0.0.1`, que na TV aponta pra ela
     mesma** (R-014).
  2. `tz.exe pack -w "<caminho>\CCPlayTv"` — usa o profile **ativo** em
     `C:\tizen-studio-data\profile\profiles.xml`. Manter o profile
     `ccplaytv-nosamsung` (só autor + Distributor1 Tizen, sem Distributor2
     Samsung) como ativo — empacotar com um certificado Samsung já embutido
     faz o Apps2Samsung falhar ao re-assinar (erro `<-4>`, R-013).
  3. Abrir `Apps2Samsung.exe` (baixado do GitHub, não faz parte deste repo)
     **manualmente pelo usuário** — não é lançável por automação nesta
     sessão (ver abaixo). Release = "Custom WGT File", apontar pro `.wgt`
     gerado, TV já deve aparecer na lista, clicar "Download & Install".
  4. Se der "already installed with a different signing certificate" mesmo
     com o app ausente da tela de Apps da TV: trocar o `id`/`package` em
     `config.xml` (`tizen:application`) pra um valor de 10 caracteres nunca
     usado antes, refazer os passos 1-3.
  5. Backend precisa estar rodando com `HOST=0.0.0.0` (`api/.env`) e a porta
     3000 liberada no firewall do Windows pra `LocalSubnet` (regra
     `New-NetFirewallRule` — precisa de PowerShell **elevado**, esta sessão
     não tem privilégio de admin).
- **Isolamento de sessão do Windows**: janelas de GUI não-elevadas que esta
  sessão abre (`certificate-manager.exe`, `Apps2Samsung.exe`) ficam
  invisíveis pro usuário — só janelas que pedem elevação UAC aparecem na
  tela dele. Sempre pedir pro usuário abrir essas ferramentas manualmente,
  nunca tentar `Start-Process` nelas.

## Resultado Final

Convergida em 2026-09-14, via `sdd-converge`. Mapeamento completo dos 18
`FR-###`, 6 `SC-###`, 6 edge cases e 5 Decisões Invariantes da spec/plano
contra o código real não encontrou nenhuma lacuna `missing`/`contradicts`/
`unrequested` acionável — as 3 user stories (P1 URL, P2 Provedor, P3
Cancelar) estão implementadas e cobertas por teste automatizado (31 testes
backend + 4 frontend, todos verdes; `ruff`/`oxlint`/`tsc --noEmit`/`vite
build` limpos).

**Dois achados do Convergence (C-001, C-002)** foram aceitos como riscos
residuais por decisão explícita do usuário na sessão de convergência, e
**ambos foram resolvidos numa sessão posterior de deploy em hardware real**
(2026-09-14, ver R-006/R-007/R-013/R-014):

- **C-001** (R-006): confirmado como risco real — navegação por controle
  remoto não funcionava (HTML Tab-acessível não é suficiente, controles de
  TV enviam Arrow keys). Corrigido com `useTvKeyNav` e validado ao vivo.
- **C-002** (R-007): `ipytv` validado com sucesso contra catálogo real de
  310k+ entradas.

Além disso, o deploy revelou dois problemas adicionais não previstos na
convergência original — bug de certificado do lado da Samsung (R-013) e
falha de conectividade TV↔backend (R-014) — ambos resolvidos e documentados
em `## Cuidados para Retomada` abaixo.

**Achado real de segurança durante o Polish** (R-005, já resolvido antes de
convergir): mensagens de erro de `httpx` embutiam a URL completa —
incluindo senha de provedor ou credenciais em query string — o que
vazaria segredo via `job.warnings`/resposta HTTP comum. Corrigido antes de
qualquer exposição real, com 2 testes de regressão.

**Desvios acumulados em relação ao plano original**: nenhum de escopo —
só refinamentos técnicos já registrados nas Execution Notes de cada fase
(classifier produz `series_key` em vez de `parent_id` direto; flush
explícito por falta de `relationship()` ORM; correção do event loop no
Windows; T037/T038/T039 da Fase 4 já vieram prontos da Fase 3 por decisão
de construir a tela com alternância de uma vez).

`tasks.md` permanece com 60/63 caixas marcadas — T048 e T051 ficam
intencionalmente abertos como lembrete dos dois riscos residuais aceitos
acima, não como trabalho esquecido.
