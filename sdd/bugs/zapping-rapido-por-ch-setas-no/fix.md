# Bug Fix: Zapping rápido por CH±/↑/↓ para no próximo canal

- **Slug**: zapping-rapido-por-ch-setas-no
- **Corrigido**: 2026-10-14
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A troca por ↑/↓/CH± na Live agora separa o canal **escolhido** (`playing`: faixa, número, EPG, foco) do canal
**sintonizado** (`heldChannel ?? playing`, o `itemId` do `PlayerLayer`). Numa rajada, o player continua no
canal que tocava e só abre o canal final `ZAP_SETTLE_MS` (600 ms) depois do último toque. CH± no canal também
deixou de ser descartado enquanto o canal novo ainda prepara.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/live/useLiveZapping.ts` | modified | `heldChannel` + `settleTimerRef` no estado (limpo ao desmontar); `ZAP_SETTLE_MS = 600`; `stepChannel(direction, { hold })` segura o canal sintonizado e reinicia a espera; `settleNow()` em OK/Assistir, fechar o player e erro de sessão; `lastGoodChannelRef` só é gravado no início da rajada |
| `tv-web/src/features/live/useLiveArchive.ts` | modified | CH±/↑/↓ a partir do arquivo usam `hold: !active` — sem espera, para não reabrir o ao vivo do canal antigo |
| `tv-web/src/features/live/LiveScreen.tsx` | modified | `itemId` do `PlayerLayer` = `heldChannel ?? playing` (com arquivo ativo, sempre `playing`) |
| `tv-web/src/components/player/usePlayerKeyboard.ts` | modified | CH± no Live é tratado antes do guard de `idle`/`preparing`; o arquivo segue com 406 linhas (teto do ratchet) |

## Tests Added or Updated

- `tv-web/src/features/live/LiveScreen.zapping-rapido.test.tsx` (novo, 3 testes):
  - "três ↓ seguidos: a faixa acompanha e só o canal final é aberto": a faixa mostra C4 na hora e `fetchPlayback` só vê `C1 → C4`.
  - "CH± continua trocando enquanto o canal escolhido ainda prepara": com C2 em `preparing`, `ChannelDown` (428) leva a C3.
  - "falha no canal final volta ao canal que tocava antes da rajada, nunca a um intermediário": `C1 → C3 (falha) → C1`.
- Os 3 **falham** com o código anterior (patch revertido temporariamente: 3/3 ×) e passam com o fix.

## Local Verification

- `npx vitest run src/features/live/LiveScreen.zapping-rapido.test.tsx` → 3/3.
- `npm run lint` → exit 0 (só avisos herdados de exceções obsoletas do baseline).
- `npx tsc -b` → exit 0.
- `npm run test` → 590 arquivos / 3362 testes, todos passando.
- `npm run build` → ok, `check-no-demux-in-build` ok.
- Travas: `check-contract-tests.ps1` da 027 (5 testes) e da 046 (5 testes) íntegras.
- E2E (com `npm run dev`): `node e2e/run.mjs --only zapping-live-tv,live-paridade-v14,memoria-foco-key-repeat` → 3/3.

## Deviations from Assessment

- O teste de CH± durante `preparing` ficou no novo teste da `LiveScreen` (ponta a ponta pela Live), em vez de um
  caso a mais em `PlayerLayer.test.tsx`: cobre o mesmo guard com o `onChannelStep` real.
- `e2e/player-chrome.mjs` (fora da lista de `e2e/run.mjs`) falha no **Cenário 1 (filme)**, antes de qualquer passo
  de canal: `.side-category-nav-item.tv-focus` "Filmes" não aparece. É anterior a este fix e fora do escopo dele.

## Follow-ups

- TV física: confirmar a sensação da espera de 600 ms com CH± e ↑/↓ (AVPlay real) e que só o canal final é aberto.
- `e2e/player-chrome.mjs` está desatualizado na navegação de Filmes — candidato a bug/ajuste separado.
- Commit sugerido: `fix(live): zapping por CH±/↑/↓ atravessa canais e só abre onde a pessoa para`.
