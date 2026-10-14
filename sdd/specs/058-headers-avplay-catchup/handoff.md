# Handoff — 058-headers-avplay-catchup

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2` (muitas alterações não commitadas de outras features — não reverter nada fora desta feature).
- Stack: `tv-web/` React 19 + TypeScript + Vite, Dexie (v16), Vitest, Playwright; TV Tizen 9 (AVPlay). `api/` não é tocado.
- Próximo comando: `/sdd-execute 058-headers-avplay-catchup`
- Backlog: `Planejada`, 0/53 (44 tasks + checklist). A `057-top10-dica-tmdb` está em execução em paralelo e usou o Dexie **v16** — esta feature **não** sobe versão.
- `spec.md` foi emendada pelo plano (FR-010, FR-015, FR-016, FR-018, US2-AC6, US3) — releia a seção `## Clarifications` → "Sessão 2026-10-04 (sdd-plan)".

## O que a feature entrega

- **US1 (P1)**: headers `User-Agent`/`Referer` da lista M3U (canal, filme, episódio) chegam ao AVPlay; o recusado + falha vira `PLAY-05` ("Esta lista exige um header que esta TV não envia."); "Info do stream" mostra só os nomes.
- **US2 (P2)**: canal de painel Xtream com `tv_archive` → Guia marca programa passado disponível → OK toca do início como VOD (⏪ ▶⏸ ⏩ **Ao vivo**), duração do EPG, segue para o contíguo e depois para o ao vivo, **sem** histórico.
- **US3 (P3)**: "Do início" **só no chrome do player ao vivo** (depois de "Guia"); a prévia da Live ganha só um **selo não focável** "Arquivo · N dias" (decisão do usuário — a prévia não tem foco desde a 049).
- Decisão do usuário: a lista real declara arquivo em 75 canais, mas o painel responde **404** nas duas variantes de URL. Catch-up é aceito por **painel falso**; na lista real fica **"não testado"** (e exercita o erro `PLAY-06`).

## Leitura obrigatória, em ordem

1. `spec.md` — FRs (com as emendas do plano).
2. `plan.md` — D-001..D-013, Constitution Check, R-001..R-008.
3. `tasks.md` — 5 fases; T003 e T014 são **gates na TV**.
4. `research.md` — o que a lista real mostrou (R2/R3), por que a sondagem é pelo player (R4), fuso (R5), busca (R6).
5. `data-model.md` — campos novos, sem bump do Dexie.
6. `logic/headers.md` — adaptador, sessão, diagnóstico (ordem), Info.
7. `logic/arquivo.md` — disponibilidade, URL no relógio do painel, `fetchArchivePlayback`, sessão/timeline, chrome, tela, Guia, selo.
8. `quickstart.md` — Cenários A/B (navegador), C (TV).
9. `.planning/memory/constitution.md` — Segredos, Foco, Voltar, Identidade de Reprodução, Capacidades Reais.

## Testes de contrato

Travados (`contract-tests.lock`, 5 testes), todos vermelhos hoje pelo motivo certo:

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts` | 1 | 2 |
| `tv-web/src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx` | 2 (header → Fase 2; arquivo → Fase 3) | 2 e 3 |
| `tv-web/src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts` | 1 | 3 |
| `tv-web/src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts` | 1 | 3 |

- Rodar (em `tv-web/`): `npx vitest run src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts`
- Integridade (raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 058-headers-avplay-catchup`
- Travas de **outras** features em risco: 027 (`PlayerLayer.player-chrome`), 029 (`PlayerLayer.audio-legendas-info`), 031 (`PlayerLayer/LiveScreen/EpgGuide.epg-guia-completo`), 041 (`PlayerLayer.qualidade-aspecto` — conta passos na linha), 042 (`PlayerLayer.rede-lifecycle`, `playbackDiagnosis.rede-lifecycle`), 024/048/049 (`LiveScreen.*`). Tudo novo é opt-in por prop; rode todas as travas a cada fase.

## Stubs criados

