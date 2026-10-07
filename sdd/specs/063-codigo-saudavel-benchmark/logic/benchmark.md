# Benchmark de importação (US3, item 35)

## 1. Peças

| Peça | Onde | Roda em |
| --- | --- | --- |
| Gerador de fontes | `tv-web/scripts/bench/fixtures.mjs` | Node |
| Servidor das fontes + runner | `tv-web/scripts/bench/run-import-bench.mjs` | Node + Playwright |
| Ajudantes puros do relatório (nome do arquivo, comparação, slug do aparelho) | `tv-web/scripts/bench/report.mjs` | Node |
| Bancada | `tv-web/bench.html` + `tv-web/src/bench/importBench.ts` | navegador, servida pelo `npm run dev` |
| Resultados | `tv-web/bench-results/*.json` (versionados) | — |

`bench.html` fica na raiz de `tv-web/`, ao lado de `index.html`. O Vite serve essa
página em `/bench.html` no dev, mas o build de produção usa só `index.html` como
entrada, então **nada disso entra no `dist/` nem no `.wgt`** (FR-025). T051
confere isso.

Nenhuma linha muda em `importPipeline.ts`, `sectionLoader.ts`, `categoryLoader.ts`,
`epgSync.ts` etc. A bancada só **compõe** as funções públicas que eles já
exportam. Instrumentar o pipeline estouraria o teto de linhas desses arquivos
(US2) e violaria a FR-025.

## 2. Fontes fictícias (`fixtures.mjs`)

- PRNG com semente (ex.: mulberry32). **Nunca** `Math.random`, `Date.now` ou a
  ordem de um `Map` vinda de entrada não determinística.
- `size` é o total de entradas: itens Xtream das três seções, `#EXTINF` do M3U ou
  `<programme>` do XMLTV.
- **Xtream**: 40% ao vivo, 40% filmes, 20% séries (o registro da série, sem
  episódios). Categorias por seção: `max(2, round(itensDaSeção / 500))`.
  `files.auth` é o `user_info`/`server_info` de uma conta ativa com `exp_date`
  bem no futuro. Use como referência o painel falso de
  `e2e/catalogo-em-blocos.mjs`.
- **M3U**: mesmas proporções. `group-title` define a categoria. Filmes e séries
  usam caminhos `/movie/…` e `/series/…`, e séries têm nomes `S01E01`, para a
  classificação real trabalhar. Toda URL usa o host `127.0.0.1`, que nunca é
  resolvido. O contrato proíbe qualquer outro host.
- **XMLTV**: `max(2, round(size / 200))` canais e os programas distribuídos entre
  eles, todos a partir de um instante base fixo. Acrescente `clock` (esse
  instante, em ms) ao objeto da fixture. A bancada usa `clock` como `now` e como
  janela, para que nenhum programa seja filtrado pela janela do `parseXmltv`.
- `expected`: `categories` (categorias, ou canais no XMLTV) e `items` (= `size`).

## 3. Bancada (`src/bench/importBench.ts`)

Ela expõe `window.__importBench.run({ format, size, mode, fixturesUrl, clock })` e
devolve o resultado da combinação (§5). São dois modos, cada um rodado num
contexto de navegador **novo**, com o IndexedDB vazio:

**`mode: 'stages'`**: etapas isoladas, cronometradas com `performance.now()`.

| Formato | obtenção | parse | classificação | gravação |
| --- | --- | --- | --- | --- |
| Xtream | `fetch` das 6 ações → texto | `JSON.parse` | `mapLiveEntry`/`mapVodEntry`/`mapSeriesEntry` (`xtreamConnector.ts`) | fonte fictícia via `createSource`; depois `allocateGeneration` → `storeCategories` → `renewCategoryItems` por categoria → `publishGeneration` |
| M3U | `fetch` → texto | `parseM3uText` | `classifyEntry` por entrada | igual ao Xtream, agrupando por `group-title`: o formato final em blocos |
| XMLTV | `fetch` → texto | `parseXmltv` sobre o texto em pedaços, coletando os programas | — (`null`) | `writeEpgPrograms` numa fonte fictícia |

**`mode: 'real'`**: o caminho que o app usa, medido do início ao fim. Uma fonte
fictícia é cadastrada como o formulário faria.

- Xtream: `startImport(…).completion`, depois `loadSection` de cada seção com
  todas as categorias.
- M3U (URL do `playlist.m3u`): `startImport(…).completion`, depois a obtenção de
  cada categoria pelo mesmo caminho da tela (`ensureCategory`, `categoryLoader.ts`).
- XMLTV: `setEpgManualUrl`, depois `syncEpg(sourceId, { now: () => clock })`.

O uso e a quota de armazenamento (`navigator.storage.estimate()`) são lidos
**antes e depois do modo `real`**, porque é ele que deixa a pegada que o app
deixaria. Se o método não existir ou lançar, grave `"não informado"`, nunca um
número.

