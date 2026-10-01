# Implementation Plan: Semelhantes, fotos do elenco e página de ator

**Slug**: `035-semelhantes-elenco-ator` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/035-semelhantes-elenco-ator/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

A aba "Semelhantes" do detalhe de filme/série deixa de ser o mock `similar`:
mostra até 20 títulos do TMDB (recomendações + similares) cruzados com o
catálogo **já guardado no aparelho** — encontrados primeiro, abrindo o
detalhe local; os demais com o chip "Não encontrado na sua lista" e um
resumo em modal. A aba Elenco ganha foto/personagem quando o título casou
no TMDB, e OK numa pessoa abre uma página de ator com a filmografia cruzada
do mesmo jeito. Tudo em pilha, com RETURN restaurando aba e item por
identidade.

Abordagem: Semelhantes e elenco com identidade vêm na **mesma** chamada de
detalhe que a 032 já faz (`append_to_response` amplia), guardados no mesmo
registro `titleMetadata` (sem bump); a filmografia é uma chamada só, ao dar
OK no ator, guardada numa tabela nova `tmdbPeople` (Dexie v13). O
cruzamento é uma função pura sobre IndexedDB (`resolveTmdbTitles`), sem rede.

## Technical Context

**Language/Version**: TypeScript 5 (strict) + React 19, build Vite com alvo `chrome108`.

**Primary Dependencies**: Dexie 4 (IndexedDB), `@tanstack/react-query`, `@tanstack/react-virtual` (via `Rail`), `fetch` nativo; API TMDB v3 (`api.themoviedb.org/3`, imagens `image.tmdb.org/t/p/{w185,w342,w1280}`). Nenhuma dependência nova.

**Storage**: IndexedDB — `titleMetadata.tmdb.fields` ganha `similar`/`castPeople` (valor, sem índice); tabela nova `tmdbPeople` (v13, chave `personId`). Ver `data-model.md`.

**Testing**: Vitest + Testing Library + fake-indexeddb (padrão `new CatalogDb(<nome>)` por teste); Playwright via scripts `tv-web/e2e/*.mjs`.

**Target Platform**: Samsung Tizen TV (QN50Q60DAGXZD, Tizen 9 / Chromium 120, origem `file://`); desenvolvimento em Chromium desktop.

**Performance Goals**: mover foco = zero requisição (SC-001); aba Semelhantes = zero requisição a mais (SC-005); resolução local numa varredura por tipo, só com a aba ativa ou a página de ator aberta (R-003).

**Constraints**: constitution 1.7.0 (foco, voltar por id, nunca inventar, segredos BYOK só para o próprio serviço, cobertura parcial declarada); ADR-008 (client-first), ADR-009 (foco por estado + `useRemoteNav`), ADR-011 (DS V14, sem preview por foco, "Em breve" só como mock registrado).

**Scale/Scope**: até 20 semelhantes e 20 pessoas por título; filmografia guardada até 200, exibida até 60; catálogo local de milhares de títulos por tipo.

## Decisões Invariantes

