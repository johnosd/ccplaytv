# Handoff — feature 045 (IME da TV nos formulários) para o `sdd-execute`

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TypeScript + Vite (`tv-web/`), Tizen 9 / Chromium 120, `file://`. Comandos rodam de dentro de `tv-web/` (PowerShell 5.1: sem `&&`).
- Próximo comando: **`/sdd-execute 045-ime-formularios-tv`**. Status no backlog: `Planejada`. Modo padrão do execute (pausa por fase) é o certo aqui — há uma aprovação do usuário no meio (T011).
- Mudou em disco fora do plano e deve ser relido: `.planning/backlog.md` (outro processo o editou) e `sdd/specs/045-ime-formularios-tv/spec.md` (o `/sdd-plan` o releu inteiro).

## O que a feature entrega

- **US1 (P1)** — "Conectar e sincronizar" **confirma a conexão antes de sair do formulário**; os 4 erros da 042 (`SRC-001`, `NET-01/02`, `SRC-401`, `SRC-422`) aparecem no formulário, numa **faixa única** acima das ações, com dados preservados e **foco no botão de ação** (não no campo culpado — decisão do usuário). Modo limitado da 014 **continua**: só dá `SRC-422` se o M3U de fallback também falhar.
- **US2 (P1)** — Done do IME leva à ação principal **sem enviar**; Next avança. **`Enter` nunca é tomado de um campo** (na TV abre o teclado do sistema).
- **US3 (P2)** — o campo focado fica na metade superior da tela.
- **US4 (P2)** — senha/chave mascarada com "Mostrar/Ocultar" que **alterna até desligar** (decisão do usuário; sem prazo) e volta mascarada ao sair da tela.
- **US5 (P3)** — chave TMDB e EPG manual seguem as mesmas regras; erros próprios intactos.

## Leitura obrigatória, em ordem

1. `sdd/specs/045-ime-formularios-tv/spec.md` — FR-001…FR-024, SC-001…SC-008, Clarifications.
2. `plan.md` — **Decisões Invariantes D-001…D-012** e **Riscos R-001…R-011** (os ALTOS: R-001, R-003).
3. `tasks.md` — T001…T030, por fase.
4. `logic/verificacao-conexao.md` — árvore de decisão da confirmação, tempo/cancelamento, edição, orquestração da tela.
5. `logic/ime-teclas-e-cobertura.md` — tabela de teclas, `useImeChain`, cobertura, "Mostrar".
6. `research.md` — o que **não** se sabe do IME real (R0-1) e por quê.
7. `quickstart.md` — E2E e passada na TV.
8. `.planning/memory/constitution.md` — segredos, foco sem becos, RETURN fecha a camada, "defeito nosso nunca vira falha de rede".

## Testes de contrato

- Travados em `sdd/specs/045-ime-formularios-tv/contract-tests.lock` — **5 testes, não editar**:
  - `tv-web/src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts` (2) — Fase 2.
  - `tv-web/src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx` (3) — Fases 3 (2) e 4 (1).
