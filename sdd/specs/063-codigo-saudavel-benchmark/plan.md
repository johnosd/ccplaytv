# Implementation Plan: Código saudável — divisão do repositório do catálogo, fronteiras e tamanho por lint, benchmark de importação

**Slug**: `063-codigo-saudavel-benchmark` | **Date**: 2026-10-07 | **Spec**: `sdd/specs/063-codigo-saudavel-benchmark/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Pacote G5 do backlog, em três entregas independentes, nesta ordem:

1. **US1 (49a-2)**: `tv-web/src/lib/catalog/catalogRepository.ts` (1 517 linhas
   físicas) é dividido, **sem mudar uma linha de comportamento**, em 11 módulos de
   `lib/catalog/repository/`. O arquivo original vira uma fachada que reexporta
   por lista explícita, então nenhum dos 54 importadores muda.
2. **US2 (49b)**: um script próprio, `tv-web/scripts/architecture.mjs`, que roda em
   `npm run lint` depois do oxlint. Ele reprova import novo entre features, de
   `lib` para UI, de `components` para `features` e de `lib/catalog` para
   `lib/player`. Também reprova arquivo de produção novo acima de 300 linhas e
   arquivo herdado acima do seu teto. O estado atual vira uma lista de exceções
   versionada que só diminui. Antes, a política de retomada passa a ser definida
   em `lib/catalog/`, para a regra catalog → player nascer sem exceção.
3. **US3 (35)**: um benchmark de importação no navegador. Fontes fictícias
   determinísticas (Xtream, M3U, XMLTV × 1k/10k/100k) são servidas por um runner
   Node + Playwright. Uma página de bancada só de dev mede cada etapa isolada e o
   caminho real inteiro, mais o uso e a quota de armazenamento. O resultado é
   gravado em JSON versionado e comparado com a execução anterior do mesmo
   aparelho.

## Technical Context

**Language/Version**: TypeScript ~6.0 (app, `tv-web/src`), JavaScript ESM `.mjs` (scripts Node em `tv-web/scripts`); Node 24 (`@types/node` 24)

**Primary Dependencies**: React 19, Vite 8, Dexie 4.4, vitest 5, oxlint 1.81, Playwright 1.63, `typescript` (o `preProcessFile` usado pela catraca). Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie **v17**, sem mudança de esquema. O benchmark grava só em contextos de navegador descartáveis.

**Testing**: vitest com dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts` e `scripts/**/*.test.mjs`); E2E por `node e2e/run.mjs` com o dev server em `:5173`; travas SHA256 por `check-contract-tests.ps1`.

**Target Platform**: TV Samsung (Tizen 9 / Chromium 120, build `chrome108`). Esta feature não muda nada que vá para o `.wgt`. O benchmark é só de dev, roda em Chromium desktop e, opcionalmente, no navegador da TV.

**Performance Goals**: a US1 não pode ter regressão (mesmas consultas e transações). Na US3, o benchmark não tem meta: ele mede.

**Constraints**: os testes de contrato de 15 travas de outras features dependem do repositório e não podem ser editados (`handoff.md`). Um deles (`progressRecorder.historico.contract.test.ts`, da 019) importa `lib/player/resumePolicy`, então esse caminho continua existindo. Também não pode haver instrumentação de produção (FR-025).

**Scale/Scope**: 54 importadores do repositório. Cerca de 150 imports cruzados entre features herdados. 40 a 50 arquivos de produção acima de 300 linhas físicas (o número exato sai do `--write-baseline`; a spec citou 36 pela contagem sem linhas em branco). Fixtures de até 100 mil entradas.

## Decisões Invariantes

- **D-001 Fachada explícita.** `catalogRepository.ts` só tem comentários e
  `export { … } from './repository/…'` / `export type { … } from …`. Nunca
  `export *`, nunca lógica. Nenhum arquivo fora de `lib/catalog/repository/` e da
  fachada importa `./repository/*`, nem os testes.
- **D-002 Mover, não reescrever.** O mapa símbolo → módulo é o de
  `logic/divisao-repositorio.md` §2. Os corpos, comentários e assinaturas são
  copiados como estão, e nenhuma transação muda. Ajudantes internos têm uma
  definição só, em `repository/shared.ts`; isso vale em especial para a
  sentinela `FavoritesScanComplete` e para `StorageFullError` (`instanceof`).
