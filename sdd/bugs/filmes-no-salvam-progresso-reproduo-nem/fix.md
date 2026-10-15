# Bug Fix: Filmes não salvam o progresso nem marcam como assistido

- **Slug**: filmes-no-salvam-progresso-reproduo-nem
- **Corrigido**: 2026-10-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A gravação de progresso/conclusão deixou de falhar em silêncio: erro de escrita vira um código curto seguro (`PRG-W-…`), a gravação é tentada de novo no instante seguinte, e a tela de detalhe só relê o estado do usuário **depois** de a escrita de saída terminar (antes invalidava antes de ela comitar). Se a escrita falhar de vez, a pessoa vê um aviso com o código. A causa de armazenamento na TV não foi observada; esta correção endurece o caminho e o torna diagnosticável.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/player/progressRecorder.ts` | modified | `write`/`clear` capturam a rejeição, guardam o código, restauram `lastWrittenMs`/`clearedThisSession` para reintentar; `takeFailureCode()`; `settleExit()` (espera a escrita com prazo de 1,5 s e avisa). Chamadas embrulhadas em `Promise.resolve` (os testes do player simulam o repositório com `undefined`) |
| `tv-web/src/lib/player/progressSettled.ts` | added | canal em memória "a gravação terminou" (com ou sem código de falha) |
| `tv-web/src/lib/network/storageFailure.ts` | modified | `progressFailureCode()` reaproveita o critério seguro do teste de conexão (nunca mensagem/URL/dado do banco), prefixo `PRG-` |
| `tv-web/src/components/player/usePlayerSession.ts` | modified | o `teardown` usa `settleExit` (antes `onExit('close')` solto); o caminho de conclusão também avisa. +1 linha (591/592) |
| `tv-web/src/components/ProgressSaveNotice.tsx` | added | na raiz: ao terminar a gravação, invalida `user-state`, `user-states`, `history-content`, `series-watched-summary`; com falha, mostra o código por 9 s |
| `tv-web/src/App.tsx` | modified | monta `ProgressSaveNotice` (fica na raiz porque `PlayerLayer`, `MovieDetailScreen` e `SeriesDetailScreen` estão no teto de linhas) |
| `tv-web/src/lib/i18n/messages/player.ts` | modified | `player.progressSaveFailed` em pt/en/es |

## Tests Added or Updated

- `tv-web/src/lib/player/progressRecorder.falhas.test.ts` — 6 casos: falha vira código seguro sem a mensagem da exceção e sem rejeição solta; nova tentativa no tique seguinte e a falha antiga some; a saída ainda grava os 28 min depois de uma falha; conclusão que falha é tentada de novo e o filme acaba marcado como assistido; o aviso "terminou" chega com o estado já no banco; canal ao vivo nunca grava nem avisa.
- `tv-web/src/components/ProgressSaveNotice.test.tsx` — 3 casos: invalida as leituras do estado do usuário; mostra o código tempo suficiente e some; desmontar para de ouvir.
- Contrato da 019 (`progressRecorder.historico.contract.test.ts`) intocado e verde.

## Local Verification

- `npx tsc -b` → limpo. `npm run lint` → ok (146 imports herdados).
- `npx vitest run src/components src/lib/player src/features/movies src/features/series` → 798/798.
- `npm run test` → 3172/3173; a falha é `App.source-access.test.tsx` (instável sob carga, já registrada na 066); isolada, passou 3 de 3.
- `npm run test:e2e -- --only historico-continuar-assistindo,ciclo-vida-player,serie-foco-episodios,e2e,favoritos` → 5/5.
- Instalado na TV física (192.168.0.2) por `deploy-tv.ps1`; validação pelo usuário (ver `test.md`).

## Deviations from Assessment

- O assessment previa mudar `MovieDetailScreen.tsx` (invalidar depois da escrita e mostrar o aviso) e `i18n/messages/detail.ts`. Não mexi nas telas: estão no teto de linhas da catraca e a série compartilha o mesmo player. Troquei por um componente global (`ProgressSaveNotice`) que cobre filme e série de uma vez, com o texto em `messages/player.ts`.
- Não foi feito o E2E "injetar falha de escrita" (coberto por testes unitários da gravação e do aviso).

## Follow-ups

- Se o aviso aparecer na TV com um código, ele aponta a causa real (`QUOTA` = armazenamento cheio, `ABORT`, `TRANSACTION`…) e pede um segundo ciclo.
- Sem o aviso e sem repetição do sintoma, nada a fazer; sem evidência de qual das três mudanças foi a que resolveu (nova tentativa, espera pela escrita ou releitura do estado).
- Não commitado.
