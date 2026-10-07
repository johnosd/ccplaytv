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

Verificar também locks 017/018/038/039/050/052/053/056/057/060/061/063 quando suas superfícies forem tocadas; comparar ao estado inicial. O workspace já contém alterações e locks de outras features modificados: não consertar nem regravar essas travas como parte deste plan.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Metas de CPU/heap/primeira visita ainda não demonstradas | Alto | Baseline antes de implementar, amostras pareadas; revisar spec explicitamente se inviável |
| R-002 | Projeção adicional aumenta disco e escrita; backfill lê um bloco inteiro uma vez | Alto | Compactar campos, preparar incrementalmente, medir pico/Worker e escrita; quota conserva canônico, não ocultar migração |
| R-003 | Janela limitada pode deslocar foco/índice absoluto | Alto | Cursor/id/posição por revisão, restauração antes de pintar; E2E no início/fim/busca/RETURN |
| R-004 | Sucesso concorrente/chave trocada contamina pausa/cache | Alto | Revisão opaca, leases e persistência condicionada; contrato 429 e testes de corrida |
| R-005 | importação estática indireta anula splitting ou chunk falta no YAML | Alto | Medir grafo/bytes e primeiro acesso offline; sync guard, nomes estáveis, sem relaxar segurança |
| R-006 | Workspace contém mudanças prévias de 062/063/064 e travas alteradas | Médio | Reler antes das tasks, não sobrescrever/reverter; baseline por fingerprint, reportar falhas preexistentes |
| R-007 | Benchmark não prova memória total nem desempenho físico | Médio | TV recomendada registrada como pendente até validação, sem declarar capacidade comprovada |
| R-008 | Invalidar resumo/projeção só em alguns caminhos deixa dados antigos | Alto | Mapear escritores, Worker/conversão e geração; testes de renovação, quota e resposta obsoleta |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
