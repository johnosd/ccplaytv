# ADR-012: Página-ponte estática HTTPS para embeds de terceiro

## Status

Aceita. Atualiza a ADR-008 (client-first) com uma categoria de recurso que ela não
previa, e confirma a alternativa que a ADR-006 §4.8 deixava "a testar".

## Data

2026-09-29.

## Contexto

A ADR-008 separou o mundo em dois: **infraestrutura própria sempre ligada** (evitada,
só como contorno opcional) e **chamada direta a API de terceiro com a chave do
usuário** (bem-vinda). O trailer (item 32 do backlog, RF-019) caiu num terceiro caso
que nenhuma das duas cobre.

O player oficial do YouTube (IFrame Player API, o único caminho permitido pela ADR-006
§4.8 — sem extração de stream, sem AVPlay para YouTube) exige que o documento que
**contém** o player se identifique pelo cabeçalho `HTTP Referer` ("Required Minimum
Functionality"). Sem isso, o player recusa com **erro 153** ("Video player
configuration error").

**Spike na TV física** (2026-09-29, QN50Q60DAGXZD — que reportou `Tizen 9.0`,
Chromium 120), com um app de teste separado assinado com o perfil Samsung (registro
completo em `sdd/assessments/viabilidade-youtube-iframe-na-tv-campo/explora.md`):

- O `.wgt` roda em `file:///index.html`, `location.origin === 'file://'`. Um documento
  `file://` nunca envia `Referer`.
- IFrame direto do app: **153** em todas as variantes (`youtube.com`,
  `youtube-nocookie.com`, `origin=location.origin`, `origin`/`widget_referrer` https
  inventados, embed como página de topo). `<meta name="referrer">` não ajuda —
  não há o que enviar a partir de `file://`.
- Deep link no app YouTube da TV (`launchAppControl`): a chamada é aceita, mas o vídeo
  não abre. E o usuário já tinha recusado qualquer fallback para fora do app.
- **Página intermediária com origem http** (servida do PC na LAN) carregada num
  `<iframe>` do app, com a IFrame API dentro dela: **tocou 2/2** (`PLAYING` em
  ~5 s). O foco ficou no documento do app: **RETURN e OK chegaram ao app**, que
  fechou o trailer por `postMessage` + remoção do iframe.

Não existe API Tizen para fixar o Referer de um iframe, e um web app não abre socket
de escuta para servir a si mesmo por http. A única forma de dar origem http(s) ao
documento do player é **servir esse documento de algum lugar da internet**.

O usuário inicialmente recusou hospedar qualquer página (leitura estrita da
ADR-008); diante do spike, aceitou **uma página estática gratuita**, sem lógica, sem
dados e sem chave, porque não há outro caminho que funcione no aparelho.

## Decisão

**Fica permitida uma classe restrita de recurso hospedado: a "página-ponte"
estática HTTPS, cujo único papel é dar uma origem http(s) a um embed de terceiro que
a exige e que não funciona a partir de `file://`.** Ela não é backend no sentido da
ADR-008: não roda código no servidor, não guarda nada, não é operada por ninguém, e o
app continua client-first.

Uma página-ponte **DEVE**:

1. Ser **estática** (HTML/JS/CSS versionados no repositório), servida por hospedagem
   estática **gratuita** com HTTPS. Nenhuma função serverless, proxy, redirect com
   lógica, banco, cookie próprio ou analytics.
2. Receber do app **só o identificador público** do conteúdo de terceiro (ex.: ID de
   vídeo do YouTube, validado por formato — 11 caracteres `[A-Za-z0-9_-]` — na página
   e no app). **Nunca** credencial de provedor, URL de fonte/stream, chave BYOK,
   identidade da pessoa, título pesquisado ou qualquer dado do catálogo (constitution,
   segredos; ADR-008 item 2; ADR-010).
3. Falar com o app só por `postMessage`, com **origem e esquema validados nos dois
   sentidos** e um conjunto fechado de mensagens (ex.: `stop`, `pause`, `ended`,
   `error{code}`, `state`). Nada de `eval`, HTML arbitrário vindo do app ou de
   terceiros.
4. Cumprir os termos do terceiro: player oficial, sem ocultar branding/anúncios/
   controles, sem extrair mídia, sem falsificar identidade (a página se identifica
   com a própria origem real, nunca com uma inventada).
5. Deixar o **app** dono do teclado e da navegação: o iframe é uma camada que o app
   abre e fecha; RETURN e o fim do vídeo são tratados pelo app, que devolve o foco
   (constitution, foco).
6. Ser **opcional para o resto do app**: se a página estiver fora do ar, sem rede ou
   bloqueada, só a função que ela serve falha, com estado de erro focável e sem
   retentativa em laço. Nada mais do app depende dela (ADR-002, offline-first).
7. Estar **listada nesta ADR** (seção abaixo). Uma página-ponte nova para outro embed
   entra por nota de atualização aqui, sem ADR nova, desde que caiba em 1–6. Qualquer
   coisa fora disso (lógica no servidor, dado da pessoa, segredo) não é página-ponte e
   exige nova decisão.

**Endereço**: subdomínio padrão do provedor de hospedagem (ex.:
`<conta>.github.io/<projeto>`), sem domínio próprio. A URL fica fixa no build do app;
trocá-la exige nova versão do app. **O provedor de hospedagem** (GitHub Pages,
Cloudflare Pages ou equivalente gratuito com HTTPS) é decidido no `sdd-plan` da feature
que criar a primeira página-ponte.

### Páginas-ponte registradas

| Página | Terceiro | Feature | Recebe |
| --- | --- | --- | --- |
| Player de trailer (`bridge/trailer/index.html`, `https://johnosd.github.io/ccplaytv/trailer/?v=<id>`) | YouTube IFrame Player API | `033-trailers-filmes-series` — código completo em 2026-09-29; **publicação e passada na TV pendentes** (não há como marcar "publicada" sem a URL responder) | ID do vídeo |

## Alternativas Consideradas

### IFrame do YouTube direto do app (`file://`)

- O caminho mais simples, previsto pela ADR-006.
- **Rejeitada:** testado na TV, erro 153 em todas as variantes — `file://` não envia
  Referer e o YouTube exige.

### Falsificar a identificação (`origin`/`widget_referrer` inventados, Referer forjado)

- **Rejeitada:** não funcionou (o handshake da API falha com origem incoerente) e
  violaria os termos do YouTube — a ADR-006 já proíbe simular cliente aprovado.

### Abrir o app YouTube da TV por deep link

- Sem hospedagem nenhuma.
- **Rejeitada:** testado, o vídeo não abre com o payload conhecido; tira a pessoa do
  app sem caminho de volta garantido; e o usuário recusou fallback para fora do app.

### Empacotar o app como "hosted web app" (`<content src="https://...">`)

- Daria origem https ao app inteiro.
- **Rejeitada:** transformaria o app todo numa dependência de servidor (abrir o app
  sem internet quebraria), o oposto da ADR-002/ADR-008 — para resolver um único botão.

### Página servida pelo backend `api/` ou por um PC/VPS

- **Rejeitada:** é infraestrutura sempre ligada, exatamente o que a ADR-008 evita, e
  seria mais frágil que uma hospedagem estática.

### Trailers em mídia direta (MP4) tocados pelo AVPlay

- Evitaria o YouTube.
- **Rejeitada para agora:** o provedor e o TMDB só entregam IDs do YouTube; fontes
  licenciadas de MP4 são pagas/comerciais. A ADR-006 mantém AVPlay para trailer só
  com mídia direta autorizada — continua aberta se aparecer uma fonte assim.

### Matar a feature de trailers

- **Rejeitada:** o spike mostrou um caminho que funciona a custo zero, e o usuário o
  aceitou.

## Consequências

### Positivas

- Trailer dentro do app, no player oficial, com o app controlando RETURN e foco —
  provado no aparelho.
- Custo zero e nenhum processo operado por alguém; a ADR-008 continua valendo no que
  importa (sem backend sempre ligado).
- A regra "classe restrita" resolve de antemão outro embed com o mesmo problema, sem
  abrir brecha para lógica de servidor.

### Negativas

- **Primeira dependência hospedada do projeto.** Se a hospedagem cair, mudar de
  política, ou a conta for perdida, o trailer para de funcionar em todas as TVs até
  uma nova versão do app com outra URL (sem domínio próprio, não dá para redirecionar).
- A página precisa ser versionada e publicada à parte do `.wgt` — um passo de deploy a
  mais, e o app instalado pode conversar com uma página mais nova ou mais antiga:
  o protocolo de `postMessage` precisa ser tolerante a versão.
- O YouTube recebe a origem da página-ponte (não a do app) e o ID do vídeo — e, pelo
  próprio player, o IP e dados que ele coleta de qualquer embed. Aceito: é inerente a
  usar o player oficial.
- Hospedagem gratuita do GitHub Pages exige repositório público para a página —
  resolvido no plano (repo/pasta pública só com a página, ou outro provedor).
- Não foi provado ainda que a página em **HTTPS pública** se comporta igual ao http da
  LAN usado no spike — primeira verificação do plano da feature.

### Caminho de Migração / Evolução Futura

- Revisitar se: (a) o Tizen passar a dar origem http(s) a apps empacotados (a página
  vira desnecessária — medir `location.origin` em cada TV nova); (b) o YouTube mudar a
  exigência de identificação; (c) surgir fonte de trailer em mídia direta autorizada
  (AVPlay, sem página); (d) a hospedagem gratuita escolhida deixar de ser viável.
- Trocar de provedor de hospedagem = publicar a mesma página em outro lugar + nova
  versão do app com a URL nova. Um domínio próprio tornaria isso transparente; fica
  como opção se a troca virar frequente.
- Nova página-ponte (outro embed): nota de atualização nesta ADR + linha na tabela,
  checando os critérios 1–6.
