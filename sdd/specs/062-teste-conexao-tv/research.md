# Pesquisa — Teste de conexão na TV

**Data:** 2026-10-06. Decisões locais da feature 062; arquitetura client-first preservada.

## R-001 — Motor e destino

**Decisão:** cliente próprio de `fetch`, com destino fixo `https://speed.cloudflare.com/__down?bytes=N`, sem SDK, upload ou envio de resultados.

**Justificativa:** a [documentação oficial da Cloudflare](https://github.com/cloudflare/speedtest/blob/main/README.md) descreve o endpoint de download e o motor completo. Esse motor inicia automaticamente por padrão e coleta resultados ao concluir. Um cliente pequeno permite controlar cada solicitação, cancelamento e orçamento sem reporte adicional. Não usar algoritmos/percentis do SDK como se fossem os algoritmos locais.

Uma consulta de **1 byte**, feita no PC em 2026-10-06 com `Origin: null`, retornou HTTP 200, corpo de 1 byte, `Access-Control-Allow-Origin: *`, `Timing-Allow-Origin: *` e `Content-Type: application/octet-stream`. Essa prova HTTP não comprova navegador/Tizen, disponibilidade futura ou atendimento de corpos maiores.

**Revalidação T001 (2026-10-06):** nova consulta de 1 byte, sem seguir redirecionamentos, confirmou os mesmos valores. `CatalogDb` continua em v16 (v17 livre); `CCPlayTv/config.xml` já declara privilégio internet e acesso externo. Hipóteses mantidas; CORS no navegador `file://` e corpos maiores continuam pendentes de T023.

**Alternativas consideradas:** SDK completo rejeitado pelo comportamento padrão e dificuldade de impor orçamento global; backend/bridge rejeitados por não haver necessidade demonstrada; URL configurável e fallback automático rejeitados por ampliarem tráfego e superfície de configuração. Falha do destino tem saída e repetição manual.

Não há compromisso de disponibilidade incorporado ao app. Antes da distribuição comercial, reavaliar os termos do serviço. Não presumir que um endpoint publicamente documentado concede SLA ou autorização comercial irrestrita.

## R-002 — Relógio, streams e cancelamento

**Decisão:** intervalos pelo relógio monotônico, data pelo relógio civil; ler e descartar blocos do corpo; `AbortController` para cancelar e aguardar limpeza.

**Justificativa:** [`performance.now()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) evita duração dependente de ajustes do relógio civil; [`Response.body`](https://developer.mozilla.org/en-US/docs/Web/API/Response/body) permite leitura incremental; [`abort()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort) interrompe fetch e consumo do corpo. Guardas de visibilidade/suspensão evitam retorno automático ao teste.

**Alternativas consideradas:** buffer integral rejeitado por memória; `ResourceTiming` como dependência obrigatória rejeitado, pois não é necessário para os intervalos HTTP escolhidos; ping ICMP não oferecido pelo transporte. Ausência de stream produz erro sanitizado, sem fallback integral.

## R-003 — Persistência

**Decisão:** singleton `networkDiagnostics`, Dexie v17; confirmar que v17 segue livre ao executar.

**Justificativa:** usar o armazenamento local existente e permitir teste com IndexedDB real/fake-indexeddb. O [comportamento de localStorage em `file:`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) é indefinido. Resultado pertence ao aparelho, sem `sourceId` ou histórico.

**Alternativas consideradas:** localStorage rejeitado para este dado novo; resultado por lista rejeitado pela decisão do usuário; cache remoto rejeitado por privacidade/escopo. Limpar dados gerais do app remove a tabela; não acrescentar botão de limpeza geral em Privacidade, que hoje só limpa histórico de lista.

## R-004 — Reprodução e tráfego concorrente

**Decisão:** preservar desmontagem do player ao navegar; usar `prefetchGate.blockReason(Date.now(), 0) === 'playback'` como guard de camada de mídia. Não parar/reiniciar o scheduler para executar o diagnóstico.

**Justificativa:** PlayerLayer e TrailerLayer adquirem holds de reprodução. O scheduler pode compartilhar uma carga de categoria em andamento; `stop()` não significa cancelar essa carga e reiniciar altera estado. O diagnóstico caracteriza a rota durante a medição, inclusive com eventual competição por rede; não promete capacidade máxima ou exclusividade.

**Alternativas consideradas:** fechar mídia por iniciativa do teste rejeitado por FR-011; usar um hold de playback fictício rejeitado pela semântica; redesenhar o scheduler rejeitado como escopo adicional. Verificar fisicamente a cobertura do guard, especialmente ciclo de vida do trailer.
