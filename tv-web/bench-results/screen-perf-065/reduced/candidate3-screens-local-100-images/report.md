# Baseline/candidata 065

Modo: candidate; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: 7be81446dcf5d2d372d96c15649e9dc82b197471; app SHA256: 1d6eb72f4759c45ff9eeb5781456dd42d9403d572d13cbe7b878c0719d8d9e86; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-images | home-cold (ms) | 2 | 2013.55 | 1978.70 | 2048.40 | 34.85 |
| screens-local-100-images | movies-after-home (ms) | 2 | 494.00 | 492.80 | 495.20 | 1.20 |
| screens-local-100-images | series-after-home (ms) | 2 | 374.40 | 368.60 | 380.20 | 5.80 |
| screens-local-100-images | home-return (ms) | 2 | 738.65 | 678.10 | 799.20 | 60.55 |
| screens-local-100-images | movies-index-cold (ms) | 2 | 414.25 | 302.80 | 525.70 | 111.45 |
| screens-local-100-images | movie-category-cold (ms) | 2 | 376.55 | 372.60 | 380.50 | 3.95 |
| screens-local-100-images | heap H→F→S (MiB) | 2 | 11.60 | 11.60 | 11.60 | 0.00 |
| screens-local-100-images | preparo seed CPU1 (ms) | 2 | 8659.82 | 8138.51 | 9181.13 | 521.31 |
| screens-local-100-images | armazenamento adicional do roteiro (MiB) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | seleção pura (ms) | 2 | 252.75 | 247.40 | 258.10 | 5.35 |
| screens-local-100-images | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | abertura lista=false/cold (ms) | 2 | 797.60 | 693.10 | 902.10 | 104.50 |
| screens-local-100-images | JS abertura lista=false/cold (bytes) | 2 | 864581.00 | 864581.00 | 864581.00 | 0.00 |
| screens-local-100-images | abertura lista=false/warm (ms) | 2 | 536.25 | 486.70 | 585.80 | 49.55 |
| screens-local-100-images | JS abertura lista=false/warm (bytes) | 2 | 864581.00 | 864581.00 | 864581.00 | 0.00 |
| screens-local-100-images | abertura lista=true/cold (ms) | 2 | 493.15 | 455.60 | 530.70 | 37.55 |
| screens-local-100-images | JS abertura lista=true/cold (bytes) | 2 | 752889.00 | 641197.00 | 864581.00 | 111692.00 |
| screens-local-100-images | abertura lista=true/warm (ms) | 2 | 504.35 | 470.00 | 538.70 | 34.35 |
| screens-local-100-images | JS abertura lista=true/warm (bytes) | 2 | 864581.00 | 864581.00 | 864581.00 | 0.00 |
| screens-local-100-images | primeiro comando normal (ms) | 2 | 20.90 | 15.90 | 25.90 | 5.00 |
| screens-local-100-images | normal-first-home (ms) | 2 | 2235.25 | 2194.30 | 2276.20 | 40.95 |
| screens-local-100-images | normal-first-movies (ms) | 2 | 1035.60 | 1026.80 | 1044.40 | 8.80 |
| screens-local-100-images | normal-first-series (ms) | 2 | 548.65 | 477.50 | 619.80 | 71.15 |
| screens-local-100-images | normal-first-category (ms) | 2 | 1034.80 | 893.40 | 1176.20 | 141.40 |

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