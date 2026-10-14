# Handoff — 048 Paridade visual da TV ao vivo com o Design System V14

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend React 19 + TS + Vite em `tv-web/` (Tizen, client-first).
- Próximo comando: `/sdd-execute 048-live-paridade-v14`. Backlog: **Planejada** (0/44 itens).
- Arquivos alterados pelo plan fora de `sdd/`: `tv-web/src/lib/epg/upcoming.ts` (stub novo), `tv-web/src/components/SideCategoryNav.tsx` (campo `tile` no tipo), e os 2 arquivos de contrato travados.
- A revisão visual que originou a feature (capturas protótipo × app) está descrita em `spec.md` → Input; o protótipo roda num IIFE — para ir direto à Live, servir por HTTP e injetar `window.__go=go` (quickstart §5).

## O que a feature entrega

- **US1 (P1)** destaque do canal focado: rótulo, nome em Display, linha "● ao vivo", ações em linha, fundo com o logo real. **Textos das ações não mudam** (`Assistir`, `Favoritar`/`Favorito`, `Guia completo`) — os símbolos são `<Icon>` SVG.
- **US2 (P1)** painéis com cabeçalho de 2 linhas, larguras 200/340/resto, anel de foco inteiro (lista e trilha) e indicador de continuação nas bordas (FR-021, incluído a pedido do usuário — Spec V14 §17/§34).
- **US3 (P2)** até 3 cartões A seguir/Depois/Mais tarde só com EPG real.
- **US4 (P2)** tile na trilha (★, ∞, iniciais), linha de canal V14, estado "tocando" no zapping — **só na Live**.
- **US5 (P3)** cabeçalho com subtítulo e chips à direita; dica de favoritar só no rodapé. **Título continua H1 40px** e o chip selecionado é **tint**, não branco (Spec V14 prevalece sobre o protótipo; FR-015 já foi reescrito assim).
- Teclado: única mudança é → avançar entre as ações; ↓ também avança e ← volta ao canal de qualquer ação (contratos 024/031).

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FRs, Clarifications (inclui a decisão de teclado).
2. `plan.md` — **`## Referências do Design System`** (mapa Spec V14 § / Component Lab `#seção` → decisão), Decisões D-001..D-017, Riscos R-001..R-007.
3. `tasks.md` — 8 fases; Fase 2 é pré-requisito de US1/US3.
4. `logic/destaque-e-programacao.md` — estrutura do painel, regra de `upcomingAfterNow`, tile, teclado, foco, CSS escopado.
5. `quickstart.md` — verificação, conferência com Spec/Lab e protótipo.
6. `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md` §5–§8, §11, §15, §25, §31.1, §33–§34 e o Component Lab (`#categoriesv131`, `#navigation`, `#actions`, `#states`, `#cards`, `#feedback`).
7. `.planning/memory/constitution.md`.

## Testes de contrato

- `tv-web/src/lib/epg/upcoming.live-paridade-v14.contract.test.ts` — 1 teste — Fase 2.
- `tv-web/src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx` — 4 testes — Fases 3 (2), 5 (1), 6 (1).
- Rodar (de `tv-web/`): `npx vitest run src/lib/epg/upcoming.live-paridade-v14.contract.test.ts src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 048-live-paridade-v14`
- Travas de outras features que esta pode quebrar: **018** (`LiveScreen.busca-categoria`), **024** (`LiveScreen.live-tv-ds-v14`, `channelNumber`, `appNav`, `channelLogo`), **030** (`nowNext.epg-dados-agora`, `LiveScreen.epg-dados-agora`), **031** (`LiveScreen.epg-guia-completo` e guia), **046** (`liveSessionMemory`, `LiveScreen.memoria-foco`). Rodar `check-contract-tests.ps1` para cada slug no fim.

## Stubs criados

