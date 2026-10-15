# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: 3cb8e9e379876227eef7492ba18bfbb76be9d99fba787097adfd3acfef85cfef; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-tmdb-20-images | home-cold (ms) | 3 | 2688.40 | 2657.80 | 2749.40 | 30.60 |
| screens-tmdb-20-images | movies-after-home (ms) | 3 | 651.00 | 647.80 | 689.90 | 3.20 |
| screens-tmdb-20-images | series-after-home (ms) | 3 | 499.10 | 489.10 | 526.70 | 10.00 |
| screens-tmdb-20-images | home-return (ms) | 3 | 1308.70 | 1264.30 | 1374.80 | 44.40 |
| screens-tmdb-20-images | movies-index-cold (ms) | 3 | 209.00 | 207.90 | 221.00 | 1.10 |
| screens-tmdb-20-images | movie-category-cold (ms) | 3 | 490.80 | 470.00 | 500.60 | 9.80 |
| screens-tmdb-20-images | heap H→F→S (MiB) | 3 | 36.36 | 36.36 | 36.36 | 0.00 |
| screens-tmdb-20-images | preparo seed CPU1 (ms) | 3 | 8139.03 | 8091.21 | 8202.57 | 47.82 |
| screens-tmdb-20-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-tmdb-20-images | seleção pura (ms) | 3 | 60.70 | 60.30 | 61.60 | 0.40 |
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