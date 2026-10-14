# Comparação reduzida 065 (aceite por amostra reduzida)

Protocolo reduzido a pedido do usuário em 2026-10-09 (D-013): baseline `e0ec6ef` e candidata medidas em sequência, mesma máquina, harness corrigido (T054). 3 amostras por configuração (2 nos ciclos), 4 configurações. Ganho = 1 − mediana candidata / mediana baseline. Diagnóstico pareado, não prova estatística; não substitui o protocolo de 7 amostras da spec.

| Critério | Configuração | Métrica | Baseline | Candidata | Ganho | Meta | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SC-002 | screens-local-100-no-images | movies-after-home conteúdo/foco (ms) | 1211 | 294 | 75.8% | ≥ 30% | PASS |
| SC-003 | screens-local-100-no-images | movies-after-home maior tarefa (ms) | 856 | 86 | 90.0% | ≥ 50% | PASS |
| SC-002 | screens-local-100-no-images | movies-index-cold conteúdo/foco (ms) | 216 | 161 | 25.3% | ≥ 30% | FAIL |
| SC-003 | screens-local-100-no-images | movies-index-cold maior tarefa (ms) | 929 | 124 | 86.7% | ≥ 50% | PASS |
| SC-002 | screens-local-100-no-images | home-cold (ms) | 1500 | 1469 | 2.1% | regressão ≤ 10% | PASS |
| SC-002 | screens-local-100-no-images | series-after-home (ms) | 514 | 203 | 60.5% | regressão ≤ 10% | PASS |
| SC-002 | screens-local-100-no-images | home-return (ms) | 590 | 431 | 27.0% | regressão ≤ 10% | PASS |
| SC-002 | screens-local-100-no-images | movie-category-cold (ms) | 425 | 249 | 41.5% | regressão ≤ 10% | PASS |
| SC-003 | screens-local-100-no-images | seleção Bem avaliados (ms) | 600 | 131 | 78.2% | ≥ 50% | PASS |
| SC-004 | screens-local-100-no-images | soma tarefas longas nos 3 eventos (ms) | 2562 | 0 | 100.0% | ≥ 50% | PASS |
| SC-005 | screens-local-100-no-images | heap retido Home→Filmes→Séries (bytes) | 23605780 | 10957880 | 53.6% | ≥ 20% | PASS |
| SC-002 | screens-tmdb-20-images | movies-after-home conteúdo/foco (ms) | 741 | 458 | 38.1% | ≥ 30% | PASS |
| SC-003 | screens-tmdb-20-images | movies-after-home maior tarefa (ms) | 212 | 98 | 53.8% | ≥ 50% | PASS |
| SC-002 | screens-tmdb-20-images | movies-index-cold conteúdo/foco (ms) | 162 | 144 | 11.2% | ≥ 30% | FAIL |
| SC-003 | screens-tmdb-20-images | movies-index-cold maior tarefa (ms) | 310 | 118 | 61.9% | ≥ 50% | PASS |
| SC-002 | screens-tmdb-20-images | home-cold (ms) | 1806 | 1539 | 14.8% | regressão ≤ 10% | PASS |
| SC-002 | screens-tmdb-20-images | series-after-home (ms) | 530 | 361 | 31.8% | regressão ≤ 10% | PASS |
| SC-002 | screens-tmdb-20-images | home-return (ms) | 1227 | 915 | 25.5% | regressão ≤ 10% | PASS |
| SC-002 | screens-tmdb-20-images | movie-category-cold (ms) | 516 | 293 | 43.2% | regressão ≤ 10% | PASS |
| SC-003 | screens-tmdb-20-images | seleção Bem avaliados (ms) | 129 | 43 | 66.4% | ≥ 50% | PASS |
| SC-004 | screens-tmdb-20-images | soma tarefas longas nos 3 eventos (ms) | 2783 | 253 | 90.9% | ≥ 50% | PASS |
| SC-005 | screens-tmdb-20-images | heap retido Home→Filmes→Séries (bytes) | 38027296 | 38036996 | -0.0% | ≥ 20% | FAIL |
| SC-007 | category-30000 | primeiro recorte (ms) | 276 | 194 | 29.6% | ≥ 30% | FAIL |
| SC-007 | category-30000 | heap temporário (bytes) | 13691384 | 1358360 | 90.1% | ≥ 30% | PASS |
| SC-011 | abertura | sem lista, cold (ms) | 3541 | 705 | 80.1% | ≥ 30% | PASS |
| SC-012 | abertura | JS até a 1ª tela, sem lista, cold (bytes) | 1007752 | 861038 | 14.6% | ≥ 25% | FAIL |
| SC-011 | abertura | sem lista, warm (ms) | 3229 | 348 | 89.2% | ≥ 30% | PASS |
| SC-012 | abertura | JS até a 1ª tela, sem lista, warm (bytes) | 1007752 | 861038 | 14.6% | ≥ 25% | FAIL |
| SC-011 | abertura | com lista, cold (ms) | 3239 | 320 | 90.1% | ≥ 30% | PASS |
| SC-012 | abertura | JS até a 1ª tela, com lista, cold (bytes) | 1007752 | 861038 | 14.6% | ≥ 25% | FAIL |
| SC-011 | abertura | com lista, warm (ms) | 3211 | 292 | 90.9% | ≥ 30% | PASS |
| SC-012 | abertura | JS até a 1ª tela, com lista, warm (bytes) | 1007752 | 861038 | 14.6% | ≥ 25% | FAIL |
| SC-011 | abertura | primeiro comando (ms) | 19 | 15 | 17.2% | regressão ≤ 10% | PASS |
| SC-011 | primeira visita | normal-first-home (ms) | 1784 | 1602 | 10.2% | regressão ≤ 10% | PASS |
| SC-011 | primeira visita | normal-first-movies (ms) | 1587 | 698 | 56.0% | regressão ≤ 10% | PASS |
| SC-011 | primeira visita | normal-first-series (ms) | 847 | 287 | 66.1% | regressão ≤ 10% | PASS |
| SC-011 | primeira visita | normal-first-category (ms) | 575 | 630 | -9.7% | regressão ≤ 10% | PASS |

