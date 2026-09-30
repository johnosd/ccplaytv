# Handoff — 033-trailers-filmes-series

## Contexto

- Repo `ccplayTv`, branch `feature/novo-design-system`. App em `tv-web/` (React 19 + TS + Vite, Dexie, react-query, `useRemoteNav` próprio).
- Próximo comando: `/sdd-execute 033-trailers-filmes-series`.
- Backlog: `Planejada`, 0/52 tasks (42 tasks + 10 itens do Checklist de Release).
- Origem: avaliação `sdd/assessments/viabilidade-youtube-iframe-na-tv-campo/` (go) + **ADR-012** (página-ponte estática HTTPS). Ler a ADR-012 antes de tudo.
- Arquivos já alterados por esta sessão fora dos docs (stubs/tipos, não travados): `tv-web/src/lib/catalog/db.ts`, `tv-web/src/lib/metadata/types.ts`, `tv-web/src/lib/trailer/*`, `tv-web/src/components/TrailerLayer.tsx`.

## O que a feature entrega

- **P1** — Botão "Trailer" real no detalhe de filme e de série; OK abre camada de tela cheia que toca o trailer do **provedor** (`youtube_trailer`) pelo player oficial do YouTube **dentro de um iframe da página-ponte** (`https://johnosd.github.io/ccplaytv/trailer/?v=<id>`); RETURN/fim fecham e o foco volta ao botão; nada de estado do usuário muda.
- **P2** — TMDB (chave BYOK) soma candidatos depois do provedor; rótulo mostra tipo/idioma só quando não é trailer em português; vídeo bloqueado (100/101/150/2) → tenta o reserva **uma vez**; sem chave, o "indisponível" sugere configurar o TMDB.
- **P3** — OK/Play-Pause pausa, ←/→ ±10 s (single-flight), tela de erro com código e "Tentar de novo" (só rede/tempo/configuração) + "Voltar".
- Decisões do usuário que contrariam o óbvio: **sem nenhum fallback** fora do app (nem deep link, nem QR); o botão **nunca some** (fica soft-disabled "Trailer — indisponível"); o app **nunca** carrega o YouTube direto (erro 153 em `file://`, provado na TV).

## Leitura obrigatória, em ordem

1. `sdd/adr/ADR-012-pagina-ponte-estatica-https-embeds-terceiro.md` — por que a ponte existe e as 7 regras que ela precisa cumprir.
2. `spec.md` — FR-001…FR-023, SC-001…SC-006, clarificações.
3. `plan.md` — D-001…D-011, Constitution Check, riscos R-001…R-008.
4. `tasks.md` — 6 fases; T004 e T042 dependem do usuário.
5. `logic/candidatos-de-trailer.md` — fontes, ordem, cache (refetch de `matched` antigo, versão do provedor).
6. `logic/sessao-de-trailer.md` — máquina de estados, códigos, host `TrailerLayer`, teclado, single-flight.
7. `logic/pagina-ponte.md` — protocolo v1, conteúdo da ponte, publicação, como testar sem publicar.
8. `logic/botao-trailer.md` — estados/rótulos/OK nos dois detalhes.
9. `quickstart.md` — cenários de navegador e o gate na TV.
10. `.planning/memory/constitution.md` (1.6.0).

## Testes de contrato

- Travados (1 teste cada): `tv-web/src/lib/trailer/trailerCandidates.trailers.contract.test.ts` (Fase 2), `tv-web/src/lib/metadata/titleMetadata.trailers.contract.test.ts` (Fase 2), `tv-web/src/lib/trailer/trailerSession.trailers.contract.test.ts` (Fase 2), `tv-web/src/components/TrailerLayer.trailers.contract.test.tsx` (Fase 3), `tv-web/src/features/movies/MovieDetailScreen.trailers.contract.test.tsx` (Fase 3).
- Rodar (de `tv-web/`): `npx vitest run src/lib/trailer src/lib/metadata/titleMetadata.trailers.contract.test.ts src/components/TrailerLayer.trailers.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 033-trailers-filmes-series`
- Travas de outras features em risco: **032** (`titleMetadata.metadata-tmdb`, `MovieDetailScreen.metadata-tmdb` — mexemos em `titleMetadata.ts`, `tmdbLookup.ts`, `tmdbMapping.ts` e no detalhe), **025** (`vodMetadata`, `MoviesScreen`), **028** (`accessibleNames`). Conferir `-Slug 032-metadata-tmdb-integracoes` a cada fase.

## Stubs criados

