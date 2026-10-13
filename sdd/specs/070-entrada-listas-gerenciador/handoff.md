# Handoff — 070

**Contexto**

ccplayTv, branch `feature/designWave2`; TV React/TS (Vite, `chrome108`, Tizen `file://`), portal-web React, API FastAPI/Firestore (`api/app/portal/`). Backlog: **Planejada, 0/54**. Próximo comando: `/sdd-execute 070-entrada-listas-gerenciador`. A 069 segue aberta (T039/T043/T046/T052) e há mudanças não commitadas dela (T056–T058, `dev:portal`, E2E de portal) — não reverter; `CCPlayTv/assets/*` modificados são o pacote comercial sincronizado (fora de commit).

**O que a feature entrega**

- P1/US1: tela "Conecte sua lista IPTV" com coluna real do celular — ID `XX:XX:XX:XX:XX:XX` (MAC; fallback gerado), **chave de 10 dígitos sempre visível**, endereço do painel, QR, Recarregar, "Gerar nova chave".
- P1/US2: formulário grande; texto **visível por padrão** com **um olho do formulário**; edição na TV **mostra valores salvos**.
- P2/US3: painel entra por ID + chave; cabeçalho ID/status/validade/pagamento; edição **mostra valores salvos** (rota nova).
- P2/US4: RETURN no Início vai à tela de listas; só ela pede para sair.
- Decisões do usuário que contrariam o óbvio: chave permanente (não PIN), segredos visíveis na TV e no painel — riscos aceitos, exigem emenda.

**Leitura obrigatória, em ordem**

`spec.md` (26 FR, 8 SC, decisões em Clarifications) → `plan.md` (D-001..D-012, Complexity Tracking, R-001..R-009) → `tasks.md` (7 fases, T001–T043) → `logic/pareamento.md` (MAC, ID gerado, chave, upgrade, sessão manual) → `data-model.md` → `contracts/portal-api-070.md` → `research.md` (MAC no Tizen) → `quickstart.md` → `.planning/memory/constitution.md` (1.9.0 hoje; "Segredos").

**Testes de contrato**

Travados em `contract-tests.lock` (5/5): `tv-web/src/lib/portal/pairingIdentity.entrada-listas-gerenciador.contract.test.ts` (2, Fase 2), `tv-web/src/features/portal/PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx` (1, Fase 3), `tv-web/src/features/import/AddSourceScreen.entrada-listas-gerenciador.contract.test.tsx` (1, Fase 4), `tv-web/src/navigation/appNav.entrada-listas-gerenciador.contract.test.ts` (1, Fase 6). Rodar em `tv-web/`: `npx vitest run <os 4 arquivos>`. Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador`. Vermelho confirmado: C1/C5 `invalid_device_identity`, C2 asserção de valor, C3/C4 `not implemented`. Travas de outras features: **037** (teste 2 — emenda autorizada em T014, regravar só a 037), **045**, **023/024** (appNav/perfis) e **069** devem continuar verdes sem edição.

**Stubs criados**

`lib/portal/displayId.ts` (`displayIdFromMac` lança); `features/portal/PortalPairingPanel.tsx` (props + lança); `navigation/appNav.ts` (ação `leave-list` com `case` que lança — nada a dispara ainda); `lib/portal/portalTables.ts` (`displayId?` opcional por causa do upgrade D-004); `lib/portal/deviceIdentity.ts` (`displayId` no `CredentialIssuance`, ainda ignorado pela allowlist de persistência).

**Armadilhas já mapeadas**

- Fase 1 é bloqueante: nada de US1–US3 antes da constitution 1.10.0 + ADR-014 (D-001); governança diz que a constitution é editada à mão, não por skill.
- `AddSourceScreen.tsx` e `ProfilesScreen.tsx` estão **no teto de 421 linhas** (ratchet): extrair `SourceFormFields.tsx` antes de crescer.
- `features/import` **não pode** importar `features/portal`: o painel entra por slot `phonePanel` montado no `App` (D-008).
- Contrato 045: nenhum segredo no `textContent`/`aria-label` — valor de `<input>` não conta, mas não ecoar URL/usuário em texto auxiliar.
- Contrato 037 teste 1: título "Conecte sua lista IPTV", Xtream por padrão **em foco**, rótulos "Servidor"/"URL M3U"/"Conectar e sincronizar" — não renomear.
- Contrato 023: `back` na base continua no-op; a saída nova é a ação `leave-list`, não mudar `back`.
- C2 exige **um único** botão de olho cujo nome começa por "Ocultar"/"Mostrar".
- Pull da TV é limitado a 1/10 s por dispositivo: Recarregar deve respeitar `Retry-After` (D-011).
- MAC: `webapis.network.getMac()` pode exigir privilégio no `config.xml`; só alterar após a sonda T003 na TV física, sem desinstalar o app.
- pytest do portal: `PORTAL_TEST_FIRESTORE=1`, emulador com Java 21 (`JAVA_HOME` do Android Studio) e `--basetemp` em diretório acessível (o `%TEMP%\pytest-of-johns` dá Access denied).
- Upgrade D-004 roda `revoke`: derruba sessões do portal e a chave antiga — esperado.

**Pendências do Analyze**

- A001 CRITICAL: Segredos violado até T001/T002 (esperado; gate da Fase 1).
- A002 MEDIUM: dois botões "Voltar" na tela composta (painel do celular + ações do formulário); decidir em T013 qual fica (C1 exige "Voltar" no painel).
- A003 MEDIUM: SC-002 (teste com 5 pessoas) e SC-003 (cadastro ≤5 min) sem task — são verificações manuais; incluir no T042 ou aceitar como observação do usuário.
- A004 LOW: SC-001 (≤2 ações até ver ID/chave/QR) não medido explicitamente — medir no E2E T019.

**Gate de pronto**

Contratos 5/5 verdes e travas 070/037/045/023/024/069 íntegras; TV `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `build:tizen`; API pytest (emulador) + Ruff; portal lint/test/build/E2E; E2E `portal-dev-server.mjs`, `entrada-listas-gerenciador.mjs`, `portal-pacote-file.mjs` e `npm run test:e2e` com `npm run dev`; revisão de segredos; docs `docs/portal/operacao.md`/READMEs. Staging (T041) só com confirmação do usuário; TV física (T042) é gate para distribuir, observada pelo usuário.
