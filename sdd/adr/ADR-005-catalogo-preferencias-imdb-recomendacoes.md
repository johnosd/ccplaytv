# ADR-005: Catálogo, Preferências, IMDb e Recomendações

## Status

**Proposta técnica — requisitos funcionais confirmados pelo usuário.** Preservar grupos/categorias da fonte, exibir capas e nomes, pesquisar, favoritar, mostrar visualização anterior e oferecer consulta/ordenação IMDb e recomendações por gosto pessoal são requisitos. As regras detalhadas de classificação, identidade, histórico, ordenação e recomendação são propostas desta revisão.

Complementa as ADR-001 a ADR-004. Não registra funcionalidades implementadas ou testes executados.

## Data

2026-09-13. Revisão de escopo v2.

## Contexto

O usuário descreveu três áreas: canais por grupos da lista; séries por categorias da lista com grid de capas/nomes; e filmes com recursos equivalentes. Pesquisa, favoritos e indicação de visualização anterior devem existir nos três tipos. Adicionalmente, deseja consultar/ordenar filmes por um índice IMDb e receber recomendações a partir de filmes de que gostou.

A lista importada e o catálogo enriquecido são camadas diferentes. Uma convenção documentada de M3U estendida admite nome, URL, `group-title` e `tvg-logo`, mas também admite entradas mínimas sem esses atributos.[^m3u] Isso não oferece, por si só, classificação confiável de toda fonte como canal, filme ou série, nem uma hierarquia universal de temporadas/episódios.

“Favorito”, “gostei”, “já assisti” e “concluído” têm finalidades diferentes. Fundi-los num único campo perderia a distinção necessária para a interface e as recomendações.

## Decisão proposta

### 1. Preservar a organização da fonte

Manter nome original, posição de origem, IDs do provedor quando disponíveis, grupos/categorias e associação à fonte. Criar campos normalizados para pesquisa e exibição sem destruir os dados originais. Conteúdo original potencialmente secreto seguirá as restrições da ADR-004.

**Categoria da fonte não será substituída por gênero do TMDB.** “Filmes dublados”, por exemplo, pode ser uma categoria da fonte sem ser um gênero. Gêneros, ano e avaliações enriquecidos poderão ser filtros adicionais.

Identificar categorias dentro do escopo da fonte e do tipo de conteúdo. Duas listas com uma categoria de mesmo nome não serão fundidas automaticamente. Uma visão agregada de múltiplas listas poderá existir como escolha explícita, preservando a proveniência. Itens sem grupo ficarão em “Sem categoria”, sem atribuição inventada.

A navegação deve permitir alcançar todos os itens importados válidos; isso não exige montar todos os cartões simultaneamente no DOM. Paginação, virtualização e carregamento de imagens sob demanda preservarão a navegação por foco.

### 2. Classificação e identidade do conteúdo

Usar estrutura explícita e IDs de um provedor compatível como evidência prioritária. Para M3U, aplicar regras testadas por fonte sobre metadados, nomes e padrões de episódios. Registrar a origem e a confiança da classificação.

Quando as evidências forem insuficientes, manter o item em **Não classificados** e permitir regra/correção de classificação. Não considerar toda extensão de vídeo um filme, nem todo grupo contendo a palavra “filmes” como VOD: pode ser um grupo de canais. Não descartar conteúdo válido só porque faltam sinopse ou capa.

Distinguir uma playlist de catálogo de um manifesto de streaming. Um manifesto HLS recebido como entrada não deverá virar centenas de “canais” a partir de segmentos; esse detector é um critério proposto de robustez do importador, não ampliação automática do escopo para toda variante de playlist.

Separar **obra**, **entrada da fonte** e **opção de reprodução**. A mesma obra poderá ter versões diferentes e aparecer em várias fontes. Só agrupar quando houver identificação confiável; coincidência de título isolada não basta. Variações de corte/duração não deverão compartilhar posição de retomada indiscriminadamente.

