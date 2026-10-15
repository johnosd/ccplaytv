# Lógica — arquivo (catch-up) de painel Xtream (US2/US3)

Vocabulário: **programa** = bloco do EPG com horários reais (epoch ms, já com
o deslocamento manual da fonte somado — os mesmos que o Guia desenha).
**Arquivo do canal** = `archiveDays` (dias declarados pelo painel).

## §1 Disponibilidade (`lib/epg/catchup.ts` → `isArchiveAvailable`, FR-008)

```ts
const DAY = 86_400_000
isArchiveAvailable(days, p, now) =
  typeof days === 'number' && Number.isFinite(days) && days > 0 &&
  p.start <= now &&                 // já começou (o atual conta)
  p.start >= now - days * DAY       // o INÍCIO dentro dos dias
```

## §2 URL (`lib/catalog/archiveUrl.ts` → `buildArchiveUrl`)

```ts
wall(instant, clock):
  if (clock.timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: clock.timezone, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant)
      return `${Y}-${M}-${D}:${h}-${m}`        // de parts por `type`
    } catch { /* RangeError: fuso desconhecido → cai no deslocamento */ }
  }
  if (Number.isFinite(clock.utcOffsetMinutes)) {
    const d = new Date(instant + clock.utcOffsetMinutes * 60_000)  // campos getUTC*
    return `${Y}-${M}-${D}:${h}-${m}`
  }
  throw new ArchiveClockUnknownError()

duration = Math.max(1, Math.ceil((endMs - startMs) / 60_000))
rest: `${base}/timeshift/${enc(user)}/${enc(pass)}/${duration}/${wall(start)}/${streamId}.${ext}`
php:  `${base}/streaming/timeshift.php?username=${enc(user)}&password=${enc(pass)}&stream=${streamId}&start=${wall(start)}&duration=${duration}`
```

`enc = encodeURIComponent` (igual a `buildLiveUrl`). Segundos do início são
descartados (precisão de minuto do painel). `ext`: `preferredFormat(allowedFormats)`
da credencial (`ts` quando permitido); nenhum → `PlaybackUnavailableError('no_allowed_format')`.

## §3 Obter a reprodução (`catalogApi.fetchArchivePlayback`, FR-010/FR-017)

```ts
fetchArchivePlayback(itemId, program, options?: { variant?: ArchiveVariant })
  record = getChannel(Number(itemId))
  se !record || record.kind !== 'channel' || !isArchiveAvailable(record.archiveDays, program, Date.now())
     → throw CatalogApiError(409)                     // "sem fonte de reprodução"
  source = db.sources.get(record.sourceId); credential = readCredential(...)
  clock = { timezone: source.panelTimezone, utcOffsetMinutes: source.panelUtcOffsetMinutes }
  se clock vazio → refreshPanelClock(sourceId) (resolveAccountStatus, limite 5 s, grava via markAccount)
  variant = options?.variant ?? source.archiveVariant ?? 'rest'
  url = resolveArchivePlaybackUrl(...) → buildArchiveUrl(variant, {...})   // em lib/catalog/playbackUrl.ts
  ArchiveClockUnknownError → CatalogApiError(409)
  return { ...mesmos campos de fetchPlayback, kind: 'archive', url, archive_variant: variant }
```

- **A primeira chamada é sempre com 2 argumentos** (o contrato confere
  `toHaveBeenCalledWith('ch-7', { start, end })`); só a 2ª tentativa passa
  `{ variant }`.
- `archive_variant` no tipo de retorno é **opcional** (o contrato monta o
  retorno sem ele e o `tsc -b` compila o arquivo do contrato).
- A URL nunca é guardada nem logada; `CatalogApiError` não carrega a URL.

## §4 Sessão de arquivo (`usePlayerSession` + `PlayerService`)

`usePlayerSession` recebe `archive: PlayerArchive | null | undefined`.
Dependências do efeito da sessão: `[itemId, attempt, createAdapter, archive?.start, archive?.end]`.

