# Baseline/candidata 065

Modo: baseline; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 0445ceab8bb63b71323222b3908c84b5b9f2a2dc7b696aed82d05cb6465c8119; harness SHA256: 4f707d1596855a43e70a237f4c477a83119f912c30f350a4368870f8d3fc0026.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-20-images | home-cold (ms) | 1 | 214.20 | 214.20 | 214.20 | 0.00 |
| screens-local-20-images | movies-after-home (ms) | 1 | 507.30 | 507.30 | 507.30 | 0.00 |
| screens-local-20-images | series-after-home (ms) | 1 | 288.00 | 288.00 | 288.00 | 0.00 |
| screens-local-20-images | home-return (ms) | 1 | 545.60 | 545.60 | 545.60 | 0.00 |
| screens-local-20-images | movies-index-cold (ms) | 1 | 213.20 | 213.20 | 213.20 | 0.00 |
| screens-local-20-images | movie-category-cold (ms) | 1 | 354.80 | 354.80 | 354.80 | 0.00 |
| screens-local-20-images | heap H→F→S (MiB) | 1 | 27.78 | 27.78 | 27.78 | 0.00 |

## Custos e limitações

- DOM/dois quadros são proxy de pintura/foco
- p95 é distribuição de keydown→dois quadros, não tecla física
- heap principal não inclui RAM/GPU/arte decodificada; Worker positivo tem heap não aferido
- pico temporário amostrado a cada 100ms
- seedRpcMs é preparo da fixture, não tempo de importação; conversão real permanece no intervalo da tela
- entrada control agrega adapter; tempos/bytes de abertura vêm da entrada normal
- SVGs locais procedurais, sem imagens reais do provedor

samples.json publica preparo, armazenamento, leituras, tarefas longas, heap/ciclos, seleção/ids, resumos, foco/rolagem, chamadas e abertura/bytes.
Baseline registra comportamento anterior, inclusive falhas conhecidas: nenhum percentual ou critério é aprovado por este relatório. Candidata exige comparação + gates externos em --checks.