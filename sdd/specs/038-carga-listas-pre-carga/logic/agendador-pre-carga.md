# Lógica — Agendador da pré-carga

Cobre FR-001 a FR-011, FR-025/FR-026 (lado do agendador), FR-031 (progresso) e
SC-002/SC-003/SC-004. Código: `tv-web/src/lib/catalog/prefetch/`.

## 1. Peças e responsabilidades

| Peça | Arquivo | Faz | Nunca faz |
| --- | --- | --- | --- |
| Ordem | `prefetchOrder.ts` (puro) | Escolhe a próxima categoria | Tocar disco, rede, relógio |
| Portão | `activityGate.ts` | Diz se pode **começar** agora | Saber de categoria |
| Agendador | `prefetchScheduler.ts` | Laço: espera portão → escolhe → roda uma → repete | Abortar uma categoria em andamento |
| Instância real | `prefetch/index.ts` (novo) | Liga agendador + portão às dependências reais (`listCategories`, `ensureCategory`, `window`, `navigator.onLine`, `document.visibilityState`) | Ser importada por teste de contrato |
| Ponte React | `features/catalog/prefetchApi.ts` (novo) | `usePrefetchProgress`, `usePrefetchHint`, invalidação de consultas | Lógica de ordem |

Telas falam só com `features/catalog/*` (D-001 da 005), nunca com `lib/` direto.

## 2. Ordem (`pickNextCategory`)

Entrada: categorias (`PrefetchCategoryState`), dica (`{kind, focusedCategoryId?}`),
falhas da sessão (`Map<id, n>`), `now`.

```
workNeeded(c, now):
  if c.fetchMode === 'eager'                      → undefined   // já tem tudo
  if c.itemsFetchedAt === undefined               → 'cold'
  if c.renewRequestedAt > c.itemsFetchedAt        → 'renew'
  if c.fetchMode === 'on_demand'
     && now - c.itemsFetchedAt > STALE_AFTER_MS   → 'renew'     // stored não vence por idade (D-007 da 014)
  → undefined

candidatas = categorias com workNeeded ≠ undefined e attempts < MAX_ATTEMPTS_PER_SESSION (3)

níveis (tiers), nesta ordem:
  T0  a focada (hint.focusedCategoryId), se candidata
  T1  vizinhas da focada na MESMA seção: posição na lista da seção ordenada por
      `order`, distância 1..NEIGHBOR_RADIUS (3); por distância crescente, e
      no empate a de BAIXO (posição maior) antes da de cima
  T2  resto da seção da dica, por `order`
  T3.. cada outra seção como um nível próprio, em SECTION_ORDER
      (channel → movie → series), por `order`
  sem dica: só os níveis de seção, em SECTION_ORDER
dentro de cada nível: 'cold' antes de 'renew' (estável quanto ao resto)
categorias com attempts > 0 (e < MAX) saem dos níveis e vão, na mesma ordem
relativa, para DEPOIS de todos os níveis
```

**Recuo (FR-014)**: `PickNextInput.scope = 'neighborhood'` devolve só T0/T1 (e
falhas delas); o agendador recebe o escopo por uma constante/opção
(`PREFETCH_SCOPE` em `prefetch/index.ts`), `'full'` por padrão. Aplicar o recuo
é trocar essa constante — o contrato continua valendo para `'full'`.

O contrato `prefetchOrder.carga-listas.contract.test.ts` fixa exatamente isso
(inclusive o empate "baixo antes de cima" e a seção como nível próprio — uma
categoria fria de Séries NÃO passa na frente de uma renovação de Canais).

## 3. Portão de atividade (`createActivityGate`)

```
state: lastKeyAt?: number; playbackHolds = 0; hidden = false; online = true
noteKey(now)            → lastKeyAt = now
acquirePlayback()       → playbackHolds++; notify; return release (idempotente: 2ª chamada não decrementa)
setHidden/setOnline     → muda + notify se mudou
blockReason(now, idle)  → 'playback' se holds>0; 'hidden' se hidden; 'offline' se !online;
                          'key' se lastKeyAt !== undefined && now - lastKeyAt < idle; senão undefined
keyIdleAt(idle)         → lastKeyAt + idle (ou undefined)
```

