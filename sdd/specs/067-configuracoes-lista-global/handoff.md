# Handoff — 067-configuracoes-lista-global

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend `tv-web/` (React 19 + TS + Vite, Dexie/IndexedDB, Vitest + roteiros Playwright).
- Próximo comando: `/sdd-execute 067-configuracoes-lista-global`.
- Backlog: **Planejada**, 0/50.
- **Só comece depois de a 066 (`066-categorias-controle-parental`) estar convergida** — decisão do usuário. A T001 confere isso e para se não estiver.
- Arquivos que este plano já mudou em `tv-web/src`: `lib/parental/listPin.ts` (novo), `lib/parental/pinMigration.ts` (novo), `features/settings/list/ListSettingsScreen.tsx` (novo), `features/settings/tabs/settingsTab.ts` (tipos novos + `onConfigureSource?`), `features/settings/SettingsScreen.tsx` (repassa `onConfigureSource`), mais os 3 contratos. Releia esses arquivos antes de começar.

## O que a feature entrega

- **US1 (P1)**: tela nova "Configurações da lista" (rota `list-settings`, sem topbar) para **qualquer** lista, ativa ou não, sem trocar a ativa. Abas: Conta & lista · EPG · Categorias & controle parental · Histórico. Entradas: "Configurar" no **fim** das ações do cartão de perfis (Ressincronizar · Editar · Excluir **continuam** lá) e na linha de Fontes IPTV.
- **US2 (P2)**: Configurações globais só com Integrações, Fontes IPTV, Player, Acessibilidade e Sobre, mais um aviso "valem para todas as listas". Saem as abas Categorias & parental e Privacidade. A linha de Fontes IPTV mostra as informações e **só** o botão "Configurar".
- **US3 (P3)**: PIN parental **por lista**, uma mudança que contraria a 066, que tinha um PIN por aparelho. Adicionar lista **não** pede PIN. O PIN único já gravado vai para as listas que têm categoria bloqueada. Ligar, trocar, desligar e "Esqueci o PIN" acontecem na aba Categorias de cada lista.

## Leitura obrigatória, em ordem

1. `spec.md`: FRs e Clarifications (as decisões do usuário estão lá).
2. `plan.md`: Decisões Invariantes D-001..D-012, Riscos R-001..R-009, Estratégia de Testes (tabela de vermelhos e de emendas).
3. `tasks.md`: 5 fases. A Fase 2 (PIN em dados) vem antes da US1 de propósito.
4. `logic/pin-por-lista.md`: API, espelho em `localStorage`, migração (pseudocódigo) e a tabela de quem chama o PIN.
5. `logic/navegacao-lista.md`: rota, foco, abas, exclusão (`list-settings-deleted`), globais e perfis.
6. `data-model.md`: Dexie v21 (`parentalPins`).
7. `contract-amendments/`: o texto exato dos 3 contratos emendados da 026/066.
8. `quickstart.md`, depois `.planning/memory/constitution.md`.

## Testes de contrato

- Da 067, travados (5/5):
  - `tv-web/src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts` (2) → Fase 2
  - `tv-web/src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx` (2) → Fase 3
  - `tv-web/src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx` (1) → Fase 4
- Comando (em `tv-web/`): `npx vitest run src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx`
- Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 067-configuracoes-lista-global`.
- **Emendas autorizadas pelo usuário (R-001, D-011)**: só na T002, copiando verbatim os arquivos de `contract-amendments/` por cima de:
  - `SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (026)
  - `pin.categorias-controle-parental.contract.test.ts` (066)
  - `categoryAccess.categorias-controle-parental.contract.test.ts` (066)

  Depois (T003), regrave as travas da 026 e da 066 passando **todos** os arquivos de cada uma (o `-Write` só grava o que você passa: 026 tem 4 arquivos, 066 tem 3).
- Outras travas que precisam continuar verdes sem edição:
  - 023 `ProfilesScreen.shell-navegacao` (↓ abre em Ressincronizar, →→ = Excluir, OK duplo não apaga)
  - 037 `ProfilesScreen.entrada-listas`
  - 032 `SettingsScreen.player-reproducao` e 054 `SettingsScreen.idioma-do-app`: navegam pelas abas por **índice** e montam as props legadas
  - 062 `SpeedTestDialog.teste-conexao-tv`
  - 066 `PinPrompt`

## Stubs criados

- `lib/parental/listPin.ts`: assinaturas finais, todas com `sourceId` primeiro. O corpo lança `not implemented`. Reexporta `CategoryDecision`/`RecoveryInput` de `pin.ts` (pode mudar a origem, mas mantenha os nomes).
- `lib/parental/pinMigration.ts`: `migrateLegacyPin(source: TableSource)`, com `TableSource = { table(name) }`. Aceita tanto o `CatalogDb` quanto a `Transaction` do upgrade.
- `features/settings/list/ListSettingsScreen.tsx`: props finais. Os tipos `ListSettingsTab`/`ListSettingsFocus`/`ListSettingsNavigation` moram em `tabs/settingsTab.ts`, porque esse arquivo já tem exceção de catraca para `importApi`. O corpo lança.
- `tabs/settingsTab.ts`: `onConfigureSource?` em `SettingsNavigation`. É **opcional de propósito** (D-008) e deve continuar opcional.

