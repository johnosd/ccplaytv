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

## Séries e canais, e o `loadSection` real com tempos (feature 085)

`memoria/gerar-vod-bruto.mjs` agora gera também `.amostras/seriesraw.json` (`get_series`, 9 768 séries em 28 categorias) e
`.amostras/liveraw.json` (`get_live_streams`, 2 355 canais em 42), nos tamanhos de `evidencias/medicao-lista-real-pc-2026-10-18.json`
(o texto fica menor que o do painel real, que traz campos que o app ignora). O Worker `cargaWorker.ts` recebe a seção
(`section: 'movie' | 'series' | 'channel'`) e `etapasSecao` roda as três, 2 rodadas cada, com três variantes:

- `secaoAtual`: o `loadSection` real; `ms` é o tempo total que o critério da 085 compara com a linha de base;
- `secaoEtapas`: a sequência de antes da 085 reimplementada por etapas (descarrega a cada 20 mil itens, orçamento por categoria);
- `secaoReal`: o `loadSection` com `onTimings` (etapas do código atual: `readMs`, `encodeMs`, `budgetMs`, `commitMs`, `stageClearMs`…).

Linha de base: empacote a sonda sobre o código anterior (um `git worktree` do commit antes da 085) e instale só `etapasSecao`.

## Medir o app real (feature 085)

O build de medição do app também manda números ao coletor, sem passar pela sonda. Veja a skill `tizen-sonda` (modo C):

```powershell
node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv> 8770 --app-saida <arquivo>.jsonl
$env:VITE_CCPLAY_PERF = "1"; $env:VITE_CCPLAY_METRICS_REPORT = "http://<ip-do-pc>:8770/app-metrics"; npm run build:tizen   # em tv-web/
```

O coletor aceita `POST /app-metrics` com `{ schema: 'ccplay-app-metrics/1', sentAt, lines }` e grava uma linha por métrica
(`source`: `section-load`, `entry`, `assembly`, `frames`). Só números e rótulos fixos; para ensaiar no PC use `127.0.0.1` como IP.
Terminado, reinstale o pacote normal (sem as variáveis), avisando o usuário.

