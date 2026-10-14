# Baseline/candidata 065

Modo: baseline; suite: smoke; 7 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-tmdb-20-images | home-cold (ms) | 7 | 2136.50 | 2090.00 | 2165.90 | 5.70 |
| screens-tmdb-20-images | movies-after-home (ms) | 7 | 916.60 | 898.70 | 948.50 | 11.80 |
| screens-tmdb-20-images | series-after-home (ms) | 7 | 652.40 | 593.90 | 680.00 | 20.60 |
| screens-tmdb-20-images | home-return (ms) | 7 | 1426.90 | 1388.30 | 1459.30 | 13.90 |
| screens-tmdb-20-images | movies-index-cold (ms) | 7 | 213.50 | 209.30 | 240.30 | 3.90 |
| screens-tmdb-20-images | movie-category-cold (ms) | 7 | 570.70 | 545.50 | 858.90 | 25.20 |
| screens-tmdb-20-images | heap H→F→S (MiB) | 7 | 36.22 | 36.20 | 36.28 | 0.01 |
| screens-tmdb-20-images | preparo seed CPU1 (ms) | 7 | 8829.35 | 8660.82 | 9000.88 | 85.15 |
| screens-tmdb-20-images | armazenamento adicional do roteiro (MiB) | 7 | 0.01 | 0.01 | 0.01 | 0.00 |
| screens-tmdb-20-images | seleção pura (ms) | 7 | 155.90 | 136.10 | 174.20 | 3.10 |
| screens-tmdb-20-images | Workers criados (contagem) | 7 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-tmdb-20-images | chamadas simuladas (contagem) | 7 | 23.00 | 23.00 | 23.00 | 0.00 |

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