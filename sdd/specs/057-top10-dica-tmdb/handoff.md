# Handoff — execução da feature 057 (Top 10 da semana e Dica, TMDB)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TypeScript + Vite 8 (`tv-web/`), IndexedDB via Dexie, TanStack Query; app client-first para Samsung Tizen (ADR-008).
- Próximo comando: **`/sdd-execute 057-top10-dica-tmdb`**. Status no backlog: **Planejada** (0/46 itens entre tasks e checklist).
- Arquivos que mudaram em disco fora desta sessão e valem uma releitura antes de editar: `.planning/backlog.md` (o item 67 foi removido de "Ideias Futuras" e a linha 057 foi criada), `tv-web/src/features/catalog/catalogApi.ts` e `tv-web/src/features/vod/vodShowcaseRows.ts` (receberam os stubs desta feature; ambos já tinham alterações pendentes de 052/053/054/055/056 não commitadas), `tv-web/src/features/vod/VodShowcaseScreen.tsx` (não foi editado aqui, mas está com alterações pendentes).
- O diretório de trabalho do PowerShell pode estar em `tv-web/`; os scripts `.planning/scripts/powershell/*.ps1` são chamados a partir da raiz.

## O que a feature entrega

- **US1 (P1)** — Top 10 da semana: fileira real em Filmes (filmes) e Séries (séries), no lugar do slot "Em breve" `vod-top10-*`. Dados do trending semanal do **TMDB** (nunca IMDb), cruzados com a lista (só o que existe nela). O número do card é a **posição real** no TMDB (1, 3, 4... sem renumerar). Existe com ≥ 3 cruzados, senão some (sem slot).
- **US2 (P1)** — "Dica de filme"/"Dica de série": fileira **nova** de até 10 títulos sorteados (nota ≥ 7,0, votos mínimos, últimos 15 anos, peso por popularidade), estável no dia, com ≥ 5 candidatos válidos, senão some. Entre "Bem avaliados" e "Porque você assistiu".
- **US3 (P2)** — Início: 4 linhas novas (Top 10 filmes, Top 10 séries, Dica de filme, Dica de série) entre "Canais favoritos" e "Curadoria IA", cada uma só com dado.
- **US4 (P2)** — Sem chave, sem rede ou sem cobertura: some sem ruído; sem rede vale o último cache (semanal no Top 10, diário na Dica).
- Decisões do usuário que contrariam a expectativa óbvia: (a) **versão**: vale a principal (sem `[L]`/4K); só cai para 4K/legendada se não houver outra; (b) as fileiras **não têm "Ver tudo"** (D-007); (c) o Top 10 **não renumera**; (d) a emenda de 5 contratos travados de 052/053/056 foi **aprovada** (R-001).

## Leitura obrigatória, em ordem

1. `sdd/specs/057-top10-dica-tmdb/spec.md` — requisitos FR-001..FR-021, SC-001..SC-009, clarificações.
2. `sdd/specs/057-top10-dica-tmdb/plan.md` — decisões D-001..D-014, Constitution Check, riscos R-001..R-010, estratégia de testes.
3. `sdd/specs/057-top10-dica-tmdb/tasks.md` — T001..T035 em 7 fases.
4. `sdd/specs/057-top10-dica-tmdb/logic/descoberta.md` — **o "como"**: endpoints, cache, cruzamento, sorteio, hooks, telas, Início.
5. `sdd/specs/057-top10-dica-tmdb/quickstart.md` — verificação manual e checklist.
6. `.planning/memory/constitution.md` — princípios (foco, voltar por id, segredos, "Progresso e Capacidades São Reais").
7. Referências de padrão: `sdd/specs/056-bem-avaliados/{plan.md,logic/bem-avaliados.md}` (mesma tela, mesma restauração, mesma emenda de contratos) e `tv-web/src/lib/metadata/tmdbPeople.ts` (molde do carregador TMDB com cache, pausa e estado).

## Testes de contrato

Travados em `sdd/specs/057-top10-dica-tmdb/contract-tests.lock` (5/5):

