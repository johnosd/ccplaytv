# Medição na TV, rodada 2 — a partição das tarefas longas (feature 088, T0291)

**Data**: 2026-10-22 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`)
**Classificação**: **gate** — é esta rodada que decide o rumo da feature
**Origem**: `evidencias/app-metricas-tv-2026-10-22-rodada2.jsonl` (53 linhas) · 29 janelas de ~5 s
**O que mudou em relação à rodada 1**: a atribuição por tarefa longa (T025) e a etapa `capa` corrigida (T027). Nada
de otimização — FR-001.

## 1. Primeiro: uma correção da leitura da rodada 1

A rodada 1 concluiu que **o re-render responde por 23%** do tempo em que a thread fica presa. **Está errado, e o erro
é meu.** Eu dividi `renderMs` (352 ms) por `longTaskMs` (1 658 ms) — mas `renderMs` é **tempo de parede** entre a tecla
e o primeiro quadro, e `longTaskMs` é **tempo de thread**. É o mesmo erro de categoria que eu havia diagnosticado na
etapa `capa` duas horas antes, cometido na linha seguinte.

Medindo quanto de tarefa longa cai **dentro** do intervalo `render`: **4,5%**, não 23%.

## 2. A partição (a resposta)

45 853 ms de tarefa longa, repartidos **por construção** (a soma fecha: 45 857 ms, 4 ms de arredondamento):

| Onde o tempo preso está | ms | % | Mediana por janela |
| --- | --- | --- | --- |
| `ltTeclaMs` — dentro do manipulador de tecla | 30 | **0,1%** | 1 ms |
| `ltRenderMs` — entre a tecla e o primeiro quadro | 2 063 | **4,5%** | 77 ms |
| **`ltForaMs` — fora de todas as etapas** | **43 764** | **95,4%** | **1 435 ms** |

E a pior tarefa longa da sessão inteira — **777 ms** — está **inteiramente fora** das três etapas (`ltForaMax` =
`longTaskMaxMs` = 777 ms). O mesmo vale para a 2ª (707 ms) e a 3ª (600 ms).

Mediana de **9 tarefas longas por janela** de 5 s, contra 14 teclas. O intervalo `render` cobre ~7% do tempo da janela
e captura 4,5% das tarefas longas: **as tarefas longas são praticamente independentes das teclas.** Elas não estão
concentradas na navegação — estão espalhadas no tempo.

### 2.1 A etapa `capa`, agora que mede trabalho

Com a correção do R-008 (do `onLoad` até o quadro seguinte): **10 ms por capa**, mediana de 122 ms por janela com
8 capas. Comparável, pequeno, e **não** é a causa — o que também enterra a correlação sugestiva da rodada 1.

## 3. O que roda nesses 95,4%? Nenhuma fonte conhecida

Cruzando as 29 janelas com cada fonte do canal (mediana de `ltForaMs`):

| Fonte de fundo | Janelas COM | `ltForaMs` | fps | Janelas SEM | `ltForaMs` | fps |
| --- | --- | --- | --- | --- | --- | --- |
| `entry` (pré-carga lendo categoria) | 9 | 1 281 | 40 | 20 | 1 439 | 38 |
| `section-load` (carga da lista) | 3 | 1 442 | 36 | 26 | 1 424 | 40 |
| `showcase` (produtor do Top 10/Dica, 087) | 2 | 1 082 | 43 | 27 | 1 435 | 39 |
| `assembly` (montagem de tela) | 4 | 1 399 | 39 | 25 | 1 435 | 39 |

**Todas planas.** Nenhuma move o número, e três delas vão na direção contrária. Isto confirma a refutação da rodada 1
(a pré-carga não é a causa) e estende a mesma conclusão ao produtor da 087 e à carga da lista.

E as cinco piores janelas:

| Hora | `ltForaMax` | fps | O que havia de fundo |
| --- | --- | --- | --- |
| 14:14:45 | **777 ms** | 7 | **nada** |
| 14:14:25 | 707 ms | 19 | **nada** |
| 14:13:16 | 600 ms | 26 | **nada** |
| 14:14:05 | 581 ms | 29 | `entry` (348 ms) |
| 14:14:29 | 581 ms | 44 | `entry` (136 ms) |

As três piores aconteceram com **nada** rodando de fundo.

## 4. Reprodutibilidade (SC-005)

As duas rodadas da sonda, independentes, na mesma sessão e com a mesma lista:

| | Rodada 1 | Rodada 2 |
| --- | --- | --- |
| Janela 1 (Filmes) | 37 fps, pior 717 ms, 163 teclas | **37 fps, pior 683 ms**, 163 teclas |
| Janela 2 (Filmes) | 40 fps, pior 700 ms, 166 teclas | **40 fps, pior 717 ms**, 166 teclas |
| `falhas` | 2 | **2** |

Idênticas dentro do ruído. A medição é confiável — e a falha em alcançar **Séries** é **reproduzível**, não acidente
(R-009).

## 5. Leitura honesta

**Esta rodada inocenta o caminho de navegação.** Somadas, as três etapas do caminho `tecla → render → capa` respondem
por **menos de 5%** do tempo em que a thread fica presa. Com números do aparelho, estão eliminadas:

- otimizar o manipulador de tecla (0,1%);
- memoizar à mão o que acontece entre a tecla e o primeiro quadro (4,5%);
- mexer em decodificação/pintura de capa (10 ms cada);
- e, por eliminação, a pré-carga, a carga da lista, o produtor do Top 10/Dica e a montagem de tela.

**O que esta rodada NÃO diz:** de quem são os 95,4%. Os candidatos restantes são trabalho que o canal **não
instrumenta** e que não tem relação com a tecla — re-renders e recálculo de virtualização *depois* do primeiro quadro,
style/layout do scroll, timers e consultas do app, e o próprio painel de medição (que roda um `setInterval` de 500 ms;
ele existia igual na linha de base, então não criou o problema, mas pode inflar o número).

**Não vou nomear um deles.** Foi exatamente assim que a feature 087 e a rodada 1 erraram, e o FR-001 existe por isso.

SC-001 (< 15%), SC-002 (< 300 ms) e SC-003 (≥ 45 fps) seguem **reprovados**: 30% de thread presa, pior quadro 417 ms
(mediana), 39 fps. Nada foi otimizado — e a medição agora diz que **otimizar o caminho de navegação não os alcançaria**.

## 6. Segurança (FR-011 / SC-008)

`.jsonl` auditado: fora dos carimbos de tempo, os únicos valores não numéricos são `source`
(`showcase`/`assembly`/`frames`/`section-load`/`entry`), `outcome` (`done`/`failed`), `screen` (`home`/`movies`),
`reason` (`cap`/`ready`) e `kind` (`movie`/`series`/`channel`) — todos do conjunto fechado. Nenhum nome de item, URL,
host ou credencial. Pacote normal reinstalado e verificado sem marcador; nada foi desinstalado.
