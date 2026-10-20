# Implementation Plan: Orçamento de armazenamento do app na TV

**Slug**: `082-orcamento-armazenamento-tv` | **Date**: 2026-10-18 (refeito depois das sondas) | **Spec**: `sdd/specs/082-orcamento-armazenamento-tv/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Duas sondas na TV física provaram:
- a cota é de **80 MiB fixos**, e nada a aumenta;
- **a TV não comprime o que grava**;
- a lista real ocupa ~44 MB do jeito que o app grava hoje, e a maior parte é a projeção 065, uma 2ª cópia.

O plano tem cinco partes:

1. **Formato comprimido em pedaços.** Os itens das categorias vão em pedaços de 500, com JSON enxuto em gzip, numa
   tabela nova. Isso substitui a projeção 065. O guia vai por canal, comprimido. Resultado medido: ~13× menos espaço, e a
   1ª página 13× mais rápida.
2. **Compressão fora da tela.** Ela roda nos Workers que já gravam. Na thread da interface, é pedaço a pedaço, cedendo a
   vez.
3. **Conversão em segundo plano** do que já está gravado.
4. **Orçamento.** Uma reserva da pessoa, um teto e uma **conta própria de bytes gravados** (o `estimate()` não cai depois
   de apagar). A liberação vai de temporários para listas inativas e depois para categorias da lista ativa (só na
   entrada), protegendo o que está em uso, os favoritos e o "Continuar assistindo".
5. **Sondas e simulação no PC** como ferramenta permanente, e o híbrido descartado com números.

## Technical Context

**Language/Version**: TypeScript 5 (React 19, Vite 8, alvo `chrome108`), em `tv-web/`. Node 22 nos testes, com
`CompressionStream`.

**Primary Dependencies**: Dexie (versão de schema nova: 26), `CompressionStream`/`DecompressionStream` (nativos, presentes
na TV e no Worker), `@tanstack/react-query` e Playwright. **Nenhuma dependência nova.**

**Storage**: IndexedDB (`CatalogDb`). Tabelas novas `categoryChunks` e `epgChunks`, e campos novos sem índice
(`data-model.md`). Na TV: 80 MiB fixos, sem compressão do motor, e `clear()` sem devolver espaço na hora.

**Testing**: Vitest em dois projetos:
- `node` (`*.test.ts`, fake-indexeddb, `new CatalogDb(nome)`; o `CompressionStream` do Node 22 serve);
- `dom` (`*.test.tsx`).

Também há o E2E (`tv-web/e2e/run.mjs`), a **simulação no PC** (Playwright + CDP com 80 MiB, T004) e as sondas na TV
(`sonda-tv/`).

**Target Platform**: QN50Q60DAGXZD, Tizen 9 / Chromium 120, `file://`.
- 4 núcleos e 1,49 GB de RAM (~310 MB livres);
- heap JS de 364 MB;
- `JSON.parse` a 44 MB/s;
- `scheduler.postTask` sim, `scheduler.yield` não.

**Performance Goals** (sonda 2):
- SC-002: 1ª página ≤ hoje (~14 ms contra 178 ms);
- SC-003: nenhum quadro > 100 ms por compressão;
- SC-007: gravar o guia em ≤ 3 s (hoje 20 mil linhas levam 14,5 s).

**Constraints**:
- fachada `catalogRepository.ts` travada (063) e só ela importa `repository/` (`fachada.test.ts`);
- `categoryLoader.ts` está no teto de 378 linhas, `db.ts` no de 860 e `sourceRepository.ts` no de 400;
- contratos de outras features: 039, 055, 063 e 065 (janela sem `categoryBlocks.get`);
- descomprimir nunca dentro de uma transação aberta;
- `config.xml` do CCPlayTV sem privilégio novo.

**Scale/Scope**: lista real com ~55 mil itens e um guia de ~41 mil programas (10 mil na janela). Estresse: 300 mil filmes
(painel falso da 039).

## Decisões Invariantes

- **D-001**: Formato 2 = cabeçalho em `categoryBlocks`, sem `items`, mais pedaços de **500** itens gzip em
  `categoryChunks`, mais o índice de identidade comprimido no `chunk -1` (`logic/formato-comprimido.md` §2). Os
  registros lidos são **idênticos** aos de hoje: mesmos ids, ordem e campos.
- **D-002**: Comprimir e descomprimir **nunca** dentro de uma transação aberta. Gravar é em duas fases, com concorrência
  otimista pela `revision` do cabeçalho (§4).
