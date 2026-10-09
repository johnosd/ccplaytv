# Bug Fix: Categoria aberta não mostra itens novos na TV mesmo após atualizar a lista

- **Slug**: categoria-aberta-nao-mostra-itens-novos
- **Corrigido**: 2026-10-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Entrar numa categoria com renovação pendente (marcada pela atualização de
estrutura que roda ao abrir a lista) continua abrindo na hora com o que há no
disco. A diferença é que agora a categoria também é renovada **imediatamente**
por uma busca só dela, por fora da fila da pré-carga. Ao terminar, a grade é
relida com os itens novos e sem os removidos. Antes, a renovação ficava na fila,
que na TV pode passar minutos presa na carga da seção inteira, pausada a cada
tecla.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/catalog/prefetch/index.ts` | modified | Nova `renewCategoryNow(sourceId, category)`: `ensureCategory` com `renew: true` (só a categoria, `dedup` por id), duas tentativas só em caso de cancelamento, e `onCategoryDone` (invalidação da tela, contagens e índices) apenas quando `fetched`, para nunca entrar em laço. |
| `tv-web/src/features/catalog/catalogApi.ts` | modified | `ensureCategoryForEntry`: no `serveStale` da entrada real (`!signal`), chama `renewCategoryNow`. A pré-busca por foco (com `signal`) fica só com `prioritize`. O arquivo continua com 2190 linhas (teto 2190): o comentário foi condensado. |

## Tests Added or Updated

- `tv-web/src/features/catalog/catalogApi.renovacao-entrada.test.tsx` (3 casos, agendador nunca iniciado):
  - entrada com renovação pendente abre com o disco (`fresh`) e, sem a fila andar, passa a mostrar `Filme novo` e não `Removido pelo provedor`, com uma busca `get_vod_streams&category_id=10`. **Falha sem o fix** (conferido trocando a linha por um comentário e restaurando);
  - pré-busca por foco com sinal não dispara a busca direta;
  - categoria fresca sem renovação pendente não toca a rede.

## Local Verification

- `npx vitest run src/features/catalog/catalogApi.renovacao-entrada.test.tsx` → 3/3.
- `npx vitest run src/features/catalog src/lib/catalog/prefetch src/lib/catalog/categoryLoader src/features/vod src/features/live src/App` → 106 arquivos, 563 testes, todos passando.
- `npm run test` (suíte inteira) → 507 arquivos passam e 4 falham (6 testes). As falhas são todas da feature 066 (controle parental), em andamento e ainda não commitada: os contratos `*.categorias-controle-parental.contract.test.*`, ainda sem implementação, e `repository/fachada.test.ts`, que acusa `lib/catalog/categoryAccess.ts → ./repository/categories`, arquivo novo da 066. Nenhuma toca os arquivos deste fix.
- `npx tsc -b` → sem erros. `npm run lint` → `architecture: ok` (só avisos pré-existentes).
- `npm run test:e2e` (com `npm run dev`) → 43/43 em 223 s.
- Não executado: TV física (vai na fase Test, via `tizen-tv`).

## Deviations from Assessment

- `renewCategoryNow` recebe a categoria (`CatalogCategory`) em vez do id e chama
  `ensureCategory` direto em vez de `runCategory`. Assim não relê a lista de
  categorias da fonte, e só o resultado `fetched` invalida a tela, o que evita
  laço se a categoria tiver saído da estrutura.
- `prefetchApi.ts` não mudou (o reexport não foi necessário).

## Follow-ups

- Fase Test: instalar na TV (`tizen-tv`), abrir a lista depois de mais de
  10 min, entrar numa categoria que o provedor alterou e confirmar que os itens
  novos aparecem em segundos, com a navegação fluida.
