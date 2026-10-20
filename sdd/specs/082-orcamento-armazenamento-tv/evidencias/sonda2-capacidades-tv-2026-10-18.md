# Sonda 2: capacidades da TV física (2026-10-18)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9.0, Chromium 120, origem `file:`.
- **Instalação**: app de teste **separado** (`ccpSondaV2.Capacidades`, código em `../sonda-tv/app2/`), autorizado pelo
  usuário e desinstalado ao final. O `applist` mostra só `8tZqMtwANL.CCPlayTv`.
- **Dados**: amostras sanitizadas da lista real, geradas por `../sonda-tv/medir-lista-real.mjs` (sem host do provedor,
  sem credencial, sem URL de stream), mais dados sintéticos. O relatório bruto está em `sonda-tv2.jsonl`.
- **Amostras** (a maior categoria de cada tipo): filmes 11 347 itens (3,9 M caracteres), séries 1 931, canais 550; guia
  com 60 canais.
- **Medição no PC com a lista inteira**: `medicao-lista-real-pc-2026-10-18.json`.

## Lista real inteira (PC, a compressão não depende do aparelho)

| Parte | Hoje (como o app grava) | Enxuto + gzip em pedaços de 500 |
| --- | --- | --- |
| Filmes (43 510 itens, 35 categorias) | blocos 14,7 MB + **projeção 065: 18,7 MB** | ~1,9 MB |
| Séries (9 768) | blocos 4,1 MB + projeção 2,7 MB | ~0,7 MB |
| Canais (2 355) | 0,6 MB | 0,05 MB |
| Guia (41 616 programas; 10 122 na janela −12 h/+48 h) | linhas 3,2 MB (na TV, 20 mil linhas ocupam **14 MB**) | ~0,6 MB (por canal) |
| **Total** | **~44 MB** (estimativa por JSON; na TV ocupa mais, veja abaixo) | **~3,3 MB** |

A projeção da 065, uma 2ª cópia das categorias com 1 000 itens ou mais, é a **maior parte do catálogo**.

## Na TV

### Memória

| Medida | Valor |
| --- | --- |
| RAM total (Tizen) | **1,49 GB**; livre no início: **310 MB** |
| `jsHeapSizeLimit` | **364 MB**. O `performance.memory` fica sempre em 10 MB (quantizado, **inútil** para medir na TV) |
| Objetos JS pequenos | A TV **fechou o app** perto de **4,4 milhões** de objetos (sem erro capturável) |
| Buffers externos | 352 MiB alocados até o sistema ficar com < 200 MB livres (a sonda parou ali, como planejado) |
| Núcleos / `deviceMemory` | 4 / 1 |

### CPU (11 347 filmes, 3,9 M caracteres)

| Operação | TV | PC (referência) |
| --- | --- | --- |
| `JSON.parse` | 84 ms (44 MB/s) | 8 ms |
| `structuredClone` | 173 ms (mais lento que parse) | — |
| Ordenar por nome: simples / `localeCompare` / `Intl.Collator` | 18 / 114 / 144 ms | — / — / 20 ms |
| Tirar acentos de todos os nomes | 48 ms | — |
| Buscar por substring (11 mil nomes) | 3,8 ms | 0,5 ms |

### Compressão e pedaços (thread principal)

| Filmes (11 347) | gzip | pedaço 250 | pedaço 500 | pedaço 1 000 | pedaço 2 000 |
| --- | --- | --- | --- | --- | --- |
| Tamanho | 0,60 MB (**6,5×** sobre o JSON atual; 4,8× sobre o enxuto) | 0,61 | 0,61 | 0,60 | 0,60 |
| 1º pedaço (descomprimir + parse, mediana) | — | **6,6 ms** | **12,7 ms** | 18,5 ms | 40,4 ms |
| Tudo | 120 + 60 ms | 320 ms | 230 ms | 204 ms | 210 ms |
| Comprimir | 379 ms | 598 | 539 | 507 | 491 |

Para comparar: séries ficam 5,5× menores, e canais 13,4×. `deflate-raw` é igual ao gzip.

### IndexedDB (mesma categoria de 11 347 filmes)

| Formato | Ocupa | Gravar | Ler (mediana) |
| --- | --- | --- | --- |
| Objetos, como hoje | **3,62 MB** (a TV não comprime) | 214 ms | **178 ms** |
| Objetos enxutos | 2,69 MB | 163 ms | 162 ms |
| gzip, 1 registro | 0,60 MB | 45 ms | 190 ms |
| **gzip, pedaços de 500** | **0,61 MB** | 52 ms | **13,8 ms (1º pedaço)**; tudo 297 ms |