- `lib/player/PlayerService.ts`: tipos `RequestHeaders`, `RequestHeaderName`, `RequestHeadersReport`, `NO_REQUEST_HEADERS`, `PlayerTimeline`; `PlayerAdapter.open(…, headers?)` e `requestHeadersReport?()`; opções `headers`/`timeline`; campo **provisório** `requestHeaders = NO_REQUEST_HEADERS` na sessão (T005 troca por atribuição no construtor).
- `lib/player/capabilities.ts`: `PlayableKind` + `'archive'` = FULL — **definitivo**.
- `lib/player/avplayAdapter.ts`: `setStreamingProperty?` no tipo do AVPlay; `open` ignora `_headers` e `requestHeadersReport()` devolve vazio — provisório até T002.
- `lib/catalog/archiveUrl.ts` (`ArchiveVariant`, `ARCHIVE_VARIANTS`, `PanelClock`, `ArchiveUrlInput`, `ArchiveClockUnknownError`, `buildArchiveUrl` que lança) e `lib/epg/catchup.ts` (`ArchiveProgram`, `ArchiveStep`, `CONTIGUOUS_TOLERANCE_MS`, funções que lançam).
- `features/catalog/catalogApi.ts`: `CatalogItemOut.archive_days?`, `CatalogItemPlayback.headers?`, `ArchiveProgramRef`, `fetchArchivePlayback` que lança.
- `components/player/playerLayerTypes.ts`: props `archive`, `onArchiveEnded`, `onGoLive`, `startOver` e o tipo `PlayerArchive` (reexportado por `PlayerLayer.tsx`) — ainda não lidas.
- `components/PlayerErrorInfoPanel.tsx` + `lib/i18n/messages/playerUi.ts`: rótulo de mídia `archive` (pt/en/es) — definitivo (o `Record` exaustivo exigia).
- `vite.config.ts`: contrato do adaptador em `TESTES_TS_COM_DOM` — definitivo.

## Armadilhas já mapeadas

- **Os arquivos de contrato são compilados pelo `tsc -b`**: `fetchArchivePlayback` precisa aceitar a chamada com **2 argumentos** (o contrato confere `toHaveBeenCalledWith('ch-7', { start, end })` — a 2ª tentativa é que passa `{ variant }`) e o retorno precisa aceitar um objeto **sem** `archive_variant` (deixe opcional).
- `rememberArchiveVariant` deve ignorar `archive_variant` ausente (o contrato não o manda).
- O contrato do arquivo monta `identity={{ title: 'Canal Sete' }}` sem nada de arquivo: título/horário do programa vêm da prop `archive` (`PlayerChrome` ganha prop `archive`; `PlayerIdentity` não muda).
- Linha do arquivo: `⏪ ▶⏸ ⏩ Ao vivo Áudio …` — o contrato anda dois passos de "Pausar" até "Ao vivo". O texto do selo do ao vivo é "AO VIVO" (maiúsculas) e o do controle é "Ao vivo": não confundir.
- Barra do arquivo: o motor falso **não** informa duração; o total "1h30" sai da `PlayerTimeline` (`formatTime`).
- "Guia" continua o 1º controle do Live (027/031/041 contam a partir dele); "Do início" entra logo depois, só com a prop `startOver`.
- Guia: canal **sem** arquivo mantém exatamente "Este programa já terminou." (contrato da 031, fixture sem `archive_days`) e `.is-past` continua nos encerrados.
- `PLAY-05`: o contrato procura `/header que esta TV não envia/`; a ordem do diagnóstico está em `logic/headers.md` §5 (formato vence header). `headersNotSent` é opcional — o contrato da 042 não o passa.
- Valores de header e URL de arquivo: nunca em `useState`, `queryKey`, `PlayerError`, log ou `aria-*` (o contrato varre texto + todos os atributos do DOM).
- `itemsSignature`: `archiveDays` só entra quando existe e **depois** dos campos da 055 (senão toda lista regrava todos os blocos).
- A sondagem de variante é a abertura do player — não faça `fetch` de sondagem (origem `file://` = resposta opaca).
- Código da Live: respeitar `sdd/specs/040-dividir-player-live/logic/divisao.md` §1 (ordem dos hooks, um `useRemoteNav` por componente, refs continuam refs).
- Um `.ts` de teste que precise de DOM vai em `TESTES_TS_COM_DOM` (`vite.config.ts`).
- Lista real e `.env`: nunca imprimir `CCPLAY_PROBE_*`, nem em E2E, commit ou plano.

## Pendências do Analyze

- A1 (MEDIUM) — SC-001 cobre canal, filme e episódio na TV, mas o servidor da T001 só tem canais M3U com header. Recomendação: incluir um filme M3U com header na lista da T001 e conferi-lo na T003/T043.
- A2 (LOW) — SC-004 ("≤ 3 ações do Guia ao programa tocando") não é medido. Recomendação: contar as teclas no E2E da T038.
- A3 (MEDIUM, acompanhado por gate) — busca no TS de arquivo sem prova (R-003). Recomendação: respeitar o gate T014; sem busca sem `Range`, voltar ao `sdd-plan`.

## Gate de pronto

- Contratos 5/5 verdes + `check-contract-tests.ps1` íntegro (esta e todas as outras travas).
- `npx tsc -b`, `npm run lint`, `npm test`, `npm run build:tizen` em `tv-web/`.
- `node e2e/headers-catchup.mjs` e `npm run test:e2e` com `npm run dev` rodando.
- `quickstart.md` Cenários A e B no navegador.
- **TV física**: T003 (headers) e T014 (busca) são **gates obrigatórios** desta feature (exceção da constitution, `<video>` não prova); a passada final T043 é recomendada; catch-up da lista real = "não testado" (R-002).
- Polish: nota inline na ADR-010 (T040), backlog (`update-feature-status.ps1`).