## Equivalência e limites

- screens-local-100-no-images: cards/ordem/foco/rolagem iguais; ids da seleção iguais; propagação 759/606/699 ms (≤ 2000)
- screens-tmdb-20-images: cards/ordem/foco/rolagem iguais; ids da seleção iguais; propagação 1374/1418/1408 ms (≤ 2000)
- category-30000: leitura limitada sim; fim/busca/ordenação/RETURN iguais à baseline
- cycles-local navegação: baseline estável (73.7 MiB no 10º); candidata estável (10.1 MiB no 10º)
- cycles-local alternância de listas: baseline cresce >10% (74.6 MiB no 10º); candidata estável (11.3 MiB no 10º)
- abertura: baseline = run-002 (7 amostras; medição de abertura não mudou com a correção do harness); candidata = 2 amostras
## Origem das amostras

- `baseline-*`: app de `e0ec6ef` (hash do app idêntico ao da run-002) com o harness corrigido, medido em worktree em 2026-10-09.
- `final-*`: código final da feature (telas e abertura). `candidate-category-30000` e `candidate-cycles-local` foram medidos antes dos últimos ajustes de rotas/Top 10; o código de categoria/janela e de ciclos não mudou depois disso.
- `candidate-*`, `candidate2-*`, `candidate3-*`: rodadas intermediárias que expuseram a regressão do Início com TMDB (passada dupla do tipo) e da primeira visita com o Início sob demanda; corrigidas antes de `final-*`. Mantidas como histórico, não como resultado.

## Metas não atingidas (pendências registradas)

- SC-002 Filmes com índice frio: −25,3% sem TMDB e −11,2% com TMDB (meta −30%); o marco é dominado pela primeira renderização da vitrine.
- SC-005 com TMDB: sem ganho — o cruzamento Top 10/Dica ainda retém o índice compacto do tipo.
- SC-007 tempo do primeiro recorte: −29,6% (meta −30%), dentro do ruído de 3 amostras.
- SC-012: −14,6% (meta −25%) com o Início no pacote inicial (carregá-lo sob demanda atrasava a primeira entrada na lista).
