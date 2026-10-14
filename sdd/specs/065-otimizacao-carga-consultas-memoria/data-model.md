# Data Model: feature 065

## Dados existentes preservados

categoryBlocks (um registro por categoria, itens com ids negativos), channels para episódios/linhas legadas, categories, sources e userStates permanecem canônicos. Não mudar blockItemId, identityKey, buildStableId, assinatura de itens ou ordem da fonte. A troca de geração segue o protocolo atual. Fontes/URLs/chaves nunca entram em relatório.

## Projeção de leitura reconstruível

Adicionar na próxima versão disponível do CatalogDb (**18 na exploração; reler antes de executar**) somente tabelas novas, sem varredura no upgrade:

- **catalogReadManifests**: chave categoryId; sourceId, generation, kind, revision, formatVersion, count, chunkSize=240, chunkCount, ready. Índices sourceId e [sourceId+generation+kind]. revision é token monotônico de escrita local, não hash de segredo nem timestamp usado sozinho.
- **catalogReadChunks**: chave [categoryId+revision+chunk]; sourceId, generation, kind e items de no máximo 240 projeções na ordem da fonte. Índices [sourceId+generation] e [categoryId+revision].
- **Projeção de item**: id original, sourceId/generation/kind/categoryId/groupOrder/categoryPosition; name/originalName, providerStreamId/seriesId, campos reais de capa/ano/addedAt/nota/gênero/backdrop e demais campos de listagem necessários ao toItemOut vigente. Não guardar directUrl, playbackHeaders, credencial, sinopse nem corpo TMDB. Preparar chaves de normalização quando úteis, com versão de algoritmo.

Atualização de categoria invalida manifesto na mesma transação canônica. Preparação lê uma categoria de cada vez, escreve chunks de uma revisão nova e publica ready apenas após conferir categoria/fonte/geração/revisão e contagem. Só então leitores usam a projeção. Preparação obsoleta não publica; chunks incompletos são removidos e não contam como cobertura nova. Escritas via Worker e conversão legada notificam apenas ids/revisões, nunca payload de itens. Categoria vazia tem manifesto válido de count=0.

Novas escritas devem preparar a projeção antes do evento de disponibilidade otimizado, sem atrasar a publicação canônica nem perder recuperação. Quota na projeção conserva o catálogo e permite fallback compatível, com custo/degradação registrados. Usar Worker de carga existente para preparar blocos grandes quando possível; fallback principal cooperativo. Não fingir que slice evita a leitura integral no primeiro backfill.

Remoção de fonte/geração/categoria limpa manifestos/chunks associados no mesmo descarte lógico. Atualização de campos de listagem altera revisão. Carimbo de episódios da série não invalida toda a projeção se os campos exibidos não mudaram. Código de diagnóstico não exporta projeções.

## Séries assistidas

- **seriesWatchMembers**: chave [sourceId+generation+seriesId]; revisão dos episódios conhecidos e vetor de stableIds na semântica atual, preservando multiplicidade quando houver. Índice [sourceId+generation] e multiEntry stableIds para localizar séries afetadas por um estado (stableId já inclui fonte). Não depende de URL.
- **seriesWatchSummaries**: mesma chave; versão do algoritmo, revisão dos membros/estados e resumo no tipo SeriesWatchedSummary vigente. Nenhum nome/URL de episódio necessário.

storeSeriesEpisodes substitui os membros da série afetada e invalida/recalcula só seu resumo. Mutações de progresso/conclusão/histórico que alterem o helper vigente localizam séries pelo índice e invalidam só elas. Reentrada usa resumos válidos. Backfill dos dados existentes varre uma vez em lotes, sem ocupar o upgrade e sem apresentar resumo antigo como atual; comparar com summarizeSeriesWatched.

## Integrações e contexto

IntegrationRecord ganha revisão opaca incrementada ao trocar/remover chave. pausedUntil é preservado por sucesso concorrente durante pausa e atualizado atomicamente sob a mesma revisão. Retry-After validado fica como duração/instante; chave nunca integra o identificador de tentativa visível.

Tentativas/leases e LRU são memória, sem nova tabela de credenciais. discoveryCache mantém formato de títulos; sua publicação passa a ser atômica e completa. Dados válidos anteriores persistem em falha, respeitando troca/remoção de chave.

## Limites de memória iniciais

- Cache de blocos: além dos dois blocos atuais, no máximo 2.000 itens somados; bloco maior não fica retido (limite não limita leitura canônica de compatibilidade).
- Cache de projeções: no máximo oito chunks de 240 itens no contexto ativo; zero chunks de lista inativa retidos após a troca estabilizar.
- Vitrines: apenas resultados escolhidos + cobertura; no máximo duas entradas de seleção por tipo (contexto atual/anterior), expiração de 60 s quando sem observador e descarte imediato na mudança de lista/geração.
- Índice compacto de busca: no máximo um contexto ativo, criado somente quando a busca/ordenação integral o exige; nunca conservar CatalogRecord completo em paralelo. gcTime inicial de 30 s sem consumidor, descarte imediato de contexto inativo.
- Grade: janela de até três páginas de 240; metadados de id/cursor/posição permitem recarregar páginas anteriores. Não aplicar maxPages sozinho a uma grade que assume índice absoluto.
- Histórico/favoritos: janela de 240 objetos completos; resumo leve de contadores separado. Consultas de objetos sem consumidor expiram em 30 s; identidade/contagem duráveis não são eliminadas.
- Derivados por dia/idioma/cores: LRU no contexto vigente, sem Map crescente por sessão. Cache de cor derivada limitado a 256 URLs de arte, sem streams.

A execução pode diminuir limites se equivalência e ganho passarem; aumentá-los exige evidência em Riscos e Decisões e novo benchmark. Memória temporária de conversão e Worker é reportada separadamente.
