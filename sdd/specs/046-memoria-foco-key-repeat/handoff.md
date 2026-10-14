# Handoff — 046-memoria-foco-key-repeat (para o sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TS + Vite em `tv-web/` (Tizen, Chromium 108 como piso), Vitest/Testing Library, Playwright E2E.
- **Próximo comando**: `/sdd-execute 046-memoria-foco-key-repeat` (Fase 1 → T001).
- Status no backlog: `Planejada`. O item 14 já saiu de `## Ideias Futuras`.
- A árvore de trabalho está suja por outras features (044/045, `CLAUDE.md`, `backlog.md`, `CCPlayTv/assets/index.js`, logs): **não reverter nem commitar o que não é desta feature**. O `backlog.md` foi alterado em disco por `update-feature-status.ps1`/remoção do item 14 — reler antes de editar.

## O que a feature entrega

- **US1 (P1, 14a)** — segurar a seta na trilha não dispara prefetch de categoria; só a categoria onde o foco parou, após soltar/silêncio de 300 ms + o debounce atual de 300 ms. Vale para Live, Filmes e Séries (as três chamam o mesmo hook).
- **US2 (P2, 14b)** — a Live lembra o último canal por lista + entrada (★ Favoritos/Todos/categoria), só em memória; ao fechar o player o foco volta ao canal que tocava, na entrada de origem.
- Decisões do usuário que contrariam a expectativa óbvia: **não** suprimir preview/EPG/metadata/capas na rajada; **não** usar os 520/850 ms do DS; **não** tocar Filmes/Séries/modais/EPG na memória; **não** persistir nada.

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001…016, SC-001…006, edge cases.
2. `plan.md` — Decisões Invariantes D-001…009, Constitution Check, Riscos R-001…006.
3. `logic/key-repeat.md` — rastreador (`window`/captura), regra do hook, armadilhas.
4. `logic/memoria-foco-live.md` — chave, quando gravar/restaurar, dica de vizinho, `onPlayerClosed`.
5. `tasks.md` — T001…T021 por fase.
6. `quickstart.md` — verificação manual/E2E.
7. `.planning/memory/constitution.md` — "Foco Visível…", "Voltar Restaura Foco e Posição".

