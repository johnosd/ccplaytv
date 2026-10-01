# Assessment Problem: Carga de listas — progresso claro, entrada instantânea, contagens e atualização

- **Slug**: carga-listas-progresso-claro-entrada-instantanea
- **Criado**: 2026-09-30
- **Explora**: ./explora.md

## Problem Statement

Depois de incluir uma lista Xtream ou URL, a pessoa não entende o que o app
está carregando, espera a cada primeira entrada em categoria de Live TV,
Filmes e Séries, não sabe o tamanho de uma categoria antes de abri-la e não
enxerga quando a lista foi ou está sendo atualizada. O app parece lento e
opaco justamente na primeira impressão, embora a causa (carga sob demanda,
feature 010) tenha sido uma escolha correta contra o congelamento da TV.

## Usuários / Partes Afetadas

- **Pessoa que acabou de incluir uma lista** — vê uma tela de progresso
  genérica ("Etapa: Lendo categorias", "Categorias lidas: N") sem saber se
  são canais, filmes, séries ou guia, nem o que falta.
- **Pessoa navegando o catálogo** — a primeira entrada em cada categoria
  leva **~1 minuto** na TV (observado pelo dono do produto, 2026-09-30; a
  meta aprovada pela 010 era ≤ 3 s); só a categoria em que o cursor repousou
  300 ms chega pronta.
- **Pessoa escolhendo o que abrir** — a contagem de itens só aparece depois
  de entrar (Xtream não declara contagem em `get_*_categories`; M3U guardada
  já sabe, via `declaredCount`).
- **Pessoa que usa a lista por dias** — a atualização (24 h ao abrir a fonte,
  24 h por categoria) é invisível; teme que a atualização trave a TV.
- **Dono do produto** — é a dor principal de primeira impressão (prioridade
  declarada: alta, antes de tudo).

## Goals

- **Tela de carga honesta e específica**: uma linha por etapa real — Canais,
  Filmes, Séries, Guia (EPG) — com estado (aguardando / em andamento /
  pronto / falhou) e contagens reais de categorias/itens de cada uma; nunca
  percentual inventado.
- **Entrada instantânea na maioria das categorias**: depois que a lista abre,
  uma **pré-carga em segundo plano** vai obtendo as categorias aos poucos,
  em ritmo baixo, cedendo à navegação e **pausando durante a reprodução**,
  para que entrar numa categoria já carregada leia só do disco.
- **Contagem exata assim que for conhecida**: mostrar o número real de itens
  por categoria no trilho/navegação lateral assim que a categoria tiver sido
  carregada (pela pré-carga ou por entrada); antes disso, um estado honesto
  ("ainda não carregada"), nunca número inventado. M3U guardada mostra desde
  a importação (já é conhecida).
- **Atualização visível e sem travar**: indicar quando a lista foi atualizada
  e quando está atualizando agora (reaproveitando os estados da 034), e
  garantir que a atualização por idade/categoria não deixe a navegação lenta.

## Non-Goals

- **Voltar à importação eager** (gravar tudo antes de liberar a lista) — a
  lista continua navegável em segundos, como na 010.
- **Contagem total de itens da fonte Xtream na importação** (exigiria baixar
  a seção inteira — fora de escopo também na 034).
- **Escolher a frequência de atualização** (manual/diária/ao abrir) — não é
  a dor relatada; o prazo de 24 h continua.
- **Reconciliação de favoritos/progresso pós-resync** (item 24) e
  **single-flight de importação** (item 36) — itens próprios do backlog.
- **Estado da fonte em Configurações/cartão** (Sincronizando, credencial
  inválida, vencimento) — é a 034; esta só consome.
- **Pré-carga de metadata TMDB, capas ou episódios de séries** — só os itens
  de categoria (`get_*_streams` / `storedEntries`).
- **Pré-carga durante a reprodução** — pausada por decisão.

## Success Metrics

- **SC-A**: entrada em categoria já pré-carregada ≤ 300 ms da tecla OK até
  itens visíveis, medido na TV de referência (QN50Q60DAGXZD).
- **SC-B**: com a lista aberta e ociosa, ≥ 80 % das categorias de cada seção
  prontas em um prazo a definir na spec após medição (linha de base: painel
  real, 2.266 canais / 31.304 filmes / 9.637 séries).
- **SC-C**: navegação durante a pré-carga/atualização sem regressão
  perceptível — latência tecla→foco p95 dentro de ±20 % da mesma medição sem
  pré-carga rodando.
- **SC-D**: zero engasgo/rebuffer atribuível à pré-carga durante reprodução
  (ela fica pausada).
- **SC-E**: tela de carga mostra, para cada seção, estado e contagem reais; 0
  percentuais estimados.
- **SC-F**: nenhuma contagem exibida é diferente do que está gravado no disco
  (nunca "0" nem número para categoria não carregada).

## Cost of Inaction

A primeira experiência com o app continua sendo "lento e confuso": uma tela
de carga que não explica nada, uma espera a cada categoria nova e nenhum
sinal de atualização. Como o app é client-first e o catálogo local é a fonte
da verdade (ADR-002), não pré-carregar também deixa a lista pouco útil
offline — só funciona o que a pessoa já abriu. O dono do produto classifica
como a dor principal de primeira impressão.
