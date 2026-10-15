# Lógica — erros acionáveis e diagnóstico (feature 042)

Origem: spec FR-011..FR-016, FR-018/FR-019, DS V14 §45.

## 1. Tabela única de códigos (D-001)

Módulo novo `lib/errors/errorCatalog.ts`: `describeError(code) → { title, description, primaryAction, retryable }`. **Pura**, sem React. Cada tela monta o seu `ErrorState`/painel com isso.

| Código | Situação | Mensagem (título) | Ação primária |
| --- | --- | --- | --- |
| `NET-01` | sem conexão | Sem internet | Tentar de novo |
| `NET-02` | painel/servidor não respondeu (com rede) | O servidor não respondeu | Tentar de novo |
| `SRC-401` | credencial recusada | Credencial inválida | Editar lista |
| `SRC-402` | conta expirada | Conta expirada | Editar lista |
| `SRC-409` | item sem fonte de reprodução | Este item não tem fonte | Voltar |
| `SRC-422` | resposta incompatível | O servidor respondeu de um jeito que o app não entende | Editar lista |
| `SRC-001` | endereço inválido (formulário) | Endereço inválido | (corrigir o campo) |
| `API-401` | chave de serviço recusada (TMDB) | Chave recusada | Editar chave |
| `API-429` | limite de uso | Serviço temporariamente limitado | Tentar mais tarde |
| `PLAY-01` | stream: rede | Não foi possível carregar o stream | Tentar de novo |
| `PLAY-02` | stream: formato/codec | Formato não suportado neste aparelho | Info técnica |
| `PLAY-03` | stream: fonte indisponível/expirada | A fonte deste item não responde | Editar lista |
| `PLAY-04` | stream: causa desconhecida | Stream indisponível | Tentar de novo |

**Códigos que já existem ficam exatamente como estão** (testes e contratos de outras features os citam): `EPG-02` (`lib/epg/epgStatus.ts`), `STO-01` (`ProfilesScreen`), `TRL-REDE`/`TRL-TEMPO`/`TRL-PONTE` e `YT-<n>` (`lib/trailer/trailerSession.ts`). O catálogo os **registra** (`describeError` os conhece; um teste garante que cada código listado tem entrada) mas não os renomeia. **O rótulo do botão continua "Tentar de novo"** (33 arquivos de teste/código o usam; "Tentar novamente" da spec é o nome do DS).

## 2. `diagnosePlayback(input)` (D-002, D-012)

Entrada/saída em `lib/player/playbackDiagnosis.ts` (stub criado). Regras, **em ordem**, primeira que casa vence:

1. `sourceAccess === 'refused'` → `SRC-401`, `source`, ações `['edit-credentials','info']`.
2. `sourceAccess === 'expired'` → `SRC-402`, `source`, `['edit-credentials','info']`.
3. `!online` → `NET-01`, `network`, `['retry']`, `autoReconnect: false`.
4. Nome de erro **da lista branca** (const em `playbackDiagnosis.ts`, fonte: referência Samsung `AVPlay` — ver R-001):
   - rede: `PLAYER_ERROR_CONNECTION_FAILED` e equivalentes de rede/timeout → `PLAY-01`, `network`, `['retry','info']`, `autoReconnect: true`.
   - formato: `PLAYER_ERROR_NOT_SUPPORTED_FILE`, `…_FORMAT`, `…_VIDEO_CODEC`, `…_AUDIO_CODEC`, `PLAYER_ERROR_INVALID_URI` → `PLAY-02`, `format`, `['info']`, `autoReconnect: false`.
   - fonte: `…AUTHENTICATION_FAILED`, `…STREAM_NOT_FOUND` → `PLAY-03`, `source`, `['edit-credentials','info']`.
5. `stream_completed` (canal ao vivo que "terminou": `PlayerService.applyCompleted`) → tratado como rede: `PLAY-01`, reconecta.
6. Qualquer outra coisa (inclusive `code: null`, string desconhecida, **ou qualquer string que pareça URL**) → `PLAY-04`, `unknown`, `['retry','info']`, `autoReconnect: true`.

`message` vem **sempre** de `describeError`, nunca de `error.message`/`error.code`. `technical = { code, category, mediaKind, engine, at }` — cinco campos fixos. O código cru do motor **nunca** é exibido (nem na Info técnica): a categoria + o código da tabela bastam. Um teste varre o JSON do resultado atrás de `usuario|senha|http|token` (contrato 2).

