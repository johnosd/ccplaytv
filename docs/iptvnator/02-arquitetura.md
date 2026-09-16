# 02 — Reuso de Arquitetura

Escopo: decisões arquiteturais do IPTVnator reaproveitáveis no CCPlay TV,
traduzidas do mundo Angular/Nx/Electron para React/Vite + FastAPI/Python.
Foco em separação TV/backend, abstração de player, offline-first/cache e
execução de trabalho pesado fora do caminho da UI.

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Abstração de player engine-neutra (capabilities/state/commands) | P0 |
| 2 | Identidade lógica de reprodução independente da URL | P0 |
| 3 | Trabalho pesado fora do caminho da UI (worker/background) | P0 |
| 4 | Cache-first com catálogo separado de preferências | P0 |
| 5 | Contrato de progresso/cancelamento por operação (`operationId`) | P1 |
| 6 | Recuperação de reprodução com diagnóstico e ações ranqueadas | P1 |
| 7 | Fronteiras por responsabilidade (feature/data-access/ui/util) | P1 |
| 8 | Benchmarks determinísticos de importação | P2 |

---

## 1. Abstração de player engine-neutra (capabilities/state/commands)

- **O que é:** um contrato único de player separando **apresentação** (o que
  os controles renderizam), **estado e capacidades** (snapshot reativo do
  motor) e **comandos** (superfície imperativa que cada motor implementa).
- **Onde está no IPTVnator:**
  `docs/architecture/player-controls-contract.md` e
  `libs/ui/playback/src/lib/player-controls/player-controls.model.ts`
  (interface `PlayerController` com `capabilities`, `state`, `commands`).
- **Por que reutilizar:** o CCPlay tem decisão equivalente — `PlayerService`
  isolando as telas de `webapis.avplay` (ADR-001 §2), com adaptador `<video>`
  só para desenvolvimento. O IPTVnator valida o refinamento: em vez de um
  serviço monolítico, um contrato com **capacidades por motor** evita que a
  UI ofereça botões que o motor não suporta (ex.: PiP, legendas, quality
  levels, gravação).
- **Como adaptar/melhorar:** no CCPlay, modelar `PlayerController` em
  TypeScript (React) com `capabilities` e `state` como sinais/hooks e
  `commands` como funções; `AvPlayAdapter` implementa o contrato, `HtmlVideoAdapter`
  implementa o mesmo para dev. A melhoria em relação ao IPTVnator: no CCPlay o
  AVPlay é o alvo primário (não há 4 motores web concorrentes), então o
  contrato pode ser **menor e mais preciso** — só o que AVPlay realmente
  expõe.
- **Prioridade: P0** — é o item 3 do backlog (PlayerService + AVPlay), base do
  MVP.

---

## 2. Identidade lógica de reprodução independente da URL

- **O que é:** toda reprodução tem uma "session key" lógica estável derivada
  da identidade do conteúdo (fonte + canal/episódio), nunca da URL de stream
  (que expira, muda com catch-up ou carrega credenciais).
- **Onde está no IPTVnator:** `docs/architecture/embedded-inline-playback.md`
  ("Logical Playback Identity", `createPlaybackSessionKey()` em
  `@iptvnator/playback/util`) e o cuidado em
  `docs/architecture/xtream-portal-compatibility.md` de não usar a URL como
  identidade.
- **Por que reutilizar:** o CCPlay lida com URLs temporárias (Xtream, tokens,
  catch-up) e reimportação. Amarrar posição de retomada, favorito ou sessão à
  URL quebra tudo a cada refresh. O IPTVnator destila a regra: URL/headers/DRM
  são detalhe de transporte; a identidade é conteúdo + coordenadas.
- **Como adaptar/melhorar:** no CCPlay, aplicar o mesmo princípio nos modelos
  de catálogo (ADR-005 já separa `CatalogItem`/`SourceEntry`/`PlaybackOption`)
  e criar `createPlaybackSessionKey()` próprio, serializando identidade
  (fonte, tipo, id estável, S/E) sem incluir URL nem segredo.
