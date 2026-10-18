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