- `lib/trailer/trailerCandidates.ts` — tipos + `isYoutubeVideoId` (pronto) + `trailerRefsFromTmdbVideos`/`buildTrailerCandidates`/`trailerButtonLabel` (`throw 'not implemented'`).
- `lib/trailer/trailerSession.ts` — tipos, `TRAILER_START_TIMEOUT_MS`, `startTrailerSession`/`reduceTrailerSession`/`trailerErrorMessage` (stubs).
- `lib/trailer/bridgeConfig.ts` — `TRAILER_BRIDGE_URL`/`ORIGIN`/`trailerBridgeSrc`/tipos do protocolo (prontos); `parseBridgeMessage` (stub).
- `components/TrailerLayer.tsx` — props definitivas (`title`, `candidates`, `onClose`); corpo stub.
- `lib/catalog/db.ts` — `TrailerVideoRef`, `TitleFields.trailerVideos`, `TitleMetadataRecord.providerVersion` (definitivos; sem versão Dexie nova).
- `lib/metadata/types.ts` — `TitleMetadataView.trailers` (definitivo).

## Armadilhas já mapeadas

- **`file://` na TV** (Tizen 9.0/Chromium 120, medido): o YouTube dá 153 sem a ponte. Nunca "simplificar" carregando `youtube.com/embed` direto — no navegador do PC funciona e esconde o problema.
- **Ponte fora do `.wgt`**: `bridge/` na raiz do repo; não adicionar a `tizen_web_project.yaml` nem ao Vite. O guard `findUnlistedFiles` não deve reclamar de nada novo.
- **Publicar a ponte é ação externa** (habilitar Pages, push/merge em `main`): pedir confirmação; nunca fazer sozinho. Sem publicação, o app mostra erro — não é bug.
- **Mensagens**: a ponte manda com alvo `'*'` (a origem do app é `file://`, opaca); o app valida origem **e** `event.source === iframe.contentWindow`. O jsdom aceita iframe externo e `MessageEvent` com `source` (verificado).
- **Série adia a metadata**: `ensureTitleMetadata` devolve sem provedor enquanto `seriesLoader` busca episódios; o botão da série precisa ficar "Trailer…" enquanto `episodesQuery.isPending`, senão pisca "indisponível".
- **`get_vod_streams` não tem `youtube_trailer`** (0/31 416); filmes só por `get_vod_info` (~1 %) ou TMDB. Séries: o `info` de `get_series_info` repete a listagem (25/25) — não mexer no import.
- **TMDB sem `include_video_language`** devolve só vídeos pt-BR (quase nenhum).
- **`no_match`/`dead_id` não são repedidos** — o 3º contrato da 032 depende disso.
- **Estado velho em tecla rápida** (lição da 027): ler a sessão por ref nos handlers.
- **Seek acumulado congelou o app na 011**: descartar, nunca enfileirar.
- **Flakes conhecidos** na suíte completa: `*.favorites.test.tsx`, `LiveScreen.test.tsx` — confirmar isolado (8/8 passaram nesta sessão).
- **E2E**: mesmo `executablePath` fixo dos outros scripts (Linux) — no Windows, override temporário como os demais; `page.route` para a ponte (servindo o HTML real do disco) e para `https://www.youtube.com/iframe_api` (YT fake).
- Mudança de cwd: comandos `npx` rodam de `tv-web/`; scripts `.planning` da raiz.

## Pendências do Analyze

- A-01 (MEDIUM) — O clamp do `seek-by` (FR-013 "sem passar do início nem do fim") só existe na ponte e nenhuma task o verifica explicitamente. Recomendação: incluir no E2E T037 um `seek-by` além da duração no YT fake e conferir o `seekTo` limitado.
- A-02 (MEDIUM) — R-006: constitution e `CLAUDE.md` citam Tizen 8.0/Chromium 108; o aparelho reportou 9.0/120. T041 corrige o `CLAUDE.md`; a constitution só o usuário emenda — sugerir no relato final.
- A-03 (LOW) — FR-022 ("publicada") e o gate T042 dependem de T004 (ação do usuário); se o usuário não publicar, a feature fica "código completo" com gate aberto — registrar como decisão explícita, nunca pular.
- A-04 (LOW) — Anúncio/autoplay (R-005/R-008) só são observáveis na TV; o E2E não os cobre.

## Gate de pronto

- 5/5 contratos verdes; `check-contract-tests.ps1` íntegro para 033, 032, 025, 028 (e o resto do repo).
- `npx tsc -b`, `npm run lint`, `npx vitest run` (flakes confirmados isolados), `npm run build:tizen` (sem arquivo novo emitido).
- `npm run test:e2e` com dev server recém-iniciado, incluindo o novo `e2e/trailers.mjs`.
- `quickstart.md` no navegador; revisão de segredos (T040).
- Polish atualiza `CLAUDE.md`, `.planning/backlog.md` (mocks restantes 16), tabela da ADR-012.
- **Passada na TV física é GATE OBRIGATÓRIO** (SC-001 ≥ 9/10 em 15 s; SC-002 10/10 RETURN com foco e sem áudio), com a ponte publicada. Fechar sem ela só por decisão explícita do usuário, com o risco em `Riscos e Decisões`.