- **D-001** Uma chamada só por título: o detalhe do TMDB pede `credits,videos,recommendations,similar` (filme) e `aggregate_credits,videos,recommendations,similar` (série). Nenhuma requisição ao abrir a aba ou focar (`logic/semelhantes-e-elenco-tmdb.md` §1).
- **D-002** Com chave usável, o TMDB é consultado ao abrir o detalhe sempre que o registro TMDB estiver ausente, vencido (6 meses) ou anterior à 033/035 — **independente** de o provedor ter preenchido tudo. Amplia a FR-018 da 032 ("somente se houver lacuna"); a regra de mescla "provedor vence" não muda.
- **D-003** Registro `matched` sem a chave `similar` = anterior à 035 → pedido de novo uma vez, usando o `tmdbId` já casado como dica. `no_match`/`dead_id` não são repetidos.
- **D-004** `similar`/`castPeople` só do TMDB; `similar` = recomendações ++ similares, sem repetir, sem o próprio id, até 20, tipo = o do título de origem; `castPeople` até 20 na ordem `order`.
- **D-005** Cruzamento local (`resolveTmdbTitles`): só geração ativa e mesmo tipo; identidade = `titleMetadata.tmdb` `matched` (nunca `providerTmdbId` sozinho); senão título comparável + ano EXATO com ano local conhecido (emenda R-012; antes ±1); cópias do mesmo ano → primeira na ordem da fonte; anos diferentes → não encontrado; nunca rede nem categoria nova; resultado **não** é persistido (`logic/cruzamento-local.md`).
- **D-006** Aba Elenco: `castPeople` com pessoas → lista de pessoas do TMDB (foto, nome, personagem, navegável); senão o texto da 032, igual a hoje. Nunca mistura as duas listas.
- **D-007** Cobertura com a mesma regra da busca (`isCovered`, exportada de `catalogSearch.ts`); textos exatos em `logic/aba-semelhantes.md` §2.
- **D-008** Foco do painel/página de ator guardado como chave (`tmdb:<kind>:<id>`, `person:<id>`); a fileira efetiva é derivada (chave ausente → abas / primeiro item), nunca índice.
- **D-009** Filmografia: `/person/{id}?append_to_response=combined_credits` ao OK no ator; filtro de talk/news/reality e "Self"; ordem = popularidade do TMDB; guardada 6 meses em `tmdbPeople`; falha nunca guardada; `removeTmdbKey` limpa a tabela (`logic/pagina-de-ator.md`).
- **D-010** Navegação: sem ação nova no reducer — `open` com `from: { ...screen, restore }` e `back`; `restore?` nos dois detalhes e tela nova `person` (`logic/navegacao-detalhe.md`).
- **D-011** Resumo de não encontrado = `Modal` (feature 022) com dado já guardado — nenhuma requisição ao abri-lo; sem ação de assistir.
- **D-012** Página de ator = dois `Rail`s ("Na sua lista" / "Fora da sua lista"), raiz `.screen`, sem topbar; imagens com `PosterArt`/marcador neutro, nunca ícone quebrado.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Sem chave TMDB a aba explica e oferece "Configurar TMDB"; nada do resto do app depende disso. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Chave BYOK só em `tmdbConnector`; imagens sem chave; erros por categoria fixa; `PersonCreditsResult` sem mensagem de fetch (contrato 5). |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Semelhantes/filmografia são aditivos; nenhuma categoria/grupo da fonte muda. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Casamento ambíguo = não encontrado; sem ano não casa por título; texto honesto para sinopse ausente (contrato 1). |
| Comandos Locais Independem de Rede | ✅ | ✅ | Foco/RETURN/modal locais; resolução só IndexedDB. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Nada aqui escreve em `userStates`. |
| Toda Ação Essencial por Controle Remoto | ✅ | ✅ | Painel, resumo e página de ator por setas/OK/RETURN; RETURN fecha o modal antes da tela. |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não toca importação. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Cada estado com focável (aba, "Configurar TMDB", "Tentar de novo"/"Voltar"); focar nunca consulta (contratos 3/4, SC-001). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Snapshot por chave na pilha (D-008/D-010, contrato 3). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Chaves = `tmdbId`/`stableId`; nenhuma URL de stream envolvida. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Cobertura "Procurado em X de Y" declara o escopo parcial (FR-007). |
| Documentação É Canônica | ✅ | ✅ | Polish: CLAUDE.md, backlog, nota `**Atualização (035):**` na FR-018 da 032 (D-002). |

