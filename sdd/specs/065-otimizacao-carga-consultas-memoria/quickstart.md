# Quickstart: feature 065

## Pré-requisitos

Windows PowerShell 5.1, Node/npm e dependências existentes de tv-web/. Não iniciar api/ nem usar docs/m3u/dados.md. Ambiente de benchmark isolado, sem credenciais reais. Nenhuma TV/emulador é instalada pelo plan.

Ler spec → plan → tasks → research/data-model/contracts/logic. Conferir branch feature/designWave2 e alterações locais antes de executar. O workspace tem trabalho prévio; não fazer reset/checkout para gerar baseline. Fingerprint usa hashes dos arquivos de entrada, sem exportar diff/logs/segredos.

## Estado entregue pelo planejamento

- Contratos 065: cinco falhas esperadas, quatro arquivos compiláveis, SHA256 travado.
- Testes existentes selecionados: 73/73 verdes em oito arquivos; type-check PASS.
- Lint/catraca PASS, com avisos existentes em arquivos fora dos stubs/contratos novos.
- Não há otimização de produto implementada. A assinatura opcional kind ainda é ignorada e os dois módulos novos de implementação lançam not implemented.
- Não rodar suíte completa para declarar plan verde: ela inclui contratos deliberadamente vermelhos. Durante execução, contratos por fase; suíte completa no Polish.

## Contratos

Da raiz:

~~~powershell
& ./.planning/scripts/powershell/check-contract-tests.ps1 -Slug '065-otimizacao-carga-consultas-memoria' -Json
~~~

De tv-web/:

~~~powershell
npm run test -- src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

Vermelho correto: timeout sem outcome; 429 parcial com stale=false; séries relidas por movie; dois not implemented. Nenhum erro de import/sintaxe/tipo. Não editar o contrato para refletir implementação.

Suíte da área usada no plan:

~~~powershell
npm run test -- src/lib/metadata/tmdbConnector.test.ts src/lib/metadata/tmdbDiscovery.test.ts src/lib/metadata/tmdbKeyRepository.test.ts src/features/catalog/prefetchApi.test.ts src/features/vod/ratedSelection.test.ts src/lib/catalog/categoryBlocks.test.ts src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts src/features/catalog/catalogApi.vitrine-cache.test.tsx
npx tsc -b --pretty false
npm run lint
~~~

## Benchmark antes/depois

Os três comandos seguintes são a **CLI a implementar em T002/T003**, não scripts já concluídos. Os executores review-screen-perf/review-query-perf continuam evidência exploratória e não atendem o protocolo final.

De tv-web/, após T001–T003:

~~~powershell
node scripts/bench/run-screen-perf.mjs --mode baseline --suite full --cpu 4 --repeat 7 --output bench-results/screen-perf-065/baseline/run-001
node scripts/bench/run-screen-perf.mjs --mode candidate --suite full --cpu 4 --repeat 7 --output bench-results/screen-perf-065/candidate/run-001
node scripts/bench/compare-screen-perf.mjs --baseline bench-results/screen-perf-065/baseline/run-001 --candidate bench-results/screen-perf-065/candidate/run-001
~~~

Runner deve construir/servir produção em loopback, iniciar/encerrar seus próprios processos, recusar diretório existente e criar manifest.json, samples.json e report.md. Usar modo específico para microbenchmark/episódios se necessário, dentro de suite full; nenhum teste em paralelo. Comparador retorna código não zero em meta/regressão falha, amostra insuficiente ou ambiente incompatível.

Antes de otimizar, baseline inclui interfaces/stubs preparados que não mudam comportamento, estado de arquivos/deps e fixtures identificados. Para eventos reais, adapter isolated chama o scheduler e grava dados reais, não cache invalidator. Novo src/bench/screenControl.ts nunca é importado no main de produção nem listado no pacote normal; se houver entrada de benchmark separada, seu custo/grafo são identificados e abertura/bytes continuam medidos no entrypoint normal.

Capturar variante com/sem TMDB simulado, 20%/100% elegíveis, imagens locais/sem imagens, 30k numa categoria, 100k episódios, histórico/favoritos e ciclos de três listas. Frio/quente, conversão inicial, pico temporário/Worker e heap estabilizado são resultados distintos. Não esconder reprojeção/aquecimento em um número frio. Sete execuções por cenário/configuração com mediana/dispersão e dados brutos.

## Roteiro manual no navegador

1. Abrir sem lista: splash de identidade, liberação pela prontidão, Adicionar lista focável/ativável. Abrir com lista: perfis continuam visíveis, última lista focada.
2. Escolher lista; entrar Home → Filmes → Séries. Comparar ids/ordem/quantidades sob mesmo relógio; sem metadados externos, conteúdo local utilizável.
3. Mover foco enquanto três categorias chegam; verificar atualização em até 2 s, sem salto de foco ou consulta externa iniciada pelo foco.
4. Entrar categoria grande, percorrer começo/meio/fim, buscar/ordenar, abrir detalhe e RETURN. Item/scroll corretos após liberar/recarregar janela, inclusive categoria vazia.
5. Favoritar/marcar assistido/alterar progresso; reabrir Histórico/Séries e conferir indicadores, contadores e estados por identidade, sem misturar listas.
6. Simular timeout de rede/corpo e falhas intermediárias/429; manter último cache válido, nenhum próximo lote durante pausa, recuperação depois do prazo, sem mensagens com segredo.
7. Abrir primeira vez cada rota com rede externa bloqueada; loading/erro têm SELECT e RETURN funcionais, retry não prende em promise rejeitada.
8. Repetir após suspensão/retomada e atualização de catálogo; recurso local não pode faltar no pacote, foco/estado continuam reconciliados.

## Gates de execução e empacotamento

De tv-web/, ao encerrar a feature:

~~~powershell
npm run lint
npx tsc -b --pretty false
npm run test
npm run build
npm run build:tizen
~~~

Inventário no YAML inclui todo arquivo emitido, target/base/CSP preservados, guard sem demuxer passa. Revisar arquivos gerados/segredos antes de integrar. Build:tizen sincroniza; não instala hardware.

Em processo separado iniciar npm run dev; com ele disponível:

~~~powershell
npm run test:e2e
~~~

Registrar performance-navegacao.mjs no runner e executar também fluxos existentes de Home, vitrine, seleção, Top10/Dica, detalhe, foco e RETURN. E2E vem antes de solicitar tizen-tv/tizen-emulator. Percentuais continuam verificados no build de produção pelo benchmark, não por E2E dev.

## TV recomendada

Depois dos gates, caso solicitada validação física, usar tizen-tv sem backend obrigatório. Registrar aparelho/engine, abertura e rotas/chunks locais, foco/controle real e navegação prolongada/memória quando houver instrumento disponível. Status pode ficar recomendada/pendente sem bloquear esta feature. Browser/emulador não estabelecem RAM total, codec, AVPlay ou desempenho físico.
