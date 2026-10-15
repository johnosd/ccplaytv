# Handoff — 047-player-dev-mpegts (para o `sdd-execute`)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TypeScript + Vite 8 (`tv-web/`), Vitest/jsdom, Playwright em Node. Comandos rodam em `tv-web/`.
- Próximo comando exato: `/sdd-execute 047-player-dev-mpegts`
- Status no backlog: **Planejada**.
- Origem: assessment `sdd/assessments/mpegtsjs-no-htmlvideoadapter-tocar-canais-no/decision.md` (veredito `go`, condicionado ao spike).
- Releia do disco antes de começar: a árvore tem muitas mudanças não commitadas de outras features (features 044/045/046, `CLAUDE.md`, etc.). Esta feature só toca os arquivos listados no `plan.md` → Source Code. Duas mudanças de CSS desta sessão (`tv-web/src/styles/shared.css`, `live.css`: logo do canal e prévia da Live) estão no working tree e **não** fazem parte da 047.

## O que a feature entrega

- **US1 (P1) — spike, porta de saída**: mede, com a lista real, se o Chromium decodifica vídeo+áudio dos canais; escreve `spike.md` com "seguir/parar". **Se parar, a feature termina ali** (FR-002).
- **US2 (P1)** — no `npm run dev`, canal `.ts` toca: `<video>` tenta primeiro; só se recusar um `.ts` com `error.code 4`, o mesmo elemento passa a ser alimentado por `mpegts.js`. Falha → o mesmo `PLAY-04`.
- **US3 (P2)** — build e Tizen intactos: script verifica que `dist/` não contém a lib.
- **US4 (P3)** — E2E padrão com `.ts` local + script real fora do `test:e2e`.
- Decisão do usuário que contraria o óbvio: o fallback é **automático** em dev (sem flag) e o erro de codec continua `PLAY-04` (sem código novo). O Playwright pode não decodificar H.264/AAC: nesse caso o E2E diz `PULADO` explicitamente, nunca verde falso (D-008).

## Leitura obrigatória, em ordem

1. `spec.md` — 4 histórias, 13 FR, 5 SC.
2. `plan.md` — Decisões Invariantes D-001…D-009, riscos R-001…R-006, estrutura real.
3. `tasks.md` — T001…T025 por fase; a Fase 3 é porta de saída.
4. `logic/fallback-demux.md` — pseudocódigo do fallback, do ciclo de vida e do starter (inclui a guarda `errorReported`).
5. `research.md` — por que `mpegts.js`, por que nativo primeiro, fixture com `ffmpeg`.
6. `quickstart.md` — checagens e cenários.
7. `.planning/memory/constitution.md` (v1.7.0): Segredos, Foco sem becos, Progresso e Capacidades, Validação em hardware real.

## Testes de contrato (travados — nunca editar)

