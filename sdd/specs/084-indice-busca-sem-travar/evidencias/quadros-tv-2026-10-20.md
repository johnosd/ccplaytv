# Quadros na TV com o índice em fatias (feature 084) — 2026-10-20

**Classificação**: **gate** parcial (SC-001, SC-002, SC-003, SC-006); **registro** (1ª tecla, diagnóstico de GC).
**Aparelho**: TV de referência QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), lista real sanitizada (43 510 filmes,
9 768 séries, 2 355 canais), mesma carga da linha de base de 2026-10-19
(`sdd/assessments/ajustes-cpu-tv/evidencias/quadros-indice-tv-2026-10-19.md`).
**Origem dos dados**: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl` (testes `quadrosIndice` e
`diagnosticoGc`; só números, sem URL, host, credencial ou nome de item).
**Instalado e desinstalado**: sonda `ccpSondaV2.Capacidades` (3 instalações, todas autorizadas). Ao final: sonda
desinstalada, coletor parado, `applist` só com `8tZqMtwANL.CCPlayTv`.

## Código medido

- Instalação A: índice em fatias, `listAllOfKind(..., clock)` lendo cada categoria inteira por vez.
- Instalações B e C: igual, mas lendo **um pedaço de 500 itens por vez** (`iterateHeaderChunks`), que é o código final.

## `quadrosIndice` — pior quadro (ms) / quadros > 50 ms / tempo de montagem (ms)

Cada instalação roda 2 rodadas seguidas dentro do mesmo processo. Parado: 60–61 fps em todas.

| Cenário | A r1 | A r2 | B r1 | B r2 | Linha de base (4 medições) |
| --- | --- | --- | --- | --- | --- |
| Busca global | 83 / 2 / 3 288 | 183 / 5 / 3 296 | **50 / 0** / 3 454 | 200 / 2 / 3 318 | 183–250 / 15–19 / 2 100–2 300 |
| "Todos" A–Z | 100 / 1 / 4 066 | 167 / 2 / 3 754 | **50 / 0** / 3 816 | 150 / 3 / 4 280 | 933–1 233 |
| "Todos" Ano | 50 / 0 / 2 557 | 150 / 2 / 2 808 | **50 / 0** / 2 810 | 150 / 1 / 2 949 | — |
| "Todos" Adicionados | 33 / 0 / 2 588 | 167 / 1 / 2 800 | **50 / 0** / 2 708 | 167 / 1 / 2 908 | — |
| "Todos" Nota | 33 / 0 / 2 664 | 150 / 1 / 3 047 | **33 / 0** / 2 979 | 150 / 2 / 3 148 | — |
| Remontagem a cada 10 s (12 s) | 58 fps, pior 150, 3 > 50 | 57 fps, pior 167, 4 > 50 | 58 fps, pior 167, 2 > 50 | 57 fps, pior 217, 3 > 50 | 15–17 fps (contínua, a cada 1 s) |
| 1ª tecla ("ma", 7 317 filmes) | 195 ms | 228 ms | 208 ms | 214 ms | — |

(A = instalação A; B = instalação B. A r1/r2 e B r1/r2 são as duas rodadas internas de cada instalação.)

## `diagnosticoGc` (instalação C, código final): 4 montagens seguidas da busca global, nada mais rodando

| Rodada | Montagem (ms) | Quadros | Quadros > 50 ms | Pior quadro (ms) |
| --- | --- | --- | --- | --- |
| 1 | 3 326 | 216 | 0 | < 50 |
| 2 | 3 183 | 203 | 4 | 58 |
| 3 | 3 112 | 197 | 4 | 64 |
| 4 | 3 092 | 200 | 2 | 58 |

A leitura de heap (`performance.memory`) ficou constante em 12 MB e não serve para atribuir pausas de GC.

## Leitura honesta

- **Ganho grande e real**: "Todos" A–Z foi de 933–1 233 ms para 50–167 ms de pior quadro; a busca global foi de 15–19
  quadros > 50 ms para 0–5; a remontagem a cada 10 s roda a 57–58 fps (era 15–17 fps com remontagem contínua).
- **O critério de nenhum quadro > 100 ms NÃO está cumprido em todas as medições.** Cumprido nas rodadas 1 da instalação
  B (pior 50 ms em todos os cenários) e nas 4 montagens isoladas do diagnóstico (pior 64 ms). Não cumprido na 2ª rodada
  de cada instalação (150–217 ms, 1–3 quadros) e na remontagem (pior 150–217 ms).
- **A 2ª rodada é sempre pior** (instalações A e B). A hipótese é pausa de coleta de lixo com o lixo acumulado da 1ª
  rodada (muitas listas de 43 mil itens descartadas pela própria sonda), mas **não está provada**: o diagnóstico isolado
  não reproduz os picos, e o heap medido não permite confirmar.
- **SC-006 (≤ ~3,2 s)**: a busca global leva 3,1–3,5 s (A: 3,29–3,30; B: 3,32–3,45; C: 3,09–3,33). Fica na borda, acima
  do limite em parte das medições.
- **1ª tecla**: 195–228 ms para um termo de 2 letras com 7 317 acertos em filmes. É a ordenação síncrona dos acertos
  (`searchWithinItems`), fora do escopo desta spec; passa de 100 ms → achado novo (R-004).
- **A sonda não decide sozinha**: roda sem React. O aceite final é o `PerfOverlay` no app real (SC-005, T020).
