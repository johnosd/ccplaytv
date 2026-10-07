# Feature Specification: Otimização de carga, consultas externas, memória e abertura do app

**Slug**: 065-otimizacao-carga-consultas-memoria

**Created**: 2026-10-07

**Status**: Planejada

**Input**: Review solicitado para acelerar Home, Filmes, Séries e vitrines, otimizar consultas externas, memória e desempenho geral, com medições. O usuário pediu especificação via sdd-specify e confirmou todos os achados, incluindo splash e bundle, preservação de conteúdo/seleção/ordem/navegação e aceite comparativo no benchmark, com TV como validação recomendada.

## Escopo

### Incluído

- Carga inicial, reentrada e atualização de Home, Filmes e Séries, incluindo vitrines, fileiras, prévias de categorias e grades abertas a partir delas.
- Seleção de Bem avaliados, índices derivados e atualização das telas quando categorias terminam de carregar em segundo plano.
- Consultas externas usadas pelas telas e seus detalhes: descoberta/metadados TMDB e enriquecimento Xtream existente, reaproveitamento, limite de espera, falhas parciais e pausa por limite de requisições.
- Memória de índices, resultados de consulta, categorias, páginas acumuladas, histórico e resumos de séries assistidas; troca de lista e navegação prolongada.
- Abertura do app: espera fixa do splash e código necessário antes da primeira tela utilizável, incluindo disponibilidade de recursos no pacote Tizen.
- Benchmark reproduzível antes/depois, equivalência funcional e relatório com evidências e limitações.

### Fora de Escopo

- Redesenho visual, redução do conteúdo disponível, mudanças nas regras de seleção/recomendação, ordem de fileiras/cards, taxonomia do provedor ou navegação.
- Mudanças em codecs, AVPlay, Direct Play, qualidade ou desempenho de reprodução; importação/classificação e EPG como projetos próprios de otimização.
- Backend obrigatório, proxy, transcodificação, conta obrigatória, troca de stack/plataforma, novas integrações ou recursos ainda planejados.
- Promessa de desempenho ou RAM total na TV baseada apenas em navegador/emulador. A validação física é recomendada, conforme decisão do usuário, e não bloqueia o aceite desta feature.

## Context & Evidence

O review executou o build de produção em navegador isolado com CPU limitada a 4× e catálogo sintético de 43.000 filmes e 10.000 séries, em 134 categorias. Foram três execuções por configuração, sem TMDB e com TMDB simulado. A variante de estresse torna todos os filmes elegíveis para Bem avaliados; o microbenchmark também cobre 20% de elegibilidade. Não houve acesso ao provedor ou ao TMDB real.

| Evidência exploratória | Sem TMDB | Com TMDB simulado |
| --- | --- | --- |
| Filmes após Home: mediana até conteúdo | 665,5 ms | 717,3 ms |
| Filmes com índice frio: mediana até conteúdo | 953,8 ms | 1.042,1 ms |
| Maior tarefa longa em Filmes com índice frio: mediana | 493 ms | 526 ms |
| Soma de tarefas longas em três invalidações: mediana | 1.784 ms | 2.196 ms |
| Heap retido após Home → Filmes → Séries: mediana | 18,63 MiB | 26,75 MiB |
| Chamadas externas por execução completa | 0 | 18 |

A seleção isolada de 12 cards de Bem avaliados teve medianas de 331,7 ms com 43.000 elegíveis e 74,9 ms com 8.600 elegíveis. A simulação de erro 429 na segunda página continuou pedindo páginas até a oitava e terminou como conectada/com cache considerado válido. Uma consulta que nunca responde permaneceu pendente durante os três segundos observados e não recebeu sinal de cancelamento; o review não mediu uma duração máxima dessa espera. O build produziu um arquivo principal de JavaScript de 1.007.750 bytes, e o splash contém espera fixa de 2.600 ms.

Os tempos de tela incluem automação, conteúdo no DOM e duas oportunidades de quadro, sem medir pintura física. Heap é memória gerenciada após coleta de lixo, sem RAM total, imagens decodificadas, GPU ou vídeo. A fixture inicial não cobre imagens, histórico ou episódios. As três invalidações foram manuais, sem reproduzir o caminho real de conclusão de categorias. Um microbenchmark coincidiu brevemente com a primeira execução com TMDB; as demais não tiveram essa sobreposição. A retenção observada não comprova vazamento. Esses números orientam prioridades e não substituem uma nova baseline pareada.

