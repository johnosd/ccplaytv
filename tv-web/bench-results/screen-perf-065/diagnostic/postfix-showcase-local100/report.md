# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: f0e07cdac48acc1aeadcbce0779ea13f7d54eacbbbbf4ea3aa812b4870632d9b; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-no-images | home-cold (ms) | 3 | 2213.40 | 2209.10 | 2405.90 | 4.30 |
| screens-local-100-no-images | movies-after-home (ms) | 3 | 406.80 | 393.20 | 407.00 | 0.20 |
| screens-local-100-no-images | series-after-home (ms) | 3 | 276.60 | 274.40 | 288.70 | 2.20 |
| screens-local-100-no-images | home-return (ms) | 3 | 577.60 | 576.10 | 589.60 | 1.50 |
| screens-local-100-no-images | movies-index-cold (ms) | 3 | 207.20 | 186.10 | 212.90 | 5.70 |
| screens-local-100-no-images | movie-category-cold (ms) | 3 | 338.70 | 318.40 | 348.20 | 9.50 |
| screens-local-100-no-images | heap H→F→S (MiB) | 3 | 11.18 | 11.17 | 11.30 | 0.01 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 3 | 7034.74 | 6952.89 | 7290.38 | 81.85 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 3 | 0.07 | 0.07 | 0.07 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 3 | 281.50 | 229.20 | 298.20 | 16.70 |
| screens-local-100-no-images | Workers criados (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| screens-local-100-no-images | chamadas simuladas (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |

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