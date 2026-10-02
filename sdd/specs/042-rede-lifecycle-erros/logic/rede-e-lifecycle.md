# Lógica — rede, lifecycle e reconexão (feature 042)

Delimita o **como** das regras que o executor erraria sem ler. Origem: spec FR-001..FR-010, FR-017, FR-020.

## 1. Estados (FR-001)

Em memória, nunca persistidos. Derivados de sinais reais; nada é prop estática.

| Estado | Quando |
| --- | --- |
| `online` / `offline` | evento `online`/`offline` da janela + `navigator.onLine` inicial (já em `useOnlineStatus`); o resultado de `verifyNetwork` **prevalece** (FR-002) |
| `verificando rede` | uma `verifyNetwork` em voo (banner "Tentar de novo" ou retomada do app) |
| `suspenso` / `retomado` | `document.visibilityState` (`hidden` → `suspenso`; ao voltar, `retomado` até a verificação terminar) |
| `reconectando stream` | só dentro do `PlayerLayer`: fase `reconnecting` (§3) |

Pura e testável: `lib/network/networkState.ts` → `reduceNetworkState(state, event)`; o hook `useNetworkState()` só liga eventos do navegador ao redutor. `useOnlineStatus` continua existindo (o `PlayerInfoPanel` e o `OfflineBanner` o usam) e passa a ler do mesmo redutor — **não** criar duas fontes de verdade.

## 2. `verifyNetwork(origin?)` (D-005)

```ts
async function verifyNetwork(origin?: string): Promise<boolean>
// 1. navigator.onLine === false  -> false (sem requisição)
// 2. sem origin                  -> true  (só o sinal inicial; ex.: tela de listas sem lista ativa)
// 3. com origin: Promise.race([fetch(origin, { mode: 'no-cors', cache: 'no-store', signal }), timer 5 s])
//    resolve true se o fetch resolver (resposta opaca basta), false se rejeitar ou o timer ganhar
```

- `origin` = só `esquema://host[:porta]` do provedor da lista ativa. **Nunca** caminho, usuário, senha, query. Nunca logar a origem.
- `Promise.race` + timer porque um `fetch` pode ignorar o `AbortSignal` (mesma lição da `accountCheck`, feature 034).
- Nunca lança. Nunca é chamada no foco (constituição: foco não dispara consulta externa).
- Single-flight por chamador: um clique repetido enquanto verifica é ignorado (SC-006).

### Banner e foco (D-007)

`AppShell` já monta `OfflineBanner` (telas sob a topbar). Hoje o botão é só clique — **a TV não o alcança**. Correção:

- O banner passa a ser **só texto** + estado (`Sem conexão com a internet.` / `Verificando rede…` / `Ainda sem conexão.`), `role="status"`.
- A ação "Tentar de novo" vira um item da ordem de foco da `TopBar`: `'connection'`, **último** da ordem, presente só enquanto offline (a `TopBar` lê `useOnlineStatus()` sozinha — os 7 consumidores não mudam de assinatura).
- `TopbarItem` (em `navigation/appNav.ts`) ganha `'connection'`. Se o foco estiver nele e a rede voltar, a `TopBar` chama `onFocusItem('home')` (efeito) — nunca deixa foco num item que sumiu.
- OK em `'connection'` → `verifyNetwork(originDaListaAtiva)`. Sucesso → o estado vira `online` e o banner some; falha → mensagem "Ainda sem conexão." anunciada, foco fica.
- Ações que dependem de internet ficam **soft disabled com motivo no nome acessível** (`aria-disabled` + "indisponível sem conexão"): hoje só "Resincronizar/Verificar de novo" nas Configurações e as chamadas TMDB; conteúdo local segue livre.

## 3. Reconexão automática do stream (FR-008..FR-010)

Constantes em `lib/player/reconnectPolicy.ts` (já criadas): `RECONNECT_DELAYS_MS = [2000, 5000, 10000]`, `RECONNECT_STABLE_MS = 30000`.

```ts
function nextReconnect({ attempt, online, autoReconnect }): ReconnectDecision {
  if (!autoReconnect || !online) return { action: 'give-up' }
  if (attempt >= RECONNECT_DELAYS_MS.length) return { action: 'give-up' }
  return { action: 'retry', delayMs: RECONNECT_DELAYS_MS[attempt] }
}
```

Dentro de `usePlayerSession` (**sem criar efeito novo**, regra de `040/logic/divisao.md`):

1. Em `publish()`, quando `session.state === 'error'`: chamar `diagnosePlayback(...)` → `diagnosis`. Se `nextReconnect(...)` diz `retry`: `setPhase({ kind: 'reconnecting', attempt: n + 1, max: 3 })`, **gravar a última posição** em `resumeAtRef` (VOD: `session.progress?.positionMs` se houver, senão o valor anterior do ref — nunca zerar), armar um `setTimeout` guardado em `reconnectTimerRef`; ao disparar, `setAttempt(a => a + 1)` — **o mesmo caminho do "Tentar de novo"**, que fecha a sessão anterior (`teardown`) antes de abrir a nova. AVPlay é singleton: nunca duas sessões.
2. `give-up` → `setPhase({ kind: 'error', ..., diagnosis })` e `onSessionError`.
3. `startAtMs` passado a `createPlayerSession` passa a ser `resumeAtRef.current ?? startAtMs` (VOD). Live ignora (não tem posição; reabre o canal).
4. `attemptsRef` (quantas tentativas automáticas) **zera só** depois de `RECONNECT_STABLE_MS` ininterruptos em `playing` (timer `stableTimerRef`, cancelado em qualquer saída de `playing`). Zerar ao primeiro `playing` faria um stream que oscila reconectar para sempre.
5. O "Tentar de novo" **manual** zera `attemptsRef` (a pessoa assumiu o controle) e usa a mesma posição.
6. Descartes (FR-010): o `teardown` do efeito limpa `reconnectTimerRef` e `stableTimerRef`. Trocar `itemId` (zapping, CH±, próximo episódio) refaz o efeito → timers morrem junto; `resumeAtRef` é **zerado** ao trocar `itemId` (posição de outro item nunca vaza).
7. App oculto: não armar timer de reconexão enquanto `document.visibilityState === 'hidden'` (o canal ao vivo já fecha ao ocultar; o VOD já está pausado). Ao voltar, vale §4.
8. `reducedMotion`/`aria-live`: "Reconectando…" é texto (`role="status"`), com "(tentativa 2 de 3)"; não depende de animação (FR-020). Fica abaixo do título, na mesma área de `player-status`.