```ts
const playback = archive
  ? await fetchArchivePlayback(itemId, { start: archive.start, end: archive.end }, variantOverride)
  : await fetchPlayback(itemId)
const media: ChromeMedia = playback.kind === 'channel' ? 'live' : 'vod'    // 'archive' → 'vod'
const session = createPlayerSession(playback.url, FULLSCREEN_REGION, playback.kind, {
  createAdapter, startAtMs: resumeAtRef.current ?? (archive ? undefined : startAtMs),
  headers: playback.headers,
  timeline: archive ? {
    durationMs: archive.end - archive.start,
    maxPositionMs: () => Math.max(0, Math.min(archive.end, Date.now()) - archive.start),
  } : undefined,
})
recorder = createProgressRecorder(archive ? null : computeIdentity(playback), ...)   // FR-019: nada gravado
```

`PlayerServiceSession` com `timeline`:
- `applyProgress`: `durationMs` = `timeline.durationMs` (o do motor é ignorado).
- `clampSeekTarget`/`clampJumpDelta`: teto = `min(durationMs − 1, maxPositionMs?.() ?? ∞)` (FR-014).
- Capacidades: `mediaCapabilities('archive')` = FULL (stub já feito).

Fim: `session.state === 'completed'` → `(archive ? onArchiveEnded ?? onClose : onCompleted ?? onClose)()`.

**Variante (R4 da research)**: no ramo de erro, ANTES da reconexão automática:

```ts
if (archive && !playedThisSession && variantStepRef.current === 0) {
  variantStepRef.current = 1
  variantOverride = other(playback.archive_variant ?? 'rest')
  setAttempt(n => n + 1); return                       // mesma sessão nova, outra variante
}
```

Quando a sessão de arquivo chega a `playing` pela 1ª vez: `rememberArchiveVariant(sourceId, playback.archive_variant)`.
Duas variantes falharam → diagnóstico `PLAY-06` (`category: 'source'`,
`actions: []`, `autoReconnect: false`): "O arquivo deste programa não
respondeu." Ações visíveis: **"Ao vivo"** (nova `ErrorActionId` `'live'`, só
com `onGoLive`) e "Voltar". Trocar de programa/canal zera `variantStepRef`.

Voltar do app oculto (020/042) num arquivo pausado: `verifyResume` usa
`fetchArchivePlayback` (não `fetchPlayback`); `409` (o programa saiu do
arquivo) → `onArchiveEnded` em vez do erro.

## §5 O que vem depois (`nextArchiveStep`, FR-013)

```ts
nextArchiveStep(programs, current, days, now):
  if (current.end > now) return { kind: 'live' }             // o atual termina no "agora"
  const next = [...programs].sort(byStart).find(p =>
    p.start > current.start && Math.abs(p.start - current.end) <= CONTIGUOUS_TOLERANCE_MS)
  if (!next || !isArchiveAvailable(days, next, now)) return { kind: 'live' }
  return { kind: 'archive', program: next }
```

## §6 Chrome (`chromeControls.ts`, `PlayerChrome.tsx`, `usePlayerKeyboard.ts`)

- `ChromeControlId` ganha `'goLive'` e `'startOver'` (+ ícone e texto curto em
  `PlayerChrome` — os `Record`/`switch` são exaustivos).
- `ChromeFeatures` ganha `archive?: boolean` e `startOver?: 'enabled' | 'disabled' | 'none'`.
- **VOD com `archive`**: `[⏪, ▶⏸, ⏩, goLive, Áudio, Qualidade, Aspecto, Info]`
  (o contrato conta dois passos de ▶⏸ até "Ao vivo"). Rótulo `player.chrome.goLive` = "Ao vivo".
- **Live com `startOver`**: `[Guia, startOver, Áudio, Qualidade, Aspecto, Info]` —
  "Guia" continua o 1º (contratos 027/031/041 contam a partir dele e não passam
  `startOver`). Rótulo `player.chrome.startOver` = "Do início"; desabilitado →
  `availability: 'unavailable'`, rótulo "Do início — sem programação agora", OK
  mostra o toast `player.startOver.noProgram`.
