# ADR-018: Radio Browser como diretório de rádio de terceiro

## Status

Aceita. Atualiza a ADR-008 (client-first) com uma categoria de terceiro que ela não
previa, e a ADR-011 §3 (itens da topbar).

## Data

2026-10-15.

## Contexto

Até aqui, tudo o que o app **toca** vem da lista IPTV da própria pessoa. Os terceiros
com que a TV fala são de outra natureza:

- o **TMDB** é um serviço de metadado com a chave da pessoa (BYOK; ADR-008 §3/§4,
  constitution 1.6.0);
- o **YouTube** entra por página-ponte, só para trailer (ADR-012);
- o **portal** é infraestrutura própria (ADR-013 a ADR-017).

O assessment `sdd/assessments/radio-global-por-pais/` (veredito `go`, 2026-10-15) pede
uma tela **Rádio**: a pessoa escolhe um país e toca estações de rádio de internet. A
referência é o modo "Tuner" do Open-Media-Explorer, que usa o diretório comunitário
**Radio Browser** (`api.radio-browser.info`). Isso é **conteúdo de um diretório de
terceiro, sem chave e sem conta**, independente da lista. Nenhuma ADR cobre essa
categoria.

Fatos verificados em 2026-10-15:

- **CORS**: `Access-Control-Allow-Origin: *`, inclusive para `Origin: null` (o que a
  origem `file://` da TV envia). A TV consulta o diretório direto, sem backend.
- **Dados**: `/json/countries` devolve ~230 países com `stationcount`;
  `/json/stations/search` filtra por `countrycode` no servidor e traz `url_resolved`,
  `codec`, `bitrate`, `hls`, `lastcheckok`, `clickcount`, `favicon` e `stationuuid`.
- **Spike na TV física** (QN50Q60DAGXZD, app separado `rdSpike001.RadioSpike`, código
  em `spikes/radio-avplay/`): busca direta do diretório, AVPlay com `url_resolved`;
  **10/10** estações mais populares do BR tocaram, com som ouvido pelo usuário.
- **Regras do serviço** (página `api.radio-browser.info`):
  - "You may use it in free and non free software." Não há licença de dados nomeada.
  - "Send a speaking http agent string."
  - Descobrir os servidores por `all.api.radio-browser.info`, sortear e tentar o
    próximo em caso de falha. "Never use a direct link to a single new server."
  - "Send /json/url requests for every click the user makes."

## Decisão

### 1. Uma categoria nova de terceiro: diretório público de conteúdo

O app PODE consultar diretamente um **diretório público de conteúdo**, sem chave,
sem conta e sem backend, para listar e tocar mídia que não vem da lista da pessoa.
O único diretório registrado é o **Radio Browser**, só para **rádio**. Outro diretório
(TV aberta do iptv-org, podcasts) exige emenda desta ADR, não reuso silencioso.

### 2. O que sai da TV, e para quem

| Destino | O que recebe | Quando |
|---|---|---|
| `all.api.radio-browser.info` / espelhos | código ISO do país; `stationuuid` (POST `/json/url`); parâmetros fixos (`hidebroken`, `order`, `limit`, `offset`) | só por ação da pessoa (abrir Rádio, entrar num país, tocar uma estação) |
| host do stream de cada estação | a requisição do AVPlay | ao tocar (OK) |
| host do favicon de cada estação | a requisição da imagem | ao exibir a estação |

- **Nunca** sai da TV para esses destinos: credencial, URL ou nome da lista IPTV, id do
  dispositivo/chave/licença, conteúdo do catálogo, chave TMDB, favoritos ou histórico.
  O conector **não importa** de `lib/catalog` nem de `lib/portal`.
- Todos esses destinos veem o **IP da TV**. A pessoa aceitou isso em 2026-10-15:
  - é o mesmo que acontece ao tocar qualquer stream;
  - o POST de clique diz ao diretório **qual estação** foi tocada, só pelo uuid, sem
    identificador da pessoa.
- **Foco nunca dispara consulta** (constitution). Focar um país não busca estações:
  OK entra no país e só então busca. Não há prefetch de estações de outros países.

### 3. Como falar com o diretório

