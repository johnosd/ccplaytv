# Bug Verification: a prévia da categoria acompanha a pré-carga

- **Slug**: e2e-campos-da-listagem-nao-acha-fileira-avaliados
- **Testado**: 2026-10-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original (fileira "Avaliados" em esqueleto, E2E `campos-da-listagem` com timeout) **não reproduz mais**: 3/3
execuções isoladas verdes e verde também no lote paralelo (6 execuções com o código original falharam 6/6). Os testes
unitários da 089 e o novo teste de regressão passam. **Não houve rodada na TV**, a pedido do usuário.

## Checks Performed

| Checagem | Resultado |
| --- | --- |
| Reprodução original: `node e2e/campos-da-listagem.mjs` | antes 0/3 (timeout em "Avaliados"); depois **3/3** |
| Regressão: `catalogApi.preview-invalidate.test.tsx` | vermelho antes ("pending" ≠ "ready"), **verde** depois |
| 089: `catalogApi.preview-window.test.tsx` (eventos por deslize, janela parada) | verde, sem alteração |
| `npx vitest run src` | 684 arquivos / 3 734 testes verdes |
| `npx tsc -b`, `npm run lint` (ratchet) | limpos; teto de `catalogApi.ts` só encolheu |
| Lote paralelo de 11 E2E de vitrine/navegação (`--jobs 3`), 4 execuções com o conserto | 3 × 10/10 e 1 × 9/10 (`carrosseis-filmes-series`) |
| Mesmo lote, 6 execuções **sem o conserto** (assinatura desligada = código da 089) | 6 × `campos-da-listagem` falhou; 2 × `carrosseis-filmes-series` também |
| `carrosseis-filmes-series` isolado, 8 execuções com o conserto | 0 falhas |

## Output Excerpts

- Dump do DOM antes do conserto: `section.vod-row[aria-label="Avaliados"] aria-busy="true"` com só `vod-ghost-card--skeleton`.
- Bisseção: `711680e` passa; `f8179b8` (089, "a janela de previews para de se recriar a cada tecla") falha.

## Residual Risks

- **Flake pré-existente, não causado nem corrigido aqui**: `carrosseis-filmes-series` falha às vezes com
  "Maximum update depth exceeded" (pilha virtualizada de 302 categorias; stack no scroll do `@tanstack/react-virtual`
  → `flushSync`), sob carga paralela. Medido **sem** o conserto: 2 em 6 no lote; com o conserto: 1 em 4. Não há
  evidência de piora. Merece bug próprio (R-013 da 089).
- Sem medição na TV: a mudança toca o caminho que a 089 otimizou. Por construção nada roda durante a descida
  (reavaliação só com a janela parada por 400 ms), mas o ganho de eventos por tecla não foi re-medido.
- A prévia de uma categoria "pending" que chega com a janela parada aparece ~400 ms depois da pré-carga (antes da 089
  era imediato).

## Recommendation

Fechar este bug (verified). Abrir um bug separado para o flake "Maximum update depth" do E2E `carrosseis-filmes-series`.
