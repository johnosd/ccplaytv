
| R-009 | Desvio do `data-model.md` §4/D-008: `AppScreen` ganhou `{ name: 'source-access'; source }` **sem** o campo `decision`. | Nenhum: a decisão é derivada. | Resolvido: A rota `SourceAccessRoute` (nova, `features/sources/`) recalcula `decideSourceAccess` a cada montagem a partir da fonte mais nova de `['sources']`, então voltar de "Editar lista" refaz a decisão e uma conta que ficou válida abre o Início sem mostrar o bloqueio de novo (`logic` §5). Mantém o redutor sem ação nova (D-008). |
| R-008 | Conflito entre a 034 (FR-006: chip "Erro na última sincronização" no cartão) e um teste da 037 (`ProfilesScreen.test.tsx`: o cartão nunca mostra esse texto), achado na Fase 3. | Dois requisitos do usuário em sentido oposto. | **Resolvido pelo usuário (2026-10-01): mostrar o chip.** A 037 continua valendo para a data e "Nunca sincronizada" (fora do cartão); só a asserção do texto de erro foi ajustada no teste da 037 (arquivo não travado), mantendo o resto. |# Implementation Plan: Fontes IPTV completas — estado, contagem e expiração da conta

**Slug**: `034-fontes-estado-expiracao` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/034-fontes-estado-expiracao/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

A linha da fonte em Configurações e o cartão em "Quem está assistindo?" passam
a mostrar o vencimento da conta Xtream, "Sincronizando", "Credencial inválida"
e a contagem conhecida, e uma lista cuja conta o painel confirmou vencida ou
recusada deixa de abrir: aparece uma tela de acesso com o motivo, "Editar
lista", "Verificar de novo" e "Voltar".

Abordagem: o `exp_date` que o conector já lê passa a ser guardado na fonte
(três campos sem índice, sem subir o Dexie), gravado pela sincronização e por
uma consulta leve ao escolher a lista (no máximo a cada 24 h, com limite de
5 s). Regras puras em `lib/catalog/sourceAccount.ts`, consulta em
`lib/catalog/accountCheck.ts`, tela nova `features/sources/SourceAccessGate.tsx`
empilhada pelo `appNav` existente. A constitution foi emendada para 1.7.0 para
permitir o impedimento (decisão do usuário, ver R-001).

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, build `chrome108`).

**Primary Dependencies**: Dexie (IndexedDB), @tanstack/react-query, o
`useRemoteNav` do projeto (ADR-009), componentes V14 (`Button`, `Spinner`,
`Chip`).

**Storage**: IndexedDB via Dexie (hoje **v15**; o plano nasceu na v12, as 039
subiram para v14/v15) — só campos novos sem índice em `sources`
(`data-model.md` §1). Nenhuma tabela, índice ou versão nova; se um dia um
campo precisar de índice, a próxima é a v16.

**Testing**: Vitest + Testing Library + fake-indexeddb (um `CatalogDb` por
teste, nome aleatório); Playwright (script `tv-web/e2e/*.mjs` com painel
Xtream falso servido por `http.createServer`, padrão de `e2e/metadata-tmdb.mjs`).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, origem
`file://`); navegador desktop no desenvolvimento.

**Performance Goals**: escolher uma lista válida nunca espera mais que 5 s pela
verificação (SC-003); verificação feita no máximo uma vez a cada 24 h por
lista; nenhuma chamada por foco.

**Constraints**: client-first (ADR-008); credencial e URL nunca em tela, log,
`aria-*` ou erro (constitution, ADR-010); a importação roda num Worker
(`importRunner`), então o que o pipeline grava vai pelo Dexie, nunca por
memória da thread de UI; `resolveAccountStatus` é a única forma de falar com
a conta (reuso, não uma segunda implementação).

**Scale/Scope**: uma pessoa, poucas listas (1–5); a contagem lê só a tabela
`categories` da geração ativa.

## Decisões Invariantes

