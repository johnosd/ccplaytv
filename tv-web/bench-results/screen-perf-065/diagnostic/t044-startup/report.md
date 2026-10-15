# Baseline/candidata 065

Modo: candidate; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 984f93d6644c2ce9380e2f9a36070d3c9f9d8d9cfc3d7169e4b60392280361be; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-images | home-cold (ms) | 1 | 1571.70 | 1571.70 | 1571.70 | 0.00 |
| screens-local-100-images | movies-after-home (ms) | 1 | 2152.50 | 2152.50 | 2152.50 | 0.00 |
| screens-local-100-images | series-after-home (ms) | 1 | 648.10 | 648.10 | 648.10 | 0.00 |
| screens-local-100-images | home-return (ms) | 1 | 691.00 | 691.00 | 691.00 | 0.00 |
| screens-local-100-images | movies-index-cold (ms) | 1 | 338.50 | 338.50 | 338.50 | 0.00 |
| screens-local-100-images | movie-category-cold (ms) | 1 | 638.00 | 638.00 | 638.00 | 0.00 |
| screens-local-100-images | heap H→F→S (MiB) | 1 | 28.00 | 28.00 | 28.00 | 0.00 |
| screens-local-100-images | preparo seed CPU1 (ms) | 1 | 8564.25 | 8564.25 | 8564.25 | 0.00 |
| screens-local-100-images | armazenamento adicional do roteiro (MiB) | 1 | 0.08 | 0.08 | 0.08 | 0.00 |
| screens-local-100-images | seleção pura (ms) | 1 | 1545.50 | 1545.50 | 1545.50 | 0.00 |
| screens-local-100-images | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | chamadas simuladas (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | abertura lista=false/cold (ms) | 1 | 792.50 | 792.50 | 792.50 | 0.00 |
| screens-local-100-images | JS abertura lista=false/cold (bytes) | 1 | 1041270.00 | 1041270.00 | 1041270.00 | 0.00 |
| screens-local-100-images | abertura lista=false/warm (ms) | 1 | 332.10 | 332.10 | 332.10 | 0.00 |
| screens-local-100-images | JS abertura lista=false/warm (bytes) | 1 | 1041270.00 | 1041270.00 | 1041270.00 | 0.00 |
| screens-local-100-images | abertura lista=true/cold (ms) | 1 | 444.50 | 444.50 | 444.50 | 0.00 |
| screens-local-100-images | JS abertura lista=true/cold (bytes) | 1 | 1006583.00 | 1006583.00 | 1006583.00 | 0.00 |
| screens-local-100-images | abertura lista=true/warm (ms) | 1 | 459.90 | 459.90 | 459.90 | 0.00 |
| screens-local-100-images | JS abertura lista=true/warm (bytes) | 1 | 1041270.00 | 1041270.00 | 1041270.00 | 0.00 |
| screens-local-100-images | primeiro comando normal (ms) | 1 | 19.40 | 19.40 | 19.40 | 0.00 |
| screens-local-100-images | normal-first-home (ms) | 1 | 1677.70 | 1677.70 | 1677.70 | 0.00 |
| screens-local-100-images | normal-first-movies (ms) | 1 | 2232.40 | 2232.40 | 2232.40 | 0.00 |
| screens-local-100-images | normal-first-series (ms) | 1 | 815.20 | 815.20 | 815.20 | 0.00 |
| screens-local-100-images | normal-first-category (ms) | 1 | 740.70 | 740.70 | 740.70 | 0.00 |

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