IDs internos estáveis não dependerão apenas da URL de reprodução, que pode mudar. Reimportar não deverá perder favoritos/histórico. Se não for possível reconciliar um item com segurança, preservar seu estado anterior como indisponível, sem atribuí-lo a outra obra por aproximação.

TMDB poderá enriquecer identificação e metadados conforme ADR-001. Associação externa não criará automaticamente um link reproduzível. Episódios conhecidos externamente, mas ausentes da fonte, não aparecerão como disponíveis para assistir.

### 3. Navegação por tipo

| Área | Organização | Ação principal | Apresentação |
| --- | --- | --- | --- |
| Canais | Grupos originais da fonte | Selecionar canal e iniciar reprodução compatível | Nome, logotipo quando disponível, favorito e indicador de uso anterior. |
| Filmes | Categorias originais da fonte | Abrir detalhes e reproduzir a opção disponível | Grid com capa/nome, favorito, histórico e avaliação disponível. |
| Séries | Categorias originais da fonte | Abrir série, temporadas e episódios disponíveis | Um cartão por série identificada; episódios não viram séries duplicadas. |

Pesquisa por texto será acessível nos três tipos, inclusive sem conta. Proposta: considerar título original/normalizado e ignorar diferenças de caixa e acentuação, mantendo filtros visíveis de fonte, tipo e categoria. Pesquisa local deverá indicar cobertura parcial quando não tiver todo o catálogo.

O player não será iniciado ao apenas focar um cartão. Ao voltar, restaurar foco/posição quando possível. Erros de reprodução não apagarão o catálogo nem marcarão automaticamente um item como visto.

Capas terão origem e tipo registrados. Priorizar imagem adequada da fonte; complementar com metadados quando houver correspondência confiável; usar imagem padrão quando indisponível. Logotipo de canal e pôster de filme/série não são intercambiáveis. A ausência de imagem não bloqueará navegação.

**Atualização (ADR-007):** a apresentação dessas regras ganhou contrato visual — área de capa reservada por `aspect-ratio` fixo (imagem que chega depois não muda a geometria do grid nem derruba o foco), estados `loading`/`vazio`/`erro` obrigatórios por superfície, cada um com pelo menos um elemento focável, e "categoria vazia" distinto de "sem resultado de busca". Ver ADR-007 para o raciocínio completo.

### 4. Favoritos, gosto pessoal e histórico

Todos os estados pertencerão ao perfil da instalação, sem depender de conta CCPlay. Favoritos e preferências serão separados do snapshot do catálogo, com persistência local e sincronização posterior conforme ADR-002.

| Conceito | Significado proposto | Aplicação |
| --- | --- | --- |
| Favorito | Salvar para acesso rápido | Canais, filmes e séries. |
| Gostei | Sinal explícito positivo de preferência | Filmes, como base confirmada de recomendações; expansão a outros tipos é opcional. |
| Histórico | Houve reprodução efetiva anterior | Canais, filmes e episódios, com resumo nas séries. |
| Assistido/concluído | Marcação explícita ou conclusão conforme regra documentada | Filmes e episódios; não representa término de um canal ao vivo. |
| Progresso | Posição válida para retomar quando suportado | Filme/episódio compatível, não transmissão ao vivo por padrão. |

Favoritar não marcará como assistido ou gostei. Assistir não marcará como gostei. A ação “Gostei” poderá ser retirada; “Não gostei” é uma extensão proposta, não requisito adicional obrigatório. Remover favorito não apagará histórico.

Abertura da tela de detalhes, tentativa de play e falha de player não serão histórico de reprodução bem-sucedida. A implementação definirá evento e intervalo mínimo para registro automático. Não se fixa nesta ADR um percentual arbitrário de conclusão; a regra automática precisa ser documentada/testada. Deve haver correção manual para refletir algo visto fora do aplicativo ou corrigir registro incorreto.

