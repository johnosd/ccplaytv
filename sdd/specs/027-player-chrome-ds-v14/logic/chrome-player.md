# Lógica: chrome do player V14 (feature 027)

Fonte da verdade para o "como" do chrome. O `PlayerLayer` continua
genérico (feature 016): nunca sabe o que é uma lista de canais nem uma
temporada — recebe da tela `identity`, `onChannelStep` e `episodeStep`.

## 1. Mídia do chrome

`ChromeMedia` = `'live'` quando `playback.kind === 'channel'`, senão
`'vod'` (filme, episódio). Decidido pelo **tipo da mídia da sessão**, nunca
pelo motor (AVPlay × `<video>`). Os controles **reais** continuam saindo das
capacidades resolvidas (`resolveCapabilities`, feature 011): capacidade
`false` → controle ausente (nunca desabilitado — D-003 da 011).

## 2. Controles (`chromeControls` em `components/playerChrome.ts`)

Ordem de foco (←/→, `clamp`, sem volta nas pontas):

| Mídia | Linha |
| --- | --- |
| VOD | `episodePrevious`¹ · `jumpBack`² · `playPause`³ · `jumpForward`² · `episodeNext`¹ · `tracks` · `quality` · `speed` · `aspect` · `info` |
| Live | `guide` · `tracks` · `quality` · `aspect` · `info` |

¹ só com `episodeStep` não nulo; `availability: 'limit'` quando
`hasPrevious`/`hasNext` é `false`, senão `'real'`.
² só com `canSeek`. ³ só com `canPause`.

Rótulos acessíveis (fixados pelo contrato — `aria-label` ou texto do botão):

| id | availability | rótulo | comingSoonId |
| --- | --- | --- | --- |
| `episodePrevious` | real/limit | `Episódio anterior` (limit: `Episódio anterior — indisponível`) | — |
| `jumpBack` | real | `Voltar 10 segundos` | — |
| `playPause` | real | `Pausar` tocando, `Reproduzir` pausado | — |
| `jumpForward` | real | `Avançar 10 segundos` | — |
| `episodeNext` | real/limit | `Próximo episódio` (limit: `Próximo episódio — indisponível`) | — |
| `tracks` | soon | `Áudio e legendas — em breve` | `player-tracks` |
| `quality` | soon | `Qualidade — em breve` | `player-quality` |
| `speed` | soon (só VOD) | `Velocidade — em breve` | `player-speed` |
| `aspect` | soon | `Aspecto — em breve` | `player-aspect` |
| `info` | soon | `Info do stream — em breve` | `player-info` |
| `guide` | soon (só Live) | `Guia — em breve` | `epg-guide` (já existe) |

`soon` e `limit` usam `.is-soft-disabled` (focáveis, SELECT age — dá o
aviso). A barra de progresso (`seekBar`) não entra na linha: continua sendo
o alvo acima dela (↑ entra, ↓ volta a Play/Pause), só com `hasSeekBar`.

## 3. Níveis do chrome

```
VOD:  hidden ⇄ full
Live: hidden ⇄ band ⇄ row
```

- **VOD** (comportamento da 011 preservado): abre em `full` com foco em
  Play/Pause. Em `hidden`: ↑/↓/OK → `full` (foco Play/Pause) sem ação;
  ←/→ → `jumpBy(∓10 s)` + `full`. Em `full`: ←/→ movem o foco na linha;
  ↑ entra na barra; OK aciona o focado; RETURN fecha o player.
- **Live**: abre em `band` (faixa: live bug "AO VIVO", número, logo com
  fallback `PosterArt variant="logo"`, nome — **nenhum botão**).
  - `hidden`/`band`: ↑/↓ → `onChannelStep('previous'|'next')` e `band`;
    ←/→ → `row` com foco no índice 0; OK → `onIdleSelect` (zapping da 016);
    RETURN → `onClose`.
  - `row` (faixa + linha): ←/→ movem o foco; OK aciona; ↑/↓ continuam
    trocando de canal (vão para `band`); RETURN → `band` (não fecha).
- `topLayer` (zapping) aberto: chrome não renderiza; teclas vão para o
  `topLayer` como hoje.
- Tela de erro: sem chrome, inalterada.

## 4. Auto-hide

