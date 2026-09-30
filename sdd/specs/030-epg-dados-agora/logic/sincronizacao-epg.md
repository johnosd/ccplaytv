# Lógica — sincronização de EPG

Arquivos: `lib/epg/epgSync.ts` (stub; contrato `epgSync.epg-dados-agora.contract.test.ts`),
`lib/epg/epgFetch.ts` (novo), `lib/epg/epgWorker.ts` + `lib/epg/epgRunner.ts` (novos).

## 1. `resolveEpgUrl(record, credential)` — FR-001

```text
if record.epgManualUrl → { url: manual, origin: 'manual' }
if credential (readCredential: provedor, ou m3uUrl com formato de painel)
   → { url: `${dns}/xmltv.php?${URLSearchParams({ username, password })}`, origin: 'panel' }
if record.epgDeclaredUrl → { url: declared, origin: 'playlist' }
else undefined  → outcome 'skipped'
```

A URL resolvida nunca sai desta função para log/erro/tela.

## 2. `syncEpg(sourceId, options)`

```text
record = sources.get(id);  if !record or record.epgDisabled → skipped
target = resolveEpgUrl(...); if !target → skipped
syncAt = now(); offset = record.epgOffsetHours ?? 0
window = { from: syncAt − 12h − |offset|h, to: syncAt + 48h + |offset|h }
try:
  response = await fetchImpl(target.url, { signal })
      catch → throw EpgFailure('network')        # nunca repassar error.message
  401/403 → EpgFailure('refused'); !ok/!body → EpgFailure('network')
  chunks = textChunks(response.body)            # epgFetch.ts: gzip por magic, TextDecoder stream
  programs = parseXmltv(chunks, window)
  sawRoot? → se o fluxo terminou sem nenhum '<tv' → EpgFailure('not_xmltv')
  { programCount } = await writeEpgPrograms(id, programs, database)
  # fonte removida/desativada durante a execução (FR-011):
  fresh = sources.get(id); if !fresh or fresh.epgDisabled → deleteEpgForSource(id); return skipped
  sources.update(id, { epgLastSyncAt: syncAt, epgLastErrorKind: undefined, epgLastErrorAt: undefined })
  return { outcome: 'synced', programCount }
catch e:
  kind = e instanceof EpgFailure ? e.kind
       : isQuotaError(e) ? 'storage_full'
       : e is AbortError ? rethrow
       : 'unreadable'
  sources.update(id, { epgLastErrorKind: kind, epgLastErrorAt: now() })   # se a fonte ainda existir
  return { outcome: 'failed', errorKind: kind }
```

- **Nada de `logger.warn(error)` com o erro cru**: o `sanitize` do logger só
  cobre `username=`/`password=` e caminhos Xtream; uma URL manual com token em
  outro formato vazaria. Se precisar logar, só `kind`.
- `not_xmltv`: detectar cedo — o primeiro pedaço não-branco (após BOM e
  `<?xml …?>`/`<!DOCTYPE …>`/comentários) precisa conter `<tv`; um HTML de
  erro do painel cai aqui sem gravar nada.
- `writeEpgPrograms` consome o gerador em lotes (data-model §2): memória
  limitada a um lote.

## 3. `epgFetch.ts` — `textChunks(body)`

```text
reader = body.getReader(); first = await reader.read()
stream = new ReadableStream que reemite `first.value` e depois o resto
if first.value[0]==0x1f && first.value[1]==0x8b: stream = stream.pipeThrough(new DecompressionStream('gzip'))
for await bytes → decoder.decode(bytes, { stream: true }) → yield string
finally reader.cancel()  # mesmo cuidado do linesFromResponse (m3uParser.ts)
```

## 4. Executor (thread principal) — `epgRunner.ts`

```ts
requestEpgSync(sourceId: string): Promise<SyncEpgResult>   // single-flight por fonte (FR-010)
isEpgSyncing(sourceId): boolean
subscribeEpgSyncing(listener): () => void                   // para useSyncExternalStore
onEpgSyncFinished(listener: (sourceId, result) => void)     // App invalida ['epg'] e ['sources']
```

Worker (`epgWorker.ts`): recebe `{ type: 'sync', sourceId }`, chama
`syncEpg`, responde `{ type: 'done', result }` ou `{ type: 'error', name }`
(só o nome — igual `importWorker.ts`). `onerror` antes de começar → roda
`syncEpg` na thread principal (plano B, R-002 da 005). Um Worker por
sincronização, encerrado ao terminar.

`new Worker(new URL('./epgWorker.ts', import.meta.url), { type: 'module' })`
emite `assets/epgWorker.js` → **adicionar a `CCPlayTv/tizen_web_project.yaml`**
(o guard `findUnlistedFiles` recusa o `build:tizen` se faltar). Se o Vite
emitir um chunk compartilhado extra para o Worker, listar também.

## 5. Gatilhos (D-008) — sempre `requestEpgSync`, nunca no foco

| Quando | Onde | Regra |
| --- | --- | --- |
| Importação/ressincronização concluída (`status === 'completed'`) | `importApi.ts` `startLocalImport` → `completion.then` | sempre (a URL declarada pode ter mudado) |
| Abrir a fonte (escolher lista) | `importApi.ts` `useOpenSource`, quando **não** disparou importação | `epgLastSyncAt` ausente ou mais velho que 12 h (`EPG_STALE_AFTER_MS`), e `epgDisabled` falso |
| "Sincronizar agora" / "Tentar novamente" | `EpgSettingsScreen` | sempre |
| Salvar endereço manual, limpar endereço manual, "Ativar EPG" | `EpgSettingsScreen` | sempre |

Mudar só o deslocamento **não** sincroniza (FR-020) — só invalida `['epg']`.

## 6. Desativar / apagar

- "Desativar EPG" (após `Modal`): `sources.update({ epgDisabled: true })` →
  `deleteEpgForSource` → invalida `['epg']`. Uma sincronização em voo termina
  e descarta (§2, FR-011).
- `deleteSource` chama `deleteEpgForSource` antes de apagar a fonte (FR-012).
