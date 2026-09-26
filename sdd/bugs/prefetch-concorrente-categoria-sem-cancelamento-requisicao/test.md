# Bug Verification: Prefetch de categoria sem cancelamento de requisição HTTP em voo

- **Slug**: prefetch-concorrente-categoria-sem-cancelamento-requisicao
- **Testado**: 2026-09-25
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O mecanismo de cancelamento está implementado e comprovado por teste
automatizado (focar outra categoria aborta de fato o `AbortSignal` da
busca anterior; a categoria efetivamente entrada nunca é abortada por um
prefetch de outra). Suite completa, lint e build ficam limpos.
**Reproduzido pós-fix na TV física** (mesma fonte real, mesma categoria
"Telecine" que originou o relato, mesma rede doméstica): o usuário
confirmou diretamente que a categoria carregou rápido (sem a espera de
>1 minuto observada antes do fix) e que entrar no canal também carregou
normalmente. Sintoma original não reproduz mais — `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) na TV física | Deploy da correção via `deploy-tv.ps1` (skill `tizen-tv`), usuário reentrou na categoria "Canais \| Telecine" da mesma fonte real e tocou um canal | pass | Confirmado diretamente pelo usuário: "carregou rápido as listas de canal, cliquei no canal e carregou, apareceu o canal" — sem a espera de >1 minuto relatada antes do fix |
| Reprodução (pós-fix) — mecanismo de cancelamento em teste unitário | `npm run test -- --run src/features/catalog/catalogApi.test.tsx` | pass | 30/30 — inclui os 2 testes novos que provam `AbortSignal.aborted` vira `true` ao focar outra categoria, e `false` quando a categoria abortada seria a efetivamente entrada |
| Testes novos/atualizados | `npm run test -- --run src/features/catalog/catalogApi.test.tsx` | pass | ver `fix.md` → Tests Added or Updated |
| Suite de regressão (completa) | `npm run test -- --run` | pass (680/681) | 1 falha em `LiveScreen.favorites.test.tsx:279`, arquivo não tocado por este fix; confirmada como flakiness pré-existente de timing sob paralelismo — `npm run test -- --run src/features/live/LiveScreen.favorites.test.tsx` isolado → 13/13 pass |
| Lint | `npm run lint` | pass | Só warnings pré-existentes, nenhum novo |
| Build | `npm run build` | pass | `tsc -b && vite build` limpo |

## Output Excerpts

```
> vitest run src/features/catalog/catalogApi.test.tsx
 Test Files  1 passed (1)
      Tests  30 passed (30)
```

```
> vitest run (suite completa)
 Test Files  1 failed | 54 passed (55)
      Tests  1 failed | 680 passed (681)
```

```
> vitest run src/features/live/LiveScreen.favorites.test.tsx (isolado)
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

```
> vite build
✓ 123 modules transformed.
✓ built in 683ms
```

## Residual Risks

- O sintoma original (>1 minuto numa categoria pequena) foi observado só
  na TV física, contra latência de rede real e um provedor real — o teste
  automatizado prova que a MECÂNICA de cancelamento funciona como
  desenhado (menos requisições concorrentes disparadas), mas não mede
  ganho de tempo real em produção.
- `probeFailureKind` (usado quando um `fetch` real falha, não quando é
  abortado) segue sem timeout próprio — fora do escopo deste bug, mas é
  o mesmo tipo de risco (requisição sem teto de espera) que motivou este
  achado; pode valer um bug/ADR próprio se voltar a aparecer.
- A exceção de `enteredCategoryId` (nunca abortar a categoria já entrada)
  depende de `categoryLoader.ts`'s `dedup`/`inFlight` continuar
  compartilhando a mesma promise entre prefetch e entrada real — se essa
  função for refatorada no futuro sem essa garantia em mente, a exceção
  pode parar de fazer sentido silenciosamente. Vale um comentário-âncora
  (já presente em `catalogApi.ts`) ligando as duas pontas.

## Recommendation

**Fechar como `verified`.** O fix está aplicado, testado automaticamente
de ponta a ponta na lógica de cancelamento, sem regressão (build/lint/
suite completos limpos, à parte de uma flakiness pré-existente e não
relacionada), e confirmado na TV física contra a mesma fonte real e a
mesma categoria que originou o relato. Nenhuma ação adicional pendente
para este bug.
