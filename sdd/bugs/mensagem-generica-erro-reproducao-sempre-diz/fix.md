# Bug Fix: Mensagem genérica de erro de reprodução sempre diz "canal"

- **Slug**: mensagem-generica-erro-reproducao-sempre-diz
- **Corrigido**: 2026-09-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O motor deixou de redigir texto de usuário para falhas genéricas:
`PlayerError.message` ficou opcional e os dois adaptadores (AVPlay e
`<video>`) passam só o `code`. Com isso o `?? genericErrorMessage` que já
existia no `PlayerLayer` finalmente dispara: Live continua com "Não foi
possível reproduzir este canal." (prop própria em `LiveScreen`); filme,
episódio e Home passam a mostrar o texto neutro "Não foi possível reproduzir
isto.". As mensagens próprias do `PlayerService` (falha ao iniciar,
transmissão interrompida) não mudaram.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/player/PlayerService.ts` | modified | `PlayerError.message?: string`; JSDoc explica que a ausência significa "use a mensagem de quem apresenta" |
| `tv-web/src/lib/player/avplayAdapter.ts` | modified | `toPlayerError` devolve `{ code }` tipado como `PlayerError`; import do tipo |
| `tv-web/src/lib/player/htmlVideoAdapter.ts` | modified | listener `error` envia `{ code: null }` |

## Tests Added or Updated

- `tv-web/src/lib/player/avplayAdapter.test.ts::onerror › repassa só o código — sem mensagem…` — falha do motor chega como `{ code }`, sem texto.
- `tv-web/src/lib/player/htmlVideoAdapter.test.ts::'error' vira onError sem mensagem…` — evento `error` do `<video>` chega como `{ code: null }`.
- `tv-web/src/components/PlayerLayer.test.tsx::falha do motor sem mensagem usa a genericErrorMessage da tela` — a prop da tela vale nesse caminho (o bug).
- `tv-web/src/components/PlayerLayer.test.tsx::falha do motor sem mensagem, sem prop, cai no texto neutro — nunca "canal" num filme` — reprodução direta do sintoma.
- Regressão já existente mantida: `PlayerLayer.test.tsx` T013 (erro **com** `message` explícita continua ganhando da prop) e `LiveScreen.test.tsx` T028 (Live continua mostrando "…este canal.").

## Local Verification

- `npx vitest run src/lib/player src/components/PlayerLayer.test.tsx` → 9 arquivos, 149/149.
- `npx tsc -b` → limpo (nenhum outro consumidor dependia de `message` obrigatória).
- `npm run lint` → exit 0, nenhum aviso nos arquivos tocados.
- `npx vitest run src/features/live/LiveScreen.test.tsx` → 78/79; a falha é o T010 (virtualização, `scrollToIndex`) por **timeout de 5 s** — passa isolado com `--testTimeout=30000`. O teste não passa pelo caminho de erro do player; é lentidão da máquina, mesmo padrão de flake documentado no `CLAUDE.md`.
- Suíte completa (`npx vitest run`, rodada junto com o outro bugfix desta sessão): 7 falhas, todas do padrão sob paralelismo já documentado (`*.favorites.test.tsx` ×5, `HomeContent` hold-OK ×1, T010 ×1) — as 40 passam rodadas em série/isoladas.
- 12/12 travas de contrato do repositório íntegras (`check-contract-tests.ps1`).

## Deviations from Assessment

- Nenhuma.

## Follow-ups

- Mensagens próprias por tela ("…este filme."/"…este episódio.") ficam para o item 19 do backlog (taxonomia de erros §45), como o assessment previu — fora do escopo deste bug.
