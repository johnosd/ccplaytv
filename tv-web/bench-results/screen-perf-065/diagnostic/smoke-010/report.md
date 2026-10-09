# Baseline/candidata 065

Modo: baseline; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: 28d8613ecb02d35ad67f052c78cfed032ec8b78b06d3b731d50ca5f2b0d70088.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-images | home-cold (ms) | 1 | 1549.60 | 1549.60 | 1549.60 | 0.00 |
| screens-local-100-images | movies-after-home (ms) | 1 | 1358.90 | 1358.90 | 1358.90 | 0.00 |
| screens-local-100-images | series-after-home (ms) | 1 | 564.60 | 564.60 | 564.60 | 0.00 |
| screens-local-100-images | home-return (ms) | 1 | 695.80 | 695.80 | 695.80 | 0.00 |
| screens-local-100-images | movies-index-cold (ms) | 1 | 292.70 | 292.70 | 292.70 | 0.00 |
| screens-local-100-images | movie-category-cold (ms) | 1 | 441.20 | 441.20 | 441.20 | 0.00 |
| screens-local-100-images | heap H→F→S (MiB) | 1 | 27.90 | 27.90 | 27.90 | 0.00 |
| screens-local-100-images | preparo seed CPU1 (ms) | 1 | 8325.59 | 8325.59 | 8325.59 | 0.00 |
| screens-local-100-images | armazenamento adicional do roteiro (MiB) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | seleção pura (ms) | 1 | 684.00 | 684.00 | 684.00 | 0.00 |
| screens-local-100-images | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | chamadas simuladas (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-images | abertura lista=false/cold (ms) | 1 | 3503.80 | 3503.80 | 3503.80 | 0.00 |
| screens-local-100-images | JS abertura lista=false/cold (bytes) | 1 | 1007752.00 | 1007752.00 | 1007752.00 | 0.00 |
| screens-local-100-images | abertura lista=false/warm (ms) | 1 | 3174.50 | 3174.50 | 3174.50 | 0.00 |
| screens-local-100-images | JS abertura lista=false/warm (bytes) | 1 | 1007752.00 | 1007752.00 | 1007752.00 | 0.00 |
| screens-local-100-images | abertura lista=true/cold (ms) | 1 | 3187.90 | 3187.90 | 3187.90 | 0.00 |
| screens-local-100-images | JS abertura lista=true/cold (bytes) | 1 | 1007752.00 | 1007752.00 | 1007752.00 | 0.00 |
| screens-local-100-images | abertura lista=true/warm (ms) | 1 | 3214.40 | 3214.40 | 3214.40 | 0.00 |
| screens-local-100-images | JS abertura lista=true/warm (bytes) | 1 | 1007752.00 | 1007752.00 | 1007752.00 | 0.00 |

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