Evidências e executores:

- [Resumo das telas](../../../tv-web/bench-results/review-screen-perf/summary.json), [dados brutos](../../../tv-web/bench-results/review-screen-perf/cpu4.json) e [consultas/microbenchmark](../../../tv-web/bench-results/review-screen-perf/queries.json).
- [Executor das telas](../../../tv-web/scripts/bench/review-screen-perf.mjs) e [executor das consultas](../../../tv-web/scripts/bench/review-query-perf.mjs).

### Findings Covered

| Achado | Origem no código | Cobertura |
| --- | --- | --- |
| Invalidações abrangentes repetem leitura de todo o tipo durante prefetch | features/catalog/prefetchApi.ts; features/catalog/catalogApi.ts; lib/catalog/catalogSearch.ts | US2; FR-004–FR-007; SC-002–SC-004 |
| Seleção síncrona normaliza, deduplica e ordena muitos candidatos para 12 cards | features/vod/ratedSelection.ts | US2; FR-001, FR-006; SC-001, SC-003 |
| Falha em páginas posteriores da descoberta é ignorada e promovida a cache válido | lib/metadata/tmdbDiscovery.ts | US1; FR-008–FR-013; SC-008–SC-009 |
| Consulta sem prazo/cancelamento pode prender tentativas compartilhadas | lib/metadata/tmdbConnector.ts; lib/metadata/titleMetadata.ts | US1; FR-008, FR-012–FR-014; SC-008–SC-009 |
| Índices completos, histórico e resultados derivados mantêm grande volume em memória | features/catalog/catalogApi.ts; lib/catalog/catalogSearch.ts | US3; FR-015–FR-018; SC-005–SC-006 |
| Categoria inteira pode ser materializada para uma prévia/página; páginas acumulam | lib/catalog/repository/kindReads.ts; lib/catalog/blockMemo.ts; features/catalog/catalogApi.ts | US3; FR-015–FR-018; SC-006–SC-007 |
| Resumo de assistidos lê todos os episódios | lib/catalog/repository/series.ts; features/catalog/catalogApi.ts | US4; FR-019–FR-020; SC-010 |
| Splash espera prazo fixo; telas são carregadas antecipadamente no bundle principal | features/splash/SplashScreen.tsx; App.tsx; main.tsx | US5; FR-021–FR-024; SC-011–SC-012 |

Os caminhos da tabela são relativos a tv-web/src/. Soluções técnicas e estruturas de cache ficam para sdd-plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultas externas terminam e se recuperam corretamente (Priority: P1)

Como usuário, quero continuar navegando pelo catálogo local quando a integração externa demora, falha ou limita requisições, sem perder os últimos dados válidos nem ficar preso em carregamento.

**Why this priority**: Há reprodução de resposta parcial tratada como sucesso e ausência de prazo nas consultas. Corrigir isso entrega valor independentemente da otimização local.

**Independent Test**: Testar descoberta e detalhes com sucesso, erro intermediário, 429, corpo travado e ausência de resposta, incluindo consumidores simultâneos e troca de contexto.

**Acceptance Scenarios**:

1. **Given** cache externo válido, **When** uma página necessária falha, **Then** o cache anterior continua disponível, a tentativa fica incompleta/falha e o parcial não recebe validade de atualização completa.
2. **Given** 429 durante a descoberta, **When** existem páginas por iniciar, **Then** elas aguardam o fim da pausa; consultas já iniciadas podem encerrar, mas seu sucesso não apaga a pausa.
3. **Given** consulta sem resposta ou corpo travado, **When** termina seu prazo, **Then** a tentativa se encerra em estado recuperável e uma nova tentativa posterior consegue executar.
4. **Given** dois consumidores compartilham uma consulta, **When** um sai da tela, **Then** o outro recebe o resultado; resposta de contexto antigo nunca substitui dados da lista/idioma/chave atuais.

### User Story 2 - Abrir e atualizar vitrines com menos bloqueio (Priority: P1)

Como usuário, quero abrir Home, Filmes e Séries rapidamente e navegar durante atualizações, mantendo títulos, fileiras e seleção.

