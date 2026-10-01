# Lógica: grade de Filmes/Séries sob a topbar

Feature 025 — FR-001..FR-008, FR-016..FR-032, FR-044..FR-047, US1, US3, US4.
Reaproveita, sem mudar, a composição de foco da 023/024
(`sdd/specs/024-live-tv-ds-v14/logic/foco-live-shell.md` §2 e §6).
Contrato travado: `MoviesScreen.filmes-series-ds-v14.contract.test.tsx`.

## 1. Uma tela, duas seções

`MoviesScreen.tsx` e `SeriesScreen.tsx` são quase cópias (736/699 linhas).
Esta onda troca a apresentação das duas de uma vez, então elas passam a ser
**invólucros finos** de um componente compartilhado:

```
tv-web/src/features/vod/VodCatalogScreen.tsx
  props: { section: 'movies' | 'series', sourceId, restore?, onOpenItem(id, snapshot),
           onBack, onResync, shell?: VodShellProps }
```

- `MoviesScreen`/`SeriesScreen` mantêm os nomes, as props atuais (`onOpenMovie`/
  `onOpenSeries`, `restore`, `onBack`, `onResync`) e ganham `shell?`. Os testes
  existentes continuam importando os dois.
- O que difere por seção fica numa tabela de configuração no próprio
  `VodCatalogScreen` (rótulos "Filmes"/"Séries", `kind` do catálogo, textos
  vazios, meta do card: série mostra "Em dia"/"N/M" da 019, filme mostra o
  grupo).
- `shell` segue a 024 (D-002 dela): com a prop, a tela se envolve em
  `AppShell` + `TopBar currentItem={'movies'|'series'}`; sem ela, funciona
  sozinha. Estados de topo (carregando/erro/lista sem itens) também vão
  dentro da moldura.

## 2. Layout (palco 1920×1080)

```
┌ topbar (AppShell) ──────────────────────────────────────────────┐
├ side nav (≈320px) ┬ toolbar: [Título da entrada · chip N títulos]  [Pesquisar] [Ordenar · X ▾] ┤
│ Sua biblioteca    ├ hero band (≈150px, fixa, não focável)                                     ┤
│  ★ Favoritos  12  │   capa pequena · eyebrow · título · ano · categoria · selos             │
│  ↺ Histórico   4  ├ grade virtualizada, 6 colunas de ContentCard portrait 205×302           ┤
│ Catálogo          │   (único elemento rolável da área de conteúdo, FR-027)                  │
│  Todos            │                                                                          │
│  Ação         120 │                                                                          │
└───────────────────┴──────────────────────────────────────────────────────────────────────────┘
```

- Sem título de página separado: o título da entrada vai na toolbar, para
  sobrar altura para a grade (≈2 linhas de cards visíveis).
- Geometria fixa (D-006 do plano): card 205×302 + título/meta, `gap` do
  token de espaçamento, 6 lanes. Sem `ResizeObserver`/`usePosterColumnWidth`:
  `estimateSize` = altura fixa da linha, `left = lane × (205 + gap)`. Mesma
  lógica do `Rail` da 022 (tamanhos fixos, R-002 dela).
- A side nav é `SideCategoryNav` com entradas `pinned` (★, ↺, Todos) e os
  cabeçalhos "Sua biblioteca"/"Catálogo". O componente não tem cabeçalhos;
  adicione uma prop opcional `groupLabel?` por entrada (o primeiro de cada
  grupo desenha o rótulo) sem mudar o comportamento atual (a Live não passa).

## 3. Estado de foco

```ts
zone: 'topbar' | 'content'            // só com `shell` (024)
col: 0 | 1                            // 0 side nav, 1 conteúdo (toolbar + grade)
toolbarFocus: 'search' | 'sort' | null   // null = foco na grade
focusedItemId: string | null          // identidade, nunca índice (inalterado)
searchActive, searchTerm              // feature 018 (inalterado)
sortOpen: boolean                     // modal de Ordenar
```

`toolbarFocus` substitui o `topFocused` da 018: `'search'` é o antigo ícone
(ou o campo, com a busca ativa), `'sort'` é o botão novo.

### Tabela de teclas

| Onde | Tecla | Efeito |
|---|---|---|
| side nav, 1ª entrada (★), com `shell` | ↑ | `zone = 'topbar'` no destino atual |
| side nav | ↑/↓ | move (inalterado) |
| side nav | → / OK | entra na entrada (§4) |
| side nav | RETURN | `onBack()` → Início |
| grade, 1ª linha | ↑ | `toolbarFocus = 'search'` (ou `'sort'` se não houver Pesquisar; nada se não houver nenhum) |
| grade | ←, na coluna 0 | `col = 0` |
| grade | setas | `gridNextIndex` (inalterado) |
| grade | OK | abre o detalhe com snapshot (inalterado) |
| grade | segurar OK / amarela | favorita (inalterado) |
| grade | RETURN | `col = 0` (com busca ativa: volta ao campo, 018) |
| toolbar, Pesquisar (inativo) | → | `'sort'`, se existir |
| toolbar, Ordenar | ← | `'search'`, se existir; senão `col = 0` |
| toolbar, Pesquisar | ← | `col = 0` |
| toolbar | ↓ | grade, no item lembrado da entrada (ou o 1º) |
| toolbar, Pesquisar | OK | abre o campo (018) |
| campo ativo | ←/→/letras | do IME (guarda de alvo editável, inalterada) — **não** chega a Ordenar |
| campo ativo | ↓ / Done | 1º resultado (018) |
| campo ativo | RETURN | fecha a busca (018) |
| toolbar, Ordenar | OK | `sortOpen = true` |
| toolbar | RETURN | `col = 0` |
| topbar | ↓ | `zone = 'content'` — volta ao mesmo item |
| topbar | OK em outro destino | `shell.onSwitchTop(destino)` |
| topbar | RETURN | `onBack()` |

