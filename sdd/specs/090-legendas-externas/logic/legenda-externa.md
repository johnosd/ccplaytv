# Lógica: legenda externa no player

Feature `090-legendas-externas`. Fixa o "como" que os contratos travados pressupõem e que um executor erraria sem
saber. Citado no `plan.md` e no `tasks.md` como `logic §N`.

## §1 Arquivo → falas (`lib/subtitles/subtitleFile.ts`)

`parseSubtitleFile(text): ExternalCue[]` — pura, sem DOM (roda no projeto `node` do vitest).

1. Remove BOM (`﻿`) do início; normaliza `\r\n` e `\r` para `\n`.
2. Divide em blocos por linha em branco (uma ou mais).
3. Bloco cujo primeiro texto é `WEBVTT`, `NOTE`, `STYLE` ou `REGION` → ignorado.
4. Num bloco, a **primeira linha que contém `-->`** é a linha de tempo; o que vem antes (número SRT ou id de cue
   WebVTT) é ignorado; o que vem depois é o texto. Bloco sem `-->` → ignorado.
5. Tempo aceita `HH:MM:SS,mmm`, `HH:MM:SS.mmm` e `MM:SS.mmm` (forma curta do WebVTT). Configurações depois do segundo
   tempo (`align:start`, `position:…`) são ignoradas. Tempo ilegível → bloco ignorado.
6. Texto: remove tags `<...>` (inclui `<i>`, `<b>`, `<font …>`, `<c.x>`, `<v Nome>`, `<script>` — o **conteúdo** entre
   tags fica, a tag some), remove blocos ASS `{\...}` (ex.: `{\an8}`), decodifica só `&amp;` `&lt;` `&gt;` `&quot;`
   `&#39;` `&nbsp;` (nbsp → espaço). `trim` por linha; linhas vazias no fim saem; linhas internas juntadas com `\n`.
7. Descarta cue com `endMs <= startMs` ou texto vazio. Ordena por `startMs` (estável).
8. Zero cues → `throw new SubtitleFileError()`.

Nunca `innerHTML`, `DOMParser` ou regex com retrocesso catastrófico; o arquivo tem no máximo ~1 MiB (o serviço corta).

## §2 Agenda pelo tempo da mídia (`lib/subtitles/externalCueDriver.ts`)

O `SubtitleOverlay` da 029 recebe linhas "no instante de exibir" (`subscribeSubtitles`, `{ text, durationMs }`,
`null` = apagar). O motor não entrega legenda externa, então o driver **gera** essas linhas a partir da posição.

Estado: `cues` ordenadas, `delayMs`, `shown: ExternalCue | null`, `anchor: { mediaMs, at } | null` (última posição
recebida e o `now()` daquele instante), `playing`, um único timer.

- **Tempo efetivo** `t = posição − delayMs` (atraso positivo = a fala aparece depois; negativo = antes).
- **`update(positionMs, playing)`**:
  1. `expected` = se havia `anchor` e o estado anterior era `playing`: `anchor.mediaMs + (now() − anchor.at)`; senão
     `anchor.mediaMs`. É **salto** quando `|positionMs − expected| > 1000` (`JUMP_THRESHOLD_MS`).
  2. Grava o novo `anchor` e `playing`.
  3. Acha `c` = cue com `startMs ≤ t < endMs` (busca binária).
  4. Salto: se `shown !== null`, emite `null`; depois, se `c`, emite `{ text: c.text, durationMs: c.endMs − t }`.
     Sem salto: se `c !== shown` — `c` presente emite a cue (a linha nova substitui); `c` ausente emite `null`.
     `shown = c`.
  5. Timer: limpa o anterior; se `playing`, agenda para a próxima fronteira (`shown ? shown.endMs : próxima.startMs`)
     em `fronteira − t` ms; ao disparar, reavalia com a posição extrapolada (`anchor.mediaMs + (now() − anchor.at)`) —
     **sem** tratar como salto. Pausado: nenhum timer (a linha exibida fica; o overlay já segura a linha na pausa).
- **`setDelay(ms)`**: troca o atraso e reavalia como **salto** na posição extrapolada (apaga e mostra a certa).
- **`dispose()`**: limpa timer e ouvintes; nada é emitido depois.
- O `SubtitleOverlay` recebe `delayMs = 0` quando a fonte é o driver — o atraso já está no driver. Nunca os dois.
- Um único timer, nunca `setInterval` nem `requestAnimationFrame` (feature 088: a thread da TV é o gargalo).

