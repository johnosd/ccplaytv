---
description: "Tasks da feature 033 — trailers de filmes e séries"
---

# Tasks: Trailers de Filmes e Séries

**Input**: Documentos de design de `sdd/specs/033-trailers-filmes-series/`

**Prerequisites**: plan.md, spec.md, `logic/*.md`, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)

## Path Conventions

- App: `tv-web/src/` — lógica pura em `lib/trailer/` e `lib/metadata/`, camada em
  `components/`, telas em `features/movies/`, `features/series/`, helper comum em `features/vod/`.
- E2E: `tv-web/e2e/*.mjs` (rodados de `tv-web/`, com `npm run dev` ligado).
- Página-ponte: `bridge/trailer/index.html` (raiz do repo, fora do `.wgt`);
  publicação: `.github/workflows/bridge-pages.yml`.
- Documentos: `sdd/specs/033-trailers-filmes-series/`, `.planning/backlog.md`, `CLAUDE.md`, `sdd/adr/ADR-012-*.md`.

---

## Phase 1: Setup — página-ponte e publicação

**Purpose**: a ponte existe no repo e tem como ser publicada. Não depende do app.

- [X] T001 [P] Criar `bridge/trailer/index.html` exatamente como `logic/pagina-ponte.md` §3–§5 (protocolo v1, validação do comando por `event.source === window.parent`, id validado, `api-failed` em 10 s, sem cookies/analytics/log de dados)
- [X] T002 [P] Criar `.github/workflows/bridge-pages.yml` (`logic/pagina-ponte.md` §6: `workflow_dispatch` + push em `main` com `paths: bridge/**`, publica só `bridge/`)
- [X] T003 Verificar a ponte localmente no navegador: servir `bridge/` (`python -m http.server` na raiz de `bridge/`) e abrir `http://localhost:8000/trailer/?v=M7lc1UVf-VE` — o vídeo toca; `?v=invalido` não carrega o player
- [X] T004 **[AÇÃO DO USUÁRIO — pedir confirmação, nunca fazer sozinho]** Habilitar GitHub Pages ("Source: GitHub Actions") em `johnosd/ccplaytv` e publicar (merge/push em `main` ou rodar o workflow). Registrar em `plan.md` a data e se `https://johnosd.github.io/ccplaytv/trailer/?v=M7lc1UVf-VE` toca no navegador do PC (primeira evidência de R-001). Não bloqueia as fases 2–5.

**Registro da Fase**:

- Status: concluída — T001–T004 (T004 publicada em 2026-09-29, ver Pendências)
- Feito: `bridge/trailer/index.html` (protocolo v1, id validado, `api-failed` em 10 s, comandos só de `window.parent`, `seek-by` com clamp 0…duração) e `.github/workflows/bridge-pages.yml` (publica só `bridge/`).
- Contrato: sem contrato nesta fase (trava 033 íntegra, 5/5)
- Testes executados: `python -m http.server 8000 --directory bridge` + Playwright MCP: `?v=M7lc1UVf-VE` cria o iframe do player oficial do YouTube; `?v=invalido` não cria player. Reprodução real com áudio não foi observada (navegador headless) — fica para o gate da TV.
- Pendências: nenhuma. **T004 feita com confirmação do usuário (2026-09-29):** o `main` já tinha um `static.yml` genérico que publicava o repositório inteiro e disputava o deploy; com a escolha do usuário ele foi removido no `main` e entrou só o commit da ponte (cherry-pick, `bridge/` + `bridge-pages.yml`). Run `Publicar página-ponte` com sucesso; `https://johnosd.github.io/ccplaytv/trailer/?v=M7lc1UVf-VE` responde 200 com a página real e cria o player oficial (`youtube.com/embed/M7lc1UVf-VE`) sob a origem `https://johnosd.github.io` (primeira evidência de R-001 no navegador do PC; reprodução real com áudio ainda só na TV). `CLAUDE.md`, `bridge/trailer/` e `tv-web/package.json` respondem 404 no Pages: só `bridge/` é publicado.

