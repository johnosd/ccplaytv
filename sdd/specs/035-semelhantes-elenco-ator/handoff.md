# Handoff — 035 Semelhantes, fotos do elenco e página de ator

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Frontend React 19 + TS + Vite em `tv-web/` (client-first, Dexie/IndexedDB, TMDB BYOK).
- Próximo comando: `/sdd-execute 035-semelhantes-elenco-ator`. Backlog: **Planejada**.
- A feature **034** está em andamento na mesma branch, sem commit (`db.ts`, `sourceRepository.ts`, `importApi.ts`, `accountCheck.ts`…). Não mexa nos arquivos dela. `db.ts` tem mudanças dela (campos de conta em `SourceRecord`, sem subir versão) **e** os tipos que o plan da 035 acrescentou (`TmdbTitleRef`, `CastPerson`, `TitleFields.similar/castPeople`). Releia `db.ts` antes de subir a versão do Dexie.

## O que a feature entrega

- **US1 (P1)**: aba Semelhantes real (fim do mock `similar`), com até 20 títulos do TMDB. Os encontrados na lista vêm primeiro e abrem o detalhe local. Os não encontrados levam o chip "Não encontrado na sua lista" e, com OK, abrem um **modal de resumo** (sem assistir). A linha de cobertura diz "Procurado em X de Y categorias de filmes".
- **US2 (P1)**: estados sem dado (sem chave → "Configurar TMDB"; sem casamento; sem semelhantes; TMDB indisponível), todos com um elemento focável.
- **US3 (P2)**: aba Elenco com foto, nome e personagem quando o título casou. **Com casamento, a lista do TMDB substitui o texto do provedor nessa aba** (D-006). Sem casamento, a aba fica exatamente como na 032.
- **US4 (P2)**: OK numa pessoa abre a página de ator: foto, nome e filmografia cruzada em dois rails ("Na sua lista" e "Fora da sua lista"). A página não tem biografia.
- Decisão que contraria a 032: **com chave, o TMDB passa a ser consultado ao abrir o detalhe mesmo com o provedor completo** (D-002, R-001), porque Semelhantes e fotos só existem no TMDB.

## Leitura obrigatória, em ordem

1. `spec.md`: FRs, edge cases e Clarifications.
2. `plan.md`: Decisões Invariantes D-001 a D-012, riscos R-001 a R-008 e tabela dos contratos.
3. `tasks.md`: 7 fases, T001–T045.
4. `logic/semelhantes-e-elenco-tmdb.md`: parâmetros da chamada, mapeamento e quando consultar.
5. `logic/cruzamento-local.md`: algoritmo de `resolveTmdbTitles` (cópias × ambíguo).
6. `logic/aba-semelhantes.md`: tabela de estados, **textos exatos** e foco da fileira `panel`.
7. `logic/pagina-de-ator.md`: `loadPersonCredits`, filtro da filmografia e `PersonScreen`.
8. `logic/navegacao-detalhe.md`: pilha só com `open`/`back`, restauração por chave.
9. `data-model.md`: campos novos, tabela `tmdbPeople` (v13) e tipos de navegação.
10. `quickstart.md`: comandos, cenários E2E e medição real.
11. `.planning/memory/constitution.md`: foco, voltar por id, nunca inventar, segredos BYOK.

## Testes de contrato

