# Bug Test: Tela principal de Filmes lenta na TV (1ª e 2ª visita)

- **Slug**: `tela-principal-filmes-lenta-na-tv`
- **Testado**: 2026-10-05
- **Fix**: ./fix.md
- **Result**: verified

## Reproduction Check

Reproduzido no navegador com a lista real (43 mil filmes, 104 categorias), build de produção, CPU limitada em 4×, mesmo roteiro do assessment (1ª visita a Filmes, voltar ao Início, 2ª visita): o custo da 2ª visita caiu de 356 ms (1ª fileira) / 307 ms (maior tarefa longa) / 285 ms de CPU real para **111 / 60 / 40 ms**; a 1ª visita caiu de ≈307 para ≈239 ms de CPU real. Com chave TMDB: 1ª visita 335 / 196 ms, 2ª 133 / 112 ms.

**Verificado na TV física pelo usuário (2026-10-05)**, depois de reinstalar o app com o fix na Samsung QN50Q60DAGXZD: (1) 1ª visita a Filmes — "a primeira fileira veio rápido e entrou sem travar"; (2) 2ª visita — "ficou fluido"; (3) navegação na vitrine — "está boa". O relato original era "1ª visita lenta, 2ª melhor mas ainda lenta": não reproduz mais. Observação qualitativa do usuário, sem tempos medidos; **não foi testado sem a chave TMDB** (o usuário optou por não testar). Quem viu: o usuário; eu não vi a tela.

## Checks Run

| Checagem | Resultado |
| --- | --- |
| `npx tsc -b` | pass |
| `npm run lint` | pass (exit 0) |
| `npm run test` | pass — 418 arquivos / 2722 testes |
| Testes novos (`catalogApi.vitrine-cache.test.tsx`, `vodShowcase.test.ts`) | pass; 3 dos 5 do cache falham em `HEAD` (verificado) |
| E2E `top10-dica`, `carrosseis-filmes-series`, `vitrine-filmes-series`, `bem-avaliados`, `home-busca-configuracoes`, `vod-pesquisa-ordenacao`, `campos-da-listagem`, `carga-listas`, `favoritos`, `historico-continuar-assistindo` | pass — 10/10 (a 1ª versão do fix falhou 3 deles; corrigido com a invalidação ao entrar em categoria) |
| `check-contract-tests.ps1` 052, 053, 056, 057 | pass — íntegros |
| Medição de abertura (produção, CPU 4×, lista real, sem e com chave) | feita; 2ª visita ≈86% menos CPU, 1ª visita ≈22% |
| TV física (Samsung QN50Q60DAGXZD), com o app reinstalado | pass (qualitativo, visto pelo usuário): 1ª fileira rápida sem travar, 2ª visita fluida, navegação boa. Sem chave TMDB: **not-run** |
| `npm run test:e2e` (suíte inteira, 36 scripts) | **not-run** nesta fase (rodados os 10 da área) |

## Regressions

Nenhuma encontrada pelas checagens acima. Risco conhecido e aceito: o índice vale 60 s em memória; mudanças do catálogo que não passem pela pré-carga, por entrar numa categoria que busca conteúdo, nem pelo fim de uma sincronização podem aparecer até 60 s depois.

## Verdict Rationale

O sintoma foi reproduzido e medido antes e depois no navegador (2ª visita ≈86% menos CPU, 1ª ≈22%), sem regressão nos testes e nos E2E da área, e o usuário confirmou na TV física que a 1ª visita não trava, a 2ª fica fluida e a navegação está boa. É `verified` pela reprodução original (a TV) ter sido reexecutada e o sintoma ter sumido. Ressalvas: a confirmação é qualitativa (sem cronômetro) e a condição sem chave TMDB não foi testada na TV.

## Recommendation

Fechar o bug. Se a lentidão voltar (lista maior, outra TV), reabrir a fase Assess com o tempo medido e seguir os Follow-ups de `fix.md` (tirar "Bem avaliados" do primeiro desenho, memoizar a normalização de título, reduzir a leitura do índice). Nenhuma fase commitou nada.