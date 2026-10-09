# Baseline/candidata 065

Modo: baseline; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 0445ceab8bb63b71323222b3908c84b5b9f2a2dc7b696aed82d05cb6465c8119; harness SHA256: da808f5831e985c27f2f6207150bd2641f6f89d96576c74f1013eb7fc822bec9.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 1 | 1151.90 | 1151.90 | 1151.90 | 0.00 |
| category-30000 | movies-after-home (ms) | 1 | 646.90 | 646.90 | 646.90 | 0.00 |
| category-30000 | series-after-home (ms) | 1 | 163.50 | 163.50 | 163.50 | 0.00 |
| category-30000 | home-return (ms) | 1 | 99.60 | 99.60 | 99.60 | 0.00 |
| category-30000 | movies-index-cold (ms) | 1 | 57.60 | 57.60 | 57.60 | 0.00 |
| category-30000 | category-first (ms) | 1 | 291.90 | 291.90 | 291.90 | 0.00 |
| category-30000 | heap H→F→S (MiB) | 1 | 23.33 | 23.33 | 23.33 | 0.00 |

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