# Handoff — 063-codigo-saudavel-benchmark

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend `tv-web/` (React 19 + TS + Vite 8 + Dexie v17, vitest 5, oxlint, Playwright).
- Próximo comando: `/sdd-execute 063-codigo-saudavel-benchmark`.
- Backlog: **Planejada** (0/49).
- Arquivos novos desta sessão, ainda não commitados: os docs da feature, os 3 contratos travados e 2 stubs (`tv-web/scripts/architecture.mjs`, `tv-web/scripts/bench/fixtures.mjs`).

## O que a feature entrega

- **P1 (US1)**: `catalogRepository.ts` (1 517 linhas físicas) vira **fachada** sobre 11 módulos de `lib/catalog/repository/`. É movimentação literal, sem mudar comportamento, e nenhum dos 54 importadores é editado.
- **P2 (US2)**: uma catraca em `npm run lint` (`scripts/architecture.mjs`, que roda depois do oxlint). Ela barra quatro tipos de import novo (feature → outra feature, lib → UI, components → features, catalog → player) e arquivo de produção novo acima de 300 linhas. Por decisão do usuário, **não** desfaz os ~150 imports cruzados existentes nem divide outros arquivos grandes: eles viram lista de exceções/teto que só diminui. A direção permitida é **player → catalog**.
- **P3 (US3)**: `npm run bench:import`. Ele roda no navegador, contra o app em dev, com fontes fictícias Xtream/M3U/XMLTV × 1k/10k/100k. Mede tempo por etapa, o caminho real e uso/quota, e grava JSON versionado em `tv-web/bench-results/`. **Não** é gate e **não** entra no `test:e2e`. A TV física é opcional (`--serve-only`).

## Leitura obrigatória, em ordem

1. `spec.md`: escopo, FR-001..025, SC-001..007, Clarifications (as 12 decisões do usuário).
2. `plan.md`: decisões invariantes D-001..D-008, riscos R-001..R-007 e comandos.
3. `tasks.md`: fases 1, 3, 4, 5 e 6 (a Fase 2 está vazia). **A US2 depende da US1.**
4. `logic/divisao-repositorio.md`: mapa símbolo → módulo com as linhas atuais, grafo de dependências sem ciclo e formato da fachada.
5. `logic/catraca-arquitetura.md`: o que é produção, contagem de linhas, resolução de imports, regras, obsoletos, CLI e ordem de adoção.
6. `logic/benchmark.md`: fixtures, bancada (`stages` e `real`), runner, `--serve-only` e formato do resultado.
7. `research.md`: por que um script e não o oxlint, por que uma bancada e não instrumentação, e o caminho da TV.
8. `quickstart.md`: verificação manual (a tabela de 6 violações sintéticas da US2).
9. `.planning/memory/constitution.md`.

## Testes de contrato

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts` | 1 | US1 |
| `tv-web/scripts/architecture.codigo-saudavel.contract.test.mjs` | 3 | US2 |
| `tv-web/scripts/bench/fixtures.codigo-saudavel.contract.test.mjs` | 1 | US3 |

- Rodar (em `tv-web/`): `npx vitest run src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts scripts/architecture.codigo-saudavel.contract.test.mjs scripts/bench/fixtures.codigo-saudavel.contract.test.mjs`
- Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark`
- Vermelho confirmado em 07/10: 4 por `not implemented` e o da fachada por asserção (o conjunto de valores já bate; reprova porque a fachada ainda tem lógica).
- **Travas de outras features** que esta feature pode quebrar (rodar `check-contract-tests.ps1 -Slug <slug>` em cada uma e conferir que passam): `017-busca-local-catalogo`, `019-historico-continuar-assistindo`, `025-filmes-series-ds-v14`, `026-home-busca-configuracoes-ds-v14`, `034-fontes-estado-expiracao`, `036-limpar-historico`, `038-carga-listas-pre-carga`, `039-catalogo-em-blocos`, `044-parser-m3u-headers`, `055-campos-da-listagem-xtream`, `060-home-vitrine-expandida`.

## Stubs criados

