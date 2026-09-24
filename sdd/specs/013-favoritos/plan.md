# Implementation Plan: Favoritos em Canais, Filmes e Séries

**Slug**: `013-favoritos` | **Date**: 2026-09-24 | **Spec**: `sdd/specs/013-favoritos/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Dar interface ao favorito que a feature 008 já armazena. Segurar OK
(~0,8 s) sobre um canal, filme ou série na lista/grade alterna o favorito,
com aviso e estrela; OK curto continua tocando/abrindo, agora ao soltar a
tecla. Live TV, Filmes e Séries ganham uma categoria virtual "★ Favoritos"
no topo da trilha, que lista os favoritos daquela fonte e tipo que estejam
carregados no aparelho.

Abordagem técnica: (1) `useRemoteNav` ganha um modo opcional de gesto
(`onLongSelect`, `keydown` + `keyup` + limiar), sem mudar o comportamento
de nenhuma tela que não o use; (2) favorito resolvido em registro da
geração ativa por um índice Dexie novo
(`[sourceId+generation+kind+providerStreamId]`), pelo índice de `seriesId`
da 012, ou — só em fonte M3U — por varredura do tipo ao entrar em
"Favoritos"; (3) estrela calculada por um `Set` de `stableId`s, sem consulta
por item; (4) remover fonte passa a apagar o estado do usuário dela.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict), React 19.2; build Vite 8
com alvo `chrome108` (Tizen 8.0).

**Primary Dependencies**: `@tanstack/react-query` 5 (leituras/mutações),
`@tanstack/react-virtual` 3 (listas e grades, feature 009), `dexie` 4
(IndexedDB). Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie (`tv-web/src/lib/catalog/db.ts`), schema
v8 → **v9** (só índice novo em `channels`, ver `data-model.md`).
`userStates` sem mudança.

**Testing**: vitest 5 + Testing Library + jsdom + `fake-indexeddb`
(padrão de `LiveScreen.test.tsx`, `catalogRepository.test.ts`,
`userStateRepository.test.ts`); Playwright (`@playwright/test` 1.63) para o
roteiro E2E exigido pela constitution v1.4.0.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 8.0 / Chromium 108), em
`CCPlayTv/` via `npm run build:tizen`; desenvolvimento no navegador com
`npm run dev`.

**Performance Goals**: estrela + aviso em ≤ 300 ms após o limiar (SC-002);
"Favoritos" com 500 itens rolando como as demais categorias (SC-004);
entrar em "Favoritos" de fonte M3U grande sem travar a interface (R-003).

**Constraints**: só setas/OK/RETURN garantidos (sem teclas coloridas, item
44); client-first (ADR-008); foco como estado React + classe `tv-focus`
(ADR-009); tokens da ADR-007, nenhuma cor literal.

**Scale/Scope**: dezenas a centenas de favoritos por fonte; catálogos de
até ~311 mil entradas (fonte real de referência).

## Decisões Invariantes

- **D-001 — Gesto dentro de `useRemoteNav`, opt-in.** O clique demorado é
  um handler opcional `onLongSelect` do próprio `useRemoteNav`
  (`logic/gesto-ok-longo.md`), não um hook paralelo nem um listener por
  tela. Sem `onLongSelect`, o OK age no `keydown` exatamente como hoje —
  nenhuma tela existente muda de comportamento.
- **D-002 — Modo decidido por pressionamento.** A tela passa
  `onLongSelect` só quando o foco está num item favoritável (coluna de
  conteúdo com item). Na trilha de categorias, no detalhe, no player e nos
  estados vazio/erro, fica indefinido e o OK segue imediato (FR-004).
  Limiar: `LONG_SELECT_MS = 800`, constante única.
- **D-003 — Favorito não guarda cópia do item.** Nenhum nome/arte é
  gravado no `UserStateRecord`; "Favoritos" mostra só o que resolve na
  geração ativa (decisão da spec). O formato do `stableId` só é lido por
  `parseStableId` em `userStateRepository.ts` — nenhuma tela faz `split`.
- **D-004 — "Favoritos" é categoria virtual.** Não é gravada em
  `categories`, não conta em `sectionCount`, fica fixa na posição 0 da
  trilha com ícone de estrela. A identidade de foco da trilha passa a ser
  uma união discriminada (`{ type: 'favorites' } | { type: 'source',
  name }`), para uma categoria da fonte chamada "Favoritos" nunca colidir
  com a virtual (edge case da spec).
- **D-005 — Estrela por conjunto, resolução só ao entrar.** A estrela é
  `favoriteIds.has(stableIdOf(item))` (`useFavoriteIds`); a resolução
  favorito → registro (`resolveFavorites`) só roda quando a pessoa **entra**
  em "Favoritos" (`useFavoritesContent` habilitada nessa hora). Focar a
  categoria não dispara nada (constitution: focar não consulta).
- **D-006 — Um índice novo, nenhum para nome.**
  `[sourceId+generation+kind+providerStreamId]` em `channels` (v9). Fonte
  M3U resolve por varredura do tipo (R-003); não criar índice de
  `originalName` (custaria em toda importação M3U).
- **D-007 — Remover fonte apaga todo o estado do usuário dela.**
  `deleteSource` chama `deleteUserStatesForSource` (favoritos **e**
  retomada). Uma fonte readicionada ganha `sourceId` novo (UUID), então
  estado órfão nunca mais seria alcançável — mantê-lo só ocuparia espaço.
- **D-008 — Telas falam só com `catalogApi`.** As três telas usam
  `useFavoriteIds`/`useFavoritesContent`/`useToggleFavorite` de
  `features/catalog/catalogApi.ts`, nunca `lib/catalog` direto (mesma
  regra de D-001 das features 010/011). O comportamento repetido nas três
  telas (alternar + aviso + vizinho de foco) fica num hook compartilhado
  `features/favorites/useFavoriteToggle.ts`.
- **D-009 — Episódio não é favoritável.** `onLongSelect` nunca é passado
  na lista de episódios da 012; `useToggleFavorite` rejeita `kind` fora de
  `channel|movie|series`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Favorito é local, por fonte; nenhum login. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | `stableId` contém `sourceId` (UUID) e id do painel, nunca credencial/URL. Aviso de falha sem detalhe técnico (FR-013). Nenhum log novo com dados de item. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | "Favoritos" é aditiva, virtual, distinguível (D-004); nenhuma categoria da fonte renomeada ou reordenada. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Favorito não resolvido não vira cartão inventado; nota sem contagem (FR-009). |
| Comandos Locais Independem de Rede | ✅ | ✅ | Alternar favorito é gravação local; nenhuma rede. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Favoritar não toca progresso/conclusão (FR-016); `toggleFavorite` só mexe em `isFavorite`/`favoritedAt`. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ⚠️ | ✅ | Favoritar depende de segurar OK (escolha da spec) — continua sendo "Setas + SELECT"; descobribilidade coberta pela dica fixa (FR-012). Pós-design: gesto usa só OK; RETURN inalterado. |
| Uma Lista de Catálogo Nunca É Manifesto | n/a | n/a | Não toca importação/parsing. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | Risco: novos botões de estado vazio herdarem o bug "Tentar de novo não ativa pelo OK" (backlog). Pós-design: o estado vazio de "Favoritos" é ativado via `onSelect` da tela (não por `.click()` de DOM) e testado com tecla, não mouse (T015/T020). Focar "Favoritos" não consulta (D-005). |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | Desfavoritar o item focado move para o vizinho por id (FR-018); voltar do player para "Favoritos" reconcilia por id (padrão `locate`). Limitação pré-existente: voltar do **detalhe** (rota) para a grade não restaura — bug aberto no backlog, fora do escopo; ver R-006. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Favorito por `stableIdOf` (fonte + tipo + id estável); resolução nunca por URL. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Cobertura parcial de "Favoritos" declarada (FR-009), sem contagem inventada. |
| Documentação do Repositório É Canônica | ✅ | ✅ | T031 atualiza ADR-009 (nota de `keyup`), `CLAUDE.md` e backlog na mesma feature. |

Nenhuma violação a justificar — `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/013-favoritos/
├── spec.md
├── plan.md                        # Este arquivo
├── data-model.md                  # Índice v9 e ciclo de vida do favorito
├── logic/
│   ├── gesto-ok-longo.md          # useRemoteNav: OK curto × demorado
│   └── resolucao-favoritos.md     # stableId → registro da geração ativa
├── quickstart.md                  # Verificação manual, E2E e TV física
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e.mjs                                   # roteiro E2E existente (npm run test:e2e)
├── e2e/                                      # NOVO: roteiros E2E por feature
│   ├── favoritos.mjs                         # NOVO (T028)
│   └── fixtures/favoritos.m3u                # NOVO (T028) — só dados fictícios
├── package.json                              # scripts: test:e2e passa a rodar os dois
└── src/
    ├── lib/
    │   ├── useRemoteNav.ts / .test.tsx       # gesto onLongSelect (T003–T004)
    │   └── catalog/
    │       ├── db.ts / db.test.ts            # schema v9 (T005)
    │       ├── userStateRepository.ts / .test.ts   # parseStableId, listFavorites, deleteUserStatesForSource (T006–T007)
    │       ├── catalogRepository.ts / .test.ts     # resolveFavorites (T008–T009)
    │       └── sourceRepository.ts / .test.ts      # deleteSource apaga userStates (T024, T027)
    ├── features/
    │   ├── catalog/catalogApi.ts / .test.tsx # useFavoriteIds, useFavoritesContent, useToggleFavorite (T010–T011)
    │   ├── favorites/                        # NOVO
    │   │   ├── useFavoriteToggle.ts / .test.tsx    # alternar + aviso + vizinho de foco (T012–T013)
    │   │   └── FavoritesState.tsx            # estado vazio / nota de não carregados (T014)
    │   ├── live/LiveScreen.tsx / .test.tsx   # US1
    │   ├── movies/MoviesScreen.tsx / .test.tsx   # US2
    │   └── series/SeriesScreen.tsx / .test.tsx   # US2
    └── features/screens.css                  # estrela, entrada ★ da trilha, dica (tokens)
