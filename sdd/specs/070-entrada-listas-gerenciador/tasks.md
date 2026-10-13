---
description: "Tasks da feature 070 — entrada de listas estilo gerenciador"
---

# Tasks: Entrada de listas estilo gerenciador

**Input**: `sdd/specs/070-entrada-listas-gerenciador/` (spec, plan, research, data-model, contracts/portal-api-070.md, logic/pareamento.md, quickstart)

**Prerequisites**: plan.md, spec.md; Fase 1 (gate normativo) bloqueia todas as stories.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- TV: `tv-web/src/` (App, `navigation/`, `components/`, `features/{import,portal,profiles,home,settings}/`, `lib/{portal,catalog,i18n}/`); E2E em `tv-web/e2e/*.mjs`; pacote em `CCPlayTv/`.
- Portal web: `portal-web/src/features/`, E2E em `portal-web/e2e/`.
- API do portal: `api/app/portal/` (rotas em `routes/`), testes em `api/tests/portal/` com emulador.
- Normas: `.planning/memory/constitution.md`, `sdd/adr/`.

## Phase 1: Gate normativo e plataforma (bloqueante)

**Objetivo**: formalizar as exceções aceitas pelo usuário e provar a leitura do MAC antes de qualquer tela.

- [X] T001 Emendar `.planning/memory/constitution.md` 1.9.0 → 1.10.0 (MINOR) nas três cláusulas de "Segredos" conforme D-001: chave do dispositivo sempre visível **só** na tela Adicionar da TV; painel autenticado da mesma TV recebe valores salvos; TV mostra credencial local na edição/digitação com olho. Manter proibições de log/URL/QR/cards/erros/exportação. Registrar Sync Impact Report no topo. (FR-024)
- [X] T002 Registrar `sdd/adr/ADR-014-*.md` via `sdd-adr` (ID formato MAC, chave numérica permanente, valores salvos ao painel, riscos aceitos R-004/R-005 e mitigações); anotar `**Atualização (ADR-014):**` na ADR-013. (FR-024)
- [ ] T003 Estender `tv-web/src/lib/portal/platformProbe.ts` para medir `webapis.network.getMac()` (existência, valor normalizado, erro) e rodar na TV física sem desinstalar; registrar em `evidencias/plataforma.md` se o privilégio `network.public` é necessário. Só então decidir T017. (FR-025, R-003)

**Critério de Conclusão**: constitution 1.10.0 e ADR-014 aprovados pelo usuário; resultado do MAC na TV registrado (disponível, exige privilégio ou indisponível).

**Registro da Fase**:

