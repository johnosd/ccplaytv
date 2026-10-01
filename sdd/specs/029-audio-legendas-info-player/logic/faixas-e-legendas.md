# Lógica: faixas de áudio, legendas embutidas e info do stream

Feature `029-audio-legendas-info-player`. Este documento fixa o "como" que o
contrato (`PlayerLayer.audio-legendas-info.contract.test.tsx`) pressupõe e que
um executor erraria sem saber. Seções citadas no `plan.md` como `logic §N`.

Referência da API do motor (Samsung AVPlay, consultada em 2026-09-28 —
**a confirmar no spike da Fase 1**, R-001):

| Método | O que diz a referência | Consequência aqui |
| --- | --- | --- |
| `getTotalTrackInfo()` | `[{index, type: 'VIDEO'\|'AUDIO'\|'TEXT', extra_info: string JSON}]`; estados READY/PLAYING/PAUSED | fonte de `getTracks()` |
| `extra_info` AUDIO | `{"language","channels","sample_rate","bit_rate","fourCC"}` | idioma, canais, codec |
| `extra_info` TEXT | `{"track_num","track_lang","subtitle_type","fourCC"}` | idioma |
| `getCurrentStreamInfo()` | faixas **ativas**; VIDEO `{"fourCC","Width","Height","Bit_rate"}` | faixa de áudio ativa + info de vídeo |
| `setSelectTrack(type, index)` | AUDIO/TEXT; em PAUSED só TEXT; TEXT não suportado em DASH | troca pode falhar → FR-009 |
| `setSilentSubtitle(bool)` | `true` = o app **não recebe** eventos de legenda | "Desativadas" |
| `onsubtitlechange(duration, text, type, attributes)` | entrega a linha no momento de exibir | o app desenha |
| `setSubtitlePosition(ms)` | desloca timing **só de legenda externa** | adiantar legenda embutida é impossível (D-006) |
| `getStreamingProperty('CURRENT_BANDWIDTH')` | banda atual (streaming adaptativo), string | taxa de bits |

Nada na referência informa FPS, buffer, protocolo nem marca faixa como
áudio-descrição — no AVPlay esses campos ficam **ausentes** (FR-014,
FR-011), nunca derivados.

---

## §1 Contrato motor → sessão

### 1.1 `PlayerAdapter` (métodos opcionais novos — stub já no tipo)

```ts
getTracks?(): MediaTrack[] | null          // null = tem a API mas falhou agora
selectAudioTrack?(id: string): boolean     // true = motor aceitou
selectTextTrack?(id: string | null): boolean // null = desativar
getStreamInfo?(): StreamInfo | null
// callback:
onSubtitle?(cue: SubtitleCue): void        // text '' = apagar a linha atual
```

Método ausente = capacidade ausente. **Nunca** lançar para fora: todo acesso
ao motor em `try`, falha → `null`/`false`.

### 1.2 AVPlay (`avplayAdapter.ts`)

- `AvplayApi` ganha, **opcionais**: `getTotalTrackInfo`, `getCurrentStreamInfo`,
  `setSelectTrack`, `setSilentSubtitle`, `getStreamingProperty`; o listener
  ganha `onsubtitlechange`. Os métodos do adaptador só existem se a própria
  API os expuser? **Não** — o adaptador sempre declara os quatro métodos
  (o AVPlay os documenta); a falha em tempo de execução vira `null`/`false`.
- `open()`: depois de `setListener`, `setSilentSubtitle(true)` em `try`
  (legenda começa desativada, D-005).
- `getTracks()`: `getTotalTrackInfo()`; ignora VIDEO; `id = String(index)`;
  `extra_info` com `JSON.parse` em `try` (malformado → campos ausentes, a
  faixa continua listada). AUDIO: `language`, `codec = fourCC`,
  `channels = Number(channels)` só se finito e > 0. TEXT: `language =
  track_lang`, sem codec/canais na UI. `active` de áudio = índice presente
  como AUDIO em `getCurrentStreamInfo()`; texto sempre `false` (a sessão
  sobrescreve). Exceção em qualquer chamada → `null`.
