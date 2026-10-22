# Comparação técnica: xstream-player × ccplayTv

Data: 21/10/2026. Escopo: funcionalidades, desempenho e oportunidades de produto.

**Parecer:** vale aproveitar principalmente a invalidação de episódios por alteração do provedor, a personalização de legendas e a relevância da busca. A comparação não justifica substituir a arquitetura, a virtualização ou o foco do ccplayTv. Para desempenho, a prioridade deve ser concluir a feature 087 e investigar as pausas já registradas na busca e na grade Todos.

## 1. Método e limites

- Revisão estática dos caminhos de catálogo, busca, player, legendas, persistência, perfis, pareamento e compartilhamento; conferência de backlog, planos, constitution e ADRs do ccplayTv.
- Bases locais: ccplayTv, branch feature/licenca, HEAD 3bb87bb6c9ddba640b29070659b4a2b2113b3651; xstream-player, branch main, HEAD db95fbfaefb35b4781cc57b011ecfedf587e3a4a. Os arquivos locais também foram considerados; HEAD não representa sozinho todo o conteúdo inspecionado.
- O ccplayTv já tinha alterações em E2E e capturas da feature 087. Foram preservadas. Este trabalho acrescenta somente este relatório.
- Não executei aplicações, testes, benchmarks, emulador ou TV física. Não instalei dependências, consultei provedores nem li arquivos de credenciais ou bancos de uso.
- Números de desempenho abaixo são **evidências anteriores registradas no repositório**, com origem indicada. Não são medições desta análise nem comparação de velocidade entre os apps.
- “Não localizado” refere-se aos caminhos inspecionados. Esforço pequeno/médio/grande expressa complexidade relativa, sem estimativa de prazo.

## 2. Diferenças que determinam o reaproveitamento

| Dimensão | xstream-player | ccplayTv | Implicação |
| --- | --- | --- | --- |
| Execução | Next.js com rotas de servidor e SQLite | React/Vite; catálogo e importação na TV, IndexedDB/Dexie | Tirar processamento da TV transfere custo para um servidor |
| Cliente instalável | Bootstrap local que pareia e entrega a experiência ao servidor | Aplicação Tizen com catálogo e estado locais | O cliente leve do xstream depende de infraestrutura ligada |
| Reprodução | HTML/HLS; relay e FFmpeg para compartilhamento | PlayerService/AVPlay, Direct Play | Configurações HLS não se aplicam diretamente ao AVPlay |
| Catálogo grande | SQLite; carregamento incremental de cards | Blocos/chunks, projeções, janelas e virtualização | Já temos mecanismos adequados para limitar memória e DOM |
| Foco | Busca geométrica de elementos DOM | Navegação por estado e identidade | Preservar nosso modelo |
| Perfil | Pessoa com preferências e histórico | Lista IPTV, conforme ADR-011 | Perfis familiares exigem novo domínio |
| Serviço central | Necessário à experiência principal | Portal restrito; catálogo e Direct Play locais | Sincronizar uso entre TVs amplia o escopo atual |

