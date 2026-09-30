# Lógica — grade, foco e teclas do Guia completo

Arquivos: `tv-web/src/features/live/guide/guideGrid.ts` (funções puras, stub do plan;
contratos `guideGrid.epg-guia-completo.contract.test.ts`), `EpgGuide.tsx` (componente; stub;
contrato `EpgGuide.epg-guia-completo.contract.test.tsx`), `tv-web/src/styles/guide.css` (novo).

## 1. Modelo

- **Linha** = um canal + seus programas em ordem de início, **já com o deslocamento manual
  da fonte somado** (feature 030: `lookup.offsetMs`). A grade nunca soma deslocamento por
  conta própria. Canal sem `epg_channel_id`, ou sem programa lido, = linha sem programas
  (`programs: []`) → bloco único "Sem programação" (FR-007).
- **Foco** = `{ channelId, programStart | null }` — identidade por canal + início, nunca
  índice (constitution, "Voltar Restaura Foco"). Reconciliação quando a programação muda
  (uma sincronização termina com o guia aberto): se `programStart` ainda existe na linha,
  fica; senão, `programNearest(row, refTime)`.
- **`refTime`** = a hora de referência de ↑/↓ (a "coluna" em que a pessoa está). Não é o
  índice nem o início do programa: é o instante de tela.
  - Abertura: `max(programaFocado.start, view.viewStart)`; sem programa focado, `now`.
  - Depois de ←/→: `max(novoPrograma.start, view.viewStart)` (a borda esquerda visível do bloco).
  - ↑/↓ **não** mudam `refTime`.
  - Abas: `jumpToDay` devolve o `refTime` novo.
- **Janela visível** `view = { viewStart, spanMs }`, `GUIDE_SPAN_MS = 2 h`. Limites
  `bounds = { from: now − 12 h, to: now + 48 h }` (a janela que a feature 030 guarda;
  FR-003). `viewStart` sempre em `[bounds.from, bounds.to − span]`.
  - Janela inicial: `max(bounds.from, floorLocal30(now) − 30 min)` — mostra um pouco do
    passado e deixa a linha do "agora" no primeiro quarto. Depois, `scrollForFocus` com o
    programa focado.

## 2. Geometria (percentuais, sem constante de pixel no modelo)

`blocksInView(row, view)` devolve só os programas que **intersectam** `[viewStart, viewStart+span)`,
com `leftPct = (max(start, viewStart) − viewStart) / span · 100` e
`widthPct = (min(end, viewEnd) − max(start, viewStart)) / span · 100` (recortados às bordas).
O CSS posiciona com `left: X%; width: Y%` dentro da área da grade; o **mínimo legível** é CSS
(`min-width: var(--space-6)` no `.epg-guide-block`), não do modelo — um bloco de 3 min continua
focável e não some. Busca dos programas visíveis: linear na linha é suficiente (dezenas de
programas por linha na janela de 60 h); só as linhas **montadas** pelo virtualizador vertical
calculam blocos.

`tickTimes(view, 30 min)`: múltiplos de 30 min **no horário local** (`getMinutes() % 30`),
não em UTC — o fuso local pode ter deslocamento que não é múltiplo de 30 min.

## 3. Estado do componente (`EpgGuide`)

```text
list: GuideListKey          // começa em initialList
focus: GuideFocus | null
refTime: number
view: GuideView
zone: 'bar' | 'grid'
barIndex: number            // item focado na barra do topo
selectorOpen: boolean; selectorIndex: number
now = useNow(30_000)        // FR-002: linha da hora e "Agora" com ≤ 1 min de atraso
```

Dados (hooks já existentes, **nenhum novo acesso a rede além do que a Live TV já faz**):
`useCategoryContent(sourceId, categoriaDaLista)` / `useFavoritesContent(sourceId,'channel',list.kind==='favorites')` /
`useAggregatedItems(sourceId,'channel',list.kind==='all')` — exatamente como o `LiveScreen`
(habilitados por `list.kind`); `useEpgPrograms(sourceId, epgChannelIds)` (feature 030, só
IndexedDB, `placeholderData: keepPreviousData`); `useSources()` (`importApi`) para o estado
do EPG da fonte.

`rows = items.map(item => ({ channelId: item.id, programs: (lookup.byKey.get(item.epg_channel_id) ?? []).map(shift(offsetMs)) }))` — memoizado por `[items, lookup]`.

## 4. Zonas e teclas

Duas zonas, como `LiveScreen`+`TopBar` (ADR-009, foco por estado): **barra** (topo: seletor
de lista, aba Hoje, aba Amanhã) e **grade**.

| Zona | ← | → | ↑ | ↓ | OK | RETURN |
| --- | --- | --- | --- | --- | --- | --- |
| grade | programa anterior (`moveHorizontal`) | programa seguinte | canal de cima (`moveVertical`); na 1ª linha → barra | canal de baixo; na última, nada | assiste (ver §5) | `onClose()` |
| barra | item anterior | item seguinte | nada | → grade (mantém o foco) | seletor: abre; aba: `jumpToDay` e volta à grade | `onClose()` |
| seletor aberto | — | — | entrada anterior | próxima | escolhe a lista | fecha o seletor (volta à barra) |

