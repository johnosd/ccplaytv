# Rodada de controle — o medidor está inocente (feature 088)

**Data**: 2026-10-22 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`)
**Classificação**: **gate** — decide entre "o alvo era artefato" e "o problema é do app"
**Origem**: `evidencias/app-metricas-tv-2026-10-22-controle.jsonl` (55 linhas) · 29 janelas de ~5 s

## 1. A pergunta e o critério, declarados ANTES de medir

As duas rodadas anteriores atribuíram **95,4%** do tempo em que a thread fica presa a trabalho **fora** de todas as
etapas medidas, e nenhuma fonte do canal explicou. Sobrou uma suspeita que não se podia deixar de pé: **o próprio
painel de medição**. Ele fazia `setState` a cada quadro lento e outro a cada 500 ms — ~10 re-renders por janela de
5 s, contra uma mediana de **9 tarefas longas** por janela. A cadência coincidia.

Build de controle (`VITE_CCPLAY_PERF_QUIET=1`): ficam de pé só as medidas **passivas** (o `PerformanceObserver` de
`longtask`, o laço de quadros que apenas lê o relógio, e a emissão a cada 5 s). Saem o painel visual — verificado
ausente do pacote, por 3 marcadores — e **todo** `setState`.

| `longTaskMs` mediana | Conclusão declarada antes | Consequência |
| --- | --- | --- |
| < 750 ms (queda ≥ 50%) | o medidor era boa parte do medido | encerrar a 088: o alvo não existia |
| **> 1 200 ms** (queda < 20%) | **confirmado no app** | **investigar** |
| 750–1 200 ms | parcial | decisão do usuário |

## 2. O resultado

| Medida (mediana por janela) | Com painel | **Sem painel** | Δ |
| --- | --- | --- | --- |
| `longTaskMs` | 1 479 ms | **1 399 ms** | **−5%** |
| `longTaskMaxMs` | 422 ms | **420 ms** | **−0%** |
| `longTasks` | 9 | 8 | −11% |
| `ltForaMs` | 1 435 ms | 1 325 ms | −8% |
| `ltForaMax` | 422 ms | 420 ms | −0% |
| `fps` | 39 | 41 | +5% |
| `worstMs` | 417 ms | 400 ms | −4% |
| Thread presa | 30% | **28%** | — |

**1 399 ms está acima de 1 200 ms: o critério dá "confirmado no app".** O medidor responde por **no máximo 5%** do
tempo preso, e a pior tarefa longa é **idêntica** (420 contra 422 ms) — ou seja, o congelamento que a pessoa sente não
tem nada a ver com a instrumentação. A suspeita está eliminada, e eliminada com número.

### 2.1 Um ganho de brinde: **Séries foi medida**

Nesta rodada a sonda alcançou `screen: series` na janela 2 (171 teclas, **40 fps**, pior quadro 733 ms) — contra
`movies` na janela 1 (164 teclas, 36 fps, pior 817 ms). As duas telas se comportam **igual**, o que fecha a lacuna
aberta pelo R-009 quanto ao comportamento (o `falhas = 2` continua, então a cobertura de 4 janelas segue não atingida).

## 3. Onde isso deixa a feature

O problema é **real, do app, e grande**: 28% da thread presa, pior quadro 400 ms (mediana) e até 817 ms. A referência
de quanto há para ganhar não é especulação — três janelas da rodada 1 saíram limpas e deram **55, 59 e 55 fps**, com
*mais* teclas que as outras.

Mas ele está **fora do escopo desta spec**. As três etapas do caminho `tecla → render → capa` somam menos de 5%, e a
Fase 4 foi planejada para reduzir exatamente esse caminho.

## 4. A hipótese que sobra (e não está medida)

Uma leitura coerente com todos os números, **e explicitamente não comprovada**: o trabalho pode ser *disparado* pela
navegação mas *acontecer depois* do primeiro quadro pintado — que é onde o intervalo `render` fecha. A vitrine rola, o
virtualizador recalcula, linhas novas montam; nada disso cabe dentro de "da tecla até o primeiro quadro". Sustenta:
8 tarefas longas por janela contra 14 teclas — cerca de uma a cada duas teclas.

**Refuta ou enfraquece**: o intervalo entre teclas é ~357 ms, então uma janela larga depois da tecla cobriria quase
todo o tempo e não discriminaria nada. O discriminador correto seria o **atraso** de cada tarefa longa desde a última
tecla (concentrado perto de 0 → é a navegação; uniforme → não é). **Isso não foi medido**, e por isso a hipótese fica
registrada como hipótese — não como causa. É o terceiro ciclo de instrumentação que ela custaria.

## 5. Segurança (FR-011 / SC-008)

`.jsonl` auditado: fora dos carimbos de tempo, só `source`, `outcome` (`done`/`failed`), `screen`
(`home`/`movies`/`series`), `reason` (`cap`/`ready`) e `kind` (`movie`/`series`/`channel`) — conjunto fechado. Nenhum
nome de item, URL, host ou credencial. Pacote normal reinstalado; nada foi desinstalado.
