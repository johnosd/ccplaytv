# Implementation Plan: Top 10 da semana e carrossel "Dica" (TMDB) em Filmes, Séries e Início

**Slug**: `057-top10-dica-tmdb` | **Date**: 2026-10-04 | **Spec**: `sdd/specs/057-top10-dica-tmdb/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Liga o slot "Em breve" `vod-top10-*` da 053 e cria a fileira nova "Dica", em Filmes, Séries e Início, com dados do TMDB (BYOK da 032)
cruzados com a lista. Uma camada de dados nova (`tmdbDiscovery.ts`) busca o ranking semanal (`/trending/{movie|tv}/week`, 10 posições) e um
conjunto de candidatos (`/discover/*`, 8 páginas) e os guarda numa tabela nova `discoveryCache` (Dexie v16: semana para o Top 10, dia para
a Dica; sem rede vale o último resultado). Regras puras (`discoveryRules.ts`) cruzam o TMDB com o **índice local de busca já em memória**
(mesmo título comparável + ano exato, versão principal antes de 4K/legendada, posição real sem renumerar) e sorteiam a Dica (nota ≥ 7,0, votos
mínimos, últimos 15 anos, ponderada por popularidade, estável no dia). Dois hooks (`useWeeklyTop10`, `useDailyTip`) alimentam a tela hero
(`vodShowcaseRows.ts` + `VodShowcaseScreen.tsx`) e o Início (`HomeContent.tsx`, 4 linhas novas). Sem chave, sem rede ou sem cache as fileiras
somem, sem erro e sem "Em breve". Nenhuma chamada ao TMDB por foco; nenhum backend.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Vite 8, `chrome108` como piso)

**Primary Dependencies**: `@tanstack/react-query`, `@tanstack/react-virtual`, Dexie (IndexedDB); `useRemoteNav` próprio (ADR-009); conector TMDB da 032 (`tmdbGet`)

**Storage**: IndexedDB (Dexie) — **tabela nova** `discoveryCache` (v16, `id` = `${source}:${kind}:${language}`); o cruzamento com a lista é derivado e não é guardado

**Testing**: vitest (`dom` jsdom para `*.test.tsx`, `node` para `*.test.ts` com `fake-indexeddb`), E2E Playwright (`tv-web/e2e/*.mjs` via `run.mjs`, TMDB simulado por interceptação de rede)

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`); navegador no dev

**Performance Goals**: abrir Filmes/Séries/Início com as fileiras sem travar o controle remoto (SC-008); o cruzamento é O(n) sobre o índice, com chave local memoizada por registro; só os ≤ 10 escolhidos viram `CatalogItemOut`

**Constraints**: ADR-008/ADR-002 (client-first; catálogo parcial é estado normal; offline-first); constitution 1.7.0; tokens de design, nunca cor/tamanho literal; texto de UI via i18n (pt/en/es); a chave nunca em log, erro ou UI; nenhuma requisição ao TMDB por foco; sem leitura direta de `db.channels` (039)

**Scale/Scope**: catálogo de referência ≈ 43 mil filmes / 9,7 mil séries; só ≈ 59% dos filmes têm `year` na listagem (R-004); ranking semanal = 10 títulos por tipo; pool da Dica ≈ 160 títulos por tipo e por dia

## Decisões Invariantes

- **D-001** Fonte única: TMDB, chave BYOK da 032, só por `tmdbGet`. IMDb não aparece em nome, rótulo, campo ou nota (FR-012). O rótulo na UI é "Fonte: TMDB".
- **D-002** O cruzamento lê o **índice local de busca** (`['catalog-search-index', sourceId, kind]`, o mesmo de `useTopRated`/`useRecentlyAdded`), nunca `resolveTmdbTitles` (lê o tipo inteiro do Dexie a cada chamada e escolhe a primeira cópia) e nunca `db.channels`.
- **D-003** Casamento: título comparável (`title` ou `originalTitle`) **e ano exato** (`year` do registro ou o escrito no nome); sem ano, sem casamento. Um registro serve a um título só.
- **D-004** Versão: `versionTier` 0 (principal) antes de 1 (4K ou legendada); empate → maior nota → adicionada mais recente → primeira da entrada. Regra única nas 4 fileiras e nas 3 telas.
- **D-005** Top 10: só as 10 primeiras posições do TMDB; número do card = posição real (sem renumerar); existe com ≥ 3 cruzados. Dica: nota ≥ 7,0, votos ≥ 300 (filme) / 100 (série), ano no intervalo `[corrente−15, corrente]`, ≥ 5 válidos, 10 sorteados.
- **D-006** Sorteio da Dica: chave de Efraimidis–Spirakis `−ln(u)/√popularidade`, `u` de `fnv1a32(semente|tmdbId)`; semente `dia|tipo|fonte`; ordem de exibição = ordem do sorteio. `now` é fixado por montagem da tela (virada do dia não troca cards sob o foco).
- **D-007** Linhas de itens **sem "Ver tudo"** e sem slot: `top10` (`format:'top10'`, `seeAll:null`) e `tip` (`format:'poster'`, `seeAll:null`), ausentes sem dado. O slot `top10` da 053 sai; `because` segue "Em breve". Ordem na hero: continue → top10 → favorites → added → rated → **tip** → because → categorias.
- **D-008** Cache `discoveryCache` (Dexie v16): `trending` por **semana ISO local**, `pool` por **dia local**; chave com idioma do app. Vencido + falha de rede → o último resultado (`stale:true`); nada guardado → ausente. `removeTmdbKey` limpa a tabela. Carregadores **nunca lançam nem logam**; sem chave/chave recusada/pausa por 429 → zero requisição.
- **D-009** As consultas acontecem ao **abrir a tela** (react-query, `staleTime` 30 min, dedupe em voo), nunca por foco. O índice só é lido por estas fileiras se houver títulos do TMDB (sem TMDB não custa leitura de índice).
- **D-010** Procedência visível: `.vod-row-source` "Fonte: TMDB" no cabeçalho das duas fileiras (hero e Início) e eyebrow do hero com "TMDB". A nota do selo continua a do provedor.
- **D-011** Início: 4 linhas novas entre "Canais favoritos" e "Curadoria IA", só com dado, sem skeleton/slot; `HomeFocus.rail` ganha `top10-movies|top10-series|tip-movies|tip-series` (só acréscimo).
- **D-012** Cobertura parcial aceita e **sinalizada** nas duas fileiras (hero e Início): "Com base em X de Y categorias" (`showcase.ratedCoverage`) enquanto `covered < total` — exigência da constitution ("Progresso e Capacidades São Reais"), mesma saída da 056.
- **D-014** Camadas: nada em `src/lib/` importa de `src/features/`. `tmdbDiscovery.ts`/`discoveryRules.ts` são autossuficientes (dia local, `fnv1a32`, régua de nota/data próprios, mesmos algoritmos de 056); só os hooks em `features/catalog/catalogApi.ts` usam `dayKey` de `features/vod/ratedSelection.ts`.
- **D-015** *(2026-10-04, achado C-09 da convergência)* O cruzamento do TMDB com a lista **não roda na renderização**: `useDiscoveryRow` o calcula num `useEffect` com `matchDiscoveryTitlesAsync` (índice dos registros em fatias que cedem a thread, compartilhado por Top 10 e Dica do mesmo tipo) e mantém o resultado anterior da mesma lista enquanto recalcula.
- **D-016** *(2026-10-05, a pedido do usuário)* A fileira do Top 10 chama-se **"Em alta esta semana"** (no Início, "Filmes/Séries em alta esta semana"); os cards são numerados **1, 2, 3…** pela posição na fileira (índice + 1) e a posição **real** do TMDB (`DiscoveryPick.rank`) aparece só no eyebrow do destaque da hero ("… · Nº 6 · TMDB"). Substitui a parte "número = posição real, sem renumerar" da D-005. Contrato da tela da 057 e uma linha do contrato da 053 emendados e travas regravadas (R-017).
- **D-017** *(2026-10-05, a pedido do usuário)* Formato visual da fileira "Em alta": o número é **grande** (≈2,6× `--fs-display` na hero, 2,4× no Início; 1,6–1,7× para 2 dígitos) e fica **sobre a capa**, no canto inferior esquerdo (metade fora, metade por cima do pôster, recuo `--rank-bleed`); os pôsteres ficam **mais próximos** (12–14 px) e **maiores** (hero 231×340, antes 205×300 com 20 px de folga; Início 226×333, antes 205×302). O título do pôster começa depois do número. Medidas em `vodRowFormats.ts` (`top10: 287/299/340`) e `HomeContent.tsx` (`RANKED_WIDTH` 292, `RANKED_HEIGHT` 405).
- **D-013** Emenda aprovada pelo usuário (2026-10-04): as asserções "top10 é slot sempre presente" de 5 contratos travados de 052/053/056 são editadas **somente nessas linhas** e as travas das 3 features regravadas (R-001).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | A chave TMDB é opcional (BYOK); sem ela o app inteiro funciona e as fileiras somem. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Chave só por `tmdbGet`/`readTmdbCredential`; carregadores sem `console.*` e sem repassar mensagem de erro de rede (URL v3 carrega a chave); `discoveryCache` só tem dado público do TMDB, sem credencial e sem URL. Coberto pelo contrato `tmdbDiscovery`. |
| Categorias da Fonte São Preservadas | OK | OK | Fileiras são visões derivadas; gênero/categoria do TMDB nunca substitui a da fonte; o card mostra o título e a categoria da lista. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Posição e dados do TMDB reais e rotulados "Fonte: TMDB"; a Dica é sorteio sobre dado real, sem promessa de personalização ("Dica", nunca "Para você"); posições ausentes ficam ausentes. |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Abrir título, voltar e navegar não esperam o TMDB; a fileira aparece quando o dado chega (ou do cache) e nunca bloqueia a tela. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | OK | OK | Só escreve na própria tabela `discoveryCache`; focar/abrir não marca assistido, favorito nem progresso. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Cards, OK e RETURN pelas setas; nenhuma ação nova exclusiva de toque/mouse. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | Sem importação. |
| Foco Visível e Sem Becos Sem Saída | OK c/ ressalva | OK | Fileira ausente não deixa slot fantasma; o foco é reconciliado por id (053) quando ela some/aparece; Início sem linha vazia (`effectiveRow` cai na anterior); sem estado "carregando" sem elemento focável (a fileira só existe com dado). Contratos cobrem hero. |
| Voltar Restaura Foco e Posição | OK | OK | Reusa a restauração por `rowKey`+id da 053 (chaves `top10`/`tip` estáveis) e `HomeFocus.rail` estendido no Início; reconciliação por id, nunca por índice. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Itens por id lógico da lista; o cache guarda `tmdbId`, nunca URL de reprodução. |
| Progresso e Capacidades São Reais, Nunca Prometidos | **Violação potencial** | OK | Top 10/Dica calculados sobre categorias parciais poderiam parecer "o ranking completo da sua lista" → aviso de escopo (D-012) e número = posição real do TMDB. Registrado em R-002. |
| Documentação do Repositório É Canônica | OK | OK | Backlog (item 67 entregue; Dica registrada), README, `comingSoon`, contratos de 052/053/056 e `CLAUDE.md` só se surgir regra permanente (nada de parágrafo por feature) — Fase Polish. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/057-top10-dica-tmdb/
├── spec.md
├── plan.md
├── logic/descoberta.md      # fonte/cache/cruzamento/sorteio/hooks/telas — o "como" travado
├── quickstart.md
├── handoff.md
├── tasks.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── catalog/db.ts                              # + DiscoveryCacheRecord, tabela discoveryCache (v16)
│   │   ├── metadata/
│   │   │   ├── tmdbDiscovery.ts                       # STUB → loadWeeklyTrending, loadTipPool, weekKey
│   │   │   ├── discoveryRules.ts                      # STUB → versionTier, matchDiscoveryTitles, selectTop10, selectTip
│   │   │   ├── tmdbKeyRepository.ts                   # removeTmdbKey limpa discoveryCache
│   │   │   └── *.top10-dica-tmdb.contract.test.ts     # 3 contratos travados (2 + 1)
│   │   ├── comingSoon.ts (+ test)                     # − vod-top10-movies, − vod-top10-series
│   │   └── i18n/messages/{vodShowcase,comingSoon}.ts  # + tip/source/eyebrow; − mensagens dos 2 slots
│   ├── features/
│   │   ├── catalog/catalogApi.ts                      # STUB → useWeeklyTop10, useDailyTip, DiscoveryPick
│   │   ├── vod/
│   │   │   ├── vodShowcaseRows.ts                     # hasTop10/hasTip/'tip' (tipos já criados); linhas reais
│   │   │   ├── VodShowcaseScreen.tsx                  # fileiras, rank, .vod-row-source, aviso, eyebrow
│   │   │   └── VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx   # 2 contratos travados
│   │   └── home/HomeContent.tsx                       # 4 linhas novas
│   ├── components/ContentCard.tsx                     # só o comentário de `rank`
│   ├── navigation/appNav.ts                           # HomeFocus.rail + 4 valores
│   └── styles/{vod.css,home.css}                      # .vod-row-source; card ranqueado no Início
└── e2e/{top10-dica.mjs (novo), run.mjs, carrosseis-filmes-series.mjs, lib/vod.mjs}
```

**Structure Decision**: sem camada nova além de dois módulos em `lib/metadata/` (rede+cache e regras puras). O acesso a dados fica em
`features/catalog/catalogApi.ts` junto de `useTopRated`; a fiação, nas telas já existentes de `features/vod/` e `features/home/`.

## Complexity Tracking

> Nenhuma violação da constitution sem resolução. A emenda de contratos travados de outras features está em R-001 (não é violação
> de princípio, é regra do processo de contratos).

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/lib/metadata src/features/vod src/features/catalog src/features/home src/lib/comingSoon.test.ts   # área tocada
npx tsc -b                                                                      # tipos
npm run lint                                                                     # oxlint
npm run test                                                                     # suíte completa (gate)
node e2e/run.mjs --only top10-dica,carrosseis-filmes-series,bem-avaliados,vitrine-filmes-series --jobs 1   # E2E da área (com npm run dev no ar)
npm run test:e2e                                                                 # gate final
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5/5):
`tv-web/src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts` (2),
`tv-web/src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts` (1) e
`tv-web/src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` (2).

Comando: `npx vitest run src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `matchDiscoveryTitles`/`selectTop10`: mesmo ano, principal antes de 4K/legendada, posição real sem renumerar, um registro por título, mínimo 3, limite 10 | US1/AC2, US1/AC3, US1/AC7, FR-002..FR-004, FR-010, FR-011 | Fase 2 | `Error: not implemented` (`matchDiscoveryTitles`) |
| `selectTip`: filtros (nota, votos, ano), mínimo 5, 10 sorteados, estável por semente e independente da ordem de entrada, piso de votos de série | US2/AC1..AC3, US2/AC6, FR-005..FR-008 | Fase 2 | `Error: not implemented` (`selectTip`) |
| `loadWeeklyTrending`: sem chave zero requisição; ranking de 10 posições reais em cache por semana; sem rede usa o último; sem nada não lança, não loga, não carrega a chave | US1/AC1, US4/AC1..AC3, FR-002, FR-003, FR-015..FR-017, Constitution: Segredos | Fase 2 | `Error: not implemented` (`loadWeeklyTrending`) |
| Tela: Top 10 com `.content-card-rank` real, `.vod-row-source` TMDB, aviso de cobertura parcial, OK abre; Séries; sem dado a fileira some (sem "Em breve") e o foco não se perde | US1/AC1, AC2, AC4..AC7, FR-001, FR-003, FR-012..FR-014, FR-020, Constitution: Progresso/Foco | Fase 3 | asserção: `.vod-slot-card` ainda existe no slot `Top 10 filmes da semana` (`expected <button…> to be null`) |
| Tela: "Dica de filme/série" entre favoritos/destaques e "Porque você assistiu", fonte TMDB, OK abre; sem dado some | US2/AC1, AC5..AC7, FR-005, FR-012..FR-014, FR-020, Constitution: Foco | Fase 4 | asserção: `expected 'Top 10 filmes da semana' to be 'Dica de filme'` |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/metadata/tmdbDiscovery.ts` (tipos/constantes definitivos; `weekKey`, `loadWeeklyTrending`, `loadTipPool` lançam),
`tv-web/src/lib/metadata/discoveryRules.ts` (constantes/assinaturas definitivas; `versionTier`, `matchDiscoveryTitles`, `selectTop10`, `selectTip` lançam),
`tv-web/src/features/catalog/catalogApi.ts` (`DiscoveryPick`; `useWeeklyTop10`/`useDailyTip` lançam — ainda não ligados a nenhuma tela),
`tv-web/src/features/vod/vodShowcaseRows.ts` (`'tip'` em `ShowcaseRowKey`, `hasTop10?`/`hasTip?` só no tipo; comportamento inalterado).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Cache (`discoveryCache`, Dexie v16) e `removeTmdbKey` | Pronto |
| Dados do TMDB (`tmdbDiscovery.ts`) e regras (`discoveryRules.ts`) | Prontos; contratos 3/3; 26 testes extras |
| Hooks (`useWeeklyTop10`, `useDailyTip`) | Prontos; 14 testes (7 de uso, 7 de bordas) |
| Tela hero de Filmes e Séries | Pronta; contratos de tela 2/2; 9 testes extras |
| Início (4 linhas) | Pronto; 5 testes; `HomeFocus.rail` estendido |
| Emenda R-001 (052/053/056) e mocks `vod-top10-*` | Feitas; travas íntegras |
| E2E `top10-dica` | Pronto (47 verificações), na SUITE |
| Medições na lista real | Cobertura e cruzamento medidos; abertura medida no navegador (Início melhorou, Filmes inconclusivo, ver R-003/R-015); TV sem medição |
| Documentação (README, notas de emenda) | Feita; backlog fica a cargo do `sdd-converge` |
| Contratos | 5/5 verdes; travas de 057/052/053/056 e de todas as outras íntegras |
| Gates | `tsc -b`, `oxlint`, `build:tizen` exit 0; `npm run test` 401 arq. / 2653 testes; `npm run test:e2e` 36/36 (1 flake em `navegacao-por-pagina` numa rodada) |
| TV física | Não executada (recomendação, não gate) |
## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Cinco contratos travados de outras features exigem o "Top 10" como slot "Em breve" sempre presente: `vodShowcase.bem-avaliados.contract.test.ts` (056, chaves/slots, ~l.94/103/107) e `VodShowcaseScreen.bem-avaliados.contract.test.tsx` (056, comentário l.98 e `toContain('Top 10 filmes da semana')` ~l.261); `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (053, chaves/tipos/formatos/slots, ~l.21–61) e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053, ordem de rótulos ~l.218 e o teste dos slots ~l.255–285, contagens de `ArrowDown`); `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (052, lista de rótulos ~l.239 e `tap('ArrowDown', 2)` ~l.269). `vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts` usa fixtures próprias e **não** é afetado. | Alto: suíte vermelha / contrato "cumprido" por atalho | Resolvido: **emenda aprovada pelo usuário em 2026-10-04** (entrevista do `sdd-plan`) e aplicada na T011 (ver R-011). Editar **só** as linhas do Top 10 (remover `top10` das listas/chaves esperadas, ajustar contagens de `ArrowDown`, o teste dos slots passa a ter só "Porque você assistiu"), registrar o `R-0XX` da emenda aqui e regravar a trava de **052, 053 e 056** com `check-contract-tests.ps1 -Slug <slug> -Write -Paths <todos os arquivos do lock>`. Nada além disso. Fazer na mesma fase em que o slot sai (Fase 3), antes de religar a tela. |
| R-002 | Constitution "Progresso e Capacidades São Reais": Top 10/Dica sobre categorias parciais pareceriam "o ranking completo da sua lista". | Alto (princípio) | Resolvido: (confirmado na convergência de 2026-10-05) Aviso de escopo `.vod-row-coverage` nas duas fileiras (hero e Início) enquanto `covered < total` (D-012); posição mostrada é a real do TMDB, lacunas visíveis. |
| R-003 | Desempenho: o Início passa a ler os índices de **filmes e séries** (≈ 43 mil + 9,7 mil registros) quando há TMDB configurado, e o cruzamento normaliza o nome de cada registro (regex). Pode pesar na TV (056/R-003 mediu ≈ 1,4 s só para abrir a hero). | Médio/Alto (SC-008) | Parcialmente resolvido: índice só é lido com títulos do TMDB em mãos (D-009); mesma `queryKey` (compartilhada, `refetchOnMount:false`); chave local memoizada por registro (WeakMap); só ≤ 10 viram `CatalogItemOut`. Medir `matchDiscoveryTitles` em 43 mil registros e a abertura do Início (linha de base antes, depois); se pesar, adiar o cruzamento do Início para depois do primeiro desenho (idle) — sem mudar contratos. **Medido (2026-10-04, desktop, lista real):** cruzamento de 43.161 filmes = 183 ms a frio e 28 ms memoizado (9.696 séries: 26 e 5 ms). A abertura do Início/Filmes antes × depois **não foi medida** no navegador; a primeira abertura com chave custa ≈0,2 s no desktop e a TV pode ser várias vezes mais lenta — passada na TV recomendada e, se pesar, adiar o cruzamento para depois do primeiro desenho. **Medido no navegador (2026-10-04, T037 da convergência; Chromium headless desktop, lista real com 43 mil filmes + 9,7 mil séries já no aparelho, 7 repetições, p50):** *Início* — conteúdo em 18–23 ms nas 3 condições; linhas do TMDB em 156–183 ms; maior tarefa longa 0 ms sem chave × 195 ms (cache frio) e 201 ms (quente), soma 0 × 274 e 320 ms. *Filmes* — 1ª fileira em 75 ms sem chave × 407 ms (frio) e 414 ms (quente); maior tarefa longa 89 × 226 e 239 ms (máx. 271). Ou seja, **pesa**: com chave a vitrine demora ≈330 ms a mais para desenhar e há um bloqueio de ≈200–270 ms (o `select` do react-query roda o cruzamento durante a renderização). Na TV tende a ser várias vezes pior. Mitigação feita na T043 (D-015). **Re-medido depois (2026-10-04, T044, mesma lista e mesmo roteiro, 9 repetições, p50):** *Início* — maior tarefa longa 195–201 ms → **62–77 ms** (soma 274–320 → 91–115 ms); linhas do TMDB em 158–252 ms. *Filmes* — o trabalho da 057 agora é fatiado e fora da renderização, mas a 1ª fileira medida no roteiro "Início → Filmes" continua em ≈430–480 ms com chave contra 90 ms sem chave; o perfil de CPU atribui a maior parte a `select` preexistentes (ver R-015) e experimentos de isolamento (chave com cache vazio × com ranking real, 2ª visita) deram 236 × 248 ms, i.e. a 057 pesa ≈10 ms ali; um outro fluxo (1ª visita após o Início, rede cortada) mediu 75–107 ms. Os dois fluxos não concordam entre si e a diferença não foi explicada: a medição de Filmes não é conclusiva. A TV física segue sem medição. |
| R-004 | Cobertura de casamento: só ≈ 59% dos filmes têm `year` na listagem (056/R-013) e o TMDB vem no idioma do app, enquanto a lista pode estar em outro idioma. O Top 10 pode achar < 3 e sumir; a Dica, < 5. | Médio | Aceito: nunca adivinhar ano nem título. Casa por `title` e `originalTitle` e usa o ano escrito no nome. Documentar no quickstart a expectativa e medir na lista real quantos casam. Não afrouxar (ano ±1 já foi rejeitado na 035). **Medido na lista real (2026-10-04):** filmes 59% com ano; Top 10 cruza 5 de 10 (posições 4, 5, 6, 8, 10) e séries 8 de 10 (99% com ano); a Dica cruza 132/160 (filmes) e 148/160 (séries). O Top 10 existe nos dois tipos; o fallback `[L]`/4K aparece em 1 título por tipo. |
| R-005 | Custo de rede: Dica = 8 páginas de `discover` por tipo por dia; Top 10 = 1 consulta por tipo por semana; 429 do TMDB. | Baixo/Médio | Resolvido: (confirmado na convergência de 2026-10-05) `inFlight` por (fonte, tipo, idioma); páginas 2+ em lotes de 4 e best-effort; 429 → `markTmdbState('rate_limited')` + pausa de 10 min (já existente) e o cache vence. |
| R-006 | Idioma: o cache é por idioma; trocar o idioma refaz a consulta. O que vem do TMDB só serve para casar (a tela mostra o nome/pôster da lista). | Baixo | Resolvido: (confirmado na convergência de 2026-10-05) Chave do cache e da query incluem o idioma (054). |
| R-007 | `HomeFocus.rail` é parte de contratos travados 023/024 ("não podem mudar de forma"); a mudança é só acréscimo à união. | Médio | Resolvido: (confirmado na convergência de 2026-10-05) Só acrescentar valores; rodar os contratos 023/024/026 e `HomeContent.test.tsx`/`appNav.test.ts`/`App.test.tsx`; se algum `switch` sobre `rail` aparecer, tratar os 4 novos. |
| R-008 | Semana/dia usam o fuso local; a virada com a tela aberta não deve trocar cards sob o foco. | Baixo | Resolvido: (confirmado na convergência de 2026-10-05) `now` fixado por montagem (D-006); vale na próxima abertura. |
| R-009 | Tabela nova Dexie v16: testes que contem versões/tabelas, e o `removeTmdbKey` que precisa limpá-la. | Baixo | Resolvido: (confirmado na convergência de 2026-10-05) Procurar asserções sobre o esquema ao implementar; teste de `removeTmdbKey` esvazia `discoveryCache`. |
| R-010 | O Início ganha 4 linhas e o scroll/foco vertical já lida com poucas linhas; com 4 a mais o `home-content` pode precisar de rolagem no foco. | Médio | Resolvido: (confirmado na convergência de 2026-10-05) Conferir a rolagem do `HomeContent` (a linha focada fica visível) com screenshot no E2E; se faltar, usar o mesmo mecanismo das linhas existentes. |
| R-011 | **Emenda aplicada (T011, aprovada em 2026-10-04, R-001)**: removidas só as linhas do Top 10 de `vodShowcase.bem-avaliados.contract.test.ts` e `VodShowcaseScreen.bem-avaliados.contract.test.tsx` (056: chaves/slots esperados, uma linha `toContain` e um comentário); `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (053: chaves/tipos/formatos/índices `all[n]`, `noHistory`, `bare` e o trecho do título do slot) e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053: 7→6 fileiras na ordem e o teste dos slots, que agora para em "Porque você assistiu" e confere que o Top 10 de séries não existe sem dado; o nome do teste perdeu "; o Top 10 acompanha a seção"); `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (052: um rótulo da lista e `ArrowDown` 2→1). Travas de 052, 053 e 056 regravadas (`-Paths` exige um array, não uma string com vírgulas). | Médio | Resolvido: feito; as 4 travas (057 incluída) íntegras. |
| R-012 | **Contrato × lógica escrita**: `logic/descoberta.md` §3 dizia que um título do TMDB repetido tentava a "próxima cópia" da lista; o contrato (travado) manda que um título da lista (chave título+ano) sirva a **um** título do TMDB só. | Baixo | Resolvido: código segue o contrato e o `logic/descoberta.md` §3 foi corrigido. |
| R-013 | **Cache em memória × chave**: salvar/testar/remover a chave não invalidava as queries `tmdb-discovery`; o "sem chave" ficava até 30 min na tela (e a fileira velha aparecia após remover). Achado ao desenhar o E2E. | Médio | Resolvido: `invalidateTmdb` e `useRemoveTmdbKey` tratam `tmdb-discovery`; `staleTime` virou função (só resultado vigente vale 30 min); teste de salvar a chave. |
| R-014 | **CSS do formato Top 10 (053) nunca exercitado com cards reais**: na hero o pôster encolhia e o título cobria o número; no Início o número era cortado. Achado pelas capturas do E2E. | Médio | Resolvido: `vod.css` (altura do trilho + proporção, número encostado, título acompanha o pôster) e `home.css` (número alinhado ao pôster); conferido por captura. |
| R-015 | **Custo preexistente em Filmes (não é da 057)**: com o índice em cache, o 1º desenho da tela de Filmes executa os `select` de `useRecentlyAdded` (mapeia os ≈43 mil registros para `CatalogItemOut`) e `useTopRated`. Perfil de CPU na abertura de Filmes (dev, lista real): ≈370 ms nesses `select` (`itemOut`/`toItemOut` ≈165 ms, `recentlyAdded` ≈50, `selectFeaturedRated` + `titleKey` da 056 ≈90, `select` ≈63) contra ≈130 ms do trabalho da 057, que agora é fatiado. Sem chave, a **2ª visita** a Filmes já mede 1ª fileira em ≈245 ms e tarefa longa de ≈203 ms (a 1ª visita, sem índice em cache, 85–90 ms). | Médio (desempenho percebido em Filmes, features 052/056) | Resolvido: tratado pelo bug `tela-principal-filmes-lenta-na-tv` (`sdd/bugs/`), verificado na TV pelo usuário em 2026-10-05. Antes: fora do escopo da 057; reportado ao usuário. Candidato a `[Bug]` no backlog (mapear só os 12 recentes, como a 056 fez com `useTopRated` antes do refinamento, e fatiar/adiar os `select` do índice). |
| R-016 | **Dica × foco (FR-021)**: quando uma categoria nova chega e um candidato novo desloca justamente o card focado da Dica, `reconcileShowcaseFocus` não acha o id e deixa o foco na posição lembrada (outro card). No Top 10 o foco acompanha o id (as posições são fixas pelo ranking). O sorteio por chave mínima troca poucos cards por categoria nova, e a fileira não é recalculada com a tela aberta além disso (o dia fica fixo por montagem). | Baixo | **Risco aceito** (decisão do usuário em 2026-10-05, como o R-012 da 056). FR-021 ganhou a ressalva na spec. Sem ação extra. |
| R-017 | **Emenda do contrato da 057 e uma linha da 053 (2026-10-05, aprovada pelo usuário)**: `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` passou a esperar o título "Em alta esta semana", os números 1, 2, 3 e o "Nº 3" no destaque do 2º card; `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053) só trocou o título que checa estar ausente sem dado. Travas de 057 e 053 regravadas depois de confirmar os contratos verdes. | Baixo | Resolvido: feito; as travas de 052, 053, 056 e 057 íntegras. |
| R-018 | **Início não rolava até a linha focada (preexistente, exposto pela 057)**: com as 4 linhas novas (cada uma de 370–520 px) as de baixo ficavam além da dobra de 1080 px e o foco chegava nelas sem a tela acompanhar (`scrollTop` 0 com o foco na 2ª linha, card em y=1209). Achado ao conferir a captura do número cortado. | Alto (foco precisa estar visível) | Resolvido: `HomeContent` rola o `.home-content` até a linha focada (`scrollIntoView({ block: 'center' })`; o hero volta ao topo) a cada mudança de linha, com teste. Vale também para as linhas antigas (Continuar assistindo, Minha Lista, Canais). Medido: card centralizado em y≈390–770. |
| R-019 | **Emenda pela feature 060** (2026-10-05, autorizada pelo usuário no `sdd-plan` da 060): "Porque você assistiu" deixou de ser slot "Em breve" — sem semente a fileira não existe (item 69 do backlog, `060` FR-014/FR-015). Mudou só o que citava o slot: `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`: depois da Dica vem a primeira categoria; nas visitas sem dado o foco chega a "Ação" em vez do slot | Contratos emendados ficam vermelhos até a fase da 060 que liga a fileira real | Retravado (5/5) com `check-contract-tests.ps1 -Write`; registro também na `060` (D-012 do `plan.md` dela) |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-04 | Fases 1–2 (Setup + Foundational) | Cache Dexie v16, `tmdbDiscovery.ts`, `discoveryRules.ts`, hooks sobre o índice compartilhado e i18n; contratos de dados/regras 3/3. O contrato corrigiu a regra de unicidade (um título da lista serve a um só título do TMDB). | Fase 3: emenda R-001 e Top 10 na tela |
| 2026-10-04 | Fases 3–4 (US1 + US2) | Emenda R-001 aplicada (5 contratos de 052/053/056, 3 travas regravadas); linhas `top10` e `tip` reais, tela com `useWeeklyTop10`/`useDailyTip`, cards ranqueados, fonte TMDB e cobertura parcial; mocks `vod-top10-*` removidos; testes e E2E que assumiam o slot ajustados; contratos de tela 2/2 (5/5 no total). A Dica foi feita junto do Top 10 (mesmos arquivos). | Fase 5: Início |
| 2026-10-04 | Fase 5 (US3) | Início com 4 linhas do TMDB (`HomeContent`), `HomeFocus.rail` estendido, CSS; `HomeContent.top10-dica.test.tsx` (5); um teste antigo do dock ajustado (o Início consulta o TMDB ao abrir); 392 arq. / 2548 testes (src/features, src/lib, src/navigation, src/components, App), E2E do Início verde, 0 travas com problema. | Fase 6: bordas e E2E novo |
| 2026-10-04 | Fase 6 (US4) | Bordas cobertas (7 testes) e E2E `top10-dica` (47 verificações, na SUITE). Corrigidos: invalidação do cache de descoberta ao salvar/remover a chave (R-013), `staleTime` só para resultado vigente, CSS do formato Top 10 na hero e no Início (R-014). 392 arq. / 2548 testes; E2E da área 5/5; 0 travas com problema. | Fase 7: medições e documentação |
| 2026-10-04 | Fase 7 (Polish) | Medições na lista real (cobertura e cruzamento), README, notas de emenda em 053/056, `build:tizen`, `npm run test` (401 arq. / 2653), E2E completo 36/36 (1 flake em `navegacao-por-pagina` na 1ª rodada, 3/3 isolado). Tasks 45/45; contratos 5/5 e todas as travas íntegras. | Passada na TV física (recomendação); `sdd-converge` |
| 2026-10-04 | Convergência (Fases 8–9) | T036 (FR-015 emendado), T041 (screenshot removido), T037/T044 (abertura medida no navegador, antes e depois) e T043: o cruzamento saiu da renderização (`matchDiscoveryTitlesAsync`, índice fatiado e compartilhado; resultado anterior mantido enquanto recalcula). Início: maior tarefa longa ≈200 → 62–77 ms. Filmes: custo restante é preexistente (R-015); medição inconclusiva. 417 arq. / 2714 testes, E2E da área 5/5, trava íntegra. | T038–T040 (textos da spec), TV física |
| 2026-10-05 | Convergência (Fase 8) | Aprovados pelo usuário e aplicados: textos da spec (FR-016 "uma carga", US4/AC2 "conjunto de candidatos", FR-022 do aviso de cobertura, nota das correções internas, ressalva do FR-021), R-016 (risco aceito) e o item 70 `[Bug]` no backlog (custo preexistente do 1º desenho de Filmes, R-015). Sobra só a medição na TV física (C-10). | T046 (TV), T042/T045/T048 (reexecutar a convergência) |
| 2026-10-05 | Convergência (Fase 10) | Bug `tela-principal-filmes-lenta-na-tv` corrigido (índice com `staleTime` de 60 s e invalidação ao entrar em categoria/fim de sincronização, resultados por índice, "Adicionados recentemente" mapeia só 12) e app reinstalado na TV: o usuário viu 1ª fileira de Filmes rápida sem travar, 2ª visita fluida e navegação boa (qualitativo; sem chave TMDB não testado). Fecha o C-10 (SC-008) com ressalva. | T048 (reexecutar a convergência) |
| 2026-10-05 | Ajustes pós-TV (Em alta) | Renomeada para "Em alta esta semana" (Início: "Filmes/Séries em alta esta semana"), cards numerados 1, 2, 3… e posição real do TMDB no destaque da hero (D-016, R-017: contrato da 057 e uma linha da 053 emendados, travas regravadas); número grande sobre a capa, cards mais próximos e maiores (D-017); o Início passou a rolar até a linha focada (R-018). 418 arq. / 2723 testes, E2E da área 8/8, travas íntegras. | Reinstalar na TV para conferir; T048 |

**PRÓXIMO**: `sdd-converge 057-top10-dica-tmdb` (T048); o C-10 foi fechado pela verificação na TV.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/home/HomeContent.tsx`, `tv-web/src/navigation/appNav.ts`, `tv-web/src/styles/home.css` — Início (prontos)
- `tv-web/e2e/top10-dica.mjs` (novo), `tv-web/e2e/run.mjs` — E2E da feature (prontos)
- `tv-web/src/features/catalog/catalogApi.discovery*.test.tsx`, `tv-web/src/lib/metadata/tmdbDiscovery.test.ts`, `discoveryRules.test.ts` — testes extras (prontos)
- `tv-web/src/features/catalog/catalogApi.ts` — `useWeeklyTop10`/`useDailyTip` (prontos; o Início os reusa)
- `tv-web/src/features/vod/VodShowcaseScreen.tsx`, `vodShowcaseRows.ts` — Top 10 e Dica na hero (prontos)
- `tv-web/src/lib/metadata/tmdbDiscovery.ts`, `discoveryRules.ts` — dados/cache e regras (prontos)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `check-contract-tests.ps1 -Write -Paths` recebe um **array** (`$paths = @(...)`), não uma string com vírgulas (a string vira um caminho só e o script recusa sem gravar).
- Em PowerShell, crase dentro de string com aspas duplas é escape (`` `t `` vira tab): para gravar texto com crases nos `.md`, use here-string com aspas simples ou a ferramenta Edit.
- O screenshot órfão `tv-web/test-results/carrosseis-filmes-series/02-slot-top10.png` pode ser removido (o E2E agora grava `02-slot-porque-voce-assistiu.png`).

## Resultado Final

*(Convergência de 2026-10-05.)*

**O que foi construído.** Em Filmes, Séries e no Início, com a chave TMDB da própria pessoa (BYOK da 032): a fileira **"Em alta esta semana"** (no Início, "Filmes/Séries em alta esta semana") e a **Dica de filme/série**. Dados do TMDB (`/trending/*/week` e `/discover/*`), cache no aparelho (`discoveryCache`, Dexie v16: semana e dia, por tipo e idioma, limpo junto da chave), cruzamento com o índice local de busca por título e ano exato, versão principal antes de 4K/`[L]`, mínimo de 3 (Em alta) e 5 (Dica), sorteio estável do dia ponderado pela popularidade, "Fonte: TMDB", aviso de cobertura parcial e fileiras ausentes sem chave, sem rede ou sem cache. Código em `lib/metadata/{tmdbDiscovery,discoveryRules}.ts`, hooks `useWeeklyTop10`/`useDailyTip` em `catalogApi.ts`, `VodShowcaseScreen.tsx` (hero), `HomeContent.tsx` (4 linhas), E2E `top10-dica`.

**Desvios em relação ao plano original** (todos registrados nas Execution Notes, nos riscos e nas Decisões):
- Unicidade do cruzamento: um título da lista serve a **um** título do TMDB (a chave título+ano inteira), por exigência do contrato (R-012).
- Cache em memória: salvar/testar/remover a chave invalida as queries da descoberta e o `staleTime` só vale para resultado vigente (R-013).
- CSS do formato Top 10 da 053 reescrito e exercitado pela 1ª vez com cards reais (R-014, D-017).
- O cruzamento saiu da renderização (`matchDiscoveryTitlesAsync`, índice fatiado e compartilhado) por causa de desempenho (D-015, medido na lista real; Início ≈200 → ≈65–77 ms de maior tarefa longa).
- Custo preexistente de Filmes tratado fora da 057, pelo bug `tela-principal-filmes-lenta-na-tv` (R-015): índice com `staleTime` de 60 s, resultados por índice, invalidação ao entrar em categoria e no fim de sincronização; verificado na TV pelo usuário.
- Textos da spec emendados na convergência, com aprovação: FR-015, FR-016, US4/AC2, FR-021 (R-016, risco aceito) e FR-022.
- Pós-TV, a pedido do usuário (D-016, D-017, R-017): título "Em alta esta semana", cards numerados 1, 2, 3… com a posição real do TMDB só no destaque da hero, número grande sobre a capa, cards mais próximos e maiores. Emendados o contrato da tela da 057 e uma linha do contrato da 053; travas regravadas depois de confirmar os contratos verdes.
- O Início passou a rolar até a linha focada (R-018), pois as linhas novas ficavam abaixo da dobra; vale também para as linhas antigas.
- Fora desta feature, mas descoberto nela: `Rail` remede quando a largura do item muda (bug `continue-assistindo-sobreposto-na-primeira-abertura`, aguardando confirmação na TV).

**Decisões que ficaram diferentes do plano.** D-005 ("número do card = posição real") foi substituída pela D-016; a Dica ganhou o FR-022 (aviso de cobertura) como requisito, antes só decisão do plano (D-012).

**Verificação.** `npm run test` 419 arq. / 2726 testes, `tsc -b` e `oxlint` exit 0, E2E completo 36/36 (uma rodada com 1 falha intermitente em `navegacao-por-pagina`, 3/3 isolado) e E2E da área verde depois dos ajustes, contratos 5/5 e todas as travas íntegras. Na TV, vistos pelo usuário: Filmes rápido (1ª e 2ª visita), navegação boa, "Em alta esta semana" aprovada, Dicas aparecendo. **Não observados na TV:** o comportamento sem chave TMDB (o usuário preferiu não testar) e a rolagem do Início, que o usuário não comentou.

**Riscos que seguem como aceitos/parciais:** R-003 (desempenho: medido no navegador e confirmado qualitativamente na TV, sem cronômetro na TV), R-004 (cobertura de casamento: Top 10 cruza ≈5 de 10 em filmes e 8 de 10 em séries na lista real) e R-016 (deslocamento de card sob o foco na Dica).
