# ADR-002: Cache-First do Catálogo e Resiliência na TV

## Status

Aceita — revisada para delimitar o comportamento sem backend. Complementa a ADR-001; não estabelece reprodução de vídeo sem internet.

## Data

2026-09-13. Revisão documental: 2026-09-13.

## Contexto

A ADR-001 atribui ao backend a importação de M3U, o enriquecimento com TMDB e as integrações com OpenAI e controle externo. Esse serviço pode ficar indisponível mesmo quando a TV continua conectada à internet e às fontes de mídia.

O aplicativo deve preservar navegação e comandos locais usando os dados já sincronizados. Entretanto, **indisponibilidade do backend, perda da internet e indisponibilidade do provedor de vídeo são condições diferentes**. O aplicativo não deve apresentar a mesma promessa de funcionamento nos três casos.

## Decisão

Adotar **Cache-First para o catálogo**, com leitura local e atualização assíncrona quando houver conectividade — comportamento do tipo Stale-While-Revalidate. “Offline-First”, nesta ADR, refere-se ao acesso aos dados salvos, não ao armazenamento dos filmes, episódios ou canais.

### 1. Armazenamento local

IndexedDB será a base escolhida para os dados estruturados do catálogo. O suporte e o comportamento de armazenamento precisam ser confirmados no modelo/firmware-alvo; a Samsung documenta IndexedDB entre os recursos de armazenamento de sua plataforma.[^samsung-engine]

O cache deverá guardar os metadados necessários para as telas já sincronizadas e, quando permitido, as informações mínimas de reprodução. Não será tratado como armazenamento permanente garantido ou de capacidade ilimitada. Quota, falha de escrita, limpeza de dados e reinstalação precisam ser considerados; o padrão IndexedDB prevê falhas de gravação, inclusive por falta de espaço.[^indexeddb]

O volume máximo e a cobertura do catálogo ainda serão definidos por testes. Se apenas parte dos dados estiver salva, a interface indicará essa limitação. Não prometerá pesquisa completa sobre itens que nunca foram sincronizados.

**Atualização (feature 010, 2026-09-23):** esta previsão deixou de ser a exceção e passou a ser o **modo normal de operação** para fonte de provedor. A importação client-first (feature 005) inicialmente gravava o catálogo inteiro de uma vez; medido na TV física, isso travava a sincronização de uma fonte grande por tempo inaceitável — o gargalo era a própria gravação em IndexedDB, não a rede. A feature 010 resolve isso invertendo a ordem: a importação grava só a **estrutura** (as categorias declaradas pelo provedor), e os itens de cada categoria são obtidos e gravados só quando a pessoa entra nela, com prazo de validade próprio (reaproveitando a mesma noção de "velho" que já existia para a fonte inteira). Cobertura parcial do catálogo — a diretriz desta seção — é agora o estado esperado entre a sincronização e a navegação, não uma falha de rede ou de armazenamento. Fonte por URL M3U não muda: continua sem protocolo por categoria, então continua importando a lista inteira em fluxo, como sempre. Ver `sdd/specs/010-catalogo-sob-demanda/` para o desenho completo.

### 2. Inicialização e atualização

Ao abrir, a TV lerá a última versão local válida sem esperar um timeout do backend. Em paralelo, verificará se há atualização disponível.

As diretrizes desta revisão para a sincronização são: transferir e gravar dados em lotes limitados, manter versão do catálogo e data da sincronização, e preservar os dados válidos anteriores até que uma substituição coerente esteja pronta. Uma transferência interrompida não deverá apagar o catálogo utilizável.

O protocolo exato, os tamanhos dos lotes e a estratégia de troca de versão permanecem detalhes de implementação. Evitar um JSON integral excessivamente grande em memória é uma diretriz, não uma afirmação sobre o tamanho real das listas do usuário.

Sem cache e sem backend, a TV exibirá um estado de configuração/conexão necessária, com opção de tentar novamente. Não apresentará catálogo inexistente nem encerrará o aplicativo com erro fatal.

### 3. Capas e imagens

**Salvar a URL de uma capa não salva a imagem.** Apenas as imagens efetivamente armazenadas poderão ser exibidas sem acesso à sua origem.

A implementação terá política de cache de imagens com limite e descarte; até essa política ser validada, uma capa indisponível será substituída por uma imagem padrão incluída no aplicativo. Ausência de capa não deverá bloquear foco, navegação ou acesso aos detalhes disponíveis.

Vídeos e segmentos de streaming não fazem parte deste cache. Download de mídia para assistir sem internet seria outro recurso e exigiria uma decisão própria.

### 4. Reprodução e degradação graciosa

Como o caminho preferencial de mídia é direto da origem para a TV, a queda do backend não deve interromper a reprodução apenas por causa de uma falha de consulta ou do WebSocket.

