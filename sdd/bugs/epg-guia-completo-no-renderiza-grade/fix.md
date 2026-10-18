# Bug Fix: EPG guia completo não renderiza a grade

- **Slug**: epg-guia-completo-no-renderiza-grade
- **Corrigido**: 2026-10-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O compressor/descompressor do EPG agora consome a saída do `CompressionStream` em paralelo à escrita. No Chromium, esperar o `close()` antes de iniciar a leitura deixava a operação pendurada; a geração nunca era publicada e o guia permanecia em “Sem programação”.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/epg/epgRepository.ts` | modified | inicia `Response(...).arrayBuffer()`/`.text()` antes de escrever e fechar o stream |

## Tests Added or Updated

- `tv-web/e2e/epg-guia-completo.mjs` — reprodução existente do guia completo, incluindo a grade após a sincronização comprimida.

## Local Verification

- `npm.cmd run test -- --run src/lib/epg/epgRepository.test.ts` → 14 testes passaram.
- `node e2e/run.mjs --only epg-guia-completo --jobs 1` → 1/1 cenário passou.

## Deviations from Assessment

A causa foi confirmada no `CompressionStream`, sem necessidade de alterar `useLiveGuide`, `EpgGuide` ou a janela temporal.

## Follow-ups

- Manter o cenário E2E como gate antes de fechar T049.
