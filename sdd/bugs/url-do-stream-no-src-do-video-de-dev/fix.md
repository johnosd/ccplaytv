# Bug Fix: URL do stream no `src` do `<video>` de dev

- **Slug**: url-do-stream-no-src-do-video-de-dev
- **Data**: 2026-10-05
- **Status**: applied

## Mudanças

- `tv-web/src/lib/player/htmlVideoAdapter.ts`: antes de `video.src = url`, registra um listener `loadstart` (once) que faz `removeAttribute('src')`. A seleção de recurso já leu o valor nesse ponto, então o carregamento segue; a URL deixa de existir no DOM. `currentSrc` (propriedade JS) permanece. O caminho do mpegts.js (047) não muda: ele usa a URL por closure e o `src` vira `blob:`.
- `tv-web/src/lib/player/htmlVideoAdapter.sem-url-no-dom.test.tsx` (novo, projeto `dom`): o atributo existe antes do `loadstart` e some depois; o HTML não contém a URL.
- `tv-web/e2e/headers-catchup.mjs`: removida a exclusão de `video.player-video` da varredura de segredos (e o comentário que a justificava).

Testes de contrato 047 não foram tocados.

## Deviations from Assessment

Nenhuma. O arquivo de teste foi criado como `.tsx` (o projeto `node` do vitest não tem DOM para `.ts`).

## Testes rodados no Fix

- `npx vitest run src/lib/player`: 31 arquivos, 215 testes passando.
- `npx tsc -b`: exit 0.

## Próximo passo

Fase Test. Sugestão de commit: `fix(player): URL do stream fora do DOM no video de dev`.