- Status: Parcial — gate normativo concluído; medição do MAC na TV física pendente (T003).
- Feito: constitution 1.9.0 → 1.10.0 com a exceção de pareamento estilo gerenciador (a/b/c) e relatório de impacto; ADR-014 criada e ADR-013 anotada; CLAUDE.md atualizado (versão 1.10.0, tabela de ADRs até 014). Sonda `platformProbe.ts` mede `webapis.network.getMac()` sem colocar o MAC no relatório.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/lib/portal/platformProbe.test.ts` → 4/4 PASS; `npx tsc -b` limpo.
- Pendências: T003 exige instalar na TV um build com a sonda e o coletor da LAN (`infra/portal/dev/platform-probe-server.mjs`) — não executado sem autorização do usuário; a alternativa sem build de diagnóstico é observar `display_id_source` no staging depois da T041/T042. T017 (privilégio no `config.xml`) segue condicionada a isso. Aprovação do texto da emenda/ADR pelo usuário: aplicado conforme a decisão de 2026-10-13, revisão do texto fica no relatório.

---

## Phase 2: Fundação — ID do dispositivo e chave numérica

**Objetivo**: servidor e TV emitem, validam e persistem `displayId` + chave de 10 dígitos, com upgrade das TVs antigas.

### Contrato da Fase

- `normaliza variantes de MAC para XX:XX:XX:XX:XX:XX e recusa ausente, inválido, zerado, broadcast e multicast` — FR-003
- `persiste ID exibido e chave numérica de 10 dígitos; recusa chave fora do formato e ID fora do padrão` — FR-003/004, Constitution: Segredos
- Comando (em `tv-web/`): `npx vitest run src/lib/portal/pairingIdentity.entrada-listas-gerenciador.contract.test.ts`

### Implementation

- [X] T004 [P] Criar `api/app/portal/display_id.py` (normalização + geração local/unicast + claim) e campos `display_id`/`display_id_source` em `api/app/portal/models.py`, `DisplayIdClaimDocument`, conforme `logic/pareamento.md` §2 e `data-model.md`. (FR-003)
- [X] T005 Gerar chave `^\d{10}$` (CSPRNG) em `api/app/portal/enrollment.py` e `api/app/portal/access_rotation.py` (rotação `revoke`), incluindo `displayId` nas credenciais emitidas; upgrade D-004 na rotação cria `display_id`/claim se faltar; `POST /devices/enroll` aceita `mac?` em `api/app/portal/routes/auth.py`. (FR-003, FR-004, FR-005)
- [X] T006 Trocar `manual_session` em `api/app/portal/auth.py` e o corpo de `/sessions/manual` em `routes/auth.py` para `displayId` + chave, com limites chaveados por `hmac(displayId)` e recusa uniforme (`logic/pareamento.md` §5). (FR-016, FR-022)
- [X] T007 Implementar `displayIdFromMac` em `tv-web/src/lib/portal/displayId.ts` e a validação/persistência de `displayId` + chave numérica em `tv-web/src/lib/portal/deviceIdentity.ts` (allowlist). → contratos C4, C5
- [X] T008 Enviar `mac` (via `displayIdFromMac(webapis.network.getMac())` em `try/catch`) no cadastro em `tv-web/src/lib/portal/portalConnection.ts`/`portalRuntime.ts`, e implementar o upgrade D-004 (uma rotação `revoke` quando o registro local é antigo). (FR-003, R-006)

### Testes da Fase

- [X] T009 Criar `api/tests/portal/test_pairing.py`: MAC válido vira ID; MAC duplicado/zerado/multicast → ID gerado local/unicast; chave 10 dígitos e só HMAC salvo; sessão manual por displayId; chave errada/ID inexistente/formato inválido → mesmo 401; limite → 429; `revoke` troca a chave, mantém o ID e derruba sessões; upgrade de device antigo. (FR-003/004/005/016/022, SC-008)
- [X] T010 [P] Testes adicionais em `tv-web/src/lib/portal/portalConnection.test.ts` e `deviceIdentity` (upgrade dispara uma rotação; `getMac` lançando não quebra o cadastro).

**Critério de Conclusão**: contratos C4/C5 2/2 verdes e `check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador` íntegro; `pytest tests/portal` com emulador e Ruff verdes; nenhuma credencial em log.

**Registro da Fase**:

- Status: Concluída.
- Feito: servidor — `display_id.py` (normalização, ID local/unicast, pré-escolha com revalidação na transação, chave CSPRNG de 10 dígitos), `DeviceDocument.display_id/_source`, `DisplayIdClaimDocument`, `AccessIntentDocument.display_id`; cadastro aceita `mac` e grava ID + claim; rotação `revoke`/`rotate`/recuperação emite chave de 10 dígitos e faz o upgrade D-004; sessão manual por ID exibido (minúsculas/hífens aceitos), limites chaveados pelo HMAC do ID e recusa uniforme. TV — `displayIdFromMac`, validação/persistência de `displayId` e chave (aceita o token legado para não quebrar com serviço anterior à 070), MAC no cadastro e na rotação, `ensurePairing()` (uma rotação `revoke` para registro antigo), `getMac` no runtime.
- Contrato: `npx vitest run src/lib/portal/pairingIdentity.entrada-listas-gerenciador.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: API `pytest tests/portal` (emulador, `--basetemp` acessível) → **117 passed** (61,7 s), inclui `test_pairing.py` 6/6 (1ª rodada: 1 falha do próprio teste — fiz 4 tentativas para um limite de 5; corrigido); Ruff PASS. TV `npx vitest run src/lib/portal` → 57/57; `npx tsc -b` limpo; `npm run lint` OK (arquitetura sem violação).
- Pendências: o staging continua emitindo a chave longa até a T041; a TV aceita esse formato legado (R-010). Testes antigos da API (`test_auth.py`, `test_secrets.py`) migrados para ID exibido + chave numérica.

