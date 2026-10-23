# Medição "antes" (T002) — substituída, e por que ela não basta

**Data**: 2026-10-22 · **Decisão do usuário**: não instalar na TV agora; usar como "antes" as rodadas mais recentes
da feature 089.

## O que existe

`sdd/specs/089-tarefas-longas-fora-navegacao/evidencias/medicao-tv-2026-10-22-rodada3.md` (mesma TV de referência,
Samsung QN50Q60DAGXZD, Tizen 9 / Chromium 120), medianas em navegação plena:

| Medida | Valor |
| --- | --- |
| Thread presa (% da janela de 5 s) | 26% (`longTaskMs` 1 319 ms) |
| `longTaskMaxMs` | 342 ms |
| `fps` | 44 |
| `worstMs` | 350 ms |

## Por que isto NÃO é uma linha de base comparável

- A regra da feature 089 (`CLAUDE.md`) diz que **as três primeiras rodadas da 089 mediram ~53% de navegação na lista
  lateral de categorias**, não nos cards — o roteiro da sonda ainda usava `←`. A rodada 3 é uma delas.
- A rodada 4 — a primeira com a sonda consertada (só `→`/`↓`) — foi **abortada**
  (`evidencias/rodada4-abortada.md`).
- Não há medição da 089 de **reprodução** (thread/fps tocando um filme) nem de **tempo até começar a tocar**.

Então: os números acima servem como **referência de ordem de grandeza**, nunca como o "antes" do SC-009.

## Como o SC-009 será medido no G-2 (T042), em vez disso

Na mesma sessão, na mesma TV, com a sonda consertada (só `→`/`↓`):

1. **Build A** = o commit imediatamente anterior ao primeiro commit de código da 090 (sem a feature) — em
   2026-10-22, `85e2ead` (`fix(bugs): fecha o url-do-stream…`); confirmar com `git log` na T042.
2. **Build B** = o build com a 090.
3. Para cada build: sonda de navegação (≥ 2 rodadas, para estimar o ruído), 60 s de reprodução do mesmo filme, tempo até
   tocar (5 aberturas). No build B, a reprodução é medida **com** e **sem** legenda externa ativa.
4. Regressão de B sobre A acima do ruído entre rodadas **reprova** o G-2 (D-012).

Isto pede **duas** instalações na TV na T042 — a autorização será pedida antes de cada uma.
