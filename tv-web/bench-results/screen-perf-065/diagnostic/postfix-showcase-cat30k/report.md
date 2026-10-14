# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: f0e07cdac48acc1aeadcbce0779ea13f7d54eacbbbbf4ea3aa812b4870632d9b; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 3 | 1444.60 | 1410.00 | 1445.40 | 0.80 |
| category-30000 | movies-after-home (ms) | 3 | 248.90 | 222.20 | 265.90 | 17.00 |
| category-30000 | series-after-home (ms) | 3 | 182.10 | 182.10 | 184.80 | 0.00 |
| category-30000 | home-return (ms) | 3 | 139.80 | 129.60 | 141.60 | 1.80 |
| category-30000 | movies-index-cold (ms) | 3 | 69.40 | 61.30 | 75.50 | 6.10 |
| category-30000 | category-first (ms) | 3 | 239.20 | 234.60 | 240.90 | 1.70 |
| category-30000 | heap H→F→S (MiB) | 3 | 6.33 | 6.33 | 6.33 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 3 | 3645.56 | 3579.14 | 3732.70 | 66.42 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | seleção pura (ms) | 3 | 136.20 | 135.20 | 140.90 | 1.00 |
| category-30000 | Workers criados (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 3 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 3 | 17.62 | 17.46 | 17.88 | 0.16 |

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