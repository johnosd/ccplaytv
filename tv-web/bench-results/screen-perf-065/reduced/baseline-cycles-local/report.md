# Baseline/candidata 065

Modo: baseline; suite: smoke; 2 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: c70ff7b7fa5e4b111eb0b9e2048e6599c050ca908b2436dc138e09f013b191d7.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| cycles-local | home-cold (ms) | 2 | 1645.75 | 1621.30 | 1670.20 | 24.45 |
| cycles-local | movies-after-home (ms) | 2 | 1101.55 | 1090.00 | 1113.10 | 11.55 |
| cycles-local | series-after-home (ms) | 2 | 458.10 | 452.20 | 464.00 | 5.90 |
| cycles-local | home-return (ms) | 2 | 293.95 | 291.80 | 296.10 | 2.15 |
| cycles-local | movies-index-cold (ms) | 2 | 279.85 | 274.50 | 285.20 | 5.35 |
| cycles-local | heap H→F→S (MiB) | 2 | 23.78 | 23.77 | 23.78 | 0.00 |
| cycles-local | preparo seed CPU1 (ms) | 2 | 19328.28 | 19308.81 | 19347.75 | 19.47 |
| cycles-local | armazenamento adicional do roteiro (MiB) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | seleção pura (ms) | 2 | 561.95 | 559.80 | 564.10 | 2.15 |
| cycles-local | Workers criados (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-local | chamadas simuladas (contagem) | 2 | 0.00 | 0.00 | 0.00 | 0.00 |

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