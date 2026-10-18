# Implementation Plan: Otimização de carga, consultas externas, memória e abertura do app

**Slug**: 065-otimizacao-carga-consultas-memoria | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

## Summary

Acelerar as telas e a abertura, encerrar/reaproveitar consultas externas corretamente e limitar dados temporários, mantendo conteúdo, seleção, ordem e navegação. Entregar em cinco stories independentes depois de uma baseline reproduzível: transporte/cache externos; seleção cooperativa e atualização por tipo; projeções paginadas e memória; resumos por série; carregamento local por rota e splash por prontidão.

A spec não foi reescrita. Os percentuais são metas de aceite, não resultados alcançados. TV é recomendada, não gate. O plan criou somente contratos/stubs preparatórios, sem ligar as otimizações ao produto.

## Technical Context

**Language/Version**: TypeScript ~6.0.2, React ^19.2.8, ESM; Node/npm somente ferramentas. Conferido em tv-web/package.json e vite.config.ts.

**Primary Dependencies**: Vite ^8.3.0, Dexie ^4.4.6, TanStack Query ^5.102.8 e Virtual ^3.14.13; nenhuma nova dependência de produção proposta.

**Storage**: IndexedDB/CatalogDb versão 17 na exploração; blocos por categoria e fallback legado; episódios em linhas e estados por stableId. Próxima versão acrescenta somente projeções/resumos reconstruíveis, conforme data-model.md.

**Testing**: Vitest ^5.0.0 (node com fake-indexeddb e dom/jsdom), Testing Library e Playwright ^1.63.0. Cinco contratos em quatro arquivos, vermelhos e travados. 73 testes existentes selecionados passaram; npx tsc -b --pretty false e npm run lint passaram, com avisos preexistentes no lint.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 9.0/Chromium 120 medido, origem file://; build JS/CSS chrome108 e base ./ preservados. Navegador de benchmark é proxy controlado, não simulador fiel da TV.

**Performance Goals**: SC-002 carga Filmes ≥30%; SC-003 tarefa longa/seleção ≥50%; SC-004 atualizações ≥50%; SC-005 heap ≥20%; SC-007 categoria grande ≥30%; SC-011 abertura ≥30%; SC-012 JS inicial ≥25%, com limites de regressão/equivalência da spec. Aferir frio/quente, sem/com integração e ciclos prolongados.

**Constraints**: client-first; Direct Play intacto; nenhuma consulta por foco; RETURN por id; categorias reais; segredos restritos ao aparelho/serviço próprio; fontes locais e recursos inventariados. Novos módulos ≤300 linhas; não ampliar tetos herdados da feature 063, não criar lib→features ou catalog→player. Extrair hooks para módulos de responsabilidade definida com fachada compatível.

**Scale/Scope**: 43.000 filmes/10.000 séries/134 categorias, 20%/100% elegíveis, categoria de 30.000, 100.000 episódios, 1.000 favoritos/5.000 históricos e três listas. Catálogo parcial/legado permanece suportado.

**Exploração**: prefetchApi invalida todos os tipos; catálogo lê bloco completo antes de slice; vitrine compartilha índice com registros completos; histórico tem gcTime Infinity; resumo lê listAllEpisodes; descoberta ignora rejeições nas páginas 2..8; tmdbGet não tem prazo; App importa todas as telas; splash tem timer de 2.600 ms. Custo de criação das projeções e importação é risco real. ADRs 001/002/005/006 e 007/008/009/010/011 orientaram o desenho, respeitando emendas client-first/foco/V14; não há nova decisão arquitetural fundamental.

## Decisões Invariantes

- **D-001**: Identidade, ordem, conteúdo e contratos vigentes são preservados; corrigir 429 parcial e espera fixa são mudanças deliberadas da spec, não referência de equivalência ao erro antigo.
- **D-002**: Medir baseline antes de implementar. Mesmos dados/relógio/build/ambiente, sete execuções, sem concorrência. Não usar os três runs exploratórios como gate nem omitir migração/Worker do relatório.
- **D-003**: Timeout de 10 s abrange rede e corpo; consumidores compartilham por contexto opaco e leases. Remover/cancelar tentativa libera nova tentativa, sem cancelar outro consumidor ativo.
- **D-004**: Descoberta publica apenas conjunto completo; manter oito páginas/quatro por lote e último cache válido. 429 para novos lotes; Retry-After válido prevalece e fallback vigente é 10 minutos. Sucesso concorrente não apaga pausa.
- **D-005**: Vitrines retêm resultados pequenos; varredura em partes substitui materialização de todo o tipo. Seleção exata usa deduplicação global e top-K estável, com cooperatividade e ganho de CPU medido.
- **D-006**: Eventos são agrupados por fonte/tipo/categoria; delta/invalidação não relê tipo/lista não afetado. Geração só muda por mudança real do catálogo.
- **D-007**: categoryBlocks/linhas permanecem canônicos; projeção compacta adicional resolve janela sem desserializar bloco inteiro. Conversão é incremental e reconstruível; quota não apaga o catálogo nem userStates.
- **D-008**: Limites de retenção do data-model são explícitos e não limitam conteúdo. Janela mantém índices lógicos/cursores e id/scroll para recarga/RETURN; maxPages isolado é insuficiente.
- **D-009**: Resumo usa o helper vigente e membros por série com índice reverso por stableId; alteração de um episódio não varre outras séries nem consulta rede.
- **D-010**: Abertura continua splash → perfis; fonte única e última lista focada. Não pular perfis. Prontidão local independe de TMDB/EPG/prefetch completo; falha/carregamento têm SELECT/RETURN funcionais.
- **D-011**: Code splitting é local, com nomes/caminhos estáveis e todo arquivo no YAML. Nenhuma CDN, biblioteca de foco, relaxamento de CORS/CSP ou demuxer no build.
- **D-012**: Contratos da 065 e travas de outras features não são editados pelo executor. Stubs são pontos de implementação, não testes a escrever nem funcionalidade entregue.
- **D-013**: Metas inviáveis exigem evidência e revisão explícita da spec. Aceite automático/funcional não equivale a comprovação de RAM/AVPlay/desempenho físico.

