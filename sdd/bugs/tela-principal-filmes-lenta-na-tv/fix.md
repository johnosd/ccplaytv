# Bug Fix: Tela principal de Filmes lenta na TV (1ª e 2ª visita)

- **Slug**: `tela-principal-filmes-lenta-na-tv`
- **Corrigido**: 2026-10-05
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A vitrine de Filmes deixou de refazer, a cada montagem, o trabalho de ≈43 mil registros: "Adicionados recentemente" agora escolhe as 12 mais novas **antes** de mapear (em vez de mapear tudo), o resultado dos `select` fica guardado pela identidade do índice, e o índice de busca vale 60 s em memória em vez de ser relido do IndexedDB em toda montagem (a releitura passou a ser disparada pelos eventos que realmente mudam o catálogo). Nenhuma fileira, categoria ou comportamento visível foi removido.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/vod/vodShowcase.ts` | modified | `recentlyAddedBy<T>(items, addedAt, limit)` genérico; `recentlyAdded` passa a chamá-lo (mesmo resultado). |
| `tv-web/src/features/catalog/catalogApi.ts` | modified | `useRecentlyAdded` escolhe as 12 sobre `entry.record.addedAt` e só então mapeia; `select` estável (`useCallback`). `memoPerIndex` (WeakMap por índice + chave) guarda os resultados de `useRecentlyAdded` e `useTopRated`. Os dois hooks trocam `staleTime: 0` + `refetchOnMount: 'always'` por `staleTime` de 60 s (`SHOWCASE_INDEX_STALE_MS`). `useCategoryContent` invalida `['catalog-search-index', fonte]` quando a entrada na categoria realmente busca conteúdo (`outcome === 'fetched'`). |
| `tv-web/src/App.tsx` | modified | Fim de sincronização (`onSourceSyncFinished` e a reconciliação do auto-refresh) também invalida `['catalog-search-index']`. |
| `tv-web/src/features/vod/vodShowcase.test.ts` | modified | +3 testes de `recentlyAddedBy`. |
| `tv-web/src/features/catalog/catalogApi.vitrine-cache.test.tsx` | added | 5 testes do cache da vitrine. |

## Tests Added or Updated

- `vodShowcase.test.ts::recentlyAddedBy — mesma regra…` (3) — mesma escolha que `recentlyAdded` (ordem, empate, item sem data), lê cada data uma vez e devolve as próprias entradas, aceita qualquer iterável.
- `catalogApi.vitrine-cache.test.tsx` (5) — 2ª montagem de `useRecentlyAdded` e de `useTopRated` não relê o índice e devolve a mesma lista; render repetido mantém a referência; categoria nova (índice invalidado) atualiza as duas fileiras com **uma** releitura; entrar numa categoria que busca conteúdo novo invalida o índice e entrar sem conteúdo novo não. **Verificado vermelho no código antigo** (3 dos 5 falham em `HEAD`; os outros 2 passam nos dois, ver Deviations).

## Local Verification

- `npx tsc -b` → exit 0; `npm run lint` → exit 0.
- `npm run test` → 418 arquivos / 2722 testes verdes.
- `node e2e/run.mjs --only top10-dica,carrosseis-filmes-series,vitrine-filmes-series,bem-avaliados,home-busca-configuracoes,vod-pesquisa-ordenacao,campos-da-listagem,carga-listas,favoritos,historico-continuar-assistindo --jobs 3` → 10/10.
- `check-contract-tests.ps1` de 052, 053, 056 e 057 → íntegros.
- Medição no **build de produção** (`dist`), lista real, CPU limitada em 4×, só os números:

| Condição | | antes | depois |
| --- | --- | --- | --- |
| sem chave | 1ª visita — maior tarefa longa / soma / CPU real | 254 / 922 / 307 ms | 252 / 671 / 239 ms |
| sem chave | 2ª visita — 1ª fileira / maior tarefa / soma / CPU real | 356 / 307 / 888 / 285 ms | **111 / 60 / 60 / 40 ms** |
| com chave | 1ª visita — 1ª fileira / maior tarefa / soma | — | 335 / 196 / 256 ms |
| com chave | 2ª visita — 1ª fileira / maior tarefa / soma | — | 133 / 112 / 112 ms |

(tempos de relógio com a CPU a 4×; "CPU real" = o perfil dividido por 4. "antes" é o perfil do assessment, mesma lista e mesmo roteiro.)

## Deviations from Assessment

- **`App.tsx` entrou na lista de arquivos**: o assessment previa só `vodShowcase.ts` e `catalogApi.ts`. Ao verificar a pergunta aberta (a conclusão da sincronização invalida o índice?) a resposta foi não; sem isso o `staleTime` de 60 s poderia mostrar o catálogo anterior depois de uma ressincronização. A mesma lacuna existia para **entrar numa categoria nova**: o E2E (`bem-avaliados`, `top10-dica`, `vitrine-filmes-series`) falhou na primeira versão do fix porque antes era o `refetchOnMount: 'always'` que fazia a vitrine descobrir a categoria recém-aberta; por isso `useCategoryContent` também passou a invalidar o índice.
- **Hipótese não confirmada**: o assessment e a conversa levantaram que o `select` inline do react-query recalcularia a cada render (e portanto a cada tecla). O teste "render repetido mantém a referência" passa **também no código antigo**, então isso **não** foi provado e não é afirmado; o que está provado é o recálculo e a releitura a cada **montagem**.
- **Categorias**: nenhuma foi removida — o perfil não as aponta como custo e são a principal descoberta de conteúdo da tela.
- **1ª visita melhorou pouco** (CPU real ≈307 → ≈239 ms): o que resta é a leitura do tipo inteiro do IndexedDB (≈50 ms reais) e a seleção de "Bem avaliados" (normalização de títulos) sobre o índice recém-lido. Não foi tratada aqui (ver Follow-ups).

## Follow-ups

- Reinstalar na TV e cronometrar Filmes (1ª e 2ª visita), com e sem chave TMDB — é o único veredito do ganho real.
- Se a 1ª visita ainda pesar na TV: tirar "Bem avaliados" do primeiro desenho (cálculo depois do desenho e em fatias, como a 057 fez com o Top 10/Dica), memoizar a normalização de título por registro e/ou reduzir a leitura do índice (ler só os campos necessários).
- `SHOWCASE_INDEX_STALE_MS` (60 s) pode subir ou virar `Infinity` se todos os pontos de escrita do catálogo passarem a invalidar o índice.
