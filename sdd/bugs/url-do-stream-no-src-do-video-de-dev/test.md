# Bug Test: URL do stream no `src` do `<video>` de dev

- **Slug**: url-do-stream-no-src-do-video-de-dev
- **Data**: 2026-10-05, reaberto e concluído em 2026-10-22
- **Result**: verified

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

## Reabertura de 2026-10-22 — a ressalva caiu

A ressalva que manteve o veredito `partial` era: *"a reprodução nativa por HTTP de um `.mp4` real após a remoção do
atributo não foi comprovada (só com `blob:`)"*. Era a dúvida certa, porque é no HTTP que o navegador faz requisições de
**range** depois do `loadstart` — exatamente o momento em que o atributo deixa de existir.

**Por que a tentativa anterior ficou inconclusiva** (`not-run`, "a sonda por servidor HTTP falhou também no controle,
error.code 4"): a página de teste era `about:blank`, cuja origem é `null`. O `<video>` carregando de `http://127.0.0.1`
ficava **cross-origin**, e o Chromium devolvia `MEDIA_ERR_SRC_NOT_SUPPORTED` (código 4) com ou sem a remoção — não era
limitação da correção, era erro de método. Servindo a página do **mesmo** servidor, o controle passa a reproduzir.

Verificação (Playwright + servidor HTTP com suporte a `Range`, mídia VP8/Vorbis porque o Chromium do Playwright não
traz H.264/AAC — o `.mp4` dá código 4 mesmo no controle):

| Checagem | Com a correção | Controle (sem remover) |
| --- | --- | --- |
| `getAttribute('src')` depois do `loadstart` | **`null`** | `/filme.webm` |
| URL presente no HTML | **não** | sim |
| `loadedmetadata` por HTTP | **sim** | sim |
| Play avança (`currentTime` cresce) | **sim** | sim |
| Pausa | **sim** | sim |
| **Seek** (força range novo após a remoção) | **sim**, parou em 8,4 s | sim |
| Erros de mídia | **nenhum** | nenhum |

O controle reproduzindo é o que torna o resultado válido: prova que servidor e mídia servem, e que a remoção do
atributo **não** é o que impede nada.

**Result: `verified`.** O que permanece fora de escopo, como já estava: `currentSrc` continua expondo a URL a
JavaScript (não é DOM nem UI), e nada disto roda na TV — o adaptador `<video>` é só de desenvolvimento; na TV a
reprodução é por AVPlay (ADR-001).
