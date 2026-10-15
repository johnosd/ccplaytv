# Bug Assessment: Categoria aberta não mostra itens novos na TV mesmo após atualizar a lista

- **Slug**: categoria-aberta-nao-mostra-itens-novos
- **Criado**: 2026-10-09
- **Origem**: texto colado (relato do usuário, reabertura de `lista-xtream-nao-atualiza-novos-filmes`)
- **Veredito**: likely valid, needs reproduction
- **Severidade**: critical

## Report

> ainda continua sem aparecer os novos filmes, series e canais novos. testei a
> mesma lista em apps diferentes e eles mostram novos filmes que foram
> adicionados nas categorias enquanto que nosso app parou no tempo. preciso
> que ajuste isso para sempre que entrar na lista

Continuação direta do bug `lista-xtream-nao-atualiza-novos-filmes` (Test:
`partial`, 2026-10-09). Aquele fix fez a lista pedir a **estrutura** ao provedor
a cada abertura (> 10 min) e ao voltar ao primeiro plano. O pacote com ele já
está em `CCPlayTv/` (build de 2026-10-09 15:50, depois do commit `e1f8ba0`),
e mesmo assim o relato se repete com a mesma lista comparada a outros apps.

## Symptom

Ao entrar numa categoria de filmes, séries ou canais, os itens que o provedor
acrescentou não aparecem, e os removidos continuam lá. Outros apps, com a mesma
lista, mostram. Esperado: entrar na categoria depois de abrir a lista mostra o
conteúdo atual do provedor.

## Reproduction

Pelo código (o ciclo completo só é observável na TV com o provedor mudando de
verdade):

1. Abrir a lista com a última sincronização > 10 min → `decideOnOpen` →
   `update_by_age` → `applyStructureRefresh` marca **toda** categoria mantida
   com `renewRequestedAt = now`. Até aqui o fix anterior funciona.
2. `wakePrefetch()` → o agendador escolhe a carga **por seção**
   (`pickSectionForBulk`, mais de `SECTION_BULK_MIN` categorias a renovar) e
   fica em `await deps.runSection(...)` (`prefetchScheduler.ts:251-262`):
   baixa `get_vod_streams` (ou `get_live_streams`/`get_series`) **inteiro**,
   prepara tudo em `stagedSectionItems` e só grava as categorias **no fim**
   (`sectionLoader.ts:178-196`). Na lista de referência são ~311 mil entradas.
3. A carga por seção para de ler o fluxo e de gravar a cada tecla
   (`waitUntilAllowed` → portão de atividade, 2 s sem tecla), com o player
   aberto e com o app oculto. Quem está navegando mantém o portão fechado.
4. A pessoa entra numa categoria: `ensureCategoryForEntry`
   (`catalogApi.ts:369-391`) → `ensureCategory` vê renovação pendente →
   `serveStale` → serve o disco (itens velhos) e só chama
   `prefetchScheduler.prioritize(id)`.
5. `prioritize` só põe o id na fila: o laço do agendador está preso no
   `await runSection` do passo 2 e só olha a fila quando a seção inteira
   terminar. Nada mais renova aquela categoria.
6. Na TV, com navegação contínua, a seção leva minutos ou não termina na
   sessão. A categoria aberta continua com os itens antigos. Na próxima
   abertura (> 10 min), tudo recomeça do passo 1, com `bulkTried` zerado.

Por que o teste anterior (cenário D, Playwright no navegador) passou: no PC a
seção baixa e grava em segundos, sem ninguém apertando tecla. A espera atrás da
carga por seção não aparece.

## Suspected Code Paths

- `tv-web/src/features/catalog/catalogApi.ts:369-391`: `ensureCategoryForEntry`.
  Na entrada real (sem `signal`), a renovação pendente só vira
  `prefetchScheduler.prioritize`. **Causa raiz**: a renovação da categoria que
  a pessoa abriu depende do agendador de segundo plano.
- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts:242-273`: a
  prioridade só é lida no começo de cada volta do laço. Uma carga por seção em
  andamento não é interrompida nem compartilhada.
- `tv-web/src/lib/catalog/sectionLoader.ts:139-196`: carga por seção pausável
  e com gravação só no fim (lenta na TV por desenho, feature 038/039).
- `tv-web/src/lib/catalog/categoryLoader.ts:336-377`: `ensureCategory` com
  `renew: true` já faz a busca **só da categoria**
  (`get_vod_streams&category_id=…`) e grava o bloco, com `dedup` por id. É o
  caminho a usar na entrada.
- `tv-web/src/lib/catalog/prefetch/index.ts`: `runCategory` +
  `onCategoryDone` (invalidação das consultas da tela) já existem e podem ser
  reaproveitados.

## Root Cause Hypothesis

O bug anterior resolveu **quando** a lista pergunta ao provedor o que mudou,
mas a troca dos itens de cada categoria ficou inteira com a pré-carga de
segundo plano. Na TV, essa pré-carga trabalha por seção inteira, pausa a cada
tecla e não deixa a categoria aberta passar na frente. Resultado: a estrutura
é atualizada (categorias novas aparecem), mas o conteúdo das categorias que
a pessoa abre continua o antigo por muito tempo ou a sessão inteira. É o
"parou no tempo" do relato. Confiança: **média-alta**. O caminho é
determinístico no código, mas não foi observado na TV com log.

Hipóteses descartadas na leitura do código:
- `itemsSignature`/`writeBlockWithin` ignorando item novo: a assinatura cobre
  identidade, nome, ano, `addedAt` etc. de cada item, e item novo muda o vetor.
- Estrutura não atualizada: `applyStructureRefresh` marca toda categoria
  mantida e acrescenta as novas (coberto pelo bug anterior, cenários B/C).
- Invalidação da tela: `createPrefetchInvalidator` invalida
  `['category-content', sourceId, id]` por prefixo, incluindo a grade por
  janela (`[..., 'window']`).

## Proposed Remediation

**Preferida**: ao **entrar** numa categoria (SELECT, entrada real, não a
pré-busca por foco), se ela estiver com renovação pendente ou vencida, abrir na
hora com o que há no disco (como hoje, sem espera visível) e **disparar a
renovação dela imediatamente, por fora do agendador**:

1. `prefetch/index.ts`: nova `renewCategoryNow(sourceId, categoryId)`, que
   reusa `runCategory` (`ensureCategory` com `renew: true`, só aquela
   categoria, `dedup` por id) e, em `done`, chama `onCategoryDone` (invalida
   a tela, a contagem e os índices de busca, que é o caminho que já existe).
2. `catalogApi.ts` → `ensureCategoryForEntry`: no `serveStale` da entrada real
   (`!signal`), chamar `renewCategoryNow` além de `prioritize` (o `prioritize`
   fica como rede de segurança se a busca direta falhar). A pré-busca por foco
   (`signal` presente) continua só com `prioritize`: focar nunca dispara
   consulta externa nova (constituição).
3. A busca direta não espera o portão de atividade. Entrar na categoria é uma
   ação explícita, como a entrada numa categoria fria, que já busca na hora.
   Grava um bloco só, o da categoria aberta.
4. Quando a carga por seção chegar depois, `writeBlockWithin` vê a mesma
   assinatura e só carimba o instante. Não há regravação nem troca de ids.

Resultado para a pessoa: entra na categoria, vê na hora o que já tinha, e em
poucos segundos (uma requisição só daquela categoria) a grade se atualiza com
os itens novos e sem os removidos. O foco é reconciliado por id, como em toda
invalidação da 038.

**Alternativas**:
- Deixar a prioridade interromper a carga por seção (abortar `runSection` em
  `prioritize`): perde o download da seção já em curso (o mais caro) a cada
  entrada, e o preparo é descartado. Pior para a TV.
- Buscar e **esperar** a categoria renovada na entrada (sem `serveStale`):
  mostra os novos já no primeiro quadro, mas toda entrada depois de uma
  abertura passa a ter espera de rede. Fere a abertura instantânea da 038
  (FR-026).
- Baixar `REFRESH_ON_OPEN_MIN_MS` para 0: não resolve nada aqui, porque o
  gargalo não é a estrutura.

**Files likely to change**:
- `tv-web/src/lib/catalog/prefetch/index.ts` (`renewCategoryNow`)
- `tv-web/src/features/catalog/catalogApi.ts` (`ensureCategoryForEntry`)
- `tv-web/src/features/catalog/prefetchApi.ts` (só se o reexport ficar ali)
- teste novo (ex.: `tv-web/src/features/catalog/catalogApi.renovacao-entrada.test.tsx`
  ou junto dos testes existentes de `useCategoryContent`)

**Tests to add or update**:
- Entrada real numa categoria com renovação pendente: devolve os itens do
  disco na hora **e** dispara a busca daquela categoria sem depender do
  agendador (com o agendador simulado ocupado). Ao terminar, a consulta da
  categoria é relida e mostra o item novo e não mostra o removido.
- Pré-busca por foco (`signal`) numa categoria pendente: **não** dispara a
  busca direta (só `prioritize`).
- Categoria fresca: nenhuma busca.
- Regressão: `prefetchScheduler*.test.ts`, `categoryLoader*.test.ts`,
  `catalogApi*` e E2E (`npm run test:e2e`).

## Risks & Considerations

- **Duas buscas da mesma categoria** (direta e a da seção): a da seção chega
  depois com o mesmo conteúdo e só carimba o instante. Rede extra = uma
  requisição de categoria por entrada pendente, uma vez por abertura.
- **Limite do painel** (`rate_limited`): a busca direta devolve
  `rate_limited` sem gravar. A categoria continua pendente e o `prioritize`
  cobre depois. Não há laço: só se invalida a tela em `done`.
- **Gravação durante a navegação**: um bloco de uma categoria, igual à
  entrada numa categoria fria, que já acontece hoje. Categoria muito grande
  (milhares de filmes) grava um bloco grande: é o mesmo custo da entrada fria.
- **Foco**: a invalidação relê a grade, e a reconciliação é por id
  (constituição). Item focado que o provedor removeu cai no vizinho.
- **Constituição**: a busca nasce da entrada (SELECT), nunca do foco.
- **Verificação**: o ciclo real só fecha na TV com o provedor mudando. No
  navegador dá para simular ocupando a carga por seção (portão fechado) e
  conferir que a categoria aberta é renovada mesmo assim.

## Open Questions

- Nenhuma que bloqueie o Fix.
