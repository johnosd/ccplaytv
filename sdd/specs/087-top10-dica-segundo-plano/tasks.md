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

Status: **Em andamento** — T040, T041, T042 e T045 concluídos; **T043 e T044 esperam autorização do usuário para instalar na TV**.
Feito: T040 (gates), T041 (E2E completo), T042 (`CLAUDE.md`: a regra da 086 deixou de listar Top 10/Dica entre as fileiras de `showcaseCandidates`, e a regra da 087 registra o produtor, a validade por período + cobertura, o aviso e as duas ações da pessoa) e T045 (ad-hoc, o roteiro E2E).
Contrato: `check-contract-tests.ps1` → PASS para **087**, **057** e **086**; os 5 contratos da 087 verdes dentro da suíte completa.
Testes executados: `npm run test` → **3708/3708 em 683 arquivos** (151 s). `npx tsc -b` → verde. `npm run lint` → sem erro (só os avisos pré-existentes de `react-hooks`/`react(purity)`) e ratchet ok, com a poda final (`--prune`). `npm run build` → verde, `check-no-demux-in-build: ok`. `npm run test:e2e` → **54/54 em 205 s**, com o `dev` no ar; `top10-dica` sozinho em série → 1/1 em 20,7 s. Nenhum flake observado nesta rodada (os conhecidos `headers-catchup` e `carrosseis-filmes-series` passaram nas duas execuções completas).
Pendências: **T043/T044 na TV** (gate de SC-007 e SC-008), que pedem autorização. Do `quickstart.md` §3 (conferir sem a TV): os itens 1 a 4 estão cobertos em navegador real pelo `top10-dica.mjs` (fileira ausente, entrando com a tela aberta, numerada, e sumindo ao remover a chave); os itens **5 e 6** (salvar a chave de novo e trocar o idioma) estão cobertos por teste unitário, **não** em navegador — por isso o item do quickstart segue desmarcado no Checklist de Release.

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
