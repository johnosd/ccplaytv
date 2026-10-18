# Bug Fix: Fixture antiga do catálogo em blocos acessa `block.items`

- **Slug**: fixture-antiga-catlogo-blocos-acessa-blockitems
- **Corrigido**: 2026-10-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A fixture de downgrade agora decodifica blocos `format: 2` pelo leitor oficial antes de convertê-los para linhas legadas. Registros antigos continuam usando `items` quando presentes.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/e2e/catalogo-em-blocos.mjs` | modified | materializa `readBlockChunks` antes da transação bruta de downgrade |

## Tests Added or Updated

- `tv-web/e2e/catalogo-em-blocos.mjs::downgradeAndSeedUserState` — cobre a migração de cabeçalhos comprimidos para `channels`, preservando ordem e estados do usuário.

## Local Verification

- Comando rodado: `node e2e/run.mjs --only catalogo-em-blocos --jobs 1` → 1/1 cenário passou.
- Checagem manual: o downgrade concluiu sem acesso direto inválido a `block.items` e os cenários de favoritos, progresso e detalhe seguiram no mesmo script.

## Deviations from Assessment

Nenhuma; a correção ficou no arquivo da fixture e usou o leitor oficial previsto.

## Follow-ups

- Manter o cenário 2 no gate E2E da feature 082/039.
