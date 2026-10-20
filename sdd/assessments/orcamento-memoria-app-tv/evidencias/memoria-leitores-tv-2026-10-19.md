# Memória dos leitores reais na TV física (2026-10-19)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9.0, Chromium 120, origem `file:`.
- **Instalação**: sonda `ccpSondaV2.Capacidades` (app separado), autorizada pelo usuário em 2026-10-19. Rodada 1 às 22:58,
  e a rodada 2 às 23:01 depois de desinstalar e reinstalar. Desinstalada ao final; o `applist` mostra só
  `8tZqMtwANL.CCPlayTv`. O CCPlayTV e os dados dele não foram tocados.
- **Código**: os leitores reais do app foram empacotados de `tv-web/src`: `loadGlobalSearchIndex`, `loadSearchIndex`,
  `readKindCursorPage`, `sortVodItems` e o gravador `writeCompressedBlock` da 082. A única réplica é `itemOut`, que não é
  exportado. Fonte: `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/memoria/entrada.ts` e `app2/memoria.js`.
- **Dados**: amostras sanitizadas da lista real (maior categoria de cada tipo), replicadas até a lista real (2 355
  canais, 43 510 filmes, 9 768 séries) e até ~100 mil itens (4 300 / 78 700 / 17 000). Nenhum nome, URL ou credencial
  sai da TV.
- **Origem dos números**: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl` (últimas linhas de
  2026-10-19).

## Gate: folga de 2,2 milhões de objetos com a estrutura viva

Critério definido antes de medir (`decision.md`): o cenário passa se, com a estrutura montada, a TV ainda aloca 2,2
milhões de objetos sintéticos sem fechar o app. Esse número é metade dos 4,4 milhões em que a TV fechou a sonda 2.

| Cenário | Lista | Rodada 1 | Rodada 2 |
| --- | --- | --- | --- |
| Busca global (3 índices) | real | passou | passou |
| "Todos" filmes por nome | real | passou | passou |
| "Todos" filmes na ordem da fonte, até o fim | real | passou | passou |
| Busca global | ~100 mil | passou | passou |
| "Todos" filmes por nome | ~100 mil | passou | passou |
| "Todos" filmes na ordem da fonte, até o fim | ~100 mil | passou | passou |

**Classificação: gate.** Nenhuma queda nas duas rodadas.

## Registro: tamanho das estruturas (ensaio no Chromium do PC, heap retido após GC)

| Cenário | Lista real | ~100 mil |
| --- | --- | --- |
| Busca global | 20,6 MB | 28,0 MB |
| "Todos" por nome | 16,1 MB | 31,8 MB |
| "Todos" na ordem da fonte, até o fim | 9,8 MB | 20,1 MB |
| 2,2 milhões de objetos sintéticos | ~130 MB | — |

O pior cenário retém ~12 % do equivalente aos 4,4 milhões de objetos da sonda 2.

## Registro: tempo para montar cada estrutura na TV (ms)

| Cenário | Real, R1 | Real, R2 | 100 mil, R1 | 100 mil, R2 |
| --- | --- | --- | --- | --- |
| Busca global | 2 041 | 2 086 | 3 860 | 3 823 |
| "Todos" por nome | 2 605 | 2 305 | 4 654 | 4 609 |
| "Todos" na ordem da fonte, **todas** as páginas | 3 398 | 3 267 | 7 624 | 7 743 |
| Semear o banco (gravador da 082) | 7 719 | 7 551 | 13 682 | 13 535 |

Na tela real, "Todos" na ordem da fonte lê uma página por vez. O total acima é o custo de descer até o fim.

## Registro: ordenação por nome na TV (mediana de 3, ms)

| Medida | 11 347 nomes, R1 | R2 | 100 mil, R1 | R2 |
| --- | --- | --- | --- | --- |
| `Intl.Collator('pt-BR', base)` (o do app, `vodSort.ts`) | 136 | 138 | 1 702 | 1 717 |
| `Intl.Collator()` padrão (busca, `catalogSearch.ts`) | 137 | 138 | 1 765 | 1 658 |
| Montar chave (`normalizeForSearch`) | 123 | 81 | 1 000 | 943 |
| Ordenar pela chave pronta | 54 | 53 | 660 | 679 |
| Pares vizinhos em ordem diferente da do app | 126 | 126 | 165 | 165 |

## Diagnóstico (não decide)

- A **memória livre do sistema** (`tizen.systeminfo.getAvailableMemory`) oscilou 100–180 MB entre leituras e às vezes
  **subiu** depois de montar a estrutura (outros processos da TV liberando memória). Não serve para medir o custo de uma
  estrutura de 10–30 MB. A menor leitura na folga foi 99 MB livres (rodada 1, primeiro cenário); as outras ficaram
  entre 285 e 374 MB.

## Leitura honesta

- **Memória**: com folga em todos os cenários, nas duas rodadas, com a lista real e com 100 mil itens. Cada estrutura
  retida é pequena (≤ 32 MB). O risco que motivou a ideia não aparece nos leitores agregados.
- **Limites**: a sonda não tem o resto do app (React, DOM, imagens, React Query com outras telas em cache). A folga de
  2,2 milhões de objetos, ~130 MB, cobre isso com margem, mas não substitui um uso longo do app real. O pico transitório
  da montagem cabe dentro da mesma folga, porque a montagem roda antes dela.
- **Novo achado (latência, não memória)**: montar o índice leva **~2 s** na lista real e **~4 s** com 100 mil itens. É o
  tempo de abrir a busca global ou "Todos" por nome na TV, antes de qualquer renderização.
- **Ordenação**: a chave pronta ordena em ~53 ms contra ~137 ms do Collator (11 mil), e em ~670 ms contra ~1,7 s (100
  mil). Montar a chave na hora custa quase o mesmo que o ganho: só compensa se a chave for calculada uma vez, na
  gravação. Ela também **muda a ordem de 126 pares** em 11 mil nomes.