---

## Phase 2: Foundational — candidatos, sessão e captura dos dados

**Purpose**: a lógica pura e os dados que as três stories usam. BLOQUEIA as fases 3–5.

### Contrato da Fase

- `trailerCandidates — provedor primeiro e TMDB ordenado…` (C1) — FR-003/004/007
- `ensureTitleMetadata — youtube_trailer 1º; videos na mesma chamada…` (C2) — FR-002/003/004/005
- `trailerSession — bloqueado tenta o próximo uma vez…` (C3) — FR-017/018/019
- Comando (de `tv-web/`): `npx vitest run src/lib/trailer src/lib/metadata/titleMetadata.trailers.contract.test.ts`

### Implementation

- [X] T005 [P] Implementar `isYoutubeVideoId` (já pronto), `trailerRefsFromTmdbVideos`, `buildTrailerCandidates`, `trailerButtonLabel` em `tv-web/src/lib/trailer/trailerCandidates.ts` (`logic/candidatos-de-trailer.md` §2/§3; nome do idioma por `Intl.DisplayNames(['pt-BR'], {type:'language'})` com a 1ª letra maiúscula, fallback para o código em maiúsculas) → contrato: C1
- [X] T006 [P] Implementar `startTrailerSession`, `reduceTrailerSession`, `trailerErrorMessage` em `tv-web/src/lib/trailer/trailerSession.ts` (`logic/sessao-de-trailer.md` §2–§5) → contrato: C3
- [X] T007 [P] Implementar `parseBridgeMessage` em `tv-web/src/lib/trailer/bridgeConfig.ts` (`logic/pagina-ponte.md` §4)
- [X] T008 [P] `normalizeVodInfo`/`normalizeSeriesInfo` leem `info.youtube_trailer` → `trailerVideos: [{ videoId, kind: 'trailer' }]` só se `isYoutubeVideoId` em `tv-web/src/lib/metadata/providerMetadata.ts` → contrato: C2
- [X] T009 [P] `mapTmdbDetail` preenche `trailerVideos` a partir de `detail.videos` (só quando a chave existe) em `tv-web/src/lib/metadata/tmdbMapping.ts` → contrato: C2
- [X] T010 `detailParams` com `append_to_response: 'credits,videos'` e `include_video_language: 'pt,en,null'` em `tv-web/src/lib/metadata/tmdbLookup.ts` (as duas chamadas de detalhe; não o fallback de sinopse) → contrato: C2
- [X] T011 `PROVIDER_FIELDS_VERSION = 2` exportada e `providerVersion` gravado por `storeProviderMetadata` em `tv-web/src/lib/metadata/titleMetadataStore.ts` (D-006)
- [X] T012 Em `tv-web/src/lib/metadata/titleMetadata.ts`: `mergeTitleMetadata` monta `view.trailers` (§6); `providerLeavesGaps` considera trailer; `enrichFromTmdb` repede `matched` sem `trailerVideos` uma vez (D-005); `refreshFromProvider` trata versão antiga como vencida (D-006, inclusive o caminho de série) → contrato: C2

### Testes da Fase

- [X] T013 [P] Testes extras de `trailerCandidates` (só provedor; só TMDB; `results` malformado; corte em 5; idioma ausente no TMDB) em `tv-web/src/lib/trailer/trailerCandidates.test.ts`
- [X] T014 [P] Testes extras de `trailerSession` (todas as linhas de §3; `bridge-failed`; eventos em `closed`/`error` ignorados; `retry` em erro não-retryable não muda) em `tv-web/src/lib/trailer/trailerSession.test.ts`
- [X] T015 [P] Testes de `parseBridgeMessage` (origem errada, janela errada, `v` errado, `type` desconhecido, `code` não numérico) em `tv-web/src/lib/trailer/bridgeConfig.test.ts`
- [X] T016 [P] `youtube_trailer` ausente/`""`/`"0"`/inválido → sem `trailerVideos` em `tv-web/src/lib/metadata/providerMetadata.test.ts`
- [X] T017 Testes de `titleMetadata`: `matched` antigo sem `trailerVideos` repede uma vez e depois não; `no_match` não repede; provedor versão 1 dentro das 24 h é rebuscado; série com episódios pendentes continua adiada — em `tv-web/src/lib/metadata/titleMetadata.test.ts`
- [X] T018 Rodar os contratos da 032 (`check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes` + `npx vitest run src/lib/metadata`) — continuam verdes

