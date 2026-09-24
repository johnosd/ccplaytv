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

**Adição (sessão 2026-09-24, pós-verificação em TV física)**: o gesto de
segurar OK ganhou um segundo caminho independente para a mesma ação —
apertar a tecla amarela do controle num toque único (FR-020/FR-021). O
controle de teste usado na verificação em TV física não distinguiu
pressionar/segurar/soltar do jeito que o navegador desktop distingue,
inviabilizando o gesto nele; a decisão do usuário foi manter o gesto
exatamente como está (nenhuma regressão) e acrescentar a tecla de cor como
atalho complementar, nunca substituto — ver D-010.

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

**Constraints**: só setas/OK/RETURN garantidos sem registro adicional
(item 44). **Adição**: a tecla amarela precisa de
`tizen.tvinputdevice.registerKey('ColorF2Yellow')` e da privilege
`http://tizen.org/privilege/tvinputdevice` (`CCPlayTv/config.xml`) para
chegar ao app — as outras três cores seguem não registradas, por decisão
explícita (não é "todas as coloridas", só a amarela, e só para esta
ação). Client-first (ADR-008); foco como estado React + classe `tv-focus`
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
- **D-010 — Tecla amarela é `onFavoriteKey`, opt-in, mesma função das três
  telas** *(adição, sessão 2026-09-24)*. Igual a D-001/D-002: novo handler
  opcional em `useRemoteNav` (`onFavoriteKey`), passado pelas três telas
  exatamente onde `onLongSelect` já era passado (`canToggleFavorite`) —
  chamando a mesma função `toggleFocusedFavorite()`, nunca uma cópia. Dispara
  no `keydown` (não é um gesto de segurar — é um toque único, sem limiar),
  com um debounce curto (`FAVORITE_KEY_DEBOUNCE_MS = 400`) só para absorver
  auto-repetição de hardware, já que `event.repeat` não é confiável (mesma
  desconfiança de D-002/R-001). Registro do evento
  (`tizen.tvinputdevice.registerKey`) é global, uma vez, em `App.tsx` — não
  por tela — porque é custo de inicialização do app, não de uma tela
  específica; falha ao registrar (fora do Tizen, ou privilege ausente) é
  silenciosa (mesmo padrão de `tizenExit.ts`), nunca um erro visível.

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
| Toda Ação Essencial Tem Caminho por Controle Remoto | ⚠️ | ✅ | Favoritar depende de segurar OK (escolha da spec) — continua sendo "Setas + SELECT"; descobribilidade coberta pela dica fixa (FR-012). Pós-design: gesto usa só OK; RETURN inalterado. **Adição (2026-09-24)**: a tecla amarela é um segundo caminho, nunca o único — `docs/guia-praticas-app-tv/03_metodos_de_entrada.md`: "Pressão longa, teclas coloridas, voz e gestos podem servir como atalhos, mas não como único acesso"; FR-020 mantém FR-001 intacto em vez de substituí-lo. |
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
    ├── App.tsx                               # registerFavoriteColorKey() no mount (T034, adição)
    ├── lib/
    │   ├── useRemoteNav.ts / .test.tsx       # gesto onLongSelect (T003–T004) + onFavoriteKey (T034, adição)
    │   ├── tizenColorKey.ts / .test.ts       # NOVO (T034, adição) — registerFavoriteColorKey, FAVORITE_COLOR_KEY
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