| Arquivo | Casos | Fase |
| --- | --- | --- |
| `tv-web/src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts` | 2 (cruzamento + Top 10; Dica) | 2 |
| `tv-web/src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts` | 1 (dados/cache/sem chave) | 2 |
| `tv-web/src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` | 2 (Top 10 na tela → fase 3; Dica na tela → fase 4) | 3 e 4 |

- Rodar (de `tv-web/`): `npx vitest run src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb`
- **Hoje os 5 estão vermelhos** pelo motivo certo (`Error: not implemented` nos 3 de lib; asserção de tela nos 2 de tela). Nunca editar esses arquivos.
- **Travas de outras features que esta quebra (R-001, emenda já aprovada)** — T011 edita *só as linhas do Top 10* e regrava as travas de `052-vitrine-filmes-series`, `053-carrosseis-filmes-series` e `056-bem-avaliados`:
  `vodShowcase.bem-avaliados.contract.test.ts` (~l.94/103/107) e `VodShowcaseScreen.bem-avaliados.contract.test.tsx` (~l.98, ~l.261); `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (~l.21–61) e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (~l.218, ~l.255–285); `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (~l.239, ~l.269). `vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts` usa fixtures próprias e não muda. Regravar com `-Write -Paths <todos os arquivos do lock>` de cada feature.

## Stubs criados

- `tv-web/src/lib/metadata/tmdbDiscovery.ts` — tipos (`DiscoveryTitle`, `DiscoveryResult`, `DiscoveryKind`) e constantes (`TRENDING_LIMIT`, `TIP_PAGES`, `TIP_MIN_VOTE_AVERAGE`, `TIP_MIN_VOTES`, `TIP_YEARS`) **definitivos**; `weekKey`, `loadWeeklyTrending`, `loadTipPool` lançam `not implemented` (T004).
- `tv-web/src/lib/metadata/discoveryRules.ts` — constantes (`TOP10_MIN`, `TIP_MIN`, `DISCOVERY_LIMIT`) e assinaturas **definitivas**; `versionTier`, `matchDiscoveryTitles`, `selectTop10`, `selectTip` lançam (T005).
- `tv-web/src/features/catalog/catalogApi.ts` — `DiscoveryPick`, `useWeeklyTop10`, `useDailyTip` (lançam; ainda não ligados a nenhuma tela; T006).
- `tv-web/src/features/vod/vodShowcaseRows.ts` — `'tip'` em `ShowcaseRowKey` e `hasTop10?`/`hasTip?` **só no tipo**; o comportamento é o de antes até T012/T019.
- Os stubs não são travados: o executor os substitui. Os textos i18n novos ainda **não** existem (T007).

## Armadilhas já mapeadas

