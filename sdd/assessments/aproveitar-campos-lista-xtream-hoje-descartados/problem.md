# Assessment Problem: Aproveitar campos da lista Xtream hoje descartados

- **Slug**: aproveitar-campos-lista-xtream-hoje-descartados
- **Criado**: 2026-10-03
- **Explora**: não rodada (a evidência é o probe real do painel, feito nesta conversa)

## Problem Statement

A importação Xtream descarta campos que o painel já entrega na listagem (`rating`/`rating_5based`
em filmes e séries; `genre`, `backdrop_path`, `plot`, `cast` em séries) e o `year` ausente em 41%
dos filmes não tem alternativa local. Resultado: cards, hero e descoberta em catálogo grande
dependem de `get_vod_info`/`get_series_info` (feature 032) ou do TMDB, com espera de rede e
sem funcionar sem chave TMDB.

## Usuários / Partes Afetadas

- Pessoa que navega Filmes/Séries na TV — vê card/hero sem nota, gênero ou fundo até o detalhe
  carregar; não consegue achar títulos bem avaliados entre ~43 mil filmes.
- Pessoa sem chave TMDB — só tem o que a lista e o `get_*_info` entregam.
- Rede/provedor — cada título aberto gera chamadas a `get_*_info` e ao TMDB.

## Goals

- Mostrar dados descritivos curtos (gênero, nota com origem, fundo) sem esperar rede/TMDB, a
  partir do que a lista já traz.
- Permitir descoberta em catálogo grande por nota (ordenação/fileira), com procedência explícita.
- Quando possível, reduzir chamadas de rede sem perder qualidade nem quebrar o funcionamento atual.
- Melhorar a cobertura de `year` onde o painel não o declara.

## Non-Goals

- Catch-up (`tv_archive`) e mudanças de EPG.
- Importar `cast`/`plot` longos na listagem (peso no IndexedDB; já vêm sob demanda).
- Substituir categorias declaradas pela fonte por gênero (constituição).
- Apresentar a nota do painel como IMDb ou sem rótulo de origem; nota `0` nunca é exibida.

## Success Metrics

- Séries: gênero, nota e fundo disponíveis no card/hero com 0 requisições extras (medido por E2E).
- Nota do painel exibida só quando > 0 e rotulada "do provedor"; 0 ocorrências de "0" como nota.
- Ordenação/fileira por nota em categoria de filme grande, sem aumento perceptível de tempo de
  entrada na categoria (a medir; ver perguntas bloqueantes).
- Menos chamadas a `get_*_info`/TMDB por sessão de navegação (linha de base ainda não medida).
- Tamanho do IndexedDB após importação da lista real: acréscimo aceitável (limite a definir).

## Cost of Inaction

O app continua funcionando, e `get_*_info` + TMDB cobrem o detalhe. Perde-se descoberta em
catálogo grande e dados imediatos no card/hero, e quem não tem chave TMDB fica com hero pobre.
Não há quebra funcional; é custo de qualidade percebida.
