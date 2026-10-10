---
description: "Tasks da feature 067 — Configurações da lista × globais, PIN por lista"
---

# Tasks: Separar configurações da lista das configurações globais do app

**Input**: Documentos de design de `sdd/specs/067-configuracoes-lista-global/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/pin-por-lista.md, logic/navegacao-lista.md, contract-amendments/

**Organization**: Tasks agrupadas por user story. A ordem de fases não segue P1→P3 à risca: a Fase 2 (PIN por lista) é fundação, porque as abas da tela da lista (US1) e todos os pedidos de PIN dependem da API nova.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence

## Path Conventions

- Frontend único em `tv-web/src/` (`features/` telas · `components/` UI compartilhada · `lib/` dados sem UI · `navigation/` rotas puras); comandos rodam em `tv-web/`.
- Roteiros E2E em `tv-web/e2e/*.mjs`; catraca em `tv-web/scripts/architecture-baseline.json`.
- Scripts SDD em `.planning/scripts/powershell/`, rodados da raiz do repositório.

---

## Phase 1: Setup — emendas autorizadas dos contratos travados

**Purpose**: aplicar a decisão do usuário (R-001, D-011) antes de qualquer código, para que as travas da 026/066 reflitam a regra nova.

- [ ] T001 Confirmar que a 066 está convergida em `.planning/backlog.md` (`## Features`); se não estiver, **parar** e avisar o usuário (a 067 começa depois dela). Rodar a linha de base: os 5 contratos da 067 vermelhos pelos motivos de `plan.md` → Estratégia de Testes; `npx tsc -b` e `npm run lint` limpos.
- [ ] T002 Copiar **verbatim** os 3 arquivos de `sdd/specs/067-configuracoes-lista-global/contract-amendments/` por cima de `tv-web/src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`, `tv-web/src/lib/parental/pin.categorias-controle-parental.contract.test.ts` e `tv-web/src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts`. Nenhuma outra edição nesses arquivos.
- [ ] T003 Regravar as travas com **todos** os arquivos de cada feature (o `-Write` grava só os caminhos passados): `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14 -Write -Paths <os 4 arquivos do lock da 026>` e `-Slug 066-categorias-controle-parental -Write -Paths <os 3 arquivos do lock da 066>`; conferir que ambas dizem 5/5. Anexar nota `**Emenda (067):**` no `## Riscos e Decisões` do `plan.md` da 026 e da 066 citando R-001 da 067.

**Critério de Conclusão**: as 3 travas (026, 066, 067) íntegras; os contratos emendados vermelhos pelo motivo da tabela do `plan.md` (026: não acha "Configurar"; 066: `not implemented`); `categoryAccess` US1 e `PinPrompt` continuam verdes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 2: Foundational — PIN por lista e migração (US3 em dados)

**Purpose**: a API `lib/parental/listPin.ts`, a tabela v21 e a migração. Bloqueia as Fases 3–5.

**⚠️ CRITICAL**: nenhuma tela muda antes desta fase terminar.

### Contrato da Fase

- `US3/AC1..AC5, FR-017/FR-018/FR-023/FR-025: cada lista tem o seu PIN…` — US3
- `FR-024/SC-005: o PIN único da 066 vira o PIN de cada lista…` — FR-024
- Emendas da 066: `pin.categorias-controle-parental.contract.test.ts` (1) e `categoryAccess.categorias-controle-parental.contract.test.ts` (3)
- Comando: `npx vitest run src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts`

### Implementation

- [ ] T004 [P] Módulo puro `tv-web/src/lib/catalog/adultCategory.ts` com `isAdultCategoryName`, `ADULT_NAME`, `normalizeForSearch` (movida de `catalogSearch.ts`, que a reexporta) e a regra de bloqueio salvo sem `Rule`; `categoryAccess.ts` passa a importar de lá (`logic/pin-por-lista.md` §4, R-003).
- [ ] T005 Dexie v21 em `tv-web/src/lib/catalog/dbSchema.ts` (`parentalPins: 'sourceId'`, `parentalPin` continua declarada) com `.upgrade((tx) => migrateLegacyPin(tx))`; `ParentalListPinRecord` e `parentalPins(database)` em `tv-web/src/lib/catalog/parentalTables.ts` (data-model.md).
- [ ] T006 Implementar `tv-web/src/lib/parental/listPin.ts` (§2: `hasPin`, `verifyPin`, `enableParentalControl`, `changePin`, `disableParentalControl`, `recoverPinWithSource`, `pinActiveHint`, `syncPinHints`) reaproveitando o hash de `pin.ts` sem mudar o esquema (D-003); espelho `ccplay.parental.pinSources` (§3) → contrato: `US3/AC1..AC5…`
- [ ] T007 Implementar `tv-web/src/lib/parental/pinMigration.ts` (§4, pseudocódigo) → contrato: `FR-024/SC-005…`
- [ ] T008 `tv-web/src/lib/catalog/categoryAccess.ts`: `loadRule` lê `parentalPins.get(sourceId)`; `unlockWithPin` usa `verifyPin(sourceId, pin)` → contratos emendados da 066.
- [ ] T009 `tv-web/src/lib/catalog/sourceRepository.ts`: `deleteSource` apaga `parentalPins` da lista e tira o id do espelho (FR-025) sem crescer o arquivo (teto 409, R-002) → contrato: `US3/AC1..AC5…`
- [ ] T010 Remover as funções globais de `tv-web/src/lib/parental/pin.ts` e migrar **todos** os chamadores para `listPin.ts` com o `sourceId` certo (tabela de `logic/pin-por-lista.md` §5): `components/ParentalGate.tsx` (prop `sourceId?`; ausente = abre direto, FR-021), `navigation/routeModules.ts` (`withParentalGate` passa `props.existingSource?.id`), `features/sources/DeleteSourceModal.tsx`, `components/ParentalPinPrompt.tsx` + `components/RecoverPinFlow.tsx` (`sourceId`), `components/LockedCategoryState.tsx` (recebe `sourceId`; troca de prop sem linha nova em `features/live/liveColumns.tsx` e `features/vod/VodCategoryScreen.tsx`), `features/settings/parental/ParentalFlow.tsx`, `features/settings/tabs/ParentalTab.tsx` (por enquanto com `activeSourceId`; a Fase 3 troca o alvo), `features/catalog/categoryAccessApi.ts` (`syncPinHints()` no lugar de `hasPin()`).

### Testes da Fase

- [ ] T011 [P] Upgrade real v20→v21 com PIN legado (padrão de `tv-web/src/lib/catalog/db.test.ts`: abre um Dexie com as stores da v20, grava `parentalPin/'pin'` e categorias, reabre como `CatalogDb`) — a lista com categoria bloqueada aceita o PIN antigo antes de qualquer outra leitura.
- [ ] T012 [P] Espelho por lista: `pinActiveHint(id)` depois de ligar/desligar/excluir; `syncPinHints` remove a chave antiga `ccplay.parental.pinActive` (em `tv-web/src/lib/parental/listPin.test.ts`).
- [ ] T013 [P] `ParentalGate` (adicionar lista não pede PIN; editar lista com PIN pede o dela) e `DeleteSourceModal` (lista sem PIN remove na hora; com PIN pede o dela) — testes de componente ao lado de cada arquivo.

**Critério de Conclusão**: comando do contrato da fase → 2/2 (067) + 1/1 + 3/3 (066 emendados) verdes; travas da 066 e 067 íntegras; `PinPrompt` contrato verde; `npx tsc -b`, `npm run lint` (tetos!) e `npx vitest run src/lib src/components src/features/sources src/navigation` verdes; contratos 023/026 da tela de perfis/Configurações (Excluir sem PIN imediato) verdes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 — Configurações da lista (Priority: P1) 🎯 MVP

**Objetivo**: a tela da lista, aberta pelo cartão de perfis, com as 4 abas aplicadas à lista da tela.

**Independent Test**: com A ativa, abrir "Configurar" no cartão de B, esconder uma categoria e limpar o histórico de B; conferir em B e que A não mudou (quickstart 1–7).

### Contrato da Fase

- `abre para uma lista que não é a ativa, … Histórico limpando só ESTA lista` — US1/AC2+AC4, FR-001/002/003/007
- `reabre na aba e ação guardadas (EPG) e entrega aba+ação …` — FR-005, FR-009
- Comando: `npx vitest run src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx`

### Implementation

- [ ] T014 [US1] Extrair de `tv-web/src/features/settings/SourcesPanel.tsx` um `SourceInfo` (nome, tipo, "Lista ativa", sincronização, conta, contagens, Modo limitado) e exportar `SourceEpgStatus`, para a linha global e as abas da lista (`logic/navegacao-lista.md` §3).
- [ ] T015 [US1] Registro `tv-web/src/features/settings/list/listSettingsTabs.ts` (`account`, `epg`, `parental`, `history`, rótulos i18n) e props de aba com a **lista da tela** + `activeSourceId` separado (D-005, D-006).
- [ ] T016 [P] [US1] `tv-web/src/features/settings/list/AccountTab.tsx`: `SourceInfo` + Editar · Ressincronizar · Excluir (lógica vinda de `tabs/SourcesTab.tsx`, inclusive offline e `DeleteSourceModal`); exclusão calcula a vizinha e chama `onSourceDeleted(id, nextFocusId)` (D-009) → contrato: `reabre na aba…` (Editar)
- [ ] T017 [P] [US1] `tv-web/src/features/settings/list/EpgTab.tsx`: estado do EPG + botão "Configurar EPG" → `onOpenEpg(source, { tab: 'epg', action: 'open-epg' })` → contrato: `reabre na aba…`
- [ ] T018 [US1] `tv-web/src/features/settings/tabs/ParentalTab.tsx` e `tv-web/src/features/settings/tabs/PrivacyTab.tsx` adaptados no lugar (D-012) para agir sobre a lista da tela; chave de consulta do PIN com `sourceId`; sem estados "sem lista ativa" (sempre há lista) → contrato: `abre para uma lista…` (Histórico)
- [ ] T019 [US1] Implementar `tv-web/src/features/settings/list/ListSettingsScreen.tsx` (zonas abas/painel sem topbar, título "Configurações da lista" + nome + aviso "só para esta lista", `initialFocus`, RETURN, estado vazio com "Voltar" se a lista não existe — R-009) → contratos da fase.
- [ ] T020 [US1] Rota: `AppScreen` `list-settings` e ação `list-settings-deleted` em `tv-web/src/navigation/appNav.ts`; `lazyRoute` em `tv-web/src/navigation/routeModules.ts`; render em `tv-web/src/App.tsx` com `from` guardando `{ tab, action }` para Editar/progresso/EPG — extraindo os cases de Configurações para um módulo em `tv-web/src/navigation/` para caber no teto (R-002).
- [ ] T021 [US1] Tela de perfis: "Configurar" no fim de `ACTION_KEYS` e `onConfigureSource?` em `tv-web/src/features/profiles/ProfilesScreen.tsx` (teto 421: compensar no próprio arquivo); App abre `list-settings` com `from` = perfis com `focusSourceId` (FR-012).
- [ ] T022 [US1] "Gerenciar" do vazio "todas escondidas": `onOpenSettings('parental')` em `tv-web/src/App.tsx` abre `list-settings` da lista ativa na aba `parental` (D-010).
- [ ] T023 [P] [US1] Textos pt/en/es em `tv-web/src/lib/i18n/messages/settings.ts` (título, aviso de escopo da lista, abas, "Configurar", "Configurar EPG", lista inexistente) — nomes da lista nunca traduzidos (FR-027).
- [ ] T024 [US1] Catraca: exceções de import novas de `features/settings/list/` em `tv-web/scripts/architecture-baseline.json` à mão, com justificativa no commit, e `node scripts/architecture.mjs --prune` das que ficaram obsoletas (D-012).

### Testes da Fase

- [ ] T025 [P] [US1] `tv-web/src/navigation/appNav.test.ts`: abrir/voltar de `list-settings` pelas duas origens; `list-settings-deleted` (lista ativa → perfis base; não ativa → foco na vizinha / "Adicionar lista").
- [ ] T026 [P] [US1] `tv-web/src/features/profiles/ProfilesScreen.test.tsx`: a 4ª ação é "Configurar" e chama `onConfigureSource` com a lista focada; contratos 023/037 verdes.
- [ ] T027 [P] [US1] Tela da lista: lista inexistente mostra "Voltar" focado; aba Categorias com PIN da lista pede o PIN dela; Excluir chama `onSourceDeleted` com a vizinha (arquivo de teste não-contrato em `tv-web/src/features/settings/list/`).

**Critério de Conclusão**: comando do contrato da fase → 2/2 verdes e trava da 067 íntegra; testes da fase verdes; `npx tsc -b`, `npm run lint`, `npx vitest run src/features src/navigation` verdes; quickstart 1–7 e 10–11 conferidos no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 — Configurações globais só com o global (Priority: P2)

**Objetivo**: Configurações sem as abas da lista, com aviso de escopo e a linha de Fontes IPTV só com "Configurar".

**Independent Test**: quickstart 8.

### Contrato da Fase

- `só abas globais, com aviso de escopo; a linha … só "Configurar" …` — US2/AC1+AC2, FR-013/014/015
- Emenda da 026: `SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (1)
- Comando: `npx vitest run src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`

### Implementation

- [ ] T028 [US2] `tv-web/src/features/settings/tabs/settingsTabs.ts` e `settingsTab.ts`: sem `parental`/`privacy` (D-007); `SettingsFocus` de `sources` com `action: 'configure'`; props legadas mantidas (D-008, R-005).
- [ ] T029 [US2] `tv-web/src/features/settings/SourcesPanel.tsx` + `tabs/SourcesTab.tsx`: linha com `SourceInfo` + um botão "Configurar" → `onConfigureSource(source, { zone: 'sources', sourceId, action: 'configure' })`; "Adicionar lista" mantido → contratos da fase.
- [ ] T030 [US2] Aviso "Estas configurações valem para todas as listas." em `tv-web/src/features/settings/SettingsScreen.tsx`, com e sem topbar; texto pt/en/es → contrato 067 #5.
- [ ] T031 [US2] `tv-web/src/App.tsx` (ou o módulo extraído na T020): `onConfigureSource` abre `list-settings` com `from: { name: 'settings', restore: { zone: 'sources', sourceId, action: 'configure' }, standalone }` (US2/AC3/AC4).
- [ ] T032 [US2] Remover código e chaves i18n que ficaram sem uso (`settings.tab.parental`/`settings.tab.privacy` se nada mais as lê; restauração `{ zone: 'panel', tab: 'parental' }`).

### Testes da Fase

- [ ] T033 [P] [US2] Atualizar os testes não travados de `tv-web/src/features/settings/` que contavam 7 abas ou usavam as ações da linha (`SettingsScreen.test.tsx`, `SettingsScreen.privacidade.test.tsx` → migrar para a tela da lista, `ParentalTab.test.tsx`, `SourcesPanel.*.test.tsx`) mantendo a intenção de cada um.

**Critério de Conclusão**: comando do contrato da fase → 2/2 verdes; travas 026 e 067 íntegras; contratos 032/054 (`player-reproducao`, `idioma-do-app`, `teste-conexao-tv`) verdes; `npx vitest run src/features/settings` verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 — PIN por lista nas telas (Priority: P3) + Polish

**Purpose**: fechar o fluxo de PIN por lista nas telas, ajustar E2E, docs e gates finais.

- [ ] T034 [US3] Conferir no navegador o quickstart 9 (ligar/trocar/desligar por lista, sugestão só da lista, "Esqueci o PIN" da própria lista, adicionar lista sem PIN) e 12 (migração com um perfil do navegador que tenha a 066).
- [ ] T035 Ajustar os roteiros E2E de R-007 ao caminho novo (`tv-web/e2e/epg-dados-agora.mjs`, `home-busca-configuracoes.mjs`, `limpar-historico.mjs`, `categorias-controle-parental.mjs`, `fontes-estado.mjs`, `carga-listas.mjs`, `ime-formularios.mjs`, `metadata-tmdb.mjs`, `semelhantes-elenco-ator.mjs`, `trailers.mjs`, `paridade-limpeza.mjs`), mantendo o que cada um verifica. Em `categorias-controle-parental.mjs`, medir as teclas do SC-004 da 066: se passar de 16, **parar e perguntar ao usuário** (R-004).
- [ ] T036 Roteiro novo `tv-web/e2e/configuracoes-lista-global.mjs` (registrar em `tv-web/e2e/run.mjs` se a suíte exigir): cartão → Configurar → abas → esconder/limpar em lista não ativa → RETURN com foco; Fontes IPTV → Configurar → RETURN; PIN de A não vale em B.
- [ ] T037 Revisão de segredos (constitution): nenhum PIN/hash/DNS/usuário/senha/URL em log, toast, tela, mensagem de erro ou `localStorage` (só ids).
- [ ] T038 Gates finais: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen` (conferir se surgiu chunk novo a listar em `CCPlayTv/tizen_web_project.yaml`), `npm run test:e2e` completo; travas 026/066/067 íntegras e as das outras features (023, 032, 037, 054, 062) intactas.
- [ ] T039 Docs: nota `**Emenda (067):**` em `sdd/specs/066-categorias-controle-parental/spec.md` (FR-011, FR-015, FR-017, FR-019, FR-022, FR-027) e na 026 (FR da linha de Fontes IPTV); `CLAUDE.md` só se uma regra permanente mudou (ex.: a frase "PIN um por aparelho", se existir) — sem parágrafo de status.

### Checklist de Release

- [ ] Fase 1 (emendas dos contratos) concluída
- [ ] Fase 2 (PIN por lista e migração) concluída
- [ ] Fase 3 (US1) concluída
- [ ] Fase 4 (US2) concluída
- [ ] Fase 5 (US3 + Polish) concluída
- [ ] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 067, 066 e 026
- [ ] Lint (tetos e imports), tipos, unitários, build e build Tizen verdes
- [ ] `npm run test:e2e` completo verde (com `npm run dev` rodando)
- [ ] `quickstart.md` executado no navegador
- [ ] Revisão de segredos feita
- [ ] TV física (recomendada, não gate): D-pad nas abas novas, PIN por lista com teclas numéricas, migração com a 066 instalada

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1**: depende da 066 convergida.
- **Fase 2**: depende da Fase 1 — BLOQUEIA as Fases 3–5.
- **Fase 3 (US1)**: depende da Fase 2.
- **Fase 4 (US2)**: depende da Fase 3 (o "Configurar" da linha abre a tela da lista; T031 usa a rota da T020).
- **Fase 5**: depende das Fases 3–4.

### Parallel Opportunities

- T004 com T005; T011–T013 entre si; T016, T017 e T023 entre si; T025–T027 entre si.

---

## Implementation Strategy

### MVP First

1. Fases 1–2 → PIN por lista com os contratos de dados verdes.
2. Fase 3 → tela da lista pelos perfis. **Parar e validar** (quickstart 1–7).

### Incremental Delivery

1. Fase 4 → globais limpas.
2. Fase 5 → E2E, docs, gates.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar após cada task ou grupo coerente; nunca editar arquivo travado fora da T002.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
