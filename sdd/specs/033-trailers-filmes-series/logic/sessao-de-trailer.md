# Lógica: sessão de trailer (máquina de estados + camada)

Feature 033. Código: `tv-web/src/lib/trailer/trailerSession.ts` (puro) e
`tv-web/src/components/TrailerLayer.tsx` (host). Contratos:
`trailerSession.trailers.contract.test.ts`, `TrailerLayer.trailers.contract.test.tsx`.

## 1. Estado

```ts
interface TrailerSessionState {
  phase: 'loading' | 'playing' | 'paused' | 'error' | 'closed'
  candidateIndex: number   // qual candidato está no iframe
  candidateCount: number
  fallbackUsed: boolean    // já trocou de candidato nesta abertura
  deadline: number         // ms absolutos; só vale em 'loading'
  error?: { code: string; retryable: boolean }
}
```

## 2. Início

`startTrailerSession({ candidateCount, now, online })`:

- `online === false` → `{ phase: 'error', error: { code: 'TRL-REDE', retryable: true } }`
  (candidateIndex 0, fallbackUsed false, deadline now + 15 s — irrelevante).
- senão → `{ phase: 'loading', candidateIndex: 0, fallbackUsed: false, deadline: now + TRAILER_START_TIMEOUT_MS }`.

`candidateCount` é `min(candidates.length, 2)` no host — a sessão nunca olha
além do segundo (FR-017). `candidateCount === 0` nunca acontece: o botão não abre
a camada sem candidato.

## 3. Transições

| De | Evento | Para |
| --- | --- | --- |
| `closed` | qualquer | igual (terminal) |
| qualquer ≠ `closed` | `close` | `closed` |
| `loading`/`playing`/`paused` | `bridge-state: playing` | `playing` |
| `loading`/`playing`/`paused` | `bridge-state: paused` | `paused` |
| `loading`/`playing`/`paused` | `bridge-state: ended` | `closed` |
| `loading` | `bridge-ready(now)` | `loading`, `deadline = max(deadline, now + 90 s)` (R-013: anúncios do YouTube; só alarga, nunca encurta) |
| `loading` | `timeout` | `error TRL-TEMPO (retryable)` |
| `playing`/`paused`/`error` | `timeout` | igual (o prazo só vale carregando) |
| `loading`/`playing`/`paused` | `bridge-failed` | `error TRL-PONTE (retryable)` |
| `loading`/`playing`/`paused` | `player-error c` | ver §4 |
| `error` com `retryable` | `retry(now)` | `loading`, MESMO `candidateIndex`, `deadline = now + 15 s`, `fallbackUsed` mantido |
| `error` sem `retryable` | `retry` | igual (a tela nem oferece a ação) |
| `error` | `bridge-state`/`player-error`/`bridge-failed` | igual (iframe velho é ignorado) |

## 4. Erro do player (`player-error`, código do YouTube IFrame API)

| Código | Significado | Troca de candidato? | Se não trocar |
| --- | --- | --- | --- |
| `100` | vídeo removido/privado | sim | `YT-100`, retryable **false** |
| `101`, `150` | dono não permite embed | sim | `YT-101`/`YT-150`, retryable **false** |
| `2` | parâmetro inválido (id ruim) | sim | `YT-2`, retryable **false** |
| `5` | erro do player HTML5 | não | `YT-5`, retryable true |
| `153` e qualquer outro | configuração do player / desconhecido | não | `YT-<código>`, retryable true |

"Troca de candidato" só acontece se `!fallbackUsed && candidateIndex + 1 < candidateCount`:
→ `phase: 'loading'`, `candidateIndex + 1`, `fallbackUsed: true`, **mesmo `deadline`**
(FR-018: 15 s contados do OK — o reserva usa o que sobrou). Senão, erro da tabela.

`153` NÃO troca: é problema da página-ponte/identificação, não do vídeo —
trocar de vídeo não resolveria e gastaria a única troca.

## 5. Mensagens (`trailerErrorMessage`) — nunca texto bruto

| Código | Texto |
| --- | --- |
| `YT-100` | "Este trailer foi removido ou está privado." |
| `YT-101`, `YT-150` | "O dono deste trailer não permite que ele seja exibido em outros apps." |
| `YT-2` | "Este trailer não pôde ser aberto." |
| `TRL-TEMPO` | "O trailer demorou demais para começar." |
| `TRL-REDE` | "Sem conexão com a internet." |
| `TRL-PONTE`, `YT-5`, `YT-153`, outros | "O player de trailer não conseguiu iniciar." |

