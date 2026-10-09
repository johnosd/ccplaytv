# Quickstart: feature 065

## Pré-requisitos

Windows PowerShell 5.1, Node/npm e dependências existentes de tv-web/. Não iniciar api/ nem usar docs/m3u/dados.md. Ambiente de benchmark isolado, sem credenciais reais. Nenhuma TV/emulador é instalada pelo plan.

Ler spec → plan → tasks → research/data-model/contracts/logic. Conferir branch feature/designWave2 e alterações locais antes de executar. A revalidação partiu do commit e0ec6ef, com workspace inicialmente limpo e planejamento/stubs versionados; capturar a baseline com as correções documentais desta passada identificadas. Fingerprint usa hashes dos arquivos de entrada, sem exportar diff/logs/segredos.

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

CLI implementada e verificada em T002/T005. A baseline `baseline/run-001` foi interrompida/rejeitada: datas de itens nos eventos variavam com a duração do loop, mudando desempates. Ver `baseline/run-001/rejected.md`; não usar/combinar suas amostras. A recaptura `baseline/run-002`, com datas editoriais fixas, só é válida quando existem `samples.json`/`report.md`, sem `failure.json`, e o comparador valida as 70 amostras. Os executores review-screen-perf/review-query-perf continuam evidência exploratória e não atendem o protocolo final.

### Referência congelada — T003/T004, 2026-10-08

`baseline/run-002` concluiu a matriz inteira: 70 amostras, sete por configuração, sem erros. `loadArtifact` + `validateArtifact` passaram; o fingerprint atual conferiu com o manifest antes de qualquer alteração do produto. Todas as etapas, seleção/contador e navegação normal mantiveram uma única variante funcional nas sete repetições. Nenhum Worker foi criado. O relatório e as amostras originais ficam imutáveis.

| Medida de referência (mediana, CPU4) | Resultado |
| --- | --- |
| Filmes após Home, local/100%/imagens | 1.560,10 ms |
| Seleção pura, local/100%/imagens | 721,60 ms |
| Heap retido H→F→S, local/100%/imagens | 27,90 MiB |
| Heap retido H→F→S, TMDB/100%/imagens | 36,22 MiB |
| Abertura sem lista/fria | 3.541,30 ms |
| JS até perfis, todas as aberturas | 1.007.752 bytes |
| Primeiro recorte da categoria de 30 mil | 281,10 ms |
| Pico temporário amostrado nessa categoria | 13,05 MiB |
| Episódios lidos em primeira entrada/reentrada/delta | 100.000 / 100.000 / 100.000 |

O relatório original inclui mínimo/máximo/MAD, as demais configurações e o custo de seed CPU1: cerca de 7,6–8,8 s nas telas, 19,9–22,4 s nos ciclos, 3,5 s na categoria e 22,9 s nos episódios. Seed não é importação nem preparação da projeção; esses números são referência do navegador com CPU4, sem comprovação de desempenho ou RAM na TV.

De tv-web/, após T001–T003:

~~~powershell
node scripts/bench/run-screen-perf.mjs --mode baseline --suite full --cpu 4 --repeat 7 --output bench-results/screen-perf-065/baseline/run-002
node scripts/bench/run-screen-perf.mjs --mode candidate --suite full --cpu 4 --repeat 7 --checks bench-results/screen-perf-065/checks-evidence.json --output bench-results/screen-perf-065/candidate/run-001
node scripts/bench/compare-screen-perf.mjs --baseline bench-results/screen-perf-065/baseline/run-002 --candidate bench-results/screen-perf-065/candidate/run-001
~~~

Runner constrói/serve produção em loopback, inicia/encerra seus próprios processos, recusa diretório existente e cria manifest.json, samples.json e report.md. A matriz full contém dez configurações e sete amostras independentes por configuração. Nenhum teste/build/benchmark em paralelo. Comparador retorna código não zero em meta/regressão falha, amostra insuficiente ou ambiente incompatível.

`--checks` lê um JSON com os campos booleanos `contracts`, `faults`, `sharedQueries`, `firstInteraction`, `tizen`, `offlineRoutes`, `lint`, `types`, `tests`, `build`, `e2e`, `manual` e `secrets`. Campo ausente/falso não aprova seu gate. Só registrar `true` depois da verificação correspondente, com comando/evidência no relatório da fase; o coletor não executa esses gates nem os presume pela melhora dos números. Não incluir dados de conexão ou credenciais nesse arquivo.

