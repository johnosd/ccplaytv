# Implementation Plan: Histórico e Continuar Assistindo

**Slug**: `019-historico-continuar-assistindo` | **Date**: 2026-09-26 | **Spec**: `sdd/specs/019-historico-continuar-assistindo/spec.md`

## Summary

Fecha as três lacunas que a spec identifica no RF-014: (1) filme concluído
hoje só perde o progresso de retomada (`clearProgress`), nunca fica
marcado como assistido — passa a reaproveitar o mesmo `completedAt` que
episódio já usa (feature 012), só que com um limiar próprio (90%,
`MOVIE_WATCHED_RATIO`, distinto do `RESUME_MAX_RATIO` de 95% que hoje só
apaga retomada); (2) série não tem nenhuma visão agregada de quantos
episódios já foram vistos — ganha um cálculo local e puro (nunca dispara
rede ao focar/renderizar) que só declara "Em dia" quando a cobertura de
episódios for binariamente completa; (3) `getContinueWatching()` (feature
008) não tem consumidor — ganha uma seção simples no hub da fonte
("O que você quer assistir?"), reaproveitando o padrão de resolução por
índice que `resolveFavorites` (feature 013) já usa.

Três telas tocadas (`MovieDetailScreen.tsx`, `MoviesScreen.tsx`,
`SeriesScreen.tsx`, `ListHomeScreen.tsx`) e dois arquivos de baixo nível
(`resumePolicy.ts`, `progressRecorder.ts`) — nenhuma migration de schema
Dexie (o campo `completedAt` já existe desde a feature 012, só passa a
também ser escrito para `kind: 'movie'`).

## Technical Context

**Language/Version**: TypeScript 5 / React 19, mesmo stack de `tv-web/` (sem mudança)

**Primary Dependencies**: `@tanstack/react-query` (leitura/mutação de estado local), Dexie (IndexedDB), sem dependência nova

**Storage**: IndexedDB via Dexie — tabela `userStates` já existente (feature 008), sem alteração de schema; leitura de `channels` (kind:'episode') já existente (feature 012)

**Testing**: Vitest + Testing Library (componente/unidade pura), Playwright (E2E)

**Target Platform**: mesmo alvo do projeto (Tizen 8.0 / Chromium 108, `tv-web/`)

**Performance Goals**: leitura de estado agregado por fonte/tipo é O(itens que o usuário já interagiu), nunca O(catálogo inteiro) — mesma ordem de grandeza que `useFavoriteIds` já tem hoje; nenhuma leitura nova por card renderizado (D-006/D-007)

**Constraints**: nunca disparar rede ao focar/renderizar um card (constitution, "Comandos Locais Independem de Rede" — vale também para "Em dia" de série, que não pode chamar `ensureSeriesEpisodes`); "Em dia" nunca aparece sem cobertura completa (constitution, "Progresso e Capacidades São Reais"); canal ao vivo permanece sem nenhum rastreamento novo (FR-011)

**Scale/Scope**: 4 telas tocadas, 2 arquivos de baixo nível ajustados, 1 arquivo puro novo (agregação de série), nenhuma entidade de dado nova

## Decisões Invariantes

- **D-001**: "Assistido" de filme reaproveita o MESMO campo `completedAt`
  de `UserStateRecord` que episódio já usa (feature 012, D-007daquela
  spec) — sem migration de schema Dexie. `completedAt != undefined` é a
  única fonte de verdade de "assistido", para qualquer kind.
- **D-002**: Filme ganha um limiar de conclusão automática PRÓPRIO,
  `MOVIE_WATCHED_RATIO = 0.9` (`resumePolicy.ts`), distinto do
  `RESUME_MAX_RATIO = 0.95` que hoje só apaga a retomada (e continua
  intocado, valendo como estava para episódio). `isPastEnd(positionMs,
  durationMs, ratio?)` ganha um terceiro parâmetro opcional (default
  `RESUME_MAX_RATIO`, preservando o comportamento atual de todo chamador
  que não o informar).
