# Bug Assessment: Continue assistindo sobreposto na 1ª abertura de Filmes e Séries

- **Slug**: `continue-assistindo-sobreposto-na-primeira-abertura`
- **Criado**: 2026-10-05
- **Origem**: texto colado (relato do usuário na TV física)
- **Veredito**: valid
- **Severidade**: medium

## Report

"Nos cards de Continue assistindo de filmes e séries, na primeira abertura eles ficam sobrepostos uns com os outros. Conforme eu vou navegando, parece que eles se ajustam."

## Symptom

Na 1ª abertura da vitrine de Filmes/Séries os cards da fileira "Continue assistindo" aparecem encavalados; ao navegar (rolar a fileira) se acertam. Esperado: cada card começa onde o anterior termina.

## Reproduction

1. Ter histórico em Filmes/Séries (itens em "Continue assistindo") e abrir a vitrine.
2. A fileira nasce com pôster alto (item de 324 px) e vira card largo (item de 424 px) quando os fundos (backdrops) em cache chegam (useCachedBackdrops, assíncrono; continueWide em `VodShowcaseScreen.tsx`).
3. Reproduzido em teste: `Rail` re-renderizado com `itemWidth` 324 → 424 mantém `translateX` de 324 e 648 px com itens de 424 px (sobreposição).

## Suspected Code Paths

- `tv-web/src/components/Rail.tsx` — `useVirtualizer` recebe `estimateSize: () => itemWidth`, que só vale na 1ª medição; mudar `itemWidth` depois não remede e `virtualItem.start` fica com a largura antiga. Uma rolagem dispara a remedição, por isso "se ajusta ao navegar".
- `tv-web/src/features/vod/VodShowcaseScreen.tsx` (`continueWide`) — é quem troca o formato (`poster-xl` → `wide`) depois da 1ª renderização.

## Root Cause Hypothesis

O `Rail` não remede os itens quando a largura do item muda entre renderizações. Confiança: **alta** (reproduzido em teste de componente e de tela).

## Proposed Remediation

**Preferida**: no `Rail`, chamar `virtualizer.measure()` num efeito quando `itemWidth` muda. **Files likely to change**: `tv-web/src/components/Rail.tsx`. **Tests**: `Rail.item-width.test.tsx` e um teste de tela em `VodShowcaseScreen.carrosseis.test.tsx`.

## Risks & Considerations

- `Rail` é componente compartilhado (contrato travado `Rail.biblioteca-componentes.contract.test.tsx`): a mudança só acrescenta um efeito e não altera a interface.

## Open Questions

- Nenhuma.