# Sondas da feature 082

As sondas são aplicativos Tizen separados do CCPlayTV. A sonda de cota (`app/`) mede quota, APIs de armazenamento,
erro de quota e o spike descartável de `wgt-private`; a sonda de capacidades (`app2/`) mede ambiente, CPU, gzip,
Worker, IndexedDB, memória, renderização e rede. O coletor (`coletor.mjs`) aceita somente o IP da TV e grava relatórios
sanitizados com números, nomes de API e nomes de erro.

## Regras

- Avise e obtenha autorização antes de instalar qualquer sonda na TV.
- Instale com `instalar-sonda.ps1` usando o id e a pasta de dados da sonda, nunca o pacote CCPlayTV.
- Não copie credenciais, URLs de provedor, nomes de itens ou amostras brutas para evidências.
- Desinstale o app de teste ao terminar (`tizen uninstall -p <id> -t <target>`).
- Nada em `sonda-tv/` entra em `tv-web/` ou no pacote da loja.

## Ensaio no PC

Use o Chromium com uma origem única. Para a lista real, `medir-lista-real.mjs` lê `CCPLAY_PROBE_*` do `.env` sem
imprimir os valores. Para simular a cota, `tv-web/scripts/bench/simular-cota-tv.mjs` usa contexto persistente,
`--disable-features=StaticStorageQuota` e `Storage.overrideQuotaForOrigin` em 80 MiB. O resultado é salvo em
`evidencias/` somente com números.

Uma nova medição deve primeiro ser ensaiada no PC com dados sanitizados e uma função pequena em `app2/tests.js`, depois
instalada na TV somente após nova autorização. Registre o resultado em Markdown na pasta `evidencias/`.

## Memória dos leitores reais (assessment `orcamento-memoria-app-tv`)

`memoria/entrada.ts` importa os leitores reais do app (`loadGlobalSearchIndex`, `loadSearchIndex`, `readKindCursorPage`,
`sortVodItems`, gravador `writeCompressedBlock`) e `memoria/empacotar.mjs` gera `app2/appReal.js` (ignorado pelo git;
gere antes de instalar). `app2/memoria.js` define `memoriaLeitores` (busca global e "Todos" com a lista real e com
~100 mil itens, mais a folga de 2,2 milhões de objetos com a estrutura viva) e `ordenacaoChave` (Collator do app contra
chave pré-calculada). Instale com `-App app2 -AppId ccpSondaV2.Capacidades -Only ordenacaoChave,memoriaLeitores`.

Também em `app2/memoria.js`: `quadrosIndice` mede os quadros enquanto o índice real é montado (assessment
`ajustes-cpu-tv`), e `cargaSecao` roda a carga da seção de filmes no Worker `app2/cargaWorker.js` (gerado de
`memoria/cargaWorker.ts`, com `loadSection` real; assessment `leitura-rede-fluxo-tv`). `cargaSecao` precisa de
`.amostras/vodraw.json`, gerado por `memoria/gerar-vod-bruto.mjs`. Ordem antes de instalar: `gerar-vod-bruto.mjs` →
`empacotar.mjs` → `instalar-sonda.ps1 … -Only quadrosIndice,cargaSecao`.

`etapasSecao` (mesmo arquivo) divide a carga real por seção em etapas (ler, preparo, comprimir, orçamento, transação,
limpar) com a variante `secaoEtapas` do Worker (assessment `gravacao-carga-secao-tv`).