- `selectAudioTrack(id)`: `setSelectTrack('AUDIO', Number(id))` → `true`;
  exceção → `false`.
- `selectTextTrack(id)`: `null` → `setSilentSubtitle(true)`; senão
  `setSelectTrack('TEXT', Number(id))` **e depois** `setSilentSubtitle(false)`.
  Exceção → `false`.
- `onsubtitlechange(duration, text)` → `onSubtitle({ text: text ?? '',
  durationMs: Number(duration) || 0 })`. `type`/`attributes` ignorados
  (estilo fixo, D-004).
- `getStreamInfo()`: VIDEO de `getCurrentStreamInfo()` → `width`/`height`
  (`Width`/`Height`, só se > 0), `videoCodec = fourCC`. `bitrateKbps`:
  `getStreamingProperty('CURRENT_BANDWIDTH')` se numérico > 0 (bps → kbps,
  arredondado), senão `Bit_rate` do VIDEO (bps → kbps). Sem `fps`,
  `bufferMs`, `protocol`. Tudo ausente → `{}`; exceção geral → `null`.

### 1.3 `<video>` (`htmlVideoAdapter.ts`)

Só `getStreamInfo()`: `width = videoWidth`, `height = videoHeight` quando
> 0; nada mais. **Sem** métodos de faixa (o Chromium não expõe faixas de
áudio sem flag) → no navegador, "Áudio e legendas" fica "— indisponível".

### 1.4 Sessão (`PlayerServiceSession`)

Novos membros públicos:

```ts
readonly supportsTracks: boolean      // adapter.getTracks existe
readonly supportsStreamInfo: boolean  // adapter.getStreamInfo existe
getTracks(): MediaTrack[] | null
selectAudioTrack(id: string): boolean
selectTextTrack(id: string | null): boolean
getStreamInfo(): StreamInfo | null
subscribeSubtitles(listener: (cue: SubtitleCue | null) => void): () => void
```

- Tudo vira no-op (`null`/`false`) depois de `close()`.
- `selectedTextId: string | null` (começa `null`) só muda quando
  `selectTextTrack` devolve `true`. `getTracks()` devolve as faixas do motor
  com `active` de texto sobrescrito por `id === selectedTextId`.
- Áudio: se o motor não marcar nenhuma faixa de áudio ativa e houver um
  `lastAudioId` aceito, marca essa; senão vale o que o motor disse.
- `onSubtitle` do adaptador: descartado se `selectedTextId === null` ou
  sessão fechada (o motor pode emitir mesmo "desativado" — contrato, teste
  2); senão repassado aos ouvintes.
- `selectTextTrack(null)` bem-sucedido emite `null` aos ouvintes (apaga a
  linha na tela imediatamente).
- Estas leituras **não** passam pelo `emit()` de estado/progresso — nada de
  re-render do `PlayerLayer` por linha de legenda.

---

## §2 Rótulos (`lib/player/tracks.ts`)

`normalizeLanguage(code)`: minúsculas; subtag primária antes de `-`/`_`;
3 letras → 2 pela tabela; `''`, `und`, `unk`, `mis`, `zxx`, `qaa` →
`undefined`; código desconhecido fica como está.

| 3 letras | 2 | Nome (pt-BR) |
| --- | --- | --- |
| por | pt | Português |
| eng | en | Inglês |
| spa | es | Espanhol |
| fra, fre | fr | Francês |
| ita | it | Italiano |
| deu, ger | de | Alemão |
| jpn | ja | Japonês |
| kor | ko | Coreano |
| zho, chi | zh | Chinês |
| rus | ru | Russo |
| ara | ar | Árabe |
| nld, dut | nl | Holandês |
| pol | pl | Polonês |
| tur | tr | Turco |
| hin | hi | Híndi |

Tabela explícita, **não** `Intl.DisplayNames` (resultado varia entre o
Chromium 108 da TV e o Node dos testes). Código normalizado fora da tabela →
exibido em maiúsculas (`KAZ`) — é o que o motor disse, não invenção.

`trackLabel(track, ordinal)`:

- base = nome do idioma, ou `Faixa ${ordinal}` sem idioma (ordinal 1-based
  dentro do seu tipo, na ordem do motor);
- áudio acrescenta, nesta ordem e só se informados: codec em maiúsculas;
  canais `1→Mono`, `2→Estéreo`, `6→5.1`, `8→7.1`, outro `n→"n canais"`;
- separador ` • ` → `Inglês • AAC • 5.1`, `Português`;
- legenda: só a base (sem extras);
- se dois rótulos do mesmo tipo ficarem idênticos, cada um dos repetidos
  ganha ` • Faixa ${ordinal}`.

---

## §3 Painel "Áudio e legendas"

Renderizado **dentro** do `.player-overlay` (a regra de plano de hardware
esconde o resto, ver `PlayerLayerTopLayer`), com o visual do `Modal`
(`.modal-overlay` / `.modal-panel no-scrollbar`) mas **sem** o componente
`Modal` — D-002. `role="dialog"`, `aria-label="Áudio e legendas"`.

Linhas focáveis, **uma lista vertical única**, nesta ordem:

1. **Áudio** — `role="radiogroup" aria-label="Áudio"`, um
   `<button role="radio" aria-checked>` por faixa de áudio **não**
   áudio-descrição. Sem nenhuma: texto não focável "Nenhuma faixa de áudio
   informada".
2. **Áudio-descrição** — um `<button>`. Real (nome "Áudio-descrição",
   `aria-pressed` = faixa AD ativa) só se existir faixa com
   `audioDescription === true`; SELECT seleciona a primeira. Senão soft
   disabled: nome "Áudio-descrição — indisponível", `aria-disabled`, SELECT
   → toast "Este conteúdo não oferece áudio-descrição."
3. **Legendas** — `role="radiogroup" aria-label="Legendas"`: sempre
   "Desativadas" primeiro, depois uma por faixa de texto. Sem faixa de texto:
   só "Desativadas" + texto não focável "Nenhuma legenda neste conteúdo".
4. **Sincronização da legenda** — `role="radiogroup" aria-label="Sincronização
   da legenda"`, **só se houver ≥1 faixa de texto**: `-1000 ms`, `-500 ms`,
   `Sem atraso`, `+500 ms`, `+1000 ms`, marcado o atraso atual.
   - legenda desativada → todos soft disabled (`aria-disabled`), SELECT →
     toast "Ative uma legenda para ajustar a sincronização." (FR-020);
   - negativos **sempre** soft disabled, nome com ` — indisponível`, SELECT
     → toast "Adiantar a legenda não é possível para legendas embutidas."
     (D-006).

Cada linha tem uma chave estável (`audio:<id>`, `ad`, `text:off`,
`text:<id>`, `delay:<ms>`). Foco:

- inicial: a faixa de áudio ativa; sem ela, a primeira linha;
- ↑/↓ movem na lista, **sem volta** nas pontas; ←/→ não fazem nada;
- o foco é guardado **pela chave**; se a linha sumir numa releitura, vai à
  primeira linha (reconciliação por id, constitution);
- linha focada rola para a vista (`scrollIntoView({block:'nearest'})`).

SELECT:

- áudio → `session.selectAudioTrack(id)`; `true` → `choice.audioLanguage =
  normalizeLanguage(track.language) ?? null`, chama `onTrackChoiceChange`;
  `false` → toast "Não foi possível trocar o áudio.";
- legenda → `session.selectTextTrack(id | null)`; `true` →
  `choice.textLanguage = normalize(...) ?? null` (Desativadas = `null`);
  `false` → toast "Não foi possível trocar a legenda.";
- atraso real → `choice.subtitleDelayMs = v`, `onTrackChoiceChange`;
- depois de qualquer SELECT, relê `session.getTracks()` (a marcação reflete o
  motor, FR-009).

Releitura periódica: a cada **1000 ms** enquanto aberto (FR-012), pulada
quando `document.visibilityState === 'hidden'`.

Abrir: só com `availability: 'real'` no chrome **e** `session.getTracks()`
não-nulo com ≥1 faixa (áudio ou texto). Senão (inclusive
`'unavailable'`): não abre, toast "Este aparelho não informou as faixas
deste conteúdo." (FR-002).