- Rodar: `npx vitest run src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx`
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 045-ime-formularios-tv` (da raiz do repo).
- Hoje: os 2 da lib vermelhos com `not implemented`; os 3 da tela vermelhos por asserção (`Unable to find role="alert"`, `/Conectando/`, `toHaveFocus`). Os 2 da lib foram provados **verdes** contra uma implementação provisória antes de travar (a árvore está em `logic/verificacao-conexao.md`).
- **Trava de outra feature que esta QUEBRA: a da 037** — `AddSourceScreen.entrada-listas.contract.test.tsx`, teste 1 (mocka `fetch` rejeitando e espera `onSourceCreated`). **Não edite sozinho**: peça aprovação ao usuário, emende só o mock de `fetch` e re-trave a 037 (T011). Sem isso a Fase 3 não fecha.
- Outras travas que tocam áreas vizinhas e devem permanecer verdes: 023 (`ProfilesScreen`), 026 (`SettingsScreen`), 032 (`tmdbKeyRepository`), 034, 041.

## Stubs criados

- `tv-web/src/lib/catalog/sourceConnectionCheck.ts` — tipos (`ConnectionCheckInput/Result/Options`, `ConnectionCheckFailureCode`, `CONNECTION_CHECK_TIMEOUT_MS`) **já são a interface final**; o corpo de `checkSourceConnection` lança `not implemented` até T004. Não mude os tipos (os contratos dependem deles).
- Nada mais foi criado. `lib/imeKeys.ts`, `useImeChain.ts`, `revealInTopHalf.ts`, `connectionBanner.ts`, `ConnectionErrorBanner.tsx`, `connectionInput.ts`, `imeProbe.ts`, `ImeProbeOverlay.tsx` e `e2e/ime-formularios.mjs` **não existem** — as tasks os criam.

## Armadilhas já mapeadas

- **`Enter` num campo não pode ter `preventDefault`**: na TV é o OK que abre/fecha o IME (`useRemoteNav.ts` `EDITABLE_PASSTHROUGH_KEYS`). O contrato C5 trava isso.
- **`IME_KEYCODES.next` fica `[]`**: Next real não foi medido; **não invente** código (R-001). `done: 65376`/`cancel: 65385` também são de memória — T002 mede.
- **Não altere `useRemoteNav` nem `useTvKeyNav`** (ADR-009): ambos escutam `document`; o `useImeChain` escuta o contêiner (borbulha antes) e usa `stopPropagation`.
- **`useTvKeyNav` já move foco com ←/→ dentro de um campo** (pré-existente) — não "corrija" aqui.
- **Trava síncrona por `useRef`**: `isPending` só vira `true` no render seguinte; dois OK seguidos passariam (mesmo padrão do `TmdbKeyScreen`). O contrato 4 depende de o botão mostrar `Conectando…` **logo após o clique**.
- **`Promise.race` + timer é obrigatório**: um `fetch` pode ignorar o `AbortSignal` (precedente `accountCheck.ts`). O timeout rejeita **antes** de abortar.
- **`for await` com `return` fecha o gerador → `linesFromResponse` faz `reader.cancel()`** — é o que impede baixar a lista inteira (contrato 2 mede `cancelled` e `pulls ≤ 3`).
- **`fetchJsonDirect` faz uma 2ª requisição `no-cors`** (`probeFailureKind`) quando o `fetch` falha: nos testes, `fetch` rejeitando conta chamadas a mais; e **nunca** passe `fetchImpl` para tentar evitar isso (mudaria o mapeamento CORS×rede).
- **Segredos**: nada de URL/usuário/senha em banner, `aria-*`, log, query key ou estado de tela; em edição, `readCredential` só dentro de `connectionInput.ts`. O erro cru de `fetch` nunca é logado.
- **`getByLabelText('Senha')` é exato**: o botão "Mostrar senha" tem nome diferente, então não colide — mas **não** dê ao botão o rótulo "Senha".
- **`.screen.epg-settings`/`.tmdb-key` não rolam hoje**; dar `overflow` pode recortar o anel de foco (achado da 036, `settings.css:27`). Só jsdom não vê CSS — a cobertura (SC-005) só se prova no E2E.
- **`Button` e `TextField` são compartilhados** (busca usa `TextField`): mudanças só aditivas/opt-in; rodar `TextField.test.tsx`, `SearchScreen` e os contratos 026/028 depois.
- **O CSS de `.source-setup .text-field`** (`onboarding.css:413+`) sobrescreve o `TextField` base; o toggle precisa caber nele.
- **Flakes conhecidos de suíte**: `*.favorites.test.tsx`, `LiveScreen.test.tsx` sob paralelismo — repetir isolado antes de culpar a mudança. Reiniciar o dev server antes do E2E. `lint`: 0 erros, 45 avisos é a linha de base (040).
- **`CCPlayTv/assets/index.js` já está modificado** no working tree: não rode `build:tizen` no meio da feature.

## Decisões do usuário (2026-10-02, depois do Analyze)

- **A-01 resolvido — emenda da 037 APROVADA**: T011 está liberada; emendar **só o mock de `fetch`** do teste 1 de `AddSourceScreen.entrada-listas.contract.test.tsx` e re-travar a 037.
- **A-04 resolvido — FR-014 já emendado** na spec ("Done do IME"); `Enter` segue do sistema.
- **A-05 resolvido — `role="alert"`** na própria faixa (FR-007 lido como região viva equivalente).
- **Ordem da TV (A-02/A-03): medir cedo.** Execute T001 (sonda) logo na Fase 1 e **pare para o usuário rodar T002 na TV antes de começar a Fase 4**; Fases 2, 3, 5, 6 e 7 podem andar antes.

## Pendências do Analyze

- **A-02 · HIGH** — US2/FR-013/FR-014 dependem do que o IME real entrega (R-001) e `next` não tem `keyCode`; só o Done tem contrato. T001+T002 antes da Fase 4; se Done não chegar à página como `keydown`, voltar ao usuário (FR-014 fica sem caminho).
- **A-03 · MEDIUM** — FR-017 (RETURN com o teclado aberto) não tem implementação garantida: T030 é condicional à medição (R-002). Tratar como "não verificado" até T002.
- **A-06 · LOW** — SC-001 (≤ 1 s para mostrar a falha) não tem asserção própria; medir no E2E. SC-004 só em evento simulado — o real é SC-007 (TV).
- **A-07 · LOW** — FR-018 (rótulo permanente) já vale e não tem task; basta um teste de regressão no `TextField.test.tsx`.

## Gate de pronto

- 5/5 contratos verdes + `check-contract-tests.ps1 -Slug 045-ime-formularios-tv` íntegro; a trava da 037 re-travada **com aprovação**; as demais travas do repositório íntegras.
- De `tv-web/`: `npx tsc -b` · `npm run lint` · `npx vitest run` · `npm run test:e2e` (dev server reiniciado) · `npm run build`.
- `quickstart.md` executado. **Passada na TV (SC-007) é recomendada e provavelmente gate** — a spec propõe como obrigatória e o usuário decide no fechamento; sem ela, "Next/Done/cobertura/RETURN" ficam **não verificados**, nunca "aprovados".
- Docs no Polish: `CLAUDE.md` (parágrafo da 045), `.planning/backlog.md` (item 18), `research.md` R0-1 com o que a TV mostrou.