**Critério de Conclusão**: `npx vitest run src/lib/trailer src/lib/metadata/titleMetadata.trailers.contract.test.ts` → C1, C2, C3 verdes; `check-contract-tests.ps1 -Slug 033-trailers-filmes-series` e `-Slug 032-metadata-tmdb-integracoes` íntegros; `npx vitest run src/lib/metadata src/lib/trailer src/lib/catalog/seriesLoader` verde; `npx tsc -b` limpo.

**Checkpoint**: Fundação pronta — as stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: T005–T018. `trailerCandidates`, `trailerSession`, `parseBridgeMessage`; `youtube_trailer` em `normalizeVodInfo`/`normalizeSeriesInfo`; `videos` + `include_video_language=pt,en,null` no TMDB; `PROVIDER_FIELDS_VERSION = 2`; `view.trailers` no merge; refetch de `matched` sem `trailerVideos` (D-005) e do provedor de versão antiga (D-006). Ad-hoc dentro das tasks: os 2 testes da 032 em `titleMetadata.tmdb.test.ts` que assumiam "provedor completo sem trailer" ganharam `youtube_trailer` no fixture e `videos: { results: [] }` no `movieDetail` (consequência direta de FR-004/`providerLeavesGaps`, aprovada pelo usuário). T017 ficou em arquivo novo, `titleMetadata.trailers.test.ts` (o caso "série adiada" já é coberto por `titleMetadata.tmdb.test.ts`).
- Contrato: `npx vitest run src/lib/trailer src/lib/metadata/titleMetadata.trailers.contract.test.ts` → C1, C2, C3 verdes; trava 033 íntegra e trava 032 íntegra. C1 emendado com aprovação (R-009).
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/lib/trailer src/lib/metadata src/lib/catalog` → 42 arquivos / 441 testes verdes; `npm run lint` sem erro novo (só avisos já existentes).
- Pendências: nenhuma na fase.

---

## Phase 3: User Story 1 — Ver o trailer que o provedor já informa (Priority: P1) 🎯 MVP

**Objetivo**: o botão real nos dois detalhes e a camada que toca pela ponte, com RETURN e fim devolvendo o foco.

**Independent Test**: série com `youtube_trailer` e sem chave TMDB → "▶ Trailer" → OK → toca → RETURN → foco no botão, estado do usuário intacto.

### Contrato da Fase

- `TrailerLayer — ponte só com o id; mensagens validadas; OK/fim/RETURN` (C4) — FR-009/010/011/013/014/023
- `MovieDetailScreen — "Trailer…", indisponível com dica, abre e devolve o foco` (C5) — FR-001/006/008/009/014/016
- Comando (de `tv-web/`): `npx vitest run src/components/TrailerLayer.trailers.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx`

### Implementation

- [X] T019 Implementar `TrailerLayer` em `tv-web/src/components/TrailerLayer.tsx`: iframe da ponte (`key` por candidato/retry), sessão (`reduceTrailerSession`, estado lido por ref — R-004), listener de `message` com `parseBridgeMessage`, prazo, `stop` + `onClose` uma única vez, `useRemoteNav({ onDirection, onSelect, onBack, onMediaKey }, { modal: true })`, estados loading ("Cancelar")/playing ("⏸ Pausar")/paused ("▶ Continuar") com um `.tv-focus`, `window.focus()` após `ready` (R-002), `useAnnounce` ao abrir (`logic/sessao-de-trailer.md` §6) → contrato: C4
- [X] T020 [P] Estilos da camada com tokens V14 (tela cheia opaca, faixa inferior, pills) — em `tv-web/src/styles/player.css` ou novo `tv-web/src/styles/trailer.css` importado em `tv-web/src/main.tsx` (sem cor/raio/tamanho literal)
- [X] T021 [P] Criar `tv-web/src/features/vod/trailerAction.ts`: `trailerActionState`, `trailerActionLabel`, `trailerActionToast` (`logic/botao-trailer.md` §2–§4)
- [X] T022 `MovieDetailScreen`: estado do botão via `trailerActionState` (`checking = isFetching || data === undefined`), rótulo/`is-soft-disabled`/`aria-disabled`, OK conforme §4, `trailerOpen` + `<TrailerLayer>` (guarda `playing`), `useTmdbStatus` — em `tv-web/src/features/movies/MovieDetailScreen.tsx` → contrato: C5
- [X] T023 `SeriesDetailScreen`: o mesmo, com `checking` também enquanto `episodesQuery.isPending` — em `tv-web/src/features/series/SeriesDetailScreen.tsx`
- [X] T024 Remover `trailer` de `tv-web/src/lib/comingSoon.ts` e ajustar `tv-web/src/lib/comingSoon.test.ts`; atualizar o comentário de `onMediaKey` em `tv-web/src/lib/useRemoteNav.ts` (não é mais exclusivo do `PlayerLayer`)
- [X] T025 Atualizar os testes existentes que esperavam o mock soft-disabled "▶ Trailer" em `tv-web/src/features/movies/MovieDetailScreen.test.tsx` e `tv-web/src/features/series/SeriesDetailScreen.test.tsx` (mockar `useTmdbStatus`/`TrailerLayer` como no contrato)

### Testes da Fase

- [X] T026 [P] `TrailerLayer`: erro mostra `ErrorState` com o código e as ações certas; "Tentar de novo" remonta o iframe; prazo de 15 s com fake timers vira `TRL-TEMPO`; `visibilitychange` oculto fecha; `ended` + RETURN juntos chamam `onClose` uma vez; `navigator.onLine=false` abre em `TRL-REDE` — em `tv-web/src/components/TrailerLayer.test.tsx`
- [X] T027 [P] `trailerAction` puro (os três estados, dica só sem TMDB configurado) em `tv-web/src/features/vod/trailerAction.test.ts`
- [X] T028 `SeriesDetailScreen`: "Trailer…" enquanto episódios pendentes mesmo com metadata vazia; disponível abre a camada; fechar volta o foco — em `tv-web/src/features/series/SeriesDetailScreen.test.tsx`

**Critério de Conclusão**: comando do contrato → C4 e C5 verdes (e C1–C3 continuam); `check-contract-tests.ps1` íntegro para 033 e 032; `npx vitest run src/components src/features/movies src/features/series src/features/vod src/lib` verde (flakes conhecidos confirmados isolados); `npx tsc -b` e `npm run lint` limpos; cenário A do `quickstart.md` no navegador (ponte servida localmente ou via `page.route`).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: T019–T028. `TrailerLayer` completo (sessão por ref + render forçado, mensagens só da origem da ponte e da janela do iframe atual, prazo de 15 s, `stop` + `onClose` uma única vez, teclado modal, faixa, erro com `ErrorState`), `trailer.css` com tokens, `trailerAction.ts` (estado/rótulo/toast puros), botão real e `TrailerLayer` em `MovieDetailScreen` e `SeriesDetailScreen` (série: "Trailer…" enquanto `episodesQuery.isPending`), `trailer` removido de `comingSoon.ts`. O código de T029 (só 2 candidatos), T033 (seek single-flight, teclas de mídia) e T034 (faixa 4 s, foco nas ações do erro) foi escrito junto, no mesmo arquivo; seus testes e fechamento estão nas fases 4 e 5. Desvios aprovados no caminho: (a) o herói do Início ainda usava `getComingSoon('trailer')` e passaria a lançar erro — ganhou o mock próprio `home-trailer` (R-010); (b) `stop` no fechamento exigiu manter o iframe montado em `closed` e mandar o `stop` do desmonte num `useLayoutEffect` (o React solta a ref do iframe antes dos cleanups de `useEffect`).
- Contrato: `npx vitest run src/components/TrailerLayer.trailers.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx` → C4 e C5 verdes (C1–C3 seguem verdes); trava 033 e 032 íntegras.
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/components src/features/movies src/features/series src/features/vod src/features/home src/lib` → 1211/1214; as 3 falhas são `MoviesScreen.favorites`, `SeriesScreen.favorites` e `SeriesDetailScreen › "Minha Lista"` sob paralelismo — isolados passam (`SeriesScreen.favorites` 3/3; `SeriesDetailScreen.test.tsx` 47/47 em 3 rodadas; `MoviesScreen.favorites` já verde em execução isolada anterior).
- Pendências: flake sob paralelismo dos três testes acima (mesmo padrão já documentado); cenário A do `quickstart.md` no navegador fica para o E2E da Fase 6 (T037), que serve a ponte real do disco.

