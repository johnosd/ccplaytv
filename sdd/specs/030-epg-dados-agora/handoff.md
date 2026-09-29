# Handoff — 030-epg-dados-agora (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Frontend
  `tv-web/` (React 19 + TS + Vite 8, Dexie, React Query), alvo Tizen 8 /
  Chromium 108. `api/` não entra.
- Próximo comando: `/sdd-execute 030-epg-dados-agora`.
- Backlog: `Planejada`, 1/56 tasks (T001 — spike — já feito no plan).
- Arquivos alterados fora do plan nesta sessão: `.planning/backlog.md`
  (reler antes de editar), `sdd/specs/030-epg-dados-agora/spec.md` (status).
- **Dados reais**: `.env` da raiz (gitignored) com `CCPLAY_PROBE_USER/PASS/DNS/EPG`
  (sem `M3U`). Usar lendo em tempo de execução; **nunca** imprimir, logar,
  colar em arquivo, commit ou prompt de subagente.

## O que a feature entrega

- **P1 US1** — EPG XMLTV baixado sozinho (painel `xmltv.php` com a credencial
  da fonte / `url-tvg` da M3U / endereço manual), lido em fluxo num Worker,
  guardado −12 h…+48 h; "Agora" + barra em **toda** linha de canal da Live TV
  (categoria, ★ Favoritos, Todos, busca, zapping). Sem id de EPG = slot vazio.
- **P1 US2** — Configurações: estado do EPG na linha da fonte + **tela própria**
  "EPG da lista" (não `Modal`): endereço manual, deslocamento ±12 h, sincronizar,
  desativar (com `Modal` de confirmação). Remove o mock `settings-epg`.
- **P2 US3** — preview: "Agora" (título, horário, barra, sinopse 3 linhas) + "A seguir".
- **P3 US4** — banda do player Live + rail "Canais favoritos" da Home.
- Botões "Guia completo"/"Guia" **continuam** mock `epg-guide` (feature 031).
- Associação **só por id exato**; nunca por nome.

## Leitura obrigatória, em ordem

1. `spec.md` — requisitos FR-001…FR-031, Clarifications.
2. `plan.md` — Decisões Invariantes D-001…D-016, Riscos R-001…R-009, Complexity Tracking.
3. `tasks.md` — fases e critérios.
4. `research.md` — o que o painel real devolve (campos, tamanhos, fuso, CORS).
5. `data-model.md` — campos novos, tabela `epgPrograms` v11, derivação de estado.
6. `logic/xmltv-parse.md` — parser por varredura (sem `DOMParser`).
7. `logic/agora-e-a-seguir.md` — `nowAndNext` + hook de leitura.
8. `logic/sincronizacao-epg.md` — resolução de URL, `syncEpg`, gzip, Worker/executor, gatilhos.
9. `logic/tela-epg-configuracoes.md` — layout, teclas, mensagens `EPG-02`.
10. `quickstart.md` — roteiro manual + comandos.
11. `.planning/memory/constitution.md` — em especial Segredos e Foco.

## Testes de contrato

