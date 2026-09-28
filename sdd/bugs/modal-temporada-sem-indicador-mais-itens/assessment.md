# Bug Assessment: Modal de temporada — foco some e não há indicador de "mais abaixo"

- **Slug**: modal-temporada-sem-indicador-mais-itens
- **Criado**: 2026-09-28
- **Origem**: entrada `[Bug]` de `.planning/backlog.md` (Fase 2), achada na matriz de QA Tizen §34 da feature `028-limpeza-qa-ds-v14` (Fase 7, T058)
- **Veredito**: valid
- **Severidade**: medium

## Report

> `.vod-season-modal-list` (`SeriesDetailScreen`) cresce com o conteúdo sem
> altura fixa; só o `.modal-panel` (pai) rola quando estoura a tela. Uma lista
> dentro de modal não tem hoje nenhum indicador equivalente ao corte parcial
> da grade/trilha. […] Requer decisão de design; nenhuma série real conhecida
> chega perto de precisar.

## Symptom

A avaliação encontrou um problema **mais grave** que o do report. Numa série
com temporadas demais para caber no modal:

1. **O item focado sai da área visível e fica lá.** O foco do modal é estado
   + classe `tv-focus` (ADR-009), não foco de DOM, então o navegador não rola
   nada sozinho — e `SeriesDetailScreen` não chama `scrollIntoView` em lugar
   nenhum. Descendo com ↓ além da última temporada visível, o destaque some;
   SELECT escolhe uma temporada que a pessoa não está vendo. Isso viola o
   princípio "Foco Visível e Sem Becos Sem Saída" da constitution.
2. **Nenhum indicador de continuação** (o sintoma original): desde a 028, a
   barra nativa do `.modal-panel` está escondida (`.no-scrollbar`), então
   nada sinaliza que existem temporadas abaixo (DS §17).

Esperado (DS §17 "Rails e indicadores de posição", aplicável a qualquer
lista com conteúdo fora da viewport): "foco desloca a rail" e "edge fade
discreto" no lado onde há mais conteúdo.

## Reproduction

1. Série com **13 ou mais temporadas** (fixture ou fonte real).
2. Detalhe da série → abrir o seletor de temporada.
3. Descer com ↓ até passar da última temporada visível.
4. Observar: o destaque sai da tela, o painel não rola, e não há sinal de
   que a lista continua.

**Estimativa de capacidade** (tokens reais de `index.css`): altura útil do
painel = 1080 − 2×76 (`--safe-y`) − 2×32 (padding `--space-4`) ≈ 864px; cada
item ≈ 16+16 de padding + ~30 de linha (`--fs-body` 20px) + 8 de gap ≈ 70px
→ **~12 temporadas cabem**. Séries com mais que isso são comuns em catálogo
IPTV (sitcoms/animações longas, novelas, e as séries sintéticas M3U da
feature 012 agrupadas por `SNNEMM`). O "nenhuma série real chega perto" do
report está otimista. [NEEDS CLARIFICATION: não reproduzido ainda em
navegador real; a fase Fix deve confirmar com uma fixture de ~20 temporadas
via Playwright antes de corrigir.]

## Suspected Code Paths

- `tv-web/src/features/series/SeriesDetailScreen.tsx:595-617` — o modal
  renderiza a `<ul className="vod-season-modal-list">` e move
  `seasonModalFocusIdx` em ↑/↓, sem ref nem rolagem.
- `tv-web/src/styles/vod.css:384-392` — `.vod-season-modal-list` sem
  `max-height`/`overflow`: quem rola é o pai.
- `tv-web/src/styles/components.css:17-25` — `.modal-panel` com
  `max-height` e `overflow: auto` (+ `.no-scrollbar` em `Modal.tsx:63`).
- `tv-web/src/lib/focus/useScrollFocusedIntoView.ts` — hook pronto
  exatamente para este caso (lista não virtualizada com foco por classe),
  hoje **sem nenhum chamador**.
- `tv-web/src/styles/components.css:92-110` — `.rail--fade-start`/
  `.rail--fade-end`: precedente do edge fade (horizontal) no `Rail`, que só
  aparece no lado com mais conteúdo.

## Root Cause Hypothesis

O seletor de temporada virou `Modal` na feature 025 sem herdar a rolagem
dirigida pelo foco que a trilha de categorias ganhou na 009
(`useScrollFocusedIntoView`). Enquanto a barra nativa aparecia, ela ao menos
permitia perceber a rolagem, mas nunca acompanhou o foco. A 028 escondeu a
barra e deixou sem nenhum sinal. Confiança: **high** para a falta de rolagem
(leitura direta do código), **medium** para o limiar de ~12 temporadas
(estimativa por tokens, não medida).

## Proposed Remediation

**Preferida** (DS §17, sem decisão de design nova):
1. A `.vod-season-modal-list` passa a ser o **próprio contêiner rolável**
   (`max-height` derivada dos tokens do modal, `overflow-y: auto`,
   `.no-scrollbar`), para que o fade e a rolagem fiquem na lista e não no
   painel inteiro.
2. O item focado recebe o ref de `useScrollFocusedIntoView(seasonModalFocusIdx)`
   → rola com `block: 'nearest'` a cada passo, e também na abertura (quando o
   foco inicial é a temporada atual, que pode estar abaixo da dobra).
3. **Edge fade vertical** só no lado com mais conteúdo (topo e/ou base),
   espelhando `.rail--fade-start/-end`: classes calculadas a partir de
   `scrollTop`/`scrollHeight`/`clientHeight` após cada rolagem. Fade usa
   `mask-image`, sem cor hardcoded.

**Alternativas**:
- Indicador textual "Temporada 7 de 24" no rodapé do modal — também está no
  §17 ("indicador de posição"), mas é elemento a mais; pode somar-se ao fade
  se a verificação mostrar que o fade é sutil demais na TV.
- Generalizar a solução dentro do `Modal` (qualquer lista longa) — útil para
  os modais futuros de áudio/legenda/qualidade (item 55), mas amplia o escopo
  de um bugfix. Registrar como sugestão para o item 55, não fazer aqui.

**Files likely to change**:
- `tv-web/src/features/series/SeriesDetailScreen.tsx`
- `tv-web/src/styles/vod.css`
- `tv-web/src/features/series/SeriesDetailScreen.test.tsx`
- possivelmente um util pequeno para calcular as bordas com mais conteúdo
  (se não couber inline)

**Tests to add or update**:
- `SeriesDetailScreen.test.tsx`: com muitas temporadas, mover o foco chama
  `scrollIntoView` no item focado (jsdom tem o stub em `setupTests.ts`; usar
  spy).
- Lógica das classes de fade (topo/base/ambos/nenhum) testada com valores de
  `scrollTop`/`scrollHeight`/`clientHeight` simulados.
- Verificação em navegador real (Playwright) com fixture de ~20 temporadas:
  o item focado permanece visível até a última temporada, e o fade aparece
  só onde há conteúdo — jsdom não calcula layout (lição do R-007 da 022).

## Risks & Considerations

- `scrollIntoView` num contêiner dentro do `Stage` escalado: já funciona na
  trilha de categorias (009) — mesmo mecanismo.
- `mask-image` no Chromium 108 da TV: já usado pelo `Rail` (022) com prefixo
  `-webkit-`; mesma receita.
- Não alterar o `Modal` compartilhado (evita efeito em confirmação/exclusão).
- Paridade visual: com poucas temporadas (caso das fixtures atuais) nada muda
  — sem fade, sem rolagem.

## Open Questions

- [NEEDS CLARIFICATION: reprodução em navegador real ainda não executada —
  a fase Fix começa por ela.]
