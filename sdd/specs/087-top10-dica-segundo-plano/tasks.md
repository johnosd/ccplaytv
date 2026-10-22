# Tasks: Top 10 e Dica produzidos em segundo plano

**Feature**: 087-top10-dica-segundo-plano
**Spec**: `spec.md` · **Plano**: `plan.md` · **Desenho**: `logic/producao-em-segundo-plano.md`

## Format: `[ID] [P?] [Story] Description`

- `[P]` = pode rodar em paralelo com outras `[P]` da mesma fase.
- `[Story]` = a user story que a task serve (US1, US2, US3).

## Path Conventions

```
tv-web/src/lib/catalog/         externalRows.ts (stub pronto), showcaseRows.ts, showcaseTypes.ts, prefetch/index.ts
tv-web/src/lib/metadata/        discoveryRules.ts (NÃO MUDA), tmdbDiscovery.ts (só exporta localDay)
tv-web/src/features/catalog/    catalogApi.ts, catalogApi.discovery*.test.tsx
```

## Phase 1: Setup

**Objetivo**: confirmar o ponto de partida antes de escrever qualquer linha.

### Implementation

- [X] T001 Rodar os 5 contratos e confirmar que estão **vermelhos pelo motivo esperado** (3 por `not implemented`, 2 por
      asserção), com o comando de `plan.md` → `## Estratégia de Testes`.
- [X] T002 Conferir as travas de **087, 057 e 086** íntegras (os três comandos do mesmo lugar). A da 057 é a que esta
      feature pode quebrar sem perceber.

### Critério de Conclusão

Os 5 contratos vermelhos pelo motivo certo e as três travas íntegras.

### Registro da Fase

Status: Concluída (2026-10-21)
Feito: T001, T002. Ponto de partida confirmado sem escrever nenhuma linha de código.
Contrato: `npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx` → **5 failed (5)**, vermelhos pelo motivo esperado: 3 por `Error: not implemented` em `externalRows.ts:31` e 2 por asserção na tela (`expected +0 to be 3` no `waitFor`). Nenhum por erro de import, sintaxe ou tipo. Trava íntegra.
Testes executados: os 5 contratos (acima) e as três travas: `check-contract-tests.ps1` → PASS para **087** (5 testes, 2 arquivos), **057** (5 testes, 3 arquivos) e **086** (5 testes, 2 arquivos).
Pendências: nenhuma.

## Phase 2: Foundational

**Objetivo**: a peça que todas as fases usam — o período.

### Implementation

- [X] T010 Exportar `localDay` em `lib/metadata/tmdbDiscovery.ts` (uma linha; `weekKey` já é exportado) →
      `logic/...md` §4. **Não** reimplemente a função, e **não** mexa em mais nada nesse arquivo (contrato travado da 057).

### Critério de Conclusão