**Filmes:** distinguir não iniciado, em andamento e assistido. A indicação de visualização anterior deve ser visível mesmo quando houver apenas progresso parcial. A marcação manual não implica inventar duração ou posição de reprodução.

**Séries:** distinguir “Já assistiu”, “Em andamento” e “Em dia com os episódios disponíveis”. O último estado só será calculado quando a cobertura dos episódios disponíveis for conhecida e não vazia. A chegada de novos episódios poderá retirar o estado de “em dia”, sem apagar o histórico dos anteriores. Não declarar que uma série inteira foi concluída porque um único episódio foi iniciado. Uma ação manual para marcar episódios em lote deverá explicitar seu alcance e permitir desfazer; seu desenho ainda é proposta.

**Canais:** indicar “Já assistido” e, quando registrado, último acesso. Isso atende ao histórico solicitado sem sugerir que o canal foi terminado. Guia de programação, gravação, replay e timeshift não são automaticamente acrescentados ao escopo por esse indicador.

### 5. IMDb: nota real, identificação e ordenação

A interpretação operacional proposta para “índice IMDb” é a **nota agregada do título**, não posição no Top 250 nem índice de popularidade. A fonte dos dados e suas condições serão escolhidas antes de implementar/publicar a integração.

A documentação IMDb apresenta consultas por identificador de título que retornam nota agregada e número de votos.[^imdb-api] Registrar conceitualmente `imdb_id`, nota, votos quando disponíveis, origem efetiva dos dados e data de atualização. Dados ausentes serão `null`/“Sem avaliação”, nunca zero fictício.

Um identificador externo IMDb poderá ser associado a um filme por metadados compatíveis; TMDB documenta consulta de IDs externos.[^tmdb-external] **Ter `imdb_id` não equivale a ter a nota IMDb.** Não renomear uma nota TMDB ou um campo genérico `rating` do provedor sem procedência para “IMDb”. Avaliação gerada por IA não será aceita como substituta.

Usar integração autorizada, com limites, atribuição e política de cache compatíveis. A orientação oficial IMDb restringe o uso não comercial e a extração de dados do site; não se presume que ser um aplicativo gratuito permita redistribuir uma base. A fonte/API ou licença comercial apropriada permanece pendente; scraping não será o plano de integração.[^imdb-use]

Ordenação proposta em filmes: maior/menor nota, sem avaliação no final, desempate estável por votos quando conhecidos, título e ID. Expor claramente direção e filtro ativo; eventual mínimo de votos será opcional e visível. Filtrar/ordenar o conjunto de resultados antes de paginar, não apenas rearranjar a página atual. No cache parcial, ordenar apenas os itens salvos e indicar a limitação.

Consultar detalhes e ordenar notas previamente disponíveis não aguardará chamadas individuais em cada cartão. Atualizações serão desacopladas da navegação, respeitando licença e validade do cache. Falha IMDb não bloqueará filmes, capas de outras fontes ou reprodução.

### 6. Recomendações baseadas em filmes de que gostou

O sinal primário será “Gostei”, não apenas favorito, tempo de tela ou nota global. Antes de haver preferências, mostrar estado vazio orientativo ou sugestões genéricas identificadas como tal, nunca uma justificativa pessoal inventada.

Uma implementação inicial proposta usará filmes curtidos como sementes, metadados e candidatos de APIs de recomendação. TMDB oferece consulta de recomendações por filme; a combinação de sementes e personalização será regra do CCPlay, não resultado pronto desse endpoint.[^tmdb-recommendations]

Cruzar candidatos com as fontes disponíveis ao perfil e manter só opções reproduzíveis conhecidas no catálogo. Isso significa disponibilidade cadastrada, não garantia de que a origem permanecerá online. Excluir duplicações e, por padrão proposto, priorizar filmes ainda não assistidos; permitir revisão dessa preferência sem apagar histórico.

