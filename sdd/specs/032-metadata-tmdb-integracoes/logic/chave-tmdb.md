# Lógica — chave TMDB (BYOK) e estados (feature 032, US2)

Módulos: `tv-web/src/lib/metadata/tmdbKeyRepository.ts` (porta restrita da
chave), `tmdbConnector.ts` (único lugar que monta requisição ao TMDB).
Contrato: `tmdbKeyRepository.metadata-tmdb.contract.test.ts`.

## 1. Formato (FR-011)

```
k ← trim(raw)
/^[0-9a-f]{32}$/i            → 'v3'   → query ?api_key=k
/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/ → 'v4'  → header Authorization: Bearer k
senão → { ok:false, reason:'invalid_format' }  (nenhuma requisição)
```

## 2. `saveTmdbKey(raw)` (FR-012)

`GET https://api.themoviedb.org/3/authentication` com a chave:

| Resposta | Resultado | Grava? |
| --- | --- | --- |
| 200 `success:true` | `{ok:true, status}` com `state:'connected'`, `lastTestedAt=now` | sim (substitui a anterior) |
| 401 | `{ok:false, reason:'refused'}` | não — a chave anterior (se houver) fica como estava |
| 429 | `{ok:false, reason:'rate_limited'}` | não |
| rede/timeout/5xx | `{ok:false, reason:'offline'}` | não |

## 3. `testTmdbKey()` (botão "Testar")

Mesmo GET com a chave guardada; atualiza `state`/`lastTestedAt` (401 →
`refused`, 429 → `rate_limited` + `pausedUntil`, rede → `offline`, 200 →
`connected` e limpa `pausedUntil`). Não apaga a chave.

## 4. `getTmdbStatus()` (FR-010/FR-013)

Sem linha → `{ state: 'not_configured' }` (objeto exatamente assim).
Com linha → `{ state, format, lastTestedAt, maskedKey }`,
`maskedKey = '••••' + últimos 4`. Nunca o campo `key`.

## 5. `removeTmdbKey()` (FR-014)

Transação: apaga `integrations['tmdb']` e remove `tmdb`/`tmdbFetchedAt` de
toda linha de `titleMetadata`. Em seguida a UI invalida `['title-metadata']`
e `['tmdb-status']`.

## 6. Higiene (FR-013, SC-005)

- A chave só aparece em `tmdbConnector` ao montar a requisição para
  `api.themoviedb.org`. `image.tmdb.org` recebe só o caminho da imagem,
  **sem chave**.
- Erro de `fetch` é convertido em categoria (`refused/offline/rate_limited`)
  sem guardar `message` (a URL v3 carrega `api_key`).
- Nenhum `console.*` com URL do TMDB, chave ou erro cru.
- A chave nunca entra em `SourceView`, `TmdbStatusView`, query key do React
  Query, texto de toast ou `aria-*`.

## 7. Textos de estado (UI)

| Estado | Rótulo no card | Dock |
| --- | --- | --- |
| `not_configured` | Não configurado | "TMDB — não configurado" |
| `connected` | Conectado | "TMDB — conectado" |
| `refused` | Chave recusada pelo TMDB | "TMDB — chave recusada" |
| `offline` | Sem conexão com o TMDB | "TMDB — sem conexão" |
| `rate_limited` | Limite de uso atingido; tentaremos mais tarde | "TMDB — limite de uso" |