---

## Phase 4: User Story 2 — TMDB completa quando o provedor não informa (Priority: P2)

**Objetivo**: filmes (e séries sem `youtube_trailer`) ganham trailer pelo TMDB, com rótulo de tipo/idioma e reserva automática.

**Independent Test**: com chave TMDB, filme sem trailer do provedor → rótulo certo → toca; primeiro vídeo bloqueado → reserva toca.

(A lógica já está pronta na Fase 2 — C1/C2/C3 — e na Fase 3 — C5 cobre a dica. Esta fase fecha a fiação e a medição.)

### Implementation

- [X] T029 [US2] Garantir que o `TrailerLayer` passe só `candidates.slice(0, 2)` à sessão (`candidateCount = min(n, 2)`) e que a troca por 100/101/150/2 remonte o iframe com o reserva — em `tv-web/src/components/TrailerLayer.tsx`
- [X] T030 [P] [US2] Script de medição `tv-web/e2e/trailers-real.mjs` (fora do `test:e2e`; lê o `.env` da raiz; amostra séries e filmes; imprime **só** contagens: com candidato do provedor, do TMDB — se `CCPLAY_PROBE_TMDB_KEY` existir —, de ambos, de nenhum) — SC-005

### Testes da Fase

- [X] T031 [P] [US2] `TrailerLayer`: `error 150` no 1º candidato remonta com o 2º e, se tocar, nenhum erro aparece; `150` no 2º → `ErrorState` só com "Voltar" — em `tv-web/src/components/TrailerLayer.test.tsx`
- [X] T032 [P] [US2] Detalhe de filme mostra "▶ Trailer · Inglês" / "▶ Teaser" conforme o 1º candidato — em `tv-web/src/features/movies/MovieDetailScreen.test.tsx`