```

**Structure Decision**: frontend único em `tv-web/` (o backend `api/` é
contorno congelado e não é tocado). Camada de dados em
`tv-web/src/lib/catalog/`, porta das telas em
`tv-web/src/features/catalog/catalogApi.ts`, comportamento compartilhado
das três telas em `tv-web/src/features/favorites/` (pasta nova, mesmo
padrão de `features/catalog/` já importado pelas telas).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário**: gesto de OK (fake timers, auto-repetição, keyup perdido),
  `parseStableId`, `listFavorites`, `resolveFavorites` (id, seriesId,
  nome, geração, ordem), `useFavoriteToggle` (vizinho de foco, falha de
  gravação).
- **Componente**: `LiveScreen`/`MoviesScreen`/`SeriesScreen` com
  `fireEvent.keyDown`/`keyUp` + fake timers — OK curto abre/toca, OK
  demorado favorita sem abrir, estrela, entrada ★ na trilha, estado vazio
  ativável **pelo OK** (não por clique).
- **Integração (fake-indexeddb)**: favoritar → nova geração →
  `resolveFavorites` acha; remover fonte apaga `userStates`.
- **E2E (Playwright, gate da constitution)**: `tv-web/e2e/favoritos.mjs`
  serve um M3U fictício por um servidor HTTP local do próprio script,
  importa, favorita por `keyboard.down('Enter')`/espera/`up`, confere
  "Favoritos", recarrega a página e confere persistência.
- **TV física (gate elevado, R-001)**: SC-001 — o gesto depende da
  auto-repetição e do `keyup` do controle real, que o navegador não prova.

Comandos-base (em `tv-web/`):

```bash
npx vitest run src/lib/useRemoteNav.test.tsx      # o mais estreito primeiro
npx vitest run src/lib/catalog
npm run test
npm run lint
npx tsc -b
npm run dev            # outro terminal, para o E2E
npm run test:e2e
npm run build:tizen    # antes da TV física
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída — linha de base registrada (44/478), CSS `.fav-star`/`.live-item-favorites`/`.fav-hint` |
| Fase 2 (Foundational) | Concluída — gesto de OK, schema v9, `resolveFavorites`, hooks de `catalogApi`, `useFavoriteToggle`, `FavoritesState`. 530/530 testes, `tsc`/lint limpos |
| Fase 3 (US1 — Live TV) | Concluída — trilha com "★ Favoritos", gesto de OK, estrela, dica, conteúdo de Favoritos. 541/541 testes (11 novos), `tsc`/lint limpos |
| Fase 4 (US2 — Filmes/Séries) | Concluída — mesmo padrão da Fase 3 aplicado às duas grades. 548/548 testes (7 novos), `tsc`/lint limpos |
| Fase 5 (US3 — persistência) | Não iniciada |
| Fase 6 (Polish) | Não iniciada |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O controle da TV pode não entregar `keyup` do OK, ou repetir `keydown` com intervalo diferente do previsto | Alto — gesto inutilizável ou toque acidental | Algoritmo tolera `event.repeat` ausente e `keyup` perdido (`STALE_PRESS_MS`). **Verificação na TV física elevada a gate obrigatório para SC-001** (exceção prevista na constitution, "Validação em hardware real"): fechar a feature sem ela exige decisão explícita do usuário registrada aqui. |
| R-002 | OK curto passar a agir ao soltar pode parecer mais lento nas três telas | Médio — percepção de resposta | Só nas colunas de conteúdo (D-002); trilha e detalhe inalterados. Avaliar na TV (quickstart D). |
| R-003 | Resolver favoritos por nome (M3U) varre todos os itens do tipo da fonte | Médio — espera ao entrar em "Favoritos" numa fonte M3U de 300 mil entradas | Só ao entrar na categoria, com indicador de carregamento focável; varredura encerra ao achar todos; medir no quickstart (C). Se inaceitável, abrir item de índice normalizado de nome, não improvisar. |
| R-004 | Índice v9 aumenta o custo de gravar categorias sob demanda (Xtream) | Baixo | Uma entrada de índice por item; M3U não paga (chave com parte `undefined` não indexa). Conferir tempo de entrada de categoria no quickstart (C). |
| R-005 | Duas telas (Live e Filmes) com a mesma trilha: duplicação da lógica da entrada ★ | Baixo — manutenção | Comportamento comum em `useFavoriteToggle`/`FavoritesState`; a trilha em si continua por tela, como hoje. |
| R-006 | Voltar do detalhe para "Favoritos" (Filmes/Séries) não restaura o foco — bug pré-existente do roteador (`App.tsx`), no backlog | Médio — FR-019 só se cumpre para o player (Live) | Fora do escopo: o bug é do roteador para todas as categorias. FR-019 é verificado no retorno do player; o retorno do detalhe fica com o `sdd-bugfix` já registrado. |
| R-007 | `useFavoriteToggle` não recebe `sourceId`/`kind` como a task T013 descrevia — só `showToast` | Nenhum (decisão de implementação, não um problema) | O `item` passado a `toggle()` já carrega `source_id`/`kind`, e é ele que `useToggleFavorite` usa pra montar o `stableId` — passar os dois de novo seria redundante e abriria espaço pra divergirem do item de verdade. `tasks.md` T013 corrigida pra descrever a assinatura real. |
| R-008 | Misturar `vi.useFakeTimers()` (limiar do gesto) com `waitFor` (polling do React Query) trava o teste — `waitFor` também usa `setTimeout`, que fica congelado sem avanço manual contínuo | Médio — só testes, sem impacto em produção | `LiveScreen.favorites.test.tsx` usa tempo REAL (`holdEnter`, ~850ms por chamada) em vez de fake timers pros cenários que também esperam o React Query. `useRemoteNav.test.tsx` (Fase 2) não tem esse problema — não usa `waitFor`. Documentar esse padrão se mais telas precisarem do mesmo teste. |
| R-009 | Trilha com "★ Favoritos" na posição 0 quebraria o fallback de `locate()` (retorna 0 quando não acha) — categoria sumida cairia em Favoritos, não na primeira categoria real | Alto — se não corrigido, perder foco de uma categoria jogaria a pessoa pra uma seção sem relação nenhuma | Resolvido: `categoryIdx` usa um fallback próprio (`defaultTrailIdx`, índice 1) em vez do `locate()` genérico pra este caso específico; achado e corrigido ainda na Fase 3 (o teste "se o grupo focado sumir do catálogo novo, cai no primeiro grupo" pegou isso). Aplicado desde o início em `MoviesScreen`/`SeriesScreen` (Fase 4) — sem achado novo lá, o padrão já veio pronto. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-24 | Fase 1 (Setup) | Linha de base registrada (44 arquivos/478 testes, lint e `tsc` limpos) antes de qualquer mudança; CSS de favoritos adicionado a `screens.css` (`.fav-star`, `.live-item-favorites`, `.fav-hint`), só tokens. | — |
| 2026-09-24 | Fase 2 (Foundational) | `useRemoteNav` ganhou `onLongSelect` opt-in (keydown/keyup/limiar, `STALE_PRESS_MS` pra keyup perdido, cancelamento em blur/visibilitychange) sem tocar nenhuma tela existente. Schema Dexie v9 (`[sourceId+generation+kind+providerStreamId]`). `userStateRepository`: `parseStableId`, `listFavorites`, `deleteUserStatesForSource`. `catalogRepository`: `resolveFavorites` (índice → seriesId → varredura por nome com corte antecipado via sentinela). `catalogApi`: `useFavoriteIds`/`useFavoritesContent`/`useToggleFavorite`. `features/favorites/` novo: `useFavoriteToggle` (aviso + vizinho de foco) e `FavoritesState` (`FavoritesEmptyState` + `FavoritesUnresolvedNote`). 530/530 testes (52 novos), `tsc`/lint limpos. | Nenhuma técnica; R-001 (verificação de hold na TV física) segue em aberto até a Fase 6. |
| 2026-09-24 | Fase 3 (US1 — Live TV) | `LiveScreen.tsx` reescrito: trilha `[Favoritos, ...categories]` com `TrailKey`/`EnteredKey` discriminados (D-004), gesto de OK só na coluna de conteúdo (D-002), estrela `.fav-star`, dica `.fav-hint`, conteúdo de "Favoritos" via `useFavoritesContent`. Dois achados corrigidos na hora: (1) fallback de foco pra categoria sumida caía em Favoritos em vez da 1ª categoria real (R-009) — `categoryIdx` ganhou fallback próprio; (2) OK no estado vazio de "Favoritos" não fazia nada (só o botão tinha `onClick`, não roteado por `useRemoteNav.onSelect`) — corrigido pra cumprir FR-008/FR-020. `LiveScreen.test.tsx`: `press()` passou a soltar Enter (gesto só completa no keyup); 1 asserção do conteúdo da trilha atualizada (inclui "★Favoritos"). Testes novos em `LiveScreen.favorites.test.tsx` (arquivo separado, R-008/R-009) cobrindo (a)–(k). 541/541 testes (11 novos líquidos), `tsc`/lint limpos, 0 regressão. | Nenhuma técnica. |
| 2026-09-24 | Fase 4 (US2 — Filmes/Séries) | `MoviesScreen.tsx`/`SeriesScreen.tsx` reescritos com o mesmo padrão da Fase 3 (trilha, gesto, estrela em `.poster-box`, dica, conteúdo de Favoritos, fallback de foco R-009 e roteamento de OK no vazio — os dois últimos já vieram corretos desde o início, sem achado novo, porque o padrão foi copiado já corrigido). `press()` ajustada nos dois arquivos de teste existentes; nenhuma asserção de trilha existia neles, então nada mais mudou (diferente da Live, que teve 1 asserção reescrita). Dois arquivos novos: `MoviesScreen.favorites.test.tsx` (4 testes), `SeriesScreen.favorites.test.tsx` (3 testes, incluindo a confirmação de que um episódio da série favoritada nunca aparece em "Favoritos", só o cartão da série). 548/548 testes (7 novos líquidos), `tsc`/lint limpos, 0 regressão. | Nenhuma técnica. |

