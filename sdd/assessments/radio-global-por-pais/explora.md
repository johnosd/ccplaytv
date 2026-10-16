# Assessment Explora: Rádio global por país

- **Slug**: radio-global-por-pais
- **Criado**: 2026-10-15
- **Origem**: texto do usuário + análise do repositório local `Open-Media-Explorer` (modo "Tuner")

## Ideia Bruta

Trazer para o ccplayTv a feature "Tuner" do Open-Media-Explorer (OME): um rádio
de internet global em que a pessoa escolhe um país e navega pelas estações dele,
tocando ao vivo. O usuário gostou da feature e quer avaliar o porte para a TV.

### Como o OME faz (levantado no código)

- **Fonte de dados**: diretório público e comunitário Radio Browser
  (`api.radio-browser.info`), não um catálogo próprio. Adapter em
  `src/adapters/radio-browser.js` (206 linhas):
  - descoberta de espelho via `all.api.radio-browser.info/json/servers`, sorteio,
    sonda `/json/stats` (3 s) em até 4 espelhos, fallback `de1`; espelho que cai
    no meio da sessão é invalidado e redescoberto uma vez;
  - estações por país: `GET /json/stations/search?countrycode=XX&hidebroken=true&order=clickcount&reverse=true&limit=80`;
  - normaliza `url_resolved` → URL do stream, `hls` → tipo, favicon/tags/país;
  - após tocar, POST "silencioso" em `/json/url/{stationuuid}` (contagem de cliques pedida pela API).
- **UI** (`src/modes/tuner.js`, 526 linhas): seletor de país com **11 países fixos**
  + "todos"; banda Rádio/TV (TV vem do iptv-org); dial SVG em que 12° = 1 estação,
  com arrastar/setas/Enter, e faixa de ~31 "pills" em volta da estação atual;
  **frequência cosmética** `87.5 + índice × 0.1` MHz (não corresponde a nada real);
  geração + `AbortController` contra resposta velha; dedupe por id; status por
  fonte; estação quebrada avança para a próxima.
- **Reprodução**: `<audio>`/HLS.js através de um relay local em Python (app desktop
  Windows) — não se aplica à TV.

## Evidência a Favor

- **API viável direto da TV, sem backend** (verificado em 2026-10-15 com `curl`):
  `Access-Control-Allow-Origin: *` respondendo a `Origin: null` (o que a origem
  `file://` da TV envia) — compatível com o client-first da ADR-008.
- **Seleção de país melhor que a do OME, de graça**: `/json/countries` devolve ~230
  países com `stationcount` (ex.: AR 1267, AE 813) — dá para ordenar e não inventar
  lista fixa.
- **Dados ricos para filtrar no AVPlay**: cada estação traz `codec` (AAC+, MP3…),
  `bitrate`, `hls`, `lastcheckok`, `clickcount`, `url_resolved`, `favicon`
  (consulta real ao BR: "Rádio Antena 1 94.7 FM", AAC+ 96 kbps, `lastcheckok: 1`).
- **Encaixe técnico no player existente**: AVPlay toca http/https sem CORS;
  `mediaCapabilities('channel')` já nega pausa/seek, o certo para rádio ao vivo
  (`tv-web/src/lib/player/capabilities.ts`).
- **Precedente de que rádio aparece no domínio**: a feature 044 já reconhece
  `radio="true"` em listas M3U (`classifier.ts`, `db.ts`) — listas IPTV reais trazem
  rádios misturadas com canais, hoje sem UI própria.
- **Sinal de demanda**: o próprio usuário (dono do produto) pediu.
  ASSUMPTION: pessoas que usam app IPTV na TV também querem rádio; não há dado
  de uso, pesquisa ou pedido de terceiros que comprove.
- **Diferencial**: ASSUMPTION — apps IPTV concorrentes na Tizen raramente trazem
  rádio global embutido; não verificado.

## Evidência Contra

- **Fora do núcleo do produto**: o ccplayTv é um player de listas IPTV da pessoa
  (constitution, ADRs 008/011). Rádio global é conteúdo de um diretório de
  terceiro, independente da lista — muda a natureza do app ("tudo vive dentro de
  uma lista ativa", ADR-011 §3 lista ativa única).
- **O player só toca item do catálogo local**: `PlayerLayer` recebe `itemId` e
  resolve por `fetchPlayback` → `getChannel` no IndexedDB. Estação do Radio
  Browser não está lá; exige caminho de reprodução novo ou poluir o catálogo.
- **Áudio puro no AVPlay nunca foi validado** no projeto; estações Opus/Vorbis
  podem falhar; plano de vídeo fica preto (precisa de tela "tocando agora"). Só a
  TV física responde (skill `tizen-tv`).
- **Dependência externa sem SLA**: serviço comunitário, espelhos somem (o próprio
  OME documenta lista de servidores com entradas mortas). A API pede `User-Agent`
  identificável, que o Chromium da TV não deixa definir. Termos de uso comercial
  não verificados — o app é comercial (licença/pagamento, ADR-013).
- **Custo de navegação/DS**: `TopbarItem`/`TopDestination` são uniões fechadas; a
  ADR-011 mantém a topbar enxuta; cada tela nova exige i18n pt/en/es, memória de
  foco por id, estados vazio/erro focáveis, auditoria `legibilidade-tv` e E2E.
- **Partes "bonitas" do OME não portam**: dial e frequência são dado inventado
  (constitution proíbe); "girar toca na hora" viola "mover foco seleciona, OK toca".
  O que resta do Tuner é essencialmente "lista de estações por país" — o charme
  que o usuário viu é justamente o que não pode vir.
- **Concorrência com rádios da própria lista**: se a lista da pessoa já traz
  rádios (044), uma tela de rádio que ignore isso duplica conceitos.

## Resultado do spike na TV física (2026-10-15)

Pedido pelo primeiro Decide (needs-clarification). Página mínima descartável em
`spikes/radio-avplay/`, app Tizen separado (`rdSpike001.RadioSpike`, assinado com
`ccplay_samsung_certificate_4`), instalado por `sdb` na TV de referência
QN50Q60DAGXZD (192.168.0.2). Ela segue o fluxo da feature, sem M3U: descobre o
espelho por `all.api.radio-browser.info`, busca as 10 estações mais populares do BR
(`hidebroken`, `order=clickcount`) direto da TV e toca cada `url_resolved` no
`webapis.avplay` (open → prepareAsync → play). "Tocou" = primeiro
`oncurrentplaytime > 0` em até 15 s, mantido 5 s.

- **Resultado, visto e ouvido pelo usuário na TV**: **10 de 10** estações tocaram,
  com som audível ("funcionou com sucesso tocando a rádio").
- Confirmado indiretamente: a consulta ao Radio Browser a partir da origem do app
  na TV funciona (a tabela carregou).
- **Não registrado**: o tempo até o áudio de cada estação, a distribuição de codecs
  das 10 (a consulta de 2026-10-15 pelo PC trazia AAC+ e MP3 no topo), outros
  países e estações Opus/Vorbis. Também não foi testado rede ruim nem estação fora
  do topo.

## Perguntas em Aberto

- Rádio precisa funcionar sem lista IPTV ativa (antes da tela de perfis)?
- Onde entra: topbar, dock de serviços do Início ou Configurações?
- Continua tocando em segundo plano ao navegar pelo app? (AVPlay é singleton.)
- Favoritos/histórico de estações entram no MVP?
- Mostrar também as rádios `radio="true"` da própria lista na mesma tela?
- Termos de uso do Radio Browser permitem uso em app pago?
