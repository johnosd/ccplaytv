# Baseline/candidata 065

Modo: candidate; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 4074dd17d463c90ab59aefb5929305f82782622cdaa218f91fe325809c1631dc; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| episodes-100000 | home-cold (ms) | 1 | 1236.40 | 1236.40 | 1236.40 | 0.00 |
| episodes-100000 | movies-after-home (ms) | 1 | 190.70 | 190.70 | 190.70 | 0.00 |
| episodes-100000 | series-after-home (ms) | 1 | 240.60 | 240.60 | 240.60 | 0.00 |
| episodes-100000 | home-return (ms) | 1 | 121.80 | 121.80 | 121.80 | 0.00 |
| episodes-100000 | movies-index-cold (ms) | 1 | 59.00 | 59.00 | 59.00 | 0.00 |
| episodes-100000 | series-summary-first (ms) | 1 | 828.90 | 828.90 | 828.90 | 0.00 |
| episodes-100000 | series-summary-reentry (ms) | 1 | 86.80 | 86.80 | 86.80 | 0.00 |
| episodes-100000 | series-summary-delta (ms) | 1 | 88.50 | 88.50 | 88.50 | 0.00 |
| episodes-100000 | heap H→F→S (MiB) | 1 | 7.01 | 7.01 | 7.01 | 0.00 |
| episodes-100000 | preparo seed CPU1 (ms) | 1 | 22921.01 | 22921.01 | 22921.01 | 0.00 |
| episodes-100000 | armazenamento adicional do roteiro (MiB) | 1 | 19.20 | 19.20 | 19.20 | 0.00 |
| episodes-100000 | seleção pura (ms) | 1 | 0.80 | 0.80 | 0.80 | 0.00 |
| episodes-100000 | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | chamadas simuladas (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | series-summary-first: episódios lidos | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | series-summary-reentry: episódios lidos | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| episodes-100000 | series-summary-delta: episódios lidos | 1 | 0.00 | 0.00 | 0.00 | 0.00 |

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