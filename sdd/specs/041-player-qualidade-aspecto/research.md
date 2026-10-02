# Research: Qualidade, aspecto e preferências do player

Incertezas técnicas reais desta feature. Quase todas são do AVPlay e **só se
provam na TV de referência** (QN50Q60DAGXZD): por isso a Fase 1 de `tasks.md`
é um spike na TV, e o que ele medir substitui o que está marcado "a confirmar"
abaixo (registrar o resultado aqui e em `plan.md` → R-001/R-002).

## R0-1 — Como o AVPlay muda o aspecto

**Decisão**: o adaptador AVPlay declara em `getAspectModes()` **só os modos que
o spike provar** na TV, com este mapeamento candidato (referência Samsung,
não verificada):

| Modo (DS §27.7) | Candidato no AVPlay | A confirmar no spike |
| --- | --- | --- |
| Ajustar (`fit`) | `setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')` | É o comportamento atual sem chamada nenhuma? |
| Preencher (`fill`) | `setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN')` | Estica (deforma) ou corta? O DS quer "preencher a tela" — esticar é aceitável |
| Original (`original`) | `setDisplayRect` centralizado com a largura/altura do vídeo (`getCurrentStreamInfo` → `Width`/`Height`), limitado à tela | O AVPlay aceita um retângulo menor que a tela durante `PLAYING`? Vídeo maior que 1920×1080 → igual a Ajustar |
| Zoom (`zoom`) | `setVideoRoi` (recorte central), se existir no aparelho; senão `PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO` **não** serve (não é zoom) | `typeof webapis.avplay.setVideoRoi`; efeito real |

Também a confirmar: se o modo **persiste entre `close()`/`open()`** (o AVPlay é
um singleton) — é o motivo de D-004 aplicar o modo em **toda** sessão nova,
inclusive `fit`; e se `setDisplayMethod` em `PLAYING` reflete na hora (SC-002,
≤ 1 s) ou só depois de `prepare`.

**Justificativa**: FR-001 diz "só os que o motor aceita"; anunciar um modo que
o aparelho ignora é um controle que não faz nada (SC-005, constitution
"Progresso e Capacidades São Reais").

**Alternativas consideradas**: declarar os quatro modos de saída e esconder os
que falharem na primeira chamada — rejeitado: a falha do AVPlay nem sempre
lança (pode só não mudar a imagem), então "aceitou" ≠ "funcionou"; só o olho
na TV decide.

**Resultado do spike (2026-10-01, QN50Q60DAGXZD, visto pelo usuário em conteúdo
não 16:9):** os quatro modos funcionam na tela e as chamadas respondem em
6–28 ms (≤ 1 s, SC-002). Mapeamento **provado**, agora no adaptador:

| Modo | Chamadas | Observação |
| --- | --- | --- |
| `fit` | `setDisplayRect(região)` + `LETTER_BOX` | volta ao normal |
| `fill` | `setDisplayRect(região)` + `FULL_SCREEN` | |
| `original` | `setDisplayRect(retângulo do tamanho do vídeo, centrado, limitado à região)` + `LETTER_BOX` | tamanho vem de `getCurrentStreamInfo` (`Width`/`Height`); sem ele, falha (`false`) |
| `zoom` | `setDisplayRect(região × 1,1, centrado)` + `LETTER_BOX` | **`setVideoRoi` é recusado** (`NotSupportedError: PLAYER_ERROR_FEATURE_NOT_SUPPORTED_ON_DEVICE`); o plano B (retângulo maior que a tela) funciona |

Não medido: se o modo persiste entre `close()`/`open()` e se há piscada ao
aplicar só em `playing` (R-006) — D-004 já cobre o primeiro (aplica sempre);
o segundo fica para a passada final na TV.

## R0-2 — Quais qualidades o stream anuncia e como trocar

**Decisão**: `getQualities()` do AVPlay lê as entradas `VIDEO` de
`getTotalTrackInfo()` (`extra_info` → `Width`, `Height`, `Bit_rate`), uma por
variante. `selectQuality(id)` segue o que o spike provar, nesta ordem de
preferência:

1. `setSelectTrack('VIDEO', index)` durante a reprodução, se o aparelho aceitar
   e a imagem mudar;
2. senão, `setStreamingProperty('ADAPTIVE_INFO', 'FIXED_MAX_RESOLUTION=<W>X<H>')`
   (ou `BITRATES=…`) — documentado para ser chamado **antes** de `prepare`, o
   que obriga a **reabrir por dentro do adaptador**: guardar a posição (VOD),
   `stop`/`close`/`open`/`setStreamingProperty`/`prepareAsync`/`seekTo`/`play`,
   emitindo `buffering` → `playing` para a sessão (a sessão e o `PlayerLayer`
   não sabem que houve reabertura — R-002). Auto (`null`) reabre sem a
   propriedade.

A confirmar no spike: quantas entradas `VIDEO` um HLS multi-variante devolve
(todas ou só a atual?), em que estado, e se um MPEG-TS de canal ao vivo devolve
uma só (esperado — o controle fica "só uma disponível", o caso mais comum em
IPTV, aceito pela spec).

**Justificativa**: FR-005/SC-001 — só o que o stream anuncia; FR-007 — trocar
nunca vira tela de erro (falha = aviso curto, segue na anterior).

**Alternativas consideradas**: reabrir pelo `PlayerLayer` (nova sessão com
`startAtMs`) — rejeitado como caminho principal: dispara `onEnteredPlaying`,
gravador de progresso e reaplicação de faixas de novo, e o zapping/guia
dependem de "sessão nova = item novo". Fica como plano C se o adaptador não
conseguir reabrir sozinho, decidido com o usuário.

## R0-3 — `<video>` de desenvolvimento

**Decisão**: o adaptador `<video>` implementa só o aspecto, por `object-fit`
(`fit` → `contain`, `fill` → `fill`, `original` → `none`, `zoom` → `cover`),
e **não** implementa qualidade (o elemento não expõe variantes) — no PC o
controle aparece "Qualidade — indisponível", honesto.

**Justificativa**: deixa o E2E exercitar o aspecto real num Chromium sem
fingir qualidade; a qualidade é exercitada pelo E2E com um `webapis.avplay`
falso (mesmo padrão de `e2e/audio-legendas-info.mjs`).

## R0-4 — Onde guardar as preferências do aparelho

**Decisão**: `localStorage`, chave `ccplaytv:player-preferences`, JSON com os
quatro campos, validado campo a campo (`data-model.md`).

**Justificativa**: são do aparelho, não da lista (FR-011), pequenas e lidas de
forma síncrona na montagem do player (sem `await` antes da primeira sessão).
Precedente: `motionPreference.ts` (feature 021/026). Nada sensível.

**Alternativas consideradas**: Dexie/IndexedDB — rejeitado: leitura assíncrona
atrasaria a primeira sessão ou exigiria um estado "carregando preferências" no
player, e a tabela teria de sobreviver às limpezas por lista (feature 036).
