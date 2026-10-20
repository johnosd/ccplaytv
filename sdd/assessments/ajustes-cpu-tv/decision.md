# Assessment Decision: Ajustes finos de CPU na TV

- **Slug**: ajustes-cpu-tv
- **Decidido**: 2026-10-19
- **Problem**: ./problem.md
- **Veredito**: go (reavaliado em 2026-10-19 após a medição na TV; antes: needs-clarification)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | weak | O tempo de montagem (~2 s) foi medido na TV, mas é tempo total. Não se sabe se a tela trava, e o usuário não percebeu lentidão. |
| Força da evidência | weak | A remontagem a cada lote da pré-carga com a tela aberta foi confirmada no código, mas o efeito na tela não foi medido. |
| Valor vs. custo de inação | unknown | Depende de haver travamento. Sem ele, o valor fica perto de zero. |
| Viabilidade / apetite | strong | A mudança é pequena e tem precedente no app (`yieldToMain` da vitrine, `catalogApi.ts:1663-1673`). A sonda já tem o código real empacotado (`memoria/entrada.ts`). |
| Fit estratégico | adequate | Segue a linha da 083 (foco leve) e da 079: a TV responder ao controle. |

## Abordagens Candidatas

### A. Medir quadros, depois fatiar e parar de remontar à toa

- Na sonda, `P.frames` mede os quadros enquanto o índice real é montado, uma vez e em sequência a cada 1 s.
- Se travar: montar em fatias com `yieldToMain` e não reagir a cada lote da pré-carga enquanto a tela está aberta
  (marcar como velho e remontar na próxima entrada, como "Todos" na ordem da fonte já faz com `refetchType: 'none'`).
- **Recomendada**: sim. É o rumo escolhido pelo usuário, com a menor mudança.

### B. Montar o índice no Worker

- Tira o trabalho da thread principal, mas o índice volta à interface por clone, que custou 195 ms para 11 mil objetos.
- **Recomendada**: não agora.

### C. Guardar o índice pronto no IndexedDB

- Abre mais rápido, mas mexe no formato de gravação da 082.
- **Recomendada**: não agora.

## Veredito

`needs-clarification`. O escopo ficou bem delimitado (só a montagem do índice de busca; ordenação, Worker e capas
saíram), mas o problema em si ainda não foi provado: a sonda mediu tempo, não travamento, e o uso não mostrou
lentidão.

### Se needs-clarification — Perguntas Bloqueantes

- Na TV, com a lista real, montar o índice da busca global e de "Todos" por nome trava a tela? Medir pior quadro e
  quadros > 50 ms com o código real empacotado: uma montagem, e remontagem a cada 1 s por ~10 s (o caso da pré-carga).
- Critério para `go`: algum quadro > 100 ms, ou mais que 5 quadros > 50 ms numa montagem, ou travamento contínuo com a
  remontagem a cada 1 s. Se nenhum desses ocorrer, `kill`.

**Fase a revisitar**: explora (anexar a medição e rodar Decide de novo)

## Reavaliação após a medição na TV (2026-10-19)

Evidência: `./evidencias/quadros-indice-tv-2026-10-19.md`. Foram 2 instalações × 2 rodadas, com o código real.

| Critério | Antes | Agora | Notas |
| --- | --- | --- | --- |
| Validade do problema | weak | **strong** | A tela trava de verdade: busca global com 15–19 quadros > 50 ms (pior 183–250 ms); "Todos" A–Z congela 933–1 233 ms; com remontagem a cada lote, 15–17 fps por 10 s. |
| Força da evidência | weak | **strong** | Aparelho real, código real, 4 medições concordantes. |
| Valor vs. custo de inação | unknown | adequate | O usuário não percebeu, mas ~1 s sem resposta ao controle viola a regra "o foco é o estado mais importante" da constitution. |
| Viabilidade / apetite | strong | strong | Precedente de fatias no app (`yieldToMain` da vitrine); `refetchType: 'none'` já é usado para "Todos" na ordem da fonte. |
| Fit estratégico | adequate | adequate | Sem mudança. |

Veredito: **`go`**. O critério combinado antes de medir foi atingido em todos os cenários, nas quatro medições.

### Se go — Handoff

- **Problema**: na TV, montar o índice de busca de um tipo inteiro trava a thread principal. A busca global trava ~2 s
  ao abrir; "Todos" ordenado por nome congela ~1 s na ordenação; e, com a pré-carga invalidando o índice a cada lote
  (~1 s), a tela fica em 15–17 fps enquanto essas telas estão abertas.
- **Abordagem recomendada** (escolhida pelo usuário: fatias + não remontar à toa):
  1. montar o índice em fatias que cedem a vez à interface (`yieldToMain`, como `loadShowcaseSelections`);
  2. não remontar o índice a cada lote da pré-carga com a tela aberta: marcar como velho e reler na próxima entrada, ou
     no máximo uma vez por intervalo definido no spec;
  3. ordenar "Todos" por nome sem uma tarefa longa, **mantendo a ordem de hoje** (`Intl.Collator('pt-BR', base)`, decisão
     do usuário). Caminhos possíveis para o spec: ordenar em fatias ou em Worker com o mesmo Collator, ou guardar a
     ordem calculada uma vez por geração.
- **Escopo sugerido**: entra `loadSearchIndex`/`loadGlobalSearchIndex`, `useAggregatedItems`/`sortVodItems` em "Todos" e
  as invalidações de `global-search-index`/`catalog-search-index` em `prefetchApi.ts`. Não entram: mudar a ordem A–Z,
  Worker para mensagens, capas, o formato de gravação da 082 nem os resultados de busca.
- **Métricas de sucesso** (sonda `quadrosIndice` antes e depois, na TV, lista real): durante a montagem, **nenhum quadro
  > 100 ms** e pior quadro ≤ 50 ms; "Todos" A–Z sem quadro > 100 ms; com a pré-carga, no máximo uma remontagem por
  entrada na tela (ou por intervalo do spec) e ≥ 50 fps. Resultados de busca e ordem A–Z idênticos aos de hoje (testes
  de regressão). Linha de base: as quatro medições da evidência.
- **Perguntas em aberto para o `sdd-specify`**:
  - Com a busca aberta, a cobertura ("Busca em X de Y") pode ficar defasada até a próxima entrada, ou precisa atualizar
    em intervalo?
  - Ordenar em fatias, em Worker ou guardar a ordem pronta: qual cabe melhor?
  - A sonda roda sem React; o spec deve pedir também a leitura do `PerfOverlay` no app real.

## Descartados no Define (decisão do usuário, 2026-10-19)

- **Ordenação por chave pronta**: mudaria a ordem A–Z de 126 pares em 11 mil nomes para ganhar ~85 ms. A ordem de hoje
  fica.
- **Mensagens entre Workers**: sem alvo; nenhum Worker manda objetos grandes à interface.
- **Capas com `createImageBitmap`**: ganho não provado; `img.decode()` já é assíncrono e só espera a imagem.

**Especificada (2026-10-20)**: `sdd/specs/084-indice-busca-sem-travar/spec.md`.
