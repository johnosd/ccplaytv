# Bug Assessment: Prefetch de categoria sem cancelamento de requisição HTTP em voo

- **Slug**: prefetch-concorrente-categoria-sem-cancelamento-requisicao
- **Criado**: 2026-09-25
- **Origem**: relato direto do usuário durante validação em TV física da feature `016-zapping-live-tv`
- **Veredito**: valid
- **Severidade**: high

## Report

Usuário, testando o app na TV física (Samsung QN50Q60DAGXZD) com uma fonte
Xtream real (41 categorias em Live TV), entrou numa categoria pequena
("Telecine", 14 canais) e a tela ficou em "Carregando canais..." por mais
de 1 minuto antes dos canais aparecerem. Segundo o usuário, essa demora é
"inadmissível para experiência do usuário".

## Symptom

Entrar numa categoria de Live TV pode levar dezenas de segundos a mais de
um minuto para carregar, mesmo quando a categoria em si tem poucos itens —
a demora não é proporcional ao volume de dados da categoria que a pessoa
efetivamente abriu.

## Reproduction

1. Fonte Xtream real com uma trilha de categorias longa (dezenas de
   categorias) em Live TV.
2. Navegar pela trilha de categorias com as setas, passando por várias
   categorias em ritmo humano normal (pausando o suficiente em cada nome
   para lê-lo — não instantâneo).
3. Chegar numa categoria pequena e pressionar OK para entrar.
4. **Observado na TV física**: "Carregando canais..." por mais de 1 minuto
   antes de aparecer os 14 canais da categoria.
5. **Reproduzido no navegador do PC** (`localhost:5173`, mesma fonte real,
   via Playwright) para diagnóstico: a entrada em si levou só 57ms (dado
   já estar em cache de uma sessão de teste anterior), mas a inspeção da
   aba de rede confirmou 5-6 requisições HTTP reais e concorrentes contra
   o provedor (`GET .../player_api.php?...action=get_live_streams&category_id=<id>`,
   um `category_id` repetido) disparadas **durante a navegação pela trilha**,
   antes mesmo de qualquer OK ser pressionado na maioria delas — evidência
   sanitizada, sem URL/credencial completa neste documento.

Numa rede rápida (dev/LAN local) esse padrão é invisível — cada requisição
responde em milissegundos. A hipótese é que, na rede real da TV (WiFi
doméstico, latência até o provedor), essas requisições concorrentes
competem pelo limite de conexões simultâneas do navegador contra a mesma
origem, e a categoria que a pessoa realmente abriu pode ficar na fila
atrás de várias outras — daí a demora desproporcional ao tamanho da
categoria alvo.

[NEEDS CLARIFICATION: a demora >1min não foi cronometrada com precisão nem
reproduzida sob a mesma rede/latência da TV — a reprodução no PC confirma
o PADRÃO (múltiplas requisições concorrentes reais), não o TEMPO exato.
A fase Test deveria, se possível, confirmar a melhora medindo na própria
TV física, não só no navegador.]

## Suspected Code Paths

- `tv-web/src/features/catalog/catalogApi.ts:290-313` (`useCategoryFocusPrefetch`) — dispara `prefetchCategoryContent` a cada categoria onde o cursor da trilha pausa por `CATEGORY_PREFETCH_DEBOUNCE_MS` (300ms, linha 239). O `useEffect` cancela o **timer** se o foco mudar antes dele disparar (`clearTimeout` no cleanup), mas uma vez que o timer dispara e a chamada de rede começa, nada a cancela.
- `tv-web/src/features/catalog/catalogApi.ts:248-257` (`prefetchCategoryContent`) — `queryClient.prefetchQuery({ queryFn: () => loadCategoryContent(...) })`, sem passar nenhum `AbortSignal` para a query function.
- `tv-web/src/lib/catalog/categoryLoader.ts:128-163` (`fetchAndStore`) — chama `fetchMappedItems` → `fetchLiveStreams`/`fetchVodStreams`/`fetchSeries`, sem receber nem propagar nenhum sinal de cancelamento.
- `tv-web/src/lib/catalog/xtreamConnector.ts:128-154` (`fetchJsonDirect`) — `response = await fetch(url)`, sem `AbortController`, sem timeout. É aqui que a requisição HTTP real fica presa até o servidor responder (ou a conexão cair), independente de o foco já ter saído daquela categoria há muito tempo.
- `categoryLoader.ts`'s `dedup()`/`inFlight` Map (linhas 206-213) evita uma SEGUNDA busca concorrente para a MESMA categoria, mas não limita quantas categorias DIFERENTES podem ter uma busca em voo ao mesmo tempo, nem prioriza a que a pessoa efetivamente entrou sobre as que só foram focadas de passagem.

## Root Cause Hypothesis

**Confiança: high** (evidência de rede real capturada; mecanismo totalmente
explicado pelo código lido, sem necessidade de suposição sobre o provedor).