## Testes de contrato (5, travados, **não editar**)

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/features/catalog/catalogApi.key-repeat.contract.test.tsx` | 2 | Fase 3 (US1) |
| `tv-web/src/features/live/liveSessionMemory.memoria-foco.contract.test.ts` | 1 | Fase 4 (US2) |
| `tv-web/src/features/live/LiveScreen.memoria-foco.contract.test.tsx` | 2 | Fase 4 (US2) |

- Rodar (de `tv-web/`): `npx vitest run src/features/catalog/catalogApi.key-repeat.contract.test.tsx src/features/live/liveSessionMemory.memoria-foco.contract.test.ts src/features/live/LiveScreen.memoria-foco.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 046-memoria-foco-key-repeat`
- Vermelhos confirmados hoje (por asserção ou `not implemented`, nunca por import/tipo): `ensureCategory` chamada durante a rajada; `'A1A1'` ≠ `A4`; `'G1'` ≠ `'Todos'`; `Error: not implemented`.
- Travas de **outras** features que esta pode quebrar: as que montam `LiveScreen` (016/018/024/027/031 e `LiveScreen.*.contract.test.tsx`) e as telas VOD (025/036) — rodar o script de integridade por slug e os testes isolados após T011.

## Stubs criados (não travados)

- `tv-web/src/lib/focus/keyRepeat.ts` — `KEY_REPEAT_QUIET_MS = 300`; `useKeyRepeatBurst()` lança `not implemented` (T002); `resetKeyRepeatTracker()` é **no-op provisório** (T002 implementa de verdade).
- `tv-web/src/features/live/liveSessionMemory.ts` — `LiveEntryKey`, `LiveRecalledFocus`, `rememberLiveFocus`/`recalledLiveFocus`/`forgetLiveSource` lançam `not implemented` (T007); `resetLiveSessionMemory()` é no-op provisório. As assinaturas são as definitivas.

## Armadilhas já mapeadas

- **`useCategoryFocusPrefetch` não pode mudar de assinatura**: 18 arquivos de teste o mockam/chamam (`vi.fn()` em `vi.mock('../catalog/catalogApi')`); o consumo da rajada fica **dentro** do hook.
- **O listener do rastreador é em `window` (captura)**, não `document`: `Modal`/`useRemoteNav({modal:true})` captura em `document` e `stopImmediatePropagation` — um listener em `document` ficaria cego durante um modal.
- **Primeiro `keydown` de uma rajada tem `repeat:false`** e o 1º repeat chega ~500 ms depois: um prefetch do 1º passo é legítimo (R-002), não bug.
- **Setup global**: contratos travados de 12+ features montam `LiveScreen` e não podem ser editados → o reset da memória/rastreador tem que ir em `setupTests.ts` (T004/T013), senão o estado vaza entre testes.
- **Ordem dos efeitos em `useLiveChannels` importa** (feature 040, `divisao.md` §1.2): o efeito de gravação vem **depois** do que atualiza `lastChannelFocusRef`; refs continuam refs; um `useRemoteNav` por componente.
- **Só grave a memória se o canal focado está em `items`** — o `channelId` que CH± coloca em `focusedIdentity` pode pertencer a outra vizinhança (lista de "Todos"/Favoritos) e nunca deve virar memória da categoria exibida.
- **"Todos" na Live não é paginado** (R-003): a regra de perseguir item não carregado é só de Filmes/Séries (039). Não criar paginação aqui.
- **`.tv-focus` + texto duplicado**: `ChannelRow` rende o nome duas vezes (`'A1A1'`); asserte com `toContain`.
- jsdom sem layout: testes de `LiveScreen` precisam das medidas `offsetHeight/clientHeight/scrollTo` (o contrato já as define; copiar o padrão de `LiveScreen.test.tsx` nos testes novos).
- Flakes conhecidos sob paralelismo: `*.favorites.test.tsx`, `LiveScreen.test.tsx` — confirmar isolado antes de culpar a mudança.
- E2E: o `executablePath` do Chromium nos `e2e/*.mjs` aponta para o caminho Linux do sandbox; rodar no Windows pede um override temporário. Dev server reiniciado antes (instável após horas).

## Pendências do Analyze

- **A-001 (MEDIUM)** FR-015 (estado vazio/erro mantém ação focável após restaurar) não tem task própria — recomendação: cobrir em T015 com um caso "categoria lembrada que ficou vazia".
- **A-002 (LOW)** Spec FR-013 diz "trocar ou excluir a lista ativa descarta a memória"; o plano chaveia por `sourceId` (nunca mistura) e só descarta ao **excluir** (D-009). Trocar de lista não apaga, mas também nunca é aplicada à outra — equivalente na prática; se o usuário quiser descarte literal na troca, é uma linha em `appNav`/App.
- **A-003 (LOW)** Spec cita "Todos carrega aos poucos" na Live; só existe em VOD (R-003) — sem impacto em FR, decidir se emenda a spec no Polish.
- **A-004 (LOW)** SC-006 (TV física) e `repeat` real na TV (R-001) só se provam no hardware — passada recomendada, não gate.

## Gate de pronto

- Contratos 5/5 verdes e `check-contract-tests.ps1` íntegro; travas das demais features íntegras.
- De `tv-web/`: `npx tsc -b` limpo; `npm run lint` sem warnings novos além dos 45 do baseline; `npm run build`; suíte `npx vitest run` (flakes conhecidos confirmados isolados); `npm run test:e2e` (suíte inteira, com o novo `e2e/memoria-foco-key-repeat.mjs`).
- `quickstart.md` executado; docs no Polish (T021): parágrafo da feature no `CLAUDE.md`, backlog via `update-feature-status.ps1`.
- Passada na TV física: **recomendada, não gate** (sem exceção declarada na spec).