"Pesquisar" e "Ordenar" só existem com a entrada aberta e itens carregados
(FR-016/FR-017). "Ordenar" nunca existe em ★/↺ (FR-022).

## 4. Memória de foco por entrada (FR-030..FR-032)

`vodSessionMemory.ts` (stub pronto): `rememberFocus`/`recalledFocus` por
`sourceId|section|entryKey`, com `entryKey` =
`'favorites' | 'history' | 'all' | 'category:<groupLabel>'` — identidade da
entrada, nunca índice (mesmo critério do `TrailKey` atual).

- Toda mudança de `focusedItemId` com `col === 1` grava na memória da entrada
  aberta (um `useEffect` basta).
- Entrar numa entrada: `focusedItemId = restore?.focusedItemId` (voltando do
  detalhe) **ou** `recalledFocus(...)` **ou** `null` (1º item). O
  `locate()` atual já cai no 1º item quando o id lembrado não existe mais.
- Voltar do detalhe (FR-031): o `CategoryScreenSnapshot` continua sendo o
  caminho (entrada, busca, card). Ele ganha `{kind:'history'}` em
  `SnapshotTrailKey`/`SnapshotEntered`. A ordenação não entra no snapshot:
  já vive na memória de sessão da seção.
- Card lembrado que sumiu (revalidação, desfavoritar em ★): vizinho mais
  próximo pela ordem atual. Para ★ já existe (`onFocusNeighbor`); para o
  resto, `locate()` → 1º item é o comportamento atual e é aceito pela spec
  como "foco inicial apropriado" (FR-030). Voltando do detalhe com o card
  ausente, use o índice que o card tinha **no snapshot** só como dica de
  vizinho (guardar `focusedIndexHint` no snapshot), nunca como identidade.
- Nunca persistir (FR-032): só memória do módulo.

## 5. Ordenar (FR-018..FR-024)

- `vodSort.ts` (stub + contrato travado): `availableSortOptions(itens
  carregados da entrada)` e `sortVodItems(itens, opção)`.
  - A–Z: `localeCompare(b, 'pt-BR', { sensitivity: 'base' })`; `Array.prototype.sort`
    é estável no Chromium 108, então empates mantêm a ordem da fonte.
  - Ano: `year` desc; sem ano no fim. Recém-adicionados: `added_at` desc; sem no fim.
- A opção vale por seção na sessão (`sessionSort`/`setSessionSort`). Se a
  opção salva não estiver disponível na entrada aberta (ex.: "Ano" numa
  categoria M3U), a grade usa "Ordem da fonte" **sem apagar** a escolha da
  seção, e o botão mostra "Ordem da fonte".
- Pipeline dos itens exibidos: `base → filtro da busca (018) → sortVodItems`.
  A ordenação nunca se aplica a ★/↺.
- Modal: `Modal` da 022, lista vertical das opções disponíveis, ✓ na atual,
  foco inicial nela, ↑/↓ com clamp, OK escolhe e fecha, RETURN fecha. Ao
  fechar, `toolbarFocus = 'sort'` (a tela não perde o estado: o `Modal` só
  intercepta teclas). O foco da grade segue o mesmo `focusedItemId`
  (FR-024) — como o índice é sempre derivado da identidade, isso já vem de
  graça; só é preciso garantir o `scrollToIndex` da nova posição
  (`useVirtualFocusSync` já faz, ao mudar `focusedIndex`).

## 6. Hero band (FR-025, FR-026)

Não focável, dentro da coluna de conteúdo, entre a toolbar e a grade.

- Item destacado: o card focado; com o foco fora da grade (toolbar, side
  nav), o item lembrado da entrada ou o 1º. Sem itens (vazio, erro,
  carregando): a hero band não aparece.
- Conteúdo, só dado real: capa (`PosterArt`, tamanho pequeno fixo),
  eyebrow ("★ SEUS FAVORITOS", "↺ VISTOS RECENTEMENTE", nome da categoria,
  "TODOS"), título, linha de meta com `year` (se houver), grupo
  (`groupLabel`), e selos: "Assistido" (`useWatchedIds`), "Continuar de
  mm:ss" para filme com retomada (novo `useResumePositions(sourceId, kind)`,
  mesma forma de `useWatchedIds`: uma leitura por fonte/tipo, nunca por
  card), e para série o resumo "Em dia"/"N/M" (019).
- Nenhuma sinopse, nenhum botão, nenhuma leitura disparada por mudar o foco:
  tudo vem de dados que a tela já tem em memória.

## 7. Estados

Os mesmos da tela atual, com componentes V14 (padrão da 024):
carregando (`Spinner` + `EmptyState` com "Voltar"), erro de estrutura
(`ErrorState` "Tentar de novo"/"Voltar"), lista sem itens (`EmptyState`),
conteúdo carregando/erro/fonte ausente (`ErrorState` com "Tentar de novo"/
"Ressincronizar lista" acionáveis por SELECT — o bug da 014 não pode
voltar), ★ vazio (`FavoritesEmptyState` já existe), ↺ vazio
(`logic/historico.md` §6), "Todos" vazio e categoria vazia (texto + foco
na side nav, como hoje). Notas de cobertura, divergência de contagem,
truncamento e "stale-served" continuam, no estilo da 024.
