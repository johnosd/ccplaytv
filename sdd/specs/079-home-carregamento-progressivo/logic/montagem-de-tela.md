# Lógica: montagem de tela antes de aparecer

Vale para Home, Filmes e Séries. Código: `tv-web/src/lib/assembly/screenAssembly.ts` (regra pura) e
`useScreenAssembly.ts` (tempo, capas, render). Contratos: `screenAssembly.home-carregamento-progressivo.contract.test.ts`
e `useScreenAssembly.home-carregamento-progressivo.contract.test.tsx`.

## 1. Entradas

Cada tela descreve suas leituras como **slots**, na ordem da tela, de cima para baixo:

| Campo | Significado |
| --- | --- |
| `status` | `pending` (sem dado e sem erro), `ready`, `empty`, `failed` (`failed` se comporta como `empty`) |
| `primary` | leitura principal: resolvida já no 1º render = caminho do cache |
| `anchor` | ocupa a posição mesmo sem dado (billboard da Home) |
| `required` | sem ela resolvida nem o teto revela (lista de categorias de Filmes/Séries) |

Mais: `imagesSettled` (capas da primeira tela carregadas ou com falha, e nada extra pendente), `capPassed`
(2 s desde a montagem), `following` (janela de uma ação da pessoa), `firstRender`.

`slotStatusOf(query, isEmpty)`: `data === undefined` → `isError ? 'failed' : 'pending'`; senão `isEmpty(data) ? 'empty' : 'ready'`.
Funciona com React Query e com os mocks dos testes (que nem sempre têm `isPending`). Consulta desabilitada (ex.: esperando o
status do TMDB) conta como `pending` — o teto a resolve.

## 2. Transições (`stepAssembly`)

Fase `waiting`:

1. **Cache**: `firstRender` e existe slot `primary` e todos os `primary` estão resolvidos → `revealed`, `reason: 'cache'`,
   `shown` = slots `ready` na ordem. Não espera capas nem os não-primários.
2. **Pronta**: todos os slots resolvidos e `imagesSettled` → `revealed`, `reason: 'ready'`.
3. **Teto**: `capPassed` e todos os `required` resolvidos → `revealed`, `reason: 'cap'`, `shown` = `ready` na ordem.
4. Senão continua `waiting` com `shown = []`.

Fase `revealed`:

5. `following` **ou** `!capPassed` → `shown` = todos os `ready` na ordem (inclusive os adiados); `deferred = []`.
   (`!capPassed` depois de revelado só acontece no caminho do cache: leituras locais que terminam em milissegundos se
   encaixam.)
6. Senão:
   - tira de `shown` e de `deferred` o que deixou de ser `ready`;
   - para cada slot `ready` fora de `shown` e de `deferred`, **em ordem crescente de posição**: `limite` = maior posição
     entre os de `shown` e os `anchor`; se `posição > limite` → entra em `shown` (na ordem); senão → `deferred`.
7. `deferred` só sai por `following` ou por nova montagem da tela (estado novo).

Exemplo (Home, abertura fria, hero lento): `r1` pronto, teto vence → `shown [r1]`; hero chega → posição 0 ≤ âncora 0 →
`deferred [hero]`, o billboard fica no modo neutro; `r2` chega → posição 2 > 1 → `shown [r1, r2]`; a pessoa fecha o
player → `following` → `shown [hero, r1, r2]`.

## 3. Hook (`useScreenAssembly`)

- Decide **no render** (estado guardado num `useRef`/`useState` atualizado durante o render, como o `rowsReady` atual de
  `VodShowcaseScreen`) — nunca num `useEffect`, senão o caminho do cache pinta um quadro vazio e os contratos síncronos
  das features 026/052/056/057 quebram.
- Temporizadores contados da montagem: `LOADING_DELAY_MS` (300) liga `showLoading` se ainda `waiting`;
  `ASSEMBLY_CAP_MS` (2000) liga `capPassed`. Revelado, `showLoading` é `false`.
- Capas: para cada URL nova de `imageUrls` enquanto `waiting`, chama `loadImage(url)` uma vez; `imagesSettled` =
  `!extraPending` e (todas as URLs atuais terminadas **ou** `LOADING_DELAY_MS` passou). Emenda de 2026-10-16 (R-008): as
  capas só seguram a tela pela mesma janela do "Carregando" — ele nunca aparece só por causa de imagem; depois as capas
  chegam dentro dos cards. Carregador padrão: `new Image()`, `src = url`, `decode()` (sucesso ou falha
  terminam); sem `decode` (jsdom) termina na hora. Nunca usa `fetch`, nunca loga a URL.
- `follow()`: liga `following` por `ASSEMBLY_CAP_MS`.
- Na revelação, registra a medição (`lib/perf/assemblyTiming.ts`): tela, ms desde a montagem, `reason`, número de slots
  adiados depois; só números e chaves de slot.

## 4. Slots por tela

| Tela | Slots (ordem) | `primary` | `anchor` | `required` |
| --- | --- | --- | --- | --- |
| Home | `hero`, `channels`, `continue`, `mylist`, `added-movies`, `added-series` | `hero` | `hero` | — |
| Filmes/Séries | `continue`, `top10`, `favorites`, `added`, `rated`, `tip`, `because`, `categories` | `categories`, `continue`, `favorites`, `added` | — | `categories` |

- Filmes/Séries: `extraPending = backdropsPending(backdrops)` (formato largo do "Continue"); `categories` cobre a lista
  lateral e todos os carrosséis de categoria; as prévias dos carrosséis **não** entram na espera.
- Home: o adiamento de "adicionados" por `HOME_DEFERRED_MS` sai (as leituras entram na espera); o resumo de séries em dia
  (só selo) continua adiado.

## 5. Capas da primeira tela

- Home (billboard expandido, fileiras espiando embaixo): a primeira fileira `ready`, os primeiros
  `ceil(1920 / itemWidth)` cards, com a mesma face que o card desenha (`continue`: imagem 16:9 → `icon_url`; demais:
  `icon_url`). O fundo do billboard não entra.
- Filmes/Séries: as fileiras não-categoria `ready`, na ordem, enquanto a soma de `rowHeight` couber na altura da área de
  fileiras (1080 − topbar); por fileira, os primeiros `ceil(largura / itemWidth)` cards (`wide`: backdrop; demais:
  `icon_url`).
- URL ausente não entra na lista.

## 6. Render por fase

- `waiting` e `!showLoading`: a moldura da tela (topbar quando houver) e a raiz do conteúdo (`.home-content` /
  `.vod-screen`) sem nada dentro; teclas: ↑ vai à topbar, RETURN volta.
- `waiting` e `showLoading`: `Spinner` + `EmptyState` com `common.loading`/rótulo da seção e "Voltar" focado (o padrão
  atual de Filmes/Séries).
- `revealed`: a tela com só os slots de `shown`. Home sem `hero` em `shown` → billboard neutro (atalhos TV ao vivo/Filmes
  com título neutro, nunca o texto de boas-vindas).
- Foco na revelação: o inicial da tela, salvo se a pessoa foi à topbar durante a espera.

## 7. Proibições

- Não desenhar billboard, boas-vindas, fileira ou skeleton antes de revelar.
- Não decidir a revelação num efeito.
- Não esperar prévias de categoria nem o backdrop do billboard.
- Não carregar o catálogo inteiro; não iniciar consulta externa ao focar.
- Não registrar URL, título ou objeto de catálogo na medição.
