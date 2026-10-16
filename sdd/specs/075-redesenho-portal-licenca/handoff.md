# Handoff — 075-redesenho-portal-licenca

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca` (com muitas mudanças não commitadas de outras features — não reverter nada fora desta feature).
- Stack: `tv-web/` React 19 + TypeScript + Vite, Dexie, Vitest/Playwright; foco próprio (`useRemoteNav`).
- Próximo comando: `/sdd-execute 075-redesenho-portal-licenca`. Backlog: **Planejada**, 0/40.
- Decisões de base já registradas nesta sessão: **ADR-019** (`sdd/adr/ADR-019-portal-licenca-qr-id-chave.md`), nota na ADR-016 (decisão 6) e **constitution 1.14.0** (emenda no item (f)). Releia se tiver dúvida sobre o que pode ficar à vista.

## O que a feature entrega

- **US1 (P1)**: Portal & licença mostra QR fixo, site, ID e chave `123 456 7890` **sem nenhuma ação** (cartão Acessar o portal).
- **US2 (P1)**: cartão Licença com estado/validade/oferta, **código oculto atrás do olho (sem modal, sem timer)**, Comprar/Renovar e Atualizar; foco inicial = Comprar (teste/vencida/sem), Atualizar (ativa), olho (build não comercial — que mostra **só** o código).
- **US3 (P2)**: botão **Mais opções** → menu com **Gerar nova chave e código** (une "Revogar acessos" e "Gerar novo código": no serviço as duas já faziam a mesma rotação), **Recuperar pelo site** (QR temporário no lugar do fixo) e **Desvincular** (sai do bloco de backup).
- **US4 (P2)**: aba **Backup** nova logo após Portal & licença, com Fazer backup agora / Restaurar backup / Apagar backup.
- Fora: `api/`, `portal-web`, telas Adicionar lista e bloqueio (a chave **continua sem agrupar** lá), TV física.

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FR-001..020, SC-001..006, Clarifications.
2. `plan.md` — D-001..D-010 (ações por id, foco inicial, olho, rotação `revoke`, Backup como aba), Constitution Check, R-001..R-006.
3. `logic/foco-portal.md` — mapa de teclas, `portalActions`/`initialAction`, regra do olho, fluxo de diálogos, tabela de segundo plano.
4. `tasks.md` — T001..T030 por fase.
5. `quickstart.md` — comandos e cenário ponta a ponta.
6. `.planning/memory/constitution.md` — "Segredos…" item (f) emendado, "Foco Visível…", "Voltar Restaura Foco".

## Testes de contrato

- `tv-web/src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx` — 5 testes (Fase 3: US1-AC1 e FR-004; Fase 4: dois US2; Fase 5: US3). Todos vermelhos hoje por asserção.
- Rodar (de `tv-web/`): `npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx`
- Trava (da raiz): `powershell -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca`
- **Outra trava afetada**: 067 (`SettingsScreen.configuracoes-lista-global.contract.test.tsx`, linha 78, lista exata de abas). Emenda **aprovada** (FR-020): só acrescentar `'Backup'` no fim do array e regravar com `check-contract-tests.ps1 -Slug 067-configuracoes-lista-global -Write` (T021). A trava da 070 (`PortalPairingPanel…contract`) **não** pode quebrar — não mexa na chave de Adicionar lista.

## Stubs criados

Nenhum — os contratos usam só `PortalLicenseTab` + `SettingsTabProps`, `PortalConnection` e o DOM.

## Armadilhas já mapeadas

- **`commercialBuild` lido no render**: o contrato mocka `lib/licensing/licenseRuntime` com `get commercialBuild()`; copiar o valor para uma constante própria de módulo faz o teste comercial falhar (R-004). `licenseMonitor` também vem desse módulo (o contrato o substitui por `subscribe/getSnapshot`).
- **`getPortalConnection()` é o único caminho da conexão** na aba (o contrato mocka `lib/portal/portalRuntime` parcialmente). Não injete a conexão por outro meio na aba.
- **Chave num único nó de texto** (`formatDeviceKey` → `"173 204 9818"`): o contrato usa `getByText`; spans por bloco quebram.
- **Rótulos exatos usados pelo contrato**: "QR de acesso ao portal desta TV" (`portal.qrAlt`, `FixedQr` com `role="img"`), "Mostrar código da licença"/"Ocultar código da licença" (nome acessível do olho), "Comprar licença", "Renovar licença", algo contendo "Atualizar", "Mais opções", "Gerar nova chave e código" (item do menu **e** botão de confirmar), "Recuperar pelo site", "Desvincular esta TV". Menu = `role="dialog"` com exatamente 3 `button`s nessa ordem; só um diálogo aberto por vez.
- **Sem portal configurado**: no máximo 4 botões no DOM da aba e um focado após `onEnter`.
- **QR fixo não some em segundo plano** (muda o comportamento da 071 — R-006); só o código e o convite de recuperação somem. O teste antigo em `PortalLicensePanel.test.tsx` que espera o QR sumir no `pagehide` deve ser reescrito (T014).
- **Rotação**: `connection.rotate('revoke')` (manda o MAC; upgrade de ID 070). Não remova `rotate('rotate')` do `PortalConnection` (R-005).
- **Ratchet**: `features/settings` não importa `features/portal` (nem o CSS `portalPairing.css`); produção ≤ 300 linhas — por isso o painel é dividido em `PortalAccessCard`/`PortalLicenseCard`/`PortalMoreOptions`.
- **E2E**: 9 roteiros dirigem os rótulos antigos (lista em T025/T026); a auditoria de legibilidade do portal roda num Vite **comercial** separado (`auditPortalScreens`, porta 5177) — as abas novas entram ali (T027). No PowerShell, `npm run x -- --flag` perde o `--`: use `node e2e/run.mjs --only a,b`.
- Desvincular hoje vive em `PortalBackupActions.tsx`; mover o fluxo (T017) **antes** de removê-lo de lá (T020).

## Pendências do Analyze

- A1 (MEDIUM) — SC-002 diz "1 interação" para revelar o código, mas no build comercial o foco entra em Comprar: são ↑ + SELECT (2). Recomendação: reescrever SC-002 como "1 SELECT a partir do olho" ou aceitar como está.
- A2 (LOW) — spec FR-005/US2 diz "Renovar"; o rótulo real (e o do contrato) é "Renovar licença". Alinhar o texto da spec no Polish.
- A3 (LOW) — spec FR-007 cita "Mostrar código"/"Ocultar código"; o contrato fixa "Mostrar código da licença"/"Ocultar código da licença". Alinhar a spec.
- A4 (LOW) — edge case "rotação/recuperação pendente retoma estado" sem teste dedicado; o `PortalConnection.rotate` já retorna sem nova operação quando há pendência. Opcional: um caso em T019.

## Gate de pronto

- Contratos 075 5/5 verdes + trava 075 íntegra; trava 067 regravada pela emenda e íntegra.
- De `tv-web/`: `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`, `npm run test:e2e` (com `npm run dev`), `node e2e/legibilidade-tv.mjs`.
- `quickstart.md` executado no navegador.
- Polish: comentário de `PortalPairingPanel.tsx` (T024), chaves i18n mortas (T028), `plan.md` Estado Atual/Execution Notes, backlog via script.
- TV física: **recomendação, não gate** (decisão do usuário; R-003).