---

## Phase 3: User Story 1 — Adicionar lista pelo celular (Priority: P1) 🎯 MVP

**Objetivo**: a tela "Conecte sua lista IPTV" mostra, sem ação extra, ID, chave, endereço e QR, com Voltar e Recarregar.

**Independent Test**: abrir "Adicionar lista", ver ID/chave/URL/QR, entrar no portal pelo QR e por ID + chave, criar lista e vê-la na TV com Recarregar.

### Contrato da Fase

- `mostra ID no formato MAC, chave de 10 dígitos, endereço do painel e QR sem ação extra; a chave nunca vai na requisição do convite` — US1/AC1, FR-002/003/004/023
- Comando (em `tv-web/`): `npx vitest run src/features/portal/PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx`

### Implementation

- [X] T011 [US1] Implementar `tv-web/src/features/portal/PortalPairingPanel.tsx`: lê o dispositivo (liveQuery), gera convite ao montar e renova só enquanto montado (D-012), exibe ID/chave/endereço/QR, Voltar e Recarregar, "Gerar nova chave" com confirmação (rotação `revoke`), estados sem portal/offline/erro focáveis com código de erro; textos em `tv-web/src/lib/i18n/messages/portal.ts` (pt/en/es). → contrato C1 (FR-002/004/005/006/007)
- [X] T012 [US1] Adicionar `syncNow()` em `tv-web/src/lib/portal/portalAgent.ts` (ciclo imediato, mesmo mutex, respeita `Retry-After`/pull 10 s) usado por Recarregar. (FR-006, D-011)
- [X] T013 [US1] Reorganizar `tv-web/src/features/import/AddSourceScreen.tsx` em duas colunas: slot `phonePanel?: ReactNode` à esquerda no lugar do mock e de "Como funciona"; extrair campos para `tv-web/src/features/import/SourceFormFields.tsx` (teto 421 linhas). Manter título, tipo Xtream por padrão em foco e rótulos (contratos 037 teste 1 e 045). (FR-001/002/007, D-007/D-008)
- [X] T014 [US1] **Emenda autorizada (2026-10-13, R-002)** do teste 2 de `tv-web/src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx`: sem `phonePanel`, a coluna do celular mostra estado honesto e focável, sem ID/chave/QR/endereço inventados; regravar só a trava 037 (`check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo -Write`) e anotar R-00X no `plan.md` da 037.
- [X] T015 [US1] Em `tv-web/src/App.tsx`, passar `<PortalPairingPanel connection={getPortalConnection()} … />` ao `AddSourceScreen` (cadastro), e reagir a Recarregar (lista nova → foco por id nos perfis).
- [X] T016 [US1] Remover o canto "Adicionar pelo site" de `tv-web/src/features/profiles/ProfilesScreen.tsx` e o wiring `onOpenPortal` dos perfis em `App.tsx`; ajustar `ProfilesScreen.test.tsx` (testes 069). Configurações → "Portal & licença" permanece. (FR-001, D-009)
- [ ] T017 [US1] Somente se T003 provar necessidade: privilégio `network.public` em `CCPlayTv/config.xml` (e arquivos listados em `tizen_web_project.yaml`, se mudarem). (FR-025)