**Why this priority**: Filmes teve o maior custo medido, ampliado por atualizações repetidas. Esta história pode ser entregue com a integração externa desativada.

**Independent Test**: Comparar carga fria, carga após Home, reentrada e conclusão real de categorias com catálogo fixo; medir leituras, bloqueio e resposta aos comandos, confrontando as regras vigentes.

**Acceptance Scenarios**:

1. **Given** mesma lista, dados, idioma e relógio, **When** a versão otimizada monta as vitrines, **Then** ids, seleção e ordem de cards/fileiras coincidem com a referência funcional.
2. **Given** tela montada, **When** termina uma categoria de filmes, **Then** aparecem os dados afetados sem reler integralmente séries/live nem reconstruir resultados não afetados.
3. **Given** atualização em segundo plano, **When** o usuário move o foco ou retorna de detalhes, **Then** foco/rolagem permanecem reconciliados pelo id e os comandos continuam responsivos.

### User Story 3 - Navegar por catálogos grandes sem acumular memória (Priority: P2)

Como usuário, quero percorrer categorias extensas e alternar listas sem acumular dados temporários das telas anteriores nem perder conteúdo e histórico.

**Why this priority**: Virtualização visual não limita dados retidos. Esta história pode ser entregue por fluxos de categoria/histórico, independentemente dos resumos de episódios e da abertura.

**Independent Test**: Percorrer categoria de 30.000 itens, repetir ciclos Home → Filmes → Séries → categoria → Home e alternar três listas; aferir memória e equivalência de pesquisa, ordenação, contadores e RETURN.

**Acceptance Scenarios**:

1. **Given** categoria de 30.000 itens, **When** aparecem a prévia e o começo da grade, **Then** trabalho/memória ficam limitados ao recorte necessário sem tornar os demais itens indisponíveis.
2. **Given** navegação repetida e troca de lista, **When** expira o reaproveitamento de dados temporários, **Then** a memória se estabiliza e dados obsoletos são liberados.
3. **Given** histórico/favoritos/posição existentes, **When** dados temporários são liberados e a tela reabre, **Then** contadores, itens, progresso e retorno continuam corretos, recuperados da persistência.

### User Story 4 - Consultar séries assistidas sem varrer todos os episódios a cada visita (Priority: P2)

Como usuário, quero abrir Séries e ver indicadores de assistidos sem processar repetidamente todos os episódios.

**Why this priority**: O custo cresce com o catálogo de episódios, ausente na fixture exploratória. A otimização pode ser entregue isoladamente no resumo de assistidos.

**Independent Test**: Usar 1.000 séries com 100 episódios cada; reabrir sem alteração e alterar um episódio, comparando resumos e volume lido.

**Acceptance Scenarios**:

1. **Given** resumo válido sem alteração relevante, **When** Séries reabre, **Then** os indicadores aparecem sem nova leitura integral dos episódios.
2. **Given** progresso de um episódio alterado, **When** o resumo atualiza, **Then** os indicadores da série mudam sem varrer episódios das outras séries.
3. **Given** catálogo substituído ou episódios atualizados, **When** o resumo perde validade, **Then** ele é reconciliado antes de ser apresentado como atual, preservando identidade lógica dos estados.

### User Story 5 - Entrar no app sem espera artificial e com menos código inicial (Priority: P3)

Como usuário, quero alcançar a primeira tela utilizável mais cedo, preservando a identidade do splash e o fluxo atual de perfis/navegação.

**Why this priority**: Espera fixa e código antecipado são oportunidades adicionais solicitadas explicitamente, entregáveis independentemente das mudanças de catálogo.

**Independent Test**: Medir abertura fria/quente com/sem lista configurada; verificar primeiro acesso a cada tela e pacote Tizen sem rede externa.

**Acceptance Scenarios**:

1. **Given** inicialização concluída, **When** a próxima tela está pronta, **Then** o splash libera a navegação sem aguardar prazo fixo restante, preservando sua identidade.
2. **Given** abertura inicial, **When** só a primeira tela é necessária, **Then** menos código precisa carregar/processar antes dela sem postergar trabalho indispensável ao primeiro comando.
3. **Given** app empacotado e catálogo local, **When** uma tela é acessada pela primeira vez sem internet, **Then** código/recursos estão disponíveis no pacote e foco/estados funcionam.

### Edge Cases

