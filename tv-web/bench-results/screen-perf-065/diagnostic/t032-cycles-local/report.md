# Baseline/candidata 065

Modo: candidate; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3997a312444599c2d1274dd66f57a067b605ec11590e5025592bd889c1aeafc8; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| cycles-local | home-cold (ms) | 1 | 1425.10 | 1425.10 | 1425.10 | 0.00 |
| cycles-local | movies-after-home (ms) | 1 | 1224.60 | 1224.60 | 1224.60 | 0.00 |
| cycles-local | series-after-home (ms) | 1 | 319.10 | 319.10 | 319.10 | 0.00 |
| cycles-local | home-return (ms) | 1 | 229.70 | 229.70 | 229.70 | 0.00 |
| cycles-local | movies-index-cold (ms) | 1 | 218.90 | 218.90 | 218.90 | 0.00 |
| cycles-local | heap H→F→S (MiB) | 1 | 23.65 | 23.65 | 23.65 | 0.00 |
| cycles-local | preparo seed CPU1 (ms) | 1 | 20499.17 | 20499.17 | 20499.17 | 0.00 |
| cycles-local | armazenamento adicional do roteiro (MiB) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | seleção pura (ms) | 1 | 1022.00 | 1022.00 | 1022.00 | 0.00 |
| cycles-local | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | chamadas simuladas (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |

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