Ligações reais (em `prefetch/index.ts`, uma vez, na carga do módulo):

- `window.addEventListener('keydown', e => gate.noteKey(Date.now()), { capture: true, passive: true })`
  — **em `window`, fase de captura**: roda antes dos ouvintes de `document`
  que `Modal`/`useRemoteNav({modal:true})` usam para `stopImmediatePropagation`.
  Nunca chama `preventDefault`/`stopPropagation`.
- `document.visibilitychange` → `setHidden(document.visibilityState === 'hidden')`.
- `online`/`offline` do `window` + `navigator.onLine` inicial → `setOnline`.
  Reusar `lib/onlineStatus.ts` se ele expuser assinatura; senão ouvir direto.
- `PlayerLayer` e `TrailerLayer`: `useEffect(() => prefetchGate.acquirePlayback(), [])`
  (montou = aberto, desmontou = fechado; zapping não remonta). Importam de
  `lib/catalog/prefetch/index.ts` — são componentes genéricos, não telas; o
  import direto de `lib/` é aceitável (mesmo padrão de `screenSaver.ts`).
  **Cuidado:** `PlayerLayer`/`TrailerLayer` têm contratos travados (027, 029,
  031, 020, 033) — só acrescentar o efeito, sem mudar props nem DOM.

## 4. Laço do agendador

```
start(sourceId):
  if running for same sourceId → return
  stop(); current = sourceId; attempts.clear(); stoppedReason = undefined; loop()

loop():                                   // uma única corrente assíncrona por vez
  while current === mySourceId:
    wait until gate.blockReason(now, idle) === undefined
       - 'key': setTimeout até keyIdleAt(idle) (+1ms) e reavalia
       - 'playback'/'hidden'/'offline': espera gate.subscribe notificar e reavalia
         (estado exposto: 'paused')
    categories = await deps.loadCategories(sourceId)     // relê o disco a cada rodada (FR-006)
    publish progress (ready = com itemsFetchedAt, total = não-eager)
    id = pickNextCategory({categories, hint, attempts, now}) com prioridade:
         se houver ids em `prioritized` que ainda precisam de trabalho → o 1º deles
    if id === undefined: state='done'; espera wake()/setHint()/prioritize() e continua
    state='running'
    outcome = await deps.runCategory(sourceId, id)       // NUNCA abortado
    if current !== mySourceId: break                      // stop()/troca de lista durante a busca
    'done'         → prioritized.delete(id); deps.onCategoryDone?.(sourceId, id)
    'failed'       → attempts.set(id, n+1)
    'storage_full' → stoppedReason='storage_full'; state='stopped'; return (FR-008)
    await sleep(gapMs)                                     // cede a thread entre categorias

stop(): current = null; acorda qualquer espera; state='stopped' (a busca em voo termina sozinha)
setHint(h): hint = h; acorda espera de 'done'
prioritize(id): prioritized.add(id); acorda espera de 'done'
wake(): acorda (estrutura mudou)
```

- **Uma corrente só**: um contador de "época" (`epoch++` em `start/stop`)
  garante que um laço antigo que acorde depois de `stop()` saia sem rodar nada.
- **Sem abortar**: a busca é compartilhada com a entrada real pelo `dedup` do
  `categoryLoader` (chave = id local da categoria); abortar quebraria a
  entrada (mesma lição do bug `prefetch-concorrente-categoria-sem-cancelamento-
  requisicao`). O que o player/tecla bloqueia é **começar** — SC-004 mede
  inícios, não buscas em voo.
- `runCategory` real (em `prefetch/index.ts`):
  ```
  category = (await listCategories(sourceId)).find(c => c.id === id)
  if !category → 'done'                          // saiu numa atualização
  try { r = await ensureCategory(sourceId, category, { renew: true }) }
  catch (e) { StorageFullError → 'storage_full'; senão 'failed' }
  'fetched' | 'fresh' → 'done' ; 'failed' | 'stale-served' | 'source_missing' → 'failed'
  ```
  `renew: true` é uma opção nova de `ensureCategory` (ver
  `atualizacao-sem-esfriar.md` §5): força obter mesmo com itens no disco quando
  `workNeeded` pediu renovação, e grava por `renewCategoryItems`.
  `ensureCategory` já converte erro de quota? Hoje `fetchAndStore` captura tudo
  e devolve `failed` — **precisa deixar `StorageFullError` subir** (como já faz
  com `AbortError`), senão FR-008 nunca dispara.