`useCategoryFocusPrefetch` (feature 010, R-013 — desvio deliberado pedido
pelo usuário em 23/09/2026 para a entrada nunca "parecer primeira vez") foi
desenhado para prefetchar só a categoria onde o cursor efetivamente parou,
usando debounce. Mas o debounce só protege contra **agendar** timers demais
— uma vez que um timer dispara e a chamada HTTP começa, ela roda até
completar (sucesso ou erro), sem jeito de cancelá-la se o foco já mudou.
Numa trilha longa (41 categorias reais, bem mais que qualquer fixture usada
em dev/testes automatizados), navegação humana normal facilmente dispara
5+ dessas buscas "esquecidas" em sequência. Numa rede rápida isso nunca foi
percebido; numa rede doméstica real, com latência genuína até o provedor,
essas requisições concorrentes competem por banda e pelo limite de
conexões simultâneas do navegador contra a mesma origem, atrasando a
categoria que a pessoa realmente quer ver.

## Proposed Remediation

**Preferida**: propagar um `AbortSignal` por todo o caminho de busca de
categoria (`prefetchCategoryContent` → `loadCategoryContent`/`ensureCategory`
→ `fetchAndStore`/`fetchMappedItems` → `fetchLiveStreams`/`fetchVodStreams`/
`fetchSeries` → `fetchJsonDirect`'s `fetch(url, { signal })`), e abortar o
prefetch anterior no cleanup de `useCategoryFocusPrefetch` sempre que o
foco mudar antes dele completar — não só antes dele disparar. Isso mata a
requisição em voo assim que deixa de ser relevante, em vez de deixá-la
terminar sozinha competindo por banda.

**Alternativas** (opcional):
- Aumentar `CATEGORY_PREFETCH_DEBOUNCE_MS` para reduzir a frequência de
  disparo — mitiga, mas não resolve: ainda deixaria requisições órfãs
  rodando se a pessoa passar por várias categorias com pausas de leitura
  reais (>debounce) sem terminar de decidir onde entrar.
- Limitar quantas buscas de prefetch podem estar em voo simultaneamente
  (ex.: fila de tamanho 1, cancelando a anterior ao agendar uma nova) —
  equivalente em efeito prático ao `AbortSignal`, mas sem tocar
  `xtreamConnector.ts`; mais simples de implementar, porém não cancela a
  conexão TCP/HTTP em si (a banda/conexão do navegador continua ocupada
  até o servidor responder, só o resultado é descartado no cliente).

**Files likely to change**:
- `tv-web/src/features/catalog/catalogApi.ts` (`useCategoryFocusPrefetch`, `prefetchCategoryContent`)
- `tv-web/src/lib/catalog/categoryLoader.ts` (`ensureCategory`, `fetchAndStore`, `fetchMappedItems`)
- `tv-web/src/lib/catalog/xtreamConnector.ts` (`fetchJsonDirect`, `fetchLiveStreams`/`fetchVodStreams`/`fetchSeries`)

**Tests to add or update**:
- Unitário: focar categoria A, avançar o debounce, focar categoria B antes
  do `fetch` de A resolver — confirmar que o `AbortSignal`/sinal de A foi
  acionado (mock de `fetch` capturando `signal.aborted`).
- Unitário: navegar por N categorias rapidamente (dentro do debounce cada
  uma) e confirmar que no máximo 1 busca de prefetch chega a `fetch` de
  fato — as demais são canceladas antes de sair.
- Confirmar que **entrar de fato** numa categoria (SELECT, não só foco)
  nunca é abortada por essa lógica — só prefetches de categorias que a
  pessoa não entrou.

## Risks & Considerations

- `queryClient.prefetchQuery` do React Query v5 já aceita/propaga um
  `signal` para a `queryFn` quando a query é cancelada/desmontada — vale
  confirmar se dá para aproveitar esse mecanismo nativo em vez de gerenciar
  um `AbortController` manual em paralelo, para não duplicar lógica de
  cancelamento.
- `fetchJsonDirect`/`probeFailureKind` fazem uma segunda chamada de rede
  (`no-cors`) quando a primeira falha, para diagnosticar o tipo de erro —
  um `AbortError` (cancelamento deliberado) precisa ser diferenciado de uma
  falha de rede real, para não disparar esse probe desnecessariamente nem
  marcar a categoria como `failed`/`stale-served` só porque foi cancelada
  de propósito.
- Mudança toca um caminho compartilhado por Live TV, Filmes e Séries
  (`categoryLoader.ts` é genérico por `CategoryKind`) — testar os três,
  não só Live TV.
- Não é a feature `016-zapping-live-tv` (código-completo, aguardando só
  verificação manual) — este bug foi achado durante a sessão de validação
  dela, mas é pré-existente da feature `010-catalogo-sob-demanda`/`R-013`.

## Open Questions

- [NEEDS CLARIFICATION: a fase Test deveria confirmar a melhora na TV
  física de novo (mesma rede real), não só via testes automatizados —
  cronometrar a mesma categoria "Telecine" antes/depois do fix, se
  possível reabrir a sessão de validação com o usuário.]
