# Bug Verification: Categoria aberta não mostra itens novos na TV mesmo após atualizar a lista

- **Slug**: categoria-aberta-nao-mostra-itens-novos
- **Testado**: 2026-10-09
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Na TV física, com a lista real, entrar numa categoria agora mostra os itens
novos do provedor. Antes eles não apareciam. O usuário observou isso no
aparelho depois da instalação via `tizen-tv`. O sintoma deste bug (a categoria
**aberta** fica com o conteúdo antigo) não se reproduz mais.

O mesmo relato trouxe um problema **diferente**, que este fix não pretendia
cobrir e que segue em bug próprio: as categorias que a pessoa **não** abre (e,
com elas, a tela principal e os "Adicionados recentemente") continuam
dependendo da pré-carga de segundo plano.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução original na TV | `deploy-tv.ps1` (build + instalação em 192.168.0.2, `applist` confirmou) → usuário abriu a lista e entrou numa categoria | pass | Observado pelo usuário: "depois que eu entrei na categoria, apareceu". |
| Teste novo | `npx vitest run src/features/catalog/catalogApi.renovacao-entrada.test.tsx` | pass | 3/3. Falha sem o fix (conferido na fase Fix). |
| Regressão direcionada | catálogo, pré-carga, `categoryLoader`, vod, live, App | pass | 106 arquivos, 563 testes. |
| Suíte inteira | `npm run test` | pass com ressalva | 6 falhas, todas da feature 066, em andamento e não commitada (contratos ainda sem implementação + `fachada.test.ts` acusando `categoryAccess.ts` da 066). Nenhuma toca este fix. |
| Tipos / lint | `npx tsc -b`; `npm run lint` | pass | `architecture: ok`. |
| E2E | `npm run test:e2e` com `npm run dev` | pass | 43/43 em 223 s. |

## Residual Risks

- Fluidez durante a atualização da grade: o usuário não relatou problema, mas
  isso não foi verificado especificamente.
- Categorias não abertas e tela principal: ver bug
  `abrir-app-nao-atualiza-todas-categorias`.

## Recommendation

Fechar este bug. O pedido de ter tudo atualizado ao abrir o app segue no bug
novo.