- Catálogo vazio, poucos elegíveis, duplicatas, notas/anos ausentes e virada do dia; equivalência observa emendas vigentes de seleção.
- M3U/Xtream, blocos/fallback legado, carregamento parcial, modo limitado e categoria única muito grande; não pressupor cobertura integral.
- Categorias concluídas em sequência, atualização no mesmo caminho, nova geração e troca de lista/idioma/chave durante cálculos ou consultas.
- Sem chave, offline, 401, 404, 429 com/sem prazo, 5xx, JSON inválido, corpo pendente e erro em qualquer página.
- Cache válido disponível/inexistente, nenhum consumidor restante ou outro consumidor ainda ativo.
- Item focado removido legitimamente: reconciliação/fallback vigente, mantendo contexto e elemento focável.
- Histórico volumoso, favoritos, episódio sem posição confiável e resumo antigo; contadores não justificam consultas globais repetidas.
- RETURN após liberar páginas, primeiro acesso a uma tela, falha de recurso local e retorno após suspensão.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE preservar o resultado funcional para mesmos dados/contexto: conteúdo, categorias do provedor, ids, seleção, quantidade/ordem de cards/fileiras e regras vigentes de Bem avaliados/Top 10/Dica, incluindo emendas. Otimizar não autoriza amostrar, reduzir páginas de descoberta, esconder itens ou alterar seleção diária.
- **FR-002**: O sistema DEVE preservar foco/rolagem por identidade ao atualizar, liberar/recarregar dados e executar RETURN. SELECT mantém sua ação; foco não inicia reprodução nem consulta externa. Loading, vazio e erro mantêm elemento focável.
- **FR-003**: O sistema DEVE permitir apresentar/navegar no conteúdo local sem aguardar consultas externas opcionais. Cobertura parcial, progresso e indisponibilidade devem ser verdadeiros, seguindo contratos visuais e traduções atuais.
- **FR-004**: Uma mudança de categoria DEVE atualizar resultados afetados sem forçar leitura integral de tipos/listas não afetados. Atualizações no mesmo caminho preservam a geração ativa conforme o contrato vigente.
- **FR-005**: O sistema DEVE absorver eventos sucessivos sem perder alterações nem reconstruir todo o catálogo por evento. No benchmark controlado, a última conclusão de categoria deve aparecer em até dois segundos após cessarem os eventos, mantendo navegação.
- **FR-006**: A seleção de poucos cards DEVE reduzir processamento desnecessário sobre todo o catálogo e reutilizar resultados enquanto entradas/contexto permanecerem válidos, com equivalência em desempates e duplicatas.
- **FR-007**: O sistema DEVE invalidar resultados quando mudar fonte, geração, categoria, metadado, preferência, idioma ou data relevante. Reaproveitamento nunca apresenta contexto antigo como atual; alterações independentes não devem reconstruir resultados não afetados.
- **FR-008**: Cada tentativa externa de descoberta/metadados abrangida DEVE ter prazo máximo de dez segundos desde o início da requisição até obtenção/leitura completa da resposta, inclusive corpo travado. Expirado o prazo, libera estado pendente e produz erro recuperável sanitizado. O prazo não abrange importação, EPG, teste de velocidade ou reprodução.
- **FR-009**: Um conjunto externo dependente de múltiplas páginas DEVE ser considerado atualizado somente após sucesso em todas as páginas necessárias. Erro intermediário não sobrescreve o último conjunto válido nem renova validade de parcial como completo.
- **FR-010**: Uma resposta 429 DEVE pausar novas requisições ao serviço sob a mesma credencial pelo prazo informado válido, ou por pelo menos 60 segundos quando ausente/inválido. Novos lotes/retries ficam suspensos; sucesso concorrente não remove a pausa. Consultas já iniciadas podem encerrar.
- **FR-011**: O sistema DEVE preservar o último conteúdo externo válido em offline, timeout, falha parcial e pausa, conforme contrato vigente. Sem cache válido, representa indisponibilidade/ausência sem inventar dados e permite conteúdo local. Corrigir falso sucesso não altera seleção em respostas completas.
- **FR-012**: O sistema DEVE compartilhar consultas equivalentes simultâneas. Sair de uma tela não interrompe consumidor ainda ativo; sem consumidores, o trabalho deve poder encerrar sem manter tentativa indefinidamente. Toda tentativa encerrada, inclusive erro/cancelamento, permite tentativa futura.
- **FR-013**: Reentrada com cache externo válido DEVE reutilizá-lo sem requisições redundantes. Erros não provocam loops de retry; atualizações respeitam validade, pausa e páginas exigidas.
- **FR-014**: O sistema DEVE descartar respostas/cálculos obsoletos para o contexto atual. Logs, erros, medidas e artefatos não contêm credenciais, chaves, URLs privadas nem conteúdo privado do provedor; dados sintéticos/identificadores sem segredo permitem correlação.
- **FR-015**: O sistema DEVE limitar retenção de dados temporários de telas, índices, consultas/páginas e liberar contextos obsoletos. O plano declara limites de capacidade/validade e afere seu efeito, incluindo categoria maior que o limite normal de página.
- **FR-016**: O carregamento da prévia e do primeiro recorte de grade DEVE evitar materializar/reter uma categoria inteira só para poucos itens. Busca, ordenação e páginas restantes continuam abrangendo todo o conteúdo existente, com RETURN correto.
- **FR-017**: O sistema DEVE manter histórico, favoritos, contadores e resumos corretos sem exigir retenção permanente de todos os objetos completos consultados. Liberar temporários não apaga persistência, posições, identidade lógica, favoritos ou histórico.
- **FR-018**: O catálogo persistido DEVE permanecer fonte de verdade, acessível localmente. A otimização atende blocos/fallback legado, sem depender de backend/API externa para itens armazenados; cache limitado não limita conteúdo.
- **FR-019**: O resumo de séries assistidas DEVE ser reutilizado quando catálogo/estados relevantes não mudam. Reentrada não relê todos os episódios; alteração de um episódio não varre episódios de outras séries.
- **FR-020**: O sistema DEVE reconciliar resumos afetados por mudanças em episódios/estados, preservando identidade lógica e indicadores vigentes, sem associar estados por URL de stream.
- **FR-021**: O splash DEVE preservar identidade/fluxo e liberar a próxima tela quando a inicialização necessária estiver pronta, sem espera fixa adicional de 2.600 ms. Falha/atraso real produz estado honesto e acessível, sem salto para tela inutilizável.
- **FR-022**: A abertura DEVE reduzir código necessário antes da primeira tela utilizável, preservando fontes locais, demais telas e resposta ao primeiro comando. Redistribuir trabalho não pode deslocar bloqueio para a primeira interação.
- **FR-023**: O pacote Tizen DEVE disponibilizar telas/recursos sem download de código externo, inclusive primeiro acesso. Novos arquivos emitidos atendem inventário/verificações de sincronização existentes e o alvo de compatibilidade aceito.
- **FR-024**: Carregamento tardio/falha de recurso local DEVE manter estado focável e recuperação/retorno. Otimizar abertura não altera destinos nem escolha/restauração vigente de lista.
- **FR-025**: A feature DEVE fornecer medições pareadas reproduzíveis, equivalência funcional e relatório por cenário. Não é suficiente aprovar por redução de bytes ou ausência de elementos visuais.
- **FR-026**: O aceite DEVE exigir critérios do benchmark e checks aplicáveis. Validação física será recomendada e registrada como realizada/pendente, sem bloquear esta feature por decisão do usuário. Sem ela, o relatório não afirma desempenho/RAM física comprovados.