---

## §4 Continuidade da escolha (FR-021/FR-022/FR-023)

- `choiceRef = useRef(initialTrackChoice ?? DEFAULT_TRACK_CHOICE)` — lido
  **só na montagem**. Trocas de `itemId` na mesma montagem mantêm o ref.
- Reaplicação: **síncrona**, no mesmo `publish()` em que a sessão atinge
  `'playing'` pela primeira vez (o mesmo ponto de `onEnteredPlaying`), e só
  se `session.supportsTracks`:

  ```text
  tracks = session.getTracks(); se null → não faz nada
  {audioId, textId} = pickTracksForChoice(tracks, choiceRef.current)
  se audioId !== undefined e a faixa não está ativa → selectAudioTrack(audioId)
  se textId !== null → selectTextTrack(textId)
  ```

  (Emenda do sdd-execute, 2026-09-28: a versão original também chamava
  `selectTextTrack(null)` "para garantir desativada". Desnecessário — o
  adaptador já silencia a legenda no `open()` e a sessão nasce com
  `selectedTextId = null` (D-005) — e custava uma chamada ao motor por
  sessão.)

  Falha: silêncio (FR-022). Não chama `onTrackChoiceChange` (não é escolha
  da pessoa).
- `pickTracksForChoice`: áudio — `audioLanguage === null` → `undefined`;
  senão a primeira faixa de áudio não-AD com `normalizeLanguage(language) ===
  audioLanguage`, ou `undefined`. Texto — `textLanguage === null` → `null`;
  senão a primeira faixa de texto do mesmo idioma normalizado, ou `null`
  (padrão do stream para legenda = desativada, D-005).
- O atraso vem junto no ref, sem ação no motor.
- **Série** (`SeriesDetailScreen`): o autoplay passa pelo countdown, que
  **desmonta** o `PlayerLayer`. A tela guarda `trackChoiceRef` (`useRef<
  TrackChoice | null>(null)`), passa `initialTrackChoice={trackChoiceRef.
  current}` e `onTrackChoiceChange={(c) => { trackChoiceRef.current = c }}`;
  zera em `handlePlayerClose` e em `cancelCountdown` (sequência encerrada
  pela pessoa); mantém em `handlePlayerCompleted` → countdown → `playNext`.
- **Live**: nada a fazer — zapping/CH± trocam `itemId` com a camada montada.
- **Filme / Home**: nada — cada abertura é uma montagem nova (FR-023).

---

## §5 Legenda na tela (`components/SubtitleOverlay.tsx`)

Props: `session`, `delayMs`, `paused`, `raised` (chrome visível).
Não é renderizado com `topLayer` aberto (zapping, FR-008), na tela de erro,
nem sem sessão.

- Assina `session.subscribeSubtitles`. Cue com `text` vazio ou `null` →
  apaga agora e cancela o que estiver pendente.
- Cue com texto: exibe em `delayMs` (0 → **imediato**, sem `setTimeout`);
  esconde `durationMs` depois de exibir (`durationMs <= 0` → fica até a
  próxima cue). Cada cue tem id; esconder só apaga se a linha exibida ainda
  for a daquela cue. Uma cue nova substitui a exibida.
- `paused` verdadeiro no momento de esconder → não esconde (última linha
  fica visível pausado, edge case); a próxima cue substitui.
- Troca de sessão / desmontagem → cancela todos os timers.
- **Texto puro**: remove tags `/<[^>]+>/g`, quebra em `\n` → `<br/>`.
  **Nunca** `dangerouslySetInnerHTML` (o texto vem do stream).
- `aria-hidden="true"` (o Voice Guide não deve ler legenda linha a linha;
  acessibilidade de legenda é item 56).
- Estilo fixo (D-004): `.player-subtitle` em `styles/player.css`, só tokens;
  centralizado, dentro de `--safe-x`/`--safe-y`; `.player-subtitle--raised`
  sobe acima da linha do chrome quando ele está visível; fundo translúcido
  escuro por token novo `--subtitle-bg` em `index.css` (se não houver token
  equivalente).

