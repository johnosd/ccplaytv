# Assessment Explora: Viabilidade do YouTube IFrame na TV e do campo `youtube_trailer` do provedor

- **Slug**: viabilidade-youtube-iframe-na-tv-campo
- **Criado**: 2026-09-29
- **Origem**: ideia do backlog (item 32 — Trailers para filmes e séries)

## Ideia Bruta

Ação "Trailer" real no detalhe de filme/série (hoje mock soft-disabled `trailer`,
`comingSoon.ts`). Descoberta da referência por dois caminhos possíveis: o campo
`youtube_trailer` que o próprio provedor Xtream já entrega, e/ou o endpoint `videos`
do TMDB (BYOK, feature 032). Reprodução pelo YouTube IFrame Player oficial via um
`TrailerService` separado do `PlayerService` (ADR-006 §4.8, "condicional à prova na
Q60D"). Duas perguntas a responder antes de especificar: (1) o provedor cobre o
suficiente para dispensar ou reduzir o TMDB? (2) o IFrame funciona no pacote Tizen?

## Evidência a Favor

- **Medição real no painel de referência (2026-09-29, só contagens)**, script
  descartável no scratchpad, `.env` da raiz:
  - **Séries**: `get_series` (listagem inteira, 9 663 séries) traz `youtube_trailer`
    preenchido em **2 298 (24%)**; 100% dos valores preenchidos são **ID de 11
    caracteres** (nenhuma URL, nenhum formato estranho).
  - **Filmes**: `get_vod_info`, amostra de 80: campo presente em 80/80, preenchido em
    **1 (~1%)**.
- O campo, quando existe, já vem como `site`+`key` implícito (só o ID do YouTube) —
  exatamente o que a ADR-006 manda guardar (ID, nunca URL de mídia).
- O TMDB já é chamado ao abrir o detalhe (`lookupTmdb`, `append_to_response:
  'credits'`); acrescentar `videos` não cria requisição nova e respeita "nunca no foco".
- Chromium 108 (a TV de referência) suporta a IFrame Player API em si; o risco não é
  o motor, é a identificação do cliente (ver abaixo). ASSUMPTION: nenhum recurso de
  sintaxe da API exige mais que isso.
- Regra de produto já decidida: sem preview no foco (ADR-011), trailer só por ação
  explícita; 14 critérios de aceite prontos (TR-01…TR-14).

## Evidência Contra

- **O provedor não resolve filmes**: ~1% na amostra. Para filmes, quase todo trailer
  depende do TMDB (que exige a chave BYOK da pessoa — quem não configurou não tem
  trailer de filme). Para séries o provedor cobre ~24%.
- **Identificação obrigatória do cliente no YouTube**: a documentação oficial
  ("Required Minimum Functionality") exige o cabeçalho `HTTP Referer` em toda
  chamada do player embutido; em WebView vem vazio por padrão e o desenvolvedor deve
  defini-lo (formato `https://<id-do-app>`). Sem Referer o player devolve **erro 153**
  ("Video player configuration error").
- **Tizen especificamente**: há relato público de apps web Tizen (Xibo v3) que
  deixaram de exibir YouTube com erro 153 após a mudança de política do YouTube; o
  tópico foi fechado **sem solução** e sem dizer se rodava por `file://` ou `http(s)`.
  Não encontrei nenhum caso documentado de IFrame funcionando de forma confirmada
  num app web Tizen em 2026.
- **Nosso app é empacotado (`.wgt`)**, servido de origem local (ASSUMPTION: `file://`
  ou equivalente, sem `https` real). Não há API Tizen conhecida por mim para fixar o
  Referer de um iframe filho — a saída que a própria especificação cita é uma **página
  HTTPS intermediária hospedada pelo CCPlay**, que abre o IFrame com origem/Referer
  próprios. Isso é hospedagem estática, mas **é infraestrutura nova** (ADR-008 diz
  "sem backend sempre-ligado") e a spec avisa que "não resolve automaticamente todas
  as restrições".
- Player embutido é de terceiro: anúncios, branding e controles do YouTube não podem
  ser escondidos (developer policies); o navegar por D-pad dentro do iframe é
  incerto (foco dentro de um iframe cross-origin não é controlável pelo nosso
  `useRemoteNav`). ASSUMPTION — nunca testado aqui.
- Conflito de recursos: `webapis.avplay` é singleton e o IFrame também produz áudio;
  é preciso fechar a sessão do player antes (TR-08) e o desenho disso não existe.
- Sem acesso à TV nesta sessão: nada do lado da TV pôde ser provado agora; toda
  viabilidade do IFrame continua **hipótese** até um spike no aparelho.

## Spike na TV física (29/09/2026, QN50Q60DAGXZD)

App de teste separado (`TrlSpk0001.TrailerSpike`, assinado com o perfil Samsung,
desinstalado ao fim), log enviado a um servidor local do PC. Vídeo de teste:
`M7lc1UVf-VE` (demo oficial da IFrame API).

- **Ambiente real**: `Tizen 9.0`, Chromium **120** (não 108 como a documentação do
  projeto assumia); o app empacotado roda em **`file:///index.html`, origin
  `file://`**. O relato "Tizen 6.0+ usa origem local adequada" não vale para este
  aparelho.
- **IFrame direto do app — erro 153 em todas as variantes**: `youtube.com` (A),
  `youtube-nocookie.com` (B), `origin=location.origin` (C). Com `origin`/
  `widget_referrer` https inventados (E/F) o player nem conclui o handshake da API e
  a tela mostra 153.
- **Embed como página de topo** (`location.href` para `/embed/<id>`): 153.
- **Deep link no app YouTube da TV** (`launchAppControl`, id `111299001912`,
  `PAYLOAD {"values":"v=<id>"}`): o sistema aceitou a chamada, o app saiu para o
  YouTube, mas não abriu o vídeo (relato do usuário: "não abriu / erro").
- **Página intermediária com origem http** (servida do PC na LAN, `http://
  192.168.0.3:8787/player.html?v=<id>`, carregada num `<iframe>` pelo app `file://`,
  IFrame API dentro dela): **tocou nas duas tentativas** — `onReady` +1,9–2,7 s,
  `PLAYING` +4,6–5,9 s; o usuário viu o vídeo na tela.
- **Controle remoto com o trailer aberto**: o foco permaneceu no documento do app
  (`activeElement=BODY`); **RETURN (10009) e OK chegaram ao app**, que fechou o
  iframe (`postMessage stop` + remoção). Reabrir funcionou. O controle do player do
  YouTube por D-pad (pausar/buscar dentro do iframe) não foi testado — o app pode
  comandar por `postMessage` se preciso.
- Observação: o servidor recebeu `GET player.html` sem `Referer` (esperado, a
  origem-pai é `file://`); o que o YouTube exige é o Referer do documento que
  **contém** o player — a intermediária, com origem http(s).

Conclusão: sem um documento de origem http(s) entre o app e o player, o YouTube
recusa (153). Com ele, funciona e o app mantém o controle do RETURN.

## Perguntas em Aberto

- O IFrame toca de fato na QN50Q60DAGXZD? Com que Referer/origem? A página HTTPS
  intermediária resolve o 153? (só um spike na TV responde)
- O D-pad consegue operar/fechar o player dentro do iframe, ou só o RETURN (que o
  app controla) sai dele?
- Existe alternativa de degradação aceitável se o IFrame falhar: abrir o app nativo
  do YouTube na TV por `tizen.application.launch` (privilégio `application.launch`
  já está no `config.xml`) e/ou link/QR para o celular? (ASSUMPTION: o app nativo
  aceita deep link por ID de vídeo — não verificado)
- Vale entregar trailer de **série via provedor primeiro** (24%, sem chave) e o
  TMDB como complemento, ou exigir TMDB para os dois tipos?
- Hospedar uma página HTTPS estática é aceitável para o produto (custo, ADR-008)?
