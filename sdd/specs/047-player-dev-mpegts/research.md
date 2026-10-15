# Research — 047-player-dev-mpegts

## R0-1 — Qual biblioteca de demux

- **Decisão**: `mpegts.js` (Apache-2.0), versão ^1.8.2 (medida em 2026-10-02: `dist.unpackedSize` ≈ 2,1 MB, traz `d.ts`).
- **Justificativa**: demuxa MPEG-TS ao vivo para MSE e lê o stream por `fetch`, que o painel real permite (CORS `Access-Control-Allow-Origin: *` na 302 e na 200, medido em 2026-10-02). Tem tipos.
- **Alternativas**: `hls.js` — só serve `.m3u8`, e o formato real da lista é `.ts` bruto; entra só se `.m3u8` virar necessidade. Remux externo (ffmpeg/proxy) — depende de ferramenta instalada e passa a credencial por outro processo (rejeitada no assessment).

## R0-2 — Nativo primeiro ou demux direto

- **Decisão**: nativo primeiro; demux só após `error` com `code 4` numa URL `.ts` (D-001).
- **Justificativa**: nas 16 fixtures E2E (`e2e/*.mjs`) que disparam eventos manuais no `<video>`, várias URLs são `.ts` apontando para conteúdo que não é vídeo. Demux direto mudaria o comportamento de tudo isso; nativo primeiro só muda caminhos que hoje já falham com `PLAY-04`. Custo: uma tentativa nativa que o Chromium recusa de imediato (sniffing de formato), sem espera perceptível.
- **Alternativas**: decidir por `canPlayType('video/mp2t') === ''` antes de abrir — no Chromium é sempre vazio, então equivale a demux direto.

## R0-3 — Como a biblioteca fica fora do bundle de produção

- **Decisão**: `import('mpegts.js')` dentro de `if (import.meta.env.DEV && typeof MediaSource !== 'undefined')`; verificação posterior por script que varre `dist/`.
- **Justificativa**: o Vite substitui `import.meta.env.DEV` por `false` no build e o Rollup remove o ramo morto, incluindo a importação dinâmica. Isso é comportamento padrão, **mas a feature não confia nele**: o script `check-no-demux-in-build.mjs` falha o `npm run build` se encontrar a biblioteca (R-005).
- **Alternativas**: `devDependency` + alias de módulo vazio em produção (mais config); plugin Vite próprio (excesso).

## R0-4 — Decodificação no navegador do E2E

- **Pergunta aberta (R-002)**: o Chromium que o Playwright baixa pode não incluir H.264/AAC. O spike mede `MediaSource.isTypeSupported` e, se preciso, testa `channel: 'chrome'`.
- **Fixture**: `ffmpeg` está disponível localmente (medido). Comando sugerido: `ffmpeg -f lavfi -i testsrc=size=160x90:rate=15 -f lavfi -i sine=frequency=440 -t 30 -c:v libx264 -profile:v baseline -b:v 80k -c:a aac -b:a 32k -f mpegts e2e/fixtures/canal-teste.mpegts`. Aprox. 400 KB; commit pequeno.
- **Alternativa se o navegador não decodifica**: D-008 (cenário PULADO explícito) e a prova real passa a ser só o script com a lista real rodado numa máquina com Chrome.

## R0-5 — Logs da biblioteca

- **Decisão**: ao carregar, desligar o log da biblioteca (`LoggingControl.enableAll = false` ou equivalente na API 1.8.x — confirmar nos tipos instalados) e provar no E2E que `console` não recebe host nem credencial (R-003).