Exibir justificativa compatível com o método, como afinidade com gêneros de filmes curtidos. Não afirmar uso de elenco, avaliações ou similaridade sem que esses sinais tenham participado do cálculo. Gostar e retirar o gosto deverão alterar a próxima atualização; definir e mostrar estado de atualização quando necessário.

OpenAI poderá interpretar pedidos e explicar resultados validados conforme ADR-001. Não será necessária para todo movimento de foco ou toda consulta de favoritos. Somente dados necessários ao recurso serão enviados; nunca credenciais/URLs secretas da fonte. Armazenamento e exclusão do perfil de gosto deverão ser explicados ao usuário.

Recomendações novas poderão depender do backend/serviço externo. Resultados salvos, quando a retenção for permitida, serão identificados como tais. A falta de recomendações não será erro fatal do catálogo.

### 7. Modelo conceitual mínimo

| Entidade proposta | Responsabilidade |
| --- | --- |
| `Installation` / `LocalProfile` | Escopo de uso sem conta, separado de futura conta pessoal. |
| `Source` / `SourceCategory` | Origem e sua organização, sem confundir categoria com gênero. |
| `SourceEntry` / `PlaybackOption` | Registro importado e meios autorizados de reproduzi-lo. |
| `CatalogItem` | Canal, filme, série ou episódio identificado, com proveniência. |
| `Series` / `Season` / `Episode` | Hierarquia disponível na fonte, sem criar episódios reproduzíveis fictícios. |
| `UserItemState` | Favorito, gosto, marcações, histórico e progresso por perfil, separados do catálogo substituível. |
| `ExternalRating` | Nota, provedor, identificador, votos e data. |
| `RecommendationResult` | Candidatos vinculados ao catálogo, justificativa e contexto de geração. |

Este quadro não escolhe ORM nem define migrações SQL. Restrições de unicidade, versionamento e política de merge serão especificadas com os contratos e testes.

## Alternativas consideradas

**Trocar categorias da lista por gêneros externos:** não atende à organização pedida pelo usuário.

**Classificar tudo por nome/extensão sem registrar incerteza:** pode atribuir conteúdo à área errada; preferida classificação explícita ou revisão de itens incertos.

**Um único booleano para favorito/gostei/assistido:** confunde intenção de guardar, gosto e histórico.

**Um booleano de conclusão para canal ao vivo ou para toda série sem cobertura:** não representa corretamente o uso anterior solicitado.

**Usar nota TMDB como se fosse IMDb:** não atende à origem especificada e mistura escalas/proveniência.

## Consequências e pendências

A proposta mantém organização da fonte e preferências úteis sem cadastro, mas exige IDs estáveis, reconciliação, estados distintos e tratamento de dados incompletos. Metadados não confiáveis nunca deverão ser escondidos sob uma aparência de precisão.

Permanecem pendentes: amostras autorizadas para classificação, regras automáticas de assistido, resolução de conflitos entre dispositivos, política de remoção de histórico, fonte/licença IMDb e avaliação da qualidade das recomendações. Nada nesta ADR garante que todas as listas tragam capas, temporadas ou avaliações completas.

## Referências técnicas

Requisitos e terminologia vêm do usuário; regras de domínio são propostas. Referências externas consultadas em 2026-09-13:

[^m3u]: Kodi IPTV Simple — README, convenções de sua implementação de M3U estendida. Não é tratado como padrão universal de classificação VOD. `https://github.com/kodi-pvr/pvr.iptvsimple/blob/Piers/README.md`
[^imdb-api]: IMDb — Sample queries: Title/Name, consulta de nota e quantidade de votos. `https://data.imdb.com/documentation/api-documentation/sample-queries/title-name`
[^tmdb-external]: TMDB — Movie External IDs. `https://developer.themoviedb.org/reference/movie-external-ids`
[^imdb-use]: IMDb Help — Can I use IMDb data in my software? `https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX`
[^tmdb-recommendations]: TMDB — Movie Recommendations. `https://developer.themoviedb.org/reference/movie-recommendations`