- **D-003 Contagem e limite.** Linhas físicas (a quebra final não conta).
  `MAX_LINES = 300`. "Produção" segue `logic/catraca-arquitetura.md` §2.
- **D-004 A catraca é um script, não regra do oxlint.**
  `"lint": "oxlint && node scripts/architecture.mjs"`. Os imports são extraídos
  com `ts.preProcessFile`, e só os relativos contam (`research.md` §1).
- **D-005 A lista de exceções só aperta.** Ela é gerada **uma vez**, depois da US1
  e do T030. `--write-baseline` recusa se já existir; `--prune` nunca
  acrescenta. Exceção obsoleta é aviso, não reprovação. `catalog-to-player`
  nunca é herdável.
- **D-006 A política de retomada vai para `lib/catalog/resumePolicy.ts`.**
  `lib/player/resumePolicy.ts` vira só uma reexportação (player → catalog, a
  direção permitida). Assim a trava da 019 e os 9 importadores continuam
  intactos, e `lib/catalog/homeHero.ts` passa a importar `./resumePolicy`.
- **D-007 O benchmark fica fora da produção.** Ele tem uma página só de dev, que
  não entra no build, e nenhuma linha muda no pipeline. As etapas isoladas
  (`stages`) e o caminho real (`realPath`) são reportados separados e nunca
  somados. Usa só dados fictícios. O resultado não tem URL, hostname nem nome
  de usuário. Não é gate e não entra no `test:e2e`.
- **D-008 Dexie continua em v17.** Esta feature não toca o esquema.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Sem mudança de comportamento. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Fixtures fictícias, só com host `127.0.0.1` (o contrato confere). O resultado e a saída do runner não têm URL, hostname nem usuário. O `.env` nunca é lido. Falhas gravam só o `name` do erro. |
| Categorias da Fonte São Preservadas | N/A | N/A | A US1 é movimentação literal (D-002). |
| IA e Classificação Nunca Inventam Dados | OK | OK | O benchmark grava `"não informado"` quando não há quota, nunca um número inventado (FR-020). |
| Comandos Locais Independem de Rede | N/A | N/A | — |
| Trailers e Metadados Não Alteram o Estado | N/A | N/A | — |
| Toda Ação Essencial por Controle Remoto | N/A | N/A | Nenhuma UI nova no app. A bancada é ferramenta de dev, fora do `.wgt`. |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | O classificador real é usado sem mudança. |
| Foco Visível e Sem Becos Sem Saída | N/A | N/A | Nenhuma tela muda. |
| Voltar Restaura Foco e Posição | N/A | N/A | — |
| Identidade de Reprodução Não Depende da URL | OK | OK | `resolveStableIdsIn` e `resolveContinueEntries` são movidos sem alteração. A suíte e as travas 013/019 provam. |
| Progresso e Capacidades São Reais | OK | OK | O benchmark não promete nada e não é gate. Com o runtime `tv-browser`, ele diz que não mede o app empacotado (`R-004`). |
| Documentação do Repositório É Canônica | OK | OK | `CLAUDE.md` → "Commands" ganha `npm run lint` (com a catraca) e `npm run bench:import` (T052). Os caminhos citados em specs antigas (`catalogRepository.ts`) continuam válidos, porque a fachada mantém o arquivo. |
| Restrição: Plataforma-alvo / build `chrome108` | OK | OK | `vite.config.ts` não muda. `bench.html` não é entrada do build (T051 confere o `dist/`). |
| Restrição: Design system | N/A | N/A | Nenhuma tela do app. A bancada é uma página técnica sem uso pela pessoa. |
| Fluxo: testes por task + E2E antes da TV | OK | OK | A US1 tem o E2E completo como critério. O Polish roda a suíte inteira. A TV não é gate (opcional na US3). |
| Fluxo: revisão de segredos antes de commit | OK | OK | T053 revisa fixtures, resultados e saída do runner. |