- **D-003**: `ProgressRecorderOptions` (`progressRecorder.ts`) ganha
  `completionRatio?: number`, repassado para `isPastEnd` dentro de
  `apply()`. `PlayerLayer.tsx` passa `recordCompletion: true` também para
  `playback.kind === 'movie'` (hoje só `'episode'`), com `completionRatio:
  MOVIE_WATCHED_RATIO` nesse caso; para `'episode'`, `completionRatio`
  continua ausente (usa o default 0.95, comportamento da feature 012
  intocado).
- **D-004**: Correção manual usa uma função nova exportada em
  `userStateRepository.ts` (`setWatchedManually(stableId, sourceId,
  watched, database)`) — marcar (`true`) grava o mesmo par
  `completedAt`/`progressSeconds` que `markCompleted` já grava (reaproveita
  o mesmo corpo, não duplica); desmarcar (`false`) só limpa `completedAt`,
  sem tocar `progressSeconds` (que uma marca automática já deixou
  `undefined`, e uma marca manual nunca escreveu). `markCompleted` em si
  fica intocada, sem mudar sua assinatura nem seus chamadores atuais
  (episódio).
- **D-005**: `MovieDetailScreen.tsx` ganha uma ação nova (`toggle-
  watched`) sempre **por último** no array de `MovieAction` — depois de
  `resume`/`restart`/`watch` — para preservar a garantia já documentada no
  código de que a ação primária é sempre o índice 1 e o foco inicial não
  precisa ser recalculado quando o array muda de tamanho.
- **D-006**: Selo "Assistido" na grade de Filmes (`MoviesScreen.tsx`)
  usa um hook novo, `useWatchedIds(sourceId, kind)` — mesma forma de
  `useFavoriteIds` (feature 013): uma única leitura local por fonte/tipo,
  nunca uma consulta por card. Renderizado como `children` de `PosterArt`,
  mesmo slot que `.fav-star` já usa (podem coexistir no mesmo card).
- **D-007**: Cobertura de episódios de uma série é **binária**, nunca
  fracionária: "conhecida" (completa) assim que existir ao menos 1
  registro `kind:'episode'` com esse `seriesId` em `channels` — porque
  tanto `fetchSeriesInfo` (Xtream, `seriesLoader.ts`) quanto a leitura de
  categoria M3U/`eager`/`stored` sempre trazem TODOS os episódios de uma
  série de uma vez, nunca parcialmente (confirmado em código: não existe
  paginação nem gravação parcial nesse caminho). Documentado em
  `logic/agregacao-serie.md` — regra que um executor poderia errar
  tentando implementar "cobertura episódio a episódio".
- **D-008**: Novo hook `useSeriesWatchedSummary(sourceId)` — mesma forma
  de `useFavoriteIds`, uma única leitura local por fonte que devolve, por
  `seriesId` já conhecido (D-007), `{ known, watched, upToDate }`. A
  função pura de cálculo (`summarizeSeriesWatched`, sem React nem banco)
  vive em `tv-web/src/features/series/seriesWatchedSummary.ts`, mesmo
  padrão de `episodeNavigation.ts`. **Nunca chama `ensureSeriesEpisodes`**
  — só lê o que já está em `channels`/`userStates` (constitution,
  "Comandos Locais Independem de Rede").
