# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: 8e74d95b57783b731c829aac40ad9f3aa4481bdcd20b04245ca656b350ac40b3; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 3 | 2217.40 | 2193.20 | 2252.70 | 24.20 |
| category-30000 | movies-after-home (ms) | 3 | 249.50 | 195.80 | 261.00 | 11.50 |
| category-30000 | series-after-home (ms) | 3 | 186.30 | 132.30 | 213.20 | 26.90 |
| category-30000 | home-return (ms) | 3 | 132.20 | 117.30 | 132.70 | 0.50 |
| category-30000 | movies-index-cold (ms) | 3 | 71.90 | 70.00 | 75.10 | 1.90 |
| category-30000 | category-first (ms) | 3 | 194.40 | 185.70 | 202.10 | 7.70 |
| category-30000 | heap H→F→S (MiB) | 3 | 6.60 | 6.59 | 6.60 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 3 | 3648.35 | 3551.99 | 3707.87 | 59.52 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 3 | 1.60 | 1.60 | 1.60 | 0.00 |
| category-30000 | seleção pura (ms) | 3 | 139.20 | 138.80 | 149.60 | 0.40 |
| category-30000 | Workers criados (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 3 | 1.30 | 0.85 | 1.35 | 0.05 |

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