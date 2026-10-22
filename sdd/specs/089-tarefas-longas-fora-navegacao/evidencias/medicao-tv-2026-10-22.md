# Rodada 1 de 4 — o atraso desde a tecla (feature 089, Fase 3)

**Data**: 2026-10-22 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), IP `192.168.0.12`
**Classificação**: **gate** para SC-006; **gate** para a atribuição
**Origem**: `evidencias/app-metricas-tv-2026-10-22.jsonl` (93 linhas) · 55 janelas de ~5 s · build de medição **com**
painel (`VITE_CCPLAY_PERF` + `METRICS_REPORT` + `AUTOPILOT`, sem `PERF_QUIET`)
**Orçamento**: rodada **1 de 4** (FR-010/SC-012)

## 1. SC-006 cumprido: a sonda cobriu as quatro janelas

| Janela | Tela | Teclas | fps | Pior quadro | > 50 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | `movies` | 157 | 34 | 850 ms | 132 |
| 1 | **`series`** | 166 | 38 | 717 ms | 116 |
| 2 | `movies` | 154 | 36 | 733 ms | 115 |
| 2 | **`series`** | 171 | 41 | 750 ms | 107 |
| 0 (resumo) | — | 0 | — | — | **`falhas: 0`** |

O conserto do limite de subidas (`passosAteTopbar()`, derivado do DOM) **funcionou na lista real**: as três rodadas da
feature 088 fechavam com `falhas = 2` e só Filmes era medido. Agora Séries entrou duas vezes, e se comporta igual a
Filmes (38/41 fps contra 34/36) — o que fecha a dúvida que a 088 deixou aberta no R-009 de lá.

Linha de base preservada: thread presa **31%** (mediana de 1 557 ms por janela de 5 s), pior quadro 433 ms de mediana,
37 fps. Dentro da faixa das rodadas da 088 (28–30%), então a instrumentação nova **não alterou o que mede**.

## 2. A distribuição do atraso (FR-002)

A soma fecha **exatamente** com o total de tarefa longa — 89 662 ms de 89 662 ms. O invariante do contrato vale no
aparelho, não só no teste.

| Faixa de atraso desde a última tecla | Tempo | % do total | Amostras |
| --- | --- | --- | --- |
| 0–50 ms | 14 919 ms | 16,6% | 89 |
| 50–150 ms | 21 329 ms | 23,8% | 144 |
| 150–300 ms | 25 080 ms | 28,0% | 98 |
| acima de 300 ms | 25 787 ms | 28,8% | 141 |
| sem tecla anterior | 2 547 ms | 2,8% | 11 |

**A proporção bruta engana**, porque as faixas têm larguras diferentes. Normalizando pela largura (o intervalo entre
teclas foi de 357 ms nas janelas de navegação plena), o que se espera de uma distribuição **uniforme** é que cada faixa
leve a sua fatia de tempo. Comparando observado com esperado:

| Faixa | Observado | Esperado se uniforme | Razão | Leitura |
| --- | --- | --- | --- | --- |
| 0–50 ms | 17,3% | 14,0% | **1,23×** | enriquecido |
| 50–150 ms | 26,5% | 28,0% | 0,95× | uniforme |
| 150–300 ms | 30,3% | 42,0% | **0,72×** | empobrecido |
| **acima de 300 ms** | 25,9% | 16,0% | **1,62×** | **enriquecido forte** |

(38 janelas com `teclaN ≥ 13`, isto é, navegação contínua.)

O padrão é **bimodal**: há trabalho logo depois da tecla (1,23×) e, mais forte, trabalho **no fim do intervalo**, a
300 ms ou mais dela (1,62×). O meio é empobrecido.

### 2.1 Não é artefato das pausas da sonda

A suspeita óbvia era que o enriquecimento acima de 300 ms viesse das pausas entre janelas, quando a sonda não digita.
**Não é**: o efeito é mais forte justamente onde a navegação é plena, e desaparece onde ela é fraca.