`npx tsc -b` verde; `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro.

### Registro da Fase

Status: Concluída (2026-10-21)
Feito: T010. `localDay` exportado em `lib/metadata/tmdbDiscovery.ts` — **uma linha**, `function` → `export function`, sem reimplementar e sem tocar em mais nada no arquivo (`git diff --stat`: 1 insertion, 1 deletion).
Contrato: sem contrato nesta fase. A trava da **057**, que este arquivo poderia quebrar, segue íntegra (`check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` → PASS, 5 testes).
Testes executados: `npx tsc -b` → verde.
Pendências: nenhuma.

## Phase 3: User Story 1 — As telas deixam de percorrer o catálogo (P1) 🎯 MVP

**Objetivo**: o produtor existe e grava; a tela só lê.

### Contrato da Fase

Estes **já existem e estão travados** — não são task de escrita:

- `grava os mesmos itens, na mesma ordem e com a posição real, que as regras atuais produzem`
- `abaixo do mínimo de cruzados grava o período com a fileira vazia, para a fila não repetir o trabalho`
- `mostra o resultado guardado sem tocar a rede nem percorrer o catálogo; sem resultado, a fileira não existe`

```bash
npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx
```

### Implementation

- [X] T020 [US1] Implementar `refreshExternalRow` em `lib/catalog/externalRows.ts`, na **ordem obrigatória** de
      `logic/...md` §4 (geração → período → ranking → índice em fatias → casar → selecionar → gravar, inclusive vazio)
      → contratos: "grava os mesmos itens…", "abaixo do mínimo…". Cobre também **FR-013** (o registro pertence à
      geração ativa; sem geração, não produz) e **FR-016** (gravar o registro nunca impede nem atrasa a gravação do
      catálogo — transação própria, falha engolida).
- [X] T021 [US1] Implementar `refreshStaleExternalRows` (uma fileira por rodada, varrendo tipo × fileira) →
      `logic/...md` §4.
- [X] T022 [US1] Ligar no `housekeeping` de `lib/catalog/prefetch/index.ts`, **depois** de
      `refreshMissingScreenDocuments` → `logic/...md` §5; **FR-014** (não competir com a primeira tela nem com a carga
      — a fila já traz os três portões da 086). **Não** ligar na carga por seção (Decisão Invariante 5).
- [X] T023 [US1] `useWeeklyTop10`/`useDailyTip` em `features/catalog/catalogApi.ts` passam a **ler** por
      `readExternalRow`, mantendo a forma do retorno → contrato: "mostra o resultado guardado…"; `logic/...md` §7.
- [X] T024 [US1] Remover da tela o que ficou órfão: `useDiscoveryIndex`, `useDiscoveryRow`, `projectTop10`,
      `projectTip`, `DISCOVERY_READ`, `discoveryResultKey`, `DiscoveryComputed`, `DiscoveryEntries`,
      `DiscoveryContext`, `EMPTY_BACKDROPS` → `logic/...md` §7. **Preservar** `DiscoveryRowResult` e `DiscoveryPick`.
- [X] T025 [US1] Rodar `node scripts/architecture.mjs` e, se o teto de `catalogApi.ts` tiver baixado, podar o baseline
      (`--prune`) → R-005.

### Testes da Fase

- [X] T026 Teste: série usa o ranking e o índice **de séries** (garantia 6 da lista de `## Assumptions`).
- [X] T027 Teste: a fileira aparece **sem remontar a tela** depois que a fila produz — a invalidação do prefixo
      `catalog-search-index` é o que faz isso (FR-006, garantia 4).

- [X] T028 **[descoberta durante o T027]** Avisar quem ouve ao gravar a fileira, e invalidar só a chave daquele
      tipo em `usePrefetchForSource` (`onExternalRowRefreshed`, espelhando o canal do documento de tela da 086).
      Sem isto o FR-006 não se cumpre: a invalidação da pré-carga depende de **uma categoria chegar**, e o produtor
      roda no `housekeeping`, justamente quando não há mais nenhuma a chegar → R-007.

### Critério de Conclusão

1. Os 3 contratos da fase verdes e `check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano` íntegro.
2. `npx vitest run src/lib/catalog src/features/catalog src/lib/metadata` verde.
3. Nenhuma passada pelo catálogo e nenhuma requisição disparadas pela abertura — é o que fecha **SC-001**, **SC-002**
   e **SC-003** (os contratos provam os três, sem a TV).
4. **SC-004** (o resultado recém-produzido aparece sem sair e voltar) coberto por T027.

### Registro da Fase