**PRÓXIMO**: Fase 5 (US3 — persistência) — T024–T027: `deleteSource` apaga `userStates` da fonte (D-007), favoritos sobrevivem a reabrir o app e a ressincronizar (já cobertos em boa parte pelos testes de integração de T025 na Fase 2), isolamento entre fontes.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/live/LiveScreen.tsx`, `MoviesScreen.tsx`, `SeriesScreen.tsx` — trilha, gesto, estrela, conteúdo de Favoritos (Fases 3-4, feitas)
- `tv-web/src/features/{live,movies,series}/*.favorites.test.tsx` — 3 arquivos novos, 18 testes ao todo
- `tv-web/src/features/{live,movies,series}/*Screen.test.tsx` (Live/Movies/Series) — `press()` ajustada nos três
- `tv-web/src/lib/catalog/sourceRepository.ts` — próximo arquivo a mudar (Fase 5, T024/T027: `deleteSource` apaga `userStates`)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Teste de gesto + `waitFor` no mesmo teste**: nunca usar `vi.useFakeTimers()` com `waitFor` no mesmo caminho — trava (R-008). Usar espera real (`await act(() => new Promise((r) => setTimeout(r, 850)))`) para segurar o OK além do limiar quando o teste também precisa de `waitFor`.
- **`locate()` genérico não serve pra trilha com Favoritos**: seu fallback é sempre índice 0, que agora é a entrada virtual. Qualquer tela nova com essa trilha precisa do mesmo fallback próprio (R-009), não o `locate()` direto. Aplicado nas três telas de conteúdo (Live/Filmes/Séries); nenhuma tela nova prevista no escopo desta feature.
- **`press()` em teste de tela com a trilha de favoritos**: um `keydown` de Enter sozinho não basta mais pra completar um toque — falta o `keyup`. Testes que só existiam a partir de `LiveScreen.test.tsx` copiando o padrão precisam do mesmo ajuste ao serem escritos para Filmes/Séries.
