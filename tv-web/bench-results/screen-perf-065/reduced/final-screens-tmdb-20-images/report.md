# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: bb25571a58916eed53f58a266520a3d676ad99b2a9ffc62a2cf6c2935a189536; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-tmdb-20-images | home-cold (ms) | 3 | 1539.10 | 1538.20 | 1568.70 | 0.90 |
| screens-tmdb-20-images | movies-after-home (ms) | 3 | 458.30 | 457.80 | 486.60 | 0.50 |
| screens-tmdb-20-images | series-after-home (ms) | 3 | 361.40 | 342.00 | 403.80 | 19.40 |
| screens-tmdb-20-images | home-return (ms) | 3 | 914.50 | 904.90 | 927.00 | 9.60 |
| screens-tmdb-20-images | movies-index-cold (ms) | 3 | 143.60 | 139.20 | 144.50 | 0.90 |
| screens-tmdb-20-images | movie-category-cold (ms) | 3 | 293.00 | 284.90 | 296.10 | 3.10 |
| screens-tmdb-20-images | heap H→F→S (MiB) | 3 | 36.27 | 36.15 | 36.28 | 0.00 |
| screens-tmdb-20-images | preparo seed CPU1 (ms) | 3 | 7870.56 | 7843.64 | 7939.33 | 26.93 |
| screens-tmdb-20-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-tmdb-20-images | seleção pura (ms) | 3 | 43.30 | 39.50 | 51.00 | 3.80 |
| screens-tmdb-20-images | Workers criados (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-tmdb-20-images | chamadas simuladas (contagem) | 3 | 23.00 | 23.00 | 23.00 | 0.00 |

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