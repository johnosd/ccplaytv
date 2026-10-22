# Rodada 3 de 4 — ganho real, pela razão errada (feature 089, Fase 4)

**Data**: 2026-10-22 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120), IP `192.168.0.12`
**Classificação**: **gate** — primeira das duas rodadas de verificação do FR-005
**Origem**: `evidencias/app-metricas-tv-2026-10-22-rodada3.jsonl` · 37 janelas de navegação plena (`teclaN ≥ 13`)
**Mudança sob teste**: `useCategoryPreviews` sem a consulta "da janela" — só o que falta, está stale ou foi invalidado é
buscado (`catalogApi.ts` + `previewWindow.ts`)
**Orçamento**: rodada **3 de 4**. Resta **uma**.

## 1. O resultado

Antes (rodada 2) e depois (rodada 3), medianas em navegação plena:

| Medida | Antes | Depois | Δ |
| --- | --- | --- | --- |
| `longTaskMs` (thread presa) | 1 522 ms | **1 319 ms** | **−13%** |
| Thread presa, em % da janela | 30% | **26%** | −4 pontos |
| `longTaskMaxMs` | 385 ms | **342 ms** | −11% |
| `ltForaMs` | 1 451 ms | **1 242 ms** | −14% |
| `fps` | 40 | **44** | **+10%** |
| `worstMs` | 383 ms | **350 ms** | −9% |
| **`queriesN`** | 274 | **280** | **+2%** |
| `idbTxN` | 9 | 11 | +22% |
| `scrollsN` | 6 | 6 | 0% |

Janelas da sonda: Filmes 37/38 fps, Séries 39/41, pior quadro 733–783 ms, `falhas = 0`.

## 2. A correção que esta rodada me obriga a fazer

**`queriesN` não caiu — e eu previ que cairia.** O teste unitário mostra que a mudança leva a janela de prévias de ~6
consultas tocadas por deslize para **3 eventos de cache por deslize**. Na TV, o total por janela ficou igual (274 → 280).

A conclusão que se tira disso: **a janela de prévias não era a maior fonte dos 274 eventos.** O `queriesN` era um
**indicador** correto — correlacionava com o tempo preso (41 fps com poucos eventos, 33 com muitos, rodada 2) — mas a
atribuição da *fonte* desses eventos à janela de prévias estava **errada**. Os ~280 eventos vêm, em sua maior parte, de
outras consultas do aplicativo, que esta rodada não identifica.

**E o ganho é real mesmo assim**: −13% de thread presa, −11% na pior tarefa longa, +4 fps. A explicação compatível é
que a mudança cortou **trabalho** sem cortar **eventos**: deixou de criar e destruir uma consulta por tecla, e deixou de
rodar um `Promise.all` com um `fetchQuery` por categoria da janela a cada tecla — custo de orquestração (promessas,
microtarefas, montagem do mapa) que não aparece na contagem de eventos do cache.

Ou seja: acertei o alvo **por baixo** do motivo declarado. Registro isso em vez de reescrever a história — foi o mesmo
tipo de erro do R-012 da feature 088 ("o render é 23%"), e a disciplina de medir antes e depois é o que o pega.

## 3. Os alvos continuam reprovados

| Critério | Alvo | Antes | Depois | Situação |
| --- | --- | --- | --- | --- |
| **SC-001** thread presa | < 15% | 30% | **26%** | **reprovado** |
| **SC-002** pior quadro | < 300 ms | 383 ms | **350 ms** | **reprovado** |
| **SC-003** fps mediano | ≥ 45 | 40 | **44** | **reprovado por 1** |
| **SC-006** `falhas` | 0 | 0 | **0** | cumprido |

O fps ficou a **um** ponto do alvo. Os outros dois seguem longe — a thread presa precisaria cair outros 11 pontos.

## 4. Leitura honesta

O que esta rodada prova: a mudança **move os três números na direção certa**, e o ganho é mensurável em todos eles.
O que ela **não** prova: que a razão declarada para o ganho estava certa (não estava, ver §2), nem que o alvo da feature
é alcançável — com 26% contra < 15%, falta mais da metade do caminho.

Pelo FR-005, um ganho só conta quando aparece em **duas** rodadas independentes. Esta é a primeira. A rodada **4 de 4**
é a última do orçamento (FR-010), e usá-la para confirmar significa encerrar a feature com **ganho parcial confirmado e
alvos não atingidos** — o que o FR-010 prevê como resultado honesto.

Nada foi ajustado depois de ver o resultado: a tabela de alvos é a mesma do `quickstart.md` §4, escrita antes da
primeira rodada.

## 5. Segurança (FR-014)

`.jsonl` auditado: só `source`, `outcome` (`done`/`failed`), `screen` (`home`/`movies`/`series`), `reason`
(`cap`/`ready`) e `kind` (`movie`/`series`/`channel`) — conjunto fechado, nenhum nome de item ou credencial. Pacote
normal reinstalado; nada desinstalado.
