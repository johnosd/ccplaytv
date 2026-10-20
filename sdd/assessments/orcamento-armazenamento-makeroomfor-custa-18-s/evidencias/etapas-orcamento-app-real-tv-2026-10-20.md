# Etapas do orçamento no app real da TV (2026-10-20)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9. Build de medição (`VITE_CCPLAY_PERF=1` + canal de métricas) com `probeBudget`: roda só as etapas de leitura de
  `makeRoomFor` (conta, estimativa do navegador, candidatos), **sem gravar nem liberar nada**, 3× (20, 80 e 140 s depois de abrir). Lista real, app parado.
- **Origem**: `app-metricas-orcamento.jsonl` (linhas `source: budget`, `mode: probe`). **Classificação**: gate do veredito deste assessment. Só números.

| Etapa (ms) | 1ª | 2ª | 3ª |
| --- | --- | --- | --- |
| `ledgerReadMs` (categorias, manifestos, listas, chaves de blocos) | 145,5 | 130,7 | 125,4 |
| `ledgerCountsMs` (guia, episódios, metadados, por lista) | **836,3** | **782,5** | **801,1** |
| `estimateMs` (`navigator.storage.estimate`) | 25,6 | 1,4 | 1,5 |
| `candStagingMs` | 3,6 | 1,8 | 3,2 |
| `candGuideMs` (`guideStoredBytes` por lista) | **698,3** | **699,8** | **710,1** |
| `candCategoriesMs` | 33,2 | 32,6 | 33,4 |
| `ledgerMs` / `candidatesMs` | 987,2 / 740,3 | 917,0 / 737,4 | 929,9 / 751,8 |
| **`totalMs`** | **1 753** | **1 656** | **1 683** |

Tamanho do que as etapas leem: 390 categorias, 262 blocos, 3 listas, 1 049 episódios, 80 metadados, **0 linhas de guia no formato antigo**, 0 manifestos de projeção.

## Leitura

- **~1,5 s dos ~1,7 s são consultas de contagem** (`ledgerCountsMs` ~0,8 s + `candGuideMs` ~0,7 s), que retornam números pequenos (0, 1 049, 80). Não é volume de dado: é a latência
  de cada consulta ao IndexedDB da TV (~80–230 ms por ida e volta), em sequência, **por lista** (3 listas).
- `candGuideMs` **repete** a contagem de linhas antigas do guia (`epgPrograms`) que `ledgerCountsMs` já fez na mesma chamada.
- A estimativa do navegador (a hipótese inicial) é desprezível. A leitura inicial (~130 ms) também é pequena.
- Na sonda (banco novo, 1 lista) as mesmas etapas custam ~29 ms: a diferença é número de listas × latência por consulta.
