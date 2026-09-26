# Pseudocódigo normativo — Virtualização de Grades e Foco Direcional

**Nota de reconstrução (23/09/2026)**: assim como `research.md`, este
arquivo é uma recriação — o original nunca foi commitado (R-007 em
`plan.md`). §2, §3 e §5 abaixo descrevem código **já implementado** nas
Fases 1–3 (`useVirtualFocusSync.ts`, `LiveScreen.tsx`,
`usePosterColumnWidth.ts`) — documentam o que existe, não uma proposta
alternativa. §4 é normativo de verdade: descreve o que a Fase 4
(`MoviesScreen.tsx`/`SeriesScreen.tsx`, ainda não implementada) deve
seguir.

## §1. Por que dois hooks, não um

A virtualização (TanStack Virtual — "quais nós existem") e o foco
direcional (`useRemoteNav` — "o que está focado", D-001) são preocupações
independentes que só precisam trocar uma informação: **quando o índice
focado muda, o nó correspondente precisa existir no DOM**. `useVirtualFocusSync`
é essa ponte, de mão única (índice → scroll; nunca scroll → índice). A
medição de largura de coluna (`usePosterColumnWidth`) é uma preocupação
totalmente separada (geometria, não foco) — daí o segundo hook.

## §2. `useVirtualFocusSync` — sincronização índice → scroll

Implementado em `tv-web/src/lib/focus/useVirtualFocusSync.ts`.

```
function useVirtualFocusSync({ focusedIndex, scrollToIndex, enabled }):
  # scrollToIndex muda de identidade a cada render (o virtualizador é
  # recriado), mas isso NUNCA deve, sozinho, disparar um novo scroll —
  # só a MUDANÇA de focusedIndex importa. Guardar a função mais recente
  # numa ref, fora da lista de dependências do efeito principal, é o que
  # garante isso (mesmo padrão de `handlersRef` em `useRemoteNav.ts`).
  scrollToIndexRef = useRef(scrollToIndex)
  useEffect(() -> scrollToIndexRef.current = scrollToIndex)  # sem deps: roda toda vez, não rearma nada

  useEffect(() -> {
    if not enabled: return
    scrollToIndexRef.current(focusedIndex, { align: 'auto' })
  }, [focusedIndex, enabled])
```

**Invariantes**:

- Um único `useEffect` reagindo só a `focusedIndex`/`enabled` — sem
  `requestAnimationFrame` nem `setTimeout` duplo. Isso só é seguro porque
  não existe uma engine de foco por DOM a esperar (D-001, diferente do que
  uma integração com Norigin Spatial Navigation exigiria).
  `enabled: false` nunca chama `scrollToIndex` — usado quando a coluna de
  conteúdo está carregando, com erro, ou sem itens (não há para onde
  rolar).
- Quem decide **qual é** o próximo índice focado continua sendo a tela
  (`clamp`/`gridNextIndex` em `useRemoteNav.ts`) — este hook nunca lê nem
  escreve o estado de foco, só reage a ele.

## §3. `LiveScreen.tsx` — lista 1D de canais (Fase 3, implementado)

```
# tv-web/src/features/live/LiveScreen.tsx
LIVE_ITEM_ROW_HEIGHT = 84   # 72px do item (screens.css) + 12px de espaçamento — R0-3

channelListRef = useRef<HTMLDivElement>(null)
channelVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () -> channelListRef.current,
  estimateSize: () -> LIVE_ITEM_ROW_HEIGHT,
  overscan: 6,
})

channelsNavigable = col === 1 and not content.isLoading
                    and content.data?.outcome !== 'failed' and items.length > 0
useVirtualFocusSync({
  focusedIndex: channelIdx,       # já existia — locate(items, id === focusedIdentity.channelId)
  scrollToIndex: channelVirtualizer.scrollToIndex,
  enabled: channelsNavigable,
})

# render (só quando showingContent && !loading && !failed && items.length > 0):
<div ref={channelListRef} class="live-channel-list">          # scroll viewport: flex:1, overflow:auto
  <div class="live-channel-list-inner" style={height: channelVirtualizer.getTotalSize()}>
    for virtualRow in channelVirtualizer.getVirtualItems():
      channel = items[virtualRow.index]
      <button class={`live-item ${channelIdx === virtualRow.index ? 'tv-focus' : ''} ...`}
              style={{ transform: `translateY(${virtualRow.start}px)` }}>
        ...conteúdo do item, inalterado desde antes da virtualização...
```

**Invariantes**:

- Nunca `lanes` aqui — é uma lista, não uma grade (D-005).
- O título da coluna (`.live-column-title`) e as mensagens de estado
  (carregando/erro/vazio/truncamento) ficam **fora** de `.live-channel-list`,
  em fluxo normal — só os itens da lista entram na janela virtual. A
  trilha de categorias (`col 0`, `.live-column-groups`) nunca é
  virtualizada (D-004).
- `.live-item` dentro de `.live-column-channels` ganha `position: absolute`
  e altura fixa — mas o mesmo seletor `.live-item` dentro de
  `.live-column-groups` (a trilha) **não pode** ganhar essas regras
  (D-004) — daí o CSS ser escopado como `.live-column-channels .live-item`,
  nunca `.live-item` sozinho.