Nenhuma violação, então o Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/063-codigo-saudavel-benchmark/
├── spec.md
├── plan.md                      # este arquivo
├── research.md                  # 3 decisões: catraca, medição sem instrumentar, TV
├── quickstart.md
├── logic/
│   ├── divisao-repositorio.md   # mapa símbolo → módulo, dependências, fachada
│   ├── catraca-arquitetura.md   # regras, resolução, contagem, lista de exceções, CLI
│   └── benchmark.md             # fixtures, bancada, runner, formato do resultado
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── bench.html                          # NOVO — página da bancada (só dev, fora do build)
├── bench-results/                      # NOVO — resultados versionados do benchmark
├── package.json                        # lint + bench:import
├── scripts/
│   ├── architecture.mjs                # NOVO (stub do plan) — catraca
│   ├── architecture-baseline.json      # NOVO — gerado no T035
│   ├── architecture.codigo-saudavel.contract.test.mjs   # TRAVADO
│   ├── architecture.test.mjs           # NOVO — cobertura complementar
│   └── bench/
│       ├── fixtures.mjs                # NOVO (stub do plan)
│       ├── fixtures.codigo-saudavel.contract.test.mjs   # TRAVADO
│       ├── report.mjs (+ report.test.mjs)               # NOVO — ajudantes puros do runner
│       └── run-import-bench.mjs        # NOVO — servidor + Playwright
└── src/
    ├── bench/importBench.ts            # NOVO — bancada no navegador
    └── lib/
        ├── catalog/
        │   ├── catalogRepository.ts    # vira fachada
        │   ├── catalogRepository.codigo-saudavel.contract.test.ts   # TRAVADO
        │   ├── repository/             # NOVO — 11 módulos (logic/divisao-repositorio.md §2)
        │   ├── resumePolicy.ts         # NOVO — definição movida (D-006)
        │   └── homeHero.ts             # passa a importar ./resumePolicy
        └── player/resumePolicy.ts      # vira reexportação
