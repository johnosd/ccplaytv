# Handoff — 044-parser-m3u-headers (para o sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TypeScript + Vite + Dexie; tudo em `tv-web/src/lib/catalog/`.
- Próximo comando: `/sdd-execute 044-parser-m3u-headers` (Fase 1, T001).
- Status no backlog: `Planejada`. É a fatia **25a** do item 25; a 25b (repasse ao AVPlay) está bloqueada pelo spike do item 58 e **não** é desta feature.
- Arquivos que mudaram em disco fora desta sessão: `.planning/backlog.md` (relê antes de editar). A spec foi **refinada** neste plan (FR-006, FR-009, Incluído, edge case) — releia `spec.md`.

## O que a feature entrega

- **US1 (P1)**: `URL|User-Agent=…&Referer=…` → URL limpa em `directUrl` + `playbackHeaders` à parte.
- **US2 (P2)**: `#EXTVLCOPT`/`#KODIPROP` viram headers **só da próxima URL**; o `|` prevalece por chave; DRM e demais chaves somem sem erro.
- **US3 (P3)**: `radio="true"` e `tvg-chno` guardados (só canal), persistidos pelo caminho `stored`. **Nada aparece em tela**, e `tvg-chno` não é o número exibido (ADR-011).
- Decisão do usuário que contraria o óbvio: até a 25b o player abre a URL **limpa sem headers**; `radio` não vira filtro nem seção.

## Leitura obrigatória, em ordem

1. `spec.md` — requisitos (FR-006/FR-009 refinados no plan, R-001/R-002).
2. `plan.md` — decisões invariantes D-001…D-008, riscos R-001…R-007.
3. `tasks.md` — 16 tasks em 6 fases.
4. `logic/headers-m3u.md` — **as regras exatas** (fronteira de par, diretivas, assinatura). Não reinvente.
5. `quickstart.md` — verificação manual.
6. `.planning/memory/constitution.md` — princípio "Segredos Fora dos Clientes e dos Logs".

## Testes de contrato

- `tv-web/src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts` (3 testes — Fases 3 e 4) e `tv-web/src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts` (2 testes — Fase 5). **Travados; não editar.**
- Rodar: `npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts` (de `tv-web/`).
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 044-parser-m3u-headers` (da raiz).
- Hoje: 5/5 vermelhos por asserção. Nenhuma trava de **outra** feature deve quebrar (mexe-se em `m3uParser`, `classifier`, `importPipeline`, `categoryBlocks`): as que mais tocam essa zona são 014 (`m3uParity`), 024 (`channelLogo…contract`) e 030/038/039 — rode `npx vitest run src/lib/catalog` a cada fase.

## Stubs criados

- `tv-web/src/lib/catalog/m3uHeaders.ts`: tipo `PlaybackHeaders` (final); `splitUrlHeaders` (T003) e `readDirectiveHeaders` (T006) lançam `not implemented` — **provisórios**.
- `m3uParser.ts`: `ParsedEntry.headers?` (final). `db.ts`: `CatalogRecord.playbackHeaders/radio/declaredChannelNumber` (finais).

## Armadilhas já mapeadas

- **`parseM3uLines` descarta toda linha `#` com `continue`** (m3uParser.ts, "Outras linhas de diretiva"): leia as diretivas **antes** desse `continue`.
- **Cópia campo a campo**: `toStoredRecord` (`importPipeline.ts` ~l.470) e `itemsSignature` (`categoryBlocks.ts` ~l.54) listam campos à mão. Esquecer um deles perde o dado em silêncio (o contrato 4 pega `toStoredRecord`; a assinatura só o T012).
- **`itemsSignature`**: campo novo só entra quando existe, senão toda lista antiga regrava todos os blocos (R-004).
- **`catalogApi.itemOut` é explícito**: não ponha header ali nem passe o registro por spread.
- **Só o caminho `stored`** lê itens pelo parser. O painel Xtream detectado pela URL (014) segue o provedor e nunca passa por aqui (R-002).
- **`refineFromUrl` (Modo limitado)** troca o tipo depois do `classifyEntry` → os 3 ramos do classificador precisam carregar os campos (por isso `logic` §4).
- **Série sintética** (`m3uSeriesGrouping`) não herda headers; só os episódios.
- `docs/m3u/dados.md` e o `.env` têm credencial real: **nunca** copiar valor para fixture, teste, commit ou log (T001).
- Flakes conhecidos de paralelismo: `*.favorites.test.tsx`/`LiveScreen.test.tsx` — confirmar isolados.
- `npm run build:tizen` **não** é necessário: nada novo é emitido (sem Worker/asset novo).

## Pendências do Analyze

- **MEDIUM — Cobertura**: SC-004 (≤ 5% de lentidão) só tem a task T014 de medição manual; não há teste automático. Recomendação: registrar o número em `plan.md`; se passar do limite, otimizar o caminho rápido antes de fechar.
- **LOW — Ambiguidade residual** (R-003): header conhecido dentro de um valor não codificado continua sendo fronteira. Documentado, sem ação.
- **LOW — Nome**: spec cita `channelNumber`, o código usa `declaredChannelNumber` (R-005). Sem ação.

## Gate de pronto

- 5/5 contratos verdes + trava íntegra + as demais travas do repositório íntegras.
- `npx tsc -b`, `npm run lint`, `npx vitest run` (flakes isolados), `npm run build`, `npm run test:e2e` com dev server novo.
- `quickstart.md` executado; ADR-010 emendada (T013); backlog (25a `Implementada`, 25b segue `Bloqueado`) e `CLAUDE.md` atualizados no Polish.
- Passada na TV física: **não** é gate (nada visível muda).
