# Baseline/candidata 065

Modo: candidate; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: f6ed277f5394c1269a18473ab08e3fd2696bb393; app SHA256: 6b978ca04389152147d3adc6872f91d8cd7cc0aae2772ee5013bfefd1cd62a43; harness SHA256: b4c2bd9854da3b4468a13e6272ce5fe0d3e3211e1a294a6e318e5a699b344d8e.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| cycles-local | home-cold (ms) | 1 | 2065.60 | 2065.60 | 2065.60 | 0.00 |
| cycles-local | movies-after-home (ms) | 1 | 367.80 | 367.80 | 367.80 | 0.00 |
| cycles-local | series-after-home (ms) | 1 | 259.20 | 259.20 | 259.20 | 0.00 |
| cycles-local | home-return (ms) | 1 | 291.80 | 291.80 | 291.80 | 0.00 |
| cycles-local | movies-index-cold (ms) | 1 | 254.30 | 254.30 | 254.30 | 0.00 |
| cycles-local | heap H→F→S (MiB) | 1 | 7.41 | 7.41 | 7.41 | 0.00 |
| cycles-local | preparo seed CPU1 (ms) | 1 | 20895.78 | 20895.78 | 20895.78 | 0.00 |
| cycles-local | armazenamento adicional do roteiro (MiB) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | seleção pura (ms) | 1 | 226.00 | 226.00 | 226.00 | 0.00 |
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