- `tv-web/scripts/architecture.mjs`: `MAX_LINES = 300` é definitivo. `countLines`, `isProductionFile`, `checkArchitecture`, `buildBaseline`, `loadSourceFiles` e `loadBaseline` lançam `not implemented`. Os typedefs JSDoc (`SourceFile`, `Baseline`, `Violation`, `Obsolete`) são o formato que o contrato usa. Falta o `main()`.
- `tv-web/scripts/bench/fixtures.mjs`: as constantes `BENCH_FORMATS`, `BENCH_SIZES` e `DEFAULT_SEED` são definitivas, e `generateFixture` lança. Pode acrescentar `clock` ao objeto, porque o contrato não proíbe propriedade extra.

## Armadilhas já mapeadas

- **`lib/player/resumePolicy.ts` não pode sumir**: a trava da 019 (`progressRecorder.historico.contract.test.ts`) importa `./resumePolicy`. Mova a definição para `lib/catalog/resumePolicy.ts` e deixe o arquivo antigo reexportando (D-006, T030).
- **`instanceof`**: `FavoritesScanComplete` e `StorageFullError` precisam de uma definição só (`repository/shared.ts`). Uma cópia faz um `.each()` interrompido virar erro de verdade.
- **Nada de `export *` na fachada**: exportaria ajudantes internos (`query`, `activeGenerationOf`, `resolveStableIdsIn`…), e o contrato reprova o conjunto.
- **Spy no namespace (R-001)**: o teste (k) de `LiveScreen.favorites.test.tsx` só prova algo se o `vi.spyOn(catalogRepository, 'resolveFavorites')` interceptar. Confirme que fica vermelho com uma chamada provocada (T015).
- **Ordem da lista de exceções**: `--write-baseline` **só** depois do T017 (fachada) e do T030 (`resumePolicy`). Se gerar antes, ela herda o teto de 1 517 linhas do repositório e o par catalog → player, e o contrato "código real" reprova sem como consertar, porque `--write-baseline` recusa sobrescrever. Se isso acontecer, apague o JSON à mão, explicando no Registro da Fase, e gere de novo.
- **Contagem física**: a spec cita 1 428 linhas e 36 arquivos pela contagem sem linhas em branco. Vale a física (`logic/catraca-arquitetura.md` §3).
- **Testes `.ts` com `node:fs` em `src/`** precisam de `/// <reference types="node" />` (o `tsconfig.app` só declara `vite/client`) e usam `process.cwd()` (= `tv-web/`). O padrão é o de `src/styles/tokens.test.ts`.
- **Benchmark sem tocar o pipeline (D-007)**: `importPipeline.ts`, `sectionLoader.ts`, `categoryLoader.ts` e `epgSync.ts` já têm teto pela US2. Compor só o que eles exportam.
- **XMLTV**: `parseXmltv` filtra pela janela. Sem `now`/janela fixos no `clock` da fixture, programas somem e `countsMatch` falha.
- **Fixtures** só com host `127.0.0.1` (o contrato reprova qualquer outro). O slug do aparelho nunca usa `os.hostname()`.
- **E2E**: o runner `e2e/run.mjs` tem a lista `SUITE` explícita, então o benchmark não entra nele. Não acrescente.
- `bench.html` fica na raiz de `tv-web/`, e o build usa só `index.html`. Mesmo assim, confira o `dist/` (T051), porque o guard do `sync-tizen` só olha arquivos emitidos.

## Pendências do Analyze

- A1 (LOW): a spec cita 1 428 linhas e 36 arquivos (contagem sem linhas em branco). O plano corrige (R-003). Opcional: anotar a correção na spec, em Clarifications.
- A2 (LOW): os testes sem contrato da US1 dependem da suíte existente. Se o T001 mostrar falhas pré-existentes, registre-as. Não as conte como regressão nem as corrija nesta feature.

## Gate de pronto

- 5/5 contratos verdes e travas íntegras (desta e das 11 features acima).
- `npx tsc -b`, `npm run lint` (oxlint + catraca), `npm run test`, `npm run build` (sem benchmark no `dist/`).
- `npm run test:e2e` com `npm run dev` rodando: obrigatório ao fim da US1 e no Polish.
- `quickstart.md` inteiro, incluindo as 6 violações sintéticas e uma rodada completa de `bench:import` versionada.
- `CLAUDE.md` → "Commands" atualizado (T052) e revisão de segredos (T053).
- TV física: **recomendação, não gate**.