A gravação isolada do M3U grava blocos direto. O caminho real do M3U passa por
`storedEntries` (feature 014). Por isso o resultado guarda `stages` e
`realPath` **separados**, e ninguém soma um com o outro (`R-005`).

Falha: capture, grave `{ status: 'failed', failedStage, errorName }` só com o
`name` do erro, nunca a mensagem, e siga para a próxima combinação (FR-023).

## 4. Runner (`run-import-bench.mjs`)

```text
node scripts/bench/run-import-bench.mjs [--formats xtream,m3u,xmltv] [--sizes 1000,10000,100000]
                                        [--seed 1] [--cpu 1] [--device <slug>] [--serve-only]
npm run bench:import -- <mesmas opções>
```

1. Gera as fixtures pedidas e sobe um `http.createServer` em `127.0.0.1`, numa
   porta livre, com `Access-Control-Allow-Origin: *`. Rotas:
   - `/player_api.php?…&action=<a>` → `files[a]`, e sem `action`, `files.auth`;
   - `/playlist.m3u`;
   - `/epg.xml`.
2. Para cada formato × tamanho: um contexto novo para `stages` e outro para `real`,
   `goto(APP_URL + '/bench.html')`, `page.evaluate(run)`. `--cpu N` aplica o
   throttling por CDP, como `e2e/catalogo-em-blocos-real.mjs`. Cada combinação
   tem um timeout de 15 min, e estourá-lo conta como falha registrada (`R-006`).
3. Confere `counts` contra `fixture.expected` e grava `countsMatch` (SC-007).
4. Monta o resultado (§5) e grava
   `bench-results/<AAAA-MM-DD>T<HHmm>-<device>-<commit>.json`.
5. Procura o resultado anterior **do mesmo `device`** e imprime a variação por
   etapa (ms e %). Sai com `0` mesmo se ficou mais lento (FR-022). Só sai com
   código diferente de `0` se o próprio runner quebrar (sem dev server, por
   exemplo).

`device` padrão: `desktop-<platform>-<modelo-da-cpu-em-slug>`. **Nunca**
`os.hostname()` nem o nome de usuário.

**`--serve-only` (TV física, FR-024)**: não abre o Playwright. Sobe o servidor de
fontes na interface da LAN, aceita `POST /result` e imprime a URL a abrir no
navegador da TV:
`http://<ip-do-pc>:5173/bench.html?fixtures=http://<ip-do-pc>:<porta>&auto=1`.
O dev server precisa ser iniciado com `npm run dev -- --host`. Com `auto=1`, a
página roda as combinações em sequência, limpando as fontes fictícias entre uma
e outra (`deleteSource`), e envia o resultado. O runner grava o arquivo com
`device` vindo de `--device` (ex.: `tv-qn50q60d`) e `runtime: 'tv-browser'`.
É o navegador da TV, **não** o runtime do app empacotado (`R-004`).

## 5. Formato do resultado

```json
{
  "schema": 1,
  "date": "2026-10-08T14:03:00.000Z",
  "device": { "slug": "desktop-win32-amd-ryzen-7", "platform": "win32", "cpu": "…", "cores": 16, "memoryGb": 32,
              "browser": "chromium 140.0…", "runtime": "playwright" },
  "commit": "ac649dd", "dirty": false, "appVersion": "1.0.0",
  "seed": 1, "cpuThrottle": 1,
  "results": [
    {
      "format": "m3u", "size": 10000, "status": "ok",
      "stages": { "fetchMs": 12.1, "parseMs": 40.3, "classifyMs": 22.0, "storeMs": 310.5, "totalMs": 384.9 },
      "realPath": { "status": "ok", "totalMs": 1520.2 },
      "storage": { "before": { "usage": 0, "quota": 2.9e11 }, "after": { "usage": 4.1e6, "quota": 2.9e11 } },
      "counts": { "categories": 25, "items": 10000 }, "expected": { "categories": 25, "items": 10000 }, "countsMatch": true
    }
  ]
}
```

O resultado não pode conter URL nenhuma, nem a do servidor local, nem hostname
ou nome de usuário.

## 6. Emenda do execute (2026-10-07)

- Rotas do servidor: cada combinação vive sob `/f/<formato>-<tamanho>/` (`player_api.php`, `playlist.m3u`, `epg.xml`); `GET /plan` (`{ combos, clock }`) e `POST /result` ficam na raiz. A bancada recebe `fixturesUrl` já com esse prefixo; no `?auto=1` ela monta `${fixtures}/f/<formato>-<tamanho>`.
- `counts`: no modo `stages`, `items` é tudo o que foi gravado; no `real`, é canais + filmes + séries. `countsMatch` exige os dois modos que terminaram e compara com `expected`.
- Falha em um modo marca a combinação como `failed` com `failedStage` = `<modo>:<etapa>` e preserva o que o outro modo mediu.