- **D-001** — A verdade da conta mora em `SourceRecord` (`accountStatus`,
  `accountExpiresAt`, `accountCheckedAt`); telas leem `SourceOut.account`,
  nunca consultam o painel sozinhas. Só `accountCheck.ts` (consulta leve) e
  `importPipeline.ts` (sincronização) escrevem.
- **D-002** — "Vencida" é `accountStatus === 'expired'` **ou** data guardada no
  passado; "ativa" com data passada é vencida (FR-004). Dias até o vencimento
  contam por calendário local, nunca por `ms / dia`.
- **D-003** — O impedimento só vale com confirmação do painel (resposta
  recente ou guardada). Falha de rede/tempo esgotado sem nada guardado
  **abre** a lista (constitution 1.7.0). Com dado guardado vencido/recusado,
  bloqueia mesmo offline (decisão do usuário, US2 AC6).
- **D-004** — A consulta leve só acontece ao escolher a lista (se a última
  verificação tem mais de 24 h), em "Verificar de novo" e dentro da
  sincronização. Nunca por foco, nunca em segundo plano, nunca em laço.
- **D-005** — O limite de 5 s é garantido por `Promise.race` com um temporizador,
  não só por `AbortSignal` (um `fetch` que ignora o sinal não pode prender a
  tela).
- **D-006** — Fonte fora de `providerImportMode: 'xtream_api'` (M3U avulsa,
  Modo limitado, nunca sincronizada) não mostra conta e nunca é impedida.
- **D-007** — Impedir a entrada não apaga nada: catálogo, favoritos,
  histórico, retomada e `connectionState` da fonte ficam como estão.
- **D-008** — A tela de acesso entra pela ação `open` existente do `appNav`
  (só um tipo novo de `AppScreen`); nenhuma ação nova no redutor, para não
  mexer nos contratos travados da 023/024.
