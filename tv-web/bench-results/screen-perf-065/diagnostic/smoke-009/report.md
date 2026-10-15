# Baseline/candidata 065

Modo: baseline; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: 60c1b9d4632c427435ae905c7ce0371dba3f504e2f027aef6d4c90e5023a794a.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| cycles-tmdb | home-cold (ms) | 1 | 1724.20 | 1724.20 | 1724.20 | 0.00 |
| cycles-tmdb | movies-after-home (ms) | 1 | 1135.80 | 1135.80 | 1135.80 | 0.00 |
| cycles-tmdb | series-after-home (ms) | 1 | 544.20 | 544.20 | 544.20 | 0.00 |
| cycles-tmdb | home-return (ms) | 1 | 574.20 | 574.20 | 574.20 | 0.00 |
| cycles-tmdb | movies-index-cold (ms) | 1 | 188.50 | 188.50 | 188.50 | 0.00 |
| cycles-tmdb | heap H→F→S (MiB) | 1 | 32.11 | 32.11 | 32.11 | 0.00 |
| cycles-tmdb | preparo seed CPU1 (ms) | 1 | 22862.21 | 22862.21 | 22862.21 | 0.00 |
| cycles-tmdb | armazenamento adicional do roteiro (MiB) | 1 | 0.01 | 0.01 | 0.01 | 0.00 |
| cycles-tmdb | seleção pura (ms) | 1 | 650.20 | 650.20 | 650.20 | 0.00 |
| cycles-tmdb | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| cycles-tmdb | chamadas simuladas (contagem) | 1 | 145.00 | 145.00 | 145.00 | 0.00 |

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