Status: Concluída (2026-10-21) — com o **critério 2 pendente por construção** (ver Pendências).
Feito: T020–T028. O produtor (`lib/catalog/externalRows.ts`, 196 linhas) na ordem obrigatória do `logic` §4, com as paradas antecipadas: sem geração, dentro do período (sem tocar a rede), sem títulos, resposta de outro período (`stale`) e índice vazio. Grava **inclusive vazio** e engole falha de gravação devolvendo `false` (FR-016). Ligado no `housekeeping` depois de `refreshMissingScreenDocuments`. `useWeeklyTop10`/`useDailyTip` agora **só leem** (`readExternalRow`), com a forma do retorno intacta; saíram da tela `useDiscoveryIndex`, `useDiscoveryRow`, `DISCOVERY_READ`, `DiscoveryComputed`, `DiscoveryEntries`, `DiscoveryContext`, `discoveryResultKey`, `EMPTY_BACKDROPS`, `SHOWCASE_SLICE` e os dois `project*` antigos — `catalogApi.ts` caiu de **2160 para 2066 linhas**.
Contrato: `npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx` → **4/5 verdes**; os **3 da fase** verdes (os dois do produtor e "mostra o resultado guardado…"), e o 4º ("dentro do período…", da Fase 4) já verde de carona. O 5º ("remover a chave…") segue vermelho — é o **T031, da Fase 4**. `check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano` → PASS (trava **regravada** pela emenda do R-006, com aprovação explícita do usuário).
Testes executados: `npx vitest run src/lib/catalog/externalRows.test.ts` → 4/4 (T026, T028, uma por rodada, sem geração); `npx vitest run src/features/catalog/catalogApi.externalRows.test.tsx` → 3/3 (T027, só lê, troca de lista); `npx tsc -b` → verde; `node scripts/architecture.mjs` → ok, teto de `catalogApi.ts` **podado** com `--prune` (2160 → 2066), 0 avisos; `npx vitest run src/lib/catalog src/features/catalog src/lib/metadata` → **16 failed | 998 passed**.
Pendências: as 16 falhas acima são **esperadas e planejadas**: 15 são os testes do lugar antigo (`catalogApi.discovery.test.tsx` e `catalogApi.discovery.estados.test.tsx`), que a **T033** move, e 1 é o contrato do T031 — ambos da Fase 4. O **critério 2 desta fase** (suíte da área verde) só fecha lá; está fora de ordem no plano, não é regressão. Nenhum teste instável observado.

## Phase 4: User Story 2 e 3 — período, e a ação da pessoa (P2, P3)

**Objetivo**: o resultado se mantém correto sozinho, e o que a pessoa faz tem efeito imediato.

### Contrato da Fase

- `dentro do período não produz nada, e com o período vencido sem resposta mantém o que está guardado`
- `remover a chave apaga o resultado guardado e a fileira some, sem requisição`

(mesmo comando da Fase 3)

### Implementation

- [X] T030 [US3] Salvar a chave (`useSaveTmdbKey`, `onSuccess`) **acorda a fila** (`wakePrefetch`) → **FR-010**;
      `logic/...md` §6.
- [X] T031 [US3] Remover a chave (`useRemoveTmdbKey`, `onSuccess`) **apaga** os registros da lista ativa → **FR-011**;
      contrato: "remover a chave apaga…".
- [X] T032 [US3] Trocar o idioma (`subscribeAppLanguage`) **mantém** o registro e marca para refazer → **FR-012**;
      `logic/...md` §6. A assimetria com T031 é deliberada.
- [X] T033 **Mover as 14 garantias** de `catalogApi.discovery.test.tsx` e `catalogApi.discovery.estados.test.tsx` para o
      lugar novo, uma a uma, pela tabela de `logic/...md` §8 → **FR-017**. A garantia "o dia fica fixo na montagem"
      muda de natureza (R-004): verificar a estabilidade pelo `periodKey`.

### Testes da Fase

- [X] T034 Teste: sem chave, o produtor **não lê o índice** (para no passo 3 de `logic/...md` §4) — garantia 3.
- [X] T035 Teste: chave recusada ou em pausa por limite: nenhuma requisição, e o guardado continua valendo — garantia 9,
      **FR-009** (serviço fora do ar, lento, recusando a chave ou sem chave não esvazia a fileira nem atrasa a abertura).
- [X] T036 **[descoberta durante a T033]** A **cobertura gravada** entra na validade do registro, junto com o periodo:
      uma categoria que chega depois nao muda o periodo, e sem isto a garantia 4 (a fileira acompanhar a pre-carga) se
      perderia -- a fileira ficaria parada no catalogo de quando foi produzida ate a semana virar. Refazer nao consulta
      nada: o ranking do periodo ja esta em cache -> R-008.