- **Ponto único de rede** (`lib/radio/`, nome final no plano), no padrão do
  `tmdbConnector.ts`:
  - erros de categoria fixa (`offline`, `refused`, `rate_limited`, `bad_response`);
  - nunca a mensagem crua do `fetch`;
  - nenhum `console.*` com URL;
  - corpo validado antes de usar, como o `http.js` do Open-Media-Explorer faz
    (resposta HTML, JSON malformado ou não-array é falha, nunca lista vazia).
- **Descoberta de espelho** como o serviço pede:
  - `GET https://all.api.radio-browser.info/json/servers` (o browser não faz DNS
    lookup), ordem aleatória, primeiro espelho que responde a `/json/stats` em
    ≤ 3 s, no máximo 4 tentativas;
  - fallback `de1.api.radio-browser.info`;
  - espelho que falha no meio da sessão é descartado e redescoberto uma vez;
  - o espelho escolhido pode ser guardado no aparelho como dica, nunca como
    endereço fixo.
- **Clique**: POST `/json/url/{stationuuid}` depois de o AVPlay começar a tocar, sem
  esperar resposta e sem efeito na UI. Falha é silenciosa.
- **User-Agent**: tentar enviar `CCPlayTv/<versão>`. O Chromium pode descartar o
  cabeçalho no `fetch`/XHR; isso não foi verificado. Se descartar, fica o do
  navegador, e isso é aceito como desvio da regra do serviço.
- **Só estações utilizáveis**: `hidebroken=true` e `url_resolved` presente. Filtrar
  codec ou marcar estação que o AVPlay não toca é decisão da feature.

### 4. Reprodução e identidade

- A URL tocada é a `url_resolved` do diretório, entregue ao `PlayerService` (AVPlay na
  TV). Não há proxy, relay ou transcodificação (Direct Play, ADR-001). Rádio ao vivo
  não oferece pausa nem busca (capacidade de `channel`).
- **Identidade estável** de uma estação: `radio-browser:<stationuuid>`, nunca a URL do
  stream (constitution). As URLs da estação não são segredo, mas mudam, e por isso
  não são chave de nada.
- Texto do diretório (nome da estação, país, tags) é **texto de provedor**: não é
  traduzido e é escapado/limitado como dado não confiável.
- **Favicon**:
  - só `http(s)` sem credencial na URL, como o `safeExternalUrl` do
    Open-Media-Explorer;
  - carregamento com tempo limite;
  - se falhar, iniciais/avatar estável, como o app já faz para listas;
  - nenhuma imagem é proxyada.

### 5. Dados locais

- **Cache** (ADR-002) em IndexedDB: a lista de países e a última lista de estações de
  cada país visitado, com TTL definido no plano da feature. Sem rede, a tela abre do
  cache e diz isso. Tocar continua exigindo rede.
- **Favoritos de estação** ficam **só no aparelho**, numa tabela própria com chave
  `radio-browser:<stationuuid>`, guardando nome/país/favicon para listar offline.
  - **Não entram** no backup de uso da ADR-017. Decisão do usuário, 2026-10-15:
    trocar de TV perde esses favoritos.
  - **Não se misturam** com os favoritos do catálogo, que têm chave por fonte.
- Dados de rádio **não pertencem a uma lista**: não são apagados ao remover uma lista
  e não entram em contagem, prefetch, parental ou categorias ocultas da lista.

### 6. Item "Rádio" na topbar (emenda da ADR-011 §3)

- A topbar passa a ter **Início, TV ao vivo, Filmes, Séries, Rádio**, nesta ordem.
  Depois vêm o indicador da lista, Busca, Configurações e relógio.
- **Rádio exige lista ativa**, como os outros destinos (a topbar só existe com fonte
  ativa). Mas **não lê da lista**: é o único destino de topo cujo conteúdo vem de fora
  dela.
- RETURN em Rádio segue a regra dos destinos de topo: volta ao Início.

### 7. Indisponibilidade do diretório

Serviço comunitário, sem SLA, sem contrato. Se nenhum espelho responder, a tela mostra
um estado de erro **focável e acionável** (tentar de novo) e o cache, se houver.
**Não** se cria proxy, backend ou espelho próprio (ADR-008); o `api/` congelado não
entra.

## Alternativas Consideradas

### Proxy/backend próprio para o diretório (como o relay do Open-Media-Explorer)

