# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: 1d6eb72f4759c45ff9eeb5781456dd42d9403d572d13cbe7b878c0719d8d9e86; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-tmdb-20-images | home-cold (ms) | 3 | 1555.20 | 1531.10 | 1597.10 | 24.10 |
| screens-tmdb-20-images | movies-after-home (ms) | 3 | 470.40 | 461.80 | 527.10 | 8.60 |
| screens-tmdb-20-images | series-after-home (ms) | 3 | 398.00 | 346.50 | 435.90 | 37.90 |
| screens-tmdb-20-images | home-return (ms) | 3 | 942.30 | 929.20 | 966.50 | 13.10 |
| screens-tmdb-20-images | movies-index-cold (ms) | 3 | 165.30 | 153.20 | 168.60 | 3.30 |
| screens-tmdb-20-images | movie-category-cold (ms) | 3 | 316.60 | 295.90 | 332.30 | 15.70 |
| screens-tmdb-20-images | heap H→F→S (MiB) | 3 | 36.36 | 36.35 | 36.36 | 0.00 |
| screens-tmdb-20-images | preparo seed CPU1 (ms) | 3 | 8210.40 | 7927.53 | 8635.31 | 282.86 |
| screens-tmdb-20-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-tmdb-20-images | seleção pura (ms) | 3 | 45.50 | 44.50 | 47.40 | 1.00 |
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