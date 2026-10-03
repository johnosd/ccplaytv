# Linha de base do build (T001, 2026-10-02)

`npm run build` em `tv-web/` **antes** de qualquer mudança de produção da feature 047 (só os stubs do `sdd-plan` já estavam na árvore: tipos e um parâmetro de opção ainda ignorado). Resultado: exit 0.

Arquivos emitidos em `tv-web/dist/` (caminho, bytes):

| Arquivo | Bytes |
| --- | --- |
| `assets/epgWorker.js` | 105979 |
| `assets/importWorker.js` | 125487 |
| `assets/index.css` | 74491 |
| `assets/index.js` | 778053 |
| `assets/inter-latin-400-normal.woff2` | 23664 |
| `assets/inter-latin-500-normal.woff2` | 24272 |
| `assets/inter-latin-600-normal.woff2` | 24452 |
| `assets/inter-latin-700-normal.woff2` | 24356 |
| `assets/inter-latin-800-normal.woff2` | 24400 |
| `assets/poppins-latin-600-normal.woff2` | 8000 |
| `assets/poppins-latin-700-normal.woff2` | 7816 |
| `assets/poppins-latin-800-normal.woff2` | 7824 |
| `assets/sectionWorker.js` | 110835 |
| `favicon.svg` | 9522 |
| `icons.svg` | 5031 |
| `index.html` | 459 |

16 arquivos. SC-004: depois da feature, os **nomes** devem ser exatamente estes; tamanhos podem variar só pelo código novo do adaptador (poucas centenas de bytes), nunca por a biblioteca de demux (≈ 2 MB desempacotados).

Observação: este build já inclui as duas correções de CSS ad-hoc da tela de Live feitas antes da feature (`shared.css`, `live.css`) — não fazem parte da 047.
