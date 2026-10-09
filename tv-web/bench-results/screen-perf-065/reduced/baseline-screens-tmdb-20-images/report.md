# Baseline/candidata 065

Modo: baseline; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-tmdb-20-images | home-cold (ms) | 3 | 1806.30 | 1797.10 | 1822.30 | 9.20 |
| screens-tmdb-20-images | movies-after-home (ms) | 3 | 740.50 | 739.70 | 756.50 | 0.80 |
| screens-tmdb-20-images | series-after-home (ms) | 3 | 529.90 | 528.20 | 531.30 | 1.40 |
| screens-tmdb-20-images | home-return (ms) | 3 | 1227.40 | 1216.70 | 1233.10 | 5.70 |
| screens-tmdb-20-images | movies-index-cold (ms) | 3 | 161.80 | 147.30 | 184.90 | 14.50 |
| screens-tmdb-20-images | movie-category-cold (ms) | 3 | 516.10 | 438.10 | 539.90 | 23.80 |
| screens-tmdb-20-images | heap H→F→S (MiB) | 3 | 36.27 | 36.20 | 36.27 | 0.00 |
| screens-tmdb-20-images | preparo seed CPU1 (ms) | 3 | 7776.38 | 7754.79 | 7862.59 | 21.58 |
| screens-tmdb-20-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-tmdb-20-images | seleção pura (ms) | 3 | 128.70 | 102.80 | 139.60 | 10.90 |
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