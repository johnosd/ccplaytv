# Bug Fix: Falha ao salvar favorito de canal segurando OK

- **Slug**: falha-ao-salvar-favorito-canal-segurando
- **Corrigido**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Favoritar dispensa a invalidação do cache de séries assistidas. Falhas desse cache não rejeitam mais um favorito já persistido; falhas na gravação continuam sendo propagadas.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/catalog/userStateRepository.ts` | modified | `upsert` mantém invalidação por padrão; `toggleFavorite` a dispensa. |
| `tv-web/src/features/live/LiveScreen.favorites.test.tsx` | modified | Regressão do gesto real com cache de séries indisponível. |

## Tests Added or Updated

- `segurar OK salva favorito mesmo com cache de séries indisponível`: antes do patch falhou e mostrou exatamente “Não foi possível salvar o favorito.”; depois passou com persistência e estrela confirmadas.

## Local Verification

- `node node_modules/vitest/vitest.mjs run src/features/live/LiveScreen.favorites.test.tsx -t 'cache de séries indisponível|OK curto no canal|segurar OK favorita|segurar além do limiar' --reporter=dot`: 4 passaram; 16 ignorados pelo filtro.
- Nenhuma suíte completa executada, a pedido do usuário.

## Deviations from Assessment

Nenhum. Relato adicional de armazenamento em séries será avaliado separadamente; a exceção específica da TV não foi capturada.

## Follow-ups

- Confirmar favoritos no aparelho após instalação. Ponto de commit sugerido após confirmação: `fix: desacopla favoritos do cache de séries assistidas`. Sem commit automático.