- **D-009**: `getContinueWatching` (`userStateRepository.ts`, feature
  008) ganha um parâmetro **opcional** `sourceId?: string` — quando
  informado, filtra por fonte (uso novo desta feature, FR-012); omitido,
  preserva o comportamento atual (todas as fontes juntas), que já tem
  teste cobrindo isso (`userStateRepository.test.ts`, "should fetch
  continue watching across sources") e não pode regredir. Um resolver
  novo,
  `resolveContinueWatching(sourceId, states, database)`
  (`catalogRepository.ts`), reaproveita o núcleo de resolução por índice
  que `resolveFavorites` já tem, generalizado para aceitar `kind:
  'episode'` além de `'movie'`/`'series'`/`'channel'` — itens cuja
  categoria/fonte não existe mais são omitidos silenciosamente (mesma
  disciplina de reconciliação de `resolveFavorites`, nunca uma exceção que
  quebra a seção inteira).
- **D-010**: `ListHomeScreen.tsx` ganha uma linha de foco vertical nova
  **acima** dos 3 tiles — presente só quando a seção "Continuar
  assistindo" tem ao menos 1 item (FR-014); ausente, a navegação e o foco
  inicial continuam idênticos a hoje (só os tiles, horizontal). Mesmo
  mecanismo de "topo"/conteúdo (UP/DOWN) já usado em outras telas do
  projeto (`topFocused` em `LiveScreen.tsx`/`MoviesScreen.tsx`/
  `SeriesScreen.tsx`).
- **D-011**: Confirmar (SELECT) um item de "Continuar assistindo" delega
  para o MESMO callback de navegação que abrir esse item pela grade normal
  já usa (`onSelect`/equivalente por kind) — nunca duplica lógica de
  abertura ou de retomada; o comportamento de "abrir já retomando" é
  inteiramente do `MovieDetailScreen`/`SeriesDetailScreen`, que já
  reagem à posição salva.
- **D-012**: Canal ao vivo não recebe nenhuma mudança de código nesta
  feature — `reportsPosition = false` em `progressRecorder` já impede
  qualquer gravação de progresso/conclusão para canal, e isso permanece
  assim (FR-011, decisão explícita do usuário na entrevista).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | não tocado |
| Segredos Fora dos Clientes e dos Logs | N/A | N/A | não tocado — nenhuma credencial envolvida |
| Categorias da Fonte São Preservadas | N/A | N/A | não tocado |
| IA e Classificação Nunca Inventam Dados | PASS | PASS | "Em dia" nunca inventado sem cobertura completa (D-007/D-008); nenhum dado externo entra aqui |
| Comandos Locais Independem de Rede/Backend/IA | PASS | PASS | D-007/D-008: o selo de série nunca chama `ensureSeriesEpisodes`; toda leitura desta feature é local |
| Trailers e Metadados Não Alteram Estado | PASS | PASS | "Assistido" só é gravado por reprodução real (D-002/D-003) ou ação manual explícita (D-004) — nunca por abrir detalhe/trailer |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | PASS | PASS | ação de marcar/desmarcar (D-005) e a seção "Continuar assistindo" (D-010/D-011) são navegáveis por seta+SELECT, mesmo mecanismo já usado no resto do app |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | não tocado |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | nova ação no detalhe e a seção nova no hub seguem o mesmo padrão de foco/`tv-focus` já usado; ausência de item não quebra a navegação existente (D-010) |
| Voltar Restaura Foco e Posição | PASS | PASS | não introduz navegação nova que precise de snapshot — abrir um item de "Continuar assistindo" usa a mesma tela de detalhe já existente, que já restaura corretamente |
| Identidade de Reprodução Não Depende da URL | PASS | PASS | tudo reaproveita `stableId`/`buildStableId` já existente, nenhuma chave nova baseada em URL |
| Progresso e Capacidades São Reais | PASS | PASS | núcleo da feature: "Em dia" nunca aparece com cobertura parcial (D-007/D-008, FR-007/008); nenhum percentual inventado |
| Documentação do Repositório É Canônica | PASS | PASS | item 13 do backlog já reescrito na especificação; `CLAUDE.md` será atualizado no Polish |

Nenhuma violação não-justificada. `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/019-historico-continuar-assistindo/
├── spec.md
├── plan.md                    # este arquivo
├── logic/
│   └── agregacao-serie.md
├── quickstart.md
├── tasks.md
└── contract-tests.lock        # criado no passo 7.5
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── player/
│   │   │   ├── resumePolicy.ts           # + MOVIE_WATCHED_RATIO, isPastEnd(ratio?)
│   │   │   └── progressRecorder.ts       # + completionRatio em ProgressRecorderOptions
│   │   └── catalog/
│   │       ├── userStateRepository.ts    # + setWatchedManually; getContinueWatching(sourceId?)
│   │       └── catalogRepository.ts      # + resolveContinueWatching
│   ├── components/
│   │   └── PlayerLayer.tsx               # completionRatio para kind==='movie'
│   ├── features/
│   │   ├── catalog/
│   │   │   └── catalogApi.ts             # + useToggleWatched, useWatchedIds,
│   │   │                                   #   useSeriesWatchedSummary, useContinueWatchingContent
│   │   ├── movies/
│   │   │   ├── MovieDetailScreen.tsx     # + ação toggle-watched (D-005)
│   │   │   └── MoviesScreen.tsx          # + selo "Assistido" no card (D-006)
│   │   ├── series/
│   │   │   ├── seriesWatchedSummary.ts   # NOVO — função pura de agregação (D-007/D-008)
│   │   │   └── SeriesScreen.tsx          # + selo agregado no card (D-008)
│   │   ├── list-home/
│   │   │   └── ListHomeScreen.tsx        # + seção "Continuar assistindo" (D-009-D-011)
│   │   └── screens.css                   # + estilos dos selos e da seção nova
├── e2e/
│   └── historico-continuar-assistindo.mjs  # novo roteiro E2E
```

**Structure Decision**: mesma estrutura já usada pelas features 011–013.
Nenhum diretório novo — reaproveita `lib/player/`, `lib/catalog/` e as
telas existentes em `features/{movies,series,list-home}/`. O único
arquivo inteiramente novo é `seriesWatchedSummary.ts` (lógica pura, sem
React nem banco, mesmo espírito de `episodeNavigation.ts`).

## Complexity Tracking

*(vazio — nenhuma violação a justificar)*

## Estratégia de Testes

Prioridade: unitário → contrato/componente → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npx vitest run
npm run lint
npm run build
```

### Testes de Contrato

Orçamento de 5 disponível; usado **3** — não força os outros 2 quando não
há mais nada que valha a pena travar sem depender de DOM/componente.
FR-002 (`onExit('completed')` marca assistido) e FR-003 (sem avanço nunca
grava nada) já são satisfeitos hoje pelo mecanismo `recordCompletion`/
FR-017 (feature 012), independente do `completionRatio` novo — testá-los
via `progressRecorder.ts` diretamente já passaria antes do execute, então
não provariam nada como contrato (regra do sdd-plan: teste que já passa é
reescrito ou removido). Ficam cobertos pelos "Testes da fase" (não
travados) quando `PlayerLayer.tsx` ligar `recordCompletion` para filme. A
seção "Continuar assistindo" (US4, P2) também fica sem contrato formal —
composição de peças já testadas (`getContinueWatching`, núcleo de
`resolveFavorites`) e coberta pelo E2E no Polish.

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/player/progressRecorder.historico.contract.test.ts`,
`tv-web/src/lib/catalog/userStateRepository.historico.contract.test.ts`,
`tv-web/src/features/series/seriesWatchedSummary.historico.contract.test.ts`

Comando (rodar de dentro de `tv-web/`):
`npx vitest run src/lib/player/progressRecorder.historico.contract.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts src/features/series/seriesWatchedSummary.historico.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| "filme cruza 90% da duração: marca assistido (`completedAt`) e apaga a retomada" | US1 AC1, FR-001 | Fase 2 (Filme) | asserção: `completedAt` ausente / `progressSeconds` ainda presente (o comportamento herdado usa 95% fixo, não 90%) |
| "`setWatchedManually` marca e desmarca sem inventar `progressSeconds`/duração" | US2 AC1-2, FR-004/005 | Fase 2 (Filme) | `Error: not implemented` |
| "`summarizeSeriesWatched`: 'Em dia' só com cobertura completa E tudo assistido; cobertura parcial ou zero nunca produz 'Em dia'" | US3 AC1/AC3, FR-007/008, Constitution: Progresso e Capacidades São Reais | Fase 3 (Série) | `Error: not implemented` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/features/series/seriesWatchedSummary.ts` (assinatura de
`summarizeSeriesWatched` com corpo `throw new Error('not implemented')`),
`tv-web/src/lib/catalog/userStateRepository.ts` (assinatura de
`setWatchedManually` idem), `tv-web/src/lib/player/resumePolicy.ts`
(`MOVIE_WATCHED_RATIO` já com o valor real — é uma constante, não uma
função — e `isPastEnd` com o terceiro parâmetro já na assinatura).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Fase 1 concluída — baseline confirmado (`tsc -b` 0 erros, 3 contratos vermelhos pelo motivo certo, flakiness pré-existente de `*.favorites.test.tsx` confirmada isolada, trava íntegra) |
| US1+US2 — Filme | Fase 2 concluída — `completionRatio` (D-002/D-003) respeitado em `progressRecorder.ts`/`PlayerLayer.tsx` (90% para filme, 95% intocado para episódio); `setWatchedManually` (D-004) e `useToggleWatched` implementados; ação "Marcar/Desmarcar assistido" sempre por último em `MovieDetailScreen.tsx` (D-005); selo "Assistido" na grade de Filmes via `useWatchedIds` (D-006) |
| US3 — Série | Fase 3 concluída — `summarizeSeriesWatched` (D-007) implementada conforme `logic/agregacao-serie.md`; `useSeriesWatchedSummary` (D-008) lê `listAllEpisodes` (nova, `catalogRepository.ts`, reaproveita o índice `[sourceId+generation+kind+groupOrder]`) + `getUserStates` em lote, nunca chama `ensureSeriesEpisodes`; selo "Em dia"/contagem na grade de Séries, reaproveitando `.watched-badge` |
| US4 — Continuar assistindo | Fase 4 concluída — `resolveContinueWatching` (D-009) resolve por kind via `resolveFavorites`, trocando episódio pela série-pai (R-004); `useContinueWatchingContent` novo; `ListHomeScreen.tsx` ganhou a seção acima dos tiles, foco vertical novo (`row: 'continue-watching' \| 'tiles'`) só quando há item, `onOpenContinueWatching` nova prop; `App.tsx` decide a rota por `item.kind` |
| Polish | Fase 5 concluída — E2E `historico-continuar-assistindo.mjs` (11 asserções, cenários A/B/C do quickstart) achou e corrigiu 2 bugs reais (R-005/R-006); teste unitário adicional de `resolveContinueWatching` em `catalogRepository.test.ts` (episódio→série-pai); gates completos rodados |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `getContinueWatching()` sem argumento já tem um teste que depende do comportamento "todas as fontes juntas" (`userStateRepository.test.ts`, "should fetch continue watching across sources") — uma assinatura que exigisse `sourceId` quebraria esse teste | Baixo — resolvido por design (D-009: parâmetro opcional, não obrigatório) | Resolvido: `sourceId?: string` opcional preserva o teste existente (chamada sem argumento) e atende FR-012 (chamada com argumento, filtrando por fonte) — nenhuma mudança de comportamento pro caso já testado |
| R-002 | `resolveContinueWatching` generaliza o núcleo de `resolveFavorites` para incluir `kind: 'episode'` — risco de o índice usado (`[sourceId+generation+kind+providerStreamId]`) não cobrir bem episódio, que hoje é resolvido por `seriesId` (`listEpisodes`), não por `providerStreamId` próprio | Médio — episódio sem resolução correta faria "Continuar assistindo" perder itens de série silenciosamente | `sdd-execute` deve ler como `SeriesDetailScreen.tsx`/`episodeNavigation.ts` já resolvem um episódio individual por `stableId` antes de generalizar `resolveFavorites` — reaproveitar esse caminho em vez de inventar um novo, se divergir do índice de `resolveFavorites` |
| R-003 | Selo "Assistido" na grade de Filmes (D-006) não estava explícito nos FR-001-005 da spec — inferido do SC-001 ("vê esse filme identificado... ao navegar pela grade depois") | Baixo — extensão pequena, mesmo padrão já usado por favoritos, dentro do espírito do SC-001 | Se o usuário discordar ao revisar a tela pronta, é reversível sem afetar o resto da feature (FR-001-005 continuam válidos sem o selo na grade) |
| R-004 | D-011 dizia "SELECT delega para o mesmo comportamento de abrir esse item pela navegação normal" — mas um EPISÓDIO nunca é aberto isoladamente pela navegação normal do app (só a série, que resolve o progresso de cada episódio); `App.tsx` só tem rotas `movie-detail`/`series-detail`, nenhuma para episódio isolado | Baixo — resolvido seguindo D-011 literalmente | Resolvido durante T018: `resolveContinueWatching` troca um episódio pelo registro da SÉRIE-pai (mesmo `seriesId`, mesmo índice de fallback que `resolveFavorites` já usa para série) antes de devolver — "Continuar assistindo" nunca mostra nem abre um `kind:'episode'`, só `movie`/`series`, reaproveitando 100% a navegação já existente (`onOpenMovie`/`onOpenSeries`) sem precisar de rota nova em `App.tsx` |
| R-005 | Bug real achado durante T023 (E2E): `PlayerLayer.tsx` chamava `recorder.onExit('completed')` de forma fire-and-forget e disparava `onClose`/`onCompleted` na sequência — a invalidação de `['user-state', stableId]` (1 operação) podia terminar antes da transação get+put de `markCompleted` (2 operações), deixando `MovieDetailScreen` (ainda montado) preso mostrando "não assistido" por mais tempo, até um remount forçar releitura | Alto — usuário via o filme concluído mas a UI não refletia "assistido" de forma confiável, quebrando SC-001/US2 | Resolvido: `ProgressRecorder.onExit` (e os internos `clear()`/`write()`/`apply()`) passaram a retornar `Promise<void>` em vez de `void`; `PlayerLayer.tsx` agora faz `await recorder.onExit('completed')` antes de chamar `onClose`/`onCompleted`, garantindo que a escrita já commitou quando a UI reage. 3 testes de `PlayerLayer.test.tsx` ajustados para `await waitFor(...)` em vez de asserção síncrona logo após o callback |
| R-006 | Bug real achado durante T023 (E2E): `useToggleWatched` (T005) invalidava `['user-state', stableId]` e `['watched-ids']` no `onSuccess`, mas não `['continue-watching', sourceId]` — marcar manualmente um item como assistido não o removia de "Continuar assistindo" até uma navegação nova forçar refetch | Médio — contradizia FR-013 (item concluído não deveria aparecer na seção) para o caminho de correção manual especificamente | Resolvido: `onSuccess` de `useToggleWatched` (`catalogApi.ts`) passou a invalidar também `['continue-watching', params.sourceId]` |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-26 | Fase 1 (Setup) | Baseline confirmado: `tsc -b` 0 erros; `vitest run` 715/719 (3 contratos da 019 vermelhos pelo motivo certo + flakiness pré-existente de `*.favorites.test.tsx`, 22/22 isolada); trava íntegra. | Nenhuma |
| 2026-09-26 | Fase 2 (Filme — US1+US2) | `progressRecorder.ts`/`resumePolicy.ts`: `isPastEnd`/`apply()` passam a respeitar `completionRatio`; `PlayerLayer.tsx` liga `recordCompletion`+`completionRatio: MOVIE_WATCHED_RATIO` para `kind==='movie'`. `setWatchedManually` implementada reaproveitando `markCompleted` para marcar. `useToggleWatched`/`useWatchedIds` novos em `catalogApi.ts` (+ `listWatched` em `userStateRepository.ts`, sem índice próprio — filtra em memória sobre o índice de `sourceId`). `MovieDetailScreen.tsx`: ação `toggle-watched` sempre última, preserva índice fixo 1 da ação primária. `MoviesScreen.tsx`: selo `.watched-badge` no card. 2/2 contratos verdes. | Nenhuma |
| 2026-09-26 | Fase 3 (Série — US3) | `summarizeSeriesWatched` implementada. `listAllEpisodes` nova em `catalogRepository.ts`. `useSeriesWatchedSummary` nova em `catalogApi.ts`, confirmada por teste que nunca chama `ensureSeriesEpisodes`. `SeriesScreen.tsx`: selo agregado no card, reaproveitando `.watched-badge`. 1/1 contrato verde. | Nenhuma |
| 2026-09-26 | Fase 4 (Continuar assistindo — US4) | `resolveContinueWatching`/`useContinueWatchingContent` novos — episódio sempre resolve pra série-pai (R-004), nunca aparece isolado. `ListHomeScreen.tsx`: seção nova acima dos tiles, `onOpenContinueWatching` nova prop obrigatória (propagada em `App.tsx` e no teste existente). Sem contrato (US4 é P2). 291/291 na área tocada; suíte completa 726/729 (flakiness pré-existente). | Nenhuma |
| 2026-09-26 | Fase 5 (Polish) | E2E `historico-continuar-assistindo.mjs` (11 asserções, cenários A/B/C) achou e corrigiu 2 bugs reais de produção (R-005: corrida de invalidação `onExit`/`markCompleted` em `PlayerLayer.tsx`/`progressRecorder.ts`; R-006: `useToggleWatched` sem invalidar `continue-watching`). Teste unitário complementar de `resolveContinueWatching` em `catalogRepository.test.ts`. Gates completos: `tsc -b` 0 erros, `vitest run` 727/732 (5 flakiness pré-existente confirmada 64/64 isolada), `lint`/`build` limpos, `test:e2e` 11/11. `CLAUDE.md` atualizado. | `quickstart.md` em TV física não executado (não é gate obrigatório) |

**PRÓXIMO**: Todas as tasks concluídas — feature pronta para `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/player/resumePolicy.ts`
- `tv-web/src/lib/player/progressRecorder.ts`
- `tv-web/src/components/PlayerLayer.tsx`
- `tv-web/src/lib/catalog/userStateRepository.ts`
- `tv-web/src/features/catalog/catalogApi.ts`
- `tv-web/src/features/movies/MovieDetailScreen.tsx`
- `tv-web/src/features/movies/MoviesScreen.tsx`
- `tv-web/src/lib/catalog/catalogRepository.ts`
- `tv-web/src/features/series/seriesWatchedSummary.ts`
- `tv-web/src/features/series/SeriesScreen.tsx`
- `tv-web/src/features/list-home/ListHomeScreen.tsx`
- `tv-web/src/App.tsx`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar a feature limpa. -->

Convergência limpa em 2026-09-26 — nenhum achado. As quatro user stories
(US1-4, todas P1 exceto US4/P2) foram construídas exatamente como
desenhado: filme ganha `completedAt` automático (90%, `MOVIE_WATCHED_RATIO`)
e correção manual (`setWatchedManually`); série ganha agregação binária
"Em dia"/contagem parcial (`summarizeSeriesWatched`, nunca chama rede); o
hub da fonte ganha a seção "Continuar assistindo", com episódio sempre
resolvido para a série-pai antes de aparecer (R-004, já que o app não tem
rota para episódio isolado). Os 3 testes de contrato (`progressRecorder.
historico.contract.test.ts`, `userStateRepository.historico.contract.
test.ts`, `seriesWatchedSummary.historico.contract.test.ts`) passam sem
atalho — confirmado lendo o código de produção que os satisfaz, nenhuma
lógica condicionada aos valores exatos dos testes.

Dois desvios reais em relação ao plano original, ambos capturados como
R-005/R-006 e corrigidos antes da convergência: a corrida de invalidação
entre `recorder.onExit('completed')` (antes fire-and-forget) e a
transação de `markCompleted`, e a falta de invalidação de
`continue-watching` em `useToggleWatched`. Nenhum dos dois estava previsto
no design — só apareceram ao escrever o E2E (T023), o que valida a
decisão de tratar o script E2E como parte do Polish, não como formalidade.

`README.md` recebeu uma correção pontual: a linha de visão sobre "já
assistido"/"continuar assistindo" dizia "nos três tipos de conteúdo", o
que contradizia a decisão explícita desta feature (D-012/FR-011) de nunca
dar histórico a canal ao vivo — corrigida para nomear o que cada tipo
realmente ganha.