- `tv-web/src/lib/player/devDemux.player-dev-mpegts.contract.test.ts` — 1 teste (Fase 4)
- `tv-web/src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts` — 3 testes (Fase 4)
- Rodar: `cd tv-web; npx vitest run src/lib/player/devDemux.player-dev-mpegts.contract.test.ts src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts`
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 047-player-dev-mpegts`
- Hoje: 4/4 vermelhos (`not implemented` e asserções de contagem). Eles usam a opção pública `createHtmlVideoAdapter(cb, { startDemux })` com um demux falso e `Object.defineProperty(video, 'error', …)` para simular o erro 4.
- Travas de **outras** features que a 047 pode quebrar: as que montam o adaptador de navegador (`htmlVideoAdapter.test.ts`, `htmlVideoAdapter.streamInfo.test.ts`, `htmlVideoAdapter.aspect.test.ts`, contratos de player/Live 016/027/029/031/041/042). Rode `check-contract-tests.ps1` de cada uma ao final.

## Stubs criados (não travados)

- `tv-web/src/lib/player/devDemux.ts`: tipos finais (`DemuxHandle`, `DemuxCallbacks.onFailure`, `DemuxStarter`, `FallbackInput`); `shouldFallbackToDemux` e `defaultDemuxStarter` lançam `not implemented` (T008/T009). Falta `isMpegTsUrl`.
- `tv-web/src/lib/player/htmlVideoAdapter.ts`: já aceita `_options?: HtmlVideoAdapterOptions` (`startDemux?: DemuxStarter | null`) **sem usá-lo**; T010 renomeia para `options` e implementa. O `import type` de `DemuxStarter` já está no topo.

## Armadilhas já mapeadas

- **Nativo primeiro (D-001)**: ~16 scripts E2E disparam eventos manuais em `.player-video` e várias fixtures têm URLs `.ts` com conteúdo falso. Demux direto quebraria isso. Rode **todos** os scripts do `test:e2e` 3 vezes (R-006).
- **Contrato 2 exige `errorReported`**: depois da falha do demux o elemento dispara outro `error`; sem a guarda saem dois `onError`.
- **Contrato 3 (close tardio)**: se `close()` vier antes de `startDemux` resolver, o handle que chegar depois é destruído na hora; `closed` e `element !== video` são as guardas.
- **`import('mpegts.js')` precisa ficar dentro** de `if (import.meta.env.DEV && typeof MediaSource !== 'undefined')`, senão a lib entra no bundle da TV. Não confie no tree-shaking: o verificador T014 é o gate. **Nunca** `dependencies`.
- **Vite**: sem `optimizeDeps.include: ['mpegts.js']` (T007) o dev pode recarregar a página no meio da reprodução (R-004).
- **jsdom não tem `MediaSource`**: `defaultDemuxStarter()` devolve `null` lá, então os testes antigos do adaptador seguem iguais.
- **Chromium do Playwright pode não decodificar H.264/AAC** (R-002): o spike mede e tenta `channel: 'chrome'`.
- **Segredos**: a URL do stream tem credencial. Nunca em log, saída de script, mensagem de erro nem commit; o erro da lib nunca é repassado; desligue o log da lib (confirme o nome da API nos tipos de `mpegts.js` instalado).
- **Dev server**: reinicie-o antes do E2E (um aberto há horas deixou a suíte instável). Não rode `build:tizen` (reescreve `CCPlayTv/`, já modificado fora desta feature).
- **Flakes conhecidos** sob paralelismo: `*.favorites.test.tsx`, `LiveScreen.test.tsx`, `SeriesScreen.favorites.test.tsx`; confirme isolados antes de culpar a 047. A última suíte completa (2026-10-02) teve 1 falha em 2357 não identificada.
- **Windows**: o `executablePath` Linux fixo dos `e2e/*.mjs` não existe aqui; os scripts já caem em `chromium.launch({ headless: true })` quando ausente.

## Pendências do Analyze

- **MEDIUM — T006**: o teste do spike está condicional ("se extrair a função…"). Recomendação: decidir ao escrever T003 e, se não houver função pura, trocar T006 por uma verificação manual da saída (sem `http`, sem host) registrada em `spike.md`.
- **LOW — FR-008** (TV não carrega o demux): coberto indiretamente por D-003 + verificador de build; não há teste direto de `resolveAdapterFactory` com AVPlay. Aceito; não vale um contrato.
- **LOW — SC-003** é medido só pelo E2E/script real (contagem de conexões no servidor), não por unitário; os contratos provam `destroy()`.

## Gate de pronto

- Contratos 4/4 verdes e travas íntegras (esta e as das features que mexem no player).
- `npx tsc --noEmit`, `npm run lint` (sem warnings novos além dos 45 aceitos), `npm test`, `npm run build` (com o verificador), `npm run test:e2e` ×3 (dev server reiniciado).
- `quickstart.md` executado; `spike.md` e `baseline.md` gravados.
- Polish: `CLAUDE.md` (entrada honesta da 047), cabeçalho de `htmlVideoAdapter.ts`, `update-feature-status.ps1`.
- Passada na TV física: **não é gate**; a reprodução em dev **não** prova o AVPlay (FR-011).