| Janelas | `atrasoAcima300` (razão) |
| --- | --- |
| Navegação plena (`teclaN ≥ 13`, n=38) | **1,62×** |
| Pouca tecla (`teclaN < 13`, n=17) | 1,07× (uniforme) |

## 3. Dois candidatos eliminados nesta rodada

**A pré-carga, por leitura de código.** `IDLE_AFTER_KEY_MS = 2000` (`lib/catalog/prefetch/prefetchScheduler.ts:66`): o
portão de atividade só libera trabalho de fundo depois de **2 s** sem tecla. A sonda digita a cada 357 ms, então o
portão **nunca abre** durante a navegação. Confirma, por outro caminho, a refutação que a 088 fez por correlação.

**A decodificação/pintura de capa, por correlação.** Dentro das janelas de navegação plena:

| Janelas | `atrasoAcima300Ms` | Pior quadro | `longTaskMaxMs` |
| --- | --- | --- | --- |
| `capaN = 0` (n=7) | 333 ms | 400 ms | 395 ms |
| `capaN ≥ 1` (n=31) | 328 ms | — | — |
| `capaN ≥ 8` (n=20) | 373 ms | 409 ms | 414 ms |

Sem **nenhuma** capa pintando, o tempo acima de 300 ms é o mesmo (333 contra 328–373) e o pior quadro é igual (400
contra 409). A capa não é o dono desse tempo.

## 4. O que esta rodada NÃO entregou

**O dono dos 95,4% não foi nomeado.** As etapas do caminho de navegação seguem respondendo por pouco — `ltTeclaMs`
mediana 1 ms, `ltRenderMs` 92 ms de 1 557 ms (~6%), `ltForaMs` 1 452 ms (**93%**) — e agora se sabe *quando* esse
tempo acontece, mas não *de quem* é.

O que o padrão descarta e o que deixa de pé:

- **Descarta** trabalho puramente síncrono com a tecla: só 17% está nos primeiros 50 ms, com enriquecimento modesto.
- **Descarta** trabalho periódico independente da navegação: o efeito desaparece quando a navegação para.
- **Deixa de pé** trabalho que a navegação dispara e que **transborda o intervalo entre teclas** — chega atrasado
  porque está atrás de outra coisa na fila, ou porque depende de um ciclo assíncrono.

Candidatos **não medidos** compatíveis com isso: as consultas que a mudança de foco dispara ou invalida, o recálculo do
virtualizador em resposta ao scroll programático (`useVirtualFocusSync` chama `scrollToIndex` a cada troca de foco), e
leitura de IndexedDB de categorias que entram na janela visível. **Nenhum deles foi medido, e nomear um agora seria
exatamente o erro que o FR-001 proíbe** — já cometido duas vezes nesta investigação.

## 5. Leitura honesta

SC-001 (< 15%), SC-002 (< 300 ms) e SC-003 (≥ 45 fps) seguem **reprovados**: 31%, 433 ms, 37 fps. Nada foi otimizado —
e não poderia ser, porque o FR-001 exige o alvo nomeado primeiro.

O que esta rodada entregou de concreto: **SC-006 cumprido** (a sonda mede as quatro janelas, Séries incluída), o
invariante da soma validado no aparelho, dois candidatos eliminados com número, e o padrão temporal caracterizado.
O que falta é uma medida que separe as três candidatas restantes — e ela custa a rodada **2 de 4**, consumindo a folga
do orçamento (era o achado **A-01** do `handoff.md`, previsto no planejamento).

## 6. Segurança (FR-014)

`.jsonl` auditado antes desta evidência: fora dos carimbos de tempo, os únicos valores não numéricos são `source`
(`showcase`/`assembly`/`frames`/`section-load`/`entry`), `outcome` (`done`/`failed`), `kind`
(`movie`/`series`/`channel`), `screen` (`home`/`movies`/`series`) e `reason` (`ready`) — todos do conjunto fechado.
Nenhum nome de item, categoria, canal, URL, host ou credencial. Pacote normal reinstalado e o app relançado; **nada foi
desinstalado** e os dados da TV foram preservados (`deploy-tv.ps1 -SkipBuild`).
