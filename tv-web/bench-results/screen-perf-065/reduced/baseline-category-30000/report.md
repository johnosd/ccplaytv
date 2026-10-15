# Baseline/candidata 065

Modo: baseline; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 3 | 1362.40 | 1348.40 | 1378.60 | 14.00 |
| category-30000 | movies-after-home (ms) | 3 | 847.00 | 822.00 | 871.60 | 24.60 |
| category-30000 | series-after-home (ms) | 3 | 248.30 | 241.70 | 266.40 | 6.60 |
| category-30000 | home-return (ms) | 3 | 136.20 | 131.10 | 138.80 | 2.60 |
| category-30000 | movies-index-cold (ms) | 3 | 67.90 | 65.50 | 71.50 | 2.40 |
| category-30000 | category-first (ms) | 3 | 276.10 | 273.80 | 286.40 | 2.30 |
| category-30000 | heap H→F→S (MiB) | 3 | 23.32 | 23.32 | 23.32 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 3 | 3538.26 | 3482.74 | 3563.36 | 25.09 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | seleção pura (ms) | 3 | 430.40 | 411.90 | 433.20 | 2.80 |
| category-30000 | Workers criados (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 3 | 13.06 | 13.03 | 13.19 | 0.03 |

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