**Critério de Conclusão**: T031/T032 verdes; contratos 033 e 032 verdes e íntegros; `node e2e/trailers-real.mjs` roda e o resultado (só contagens) fica registrado no `plan.md` (SC-005).

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: T029–T032. Só os dois primeiros candidatos entram na sessão (`min(n, 2)`), a troca por 100/101/150/2 remonta o iframe com o reserva; `e2e/trailers-real.mjs` (fora do `test:e2e`, só contagens); testes do reserva automático e dos rótulos "▶ Trailer · Inglês"/"▶ Teaser" no detalhe de filme.
- Contrato: C1–C5 verdes; trava 033 e 032 íntegras.
- Testes executados: `npx vitest run src/components/TrailerLayer.test.tsx src/features/movies/MovieDetailScreen.test.tsx` verdes (21 + suíte do filme). `node e2e/trailers-real.mjs` no painel real (SC-005, amostra de 60 séries e 60 filmes): **provedor com trailer em 12/60 séries (20 %) e 8/60 filmes (13 %)** — mais que o ~1 % de filmes medido na avaliação. **TMDB não medido**: o `.env` não tem `CCPLAY_PROBE_TMDB_KEY`; sem ela o script só mede o provedor.
- Pendências: medir a parte TMDB de SC-005 (exige uma chave de teste no `.env`); a quantidade de títulos com trailer via TMDB segue desconhecida.