CLAUDE.md                               # "Commands": lint com catraca, bench:import
```

**Structure Decision**: frontend `tv-web/` apenas (o `api/` congelado não é
tocado). A divisão fica dentro de `lib/catalog/`, seguindo a subpasta que já
existe em `lib/catalog/prefetch/`. Scripts de verificação ficam em
`tv-web/scripts/`, com o padrão de `check-no-demux-in-build.mjs`. O benchmark é
separado do E2E (`e2e/run.mjs` tem a lista `SUITE` explícita e não o pega).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **US1**: a suíte existente **é** a prova (FR-005). O contrato congela a
  superfície, e `tsc`, `npm run test`, as travas de outras features e
  `npm run test:e2e` provam o comportamento. Um teste complementar garante a D-001
  (ninguém importa `repository/*` direto).
- **US2**: o contrato cobre as regras com fixtures em memória e o código real com a
  lista versionada. A cobertura complementar (`architecture.test.mjs`) pega a
  resolução (`index.ts`, extensão explícita, pacote ignorado, `.css`) e a CLI
  (`--write-baseline` recusa, `--prune` só aperta). SC-004 também é verificado à
  mão (`quickstart.md` §3).
- **US3**: o contrato cobre o determinismo e o tamanho das fixtures.
  `report.test.mjs` cobre o nome do arquivo, o slug sem hostname e a comparação
  com o anterior do mesmo aparelho. A rodada real é manual (`quickstart.md` §4).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npm run test
npx vitest run <arquivo>            # o mais estreito primeiro
npm run build
npm run dev                          # outro terminal, para E2E e benchmark
npm run test:e2e
npm run bench:import -- --sizes 1000
```

Travas (na raiz):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:

- `tv-web/src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts` (1)
- `tv-web/scripts/architecture.codigo-saudavel.contract.test.mjs` (3)
- `tv-web/scripts/bench/fixtures.codigo-saudavel.contract.test.mjs` (1)

Comando (em `tv-web/`):

```powershell
npx vitest run src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts scripts/architecture.codigo-saudavel.contract.test.mjs scripts/bench/fixtures.codigo-saudavel.contract.test.mjs
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `exporta exatamente os mesmos valores, só reexporta de repository/ e cada módulo cabe no limite` | FR-001, FR-002, SC-001, SC-002 | Fase 3 (US1) | `AssertionError` na fachada (sobra de lógica). O conjunto de valores já bate. |
| `fronteiras: import novo proibido reprova em todas as formas; o herdado passa; catalog→player não tem exceção` | FR-007..FR-010, FR-015 | Fase 4 (US2) | `Error: not implemented` (`checkArchitecture`) |
| `tamanho: arquivo novo acima do limite e herdado acima do teto reprovam; obsoletos são apontados; teste e fixture ficam de fora` | FR-011, FR-013, FR-014 | Fase 4 (US2) | `Error: not implemented` (`checkArchitecture`) |
| `o código real, com a lista de exceções versionada, passa sem violação nem exceção catalog→player` | SC-004, SC-005, FR-016 | Fase 4 (US2) | `Error: not implemented` (`loadBaseline`) |
| `mesma semente gera o mesmo conteúdo, outra semente não, e cada formato tem exatamente o tamanho pedido` | FR-018, SC-007 | Fase 5 (US3) | `Error: not implemented` (`generateFixture`) |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/scripts/architecture.mjs`, `tv-web/scripts/bench/fixtures.mjs`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — Setup (T001–T002) | Concluída. Linha de base: `tsc` 0, lint 0, 2 867 testes verdes (só os 5 contratos desta feature vermelhos); 11 travas de outras features íntegras. |
| US1 — repositório dividido (T010–T020) | Concluída e verde. Fachada de 44 linhas sobre 11 módulos de `lib/catalog/repository/`; contrato 1/1; suíte 2 870 verdes; E2E 42/42; nenhum importador editado. |
| US2 — catraca (T030–T038) | Concluída e verde. `resumePolicy` definido em `lib/catalog/`; `scripts/architecture.mjs` completo; `scripts/architecture-baseline.json` gerado (145 imports herdados, 37 tetos, nenhum catalog→player); `npm run lint` = oxlint + catraca; contrato 3/3 (com a emenda do R-009); suíte 2 885 verdes; 6 violações sintéticas observadas. |
| US3 — benchmark (T040–T048) | Concluída e verde. Fixtures, bancada em `src/bench/`, `report.mjs`, runner com `--serve-only`, `bench:import`. Rodada completa feita (9 combinações `ok`, `countsMatch: true`), 2 resultados versionados em `tv-web/bench-results/`. Contrato 1/1; `scripts/bench` 26/26. |
| Polish (T050–T056) | Concluído. `tsc` 0; lint 0 (`architecture: ok`); `npm run test` 2 911/2 911; `npm run build` ok (`check-no-demux-in-build` ok, `dist/` sem `bench.html` nem marcador da bancada); E2E 42/42 (41 na rodada paralela + `teste-conexao-tv` isolado, ver R-010); 12 travas íntegras; revisão de segredos sem achados; `CLAUDE.md` e `quickstart.md` atualizados. |
| Contratos | 5 de 5 verdes (fachada, 3 da catraca, fixtures). Trava íntegra. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `LiveScreen.favorites.test.tsx` (k) faz `vi.spyOn(catalogRepository, 'resolveFavorites')` e verifica `not.toHaveBeenCalled()`. Pela fachada, um spy que não intercepta passaria em silêncio, e o teste perderia o dente. | Médio: regressão D-005 da 013 invisível | Resolvido: no T015 o spy foi provado interceptando (chamada síncrona provocada em `useFavoritesContent` → teste (k) vermelho, `called 11 times`; desfeita). Instrução original: confirme que o spy intercepta: faça a tela chamar `resolveFavorites` temporariamente, veja o teste ficar vermelho e desfaça. Isso funciona porque os consumidores leem a propriedade da fachada (D-001). |
| R-002 | `catalogApi.previews.test.tsx` usa `vi.mock` na fachada com `importOriginal`. Chamadas internas entre módulos de `repository/` não passam pelo mock. | Baixo | Resolvido: É igual a antes, porque chamadas no mesmo arquivo também não passavam. A D-001 mantém o efeito para os consumidores. |
| R-003 | O número de arquivos acima do limite na spec (36) vem da contagem sem linhas em branco. A lista real (linhas físicas) terá mais. | Baixo: só expectativa | Resolvido: A spec já diz "valor exato no plano". Vale o que o `--write-baseline` gerar. |
| R-004 | Na TV física, o benchmark roda no navegador da TV, não no runtime `file://` do app empacotado. | Médio para conclusões sobre quota | O resultado é marcado com `runtime: 'tv-browser'`, e a medição não é gate. Quem reabrir o item 51 deve registrar essa ressalva. |
| R-005 | A gravação isolada do M3U grava blocos direto, mas o caminho real passa por `storedEntries`. | Médio: leitura errada dos números | Resolvido: `stages` e `realPath` ficam separados no resultado e nunca são somados (D-007, `logic/benchmark.md` §3). |
| R-006 | A combinação de 100k no `npm run dev` pode levar minutos e usar muita memória. | Baixo | Resolvido: Timeout de 15 min por combinação, registrado como falha. O runner segue para a próxima (FR-023). |
| R-007 | Os tetos congelam arquivos grandes: uma feature futura que precise crescer `catalogApi.ts` vai reprovar no lint. | Médio: atrito proposital | Resolvido: É o objetivo da catraca. `CLAUDE.md` explica o caminho: dividir o arquivo, ou editar a lista à mão com justificativa (T052). |
| R-008 | O teste (k) de `LiveScreen.favorites.test.tsx` tem asserção síncrona: removida a guarda `enabled &&` de `useFavoritesContent`, ele continua verde, porque a consulta assíncrona ainda não chamou `resolveFavorites` no `expect`. | Baixo: já era assim antes da 063 | Fora do escopo desta feature. Registrado para um `sdd-bugfix`/ideia futura (trocar por `waitFor`/espera da consulta). A prova do R-001 usou chamada síncrona, que o teste enxerga. |
| R-009 | O teste 2 do contrato da US2 não podia passar: o formatador `rulesOf` do próprio arquivo gerava `max-lines lib/x.ts ->` (a seta fica sempre na string) e o esperado era `max-lines lib/x.ts`. Provado vermelho só por `not implemented` no `sdd-plan`, antes de a asserção ser alcançada. | Médio: contrato impossível | Resolvido: Emenda aprovada pelo usuário em 2026-10-07: só o `rulesOf` passou a omitir ` -> ` quando não há `target`; trava regravada (`-Write`, 5/5). Implementação inalterada. Confirmado antes com uma cópia descartável do contrato. |
| R-010 | `e2e/teste-conexao-tv.mjs` reprovou uma vez na rodada paralela do Polish (`scrollTop` do `.settings-panel` 47 ≠ 46 depois de fechar o diálogo, linha 102) e passou isolado (`--jobs 1`) e no E2E da US1. | Baixo: flake de timing, tela que a 063 não toca | Explicação: restauração de rolagem com 1 px de diferença sob carga (o E2E rodou junto com build, lint e a rodada do benchmark ainda fresca). Taxa observada: 1 falha em 3 execuções. Não corrigido aqui (fora do escopo); candidato a `sdd-bugfix` trocar a igualdade por tolerância de 1 px ou esperar a rolagem estabilizar. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-07 | Fase 1 — Setup | Linha de base: `tsc` 0, lint 0, 2 867 testes verdes, 5 contratos vermelhos; 11 travas de outras features íntegras. | — |
| 2026-10-07 | Fase 3 — US1 | `catalogRepository.ts` (1 517 linhas) virou fachada de 44 linhas sobre 11 módulos de `repository/` (≤199 linhas cada). Contrato 1/1, suíte 2 870 verdes, E2E 42/42, R-001 provado, nenhum importador editado. | Teste (k) da 013 é síncrono (R-008, fora do escopo). |
| 2026-10-07 | Fase 4 — US2 | `resumePolicy` movido para `lib/catalog/`; `architecture.mjs` implementado; lista de exceções gerada (145 imports, 37 tetos); `lint` = oxlint + catraca; 12 testes complementares. Parada no 5b por contrato impossível (teste 2), emenda aprovada (R-009), trava regravada. Contrato 3/3, suíte 2 885 verdes, 6 violações sintéticas observadas. | E2E completo só no Polish. |
| 2026-10-07 | Fase 5 — US3 | T040–T048: `generateFixture`, bancada em `src/bench/` (stages e real), `report.mjs`, runner com `--serve-only`, `bench:import`; T047 rodada completa (9 combinações `ok`) e comparação com o anterior; 2 resultados versionados. Teste instável por timeout corrigido (era do teste). | — |
| 2026-10-07 | Fase 6 — Polish | T050–T056: `tsc`, lint, `npm run test` 2 911 verdes, build + guarda do demux, `dist/` sem benchmark, E2E 42/42 (1 flake isolado, R-010), 12 travas íntegras, revisão de segredos, `CLAUDE.md` (lint com catraca, `bench:import`, contorno do `--` no PowerShell) e `quickstart.md`. | Rodada opcional do benchmark na TV física (R-004, não é gate). |

**PRÓXIMO**: `sdd-converge` desta feature e commit (nada foi commitado). Opcional, não é gate: rodada do benchmark na TV física (`node scripts/bench/run-import-bench.mjs --serve-only --device tv-qn50q60d`, R-004).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/catalog/catalogRepository.ts` — fachada (44 linhas, só reexporta).
- `tv-web/src/lib/catalog/repository/*.ts` — 11 módulos + `fachada.test.ts`.
- `tv-web/scripts/architecture.mjs` + `architecture-baseline.json` + `architecture.test.mjs` — catraca pronta (US2).
- `tv-web/scripts/bench/` (`fixtures.mjs`, `report.mjs`, `run-import-bench.mjs` + testes), `tv-web/src/bench/` e `tv-web/bench.html` — benchmark pronto e com a rodada completa feita (T047).
- `sdd/specs/063-codigo-saudavel-benchmark/logic/benchmark.md` — formato do resultado e do runner (com a emenda das rotas `/f/<id>/`).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- O dev server foi encerrado ao fim do Polish (a porta 5173 está livre). O `bench:import` e o `test:e2e` precisam dele no ar; a máquina de referência tem ~5 GB de RAM livre, então não rode benchmark e E2E ao mesmo tempo (distorce os tempos).
- Os módulos de `repository/` foram gerados por script a partir do original (faixas de linha) e gravados em CRLF, como o resto do repositório. Se for preciso mexer neles, edite à mão: o script não é versionado.
- Nenhum módulo de `repository/` passa de 199 linhas, então a US2 não precisa de teto para eles.
- Servidor das fontes do benchmark: cada combinação sob `/f/<formato>-<tamanho>/`; `/plan` e `/result` na raiz. O runner não lê nome da máquina nem usuário e recusa gravar resultado com URL; `bench-results/` é versionado e já tem 2 resultados (rodada completa e uma de 1k).
- Testes que usam `fake-indexeddb` com milhares de entradas precisam de timeout próprio (`vi.setConfig`): o padrão de 5 s estoura sob a carga da suíte inteira.
- `npm run lint` agora roda a catraca. A lista de exceções só diminui: `--write-baseline` recusa se ela existe; para apertar use `--prune`; para abrir uma exceção, edite o JSON à mão com justificativa. `architecture-baseline.json` é novo e ainda não está commitado, e `catalogApi.ts` tem teto 2 190: qualquer linha a mais reprova.

## Resultado Final

*(Convergência de 2026-10-09.)*

**O que foi construído.** (1) `catalogRepository.ts` virou uma fachada de 44 linhas só com reexportações sobre 11 módulos em `lib/catalog/repository/` (o maior com 224 linhas), mesmo conjunto de símbolos e nenhum importador editado. (2) A catraca de arquitetura `tv-web/scripts/architecture.mjs` dentro do `npm run lint`, com `architecture-baseline.json` (145 imports herdados, 37 tetos) que só diminui, `--prune` para exceções obsoletas e `--write-baseline` recusado; `resumePolicy` passou para `lib/catalog/`, então não há mais import `lib/catalog → lib/player`. (3) A bancada de importação `npm run bench:import`, com fixtures determinísticas Xtream/M3U/XMLTV × 1k/10k/100k, uso/quota de armazenamento, resultados versionados em `tv-web/bench-results/` e modo `--serve-only` para a TV.

**Verificação na convergência (2026-10-09).** Trava 5/5 íntegra e os 5 contratos verdes; `npm run test` 507 arquivos / 3059 testes; `npm run lint` com `architecture: ok` (os 4 avisos de teto que pode baixar e de exceção obsoleta são o FR-013 funcionando); `npm run test:e2e` 43/43.

**Desvios em relação ao plano original.** Emenda do contrato da US2 aprovada pelo usuário (R-009: só o formatador `rulesOf` do próprio teste mudou, trava regravada). A rodada na TV física do benchmark (`--serve-only`) não foi feita — não é gate (R-004).

**Abertos de propósito.** R-004 (benchmark na TV roda no navegador da TV, não no `file://`), R-008 (asserção síncrona em `LiveScreen.favorites.test.tsx`, candidato a `sdd-bugfix`) e R-010 (flake de 1 px de rolagem no `teste-conexao-tv` sob carga; não reapareceu nos 43/43 de 2026-10-09).