- [X] T044 [US1] (ad-hoc, descoberta na T019) `portal-web/src/features/api.ts`: a sessão manual passa a enviar `displayId` — a T006 mudou o corpo exigido pela API e o login manual do site daria 422 até a Fase 5. Rótulos/olho do login ficam para a T027.
- [X] T045 [US1] (ad-hoc, descoberta na T016) E2E que clicavam no canto removido "Adicionar pelo site" (`portal-configuracao`, `licenca-anual`, `portal-dev-server`, `portal-integrado-local`, `portal-pacote-file`) passam a abrir Configurações → "Portal & licença" pelo controle via `tv-web/e2e/lib/portal.mjs`; o mock `pair-phone` saiu do registro de "Em breve" (`lib/comingSoon.ts`, traduções e teste), e o subtítulo do cadastro deixou de dizer "chega em breve".

### Testes da Fase

- [X] T018 [P] [US1] Testes em `tv-web/src/features/portal/PortalPairingPanel.test.tsx`: sem portal (estado honesto focável), offline, QR renova só montado, "Gerar nova chave" exige confirmação, Recarregar com sucesso/erro com código.
- [X] T019 [US1] E2E `tv-web/e2e/entrada-listas-gerenciador.mjs` sobre `e2e/lib/portalStack.mjs`: Adicionar mostra ID/chave/QR; portal entra por ID + chave; cria lista; Recarregar aplica; registrar no `run.mjs` como opt-in (fora do SUITE se exigir emulador).

**Critério de Conclusão**: contrato C1 1/1 verde, trava 070 íntegra e trava 037 regravada só pela emenda autorizada; contratos 037 teste 1, 045 e 023 verdes; E2E T019 PASS.

**Registro da Fase**:

- Status: Concluída (T017 condicionada à sonda T003, não executada).
- Feito: `PortalPairingPanel` real (ID/chave/endereço/QR sem ação extra, convite renovado só montado, tela rápida, Recarregar via `syncNow`, "Gerar nova chave" com confirmação, estados sem portal/erro com código, i18n pt/en/es, CSS só com tokens); `PortalAgent.syncNow()` + registro no runtime; `AddSourceScreen` em duas colunas com slot `phonePanel` (sem "Como funciona" e sem mock; um só "Voltar"), campos extraídos para `SourceFormFields.tsx` (354 linhas, abaixo do teto); `App` monta o painel na rota `add-source`; canto "Adicionar pelo site" removido dos perfis (↓ da linha de ações chega a "Configurações"); emenda autorizada do teste 2 da 037 e trava 037 regravada (R-010 da 037); mock `pair-phone` removido do registro "Em breve"; subtítulo atualizado; T044/T045 ad-hoc.
- Contrato: C1 `npx vitest run src/features/portal/PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx` → 1/1 verde; contratos 070 das fases 2–3 → 3/3; travas 070, 037 (regravada só pela emenda), 045, 023, 024 e 069 íntegras.
- Testes executados: painel 4/4 (`PortalPairingPanel.test.tsx`); agente 59/59 em `src/lib/portal`; `AddSourceScreen.test.tsx` 18/18 (3 testes do mock antigo reescritos); perfis 63/63 + App; `npm run test` completo → **3319/3323** (4 falhas: C2 e C3, das fases 4 e 6 — esperadas — e 2 em `licenseRuntime.test.ts`, ver pendências); `npx tsc -b` limpo; `npm run lint` OK. E2E: `node e2e/entrada-listas-gerenciador.mjs` PASS de primeira (SC-001: 1 ação até ID/chave/URL/QR; login por ID + chave; lista aplicada; nova chave recusa a antiga); `portal-configuracao` PASS (59 s), `licenca-anual` PASS (23 s), `portal-integrado-local` PASS (70 s), `portal-dev-server` PASS após trocar a expectativa da chave para 10 dígitos.
- Pendências: (1) **instabilidade aberta**: `src/lib/licensing/licenseRuntime.test.ts` falhou 2/3 casos na suíte completa (1º por timeout de 5 s no `import()` dinâmico após `resetModules`, 2º em cascata) e passa 3/3 isolado (~1,1 s); não importa nada alterado pela 070 — registrar e acompanhar no gate final. (2) T017 e T003 dependem de instalar a sonda na TV. (3) `entrada-listas-gerenciador.mjs` e `portal-dev-server.mjs` exigem emulador/API locais e ficam fora do `SUITE` do runner (opt-in). (4) O pacote `CCPlayTv/` ainda é o comercial anterior à 070 — não reinstalado na TV nesta fase.