Fontes: [stack do xstream](../../xstream-player/package.json), [sincronização no servidor](../../xstream-player/app/lib/xtreamSync.ts#L124), [bootstrap TV](../../xstream-player/tv/bootstrap/app.js), [ADR-008](../sdd/adr/ADR-008-arquitetura-client-first-backend-so-quando.md#L60), [ADR-009](../sdd/adr/ADR-009-navegao-direcional-prpria-useremotenav-vez.md#L47), [ADR-011](../sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md#L96).

## 3. Matriz de oportunidades

| Recurso observado no xstream | Situação do ccplayTv | Recomendação | Prioridade / esforço |
| --- | --- | --- | --- |
| Invalidar detalhe quando muda o catálogo do provedor | Episódios usam idade do cache; o mapeamento da série não conserva last_modified | Incorporar sinal de alteração com TTL de segurança | Alta / médio |
| Aparência de legenda configurável | Overlay e atraso existem; aparência continua “Em breve” | Entregar tamanho e fundo usando V14 | Alta / pequeno a médio |
| Busca por correspondência exata e início de palavra | Prefixo primeiro, depois ocorrência; desempate alfabético | Avaliar ranking mais útil como mudança explícita de regra | Média / médio |
| Novidades relacionadas ao histórico | Já há adicionados, histórico e recomendações; sem equivalente localizado com confirmação de episódios novos | Criar novidades confiáveis de séries acompanhadas | Média / médio |
| Uso de conexões da conta | Já há estado e expiração; contadores não localizados no contrato | Diagnóstico sob demanda | Média / médio |
| Legendas externas via OpenSubtitles | Caminho inspecionado atende legendas embutidas | Estudo de viabilidade antes de especificar | Média / grande |
| Retomada entre dispositivos | Backup/restauração existem; não equivalem a sincronização contínua | Evolução própria da ideia já registrada | Futuro / grande |
| Perfis de pessoas | Perfil atual representa lista | Avaliar se houver demanda familiar | Futuro / grande |
| Convite temporário para recomeçar VOD após retomar | Retomada já existe; esse convite não foi localizado | Melhoria opcional de conveniência | Baixa / pequeno a médio |
| Próximo episódio com contagem | Já existe | Não duplicar | Manter |
| Favoritos, continuar assistindo, TMDB, carrosséis e ordenação | Já existem | Melhorar problemas concretos | Manter |
| Cadastro pelo celular / pareamento | Portal e QR já existem | Manter experiência e regras próprias | Manter |
| Retransmitir uma conexão para vários aparelhos | Fora do modelo atual | Não incorporar na arquitetura vigente | Não priorizar |

O [backlog](../.planning/backlog.md#L38) foi conferido para não tratar funcionalidades existentes como novidades. O ccplayTv também já tem EPG completo, catch-up Xtream, gestão de categorias/parental e rádio global; seus estados específicos continuam nos respectivos planos. Esta revisão não renova aceite físico.

## 4. Funcionalidades: evidências e proposta

### F1. Atualizar episódios quando o provedor altera a série

O xstream grava um source_stamp junto ao detalhe e compara com last_modified do catálogo. Se mudou, deixa de servir aquele detalhe; também expira por tempo quando o provedor não informa data.

No ccplayTv, ensureSeriesEpisodes considera o horário da última obtenção, com janela de 24 horas. O mapeamento da série não conserva aquele sinal de alteração.

**Proposta:** guardar uma versão/alteração própria do provedor e atualizar episódios quando ela mudar. Nunca transformar last_modified em “adicionado recentemente”. Manter episódios antigos utilizáveis se a rede falhar e preservar as regras de M3U/eager/stored.

**Validação:** episódio incluído dentro do TTL; alteração somente de capa/sinopse; data ausente/inválida; provedor indisponível; histórico preservado; nenhuma consulta ao focar. Trata-se de lacuna de mecanismo, não reprodução de bug nesta sessão.

Fontes: [invalidação do xstream](../../xstream-player/app/lib/sqliteCache.ts#L592), [TTL atual](../tv-web/src/lib/catalog/freshness.ts#L73), [obtenção de episódios](../tv-web/src/lib/catalog/seriesLoader.ts#L147), [mapeamento de série](../tv-web/src/lib/catalog/xtreamConnector.ts#L692).

### F2. Aparência das legendas: entrega delimitada com valor direto

O xstream persiste idioma e tamanho de legenda por pessoa. O ccplayTv já tem overlay próprio, atraso e preferências de trilha; o CSS declara aparência fixa e o registro central mantém a personalização como “Em breve”.

**Proposta inicial:** tamanho pequeno/médio/grande e fundo legível, configurados pelo controle remoto e persistidos no escopo de preferência escolhido. Usar tokens V14; não transportar valores em rem e atalhos de teclado do outro app.

**Validação:** texto multilinha, área segura, controles visíveis, seek, pausa e restauração da preferência. Cues e composição com o vídeo exigem AVPlay físico.

Fontes: [preferências do xstream](../../xstream-player/app/lib/userStore.ts#L30), [tamanho no player](../../xstream-player/components/VideoPlayer.tsx#L261), [overlay atual](../tv-web/src/components/SubtitleOverlay.tsx), [aparência fixa](../tv-web/src/styles/player.css#L345), [placeholder](../tv-web/src/lib/comingSoon.ts#L35).

### F3. Relevância da busca

O xstream classifica título exato → prefixo → início de palavra → ocorrência interna e desempata pelo tamanho do nome. O ccplayTv prioriza prefixo e ordem alfabética.

**Proposta:** avaliar título exato e palavra inteira antes de ocorrências incidentais. Preservar nomes do provedor e não juntar streams distintos por normalização agressiva.

É mudança de produto: a ordem atual está documentada nos contratos das features 017/018/026. Não deve entrar escondida numa otimização. A busca global está sem entrada na topbar por decisão anterior, com SEARCH_IN_TOPBAR = false; reativá-la exige decisão explícita. A busca por categoria continua sendo uma superfície útil.

Fontes: [ranking do xstream](../../xstream-player/app/lib/sqliteCache.ts#L460), [ranking atual](../tv-web/src/lib/catalog/catalogSearch.ts#L169), [entrada global escondida](../tv-web/src/features/shell/TopBar.tsx#L61).

### F4. Séries acompanhadas com novidades reais

O xstream prioriza séries vistas cuja data de alteração é posterior à última reprodução e marca hasNewEpisodes. **A data de alteração pode refletir manutenção de metadados; não comprova episódios novos.**

**Proposta:** conservar a última composição conhecida de episódios e comparar identidades após uma atualização já autorizada. Mostrar “Novos episódios” somente com acréscimo confirmado; se houver só a data, no máximo “Série atualizada”. Não consultar todas as séries para preencher uma fileira.

Pode começar com selo no detalhe/vitrine. Uma fileira nova no Início precisa respeitar a decisão anterior de simplificar aquela tela. F1 fornece uma base útil.

Fontes: [novidades do xstream](../../xstream-player/app/lib/newReleases.ts#L17), [resumo de séries assistidas](../tv-web/src/features/series/seriesWatchedSummary.ts).

### F5. Diagnóstico de conexões simultâneas

O xstream lê active_cons e max_connections. O contrato atual do ccplayTv contém estado, vencimento e instante da consulta, sem esses contadores.

**Proposta:** mostrar “conexões em uso / limite” quando o provedor declarar os valores, por ação em diagnóstico ou após falha compatível. Informação ausente deve aparecer como indisponível. O número pode estar atrasado e incluir a própria TV: não deve bloquear todo play. Não inferir nomes de outros dispositivos a partir de um contador.

Reaproveitar a consulta existente com prazo e erros sanitizados. Não copiar polling de 30 segundos. Isso é diagnóstico, sem compartilhar conexão.

Fontes: [contador do xstream](../../xstream-player/app/hooks/useAccountStatus.ts#L12), [limite](../../xstream-player/app/hooks/useConnectionLimit.ts#L12), [contrato atual](../tv-web/src/lib/catalog/sourceAccount.ts#L14), [consulta atual](../tv-web/src/lib/catalog/accountCheck.ts#L44).

### F6. Legendas externas: estudar antes de construir

O xstream pesquisa por TMDB/temporada/episódio, baixa legenda, converte SRT em VTT e persiste por idioma. O caminho usa rotas de servidor. Não localizei equivalente no ccplayTv.

Antes de especificar: confirmar autenticação e limites atuais do serviço, CORS na origem da TV, carregamento/desenho no caminho AVPlay e custo no orçamento de armazenamento. Essas condições não foram verificadas aqui.

Usar identidade fonte + tipo + obra + episódio + idioma. O armazenamento do xstream usa streamId + idioma; não transportar esse contrato diretamente. Qualquer necessidade de serviço adicional deve ser demonstrada e avaliada contra a arquitetura vigente.

Fontes: [API de legendas do xstream](../../xstream-player/app/api/subtitles/route.ts#L52), [persistência](../../xstream-player/app/lib/subtitleStore.ts#L10), [contrato atual de trilhas](../tv-web/src/lib/player/tracks.ts).

### F7. Continuidade entre TVs e perfis familiares

O xstream mantém favoritos e progresso no servidor por pessoa. O ccplayTv tem backup, mas levá-lo a outra TV/celular é uma ideia separada no backlog. Perfis de pessoas também são diferentes de “perfil = lista”.

São oportunidades, principalmente “continuar no quarto”. Antes de construir, definir identidade entre fontes, conflito entre reproduções, exclusão/restauração, modo offline e consentimento. Sincronização automática de uso amplia a finalidade do serviço e exige rever as decisões pertinentes; não é uma extensão pequena do backup nem exige automaticamente login obrigatório.

Fontes: [estado por pessoa](../../xstream-player/app/lib/userStore.ts#L331), [backup atual](../tv-web/src/lib/backup/usageBackup.ts#L26), [ideia registrada](../.planning/backlog.md#L12), [consulta sob demanda](../sdd/adr/ADR-016-consulta-sob-demanda-qr-fixo.md#L23).

### F8. Convite para recomeçar logo após retomar VOD

O xstream oferece durante alguns segundos começar do zero após uma retomada. Pode poupar navegação pelo seek. A retomada já existe no ccplayTv; o acréscimo seria apenas o convite dentro do player.

Se adotado, não roubar foco nem confundir com “Do início” do canal/catch-up. É opcional e posterior às lacunas acima.

Fonte: [StartOverPrompt](../../xstream-player/components/player/StartOverPrompt.tsx#L16).

## 5. Desempenho: ações recomendadas

### P1. Alta — diminuir trabalho síncrono na busca

**Evidência anterior:** o backlog registra 195–228 ms numa tarefa ao buscar “ma”, com 7.317 filmes correspondentes na TV. O helper filtra, agrupa e ordena todos os acertos sincronamente. A busca da categoria também o chama antes do sort em fatias da grade.

O xstream separa estado do campo e grade, usa memoização e evita respostas antigas. O SQL fica no servidor: não é ganho gratuito transportável para a TV.

**Ação:** preservar primeiro resultados e ordem, levando o cálculo caro para fatias canceláveis; reutilizar stableSortInSlices e impedir resultados obsoletos. Depois medir se separar campo e lista reduz renderizações. Cortar a lista depois de ordenar tudo não reduz o custo do sort. Limitar a seleção exige algoritmo e contrato próprios.

O debounce do xstream conflita com a regra atual de busca global sem debounce. useDeferredValue pode priorizar a apresentação, mas não acelera o cálculo nem substitui fatiar um sort monolítico. A documentação oficial foi consultada via Context7: [React: useDeferredValue](https://react.dev/reference/react/useDeferredValue#deferring-re-rendering-for-a-part-of-the-ui).

Fontes: [medição registrada](../.planning/backlog.md#L24), [busca global](../tv-web/src/lib/catalog/globalSearch.ts#L70), [busca antes do sort da grade](../tv-web/src/features/vod/useVodListItems.ts#L70), [fatias existentes](../tv-web/src/lib/slices.ts#L87), [campo isolado no xstream](../../xstream-player/app/dashboard/search/page.tsx#L49).

### P2. Alta — descobrir a causa das pausas na grade Todos

**Evidência anterior:** abrir Filmes → Todos → Ordenar A–Z elevou quadros acima de 100 ms de 3 para 32–33, inclusive após a feature 084. O registro reconhece que índice e ordenação não explicam sozinhos o comportamento.

A grade já virtualiza linhas, com três extras acima e duas abaixo, seis colunas por linha. As capas já usam lazy loading e decode assíncrono. Recomendar acrescentar esses mecanismos repetiria o que existe.

**Experimento:** comparar o mesmo fluxo com placeholders no lugar das capas; medir render, layout e imagens separadamente; testar overscan menor mantendo a célula de foco montada; observar atualizações de props e consultas por card. Imagem, sombra e overscan são hipóteses, sem causa confirmada nesta análise.

**Aceite proposto:** menos tarefas longas e menor latência de tecla em rodadas na mesma TV/lista, sem buracos, perda de foco ou regressão no RETURN. Abertura rápida sozinha não basta.

Fontes: [achado existente](../.planning/backlog.md#L18), [janela atual](../tv-web/src/features/vod/VodCategoryScreen.tsx#L60), [capas atuais](../tv-web/src/components/PosterArt.tsx#L41).

### P3. Alta — concluir 087 e preservar a base das 082–086

No painel consultado: 082 implementada, 89/89; 083 convergida, 37/37; 084 convergida, 33/37; 085 convergida, 40/40; 086 convergida, 68/73; 087 em execução, 29/34. Contagens residuais não significam automaticamente defeitos: cada plano define encerramento e riscos.

Produzir seleções em segundo plano e ler um resultado pequeno já está na 086/087. O xstream guarda seleções de carrossel/hero, mas isso não é novidade a implementar de novo. O plano da 087 registra Filmes/Séries abrindo em 313–380 ms na TV em 21/10 e espera ganho na fluidez após abrir.

**Ação:** fechar gates da 087 e medir a navegação durante a produção, preservando conteúdo tardio na mesma visita. Reutilizar o canal de métricas; não introduzir telemetria externa automática.

Fontes: [painel](../.planning/backlog.md#L123), [objetivo e medição da 087](../sdd/specs/087-top10-dica-segundo-plano/plan.md#L7), [seleções guardadas](../tv-web/src/features/catalog/showcaseSelections.ts#L34), [métricas existentes](../tv-web/src/lib/perf/metricsChannel.ts#L1).

### P4. Média — medir memória do produtor em segundo plano

O produtor da 087 lê em lotes, mas acumula um array compacto do tipo inteiro para casar títulos. Isso reduz dados por item, porém não torna o uso de memória constante. Não há prova aqui de que esse array cause problema.

Se a medição mostrar pressão, avaliar reutilização do índice entre seleções ou comparação incremental. Chavear por lista/geração/idioma e respeitar remoção da chave TMDB e visibilidade parental. Fazer depois da estabilização da 087; cache extra também exige espaço e invalidação.

**Cuidado na referência:** deviceProfile.ts do xstream declara tamanhos adaptáveis de sincronização, mas não encontrei consumidores desses parâmetros no fluxo atual, que usa lote fixo de 1.000 no servidor. Há consumidores efetivos do perfil na busca, no progresso e no player. Não tratar configuração declarada como otimização comprovada.

Fontes: [array acumulado](../tv-web/src/lib/catalog/externalRows.ts#L66), [perfil do xstream](../../xstream-player/app/lib/deviceProfile.ts#L15), [lote efetivo](../../xstream-player/app/lib/xtreamSync.ts#L34).

### P5. Média — adaptação por capacidade somente com justificativa

O ccplayTv já tem orçamento de 8 ms por fatia e pré-carga bloqueada por player, visibilidade, rede e teclas. Se houver pausas medidas, avaliar reduzir trabalho por fatia com limites conservadores. Evitar classificar toda TV somente por user agent ou depender de uma API opcional.

Não copiar buffers HLS para AVPlay, aumentar espera de início do vídeo ou reduzir gravação de progresso de 5 para 15/30 segundos sem custo medido. No xstream parte da economia reduz chamadas de rede; nossa gravação é local e tem contratos próprios.

Fontes: [fatias atuais](../tv-web/src/lib/slices.ts#L24), [portão de atividade](../tv-web/src/lib/catalog/prefetch/activityGate.ts#L72), [perfil HTML/HLS](../../xstream-player/components/VideoPlayer.tsx#L85), [progresso adaptado no xstream](../../xstream-player/app/context/WatchProgressContext.tsx#L42), [gravação atual](../tv-web/src/lib/player/progressRecorder.ts#L128).

## 6. Padrões que não convém transportar diretamente

| Padrão do xstream | Motivo |
| --- | --- |
| Relay de uma conexão entre aparelhos | Requer infraestrutura; VOD usa FFmpeg e experiência compartilhada sem seek independente. Conflita com Direct Play |
| Infinite scroll como substituto de virtualização | visibleCount só cresce e mantém cards anteriores no DOM; já temos janela virtual |
| Navegação pela geometria de todos os elementos | Consulta elementos e mede retângulos ao navegar; contraria ADR-009 |
| Paginação do proxy como redução do download do provedor | Baixa a resposta inteira e depois recorta a página; distribui o custo, não o elimina |
| Configuração sensível em JSON e log da URL completa | A rota constrói URL com usuário/senha e a registra; também retorna mensagem crua em erro |
| Preview disparado por foco | Contraria constitution/ADR-011 |
| Copiar o player inteiro como base | VideoPlayer do xstream tem 1.627 linhas no snapshot; já separamos motor, composição e preferências |

Fontes: [relay VOD](../../xstream-player/app/lib/vodBroadcast.ts), [infinite scroll](../../xstream-player/app/hooks/useInfiniteScroll.ts#L19), [foco geométrico](../../xstream-player/app/hooks/useTvNavigation.ts#L135), [paginação](../../xstream-player/app/api/proxy/route.ts#L32), [log de URL](../../xstream-player/app/api/proxy/route.ts#L99).

**Código e licença:** o pacote declara AGPL-3.0-only e inclui licença AGPLv3. A recomendação é aproveitar conceitos e implementar dentro dos nossos contratos. Eventual cópia literal precisa ter compatibilidade de licenças avaliada antes; este documento não é parecer jurídico. Fontes: [package.json](../../xstream-player/package.json#L5), [LICENSE](../../xstream-player/LICENSE).

**Qualidade e evidência:** localizei 656 arquivos no padrão de teste .test.ts/.test.tsx sob tv-web/src e nenhum arquivo de teste no padrão .test./.spec. no xstream inventariado. O package do xstream não declara script de testes. Contagem não mede cobertura ou correção e nenhuma suíte foi executada nesta sessão; adaptações precisam passar pelos nossos contratos.

## 7. Ordem sugerida e verificação

| Ordem | Trabalho | Resultado esperado | Verificação |
| --- | --- | --- | --- |
| 1 | Fechar 087 e medir busca + grade Todos | Menos pausas, sem duplicar otimizações | Mesma TV/lista; separar banco, sort, render e imagens |
| 2 | F1: versão do provedor nos episódios | Não esperar só TTL para perceber alterações | Mudança dentro de 24 h, falha de rede, histórico preservado |
| 3 | F2: aparência das legendas | Legibilidade e preferência real | Controle remoto, multilinha, idiomas e AVPlay físico |
| 4 | F3 e F5: relevância e conexões | Encontrar conteúdo e explicar falhas | Contratos revistos; contadores ausentes/atrasados/limite |
| 5 | F4: novidades de séries | Mostrar episódios novos com evidência | Comparar identidades; alteração de metadados sem selo falso |
| 6 | Estudar F6/F7 | Decidir sobre legenda externa e continuidade entre TVs | Viabilidade técnica, demanda e revisão de arquitetura |

São propostas: nenhuma feature foi criada, nenhum status do backlog foi alterado e nenhum ganho foi prometido como medido. A implementação deve seguir o fluxo SDD correspondente. O ponto de partida mais sólido para desempenho são os gargalos já documentados no ccplayTv.
