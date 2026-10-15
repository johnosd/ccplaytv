# Assessment Explora: Aproveitar campos da lista Xtream hoje descartados

- **Slug**: aproveitar-campos-lista-xtream-hoje-descartados
- **Criado**: 2026-10-03
- **Origem**: texto colado (conversa) + medições no painel real (credenciais do `.env`, nunca impressas)

## Ideia Bruta

Importar campos que a listagem Xtream já entrega e a importação descarta (`rating`, e nas séries
`genre`, `backdrop_path`), e melhorar a cobertura de `year`, para ter dados na tela sem esperar
rede/TMDB, permitir descoberta por nota em catálogo grande e, se possível, cortar chamadas de rede.

## Evidência a Favor

Medido em 2026-10-03 no painel real (43.161 filmes, 9.690 séries). Amostras de `get_vod_info`
foram de 90 e 60 filmes, não da lista toda.

- **Peso é pequeno.** `rating` dos filmes (só > 0, 1 casa): ~279 KB serializado. `rating` + `genre`
  + 1ª URL de `backdrop_path` das séries: ~1 MB. Frente a 17,5 MB (filmes) e 9,7 MB (séries) que a
  listagem já baixa, o acréscimo é desprezível. A listagem inteira baixa em ~3,4 s e ~2,1 s.
- **Cobertura da nota.** `rating` > 0 em 66,8% dos filmes (28.846) e 82,0% das séries (7.943). O
  restante é `0` = sem nota; a fileira "Bem avaliados" teria massa suficiente.
- **Nota do painel é próxima da do TMDB.** Em 29 filmes com `tmdb_id`, diferença absoluta mediana
  0,10 e máxima 4,10 contra `vote_average`. Sugere que o painel replica a nota do TMDB (inferência
  de amostra pequena, não prova de origem).
- **Custo por título aberto é real.** `get_vod_info`: mediana 570 ms, p90 830 ms (10 em paralelo).
  Nota, gênero e fundo vindos da lista dispensariam essa espera para o card/hero das séries.
- **Séries quase sempre têm ano**: só 126 de 9.690 (1,3%) sem `year`/`releaseDate`.
- **`tmdb_id` na amostra geral: 90%** (54/60 filmes). O TMDB já é ligado corretamente por esse id.

## Evidência Contra

- **O "problema do ano" quase desaparece.** Dos 17.716 filmes sem `year`, só 198 (1,1%) têm ano
  no título. Mas na amostra de 90 filmes **sem ano e sem pista no título**, `tmdb_id` veio em
  **0/90**, `release_date` em 0/90, `cast` em 0/90 e `youtube_trailer` em 0/90. Ou seja: esses
  filmes são dados pobres na origem; extrair o ano do título (caminho que o código já cobre) ou
  consultar `get_vod_info` não os melhora. A melhoria de `year` vira quase nula.
- **O painel falhou sob carga.** Com 10 requisições paralelas de `get_vod_info`, cerca de 40%
  vieram vazias (`Unexpected end of JSON input`). Isso limita qualquer ideia de pré-buscar
  `get_vod_info` em lote e reforça a manter o fetch sob demanda e com paralelismo baixo. Vale
  conferir se o app trata corpo vazio sem erro (não verifiquei).
- **`youtube_trailer` 0/60 na amostra geral**: não há ganho de trailer pela lista.
- **Sem quebra funcional hoje**: o detalhe já tem `get_*_info` + TMDB (feature 032). Ganho é de
  descoberta e rapidez percebida.
- **Procedência da nota**: não se sabe a origem. Mediana 0,10 de diferença com o TMDB é indício,
  mas a constituição exige rótulo de origem (itens 29 e 68 do backlog já tratam disso).
- **Sobreposição de backlog**: o item 68 ("Bem avaliados", Pronto) já prevê nota "da fonte ou do
  TMDB já obtida"; parte da ideia já está planejada.

## Perguntas em Aberto

- A ideia de `year` merece sair do escopo? As medições dizem que quase não rende.
- O item 68 absorve a nota do painel como fonte, ou a feature nova entrega a nota e o 68 consome?
- ~~O app tolera resposta vazia do `get_vod_info` e do `get_series_info`?~~ **Respondida:** sim.
  `refreshFromProvider` ([titleMetadata.ts:103-157](../../../tv-web/src/lib/metadata/titleMetadata.ts))
  "nunca lança": falha não avança a validade do cache e o detalhe tenta de novo na próxima
  abertura. O JSON vazio cai no `catch`. Não é bug.
- A nota do painel precisa de comparação com amostra maior (> 29) antes de rotulá-la?

## Adendo — TMDB em lote e export de IDs (2026-10-03)

**Como o app usa o TMDB hoje** (leitura do código, não executado): só por item e só ao abrir o
detalhe (`useTitleMetadata`, `catalogApi.ts`). Com `tmdb_id` do provedor, uma chamada
(`/movie|tv/{id}` com `append_to_response`); sem ele, `/search` com ano + detalhe. Nenhum
endpoint de lista (`trending`, `discover`, `popular`, `top_rated`) é usado. Consequência: a nota
do TMDB só existe nos títulos já abertos, e a nota do provedor é a única que cobre o catálogo todo
sem chamadas extras. Isso reforça o valor da feature.

**Export diário de IDs (`movie_ids_*.json.gz`, `tv_series_ids_*.json.gz`)** — testado com os
arquivos de 02/10/2026 (28 MB e 5 MB; 1,25 mi e 233 mil linhas). Campos: `id`, título original,
`popularity`, flags. Sem ano, nota, sinopse nem títulos traduzidos.
- Casamento só por título normalizado: filmes 12% único / 7% ambíguo / 81% nenhum; filmes sem
  `year` 6% único / 90% nenhum; séries 27% único / 6% ambíguo / 67% nenhum.
- Precisão (236 filmes, verdade = `tmdb_id` do provedor): dos 49 matches únicos, 41 certos e 8
  errados (16%); 16 ambíguos; 171 sem match.
- **Conclusão: descartado.** Erro de 16% fere a regra de nunca usar "o primeiro resultado"
  (`tmdbLookup.ts:98`); o ganho para filmes sem ano é nulo e para séries é pequeno; custo de
  33 MB + indexação na TV. A busca por título com ano continua sendo o caminho.
