# Data Model — 090 legendas externas

## §1 TV: tabela `externalSubtitles` (IndexedDB, Dexie)

Declarada em `tv-web/src/lib/catalog/dbSchema.ts` como `db.version(27).stores({ externalSubtitles: '[stableId+language],
stableId, sourceId, lastUsedAt' })`, sem `.upgrade()` (tabela nova). Acesso tipado em
`tv-web/src/lib/subtitles/subtitleTables.ts`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `stableId` | string (chave composta com `language`; índice) | Identidade lógica do item (`buildStableId`) — **nunca** URL (constitution). |
| `sourceId` | string (índice) | Apagado com a lista (`deleteSource`, FR-021). |
| `language` | `'pt-BR' \| 'en' \| 'es'` | Parte da chave: uma legenda por idioma por item (até três). Nova versão no mesmo idioma substitui. |
| `resultId` | string | `SubtitleResult.id` de onde veio (`os:…`/`sd:…`, inclui o fornecedor); nunca URL. Não é baixado de novo sozinho. |
| `release` | string | Nome da versão, como veio (≤ 200). |
| `delayMs` | number | Ajuste desta legenda: −10 000…+10 000, múltiplo de 500 (negativo adianta, positivo atrasa). Valor fora disso ao ler → grampeado. |
| `active` | boolean | No máximo **uma** linha ativa por `stableId` (ativar uma desativa as outras na mesma transação). Todas `false` = legenda externa desligada; os arquivos ficam para reativar sem rede. |
| `bytes` | `Uint8Array` | Texto do arquivo comprimido (`gzipText`). |
| `size` | number | `bytes.byteLength` — soma limitada a `EXTERNAL_SUBTITLES_CAP_BYTES` (2 MiB). |
| `savedAt` | number | epoch ms do download. |
| `lastUsedAt` | number (índice) | epoch ms da última aplicação/restauração; despejo do mais antigo. |

Até três linhas por item (uma por idioma). O despejo do teto é por linha (a menos usada sai primeiro; nunca a ativa
do item que está tocando). Não entra no backup de uso (072) nem em exportação.

## §1b TV: tabela `subtitleCredentials` (P3, BYOK)

Também em `dbSchema.ts` `version(27)`: `subtitleCredentials: 'provider'`. Acesso em
`tv-web/src/lib/subtitles/subtitleCredentials.ts`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `provider` | `'opensubtitles' \| 'subdl'` (chave) | Uma chave pessoal por fornecedor. |
| `key` | string | A chave **da pessoa** (exceção (l)); nunca em log, erro, tela depois de digitada, serviço do ccplayTv, portal, backup ou exportação. |
| `state` | `'valid' \| 'rejected' \| 'rate_limited'` | Resultado do último teste/uso. |
| `lastTestedAt` | number | epoch ms. |
| `chosen` | boolean | `true` = usar a chave da pessoa para este fornecedor; "Usar o padrão do ccplayTv" põe `false` (sem apagar a chave). |

Não depende de lista: fica fora de `sourceDeletionTables`. Fora do backup 072 (que só lê `integrations.get('tmdb')`).

## §2 TV: memória da sequência (só em memória)

`Map<"sourceId|seriesId", SubtitleLanguage>` no módulo do hook (`logic §5.5`). Some ao fechar o app; nunca persiste.

## §3 Serviço: configuração (`PortalSettings`)

| Campo | Env (prefixo existente `CCPLAY_PORTAL_`) | Padrão | Nota |
| --- | --- | --- | --- |
| `opensubtitles_api_key` | `OPENSUBTITLES_API_KEY` | `None` | `SecretStr`; ausente = fornecedor desligado. Não exigida por `production_env.py` enquanto o G-1 não fechar. |
| `subdl_api_key` | `SUBDL_API_KEY` | `None` | Idem, para o SubDL. Os dois ausentes = recurso indisponível (503). |
| `subtitles_downloads_per_day` | `SUBTITLES_DOWNLOADS_PER_DAY` | `10` | Provisório (G-1), soma dos dois fornecedores. 1–10 000. |
| `subtitles_searches_per_hour` | `SUBTITLES_SEARCHES_PER_HOUR` | `60` | Provisório (G-1). 1–10 000. |

## §4 Serviço: contadores

Documentos `rateLimits/<hash>` já existentes (`SharedRateLimiter`), chaves `subtitles-search/<device_id>` e
`subtitles-download/<device_id>` digeridas com `auth.tokens.digest("rate_limit", …)`. Guardam só contagem e janela —
**nunca** o termo pesquisado, o ID da obra ou o idioma (Key Entity "Uso diário da TV" da spec). TTL de 1 dia já
existente.
