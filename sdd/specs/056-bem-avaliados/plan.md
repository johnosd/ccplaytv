# Implementation Plan: Fileira "Bem avaliados" em Filmes e Séries

**Slug**: `056-bem-avaliados` | **Date**: 2026-10-03 | **Spec**: `sdd/specs/056-bem-avaliados/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Troca o slot "Em breve" `vod-rated` (feature 053) por uma fileira real: os até 12 títulos de maior nota do provedor
(`provider_rating`, entregue pela 055) entre os já obtidos no aparelho, em Filmes e em Séries. A fileira lê o **mesmo índice
local de busca** que "Adicionados recentemente" (sem rede), só existe com ≥ 5 títulos de nota válida, mostra o aviso de
escopo parcial enquanto houver categorias não obtidas, e seu "Ver tudo" abre "Todos" ordenado por nota (opção `'rating'` que
vale só como destino, fora do menu de ordenação). A regra de seleção é pura e única (`pickTopRated`), reaproveitada pela
grade (`sortVodItems('rating')`). Nenhuma persistência, migração ou chamada externa nova.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Vite 8, `chrome108` como piso)

**Primary Dependencies**: `@tanstack/react-query`, `@tanstack/react-virtual`, Dexie (IndexedDB); `useRemoteNav` próprio (ADR-009)

**Storage**: IndexedDB (Dexie) — **nada novo**: a nota já está em `CatalogRecord.providerRating` (055); a fileira é derivada

**Testing**: vitest (`dom` jsdom para `*.test.tsx`, `node` para `*.test.ts`), E2E Playwright (`tv-web/e2e/*.mjs` via `run.mjs`)

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`); navegador no dev

**Performance Goals**: abrir a tela hero com a fileira sem lentidão perceptível (SC-004); a seleção é O(n log 12) sobre o índice, sem
ordenar o catálogo e sem mapear o catálogo inteiro para `CatalogItemOut`

**Constraints**: ADR-008/ADR-002 (client-first; catálogo parcial é estado normal); constitution 1.7.0; tokens de design, nunca cor/tamanho
literal; texto de UI via i18n (pt/en/es); nenhuma requisição externa causada pela fileira

**Scale/Scope**: catálogo de referência ≈ 43 mil filmes / 9,7 mil séries; ~67% dos filmes e ~82% das séries têm nota válida (probe da 055)

## Decisões Invariantes

- **D-001** Fonte única da nota: `provider_rating` (055), lida do índice local de busca do tipo. Sem `get_vod_info`, sem TMDB, sem rede.
- **D-002** Critério: nota válida (0 < n ≤ 10) decrescente; empate pelo `added_at` mais recente (sem data depois); limite = `SHOWCASE_LIMIT` (12);
  existe só com `RATED_MIN = 5` títulos de nota válida, senão **ausente** (sem slot, sem fileira vazia).
- **D-003** Uma regra só de ordenação: função genérica `pickTopRated` (buffer ordenado de tamanho `limit`, como `recentlyAdded`) serve ao
  `topRated(items)` e ao hook (sobre registros); só os ≤ 12 vencedores viram `CatalogItemOut`. `sortVodItems('rating')` concorda com ela.
- **D-004** `'rating'` entra em `VodSortOption` apenas como `target.sort` do "Ver tudo"; `availableSortOptions` nunca o devolve (FR-008) e a
  escolha não vai para a memória de sessão.
- **D-005** `useTopRated` reusa a `queryKey` e o `queryFn` de `useRecentlyAdded` (`['catalog-search-index', sourceId, kind]`); a pré-carga (038)
  já invalida essa chave, então a fileira se atualiza sem código novo de invalidação.
- **D-006** Cobertura parcial é aceita e **sinalizada** (FR-014): `.vod-row-coverage` no cabeçalho enquanto `coveredCategories < totalCategories`,
  texto `showcase.ratedCoverage`; some quando completo. Por exigência da constitution ("Progresso e Capacidades São Reais").
- **D-007** Sem persistência, sem migração, sem campo novo em `CatalogRecord`/`CatalogItemOut` e sem alterar a 055.
- **D-008** Emenda aprovada pelo usuário (2026-10-03): os 3 contratos travados de 052/053 que listam "Bem avaliados" como fileira sempre
  presente são editados **somente nas linhas dessa fileira** e as travas regravadas (R-001).
- **D-009** *(2026-10-04, pós-TV)* A fileira não usa mais "as N maiores notas": usa `selectFeaturedRated` (`logic/bem-avaliados.md` §7) — elegível = nota 6,0–9,9 + ano conhecido, últimos 10 anos com plano B, uma versão por título, 12 sorteados por hash com semente diária entre os 36 melhores. Spec: FR-015..FR-018.
- **D-010** *(2026-10-04; atualizada no mesmo dia pela emenda R-011)* `topRated`/`pickTopRated` foram **removidos**; a fileira usa só `selectFeaturedRated`. O "Ver tudo" (`sortVodItems('rating')`) continua ordenando a seção inteira, com 10,0 e antigos.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Não toca em fonte nem conta. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Nenhum segredo lido, logado ou exibido; nenhuma URL nova. |
| Categorias da Fonte São Preservadas | OK | OK | A fileira é visão derivada, como "Adicionados recentemente"; as categorias declaradas seguem intactas. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Só nota real do provedor, rotulada "Provedor"; nunca IMDb/TMDB; sem nota = fora (nunca "0"/"sem nota"). |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Leitura local do índice; mover foco/voltar não esperam nada. |
| Trailers e Metadados Não Alteram o Estado Principal | OK | OK | Focar/abrir a fileira não marca assistido, favorito nem progresso. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Cards, "Ver tudo" e voltar por setas + OK + RETURN. |
| Lista de Catálogo Nunca Manifesto de Streaming | N/A | N/A | Sem importação. |
| Foco Visível e Sem Becos Sem Saída | OK c/ ressalva | OK | Fileira ausente não deixa slot fantasma; foco reconciliado por id se a fileira some (053); contrato cobre. Selo não focável. |
| Voltar Restaura Foco e Posição | OK | OK | Reusa a restauração por `rowKey`+id da 053; a chave `rated` nova é estável; "Ver tudo" volta ao cartão equivalente. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Itens por id lógico; nada novo guarda URL. |
| Progresso e Capacidades São Reais | **Violação potencial** | OK | Catálogo parcial apresentado como completo → resolvido por D-006/FR-014 (aviso de escopo na fileira). Registrado em R-002. |
| Documentação do Repositório É Canônica | OK | OK | Backlog (item 68), README e contratos de 052/053 atualizados na mesma feature (Fase Polish). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/056-bem-avaliados/
├── spec.md
├── plan.md
├── logic/bem-avaliados.md   # regras de seleção, ordenação, leitura, tela e "Ver tudo"
├── quickstart.md
├── handoff.md
├── tasks.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── features/
│   │   ├── catalog/catalogApi.ts                 # + useTopRated (STUB), reusa loadSearchIndex
│   │   └── vod/
│   │       ├── vodShowcase.ts                    # + RATED_MIN, topRated (STUB), pickTopRated
│   │       ├── vodShowcaseRows.ts                # + hasRated; linha 'rated' real ou ausente
│   │       ├── vodSort.ts                        # + 'rating' (só destino do Ver tudo)
│   │       ├── VodShowcaseScreen.tsx             # fileira rated + .vod-row-coverage
│   │       ├── VodCategoryScreen.tsx             # 'rating' como ordenação efetiva em "Todos"
│   │       └── *.bem-avaliados.contract.test.ts(x)   # 5 contratos travados
│   ├── lib/
│   │   ├── comingSoon.ts                         # − vod-rated
│   │   └── i18n/messages/{vodShowcase,vodCategory,comingSoon}.ts
│   └── styles/vod.css                            # .vod-row-coverage (tokens)
└── e2e/{bem-avaliados.mjs (novo), run.mjs, carrosseis-filmes-series.mjs, lib/vod.mjs}
```

**Structure Decision**: sem camada nova. A regra pura vive em `features/vod/vodShowcase.ts` (junto de `recentlyAdded`), o acesso a dados
em `features/catalog/catalogApi.ts` (junto de `useRecentlyAdded`) e a fiação nas telas de `features/vod/` já existentes.

## Complexity Tracking

> Nenhuma violação da constitution sem resolução. A emenda de contratos travados de outras features está em R-001 (não é violação
> de princípio, é regra do processo de contratos).

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/vod src/features/catalog src/lib/comingSoon.test.ts   # área tocada
npx tsc -b                                                                      # tipos
npm run lint                                                                     # oxlint
npm run test                                                                     # suíte completa (gate)
npm run test:e2e -- --only bem-avaliados,carrosseis-filmes-series,vitrine-filmes-series  # E2E da área (com npm run dev no ar)
npm run test:e2e                                                                 # gate final
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/features/vod/vodShowcase.bem-avaliados.contract.test.ts` (3) e
`tv-web/src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx` (2) — 5/5.

Comando: `npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `selectFeaturedRated` *(emendado em 2026-10-04; era `topRated`)*: só 6,0–9,9 com ano, recentes antes dos antigos, uma versão por título, limite 12, abaixo do mínimo vazio, plano B | US1/AC1-AC2, US3/AC2, FR-002, FR-003, FR-015, FR-016, FR-018 | Fase 2 | `Error: not implemented` (na época, com `topRated`) |
| `buildShowcaseRows`: `rated` real entre `added` e `because` com Ver tudo `{all, rating}`; sem nota some, sem slot `vod-rated` | US3/AC1, FR-001, FR-003, FR-009 | Fase 2 | asserção `expected 'slot' to be 'items'` |
| `sortVodItems('rating')` e `availableSortOptions` sem `'rating'` | US2/AC1, US2/AC3, FR-007, FR-008 | Fase 2 | `Error: not implemented` |
| Tela: cards na ordem com selo, aviso de cobertura parcial, OK abre, Ver tudo → `{all, rating}`, sem rede | US1/AC1-AC5, US2/AC1, FR-004..FR-007, FR-014 | Fase 3 | asserção: fileira `Bem avaliados` ausente/slot |
| Tela: sem nota a fileira não existe (nem "Em breve") e o foco não se perde | US3/AC1, FR-003, FR-013, Constitution: Foco | Fase 3 | asserção: `not.toContain('Bem avaliados')` (slot ainda existe) |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/features/vod/vodShowcase.ts` (`RATED_MIN`, `topRated`),
`tv-web/src/features/vod/vodSort.ts` (`'rating'`; `sortVodItems` lança), `tv-web/src/features/vod/vodShowcaseRows.ts` (`hasRated?` só no tipo),
`tv-web/src/features/catalog/catalogApi.ts` (`useTopRated` lança). Textos já criados nos 3 idiomas: `vod.sort.rating`, `showcase.ratedCoverage`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Regra pura (`pickTopRated`, `topRated`, `sortVodItems('rating')`, `hasRated`) | Pronta; contratos 3/3 + testes extras. `topRated`/`pickTopRated` removidos (R-011 resolvido) |
| Seleção da fileira (`ratedSelection.ts`, FR-015..FR-018) | Pronta (2026-10-04): nota 6,0–9,9 + ano, últimos 10 anos com plano B, uma versão por título, 12 sorteados por hash com semente diária; 14 testes |
| Dados (`useTopRated`) | Pronto; mesmo índice local de `useRecentlyAdded`, invalidado pela pré-carga; usa só `selectFeaturedRated`; 6 testes |
| Tela hero (fileira, aviso de cobertura, CSS, `vod-rated` removido) | Pronta; contratos de tela 2/2 + 4 testes |
| "Ver tudo" ordenado por nota (`VodCategoryScreen`) | Pronto; 3 testes; "Nota" fora do modal de Ordenar |
| Contratos | 5/5 verdes; travas íntegras (056, 052 e 053 após as emendas R-008/R-009) |
| Gates | `tsc -b` limpo; `oxlint` sem erro; `npm run test` 391 arq. / 2599 testes; E2E da área 5/5 (a suíte completa 35/35 foi antes do refinamento) |
| Desempenho (SC-004) | Medido; sem diferença além do ruído (R-003) |
| TV física | Não executada (recomendação, não gate) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Três contratos travados de outras features exigem "Bem avaliados" como fileira sempre presente: `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (052, lista de rótulos, ~l.242), `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (053, chaves/tipos/formatos com `rated`) e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053, ordem de foco e contagens de `ArrowDown`, ~l.221/275). Entregar a spec (FR-003) os quebra. | Alto: suíte vermelha / contrato "cumprido" por atalho | Resolvido: Emendas aplicadas (R-008) e travas de 052/053 regravadas; auditoria da convergência: travas íntegras e contratos verdes. **Emenda aprovada pelo usuário em 2026-10-03** (interview do `sdd-plan`). Editar **só** as linhas dessa fileira (remover `rated` das listas esperadas e ajustar as contagens), registrar aqui o `R-00X` da emenda, e regravar a trava de **052 e 053** com `check-contract-tests.ps1 -Slug <slug> -Write -Paths <todos os arquivos do lock>`. Nada além disso nesses arquivos. |
| R-002 | Constitution "Progresso e Capacidades São Reais": fileira calculada sobre categorias parciais poderia parecer "o melhor de toda a lista". | Alto (princípio) | Resolvido: Aviso `.vod-row-coverage` implementado e coberto pelo contrato de tela, por `VodShowcaseScreen.bem-avaliados.test.tsx` e pelo E2E `bem-avaliados`. Aviso de escopo `.vod-row-coverage` (D-006, FR-014 adicionado à spec pelo plan, aprovado pelo usuário em 2026-10-03). |
| R-003 | Desempenho: o índice do tipo inteiro (≈ 43 mil filmes) é percorrido a cada atualização; mapear tudo para `CatalogItemOut` seria desperdício. | Médio (SC-004) | Resolvido: `pickTopRated` sobre registros + `toItemOut` só nos ≤ 12; `select` estável. Medido: seleção em 43.161 registros = 1,9 ms (mediana) contra 0,6 ms de "Adicionados recentemente"; lista real (`carga-listas-real.mjs 3 2`) antes 1408 / 1163 ms (filmes/séries, p50), depois 1481 / 1143 ms, e o `HEAD` limpo medido na mesma hora 1463 / 1140 ms — dentro do ruído. Uma primeira medição logo após a suíte E2E deu 2011 ms (ruído de carga; repetida). |
| R-004 | `effectiveSortOption` em `VodCategoryScreen` rebaixa qualquer opção fora de `availableOptions` para `'source'`; `'rating'` não está lá de propósito (FR-008). | Alto: "Ver tudo" abriria sem ordenar por nota | Resolvido: regra própria em `effectiveSortOption` (só em "Todos"); coberto por `VodCategoryScreen.bem-avaliados.test.tsx` (T017) e pelo E2E `bem-avaliados`. |
| R-005 | Dois observadores da mesma query (`useRecentlyAdded` + `useTopRated`) com `refetchOnMount: 'always'` e `staleTime: 0`. | Baixo/Médio | Mesma `queryKey`/`queryFn` ⇒ uma leitura em voo é compartilhada; confirmar no E2E que o índice não é lido duas vezes por abertura e, se for, usar `staleTime` curto só no novo hook. |
| R-006 | Lista importada antes da 055 não tem nota gravada; a fileira só aparece depois do refresh normal das categorias. | Baixo (esperado) | Resolvido: Comportamento esperado e documentado na spec; coberto por `catalogApi.bem-avaliados.test.tsx` (fonte sem nota → lista vazia, sem erro). Documentado na spec (Edge Cases); nada a migrar. |
| R-007 | `year`/ordenação geral por nota e nota IMDb/TMDB seguem fora de escopo. | Baixo | Resolvido: Confirmado na auditoria: nada de ordenação geral por nota, `year` da listagem nem nota IMDb/TMDB foi antecipado. Item 29 do backlog; esta feature não os antecipa. |
| R-008 | **Emenda aplicada (T011, aprovada em 2026-10-03, R-001)**: removidas só as linhas de `rated`/"Bem avaliados" de `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (052: 1 linha na lista de rótulos), `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (053: `'rated'` das chaves, um `'slot'`/`'poster'` dos tipos/formatos, índice `all[7]`→`all[6]`, linha de `noHistory`, `bare`) e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053: ordem de rótulos 8→7 fileiras e o passo "Bem avaliados" do 2º teste, que agora para em "Porque você assistiu"). Travas de 052 e 053 regravadas (`-Write` com todos os arquivos de cada lock; só os hashes mudaram). | Médio | Resolvido: feito; as 3 travas íntegras. |
| R-009 | **Contrato 056 com asserção inválida (5b)**: em `VodShowcaseScreen.bem-avaliados.contract.test.tsx`, `expect(document.querySelector('.vod-showcase .tv-focus .rating-badge')).toBeNull()` falha para qualquer implementação correta — o selo fica DENTRO do card focado (`.tv-focus` é o card), então o seletor sempre o encontra. A intenção (FR-005: o selo não é alvo de foco) é `'.vod-showcase .rating-badge.tv-focus'`. Provado com cópia temporária só com essa linha trocada: 2/2 verdes. Erro de escrita do contrato, não do código. | Alto: a story P1 não fecha com contrato vermelho | Resolvido: emenda de UMA linha aprovada pelo usuário em 2026-10-03 (`.vod-showcase .tv-focus .rating-badge` → `.vod-showcase .rating-badge.tv-focus`); trava da 056 regravada; 5/5 verdes. |
| R-010 | Efeito colateral inerente a "sem nota = sem fileira" (spec FR-003): sem o slot, as categorias sobem duas posições e entram na janela de prévias da 053 (foco −1…+3) já na abertura; a pré-carga passa a pedir essas categorias uma a uma (`get_vod_streams:<id>`) em vez da chamada de seção inteira. O E2E `carga-listas` (cenário 3b) só aceitava a chamada de seção (`categoryId === '*'`) para provar "Filmes antes de Séries" e falhou, no `HEAD` limpo passa. | Médio | Resolvido: Confirmado na auditoria (E2E `carga-listas` verde após o ajuste da asserção; comportamento do app inalterado). Resolvido no teste: a asserção passou a considerar qualquer pedido de filmes/séries (seção ou categoria); a ordem Filmes → Séries continua provada. Comportamento do app **não** alterado (mesma janela da 053; só deixa de ter o slot no meio). Isolado por: reversão temporária da fiação (continuou falhando), `git stash` do trabalho (passou), log completo das chamadas. |
| R-011 | **Contrato travado vs. nova regra (2026-10-04)**: o 1º teste de `vodShowcase.bem-avaliados.contract.test.ts` (`topRated`: qualquer nota válida, limite 12, mínimo 5) descreve a regra antiga. Não foi editado: o código novo vive em `selectFeaturedRated` e `topRated` fica, intocado, para o contrato. | Médio: função legada sem uso em produção | Resolvido: o usuário aprovou (a) em 2026-10-04. O 1º teste do contrato passou de `topRated` para `selectFeaturedRated` (nota 6,0–9,9 + ano, recentes antes dos antigos, uma versão por título, limite 12, mínimo 5, plano B); `topRated`/`pickTopRated` e seus testes saíram; trava da 056 regravada (5 casos, mesmos 3 arquivos/2 arquivos). Os outros 4 casos não foram tocados. |
| R-012 | **Variação × cobertura parcial**: com categorias chegando em segundo plano o conjunto de candidatos muda e alguns títulos trocam no mesmo dia. | Baixo | Resolvido: Coberto por `ratedSelection.test.ts` (um candidato novo troca no máximo um título; mesma semente ⇒ mesma escolha). A amostragem por hash só troca quem tiver hash menor que um escolhido; o foco já é reconciliado por id (053). Sem ação extra. |
| R-013 | **Ano só da listagem**: `year` vem de `year`/`releaseDate` do painel (≈ 59% dos filmes na lista real); sem ano o título nunca entra na fileira. | Baixo/Médio | Decisão do usuário (2026-10-04). O "Ver tudo" não tem esse corte. |
| R-014 | **Emenda pela feature 060** (2026-10-05, autorizada pelo usuário no `sdd-plan` da 060): "Porque você assistiu" deixou de ser slot "Em breve" — sem semente a fileira não existe (item 69 do backlog, `060` FR-014/FR-015). Mudou só o que citava o slot: `vodShowcase.bem-avaliados.contract.test.ts` (ordens sem `because`, nenhum slot restante) e `VodShowcaseScreen.bem-avaliados.contract.test.tsx` (o foco chega a "Ação" em vez do slot) | Contratos emendados ficam vermelhos até a fase da 060 que liga a fileira real | Retravado (5/5) com `check-contract-tests.ps1 -Write`; registro também na `060` (D-012 do `plan.md` dela) |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-03 | Fases 1–2 (Setup + Foundational) | Linha de base na lista real (filmes firstPaint p50 1408 ms / séries 1163 ms / 10,16 MB). `pickTopRated`, `topRated`, helpers de nota/ordem, `sortVodItems('rating')` e `hasRated` implementados; contratos da fase 3/3. | Fase 3: `useTopRated`, tela, CSS, remover `vod-rated`, emenda R-001 |
| 2026-10-03 | Fases 3–5 (US1, US2, US3) | `useTopRated`, fileira + aviso de cobertura + CSS, `vod-rated` removido, "Ver tudo" ordenado por nota; emenda de 052/053 (R-008) e de uma linha do contrato 056 (R-009, aprovada); testes novos (hook 6, tela 4, grade 3). | Nenhuma |
| 2026-10-03 | Fase 6 (Polish) | E2E `bem-avaliados` (17 verificações) registrado na SUITE; `carrosseis-filmes-series` e `carga-listas` ajustados (R-010); README; medição de SC-004; gates `tsc`/lint/`npm run test` (2585)/`npm run test:e2e` (35/35). | TV física não executada (recomendação) |
| 2026-10-04 | Fase 7 (Refinamento pós-TV) | Pedido do usuário após a TV ("filmes muito antigos; sempre os mesmos; mostrar diferentes"): `selectFeaturedRated` (nota 6,0–9,9 + ano, últimos 10 anos com plano B, uma versão por título, sorteio estável por dia); spec FR-015..FR-018 e SC-007/008; E2E e teste do hook reescritos. Na lista real: 8.889 elegíveis, os 12 de cada dia são de 2017–2026 e 4–6 repetem entre dias. | R-011 (contrato de `topRated` desatualizado) |
| 2026-10-04 | R-011 (emenda do contrato) | Aprovada pelo usuário: contrato 1 reescrito para `selectFeaturedRated`; `topRated`/`pickTopRated` e seus testes removidos; trava da 056 regravada. Três erros de fixture meus no contrato novo corrigidos antes de travar (o "Velho" é elegível mas antigo; ordem E/D por nota). | Nenhuma |
| 2026-10-04 | Emenda de contratos (feature 057) | Aprovada pelo usuário: o slot "Top 10" saiu da lista de fileiras fixas (agora só existe com dado do TMDB). Editadas só as linhas do Top 10 dos contratos travados de 052, 053 e 056 e regravadas as 3 travas; ver R-001/R-011 em `sdd/specs/057-top10-dica-tmdb/plan.md`. | Nenhuma |

**PRÓXIMO**: reinstalar na TV para conferir a seleção nova; depois `/sdd-converge 056-bem-avaliados`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/vod/vodShowcase.ts` — `pickTopRated`, `topRated`, `RATED_MIN`, `validProviderRating`, `compareByRating`
- `tv-web/src/features/vod/vodSort.ts`, `vodShowcaseRows.ts` — `sortVodItems('rating')`, `hasRated`
- `tv-web/src/features/catalog/catalogApi.ts` — `useTopRated`
- `tv-web/src/features/vod/VodShowcaseScreen.tsx`, `VodCategoryScreen.tsx`, `tv-web/src/styles/vod.css` — fileira, aviso, ordenação do "Ver tudo"
- `tv-web/e2e/bem-avaliados.mjs` (novo), `e2e/run.mjs`, `e2e/carrosseis-filmes-series.mjs`, `e2e/carga-listas.mjs`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Helper de edição que preserva o final de linha (arquivos CRLF/mistos): script em `crlfedit.mjs` no scratchpad da sessão (se sumir, usar a ferramenta Edit e conferir `git diff --stat`).
- `e2e/carga-listas-real.mjs` mede entrada em categoria, não a abertura da tela hero com o índice; para SC-004 medir `useTopRated`/seleção direto.
- Sem nota no painel não há fileira "Bem avaliados": as categorias sobem na tela hero e entram na janela de prévias na abertura (R-010). Um E2E que prove ordem de pré-carga deve olhar pedidos de categoria, não só da seção.
- `npm run test:e2e -- --only X --jobs 1` no PowerShell: o npm engole `--only`; use `node e2e/run.mjs --only X --jobs 1`.
- O seletor `.tv-focus` fica no CARD; o selo está dentro dele. Para "o selo não é focável" use `.rating-badge.tv-focus`.

## Resultado Final

**Convergida em 2026-10-04** (`sdd-converge`; 44/44 tasks; 5/5 contratos; travas de 056, 052 e 053 íntegras).

**O que foi construído**

- Fileira real **"Bem avaliados"** em Filmes e em Séries, no lugar do slot "Em breve" `vod-rated` (entre "Adicionados recentemente" e "Porque você assistiu"), com selo `★ 8,4` nos cards e `★ 8,4 Provedor` no destaque; some quando não há títulos elegíveis suficientes (mínimo 5) — sem slot, sem fileira vazia.
- Dados: `useTopRated` lê o **mesmo índice local de busca** de "Adicionados recentemente" (mesma `queryKey`/`queryFn`, `select` estável); a pré-carga (038) já o invalida, então a fileira se atualiza sozinha. Nenhuma requisição ao provedor ou ao TMDB; nada novo é persistido.
- Seleção (`features/vod/ratedSelection.ts`, `selectFeaturedRated`): elegível = nota do provedor de 6,0 a 9,9 e ano conhecido; uma versão por título (`[L]`, `4K`, dublado…); candidatos dos últimos 10 anos, com plano B pelos mais novos; 12 sorteados por hash com semente do dia entre os 36 melhores; exibição por nota ↓.
- Aviso de escopo parcial (`.vod-row-coverage`, "Com base em X de Y categorias") enquanto faltar categoria obtida (Constitution, *Progresso e Capacidades São Reais*).
- "Ver tudo" abre "Todos" ordenado por nota (`sortVodItems('rating')`), a seção inteira sem o corte da fileira; "Nota" **não** entrou no menu de Ordenar e a escolha não vai para a memória de sessão.

**Desvios em relação ao plano original**

- **Refinamento pós-TV (2026-10-04, Fase 7)**: o plano previa "as 12 maiores notas". Na TV a fileira trouxe filmes antigos; a sonda do painel real (43.161 filmes, 28.846 com nota) mostrou 255 notas 10,0 (quase sempre 1–2 votos) e duplicatas `[L]`. A spec ganhou FR-015..FR-018 e SC-007/SC-008, e o plano D-009/D-010. D-003 (regra única `pickTopRated`) ficou **superada**: `topRated`/`pickTopRated` foram removidos.
- **Emendas de contrato** (todas aprovadas pelo usuário): R-008 (052/053 — linhas de `rated`), R-009 (uma linha do contrato de tela da 056: `.tv-focus .rating-badge` → `.rating-badge.tv-focus`) e R-011 (1º caso da 056: `topRated` → `selectFeaturedRated`).
- **R-010**: sem nota no painel não há fileira e as categorias sobem na tela hero, entrando na janela de prévias da 053 já na abertura; o E2E `carga-listas` (cenário 3b) só aceitava a chamada de seção inteira e foi ajustado. O comportamento do app não mudou.
- Registrados e fora do escopo: nota IMDb/TMDB e ordenação geral por nota (item 29), diversificação por franquia/categoria, selo em outras telas.

**Medições e verificação**

- SC-004: seleção em 43.161 registros ≈ 1,9 ms (mediana) contra ≈ 0,6 ms de "Adicionados recentemente"; na lista real, antes 1408 / 1163 ms (filmes/séries, p50) e depois 1481 / 1143 ms, com o `HEAD` limpo medido na mesma hora 1463 / 1140 ms — dentro do ruído.
- Lista real com a regra nova (teste temporário, apagado): 8.889 títulos elegíveis; os 12 de cada dia são de 2017–2026 e sem nota 10; três dias seguidos repetem 4–6 dos 12.
- Gates: `tsc -b` limpo, oxlint sem erro, `npm run test` 391 arquivos / 2594 testes, E2E 35/35 (suíte completa, antes do refinamento) e os 5 scripts da área depois dele.
- **TV física**: instalada e conferida pelo **usuário**, que informou "instalado e testado" depois do refinamento; esta sessão não observou a tela, então o veredito visual é dele.

**Em aberto (registrado, não bloqueia)**

- R-005: dois observadores da mesma query (`useRecentlyAdded` + `useTopRated`) — a leitura única do índice por abertura não foi medida isoladamente.
- R-013: o `year` vem só da listagem (≈ 59% dos filmes na lista real); título sem ano nunca entra na fileira (decisão do usuário).