Travados em `sdd/specs/035-semelhantes-elenco-ator/contract-tests.lock` (5/5):

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/metadata/titleMetadata.semelhantes.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts` | 1 | 3 |
| `tv-web/src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx` | 2 | 3 (1º) e 4 (2º) |
| `tv-web/src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts` | 1 | 6 |

- Rodar (de `tv-web/`): `npx vitest run src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts src/lib/metadata/titleMetadata.semelhantes.contract.test.ts src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator`
- Travas de outras features que esta mudança pode quebrar:
  - 032 (`titleMetadata.metadata-tmdb`, `tmdbKeyRepository.metadata-tmdb`, `MovieDetailScreen.metadata-tmdb`);
  - 033 (`titleMetadata.trailers`, que exige `credits` e `videos` no `append_to_response` do **filme**, e `MovieDetailScreen.trailers`);
  - 023/024 (`appNav`);
  - 022 (componentes).

  Hoje todas estão íntegras.

## Stubs criados

- `tv-web/src/lib/metadata/localTitleMatch.ts`: `resolveTmdbTitles(sourceId, refs, kinds, {database})`. Por enquanto lança `not implemented`.
- `tv-web/src/lib/metadata/tmdbPeople.ts`: `loadPersonCredits(personId, options)` e as constantes `FILMOGRAPHY_STORED_MAX = 200` / `FILMOGRAPHY_SHOWN_MAX = 60`. Por enquanto lança `not implemented`.
- `tv-web/src/lib/metadata/types.ts`: `TitleMetadataView` com `tmdbMatch`/`similar`/`castPeople`, mais `KindCoverage`, `ResolvedTitle`, `TitleResolution`, `SimilarTabStatus`, `SimilarTabView`, `PersonCreditsFailure` (com `not_found`) e `PersonCreditsResult`. São definitivos.
- `tv-web/src/lib/catalog/db.ts`: tipos `TmdbTitleRef`, `CastPerson` e os campos `TitleFields.similar`/`castPeople`. A tabela `tmdbPeople` ainda **não** existe (T031).
- `tv-web/src/features/vod/detailSnapshot.ts`: `DetailSnapshot`, `OpenTitleTarget`, `OpenPersonTarget`. São definitivos.
- `tv-web/src/features/catalog/catalogApi.ts`: `useSimilarTitles(itemId, enabled)` lança `not implemented`. Nenhuma tela a chama ainda (T010/T013).
- `tv-web/src/features/movies/MovieDetailScreen.tsx`: props **opcionais** `restore`, `onOpenTitle`, `onOpenPerson` e `onOpenTmdbSettings`, declaradas mas ainda não usadas. Precisam continuar opcionais, porque os contratos da 032/033 renderizam só com `movieId`/`onBack`.

## Armadilhas já mapeadas

- **Os contratos de tela mockam `catalogApi`** (`useCatalogItem`, `useTitleMetadata`, `useSimilarTitles`). A tela precisa obter Semelhantes **só** via `useSimilarTitles(movieId, activeTab === 'similar')`, sem outro hook novo que leia o banco. `useTmdbStatus` roda de verdade contra o IndexedDB do jsdom.
- **Não quebre o 2º teste da 032 com a mudança D-002.** Ele já tem chave e TMDB. O 1º (sem chave) exige exatamente 1 fetch, então sem chave nada muda.
- O contrato da tela conta o texto **`Não encontrado na sua lista`** com `getAllByText` e espera 1 ocorrência por cartão não encontrado. Por isso não duplique o chip num `sr-only`.
- No modal de resumo, o ano deve aparecer **uma vez** (o teste usa `getByText(/2003/)` dentro do diálogo). O título sai do `PosterArt` como "pôster" + título num único span, o que não conflita.
- A sequência de teclas do contrato é: ações (foco inicial) → `↓` abas → `→` Elenco → `→` Semelhantes → `Enter` ativa → `↓` 1º cartão. As abas precisam ficar na ordem Detalhes, Elenco, Semelhantes no filme.
- `onOpenTmdbSettings` é chamado com `{ tab: 'similar' }` e `onOpenTitle` com `({kind, itemId}, { tab: 'similar', focusKey: 'tmdb:movie:<id>' })`.
- Com `restore.focusKey`, a tela deve montar **já** com o cartão focado (o `Enter` seguinte abre o resumo). A restauração segue a **chave**, e o contrato muda a ordem entre a ida e a volta.
- Na série, `append_to_response` usa `aggregate_credits` **em vez de** `credits`. O contrato da 033 só confere `credits` no filme.
- `loadPersonCredits`: `offline` salvo no estado **não** bloqueia a próxima tentativa. Só `refused` e a pausa de `rate_limited` bloqueiam (o contrato falha offline e depois tem sucesso).
- `removeTmdbKey` já roda uma transação em `integrations` + `titleMetadata`. Inclua `tmdbPeople` **na mesma** transação.
- A resolução local nunca lê `storedEntries` nem chama `ensureCategory`. O dado vem só de `channels` da geração ativa. Exporte `isCovered` de `catalogSearch.ts` em vez de duplicar a regra.
- Testes não travados que vão ficar vermelhos e **devem ser atualizados** (R-005): o caso "Semelhantes segue Em breve" em `MovieDetailScreen.test.tsx`, `comingSoon.test.ts` (`similar` na lista de mocks) e casos de `titleMetadata.tmdb.test.ts` que assumem "provedor completo → sem TMDB".
- Flakes conhecidos sob paralelismo: `*.favorites.test.tsx` e `LiveScreen.test.tsx`. Confirme isolados antes de concluir que algo quebrou. Durante o plan, `MoviesScreen.favorites.test.tsx` falhou na suíte e passou 5/5 isolado.
- Os scripts E2E usam o `executablePath` Linux hardcoded, o mesmo de todos os `e2e/*.mjs`. No Windows é preciso o override local temporário. Suba um `npm run dev` recém-iniciado antes do `test:e2e`.
- Nenhum `console.*` nos arquivos novos. Erros do TMDB são sempre por categoria fixa, porque a URL v3 carrega a chave.

## Pendências do Analyze

Nenhuma. As quatro foram resolvidas em 2026-09-30, só na documentação:

- **A1**: a spec da 035 registra a mudança de D-002 em Assumptions e Clarifications, e a FR-018 da 032 ganhou a nota `**Atualização (035):**`.
- **A2**: a FR-017 define "ordem do TMDB" na filmografia como a popularidade informada pelo TMDB.
- **A3**: a FR-017 fixa a cobertura com os dois tipos ("… de filmes e Z de W de séries").
- **A4**: a FR-013 diz que, com casamento, a lista do TMDB substitui o texto do provedor só na aba Elenco, sem misturar as duas listas.

Nenhum contrato, stub ou decisão de código mudou.

## Gate de pronto

- 5/5 contratos da 035 verdes e `check-contract-tests.ps1` íntegro para 035, 032, 033, 023, 024, 025 e 022.
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test` (flakes conhecidos confirmados isolados) e `npm run build:tizen`.
- `npm run test:e2e` com o novo `e2e/semelhantes-elenco-ator.mjs` incluído. Ele cobre SC-001/SC-003/SC-005 contando requisições.
- `e2e/semelhantes-real.mjs` para SC-002 (≥ 50 títulos, 0 casamentos errados) e p95 da resolução. Sem chave no `.env`, o resultado é "não medido", nunca inventado.
- Todos os itens do `quickstart.md`.
- Docs no Polish: `CLAUDE.md` (parágrafo da 035), comentários "item 45" em `types.ts`/`DetailMetadata.tsx`, e o backlog via script.
- A passada na **TV física é recomendação, não gate** (imagens TMDB no WebView, fluidez dos rails, tempo da resolução numa lista grande).