## Constitution Check

Gate pré-design passou antes de definir projeções/leases/rotas; gate pós-design passou para o desenho documentado. Uma linha por princípio real da constitution 1.7.0:

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | PASS | PASS | Interface/perfis locais; impedimento de lista vencida/recusada permanece, sem apagar estado |
| Segredos Fora dos Clientes e dos Logs | PASS | PASS | Projeção exclui URLs/headers; revisões opacas; erros fixos; fixtures sintéticas |
| Categorias da Fonte São Preservadas | PASS | PASS | Categoria/posição de fonte não substituídas por gêneros |
| IA e Classificação Nunca Inventam Dados | PASS | PASS | Sem nova classificação; cache incompleto não é válido nem informação inventada |
| Comandos Locais Independem de Rede, Backend ou IA | PASS | PASS | Seleção cooperativa, fallback local e navegação independente de metadata |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | PASS | PASS | Transporte/cache não escrevem progresso; resumos leem estado real |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | PASS | PASS | Fronteira de rota e paginação com SELECT/RETURN; nenhum gesto removido |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | PASS | PASS | Parser/classificação intactos; projeção usa catálogo já classificado |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | Estados focáveis/ativáveis; foco não dispara consultas/prefetch de API |
| Voltar Restaura Foco e Posição | PASS | PASS | Id lógico e scroll preservados ao descartar/recarregar janelas |
| Identidade de Reprodução Não Depende da URL | PASS | PASS | blockItemId/buildStableId inalterados, membros por stableId |
| Progresso e Capacidades São Reais, Nunca Prometidos | PASS | PASS | Cobertura/erros verdadeiros; benchmark não afirma memória física |
| Documentação do Repositório É Canônica | PASS | PASS | Caminhos/gates/contratos e handoff; estado é Planejada, não Implementada |

Restrições e fluxo: chrome108, client-first, V14/ADR-011, licenças/atribuição e Direct Play preservados; checks por tarefa, E2E antes de hardware e revisão de segredos no Polish. Nenhuma violação não justificada; TV recomendada está alinhada ao padrão da constitution e à escolha explícita do usuário. Spec V14 §19/40/41, Lab feedback/errorstax, exemplo profiles e guia 12 foram consultados; §36 obsoleta não orienta código.

## Project Structure

### Documentation (this feature)

~~~text
sdd/specs/065-otimizacao-carga-consultas-memoria/
  spec.md
  plan.md
  tasks.md
  research.md
  data-model.md
  contracts/client.md
  logic/consultas.md
  logic/catalogo.md
  logic/abertura-benchmark.md
  quickstart.md
  contract-tests.lock
  handoff.md
~~~

### Source Code (repository root)

~~~text
tv-web/
  src/
    App.tsx, main.tsx
    navigation/                         # redutor existente; routeModules proposto
    components/                         # Spinner/ErrorState; RouteBoundary proposto
    features/
      catalog/                          # catalogApi/prefetchApi; hooks extraídos propostos
      vod/                              # ratedSelection e novo stub ratedSelectionAsync
      splash/                           # SplashScreen
      profiles/                         # ProfilesScreen
      home/, movies/, series/, live/    # consumidores mantidos
    lib/
      catalog/
        db.ts, catalogRepository.ts, categoryBlocks.ts, blockMemo.ts
        repository/                     # módulos da 063; stub categoryWindow novo
        prefetch/                       # scheduler e carga por seção
      metadata/                         # tmdbConnector/Discovery/KeyRepository/titleMetadata
  scripts/
    bench/                              # runners do review; novos runners pareados propostos
    architecture.mjs, tizenFiles.mjs, sync-tizen.mjs
  bench-results/
  e2e/
  vite.config.ts
CCPlayTv/
  config.xml, index.html, assets/, tizen_web_project.yaml
.planning/
  memory/constitution.md, backlog.md, scripts/powershell/
~~~

**Structure Decision**: somente frontend/client e pacote local. api/ continua fallback congelado e não é pré-requisito. Caminhos novos estão identificados nas tasks; árvore acima combina diretórios existentes e arquivos propostos nomeados, não afirma que implementação existe.

## Complexity Tracking

Sem violações da constitution; tabela vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Design & Coverage

research.md registra alternativas e incertezas; data-model.md define projeções/resumos/limites; contracts/client.md fixa APIs; logic delimita prazo/leases, seleção/delta/janela e abertura/medição.

| Requisitos/aceite | Tasks principais |
| --- | --- |
| FR-001–FR-003; SC-001 | T003, T013, T015, T019, T023, T034, T043, T046 |
| FR-004–FR-007; SC-002–SC-004 | T015–T022 |
| FR-008–FR-014; SC-008–SC-009 | T006–T014 |
| FR-015–FR-018; SC-005–SC-007 | T023–T032 |
| FR-019–FR-020; SC-010 | T033–T037 |
| FR-021–FR-024; SC-011–SC-012 | T038–T044 |
| FR-025–FR-026; SC-013 | T001–T005, T045–T048 e Checklist de Release |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual. Contratos são definição pequena de comportamento, não prova de percentuais. Benchmarks separados provam as metas. Durante fases, rodar unitários e contratos daquela fase: os contratos de fases futuras permanecem vermelhos intencionalmente; suíte completa é gate final.

Comandos-base, de tv-web/:

~~~powershell
npm run lint
npx tsc -b --pretty false
npm run test
npm run build
npm run dev
npm run test:e2e
npm run build:tizen
~~~