## 5. Quem liga e desliga

- **Início do agendador**: na raiz (`App.tsx`), efeito sobre a fonte ativa:
  `activeSource ? scheduler.start(activeSource.id) : scheduler.stop()`. Só
  para fonte já publicada (`activeGeneration !== undefined`); a lista recém-
  -criada começa quando "Abrir lista" a torna ativa (FR-001/FR-009).
- **Durante uma importação/atualização da mesma fonte** (`useOpenSource`
  disparou `update_by_age`, ou "Ressincronizar"): o agendador **continua**
  (a estrutura ativa segue válida — `atualizacao-sem-esfriar.md`); ao terminar
  a importação com sucesso, a raiz chama `scheduler.wake()`.
- **Dica (FR-005/FR-011)**: `LiveScreen` e `VodCatalogScreen` chamam
  `usePrefetchHint({ kind, focusedCategoryId })` com a categoria em foco na
  navegação lateral. O hook só chama `scheduler.setHint` — nenhuma consulta,
  nenhuma rede. Desmontar a tela limpa a dica. Início/detalhe: sem dica.
- **Entrada numa categoria vencida (FR-026)**: `loadCategoryContent` passa
  `serveStale: (id) => scheduler.prioritize(id)` para `ensureCategory`.
- **Pré-busca de 300 ms (R-013 da 010)**: continua existindo e continua
  separada (D-009 do plano). Ela é a única coisa que consulta por foco, e o
  foco já era permitido para ela; o agendador não a substitui.

## 6. Invalidação (FR-022, SC-007)

`onCategoryDone(sourceId, id)` → fila de invalidação **agrupada**: no máximo
uma rodada a cada `INVALIDATE_BATCH_MS` (1000 ms), invalidando:

- `['categories', sourceId]` (prefixo — as três seções) → contagem aparece no trilho;
- `['category-content', sourceId, id]` de cada id da rodada → a tela aberta relê;
- `['catalog-counts', sourceId]`, `['catalog-search-index', sourceId]`,
  `['global-search-index', sourceId]`.

Relida a lista de categorias, as telas recebem objetos novos para a mesma
categoria: o foco da navegação lateral é **índice + id** hoje — conferir que
nada nas telas reage a "objeto de categoria mudou" rearmando a pré-busca de
300 ms (o efeito de `useCategoryFocusPrefetch` depende de `focusedCategory`
inteira: com a lista relida, ele rearma e pode repetir `ensureCategory` numa
categoria já fresca — inofensivo, `ensureCategory` responde `fresh` sem rede,
mas conferir que não vira rajada; se virar, trocar a dependência por
`focusedCategory?.id` + `itemsFetchedAt`).

## 7. Progresso (US6)

`getProgress()`/`subscribe` alimentam `usePrefetchProgress()` via
`useSyncExternalStore` (mesmo padrão de `useEpgSyncing`). `ready`/`total` vêm
da última leitura do disco do laço (não contam `eager`). A linha do Início
(`homeStatusLine.ts`, puro) decide o texto:

| Condição | Texto |
| --- | --- |
| importação da fonte ativa em andamento | "Atualizando catálogo…" |
| agendador `running`/`paused` e `ready < total` | "Preparando catálogo — {ready} de {total} categorias" |
| senão, com `lastSuccessfulSyncAt` | "Catálogo atualizado há {idade}" (`formatAge`, nunca negativo: idade < 0 → "agora") |
| sem nenhuma sincronização | nada |

Idade: "agora" (< 1 min), "há N min", "há N h", "há N dias". `stoppedReason ===
'storage_full'` não muda o texto (FR-032: nada de erro cru; o fluxo de erro de
armazenamento já existe na entrada da categoria).
