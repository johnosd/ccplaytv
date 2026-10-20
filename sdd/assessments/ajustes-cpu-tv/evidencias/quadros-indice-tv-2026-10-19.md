# Quadros durante a montagem do índice de busca na TV (2026-10-19)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9.0, Chromium 120.
- **Instalação**: sonda `ccpSondaV2.Capacidades`, autorizada pelo usuário. Instalação 1 às 23:18 e instalação 2 às 23:23
  (desinstala e reinstala), cada uma com 2 rodadas internas. Desinstalada ao final; o `applist` mostra só
  `8tZqMtwANL.CCPlayTv`.
- **Código**: os leitores reais do app foram empacotados (`loadGlobalSearchIndex`; `loadSearchIndex` + `itemOut` +
  `sortVodItems(…, 'az')` para "Todos" por nome), em `sonda-tv/memoria/entrada.ts`. O teste é `quadrosIndice`, em
  `sonda-tv/app2/memoria.js`.
- **Dados**: lista real replicada a partir das amostras sanitizadas (2 355 canais, 43 510 filmes, 9 768 séries),
  gravada pelo gravador da 082.
- **Medida**: `P.frames`, cadência de `requestAnimationFrame` na thread principal. A página não tem React: o app real só
  pode ser igual ou pior.
- **Origem**: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl`.

## Resultado (gate)

| Medida | I1 R1 | I1 R2 | I2 R1 | I2 R2 |
| --- | --- | --- | --- | --- |
| Parado: fps / pior quadro | 60 / 17 ms | 60 / 17 | 61 / 17 | 60 / 17 |
| Busca global: montar | 2 167 ms | 2 148 | 2 310 | 2 098 |
| Busca global: fps / pior / quadros > 50 ms | 35 / **217** / **15** | 35 / 250 / 15 | 32 / 233 / 19 | 36 / 183 / 16 |
| "Todos" por nome: montar | 2 327 ms | 2 344 | 2 672 | 2 396 |
| "Todos" por nome: fps / pior / quadros > 50 ms | 33 / **983** / **10** | 33 / 933 / 13 | 29 / **1 233** / 12 | 32 / 1 017 / 12 |
| Remontagem contínua por 10 s (5 montagens): fps / pior / quadros > 50 ms | **15** / 283 / **74** | 17 / 367 / 63 | 15 / 300 / 74 | 15 / 383 / 72 |

O critério de `go` (algum quadro > 100 ms, ou mais de 5 quadros > 50 ms numa montagem, ou travamento contínuo com
remontagem) foi atingido **nas quatro medições, em todos os cenários**.

## Leitura

- **A busca global trava a tela**: ~2,1–2,3 s de montagem com 15–19 quadros > 50 ms e o pior de 183–250 ms. O controle
  responde aos trancos durante ~2 s ao abrir a busca.
- **"Todos" A–Z congela por ~1 s** (pior quadro de 933–1 233 ms). É a ordenação síncrona de 43 mil itens com
  `Intl.Collator` (`sortVodItems`) numa tarefa só. No PC o mesmo passo deu 150 ms.
- **Com a pré-carga invalidando o índice a cada lote**, a tela cai para **15–17 fps por 10 s** (63–74 quadros > 50 ms).
  Isso acontece quando a busca ou "Todos" por nome estão abertos logo depois de abrir ou atualizar uma lista.
- O usuário não tinha percebido. ASSUMPTION: o travamento de ~2 s pode se confundir com "carregando", e a pior
  situação (pré-carga correndo com a busca aberta) é rara no uso. O número é do aparelho.