O dev server fica em processo separado, disponível para E2E; evitar benchmarks concorrentes. build:tizen sincroniza arquivos e exige revisão do YAML; não instala a TV. Nenhum desses comandos indica resultado futuro já aprovado. Nesta sessão: type-check e lint/catraca PASS (avisos preexistentes no lint), 73/73 testes da área PASS; os contratos 065 estão vermelhos pelo motivo correto, sem erros de import/sintaxe/tipo.

### Testes de Contrato

Arquivos abaixo estão travados em contract-tests.lock (5/5):

| Arquivo relativo a tv-web/ | Casos | Fase | Origem / vermelho confirmado |
| --- | --- | --- | --- |
| src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts | 2 | 2/US1 | FR-008/014: outcome undefined após 10 s; FR-009–013: parcial stale=false substitui cache e continua lote |
| src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts | 1 | 3/US2 | FR-004/005: queryFn de séries chamado 1 vez por evento movie |
| src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts | 1 | 3/US2 | FR-001/006: Error: not implemented |
| src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts | 1 | 4/US3 | FR-016/018: Error: not implemented |

Nomes integrais e uma falha esperada por caso:

- Fase 2: `FR-008/FR-014 US1-AC3: prazo inclui rede e corpo, erro é sanitizado e próxima consulta funciona` → outcome permanece undefined após 10 s.
- Fase 2: `FR-009–FR-013 US1-AC1/2: 429 parcial preserva cache, pausa novos lotes e sucesso concorrente não remove pausa` → retorno parcial apresenta stale=false.
- Fase 3: `FR-004/FR-005 US2-AC2: conclusão de filmes atualiza filmes sem reler séries ou outra lista` → queryFn de séries chamado uma vez por evento movie.
- Fase 3: `FR-001/FR-006 US2-AC1: seleção cooperativa mantém desempates, pool, ordem e escolha diária` → Error: not implemented.
- Fase 4: `FR-016/FR-018 US3-AC1: janela preparada mantém ids/ordem sem ler bloco completo e alcança o fim` → Error: not implemented.

Comando exato (tv-web/):

~~~powershell
npm run test -- src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

Integridade (raiz):

~~~powershell
& ./.planning/scripts/powershell/check-contract-tests.ps1 -Slug '065-otimizacao-carga-consultas-memoria' -Json
~~~

Stubs não travados: ratedSelectionAsync.ts e repository/categoryWindow.ts (throw not implemented); prefetchApi.ts recebeu só argumento kind opcional, ignorado provisoriamente. Nenhum stub foi ligado a uma nova rota/hook. US4/US5 usam testes complementares e benchmark, sem exceder cinco casos de contrato; foco/RETURN são cobertos por contratos/E2E vigentes e novos fluxos complementares.

