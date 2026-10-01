# Implementation Plan: Limpar histórico e remover item do Histórico

**Slug**: `036-limpar-historico` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/036-limpar-historico/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

A pessoa passa a poder tirar um título do `↺ Histórico` (tecla vermelha na
grade ou ação no detalhe) e limpar o Histórico de Filmes, Séries ou ambos numa
aba nova **Privacidade** de Configurações, sempre com confirmação em que
escolhe se a retomada também é apagada (DS V14 §13.3/§48.4). Favoritos e
marcas "assistido" nunca mudam; só a lista ativa é afetada.

Abordagem: um campo novo de valor, `UserStateRecord.historyHiddenAt`, **esconde**
o item do Histórico sem apagar `lastWatched` — que "Continuar assistindo" também
usa. `listPlayed` (único leitor do Histórico) filtra por ele; uma reprodução nova
traz o item de volta sozinha. Um módulo novo `lib/catalog/historyRemoval.ts`
concentra as regras; a UI é um modal compartilhado (`HistoryRemovalModal`), a
tecla vermelha no `useRemoteNav` e um `PrivacyPanel`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (`tv-web/`), Vite 8 (build `chrome108`).

**Primary Dependencies**: Dexie 4 (IndexedDB), `@tanstack/react-query`, `@tanstack/react-virtual` (grade do VOD), componentes V14 da 022 (`Modal`, `Button`, `EmptyState`, `SideCategoryNav`).

**Storage**: IndexedDB via Dexie, tabela `userStates` — campo novo sem índice, **Dexie continua v12** (nada a reservar; regra 4 do backlog).

**Testing**: Vitest + Testing Library + `fake-indexeddb` (`src/setupTests.ts`); Playwright (`tv-web/e2e/*.mjs`) contra `npm run dev`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, `file://`); navegador de dev para o dia a dia.

**Performance Goals**: remoção refletida na grade em ≤ 1 s (SC-003). Tudo local (IndexedDB), sem rede.

**Constraints**: foco por estado + `.tv-focus` (ADR-009); nada de rede em nenhum caminho desta feature; tecla de cor é atalho, nunca o único caminho (constitution); nenhum valor literal de cor/raio/fonte (tokens V14).

**Scale/Scope**: histórico de uma lista = dezenas a centenas de registros; `clearHistory` varre `userStates` por `sourceId` (índice existente).

## Decisões Invariantes

- **D-001 — Esconder, nunca apagar `lastWatched`.** Remover do Histórico grava
  `historyHiddenAt`; está no Histórico só quando `lastWatched > historyHiddenAt`
  (`logic/remocao-historico.md` §1). Apagar `lastWatched` tiraria o item de
  "Continuar assistindo" junto, contra FR-008.
- **D-002 — `listPlayed` é o único ponto que aplica a regra.** Continuar
  assistindo, herói, "Continuar de", selo "Assistido" e favoritos não mudam de
  leitura.
- **D-003 — Sem bump do Dexie.** Campo de valor, sem índice, sem `.upgrade()`.
- **D-004 — Nunca escrever `isFavorite`, `favoritedAt`, `completedAt`,
  `lastWatched`** em nenhum caminho desta feature (FR-012/FR-013).
- **D-005 — "Apagar progresso" apaga `progressSeconds` de todo o escopo**,
  inclusive de itens já escondidos antes (série inteira; tipo inteiro no lote).
- **D-006 — Um modal só** (`HistoryRemovalModal`) para grade, detalhe e
  Privacidade; "Cancelar" no índice 0, focado ao abrir.
- **D-007 — Tecla vermelha (`ColorF0Red`) registrada no modo estrito** (como
  as teclas de mídia): sem confirmação da plataforma, não registra e a dica
  não aparece. O detalhe é o caminho completo por setas + OK.
- **D-008 — Aba "Privacidade" antes de "Sobre & créditos"**; age só na lista
  ativa; sem lista ativa, explica e mantém um botão focável.
- **D-009 — Série = todos os episódios da geração ativa com o mesmo
  `seriesId`** (`listEpisodes`), a mesma resolução que põe a série no
  Histórico (`history.ts`).
- **D-010 — Invalidação fechada** em `invalidateHistoryRemoval` (§10 da
  lógica): `user-state`, `user-states`, `history-content`,
  `continue-watching`, `resume-positions`, `home-hero`, `history-summary`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Estado local por lista; nada de conta. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Não toca credencial nem URL; mensagens de erro fixas (FR-020). |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não mexe em categorias. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Contagens reais de `loadHistory`; "indisponíveis" declarados, não escondidos. |
| Comandos Locais Independem de Rede | ✅ | ✅ | Tudo IndexedDB; nenhuma chamada de rede. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Não se aplica; D-004 reforça que "assistido"/favorito ficam. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Tecla vermelha é atalho; ação "Remover do histórico" no detalhe e aba Privacidade por setas + OK; RETURN fecha o modal antes da tela (D-006/D-007). |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não se aplica. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Cancelar focado; vizinho após remover; estado vazio focável; aba sem lista com botão; linha soft disabled continua focável (contrato C5). |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | Pré: voltar do detalhe após remover o título caía no 1º item (`focusedIndexHint` gravado e nunca lido). Pós: T021 passa a usá-lo, reconciliando por id e, na ausência, pela dica. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Tudo por `stableId`; série por `seriesId` do catálogo. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Opção "apagar progresso" só existe quando há progresso (FR-007). |
| Documentação É Canônica | ✅ | ✅ | Polish atualiza CLAUDE.md e backlog; hint e aba nova entram na doc. |