### Critério de Conclusão

1. Os 2 contratos da fase verdes; os 5 verdes juntos; trava íntegra.
2. **Cada linha da tabela de `logic/...md` §8 tem um teste no lugar novo** — nenhuma garantia perdida (FR-017).
3. `npm run test` completo verde.
4. **SC-005** (dentro do período, nenhuma requisição nova) e **SC-006** (salvar faz aparecer, remover faz sumir sem
   requisição) cobertos pelos contratos da fase.

### Registro da Fase

Status: Concluída (2026-10-21)
Feito: T030-T036. **T030**: salvar a chave chama `prefetchScheduler.wake()`. **T031**: `removeTmdbKey` apaga `showcaseExternalRows` **na mesma transação** que apaga a chave -- mais forte que fazê-lo no `onSuccess`, e vale para qualquer chamador; na tela, `invalidateQueries` com predicado (não `remove`: `remove` não faz uma consulta com observador ativo reler, e a fileira velha ficaria até sair e voltar). **T032**: trocar o idioma zera só o `periodKey` (`markExternalRowsForRefresh`) e acorda a fila -- o registro e os itens ficam. **T033**: as 14 garantias movidas uma a uma, e os dois arquivos antigos removidos. **T036** (ad-hoc): a cobertura gravada entra na validade.
Contrato: `npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx` -> **5/5 verdes**. `check-contract-tests.ps1` -> PASS para **087**, **057** e **086**.
Testes executados: `npx vitest run src/lib/catalog/externalRows.test.ts` -> 12/12 (produtor); `npx vitest run src/features/catalog/catalogApi.externalRows.test.tsx` -> 5/5 (leitura); `npx vitest run src/lib/catalog src/features/catalog src/lib/metadata` -> **1009 passed, 172 arquivos, 0 falhas** (antes desta fase: 16 falhas). `npm run test` completo -> 3707/3708, com **uma** falha: o contrato do ratchet, porque `catalogApi.ts` voltou a 2078 linhas contra o teto de 2066 (R-005, a lição da 086). Enxuguei os comentários que eu mesmo havia acrescentado -> **2056 linhas**, ratchet ok e o contrato do ratchet verde. A suíte completa é reexecutada na T040.
Pendências: a garantia 4 só é refeita quando a **cobertura** muda (categoria nova obtida ou visibilidade alterada); uma categoria **renovada** com a mesma contagem só entra na fileira quando o período virar. Nenhuma das 14 garantias listadas depende desse caso -- a de hoje testava categoria nova --, mas fica registrado. Nenhum teste instável observado.

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: fechar os gates e medir na TV.

### Implementation

