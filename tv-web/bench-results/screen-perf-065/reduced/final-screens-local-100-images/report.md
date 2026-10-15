# Baseline/candidata 065

Modo: candidate; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: bb25571a58916eed53f58a266520a3d676ad99b2a9ffc62a2cf6c2935a189536; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-images | home-cold (ms) | 2 | 1572.40 | 1559.40 | 1585.40 | 13.00 |
| screens-local-100-images | movies-after-home (ms) | 2 | 338.30 | 334.00 | 342.60 | 4.30 |
| screens-local-100-images | series-after-home (ms) | 2 | 278.70 | 249.90 | 307.50 | 28.80 |
| screens-local-100-images | home-return (ms) | 2 | 514.50 | 476.30 | 552.70 | 38.20 |
| screens-local-100-images | movies-index-cold (ms) | 2 | 216.60 | 210.90 | 222.30 | 5.70 |
| screens-local-100-images | movie-category-cold (ms) | 2 | 262.65 | 261.90 | 263.40 | 0.75 |
| screens-local-100-images | heap H→F→S (MiB) | 2 | 11.54 | 11.54 | 11.54 | 0.00 |
| screens-local-100-images | preparo seed CPU1 (ms) | 2 | 8197.17 | 8174.74 | 8219.60 | 22.43 |
| screens-local-100-images | armazenamento adicional do roteiro (MiB) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | seleção pura (ms) | 2 | 175.95 | 169.40 | 182.50 | 6.55 |
| screens-local-100-images | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | abertura lista=false/cold (ms) | 2 | 749.45 | 705.00 | 793.90 | 44.45 |
| screens-local-100-images | JS abertura lista=false/cold (bytes) | 2 | 861038.00 | 861038.00 | 861038.00 | 0.00 |
| screens-local-100-images | abertura lista=false/warm (ms) | 2 | 396.40 | 348.20 | 444.60 | 48.20 |
| screens-local-100-images | JS abertura lista=false/warm (bytes) | 2 | 861038.00 | 861038.00 | 861038.00 | 0.00 |
| screens-local-100-images | abertura lista=true/cold (ms) | 2 | 332.65 | 320.00 | 345.30 | 12.65 |
| screens-local-100-images | JS abertura lista=true/cold (bytes) | 2 | 861038.00 | 861038.00 | 861038.00 | 0.00 |
| screens-local-100-images | abertura lista=true/warm (ms) | 2 | 311.25 | 292.10 | 330.40 | 19.15 |
| screens-local-100-images | JS abertura lista=true/warm (bytes) | 2 | 861038.00 | 861038.00 | 861038.00 | 0.00 |
| screens-local-100-images | primeiro comando normal (ms) | 2 | 20.65 | 15.40 | 25.90 | 5.25 |
| screens-local-100-images | normal-first-home (ms) | 2 | 1623.80 | 1601.80 | 1645.80 | 22.00 |
| screens-local-100-images | normal-first-movies (ms) | 2 | 715.55 | 698.40 | 732.70 | 17.15 |
| screens-local-100-images | normal-first-series (ms) | 2 | 290.35 | 287.00 | 293.70 | 3.35 |
| screens-local-100-images | normal-first-category (ms) | 2 | 649.55 | 630.40 | 668.70 | 19.15 |

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