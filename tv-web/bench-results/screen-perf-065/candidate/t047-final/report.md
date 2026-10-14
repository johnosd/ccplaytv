# Baseline/candidata 065

Modo: candidate; suite: full; 7 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: aae1a9c6f631106fe2f53b29bbcfeffe7830abc4b59bfcbf1343713a56b3b4f0; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-20-images | home-cold (ms) | 7 | 1365.90 | 1356.90 | 1401.70 | 3.10 |
| screens-local-20-images | movies-after-home (ms) | 7 | 654.60 | 643.90 | 663.10 | 6.80 |
| screens-local-20-images | series-after-home (ms) | 7 | 299.60 | 295.40 | 333.10 | 3.10 |
| screens-local-20-images | home-return (ms) | 7 | 495.90 | 488.30 | 508.30 | 4.30 |
| screens-local-20-images | movies-index-cold (ms) | 7 | 226.50 | 221.80 | 264.50 | 2.90 |
| screens-local-20-images | movie-category-cold (ms) | 7 | 591.20 | 578.40 | 618.50 | 6.00 |
| screens-local-20-images | heap H→F→S (MiB) | 7 | 27.88 | 27.87 | 27.99 | 0.00 |
| screens-local-20-images | preparo seed CPU1 (ms) | 7 | 7802.73 | 7700.20 | 7881.70 | 55.74 |
| screens-local-20-images | armazenamento adicional do roteiro (MiB) | 7 | 0.07 | 0.07 | 0.07 | 0.00 |
| screens-local-20-images | seleção pura (ms) | 7 | 104.00 | 97.60 | 119.30 | 2.70 |
| screens-local-20-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-20-images | chamadas simuladas (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | home-cold (ms) | 7 | 1312.00 | 1289.10 | 1361.30 | 10.90 |
| screens-local-100-images | movies-after-home (ms) | 7 | 1394.50 | 1356.10 | 1573.50 | 35.90 |
| screens-local-100-images | series-after-home (ms) | 7 | 478.50 | 444.80 | 521.90 | 20.40 |
| screens-local-100-images | home-return (ms) | 7 | 495.90 | 487.30 | 569.90 | 6.50 |
| screens-local-100-images | movies-index-cold (ms) | 7 | 225.80 | 221.50 | 253.00 | 4.30 |
| screens-local-100-images | movie-category-cold (ms) | 7 | 556.50 | 549.70 | 626.40 | 6.50 |
| screens-local-100-images | heap H→F→S (MiB) | 7 | 27.99 | 27.88 | 28.00 | 0.00 |
| screens-local-100-images | preparo seed CPU1 (ms) | 7 | 7763.40 | 7647.87 | 7853.96 | 78.11 |
| screens-local-100-images | armazenamento adicional do roteiro (MiB) | 7 | 0.08 | 0.08 | 0.08 | 0.00 |
| screens-local-100-images | seleção pura (ms) | 7 | 1076.90 | 1038.20 | 1157.10 | 26.00 |
| screens-local-100-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | chamadas simuladas (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | abertura lista=false/cold (ms) | 7 | 768.70 | 738.50 | 815.90 | 14.30 |
| screens-local-100-images | JS abertura lista=false/cold (bytes) | 7 | 1041543.00 | 1041543.00 | 1041543.00 | 0.00 |
| screens-local-100-images | abertura lista=false/warm (ms) | 7 | 344.70 | 329.30 | 384.10 | 10.80 |
| screens-local-100-images | JS abertura lista=false/warm (bytes) | 7 | 1041543.00 | 1041543.00 | 1041543.00 | 0.00 |
| screens-local-100-images | abertura lista=true/cold (ms) | 7 | 370.60 | 333.70 | 385.90 | 15.30 |
| screens-local-100-images | JS abertura lista=true/cold (bytes) | 7 | 1006856.00 | 1006856.00 | 1041543.00 | 0.00 |
| screens-local-100-images | abertura lista=true/warm (ms) | 7 | 331.40 | 318.20 | 364.60 | 10.30 |
| screens-local-100-images | JS abertura lista=true/warm (bytes) | 7 | 1041543.00 | 1041543.00 | 1041543.00 | 0.00 |
| screens-local-100-images | primeiro comando normal (ms) | 7 | 14.60 | 11.70 | 26.20 | 2.90 |
| screens-local-100-images | normal-first-home (ms) | 7 | 1341.50 | 1308.10 | 1445.70 | 24.60 |
| screens-local-100-images | normal-first-movies (ms) | 7 | 1885.40 | 1457.00 | 1973.50 | 28.40 |
| screens-local-100-images | normal-first-series (ms) | 7 | 512.30 | 475.00 | 544.00 | 19.10 |
| screens-local-100-images | normal-first-category (ms) | 7 | 568.70 | 562.00 | 573.40 | 3.70 |
| screens-tmdb-20-images | home-cold (ms) | 7 | 1499.30 | 1475.80 | 1526.60 | 6.90 |
| screens-tmdb-20-images | movies-after-home (ms) | 7 | 792.90 | 781.20 | 831.80 | 2.80 |
| screens-tmdb-20-images | series-after-home (ms) | 7 | 448.70 | 409.20 | 482.30 | 12.70 |
| screens-tmdb-20-images | home-return (ms) | 7 | 1032.30 | 992.40 | 1073.90 | 30.80 |
| screens-tmdb-20-images | movies-index-cold (ms) | 7 | 159.10 | 155.00 | 165.10 | 3.00 |
| screens-tmdb-20-images | movie-category-cold (ms) | 7 | 617.00 | 612.90 | 627.30 | 3.70 |
| screens-tmdb-20-images | heap H→F→S (MiB) | 7 | 36.30 | 36.29 | 36.30 | 0.00 |
| screens-tmdb-20-images | preparo seed CPU1 (ms) | 7 | 8412.32 | 8249.39 | 8464.64 | 40.76 |
| screens-tmdb-20-images | armazenamento adicional do roteiro (MiB) | 7 | 0.08 | 0.08 | 0.08 | 0.00 |
| screens-tmdb-20-images | seleção pura (ms) | 7 | 89.90 | 70.30 | 106.10 | 16.20 |
| screens-tmdb-20-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-tmdb-20-images | chamadas simuladas (contagem) | 7 | 23.00 | 23.00 | 23.00 | 0.00 |
| screens-tmdb-100-images | home-cold (ms) | 7 | 1497.80 | 1417.20 | 1538.40 | 9.30 |
| screens-tmdb-100-images | movies-after-home (ms) | 7 | 1685.00 | 1519.20 | 3699.50 | 27.00 |
| screens-tmdb-100-images | series-after-home (ms) | 7 | 620.60 | 574.90 | 936.30 | 27.00 |
| screens-tmdb-100-images | home-return (ms) | 7 | 1003.00 | 978.30 | 1403.40 | 19.10 |
| screens-tmdb-100-images | movies-index-cold (ms) | 7 | 164.40 | 152.60 | 188.40 | 11.30 |
| screens-tmdb-100-images | movie-category-cold (ms) | 7 | 649.40 | 582.70 | 1020.90 | 48.70 |
| screens-tmdb-100-images | heap H→F→S (MiB) | 7 | 36.30 | 36.18 | 36.31 | 0.00 |
| screens-tmdb-100-images | preparo seed CPU1 (ms) | 7 | 8498.75 | 7889.59 | 8917.50 | 268.98 |
| screens-tmdb-100-images | armazenamento adicional do roteiro (MiB) | 7 | 0.09 | 0.09 | 0.09 | 0.00 |
| screens-tmdb-100-images | seleção pura (ms) | 7 | 1033.80 | 1008.30 | 1544.90 | 11.50 |
| screens-tmdb-100-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-tmdb-100-images | chamadas simuladas (contagem) | 7 | 23.00 | 23.00 | 23.00 | 0.00 |
| screens-local-100-no-images | home-cold (ms) | 7 | 1546.30 | 1256.30 | 1710.00 | 103.10 |
| screens-local-100-no-images | movies-after-home (ms) | 7 | 2053.10 | 1427.10 | 2156.60 | 48.30 |
| screens-local-100-no-images | series-after-home (ms) | 7 | 661.30 | 438.10 | 765.70 | 47.80 |
| screens-local-100-no-images | home-return (ms) | 7 | 625.80 | 457.10 | 741.70 | 7.70 |
| screens-local-100-no-images | movies-index-cold (ms) | 7 | 222.60 | 161.40 | 267.90 | 8.90 |
| screens-local-100-no-images | movie-category-cold (ms) | 7 | 656.90 | 552.10 | 674.30 | 7.50 |
| screens-local-100-no-images | heap H→F→S (MiB) | 7 | 22.68 | 22.67 | 22.68 | 0.00 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 7 | 7446.65 | 7217.97 | 7627.66 | 82.70 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 7 | 0.07 | 0.07 | 0.07 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 7 | 1628.00 | 1222.30 | 1719.50 | 25.30 |
| screens-local-100-no-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-no-images | chamadas simuladas (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-tmdb-100-no-images | home-cold (ms) | 7 | 1711.00 | 1645.80 | 1788.50 | 30.70 |
| screens-tmdb-100-no-images | movies-after-home (ms) | 7 | 2156.50 | 2081.60 | 2501.80 | 2.60 |
| screens-tmdb-100-no-images | series-after-home (ms) | 7 | 687.20 | 654.40 | 733.80 | 29.10 |
| screens-tmdb-100-no-images | home-return (ms) | 7 | 1159.90 | 1139.80 | 1393.30 | 4.70 |
| screens-tmdb-100-no-images | movies-index-cold (ms) | 7 | 177.60 | 167.40 | 199.30 | 6.00 |
| screens-tmdb-100-no-images | movie-category-cold (ms) | 7 | 660.70 | 620.10 | 825.10 | 18.20 |
| screens-tmdb-100-no-images | heap H→F→S (MiB) | 7 | 31.00 | 30.99 | 31.00 | 0.00 |
| screens-tmdb-100-no-images | preparo seed CPU1 (ms) | 7 | 7266.05 | 6890.96 | 7884.34 | 288.59 |
| screens-tmdb-100-no-images | armazenamento adicional do roteiro (MiB) | 7 | 0.08 | 0.08 | 0.08 | 0.00 |
| screens-tmdb-100-no-images | seleção pura (ms) | 7 | 1418.00 | 1360.30 | 1530.60 | 23.10 |
| screens-tmdb-100-no-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-tmdb-100-no-images | chamadas simuladas (contagem) | 7 | 23.00 | 23.00 | 23.00 | 0.00 |
| cycles-local | home-cold (ms) | 7 | 1409.90 | 1371.90 | 1792.30 | 38.00 |
| cycles-local | movies-after-home (ms) | 7 | 1292.90 | 1235.20 | 2026.80 | 57.70 |
| cycles-local | series-after-home (ms) | 7 | 417.40 | 328.10 | 634.10 | 89.30 |
| cycles-local | home-return (ms) | 7 | 262.90 | 233.70 | 360.40 | 29.20 |
| cycles-local | movies-index-cold (ms) | 7 | 261.20 | 216.30 | 325.90 | 44.90 |
| cycles-local | heap H→F→S (MiB) | 7 | 23.87 | 23.86 | 23.89 | 0.01 |
| cycles-local | preparo seed CPU1 (ms) | 7 | 20239.33 | 19912.90 | 21408.41 | 326.43 |
| cycles-local | armazenamento adicional do roteiro (MiB) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | seleção pura (ms) | 7 | 1011.20 | 965.40 | 1630.70 | 45.80 |
| cycles-local | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | chamadas simuladas (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-tmdb | home-cold (ms) | 7 | 1343.10 | 1221.50 | 2033.00 | 94.50 |
| cycles-tmdb | movies-after-home (ms) | 7 | 1379.70 | 1275.40 | 2060.50 | 69.50 |
| cycles-tmdb | series-after-home (ms) | 7 | 464.00 | 425.80 | 678.50 | 24.80 |
| cycles-tmdb | home-return (ms) | 7 | 417.10 | 403.30 | 604.80 | 12.90 |
| cycles-tmdb | movies-index-cold (ms) | 7 | 146.90 | 132.90 | 212.40 | 6.50 |
| cycles-tmdb | heap H→F→S (MiB) | 7 | 32.19 | 32.18 | 32.19 | 0.00 |
| cycles-tmdb | preparo seed CPU1 (ms) | 7 | 20445.64 | 18923.82 | 21300.78 | 424.82 |
| cycles-tmdb | armazenamento adicional do roteiro (MiB) | 7 | 0.01 | 0.01 | 0.01 | 0.00 |
| cycles-tmdb | seleção pura (ms) | 7 | 953.00 | 875.20 | 1387.30 | 32.60 |
| cycles-tmdb | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-tmdb | chamadas simuladas (contagem) | 7 | 145.00 | 145.00 | 145.00 | 0.00 |
| category-30000 | home-cold (ms) | 7 | 1186.40 | 1150.50 | 1245.20 | 17.50 |
| category-30000 | movies-after-home (ms) | 7 | 702.00 | 688.90 | 728.60 | 12.30 |
| category-30000 | series-after-home (ms) | 7 | 162.60 | 155.90 | 177.20 | 5.60 |
| category-30000 | home-return (ms) | 7 | 114.20 | 105.20 | 119.50 | 3.60 |
| category-30000 | movies-index-cold (ms) | 7 | 57.90 | 54.80 | 64.90 | 0.30 |
| category-30000 | category-first (ms) | 7 | 764.60 | 732.00 | 790.70 | 14.20 |
| category-30000 | heap H→F→S (MiB) | 7 | 15.53 | 15.53 | 15.53 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 7 | 3594.69 | 3541.89 | 3767.55 | 33.29 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | seleção pura (ms) | 7 | 454.40 | 429.60 | 478.70 | 12.80 |
| category-30000 | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 7 | 8.09 | 7.96 | 8.27 | 0.10 |
| episodes-100000 | home-cold (ms) | 7 | 1275.00 | 1106.70 | 1353.50 | 27.50 |
| episodes-100000 | movies-after-home (ms) | 7 | 474.10 | 465.30 | 497.20 | 8.20 |
| episodes-100000 | series-after-home (ms) | 7 | 220.20 | 210.90 | 225.10 | 4.90 |
| episodes-100000 | home-return (ms) | 7 | 123.10 | 115.30 | 127.40 | 0.90 |
| episodes-100000 | movies-index-cold (ms) | 7 | 58.50 | 56.40 | 62.60 | 1.50 |
| episodes-100000 | series-summary-first (ms) | 7 | 1146.90 | 1093.70 | 1244.10 | 40.00 |
| episodes-100000 | series-summary-reentry (ms) | 7 | 89.80 | 84.50 | 96.90 | 4.20 |
| episodes-100000 | series-summary-delta (ms) | 7 | 88.00 | 83.80 | 95.20 | 2.60 |
| episodes-100000 | heap H→F→S (MiB) | 7 | 7.23 | 7.22 | 7.23 | 0.00 |
| episodes-100000 | preparo seed CPU1 (ms) | 7 | 21465.42 | 20764.48 | 21615.79 | 150.38 |
| episodes-100000 | armazenamento adicional do roteiro (MiB) | 7 | 19.20 | 19.20 | 19.20 | 0.00 |
| episodes-100000 | seleção pura (ms) | 7 | 0.90 | 0.70 | 2.90 | 0.10 |
| episodes-100000 | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | chamadas simuladas (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | series-summary-first: episódios lidos | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | series-summary-reentry: episódios lidos | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | series-summary-delta: episódios lidos | 7 | 0.00 | 0.00 | 0.00 | 0.00 |

## Custos e limitações

- DOM/dois quadros são proxy de pintura/foco
- p95 é distribuição de keydown→dois quadros, não tecla física
- heap principal não inclui RAM/GPU/arte decodificada; Worker positivo tem heap não aferido
- pico temporário amostrado a cada 100ms
- seedRpcMs é preparo a CPU1, não importação; telas/conversão real permanecem a CPU configurada
- entrada control agrega adapter; tempos/bytes de abertura vêm da entrada normal
- SVGs locais procedurais, sem imagens reais do provedor

samples.json publica preparo, armazenamento, leituras, tarefas longas, heap/ciclos, seleção/ids, resumos, foco/rolagem, chamadas e abertura/bytes.
Baseline registra comportamento anterior, inclusive falhas conhecidas: nenhum percentual ou critério é aprovado por este relatório. Candidata exige comparação + gates externos em --checks.
p95: posto mais próximo ceil(0,95 × N), com 12 comandos por amostra (84 em sete execuções).
Fixture canônica já está em categoryBlocks; não mede importação/conversão legada. Derivações novas na candidata permanecem dentro do roteiro desde home-cold, sem preparo de projeções. category-first é primeira entrada na grade após H→F→S e índice frio, não leitura de instalação vazia.
Índice frio remove somente o cache público catalog-search-index/movie; os demais caches do roteiro permanecem. Workers têm heap zero quando nenhum é criado; qualquer Worker positivo sem aferição separada impede aprovar a redução de memória no comparador.