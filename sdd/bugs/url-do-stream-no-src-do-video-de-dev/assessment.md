# Bug Assessment: URL do stream no `src` do `<video>` de dev

- **Slug**: url-do-stream-no-src-do-video-de-dev
- **Criado**: 2026-10-05
- **Origem**: item 71 `[Bug]` do backlog (Ideias Futuras) e R-011 de `sdd/specs/058-headers-avplay-catchup/plan.md`
- **Veredito**: valid
- **Severidade**: low

## Report

O adaptador `<video>` de desenvolvimento (`tv-web/src/lib/player/htmlVideoAdapter.ts`, feature 003) grava a URL do stream em `video.src`. No navegador do `npm run dev`, a URL de qualquer canal/filme (com credencial embutida, ou de arquivo de catch-up da 058) fica no DOM. Só no dev; na TV o AVPlay não usa o DOM. Nunca aparece na tela.

## Symptom

Observado: o atributo `src` do `<video class="player-video">` contém a URL completa (com credencial) enquanto o item toca. Esperado: nenhum segredo no DOM (constituição: segredo fora de log/UI/erro), o que também permite ao E2E da 058 varrer o `<video>`.

## Reproduction

1. `npm run dev`, abrir um canal/filme.
2. Inspecionar `document.querySelector('video.player-video').getAttribute('src')` e ver a URL inteira.

## Suspected Code Paths

- `tv-web/src/lib/player/htmlVideoAdapter.ts:181` — `video.src = url` (reflete no atributo `src`).
- `tv-web/e2e/headers-catchup.mjs:49-57` — exclui `video.player-video` da varredura por causa deste bug.
- `htmlVideoAdapter.ts:85-94` / `devDemux.ts:81-88` — o fallback mpegts.js usa a `url` por closure, e o `attachMediaElement` troca o `src` por `blob:` (sem segredo); não depende do atributo.

## Root Cause Hypothesis

Atribuição direta de `video.src`, que é atributo reflexivo. Confiança alta.

## Proposed Remediation

Opções avaliadas:

1. `blob:`/MediaSource para o caminho nativo: exigiria baixar ou demultiplexar tudo em JS (quebra live, Range, CORS, HLS/MP4 nativos). Grande refatoração, inviável como mudança mínima.
2. `<source>`/`srcObject`: `<source src>` também é DOM; `srcObject` só aceita MediaStream/MediaSource. Descartada.
3. **Preferida**: atribuir `video.src = url` e remover o atributo `src` assim que o algoritmo de seleção de recurso já leu o valor, ou seja, no evento `loadstart` (a spec lê o atributo antes de disparar `loadstart`; remover o atributo depois não aborta o carregamento em curso). A URL sai do DOM (atributo, `outerHTML`); `video.currentSrc` (propriedade JS, não DOM) continua existindo. A reprodução e o seek seguem. Falha em remover cedo demais é o risco: por isso `loadstart` e não remoção síncrona. A validação empírica em Chrome (E2E) é obrigatória.

**Files likely to change**:
- `tv-web/src/lib/player/htmlVideoAdapter.ts`
- `tv-web/src/lib/player/htmlVideoAdapter.test.ts` (novo teste de regressão em arquivo próprio se preferível; os testes de contrato 047 não são editados)
- `tv-web/e2e/headers-catchup.mjs` (remover só a exclusão do `<video>`)

**Tests to add or update**:
- Teste unitário: após `open(url)` e disparo de `loadstart`, o `<video>` não tem atributo `src`; antes disso, tem.
- E2E `headers-catchup` e `player-dev-mpegts` (contratos 047) com a varredura incluindo o `<video>`.

## Risks & Considerations

- Remover `src` antes do `loadstart` cancelaria o carregamento; confirmar no Chrome real.
- `currentSrc` continua legível por JS (não é DOM nem UI); registrado como limite.
- Se o navegador reiniciar o carregamento a partir do atributo (ex.: `load()` explícito), perderia a fonte; o adaptador só chama `load()` no `detach`.

## Open Questions

- Nenhuma bloqueante; a validação empírica decide entre `verified` e `partial`.