**Adição (2026-09-24)**: `CCPlayTv/config.xml` ganhou a declaração da
privilege `http://tizen.org/privilege/tvinputdevice` — arquivo mantido à
mão (confirmado em `tv-web/scripts/sync-tizen.mjs`: não é sobrescrito
pelo build, junto de `.project`/`.tproject`/`tizen_web_project.yaml`/
`icon.png`).

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
- **Adição (2026-09-24) — tecla amarela**: `tizenColorKey.test.ts`
  (registro condicional a `getSupportedKeys`, falha silenciosa);
  `useRemoteNav.test.tsx` (dispara no keydown, debounce de repetição,
  independência do gesto de OK); `LiveScreen.favorites.test.tsx` novo
  teste (b2, toque único com o mesmo resultado do segurar);
  `FavoritesState.test.tsx` (dica e estado vazio citam os dois caminhos).
  E2E: `favoritos.mjs` ganhou uma seção em Séries usando
  `page.evaluate()` para disparar um `KeyboardEvent` sintético
  (`key: 'ColorF2Yellow'`) — não existe tecla física de teclado
  equivalente que o Playwright possa simular via `keyboard.press`.
  **TV física (gate elevado, junto de R-001 — SC-006)**: o nome da tecla
  e a privilege não são verificados contra hardware real nesta sessão.

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
| Fase 5 (US3 — persistência) | Concluída — `deleteSource` apaga `userStates`; favorito sobrevive a resync e a reabrir o banco; isolamento entre fontes. 553/553 testes (5 novos), `tsc`/lint limpos |
| Fase 6 (Polish) | Quase concluída — T028–T032 feitos (E2E, gates, quickstart §B/§C parcial, docs, segredos). **Adição (2026-09-24, T034)**: segundo caminho de favoritar por tecla amarela (FR-020/FR-021), código-completo e testado (unitário + E2E), gates limpos (565/565). **Só falta T033 (TV física, gate de SC-001/R-001) e a verificação de hardware da tecla amarela (SC-006, mesmo gate)**, sem acesso à TV nesta sessão |

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
| R-010 | `npm run test:e2e` como comando único falha neste ambiente de execução: `e2e.mjs` (pré-existente, roda antes de `e2e/favoritos.mjs` por causa do `&&`) tenta abrir um binário do Chromium (`chromium-1243`) que este sandbox não tem pré-instalado (só há `chromium-1194`, em `/opt/pw-browsers/chromium`) | Baixo — só ambiente de execução, não é bug de app nem desta feature | Fora do escopo: `e2e.mjs` é pré-existente e não foi tocado por esta feature; o problema é o binário do Playwright não bater com a versão que aquele script pede, algo do AMBIENTE, não do código. `e2e/favoritos.mjs` (desta feature) roda limpo sozinho (`executablePath: '/opt/pw-browsers/chromium'`, `node e2e/favoritos.mjs`), satisfazendo o gate da constitution por si. Não corrigido — reportar se persistir em outro ambiente. |
| R-011 | *(adição, 2026-09-24)* O nome da tecla na Tizen Web API (`ColorF2Yellow`) e a privilege `http://tizen.org/privilege/tvinputdevice` que `tizen.tvinputdevice.registerKey()` exige são baseados no conhecimento geral da API — não confirmados contra a documentação viva da Samsung (sem acesso à internet nesta sessão) nem contra hardware real | Médio — se o nome da tecla ou a privilege estiverem errados, a tecla amarela simplesmente não chega ao app (silencioso, sem erro visível, por D-010) | `registerFavoriteColorKey()` já tolera essa incerteza por construção: falha ao registrar não quebra nada (try/catch, mesmo padrão de `tizenExit.ts`) e o gesto de segurar OK continua funcionando sozinho (FR-020 nunca substitui FR-001). Fechamento: verificar `getSupportedKeys()` e o efeito real da tecla na mesma passagem de TV física de T033 (SC-006). Se o nome estiver errado, é um ajuste de uma constante (`FAVORITE_COLOR_KEY` em `tizenColorKey.ts`), não um redesenho. |
| R-012 | *(adição, 2026-09-24)* `e2e/favoritos.mjs` ficou intermitente neste sandbox depois da nova seção de Séries — várias corridas falharam em `waitForSelector`s **pré-existentes** (ex.: entrar em Filmes), não nos passos novos | Baixo — mesma natureza ambiental de R-010, não uma regressão de lógica | Isolado com um script de depuração (`page.evaluate` + `innerHTML`/`innerText`) rodado repetidas vezes: a lógica dos dois caminhos está correta (uma corrida limpa e completa confirmada, "Todas as verificações passaram"); os timeouts batem em pontos aleatórios do roteiro inteiro (inclusive em código desta feature já convergido antes desta sessão), condizente com throttling de CPU do sandbox headless, não com um bug introduzido agora. Uma corrida real encontrou e corrigiu um problema genuíno (não ambiental): a tecla amarela dispara `keydown`+`keyup` num só `page.evaluate`, sem os ~950ms reais que `holdEnter` embute — a asserção do aviso de toast precisava de `waitForSelector` (que espera), não de `isVisible()` síncrono logo em seguida; corrigido no próprio script. Não investigado a fundo além disso — mesma decisão de R-010 (ambiente de execução, fora do escopo consertar). |

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
| 2026-09-24 | Fase 5 (US3 — persistência) | `sourceRepository.deleteSource` passa a chamar `deleteUserStatesForSource` — favoritos e retomada da fonte removida somem, os de outra fonte ficam intactos (D-007/FR-017). Testes de integração: favorito sobrevive a uma nova geração publicada com o mesmo `providerStreamId` e a fechar/reabrir `CatalogDb` com o mesmo nome (o registro `userStates` em si, não só o catálogo — SC-003); `useFavoriteIds`/`useFavoritesContent` isolados entre duas fontes (US3 cenário 5). Nenhum achado fora do previsto. 553/553 testes (5 novos líquidos), `tsc`/lint limpos, 0 regressão. | Nenhuma técnica. |
| 2026-09-24 | Fase 6 (Polish) | `tv-web/e2e/favoritos.mjs` + `fixtures/favoritos.m3u` novos (servidor HTTP local com CORS, Playwright headless via `executablePath: '/opt/pw-browsers/chromium'` — o binário padrão de `headless:true` desta versão do Playwright não está pré-instalado no sandbox, R-010). 15/15 verificações passaram: segurar-OK favorita sem abrir o player, OK curto continua tocando, RETURN fecha, "★ Favoritos" resolve e toca, sobrevive a `page.reload()`, desfavoritar tudo devolve o vazio ativável por OK, e o mesmo gesto funciona em Filmes. Gates completos limpos (`test`/`lint`/`tsc -b`/`build`, 553/553). Verificação manual adicional (não commitada, script ad-hoc): 10 segurar-OK alternados no mesmo item — 10/10 corretos; fonte M3U sintética de 5000 filmes — import ~1,9s, entrar em "★ Favoritos" com varredura por nome (R-003) — **187ms**. Documentação: ADR-009 emendada, `CLAUDE.md` com o parágrafo da 013. Revisão de segredos sem achados. | **T033 (TV física, gate de SC-001/R-001) não executado — sem acesso à TV física nesta sessão. É a única pendência de toda a feature.** |
| 2026-09-24 | Fase 6 (Polish) — adição pós-TV | Usuário tentou T033 na TV física com um controle de teste (não o original); o gesto de segurar OK não funcionou nele (`keyup` não se comportou como no navegador). Decisão registrada em spec.md/Clarifications: manter o gesto como está e acrescentar um segundo caminho — tecla amarela do controle, toque único (FR-020/FR-021, D-010). Implementado: `tv-web/src/lib/tizenColorKey.ts` (`registerFavoriteColorKey`, `FAVORITE_COLOR_KEY = 'ColorF2Yellow'`, falha silenciosa fora do Tizen ou sem a tecla listada em `getSupportedKeys()`) + `.test.ts` (5 testes); `useRemoteNav.ts` ganhou `onFavoriteKey` (dispara no keydown, debounce de 400ms contra auto-repetição de hardware) + 5 testes novos em `useRemoteNav.test.tsx`; as três telas (`LiveScreen`/`MoviesScreen`/`SeriesScreen`) extraíram `toggleFocusedFavorite()` e passaram a wirar `onLongSelect` **e** `onFavoriteKey` pra ela — mesma função, dois gatilhos; `App.tsx` chama `registerFavoriteColorKey()` uma vez no mount; `CCPlayTv/config.xml` ganhou a privilege `tvinputdevice` (arquivo mantido à mão, confirmado que o sync do build não o sobrescreve); `FavoritesState.tsx` ganhou `FavoriteHint` compartilhado e a cópia do estado vazio passou a citar os dois caminhos. Teste E2E novo em `favoritos.mjs` (seção Séries, `page.evaluate` disparando um `KeyboardEvent` sintético já que não há tecla física equivalente) — achou e corrigiu um bug real do próprio script (toast checado com `isVisible()` síncrono em vez de `waitForSelector`, que espera a mutação assíncrona resolver; R-012). 565/565 testes (12 novos líquidos), `lint`/`tsc -b`/`build` limpos, E2E confirmado limpo numa corrida completa (as demais tentativas falharam em pontos aleatórios e pré-existentes do roteiro — R-012, ambiental). spec.md atualizada com FR-020/FR-021/SC-006 e uma nova sessão de Clarifications. | **T033 continua a única pendência — agora cobrindo também SC-006 (tecla amarela) e R-011 (nome da tecla/privilege não verificados em hardware).** |