---

## Phase 4: User Story 2 — Formulário grande na TV (Priority: P1)

**Objetivo**: campos grandes, texto visível por padrão com um olho, edição com valores salvos.

**Independent Test**: cadastrar Xtream e M3U só com o controle vendo o texto; editar e ver os valores salvos; olho oculta e reexibe.

### Contrato da Fase

- `editar lista Xtream mostra servidor, usuário e senha salvos em texto visível; o olho oculta e reexibe os três` — US2/AC1-AC3, FR-010/011
- Comando (em `tv-web/`): `npx vitest run src/features/import/AddSourceScreen.entrada-listas-gerenciador.contract.test.tsx`

### Implementation

- [X] T020 [US2] Permitir em `tv-web/src/components/TextField.tsx` revelação controlada pelo formulário (`masked` controlado, valendo para `url`/`username`/`password`), sem quebrar o uso atual; olho único do formulário em `SourceFormFields.tsx` com rótulos "Ocultar dados"/"Mostrar dados" (pt/en/es em `messages/sources.ts`). → contrato C2 (FR-010, D-007)
- [X] T021 [US2] Acessor de leitura (`readSourceFormFields`, em `tv-web/src/lib/catalog/sourceFormFields.ts` — arquivo próprio: `sourceRepository.ts` estava no teto de 409 linhas) e hook `useStoredSourceFields` em `tv-web/src/features/import/` que pré-preenche a edição com `providerDns`/`providerUsername`/`providerPassword`/`m3uUrl` locais. → contrato C2 (FR-011)
- [X] T022 [US2] Campos grandes via tokens V14 em `tv-web/src/styles/onboarding.css` (texto em `--fs-body-lg`, sem literal de cor/fonte/raio), sem rolagem horizontal; URL longa rola dentro do campo. (FR-008, FR-012)

### Testes da Fase

- [X] T023 [P] [US2] Testes em `tv-web/src/features/import/AddSourceScreen.test.tsx` (olho único, edição Xtream/M3U com valores salvos, salvar sem mexer não reenvia nem confirma conexão) e `tv-web/src/components/TextField.masked.test.tsx`; contratos 037/045 verdes sem edição. Done do IME segue coberto pelo contrato 045 e por `ime-formularios.mjs`.
- [X] T024 [US2] Cadastro já era auditado em `tv-web/e2e/legibilidade-tv.mjs`; adicionado o passo "Edição de lista" (valores salvos visíveis) em pt/en/es (≥20 px, sem corte). (SC-004)
- [X] T046 [US2] (ad-hoc, descoberta na fase) `tv-web/e2e/ime-formularios.mjs` cenário 8 reescrito para o olho do formulário ("Ocultar dados"; dados visíveis por padrão e voltam visíveis ao reabrir); removidas 14 chaves i18n mortas da Fase 3 (`add.how.*`, `add.service*`, `add.soon`, `add.phone*`, `add.available`) para caber no teto de `messages/sources.ts`.

**Critério de Conclusão**: contrato C2 1/1 verde e trava íntegra; contratos 037/045 verdes; legibilidade PASS.

**Registro da Fase**:

