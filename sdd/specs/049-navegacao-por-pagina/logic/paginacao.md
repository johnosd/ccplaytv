# Lógica — paginação, entrada por OK, topo da lista (feature 049)

Escopo: o "como" que um executor erraria sem saber. Os seletores e números
fixados pelos contratos travados estão no cabeçalho de cada arquivo
`*.navegacao-por-pagina.contract.test.*`.

## 1. Funções puras (`tv-web/src/lib/focus/paging.ts` — stub já criado)

```ts
pageSizeFor(viewportHeight, rowPitch) = max(1, floor(viewportHeight / rowPitch))   // NaN/≤0 → 1
pagedIndex(index, total, pageSize, dir):
  total <= 0            → null
  size = max(1, floor(pageSize))
  next:     min(total - 1, index + size)
  previous: max(0, index - size)
```

Sem circularidade. Sem "só pagina se houver página completa": lista curta vai ao
extremo (Spec FR-003).

## 2. Tamanho da página

| Lista | `viewportHeight` | `rowPitch` |
| --- | --- | --- |
| Canais da Live (virtualizada) | `channelListRef.current.clientHeight` | `LIVE_ITEM_ROW_HEIGHT` (84) — **constante**, a lista é virtualizada e as linhas são `translateY` |
| Trilha da Live | `trailScrollRef.current.clientHeight` | passo medido entre 2 itens vizinhos (`offsetTop` do 2º − do 1º) quando > 0; senão `TRAIL_ROW_PITCH_FALLBACK = 56` |
| Trilha de Filmes/Séries | contêiner rolável da trilha | idem trilha da Live |
| Zapping | os mesmos refs (as colunas são as mesmas funções) | idem |

jsdom devolve `offsetTop = 0`, então os contratos veem o fallback (56 → 11 por
página com `clientHeight` 640; canais 84 → 7). Sem `ref` montado → página 1.

## 3. Manter a linha da tela ao paginar

`pagedIndex` anda exatamente `pageSize` itens; para o item cair **na mesma linha
da tela**, a lista tem de rolar também `pageSize` linhas:

1. antes de mudar o foco, ler `offsetFromTop = focusedEl.getBoundingClientRect().top - container.getBoundingClientRect().top`;
2. mudar o foco (estado);
3. depois do commit (`useLayoutEffect` num hook pequeno, ex. `usePageScrollAnchor`), rolar o contêiner por
   `newFocusedEl.top - container.top - offsetFromTop` (o navegador prende ao fim da lista);
4. para a lista de canais (virtualizada) o item novo pode ainda não estar montado: rolar por
   `pageSize * LIVE_ITEM_ROW_HEIGHT` *antes* do commit (`scrollTop += delta` no contêiner), e deixar o
   `useVirtualFocusSync` (`align: 'auto'`) só corrigir se sobrar item fora da faixa.

Se o item de destino ficou fora da linha relativa por estar nas bordas (primeira/última página), vale o que
o navegador/virtualizador fizerem — **nunca** rolar para além do conteúdo.

O foco continua sendo estado da tela (ADR-009): nada de `.focus()` em linha.

## 4. Teclado da Live (`useLiveKeyboard.handleTrailDirection`)

Colunas: **0 = trilha, 1 = lista de canais**. A coluna 2 (destaque) **deixa de existir como alvo de foco**:
remover `previewAction`/`PREVIEW_ACTION_COUNT`/`setPreviewAction` dos parâmetros (e da `LiveScreen`).

| Foco | → | ← | ↑/↓ | OK | RETURN |
| --- | --- | --- | --- | --- | --- |
| Trilha | página seguinte da trilha (`focusedIdentity.trailKey`, `channelId: null`) | página anterior | item a item (↑ no topo → topbar, como hoje) | entra na entrada focada | sai da tela (como hoje) |
| Canais (item) | página seguinte (`channelId`) | página anterior | item a item | toca (`playActiveChannel`) | volta à trilha (`setCol(0)`) |
| Canais, topo (lupa/guia) | → na lupa vai ao guia; → no guia: nada | ← no guia volta à lupa; ← na lupa: nada | ↓ ao 1º canal; ↑: nada | lupa abre o campo; guia abre o Guia | volta à trilha |
| Campo de busca focado (DOM real) | do cursor (guarda de alvo editável — já existe) | do cursor | ↓ ao 1º resultado | — | em camadas (018) |