- **D-003**: Onde a gravação já roda num Worker (seção, importação, guia), codifica no Worker. Na thread da interface,
  pedaço a pedaço, cedendo com `scheduler.postTask` (com `setTimeout(0)` de reserva). Nunca se mandam objetos entre
  threads.
- **D-004**: Os pedaços **substituem** a projeção 065. `readCategoryWindow` lê pedaços e continua sem chamar
  `categoryBlocks.get` (contrato da 065). As projeções antigas só são lidas até a conversão.
- **D-005**: O guia vai por canal, comprimido, em `epgChunks`. Não há conversão: a próxima sincronização grava no
  formato novo. A janela −12 h/+48 h não muda.
- **D-006**: O orçamento decide pela **conta própria** de bytes gravados. O `estimate()` é guarda de 1 candidato por
  chamada. A pré-carga e o guia nunca liberam categorias da lista ativa.
- **D-007**: Nunca se liberam: estado da pessoa, `eager`/`stored` (M3U), a categoria em uso, a categoria do item tocando,
  e as categorias da lista ativa com favoritos ou "Continuar assistindo". Liberada = nunca obtida, e os ids voltam iguais.
- **D-008**: O cache de itens descomprimidos é um LRU de pedaços com teto de **30 000 itens (~14 MiB)**. Medido:
  ~460 B de heap por item (`sonda-tv/medir-heap-itens.mjs`), contra os 364 MB de heap da TV. "Todos", a busca e os
  derivados iteram pedaços.
- **D-009**: Módulos novos ficam em `lib/catalog/` (`blockCodec.ts`, `storageLedger.ts`, `storageBudget.ts`,
  `blockChunks.ts`, …), importados direto. **Nunca** pela fachada nem de `repository/` fora dela. Os arquivos no teto
  ganham só chamadas; a lógica vai para fora.
- **D-010**: As sondas e a simulação ficam em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/` e
  `tv-web/scripts/bench/`. Elas **nunca** entram no app da loja. Cada instalação na TV exige aviso e autorização.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Sem efeito. A licença ganha espaço garantido (US3) |
| Segredos Fora dos Clientes e dos Logs | ⚠️ | ✅ | Os pedaços guardam o mesmo que os blocos já guardam (sem URL de provedor). A credencial continua só em `sources` (ADR-010). As sondas e amostras passam por `assertClean`, e o relatório leva só números. Não há exportação |
| Categorias da Fonte São Preservadas | ✅ | ✅ | `group` sai do item e vai para `shared` do bloco, sem renomear. A leitura devolve o mesmo valor |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Sem efeito |
| Comandos Locais Independem de Rede | ⚠️ | ✅ | Risco: descompressão na tela atrasar o foco. Mitigado: pedaços de ~13 ms, cedendo a vez, codificação no Worker (D-003), e SC-003 medido na TV |
| Trailers e Metadados Não Alteram o Estado | ✅ | ✅ | Liberar `titleMetadata` de lista inativa não toca `userStates` |
| Ação Essencial por Controle Remoto | ✅ | ✅ | Sem tela nova. Os painéis das sondas são navegáveis por D-pad |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Sem efeito |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | D-007 protege a categoria em uso, e a raiz invalida as consultas depois de liberar |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | Ids estáveis no formato novo e depois de liberar (D-001, D-007, contratos 3–5) |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | FR-007: `providerStreamId`/`identityKey`/`itemsSignature` intactos |
| Progresso e Capacidades São Reais | ⚠️ | ✅ | Linha de cobertura parcial (D-006 + `orcamento.md` §6). `ready` conta só o que está no disco |
| Documentação É Canônica | ✅ | ✅ | Absorção do bugfix, resultado do portão na avaliação, ideias no backlog e regra curta no CLAUDE.md |
| Restrição "Validação em hardware real" | ⚠️ | ✅ | **Gate elevado**: SC-001/002/003/004/007 na TV física, com autorização. O PC (simulação) é gate de comportamento |
| Fluxo: testes, E2E antes da TV, revisão de segredos | ✅ | ✅ | Vitest por task, E2E com a simulação antes da TV, revisão dos JSON das sondas |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/082-orcamento-armazenamento-tv/
├── spec.md, plan.md, tasks.md, handoff.md, data-model.md, quickstart.md, contract-tests.lock
├── logic/
│   ├── formato-comprimido.md   # pedaços, codec, gravar em 2 fases, ler, guia, conversão
│   ├── orcamento.md            # números, conta própria, planejador, makeRoomFor, uso recente, cobertura parcial
│   └── medicao-e-sonda.md      # ferramenta de sondas, simulação no PC, resultado do portão
├── evidencias/                 # medições já feitas (sondas 1 e 2, lista real no PC) + as que o execute fizer
└── sonda-tv/                   # app/ (sonda 1), app2/ (sonda 2), coletor.mjs, medir-lista-real.mjs, instalar-sonda.ps1
```