Quem chama `update`: o hook (§5) assina `session.subscribe` (estado/progresso, já existe) e chama
`driver.update(session.progress.positionMs, session.state === 'playing')` — direto, **sem `setState`**, para uma
linha de legenda nunca re-renderizar o `PlayerLayer` (mesma regra da 029 §1.4).

Frequência do `oncurrentplaytime` do AVPlay: não medida. A extrapolação cobre intervalos longos; a precisão real é
gate G-2 (quickstart C3).

## §3 Alvo e pedido de busca (`lib/subtitles/subtitleTarget.ts`)

`resolveSubtitleTarget(itemId, database = db)` — só leitura local, chamada **no SELECT** de "Buscar legenda online"
e na restauração (§5.4), nunca ao focar:

1. `getChannel(Number(itemId), database)` (de `catalogRepository.ts`, já respeita categoria escondida/travada — 066).
   Ausente ou `kind` ∉ {`movie`, `episode`} → `null`.
2. `stableId = buildStableId({ sourceId, kind, providerStreamId, seriesId, seasonNumber, episodeNumber,
   originalName })` (de `userStateRepository.ts`); lança → `null`.
3. Filme: `meta = titleMetadata.get(titleStableId(record))`; `tmdbId = meta.tmdb.status === 'matched' ?
   meta.tmdb.tmdbId : meta.providerTmdbId`. `title = normalizeTitle(record.name ?? record.originalName)`;
   `year = record.year ?? yearHintFromTitle(record.originalName)`.
4. Episódio: `series = findSeriesRecord(sourceId, seriesId, database)`; `parentTmdbId` do `titleMetadata` da série
   (só `matched` — o painel não declara TMDB de série); `title = normalizeTitle(series.name ?? series.originalName)`,
   e sem série resolvida o nome do episódio normalizado; `season`/`episode` do registro; `year` da série.
5. `title` vazio depois de normalizar e sem ID TMDB → `null` (não há o que buscar; a linha some).

`buildSearchRequest(target, language)` — pura, **exatamente** um destes formatos (o contrato compara com `toEqual`):

| Caso | `request` | `byName` |
| --- | --- | --- |
| filme com `tmdbId` | `{ language, tmdbId }` | `false` |
| episódio com `parentTmdbId`, `season` e `episode` | `{ language, parentTmdbId, season, episode }` | `false` |
| filme sem ID | `{ language, query: title, year? }` | `true` |
| episódio sem ID | `{ language, query: title, season?, episode? }` (sem `year`) | `true` |

Campo ausente não vira `undefined` no objeto (o `toEqual` do contrato aceita, mas o JSON enviado não deve ter chave
vazia). Nunca `stableId`, `sourceId`, URL, nome cru do provedor ou nome da lista.

## §4 Painel "Áudio e legendas" (`components/playerPanels.ts`)

`buildTracksPanel(tracks, choice, t, external?)` ganha o 4º parâmetro **opcional** `external: ExternalPanelInput |
undefined`. Ausente → saída idêntica à de hoje (o contrato travado da 029 cobre isso — não quebre).

```ts
interface ExternalPanelInput {
  /** Legendas externas obtidas para este item (≤ 3, uma por idioma, na ordem pt-BR, en, es); vazio = nenhuma. */
  stored: { language: SubtitleLanguage; active: boolean; delayMs: number }[]
  /** Linha de busca: 'search' = "Buscar legenda online"; 'shortcut' = "Buscar legenda (pt-BR)" (FR-003). */
  search: { mode: 'search' | 'shortcut'; language: SubtitleLanguage; disabledMessage?: string }
}
```

Ordem vertical (o contrato fixa as duas primeiras setas num motor sem faixas: Áudio-descrição → Desativadas →
Buscar):

1. Áudio (sem mudança) → Áudio-descrição (sem mudança).
2. Grupo **Legendas** (radiogroup): `text:off` "Desativadas" → faixas embutidas → uma linha
   `external:<idioma>` "Externa — <idioma>" **por legenda obtida** (radio, `checked = active`; no máximo uma marcada).