## 6. Host (`TrailerLayer`)

Props: `{ title, candidates, onClose }`. Estado = `useReducer` sobre a sessão
(ou ref + render forçado — ver R-004 abaixo; o PlayerLayer precisou de refs para
não ler estado velho em tecla rápida).

- **iframe**: `src = trailerBridgeSrc(candidates[state.candidateIndex].videoId)`,
  `key` = `candidateIndex` + contador de `retry` (trocar de candidato ou tentar de
  novo REMONTA o iframe — nunca reaproveita a janela antiga), `title="Trailer"`,
  `allow="autoplay; encrypted-media"`, `referrerPolicy="strict-origin-when-cross-origin"`,
  `tabIndex={-1}`. Nunca `sandbox` sem `allow-scripts allow-same-origin` (a ponte
  precisa rodar a API do YouTube).
- **mensagens**: `window.addEventListener('message')` → `parseBridgeMessage(event, iframeRef.current?.contentWindow)`
  → evento da sessão (`playing`/`paused`/`ended` → `bridge-state`; `error` →
  `player-error`; `api-failed` → `bridge-failed`; `ready`/`seeked` → só controle
  local). Mensagem inválida: ignorada, sem log.
- **prazo**: `setTimeout` até `deadline` enquanto `loading`; ao disparar,
  `timeout`. Limpo em qualquer mudança de fase e no unmount.
- **fechar**: ao entrar em `closed` (fim, `close`), manda `stop` à ponte e chama
  `onClose()` **uma vez** (guarda contra dupla chamada — `ended` e RETURN podem
  chegar juntos).
- **app oculto** (`document.visibilitychange` → `hidden`): `close` (FR-015).
- **unmount**: manda `stop`, limpa timer e listener.

### Teclado (`useRemoteNav({...}, { modal: true })` — dono do teclado, captura)

| Fase | OK | ← / → | RETURN | Play/Pause de mídia |
| --- | --- | --- | --- | --- |
| `loading` | "Cancelar" focado → fecha | nada | fecha | nada |
| `playing`/`paused` | `toggle` à ponte | `seek-by ∓10` à ponte (single-flight §7) | `stop` + fecha | `toggle` (MediaPlayPause/MediaPlay/MediaPause) |
| `error` | ativa a ação focada | move o foco entre as ações | fecha | nada |

Outras teclas de mídia (Stop, Rewind, FastForward, CH±): ignoradas (sem efeito).

### Tela (tokens V14; nunca cor/raio/tamanho literal)

- camada opaca em tela cheia acima do detalhe (z-index do mesmo nível da camada
  do player, `player.css`), fundo `--bg`/preto de token;
- `loading`: `Spinner` + "Carregando trailer" + título + pill **"Cancelar"** focada;
- `playing`: faixa inferior com título, dica "OK pausa · ← → 10 s · Voltar fecha" e
  a pill **"⏸ Pausar"** focada; a faixa some 4 s depois da última tecla e volta a
  qualquer tecla tratada;
- `paused`: faixa sempre visível, pill **"▶ Continuar"** focada;
- `error`: `ErrorState` (feature 022) com a mensagem, o código discreto e as ações
  `["Tentar de novo", "Voltar"]` (retryable) ou `["Voltar"]` — foco inicial na
  primeira;
- a região de anúncio (`useAnnounce`) diz "Trailer de {título}" ao abrir e a
  mensagem de erro ao errar.

Sempre exatamente UM elemento com `.tv-focus` (FR-023). O iframe nunca recebe foco.

## 7. Seek single-flight (FR-013, US3/AC6)

- ←/→ com um `seek-by` pendente é **descartado**, não acumulado (mesma lição da
  feature 011: acumular congelou o app com a tecla segurada).
- Pendente termina ao chegar `seeked` da ponte ou 1 s depois do envio (o que
  vier primeiro).
- A ponte limita o salto a `[0, duração]` — o app não sabe a duração.

## 8. O que a camada NUNCA faz

- Ler/gravar estado do usuário, histórico, progresso (FR-016).
- Tocar AVPlay ou montar `PlayerLayer`.
- Mandar à ponte qualquer coisa além do id (na URL) e dos comandos `toggle`/`stop`/`seek-by`.
- Logar a mensagem recebida ou o erro bruto.