Sem violação — `## Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/035-semelhantes-elenco-ator/
├── spec.md
├── plan.md
├── data-model.md
├── quickstart.md
├── logic/
│   ├── semelhantes-e-elenco-tmdb.md
│   ├── cruzamento-local.md
│   ├── aba-semelhantes.md
│   ├── pagina-de-ator.md
│   └── navegacao-detalhe.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/
│   ├── semelhantes-elenco-ator.mjs          # novo (em test:e2e) — TMDB/painel falsos, conta requisições
│   └── semelhantes-real.mjs                 # novo (fora do test:e2e) — SC-002 com a lista real
├── package.json                             # test:e2e ganha o script novo
└── src/
    ├── App.tsx                              # onOpenTitle/onOpenPerson/onOpenTmdbSettings; rota 'person'
    ├── navigation/appNav.ts                 # restore? nos detalhes; tela 'person'
    ├── lib/
    │   ├── comingSoon.ts                    # − similar
    │   ├── catalog/
    │   │   ├── db.ts                        # TmdbTitleRef/CastPerson (stub feito); v13 tmdbPeople
    │   │   └── catalogSearch.ts             # export isCovered
    │   └── metadata/
    │       ├── types.ts                     # visão + tipos novos (stub feito)
    │       ├── tmdbConnector.ts             # tmdbImageUrl(path, size)
    │       ├── tmdbLookup.ts                # detailParams por tipo
    │       ├── tmdbMapping.ts               # similar, castPeople, aggregate_credits
    │       ├── titleMetadata.ts             # D-002/D-003, visão
    │       ├── tmdbKeyRepository.ts         # removeTmdbKey limpa tmdbPeople
    │       ├── localTitleMatch.ts           # stub → resolveTmdbTitles
    │       ├── similarTab.ts                # novo — similarTabStatus (puro)
    │       └── tmdbPeople.ts                # stub → loadPersonCredits
    ├── features/
    │   ├── catalog/catalogApi.ts            # useSimilarTitles (stub), usePersonCredits, usePersonTitles
    │   ├── vod/
    │   │   ├── detailSnapshot.ts            # stub feito
    │   │   ├── DetailMetadata.tsx           # elenco com foto
    │   │   ├── SimilarPanel.tsx             # novo
    │   │   └── TitleSummaryModal.tsx        # novo
    │   ├── movies/MovieDetailScreen.tsx     # aba real, fileira panel, restore, callbacks
    │   ├── series/SeriesDetailScreen.tsx    # idem
    │   └── person/
    │       ├── PersonScreen.tsx             # novo
    │       └── personSnapshot.ts            # novo
    └── styles/vod.css                       # painel, pessoas, resumo, página de ator (tokens V14)
```