- **D-009** — Contagem vem de `useCatalogCounts` (a regra de "nunca 0
  inventado" da 010 já está lá) + `lastUnavailableSections`; nunca uma chamada
  ao painel só para contar.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ❌ → ✅ após emenda | ✅ | A decisão "lista vencida não abre" violava a v1.6.1. O usuário decidiu emendar: v1.7.0 cria exceção para impedir **aquela lista** quando o painel confirmou vencimento/recusa, preservando interface, outras listas e estado local (R-001, D-003, D-007). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | `account` não tem segredo; a consulta usa `readCredential` só dentro de `accountCheck.ts`; resultado e logs sem URL (contrato C3 serializa o resultado e procura usuário/senha/host). |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Contagem só lê as categorias da fonte. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Sem data → "Sem data de vencimento"; seção sem resposta → "não obtidos", nunca "0". |
| Comandos Locais Independem de Rede | ✅ | ✅ | A tela de acesso responde a ←/→/RETURN durante a consulta; RETURN nunca espera a rede. |
| Trailers e Metadados Não Alteram o Estado Principal | n/a | n/a | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Editar/Verificar/Voltar por ←/→/OK; RETURN volta. |
| Lista de Catálogo ≠ Manifesto | n/a | n/a | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | "Verificando…" tem `Voltar` focado; bloqueio foca "Editar lista" (C5). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN da tela de acesso volta aos perfis com `focusSourceId` da lista (D-008). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Nada chaveado por URL. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Contagem com a regra de cobertura da 010; "Sincronizando" só enquanto a execução existe. |
| Documentação É Canônica | ✅ | ✅ | `CLAUDE.md` e README atualizados no Polish; constitution já na 1.7.0. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/034-fontes-estado-expiracao/
├── spec.md
├── plan.md
├── data-model.md
├── logic/conta-da-fonte.md
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── App.tsx                                   # chooseSource → decisão de acesso; case 'source-access'
├── navigation/appNav.ts                      # AppScreen ganha 'source-access'
├── lib/catalog/
│   ├── db.ts                                 # SourceRecord: account*, lastUnavailableSections (feito no plan)
│   ├── sourceAccount.ts                      # NOVO — regras puras (stub)
│   ├── accountCheck.ts                       # NOVO — consulta leve com limite (stub)
│   ├── xtreamConnector.ts                    # AccountStatus.expiresAt; resolveAccountStatus({signal})
│   ├── importPipeline.ts                     # grava a conta no sucesso/falha
│   └── sourceRepository.ts                   # SourceView.account; markAccount; markSynced(account, unavailableSections)
├── features/
│   ├── import/importApi.ts                   # SourceOut.account/unavailable_sections; useSourceSyncing; useCheckSourceAccount
│   ├── sources/
│   │   ├── sourceFormat.ts                   # formatStatus(syncing), formatAccount, sourceAlertChips, formatCounts
│   │   └── SourceAccessGate.tsx              # NOVO — tela de acesso (stub)
│   ├── profiles/ProfilesScreen.tsx           # chips de problema + "Sincronizando" em `.source-card-notices` (desde a 037 o cartão não mostra estado de sincronização)
│   └── settings/SourcesPanel.tsx             # linha: conta, contagem, "Sincronizando"
└── e2e/fontes-estado.mjs                     # NOVO — painel falso, cenários do quickstart
```

**Structure Decision**: frontend único (`tv-web/`), client-first; `api/` não é
tocado. Regras novas em `lib/catalog/` (sem React); tela em
`features/sources/` (onde já moram `sourceFormat.ts`,
`LimitedModeNotice.tsx` e `DeleteSourceModal.tsx`).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma — a violação de "Sem Conta Obrigatória" foi resolvida por emenda da constitution, não justificada aqui; ver R-001) | | |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivos>
npx tsc -b
npm run lint
npx vitest run
node e2e/fontes-estado.mjs      # com npm run dev rodando
npm run test:e2e
npm run build:tizen
```

Flakes conhecidos sob paralelismo (passam isolados; não são desta feature):
`SeriesScreen.favorites`, `MoviesScreen.favorites`, `LiveScreen.favorites`,
`LiveScreen.test`.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts`,
`tv-web/src/lib/catalog/accountCheck.fontes-estado.contract.test.ts`,
`tv-web/src/lib/catalog/importPipeline.fontes-estado.contract.test.ts`,
`tv-web/src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx`

Comando (de `tv-web/`):
`npx vitest run src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts src/lib/catalog/accountCheck.fontes-estado.contract.test.ts src/lib/catalog/importPipeline.fontes-estado.contract.test.ts src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `descreve os cinco casos de vencimento, "hoje", e credencial recusada` | US1 AC1–AC5; FR-003/004/005/016; SC-001 | Fase 2 | `Error: not implemented` |
| C2 `decide abrir, verificar ou impedir a lista…` | US2; FR-008/010/022; constitution 1.7.0 | Fase 2 | `Error: not implemented` |
| C3 `sem resposta do painel (rede ou demora) devolve o dado guardado…` | FR-009; SC-003; segredo | Fase 2 | `Error: not implemented` |
| C4 `sucesso grava vencimento e verificação; credencial recusada depois marca "refused"…` | FR-001/002/016; US3 AC3; D-007 | Fase 2 | `AssertionError: expected undefined to deeply equal { status: 'active', … }` |
| C5 `lista vencida mostra o motivo com a data, foca "Editar lista"…` | US2 AC1/AC2/AC5; FR-010–013; foco; segredo | Fase 4 | `Error: not implemented` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/catalog/sourceAccount.ts`, `tv-web/src/lib/catalog/accountCheck.ts`,
`tv-web/src/features/sources/SourceAccessGate.tsx`; campos novos já declarados
em `db.ts` (`SourceRecord`), `sourceRepository.ts` (`SourceView.account`) e
`importApi.ts` (`SourceOut.account`).

## Estado Atual

| 
Á
rea | Estado |
| --- | --- |
| Fases 1–6 | Concluídas |
| Fase 7 — Polish | **Concluída**: E2E novo e real, gates, docs |
| Contratos | 5/5 verdes; 24 travas íntegras |
| Suíte | 2210/2210; test:e2e 24/24; tsc, lint e build:tizen limpos |
| Pendências | Passada na TV física (recomendada, não gate); salvar da edição só em teste de componente |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A decisão do usuário "lista vencida/recusada não abre" violava "Sem Conta Obrigatória" (v1.6.1: expiração não pode bloquear o estado local já sincronizado). | Sem resolver, a US2 inteira seria inconstitucional. | Resolvido: o usuário decidiu emendar (2026-09-30); constitution 1.7.0 com exceção estreita — só a lista confirmada vencida/recusada, com tela de motivo e caminho de correção, sem apagar estado local; falha de rede sozinha nunca impede (D-003, D-007). |
| R-002 | O formato real de `exp_date` no painel de referência (segundos Unix em string) só foi visto no conector e em fixtures; outro painel pode mandar ms ou data ISO. | Data errada na tela e bloqueio indevido. | Resolvido (SC-006, 01/10/2026: na lista real do `.env` o app mostrou a mesma data de vencimento que o painel declara — `exp_date` em segundos Unix): `parseExpDate` aceita só número; não numérico = "sem data" (nunca bloqueia). SC-006 confere a data contra a lista real do `.env` (T030). |
| R-003 | Relógio da TV errado faz a comparação errar. | Bloqueio indevido ou aviso fora de hora. | Resolvido: A tela mostra a data para a pessoa conferir; "Verificar de novo" reconsulta. Fora do escopo corrigir relógio. |
| R-004 | Uma verificação > 24 h dispara uma requisição ao escolher a lista, com até 5 s de espera. | Abrir a lista fica mais lento uma vez por dia. | Resolvido: Limite de 5 s (D-005); a resposta atualiza `checkedAt`, então só a primeira escolha do dia paga. |
| R-005 | **Deriva desde 30/09 (checada em 01/10/2026 no `sdd-plan`, antes do `tasks.md`)**: o Dexie está na v15 (não v12) e o plano/`data-model.md` ainda diziam v12. | Texto desatualizado; risco de alguém achar que precisa migrar. | Resolvido: Atualizado aqui e em `data-model.md`; continua **sem** versão nova (campos sem índice). |
| R-006 | A 037 refez o cartão de "Selecione ou Adicione sua lista" (`ProfilesScreen.tsx`): hoje ele tem tipo (`source-card-kind`) e avisos reais em `.source-card-notices` (`sourceNotices`), **sem** estado/data de sincronização. A spec fala em "tipo e estado como hoje". | O chip de problema e o "Sincronizando" não têm onde entrar se o executor procurar o estado antigo. | Resolvido: Eles entram na linha `.source-card-notices` (T014/T025); `formatStatus` fica só em Configurações. Nenhuma mudança de FR: o FR-006 já pede só chips para os casos de agir. |
| R-007 | A 038 mudou `importPipeline.ts` (atualização no mesmo caminho em `applyStructureRefresh`, novo `publishGeneration`), mas há **um único** `markSynced` (~l.827) depois dos dois caminhos, e os dois `resolveAccountStatus` (~l.703 e ~l.723) seguem onde o `logic` §7 os previa. `run.unavailableSections` existe (`db.ts` ~l.547). | Gravar a conta num ponto que um caminho da 038 pula. | Resolvido: T006 grava a conta no `markSynced` único e em `fail()`; C4 trava o resultado. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-01 | Fase 7 (Polish) | T030–T035: E2E fontes-estado + real (SC-006 conferido), gates, docs | Passada na TV recomendada |
| 2026-10-01 | Fase 6 (US4) | T027–T029: formatCounts e a contagem na linha de Configurações | nenhuma |
| 2026-10-01 | Fase 5 (US3) | T024–T026: store Sincronizando, formatStatus com motivo da falha, linha e cartão assinam por lista | nenhuma |
| 2026-10-01 | Fase 4 (US2) | T017–T023: tela e rota de acesso, appNav, App.chooseSource/enterSource; 5/5 contratos | E2E de FR-014/FR-020 na Fase 7 |
| 2026-10-01 | Fase 3 (US1) | T012–T016: formatAccount/sourceAlertChips, linha de Configurações e chips do cartão; conflito com teste da 037 resolvido pelo usuário (R-008) | "Sincronizando" só na Fase 5 |
| 2026-10-01 | Fase 2 (Foundational) | T002–T011: regras de conta, consulta leve com limite, markAccount/markSynced, pipeline grava a conta, SourceOut.account; C1–C4 verdes | nenhuma |
| 2026-10-01 | Fase 1 (baseline) | T001: contratos vermelhos pelo motivo certo, trava íntegra, stubs e campos de `db.ts` no lugar | nenhuma |

**PRÓXIMO**: sdd-converge 034-fontes-estado-expiracao

## Arquivos Principais

- (nenhum ainda)

## Cuidados para Retomada

- (nenhum ainda)

## Resultado Final

**Convergida (2026-10-01).** O que foi construído, contra a spec:

- **Dados (US1/US2/US3, Fase 2)**: `exp_date` guardado em `SourceRecord` (`accountStatus`/`accountExpiresAt`/`accountCheckedAt`) e `lastUnavailableSections`, sem versão nova do Dexie (v15). Só a sincronização (no único `markSynced`, nunca em `legacy_m3u`; `markAccount` ao vencer e, em `fail()`, `refused` só se o painel foi consultado) e `checkSourceAccount` escrevem a conta (D-001). A consulta leve é uma por 24 h, no máximo 5 s por `Promise.race` + temporizador (D-005), nunca por foco, e nunca grava sem resposta do painel.
- **US1 (P1)**: `describeAccount` (dias de calendário local) na linha de Configurações e `sourceAlertChips` no cartão, só quando há algo a agir; tokens `--warning`/`--danger`, texto sempre presente.
- **US2 (P1)**: `SourceAccessGate` + `SourceAccessRoute` e o `AppScreen` `source-access`; `chooseSource` decide e só então chama `enterSource` (última lista, pré-carga e atualização por idade esperam o acesso abrir). Conta vencida/recusada não abre o Início; falha de rede sozinha nunca impede (constitution 1.7.0).
- **US3 (P2)**: store em memória `sourceSyncing` ("Sincronizando", por lista, nunca persistido) e `formatStatus` com o motivo ("Credencial inválida", "Conta expirada" quando a sincronização falhou).
- **US4 (P3)**: `formatCounts` + `SourceCounts` (finalmente um consumidor de `useCatalogCounts`); nunca "0" inventado, seção sem resposta = "não obtidos".

**Desvios do plano original**: (1) `AppScreen` `source-access` **sem** o campo `decision` — a rota recalcula a cada montagem (R-009); (2) o chip "Erro na última sincronização" **aparece no cartão**, por decisão do usuário, o que ajustou uma asserção do teste da 037 (R-008); (3) Dexie documentado como v15 e o cartão como o da 037 (R-005/R-006); (4) `useCheckSourceAccount` foi criado como o plano pedia, mas a tela usa `checkSourceAccount` direto (sem consumidor, F-02); (5) `formatStatus` só mostra "Conta expirada" quando a sincronização falhou — com a lista ainda `synced` a conta vencida aparece no texto e no chip da linha (`logic` §6, F-01).

**Verificação**: 5/5 contratos (C1–C5) e 24 travas do repositório íntegras; `npx vitest run` 281 arquivos, 2210/2210; `tsc`/`oxlint`/`build:tizen` limpos; `npm run test:e2e` 24 scripts verdes, incluindo `e2e/fontes-estado.mjs` (3 rodadas verdes, varredura de segredo em cada tela); **SC-006 conferido na lista real** (`e2e/fontes-estado-real.mjs`: a data exibida bate com a do painel).

**Em aberto, registrado** (não bloqueia a convergência): passada na TV física (recomendada, não gate: tela de acesso e chips no aparelho); o salvar de "Editar lista" só em teste de componente (F-03). Achados desta convergência: F-01, F-02, F-03 (todos LOW).