Iniciar ou continuar uma mídia dependerá, contudo, de fonte acessível, conectividade necessária e credenciais válidas. Pode também depender de manifestos, segmentos, chaves ou licenças acessíveis. Direct Play elimina o proxy obrigatório, mas não elimina essas dependências; AVPlay continua sujeito aos formatos e mecanismos de DRM suportados.[^samsung-avplay]

| Situação | Comportamento esperado |
| --- | --- |
| Backend indisponível, cache existente e fonte acessível | Navegar nos dados salvos; tentar reproduzir somente com informações e autorizações válidas já disponíveis. |
| Internet indisponível, cache existente | Navegar nos dados salvos; não prometer reprodução de streams remotos. |
| Provedor, credencial ou licença indisponível | Preservar a interface e informar a falha daquele conteúdo, mesmo com o backend funcionando. |
| Cache ausente e backend indisponível | Exibir estado de conexão/configuração necessária e permitir nova tentativa. |

Voz processada pela OpenAI, novas recomendações externas, importações e controle Android roteado pelo backend ficarão indisponíveis quando suas dependências falharem. Pesquisa local nos dados salvos, navegação e controles locais de reprodução não deverão ser desabilitados por esse motivo.

Comandos nativos de voz dependem também dos serviços e recursos da Samsung; esta ADR não garante seu funcionamento sem internet.

### 5. Estado local, reconexão e segurança

A conexão com o backend será avaliada por tentativas reais de comunicação, com timeout e retomadas espaçadas. Um indicador genérico de rede não basta para confirmar a disponibilidade desse serviço.

Quando favoritos, histórico e progresso forem implementados, as alterações locais deverão poder ficar pendentes de sincronização. A política de conflitos entre dispositivos ainda precisa ser definida; não está implícita uma regra de sobrescrita pelo relógio da TV.

O cache não deverá conter chaves privadas de OpenAI ou TMDB. Credenciais de reprodução eventualmente necessárias à TV serão tratadas como dados sensíveis, com retenção mínima, sem exposição em logs e com descarte ao remover o vínculo pertinente. Cache não equivale a cofre de segredos nem autoriza contornar expiração ou revogação.

## Alternativas Consideradas

### Importar novamente a M3U na TV quando o backend cair

Não adotada. Criaria uma segunda implementação da importação e não recuperaria automaticamente o enriquecimento e as autorizações que dependem do backend. A decisão não se apoia na afirmação de que todo parse local congela qualquer TV.

### Bloquear completamente o aplicativo sem backend

Não adotada. Impediria o uso de metadados já disponíveis e tornaria comandos locais dependentes de um serviço que não deveria estar em seu caminho.

### Depender obrigatoriamente de Service Workers ou Dexie.js

Não adotada como requisito. A decisão é usar IndexedDB para dados; Dexie.js é uma biblioteca opcional, ainda não escolhida. Service Workers não são requisito para essa leitura/escrita e sua compatibilidade deve ser verificada separadamente na plataforma.[^samsung-engine][^indexeddb]

## Consequências

### Positivas

- Navegação baseada no catálogo salvo, sem depender da latência do backend a cada abertura de tela.
- Continuidade dos comandos locais e degradação por funcionalidade, em vez de bloqueio global.
- Possibilidade de reduzir transferências repetidas e manter a interface utilizável durante falhas de sincronização.

### Negativas

- Dados podem ficar desatualizados; URLs e autorizações podem expirar mesmo com metadados válidos.
- Sincronização, migrações de esquema, cobertura parcial e limites de armazenamento exigem implementação e testes.
- Persistir dados locais não garante inicialização instantânea, imagens disponíveis ou reprodução sem rede.

### Caminho de Migração / Evolução Futura

Começar com leitura do catálogo local e sincronização versionada em lotes. Avaliar atualizações delta quando o volume e a frequência de mudanças justificarem; não é necessário defini-las como requisito da primeira versão.

A validação deverá incluir: abertura com cache e backend desligado; primeira abertura sem cache; interrupção durante atualização; capa indisponível; quota insuficiente; URL expirada; perda de internet e reconexão. Esses testes são critérios propostos para implementação, não testes já executados.

## Referências técnicas da revisão

O requisito de resiliência vem da ADR fornecida. As distinções e diretrizes acima delimitam seu alcance; o mecanismo final de sincronização ainda não está implementado ou verificado nesta revisão. Fontes consultadas em 2026-09-13.

[^samsung-engine]: Samsung Developer — Web Engine Specifications, seção Offline Storage. `https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html`
[^indexeddb]: W3C — Indexed Database API 3.0, armazenamento e transações. `https://www.w3.org/TR/IndexedDB-3/`
[^samsung-avplay]: Samsung Developer — Playback Using AVPlay. `https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html`
