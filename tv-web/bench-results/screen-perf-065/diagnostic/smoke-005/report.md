# Baseline/candidata 065

Modo: baseline; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 0445ceab8bb63b71323222b3908c84b5b9f2a2dc7b696aed82d05cb6465c8119; harness SHA256: 8be387ed4b1ce20c2c8f0b338834f42a5aba4a603ac07ea878d45a626604f5a1.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| episodes-100000 | home-cold (ms) | 1 | 13523.10 | 13523.10 | 13523.10 | 0.00 |
| episodes-100000 | movies-after-home (ms) | 1 | 241.80 | 241.80 | 241.80 | 0.00 |
| episodes-100000 | series-after-home (ms) | 1 | 223.30 | 223.30 | 223.30 | 0.00 |
| episodes-100000 | home-return (ms) | 1 | 119.70 | 119.70 | 119.70 | 0.00 |
| episodes-100000 | movies-index-cold (ms) | 1 | 66.90 | 66.90 | 66.90 | 0.00 |
| episodes-100000 | series-summary-first (ms) | 1 | 754.50 | 754.50 | 754.50 | 0.00 |
| episodes-100000 | series-summary-reentry (ms) | 1 | 88.70 | 88.70 | 88.70 | 0.00 |
| episodes-100000 | series-summary-delta (ms) | 1 | 91.80 | 91.80 | 91.80 | 0.00 |
| episodes-100000 | heap H→F→S (MiB) | 1 | 6.53 | 6.53 | 6.53 | 0.00 |

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