---

## Phase 5: User Story 3 — Controlar o trailer e se recuperar de falhas (Priority: P3)

**Objetivo**: pausar/buscar pelo controle e telas de erro com saída.

**Independent Test**: OK pausa/retoma, → avança; sem rede → erro com "Tentar de novo"/"Voltar"; "Voltar" devolve o foco ao botão.

### Implementation

- [X] T033 [US3] ←/→ mandam `seek-by ∓10` com single-flight (descarta enquanto pendente; libera em `seeked` ou 1 s); teclas de mídia `MediaPlayPause`/`MediaPlay`/`MediaPause` = `toggle`; demais ignoradas — em `tv-web/src/components/TrailerLayer.tsx` (`logic/sessao-de-trailer.md` §6/§7)
- [X] T034 [US3] Faixa inferior: some 4 s após a última tecla tratada em `playing`, sempre visível em `paused`; ações do erro navegáveis por ←/→ com um foco — em `tv-web/src/components/TrailerLayer.tsx`

### Testes da Fase

- [X] T035 [P] [US3] Seek: dois → seguidos sem `seeked` mandam UM `seek-by`; depois de `seeked` manda o próximo; `MediaPlayPause` manda `toggle`; `ChannelUp` não manda nada — em `tv-web/src/components/TrailerLayer.test.tsx`
- [X] T036 [P] [US3] `findUnnamedControls` (feature 028) sobre a camada em loading/playing/paused/error — em `tv-web/src/components/TrailerLayer.test.tsx`

**Critério de Conclusão**: T035/T036 verdes; contratos 033/032 verdes e íntegros; cenários D e E do `quickstart.md` no navegador.

**Registro da Fase**:

- Status: concluída (2026-09-29)
- Feito: T033–T036. ←/→ mandam `seek-by ∓10` com single-flight (descarta enquanto pendente; libera em `seeked` ou 1 s), `MediaPlayPause`/`MediaPlay`/`MediaPause` viram `toggle` e as demais teclas de mídia são ignoradas; a faixa some 4 s depois da última tecla tratada tocando (o `.tv-focus` continua no DOM, só com opacidade 0) e fica sempre visível pausada; ←/→ movem o foco entre as ações do erro.
- Contrato: C1–C5 verdes; trava 033 e 032 íntegras.
- Testes executados: `npx vitest run src/components/TrailerLayer.test.tsx` → 21/21 (seek único, liberação em 1 s, teclas de mídia, faixa, foco no erro, `findUnnamedControls` em carregando/tocando/pausado/erro).
- Pendências: cenários D e E do `quickstart.md` no navegador ficam para o E2E da Fase 6; o clamp do `seek-by` (A-01) só pode ser conferido com a ponte real + YT fake no E2E.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentação, gates.