- O OME passa metadado e mídia por um servidor Python local, por ser app desktop.
- **Rejeitada:** a TV não precisa disso. O CORS é `*` e o AVPlay toca o stream direto
  (spike 10/10). Um backend sempre ligado é o que a ADR-008 evita, e um relay de mídia
  violaria Direct Play (ADR-001).

### Gravar as estações como uma "lista" sintética no catálogo

- Reaproveitaria Live TV e `PlayerLayer` sem tela nova.
- **Rejeitada:** briga com a fonte ativa única (ADR-011 §3) e com contagens, prefetch,
  parental e o backup, que assumem lista de provedor. Também misturaria favoritos de
  chave diferente.

### Só as rádios que a própria lista declara (`radio="true"`, feature 044)

- Sem terceiro novo.
- **Rejeitada como resposta a este pedido:** não entrega "global por país". Pode
  coexistir depois, numa feature própria.

### Endereço fixo de um espelho (ex.: `de1.api.radio-browser.info`)

- Mais simples.
- **Rejeitada:** o serviço proíbe ("Never use a direct link to a single new server"), e
  espelhos somem. O próprio OME mantém o fallback só como último recurso.

### Não enviar o clique (`/json/url`)

- Menos informação ao terceiro.
- **Rejeitada pelo usuário (2026-10-15):** descumpriria um pedido explícito do serviço
  usado de graça. O uuid da estação não identifica a pessoa.

### Só iniciais, sem favicon

- Nenhum host extra além do stream.
- **Rejeitada pelo usuário (2026-10-15):** o visual da tela fica pobre demais. O
  fallback por iniciais cobre a falha.

### Rádio fora da topbar (dock do Início ou trilha dentro da Live)

- Não mexeria na ADR-011.
- **Rejeitada pelo usuário (assessment, 2026-10-15):** rádio é um destino de uso
  próprio ("usar a TV como rádio"), não um serviço acessório.

### Favoritos de estação no backup da ADR-017

- Sobreviveriam à troca de TV.
- **Rejeitada para agora (usuário, 2026-10-15):** mais simples manter local. Revisitar
  se houver pedido.

## Consequências

### Positivas

- Rádio global sem backend, sem chave e sem custo, com descoberta de país completa
  (~230 países com contagem), melhor que os 11 países fixos do OME.
- O player não muda de natureza: recebe uma URL e uma identidade, como sempre.
- Fronteira explícita do que sai da TV para o diretório, os streams e os favicons.

### Negativas

- **Dependência de serviço comunitário sem SLA** e de **centenas de hosts de stream e
  imagem** fora do controle do projeto. Estação que some ou muda de URL é normal.
- **Termos de uso**: o serviço permite "non free software", mas não nomeia licença de
  dados. O usuário assumiu o risco (assessment, 2026-10-15).
- **User-Agent** possivelmente descartado pelo navegador: desvio aceito da regra do
  serviço.
- O diretório e cada host de stream/favicon veem o **IP da TV**, e o diretório vê quais
  estações são tocadas (uuid). Aceito pelo usuário.
- Primeiro destino de topo que não lê da lista ativa. Quem assumir "toda tela de topo
  vem da fonte ativa" erra a partir de agora.
- Favoritos de estação se perdem ao trocar de TV.
- A topbar volta a ter 5 destinos. O layout V14 precisa absorver isso, inclusive em
  en/es (rótulos "Radio").
- Codecs fora do topo (Opus/Vorbis), outros países e o tempo até o áudio não foram
  medidos. O spike cobre só as 10 estações mais populares do BR.

### Caminho de Migração / Evolução Futura

- **Diretório indisponível por muito tempo ou fechado:** trocar o conector por outro
  diretório (exige emenda desta ADR). O resto da tela não sabe de onde vêm os dados,
  se o conector mantiver o contrato.
- **Termos mudarem e proibirem uso comercial:** remover a feature ou buscar
  diretório/licença comercial.
- **Rádios da própria lista (044):** feature separada pode mostrá-las na mesma tela
  como origem extra, sem mudar esta ADR.
- **Favoritos no backup:** emendar ADR-017 e a constitution (exceção g), que hoje
  lista os dados de uso do backup.
- **Outros diretórios** (iptv-org para TV aberta, podcasts): cada um é emenda desta
  ADR, com sua própria tabela "o que sai da TV".