- **Prioridade: P0** — impacta retomada e favoritos desde a primeira feature
  de importação.

---

## 3. Trabalho pesado fora do caminho da UI (worker/background)

- **O que é:** operações SQL/pesadas (importação, busca em massa, limpeza de
  catálogo) rodam num worker dedicado, com progresso e cancelamento
  request-scoped, em vez de congelar a UI.
- **Onde está no IPTVnator:** `docs/architecture/sqlite-db-worker.md` e skill
  `iptvnator-sqlite-db-worker` (`Ownership and Flow`: renderer → preload IPC →
  main → `DatabaseWorkerClient` → worker dispatcher → operation module). O
  motivo é explícito: "heavy operations were freezing the UI".
- **Por que reutilizar:** o CCPlay tem o mesmo problema no backend Python:
  importar catálogos de 300k+ entradas com `BackgroundTasks` na mesma app
  FastAPI bloqueia as rotas interativas (ADR-003 §4 e item 21 do backlog
  "Fila/worker durável"). O IPTVnator mostra o alvo: trabalho pesado isolado,
  com progresso observável e cancelamento cooperativo.
- **Como adaptar/melhorar:** no CCPlay, extrair o `run_import_job` de
  `BackgroundTasks` para um worker/processo separado (o importer já está bem
  fatorado em `api/app/services/importer.py`); escolher fila (Celery continua
  candidato, ADR-006 §3) e manter o `ImportJob` consultável como fonte de
  verdade do progresso (já existe — router `import_jobs.py`). O contrato
  `operationId`/`requestId` do IPTVnator é o modelo de identidade.
- **Prioridade: P0** — a feature 001 já convergiu, mas a operação em
  background é pré-requisito para não travar o backend em catálogos reais.

---

## 4. Cache-first com catálogo separado de preferências

- **O que é:** o catálogo processado é persistido localmente e lido
  imediatamente; preferências (favoritos, histórico, gosto) vivem **fora** do
  snapshot substituível do catálogo, para sobreviver à reimportação.
- **Onde está no IPTVnator:** `docs/architecture/m3u-playlist-module.md`
  (IndexedDB→SQLite, `preserveAutoUpdatedPlaylistFields` reaplicando
  `favorites`/`userAgent` sobre o payload novo) e o princípio em
  `docs/architecture/tmdb-metadata-enrichment.md` (cache separado por chave).
- **Por que reutilizar:** é exatamente a ADR-002 do CCPlay (offline-first) +
  ADR-005 §4 (preferências separadas do snapshot). O IPTVnator confirma o
  detalhe sutil: em refresh, os campos do usuário são **reaplicados** sobre o
  payload novo, nunca confiados ao re-download.
- **Como adaptar/melhorar:** no CCPlay, manter `CatalogRepository` (IndexedDB/
  Dexie) e `UserStateRepository` como repositórios separados (ADR-006 §4.2 já
  prevê); no sync, escrever lotes coerentes e reaplicar o estado do usuário
  por chave estável (não por posição na lista).
- **Prioridade: P0** — é o item 2 do backlog (cache local) e fundamenta
  favoritos/histórico.

---

## 5. Contrato de progresso/cancelamento por operação (`operationId`)

- **O que é:** uma identidade estável (`operationId`) que cruza UI, serviço e
  worker para reportar progresso e cancelar longas operações, separada do id
  de transporte de cada requisição.
- **Onde está no IPTVnator:** `docs/architecture/sqlite-db-worker.md`
  ("`requestId` and `operationId` have different scopes") e skill
  `iptvnator-sqlite-db-worker` ("Identity, Progress, and Cancellation").
- **Por que reutilizar:** o CCPlay já tem `ImportJob` com etapas e contadores
  (ADR-004 §5). A distinção do IPTVnator evita o erro clássico de misturar o
  id de operação (visível ao usuário) com o id de transporte (interno).