- Status: Concluída.
- Feito: `TextField` ganhou `masked` (controlado pelo formulário; `undefined` mantém o `revealable` de sempre); `SourceFormFields` com **um** olho ("Ocultar dados"/"Mostrar dados", `aria-pressed`) que mascara Servidor/URL, Usuário e Senha — dados nascem visíveis, estado só na tela (nada persistido); edição lê os valores salvos por `readSourceFormFields` + `useStoredSourceFields` e os mostra; valor igual ao salvo segue o caminho de "em branco" (sem nova confirmação de conexão, sem regravar o segredo); "Deixe em branco para manter" só aparece onde não há valor salvo; campos em `--fs-body-lg`. i18n pt/en/es (olho + subtítulo da edição).
- Contrato: `npx vitest run src/features/import/AddSourceScreen.entrada-listas-gerenciador.contract.test.tsx` → 1/1 verde; travas 070, 037, 045, 023, 024 e 069 íntegras (`check-contract-tests.ps1`, 5/5 cada).
- Testes executados: `npx vitest run src/features/import src/components/TextField src/features/portal src/lib/portal` → 35 arquivos / 186 testes PASS (inclui 3 testes antigos ajustados: tipo da senha no cadastro, subtítulo da edição, ordem de foco com o olho); `npx tsc -b` limpo; `npm run lint` exit 0 (1ª rodada: 2 violações de teto — `sourceRepository.ts` 424>409 e `messages/sources.ts` 680>674 — corrigidas movendo o acessor e removendo chaves mortas; 1 aviso novo `set-state-in-effect` trocado pelo ajuste de estado na renderização). E2E: `node e2e/run.mjs --only ime-formularios,legibilidade-tv` 2/2 PASS (legibilidade com o passo "Edição de lista"); `--only fontes-estado,categorias-controle-parental,configuracoes-lista-global,home-busca-configuracoes` 4/4 PASS.
- Pendências: legibilidade mede o texto dos campos, mas o aceite visual do formulário grande na TV física fica no quickstart (T042). `useEnterSimilarPanel`/`Modal` e outros avisos de lint são pré-existentes.

---

## Phase 5: User Story 3 — Painel gerenciador (Priority: P2)

**Objetivo**: painel com ID/status/validade/pagamento, lista de listas, edição com valores salvos e entrada por ID + chave.

**Independent Test**: no portal, entrar por ID + chave, ver cabeçalho, criar/editar (vendo valores salvos)/remover listas.

### Implementation

- [X] T025 [US3] Rota `GET /portal/v1/configurations/{sourceId}/values` em `api/app/portal/routes/operations.py` reaproveitando a decifragem de `configuration_delivery.py` (D-006, `contracts/portal-api-070.md`). (FR-015, FR-021)
- [X] T026 [US3] `GET /portal/v1/session/device` devolve `displayId` e licença (`state`, `expiresAt`) em `api/app/portal/routes/licensing.py`/`operations.py`. (FR-013)
- [X] T027 [US3] `portal-web/src/features/SessionPage.tsx` + `api.ts`: "ID do dispositivo" (`XX:XX:XX:XX:XX:XX`, normaliza minúsculas/hífens) e "Chave do dispositivo" (numérica, visível com olho), erro uniforme. (FR-016)
- [X] T028 [US3] Cabeçalho do gerenciador (ID, status, validade, ativar por pagamento reaproveitando `LicensePage`) em `portal-web/src/features/SourceManager.tsx`/`App.tsx`. (FR-013)
- [X] T029 [US3] `portal-web/src/features/SourceForm.tsx`: na edição busca `values`, mostra salvos visíveis com olho, campos grandes; tipo explícito mantido. (FR-015, FR-010)
- [X] T030 [US3] Lista de listas com tipo, nome e estado e ações incluir/editar/remover em `SourceManager.tsx`. (FR-014, FR-017)

### Testes da Fase

- [X] T031 [US3] Criar `api/tests/portal/test_configuration_values.py`: dono recebe; outra TV/sem sessão/sessão revogada → 401/404; fonte excluída → 404; `Cache-Control: no-store`; marcador fictício ausente de logs. (FR-021, SC-006)
- [X] T032 [P] [US3] `portal-web` unit + `portal-web/e2e/gerenciador.spec.ts` (login ID+chave, cabeçalho, edição com valores, olho).

**Critério de Conclusão**: T031/T032 verdes; portal lint/test/build/E2E verdes; nenhum segredo em log/URL.

**Registro da Fase**:

- Status: Concluída.
- Feito: rota `values` com decifragem transitória, allowlist por tipo, mesmo dono, tombstone/ID inválido como 404 e `no-store`; `session/device` agora retorna `displayId` e licença. Portal: entrada manual por ID MAC normalizado + chave numérica com olho e erro uniforme; cabeçalho mostra ID/status/validade e abre o fluxo de licença; lista mantém tipo/estado e ações; edição busca os valores salvos da própria TV, mostra-os visíveis e alterna todos com um olho.
- Contrato: sem contrato novo nesta fase; trava 070 íntegra (5/5), travas dependentes preservadas.
- Testes executados: API `tests/portal/test_configuration_values.py` → 3/3; API `tests/portal` → **120 passed**; Ruff `app/portal tests/portal` PASS. Portal `npm.cmd run test` → 6/6; `npm.cmd run lint` PASS; `npm.cmd run build` PASS; `npm.cmd run test:e2e` → **14 passed** (inclui `gerenciador.spec.ts` e edição com valores/olho).
- Pendências: T003/T017 (sonda MAC/privilégio) e validação física T042 continuam abertas; staging T041 ainda não publicado.

---

## Phase 6: User Story 4 — Saída sempre pela tela de listas (Priority: P2)

**Objetivo**: RETURN em cadeia termina nos perfis; só lá pede para sair.

**Independent Test**: de qualquer tela, RETURN repetido chega aos perfis antes do "Sair do CCPlayTV?".

### Contrato da Fase

- `RETURN no Início sai da lista para a tela de listas como base, com foco na lista que estava aberta; lá a pilha acaba` — US4/AC1-AC2, FR-018/019
- Comando (em `tv-web/`): `npx vitest run src/navigation/appNav.entrada-listas-gerenciador.contract.test.ts`

### Implementation

- [X] T033 [US4] Implementar `leave-list` em `tv-web/src/navigation/appNav.ts` (`profilesAsBase(activeSource.id)`), mantendo `back` na base como no-op (contrato 023). → contrato C3
- [X] T034 [US4] `tv-web/src/features/home/HomeScreen.tsx`: RETURN chama `onLeaveList` (sem `ExitModal`); wiring em `App.tsx`; atualizar `HomeScreen.test.tsx` (FR-019 antigo). (FR-018/019, R-009)
- [X] T035 [US4] Confirmar que a abertura cai nos perfis (splash → perfis base) e que nenhuma outra tela abre `ExitModal`; teste em `tv-web/src/App.test.tsx` da cadeia player → detalhe → Início → perfis. (FR-020, SC-007)

### Testes da Fase

- [X] T036 [US4] Roteiro RETURN em cadeia no E2E (`entrada-listas-gerenciador.mjs` ou script de navegação existente).

**Critério de Conclusão**: contrato C3 1/1 verde, contratos 023/024 do `appNav` verdes, trava íntegra.

**Registro da Fase**:

- Status: Concluída.
- Feito: `leave-list` zera a pilha e transforma o Início em perfis base com `focusSourceId` estável; o Início não abre mais `ExitModal` e passa a delegar RETURN para `onLeaveList`; wiring em `App.tsx`; nenhuma outra tela foi alterada para abrir uma saída antecipada. O roteiro local também cobre a cadeia Início → perfis e o foco da lista ativa.
- Contrato: C3 `npx vitest run src/navigation/appNav.entrada-listas-gerenciador.contract.test.ts` → 1/1; contratos 023/024 e trava 070 íntegros (5/5).
- Testes executados: Home/App/contrato de navegação → **17/17**; `node e2e/entrada-listas-gerenciador.mjs` → **PASS** (SC-001, entrada manual, lista aplicada, rotação de chave e RETURN em cadeia).
- Pendências: T003/T017 (sonda/privilégio dependentes da TV), T041 (staging com confirmação) e T042 (observação na TV física) continuam abertas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T037 Revisão de segredos com marcadores fictícios (DOM, URL, QR, logs da API, cabeçalhos de cache, erros) — `evidencias/segredos.md`. (SC-006, Constitution: Fluxo)
- [X] T038 Atualizar `docs/portal/operacao.md` (entrada por ID + chave, rotação, rota `values`), `infra/portal/README.md` e `README.md` se citarem o fluxo antigo.
- [ ] T039 Gates: TV `tsc`/lint/`npm run test`/build/`build:tizen`; API pytest + Ruff; portal lint/test/build/E2E; travas 070/037/045/023/024/069 íntegras.
- [X] T040 `npm run test:e2e` completo com `npm run dev`, mais `portal-dev-server.mjs`, `portal-pacote-file.mjs` e `entrada-listas-gerenciador.mjs`.
- [X] T041 Publicar API e portal-web no staging (**ação externa: pedir confirmação do usuário**) e repetir o E2E do pacote contra o staging.
- [ ] T042 TV física (quickstart): instalar comercial sem desinstalar, conferir upgrade D-004, MAC ou ID gerado, passos 1–7; `evidencias/tv.md`.
- [X] T043 Backlog/status via scripts; `plan.md` Estado Atual/Execution Notes.

