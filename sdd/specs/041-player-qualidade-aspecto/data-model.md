# Data Model: Qualidade, aspecto e preferências do player

Nenhuma mudança no Dexie (sem versão nova). Uma entrada nova no
`localStorage` e dois tipos em memória.

## Preferências do player (persistida, do aparelho)

`localStorage['ccplaytv:player-preferences']` — JSON:

```json
{ "aspect": "fit", "quality": "auto", "audioLanguage": null, "textLanguage": null }
```

| Campo | Tipo | Valores válidos | Inválido/ausente → |
| --- | --- | --- | --- |
| `aspect` | string | `fit` \| `fill` \| `original` \| `zoom` | `fit` |
| `quality` | string | `auto` \| `max` \| `min` | `auto` |
| `audioLanguage` | string \| null | código já normalizado por `normalizeLanguage` (`pt`, `en`…) ou `null` | `null` (padrão do conteúdo) |
| `textLanguage` | string \| null | idem; `null` = legenda desligada | `null` |

Regras:

- Leitura (`readPlayerPreferences`) valida **campo a campo**: um campo ruim não
  derruba os outros. JSON ilegível, armazenamento bloqueado ou vazio = padrões
  de fábrica. Nunca lança.
- Gravação (`writePlayerPreferences(patch)`) faz merge com o que está gravado e
  devolve o resultado; armazenamento cheio/bloqueado = não persiste, sem erro.
- Só a aba "Player & reprodução" grava. O player **nunca** grava (FR-012,
  SC-003).
- Independe da lista ativa: não tem `sourceId`, não é apagada por excluir uma
  lista nem pela limpeza de histórico (feature 036). Reinstalar o app na TV com
  o mesmo certificado preserva (`tizen-tv`, regra 5).
- Não contém segredo nem URL.

## Escolha da sequência (em memória, nunca persistida)

Já existia (feature 029) para faixas e continua igual:

- `TrackChoice { audioLanguage, textLanguage, subtitleDelayMs }` — **tipo
  inalterado** (contrato travado da 029 o importa; `SeriesDetailScreen` o
  guarda entre episódios).

Nova (esta feature):

- `ViewChoice { aspect: AspectMode; quality: QualityChoice }`, com
  `QualityChoice = 'auto' | 'max' | 'min' | { height: number }`.
  - `'max'`/`'min'` só nascem da preferência; o player grava `{ height }` ou
    `'auto'`.
  - Atravessa a sequência como `TrackChoice`: dentro da mesma montagem do
    `PlayerLayer` (zapping, CH±, ↑/↓, "Próximo episódio") sozinha; entre
    montagens (autoplay da série) por `initialViewChoice`/`onViewChoiceChange`.

Ponto de partida de uma reprodução **nova** (montagem sem `initial*`):

| Escolha | Semente |
| --- | --- |
| `TrackChoice` | `{ audioLanguage: prefs.audioLanguage, textLanguage: prefs.textLanguage, subtitleDelayMs: 0 }` |
| `ViewChoice` | `{ aspect: prefs.aspect, quality: prefs.quality }` |

Com as preferências de fábrica isso é exatamente o `DEFAULT_TRACK_CHOICE` de
hoje (sem preferência de áudio, legenda desligada, atraso 0) — por isso o
comportamento da 029 não muda para quem nunca abriu a aba.

## Opção de qualidade (por sessão)

`QualityOption { id; height; width?; bitrateKbps? }` — `id` vale só dentro da
sessão (índice do motor como string), igual a `MediaTrack.id`. O que atravessa
a sequência é a **altura**, nunca o id (FR-008).
