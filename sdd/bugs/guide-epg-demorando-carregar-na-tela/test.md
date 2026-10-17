# Bug Verification: Guia EPG demorando para carregar na tela de progresso de importação

- **Slug**: guide-epg-demorando-carregar-na-tela
- **Testado**: 2026-10-16
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O ajuste de escrita em lotes preserva a sincronização automática, o Worker, foco e a proteção de URLs de EPG nos testes locais. A reprodução original de desempenho em TV Samsung com a fonte relatada foi dispensada por decisão explícita do solicitante; portanto, o resultado não é `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução original (pós-fix) | TV Samsung com a fonte que relatou o atraso | skipped | Dispensada explicitamente pelo solicitante; não foi medida na TV nem com o XMLTV/servidor real. |
| Evidência de desempenho equivalente | Bancada XMLTV local, artefatos listados em `fix.md` | pass | Para 100.000 programas, `storeMs` caiu 2,3% em uma comparação antes/depois; duas amostras pós-ajuste de 40.877 programas levaram 2,52 s e 2,51 s no caminho real. É evidência local, não aceite de TV. |
| Testes novos/atualizados | `npx.cmd vitest run src/lib/epg/epgRepository.test.ts src/lib/epg/epgSync.extra.test.ts src/lib/epg/epgSync.epg-dados-agora.contract.test.ts src/features/import/importApi.epg.test.tsx src/features/import/ImportProgressScreen.secoes.test.tsx src/features/import/importSections.test.ts` | pass | 6 arquivos, 42 testes passando. Inclui o contrato dos lotes de 5.000 programas e a lista disponível durante EPG pendente. |
| Fluxo E2E de regressão | `node e2e/epg-dados-agora.mjs` | pass | Importação inicia exatamente uma sincronização de EPG em Worker; foco, dados "Agora" e ausência de URL de EPG no console passaram. |
| Lint / type-check / build | `npm.cmd run lint` e `npm.cmd run build` | pass | Lint terminou com exit 0 e avisos herdados fora deste escopo; o build executou `tsc -b`, gerou `epgWorker.js` e passou `check-no-demux-in-build`. |

## Output Excerpts

```text
Test Files  6 passed (6)
Tests       42 passed (42)

Todas as verificações passaram.

check-no-demux-in-build: ok — nenhum marcador da biblioteca de demux no build.
```

## Residual Risks

- O Chromium desktop, IndexedDB local e XMLTV sintético não representam a CPU, a implementação IndexedDB, a rede nem a memória da TV Samsung.
- A comparação de 100.000 programas possui uma amostra antes/depois; ela indica uma melhora pequena, mas não estabelece um ganho definitivo.
- Se o XMLTV real continuar lento, o próximo gargalo provável são os índices de `epgPrograms`; persistência por blocos ou mudança de modelo exigem investigação separada e não devem ser inferidas como seguras por este ajuste.

## Recommendation

Aceitar com ressalva, conforme decisão do solicitante. A alteração é coberta por testes focados, E2E e build e reduz a quantidade de transações de escrita, mas o bug permanece `partial`: não há confirmação de tempo percebido ou de ganho de desempenho na TV Samsung. Reabrir o Assess se houver novo relato com a mesma fonte ou se a demora continuar materialmente perceptível.
