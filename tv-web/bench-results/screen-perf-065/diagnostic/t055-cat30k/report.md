# Baseline/candidata 065

Modo: candidate; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: b7d27e66ee7656d2af34cf945bf313a83a882bdeb49ff7a02630f1bc2b04368c; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 2 | 2080.60 | 1982.50 | 2178.70 | 98.10 |
| category-30000 | movies-after-home (ms) | 2 | 254.35 | 228.90 | 279.80 | 25.45 |
| category-30000 | series-after-home (ms) | 2 | 234.60 | 208.80 | 260.40 | 25.80 |
| category-30000 | home-return (ms) | 2 | 131.70 | 116.30 | 147.10 | 15.40 |
| category-30000 | movies-index-cold (ms) | 2 | 70.65 | 69.90 | 71.40 | 0.75 |
| category-30000 | category-first (ms) | 2 | 294.15 | 287.00 | 301.30 | 7.15 |
| category-30000 | heap H→F→S (MiB) | 2 | 6.47 | 6.47 | 6.47 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 2 | 3888.07 | 3822.62 | 3953.51 | 65.44 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 2 | 1.60 | 1.60 | 1.60 | 0.00 |
| category-30000 | seleção pura (ms) | 2 | 143.40 | 140.10 | 146.70 | 3.30 |
| category-30000 | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 2 | 3.41 | 3.40 | 3.42 | 0.01 |

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