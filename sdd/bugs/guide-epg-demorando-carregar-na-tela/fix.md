# Bug Fix: Guia EPG demorando para carregar na tela de progresso de importacao

- **Slug**: guide-epg-demorando-carregar-na-tela
- **Corrigido**: 2026-10-16
- **Assessment**: ./assessment.md
- **Status**: partial

## Summary

A investigação confirmou que a escrita de programas no IndexedDB é o custo dominante da sincronização XMLTV; download e parse são minoritários na bancada local. A escrita passou de lotes de 2.000 para 5.000 programas, reduzindo transações sem carregar o XMLTV inteiro em memória e usando o mesmo teto já adotado pela importação do catálogo.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/epg/epgRepository.ts` | modified | `WRITE_BATCH_SIZE` de 2.000 para 5.000; preserva geração nova, descarte de parcial e publicação atômica. |
| `tv-web/src/lib/epg/epgRepository.test.ts` | modified | Trava dois `bulkAdd` para 5.001 programas (5.000 + 1). |
| `tv-web/bench-results/2026-10-16T1959-desktop-win32-intel-core-i7-10700f-cpu-2-2493a13.json` | added | Linha de base XMLTV antes da alteração (10 mil e 100 mil programas). |
| `tv-web/bench-results/2026-10-16T2001-desktop-win32-intel-core-i7-10700f-cpu-2-2493a13.json` | added | Repetição pós-ajuste para 10 mil e 100 mil programas. |
| `tv-web/bench-results/2026-10-16T2003-desktop-win32-intel-core-i7-10700f-cpu-2-2493a13.json` | added | Cenário pós-ajuste com 40.877 programas, da ordem do XMLTV observado. |
| `tv-web/bench-results/2026-10-16T2003-desktop-win32-intel-core-i7-10700f-cpu-2-2493a13-2.json` | added | Segunda amostra do cenário de 40.877 programas. |

## Tests Added or Updated

- `tv-web/src/lib/epg/epgRepository.test.ts::writeEpgPrograms / listProgramsForChannels > amortiza 5.001 programas em dois lotes de escrita` - impede a volta a três lotes de 2.000+ programas.

## Local Verification

- RED: o teste novo falhou como esperado com 3 chamadas de `bulkAdd` antes da alteração.
- GREEN: `npx.cmd vitest run src/lib/epg/epgRepository.test.ts` -> 14 testes passando.
- Regressão focal: `npx.cmd vitest run src/lib/epg/epgRepository.test.ts src/lib/epg/epgSync.extra.test.ts src/lib/epg/epgSync.epg-dados-agora.contract.test.ts src/features/import/importApi.epg.test.tsx src/features/import/ImportProgressScreen.secoes.test.tsx src/features/import/importSections.test.ts` -> 42 testes passando.
- E2E focal: `node e2e/epg-dados-agora.mjs` -> todas as verificações passaram, incluindo Worker, uma sincronização após a importação, foco e ausência de URL de EPG no console.
- Qualidade: `npm.cmd run lint` -> exit 0, com avisos herdados fora do escopo; `npx.cmd tsc -b` -> passou; `npm.cmd run build` -> passou, incluindo `check-no-demux-in-build`.
- Bancada local Chromium, XMLTV sintético: para 100.000 programas, `storeMs` foi 6.010,0 -> 5.872,8 ms (-2,3%), `totalMs` 6.581,5 -> 6.428,1 ms (-2,3%) e `realMs` 7.056,2 -> 6.351,7 ms (-10,0%). Há apenas uma amostra antes e uma depois; o ganho não é aceito como definitivo.
- Duas amostras pós-ajuste de 40.877 programas deram 2.523,2 e 2.512,6 ms no caminho real; a escrita consumiu 2.344,1 e 2.355,8 ms (cerca de 91% do total). Elas provam o gargalo no IndexedDB, mas não comparam o lote anterior nesse tamanho.

## Deviations from Assessment

- O roteiro E2E novo com atraso controlado não foi criado. A bancada existente já isola `fetch`, `parse` e `store`, usa fonte local sem credenciais e permitiu identificar o gargalo com menos superfície de teste. A validação da tela durante um EPG remoto lento permanece para a fase Test na TV física.

## Follow-ups

- Medir na TV Samsung a mesma fonte que relatou o atraso, anotando apenas duração, tamanho aproximado do XMLTV e tipo de fonte; não registrar URL nem credenciais.
- Só aceitar ganho de performance para TV após comparar ao menos três amostras antes/depois no aparelho.
- Se o tempo ainda for inadequado na TV, investigar o custo dos índices de `epgPrograms` e uma estratégia de persistência por blocos; isso muda modelo/esquema e não é seguro tratar como ajuste pontual.