Travados em `sdd/specs/030-epg-dados-agora/contract-tests.lock` (5/5):

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/epg/xmltvParser.epg-dados-agora.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/epg/nowNext.epg-dados-agora.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/epg/epgSync.epg-dados-agora.contract.test.ts` | 2 | 2 |
| `tv-web/src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx` | 1 | 3 |

- Rodar (de `tv-web/`): `npx vitest run src/lib/epg src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 030-epg-dados-agora`
- Travas de outras features que esta pode quebrar: 026
  `SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` e
  `HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`; 023/024
  `appNav.*.contract.test.ts`; 024 `LiveScreen.live-tv-ds-v14.contract.test.tsx`;
  018 `LiveScreen.busca-categoria.contract.test.tsx`; 027/029
  `PlayerLayer.*.contract.test.tsx`; 021 `pacoteTizen.fundacao-visual.contract.test.mjs`.

## Stubs criados

- `tv-web/src/lib/epg/types.ts` — tipos prontos (não é stub de corpo; pode ganhar campos, não mudar os usados pelos contratos).
- `tv-web/src/lib/epg/xmltvParser.ts` — `parseXmltvTime`, `parseXmltv` lançam `not implemented` (o gerador usa `yield notImplemented()` só para o lint).
- `tv-web/src/lib/epg/nowNext.ts` — `nowAndNext`.
- `tv-web/src/lib/epg/epgRepository.ts` — `writeEpgPrograms`, `listProgramsForChannels`, `getEpgStatus`, `deleteEpgForSource` (assinaturas usadas pelos contratos: manter).
- `tv-web/src/lib/epg/epgSync.ts` — `syncEpg(sourceId, { database, now, fetchImpl, signal })`.
- `tv-web/src/features/catalog/catalogApi.ts` — `CatalogItemOut.epg_channel_id?` só no tipo; `toItemOut` ainda não preenche (T005 remove a nota "STUB").

## Armadilhas já mapeadas

- **Blocos `stored` antigos não têm `tvg-id` e são apagados na 1ª leitura** — por isso FR-007 é migração única por ressincronização ao abrir (`decideOnOpen` `'migrate'` por `epgIdsCapturedAt`, D-007/R-002), não "renovar a categoria".
- **`DOMParser` não existe em Worker** — parser por varredura de texto (logic/xmltv-parse.md).
- **`Content-Encoding: gzip` do painel já chega descomprimido**; gzip só por magic `1f 8b` no corpo (research R2/R4).
- **XMLTV real tem `<channel id="">`** — descartar programa com `channel` vazio (R-004); vários canais compartilham o mesmo `epg_channel_id` (R-003).
- **Worker novo emite `assets/epgWorker.js`** — listar em `CCPlayTv/tizen_web_project.yaml`, senão `build:tizen` recusa (guard `findUnlistedFiles`); se sair chunk extra, listar também — nunca desligar o guard.
- **`logger.sanitize` só cobre `username=`/`password=` e caminhos Xtream** — URL manual com token em outro formato vazaria; em EPG, nunca logar erro cru (contrato 4 espiona `console`).
- **`SourceView` é desestruturação explícita** (`toView`) — não acrescentar `epgManualUrl`/`epgDeclaredUrl`; só `epg` e `epgManualHost`.
- **Telas não importam `lib/` direto** — mutations/hooks via `catalogApi.ts`/`importApi.ts`.
- **Contrato da Live TV usa `vi.useFakeTimers({ toFake: ['Date'] })`** — o hook de leitura deve usar `Date.now()` (não `performance.now()`), e `useNow` via `setInterval` real (não é falsificado nesse teste).
- **`LiveScreen.renderColumns` é compartilhado** pela lista normal e pelo zapping — uma mudança cobre as duas (FR-024).
- **Flakes conhecidos** sob paralelismo: `LiveScreen.test.tsx` (ex.: T010 "scrollToIndex") e `*.favorites.test.tsx` — confirmar isolado antes de investigar.
- **E2E**: `executablePath` dos `e2e/*.mjs` aponta para o caminho Linux do sandbox; no Windows, override temporário como os demais; reiniciar `npm run dev` antes (servidor de muitas horas fica instável).
- O Vite emite nomes fixos sem hash (`vite.config.ts`, `worker.rollupOptions`).

## Pendências do Analyze

| ID | Severidade | Resumo | Recomendação |
| --- | --- | --- | --- |
| A1 | MEDIUM | FR-007 implementado por migração/ressincronização, não "renovar na próxima entrada" (R-002) | Aceitar como está (resultado idêntico para a pessoa) ou ajustar o texto do FR-007 na convergência |
| A2 | MEDIUM | SC-002 (sem congelar durante sincronização) só é provável na TV, e a passada física é recomendada, não gate | Medir na T045 se houver TV; registrar "não testado" caso contrário |
| A3 | LOW | FR-031 (Guia continua mock) sem teste explícito | Em T024/T037, afirmar que "Guia completo"/"Guia" seguem soft-disabled |
| A4 | LOW | FR-015 pede data/hora da última sincronização na linha da fonte; T027 não cita a data | Incluir a data em `formatEpgStatus` na T027 |
| A5 | LOW | URL EPG externa do `.env` não validada (timeout) — R-001 | Tentar de novo na rede da TV (T045) |

## Gate de pronto

- 5/5 contratos verdes + trava 030 íntegra + travas 017–029 íntegras.
- `npx tsc -b`, `npm run lint`, `npm run test` (flakes conhecidos confirmados isolados),
  `npm run build:tizen`, `npm run test:e2e` (com `e2e/epg-dados-agora.mjs`),
  `node e2e/epg-dados-agora-real.mjs` com o `.env`.
- `quickstart.md` no navegador (ponta a ponta, offline, fonte antiga).
- Polish: `CLAUDE.md`, `.planning/backlog.md`, `.planning/migracao-design-system-v14.md`,
  `comingSoon.ts`, emenda inline ADR-010 via `sdd-adr`.
- Passada na TV física: **recomendada, não gate** (spec não eleva).
