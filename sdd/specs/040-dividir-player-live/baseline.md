# Linha de base — 040 (antes de mover qualquer código)

Medida em 2026-10-01 sobre o commit `f54bb8d` (árvore limpa, D-008), na
máquina de desenvolvimento (Windows, Chromium do Playwright). "Nada mudou"
= bater com isto (D-004).

## Suíte unitária — `npx vitest run` (em `tv-web/`)

- **2028 passed / 6 failed** (2034 testes, 255 arquivos; 250 ok / 5 com falha).
- Falhas **esperadas** (contratos da 034, feature não executada — 5 testes):
  `SourceAccessGate.fontes-estado.contract.test.tsx` (1),
  `accountCheck.fontes-estado.contract.test.ts` (1),
  `importPipeline.fontes-estado.contract.test.ts` (1),
  `sourceAccount.fontes-estado.contract.test.ts` (2).
- Falha **instável** (1): `SettingsScreen.privacidade.test.tsx` › "contagens
  com indisponíveis…" — sob a suíte inteira, o resumo do IndexedDB levou mais
  que o `waitFor` padrão (1 s) e o teste viu "Carregando…"; **isolado, 3/3
  verde**. Teste da 036 (fora do escopo da 040) — levado ao usuário no
  checkpoint da Fase 1.
- Flakes já conhecidos do projeto (`*.favorites.test.tsx`,
  `LiveScreen.test.tsx`): **não** falharam nesta rodada.

## Lint — `npx oxlint`

- 0 erros, **13 avisos** (todos anteriores; nenhum em `PlayerLayer.tsx`/`LiveScreen.tsx`).

## Build — `npm run build:tizen`

- OK; o pacote sincronizado em `CCPlayTv/` ficou **idêntico** ao versionado.
- `tv-web/dist/assets` (13 arquivos): `epgWorker.js`, `importWorker.js`,
  `index.css`, `index.js`, `inter-latin-400/500/600/700/800-normal.woff2`,
  `poppins-latin-600/700/800-normal.woff2`, `sectionWorker.js`.

## E2E — por roteiro (cada um isolado, `npm run dev` recém-iniciado)

Todos com exit 0 e **0 ✗**. Total: **624 ✓** em 21 roteiros.

| Roteiro | ✓ |
| --- | --- |
| `e2e.mjs` | 40 |
| `e2e/favoritos.mjs` | 15 |
| `e2e/m3u-sob-demanda.mjs` | 28 |
| `e2e/capa-real.mjs` | 14 |
| `e2e/zapping-live-tv.mjs` | 11 |
| `e2e/busca-por-categoria.mjs` | 18 |
| `e2e/historico-continuar-assistindo.mjs` | 16 |
| `e2e/ciclo-vida-player.mjs` | 8 |
| `e2e/live-tv-ds-v14.mjs` | 29 |
| `e2e/home-busca-configuracoes.mjs` | 32 |
| `e2e/limpeza-qa.mjs` | 13 |
| `e2e/audio-legendas-info.mjs` | 40 |
| `e2e/epg-dados-agora.mjs` | 44 |
| `e2e/epg-guia-completo.mjs` | 55 |
| `e2e/metadata-tmdb.mjs` | 60 |
| `e2e/trailers.mjs` | 48 |
| `e2e/modal-temporada.mjs` | 12 |
| `e2e/semelhantes-elenco-ator.mjs` | 49 |
| `e2e/carga-listas.mjs` | 46 |
| `e2e/catalogo-em-blocos.mjs` | 26 |
| `e2e/limpar-historico.mjs` | 20 |

Nota: a 1ª tentativa com `npm run test:e2e` encadeado parou no cenário 2 de
`catalogo-em-blocos.mjs` com `ERR_CONNECTION_REFUSED` passageiro (o dev
server respondeu 200 logo depois, sem erro no log) — por isso a linha de base
é por roteiro isolado.

## Travas que montam os dois componentes

018, 020, 024, 026, 027, 029, 030, 031 — **todas íntegras**.

## Tamanho de partida

- `tv-web/src/components/PlayerLayer.tsx`: 1151 linhas.
- `tv-web/src/features/live/LiveScreen.tsx`: 1491 linhas.

## Atualização (2026-10-01, depois da divisão)

- Lint: **45 avisos**, 0 erros — nova linha de base aceita pelo usuário (R-006): +32 `react(refs)` no `PlayerLayer.tsx` pelas mesmas leituras de ref no render que o arquivo antigo tinha (o analisador não analisava o arquivo grande).