- [X] T037 E2E `tv-web/e2e/trailers.mjs` (`logic/pagina-ponte.md` §7): `page.route` do endereço da ponte servindo o `bridge/trailer/index.html` REAL + `page.route` do `iframe_api` com YT fake; fluxos: série com trailer do provedor abre/toca/RETURN com foco no botão; OK pausa (mensagem `toggle` chega ao YT fake); fim fecha; 150 → reserva; sem rede → `TRL-REDE`; filme sem trailer e sem chave → toast com "Integrações"; percorrer a grade não gera requisição à ponte nem ao TMDB (SC-004). Mesmo `executablePath` dos outros scripts
- [X] T038 Acrescentar `node e2e/trailers.mjs` ao fim de `test:e2e` em `tv-web/package.json`
- [X] T039 Rodar tudo: `npx tsc -b`, `npm run lint`, `npx vitest run` (flakes conhecidos confirmados isolados), `npm run build:tizen` (nenhum arquivo emitido novo), `npm run test:e2e` com dev server recém-iniciado; todas as travas do repositório íntegras (`check-contract-tests.ps1` por feature com lock)
- [X] T040 Revisão de segredos (constitution): nenhuma credencial/URL de fonte/chave em log, toast, erro, `aria-*` ou URL da ponte; a ponte não tem nada além do id (SC-006)
- [X] T041 Documentação: `CLAUDE.md` (parágrafo da 033; plataforma medida Tizen 9.0/Chromium 120 onde citada — R-006), `.planning/backlog.md` (item 32/linha 11 → código completo; mock `trailer` removido — restam 16), tabela de páginas-ponte da `sdd/adr/ADR-012-*.md` (status "publicada"/"código completo"), `.planning/migracao-design-system-v14.md` se listar o mock
- [X] T042 **[GATE — TV física, com a ponte publicada (T004)]** `quickstart.md` → "Na TV física": SC-001 (≥ 9/10 em 15 s) e SC-002 (10/10 RETURN com foco, sem áudio). Via skill `tizen-tv`. Resultado cenário a cenário no `plan.md`; "não testado" nunca vira "aprovado"; fechar sem este gate só por decisão explícita do usuário, com risco registrado
- [X] T043 **(ad-hoc, descoberta durante T037; aprovada pelo usuário — R-011)** Corrigir o bug pré-existente em que voltar do detalhe para a grade refazia o `get_vod_streams` e trocava os ids dos canais: `ensureCategory` (`tv-web/src/lib/catalog/categoryLoader.ts`) passa a decidir a frescura pelo `itemsFetchedAt` GRAVADO (maior entre o registro e o retrato recebido), não só pelo retrato que a tela guarda; teste de regressão em `categoryLoader.test.ts` (falha sem o fix, passa com ele)
- [X] T044 **(ad-hoc, achado na passada da TV; aprovado pelo usuário — R-012)** Prioridade do TMDB passa a "tipo, oficial, idioma" (era "tipo, idioma, oficial"): o dublado de um canal agregador passava na frente do oficial da distribuidora. Contrato C1 emendado só na ordem esperada e regravado; `trailerCandidates.ts`, spec FR-004 e `logic/candidatos-de-trailer.md` ajustados
- [X] T045 **(ad-hoc, achado na passada da TV — R-013)** Dois anúncios seguidos do YouTube estouravam os 15 s e o app derrubava o trailer com TRL-TEMPO: novo evento `bridge-ready` (`trailerSession.ts`, prazo de 90 s com o player vivo), `TrailerLayer` mostra só a faixa "Anúncios do YouTube podem passar…" + "Cancelar" com o vídeo à vista; testes de sessão/camada e E2E (16,5 s sem erro)

**Registro da Fase**:

- Status: concluída — T037–T045; T042 fechada por DECISÃO EXPLÍCITA do usuário (R-015), não por aprovação numérica
- Feito: `e2e/trailers.mjs` (ponte REAL servida do disco no endereço de produção + player do YouTube falso; 3 rodadas verdes) e entrada em `test:e2e`; `e2e/trailers-real.mjs`; revisão de segredos (nenhum `console`/`fetch`/credencial no código novo; só o id na URL da ponte; erros só por código próprio); `CLAUDE.md` (parágrafo da 033 e plataforma medida Tizen 9.0/Chromium 120), `.planning/backlog.md` (prosa), tabela da ADR-012 ("código completo; publicação e passada na TV pendentes"), `migracao-design-system-v14.md`. A E2E cobre o clamp do `seek-by` (A-01) e o "sem piscar indisponível" da série. Dois bugs reais achados só por ela e corrigidos na `TrailerLayer`: o StrictMode (dev) marcava a camada como fechada para sempre no remonte de efeito; o `stop` no desmonte precisou de `useLayoutEffect`.
- Contrato: 5/5 verdes na suíte completa; `check-contract-tests.ps1` íntegro para as 17 features com trava (033, 032, 025, 028 e o resto).
- Testes executados: `npx tsc -b` limpo; `npm run lint` só com avisos já existentes; `npm run build:tizen` sem arquivo novo emitido (o guard `findUnlistedFiles` não reclamou); `npx vitest run` → 1780/1784, as 4 falhas são `SeriesScreen.favorites`, `MoviesScreen.favorites`, `LiveScreen.favorites` e `LiveScreen.test` sob paralelismo — isoladas passam 106/106; `npm run test:e2e` (16 scripts, incluindo `trailers.mjs`) → exit 0.
- Pendências (riscos aceitos): **na passada da TV o usuário relatou** Wardriver com dois anúncios e depois o trailer, fim do trailer voltando ao detalhe, RETURN correto e "o resto conforme esperado"; **NÃO informados, logo "não testados"**: contagens de SC-001 (9/10) e SC-002 (10/10), Play/Pause e ←/→, sair do app com o trailer tocando, filme (AVPlay) + trailer sem áudio duplo. R-014 ("vídeo sem relação") não reapareceu no relato. Gate fechado com risco aceito pelo usuário. Também: TMDB de SC-005 sem chave no `.env`; a constitution ainda diz Tizen 8.0/Chromium 108 — só o usuário a emenda.

### Checklist de Release

- [X] Fase 1 (ponte + workflow) concluída; ponte publicada (T004) — ação do usuário
- [X] Fase 2 (fundação) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 033-trailers-filmes-series` íntegro; travas da 032, 025 e 028 íntegras
- [X] `tsc`/lint/`build:tizen` limpos; `npm run test:e2e` verde (inclui `e2e/trailers.mjs`)
- [X] Revisão de segredos feita (T040)
- [X] `quickstart.md` executado no navegador (cenários A–F cobertos por `e2e/trailers.mjs`; ver Registro da Fase 6)
- [X] Gate da TV física (SC-001/SC-002) aprovado ou decisão explícita do usuário registrada (decisão explícita em 2026-09-29, R-015)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1**: independente; T004 depende do usuário e só é exigido pelo gate T042.
- **Fase 2**: bloqueia 3–5.
- **Fase 3 (US1)**: depende da 2.
- **Fase 4 (US2)** e **Fase 5 (US3)**: dependem da 3 (mexem no `TrailerLayer`); podem ser feitas em qualquer ordem entre si, mas no mesmo arquivo — não em paralelo.
- **Fase 6**: depende de 1–5; T042 depende de T004.

### Parallel Opportunities

- Fase 1: T001 ∥ T002.
- Fase 2: T005 ∥ T006 ∥ T007 ∥ T008 ∥ T009; depois T010 → T011 → T012.
- Fase 3: T020 ∥ T021 enquanto T019 avança; T022/T023 depois de T019+T021.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1 (T001–T003) + Fase 2.
2. Fase 3 → validar cenário A no navegador.
3. Pedir ao usuário a publicação (T004) e, se ele quiser, uma passada curta na TV só do cenário A antes de seguir (primeiro teste de R-001/R-002).

### Incremental Delivery

Fase 4 → Fase 5 → Polish, sem quebrar as anteriores; contratos verdes em cada checkpoint.

## Notes

- Contratos travados: nunca editar os 5 arquivos `*.trailers.contract.test.*`.
- `bridge/` fica fora de `tv-web/`: não adicionar ao `tizen_web_project.yaml` nem ao build.
- Publicar a ponte é ação externa: sempre pedir confirmação ao usuário.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
