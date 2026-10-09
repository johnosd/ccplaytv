# Baseline/candidata 065

Modo: candidate; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: 45af6ec3be6ba74ee0d2f279b1bd5c6ebd55689351cdfd2e614bfb725b276309; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-no-images | home-cold (ms) | 2 | 1797.25 | 1795.60 | 1798.90 | 1.65 |
| screens-local-100-no-images | movies-after-home (ms) | 2 | 400.00 | 395.10 | 404.90 | 4.90 |
| screens-local-100-no-images | series-after-home (ms) | 2 | 261.45 | 261.20 | 261.70 | 0.25 |
| screens-local-100-no-images | home-return (ms) | 2 | 607.60 | 593.60 | 621.60 | 14.00 |
| screens-local-100-no-images | movies-index-cold (ms) | 2 | 206.85 | 191.70 | 222.00 | 15.15 |
| screens-local-100-no-images | movie-category-cold (ms) | 2 | 325.60 | 315.70 | 335.50 | 9.90 |
| screens-local-100-no-images | heap H→F→S (MiB) | 2 | 10.39 | 10.33 | 10.44 | 0.06 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 2 | 7123.22 | 7071.68 | 7174.76 | 51.54 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 2 | 0.07 | 0.07 | 0.07 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 2 | 196.00 | 190.50 | 201.50 | 5.50 |
| screens-local-100-no-images | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-no-images | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |

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