- **Como adaptar/melhorar:** manter o `ImportJob.id` como o `operationId`
  público da API; qualquer protocolo interno (fila, websocket) ganha seu
  próprio id de transporte. Cancelamento deve ser cooperativo por lote
  (o importer do CCPlay já grava lotes de 2000 — `_BATCH_SIZE`) e confirmado
  só quando o worker reconhece.
- **Prioridade: P1** — refinamento quando o worker durável (item 21) chegar.

---

## 6. Recuperação de reprodução com diagnóstico e ações ranqueadas

- **O que é:** falhas de reprodução são classificadas num diagnóstico
  estruturado e viram no máximo 3 ações de recuperação ranqueadas; o usuário
  escolhe; nada troca de motor automaticamente nem persiste preferência.
- **Onde está no IPTVnator:** `docs/architecture/player-controls-contract.md`
  ("Diagnostics And Recovery Ownership Boundary") e `libs/playback/util`
  (`PlaybackDiagnostic`, `recommendPlaybackRecovery`).
- **Por que reutilizar:** em TV, falha de stream é comum e o usuário não tem
  teclado para depurar. Um diagnóstico com "Tentar de novo / fonte alternativa"
  evita dead-ends. A regra "não auto-switch" também vale para o CCPlay (ADR-005:
  erro não marca como assistido nem apaga catálogo).
- **Como adaptar/melhorar:** no CCPlay, criar um `PlaybackDiagnostic`
  equivalente no frontend (sanitizado, sem URL/credenciais) e um painel de
  erro focado por D-pad com ações. A melhoria: dado o Direct Play + AVPlay,
  o diagnóstico precisa distinguir "falha de rede", "codec não suportado" e
  "fonte expirada".
- **Prioridade: P1** — pós-MVP, quando o player estiver estável.

---

## 7. Fronteiras por responsabilidade (feature/data-access/ui/util)

- **O que é:** regra de posicionamento de código por tipo — telas em
  `feature`, estado/API/persistência em `data-access`, componentes visuais em
  `ui`, helpers puros em `util` — com direções de dependência permitidas.
- **Onde está no IPTVnator:** skill `iptvnator-nx-architecture`
  (`Place Code by Ownership`, tabela de dependências por `type:*`) e
  `docs/architecture/nx-workspace-boundaries.md`.
- **Por que reutilizar:** o CCPlay já tem essa intenção em menor escala
  (`api/app/{routers,services,models,schemas}` no backend e
  `tv-web/src/{features,lib,components}` no front). Tornar as direções
  explícitas evita o acoplamento que o IPTVnator chama de "migration debt".
- **Como adaptar/melhorar:** documentar (sem Nx) uma regra equivalente:
  `features/` não importa de outro `features/` diretamente (usa `lib/`),
  `lib/` não importa `components/` de UI, etc. É barato e rende na hora em
  que o frontend crescer.
- **Prioridade: P1** — dívida estrutural que fica cara se ignorada agora.

---

## 8. Benchmarks determinísticos de importação

- **O que é:** um benchmark de importação com fixtures sintéticas (10k/50k/
  100k canais) medindo fases não-aditivas (aquisição, parse, normalização,
  escrita), com run formal exigindo worktree limpo e registro de commit.
- **Onde está no IPTVnator:** `docs/architecture/m3u-playlist-module.md`
  ("Initial URL Import Performance Benchmark" e "Refresh Cancellation
  Performance Regression").
- **Por que reutilizar:** a ADR-006 §2 do CCPlay já prevê exercitar conjuntos
  sintéticos de 1.000/10.000/100.000 entradas. O IPTVnator mostra como
  tornar isso **comparável** (fases isoladas, máquina/commit registrados).
- **Como adaptar/melhorar:** no CCPlay, montar um script pytest/httpx com
  fixture M3U sintética servida em `127.0.0.1` e medir as fases do
  `importer.py` (acquire/parse/classify/publish). Registar a distribuição das
  iterações medidas, sem misturar warm-up.
- **Prioridade: P2** — pós-MVP, para validar performance na TV real.
