# Lógica — headers da lista até o motor (US1)

Regra de ouro: o **valor** de um header sai do IndexedDB, atravessa
`fetchPlayback` → `createPlayerSession` → `adapter.open` e morre ali. Para cima
(sessão, UI, diagnóstico) só sobem **nomes** (`RequestHeadersReport`).

## §1 Adaptador AVPlay (`lib/player/avplayAdapter.ts`)

```ts
const PROPERTY_OF: Record<RequestHeaderName, string | undefined> = {
  'User-Agent': 'USER_AGENT',
  // Referer: só com a propriedade que a T003 PROVOU na TV; sem prova, undefined.
  Referer: undefined,
}
let lastReport: RequestHeadersReport = NO_REQUEST_HEADERS   // por adaptador

open(url, region, startAtMs, headers) {
  avplay.open(url); opened = true; displayRegion = region
  lastReport = applyHeaders(avplay, headers)          // ← depois de open, antes de prepareAsync
  avplay.setListener(...); setSilentSubtitle; setDisplayRect; prepareAsync(...)
}

function applyHeaders(avplay, headers): RequestHeadersReport {
  const report = { applied: [], refused: [] }
  for (const [name, value] of [['User-Agent', headers?.userAgent], ['Referer', headers?.referer]]) {
    if (value === undefined) continue
    const property = PROPERTY_OF[name]
    if (!property || typeof avplay.setStreamingProperty !== 'function') { report.refused.push(name); continue }
    try { avplay.setStreamingProperty(property, value); report.applied.push(name) }
    catch { report.refused.push(name) }               // erro do motor NUNCA repassado (pode citar o valor)
  }
  return report
}

requestHeadersReport() { return lastReport }
```

- `open` sem `headers` → `lastReport = NO_REQUEST_HEADERS` e nenhuma chamada a
  `setStreamingProperty` (contrato: nada vaza do item anterior).
- `close()` não precisa mexer no `lastReport` — a próxima `open` sobrescreve.
- "Aplicado" = o motor **aceitou** a chamada. Que o header chegou ao servidor só
  a T003 prova (servidor na LAN registrando os headers).

## §2 Adaptador `<video>` (`lib/player/htmlVideoAdapter.ts`)

O navegador não deixa definir `User-Agent`/`Referer` de mídia. `open` ignora os
valores e `requestHeadersReport()` devolve todos os nomes declarados em
`refused`. É o que faz o FR-004 aparecer no navegador do dev (E2E), e é
verdade: o `<video>` não envia.

## §3 Sessão (`lib/player/PlayerService.ts`)

- `createPlayerSession(url, region, kind, { headers, timeline, ... })` →
  construtor recebe `headers` e chama `adapter.open(url, region, start, headers)`.
- Logo depois do `open`: `this.requestHeaders = adapter.requestHeadersReport?.()
  ?? { applied: [], refused: namesOf(headers) }` (motor sem o método = nada
  aplicado). Substitui o campo-stub (`= NO_REQUEST_HEADERS`) por atribuição no
  construtor (`readonly` continua).
- `open` que lança: o `catch` já existente segue igual (mensagem genérica, sem
  a exceção).

## §4 Camada de reprodução (`components/player/usePlayerSession.ts`)

- `createPlayerSession(playback.url, FULLSCREEN_REGION, playback.kind, { createAdapter, startAtMs, headers: playback.headers })`.
  `playback` é local de `start()` — nunca vai para `useState`/ref de tela.
- No ramo de erro, a entrada do diagnóstico ganha
  `headersNotSent: session.requestHeaders.refused.length > 0`.
- Reconexão (042) e "Tentar de novo" já refazem `fetchPlayback` → headers
  relidos do item, nunca reaproveitados de outro.

## §5 Diagnóstico (`lib/player/playbackDiagnosis.ts`)

`PlaybackDiagnosisInput.headersNotSent?: boolean` (opcional: o contrato travado
da 042 não o passa e continua com os mesmos vereditos). Ordem em `verdictOf`:

1. `sourceAccess` refused/expired (como hoje)
2. offline → `NET-01` (como hoje)
3. nome de erro em `FORMAT_NAMES` → `PLAY-02` (um header não causa codec errado)
4. **`headersNotSent` → `PLAY-05`** `{ category: 'source', actions: ['info'], autoReconnect: false }`
5. resto como hoje

`PLAY-05` entra em `errorCatalog.ts` (`RETRYABLE: false`) e em
`lib/i18n/messages/errors.ts` nos três idiomas:

| Chave | pt |
| --- | --- |
| `error.PLAY-05.title` | A TV não enviou o header da lista |
| `error.PLAY-05.description` | Esta lista exige um header que esta TV não envia. |
| `error.PLAY-05.action` | Ver detalhes |

(O contrato procura `/header que esta TV não envia/`.) Nada de valor de header
em título, descrição ou "Info técnica".

## §6 Info do stream (`components/playerPanels.ts` → `buildInfoRows`)

Novo parâmetro opcional `headers?: RequestHeadersReport`. Com `applied` ou
`refused` não vazios, uma linha `headers`:

- rótulo `player.info.headers` = "Headers da lista"
- valor: `applied.join(', ')`; se houver recusados, acrescenta
  ` · ${t('player.info.headersRefused', { names: refused.join(', ') })}`
  ("não enviados: Referer").

`PlayerInfoPanel` recebe o relatório da sessão (`session.requestHeaders`) pelo
`PlayerLayer`. Sem headers declarados, a linha não existe.