- `tv-web/src/lib/epg/upcoming.ts` — `UPCOMING_LIMIT`, `upcomingAfterNow`, `upcomingForChannel` com `throw new Error('not implemented')`.
- `tv-web/src/components/SideCategoryNav.tsx` — `SideCategoryNavEntry.tile?: string` só no tipo (JSDoc diz "stub"); ainda não desenhado (T022).
- `tv-web/src/lib/focus/useOverflowEdges.ts` **não existe** — criar na T015 (assinatura em `logic/…` §5.0).

## Armadilhas já mapeadas

- `.channel-row-now` precisa ter **só o título** no texto (contrato 030) → "Agora: " é `::before` escopado.
- Testes usam `.side-category-nav-label` com texto exato → o tile fica **fora** do label.
- `e2e/live-tv-ds-v14.mjs` compara `textContent === 'Assistir'` → ícone SVG dentro do botão é seguro; texto extra não.
- `e2e/epg-dados-agora.mjs` lê o texto de `.live-preview-panel` (procura "A seguir" + título; e **nenhum `/Agora/` maiúsculo** num canal sem EPG) → cartões dentro do painel, "ao vivo agora" em minúsculas.
- `upcomingAfterNow` tem de dar `toEqual` com o `next` de `nowAndNext` → copiar `description` só quando definida; não mudar `nowAndNext` (contrato 030).
- `LIVE_ITEM_ROW_HEIGHT = 84` e a linha de 72px não mudam (virtualização). A folga contra corte de foco vai no contêiner rolável, com margem negativa igual (receita de `settings.css`, feature 036).
- `SideCategoryNav`, `ChannelRow`, `PosterArt`, `.live-state*`, `.live-truncated-note` servem outras telas → só CSS escopado na Live; a única regra nova global é `.side-category-nav-tile`.
- `liveColumns.tsx` desenha por **funções**, não componentes (regra da 040, refs/scroll).
- Sem `filter: blur`, `will-change`, `translateZ` (Spec §30/§34). Texto nunca < 16px (Spec §6).
- `listInitials` está em `features/profiles/listAvatar.ts`; mover para `lib/initials.ts` mantendo re-export (testes da 037).
- `LiveScreen.epg.test.tsx` (não travado) espera o preview antigo — ajustar na Fase 3/5 sem afrouxar.
- Indicador de continuação: degradê por **overlay** num invólucro, nunca `mask-image` no contêiner rolável (esmaeceria o anel); o item focado fica fora da faixa via `scrollPaddingStart/End` do virtualizador e `scroll-padding-block` na trilha (D-018).

## Pendências do Analyze

- **A-001 (HIGH)** ↓ avançando para a ação à direita contraria Spec §33 (focus path previsível); mantido por decisão do usuário e pelos contratos 024/031. Recomendação: aceitar nesta feature; se o usuário quiser o comportamento espacial, abrir uma decisão para reabrir os contratos 024/031.
- ~~A-002~~ **resolvido** (2026-10-02): spec reescrita (US1, US5, FR-003, FR-008, FR-015, SC-005) para seguir a Spec V14; registrado em Clarifications.
- ~~A-003~~ **resolvido** (2026-10-02): incluído como FR-021/SC-006 + US2/AC5; plano D-018, tasks T015/T016/T030.
- **A-004 (LOW)** `docs/guia-praticas-app-tv/` (focus, media player chrome) não foi consultado no plano; o executor deve dar uma olhada antes da Fase 3.
- **A-005 (LOW)** Tile de palavra única: contrato fixa "NO" (regra `listInitials`), o Lab mostra "N". Aceito.

## Gate de pronto

- 5/5 contratos verdes; `check-contract-tests.ps1` íntegro para 048, 018, 024, 030, 031, 046.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen` limpos.
- `npm run test:e2e` com `npm run dev` rodando (inclui o novo `e2e/live-paridade-v14.mjs`, T030).
- `quickstart.md` executado, incluindo a conferência com Spec V14 / Component Lab (§4) e protótipo (§5).
- Docs no Polish: `plan.md` (Estado Atual, Execution Notes) e backlog via `update-feature-status.ps1`. Não acrescentar parágrafo de status no `CLAUDE.md`.
- TV física: **recomendação**, não gate.
