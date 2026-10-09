# Baseline/candidata 065

Modo: candidate; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: 81cb93d0e1d0af5472a90cde4cedf0902a11a274b7d97e12be542f10ebbfcf3b; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 1 | 2096.60 | 2096.60 | 2096.60 | 0.00 |
| category-30000 | movies-after-home (ms) | 1 | 249.50 | 249.50 | 249.50 | 0.00 |
| category-30000 | series-after-home (ms) | 1 | 185.90 | 185.90 | 185.90 | 0.00 |
| category-30000 | home-return (ms) | 1 | 136.10 | 136.10 | 136.10 | 0.00 |
| category-30000 | movies-index-cold (ms) | 1 | 61.50 | 61.50 | 61.50 | 0.00 |
| category-30000 | category-first (ms) | 1 | 217.10 | 217.10 | 217.10 | 0.00 |
| category-30000 | heap H→F→S (MiB) | 1 | 6.46 | 6.46 | 6.46 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 1 | 3618.15 | 3618.15 | 3618.15 | 0.00 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 1 | 1.60 | 1.60 | 1.60 | 0.00 |
| category-30000 | seleção pura (ms) | 1 | 133.20 | 133.20 | 133.20 | 0.00 |
| category-30000 | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 1 | 1.41 | 1.41 | 1.41 | 0.00 |

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