- `PlayerIdentity` **não muda**: o `PlayerLayer` deriva a identidade do arquivo
  da própria prop `archive` (o contrato monta `identity={{ title: 'Canal Sete' }}`
  sem nada de arquivo). `PlayerChrome` ganha a prop `archive?: { title: string;
  timeRange: string }` (o `PlayerLayer` formata `timeRange` com
  `formatEpgTimeRange(start, end, t.language)`); com ela, a identidade do VOD
  desenha o selo **"Arquivo"** (`player.chrome.archive`), o nome do canal
  (`identity.title`), o título do programa e o horário. Nunca o selo "AO VIVO".
- Teclado no arquivo (`chromeMediaRef === 'vod'` + `archive`):
  - `ChannelUp/Down` → `onChannelStep` (troca para o ao vivo do vizinho, FR-018);
    hoje o VOD ignora CH± — só ignora quando NÃO é arquivo.
  - ↑/↓ com chrome **oculto** → `onChannelStep`; com chrome visível → regra do VOD.
  - OK em `goLive` → `onGoLive`.
  - RETURN → `onClose` (a tela decide: Guia ou ao vivo, §7).

## §7 Tela (`features/live/useLiveArchive.ts`, novo, chamado pela `LiveScreen`)

Estado `archive: { program, origin: 'guide' | 'startOver', guideList?, guideFocusStart? } | null`.

| Evento | Efeito |
| --- | --- |
| OK num programa disponível do Guia (`EpgGuide.onWatchArchive`) | `setPlaying(canal)`; `setArchive({ program, origin: 'guide', guideList })`; o Guia fecha (como `watchFromGuide`) |
| "Do início" (chrome) | `setArchive({ program: agora do canal, origin: 'startOver' })` |
| `onGoLive` | `setArchive(null)` |
| `onArchiveEnded` | `nextArchiveStep(programas do canal, program, archive_days, Date.now())` → `setArchive({...a, program})` ou `setArchive(null)` |
| `stepChannel` (↑/↓/CH±) com arquivo | `setArchive(null)` + troca de canal de sempre |
| RETURN (`onClose`) com `origin: 'guide'` | `setArchive(null)`, `setPlaying(null)`, reabre o Guia na `guideList` com foco no canal + `program.start` (nova prop opcional `initialProgramStart` do `EpgGuide`) |
| RETURN com `origin: 'startOver'` | `setArchive(null)` — o player volta ao ao vivo (não fecha) |

Programas do canal: `useEpgPrograms(sourceId, [playing.epg_channel_id])` +
`buildGuideRows` (mesmos horários do Guia). `startOver.enabled` =
`nowNextForChannel(...).now !== undefined`.

## §8 Guia (`EpgGuide.tsx`)

- Prop nova opcional `onWatchArchive?(channel, program, list, listKey)` e
  `initialProgramStart?: number | null`. Sem `onWatchArchive` (contrato
  travado da 031) tudo continua igual.
- Bloco passado com `isArchiveAvailable(channel.archive_days, program, now)` e
  `onWatchArchive` presente: classe extra `is-archive` + marcador visual (ícone
  `history`, rótulo `guide.archiveAvailable` = "Disponível" no `aria-label`),
  sem `aria-disabled`. Continua `is-past` (fato de tempo).
- `onSelect` em programa encerrado:
  - disponível → `onWatchArchive(...)`;
  - canal com arquivo, fora dos dias → `onNotify(t('guide.archiveExpired'))` = "Este programa já saiu do arquivo deste canal.";
  - canal sem arquivo → `onNotify(t('guide.programEnded'))` (texto de hoje, contrato da 031).
- Detalhe do programa focado: com arquivo disponível, linha "Disponível no arquivo · OK para assistir".

## §9 Selo na prévia da Live (`liveColumns.tsx`, FR-015)

Com `activeChannel.archive_days > 0`: `<span class="live-hero-archive">` com
`t('live.archiveBadge', { days })` = "Arquivo · {days} dias" dentro de
`.live-hero-copy`. Não focável, sem `<button>`.
