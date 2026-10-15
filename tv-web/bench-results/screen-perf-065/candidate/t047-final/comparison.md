# Comparação 065

Ganho = 1 − mediana candidata / mediana baseline. MAD = mediana do desvio absoluto.

| Critério | Configuração/métrica | Baseline | Candidata | Ganho | Resultado |
| --- | --- | --- | --- | --- | --- |
| SC-001 | screens-local-20-images/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-002 | screens-local-20-images/movies-after-home:conteúdo/foco | 774.4000000059605 | 654.5999999940395 | 15.5% | FAIL |
| SC-003 | screens-local-20-images/movies-after-home:maior tarefa | 286 | 106 | 62.9% | PASS |
| SC-002 | screens-local-20-images/movies-index-cold:conteúdo/foco | 347.7999999821186 | 226.5 | 34.9% | PASS |
| SC-003 | screens-local-20-images/movies-index-cold:maior tarefa | 327 | 179 | 45.3% | FAIL |
| SC-002 | screens-local-20-images/home-cold:regressão | 1848.5999999940395 | 1365.9000000059605 | 26.1% | PASS |
| SC-002 | screens-local-20-images/series-after-home:regressão | 490.80000001192093 | 299.59999999403954 | 39.0% | PASS |
| SC-002 | screens-local-20-images/home-return:regressão | 756.1000000238419 | 495.90000000596046 | 34.4% | PASS |
| SC-002 | screens-local-20-images/movie-category-cold:regressão | 566.6999999880791 | 591.1999999880791 | -4.3% | PASS |
| SC-003 | screens-local-20-images/seleção pura | 148.7999999821186 | 104 | 30.1% | FAIL |
| SC-001 | screens-local-20-images/ids/contador da seleção | — | — | — | PASS |
| SC-004 | screens-local-20-images/soma tarefas nos eventos reais | 1175 | 710 | 39.6% | FAIL |
| SC-004 | screens-local-20-images/p95 direção (proxy de dois quadros) | 352.40000000596046 | 74.10000002384186 | 79.0% | PASS |
| SC-004 | screens-local-20-images/escopo/propagação | — | — | — | PASS |
| SC-005 | screens-local-20-images/heap retido | 29294040 | 29231304 | 0.2% | FAIL |
| SC-005 | screens-local-20-images/Worker registrado separadamente | — | — | — | PASS |
| SC-009 | screens-local-20-images/chamadas/universo de páginas | — | — | — | PASS |
| SC-001 | screens-local-100-images/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-002 | screens-local-100-images/movies-after-home:conteúdo/foco | 1560.0999999940395 | 1394.5 | 10.6% | FAIL |
| SC-003 | screens-local-100-images/movies-after-home:maior tarefa | 1071 | 1038 | 3.1% | FAIL |
| SC-002 | screens-local-100-images/movies-index-cold:conteúdo/foco | 345.5 | 225.7999999821186 | 34.6% | PASS |
| SC-003 | screens-local-100-images/movies-index-cold:maior tarefa | 1151 | 1177 | -2.3% | FAIL |
| SC-002 | screens-local-100-images/home-cold:regressão | 1766.699999988079 | 1312 | 25.7% | PASS |
| SC-002 | screens-local-100-images/series-after-home:regressão | 648.1999999880791 | 478.5 | 26.2% | PASS |
| SC-002 | screens-local-100-images/home-return:regressão | 796 | 495.89999997615814 | 37.7% | PASS |
| SC-002 | screens-local-100-images/movie-category-cold:regressão | 515.2000000178814 | 556.5 | -8.0% | PASS |
| SC-003 | screens-local-100-images/seleção pura | 721.5999999940395 | 1076.9000000059605 | -49.2% | FAIL |
| SC-001 | screens-local-100-images/ids/contador da seleção | — | — | — | PASS |
| SC-004 | screens-local-100-images/soma tarefas nos eventos reais | 3513 | 2495 | 29.0% | FAIL |
| SC-004 | screens-local-100-images/p95 direção (proxy de dois quadros) | 1021.2999999821186 | 81.39999997615814 | 92.0% | PASS |
| SC-004 | screens-local-100-images/escopo/propagação | — | — | — | FAIL |
| SC-005 | screens-local-100-images/heap retido | 29260180 | 29354088 | -0.3% | FAIL |
| SC-005 | screens-local-100-images/Worker registrado separadamente | — | — | — | PASS |
| SC-009 | screens-local-100-images/chamadas/universo de páginas | — | — | — | PASS |
| SC-011 | screens-local-100-images/primeiro comando normal | 18.599999994039536 | 14.599999994039536 | 21.5% | PASS |
| SC-011 | screens-local-100-images/normal-first-home | 1783.9000000059605 | 1341.5 | 24.8% | PASS |
| SC-001 | screens-local-100-images/normal-first-home | — | — | — | PASS |
| SC-011 | screens-local-100-images/normal-first-movies | 1586.8999999761581 | 1885.4000000059605 | -18.8% | FAIL |
| SC-001 | screens-local-100-images/normal-first-movies | — | — | — | PASS |
| SC-011 | screens-local-100-images/normal-first-series | 846.7999999821186 | 512.2999999821186 | 39.5% | PASS |
| SC-001 | screens-local-100-images/normal-first-series | — | — | — | PASS |
| SC-011 | screens-local-100-images/normal-first-category | 574.8000000119209 | 568.6999999880791 | 1.1% | PASS |
| SC-001 | screens-local-100-images/normal-first-category | — | — | — | PASS |
| SC-011 | screens-local-100-images/abertura:false:cold | 3541.2999999821186 | 768.7000000178814 | 78.3% | PASS |
| SC-012 | screens-local-100-images/JS:false:cold | 1007752 | 1041543 | -3.4% | FAIL |
| SC-011 | screens-local-100-images/abertura:false:warm | 3229.199999988079 | 344.69999998807907 | 89.3% | PASS |
| SC-012 | screens-local-100-images/JS:false:warm | 1007752 | 1041543 | -3.4% | FAIL |
| SC-011 | screens-local-100-images/abertura:true:cold | 3238.5 | 370.59999999403954 | 88.6% | PASS |
| SC-012 | screens-local-100-images/JS:true:cold | 1007752 | 1006856 | 0.1% | FAIL |
| SC-011 | screens-local-100-images/abertura:true:warm | 3210.5999999940395 | 331.40000000596046 | 89.7% | PASS |
| SC-012 | screens-local-100-images/JS:true:warm | 1007752 | 1041543 | -3.4% | FAIL |
| SC-001 | screens-tmdb-20-images/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-002 | screens-tmdb-20-images/movies-after-home:conteúdo/foco | 928.7000000178814 | 792.9000000059605 | 14.6% | FAIL |
| SC-003 | screens-tmdb-20-images/movies-after-home:maior tarefa | 262 | 118 | 55.0% | PASS |
| SC-002 | screens-tmdb-20-images/movies-index-cold:conteúdo/foco | 211.40000000596046 | 159.09999999403954 | 24.7% | FAIL |
| SC-003 | screens-tmdb-20-images/movies-index-cold:maior tarefa | 332 | 209 | 37.0% | FAIL |
| SC-002 | screens-tmdb-20-images/home-cold:regressão | 2105.0999999940395 | 1499.300000011921 | 28.8% | PASS |
| SC-002 | screens-tmdb-20-images/series-after-home:regressão | 643.7999999821186 | 448.69999998807907 | 30.3% | PASS |
| SC-002 | screens-tmdb-20-images/home-return:regressão | 1403.5 | 1032.300000011921 | 26.4% | PASS |
| SC-002 | screens-tmdb-20-images/movie-category-cold:regressão | 644.9000000059605 | 617 | 4.3% | PASS |
| SC-003 | screens-tmdb-20-images/seleção pura | 154.40000000596046 | 89.90000000596046 | 41.8% | FAIL |
| SC-001 | screens-tmdb-20-images/ids/contador da seleção | — | — | — | PASS |
| SC-004 | screens-tmdb-20-images/soma tarefas nos eventos reais | 3237 | 1802 | 44.3% | FAIL |
| SC-004 | screens-tmdb-20-images/p95 direção (proxy de dois quadros) | 366.69999998807907 | 209.7999999821186 | 42.8% | PASS |
| SC-004 | screens-tmdb-20-images/escopo/propagação | — | — | — | PASS |
| SC-005 | screens-tmdb-20-images/heap retido | 37986136 | 38060940 | -0.2% | FAIL |
| SC-005 | screens-tmdb-20-images/Worker registrado separadamente | — | — | — | PASS |
| SC-009 | screens-tmdb-20-images/chamadas/universo de páginas | — | — | — | PASS |
| SC-001 | screens-tmdb-100-images/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-002 | screens-tmdb-100-images/movies-after-home:conteúdo/foco | 1442 | 1685 | -16.9% | FAIL |
| SC-003 | screens-tmdb-100-images/movies-after-home:maior tarefa | 789 | 1118 | -41.7% | FAIL |
| SC-002 | screens-tmdb-100-images/movies-index-cold:conteúdo/foco | 205.2999999821186 | 164.40000000596046 | 19.9% | FAIL |
| SC-003 | screens-tmdb-100-images/movies-index-cold:maior tarefa | 842 | 1194 | -41.8% | FAIL |
| SC-002 | screens-tmdb-100-images/home-cold:regressão | 2078.699999988079 | 1497.7999999821186 | 27.9% | PASS |
| SC-002 | screens-tmdb-100-images/series-after-home:regressão | 809.5 | 620.5999999940395 | 23.3% | PASS |
| SC-002 | screens-tmdb-100-images/home-return:regressão | 1419.300000011921 | 1003 | 29.3% | PASS |
| SC-002 | screens-tmdb-100-images/movie-category-cold:regressão | 639 | 649.3999999761581 | -1.6% | PASS |
| SC-003 | screens-tmdb-100-images/seleção pura | 670.0999999940395 | 1033.7999999821186 | -54.3% | FAIL |
| SC-001 | screens-tmdb-100-images/ids/contador da seleção | — | — | — | PASS |
| SC-004 | screens-tmdb-100-images/soma tarefas nos eventos reais | 4959 | 4352 | 12.2% | FAIL |
| SC-004 | screens-tmdb-100-images/p95 direção (proxy de dois quadros) | 1006.2000000178814 | 1334 | -32.6% | FAIL |
| SC-004 | screens-tmdb-100-images/escopo/propagação | — | — | — | FAIL |
| SC-005 | screens-tmdb-100-images/heap retido | 37982524 | 38064668 | -0.2% | FAIL |
| SC-005 | screens-tmdb-100-images/Worker registrado separadamente | — | — | — | PASS |
| SC-009 | screens-tmdb-100-images/chamadas/universo de páginas | — | — | — | PASS |
| SC-001 | screens-local-100-no-images/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-002 | screens-local-100-no-images/movies-after-home:conteúdo/foco | 1458.0999999940395 | 2053.0999999940395 | -40.8% | FAIL |
| SC-003 | screens-local-100-no-images/movies-after-home:maior tarefa | 1061 | 1551 | -46.2% | FAIL |
| SC-002 | screens-local-100-no-images/movies-index-cold:conteúdo/foco | 250.2000000178814 | 222.59999999403954 | 11.0% | FAIL |
| SC-003 | screens-local-100-no-images/movies-index-cold:maior tarefa | 1140 | 1817 | -59.4% | FAIL |
| SC-002 | screens-local-100-no-images/home-cold:regressão | 1662.800000011921 | 1546.2999999821186 | 7.0% | PASS |
| SC-002 | screens-local-100-no-images/series-after-home:regressão | 613.5 | 661.3000000119209 | -7.8% | PASS |
| SC-002 | screens-local-100-no-images/home-return:regressão | 666.6999999880791 | 625.8000000119209 | 6.1% | PASS |
| SC-002 | screens-local-100-no-images/movie-category-cold:regressão | 482.59999999403954 | 656.9000000059605 | -36.1% | FAIL |
| SC-003 | screens-local-100-no-images/seleção pura | 678.4000000059605 | 1628 | -140.0% | FAIL |
| SC-001 | screens-local-100-no-images/ids/contador da seleção | — | — | — | PASS |
| SC-004 | screens-local-100-no-images/soma tarefas nos eventos reais | 2984 | 3661 | -22.7% | FAIL |
| SC-004 | screens-local-100-no-images/p95 direção (proxy de dois quadros) | 74.19999998807907 | 78.30000001192093 | -5.5% | PASS |
| SC-004 | screens-local-100-no-images/escopo/propagação | — | — | — | FAIL |
| SC-005 | screens-local-100-no-images/heap retido | 23618044 | 23777836 | -0.7% | FAIL |
| SC-005 | screens-local-100-no-images/Worker registrado separadamente | — | — | — | PASS |
| SC-009 | screens-local-100-no-images/chamadas/universo de páginas | — | — | — | PASS |
| SC-001 | screens-tmdb-100-no-images/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-002 | screens-tmdb-100-no-images/movies-after-home:conteúdo/foco | 1350.0999999940395 | 2156.5 | -59.7% | FAIL |
| SC-003 | screens-tmdb-100-no-images/movies-after-home:maior tarefa | 808 | 1532 | -89.6% | FAIL |
| SC-002 | screens-tmdb-100-no-images/movies-index-cold:conteúdo/foco | 194.80000001192093 | 177.60000002384186 | 8.8% | FAIL |
| SC-003 | screens-tmdb-100-no-images/movies-index-cold:maior tarefa | 861 | 1625 | -88.7% | FAIL |
| SC-002 | screens-tmdb-100-no-images/home-cold:regressão | 1924.3999999761581 | 1711 | 11.1% | PASS |
| SC-002 | screens-tmdb-100-no-images/series-after-home:regressão | 652.5999999940395 | 687.1999999880791 | -5.3% | PASS |
| SC-002 | screens-tmdb-100-no-images/home-return:regressão | 1305.199999988079 | 1159.9000000059605 | 11.1% | PASS |
| SC-002 | screens-tmdb-100-no-images/movie-category-cold:regressão | 493.90000000596046 | 660.7000000178814 | -33.8% | FAIL |
| SC-003 | screens-tmdb-100-no-images/seleção pura | 667.7999999821186 | 1418 | -112.3% | FAIL |
| SC-001 | screens-tmdb-100-no-images/ids/contador da seleção | — | — | — | PASS |
| SC-004 | screens-tmdb-100-no-images/soma tarefas nos eventos reais | 3866 | 5593 | -44.7% | FAIL |
| SC-004 | screens-tmdb-100-no-images/p95 direção (proxy de dois quadros) | 176.39999997615814 | 125.09999999403954 | 29.1% | PASS |
| SC-004 | screens-tmdb-100-no-images/escopo/propagação | — | — | — | FAIL |
| SC-005 | screens-tmdb-100-no-images/heap retido | 32295328 | 32505044 | -0.6% | FAIL |
| SC-005 | screens-tmdb-100-no-images/Worker registrado separadamente | — | — | — | PASS |
| SC-009 | screens-tmdb-100-no-images/chamadas/universo de páginas | — | — | — | PASS |
| SC-001 | cycles-local/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-006 | cycles-local/navigationCycles | — | — | — | PASS |
| SC-006 | cycles-local/listCycles | — | — | — | FAIL |
| SC-001 | cycles-tmdb/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-006 | cycles-tmdb/navigationCycles | — | — | — | PASS |
| SC-006 | cycles-tmdb/listCycles | — | — | — | FAIL |
| SC-001 | category-30000/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-007 | category-30000/primeiro recorte | 281.09999999403954 | 764.6000000238419 | -172.0% | FAIL |
| SC-007 | category-30000/heap temporário amostrado | 13685852 | 8482464 | 38.0% | PASS |
| SC-007 | category-30000/leitura limitada/fim/busca/RETURN | — | — | — | FAIL |
| SC-001 | episodes-100000/cards/ordem/foco/rolagem observados | — | — | — | PASS |
| SC-010 | episodes-100000/resumo e varredura de episódios | — | — | — | PASS |
| SC-008 | gates/falhas/cancelamento/cache/segredos | — | — | — | FAIL |
| SC-009 | gates/leases/cache/contexto obsoleto | — | — | — | FAIL |
| SC-011 | gates/primeiro acesso/primeiro comando sem regressão >10% | — | — | — | FAIL |
| SC-012 | gates/pacote/rotas locais | — | — | — | FAIL |
| SC-013 | gates/checks/quickstart/relatório | — | — | — | FAIL |

JSON contém n/min/max/MAD e razões para denominador zero. Ausência de gates de verificação não é aprovação.