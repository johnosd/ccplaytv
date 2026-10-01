# Lógica: página-ponte do trailer (protocolo, conteúdo, publicação)

Feature 033, ADR-012. Arquivos: `bridge/trailer/index.html` (raiz do repo, fora
de `tv-web/` e fora do `.wgt`), `.github/workflows/bridge-pages.yml`,
`tv-web/src/lib/trailer/bridgeConfig.ts` (lado do app).

## 1. Por que existe (resumo da ADR-012)

O app roda em `file://` na TV; `file://` não manda `Referer`; o YouTube IFrame
Player exige `Referer` e responde erro 153 sem ele (provado na QN50Q60DAGXZD em
2026-09-29). A ponte é um documento com origem `https://johnosd.github.io` que
contém o player — o `Referer` passa a ser o dela.

## 2. Endereço

`https://johnosd.github.io/ccplaytv/trailer/?v=<videoId>` — só `v` (FR-010).
Constante `TRAILER_BRIDGE_URL`. Origem esperada nas mensagens:
`TRAILER_BRIDGE_ORIGIN = 'https://johnosd.github.io'`.

## 3. Protocolo (versão 1)

Toda mensagem tem `source` e `v: 1`. Qualquer outra forma é ignorada, nos dois lados.

**Ponte → app** (`window.parent.postMessage(msg, '*')`):

| `type` | Quando |
| --- | --- |
| `ready` | `onReady` do player |
| `playing` | `onStateChange` = 1 |
| `paused` | `onStateChange` = 2 |
| `ended` | `onStateChange` = 0 |
| `seeked` | depois de aplicar um `seek-by` |
| `error` + `code: number` | `onError` (código cru do YouTube: 2, 5, 100, 101, 150, 153…) |
| `api-failed` | o script `https://www.youtube.com/iframe_api` não carregou em 10 s ou `onerror` |

`'*'` como alvo é deliberado: a origem do app é `file://` (opaca — não há string
de origem válida para mirar). O conteúdo não é sensível (só estados e códigos).

**App → ponte** (`iframe.contentWindow.postMessage(msg, TRAILER_BRIDGE_ORIGIN)`):

| `type` | Efeito na ponte |
| --- | --- |
| `toggle` | `playVideo()` se não está tocando, senão `pauseVideo()` |
| `stop` | `stopVideo()` |
| `seek-by` + `seconds` | `seekTo(clamp(getCurrentTime()+seconds, 0, getDuration()), true)`, depois `seeked` |

## 4. Validação

**No app** (`parseBridgeMessage(event, frame)`): aceita só se
`event.origin === TRAILER_BRIDGE_ORIGIN` **e** `event.source === frame` (a janela
do iframe em uso agora — um iframe remontado deixa a janela antiga sem voz) **e**
`data` é objeto com `source === 'ccplay-trailer'`, `v === 1`, `type` na lista e,
se `error`, `code` número finito. Senão `null`.

**Na ponte**: aceita comando só se `event.source === window.parent` e a forma é
exata (`source === 'ccplay-app'`, `v === 1`, `type` conhecido, `seconds` número
finito entre −60 e 60). A origem do pai NÃO é conferida (é `file://`/`null` na TV,
`http://localhost:5173` no dev) — por isso os comandos são inofensivos por
desenho (só controlam o próprio vídeo).

## 5. Conteúdo da página (`bridge/trailer/index.html`)

Um arquivo, HTML + JS inline, sem dependência, sem build:

- `<meta name="referrer" content="strict-origin-when-cross-origin">`;
- CSS: `html, body, #player { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden }`
  (fora do app, tokens não se aplicam);
- lê `v` de `location.search`; se não passar em `/^[A-Za-z0-9_-]{11}$/`, manda
  `error` com `code: 2` e para;
- carrega `https://www.youtube.com/iframe_api`; `new YT.Player('player', { videoId, width:'100%', height:'100%', playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: location.origin } })`
  e chama `playVideo()` no `onReady`;
- mantém controles, branding e anúncios do YouTube como vierem (termos, ADR-012 §4);
- sem cookies próprios, sem analytics, sem `console.log` de dados, sem `eval`,
  sem `innerHTML` com dado externo;
- nenhuma referência ao catálogo, fonte, título ou chave.

## 6. Publicação (GitHub Pages do repositório público `johnosd/ccplaytv`)

Workflow `.github/workflows/bridge-pages.yml`:

- gatilho: `workflow_dispatch` + `push` em `main` com `paths: ['bridge/**']`;
- `permissions: { pages: write, id-token: write, contents: read }`;
- jobs: `actions/checkout` → `actions/configure-pages` →
  `actions/upload-pages-artifact` com `path: bridge` → `actions/deploy-pages`.

Resultado: `bridge/trailer/index.html` servido em
`https://johnosd.github.io/ccplaytv/trailer/`. **Só a pasta `bridge/` é
publicada** — nenhum outro arquivo do repo vai para o Pages.

Passos que só o usuário pode fazer (externos, exigem confirmação — nunca
automáticos no `sdd-execute`): habilitar Pages com "Source: GitHub Actions" nas
configurações do repo; o push/merge para `main` (ou rodar o workflow manualmente).
Até isso acontecer, a URL de produção responde 404 → o app mostra `TRL-TEMPO`
ou `TRL-PONTE`, nunca trava.

## 7. Desenvolvimento e testes sem publicar

- **Vitest**: a ponte não roda; testes enviam `MessageEvent` com a origem certa
  (contrato do `TrailerLayer`).
- **E2E (Playwright)**: `page.route('https://johnosd.github.io/ccplaytv/trailer/**')`
  responde com o conteúdo REAL de `bridge/trailer/index.html` (lido do disco), e
  `page.route('https://www.youtube.com/iframe_api')` responde com um YT fake
  (`window.YT = { Player }` que chama `onReady`/`onStateChange`/`onError` por
  comando do teste). Assim o E2E exercita a ponte de verdade + o app, sem rede.
- **TV**: a ponte publicada de verdade (gate SC-001/SC-002). Antes de publicar,
  dá para testar na TV com a ponte servida da LAN (como no spike), mudando
  `TRAILER_BRIDGE_URL` só num build local — nunca commitado.
