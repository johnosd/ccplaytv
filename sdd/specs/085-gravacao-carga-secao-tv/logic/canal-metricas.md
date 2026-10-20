# Canal de métricas do app real (085, US3)

Stub: `tv-web/src/lib/perf/metricsChannel.ts`. Contrato: `metricsChannel.gravacao-carga-secao.contract.test.ts`.

## 1. Ligado só no build de medição

- A variável é `VITE_CCPLAY_METRICS_REPORT` (por exemplo, `http://192.168.0.10:8770/app-metrics`). Sem ela, `emitMetric` é
  um no-op.
- A checagem é feita **direto em `import.meta.env.VITE_CCPLAY_METRICS_REPORT`**, dentro de `emitMetric`, para o Vite
  trocar por `undefined` e o minificador apagar o resto. Nada de ler o valor por uma variável intermediária exportada nem
  por função de outro módulo. Prova de SC-007: o pacote do build normal (`tv-web/dist/**/*.js`) não contém a string
  `ccplay-app-metrics`.
- **Sem `import()` dinâmico.** Um chunk novo só no build de medição faria `sync-tizen.mjs` recusar o sync, porque o
  arquivo não estaria em `tizen_web_project.yaml`. O módulo é importado de forma estática.
- O canal padrão é criado na 1ª emissão (preguiçoso), com `createMetricsChannel({ destination: import.meta.env.… })`.
- `metricsDestination` segue `platformProbeDestination` (`lib/portal/platformProbe.ts:86`): aceita só `http:` em
  `localhost`, `127.0.0.1` ou `192.168.x.y`, com caminho exatamente `/app-metrics` e sem usuário, senha, query ou hash.
  Qualquer outro destino vale como "sem destino", e nada é enviado.

## 2. Saneamento (`sanitizeMetricLine`)

```
sanitize(line):
  if line.source ∉ SOURCES → null                       # SOURCES = section-load | entry | frames | assembly
  out = { source }
  for (key, value) in line, key ≠ 'source':
    if key não casa /^[a-z][A-Za-z0-9]{0,39}$/ → descarta
    if typeof value == 'number' and Number.isFinite(value) → out[key] = value
    elif typeof value == 'string' and value ∈ LABELS → out[key] = value
    else → descarta  (string fora da lista, objeto, array, boolean, NaN, ±Infinity, undefined)
  return out
```

- `LABELS` é uma lista fixa no código: os `CategoryKind`/`CatalogItemKind` (`channel`, `movie`, `series`, `episode`), os
  `SectionLoadOutcome` (`done`, `failed`, `storage_full`, `rate_limited`) e os rótulos fixos que os emissores do painel
  usam (nomes de tela de `recordAssembly` e `reason`, só se forem literais do código; confira em
  `lib/perf/assemblyTiming.ts` e nos chamadores). **Nunca** entra nessa lista um valor que venha do provedor ou da
  pessoa.
- Para saber se um valor pode entrar, basta perguntar se ele poderia ter vindo da lista IPTV. Se sim, fica fora.

## 3. Fila e envio (`createMetricsChannel`)

- `emit` saneia. Linha `null` é ignorada. A fila tem no máximo `maxQueue` linhas (padrão 200): ao passar disso, **descarta
  a mais antiga**. `emit` agenda um `flush` com `setTimeout` (~2 s, juntando várias linhas) e nunca espera a rede.
- `flush`: sem destino válido, **esvazia a fila sem chamar `fetch`**. Com destino, tira o lote da fila e faz um
  `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema:
  METRICS_SCHEMA, sentAt: Date.now(), lines }), signal: AbortSignal.timeout(5000) })`, dentro de `.catch(() => {})`. O lote
  que falhou **não volta para a fila**. `flush` sempre resolve.
- Funciona na thread da interface. A carga por seção roda no Worker e entrega os números à thread da interface pela
  mensagem `done` (§4), e é lá que eles são emitidos. Assim só existe um canal e uma fila.

## 4. Emissores (FR-011)

| `source` | Onde emitir | Campos |
| --- | --- | --- |
| `section-load` | `sectionRunner.ts`: no `done` do Worker (`SectionWorkerResponse` ganha `timings`) e no `runOnMainThread` | `kind`, `outcome` e os números de `SectionLoadTimings` |
| `entry` | `entryTiming.ts`, onde o relatório é publicado (`firstPaint` / `reportBackgroundRead`) | `kind`, `items`, uma chave `<fase>Ms` por fase |
| `assembly` | `assemblyTiming.ts` `recordAssembly` | `screen` (só se for rótulo da lista), `revealMs`, `pending` e `deferred` como **contagem**, `imagesRequested`, `imagesSettled` |
| `frames` | `PerfOverlay.tsx`, a cada ~5 s | `slow`, `idleSlow`, e de `ActiveFrameStats` os números (`fps`, pior quadro, quadros > 50 ms) |

`SectionLoadTimings` (exportado de `sectionLoader.ts` e entregue pela opção `onTimings`, **não** pelo retorno, para não
quebrar os `toEqual` de `sectionLoader.test.ts`):

```ts
interface SectionLoadTimings {
  items: number; categories: number; written: number
  readMs: number          // fetch + ler + interpretar (inclui descarregar no preparo, se houver)
  stageWriteMs: number    // descarregar no preparo (0 abaixo do limite)
  stageReadMs: number     // reler o preparo
  stageClearMs: number    // limpar o preparo (início + fim)
  encodeMs: number        // preparar + comprimir: do início de renewCategoryItems até o callback `room`
  budgetMs: number        // dentro do callback `room` (makeRoomFor)
  budgetCalls: number
  commitMs: number        // do fim do `room` até renewCategoryItems voltar (transação)
  gateWaitMs: number      // esperando waitUntilAllowed (não é desperdício; separa o app real da sonda)
  totalMs: number
}
```

Categoria `unchanged` não chama `room`: o tempo dela todo entra em `encodeMs`. O relógio é injetável (`clock?: () =>
number`, padrão `performance.now`) para teste.
