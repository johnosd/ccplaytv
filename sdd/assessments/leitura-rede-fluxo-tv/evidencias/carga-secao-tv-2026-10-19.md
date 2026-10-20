# Carga da seção de filmes no Worker, na TV (2026-10-19)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9.0, Chromium 120.
- **Instalação**: sonda `ccpSondaV2.Capacidades`, autorizada pelo usuário. Duas instalações (23:18 e 23:23), cada uma
  com 2 rodadas internas. Desinstalada ao final; o `applist` mostra só `8tZqMtwANL.CCPlayTv`.
- **Código**: Worker `sonda-tv/memoria/cargaWorker.ts` com o código real: `readJsonArrayStream` + `mapVodEntry`, e
  `loadSection` inteira (lê, prepara a cada 20 mil itens, grava as 35 categorias comprimidas pelo gravador da 082). A
  resposta vem do coletor na rede local (`/amostra/vodraw.json`). A credencial do banco é fictícia e o `fetchImpl` ignora
  a URL montada: nada foi enviado a um provedor.
- **Dados**: resposta `get_vod_streams` reconstruída das amostras sanitizadas (`memoria/gerar-vod-bruto.mjs`): 43 510
  filmes em 35 categorias, 15,4 MB (a real tem 16,5 MB).
- **Origem**: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl`.

## Resultado (ms; I = instalação, R = rodada)

| Variante | I1 R1 | I1 R2 | I2 R1 | I2 R2 |
| --- | --- | --- | --- | --- |
| Download inteiro, sem interpretar | 6 112 | 2 602 | 1 926 | 1 960 |
| Fluxo puro (`getReader`, só conta) | 3 480 | 2 375 | 1 942 | 2 078 |
| Fluxo + interpretar (**como hoje**) | 4 874 | 3 530 | 3 604 | 3 490 |
| Pedaços juntados em 256 KB + interpretar | 5 413 | 3 717 | 3 825 | 4 570 |
| Inteiro + interpretar | 5 785 | 6 210 | 6 101 | 6 495 |
| **Carga real da seção (`loadSection`), como hoje** | **22 260** | **20 727** | **21 105** | **21 967** |
| Carga real com pedaços juntados | 22 431 | 22 752 | 21 243 | 22 877 |

As variantes leram os mesmos 43 510 itens, e as cargas reais gravaram 35 categorias com 43 510 itens.

## Leitura

- **A leitura em fluxo não é o gargalo dentro do Worker.** Na rede local estável (I2), o fluxo puro (1,9–2,1 s) ficou
  igual ao download inteiro (1,9–2,0 s). Os 55 % da sonda 2 vinham da thread principal, sem Worker.
- **Juntar pedaços não ajuda** (+0,2 a +1,1 s) e **ler inteiro piora** (+2,5 a +3 s, um parse de 15 MB numa tarefa só).
- **A carga real leva ~21 s, e só ~3,5 s disso é baixar e interpretar.** Os outros **~17–18 s** são a parte de gravação
  da `loadSection`: área de preparo a cada 20 mil itens, releitura do preparo e, por categoria, `renewCategoryItems` com
  compressão e `makeRoomFor`. É aí que está a demora da carga da lista que o usuário percebe. ASSUMPTION parcial: a
  divisão interna desses ~17 s entre preparo, compressão e IndexedDB não foi medida.
- **Variação de rede**: o primeiro download da I1 (6,1 s) foi um ponto fora da curva. As demais leituras convergem.