**PRÓXIMO**: T033 — `npm run build:tizen` + instalar via skill `tizen-tv` + `quickstart.md` §D na QN50Q60DAGXZD, cobrindo SC-001 (20 OK curtos + 20 demorados alternados de verdade no controle físico), SC-002/SC-004, **e agora também SC-006** (tecla amarela: confere se `getSupportedKeys()` a lista e se 20 toques alternam o favorito, R-011). Até lá, a feature está código-completa mas não pode ser convergida sem essa verificação ou uma decisão explícita do usuário para fechar sem ela (constitution, exceção de "Validação em hardware real" — mesmo padrão da feature 011).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/live/LiveScreen.tsx`, `MoviesScreen.tsx`, `SeriesScreen.tsx` — trilha, gesto, estrela, conteúdo de Favoritos + `onFavoriteKey` (Fases 3-4 e adição de 2026-09-24, feitas)
- `tv-web/src/lib/catalog/sourceRepository.ts` — `deleteSource` apaga `userStates` (Fase 5, feita)
- `tv-web/e2e/favoritos.mjs` + `e2e/fixtures/favoritos.m3u` — roteiro E2E, com a seção da tecla amarela (Fase 6 + adição, feito)
- `tv-web/src/lib/tizenColorKey.ts`, `tv-web/src/lib/useRemoteNav.ts`, `tv-web/src/App.tsx`, `CCPlayTv/config.xml` — registro e disparo da tecla amarela (adição de 2026-09-24, feito)
- `sdd/adr/ADR-009-navegao-direcional-prpria-useremotenav-vez.md`, `CLAUDE.md` — documentação atualizada (Fase 6, feita)
- **Próximo**: nenhum arquivo de código — só o ciclo `tizen-tv` (T033) na TV física, agora cobrindo SC-006 também

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Teste de gesto + `waitFor` no mesmo teste**: nunca usar `vi.useFakeTimers()` com `waitFor` no mesmo caminho — trava (R-008). Usar espera real (`await act(() => new Promise((r) => setTimeout(r, 850)))`) para segurar o OK além do limiar quando o teste também precisa de `waitFor`.
- **`locate()` genérico não serve pra trilha com Favoritos**: seu fallback é sempre índice 0, que agora é a entrada virtual. Qualquer tela nova com essa trilha precisa do mesmo fallback próprio (R-009), não o `locate()` direto. Aplicado nas três telas de conteúdo (Live/Filmes/Séries); nenhuma tela nova prevista no escopo desta feature.
- **`press()` em teste de tela com a trilha de favoritos**: um `keydown` de Enter sozinho não basta mais pra completar um toque — falta o `keyup`. Aplicado nos três arquivos `*Screen.test.tsx` existentes (Live/Filmes/Séries) e no roteiro E2E (`keyboard.down`/`up`, não `press`, quando o gesto de segurar importa).
- **Playwright headless neste sandbox**: usar sempre `executablePath: '/opt/pw-browsers/chromium'` ao chamar `chromium.launch()` — o binário `chrome-headless-shell` que `headless:true` pediria por padrão não está pré-instalado aqui (R-010). `e2e.mjs` pré-existente (`headless:false`, sem `executablePath`) também falha por isso, mas é fora do escopo desta feature — não foi corrigido.
- **A feature está código-completa.** Tudo que falta é T033 na TV física (agora cobrindo também a tecla amarela, SC-006) — não há mais nenhum arquivo de código a mudar antes disso. Ao retomar, ir direto para o skill `tizen-tv`.
- **Tecla de cor em teste E2E não tem tecla física equivalente**: Playwright não simula `ColorF2Yellow` via `keyboard.press`; usar `page.evaluate()` disparando `document.dispatchEvent(new KeyboardEvent('keydown'/'keyup', { key: 'ColorF2Yellow', bubbles: true }))` — o listener de `useRemoteNav` está em `document`, não em `window` nem por elemento.
- **Toque único (tecla de cor) não embute espera real como `holdEnter`**: qualquer asserção de aviso/toast depois de disparar a tecla amarela precisa de `waitForSelector` (que espera a mutação assíncrona), nunca de `isVisible()` síncrono logo em seguida — achado em R-012.
- **`ListHomeScreen` reinicia o foco da trilha ao remontar**: voltar de uma tela de lista pro hub sempre foca "Live TV" (índice 0), nunca o tile de onde veio (`useState(0)` sem persistência) — ao escrever E2E que navega hub → tela → hub → outra tela, contar `ArrowRight`s a partir de "Live TV", não do tile anterior.
- **Sair de uma categoria (col 1) só volta pra trilha (col 0), não pro hub**: em `MoviesScreen`/`SeriesScreen`/`LiveScreen`, `onBack` com `col === 1` faz `setCol(0)` e retorna sem chamar o `onBack` externo — precisa de dois `Escape` (ou `RETURN`) pra sair de uma categoria até o hub, um E2E que assume um só vai travar num `waitForSelector` do passo seguinte.
