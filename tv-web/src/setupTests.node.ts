// Setup dos testes que rodam no ambiente `node` (arquivos `*.test.ts` e
// `scripts/*.test.mjs`). Subir o jsdom custa ~5 s por arquivo (carregar o
// módulo ~2,6 s + setup), contra ~1,2 s no `node` — por isso só quem
// realmente precisa de DOM paga esse custo.
//
// Um teste `.ts` que precise de DOM declara isso no topo do próprio arquivo:
//   // @vitest-environment jsdom
// (e, se usar matchers do jest-dom ou `scrollIntoView`, importa o que
// precisar — este setup não carrega nada de DOM de propósito).
//
// IndexedDB continua disponível: a camada de armazenamento (Dexie) é testada
// sem navegador, como em `setupTests.ts`.
import 'fake-indexeddb/auto'