3. `external:search` — **botão** (não radio) "Buscar legenda online" ou "Buscar legenda (<idioma>)"; soft disabled
   (`disabled: true`, `disabledMessage`) quando `access() === 'not_entitled'`.
4. Sincronização: com a externa **ativa**, as cinco linhas da 029 dão lugar a **uma** linha `delay:external`
   (§4.1). Com uma embutida ativa (ou nenhuma), as linhas da 029 ficam exatamente como hoje.

### §4.1 Ajuste da legenda externa (FR-008, D-006)

```ts
export const EXTERNAL_DELAY_STEP_MS = 500
export const EXTERNAL_DELAY_LIMIT_MS = 10_000   // −10 s … +10 s
export function stepExternalDelay(current: number, direction: 'left' | 'right'): number  // grampeia nos limites
export function formatExternalDelay(ms: number, t: Translator): string  // "Sem atraso", "+1,5 s", "−2,0 s" (separador do idioma)
```

- Linha `TracksRow` `{ key: 'delay:external', group: 'delay', delayMs: stored.delayMs, label: "Sincronização:
  {valor}" }`, desenhada com `role="slider"`, `aria-valuemin=-10000`, `aria-valuemax=10000`, `aria-valuenow`,
  `aria-valuetext` = o mesmo texto do rótulo, e uma dica visível "◀ adiantar · atrasar ▶".
- **←** = adiantar (−500 ms), **→** = atrasar (+500 ms). Nos limites, a tecla não faz nada (sem volta ao outro lado).
  ↑/↓ continuam movendo entre linhas. Em `handlePanelDirection`, ←/→ continuam ignorados no painel de faixas,
  **exceto** com o foco em `delay:external`.
- **OK** na linha volta a "Sem atraso" (0) — atalho para desfazer.
- Cada tecla: `driver.setDelay(novo)` na hora (a fala certa aparece já, §2) e o rótulo re-renderiza. A gravação
  (`store.update(stableId, { delayMs })`) espera **800 ms sem tecla**, e sai também ao fechar o painel ou o player
  (o valor nunca se perde); nunca uma escrita por toque (D-012).
- O valor é por item: restaurado com a legenda (§5.4); uma legenda nova para o mesmo item começa em 0.

`Desativadas` marcado = nenhuma embutida ativa **e** nenhuma externa ativa. Os três casos de uso do usuário
(2026-10-22) passam por aqui:

| Caso | SELECT em | Efeito | Rede |
| --- | --- | --- | --- |
| Desativar | `Desativadas` ou uma embutida | Driver descartado, linha apagada na hora; `store.update(stableId, { active: false })` | nenhuma |
| Reativar (US1/AC8) | `external:<idioma>` desmarcada | Texto do idioma (em memória da sessão ou `store.list`) → parse → driver com o `delayMs` daquela linha; `session.selectTextTrack(null)`; `store.update(stableId, { active: true }, idioma)` | nenhuma |
| Alternar idioma já obtido (US1/AC9) | outra `external:<idioma>` | Igual a reativar; a anterior fica desmarcada (o store desativa as outras) | nenhuma |
| Idioma ainda não obtido | `external:search` → trocar idioma no diálogo → resultado | Download, nova linha `external:<idioma>` ativa; as já obtidas continuam listadas | 1 busca + 1 download |
| Outra versão no mesmo idioma | `external:search` → resultado | Substitui a linha daquele idioma (ajuste volta a 0) | 1 busca + 1 download |

O foco depois de aplicar/reativar fica na linha `external:<idioma>` escolhida.

Rótulos (catálogo i18n, área nova `messages/subtitles.ts` em pt/en/es): idioma pt-BR = "Português (Brasil)",
en = "Inglês", es = "Espanhol" (nomes do idioma do app). `external:active` = `Externa — {idioma}`.

## §5 Hook `useExternalSubtitles` (`components/player/useExternalSubtitles.ts`)

Um hook novo — **não** dentro de `usePlayerPanels`/`usePlayerSession` (teto de linhas, §8).

### §5.1 Entrada e disponibilidade

- `deps = props.externalSubtitles === undefined ? defaultExternalSubtitles() : props.externalSubtitles`.
  `defaultExternalSubtitles()` (em `lib/subtitles/runtime.ts`) devolve `null` quando `getPortalConnection()` é
  `undefined` ou `!portalSurfacesVisible()` (build base de loja: a opção **não existe**, nunca "em breve" — feature
  078); senão `{ service: createPortalSubtitleService(connection), store: createSubtitleStore(db), resolveTarget:
  resolveSubtitleTarget, access: () => localLicenseAccess() }`.