### Key Entities

- **Contexto de catálogo**: lista/fonte, geração, tipo, categorias e versões relevantes à validade.
- **Resultado derivado**: seleção, índice, prévia, página, contador/resumo com contexto/entradas e validade; reconstruível sem perder persistência.
- **Conjunto externo válido**: descoberta/metadados com escopo, completude e validade; parcial não substitui sua validade.
- **Tentativa compartilhada**: consulta equivalente, consumidores, prazo e término; isolada por contexto/credencial sem expor segredo.
- **Pausa de serviço**: impedimento temporário sob uma credencial após limite de requisições, com término verificável.
- **Registro de medição**: revisão/fixture, condições, amostras, métricas e equivalência para reprodução sem dados privados.

## Success Criteria *(mandatory)*

### Measurement Protocol

As metas abaixo são propostas de aceite comparativo desta spec, não ganhos obtidos. Baseline e candidata executam no mesmo ambiente, em build de produção, sem testes concorrentes, com mesmas fixtures e políticas de coleta. Registrar revisão exata e identificação reproduzível de alterações locais; navegador/versão, máquina, data, CPU, rede simulada, relógio/semente, fixture e caches. Coletar pelo menos sete execuções válidas independentes por cenário/configuração e publicar amostras, mediana e dispersão, sem selecionar só execuções favoráveis. Cache frio/quente e aquecimento devem ser explícitos e iguais.

