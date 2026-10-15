# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: 3cb8e9e379876227eef7492ba18bfbb76be9d99fba787097adfd3acfef85cfef; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-no-images | home-cold (ms) | 3 | 1494.40 | 1443.50 | 1523.80 | 29.40 |
| screens-local-100-no-images | movies-after-home (ms) | 3 | 310.00 | 295.20 | 316.60 | 6.60 |
| screens-local-100-no-images | series-after-home (ms) | 3 | 262.60 | 251.70 | 284.20 | 10.90 |
| screens-local-100-no-images | home-return (ms) | 3 | 491.10 | 447.70 | 586.40 | 43.40 |
| screens-local-100-no-images | movies-index-cold (ms) | 3 | 186.10 | 152.30 | 220.50 | 33.80 |
| screens-local-100-no-images | movie-category-cold (ms) | 3 | 367.10 | 253.90 | 396.20 | 29.10 |
| screens-local-100-no-images | heap H→F→S (MiB) | 3 | 10.52 | 10.40 | 10.52 | 0.00 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 3 | 7246.85 | 7154.22 | 7509.16 | 92.63 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 3 | 159.50 | 159.20 | 215.90 | 0.30 |
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