Verificar também locks 017/018/038/039/050/052/053/056/057/060/061/063 quando suas superfícies forem tocadas; comparar ao estado inicial e não regravar travas como parte deste plan. A revalidação parte do commit e0ec6ef, com workspace inicialmente limpo e planejamento/stubs já versionados; conferir novamente mudanças locais antes de capturar a baseline. A T010 aponta para useTitleMetadata em catalogApi.ts, sem pressupor um módulo separado já existente.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Tasks | 59/59 concluídas (T001–T059), checklist de release fechado |
| Contratos 065 | 5/5 verdes; trava íntegra |
| Gates | `npm run test` 505/3.051; lint/catraca; tipos; build normal e Tizen; E2E 43/43 |
| Desempenho | Aceite parcial por comparação reduzida (`bench-results/screen-perf-065/reduced/report.md`, D-013): atingidos SC-002 (exceto índice frio), SC-003, SC-004, SC-005 sem TMDB, SC-006, SC-007 memória/leitura, SC-011; não atingidos SC-002 índice frio, SC-005 com TMDB, SC-007 tempo (−29,6%), SC-012 (−14,6%) — no backlog |
| TV física | Instalada; usuário confirmou abertura, vitrine, categoria grande, selo 0/N, detalhe com TMDB e episódios após T057. RAM/desempenho físico não medidos |
| Status | Implementada (com ressalvas de desempenho acima) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Metas de CPU/heap/primeira visita ainda não demonstradas | Alto | Parcialmente resolvido: comparação reduzida demonstrou a maioria; não atingidas registradas no backlog com aceite do usuário (D-013) |
| R-002 | Projeção adicional aumenta disco e escrita; backfill lê um bloco inteiro uma vez | Alto | Resolvido: projeção só em categorias ≥ 1.000 itens, limpeza das existentes e quota preservando o canônico (T057, testes de writers/quota); disco medido com a lista real. |
| R-003 | Janela limitada pode deslocar foco/índice absoluto | Alto | Resolvido: fim/busca/ordenação/RETURN iguais à baseline na categoria 30k (reduced/report.md) e testes de janela/RETURN. |
| R-004 | Sucesso concorrente/chave trocada contamina pausa/cache | Alto | Resolvido: contrato 429 + testes de corrida/revisão verdes; pausa limitada por MAX_PAUSE_MS (emenda FR-010). |
| R-005 | importação estática indireta anula splitting ou chunk falta no YAML | Alto | Resolvido: guard do sync-tizen sem pendência, YAML regenerado, rotas lazy só para cadastro/importação/acesso; E2E com rede desligada verde. |
| R-006 | Workspace contém mudanças prévias de 062/063/064 e travas alteradas | Médio | Resolvido: todas as travas de contrato do repositório íntegras na convergência; nenhuma reversão de trabalho alheio. |
| R-007 | Benchmark não prova memória total nem desempenho físico | Médio | TV recomendada registrada como pendente até validação, sem declarar capacidade comprovada |
| R-008 | Invalidar resumo/projeção só em alguns caminhos deixa dados antigos | Alto | Resolvido: writers/conversão/geração/fonte invalidam projeção e resumos (testes de writers, seriesRevision, summaries). |
| R-009 | Instrumentação de controle pode contaminar abertura, retenção ou expor dados | Médio | Resolvido: adapter só na entrada de controle (guard do runtime); revisão de segredos limpa nos artefatos. |
| R-010 | Fixtures densas podem misturar custo de histórico e crescimento entre listas | Médio | Resolvido: fixtures congeladas, população igual em baseline e candidata; equivalência total no relatório reduzido. |
| R-012 | `ElementHandle`s de `waitForSelector` no harness nunca são descartados e o CDP os retém, segurando árvores DOM desmontadas; contamina SC-006 (e, em menor grau, heap) na baseline e na candidata | Alto | Resolvido: harness descarta handles (T054); ciclos estáveis na candidata. |
| R-013 | "Filmes com índice frio" é limitado pela primeira renderização da vitrine (~159 ms em CPU 4×), não pela leitura; meta de −30% pode exigir mudança de renderização ou revisão da meta (D-013) | Médio | Aberto: medir na matriz final; se persistir, levar ao usuário com evidência |
| R-015 | Grade de categoria por janela (T055) mexe em busca/ordenação/foco/RETURN de `VodCategoryScreen` | Alto | Resolvido: grade por janela com equivalência total e testes; virtualização por linhas com o mesmo DOM. |
| R-016 | Grade de categoria virtualizava células (lanes): 30 mil medições por render dominavam a entrada | Médio | Resolvido: virtualização por linhas de 6 com faixa extra 3↑/2↓, DOM idêntico ao anterior |
| R-017 | Baseline precisa ser o mesmo app da run-002: checkout com `autocrlf` muda bytes e hash | Médio | Resolvido: worktree sem conversão + fim de linha/BOM por arquivo conforme hashes da run-002; `app` idêntico verificado antes da captura |
| R-018 | `manualChunks` por rota levava código compartilhado para os chunks de rota; `index.js` importava todas as rotas | Alto | Resolvido (T056): nome por entrada da rota e Início/cadastro/acesso lazy; abertura ≈641 KB vs 1.008 KB |
| R-019 | TV física: detalhe sem dados TMDB, teste da chave "sem conexão" e episódios de série falhando, sem reprodução no PC | Alto | Resolvido (T057): falta de espaço na TV; projeção só em categorias grandes + limpeza, gravações derivadas não derrubam fluxo principal, pausa honesta e limitada. Confirmado pelo usuário na TV em 2026-10-09 |
| R-020 | Dados derivados (projeção, índices de série) competem por cota com o canônico; na TV a cota é pequena | Alto | Resolvido: derivados só onde há leitura que os usa; falha derivada não propaga (T057, confirmado na TV). |
| R-021 | Protocolo de aceite reduzido a pedido do usuário (hibernação da máquina e carga externa invalidaram a run-003 completa; prazo) | Médio | Resolvido: protocolo reduzido oficializado na Emenda de aceite da spec (2026-10-09). |
| R-022 | Metas não atingidas e protocolo reduzido sem emenda da spec (achados C1–C8 do converge) | Médio | Resolvido: spec emendada em 2026-10-09 com decisão do usuário (Emenda de aceite); T061 corrigiu as fileiras locais presas ao estado do TMDB |
| R-014 | Revisão de FAIL não deve "consertar" teste para passar: ajustes da T046 alteraram comportamento visível (0/N) | Médio | Resolvido: semântica da baseline restaurada (T052); E2E corrigido para verificar a intenção, não a corrida |
| R-023 | **Atualização (feature 082, 2026-10-18)**: a projeção de leitura (`catalogReadManifests`/`catalogReadChunks`) era uma 2ª cópia dos itens. Na lista real eram 18,7 MB só em filmes, a maior parte do catálogo, e a TV tem cota fixa de 80 MiB e não comprime o que grava (sondas da 082) | Alto | Encaminhado à 082: os itens passam a ser gravados em pedaços comprimidos (`categoryChunks`), que fazem o papel da projeção (janela sem `categoryBlocks.get`, mesmo contrato desta feature). As projeções existentes são lidas até a conversão e depois apagadas. Ver `sdd/specs/082-orcamento-armazenamento-tv/logic/formato-comprimido.md` |
| R-011 | Relógio de atividade avançando alterava addedAt e desempates dos itens sintéticos de eventos | Alto | Resolvido: dados usam CLOCK + (category.order + 1) × 1.000; atividade continua monotônica. Teste garante dados/seleção iguais apesar do relógio real. run-001 foi interrompida e rejeitada, com originais preservados; recapturar matriz inteira em run-002 |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-07 | Fase 1, checkpoint intermediário | Fixtures e dez testes de comparador/privacidade verdes; tipos/lint verdes. Diagnósticos de abertura, categoria 30k com detalhe/RETURN e 100k episódios concluídos. Falha temporária de autenticação do approval reviewer resolvida após retomada. Usuário autorizou modo contínuo | Concluir diagnóstico de ciclos e capturar 70 amostras full antes de otimizar |
| 2026-10-07 | Fase 1, T002 | Diagnósticos de ciclos completos e entrada normal (primeiro comando + Home/Filmes/Séries/categoria) concluídos. Dez testes verdes, tipos/lint/build PASS, sem demux; trava íntegra e cinco contratos futuros vermelhos pelos motivos esperados. Nenhuma otimização de produto aplicada | Capturar e validar as 70 amostras full; registrar dispersão/custos em T004 |
| 2026-10-07 | Fase 1, T003 | Verificação de consistência encontrou variação de cards nos eventos: Date.now por item mudava desempates. Corrigido inline na fixture com teste adicional; 11/11 testes verdes e lint PASS. run-001 rejeitada, sem apagar dados; browser/PIDs próprios encerrados e trava removida pelo runner | Validar sete repetições TMDB20 com datas fixas e recapturar baseline/run-002 antes de otimizar |
| 2026-10-07 | Fase 1, T003 recaptura | smoke-011 concluiu sete repetições TMDB20 sem erro: conteúdo/foco/rolagem iguais nas sete amostras em todas as sete etapas. Tipos PASS e trava íntegra 5/5. Harness corrigido congelado; produto ainda intacto | Executar matriz completa baseline/run-002 e validar as 70 amostras |
| 2026-10-08 | Fase 1, checkpoint final | baseline/run-002 concluída e validada: 70 amostras, 10 configurações, 0 erros, fingerprint conferido; T003/T004 marcadas. Referência publicada no report e quickstart; nenhum código de produto alterado | Iniciar T006: prazo TMDB cobrindo transporte e corpo |
| 2026-10-08 | Fase 2, T006 | `requestDeadline` cobre transporte e corpo com AbortController próprio; `tmdbGet` mantém API pública, sanitização e cancelamento identificável. Contrato de timeout 1/1, conector 10/10, tipos e lint PASS | Implementar Retry-After, revisão/pausa condicional e descoberta atômica em T007–T008 |
| 2026-10-08 | Fase 2, T007–T008 | `Retry-After` numérico/data, pausa ativa preservada após sucesso e publicação de descoberta somente com lotes completos. Contrato externo 2/2 e suíte de metadados 45/45 verdes; tipos/lint PASS. Expectativas antigas não travadas de 032/057 foram alinhadas à FR-009/010 | Completar T009 com revisão/contexto/leases de metadata e propagar sinais em T010 |
| 2026-10-08 | Fase 2, T009–T010 | `sharedAttempt` por banco/chave com cancelamento por consumidor; revisão opaca impede escrita após troca/remoção de credencial; `tmdbLookup`, pessoas, discovery e `useTitleMetadata` propagam signal. Suíte de metadados 45/45, catálogo 7/7 e tipos PASS | Criar fault probe controlado, ampliar casos de cancelamento/revisão e fechar T011–T014 |
| 2026-10-08 | Fase 2, T011 | Fault probe separado do harness de telas (`run-query-faults.mjs`) executado com dados sintéticos: 2/2 testes verdes, timeout de corpo abortado e 429 sem parcial/lotes posteriores, pausa Retry-After preservada. Evidência agregada em `bench-results/screen-perf-065/us1-query-faults/report.md` | Fechar T012–T014; o runner de telas permanece reservado à matriz pareada |
| 2026-10-08 | Fase 2, T012–T014 | Cobertura adicional de connector/discovery/key/leases/contexto: 49/49; conjunto focado US1 64/64, contrato externo 2/2, types/lint PASS. Corridas de idioma, lista, geração, source/key removidos e Retry-After HTTP-date cobertas; T006–T014 encerradas | Iniciar T016: leitores iteráveis e derivados pequenos pela fachada do catálogo |
| 2026-10-08 | Fase 3, T015 | Seleção incremental com deduplicação global/top-K estável, fast path ASCII equivalente e variante Iterable/AsyncIterable cooperativa com yield/cancelamento. Contrato async + ratedSelection → 18/18; oxlint dos dois arquivos PASS | Implementar T016 sem materializar `listAllOfKind` nas vitrines |
| 2026-10-08 | Fase 3, T016 | `catalogDerivedRows` expõe iteradores por categoria/bloco e projeção compacta sem URLs; abort é checado entre páginas e itens. Teste focado 2/2 e type-check PASS | Extrair `showcaseApi.ts` em T017, mantendo reexports e contexto por geração/idioma |