- `available` = `deps !== null` **e** o alvo do item atual resolvido não-nulo. O alvo é resolvido **uma vez por
  sessão**, de forma local, **só depois da primeira entrada em `playing`** e em momento ocioso (§9) — nunca na
  montagem, na resolução do playback ou antes do primeiro quadro. Até resolver, "Áudio e legendas" fica como a 029
  decide (real só com faixas do motor). É leitura do aparelho, não consulta a serviço.
- `available` entra em `usePlayerChrome` (linha 123): `tracks: (session?.supportsTracks ?? false) || available`.
  Num motor sem faixas, "Áudio e legendas" fica real só por causa da externa (o contrato 090 depende disso; o da 029,
  sem a prop, continua soft disabled).
- `openTracksPanel` abre mesmo com `getTracks()` nulo/vazio quando `available` (lista de faixas vazia).

### §5.2 Busca (diálogo "Buscar legenda online", `PlayerSubtitleSearchPanel.tsx`)

`PanelState` ganha `{ kind: 'subtitleSearch'; focusKey: string; originIndex: number }`. O modelo vem do hook:

```ts
type SearchView =
  | { status: 'loading' }
  | { status: 'results'; results: SubtitleResult[]; byName: boolean }
  | { status: 'empty' }
  | { status: 'error'; code: SubtitleErrorCode; retryAtMs?: number }
```

- Topo: radiogroup **Idioma** com os três idiomas (←/→ movem entre eles; SELECT troca e **busca de novo** — é ação
  da pessoa). Abaixo, conforme o status: `loading` → linha focável "Buscando…" (SELECT não faz nada, RETURN volta);
  `results` → um **botão** por resultado, nome acessível = `release` + " • {fornecedor}" ("OpenSubtitles"/"SubDL",
  nome próprio, não traduzido) + " • {downloads} downloads" **só quando informado** + " • Temporada inteira" quando
  `seasonPack` + " • Para surdos" quando `hearingImpaired` (o contrato fixa: começa pela versão e contém o
  fornecedor); aviso "Busca por nome — confira a sincronia" acima quando `byName`; aviso curto "SubDL indisponível
  agora" (ou OpenSubtitles) acima quando o fornecedor está em `unavailable` — não é estado de erro; `empty` → texto + atalhos
  para os outros dois idiomas; `error` → mensagem por código (tabela abaixo) + botão de ação.
- Foco inicial: primeiro resultado; sem resultado, a ação do estado (`Tentar de novo`, atalho de idioma, ou o
  próprio idioma ativo). Reconciliação por chave (`result:<id opaco>`, `lang:<code>`, `action:retry`), nunca por
  índice.
- `empty` com fornecedor em `unavailable`: a mensagem diz que um fornecedor não respondeu e oferece "Tentar de novo"
  além dos atalhos de idioma.
- RETURN fecha **só** o diálogo e volta ao painel "Áudio e legendas" com foco em `external:search`.
- SELECT num resultado: `status` passa a `loading` (linha "Baixando…"), `download` → `parseSubtitleFile` → aplica
  (§5.3) → fecha o diálogo e reabre o painel de faixas com foco em `external:<idioma>` aplicado. `SubtitleFileError` → erro
  `unreadable` com ação "Escolher outra" (volta aos mesmos resultados, sem nova busca).

| Código | Mensagem (pt) | Ação |
| --- | --- | --- |
| `offline` / `unavailable` | Sem conexão com o serviço de legendas. | Tentar de novo |
| `not_entitled` | Legendas online precisam de licença ou teste ativo. Veja em Portal & licença. | Fechar |
| `device_limit` | Limite diário desta TV atingido. Volta às {hora}. | Fechar |
| `provider_limit` | O serviço de legendas está no limite hoje. Tente mais tarde. | Fechar |
| `unreadable` | Esta versão não pôde ser lida — escolha outra. | Escolher outra |

(Texto final pelo catálogo i18n nas três línguas; a tabela fixa a distinção, não a redação.)

### §5.3 Aplicar, trocar, desativar

