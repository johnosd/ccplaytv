# Fase 0 — Pesquisa

**Nota de reconstrução (23/09/2026)**: este arquivo é uma recriação. A
versão original, produzida no replanejamento desta mesma data, nunca foi
commitada neste repositório — confirmado por `git log --all` sem nenhuma
ocorrência do caminho — e se perdeu na troca de container entre sessões
(registrado como R-007 em `plan.md`). O conteúdo abaixo é reconstruído a
partir das Decisões Invariantes (D-001 a D-006) já registradas em `plan.md`,
das referências específicas a `R0-1`/`R0-2`/`R0-4` espalhadas por `plan.md`
e `tasks.md`, e do código real já implementado nas Fases 1–3
(`useVirtualFocusSync.ts`, `usePosterColumnWidth.ts`, `LiveScreen.tsx`) — não
é um resumo de memória do que existia antes, é consistente com o que existe
agora.

## R0-1. Como virtualizar uma grade fluida sem perder as colunas fluidas

**Decisão**: um único `useVirtualizer` (TanStack Virtual) por grade, com
`lanes: GRID_COLS` — nunca dois virtualizadores compostos (um por linha, um
por coluna). O posicionamento de cada item passa a ser `left`/`width` em
porcentagem (`i % GRID_COLS / GRID_COLS * 100%`, mesmo cálculo que
`grid-template-columns: repeat(6, 1fr)` já expressa hoje) em vez de depender
do `display: grid` do navegador.

**Por que era incerto**: `.poster-grid` (`screens.css`) usa
`grid-template-columns: repeat(6, 1fr)` — colunas que se redistribuem
sozinhas conforme a largura do contêiner muda (orientação, escala da TV).
Virtualizar geralmente troca isso por posicionamento absoluto
(`transform: translateY`), que por si só não sabe nada sobre "6 colunas
fluidas" — um `left` fixo em pixels reintroduziria exatamente o tipo de
valor hardcoded que ADR-007 proíbe para geometria de tela.

**Justificativa da escolha**: o modo `lanes` do TanStack Virtual foi
desenhado exatamente para este caso — uma grade de N colunas onde cada
"lane" é virtualizada como se fosse uma lista própria, mas todas
compartilham o mesmo scroll container. Como a posição de cada item dentro
da lane já é conhecida em índice (`i % GRID_COLS`), expressar a coordenada
horizontal em **porcentagem** (não pixel) preserva a fluidez de
`repeat(6, 1fr)` sem precisar que o navegador recalcule um grid de verdade.

**Alternativas consideradas**:

| Alternativa | Por que não é a escolha |
| --- | --- |
| Um `useVirtualizer` por linha (`count = Math.ceil(items.length / GRID_COLS)`), cada célula posicionada por índice dentro da linha | Duplicaria a lógica de reconciliar foco↔índice (D-001) em duas dimensões separadas em vez de uma; o próprio TanStack Virtual já resolve isso com `lanes` |
| Manter `display: grid` e só limitar quantos `<div>` existem via paginação manual (sem TanStack Virtual) | Reintroduziria a mesma classe de bug que motivou trocar de biblioteca: sincronizar "quais itens existem" com "onde o scroll está" à mão, sem a maturidade do TanStack Virtual em cálculo de offset/overscan |
| `left` em pixel fixo, recalculado via `usePosterColumnWidth` a cada render | Tecnicamente funciona, mas descarta a vantagem do `%` (não precisa recalcular em cada resize) sem ganhar nada em troca — usada só a **largura** medida (R0-2), não a posição |

## R0-2. Medir a largura real do contêiner de pôsteres

**Decisão**: `usePosterColumnWidth(containerRef, cols)` — um `ResizeObserver`
no contêiner da grade, devolvendo `largura medida / cols`. Já implementado
em `tv-web/src/lib/focus/usePosterColumnWidth.ts` (Fase 2) e testado
isoladamente em `usePosterColumnWidth.test.ts`.

**Por que é necessário**: o virtualizador precisa de uma **altura de linha**
(`estimateSize`) antes do primeiro layout — e como `.poster-box` é
`aspect-ratio: 2/3`, essa altura depende da **largura da coluna**, que por
sua vez depende da largura do contêiner (fluida, não um valor fixo). Sem
medir, a única saída seria fixar um pixel de largura — o que ADR-007 proíbe
(tela nova consome token, nunca define tamanho literal) e quebraria em
qualquer resolução diferente de 1920×1080.

**Justificativa do mecanismo**: `ResizeObserver` (não `window.resize`)
porque o que importa é o tamanho do **contêiner específico**, não da janela
— a diferença importa em qualquer tela com colunas laterais (a trilha de
categorias, `col 0`, consome parte da largura). Zero antes da primeira
medição é esperado e seguro (o observer dispara o callback assim que
`observe()` é chamado, então o valor real chega no próximo render, não numa
segunda interação da pessoa) — ver R0-4 para como isso se comporta sob
teste, onde não há `ResizeObserver` de verdade.

