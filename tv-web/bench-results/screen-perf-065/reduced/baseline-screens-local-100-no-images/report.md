# Baseline/candidata 065

Modo: baseline; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-no-images | home-cold (ms) | 3 | 1500.30 | 1451.80 | 1503.40 | 3.10 |
| screens-local-100-no-images | movies-after-home (ms) | 3 | 1211.20 | 1176.20 | 1313.10 | 35.00 |
| screens-local-100-no-images | series-after-home (ms) | 3 | 514.40 | 475.10 | 630.50 | 39.30 |
| screens-local-100-no-images | home-return (ms) | 3 | 590.00 | 582.80 | 687.50 | 7.20 |
| screens-local-100-no-images | movies-index-cold (ms) | 3 | 215.50 | 201.80 | 219.70 | 4.20 |
| screens-local-100-no-images | movie-category-cold (ms) | 3 | 425.00 | 423.50 | 428.70 | 1.50 |
| screens-local-100-no-images | heap H→F→S (MiB) | 3 | 22.51 | 22.51 | 22.51 | 0.00 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 3 | 6895.80 | 6786.05 | 6966.15 | 70.35 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 3 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 3 | 600.40 | 552.60 | 602.80 | 2.40 |
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