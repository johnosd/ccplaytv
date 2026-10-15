# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: bb25571a58916eed53f58a266520a3d676ad99b2a9ffc62a2cf6c2935a189536; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-no-images | home-cold (ms) | 3 | 1469.20 | 1446.90 | 1479.80 | 10.60 |
| screens-local-100-no-images | movies-after-home (ms) | 3 | 293.60 | 283.70 | 312.50 | 9.90 |
| screens-local-100-no-images | series-after-home (ms) | 3 | 203.40 | 195.00 | 231.40 | 8.40 |
| screens-local-100-no-images | home-return (ms) | 3 | 430.70 | 417.00 | 466.00 | 13.70 |
| screens-local-100-no-images | movies-index-cold (ms) | 3 | 161.00 | 151.80 | 197.70 | 9.20 |
| screens-local-100-no-images | movie-category-cold (ms) | 3 | 248.80 | 244.60 | 260.50 | 4.20 |
| screens-local-100-no-images | heap H→F→S (MiB) | 3 | 10.45 | 10.45 | 10.45 | 0.00 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 3 | 7101.87 | 6886.71 | 7123.94 | 22.07 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 3 | 131.10 | 127.70 | 150.80 | 3.40 |
| screens-local-100-no-images | Workers criados (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-no-images | chamadas simuladas (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |

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