- [X] T040 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` verdes.
- [X] T041 `npm run test:e2e` completo (com `npm run dev` **no ar** — a suíte dá 4/54 sem ele, e isso já custou tempo).
      Falha → reexecutar em série (`--jobs 1`) antes de chamar de flake, e registrar a taxa observada.
- [X] T042 Atualizar a regra permanente da feature 086 no `CLAUDE.md`: a frase sobre o índice do Top 10/Dica na tela
      deixa de valer.
- [X] T045 **[descoberta durante a T041]** Adaptar `e2e/top10-dica.mjs`, que codificava o comportamento antigo em
      três pontos: (a) a fileira aparecia porque a **tela** cruzava — agora espera a fila produzir (`esperarProducao`,
      as quatro fileiras, para as contagens de consulta ficarem determinísticas); (b) “tentou a rede antes de usar o
      cache” virou **nenhuma consulta dentro do período** (FR-007/FR-008); (c) remover a chave passa pelo caminho real
      (`removeTmdbKey`), que apaga também o registro — apagar só a chave no IndexedDB deixava a fileira na tela.
- [X] T046 **[fechamento do `quickstart.md` §3]** Levar os itens **5 e 6** do §3 (salvar a chave de novo faz as
      fileiras voltarem; trocar o idioma **mantém** a fileira e refaz no idioma novo) para o `top10-dica.mjs` — eles
      estavam cobertos só por teste unitário, não em navegador. A asserção do idioma é por seletor neutro
      (`section.vod-row:has(.content-card-rank)` e o título do provedor, que nunca é traduzido), porque o rótulo da
      fileira muda de idioma na troca.
- [X] T052 **[incidente da T051]** A primeira sonda tocou uma série na TV: as 14 teclas saíram no mesmo tick, o
      foco (estado do React, ADR-009) andou **um** passo, e o `Enter` caiu num card de "Continue assistindo".
      Corrigido com navegação em **laço fechado** (uma tecla, confere o foco, repete) e **`Enter` só com o foco no
      item da topbar**, reconhecido pelo rótulo — se não chegar, desiste e conta em `falhas`.
      `src/lib/perf/autopilot.test.ts` (3 testes) fixa a trava; ensaio no navegador contra o app real passou nas duas
      condições. **Lição de método**: eu pulei o ensaio no PC que a skill `tizen-sonda` manda fazer.
- [ ] T043 TV (**pedir autorização**): roteiro do `quickstart.md` §4 — **duração fixa**, pela lição do SC-009 da 086.
      Medir SC-007 (quadros longos ao navegar) e SC-008 (abertura segue em 313–380 ms).
- [ ] T044 Reinstalar o **pacote normal** na TV e avisar o usuário.

### Checklist de Release

- [X] Fase 1 (setup e travas conferidas)
- [X] Fase 2 (período)
- [X] Fase 3 (US1 — o MVP: produtor + leitura)
- [X] Fase 4 (US2/US3 + as 14 garantias movidas)
- [X] Todos os 5 contratos verdes e `check-contract-tests.ps1` íntegro (087, 057, 086)
- [X] `npm run test` / `tsc` / `lint` / `build` / `test:e2e` verdes
- [ ] SC-007 e SC-008 medidos na TV, com roteiro de duração fixa
- [ ] Pacote normal reinstalado na TV
- [ ] `quickstart.md` executado

### Registro da Fase

Status: **Em andamento** — T040, T041, T042, T045 e T046 concluídos; **T043 e T044 esperam autorização do usuário para instalar na TV**. É o único trabalho restante: nada mais depende da TV.
Feito: T040 (gates), T041 (E2E completo), T042 (`CLAUDE.md`: a regra da 086 deixou de listar Top 10/Dica entre as fileiras de `showcaseCandidates`, e a regra da 087 registra o produtor, a validade por período + cobertura, o aviso e as duas ações da pessoa) e T045 (ad-hoc, o roteiro E2E).
Contrato: `check-contract-tests.ps1` → PASS para **087**, **057** e **086**; os 5 contratos da 087 verdes dentro da suíte completa.
Testes executados: `npm run test` → **3708/3708 em 683 arquivos** (151 s). `npx tsc -b` → verde. `npm run lint` → sem erro (só os avisos pré-existentes de `react-hooks`/`react(purity)`) e ratchet ok, com a poda final (`--prune`). `npm run build` → verde, `check-no-demux-in-build: ok`. `npm run test:e2e` → **54/54 em 205 s**, com o `dev` no ar; `top10-dica` sozinho em série → 1/1 em 20,7 s. Nenhum flake observado nesta rodada (os conhecidos `headers-catchup` e `carrosseis-filmes-series` passaram nas duas execuções completas).
Pendências: **T043/T044 na TV** (gate de SC-007 e SC-008), que pedem autorização.

- `quickstart.md` §2 (checagens automatizadas) e **§3 inteiro** (os 6 itens) estão cobertos em navegador real pelo `top10-dica.mjs`, depois da T046. O §4 é a TV, e tem linha própria no Checklist de Release — por isso a linha do quickstart segue desmarcada: ela inclui o §4.
- **Flake novo observado** (não é desta feature): `orcamento-armazenamento-migracao` falhou **1 em 3** execuções completas em paralelo hoje, na última. Passou em série em **29,2 s** contra **131,4 s** sob carga paralela — 4,5x mais lento, causa explicável (roteiro de IO de armazenamento disputando com 5 outros Chromium). O total da suíte subiu de 205 s para 228 s com o `top10-dica` mais longo, o que aumenta um pouco a disputa. Fica registrado como problema aberto, não como verde.

## Phase 6: Convergence

**Objetivo**: fechar os achados da convergência de 2026-10-21. Anexada pelo `sdd-converge`; nada acima foi tocado.

### Implementation

- [X] T047 **[CV-001, HIGH]** Barrar o produtor enquanto a carga da lista estiver em curso e antes da primeira
      revelação da sessão: `refreshStaleExternalRows` devolve `false` se `isSectionLoadActive()` ou se
      `!isFirstRevealDone()` — o mesmo formato que `fillNextCandidates` já usa em `showcaseCandidates.ts:175`
      (devolve `false` e deixa a fila seguir, em vez de bloquear o agendador).
      **Origem**: `plan`: Decisões Invariantes 5 e 6; **FR-014**.
      **Por que importa**: `activityGate.blockReason` cobre player, app oculto, rede e tecla, e **nada mais**; o
      `housekeeping` é chamado depois de **cada categoria** da carga (`prefetchScheduler.ts:312`). Com a cobertura
      na validade (T036), cada categoria que chega invalida o registro e o índice do tipo inteiro é remontado de
      novo — o trabalho que a feature 086 tirou desse caminho (carga de séries: 26,6 s -> 3,5 s).
- [X] T048 **[CV-002, MEDIUM]** Afirmar que a fileira entra **sem mover o foco nem a rolagem**: capturar o elemento
      focado e a posição antes de a fila produzir e conferir que seguem iguais depois que a fileira aparece.
      Em `catalogApi.externalRows.test.tsx` (foco) e/ou no `e2e/top10-dica.mjs`, onde a rolagem é real.
      **Origem**: **FR-006**; Constitution "Foco Visível e Sem Becos Sem Saída".
- [X] T049 **[CV-004, LOW]** Remover os tres pontos mortos de `['tmdb-discovery']` (`catalogApi.ts:916` e `:961`,
      `categoryAccessApi.ts:30`) e corrigir o comentário de `invalidateTmdb`, que ainda fala em Top 10/Dica: nada
      registra consulta sob essa chave desde que `useDiscoveryRow` saiu.
      **Origem**: sobra da feature 057 revelada por esta.

- [X] T050 **[CV-001 reaberto pela TV]** O produtor passa a rodar **só com a fila vazia**, e monta o índice **uma
      vez por tipo** em vez de uma por fileira. O T047 barrava só a carga por seção; o agendador chama o
      `housekeeping` depois de **cada categoria** da pré-carga, e a cobertura na validade (T036) fazia remontar tudo.
      **Medido**: 10 categorias chegando = **10 montagens** do índice do tipo inteiro (43 549 filmes na TV). Na TV:
      quadro de **1750 ms**, fps mediano 32 com janelas de 1–4 fps, e entrada em categoria de **3763 ms** (linha de
      base da 086: ~200 ms). Depois: **0** durante a carga e **1** por rodada com a fila vazia.
      `prefetchScheduler` passa `{ idle }` ao `housekeeping`; teste novo afirma `idle: false` entre categorias.
- [X] T051 **[pedido do usuário]** Sonda **automatica** de medição na TV (`lib/perf/autopilot.ts`), atrás de
      `VITE_CCPLAY_AUTOPILOT=1`: entra na lista, vai a Filmes e Séries pela topbar e navega por **janelas de 60 s de
      duração fixa**, com cadência e número de teclas fixos, medindo fps/pior quadro/quadros>50 ms por rodada.
      Emite no `source: 'frames'` que já existe, com `autopilot: 1` — **sem** tocar no canal de métricas nem no
      contrato travado da 085. Import estático com portão em tempo de execução (o padrão da sonda da 069): o build
      normal não leva o módulo nem emite chunk novo — verificado nos dois builds.
      **Por quê**: o roteiro manual exigia cronómetro e duas passadas, e não era comparável entre rodadas — foi o
      que deixou o SC-009 da 086 sem veredito.
### Critério de Conclusão

1. T047 e T050 com teste que prove as barreiras, e `npm run test` completo verde.
2. Os 5 contratos da 087 verdes e `check-contract-tests.ps1` íntegro (087, 057, 086).
3. **Só depois do T047**: T043 e T044 na TV (CV-003 — SC-007 e SC-008), com autorização do usuário. Medir antes
   disso seria medir um defeito conhecido.

### Registro da Fase

Status: **Reaberta e em andamento** (2026-10-21). A TV reprovou o SC-007 e a causa estava no próprio T047, que cobria só metade — ver T050. **CV-003 segue aberto por decisão do usuário** — é o único achado da convergência sem fechar, e agora pode ser medido sem medir um defeito conhecido.
Feito: **T047** — `refreshStaleExternalRows` devolve `false` enquanto `isSectionLoadActive()` ou `!isFirstRevealDone()`, no mesmo formato de `fillNextCandidates` (devolve, não espera: esperar prenderia o agendador). O comentário do próprio `loadActivity.ts` da 086 já dizia o que eu havia escrito errado no `logic` §5: *"o portão de atividade do agendador só sabe de teclas"*. **T048** — asserção de FR-006 no `top10-dica.mjs`, com o foco fundo na Dica e a vitrine rolada: a fila refaz a fileira **acima** da focada e nem o foco nem a rolagem se movem. **T049** — os três pontos mortos de `['tmdb-discovery']` removidos (nada registrava consulta sob essa chave desde que `useDiscoveryRow` saiu) e o comentário de `invalidateTmdb` corrigido.
Contrato: `npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx` → **5/5 verdes**; `check-contract-tests.ps1` → PASS para **087**, **057** e **086**.
Testes executados: `npx vitest run src/lib/catalog/externalRows.test.ts src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts` → 17/17 (os 2 testes novos das barreiras). `npm run test` → **3710/3710**, 683 arquivos. `npx tsc -b` → verde. `npm run lint` → sem erro, ratchet ok com a poda final (`catalogApi.ts` 2056 → **2052**). `npm run build` → verde. `npm run test:e2e` → **54/54 em 211 s**; o `top10-dica.mjs` rodado direto mostra as asserções do FR-006 passando (foco `poster-box tv-focus|pôsterFilme Um` idêntico antes e depois, rolagem igual, 0 consultas).
Pendências (atualizado depois da TV): **SC-007 está REPROVADO** com os números de `evidencias/medicao-tv-2026-10-21.md` — mediana 32 fps (base 38), pior quadro **1750 ms**, entrada em categoria **3763 ms** (base ~200 ms). O SC-008 passou (348–374 ms). A causa foi medida sem a TV (10 montagens do índice para 10 categorias) e corrigida no **T050**, mas a correção **ainda não foi medida na TV** — a rodada ficou para depois, por decisão do usuário. Até lá, o veredito do SC-007 continua reprovado.

O flake de `orcamento-armazenamento-migracao` passou naquela rodada: taxa observada agora **1 em 4** execuções completas em paralelo, verde em série — segue como problema aberto, alheio a esta feature. Observação registrada, sem task: esconder uma categoria reseta a leitura (`resetQueries` em `categoryAccessApi`), mas o registro guardado só é refeito na rodada seguinte da fila, então a cobertura exibida fica uma rodada atrás. O conteúdo em si não muda de correção (o cruzamento é do tipo inteiro, **igual a antes da 087** — R-002).

## Dependencies & Execution Order

### Phase Dependencies

- Fase 2 (T010) bloqueia a Fase 3: o produtor precisa de `localDay`.
- Fase 3 (T020–T023) bloqueia a Fase 4: não há o que apagar nem acordar antes de existir produtor e leitura.
- T024 depois de T023: remover o código órfão só depois de a leitura estar no lugar.
- T033 é a maior task da feature e depende de toda a Fase 3.

### Parallel Opportunities

- T026 e T027 podem rodar junto, depois de T023.
- T030, T031 e T032 são independentes entre si.
- T034 e T035 podem rodar junto.