`sourceAccess` vem do estado da conta da feature 034: o `PlayerLayer` o resolve **uma vez por falha** lendo o registro da lista (`source_id` do `fetchPlayback`) — leitura local, sem rede. Se a leitura falhar, `null`.

### Mensagens de props preservadas

`PlayerLayer` hoje recebe `genericErrorMessage` ("…este canal"/"…este filme") e `unavailableMessage` (409). Elas **continuam** sendo o texto da categoria `unknown` e do 409 (testes de Live/Filmes/Séries as afirmam). O diagnóstico acrescenta o **código** e a **ação**; só as categorias conhecidas (`network`, `format`, `source`) usam o texto do catálogo.

## 3. Tela de erro do player (US2)

`PlayerLayer` hoje: `.player-message` com "Tentar de novo" e "Voltar". Passa a:

- título (o do item), descrição (§2), **código discreto** (`.error-state-code`, mesmo estilo), ações = `diagnosis.actions` mapeadas para botões (a regra dos "no máximo 3" da spec vale para estas — Tentar de novo / Info técnica / Editar lista), **mais** "Voltar", que é a saída permanente do player (RETURN faz o mesmo) e não conta como ação do diagnóstico. O `ErrorState` da biblioteca (1–2 ações) **não** é reaproveitado aqui: a tela do player tem o próprio markup (`.player-message`) e é preciso manter o `.player-action`.
- Foco por estado (`errorFocus`, ADR-009) deixa de ser `0 | 1` e passa a índice sobre a lista de ações; ←/→ movem; OK ativa. A primeira ação é a primária e começa focada.
- `edit-credentials` chama um callback novo opcional `onEditSource?: (sourceId: string) => void` de `PlayerLayerProps` (a tela decide: abrir "Editar lista"); sem o callback a ação não aparece (nunca botão sem efeito).
- `info` abre o painel "Info técnica" (`PlayerErrorInfoPanel`, mesmo estilo dos painéis da 029, estado do próprio `PlayerLayer` — **não** `Modal`, que não receberia tecla). Mostra os 5 campos de `technical` com rótulos. RETURN fecha o painel e devolve o foco à ação de origem; um segundo RETURN fecha o player.
- RETURN na tela de erro fecha o player (inalterado).
- `role="dialog"` com `aria-label="Erro de reprodução"` (inalterado); o código aparece no nome acessível ("… código PLAY-01").

## 4. Migração por ondas (FR-015)

Cada tela troca texto/ação por `describeError`; **comportamento de foco não muda**, só ganha o código.

- **P1** (US2): `PlayerLayer`, `usePlayerSession` (`applyFetchError` distingue 409 → `SRC-409` de rede → `NET-xx`/`PLAY-xx`).
- **P2** (US3): `categoryLoader`/`useLiveCatalog`/`liveColumns.tsx`/`VodCatalogScreen.tsx` (erro de carga de categoria: `NET-01`/`NET-02`/`API-429`/`SRC-401`/`SRC-402` pela `ProviderError.kind`), `SourcesTab`/`SourceAccessGate` (`SRC-401`/`SRC-402`), `epgStatus` (já `EPG-02`; só entra na tabela), `IntegrationsTab`/`TmdbKeyScreen` (`API-401`/`API-429`, sem toast por detalhe — comportamento da 032), `TrailerLayer` (códigos existentes entram na tabela).
- **P3** (US4): `AddSourceScreen` (4 erros do formulário: `SRC-001`, `NET-02`, `SRC-401`, `SRC-422`; o IME fica no item 18), `useFavoriteToggle`, `HistoryRemovalModal`, `PersonScreen`, `SimilarPanel`, `SeriesDetailScreen`, `useLiveZapping`/`useLiveKeyboard`.

Mapeamento `ProviderFailureKind` → código: `invalid_credentials`→`SRC-401`; `subscription_expired`→`SRC-402`; `direct_connection_refused`/`network_failure`→`NET-02` (ou `NET-01` se `!navigator.onLine`); `rate_limited`→`API-429`; `ProviderIncompatibleError`→`SRC-422`; `StorageFullError`→`STO-01`.

## 5. Proibido

- Qualquer string vinda de `Error.message`, `error.code` do motor, URL ou resposta do servidor na tela, no `aria-*`, em log ou no Info técnica.
- Ação sem efeito. Mais de 3 ações. Retentativa automática fora de §3 de `rede-e-lifecycle.md`.
- Renomear um código existente (§1).