### Source Code (repository root)

```text
tv-web/src/lib/catalog/
├── blockCodec.ts                 # STUB: encode/decode de pedaços e índice (gzip, enxuto)
├── blockChunks.ts                # novo: readBlockChunks, writeCompressedBlock (2 fases), deleteCategoryItems
├── chunkTables.ts                # novo: acesso tipado a categoryChunks/epgChunks (db.ts no teto)
├── dbSchema.ts                   # versão 26 (tabelas novas)
├── db.ts                         # tipos: CategoryBlockRecord.format/…, items opcional, campos novos
├── categoryBlocks.ts             # writeBlockWithin → formato 2; blockRecords/blockRecord leem os dois formatos
├── categoryWindow.ts             # readCategoryWindow lê pedaços; prepare* passam a no-op/limpeza
├── blockMemo.ts                  # LRU de pedaços com teto
├── kindCursor.ts, catalogDerivedRows.ts, readProjection.ts
├── repository/{categoryItems,categoryReads,kindReads,stableIds,series,structureRefresh,generations}.ts
├── storageLedger.ts              # STUB: conta própria
├── storageBudget.ts              # STUB: planejador, makeRoomFor, touchCategory
├── storageBudget.orcamento-armazenamento.contract.test.ts   # TRAVADO (5)
├── storageRelief.ts              # R-005 + liberação normal pelo orçamento
├── categoryLoader.ts (teto 378), sectionLoader.ts, seriesLoader.ts, playbackUrl.ts, prefetch/index.ts
tv-web/src/lib/epg/{epgRepository.ts, epgSync.ts}   # guia por canal comprimido
tv-web/src/features/catalog/prefetchApi.ts          # touchSource + invalidação ao liberar
tv-web/src/features/home/homeStatusLine.ts + lib/i18n/messages/home.ts   # cobertura parcial
tv-web/scripts/bench/simular-cota-tv.mjs            # simulação de 80 MiB (gate no PC)
tv-web/e2e/orcamento-armazenamento.mjs              # E2E com a simulação
```

**Structure Decision**: tudo no frontend `tv-web/`. A lógica fica em `lib/catalog/` e `lib/epg/`, em módulos novos para
respeitar os tetos da catraca. A fiação de tela fica em `features/`. As ferramentas de medição ficam na pasta da feature
(as sondas) e em `scripts/bench/` (a simulação). `api/`, `portal-web/` e `CCPlayTv/config.xml` não mudam.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Gravar em 2 fases com concorrência otimista (`revision`) | Descomprimir dentro da transação a encerra (Dexie), e reaproveitar ids exige ler o índice antigo | Índice sem compressão no cabeçalho: ~300 KB por categoria grande (≈ o tamanho dos próprios pedaços). Dexie middleware que descomprime: quebra as transações `rw` |
| Conta própria de bytes além do `estimate()` | Medido: `clear()` não devolve espaço na hora, e o jsdom não tem `estimate()` | Só `estimate()`: liberaria em cascata ou ficaria intestável |
| Ferramenta de sondas, um app separado instalado na TV | Só a TV mede a cota, a compressão real e a CPU/memória. O usuário pediu medir em vez de supor | Supor pelo PC: o PC comprime e é 10× mais rápido, e induziu erro na avaliação |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → simulação no PC + E2E → TV (gate dos números, sempre com autorização).

Comandos-base:

```powershell
cd tv-web
npx vitest run <arquivo>
npm run test
npx tsc -b
npm run lint                     # oxlint + catraca
npm run build
npm run test:e2e                 # com npm run dev no ar
node scripts/bench/simular-cota-tv.mjs   # T004: gate de comportamento com 80 MiB
powershell -NoProfile -File ..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tv-web/src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts`
(5 testes)

