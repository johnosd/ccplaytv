# Assessment Problem: Gravação da carga por seção mais rápida na TV

- **Slug**: gravacao-carga-secao-tv
- **Criado**: 2026-10-19
- **Explora**: ./explora.md

## Problem Statement

Na TV, a carga da seção de filmes da lista real leva 21–33 s. Mais da metade disso é o orçamento de armazenamento da
082 (`makeRoomFor`), que refaz as mesmas varreduras do IndexedDB a cada uma das 35 categorias. Outros 3–5 s são a área
de preparo. A pessoa espera esse tempo para ver contagens completas e categorias preenchidas depois de abrir ou
atualizar uma lista.

## Usuários / Partes Afetadas

- **Pessoa que adiciona, abre ou atualiza uma lista grande na TV**: contagens e categorias ficam "carregando" por dezenas
  de segundos; "Todos" e a busca ficam incompletos nesse tempo.

## Goals

- **Orçamento barato por categoria**: o custo de `makeRoomFor` numa carga por seção deixa de crescer com o número de
  categorias. Por exemplo, o livro-razão é calculado uma vez por carga e atualizado pela categoria gravada, mantendo a
  garantia de teto da 082.
- **Preparo mais barato**: reduzir descarregar, reler e limpar o preparo (2,7–5,0 s), sem voltar a segurar a seção
  inteira na memória quando ela não cabe (FR-013 da 039).
- **Meta**: a carga da seção de filmes da lista real em **≤ 10 s na TV**, medida com a sonda `etapasSecao` e com a carga
  real.

## Non-Goals

- Compressão e formato de gravação da 082 (pedaços de 500, gzip): ~3,3 s, fica como está.
- Leitura de rede e interpretação (descartadas no assessment `leitura-rede-fluxo-tv`).
- O portão `waitUntilAllowed`, que espera a pessoa navegar de propósito.
- A ordem e a prioridade da pré-carga (038).
- Renovação sem mudança (`unchanged`), que já não chama o orçamento.

## Success Metrics

- Sonda `etapasSecao` na TV, lista real (43 510 filmes, 35 categorias), primeira carga: **carga real ≤ 10 s** e orçamento
  ≤ 1 s no total, em ≥ 2 medições. Linha de base: 21–33 s e orçamento de 10,7–18,0 s (4 medições).
- Garantia da 082 mantida: com o teto simulado (`simular-cota-tv.mjs` / E2E `orcamento-armazenamento`), o catálogo nunca
  passa do teto, inclusive com uma gravação concorrente no meio da carga.
- Os mesmos itens gravados nas mesmas categorias (testes de regressão de `loadSection`).

## Cost of Inaction

A demora da carga da lista que o usuário percebe continua: 20–30 s só para a seção de filmes, mais séries e canais. Ela
cresce com o número de categorias e de listas, porque cada chamada do orçamento relê tudo.