- `←` **nunca** `setCol(0)` e `→` **nunca** `enterFocusedTrailItem`/`setCol(2)`.
- `handleTrailSelect` perde o ramo `effectiveCol === 2`.
- RETURN: apagar o ramo `effectiveCol === 2`; o resto (camadas da busca, `setCol(0)` na coluna 1) já está certo.
- Zapping (`zapTopLayer(…, handleTrailDirection, handleTrailSelect)`) usa as mesmas funções: `zapOpen` ⇒ sem topo
  (nem lupa nem guia, `hasTop` já exclui o zapping).
- Key repeat (046): paginar com a seta segurada chega várias vezes a `handleTrailDirection`; não há nada novo a fazer
  além de **não** consultar rede por página (já vale: o prefetch por foco é adiado durante a rajada).

## 5. Topo da lista de canais — lupa e Guia

- Novo estado em `useLiveSearch`: `topIcon: 'search' | 'guide'` (+ setter), `'search'` por padrão e resetado em `resetSearchState()`.
  `topFocused` continua significando "o foco está na linha do topo"; `topIcon` diz em qual ícone.
- Desenho (`liveColumns.tsx`, `.category-title-row`): `<button class="search-icon-button">` (já existe) e, ao lado,
  `<button class="search-icon-button live-guide-button" aria-label="Guia completo"><Icon name="guide" /></button>`;
  `.tv-focus` no que estiver focado. O ícone de Guia só existe com `!zapOpen && !searchActive && !contentUnavailable && baseItems.length > 0`
  (a mesma condição da lupa, **mais** `!searchActive`: com o campo aberto o Guia some).
- OK no guia: `openGuideFromPreview()` (renomear se quiser, ex. `openGuideFromList`) — mantém `setCol(1)` + `setGuide({ list: entered, originId: activeChannel.id })`,
  então RETURN do Guia devolve o foco ao canal de origem (031).
- Sem canal ativo (`activeChannel` ausente): o ícone de Guia não deve ser alvo (`items.length > 0` já garante).

## 6. Destaque informativo (`liveColumns.tsx`)

Remover o bloco `.live-preview-actions` inteiro do `.live-hero` (e as classes/CSS `.live-preview-action*`
em `live.css`). Manter rótulo, nome, número, linha "ao vivo", progresso/horário/sinopse e a faixa de cartões.
O `.live-hero` (`justify-content: flex-end`) passa a terminar no bloco "ao vivo"; ajustar o espaçamento inferior.
Nada no `.live-preview-panel` pode ser `<button>` nem ter `tabindex`.

## 7. Filmes e Séries (`VodCatalogScreen.tsx`, `col === 0`)

```ts
if (col === 0) {
  if (dir === 'right' || dir === 'left') { pagina a trilha (focusedTrailKey) ; return }   // antes: right → enterFocusedTrailItem()
  ...                                                                                       // up/down e topbar: como hoje
}
```

`onSelect` em `col === 0` já chama `enterFocusedTrailItem()` — nada a mudar. **A grade não muda**: `left` na 1ª coluna
(`itemIdx % GRID_COLS === 0`) continua `setCol(0)`; a toolbar (busca/ordenar) continua com ←/→ próprios.

## 8. Dicas do rodapé

`LIVE_HINTS` hoje: OK Assistir, Segurar OK Favoritar, RETURN Voltar. Passa a refletir o gesto por foco:
na trilha, `OK Entrar`; na lista, `OK Assistir`. Se o `HintBar` não aceitar dicas dependentes de foco,
usar uma só lista: `OK Entrar/Assistir`, `← → Página`, `Segurar OK Favoritar`, `RETURN Voltar` (cabendo sem corte
a 1920×1080 — o E2E mede). `VOD_HINTS` ganha `← → Página` só enquanto o foco estiver na trilha ou usar o texto fixo.

## 9. O que NÃO muda

- Grade de Filmes/Séries, Guia completo (EPG), Configurações, Busca global, Início, listas (perfis), formulários, topbar.
- Memória de foco/restauração por identidade (046): `focusedIdentity` continua sendo gravada pelos mesmos pontos.
- Busca por categoria: ícone de lupa em ↑ do 1º canal; RETURN em camadas.