Fase nova em `playerLayerTypes.ts`: `{ kind: 'reconnecting'; attempt: number; max: number }`. `PlayerLayer` renderiza o rótulo e **mantém o foco acionável**: RETURN fecha o player (nunca há beco). Nenhuma ação é mostrada durante a espera além do RETURN (a espera máxima é 10 s); o 3º insucesso mostra a tela de erro com foco em "Tentar de novo".

## 4. Oculto e retomada (FR-005..FR-007)

Já existe (feature 020): oculto + VOD tocando → `togglePause()`; oculto + canal → fecha a camada; visível → `fetchPlayback(itemId)` só para validar a URL.

Mudança, no mesmo `onVisibilityChange` (mesmo efeito, mesma limpeza):

```
visível, sessão VOD aberta (pausada):
  resumeGateRef = 'verifying'            // PlayerLayer mostra "Verificando rede…" (role=status)
  ok = await verifyNetwork(originDaLista)
  if (!ok)  resumeGateRef = 'blocked'    // aviso "Sem conexão. O filme continua pausado." + botão "Tentar de novo" focado
  else      await fetchPlayback(itemId)  // reconfirma a URL (feature 020) — falha cai no MESMO erro de abertura
            resumeGateRef = null
```

- **Gate**: enquanto `resumeGateRef !== null`, nenhuma entrada que *retoma* age: o `SELECT` no play/pause, `MediaPlay` e `MediaPlayPause` chamam o helper `togglePauseGuarded(session)` (novo, em `usePlayerKeyboard`), que ignora e mostra o aviso. **Pausar** nunca é bloqueado. As teclas ←/→ de salto continuam possíveis (a sessão está aberta).
- "Tentar de novo" (clique ou OK com foco nele) repete a verificação; single-flight. Sucesso libera o gate **sem retomar sozinho** — a pessoa aperta Play (decisão da spec: "só então o play é liberado").
- O estado em memória dura o que a sessão durar: fechar o player descarta tudo.
- Se a sessão não estava ativa ao ocultar (já pausada pela pessoa), o mesmo fluxo roda ao voltar (a verificação também vale para ela).
- Canal ao vivo: nada novo — a camada já fechou; não há reconexão ao voltar (a pessoa reentra no canal).

### Ocultar não derruba o app (FR-005)

Nada é desmontado ao ocultar; foco, scroll e snapshot sobrevivem **por construção** (o React continua montado). "Persistir foco essencial" significa não quebrar isso: proibido limpar estado de foco em `visibilitychange`. Timers do app: só os do player e os da pré-carga (já pausa) interessam; o toast e o auto-hide do chrome não fazem chamada externa.

Chamadas BYOK/TMDB: `ensureTitleMetadata` (feature 032) **não inicia** uma busca com o app oculto (retorna sem erro e sem gravar "sem correspondência"); quando visível de novo, o próximo abrir do detalhe pede normalmente. Helper `isAppHidden()` em `lib/network/` (lê `document.visibilityState`, injetável em teste).

## 5. Pré-carga e limite do painel — 429 (FR-017, SC-007)

- `xtreamConnector`: HTTP 429 vira `ProviderError('rate_limited', …)` (novo valor de `ProviderFailureKind`). Hoje cai em `ProviderIncompatibleError('status 429')` e seria tratado como "painel incompatível" — erro de classificação.
- `categoryLoader.failureOf`/o `runCategory` da pré-carga mapeiam `rate_limited` → `PrefetchRunOutcome 'rate_limited'` (tipo e `RATE_LIMIT_PAUSE_MS = 60_000` já existem como stub).
- `prefetchScheduler`: ao receber `'rate_limited'` — **não** incrementa `attempts`, **não** manda a categoria para o fim, `setProgress({ ...last, state: 'paused', pausedReason: 'rate_limited' })`, `await wait(RATE_LIMIT_PAUSE_MS)`, limpa `pausedReason` e segue o laço (a mesma categoria volta primeiro). A espera é cancelável por `stop()`/novo `start()` (mesma `wakeWaiter` — nunca um `setTimeout` solto). Seções inteiras (`runSection`) tratam igual (um 429 na seção para a seção toda).
- `homeStatusLine`: `pausedReason === 'rate_limited'` → "Pré-carga em pausa — o painel pediu um intervalo". Sem toast por categoria. Entrar numa categoria enquanto isso continua funcionando pelo caminho normal (uma entrada real não espera a pausa; se também receber 429, mostra `API-429` no estado de erro da categoria).
- Erro de 429 numa **entrada** (não pré-carga) mostra o estado de erro padrão com código `API-429`.

## 6. O que NÃO muda

- `useRemoteNav` (sem handler novo), `PlayerService`/adaptadores (o diagnóstico é a jusante), Dexie (sem versão), `CategoryScreenSnapshot`.
- A `activityGate` continua pausando offline/oculto como hoje.