Matriz mínima: 43.000 filmes/10.000 séries/134 categorias; Bem avaliados com 20%/100% elegíveis; sem integração/com descoberta simulada de mesmos dados, páginas e latência; categoria de 30.000 itens; 1.000 séries × 100 episódios; três listas; cenário com 1.000 favoritos/5.000 entradas de histórico. Fixtures adicionais podem ser separadas conforme o alvo, com amostras pareadas. Incluir imagens locais representativas nos cenários de navegação/memória e variante sem imagens comparável ao review. Nunca usar dados/credenciais reais em artefatos.

Medir ação de entrada até conteúdo útil e foco pronto, separando atraso da automação quando possível; observação somente de DOM/quadro deve ser identificada como proxy. Medir tarefas longas no mesmo intervalo e leituras/itens processados. Para atualizações, disparar três conclusões reais de categorias de filmes a intervalos de um segundo e observar do primeiro evento até estabilizar o último resultado, por no mínimo dois segundos após o último evento; não substituir por invalidação manual. Para memória, manter mesmo ponto de estabilização/coleta de lixo e separar heap retido de armazenamento, imagens e RAM total.

Equivalência confronta ids, quantidades, ordem, seleção, contadores e progresso com contratos vigentes, em relógio/idioma/dados fixos. A implementação anterior é referência apenas onde seu comportamento é válido; falso sucesso parcial e espera artificial são corrigidos explicitamente. No plano, ligar critérios a testes/benchmarks e superfícies de mudança antes de implementar. Meta inviável exige evidência e revisão explícita da spec, não dispensa silenciosa.

### Measurable Outcomes

- **SC-001**: Em 100% dos casos de equivalência, conteúdo, ids, seleção, quantidade/ordem e SELECT/RETURN/foco coincidem com os contratos vigentes, incluindo virada do dia, duplicatas, cobertura parcial e ordenação. Nenhum item fica inacessível por reduzir retenção.
- **SC-002**: Mediana até conteúdo útil/foco pronto em Filmes após Home e Filmes com índice frio diminui pelo menos 30%, sem integração e com integração simulada. Home, Séries, retorno à Home e abertura de categoria não regridem mais de 10% na mediana pareada.
- **SC-003**: Mediana da maior tarefa longa em cada entrada em Filmes diminui pelo menos 50%. Custo mediano da seleção isolada de Bem avaliados diminui pelo menos 50% nos dois níveis de elegibilidade, com resultado idêntico. Sem tarefa longa, registrar zero; publicar também a soma para não esconder fragmentação excessiva.
- **SC-004**: Nas três conclusões reais de categorias, mediana da soma de tarefas longas diminui pelo menos 50%, há zero leitura integral de tipos/listas não afetados e atualização cumpre FR-005. Latência p95 de comandos de direção no mesmo roteiro durante atualização não piora mais de 10%; publicar o indicador observado e limitações quando proxy.
- **SC-005**: Mediana do heap retido após Home → Filmes → Séries diminui pelo menos 20% sem integração e com integração simulada, com mesmos dados/imagens e estabilização/coleta.
- **SC-006**: Após aquecer todas as listas/telas do roteiro, em dez ciclos completos de navegação e dez ciclos de alternância entre três listas, heap estabilizado ao fim de cada ciclo do terceiro ao décimo não excede em mais de 10% o valor após o segundo ciclo da mesma configuração. Cada ciclo de alternância visita as três listas e retorna à lista inicial. Demonstrar limites do plano sem apagar persistência.
- **SC-007**: Na categoria de 30.000 itens, prévia/primeiro recorte deixam de materializar os 30.000 objetos completos apenas para esse recorte; mediana de memória temporária e tempo até conteúdo útil diminui pelo menos 30%. Percorrer até o fim, pesquisar/ordenar e RETURN mantêm conteúdo/estado corretos.
- **SC-008**: Em 100% das falhas simuladas, consultas sem resposta/corpo travado encerram no prazo de FR-008, erro em qualquer página não promove parcial a atualizado, 429 impede novas consultas pelo prazo exigido e tentativa seguinte é possível após liberação/pausa. Zero erros com segredo/loops de retry.
- **SC-009**: Consumidores simultâneos geram no máximo uma tentativa por consulta equivalente; reentrada com cache válido gera zero requisições redundantes. Roteiro completo de sucesso não aumenta chamadas frente à baseline nem reduz universo de páginas/candidatos. Saída de um consumidor preserva outro ativo; contexto antigo não contamina o novo.
- **SC-010**: Com 100.000 episódios, reentrada sem mudanças realiza zero leitura integral para resumo; alterar um episódio realiza zero varredura de episódios de outras séries. Resumos/contadores/progresso coincidem em 100% dos casos, inclusive após atualizar catálogo.
- **SC-011**: Mediana de abertura até primeira tela utilizável diminui pelo menos 30% nos fluxos com/sem lista configurada. Não resta espera fixa após prontidão; primeira interação e acesso inicial às demais telas não regridem mais de 10% na mediana. Medir abertura fria/quente separadamente.
- **SC-012**: Bytes de JavaScript carregados antes da primeira tela utilizável diminuem pelo menos 25%, somando todos os arquivos efetivamente carregados até esse marco, sem compressão no pacote local. Primeiro acesso às telas com catálogo local funciona sem rede externa; pacote passa pelas verificações existentes.
- **SC-013**: Relatório publica baseline/candidata, amostras, fórmula de ganho, requisições/leituras, equivalência e resultado de cada critério. Checks aplicáveis de lint, tipos, testes, build e navegação passam; E2E exigido pela constitution precede eventual validação física. TV consta validada ou recomendada/pendente, sem comprovação física quando não executada.

