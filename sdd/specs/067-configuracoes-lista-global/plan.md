# Implementation Plan: Separar configurações da lista das configurações globais do app

**Slug**: `067-configuracoes-lista-global` | **Date**: 2026-10-10 | **Spec**: `sdd/specs/067-configuracoes-lista-global/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Configurações hoje mistura ajustes do app e de uma lista. Esta feature cria a
tela **Configurações da lista** (rota nova `list-settings`, abas Conta & lista ·
EPG · Categorias & controle parental · Histórico), aberta pelo cartão da tela de
perfis ("Configurar", última ação) e pela linha de Configurações › Fontes IPTV
(que passa a ter só "Configurar"); Configurações globais fica com Integrações,
Fontes IPTV, Player, Acessibilidade e Sobre, com um aviso de escopo. As abas
Categorias & parental e Privacidade das globais viram abas da tela da lista,
sempre aplicadas à lista **da tela** (ativa ou não). O PIN parental da 066 (um
por aparelho) vira **um por lista**: tabela nova `parentalPins` (Dexie v21),
API `lib/parental/listPin.ts` com `sourceId` em toda chamada, e migração
idempotente no `.upgrade()` da v21 que dá o PIN antigo a cada lista com
categoria bloqueada. Três contratos travados de outras features (026, 066)
são emendados por decisão do usuário, com o texto exato já escrito em
`contract-amendments/`.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, build `chrome108`)

**Primary Dependencies**: `@tanstack/react-query` (estado de servidor local), Dexie 4 (IndexedDB), `useRemoteNav` próprio (ADR-009), catálogo i18n próprio (`lib/i18n/`, pt/en/es)

**Storage**: IndexedDB via Dexie — versão nova **21** (`lib/catalog/dbSchema.ts`); `localStorage` só para o espelho síncrono de "lista tem PIN"

**Testing**: Vitest (projetos `dom`/jsdom para `.tsx` e `node` para `.ts`, `fake-indexeddb` nos dois), Playwright pelos roteiros `tv-web/e2e/*.mjs` (`npm run test:e2e`)

**Target Platform**: Samsung Tizen TV (Chromium 120, origem `file://`), 1920×1080; desenvolvimento em Chromium desktop

**Performance Goals**: sem meta nova; a leitura do PIN por lista é uma leitura por chave (`get(sourceId)`), no lugar da leitura por chave fixa de hoje — `getCategoryAccess` mantém a meta < 10 ms da 066 (R-015 dela)

**Constraints**: client-first (ADR-008), nenhuma rede para PIN/recuperação; catraca de arquitetura (`npm run lint`: tetos de linhas e imports entre features); contratos travados de 023/026/032/037/054/066 continuam verdes (os 3 emendados, com o texto de `contract-amendments/`); constitution: foco em todo estado, voltar restaura foco por id, segredos fora de log/tela

**Scale/Scope**: poucas listas por aparelho (1–10); centenas de categorias por lista

## Decisões Invariantes

- **D-001** — PIN é **por lista**. Toda função de PIN recebe `sourceId` primeiro (`lib/parental/listPin.ts`); as funções globais de `pin.ts` deixam de existir. O PIN de uma lista nunca é aceito por outra; desligar/trocar/recuperar mexem só na própria lista (`logic/pin-por-lista.md`).
- **D-002** — Migração do PIN único roda no `.upgrade()` da Dexie v21, antes de qualquer leitura, e dá o PIN antigo (mesmo sal+hash) a cada lista com ao menos uma categoria bloqueada pela regra `savedLock` com o controle ligado; idempotente; o registro `parentalPin/'pin'` é apagado. A tabela `parentalPin` continua declarada (vazia).
- **D-003** — O esquema de hash do PIN não muda (SHA-256 hex de `sal:pin`, `crypto.subtle` com reserva `sha256Hex`): a migração copia sal+hash.
- **D-004** — Configurações da lista é uma rota própria `{ name: 'list-settings'; sourceId; restore? }`, sem topbar, que guarda só o id da lista e lê a `SourceOut` atual de `useSources`; abrir não troca a lista ativa.
- **D-005** — Dentro da tela da lista, o alvo de toda ação é a lista **da tela**; `activeSourceId` só serve para a marca "Lista ativa".
- **D-006** — Abas da tela da lista num registro próprio (`LIST_SETTINGS_TABS`), mesmo padrão `SettingsTabHandle` de Configurações; ordem `account`, `epg`, `parental`, `history`; `initialFocus` ausente = zona de abas em `account`; presente = painel na aba/ação guardada.
- **D-007** — Configurações globais: `integrations`, `sources`, `player`, `accessibility`, `about` (os 4 primeiros índices não mudam — contratos 032/054 navegam por índice). A linha de Fontes IPTV tem só "Configurar" (`SettingsFocus` `{ zone: 'sources', sourceId, action: 'configure' }`).
- **D-008** — Compatibilidade de props com contratos travados: `SettingsScreenProps` mantém `onEditSource`/`onResyncStarted`/`onSourceDeleted` (podem ficar sem uso); `onConfigureSource` é opcional em `SettingsNavigation`; `onConfigureSource` é opcional em `ProfilesScreenProps`.
- **D-009** — Excluir pela tela da lista: vizinha = seguinte ?? anterior ?? "Adicionar lista"; se era a ativa, `profilesAsBase()` (fluxo atual); senão ação pura `list-settings-deleted` no redutor desempilha e aplica o foco na origem (`logic/navegacao-lista.md` §4).
- **D-010** — O "Gerenciar" do vazio "todas escondidas" de Live/Filmes/Séries (R-011 da 066) abre a tela da **lista ativa** na aba `parental`.
- **D-011** — Contratos travados emendados (R-001): só o texto de `contract-amendments/` é aplicado, verbatim, na Fase 1, e as travas da 026 e da 066 são regravadas com **todos** os arquivos de cada uma. Nenhuma outra edição em arquivo travado.
- **D-012** — Imports entre features: os arquivos novos de `features/settings/list/` que herdam o papel de arquivos que já tinham exceção na catraca (`SourcesTab` → `importApi`/`DeleteSourceModal`; `PrivacyTab` → `catalogApi`/`history`/`importApi`; `SourcesPanel` → `sourceFormat`/`LimitedModeNotice`/`catalogApi`) podem ganhar as mesmas exceções em `scripts/architecture-baseline.json`, editadas à mão com justificativa no commit, **e** as que ficarem obsoletas saem no mesmo commit (`node scripts/architecture.mjs --prune`): o total de imports herdados não pode crescer além do necessário — preferir reaproveitar os arquivos existentes no lugar (ex.: `tabs/PrivacyTab.tsx` e `tabs/ParentalTab.tsx` adaptados, sem mover).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nada de conta; PIN e listas ficam no aparelho. |
| Segredos Fora dos Clientes e dos Logs | Atenção | OK | PIN só como hash por lista (D-003); "Esqueci o PIN" confere só os dados da própria lista, no aparelho, sem rede e sem revelar campo (contrato 067 #1); a aba Conta reaproveita a linha atual, que nunca mostra DNS/usuário/senha (contrato 067 #3 e emenda 026 conferem `painel.secreto` ausente). Revisão de segredos no Polish. |
| Categorias da Fonte São Preservadas | OK | OK | Nenhuma taxonomia externa; nomes da lista não traduzidos (FR-027). |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Abrir a tela, PIN, migração e histórico são locais; só Ressincronizar precisa de rede e mantém o "soft disabled" offline da 042. |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Tela nova navegável por D-pad (abas/painel, RETURN); "Configurar" alcançável nos dois pontos de entrada. Risco R-004 (teclas até esconder uma categoria). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | Atenção | OK | FR-011: vazio/carregando/erro/lista inexistente com elemento focável; contrato 067 #4 confere um único `.tv-focus`. |
| Voltar Restaura Foco e Posição | Atenção | OK | Foco por id da lista na origem (perfis/Fontes IPTV), por aba+ação na volta de Editar/progresso/EPG (contrato 067 #4), vizinha por id após excluir (D-009). |
| Identidade de Reprodução Não Depende da URL | OK | OK | Histórico continua por identidade lógica; limpeza por `sourceId` da tela (contrato 067 #3). |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | Estados de sincronização/EPG reaproveitados, sem percentual inventado. |
| Documentação do Repositório É Canônica | OK | OK | Emendas na 066 (spec/plan) e na 026 por nota (Polish); backlog pelo script. |

Sem violação não justificável. Os contratos travados alterados não violam a constitution: é mudança de critério de aceite decidida pelo usuário (R-001), com texto travado de novo.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/067-configuracoes-lista-global/
├── spec.md
├── plan.md                 # este arquivo
├── data-model.md           # Dexie v21 (parentalPins), espelho localStorage, rota nova
├── logic/
│   ├── pin-por-lista.md    # API, espelho, migração, quem usa o PIN
│   └── navegacao-lista.md  # rota, foco, abas, excluir, globais, perfis
├── contract-amendments/    # texto exato dos 3 contratos emendados da 026/066 (R-001)
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/src/
├── App.tsx                                  # rotas (teto 625; hoje 618)
├── navigation/
│   ├── appNav.ts                            # AppScreen 'list-settings', ação 'list-settings-deleted'
│   └── routeModules.ts                      # lazyRoute da tela nova; withParentalGate por lista
├── features/settings/
│   ├── SettingsScreen.tsx                   # aviso de escopo; registro sem parental/privacy
│   ├── SourcesPanel.tsx                     # linha só com "Configurar"; extrair SourceInfo
│   ├── tabs/settingsTab.ts                  # tipos (SettingsFocus, ListSettings*) — já tem os stubs
│   ├── tabs/settingsTabs.ts                 # registro global
│   ├── tabs/SourcesTab.tsx                  # linha → onConfigureSource
│   ├── tabs/ParentalTab.tsx                 # adaptado para a lista da tela
│   ├── tabs/PrivacyTab.tsx                  # adaptado para a lista da tela
│   ├── parental/ParentalFlow.tsx            # PIN com sourceId
│   └── list/                                # NOVO
│       ├── ListSettingsScreen.tsx           # stub do plano
│       ├── listSettingsTabs.ts              # registro LIST_SETTINGS_TABS
│       ├── AccountTab.tsx
│       └── EpgTab.tsx
├── features/profiles/ProfilesScreen.tsx     # "Configurar" (teto 421 = hoje)
├── features/sources/DeleteSourceModal.tsx   # PIN da lista
├── features/catalog/categoryAccessApi.ts    # syncPinHints ao abrir
├── components/
│   ├── ParentalGate.tsx                     # sourceId?
│   ├── ParentalPinPrompt.tsx, RecoverPinFlow.tsx, LockedCategoryState.tsx
├── lib/parental/
│   ├── listPin.ts                           # NOVO (stub do plano) — API por lista
│   ├── pinMigration.ts                      # NOVO (stub do plano)
│   └── pin.ts                               # perde as funções globais
├── lib/catalog/
│   ├── dbSchema.ts                          # v21
│   ├── parentalTables.ts                    # parentalPins(database)
│   ├── categoryAccess.ts                    # regra por lista
│   ├── adultCategory.ts                     # NOVO, puro (evita ciclo, logic §4)
│   └── sourceRepository.ts                  # deleteSource apaga o PIN (teto 409 = hoje)
└── lib/i18n/messages/settings.ts, parental.ts   # textos novos pt/en/es
tv-web/e2e/                                  # roteiros a ajustar (R-007)
tv-web/scripts/architecture-baseline.json    # exceções (D-012)
```

**Structure Decision**: frontend único em `tv-web/src/`, seguindo a divisão `features/` (telas) · `components/` (UI compartilhada) · `lib/` (dados, sem UI) · `navigation/` (rotas puras). A tela nova mora em `features/settings/list/` (mesma feature de Configurações, para não abrir import entre features novas); a API do PIN em `lib/parental/`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Emendar 3 contratos travados de outras features (026: 1 teste; 066: 2 arquivos, 3 testes) | PIN por lista e a linha só com "Configurar" foram decisões do usuário que contradizem o que esses contratos travam | Manter o PIN único e os botões na linha foi oferecido e recusado (pergunta de 2026-10-09); emendar já durante a 066 foi recusado para não atrapalhar o gate final dela |
| Exceções novas de import entre features na catraca (D-012) | Configurações da lista consome as APIs de lista/histórico/exclusão como Configurações já consome | Re-exportar tipos por arquivos já liberados só esconderia o acoplamento; o total líquido fica igual porque as exceções equivalentes de `SourcesTab`/`SourcesPanel` ficam obsoletas e saem |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```bash
npx tsc -b
npm run lint
npx vitest run <arquivo>          # o mais estreito primeiro
npm run test                      # suíte inteira
npm run build
npm run dev                       # em outro terminal, antes do E2E
npm run test:e2e                  # ou: node e2e/<roteiro>.mjs
```

Integridade das travas (raiz do repositório, PowerShell):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 067-configuracoes-lista-global
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 066-categorias-controle-parental
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5/5):

- `tv-web/src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts` (2)
- `tv-web/src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx` (2)
- `tv-web/src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx` (1)

Comando (em `tv-web/`):

```bash
npx vitest run src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `US3/AC1..AC5, FR-017/FR-018/FR-023/FR-025: cada lista tem o seu PIN…` | US3, FR-017/018/023/025, Constitution: Segredos | Fase 2 | `Error: not implemented` (`listPin.enableParentalControl`) |
| `FR-024/SC-005: o PIN único da 066 vira o PIN de cada lista…` | FR-024, SC-005 | Fase 2 | `Error: not implemented` (`migrateLegacyPin`) |
| `abre para uma lista que não é a ativa, … Histórico limpando só ESTA lista` | US1/AC2+AC4, FR-001/002/003/007, SC-002 | Fase 3 | `Error: not implemented` (`ListSettingsScreen`) |
| `reabre na aba e ação guardadas (EPG) e entrega aba+ação …` | FR-005, FR-009, US1/AC5, Constitution: Voltar Restaura Foco; Foco Visível | Fase 3 | `Error: not implemented` (`ListSettingsScreen`) |
| `só abas globais, com aviso de escopo; a linha … só "Configurar" …` | US2/AC1+AC2, FR-013/014/015, SC-003 | Fase 4 | `AssertionError` nas abas (7 em vez de 5) |

Confirmado em 2026-10-10: os 5 falham por esses motivos; `npx tsc -b` limpo; `npm run lint` ok; suítes `src/features/settings`, `src/lib/parental`, `src/features/profiles` com só os 5 contratos vermelhos (177 verdes).

**Contratos emendados de outras features** (R-001, aplicados na Fase 1 — texto exato em `contract-amendments/`, já conferido com `tsc` contra os stubs):

| Arquivo travado | Feature | Muda | Vermelho depois de aplicar, até a fase |
| --- | --- | --- | --- |
| `tv-web/src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` | 026 | linha só com "Configurar" → `onConfigureSource(quarto)`; a parte de Excluir sai (coberta pelo contrato 023) | Fase 4 (não acha o botão "Configurar") |
| `tv-web/src/lib/parental/pin.categorias-controle-parental.contract.test.ts` | 066 | importa de `./listPin`, `sourceId` em toda chamada, recuperação pela própria lista | Fase 2 (`not implemented`) |
| `tv-web/src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts` | 066 | `enableParentalControl` por lista; PIN de outra lista não desbloqueia (US2); US3 liga só a lista | Fase 2 (US2/US3 `not implemented`; US1 segue verde) |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/parental/listPin.ts`, `tv-web/src/lib/parental/pinMigration.ts`, `tv-web/src/features/settings/list/ListSettingsScreen.tsx`, tipos `ListSettingsTab`/`ListSettingsFocus`/`ListSettingsNavigation` e `onConfigureSource?` em `tv-web/src/features/settings/tabs/settingsTab.ts`, repasse de `onConfigureSource` em `SettingsScreen.tsx`.

Fora dos contratos (testes do executor e E2E): tela de perfis com "Configurar" (unitário), redutor `list-settings-deleted` e rotas (`appNav.test.ts`), `ParentalGate`/`DeleteSourceModal` por lista, upgrade real v20→v21 (padrão de `db.test.ts`), E2E dos roteiros afetados (R-007) e um roteiro novo `e2e/configuracoes-lista-global.mjs`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | PIN por lista e a linha só com "Configurar" contradizem contratos travados: 026 (`SettingsScreen.home-busca…`, 1 teste) e 066 (`pin.…` 1 teste; `categoryAccess.…` 2 de 3 testes) | Alto — a suíte não fica verde sem mudar travas de outras features | Decisão do usuário em 2026-10-09 (`sdd-plan`): emendar na **Fase 1** desta feature, depois de a 066 convergir, aplicando verbatim os arquivos de `contract-amendments/` e regravando as travas da 026 e da 066 com todos os arquivos de cada uma (D-011). |
| R-002 | Tetos da catraca: `App.tsx` 618/625, `ProfilesScreen.tsx` 421/421, `sourceRepository.ts` 409/409, `db.ts` 859/860 | Alto — `npm run lint` reprova linha a mais | `App.tsx`: extrair os cases de Configurações (`settings`, `list-settings`, `epg-settings`, `tmdb-key`) para um módulo em `src/navigation/`; `ProfilesScreen.tsx`: compensar as linhas novas extraindo/condensando código do próprio arquivo; `sourceRepository.ts`: trocar o comentário da 066 pela linha nova; v21 em `dbSchema.ts`, tipos em `parentalTables.ts`. Subir teto só como último recurso, editando o JSON à mão com justificativa. |
| R-003 | Ciclo de import `db.ts → dbSchema.ts → pinMigration.ts → categoryAccess.ts → db.ts`, e `normalizeForSearch` em `catalogSearch.ts` (que importa `db.ts`) | Médio — erro de avaliação de módulo só em runtime | Módulo puro `lib/catalog/adultCategory.ts` com `isAdultCategoryName`, `normalizeForSearch` e a regra de bloqueio salvo (`logic/pin-por-lista.md` §4). |
| R-004 | SC-004 da 066 (≤ 16 teclas do Início até esconder uma categoria, medido pelo E2E `categorias-controle-parental.mjs`) pode estourar com o salto a mais (Fontes IPTV → Configurar → aba) | Médio — critério de aceite de outra feature | Medir no E2E ajustado. Se passar de 16, **parar e perguntar ao usuário** (emendar o SC-004 da 066 com o novo mínimo medido, ou um atalho) — não subir o limite sozinho. |
| R-005 | Contratos travados 032/054 montam `SettingsScreenProps` com `onEditSource`/`onResyncStarted`/`onSourceDeleted` e navegam pelas abas por índice | Médio — `tsc`/contrato quebram se as props saírem ou a ordem mudar | D-007/D-008: as 4 primeiras abas ficam onde estão; as props legadas continuam no tipo. |
| R-006 | Espelho síncrono de "existe PIN" (R-013 da 066) era global | Médio — Excluir sem PIN precisa continuar imediato (contratos 023/026); Excluir de lista com PIN precisa pedir o PIN dela | Espelho por lista `ccplay.parental.pinSources` (`logic/pin-por-lista.md` §3). |
| R-007 | Roteiros E2E que passam pela linha antiga de Fontes IPTV, pela aba Privacidade ou pela aba Categorias & parental: `epg-dados-agora.mjs`, `home-busca-configuracoes.mjs`, `limpar-historico.mjs`, `categorias-controle-parental.mjs`, `fontes-estado.mjs`, `carga-listas.mjs`, `ime-formularios.mjs`, `metadata-tmdb.mjs`, `semelhantes-elenco-ator.mjs`, `trailers.mjs`, `paridade-limpeza.mjs` (e os `-real` de EPG, que precisam de `.env`) | Médio — gate do E2E completo | Ajustar cada um ao caminho novo (Configurar → aba) na Fase 5; o que só lê informação da linha (`fontes-estado`) deve continuar passando. `paridade-limpeza` compara capturas: a 08 (Fontes IPTV) muda de propósito. |
| R-008 | SC-001 (≤ 3 teclas do cartão à tela da lista) não bate com FR-012 ("Configurar" é a 4ª ação: ↓ →→→ OK = 5 teclas) | Baixo — critério de aceite inconsistente | Achado do Analyze; recomendado corrigir o SC-001 para 5 teclas antes do execute (ou perguntar ao usuário). Até lá o executor mede e registra. |
| R-009 | Tela da lista aberta para uma lista apagada por outro caminho (ex.: pilha antiga) | Baixo | Estado vazio com "Voltar" focado (FR-011), nunca tela em branco. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