- O hook mantém, por item, só os **metadados** das legendas obtidas (`language`, `active`, `delayMs`, `release`) —
  semeados no passo ocioso (§5.4) por `store.list?.(stableId)` (sem `list`, nos fakes, pelo `load`) e acrescidos a
  cada download. É deles que o painel tira as linhas `external:<idioma>`; montar o painel nunca lê banco.
- Em RAM fica **só o texto da legenda ativa** (já parseado no driver). Reativar/alternar lê o texto daquele idioma
  do aparelho na hora (`store.list`/`load` → `gunzipText` fora de transação → parse): alguns ms, nenhuma rede. Sem
  `list` (fakes), usa o texto baixado nesta sessão.
- Aplicar: `driver = createExternalCueDriver(cues, { delayMs })`, assina `session.subscribe` (§2), o overlay passa a
  receber o **driver** como fonte; `session.selectTextTrack(null)` (desliga a embutida); `store.save({...,
  active: true, delayMs: 0})` — `false` não é erro (vale na sessão). Grava o idioma na memória da sequência (§5.5).
- Reativar/alternar (tabela de §4): mesmo caminho, sem `save` (só `update` com o idioma).

### §5.7 Custo de guardar por idioma (condição do usuário, 2026-10-22)

O usuário aceitou guardar uma legenda por idioma **só se o custo for pequeno**. Estimativa: arquivo de ~85 KB
(medido na avaliação) → ~25–35 KB com gzip; ≤ 3 por item; o **total** continua preso ao mesmo teto de 2 MiB
(§6) — guardar por idioma muda a divisão do espaço, não o consumo. RAM: só a ativa.

Critério de descarte, verificado na T016 com um SRT real de fixture (sem texto de terceiro versionado: gerar um
SRT sintético de ~1 500 falas com acentos) e na T042 na TV:

- tamanho gravado por legenda > **60 KB**, ou
- alternar entre idiomas já guardados > **100 ms** na TV (leitura + descompressão + parse), ou
- qualquer efeito no SC-009.

Se qualquer um falhar: voltar a **uma legenda por item** (a última escolhida substitui; trocar de idioma baixa de
novo) — chave `stableId` só, US1/AC9 passa a aceitar novo download — e registrar a decisão em Riscos (R-011).
- O `SubtitleOverlay` hoje recebe `session`; passa a receber `source: { subscribeSubtitles }` — a sessão satisfaz o
  tipo estruturalmente, então a troca é só do argumento. Ao trocar de fonte, o overlay reassina (efeito por `source`).
- Ajuste com a externa ativa → §4.1 (`driver.setDelay` na hora, gravação adiada); **não** grava em `TrackChoice` (a
  escolha da sequência é da embutida).
- Fechar o player, trocar de `itemId` ou reiniciar a sessão (reconexão 042): `driver.dispose()`; a restauração (§5.4)
  roda de novo para o item/sessão nova.

### §5.4 Restaurar ao retomar (US2)

No mesmo passo ocioso que resolve o alvo (§5.1, §9), depois da **primeira** entrada em `playing` de cada sessão:
`store.load(target.stableId)` → registro `active` →
`parseSubtitleFile` fora de transação → aplica como §5.3 **sem** `save` e sem rede. Se a escolha herdada (029) ligou
uma embutida, a externa guardada do item vence (`selectTextTrack(null)`) — memória do item > herança da sequência.
Falha de leitura/parse: silenciosa, segue sem legenda externa (edge case "arquivo descartado").

### §5.5 Memória da sequência (FR-003)

Mapa **em memória do módulo** (não persiste) `sequenceLanguage: Map<"sourceId|seriesId", SubtitleLanguage>`, gravado
quando uma externa é aplicada num episódio. Num episódio com alvo da mesma série e **sem** externa guardada, a linha
de busca vira `shortcut` com esse idioma; SELECT abre o diálogo já buscando nesse idioma. Nada é chamado sozinho.

### §5.6 Corrida e descarte (FR-010)

Cada busca/download leva um `AbortController` e um número de geração `seq` capturado junto com `itemId` e a sessão.
Ao trocar `itemId`, fechar o diálogo, iniciar outra busca ou desmontar: `abort()` + `seq++`. Resposta com `seq`
antigo é descartada **antes** de qualquer `setState`, `save` ou aplicação. O serviço falso do contrato não respeita
`signal` — o descarte não pode depender de `abort` lançar.

