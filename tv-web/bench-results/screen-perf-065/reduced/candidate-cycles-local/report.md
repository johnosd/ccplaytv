# Baseline/candidata 065

Modo: candidate; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: 8e74d95b57783b731c829aac40ad9f3aa4481bdcd20b04245ca656b350ac40b3; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| cycles-local | home-cold (ms) | 2 | 2456.80 | 2395.80 | 2517.80 | 61.00 |
| cycles-local | movies-after-home (ms) | 2 | 405.50 | 400.40 | 410.60 | 5.10 |
| cycles-local | series-after-home (ms) | 2 | 407.25 | 339.70 | 474.80 | 67.55 |
| cycles-local | home-return (ms) | 2 | 336.05 | 232.20 | 439.90 | 103.85 |
| cycles-local | movies-index-cold (ms) | 2 | 361.60 | 219.30 | 503.90 | 142.30 |
| cycles-local | heap H→F→S (MiB) | 2 | 7.54 | 7.52 | 7.55 | 0.01 |
| cycles-local | preparo seed CPU1 (ms) | 2 | 29677.11 | 20603.12 | 38751.11 | 9074.00 |
| cycles-local | armazenamento adicional do roteiro (MiB) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | seleção pura (ms) | 2 | 278.10 | 152.40 | 403.80 | 125.70 |
| cycles-local | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |

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