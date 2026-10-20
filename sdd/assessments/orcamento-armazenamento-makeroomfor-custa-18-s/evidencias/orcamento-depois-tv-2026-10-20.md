# Orçamento depois do ajuste, no app real da TV (2026-10-20)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9. Build de medição, `probeBudget` (só leitura), lista real, app parado, 3 amostras por variante. Só números.
- **Origem**: `app-metricas-orcamento.jsonl` (antes) e `app-metricas-orcamento-depois.jsonl` (variantes do ajuste). **Classificação**: gate do ajuste.

| Variante | `ledgerCountsMs` | `candGuideMs` | `totalMs` (3 amostras) |
| --- | --- | --- | --- |
| Antes | ~800 | ~700 | 1 753 / 1 656 / 1 683 |
| 1. Candidatos reaproveitam a contagem de guia do ledger + listas em paralelo | ~800 | ~0 | 1 059 / 967 / 973 |
| 2. Metadados por chaves + chaves únicas do guia | ~1 100–1 200 (**pior**) | ~0 | 1 381 / 1 299 / 1 283 |
| **3. Guia antigo só consultado em lista sem guia novo (final)** | **~200–250** | ~0 | **473 / 373 / 390** |

## O que cada variante ensinou

- **Variante 1**: a contagem repetida do guia nos candidatos custava ~0,7 s; tirá-la deu −40 %, mas as contagens por lista seguiram em ~800 ms mesmo em paralelo.
- **Variante 2**: ler chaves com cursor (`titleMetadata.orderBy().keys()`, `epgPrograms.orderBy().uniqueKeys()`) é **mais lento** que `count()` no IndexedDB da TV. Revertido.
- **Medição por contagem** (variantes 1 e 2): a consulta ao `epgPrograms` levava ~0,8–1,0 s **mesmo vazia**, e episódios e metadados terminavam ~100 ms depois. O custo é tocar a
  tabela do guia antigo, esvaziada na conversão do guia (consultas a uma tabela esvaziada ficam lentas no IndexedDB do Chromium).
- **Variante 3**: o guia antigo só existe enquanto a lista não tem o guia novo (`epgStoredBytes` indefinido; a conversão e a publicação apagam as linhas). Sem consultar a tabela nas outras listas,
  as contagens caem de ~800 para ~200–250 ms. `guideStoredBytes` (usado na sincronização do guia) segue a mesma regra.

## Resultado

`makeRoomFor` (etapas de leitura) de **~1,7 s para ~0,37–0,47 s** por chamada no app real (≈ 4×), dentro da meta de ≤ 500 ms. Fora da meta de partida de 200 ms (a leitura inicial da conta, ~130 ms, e as contagens de
episódios e metadados, ~100 ms, dominam o que sobra).

Limite do que prova: probe de leitura com o app parado; não foi medida uma carga completa depois do ajuste (a ressincronização com blocos iguais não chama o orçamento).