**PRÓXIMO**: rodar `sdd-converge` de novo; depois reinstalar na TV. rodar gates (lint/tipos/testes/build/build:tizen/E2E/segredos/quickstart) sem concorrer com benchmark; matriz candidata final com `--checks`; comparar contra run-003 (T022/T047); T048.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/catalog/catalogApi.ts` — vitrines por passada única (`useShowcaseSelections`), grade por janela (`useCategoryWindow`).
- `tv-web/src/lib/catalog/categoryWindow.ts` — projeção só em categorias grandes, backfill e limpeza.
- `tv-web/src/lib/metadata/titleMetadata.ts`, `tmdbKeyRepository.ts` — gravação derivada não fatal, pausa honesta e limitada.
- `tv-web/src/navigation/routeModules.ts`, `tv-web/vite.config.ts`, `CCPlayTv/tizen_web_project.yaml` — rotas lazy e inventário de chunks.
- `tv-web/bench-results/screen-perf-065/reduced/report.md` — aceite de desempenho (protocolo reduzido).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Modo contínuo autorizado: reportar checkpoints e seguir, sem confirmação entre fases.
- Não iniciar testes/builds/benchmarks concorrentes durante captura. `.running` pertence ao PID do executor; se houver interrupção, verificar o processo antes de remover qualquer trava.
- Diagnósticos `smoke-*` têm uma amostra e alguns foram interrompidos/corrigidos; jamais usá-los como referência de aceite. Diretórios incompletos permanecem identificados por `failure.json`.
- `category-first` mede primeira entrada na grade após H→F→S/índice frio. A fixture já está em blocos; derivação futura deve aparecer desde `home-cold`, sem preparar projeções durante seed. `seedRpcMs` usa CPU1; intervalos de tela usam CPU4.
- Novos testes de falhas podem ser módulos separados; alteração no harness congelado exige recapturar baseline, não afrouxar fingerprint.
- Na projeção, preservar `playable` de M3U por um booleano de capacidade de listagem: `itemOut` atualmente usa `directUrl` ou `providerStreamId`. Omitir a URL sem manter essa informação mudaria os cards. Detalhe/player continuam recuperando o canônico.
- O resumo vigente ignora episódio sem `seriesId`/identidade estável e preserva multiplicidade de stableIds; o backfill precisa conservar essas regras, não deduplicar o vetor.
- Testes complementares antigos de `tmdbKeyRepository.test.ts` esperam limpar pausa em sucesso/falha de rede. FR-010 altera deliberadamente esse comportamento; atualizar somente os testes não travados, preservando os contratos. A remoção continua apagando a linha da integração e mascarando status, sem tombstone com chave.
- Snapshots de heap no harness: a retenção por "DevTools console" vem de `ElementHandle`s não descartados, não do app. Sonda de diagnóstico (fora do harness, para não alterar o fingerprint) fica no scratchpad da sessão.
- A fachada `catalogRepository` não pode ganhar exportações (contrato 063) e nada fora dela importa `repository/` (teste 063): helpers novos de leitura em `lib/catalog` falam com o `db` diretamente.
- Baseline/run-001 foi rejeitada por não determinismo dos dados de eventos (rejected.md). Não usar suas medianas ou amostras no comparador, nem combinar partes com run-002. O relógio de atividade pode avançar; campos editoriais da fixture precisam ser constantes.

| 2026-10-08 | Fase 3, T017–T018, T020–T021 | Fachada showcaseApi adicionada com reexports compatíveis; cruzamento de descoberta aceita sinal para abandonar cálculo obsoleto sem cancelar o índice compartilhado. Invalidação de pré-carga agora propaga tipo e evita reler séries/listas independentes; testes focados 37/37, pré-carga 3/3, type-check PASS | Reconciliar consumidores/foco e capturar medições de três conclusões em T019; fechar contratos e benchmark candidato em T022 |


| 2026-10-08 | Fase 4, T023 | `catalogReadManifests`/`catalogReadChunks` e `readProjection` persistem projeção compacta por revisão; `categoryWindow` lê somente chunks da faixa pedida e preserva fallback canônico. Contrato de janela 1/1 e type-check PASS | Integrar writers, invalidação e limpeza em T024 |



| 2026-10-08 | Fase 4, T024 / Fase 5, T033 | Writers invalidam e preparam a projeção por categoria, geração e fonte; remoção e quota preservam o canônico, e a janela lê a revisão atual. Suíte focada 65/65, contrato 5/5, type-check, arquitetura e oxlint focado PASS. Schema v19, helper puro e repository de resumos incrementais de séries adicionados; teste do repository 2/2 | Iniciar T025; depois integrar revisão de episódios/estados em T034 |
| 2026-10-08 | Fase 4, T025 | Cache de blocos limitado a 2.000 itens e duas categorias; memo de projeções limita oito chunks de 240 itens e limpa na troca/invalidação de contexto. `loadSearchIndex` compacta campos de listagem sem URLs/headers; vitrines usam gcTime de 30 s e seleção limitada a dois resultados por índice. 52/52 testes focados, trava 5/5, type-check, arquitetura e lint PASS | Iniciar T026; T027 depende do cursor para consumo das projeções |
| 2026-10-08 | Fase 4, T026 | `readKindCursorPage` acrescenta cursor de categoria+offset+revisão e `features/catalog/categoryWindowApi.ts` expõe a fachada; a paginação progressiva de “Todos” usa a API nova, enquanto `readKindPage` legado permanece. Mudança de revisão reinicia o offset; 17 testes do repositório e 61 testes de catálogo passaram com type-check/arquitetura | Iniciar T027; adaptar busca/ordenação para usar projeções sem reidratar URLs |
| 2026-10-08 | Fase 4, T027 | Índices compactos continuam cobrindo o conjunto completo para busca/ordenação, sem duplicar URLs/headers; a prévia chama `readCategoryWindow` e limita a 12 itens antes do fallback canônico. Testes de catálogo/home 38/38, type-check e architecture PASS | Iniciar T028; separar histórico/favoritos dos objetos completos |
| 2026-10-08 | Fase 4, T028 | `historyApi` expõe `loadHistoryPage`/`loadFavoritesPage` de 240 objetos, preserva `unresolved`/cursor e deixa contagem em `useHistorySummary`; hooks de conteúdo/favoritos usam GC de 30 s. Contrato de histórico 47/47, paginação 2/2, type-check e architecture PASS | Iniciar T029; limitar cache de arte e executar ciclos de memória |
| 2026-10-08 | Fase 4, T029 | Cache de cores de capa ganhou LRU de 256 entradas; prévias de categoria e backdrops locais expiram em 30 s; o catálogo mantém URLs de playback fora dos índices derivados. Home, vitrine e cor de capa passaram 17/17, type-check, architecture e oxlint focado PASS. Artefatos diagnósticos já registram heap/ciclos/Worker/disco; aceite pareado permanece no T032 | Iniciar T030; fechar casos de revisão, legado, quota e limpeza |
| 2026-10-08 | Fase 4, T030 | Testes novos cobrem janela legada/final e troca de revisão, geração inativa, quota sem apagar canônico, remoção da fonte, memo LRU e schema legado. Suíte da fase passou 30/30, type-check e oxlint focado PASS | Iniciar T031; verificar histórico/favoritos e RETURN após GC |
| 2026-10-08 | Fase 4, T031 | Histórico/favoritos reidrataram itens e contadores depois de remover o QueryCache; a grade buscou o item final e ordenou com janela virtual; RETURN restaurou o card por `focusedItemId` após remontagem. Testes focados 3/3 e T030/T031 combinados 33/33 | Iniciar T032; consolidar contratos, gates e diagnósticos de memória |
| 2026-10-08 | Fase 4, T032 | Contrato da janela, quatro contratos travados, suíte antiga/área e T030/T031 passaram; `check-contract-tests` confirmou 5/5, type-check, lint completo e build/guard PASS. Diagnósticos isolados de ciclos, categoria 30k e 100k episódios registraram heap, pico, Worker, leituras, seed e armazenamento sem regressão observada; são evidência exploratória, não aceite pareado | Encerrar US3 e iniciar T034 da US4 |
| 2026-10-08 | Fase 5, T034 | Publicação de episódios recompõe membros compactos e invalida somente a série afetada; mudanças de estado usam o índice multiEntry de stableIds; remoção de geração/fonte limpa membros e resumos. Testes de catálogo/userState 79/79, integração 2/2, type-check e oxlint focado PASS | Iniciar T035; expor facade de resumos válidos sem rede |
| 2026-10-08 | Fase 5, T035 | `features/catalog/seriesSummaryApi.ts` consulta summaries válidos por revisão, recalcula apenas membros inválidos e faz backfill local único para catálogos antigos; `catalogApi` virou facade sem varredura de episódios na reentrada e sem rede/`ensureSeriesEpisodes`. API/catálogo/séries 102/102, type-check, architecture e oxlint focado PASS | Iniciar T036; comparar equivalência e casos de multiplicidade/geração/quota |
| 2026-10-08 | Fase 5, T036 | Equivalência validada contra `summarizeSeriesWatched`, incluindo stableId duplicado/multiplicidade, catálogo novo, geração, alteração de episódios e quota ao persistir resumo; 3 testes de integração + 5 de API/quota, type-check e oxlint focado PASS | Iniciar T037; medir 100k episódios, reentrada e delta |
| 2026-10-08 | Fase 5, T037 | Benchmark de 100k episódios após a facade: 828,9 ms no backfill, 86,8 ms na reentrada e 88,5 ms no delta; nenhuma leitura de episódio na reentrada/delta, somente members/summaries e estados da série alterada. Heap retido 7,01 MiB e Worker 0; testes/tipos/lint PASS | Encerrar US4 e iniciar T038 da US5 |
| 2026-10-08 | Fase 6, T038 | `navigation/routeModules.ts` separa imports locais para Live, VOD, detalhes, pessoa, Configurações e Busca; Início/Perfis e telas de recuperação permanecem no caminho inicial. `App` manteve redutor, callbacks e ordem dos efeitos; aquecimento idempotente usa ociosidade após o splash e não consulta dados. App/App.source-access 9/9, type-check, oxlint focado e architecture PASS | Iniciar T039: RouteBoundary com estados focáveis, erro sanitizado e retry |
| 2026-10-08 | Fase 6, T039 | `RouteBoundary` isolou Suspense/erro por rota, com estado loading focável, erro sanitizado, SELECT/retry, RETURN e textos pt/en/es via i18n. `lazyRoute` recria a lazy ao remontar, garantindo nova promise após falha; App preserva a pilha e o redutor. App/App.source-access/Splash 13/13, type-check, oxlint focado e architecture PASS | Iniciar T040: prontidão local do splash |
| 2026-10-08 | Fase 6, T040–T041 | O splash abandonou o timer de 2.600 ms: aguarda estado terminal das fontes locais, fontes CSS e preferências síncronas de idioma/movimento, com quadro da marca e recuperação focável. O build separa dez rotas em chunks locais estáveis, e `tizen_web_project.yaml` os inventaria sem relaxar guard/CSP/chrome108. App/Splash/RouteBoundary 16/16, type-check, oxlint, architecture, build e guard Tizen PASS | Iniciar T042: testes de prontidão/startup |
| 2026-10-08 | Fase 6, T042 | `SplashScreen.readiness.test.tsx` confirma loading focável e liberação por prontidão/quadro; `App.startup.test.tsx` confirma fontes em sucesso/erro terminal sem timer fixo. T042 focused → 7/7, junto com App/RouteBoundary/Splash → 16/16 | Iniciar T043: testes de rota pendente/falha, retry e RETURN |
| 2026-10-08 | Fase 6, T043 | `RouteBoundary.test.tsx` cobre loading/RETURN, retry com nova promise e sanitização, erro com Voltar sem nova importação (3/3). `e2e/performance-navegacao.mjs` confirmou abertura sem chunk de rota, primeira visita à vitrine e RETURN; registrado no runner E2E. | Iniciar T044: benchmark de abertura e primeira visita |
| 2026-10-08 | Fase 6, T044 | Diagnóstico candidate/smoke em `diagnostic/t044-startup`: abertura sem lista 792,5 ms cold/332,1 ms warm; com lista 444,5/459,9 ms; JS 1.041.270/1.006.583 bytes; primeira visita Home/Filmes/Séries/categoria 1.571,7/2.152,5/648,1/638,0 ms. E2E local confirmou sem chunk de rota na abertura vazia, vitrine e RETURN; build/guard Tizen e demux PASS. Amostra única, não aceite pareado/TV. | Iniciar Polish T045: gates completos |
| 2026-10-08 | Polish, T045 | Suíte completa 503/3.044; lint, tipos, arquitetura, build normal/Tizen, sync guard, tizenFiles 5/5 e trava de contratos 5/5 PASS. `rolldown-runtime.js` foi adicionado ao inventário Tizen. | E2E e matriz candidata |
| 2026-10-08 | Polish, T046 | A execução inicial teve 39/44 por módulos locais bloqueados por interceptadores amplos. Após corrigir os interceptadores `vod`/`series`/`live`, o contrato de créditos, o resumo sem progresso e as esperas/foco dos roteiros, a suíte completa passou 44/44 em 344 s (`--jobs 2`); a repetição focada dos cinco fluxos originais passou 5/5 em 75 s. | Recapturar a matriz pareada após revisar o FAIL de T047; T048 e TV física pendentes |
| 2026-10-08 | Polish, T047 | `candidate/t047-final` concluiu 70 amostras (10×7). Comparação contra `baseline/run-002` gerou `comparison.md/json` com 136 verificações e resultado FAIL: regressões em fixtures grandes/TMDB, heap/seleção em alguns cenários e gates sem marcação de aceite. | Não declarar aceite; revisar regressões e recapturar |
| 2026-10-08 | Pós-T047 | O cache de resumos passou a invalidar `series-watched-summary` ao gravar estado; o pré-carregamento concorrente de todas as rotas foi removido para preservar lazy loading e evitar falhas de módulos no dev server. Type-check, lint focado, arquitetura e build normal PASS. | Repetir E2E/benchmark somente após revisar os regressos; T048 e TV física pendentes |
| 2026-10-08 | T046 investigação E2E | Os cinco fluxos falhos foram reproduzidos e corrigidos. Interceptadores `**/vod/**`, `**/series/**` e `**/live/**` bloqueavam módulos Vite locais; `usePersonCredits` passava um sinal incompatível; resumos de séries publicavam `0/N` antes de haver progresso; M3U tinha asserção antes da montagem lazy; e `catalogo-em-blocos` enviava Enter extra quando o card já estava focado. A execução focada serial passou 5/5 em 75 s e a suíte completa posterior passou 44/44 em 344 s. | Recapturar a matriz pareada após revisar o FAIL de T047; TV física e T048 continuam pendentes |
| 2026-10-08 | Revisão do FAIL da T047 (T019, T049–T053) | Seleção sem cache FIFO de títulos; vitrines por passada cooperativa bloco a bloco; aquecimento da próxima rota; semântica 0/N restaurada e E2E de histórico corrigido; codificação UTF-8 restaurada. Diagnóstico local-100 sem imagens: Filmes após Home −72%, seleção −69%, eventos sem tarefa longa, heap −54%, Home +6,8%, equivalência igual. Ciclos: heap absoluto 76 → 25 MB, mas crescimento por ciclo é artefato do harness (R-012) | Decisão do usuário sobre T054/T055 antes da matriz final |
| 2026-10-09 | T055 / T054 | Grade por janela (`useCategoryWindow`, backfill de projeções, pré-busca da 1ª janela) e virtualização por linhas; equivalência total na categoria 30k, sem leitura integral, heap temporário −90%, primeiro recorte ~213 ms (1 amostra). Harness descarta handles; vazamento dos ciclos some. Suíte 504/3.047, lint/catraca PASS. Baseline run-003 iniciada em worktree | Gates e candidata final após a baseline |
| 2026-10-09 | TV física / T056 / T057 | Instalado na TV a pedido; usuário confirmou abertura rápida, vitrine, categoria grande e selo 0/N; relatou detalhe sem TMDB e episódios falhando (T057, investigação após os testes). Achado do bundle: rotas importadas estaticamente pelo `index.js`; corrigido (T056) | Baseline run-003, gates, candidata final, depois T057 |
| 2026-10-09 | T057 | Defeito da TV causado por falta de espaço (projeção maior que o canônico) e gravações derivadas sem proteção. Corrigido e reinstalado; usuário confirmou detalhe, séries e TMDB na TV. Baseline run-003 reiniciada | Baseline, gates completos, candidata final, T048 |
| 2026-10-09 | Fechamento (T022, T047, T048, T054, T058, T059) | Comparação reduzida pareada publicada; regressão do Início com TMDB corrigida (passada única) e Início de volta ao pacote inicial; E2E 43/43, suíte 505/3.051, lint/tipos/build Tizen PASS; README e backlog atualizados | Nenhuma bloqueante; resíduos de desempenho no backlog |
| 2026-10-09 | Phase 8: Convergence (T060–T061) | Spec emendada (protocolo reduzido, metas não atingidas no backlog, teto da pausa, escopo da janela) e vitrine independente do estado TMDB, com teste | Reconvergir |

## Resultado Final

Convergida em 2026-10-09 (segunda passada do `sdd-converge`, sem achados; a primeira gerou T060–T061).

**O que foi construído**: consultas TMDB com prazo de 10 s (rede + corpo), Retry-After, lotes atômicos, tentativas compartilhadas por lease e revisão opaca da credencial (US1); seleção "Bem avaliados" incremental e cooperativa, vitrines por uma passada bloco a bloco que retém só os vencedores e entrega o índice compacto ao Top 10/Dica quando há chave, invalidação de pré-carga por tipo (US2); projeção compacta por revisão para categorias de Filmes/Séries ≥ 1.000 itens, grade por janela virtualizada por linhas, caches limitados, histórico/favoritos paginados (US3); resumos de séries por membros com índice reverso por stableId (US4); splash por prontidão, rotas lazy locais com fronteira focável e inventário Tizen auditado (US5).

**Desvios acumulados** (Execution Notes): a matriz T047 deu FAIL e motivou T049–T059; a passada de vitrines (D-005) só foi ligada às telas em T050; o harness tinha falso vazamento (T054) e a baseline completa foi substituída por comparação reduzida a pedido do usuário (Emenda de aceite); um defeito real na TV física — disco cheio pela projeção de todas as categorias e gravações derivadas sem proteção — foi corrigido em T057 e confirmado pelo usuário; o Início voltou ao pacote inicial (T059) porque carregá-lo sob demanda atrasava a primeira entrada na lista e quebrava o E2E de dev.

**Decisões diferentes do plano original**: D-007 passou a valer só para categorias grandes (projeção para todas dobrava o disco); D-011/US5 mantém o Início no caminho inicial (lazy só cadastro, importação, acesso e telas internas); FR-010 ganhou teto de 1 h para a pausa; a janela de grade não cobre a TV ao vivo.

**Resultado de desempenho** (`tv-web/bench-results/screen-perf-065/reduced/report.md`): Filmes após Home −76% (sem TMDB) / −38% (com TMDB), maior tarefa −54% a −90%, Bem avaliados −66% a −78%, tarefas longas nos eventos −91% a −100%, heap −54% sem TMDB, ciclos estáveis, heap temporário da categoria 30k −90%, abertura −80% a −91%, equivalência total. Pendências no backlog: Filmes com índice frio, heap com TMDB, tempo do 1º recorte da categoria 30k e JS da abertura (−14,6%).

**Riscos que continuam abertos**: R-001 (metas retiradas para o backlog), R-007 (RAM/desempenho físico não medidos na TV; validação visual feita pelo usuário), R-013 (índice frio dominado pela primeira renderização).