## §4. `MoviesScreen.tsx` / `SeriesScreen.tsx` — grade com `lanes` (Fase 4, a implementar)

Mesmo padrão de §3, com três diferenças por ser uma grade 2D em vez de uma
lista 1D — ver R0-1/R0-2 em `research.md` para o raciocínio completo:

```
# tv-web/src/features/movies/MoviesScreen.tsx (e o equivalente em series/SeriesScreen.tsx)
GRID_COLS = 6   # já existe hoje, usado por gridNextIndex

gridContainerRef = useRef<HTMLDivElement>(null)
columnWidth = usePosterColumnWidth(gridContainerRef, GRID_COLS)     # R0-2
rowHeight = columnWidth * (3/2)   # .poster-box é aspect-ratio: 2/3 — altura da LINHA da grade,
                                  # não só do poster (inclui .poster-card-title/.poster-card-meta
                                  # abaixo do poster — medir ou reservar espaço fixo para eles,
                                  # não deixar a altura da lane depender só do aspect-ratio)

gridVirtualizer = useVirtualizer({
  count: movies.length,
  getScrollElement: () -> gridContainerRef.current,
  estimateSize: () -> rowHeight,
  lanes: GRID_COLS,               # diferença 1: lanes, não lista 1D (D-005)
  overscan: GRID_COLS,            # uma linha inteira de folga em cada direção
})

useVirtualFocusSync({
  focusedIndex: movieIdx,
  scrollToIndex: gridVirtualizer.scrollToIndex,
  enabled: col === 1 and not content.isLoading and not contentFailed and movies.length > 0,
})

# render:
<div ref={gridContainerRef} class="poster-grid">   # troca display:grid por position:relative (R0-1)
  <div style={{ position: 'relative', height: gridVirtualizer.getTotalSize() }}>
    for virtualRow in gridVirtualizer.getVirtualItems():
      movie = movies[virtualRow.index]
      leftPercent = (virtualRow.lane / GRID_COLS) * 100      # diferença 2: posição também em X
      widthPercent = (1 / GRID_COLS) * 100
      <div style={{
             position: 'absolute',
             top: 0, left: `${leftPercent}%`, width: `${widthPercent}%`,   # % — nunca pixel (R0-1)
             transform: `translateY(${virtualRow.start}px)`,
           }}>
        <div class={`poster-box ${movieIdx === virtualRow.index ? 'tv-focus' : ''}`}>...</div>
        <div class="poster-card-title">{movie.name}</div>
        <div class="poster-card-meta">...</div>
```

**Invariantes específicas da grade** (além de tudo que §3 já estabelece):

- `virtualRow.lane` (0 a `GRID_COLS - 1`, fornecido pelo próprio TanStack
  Virtual) decide a coluna — nunca recalcular `index % GRID_COLS` à mão à
  parte disso; são a mesma informação, mas usar o campo que o virtualizador
  já dá evita os dois discordarem se a ordem de preenchimento de lanes
  mudar.
- Diferença 3 (a mais sutil): `usePosterColumnWidth` mede o contêiner ANTES
  do virtualizador poder calcular `estimateSize` de forma precisa — na
  primeira renderização, `columnWidth` é `0` (research.md, `usePosterColumnWidth`),
  então `rowHeight` também é `0` nesse instante. Isso é seguro (o
  `ResizeObserver` corrige no próximo render, antes de qualquer interação
  da pessoa) — mas **não** tente adiar a montagem do virtualizador até
  `columnWidth > 0`; isso re-introduziria um frame sem elemento focável,
  o que a constitution proíbe ("Foco Visível e Sem Becos Sem Saída").
- `.poster-grid` deixa de ser `display: grid` (T015) — essa é a **única**
  mudança de CSS compartilhada entre Filmes e Séries, porque as duas telas
  usam a mesma classe; `SeriesScreen.tsx` (T016) não precisa de nenhuma
  mudança de `screens.css` própria.

## §5. `usePosterColumnWidth` — medição por `ResizeObserver` (Fase 2, implementado)

Implementado em `tv-web/src/lib/focus/usePosterColumnWidth.ts`.

```
function usePosterColumnWidth(containerRef, cols):
  [columnWidth, setColumnWidth] = useState(0)

  useEffect(() -> {
    element = containerRef.current
    if not element: return

    observer = new ResizeObserver((entries) -> {
      entry = entries[0]
      if not entry: return
      setColumnWidth(entry.contentRect.width / cols)
    })
    observer.observe(element)

    return () -> observer.disconnect()
  }, [containerRef, cols])

  return columnWidth
```

**Invariantes**:

- `0` antes da primeira medição é um valor válido de retorno, não um erro
  — quem consome (§4) precisa tratar `columnWidth === 0` sem lançar (ex.:
  `rowHeight` também vira `0`, e o virtualizador aceita `estimateSize() -> 0`
  sem quebrar; a correção chega no próximo render).
- Sem contêiner montado (`containerRef.current === null`), não tenta
  observar nada — evita um erro de `ResizeObserver.observe(null)`.