**Structure Decision**: frontend único em `tv-web/` (client-first, ADR-008). Lógica de TMDB e cruzamento em `tv-web/src/lib/metadata/`; hooks em `features/catalog/catalogApi.ts` (padrão do projeto); telas em `features/`. `api/` e `CCPlayTv/` não são tocados (exceto o sync do `build:tizen`, sem arquivo novo emitido).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivo>        # o mais estreito primeiro
npm run test                    # suíte inteira
npx tsc -b
npm run lint
npm run build:tizen
npm run test:e2e                # com npm run dev rodando
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts`,
`tv-web/src/lib/metadata/titleMetadata.semelhantes.contract.test.ts`,
`tv-web/src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts`,
`tv-web/src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`

Comando (de `tv-web/`): `npx vitest run src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts src/lib/metadata/titleMetadata.semelhantes.contract.test.ts src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `resolveTmdbTitles` — encontrados primeiro; cópias → primeira da fonte; anos diferentes/tipo diferente → não encontrado; cobertura X de Y | US1/AC1+AC2, FR-005–FR-008; Constitution "Nunca Inventam Dados" | Fase 3 | `Error: not implemented` |
| `ensureTitleMetadata` — com chave e provedor completo, uma consulta TMDB traz Semelhantes e elenco; reabrir não chama; registro anterior à 035 repetido uma vez | FR-002/FR-003/FR-004/FR-013, SC-005 | Fase 2 | `AssertionError: expected undefined to be defined` (TMDB não consultado) |
| `loadPersonCredits` — falha não guardada nem com chave; sucesso filtrado/ordenado e em cache; remover a chave corta e descarta | US4/AC1+AC5, FR-016/FR-018/FR-021/FR-022 | Fase 6 | `Error: not implemented` |
| `MovieDetailScreen` — encontrado abre detalhe com snapshot; não encontrado abre resumo; RETURN devolve o foco; snapshot restaura por identidade | US1/AC2–AC5, FR-008–FR-010/FR-019; Constitution "Voltar Restaura Foco" | Fase 3 | `aria-selected` ausente na aba Semelhantes (mock ainda soft-disabled) |
| `MovieDetailScreen` — sem chave "Configurar TMDB" focável; sem casamento mensagem própria e foco na aba | US2/AC1+AC2, FR-011/FR-012, SC-004 | Fase 4 | `Unable to find … /Semelhantes vêm do TMDB/i` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/metadata/localTitleMatch.ts`, `tv-web/src/lib/metadata/tmdbPeople.ts`,
`tv-web/src/features/vod/detailSnapshot.ts`, tipos em `tv-web/src/lib/metadata/types.ts`
e `tv-web/src/lib/catalog/db.ts`, `useSimilarTitles` em
`tv-web/src/features/catalog/catalogApi.ts`, props opcionais em
`tv-web/src/features/movies/MovieDetailScreen.tsx`.

Travas de outras features que esta pode quebrar: 032 (`titleMetadata`/`tmdbKeyRepository`/`MovieDetailScreen` contracts), 033 (`titleMetadata.trailers`, `MovieDetailScreen.trailers`), 023/024 (`appNav` contracts), 022 (componentes). Verificar todas com `check-contract-tests.ps1`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Consulta TMDB (Fase 2) | Feito: `append_to_response` por tipo, `similar`/`castPeople`/`cast` texto da série, sem `providerLeavesGaps`, `tmdbLacks035`; 5/5 contratos travados verdes |
| Cruzamento local | Feito: `resolveTmdbTitles` (só IndexedDB); p50 ≈ 160 ms / p95 ≈ 250 ms sobre 11 129 filmes reais |
| Aba Semelhantes (US1/US2) | Feito nos dois detalhes: painel, resumo, cinco estados com focável, `restore`, "Configurar TMDB" |
| Elenco com foto (US3) | Feito: `CastPeoplePanel`, marcador neutro em falha de foto |
| Página de ator (US4) | Feito: `PersonScreen`, Dexie v13 `tmdbPeople`, `loadPersonCredits`, rota `person` |
| E2E | `e2e/semelhantes-elenco-ator.mjs` (em `test:e2e`) verde; `e2e/semelhantes-real.mjs` medido |
| Ação "Semelhantes" no hero (pós-TV) | Feito nos dois detalhes: ação entre Trailer e "Marcar assistido" (filme) / depois de Trailer (série); OK ativa a aba e foca o painel (`useEnterSimilarPanel`) |
| Ressalva | SC-002 atendido com ressalva (R-011/R-012): sobra homônimo do mesmo ano; TV física recomendada, não gate |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | D-002 muda a FR-018 da 032: com chave, todo título aberto consulta o TMDB uma vez a cada 6 meses, mesmo com o provedor completo. | Mais chamadas ao TMDB (1 por título aberto por 6 meses); cota BYOK da pessoa. | Resolvido (2026-09-30, pendência A1): a spec da 035 registra a mudança em Assumptions e Clarifications, e a FR-018 da 032 ganhou a nota `**Atualização (035):**`. |
| R-002 | `append_to_response` maior (recomendações + similares + `aggregate_credits`) aumenta a resposta; `aggregate_credits` de série longa pode ter centenas de pessoas. | Parse/armazenamento maiores por título. | Resolvido (converge 2026-09-30): Guardar só 20 semelhantes e 20 pessoas; medir tamanho no E2E real. |
| R-003 | Resolução local varre o tipo inteiro na geração ativa. | Latência na TV com muitas categorias abertas. | Resolvido (converge 2026-09-30): Uma varredura por tipo, só com a aba ativa/página de ator; medir p95 em `semelhantes-real.mjs`; se preciso, índice em memória por geração (sem mudar o contrato). |
| R-004 | Dexie v13 (`tmdbPeople`) enquanto a feature 034 está em andamento na mesma branch (hoje sem bump). | Colisão de número de versão. | Resolvido (converge 2026-09-30): Quem fizer merge depois usa a próxima versão livre; conferir `db.ts` antes de subir. |
| R-005 | Testes **não travados** da 032/033/025 assumem "provedor completo → sem TMDB", `credits` na série, e "Semelhantes em breve" (`MovieDetailScreen.test.tsx`, `comingSoon.test.ts`, `titleMetadata.tmdb.test.ts`). | Vermelhos esperados após a Fase 2/3. | Resolvido (converge 2026-09-30): Atualizar esses testes para a regra nova nas fases correspondentes; nunca os contratos travados. |
| R-006 | Aba Elenco com casamento mostra a lista do TMDB em vez do texto do provedor (D-006). | Exceção visual ao "provedor vence" só nesta aba. | Resolvido (2026-09-30, pendência A4): a FR-013 diz explicitamente que a troca vale só nesta aba, sem misturar as listas, e que a aba Detalhes segue a 032. O casamento é estrito. |
| R-007 | Filtro da filmografia (talk/news/reality, "Self") é heurístico. | Pode esconder um crédito legítimo raro. | Resolvido (converge 2026-09-30): Aceito; regra fixa em `logic/pagina-de-ator.md` §3. A ordem por popularidade (A2) e a cobertura com os dois tipos (A3) estão na FR-017 da spec desde 2026-09-30. |
| R-008 | SC-002 depende de lista real + chave TMDB (`CCPLAY_PROBE_TMDB_KEY`). | Sem o `.env`, SC-002 fica não medido. | Resolvido: o `.env` tem a chave e a lista; `e2e/semelhantes-real.mjs` mediu (ver R-011). |
| R-009 | Desvio de `logic/semelhantes-e-elenco-tmdb.md` §2: o mapeamento devolve `similar: []` sempre (nunca ausente), mesmo se a resposta não traz `recommendations`/`similar`. | O contrato travado da 033 (`titleMetadata.trailers.contract`) devolve um detalhe sem essas chaves; ausente faria `tmdbLacks035` repetir a consulta a cada abertura. | Resolvido (converge 2026-09-30): Aceito: as listas são pedidas na mesma chamada, então chave ausente = "nada veio". O TMDB real sempre devolve as chaves com `append_to_response`. |
| R-010 | Desvio de `logic/aba-semelhantes.md`/D-012: `SimilarPanel` e `CastPeoplePanel` usam fileira horizontal simples, não o `Rail` virtualizado (a `PersonScreen` usa `Rail`). | O contrato travado da tela renderiza sem layout (jsdom), onde o `Rail` não desenha nenhum cartão. | Resolvido (converge 2026-09-30): Aceito: no máximo 20 cartões/pessoas; o cartão focado é trazido à vista com `scrollIntoView`. |
| R-011 | **SC-002 ("0 casamentos errados") não atendido** pela regra título + ano ±1 medida na lista real (`e2e/semelhantes-real.mjs`, 50 filmes de origem, 250 títulos "encontrados" conferidos contra o `tmdb_id` do provedor): 3–4 divergentes por execução (~1,5 %). Os casos são homônimos reais — "A Casa Sombria" 2021 × registro 2020, "A Cura" 2017 × 2018 (anos ±1) e "Maligno" 2021 × outro "Maligno" 2021 (mesmo ano, obras diferentes). | Um cartão "encontrado" pode abrir o filme errado, contra a constitution ("Nunca Inventam Dados"). Identidade TMDB (`titleMetadata`) evita, mas só existe para títulos já abertos. | Resolvido em parte por R-012 (ano exato, aprovado pelo usuário): caiu para ~1 divergente por execução, um homônimo do MESMO ano ("Acampamento de Verão" 2024, duas obras; o "Maligno" 2021 é do mesmo tipo). **Limite aceito**: nome + ano não distingue obras homônimas do mesmo ano; só o `tmdb_id` distinguiria (a listagem do provedor não o traz). SC-002 fica "atendido com ressalva", declarado. |
| R-012 | Emenda aprovada pelo usuário (2026-09-30): o cruzamento por título exige ano EXATO (antes ±1). `resolveTmdbTitles` e o contrato travado `localTitleMatch.semelhantes.contract.test.ts` foram emendados (o caso "Matrix" 1999/2000 passa de ambíguo para "casa o de 1999"; a ordem dos encontrados segue a dos refs) e a trava foi regravada. A pedido do usuário, cartões encontrados ganham o marcador `✓ Na sua lista` (o chip dos não encontrados continua). | Filmes cujo ano no provedor difere em 1 do TMDB passam a aparecer como não encontrados (preferível a abrir o filme errado). | Resolvido (converge 2026-09-30): Registrado; `logic/cruzamento-local.md` e D-005 anotados. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-30 | Fases 1–2 | Setup + consulta TMDB do detalhe (Semelhantes/elenco na mesma chamada, D-002/D-003). | R-009 (`similar` sempre presente). |
| 2026-09-30 | Fases 3–4 (US1/US2) | `resolveTmdbTitles`, `useSimilarTitles`, `SimilarPanel`, resumo, `restore`, navegação de detalhes. | R-010 (fileira simples no lugar do `Rail`). |
| 2026-09-30 | Fase 5 (US3) | Elenco com foto/personagem, marcador neutro. | — |
| 2026-09-30 | Fase 6 (US4) | Dexie v13, `loadPersonCredits`, `PersonScreen`, rota `person`. | — |
| 2026-09-30 | Fase 7 | E2E com TMDB falso verde (em `test:e2e`); medição real: p95 ≈ 250 ms, mas SC-002 não atendido (R-011); revisão de segredos; docs. | R-011: decisão do usuário. |
| 2026-09-30 | Fase 9 (pós-TV) | Ação "☰ Semelhantes" no hero de filme e série (pedido do usuário após o teste na TV: a aba ficava escondida). | Reexecutar E2E; rever na TV. |

**PRÓXIMO**: nada pendente na 035 — `npm run test:e2e` completo verde (18 scripts) e TV física verificada (2026-09-30). Falta só commitar.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/metadata/{tmdbLookup,tmdbMapping,titleMetadata,localTitleMatch,similarTab,tmdbPeople}.ts`
- `tv-web/src/features/catalog/catalogApi.ts` (`useSimilarTitles`, `usePersonCredits`, `usePersonTitles`)
- `tv-web/src/features/vod/{SimilarPanel,TitleSummaryModal,DetailMetadata}.tsx`
- `tv-web/src/features/{movies/MovieDetailScreen,series/SeriesDetailScreen,person/PersonScreen}.tsx`
- `tv-web/src/navigation/appNav.ts`, `tv-web/src/App.tsx`, `tv-web/src/lib/catalog/db.ts` (v13)
- `tv-web/e2e/semelhantes-elenco-ator.mjs`, `tv-web/e2e/semelhantes-real.mjs`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Os contratos de tela mockam `catalogApi` e renderizam sem layout: qualquer lista nova dentro do detalhe precisa existir no DOM sem medir (o `Rail` não serve aí).
- O painel de Semelhantes/Elenco lembra o último cartão focado ao reentrar (↑ e ↓ voltam ao mesmo); roteiros E2E devem contar com isso.
- `App.tsx` usa `key` com `history.length` nos detalhes/ator para que A → B → A nunca reaproveite o estado do detalhe anterior.
- `e2e/semelhantes-real.mjs` monta um banco de teste (`e2e-real-semelhantes`) no navegador e o apaga no fim; nunca imprime chave, endereço nem credenciais.