## §6 Memória no aparelho (`lib/subtitles/subtitleStore.ts`)

- Tabela Dexie nova `externalSubtitles` em `dbSchema.ts` `version(27)`: `'[stableId+language], stableId, sourceId,
  lastUsedAt'`, sem `.upgrade()` — uma linha por idioma por item; `save`/`update` com `active: true` desativam as
  outras linhas do mesmo `stableId` na mesma transação (no máximo uma ativa). Acesso tipado num arquivo próprio (`subtitleTables.ts`, padrão de `parentalTables.ts`) — `db.ts`
  está no teto (854).
- Registro (data-model.md §1): texto **comprimido** com `gzipText` de `blockCodec.ts`; `gunzipText` sempre **fora**
  de transação (regra da 082).
- Teto próprio `EXTERNAL_SUBTITLES_CAP_BYTES = 2 MiB` (soma de `size`). `save`: lê os tamanhos, apaga os de
  `lastUsedAt` mais antigo (nunca uma linha do próprio `stableId`) até caber, grava — tudo numa transação **só desta tabela**.
  Arquivo maior que o teto sozinho → não grava (`false`). `QuotaExceededError`/`DatabaseClosedError` → `false`.
- Não chama `makeRoomFor`: legenda não é catálogo nem guia, tem teto fixo pequeno dentro da reserva da 082 (12 MiB
  mínimos para estado da pessoa e gravações críticas). Decisão D-008/R-006 do plano.
- `load` atualiza `lastUsedAt` (fora do caminho de render).
- `deleteSource` (`sourceDeletion.ts`): tabela entra em `sourceDeletionTables` e `where('sourceId').equals(id).delete()`
  na mesma transação (FR-021). O backup de uso (072) enumera tabelas explicitamente — **não** incluir esta.

## §7 Cliente do serviço (`lib/subtitles/portalSubtitleService.ts`)

- `search`: `connection.ready()` → `client.request('/portal/v1/device/subtitles/search', { bearer, body: request,
  signal })` → `SubtitleSearchResponse`; validada campo a campo (contrato §2: `id` pelo regex do §3, `provider` na
  lista fechada, `downloads` opcional) — item inválido é descartado; forma geral inesperada →
  `SubtitleError('unavailable')`.
- `download`: `POST /portal/v1/device/subtitles/download` `{ id, language }` → `{ text }` (string ≤ 1 MiB; o
  `portalClient` já corta o corpo em 1 MiB).
- Mapeamento `PortalRequestError.code` → `SubtitleErrorCode`: `network_error` → `offline`; `subtitles_not_entitled`
  → `not_entitled`; `subtitles_device_limit` → `device_limit` (`retryAtMs = Date.now() + retryAfterMs`);
  `subtitles_provider_limit` → `provider_limit`; `rate_limited` → `device_limit` com o `retryAfterMs` (anti-abuso de
  busca); `subtitles_unreadable` → `unreadable`; resto → `unavailable`.
- `portalClient.ts`: os quatro códigos novos entram em `errorCodes` e em `BODY_CODES`, e `specificCode` passa a ler
  o corpo também em **429** (o limite da TV e o anti-abuso usam o mesmo status). Nunca ecoa o corpo.
- `connection.ready()` pode cadastrar a TV (070) — é consequência da ação da pessoa, igual ao Atualizar.

## §8 Teto de linhas (ratchet) — onde cada coisa entra

| Arquivo | Teto | Regra nesta feature |
| --- | --- | --- |
| `components/PlayerLayer.tsx` | 325 | Só fiação: chamar `useExternalSubtitles`, passar `external` ao modelo, desenhar o diálogo, trocar a fonte do overlay. Para caber, extrair o bloco de painéis do JSX para `components/player/PlayerPanelsView.tsx`. |
| `components/player/usePlayerPanels.ts` | 367 | Recebe um parâmetro `external` (do hook) e delega: `openTracksPanel` sem faixas, linhas `external:*`, `PanelState.kind === 'subtitleSearch'` (direção/SELECT/RETURN). Para caber, extrair `activatePanelControl` (aspect/quality) para `components/player/panelControls.ts`. |
| `components/player/usePlayerKeyboard.ts` | 406 | Não deveria mudar (já roteia teclas para o painel aberto). Se `←/→` não chegarem ao painel, mudar só o filtro em `handlePanelDirection`, não o teclado. |
| `components/player/usePlayerSession.ts` | 592 | **Não tocar.** O hook usa `itemId` e `sessionRef`, que já existem. |
| `lib/catalog/db.ts` | 854 | **Não tocar.** Esquema em `dbSchema.ts`, acesso em `subtitleTables.ts`. |
| Telas (`MovieDetailScreen` 662, `SeriesDetailScreen` 1005) | teto | **Não tocar.** A opção nasce do `itemId` (§5.1). |

