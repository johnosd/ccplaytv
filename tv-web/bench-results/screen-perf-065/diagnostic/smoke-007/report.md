# Baseline/candidata 065

Modo: baseline; suite: smoke; 1 amostras independentes por configuração; CPU 4×.
Revisão: e0ec6ef553418c4052cdb4794c83b998f1e558fe; app SHA256: 3cf5ad1d9953006fe62a7ecacfd5e4054187002904216fabe7daa81461c44d06; harness SHA256: 8bcb4a337cf1c9df7082855a5c8ccdd8f58e5679b590f0d4053db4978b7bff48.

| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |
| --- | --- | --- | --- | --- | --- | --- |
| category-30000 | home-cold (ms) | 1 | 1173.10 | 1173.10 | 1173.10 | 0.00 |
| category-30000 | movies-after-home (ms) | 1 | 602.80 | 602.80 | 602.80 | 0.00 |
| category-30000 | series-after-home (ms) | 1 | 232.30 | 232.30 | 232.30 | 0.00 |
| category-30000 | home-return (ms) | 1 | 99.10 | 99.10 | 99.10 | 0.00 |
| category-30000 | movies-index-cold (ms) | 1 | 57.00 | 57.00 | 57.00 | 0.00 |
| category-30000 | category-first (ms) | 1 | 299.60 | 299.60 | 299.60 | 0.00 |
| category-30000 | heap H→F→S (MiB) | 1 | 23.33 | 23.33 | 23.33 | 0.00 |
| category-30000 | preparo seed CPU1 (ms) | 1 | 3509.37 | 3509.37 | 3509.37 | 0.00 |
| category-30000 | armazenamento adicional do roteiro (MiB) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | seleção pura (ms) | 1 | 278.60 | 278.60 | 278.60 | 0.00 |
| category-30000 | Workers criados (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | chamadas simuladas (contagem) | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| category-30000 | pico temporário amostrado (MiB) | 1 | 11.25 | 11.25 | 11.25 | 0.00 |

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