---

## §6 Painel "Info do stream"

`role="dialog"`, `aria-label="Info do stream"`, mesmo visual de modal.
Linhas `rótulo / valor`, nesta ordem, **só as presentes**:

| Rótulo | Fonte | Formato |
| --- | --- | --- |
| Resolução | `width` e `height` (ambos) | `1920 × 1080` (U+00D7) |
| Codec de vídeo | `videoCodec` | como veio |
| Quadros por segundo | `fps` | até 2 decimais, vírgula (`59,94`) |
| Taxa de bits | `bitrateKbps` | ≥ 1000 → `4,0 Mbps` (1 decimal, vírgula); < 1000 → `850 kbps` |
| Buffer | `bufferMs` | `12,4 s` |
| Protocolo | `protocol` | como veio |
| Áudio | faixa de áudio ativa de `session.getTracks()` | `trackLabel` |
| Conexão | `useOnlineStatus()` | `Online` / `Offline` — **sempre** presente |

- `getStreamInfo()` nulo ou sem nenhum campo → no lugar das linhas técnicas,
  "O aparelho não informou dados técnicos deste stream." (Conexão continua).
- `protocol` **nunca** é derivado da URL (a URL carrega credencial e a
  extensão não prova o protocolo — constitution "Uma Lista… Nunca É Tratada
  Como Manifesto"): só se um motor o informar.
- Único focável: botão "Fechar" (`tv-focus`); SELECT ou RETURN fecham.
- Releitura a cada **1000 ms** (info + faixas), pulada com a página oculta;
  o intervalo é cancelado ao fechar (contrato, teste 5).
- Botão do chrome indisponível (motor sem `getStreamInfo`): "Info do stream
  — indisponível", SELECT → toast "Este aparelho não informou dados técnicos
  deste stream."

---

## §7 Teclado e foco no `PlayerLayer`

`useRemoteNav` do `Modal` **não** funciona aqui: o `PlayerLayer` já registra
`{modal:true}` antes e para a propagação na captura, então um `Modal` filho
nunca receberia tecla (D-002). O painel é **estado do `PlayerLayer`**,
roteado como o `topLayer` da 016.

- Estado em **ref** + `rerender()` (mesmo motivo de `chromeLevelRef`, R-008 da
  027): `panelRef: { kind: 'tracks' | 'info'; focusKey: string;
  originIndex: number } | null`.
- Prioridade dos handlers: `topLayer` → **painel** → tela de erro → chrome.
- Com painel aberto: ↑/↓/OK/RETURN vão ao painel; ←/→ ignoradas (tracks) /
  ignoradas (info); `MediaStop` continua fechando o player; demais teclas de
  mídia ignoradas.
- Abrir: limpa o timer de auto-hide; o chrome **não** é desenhado enquanto
  o painel está aberto; a legenda continua (permite ver o atraso).
- Fechar (RETURN, "Fechar"): `setLevel('full')`, `seekBar = false`,
  `setFocused(originIndex)`, `scheduleHide()` — o foco volta ao botão que
  abriu (FR-010/FR-017). Vale igual para Live (linha aberta, não a faixa).
- Fecha sozinho, sem chamar `onClose`: nova sessão (início do efeito
  `[itemId, attempt, createAdapter]`), erro, conclusão.

### 7.1 `chromeControls`

Quinto parâmetro opcional `features: { tracks: boolean; info: boolean }`
(padrão ambos `false`, chamadas antigas continuam válidas). Nova
disponibilidade `'unavailable'` no tipo.

| Controle | `features.x === true` | `false` |
| --- | --- | --- |
| tracks | `real`, "Áudio e legendas" | `unavailable`, "Áudio e legendas — indisponível" |
| info | `real`, "Info do stream" | `unavailable`, "Info do stream — indisponível" |

Posição na linha **inalterada** (VOD: depois de ⏩/próximo episódio; Live:
depois de Guia). `PlayerLayer` passa `session.supportsTracks` /
`session.supportsStreamInfo`. `PlayerChrome` já trata qualquer
`availability !== 'real'` como soft disabled — nada a mudar lá.