- Depois de todo movimento na grade: `view = scrollForFocus(view, programaFocado, bounds)`;
  o índice da linha focada vai a `useVirtualFocusSync` (rolagem vertical, feature 009).
- **↓ na barra com lista vazia/erro/explicação** não faz nada — o estado só tem os itens da barra.
- `onPage('previous'|'next')` (CH−/CH+, FR-015): move `focus` para o canal `pageRows` acima/abaixo
  (`pageRows = linhas visíveis − 1`, mín. 1), usando `refTime` como em ↑/↓, saturando nas pontas.
- **Foco visível único** (`.tv-focus` em exatamente um elemento: bloco, item da barra ou entrada
  do seletor) e `.no-scale` em blocos e itens (FR-005).
- **Mover o foco nunca dispara rede** (FR-018): nada aqui chama `fetch`; só escolher uma lista
  nova no seletor (OK) pode disparar a leitura da categoria, pelo mesmo caminho da Live TV.

## 5. OK na grade (FR-020/FR-021)

```text
row = rows.find(focus.channelId); channel = items.find(id)
if !channel.playable → onNotify('Este canal não tem uma fonte de reprodução disponível.'); return
if focus.programStart != null and programa.end <= now → onNotify('Este programa já terminou.'); return
onWatch(channel, items, list)        // atual, futuro, ou bloco "Sem programação"
```

Os textos de `onNotify` são fixos — nada de programa/canal interpolado com dado externo além do que já é exibido.

## 6. Painel de detalhe (FR-006/FR-008)

Do bloco focado: título; `HH:MM – HH:MM` (`formatEpgTimeRange`, feature 030); chip "Agora" se
`start <= now < end`; sinopse (até 3 linhas) se existir; nome do canal. Bloco vazio: nome do canal
e "Sem programação". **Nenhum texto que não venha da programação guardada.**

## 7. Estados (todo estado tem foco possível — constitution)

| Estado | Condição | Conteúdo | Focáveis |
| --- | --- | --- | --- |
| carregando | `content isLoading` | `Spinner` + "Carregando canais…" | seletor |
| erro | `content` falhou | `ErrorState` "Não foi possível carregar os canais desta lista." | seletor, "Tentar de novo" (`refetch`) |
| lista vazia | `items.length === 0` | `EmptyState` (favoritos: dica de favoritar; outra: "Nenhum canal aqui.") | seletor |
| sem programação | `epg.state ∈ {not_configured, disabled, never_synced}`, ou `error` com zero programas lidos | explicação por estado + `onOpenEpgSettings` | seletor, "Configurar EPG" (se `onOpenEpgSettings`) |
| grade | o resto | grade completa | barra + grade |

Textos do estado "sem programação": `not_configured` → "Esta lista não tem EPG configurado.";
`disabled` → "O EPG desta lista está desativado."; `never_synced` → "O EPG desta lista ainda não foi
sincronizado."; `error` → "Não foi possível carregar a programação." (com o `EPG-02` só na tela
de EPG, não aqui).

## 8. Seletor de lista (US4) — camada do próprio guia, **não** `Modal`

O `PlayerLayer` captura o teclado na fase de captura e um `Modal` filho nunca receberia teclas
(mesma restrição da feature 029). Então o seletor é um painel **interno** do guia (`selectorOpen`),
com o mesmo modelo de foco por estado: lista vertical `[★ Favoritos, Todos, …categorias]`,
foco inicial na lista atual, `useScrollFocusedIntoView` para categorias longas. Escolher = OK.
Isto difere do FR-023 da spec ("abre um `Modal`") só no mecanismo — mesmo comportamento
observável; registrado como R-004 do plan.

Em "Todos", o cabeçalho mostra "Guia de X de Y categorias" (`coveredCategories`/`totalCategories`
de `useAggregatedItems`, feature 018) — nunca apresenta cobertura parcial como completa.

## 9. Linhas de canal

Número (`channelNumberOf(channel, categories)`, feature 024), logo (`PosterArt variant="logo"`),
nome. Canal indisponível (`!playable`): linha esmaecida + selo "Indisponível" (mesmo padrão da
`ChannelRow`). Reaproveitar `ChannelRow` **só se** o layout da coluna fixa couber sem hack —
senão um `div` próprio com as mesmas classes de token; decidir na execução (T009).

## 10. Desempenho

Virtualização **vertical** com `@tanstack/react-virtual` (altura fixa de linha, `overscan` 4);
blocos calculados só para as linhas montadas. "Todos" numa fonte grande (milhares de canais)
lê `useEpgPrograms` para todas as chaves únicas de uma vez (feature 030: uma leitura por chave,
~300 ms para ~950 chaves no painel de referência) — aceitável fora do caminho crítico da tecla;
medir na TV (R-003).
