# Baseline/candidata 065

Modo: candidate; suite: smoke; 3 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: 8ad4e2d9d68cd7455e7756715ab0c707c464c227ffadf77b1c6df5ef9eef45d4; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| screens-local-100-no-images | home-cold (ms) | 3 | 1488.50 | 1443.40 | 1566.50 | 45.10 |
| screens-local-100-no-images | movies-after-home (ms) | 3 | 871.60 | 826.90 | 875.70 | 4.10 |
| screens-local-100-no-images | series-after-home (ms) | 3 | 469.20 | 466.80 | 506.70 | 2.40 |
| screens-local-100-no-images | home-return (ms) | 3 | 608.00 | 578.90 | 682.30 | 29.10 |
| screens-local-100-no-images | movies-index-cold (ms) | 3 | 218.10 | 207.10 | 219.00 | 0.90 |
| screens-local-100-no-images | movie-category-cold (ms) | 3 | 627.30 | 621.70 | 633.70 | 5.60 |
| screens-local-100-no-images | heap H→F→S (MiB) | 3 | 22.62 | 22.62 | 22.62 | 0.00 |
| screens-local-100-no-images | preparo seed CPU1 (ms) | 3 | 7165.85 | 7138.50 | 7319.42 | 27.35 |
| screens-local-100-no-images | armazenamento adicional do roteiro (MiB) | 3 | 0.07 | 0.07 | 0.07 | 0.00 |
| screens-local-100-no-images | seleção pura (ms) | 3 | 270.10 | 238.00 | 276.40 | 6.30 |
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