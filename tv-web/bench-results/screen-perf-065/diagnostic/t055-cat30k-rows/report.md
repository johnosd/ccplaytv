# Baseline/candidata 065

Modo: candidate; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: 45af6ec3be6ba74ee0d2f279b1bd5c6ebd55689351cdfd2e614bfb725b276309; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 2 | 2064.75 | 1980.80 | 2148.70 | 83.95 |
| category-30000 | movies-after-home (ms) | 2 | 243.20 | 220.60 | 265.80 | 22.60 |
| category-30000 | series-after-home (ms) | 2 | 171.50 | 134.20 | 208.80 | 37.30 |
| category-30000 | home-return (ms) | 2 | 135.75 | 127.60 | 143.90 | 8.15 |
| category-30000 | movies-index-cold (ms) | 2 | 71.55 | 70.70 | 72.40 | 0.85 |
| category-30000 | category-first (ms) | 2 | 185.85 | 183.40 | 188.30 | 2.45 |
| category-30000 | heap H→F→S (MiB) | 2 | 6.47 | 6.46 | 6.47 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 2 | 3670.42 | 3539.72 | 3801.12 | 130.70 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 2 | 1.60 | 1.60 | 1.60 | 0.00 |
| category-30000 | seleção pura (ms) | 2 | 130.75 | 126.70 | 134.80 | 4.05 |
| category-30000 | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 2 | 1.23 | 1.23 | 1.23 | 0.00 |

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