## Armadilhas já mapeadas

- **Catraca de imports**: um arquivo novo em `features/settings/list/` que importe `features/import`, `features/catalog`, `features/sources` ou `features/history` reprova o `npm run lint`. Siga a D-012: reaproveite `tabs/ParentalTab.tsx` e `tabs/PrivacyTab.tsx` no lugar, sem mover. Exceções novas só à mão, com justificativa, e com `--prune` das obsoletas no mesmo commit.
- **Tetos de linhas**:
  - `App.tsx` está em 618/625: extraia os cases de Configurações para `src/navigation/`.
  - `ProfilesScreen.tsx` está em 421/421 e `sourceRepository.ts` em 409/409: compense as linhas no próprio arquivo.
  - `db.ts` não ganha nada: a v21 vai em `dbSchema.ts` e os tipos em `parentalTables.ts`.
- **Ciclo de import** (R-003): `dbSchema → pinMigration → categoryAccess → db`, e `normalizeForSearch` está em `catalogSearch.ts`, que importa `db`. Crie o módulo puro `lib/catalog/adultCategory.ts`.
- **Esquema de hash**: SHA-256 de `sal:pin`, idêntico ao da 066. A migração copia sal+hash; o contrato da migração calcula o hash legado com `sha256Hex` direto.
- **Tabela antiga**: `parentalPin` continua declarada na v21 (o contrato escreve nela). Não a declare `null`.
- **Alvo das abas**: as abas antigas leem `activeSourceId`. Na tela da lista, o alvo é **sempre** a lista da tela (o contrato limpa Quarto com Sala ativa). Não passe `activeSourceId = sourceId` para "reaproveitar".
- **Teclas nos testes**: em `document.body` (`fireEvent.keyDown`), para o `Modal` capturar antes.
- **Rótulos das abas**: os contratos leem `.side-category-nav-label` com estes textos exatos:
  - lista: `Conta & lista`, `EPG`, `Categorias & controle parental`, `Histórico`
  - globais: `Integrações & BYOK`, `Fontes IPTV`, `Player & reprodução`, `Acessibilidade & sistema`, `Sobre & créditos`
  - botões e textos: "Configurar", "Configurar EPG", título "Configurações da lista", e textos com "só para esta lista" / "valem para todas as listas".
- **"Gerenciar" no vazio "todas escondidas"** (`onOpenSettings('parental')` em Live/VOD): passa a abrir a tela da **lista ativa** na aba `parental` (D-010). O tipo `SettingsTab` perde `parental`, e o `tsc` vai apontar os lugares.
- **Edição de lista**: o gate `withParentalGate` envolve **adicionar e editar** (mesma tela). Só a edição pede PIN, o da lista em `existingSource`.
- **Espelho síncrono**: Excluir de lista sem PIN tem que continuar imediato (contratos 023/026). Use o espelho por lista (`logic/pin-por-lista.md` §3).
- **E2E (R-007)**: 11 roteiros passam pela linha antiga ou pelas abas que saem. Em `categorias-controle-parental.mjs`, o SC-004 da 066 (≤ 16 teclas) pode estourar; se estourar, **pare e pergunte** (R-004).
- **Lint**: `npm run lint` já mostra avisos de exceção obsoleta e de teto que pode baixar (ex.: `HomeContent.tsx`). Não são desta feature; só faça `--prune` junto com a D-012.

## Pendências do Analyze

- **A1 — HIGH**: o SC-001 (≤ 3 teclas do cartão à tela da lista) contradiz o FR-012. Com "Configurar" como 4ª ação, o caminho é ↓ →→→ OK, ou seja, 5 teclas. Recomendação: o usuário corrige o SC-001 para 5 teclas antes do execute; se não corrigir, o executor mede, registra no R-008 e pergunta no fim da Fase 3.
- **A2 — MEDIUM**: o R-004, o SC-004 da 066 (≤ 16 teclas até esconder uma categoria), pode deixar de valer. Será medido na T035; se estourar, decisão do usuário.
- **A3 — LOW**: o FR-016 (o conteúdo de Integrações, Player, Acessibilidade e Sobre não muda) não tem task própria. Fica coberto pelos contratos 032/054/062 continuarem verdes na T038.
- **A4 — LOW**: o rótulo da aba muda de "Categorias & parental" para "Categorias & controle parental", como diz a spec. A chave i18n antiga pode sair (T032).

## Gate de pronto

- Contratos da 067 (5/5) e as emendas da 026/066 verdes. Travas 026, 066 e 067 íntegras; as demais intactas.
- Em `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen` (se surgir chunk novo, listar em `CCPlayTv/tizen_web_project.yaml`), e `npm run test:e2e` completo com `npm run dev` rodando, incluindo o roteiro novo `e2e/configuracoes-lista-global.mjs`.
- `quickstart.md` executado no navegador; revisão de segredos (T037).
- Docs no Polish (T039): nota `**Emenda (067):**` na spec e no plan da 066 e da 026. Nada de status no `CLAUDE.md`.
- TV física: recomendada, **não é gate**.