- **20 mil linhas pequenas** (como o guia hoje): gravar **14,5 s**, ocupar 14 MB, `getAll` 1,6 s, `count` 139 ms. Uma
  faixa pelo índice levou 3,3 ms.
- **`clear()` não devolve espaço**: o uso foi de 14,0 MB para 15,6 MB e assim ficou por 70 s (compactação atrasada).
  Já o `deleteDatabase` devolve na hora (sonda 1).

### Worker

| Medida | Valor |
| --- | --- |
| Abrir um Worker e receber a 1ª resposta | 36 ms |
| IndexedDB / CompressionStream / `tizen` no Worker | sim / sim / sim |
| Mandar 11 mil objetos (ida e volta, clone) | **195 ms** |
| Mandar os mesmos dados como `ArrayBuffer` transferido | **1,4 ms** |
| Quadros com a compressão **no Worker** | **60 fps**, pior quadro 17 ms |
| Quadros com a compressão **na thread principal** | 54 fps, **pior quadro 250 ms** |
| Quadros com 3× `JSON.parse` na principal | pior quadro 215 ms |
| Comprimir no Worker (parse + stringify + gzip) | 83 + 460 ms; 2 Workers em paralelo: 228 ms (contra 577) |

### Renderização (grade de 140 cards, 7 por linha)

| Cenário | fps | Pior quadro |
| --- | --- | --- |
| Parado | 61 | 17 ms |
| Foco só com `scale(1.06)` | 52 | 33 ms |
| **Foco completo (scale + outline + box-shadow com brilho)** | **38** | **133 ms** (5 quadros > 50 ms) |
| Foco completo com uma faixa de `backdrop-filter: blur` | 32 | 217 ms |
| Rolar a grade (transform ou scrollTop) | 50 | 34 ms |

Outras medidas: decodificar uma capa de 300×450 com `img.decode()` leva 33 ms, e com `createImageBitmap` 5 ms. Montar
140 cards leva 99 ms, e trocar 140 títulos leva 30 ms.

### Rede local (TV ↔ PC)

| Medida | Valor |
| --- | --- |
| Ping (mediana / máximo) | 20 / 52 ms |
| Baixar 20 MB inteiro | 43,8 Mbit/s (3,8 s) |
| Ler os mesmos 20 MB em fluxo (`getReader`) | **5,9 s**, em 3 065 pedaços de ~7 KB (55 % mais lento) |
| Baixar 0,6 MB em gzip e descomprimir | 337 ms |

### Guia: linhas contra comprimido por canal (rodadas parciais da sonda 2, pendência B-05)

Amostra real de 60 canais, ampliada até a janela real: **10 122 programas, 104 canais**.

| Formato | Gravar | Ocupa | Ler 20 canais |
| --- | --- | --- | --- |
| Linhas, como hoje (índice `[sourceId+generation+channelKey+start]`, lotes de 500) | **10,2 s** (~450 ms por lote) | 2,55 MB | 301 ms |
| Por canal, gzip, na thread principal | 0,97 s (comprimir 874 ms + gravar 98 ms) | 0,65 MB | 123 ms |
| Por canal, gzip, **no Worker**, gravando no próprio IndexedDB | **1,01 s** (parse + agrupar 107 ms, gzip 795 ms, gravar 109 ms) | 0,61 MB | — |

- **Tela com o Worker trabalhando**: 60 fps, pior quadro 17 ms.
- **1ª rodada (lotes de 2 000 linhas)**: o teste foi abortado com `TimeoutError: Transaction timed out due to inactivity`
  depois de 150 s. **Na TV, transações grandes de IndexedDB podem ser abortadas por tempo.** Gravar em lotes pequenos,
  ou em poucos registros comprimidos, evita isso.

### APIs e mídia

- **Disponíveis**:
  - `structuredClone`, `OffscreenCanvas`, `createImageBitmap`, `ResizeObserver`, `IntersectionObserver`,
    `requestIdleCallback`, `BroadcastChannel`;
  - WebAssembly com SIMD, `SharedArrayBuffer`;
  - `scheduler.postTask`, `navigator.scheduling.isInputPending`, `Intl.Segmenter`, observer de long tasks;
  - CSS: container queries, `:has()`, `content-visibility`, `backdrop-filter`.
- **Indisponível**: `scheduler.yield`.
- **Mídia** (MSE + `canPlayType`): H.264, HEVC, VP9, AV1, AAC e E-AC-3 dão "probably". HLS e TS dão "maybe" sem MSE
  (usar AVPlay, como hoje).