- **`src/lib/` nunca importa de `src/features/`** (nenhuma ocorrência hoje): por isso `tmdbDiscovery.ts`/`discoveryRules.ts` trazem dia local, `fnv1a32`, régua de nota/data próprios (D-014). Só os hooks usam `dayKey` de `features/vod/ratedSelection.ts`.
- **Não usar `resolveTmdbTitles`** (035): lê o tipo inteiro do Dexie a cada chamada e escolhe a *primeira* cópia, sem preferir versão. O cruzamento usa o **índice de busca já em memória** (`['catalog-search-index', sourceId, kind]`, mesma chave de `useTopRated`) — nunca `db.channels` (039).
- **Ano exato**, nunca ±1 (emenda R-012 da 035). Sem ano local nem no nome, o registro não casa; só ≈ 59% dos filmes têm `year` (R-004) — o Top 10 sumir com poucos casamentos é o esperado.
- **Chave TMDB**: só por `tmdbGet`/`readTmdbCredential`; nunca `console.*`, nunca repassar `error.message` de `fetch` (a URL v3 leva `api_key`). O contrato afirma que nenhum `console.*` é chamado.
- **`FavoritableKind` inclui `channel`**: estreitar para `'movie'|'series'` ao chamar os hooks na tela (`copy.kind`).
- **O contrato de tela mocka `useWeeklyTop10`/`useDailyTip`**: a tela só pode ler dados por esses dois hooks (e `useTopRated` etc. já mockados). Qualquer outro acesso a dados novo na tela quebra o teste travado.
- **Ranking**: seletor fixado `.content-card-rank` (já existe em `ContentCard` com a prop `rank`; o CSS atual vale só sob `.vod-screen` — o Início precisa de CSS próprio em `home.css`); procedência `.vod-row-source`; cobertura `.vod-row-coverage` (texto `showcase.ratedCoverage`).
- **Linhas sem "Ver tudo"**: `itemEntries` da tela acrescenta `SEE_ALL_ENTRY`; use um `plainEntries` novo para `top10`/`tip`. `vodShowcaseFocus.ts` não muda (`isEligible` já exige um id ≠ `SEE_ALL_ID`).
- **`now` fixado por montagem** (`useState(() => Date.now())`) nos hooks: a virada do dia com a tela aberta não pode trocar cards sob o foco.
- **`HomeFocus.rail`** pertence a contratos travados 023/024: só acrescentar valores à união; rodar `HomeContent.test.tsx`, `HomeScreen.test.tsx`, `appNav.test.ts`, `App.test.tsx`.
- **Dexie v16**: tabela nova sem `.upgrade()`; `removeTmdbKey` precisa limpá-la; o teste do contrato depende de `new CatalogDb(nome)` ter a tabela (`fake-indexeddb` no projeto `node`).
- **Testes `.ts` com Dexie** rodam no projeto `node` (`setupTests.node.ts`); `.tsx` no `dom`. Teste novo `.ts` que precise de DOM entra em `TESTES_TS_COM_DOM` (`vite.config.ts`).
- E2E: `node e2e/run.mjs --only top10-dica --jobs 1` (no PowerShell o npm engole `--only`); com `npm run dev` no ar; o TMDB é simulado por interceptação (`page.route`) e a chave semeada em `integrations`.
- Alterações pendentes de outras features no working tree (git status inicial mostra dezenas de arquivos modificados): não reverter nem commitar junto sem o usuário pedir.

## Pendências do Analyze

- **MEDIUM — A1**: `spec.md` FR-015 diz que "sem chave" usa o último cache, mas US4/AC1 e o contrato dizem "sem chave ⇒ zero requisição e fileiras ausentes" (e `removeTmdbKey` limpa o cache). O plano segue US4/AC1. Recomendação: no `sdd-converge` (ou numa emenda de spec), restringir FR-015 a "sem rede ou erro do TMDB".
- **MEDIUM — A2**: o aviso "Com base em X de Y categorias" (D-012, contrato de tela) não tem FR próprio na spec (só uma linha em Assumptions). Recomendação: acrescentar o FR na spec (como FR-014 da 056) antes do `sdd-converge`.
- **LOW — A3**: FR-016 diz "no máximo uma consulta por tipo e período", mas a Dica faz 8 páginas de `discover` por tipo por dia (R-005). Recomendação: reescrever como "uma carga por tipo e período".
- **LOW — A4**: US4/AC2 fala em "último sorteio guardado" após a virada do dia sem rede; o plano guarda o *pool* e re-sorteia com a semente de hoje. Resultado equivalente para a pessoa; alinhar o texto na spec.
- **LOW — A5**: SC-003 ("ao menos metade dos cards muda em dois dias") depende de "candidatos suficientes" sem definir; com poucos cruzados a sobreposição é alta. Recomendação: medir na lista real (T032) e, se preciso, qualificar o SC.

## Gate de pronto

- Contratos 057 **5/5 verdes** + `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro; travas de 052/053/056 regravadas (R-001) e íntegras.
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen` (confere `tizen_web_project.yaml`; nenhum arquivo novo emitido hoje), `npm run test:e2e` (suíte inteira, com `npm run dev` no ar) — o E2E vem antes de qualquer validação na TV.
- `quickstart.md` executado no navegador; medições SC-008 (R-003) e cobertura real de casamento (R-004) registradas em `plan.md`.
- Documentação no Polish: `.planning/backlog.md` (item 67 entregue e Dica registrada — as colunas de status são do script), `README.md`, notas de emenda em `plan.md` de 053 e 056. **Não** acrescentar parágrafo de status a `CLAUDE.md`.
- Passada na **TV física: recomendação, não gate** (fluidez do Início com dois índices em memória); sem ela a feature não se declara "verificada na TV".