## Resultado Final

**Convergida em 2026-09-30.** A aba Semelhantes é real nos detalhes de filme e de série, a aba Elenco mostra foto/nome/personagem quando o título casou no TMDB e OK numa pessoa abre a página de ator, com pilha de RETURN restaurando aba e item por identidade.

**Como ficou construído**
- Semelhantes e elenco com identidade vêm na MESMA chamada de detalhe da 032 (`append_to_response` ampliado), no mesmo registro `titleMetadata`; só a filmografia é uma chamada própria (`/person/{id}`), guardada em `tmdbPeople` (Dexie v13) e limpa junto com a chave.
- `resolveTmdbTitles` cruza só com o IndexedDB: identidade TMDB, senão título + ano **exato**; cópias do mesmo ano valem a primeira da fonte.
- Cartões encontrados levam o marcador "✓ Na sua lista"; os não encontrados, o chip e o resumo em modal (sem assistir).

**Desvios acumulados em relação ao plano original**
- R-009: `similar` é sempre `[]`, nunca ausente (contrato travado da 033).
- R-010: fileira horizontal simples no lugar do `Rail` nos painéis de Semelhantes/Elenco (contrato renderiza sem layout).
- R-012 (emenda aprovada pelo usuário): ano exato no lugar de ±1; contrato travado emendado e trava regravada; FR-005 e SC-002 da spec anotadas.
- D-002: com chave, o TMDB é consultado ao abrir o detalhe mesmo com o provedor completo (amplia a FR-018 da 032, registrado nas duas specs).

**Verificação**: 5/5 contratos e trava íntegra; travas 022–025, 032 e 033 íntegras; `tsc`/lint/`build:tizen` limpos; `test:e2e` com 18 scripts verdes, incluindo `semelhantes-elenco-ator.mjs` (zero requisição ao focar/trocar de aba, 10 sequências e 10 cadeias com ator restauradas). Medição real: resolução p50 ≈ 150 ms / p95 ≈ 170 ms sobre 11 129 filmes; SC-002 atendido com a ressalva de ~1 homônimo do mesmo ano em ~250 (R-011).

**Em aberto, não bloqueia**: passada na TV física (imagens do `image.tmdb.org` no WebView, fluidez dos cartões). As falhas remanescentes da suíte completa são contratos das features 034/036/037 (ainda sem implementação) e flakes conhecidos, fora deste escopo.


