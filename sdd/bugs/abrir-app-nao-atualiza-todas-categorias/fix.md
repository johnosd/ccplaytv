# Bug Fix: Abrir o app não atualiza todas as categorias (tela principal sem os recém-adicionados)

- **Slug**: abrir-app-nao-atualiza-todas-categorias
- **Corrigido**: 2026-10-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A renovação que a atualização da lista pede ao abrir o app (toda categoria
mantida com `renewRequestedAt`) agora é **urgente** e não espera mais 2 s sem
tecla para andar. Isso vale para o começo de cada rodada do agendador e
também para o download, o preparo e a gravação da carga por seção. Player
aberto, app oculto e falta de rede continuam pausando (FR-004). A primeira
carga de uma lista nova (tudo frio) continua cedendo à tecla (FR-003). Além
disso, a carga por seção só avisa a tela das categorias que **mudaram**, e
categoria idêntica não relê as vitrines nem o índice. Com isso, a renovação
diária (poucas categorias com novidade) custa poucas releituras.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/catalog/prefetch/activityGate.ts` | modified | `blockReason(now, idleAfterKeyMs, urgent?)`: com `urgent`, tecla não bloqueia. Player/oculto/offline seguem bloqueando. |
| `tv-web/src/lib/catalog/prefetch/prefetchOrder.ts` | modified | `renewalRequested(category)`: renovação pedida por atualização e ainda não feita. |
| `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts` | modified | O laço lê o disco **antes** de consultar o portão. Rodada com alguma `renewalRequested` é urgente, e quem esperou o portão relê o disco. `runSection` recebe `urgent`. Para caber no teto herdado (377), o `try/catch` de `loadCategories` virou `.catch` (mesmo comportamento) e um comentário foi condensado: 376 linhas. |
| `tv-web/src/lib/catalog/prefetch/index.ts` | modified | `isBlocked` da carga por seção usa o portão com `urgent`. |
| `tv-web/src/lib/catalog/sectionLoader.ts` | modified | `onCategory` só quando `renewCategoryItems` → `written: true`. A categoria continua em `written` (resultado) e é carimbada. |
| `tv-web/e2e/carga-listas.mjs` | modified | Cenário 8: a asserção "a entrada não esperou a renovação" exigia o pedido de renovação **depois** do desenho da grade. Com a busca direta do bug `categoria-aberta-nao-mostra-itens-novos`, os dois correm em paralelo (passou por sorte na rodada anterior). Agora exige que a renovação nasça da entrada (`>= t1`). "Não esperou" segue garantido pela grade abrir em < 1,5 s sem aviso falso. |
| `sdd/specs/038-carga-listas-pre-carga/spec.md` | modified | Emenda inline à FR-003 (texto original preservado). |

## Tests Added or Updated

- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.renovacao-urgente.test.ts` (4 casos):
  - renova com tecla a cada segundo;
  - com player aberto espera fechar;
  - carga fria continua cedendo à tecla;
  - `runSection` recebe `urgent: true` na renovação e `false` na carga fria.
- `tv-web/src/lib/catalog/sectionLoader.test.ts::renovação: só avisa a categoria que mudou`.
- Os 3 testes que travam o bug **falham sem o fix** (conferido revertendo as duas linhas e restaurando).

## Local Verification

- Direcionados (pré-carga, `sectionLoader`, `sectionRunner`, catálogo, `categoryLoader`) → 34 arquivos, 180 testes, todos passando. O contrato travado da 038 (`prefetchScheduler.carga-listas.contract.test.ts`) passa sem alteração.
- `npm run test` → 508 arquivos passam e 4 falham (6 testes), todos da feature 066 em andamento (mesmas falhas de antes deste fix).
- `npx tsc -b` → sem erros. `npm run lint` → `architecture: ok`.
- `npm run test:e2e` → 42/43. A falha era o cenário 8 de `carga-listas` (ver acima). Depois do ajuste, `node e2e/run.mjs --only carga-listas` → 1/1.
- Medição do provedor real (Node, sem credenciais no registro): ~28 MB e ~55 mil itens nas três seções, ~6 s de download no PC.

## Deviations from Assessment

- A regra "urgente ignora tecla" ficou no `ActivityGate` (parâmetro
  `urgent`), e não num auxiliar do agendador. Assim o agendador e a carga
  por seção usam a mesma regra, e o agendador cabe no teto de linhas.
- O E2E `carga-listas.mjs` não estava listado no assessment. A asserção
  ajustada é consequência do bug anterior, não deste, e só apareceu agora.

## Follow-ups

- Fase Test na TV: abrir o app depois de mais de 10 min e ficar no Início ou
  navegar. Conferir que os "Adicionados recentemente" de Filmes e Séries
  passam a mostrar os novos sem entrar em categoria, e que a navegação segue
  fluida durante a renovação.
- Ideia (fora deste bug): indicador discreto "Atualizando lista" com contagem
  real enquanto a renovação corre.