Nunca subir um teto no `architecture-baseline.json` para caber esta feature.

## §9 Desempenho — a feature não pode deixar nada mais lento (FR-025, D-012)

Pedido explícito do usuário (2026-10-22). As features 086–089 mediram que o gargalo da TV é a **thread**, não a
rede nem o banco. Então a regra é: **fora do player, a 090 não executa nada; dentro dele, nada no caminho de abrir,
começar a tocar, navegar no chrome ou desenhar quadro.**

| Onde | Regra |
| --- | --- |
| Telas (Início, Filmes, Séries, Live, detalhes, vitrines) | Zero código novo. Nenhum import de `lib/subtitles` em `features/` nem no caminho de montagem das telas. |
| Abertura do app / Dexie | A tabela nova não tem `.upgrade()`; nada é lido dela fora do player. |
| Montagem do player e resolução do playback | Zero trabalho da 090. `defaultExternalSubtitles()` só cria objetos (sem ler banco, sem rede). |
| Até o primeiro `playing` | Zero trabalho da 090. |
| Depois do primeiro `playing` | **Um** passo adiado: `requestIdleCallback` com `timeout: 1500` (sem a API — jsdom dos testes —: `setTimeout(…, 0)`, ainda uma tarefa separada depois do `playing`; o contrato espera com o `waitFor` padrão de 1 s), que lê o alvo e `store.load` — 3 a 4 `get` do IndexedDB, nenhum varrimento. Só então, se houver legenda guardada ativa, `gunzipText` + `parseSubtitleFile`. |
| Durante a reprodução | Nenhum `setInterval`, `requestAnimationFrame` ou polling. O driver tem **um** timer e só acorda nas fronteiras de fala (≈ 1 por fala, segundos entre elas). Progresso do motor → `driver.update` sem `setState` (nenhum re-render do `PlayerLayer` por tique). O overlay só re-renderiza quando a linha muda — igual à embutida da 029. |
| Navegação no chrome/painel | Montar o modelo do painel não lê banco nem rede: usa o que o hook já tem em memória (alvo, registro guardado, estado da busca). |
| Busca/download | Só no SELECT. `fetch` é assíncrono; o parse do arquivo (≤ 1 MiB, tipicamente ~85 KB) roda uma vez por download. Se a medição mostrar > 16 ms no parse, dividir em pedaços com `yieldToUi()` de `blockCodec.ts` (nunca em Worker novo — mexeria no `tizen_web_project.yaml`). |
| Gravação | `store.save` depois de a legenda já estar na tela, sem `await` no caminho do SELECT; despejo só dentro do `save`. |
| Pacote | `lib/subtitles` e o diálogo entram no chunk do player; o diálogo pode ser `lazy` se o aumento do bundle principal passar de 10 KB gzip (medir no Polish). |

Verificação (gate G-2 + SC-009): na TV de referência, com a instrumentação da 088 (`lib/perf/`), comparar a mesma
reprodução **com e sem** legenda externa ativa — tempo de thread presa, pior quadro e fps no período tocando — e o
roteiro de navegação da sonda (só `→`/`↓`, regra da 089) **antes e depois** da feature. Alvo: diferença dentro do
ruído das rodadas (a 088 mediu o desvio entre rodadas; usar o mesmo critério). Diferença acima do ruído **reprova** a
fase, não é "pendência".


## §10 Dois fornecedores e BYOK (ampliação de 2026-10-22)

### §10.1 Quem consulta quem

`createSubtitleSearch(deps)` (em `lib/subtitles/subtitleSearch.ts`) é a única entrada que o hook usa como
`SubtitleServicePort` em produção; ele decide, **por fornecedor**, o caminho:

| Chave pessoal escolhida do fornecedor | Caminho |
| --- | --- |
| não | pelo serviço do ccplayTv (modo padrão, os dois numa chamada só) |
| sim | direto da TV ao fornecedor (§10.3), com a chave da pessoa |

