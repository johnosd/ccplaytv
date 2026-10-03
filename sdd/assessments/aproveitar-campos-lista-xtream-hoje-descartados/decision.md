# Assessment Decision: Aproveitar campos da lista Xtream hoje descartados

- **Slug**: aproveitar-campos-lista-xtream-hoje-descartados
- **Decidido**: 2026-10-03 (reavaliado após a fase Explora; a primeira decisão, no mesmo dia, foi `needs-clarification`)
- **Problem**: ./problem.md
- **Explora**: ./explora.md
- **Veredito**: go (escopo reduzido)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | Campos preenchidos e descartados (séries: genre 96%, backdrop 97%; `rating` > 0 em 66,8% dos filmes e 82,0% das séries). Que a pessoa sinta a espera continua sem medição de usuário (`ASSUMPTION`), mas o custo medido de `get_vod_info` (mediana 570 ms, p90 830 ms) a sustenta. |
| Força da evidência | adequate | Listas inteiras (43.161 filmes, 9.690 séries) para peso e cobertura; amostras de 90/60 filmes para `get_vod_info` e 29 pares para a nota vs TMDB (pequenas, tratadas como indício). |
| Valor vs. custo de inação | adequate | Sem quebra funcional, mas o custo de fazer é muito baixo (ver viabilidade), o que equilibra. Ganho: nota/gênero/fundo no card e hero sem esperar rede ou TMDB; nota para a fileira do item 68. |
| Viabilidade / apetite | strong | Acréscimo medido: ~279 KB (rating dos filmes) e ~1 MB (rating+genre+backdrop das séries), contra 17,5 MB e 9,7 MB já baixados. O app tolera `get_*_info` vazio (`titleMetadata.ts:103`, "nunca lança"). Falta só medir o efeito nos blocos do IndexedDB (feature 039), tarefa de plano, não bloqueio. |
| Fit estratégico | adequate | Alinha com a constituição (nota rotulada, `0` = sem nota). Sobrepõe o item 68 do backlog, que a feature deve alimentar, não duplicar. |

Nenhum critério central está `weak` ou `unknown`; a barra de `go` foi atingida.

## O que a Explora mudou
- **`year` sai do escopo.** Só 1,1% dos filmes sem `year` têm ano no título, e na amostra sem pista
  nenhuma (90 filmes), `tmdb_id`, `release_date`, `cast` e `youtube_trailer` vieram **0/90**. São
  títulos pobres na origem; nem extração do título nem `get_vod_info` os resgatam.
- **Pré-busca em lote de `get_vod_info` está descartada.** Com 10 requisições paralelas, cerca de
  40% voltaram vazias. Continua sob demanda.
- **Peso deixou de ser incógnita.** Era a objeção principal ao escopo amplo.

## Abordagens Candidatas

### A. Campos curtos da listagem + nota rotulada (recomendada)
- Importar `rating` (filmes e séries) e, só nas séries, `genre` e a 1ª URL de `backdrop_path`
  para o registro do título. Exibir nota somente se > 0, rotulada "do provedor". `genre` do
  provedor é rótulo de exibição; não substitui categorias da fonte.
- **Recomendada**: sim — menor risco, alinhada ao item 68, ganho medido a custo baixo.

### B. A + ordenação por nota no cliente
- Permitir ordenar a categoria por nota (sem nota por último, ordenar antes de paginar).
- **Recomendada**: não nesta feature — é o escopo do item 68 e do 29; sequenciar depois de A.

### C. Importar também `plot`/`cast` na listagem
- Rejeitada: peso maior no IndexedDB e já vêm sob demanda no `get_*_info`.

## Veredito

`go`, com escopo reduzido em relação ao pedido inicial ("amplo"). A Explora derrubou a incógnita de
viabilidade e mostrou que `year` e pré-busca não rendem. O que fica (nota + gênero + fundo, de
campos já baixados) tem custo medido baixo e ganho real, mesmo que modesto. A incerteza que resta
é o quanto a pessoa percebe a diferença; por isso o valor está `adequate`, não `strong`.

### Se go — Handoff

- **Problema**: a importação Xtream descarta `rating` (filmes e séries) e `genre`/`backdrop_path`
  (séries), que já chegam na listagem; cards e hero esperam `get_*_info`/TMDB para ter esses dados.
- **Abordagem recomendada**: A — importar esses campos curtos para o registro do título; nota
  exibida só se > 0 e rotulada "do provedor"; `genre` só para exibição.
- **Escopo sugerido**: entra — `rating` filmes/séries; `genre` e 1ª `backdrop_path` das séries;
  exibição rotulada no card/hero onde já couber; atualização de `tizenFiles`/schema Dexie se mudar
  o formato do bloco (feature 039). Não entra — `year` (descartado), ordenação/fileira (item 68),
  `plot`/`cast` na lista, catch-up, pré-busca de `get_vod_info`.
- **Métricas de sucesso**: séries com gênero, nota e fundo no card/hero com 0 requisições extras;
  nenhuma nota `0` exibida; nota sempre rotulada; acréscimo no IndexedDB ≤ ~1,5 MB na lista
  real e sem aumento perceptível de tempo de importação/entrada na categoria.
- **Perguntas em aberto pro sdd-specify**: (1) a feature alimenta o item 68 ou o 68 consome o
  campo depois? (2) o rótulo "do provedor" substitui ou convive com a nota do TMDB quando as duas
  existem? (3) em qual tela/card a nota aparece primeiro (V14 §16)? (4) como ficam as listas M3U,
  que não trazem esses campos (sem nota, sem rótulo)?