## Assumptions

- Client-first, persistência local, Direct Play e navegação própria permanecem vinculados à constitution e ADRs aceitos. O usuário não autorizou reduzir produto para atingir metas.
- 100% de elegibilidade é estresse, não catálogo típico; 20% complementa a avaliação. Ganhos não devem depender só da variante extrema.
- Percentuais e prazos de consulta/propagação são propostas verificáveis desta spec. O usuário escolheu aceite comparativo sem fornecer percentuais ou SLA absoluto de hardware.
- Retenção exploratória indica oportunidade, sem vazamento confirmado; novas medições cobrem histórico, episódios e imagens antes de concluir ganhos.
- Código inicial considera pacote local, sem supor compressão HTTP, CDN ou backend; primeiro acesso às telas continua completo/utilizável.
- [Bem avaliados](../056-bem-avaliados/spec.md), [Top 10/Dica](../057-top10-dica-tmdb/spec.md) e [Home/vitrine expandida](../060-home-vitrine-expandida/spec.md), incluindo emendas, orientam equivalência. [Código saudável/benchmark](../063-codigo-saudavel-benchmark/spec.md) orienta o plano sem confundir benchmark de importação com aceite de telas.
- [Constitution](../../../.planning/memory/constitution.md) e ADRs aceitos prevalecem sobre exemplos históricos. Por decisão explícita do usuário, validação física é recomendada nesta feature; navegador/emulador não demonstram AVPlay, desempenho ou RAM física.

## Clarifications

### Sessão 2026-10-07

- Q: Onde a lentidão é mais perceptível, tamanho da lista e M3U ou Xtream? → A: “Preciso que faça medições para entender”. Review produziu evidências exploratórias; aceite exige comparação pareada.
- Q: Qual escopo especificar para as otimizações do review? → A: “Todos os achados, incluindo splash e bundle”. Incluídas US1–US5.
- Q: Podemos mudar cards, ordem das fileiras ou quantidade de conteúdo? → A: “Preservar conteúdo, seleção, ordem e navegação atuais (Recomendado)”. Aplicado a FR-001–FR-003 e equivalência.
- Q: Como definir o aceite de desempenho? → A: “Metas comparativas no benchmark; TV como validação recomendada”. Aplicado ao protocolo, FR-026 e SC-013; TV não é gate de encerramento.

Não há clarificações pendentes. Domínio/dados, integrações, estados de UX e constraints foram esclarecidos pelo repositório e contratos vigentes; decisões técnicas ficam para sdd-plan.