5 s (`HIDE_CONTROLS_MS`, inalterado). Toda tecla tratada reinicia o timer.
**Pausado não esconde** (regra atual de `scheduleHide`). Diferente de hoje,
o Live **também** agenda o timer (faixa/linha somem após 5 s) — a guarda
`if (actions.length === 0) return` de `scheduleHide` sai. Troca de sessão
no Live (novo `itemId` via ↑/↓) começa em `band`.

## 5. Teclas de mídia

`lib/tizenMediaKeys.ts`: `registerMediaKeys()` chamado uma vez no `App`
(ao lado de `registerFavoriteColorKey`). Registra só as 8 de `MEDIA_KEYS`
que `tizen.tvinputdevice.getSupportedKeys()` **listar** (lista ausente,
vazia ou erro → não registra nada; fora da TV → no-op). `mediaKeyOf(event)`
reconhece por `event.key` (nome) ou `event.keyCode` (`MEDIA_KEY_CODES`).

`useRemoteNav` ganha `onMediaKey?: (key: MediaKey) => void`. Sem ele, a
tecla é ignorada como hoje (sem `preventDefault`) — só o `PlayerLayer`
passa, então FR-029 vale por construção.

| Tecla | VOD | Live |
| --- | --- | --- |
| `MediaPlayPause` | `togglePause` (se `canPause`), `full`, foco Play/Pause, reinicia timer | revela `band` |
| `MediaPlay` | retoma só se `paused` (senão só revela) | revela `band` |
| `MediaPause` | pausa só se `playing`/`buffering` | revela `band` |
| `MediaRewind`/`MediaFastForward` | `jumpBy(∓10 s)` se `canSeek` + `full` | revela `band` |
| `MediaStop` | `onClose` | `onClose` |
| `ChannelUp`/`ChannelDown` | ignoradas | `onChannelStep('previous'/'next')` |

Com `topLayer` aberto, só `MediaStop` age (fecha o player inteiro). Sem
sessão, ou sessão em `resolving`/`preparing`, só `MediaStop` age. O salto
por tecla segurada usa a porta single-flight existente do `PlayerService`
(R-019 da 011: descarta, nunca acumula) — nada de fila aqui.

## 6. Avisos (soon / limit)

O `PlayerLayer` tem o próprio `useToast()` + `<Toast>` **dentro** do
`.player-overlay` (o toast da tela por baixo pode estar oculto pela regra do
plano de hardware). Textos:

- soon: `Em breve — ${getComingSoon(id).message}`
- limite de canal: `Este é o primeiro canal desta lista.` /
  `Este é o último canal desta lista.`
- limite de episódio: `Este é o primeiro episódio disponível.` /
  `Este é o último episódio disponível.`

## 7. Vizinhança de canal (em `LiveScreen`)

```ts
// capturado toda vez que um canal começa pela lista (playActiveChannel,
// inclusive a partir do zapping): a lista EXIBIDA naquele momento
zapSequenceRef.current = items   // já filtrada por busca, se houver

function stepChannel(direction): boolean {
  const seq = zapSequenceRef.current
  let i = seq.findIndex((c) => c.id === playing.id)
  if (i === -1) return false
  do { i += direction === 'next' ? 1 : -1 } while (seq[i] && !seq[i].playable)
  const target = seq[i]
  if (!target) return false
  lastGoodChannelRef.current = playing        // fallback de erro da 016 (D-008)
  setPlaying(target)
  setFocusedIdentity((p) => ({ ...p, channelId: target.id }))   // FR-014
  return true
}
```

↑/`ChannelUp` = `previous`, ↓/`ChannelDown` = `next` (R-003).

## 8. Vizinhança de episódio (em `SeriesDetailScreen`)

`previousEpisode(seasons, id)` novo em `episodeNavigation.ts`, espelho de
`nextEpisode` (atravessa para o último da temporada anterior). A tela passa
`episodeStep = { hasPrevious, hasNext, onStep }`, com `onStep` fazendo
`setMode({ kind: 'playing', episode: alvo, startAtMs: startAtMsFor(alvo) })`
— a troca de `itemId` já grava o progresso do atual no teardown
(`recorder.onExit('close')`). `identity = { title: series.name, subtitle:
\`${episodeCode(ep)} • ${ep.name}\` }` (sem repetir o nome quando
`episodeCode` já é o nome).
