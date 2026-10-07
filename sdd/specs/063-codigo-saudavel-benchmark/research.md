# Research: 063-codigo-saudavel-benchmark

## 1. Como verificar fronteiras e tamanho como catraca

**Decisão**: escrever um script Node próprio (`tv-web/scripts/architecture.mjs`) que
extrai imports com `ts.preProcessFile` e compara com uma lista de exceções em
JSON. Ele roda depois do `oxlint` em `npm run lint`.

**Justificativa**: o oxlint 1.81 tem `no-restricted-imports` e `max-lines`, mas não
tem lista herdada por par arquivo→destino, teto por arquivo nem aviso de exceção
obsoleta. Seriam centenas de `overrides` à mão, e regenerá-los apagaria a
catraca. O repositório já tem o padrão de script puro com teste no projeto
`node` do vitest (`check-no-demux-in-build.mjs`, `tizenFiles.mjs`).
`preProcessFile` cobre `import type`, `export … from` e `import()` sem regex.

**Alternativas consideradas**:

- Regras do oxlint com `overrides` gerados: sem catraca real nem detecção de
  obsoleto, e um JSON enorme.
- Plugin JS do oxlint: experimental e acopla a feature a uma API instável.
- `dependency-cruiser` ou `eslint-plugin-boundaries`: dependência nova e um
  segundo linter. Nenhum deles tem catraca de tamanho por arquivo.

## 2. Como medir etapas sem instrumentar o app

**Decisão**: usar uma página de bancada só de dev (`tv-web/bench.html` +
`src/bench/importBench.ts`) que compõe as funções públicas reais etapa a etapa,
e medir o caminho real inteiro separadamente.

**Justificativa**: o pipeline real intercala fetch, parse, classificação e
gravação em fluxo (Worker, lotes, área de preparo), então não existe ponto de
corte limpo entre as etapas. Instrumentá-lo violaria a FR-025 e estouraria o
teto de linhas de `importPipeline.ts`/`sectionLoader.ts`, que a US2 congela. A
medição de fora pela UI, como fazem os E2E atuais, só dá o total.

**Alternativas consideradas**:

- Marcas `performance.mark` dentro do pipeline: muda código de produção e esbarra
  na catraca.
- Só o total pela UI: não atende "fetch/parse/classify/store" do item 35.
- Benchmark em Node com `fake-indexeddb`: não mede o IndexedDB real nem a quota
  (pergunta da spec, resposta "navegador").

## 3. Como rodar na TV física

**Decisão**: o modo `--serve-only` do runner serve as fontes na LAN e recebe o
resultado por `POST`. A pessoa abre `bench.html` no navegador da TV, a partir do
`npm run dev -- --host`. O resultado é marcado com `runtime: 'tv-browser'`.

**Justificativa**: o Playwright não controla a TV, e empacotar a bancada no
`.wgt` violaria a FR-025 (nada do benchmark em produção). O navegador da TV usa a
mesma família de engine e mede o IndexedDB e a quota reais do aparelho, que é o
dado que reabriria o item 51.

**Alternativas consideradas**:

- Um segundo `.wgt` só de benchmark: um projeto Tizen e uma assinatura a mais
  para manter.
- Web Inspector remoto no app instalado: exige o app com a bancada dentro, o
  mesmo problema da FR-025.

**Limite assumido**: o navegador da TV não é o runtime `file://` do app
empacotado (`R-004`). O resultado diz isso, e não é gate.