### Registro do Polish (checkpoint contínuo)

- Status: parcial; T037/T038/T040/T041 concluídas. T039 continua aberta por
  instabilidade da suíte Vitest; T042 continua dependente da TV física.
- Evidência: `evidencias/segredos.md`; documentação operacional atualizada em
  `docs/portal/operacao.md`, `infra/portal/README.md` e `README.md`.
- Gates: TV `tsc`, lint, build e `build:tizen` PASS; Vitest completo
  `3327/3330` (as três falhas passam isoladamente: `progressRecorder` 6/6 e
  `licenseRuntime` 3/3); E2E dev completo **49/49**, `portal-dev-server.mjs`,
  `entrada-listas-gerenciador.mjs` e `portal-pacote-file.mjs` PASS. API/Ruff e
  portal 120/120, 6/6, lint/build e E2E 14/14 já passaram no checkpoint da
  Fase 5. Staging publicado na revisão `ccplaytv-portal-00014-tr5`, Cloud
  Build `93e3daf1-2742-44ee-a1c8-c46f8884ad7c`, com smoke 200/200/401 e zero
  marcadores sensíveis nos 100 logs consultados (`evidencias/staging.md`).
- Pendências: T003/T017 (sonda/privilégio), T039 (Vitest sob carga), T042 (TV
  física) e T043 (fechamento do backlog/estado).

### Checklist de Release

- [ ] Fase 1 (constitution 1.10.0, ADR-014, sonda MAC) concluída — normas OK; sonda na TV pendente
- [X] Fase 2 (ID + chave) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (070, 037 emendada, 045, 023, 024, 069)
- [X] E2E no dev server e no pacote `file://` aprovados antes da TV
- [X] Revisão de segredos aprovada
- [X] Staging publicado com confirmação do usuário
- [ ] TV física: quickstart observado pelo usuário

---

## Dependencies & Execution Order

- Fase 1 bloqueia tudo (normativo). T003 decide T017.
- Fase 2 depende da 1 e bloqueia US1 (ID/chave) e US3 (sessão manual).
- US1 (Fase 3) e US2 (Fase 4) são P1; US2 depende só de T013 (extração de `SourceFormFields`).
- US3 (Fase 5) depende da Fase 2; US4 (Fase 6) é independente das outras stories (só da Fase 1).
- Polish depois das stories; T041 e T042 exigem confirmação/observação do usuário.

## Implementation Strategy

MVP = Fases 1–3 (o painel do celular resolve o "acesso confuso"). Em seguida US2 e US4 (baratas, só TV), depois US3 (servidor + portal). Cada fase fecha com contratos, testes e o E2E da pilha local antes de qualquer instalação na TV.

## Notes

- Nunca editar arquivos de contrato travados; a única emenda autorizada é a do teste 2 da 037 (T014).
- Ratchet: sem import novo feature→feature; `AddSourceScreen`/`ProfilesScreen` no teto de 421 linhas.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