O runner mantém uma trava exclusiva `.running` com seu PID. Uma interrupção deixa `failure.json` e amostras parciais, sem validade de baseline; preservar o diretório e usar outro run-id. Antes de remover uma trava órfã, verificar que seu PID realmente terminou. Não alterar harness/fixtures depois da captura: o comparador recusa hashes diferentes. Os scripts encerram apenas browser/servidor/diretórios temporários que criaram.

Diagnóstico sem valor de aceite:

~~~powershell
node scripts/bench/run-screen-perf.mjs --mode baseline --suite smoke --only screens-local-100-images --cpu 4 --output bench-results/screen-perf-065/diagnostic/novo-id
npm run test -- scripts/bench/screenFixtures.test.mjs scripts/bench/compare-screen-perf.test.mjs scripts/bench/screenInstrumentation.test.mjs src/bench/screenFixtureEvents.test.ts
~~~

Os diagnósticos `smoke-007` (categoria/detalhe/RETURN), `smoke-009` (dez ciclos de navegação e dez alternâncias entre três listas) e `smoke-010` (entrada normal/eventos) validaram a execução. São uma amostra cada e não demonstram nenhuma meta percentual. Depois da correção das datas, `smoke-011` repetiu TMDB20 sete vezes: todos os sete snapshots de cada etapa foram iguais, sem erro de página. Onze testes do coletor/comparador/privacidade/eventos, tipos e lint passaram; build/guard já passaram e o diagnóstico recompilou ambas as entradas. Os cinco contratos futuros permanecem vermelhos esperados e a trava está íntegra. Diagnóstico continua sem validade de baseline completa.

Antes de otimizar, baseline inclui interfaces/stubs preparados que não mudam comportamento, estado de arquivos/deps e fixtures identificados. Para eventos reais, adapter isolated chama o scheduler e grava dados reais, não cache invalidator. Novo src/bench/screenControl.ts nunca é importado no main de produção nem listado no pacote normal; se houver entrada de benchmark separada, seu custo/grafo são identificados e abertura/bytes continuam medidos no entrypoint normal.

Capturar variante com/sem TMDB simulado, 20%/100% elegíveis, imagens locais/sem imagens, 30k numa categoria, 100k episódios, histórico/favoritos e ciclos de três listas. Frio/quente, conversão inicial, pico temporário/Worker e heap estabilizado são resultados distintos. Não esconder reprojeção/aquecimento em um número frio. Sete execuções por cenário/configuração com mediana/dispersão e dados brutos.

Preparação sintética por IndexedDB usa CPU1 fora dos intervalos de tela; carga real usa CPU4. O relógio fixa o dia e continua avançando pelo tempo monotônico para não congelar gates de atividade. A fixture já contém blocos canônicos, sem importação/conversão legada. Derivações novas não são pré-criadas: seu custo aparece desde `home-cold`. A primeira categoria é medida após Home→Filmes→Séries/índice frio, não numa instalação vazia. Os ciclos usam três catálogos completos, com 100 favoritos/500 históricos por lista; as variantes de carga usam 1.000 favoritos/5.000 históricos.

Três publicações são programadas pelo scheduler real a cada 1 s; jank pode atrasar os callbacks, cujos horários observados ficam nas amostras. A observação continua por pelo menos 2 s após o último callback. Latência direcional é keydown→dois quadros; p95 usa posto mais próximo `ceil(0,95 × N)`, com 12 comandos por amostra/84 em sete execuções. CPU/heap/leituras são agregados, sem exportar payloads/URLs de requisição.

Imagens são SVGs locais procedurais; HTTP cache está desativado pelo routing. Heap é da thread principal, estabilizado e coletado via CDP; pico temporário amostrado a cada 100 ms. Registrar Workers separadamente: zero criações implica zero heap de Worker; criação positiva sem aferição separada impede aprovar SC-005. Abertura/bytes e primeira navegação são medidos no entrypoint normal; demais controles usam uma entrada virtual isolada cujo grafo não se confunde com o pacote da TV.

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