**Alternativa considerada e rejeitada**: ler `getBoundingClientRect()` uma
única vez no mount, sem observer. Funcionaria para o layout inicial, mas
não reagiria a uma mudança de tamanho do contêiner em tempo de execução
(ex.: escala de acessibilidade do sistema, ou debug em janela redimensionável
durante desenvolvimento) — o `ResizeObserver` não custa mais e cobre os dois
casos.

## R0-3. Altura de linha da lista de canais: fixa, não medida

**Decisão**: ao contrário da grade de pôsteres (R0-2), a **lista** de
canais (Live TV, `LiveScreen.tsx`) usa uma altura de linha **fixa e
literal**, expressa em dois lugares que precisam concordar manualmente:
`.live-column-channels .live-item { height: 72px }` (`screens.css`) e
`LIVE_ITEM_ROW_HEIGHT = 84` (`LiveScreen.tsx`, 72px do item + 12px do
espaçamento entre itens que a posição absoluta deixou de herdar do `gap`
do flex column).

**Por que a assimetria com a grade de pôsteres é intencional**: `.live-item`
não tem proporção responsiva nenhuma — é uma linha de texto com altura de
conteúdo fixa (um logo de 40px + padding), a mesma em qualquer largura de
tela. Só a **largura** da coluna de canais varia por design (`.live-column-channels`
já era `width: 400px` fixo antes desta feature) — não há uma "largura
fluida" cuja altura dependa dela, como acontece com `.poster-box`
(`aspect-ratio: 2/3`). Medir via `ResizeObserver` aqui adicionaria
complexidade sem resolver problema real.

**Alternativa considerada e rejeitada**: usar `usePosterColumnWidth` (ou um
hook irmão) também para a lista de canais, por uniformidade de padrão entre
as três telas. Rejeitada porque geometria que não varia não precisa de
medição — inventar uma dependência de `ResizeObserver` só por simetria de
código contrariaria a mesma disciplina de "não adicionar abstração além do
que a task exige" que vale para o resto do projeto.

## R0-4. jsdom não mede layout real — como os testes lidam com isso

**Decisão original (Fase 2, `usePosterColumnWidth.test.ts`)**: mockar
`ResizeObserver` globalmente por teste (`vi.stubGlobal`), com um
`FakeResizeObserver` que guarda o callback registrado e o dispara
manualmente com um `contentRect` de largura escolhida pelo teste.

**Achado adicional na Fase 3** (`LiveScreen.test.tsx`, T009/T010),
registrado como R-008 em `plan.md`: o mock de `ResizeObserver` sozinho não
basta para testar um componente que usa `@tanstack/react-virtual`
diretamente (não via `usePosterColumnWidth`). O `getMaxScrollOffset()`
interno do `@tanstack/virtual-core` usa `scrollHeight - clientHeight` do
elemento de scroll para nunca deixar o alvo de um `scrollToIndex` passar do
fim da lista — e jsdom não computa nem `scrollHeight` nem `clientHeight`
(ambos ficam `0` por padrão, sem layout real). Sem mockar as duas
propriedades, **todo** `scrollToIndex` é grampeado em `0`, e a janela
virtual nunca se move nos testes — mesmo com `offsetHeight`/`offsetWidth`
(usados para medir o *tamanho* do viewport) já corretos.

**Mocks necessários, completos** (bloco pronto no topo de
`LiveScreen.test.tsx`, para reaproveitar em `MoviesScreen.test.tsx`/
`SeriesScreen.test.tsx` na Fase 4):

- `HTMLElement.prototype.offsetHeight`/`offsetWidth` — tamanho do viewport
  medido por `observeElementRect` (`@tanstack/virtual-core`).
- `Element.prototype.clientHeight`/`scrollHeight` — usados só por
  `getMaxScrollOffset()`, para não grampear o alvo do scroll em `0`.
- `HTMLElement.prototype.scrollTo` — jsdom não implementa este método
  (`typeof el.scrollTo === 'undefined'`); o polyfill precisa escrever
  `scrollTop` e depois **despachar o evento `scroll` de forma assíncrona**
  (`queueMicrotask`, nunca síncrono) — despachar sincronamente reentra no
  React em plena fase de commit (o `scrollToIndex` que dispara isso roda
  dentro do efeito de `useVirtualFocusSync`), produzindo o aviso "flushSync
  was called from inside a lifecycle method" e um estado que não se
  propaga de verdade.

**Consequência para os testes**: qualquer asserção que dependa do
virtualizador ter se movido (ex.: T010, focar um índice fora da janela
inicial) precisa de `await waitFor(...)`, nunca de uma leitura síncrona
logo após o `press()` — o evento de scroll do polyfill só chega depois que
a pilha de chamadas síncrona da interação termina, do mesmo jeito que um
navegador real nunca entrega um evento de scroll na mesma volta de pilha
da chamada que o provocou.