Nenhuma violação a justificar.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/036-limpar-historico/
├── spec.md
├── plan.md
├── data-model.md
├── logic/remocao-historico.md
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── App.tsx                                  # registra a tecla vermelha (T010)
│   ├── lib/
│   │   ├── tizenColorKey.ts                     # REMOVE_COLOR_KEY + registro estrito (T008)
│   │   ├── useRemoteNav.ts                      # onRemoveKey (T009)
│   │   └── catalog/
│   │       ├── db.ts                            # historyHiddenAt (feito no plan)
│   │       ├── userStateRepository.ts           # listPlayed filtra (T002)
│   │       ├── history.ts                       # inalterado (lê via listPlayed)
│   │       ├── historyRemoval.ts                # STUB → regras (T001–T005)
│   │       └── historyRemoval.limpar-historico.contract.test.ts   # travado
│   └── features/
│       ├── catalog/catalogApi.ts                # hooks + invalidação (T006)
│       ├── favorites/useFavoriteToggle.ts       # extrai computeNeighbor (T011)
│       ├── favorites/neighbor.ts                # novo (T011)
│       ├── history/HistoryRemovalModal.tsx      # novo (T012)
│       ├── vod/VodCatalogScreen.tsx             # tecla vermelha, modal, dica, dica de índice (T013–T015, T021)
│       ├── vod/VodCatalogScreen.limpar-historico.contract.test.tsx # travado
│       ├── movies/MovieDetailScreen.tsx         # ação "Remover do histórico" (T018)
│       ├── series/SeriesDetailScreen.tsx        # idem (T019)
│       └── settings/
│           ├── SettingsScreen.tsx               # aba 'privacy' (T025)
│           └── PrivacyPanel.tsx                 # novo (T024)
│   └── styles/                                  # regras da dica/painel, só tokens
├── e2e/limpar-historico.mjs                     # novo (T030)
└── package.json                                 # test:e2e inclui o script novo (T030)
```

**Structure Decision**: tudo em `tv-web/` (client-first, ADR-008). Regras de
dados em `lib/catalog/historyRemoval.ts`, ao lado de `history.ts` e
`userStateRepository.ts`; UI compartilhada numa pasta nova
`features/history/`, no mesmo espírito de `features/favorites/`.

## Complexity Tracking

Nenhuma violação.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run <arquivo>        # o mais estreito primeiro
npm run test                    # suíte inteira
npx tsc -b
npm run lint
npm run build:tizen
npm run dev                     # outro terminal, antes do E2E
npm run test:e2e
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts` (4) e
`tv-web/src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx` (1).

Comando (em `tv-web/`):
`npx vitest run src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx`

Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 036-limpar-historico`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 remover filme só do Histórico: retomada, favorito e "assistido" ficam | FR-008/012/013, US1/AC1/AC5, SC-001/002 | Fase 1 | `Error: not implemented` |
| C2 remover e apagar progresso; reprodução nova devolve ao Histórico | FR-009/016, US1/AC2, SC-002 | Fase 1 | `Error: not implemented` |
| C3 série: todos os episódios, de todas as temporadas, só dela | FR-013/015/016, US1/AC6 | Fase 1 | `Error: not implemented` |
| C4 limpar Filmes: indisponíveis também, retomada fica, Séries e outra lista intactas | FR-014/025, US2/AC2/AC5/AC7, SC-005 | Fase 1 | `Error: not implemented` |
| C5 tecla vermelha → confirmação com Cancelar focado → remove, foca vizinho, retomada fica | FR-001/007/008/011/017, US1/AC1/AC7, Constitution: Foco Visível | Fase 2 | `Unable to find role="dialog" and name /histórico/i` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/catalog/historyRemoval.ts` (assinaturas com
`throw new Error('not implemented')`) e o campo `historyHiddenAt` em
`tv-web/src/lib/catalog/db.ts` (definitivo, só o tipo).

Fora do contrato, cobertura complementar escrita pelo execute: `useRemoteNav`
(`onRemoveKey`, debounce, sem handler = não mapeada), `tizenColorKey`
(registro estrito), `HistoryRemovalModal` (2 × 3 ações, erro, RETURN),
detalhe de filme/série (ação presente/ausente, índice 0 intacto), dica de
índice ao voltar, `PrivacyPanel`/`SettingsScreen` (contagens, soft disabled,
sem lista ativa, `findUnnamedControls`), e o E2E `e2e/limpar-historico.mjs`.

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
| R-001 | Item escondido com retomada mantida só sai de "Continuar assistindo" por "Limpar … e apagar progresso" (Privacidade) ou reproduzindo de novo: não há remoção direta na rail da Home (fora de escopo) e a ação do detalhe só aparece para item no Histórico. | Médio — a pessoa pode não achar como tirar um item de Continuar depois de escolher "manter". | Aceito pela spec (Home fora de escopo). Registrar na convergência; candidato a item de backlog se aparecer no uso real. |
| R-002 | Nome `ColorF0Red` e `keyCode` 403 da tecla vermelha, e se `getSupportedKeys()` a lista na QN50Q60DAGXZD, não confirmados em hardware (mesma classe de risco de R-011 da 013). | Baixo — no pior caso a tecla não desperta; o detalhe cobre. | Registro estrito + dica condicionada (D-007). Verificação recomendada na passada do item 58 do backlog, não gate. |
| R-003 | `e2e/paridade-limpeza.mjs` compara capturas de Configurações — a aba nova muda a lista de abas. | Baixo — falso positivo de regressão visual. | Atualizar a linha de base só da tela de Configurações no Polish (T031), registrando o porquê. |
| R-004 | Feature 035 (Semelhantes, especificada) também edita `MovieDetailScreen`/`SeriesDetailScreen` (abas) e tem contratos travados neles. | Baixo — conflito de merge, não de comportamento: esta feature só acrescenta uma ação no fim do array. | Quem fizer o merge por último rebaseia; rodar os contratos das duas. |

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