Sem chave pessoal nenhuma: **uma** chamada ao serviço (que já consulta os dois). Com chave pessoal de um: chamada ao
serviço pedindo só o outro (campo `providers` no corpo — acrescentar ao contrato §2 como opcional, padrão os dois) +
chamada direta, em paralelo; junta com a ordem do contrato §2. O download vai pelo caminho do fornecedor do `id`.
Sem licença/serviço e sem chave pessoal: a opção segue a regra de `not_entitled`/desligada de §5.1.

### §10.2 Chaves pessoais (`lib/subtitles/subtitleCredentials.ts`)

- Tabela nova `subtitleCredentials` em `dbSchema.ts` `version(27)` (junto de `externalSubtitles`), chave `provider`
  (`'opensubtitles' | 'subdl'`), registro `{ provider, key, state: 'valid' | 'rejected' | 'rate_limited',
  lastTestedAt, chosen: boolean }`. **Não** usar `integrations` (tipada `'tmdb'` em `db.ts`, que está no teto, e lida
  pelo backup 072). Fora de `sourceDeletionTables` (é da pessoa, não da lista), fora do backup e de exportação.
- `saveSubtitleKey(provider, raw)`: `trim`; formato amplo `^[A-Za-z0-9._-]{8,200}$`; testa no fornecedor (SubDL: uma
  busca barata, ex. `film_name=test&subs_per_page=1`; OpenSubtitles: `GET /infos/user` ou uma busca mínima com
  `Api-Key`) e só grava se aceita; recusa não troca nada (mesmo padrão de `saveTmdbKey`). `removeSubtitleKey`,
  `readSubtitleCredential`. A chave só existe nessas funções e no `fetch` do fornecedor; nunca em log, erro, estado de
  React ou DOM depois de digitada.
- UI: seção nova "Legendas" na aba Integrações (`features/settings/tabs/SubtitleKeysSection.tsx`, montada por
  `IntegrationsTab.tsx` com uma linha), uma linha por fornecedor: estado ("Padrão do ccplayTv" / "Sua chave — válida"
  / "Sua chave — recusada"), ações "Adicionar chave" (IME da TV, campo oculto por padrão, como a TMDB), "Testar" e
  "Remover". Textos pelo i18n. Na variante base de loja, a seção aparece (BYOK não depende do portal), mas o texto
  "Padrão do ccplayTv" vira "Sem chave" quando `defaultExternalSubtitles()` é `null`.

### §10.3 Clientes diretos (`lib/subtitles/directProviders.ts`, `lib/subtitles/zipReader.ts`)

- Mesma tradução de pedido e normalização do contrato §2 e mesma extração do §3, em TS: o serviço (Python) e a TV
  precisam dar o **mesmo** resultado — os testes da T050 usam as mesmas amostras de resposta do serviço (fixtures
  JSON sintéticas, nunca resposta real versionada).
- `zipReader.ts`: leitor mínimo do diretório central (assinaturas `PK`/`PK`), métodos 0 (store) e 8
  (deflate via `DecompressionStream('deflate-raw')`); recusa ZIP64, criptografia e o resto; limites de 50 entradas e
  4 MiB descompactados, lendo com contador e abortando ao passar. Sem dependência nova (o Polish confere o bundle).
- Erros diretos mapeados para os mesmos `SubtitleErrorCode`: 401/403 → `unavailable` com motivo "chave recusada"
  (mostrado só na linha do fornecedor e na aba Integrações, que marca `state: 'rejected'`), 429/`quota_exceeded` →
  `provider_limit` com a ação "Usar o padrão do ccplayTv" (ADR-021 §4: troca explícita, nunca automática — a ação
  desmarca `chosen` e repete a busca pelo serviço).
- CORS: provado no PC para o SubDL (API e `dl.subdl.com`) e para a API do OpenSubtitles; o `link` de download do
  OpenSubtitles **não** foi provado do navegador da TV — T053 prova antes de declarar o BYOK do OpenSubtitles pronto.

### §10.4 Desempenho

Nada disto roda fora de uma ação da pessoa: ler a credencial escolhida acontece no SELECT da busca (um `get`), não na
montagem do player; o leitor ZIP só roda no download; a seção da aba Integrações só lê a tabela ao abrir a aba.