Comando: `cd tv-web; npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `libera na ordem do orçamento, pula o protegido e para quando cabe; pré-carga não toca a lista ativa` | FR-010, FR-011, FR-012, US4-AC2, D-006 | Fase 5 | `Error: not implemented` |
| `uso informado atrasado libera no máximo um candidato; dentro do teto e do limite, nada` | FR-009, R-002 (medido), D-006 | Fase 5 | `Error: not implemented` |
| `grava a categoria comprimida e lê igual pela lista e pela janela` | FR-001, FR-002, FR-006, US1-AC1/AC2, D-001, D-004 | Fase 3 | `Error: not implemented` (`categoryStoredBytes`) |
| `entrada no teto libera a categoria menos usada da lista ativa, grava a nova e mantém os favoritos` | US5-AC1, FR-010, FR-012 | Fase 6 | `Error: not implemented` (`categoryStoredBytes`) |
| `categoria liberada e obtida de novo mantém os mesmos ids dos itens` | Constitution: Voltar Restaura Foco; Identidade; D-007 | Fase 6 | `Error: not implemented` |

Stubs criados pelo plan (não travados):
- `blockCodec.ts` (`BLOCK_CHUNK_ITEMS = 500`, `encodeBlockChunks`, `decodeBlockChunk`);
- `storageLedger.ts` (`categoryStoredBytes`, `catalogLedger`);
- `storageBudget.ts`: o planejador, `makeRoomFor` e `touchCategory` são stubs; reserva, teto e `PIN_WINDOW_MS` estão
  implementados; `BudgetOptions` contém só `capBytes`;
- `categoryLoader.ts`: `EnsureCategoryOptions extends BudgetOptions`, ainda sem efeito.

**Fora do contrato**: os números da TV (SC-001/002/003/004/007) vão para a TV física com as sondas e o painel. O guia
comprimido e a conversão ficam em testes de fase.

## Estado Atual

| Área | Estado |
| --- | --- |
| Status | **Implementada** (2026-10-19), com SC-002/003/004/007 na TV adiados por decisão do usuário (R-021) |
| Código | Formato comprimido como gravação única, conversão, guia por canal, orçamento completo, recuperação do banco cheio, painel de medição |
| Testes | `npm run test` 3 601; contrato 5/5 e trava íntegra; `npm run test:e2e` 54/54; build ok |
| TV | SC-001 aprovado (97 → 16 MB); a TV está com o **pacote de medição** instalado |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A suposição "URL derivada economiza" era falsa (o Xtream já monta a URL na hora) | — | Resolvido: a economia vem da compressão e do fim da projeção 065 (medido) |
| R-002 | `estimate()` atrasado depois de apagar | Liberação em cascata | Resolvido por medição: `clear()` não devolve espaço na TV → conta própria (D-006) + guarda de 1 candidato (contrato 2) |
| R-003 | Constantes do formato antigo (`LEGACY_ITEM_BYTES` 320 B, `LEGACY_EPG_ROW_BYTES` 700 B) | Conta errada até converter | Medidas na TV (sonda 2). Recalibrar se a medição final divergir |
| R-004 | Instalar a sonda exigir desinstalar | Perder dados | Resolvido: as sondas são **apps separados**, sem tocar o CCPlayTV |
| R-005 | `releaseSourceCategories` (`storageRelief.ts:65`) libera `stored` | O M3U perde categorias sem volta | T020: só `on_demand`, com teste |
| R-006 | Liberar a categoria aberta ou a do player | Tela vazia | D-007 (proteção por uso, reprodução, favoritos e "Continuar assistindo") + invalidação |
| R-007 | O formato antigo coexiste até converter (leitores com fallback) | Dois caminhos de leitura | Conversão priorizada pela lista ativa e pelas categorias grandes. Testes dos dois formatos |
| R-008 | Arquivos no teto da catraca (`categoryLoader` 378, `db.ts` 860, `sourceRepository` 400) | Lint reprova | D-009: lógica em módulos novos. T002 extrai helpers do `categoryLoader` antes |
| R-009 | Favoritos e "Continuar assistindo" somem do Início se a categoria for liberada (achado A-01 do 1º Analyze) | UX ruim | Resolvido no desenho: essas categorias são `pinned` (D-007, `orcamento.md` §4) |
| R-010 | Descomprimir na thread da interface atrasar o foco | Constitution | Pedaços de ~13 ms, cedendo a vez. SC-003 medido na TV com o painel de medição |
| R-011 | 13 leitores leem bloco direto, alguns dentro de transação | Erro de transação inativa ou leitura errada | T010: inventário + migração para `readBlockChunks`, com a regra "decodificar depois da transação" (`formato-comprimido.md` §5) |
| R-012 | Versão 26 do Dexie numa TV com dados | Abertura do banco | Só tabelas novas, sem `.upgrade()` (padrão da 066/069) |
| R-013 | **Medido na TV**: uma transação com muitas gravações (lote de 2 000 linhas de guia) foi abortada com `TimeoutError: Transaction timed out due to inactivity` | Gravação perdida no meio | Gravar em lotes pequenos (≤ 500 linhas) ou em poucos registros comprimidos. O formato novo do guia são 104 registros por lista, gravados em ~110 ms. Conversões e liberações: uma categoria por transação |
| R-014 | B-05 (SC-007, guia ≤ 3 s) | — | Resolvido por medição na TV: o guia real (10 122 programas, 104 canais) comprimido por canal no Worker é gravado em **1,01 s** (hoje 10,2 s), com a tela a 60 fps. A T050 só confirma com o app real |
| R-015 | Revisão 2026-10-19: tasks marcadas `[X]` sem o código fazer o pedido (gravação dupla, projeção 065 reconstruída dos pedaços, conversão T014 inexistente, guia em dois formatos, candidatos/proteção do orçamento ausentes) | SC-001 reprovado na TV (97 MiB) | Resolvido: T054–T064. Regra: fechar task só com teste que falharia sem ela |
| R-016 | `Storage.overrideQuotaForOrigin` não vale em contexto efêmero do Chromium (informa a cota do disco) | E2E/simulação "com 80 MiB" sem cota nenhuma | Resolvido: contexto persistente + `--disable-features=StaticStorageQuota`; o E2E confere a cota antes de seguir |
| R-017 | `publishGeneration`/`collectStaleGenerations` apagavam a geração errada dos pedaços | Conteúdo novo sumindo ou pedaços antigos vazando | Resolvido (T058), com teste |
| R-018 | Pedaços gravados pela versão de 2026-10-18 já estão na TV (sem `revision` por pedaço, `shared` pelo 1º item) | Leitura de grupo misto | Decodificação preenche do `shared` só o ausente (compatível); `readIdentityIndex` ignora índice sem `revision` e cai na varredura; a próxima renovação regrava no formato novo |
| R-019 | Banco acima da cota no formato antigo (a TV de 2026-10-18): toda gravação falha e só remoção passa; liberar, converter e regravar o guia não andavam e a pré-carga parava com o housekeeping | App preso cheio para sempre | Resolvido no PC (T066–T068, E2E `orcamento-armazenamento-migracao`): remoção separada do carimbo, órfãs reparadas depois, guia antigo sai primeiro, `storage_full` não para enquanto há limpeza. Na TV o espaço apagado demora a voltar (R-002): confirmar na T050 |
| R-020 | Flake `carrosseis-filmes-series` ("Maximum update depth" na pilha de 302 categorias) em 2 de 4 rodadas completas do E2E em 2026-10-19 | Gate E2E não fica verde | Resolvido (usuário pediu investigar): pré-existente (falha igual com o código anterior à 082, `E2E_CPU=4`); causa em `useOverflowEdges` (setState de mesmo valor a cada render). Bug `vitrine-filmes-estoura-maximum-update-depth`, verificado: 54/54 duas vezes |
| R-021 | Decisão do usuário (2026-10-19): fechar a 082 sem as medidas de velocidade na TV | SC-002 (1ª página), SC-003 (quadros > 100 ms em segundo plano), SC-004 (3 listas + Atualizar da licença) e SC-007 (guia no app real) sem número nesta versão | Aceito pelo usuário. Base: SC-001 aprovado na TV (16/80 MB), recuperação do banco cheio confirmada, PC com CPU 4× (1ª página 309 ms; entrada 581/762 ms), sonda de 2026-10-18 (guia 1,07 s no Worker, 0 quadros longos). Painel corrigido (T069) e pacote de medição instalado: medir quando possível |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-18 | Medição prévia (plan) | Sonda 1: cota de 80 MiB fixa; nenhuma alavanca; outras APIs na mesma cota; `wgt-private` fora da cota mas lento. Sonda 2: ambiente, CPU, gzip em pedaços (6,5× na TV; 1º pedaço 13,8 ms), Worker sem travar, 20 mil linhas em 14,5 s, foco a 38 fps, heap de 364 MB. Lista real no PC: ~44 MB hoje contra ~3,3 MB comprimida | Executar a Fase 1 |

| 2026-10-18 | Pendências do Analyze (plan) | B-01: T010 dividida em T010a–l. B-02: heap por item medido (~460 B) → teto do cache em 30 000 itens (~14 MiB). B-03: nota R-023 no plano da 065. B-04: usuário confirmou comprimir também os blocos M3U. B-05: guia medido na TV, 1,01 s no Worker contra 10,2 s hoje (R-014); a 1ª rodada revelou o timeout de transação grande (R-013). 4 features registradas no backlog | Executar a Fase 1 |
| 2026-10-18 | Fase 1 / Setup | T001–T003 confirmadas; T004 criou a simulação Playwright com quota CDP e relatório numérico. Lint, tsc e sintaxe passaram; contrato segue vermelho apenas nos stubs | Baseline T004 bloqueado pelo revisor automático por uso de credenciais reais |
| 2026-10-18 | Fase 1 / Setup | Baseline T004 executada com lista real: cota 83.886.080 bytes, uso 7.933.418 bytes, sem erros de quota; 104 categorias e 9.897 linhas de guia observadas | Iniciar Fase 2 (codec e pedaços) |
| 2026-10-18 | Fase 2 / Foundational | T005–T009 concluídas: gzip enxuto, índice de identidade, leitura/gravação por pedaços, revisão otimista, remoção e ledger; 29 testes específicos verdes | Integrar leitores na Fase 3 |
| 2026-10-18 | Fase 3 / US1 | T010a/T010b, T011 e T012 integradas; contrato 082 passou 5/5, incluindo gravação comprimida, janela e orçamento de entrada | Migrar leitores restantes T010c–T010l |
| 2026-10-18 | Fase 3 / US1 | T010c/T010d migradas para leitura por pedaços em identidades e séries; contrato continua 5/5 | Migrar T010e (kindReads) |
| 2026-10-18 | Fase 3 / US1 | T010e migrada: listagem total, cursor, páginas e campos de ordenação leem formato 2 por pedaços; contrato 5/5 e tsc verdes | Migrar T010f (kindCursor) |
| 2026-10-18 | Fase 3 / US1 | T010f migrada: cursor de “Todos” lê categoria formato 2 por pedaços e mantém fallback legado; contrato 5/5 e tsc verdes | Migrar T010g (catalogDerivedRows) |
| 2026-10-18 | Fase 3 / US1 | T010g migrada: fileiras derivadas iteram categorias formato 2 por pedaços; contrato 5/5 e tsc verdes | Migrar T010h/T010i |
| 2026-10-18 | Fase 3 / US1 | T010h/T010j concluídas: atualização estrutural remove pedaços, e a janela lê formato 2 com fallback legado; contrato permanece íntegro | Migrar T010k/T010l |
| 2026-10-18 | Fase 3 / US1 | T010k/T010l concluídas: helper de testes e alívio de armazenamento usam leitura/remoção de pedaços; contrato 5/5 e tsc verdes | Implementar T013 (LRU por pedaços) |
| 2026-10-18 | Fase 3 / US1 | T013 concluída: cache LRU de pedaços por revisão com teto de 30.000 itens; codec, pedaços e contrato verdes | Implementar T014 (conversão em housekeeping) |
| 2026-10-18 | Fase 3 / US1 | T014/T015 confirmadas: housekeeping converte uma categoria por chamada e sectionLoader usa `renewCategoryItems`, que grava formato 2 sem ceder dentro do Worker; tsc e contrato verdes | Criar T016/T017 e validar travas T018 |
| 2026-10-18 | Fase 3 / US1 | T016/T017 concluídas: teste dedicado de equivalência formato 2 e suíte de conversão retomável verdes (23/23); simulação pós-formato interrompida por duração excessiva | Validar contratos T018 e repetir T019 com timeout controlado |
| 2026-10-18 | Fase 3 / US1 | T018 concluída: contratos 039, 055, 063, 065 e 066 verdes após corrigir renovação idêntica, carimbo de episódios e projeção sem `categoryBlocks.get`; T019 segue pendente | Reexecutar simulação pós-formato com timeout controlado |
| 2026-10-18 | Fase 4 / US1 | T020–T022 implementadas: EPG agrupado, comprimido por canal em `epgChunks`, leitura com filtro temporal e limpeza dos dois formatos; `tsc` verde | Criar T023/T024; T019 ainda pendente |
| 2026-10-18 | Fase 4 / US1 | T023/T024 validadas pela suíte existente de EPG e Live: 46 arquivos, 300 testes verdes; corrigido fallback de `Blob.stream` no jsdom e transação de limpeza do EPG | Próxima Fase 5; T019 permanece pendente |
| 2026-10-18 | Fase 3 / US1 | T019 resolvida: simulação pós-formato executada com cota de 80 MiB, uso 4.558.612 bytes, sem erro de quota; comparação baseline 7.933.418 → 4.558.612 bytes (~42,5% do baseline) registrada nas evidências | Fase 3 concluída; seguir Fase 5 |
| 2026-10-18 | Fase 5 / US3 | T025–T028 e T030 implementadas: candidatos, planejador, `makeRoomFor`, toque recente e remoção normal por pedaços; contrato `planStorageRelease` 2/2 e tsc verdes | T029, T031 e T032 pendentes |
| 2026-10-18 | Fase 5 / US3 | T029/T031/T032 concluídas: gravadores de pré-carga/EPG respeitam `prefetch`, ledger e proteção/liberação têm cobertura; 21/21 testes verdes | Iniciar Fase 6 (T033) |
| 2026-10-18 | Fase 6 / US5 | T033/T034/T036/T037 implementadas: toque recente, orçamento na entrada, invalidação agrupada e cobertura parcial pt/en/es; 13 testes focados verdes e tsc verde | T035 e testes T038–T040 pendentes |
| 2026-10-18 | Fase 6 / US5 | T035/T038–T040 concluídas: séries e playback marcam uso, categorias recentes ficam protegidas, linha parcial e assinatura de invalidação testadas; 7/7 testes focados verdes | Iniciar Fase 7 (T041) |
| 2026-10-18 | Fase 7 / US2 | T041 implementada: PerfOverlay mede quadros acima de 100 ms e mostra primeira página via `firstPaint`; tsc e teste focado verdes | T042: simulação com CPU 4× e registro dos números |
| 2026-10-18 | Fase 7 / US2 | T042 concluída: simulação pós-formato com CPU 4× registrou entrada movies 669 ms e series 528 ms, sem erro de quota; evidência pós-formato atualizada | Seguir Fase 8 (T043) |
| 2026-10-18 | Fase 8 / US4 | T043/T044 concluídas: `lastActivatedAt`, proteção da ativa e teste com múltiplas listas; 6/6 testes verdes | Iniciar Fase 9 (T045) |
| 2026-10-18 | Fase 9 / US6 | T045/T046 concluídas: documentação das sondas e resultado do portão híbrido (descartado por desempenho) registrados | Iniciar Polish T048–T053 |
| 2026-10-18 | Polish | T051–T053 concluídas: bugfix absorvido, regra curta no CLAUDE e revisão de configuração/evidências sem novos privilégios; T048/T049 e gate físico T050 permanecem | Criar/rodar E2E de orçamento e executar gate físico com autorização |
| 2026-10-18 | Polish | T048/T049 preparados: smoke fixture registrado, regra STO-01 adicionada à legibilidade e sintaxe validada; execução da simulação e suíte E2E completa ainda pendentes | T048/T049 precisam de servidor dev e execução completa; T050 continua pendente |
| 2026-10-18 | Polish | T048 validada com quota CDP de 80 MiB (`orcamento-armazenamento`: passou); T049 executada na suíte completa, mas falhou em `epg-guia-completo` e `catalogo-em-blocos` por fixtures antigas acessando `block.items`/guia sem grade | Corrigir os dois E2E antes de marcar T049; T050 continua pendente |
| 2026-10-18 | Polish | Bugs `epg-guia-completo-no-renderiza-grade` e `fixture-antiga-catlogo-blocos-acessa-blockitems` verificados; os dois E2E corrigidos passaram isoladamente. A injeção de quota do teste de conexão foi ajustada para a instância efetiva do IndexedDB e a suíte completa passou 53/53 | T049 concluída; T050 continua pendente |
| 2026-10-18 | T050 | Preflight sdb aprovado; pacotes normal e de medição instalados com o mesmo certificado. Sondas autorizadas confirmaram cota 80 MiB, bloqueio IndexedDB em 82,9 MiB, EPG Worker 1,071 s e 0 quadros longos; usuário observou 97 MiB no app e fluxos sem erros | SC-001 reprovado (97/80 MiB) e SC-002 ainda sem `primeiraPágina` da categoria real; manter T050 pendente |
| 2026-10-18 | T050 | Lacuna corrigida em `makeRoomFor`: o planejador agora recebe `navigator.storage.estimate()` e libera cache refazível quando o uso físico passa da reserva, mesmo com ledger lógico baixo; teste de regressão verde e pacote normal reinstalado na TV sem limpar dados | Repetir entrada em categorias/listas para confirmar a redução observada; T050 continua pendente até nova leitura |
| 2026-10-18 | T050 | Corrigido o caminho de “Minha Lista”: `userStateRepository.upsert` passou a envolver favoritos/progresso em `withStorageRelief`, liberando cache refazível e repetindo a gravação após `QuotaExceededError`; regressão verde (44 testes de favoritos/estado), lint/tsc verdes e pacote normal reinstalado com o mesmo certificado | Repetir adicionar um filme à Minha Lista na TV e registrar se o favorito persiste; T050 continua pendente |
| 2026-10-19 | Revisão + correção das lacunas | Revisão achou o formato 2 gravado **junto** com o antigo e a projeção 065, conversão ausente, guia duplicado e vazando por geração, `publishGeneration` apagando os pedaços da geração publicada, orçamento sem `temporary`/`inactive-list`/proteção de favoritos, grade sem janela no formato 2, E2E sem cota real e 7 testes vermelhos. Corrigido em T054–T064; unitários 3 596 verdes, contrato 5/5, lint ok, E2E da 082 ok | Suíte E2E completa e T050 na TV com autorização |
| 2026-10-19 | Ensaio antes da TV | Simulação com lista real refeita esperando a pré-carga: 104/104 categorias, 5,9 MB de 80 MiB (7,4 %), conta 3,98 MB, guia 0,45 MB. E2E novo do banco cheio no formato antigo achou e o código corrigiu o impasse acima da cota (R-019). Unitários 3 601, lint ok, build ok; E2E 53/54 com flake aberto (R-020) | Decidir o flake; T050 com autorização |
| 2026-10-19 | Flake da vitrine (R-020) | Investigado a pedido: reproduz sempre com CPU 4× e também no código anterior à 082; causa em `useOverflowEdges`. Corrigido via bug `vitrine-filmes-estoura-maximum-update-depth`; suíte E2E 54/54 duas vezes, unitários 3 601, build ok | T050 com autorização |
| 2026-10-19 | T050 (TV, pacote normal) | Instalado sem desinstalar. Armazenamento 97 → 63 → 43 → 16 MB (20 %): SC-001 aprovado; recuperação do banco cheio (R-019) confirmada na TV; Minha Lista grava; categorias e guia abrem | SC-002/SC-003 com o pacote de medição; SC-004, SC-007 |
| 2026-10-19 | T050 (pacote de medição) | Painel não media a janela (T056) nem a leitura da pré-busca por foco; contador de quadros misturava navegação. Corrigido (T069) e reinstalado; medição pausada a pedido do usuário | Medir SC-002/SC-003 com o pacote já instalado |
| 2026-10-19 | Fechamento | Gates repetidos (3 601 unitários, 54/54 E2E depois de trocar uma espera fixa do `fontes-estado`). Usuário decidiu fechar sem SC-002/003/004/007 na TV (R-021); status Implementada | Medir SC-002/003 com o pacote já instalado; voltar ao pacote normal |

**PRÓXIMO**: feature fechada (R-021). Pendente fora do gate: medir SC-002/SC-003/SC-004/SC-007 na TV com o pacote de medição já instalado e então reinstalar o pacote normal (avisando). Antes: T050 — SC-001 aprovado; pacote de medição (com T069) JÁ INSTALADO na TV — medir SC-002 (`primeiraPágina` + linha `:foco`) e SC-003 (`parado>100ms` com a lista aberta), depois voltar ao pacote normal; SC-004 (3 listas + Atualizar da licença) e SC-007.

## Arquivos Principais

- `tv-web/src/lib/catalog/{blockCodec,blockChunks,blockWrite,blockConversion}.ts` — formato 2 (ler, gravar, converter)
- `tv-web/src/lib/catalog/{storageLedger,storageRelease,storageBudget,storageRelief}.ts` — orçamento
- `tv-web/src/lib/epg/epgChunkStore.ts` — guia comprimido por canal
- `tv-web/src/lib/catalog/categoryWindow.ts` — janela pelos pedaços; projeção 065 só é apagada
- `tv-web/e2e/orcamento-armazenamento.mjs` — E2E com cota reduzida de verdade
- `tv-web/src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts` (travado)

## Cuidados para Retomada

- As sondas instalam **apps separados** (`ccpSonda82.CotaProbe`, `ccpSondaV2.Capacidades`). Os dois já foram
  desinstalados. Para medir de novo, peça autorização e use `sonda-tv/instalar-sonda.ps1`.
- Cota simulada no PC só vale em `launchPersistentContext` com `--disable-features=StaticStorageQuota`; confira com
  `navigator.storage.estimate()` antes de medir (R-016).
- Itens de categoria só se gravam por `writeCompressedBlock`/`prepareBlockWrite`+`commitBlockWrite` (`blockWrite.ts`);
  nunca `categoryBlocks.put` com `items`, nunca projeção 065 nova.
- O Chrome do PC bloqueia o coletor em `127.0.0.1` por Local Network Access. No ensaio no PC, sirva tudo na mesma origem
  (`page.route`), como no ensaio feito.
