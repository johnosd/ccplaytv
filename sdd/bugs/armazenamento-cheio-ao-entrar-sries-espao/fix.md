# Bug Fix: Armazenamento cheio em séries

- **Slug**: armazenamento-cheio-ao-entrar-sries-espao
- **Corrigido**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

STO-01 agora informa limite de armazenamento do app, sem afirmar que todo o aparelho está cheio. Nova instalação usa o manifesto atual com `unlimitedstorage`, adição local preexistente e ausente no HEAD.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/i18n/messages/errors.ts` | modified | Texto STO-01 em pt/en/es. Preservadas alterações anteriores. |
| `CCPlayTv/config.xml` | preexisting | Mantida a permissão pública de IndexedDB além da quota padrão. |
| `CCPlayTv/assets/` | generated | Build atual para instalação. |

## Tests Added or Updated

Nenhum teste novo para texto. Reutilizados dois casos de quota de `seriesLoader.test.ts`.

## Local Verification

- `node node_modules/vitest/vitest.mjs run src/lib/catalog/seriesLoader.test.ts -t 'quota' --reporter=dot`: 2 passaram; 14 ignorados pelo filtro. Runner avisou demora ao encerrar servidores Vite após concluir os testes.
- E2E de favoritos, lint dirigido e build registrados em `test.md` após conclusão.

## Deviations from Assessment

Nenhum. Causa exata da quota no pacote anterior não foi medida; a instalação é uma tentativa de recuperação, não evidência de solução física.

### Ajuste de cobertura do texto

Ao revisar os consumidores, foi localizado teste de tela em `tv-web/src/features/series/SeriesDetailScreen.test.tsx` que afirmava literalmente o texto antigo. Atualizadas somente as duas expectativas para a mensagem corrigida; mantidos retry por SELECT e RETURN. Ampliação restrita à cobertura da mudança de texto já prevista, sem mudança na hipótese ou no código de produção.

## Follow-ups

- Reimportar a lista, abrir série e salvar favorito no aparelho. Não desinstalar novamente nem limpar IndexedDB.
- Ponto de commit sugerido após confirmação: `fix: esclarece quota de armazenamento do app na TV`. Sem commit automático.
