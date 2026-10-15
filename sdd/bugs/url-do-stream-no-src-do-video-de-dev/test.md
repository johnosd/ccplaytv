# Bug Test: URL do stream no `src` do `<video>` de dev

- **Slug**: url-do-stream-no-src-do-video-de-dev
- **Data**: 2026-10-05
- **Result**: partial

## Checagens

| Checagem | Resultado |
|---|---|
| `npx vitest run src/lib/player` (inclui contrato 047 e o teste novo) | passed: 31 arquivos, 215 testes |
| `npx tsc -b` | passed (exit 0) |
| E2E `headers-catchup` com o `<video>` agora DENTRO da varredura de atributos | passed (18,6 s) |
| E2E `player-dev-mpegts` (reprodução real via demux, 047) | passed (99,7 s) |
| Sonda manual em Chromium (Playwright), `<video>` com remoção de `src` no `loadstart` vs. controle, fonte `blob:` | passed: ambos readyState 4, currentTime avançando (~0,49 s), sem erro; com remoção `hasAttribute('src') === false` |
| Reprodução nativa por HTTP real (mp4/webm remoto) após remoção do `src` | not-run: a sonda por servidor HTTP falhou também no controle (error.code 4, sem remoção), então foi inconclusiva |
| Seek/pausa após remoção, em fonte HTTP | not-run |

Observação: o comando `npm run test:e2e -- --only ...` ignorou o filtro e rodou a suíte inteira (37/37 passaram em 269 s).

## Julgamento

O sintoma (URL no atributo `src`) não reproduz mais, confirmado pelo E2E 058 e pelo teste unitário. `partial` porque a reprodução nativa por HTTP de um `.mp4` real após a remoção do atributo não foi comprovada (só com `blob:`; o mpegts passou porque usa blob). `currentSrc` continua expondo a URL a JS, fora do escopo (não é DOM nem UI).

## Recomendação

Segurar até um teste manual rápido no `npm run dev` com um filme `.mp4` real (play, pausa, seek). Sem regressão observada.
