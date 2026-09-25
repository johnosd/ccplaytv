# Implementation Plan: Capa Real de Filmes e Séries

**Slug**: `015-capa-real-filmes-series` | **Date**: 2026-09-24 | **Spec**: `sdd/specs/015-capa-real-filmes-series/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Hoje nenhuma capa carrega: nem o conector Xtream (`xtreamConnector.ts`) nem
o parser M3U (`m3uParser.ts`/`classifier.ts`) capturam o campo de capa que a
fonte já declara, `CatalogRecord` não tem onde guardá-lo, e `MoviesScreen.tsx`/
`SeriesScreen.tsx` sempre renderizam o mesmo placeholder (`.poster-box-noise`).
Esta feature fecha essa cadeia inteira, sem tocar em nenhuma API nova: captura
`stream_icon` (VOD)/`cover` (série) no protocolo Xtream e o atributo
`tvg-logo` numa entrada M3U, guarda como `iconUrl` em `CatalogRecord`
(campo novo, sem índice — não exige bump de versão do Dexie), expõe como
`icon_url` no DTO (`CatalogItemOut`), e um componente novo (`PosterArt`)
renderiza a imagem real quando existe, com fallback automático ao
placeholder atual — tanto para item sem capa declarada quanto para falha de
carregamento. Live TV não muda (FR-009).

## Technical Context

**Language/Version**: TypeScript ~6.0 (`tv-web/`), React 19, alvo de build
`chrome108` (Tizen 8.0).

**Primary Dependencies**: Dexie 4 (IndexedDB), `@tanstack/react-query` 5,
`@tanstack/react-virtual` 3 (grades já virtualizadas — feature 009).
Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie, banco `ccplaytv`, hoje na v10. Esta
feature **não bump a versão**: `iconUrl` é um campo de valor comum, sem
índice — Dexie não versiona campos não-indexados (confirmado: feature 010
já adicionou `declaredCount`/`itemsFetchedAt`/`providerStreamId` etc. a
`CatalogRecord`/`CategoryRecord` sem nenhum `this.version(N)` dedicado a
esses campos — só tabelas e índices novos exigiram bump nas features
007–014).

**Testing**: Vitest 5 + jsdom + `fake-indexeddb` (`npm run test`);
Playwright via script Node (`npm run test:e2e`) — esta feature acrescenta
`e2e/capa-real.mjs`. Lint `oxlint`, tipos `tsc -b` (`npm run build`).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 8.0 / Chromium 108).
Desenvolvimento e verificação no navegador (`npm run dev`); TV física não é
gate obrigatório para esta feature (constitution, "Validação em hardware
real" — nenhuma capacidade de player/DRM/codec envolvida).

**Performance Goals**: SC-003 (spec) — rolar a grade com capas carregando
não pode travar nem soletrar mais devagar que hoje. Sem meta numérica nova;
garantida estruturalmente pela janela da virtualização já existente
(feature 009, D-007) — uma capa só é requisitada quando o item entra na
janela virtual (visível + overscan), nunca a categoria inteira de uma vez,
pedido explícito do usuário nesta sessão. `loading="lazy"` +
`decoding="async"` no `<img>` (prática documentada em
`docs/iptvnator/08-tela-filmes.md` #1) é reforço complementar sobre essa
janela já pequena, não o mecanismo principal.

**Constraints**:
- URL de capa segue a mesma cobertura de segredo da ADR-010/constitution
  1.5.0 (D-008 abaixo).
- Carregamento de capa segue a janela da virtualização (feature 009) —
  nunca a lista inteira de uma vez (D-007 abaixo).
- Carregamento de imagem é sempre assíncrono e nunca bloqueia foco/seleção
  (constitution, "Foco Visível e Sem Becos Sem Saída").
- Nenhuma chamada nova a serviço externo — só o que Xtream/M3U já
  declaram (FR-011 da spec).

**Scale/Scope**: grades de Filmes e Séries já virtualizadas (feature 009,
centenas a milhares de itens); Live TV fora de escopo (FR-009).

## Decisões Invariantes

- **D-001 — Um campo por caminho, sem cascata multi-campo especulativa.**
  Xtream VOD: `stream_icon`. Xtream série: `cover`. M3U (avulsa, painel não
  confirmado, ou Modo limitado — todos os caminhos que já passam por
  `classifyEntry`): atributo `tvg-logo` da entrada. Nenhum outro nome de
  campo é tentado — `docs/iptvnator/08-tela-filmes.md` #1 documenta uma
  cascata de 3 campos (`poster_url → cover → stream_icon`) para um modelo
  que também cobre portais Stalker (que o CCPlay não suporta — backlog
  item 41, "A avaliar"); sem evidência própria de que um painel Xtream real
  usa `poster_url`, inventar esse campo violaria "IA e Classificação Nunca
  Inventam Dados". Se a verificação manual (T0XX) encontrar um painel que
  usa outro nome, isso vira achado registrado, não uma suposição prévia.
- **D-001b — Validação de forma num só lugar.** `normalizeIconUrl(raw:
  unknown): string | undefined` — função pura nova em `classifier.ts`
  (trim, string vazia → `undefined`, `new URL(...)` que lança → `undefined`).
  `classifyEntry` (M3U) e `mapVodEntry`/`mapSeriesEntry` (Xtream, que já
  importam de `classifier.ts`) chamam a mesma função — evita triplicar a
  mesma checagem em três capturas diferentes (achado do Analyze desta
  sessão de planejamento).
- **D-002 — Nome do campo.** `iconUrl` em todo o pipeline interno
  (`ClassifiedEntry`, `MappedChannel`, `CatalogRecord`, `StoredCatalogRecord`
  — os dois últimos via `Omit`, herdam automaticamente); `icon_url` no DTO
  de fronteira `CatalogItemOut` (mesma convenção `snake_case` que os demais
  campos desse tipo já usam).
- **D-003 — Série sintética M3U herda a capa do primeiro episódio.**
  `createSeriesGrouper` (`m3uSeriesGrouping.ts`) monta o registro `series`
  na primeira vez que a chave aparece; esse registro passa a copiar
  `entry.iconUrl` do episódio que o originou. Não é invenção — é o dado que
  aquele episódio já declarou, só reaproveitado no nível de série —, mas é
  uma aproximação aceita e documentada, no mesmo espírito do risco já
  aceito pela feature 012 para correspondência de série por título
  normalizado (spec 012, Fora de Escopo).
- **D-004 — Pontos de captura são os que já produzem `MappedChannel`/
  `ClassifiedEntry` para filme/série, nenhum ponto novo.** `mapVodEntry`/
  `mapSeriesEntry` (Xtream — usados tanto por `ingestProviderStructure`
  quanto por `categoryLoader.fetchMappedItems`, então a captura vale para
  os dois: importação e leitura sob demanda de categoria) e `classifyEntry`
  (M3U — usado tanto por `scanToStored`/`classifyWithGroupOrder` quanto por
  qualquer consumidor futuro do parser). `mapLiveEntry` (canal, Xtream e
  M3U) **nunca** ganha este campo — nem lido, nem gravado (FR-009).
- **D-005 — `PosterArt`, componente novo compartilhado
  (`tv-web/src/components/PosterArt.tsx`).** Substitui o par
  `.poster-box-noise` + `.poster-box-label` inline que hoje se repete,
  idêntico, em `MoviesScreen.tsx` e `SeriesScreen.tsx`. Sempre renderiza a
  camada de placeholder (textura + título) por baixo; quando há `url`, uma
  `<img>` cobre por cima (`object-fit: cover`, preenchendo o
  `aspect-ratio: 2/3` que `.poster-box` já define); ao falhar
  (`onError`), o componente marca estado local "falhou" e para de
  renderizar a `<img>` — a camada de placeholder, que nunca deixou de
  existir por baixo, cobre o fallback sem lógica condicional extra.
  `PosterArt` **confia** que `url`, quando presente, já passou pela
  validação de forma (não vazia, `new URL(...)` aceita) feita na captura
  (classifier.ts`/`xtreamConnector.ts` — FR-008, fonte única desta regra,
  ver `data-model.md` §3); o componente só checa "existe ou não" (`Boolean(url)`),
  nunca reparseia — evita duplicar a mesma validação em duas camadas.
  Sem `url`: a `<img>` nunca chega a ser montada, mesmo estado do
  placeholder puro. Nenhuma nova tentativa automática depois de uma falha
  de carregamento real (FR-007) — falhar
  uma vez é definitivo até a próxima geração do catálogo (ressincronização
  monta um componente novo, com `url` novo ou ausente).
- **D-006 — Carregamento nunca bloqueia foco/navegação.** `PosterArt` não
  tem estado de "carregando" que impeça a interação — o card já é focável
  e selecionável antes, durante e depois da imagem carregar (constitution,
  "Foco Visível e Sem Becos Sem Saída"; "Progresso e Capacidades São
  Reais").
- **D-007 — Capa carrega na mesma janela da virtualização, nunca a lista
  inteira de uma vez.** Pedido explícito do usuário (24/09/2026): capas
  devem seguir o mesmo esquema já implementado pela virtualização (feature
  009) — carregar conforme a pessoa navega, não tudo de antemão. Isso já é
  a consequência estrutural de onde `PosterArt` entra no código, não uma
  camada extra a construir: `MoviesScreen.tsx`/`SeriesScreen.tsx` iteram
  **só** `movieVirtualizer.getVirtualItems()`/`seriesVirtualizer.
  getVirtualItems()` (o subconjunto atualmente visível + a margem de
  overscan do `@tanstack/react-virtual`) para decidir quais `poster-cell`
  existem no DOM — um item fora dessa janela não tem `<div>` nenhum
  renderizado, então `PosterArt` **nem chega a montar**, e o navegador
  nunca inicia a requisição da imagem dele. Rolar a grade destrói os nós
  (e cancela requisições de imagem em voo, comportamento nativo do
  navegador ao remover um `<img>` do DOM) e cria os novos conforme a janela
  virtual muda — exatamente o "carregar conforme navega" pedido.
  `<img loading="lazy" decoding="async">` (prática recomendada em
  `docs/iptvnator/08-tela-filmes.md` #1) é reforço complementar sobre essa
  janela já pequena — layout `lazy` evita decodificar uma imagem que
  entrou na janela de overscan mas ainda não está de fato visível —, nunca
  o mecanismo principal. **Critério de aceite concreto** (vira teste, ver
  Estratégia de Testes): importar uma fonte com centenas de itens com capa
  e nunca rolar a grade — o número de requisições de imagem observadas
  fica limitado ao que a janela virtual (visível + overscan) desenha, não
  ao total de itens da categoria.
- **D-008 — Capa segue a mesma cobertura de segredo da ADR-010/constitution
  1.5.0.** A URL pode ser guardada no aparelho e usada como `src` de
  `<img>` — equivalente a usar `directUrl` como `src`/parâmetro de
  `open()` do player, já sancionado pela mesma exceção (o que "sai" pra
  tela é o conteúdo buscado, não o texto da URL). Continua proibido:
  logar a URL bruta em qualquer evento (inclusive `onError` — o handler de
  falha nunca deve fazer `console.*`/`logger.*` com a URL, só um contador
  silencioso), exibir a URL como texto em tela/cartão/erro, ou mandá-la a
  terceiro. Risco residual aceito, idêntico ao já aceito para URL de
  reprodução: se um painel algum dia embutir credencial numa URL de capa,
  a requisição do navegador (DevTools) exporia isso — mesma exposição que
  a URL de reprodução já tem, não uma categoria nova de risco.
- **D-009 — Sem migração retroativa, sem bump de versão do Dexie (FR-010).**
  Fonte importada/lida antes desta feature simplesmente não tem `iconUrl`
  nos registros já gravados — `PosterArt` recebe `url: undefined` e mostra
  o placeholder, como qualquer item sem capa. Só a próxima
  ressincronização grava o campo. Mesmo padrão de campo novo sem
  `.upgrade()` já usado nas features 010/012/013/014.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

Constitution v1.5.0.

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Não toca acesso/conta. |
| Segredos Fora dos Clientes e dos Logs | OK (D-008) | OK | Capa segue a mesma cobertura da ADR-010 — guardável, usável como `src`, nunca logada/exibida como texto/enviada a terceiro. `onError` nunca loga a URL. |
| Categorias da Fonte São Preservadas | N/A | N/A | Não mexe em categoria/taxonomia. |
| IA e Classificação Nunca Inventam Dados | OK (D-001/D-003) | OK | Só os campos que a fonte já declara; nenhum nome de campo especulativo; série sintética reaproveita dado real do primeiro episódio, documentado como aproximação aceita, nunca invenção. |
| Comandos Locais Independem de Rede | N/A | N/A | Carregar imagem é rede oportunista sobre conteúdo já importado — mesma natureza de tocar mídia, não um "comando local" no sentido do princípio. |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Nenhuma ação nova; card continua ativável por SELECT independente do estado da imagem (D-006). |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | Não mexe no parser de estrutura, só num atributo adicional da mesma entrada já classificada. |
| Foco Visível e Sem Becos Sem Saída | OK (D-006) | OK | Carregamento/falha de imagem nunca desabilita nem esconde o `tv-focus` do card. |
| Voltar Restaura Foco e Posição | N/A | N/A | Nenhuma navegação nova. |
| Identidade de Reprodução Não Depende da URL | OK | OK | `iconUrl` nunca entra em `buildStableId`/favorito/retomada — é só apresentação. |
| Progresso e Capacidades São Reais | OK (D-007) | OK | Sem capa nunca finge ter; card sem `icon_url` mostra o placeholder de sempre, nunca um estado de "carregando" permanente. Carregamento de capa segue a mesma janela virtualizada da feature 009 (D-007) — nunca a lista inteira de uma vez, pedido explícito do usuário nesta sessão. |
| Documentação É Canônica | OK | OK | Backlog item 8 já emendado ao criar a spec; Polish atualiza `CLAUDE.md` se o estado da feature mudar algo lá. |

Nenhuma violação.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/015-capa-real-filmes-series/
├── spec.md
├── plan.md                         # este arquivo
├── data-model.md                   # campo novo iconUrl/icon_url, sem bump de versão
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/
│   ├── capa-real.mjs               # novo
│   └── fixtures/
│       └── capa-real/              # novo: PNGs fictícios + M3U com tvg-logo
├── package.json                    # test:e2e ganha o script novo
└── src/
    ├── components/
    │   └── PosterArt.tsx           # novo: imagem real + fallback compartilhado
    ├── features/
    │   ├── catalog/catalogApi.ts   # CatalogItemOut.icon_url; toItemOut
    │   ├── movies/MoviesScreen.tsx # usa PosterArt no lugar do placeholder inline
    │   ├── series/SeriesScreen.tsx # idem
    │   └── screens.css             # classes de PosterArt (reaproveita .poster-box*)
    └── lib/catalog/
        ├── db.ts                   # CatalogRecord.iconUrl (sem bump de versão — D-008)
        ├── classifier.ts           # ClassifiedEntry.iconUrl; classifyEntry lê tvg-logo
        ├── m3uSeriesGrouping.ts    # série sintética herda iconUrl do 1º episódio (D-003)
        ├── xtreamConnector.ts      # mapVodEntry lê stream_icon; mapSeriesEntry lê cover
        ├── categoryLoader.ts       # toItemRecord inclui iconUrl (caminho on_demand)
        └── importPipeline.ts       # toStoredRecord inclui iconUrl (caminho stored)
```

**Structure Decision**: frontend único em `tv-web/`; lógica de catálogo em
`tv-web/src/lib/catalog/`; componente compartilhado novo em
`tv-web/src/components/` (mesmo diretório de `ConfirmDialog.tsx`,
`PlayerLayer.tsx` — componentes usados por mais de uma tela); telas em
`tv-web/src/features/`. Backend `api/` não é tocado (ADR-008).

## Complexity Tracking

Sem violações a justificar.

## Estratégia de Testes

Prioridade: unitário → integração (Dexie com `fake-indexeddb`) → componente
(React Testing Library) → E2E (Playwright contra `npm run dev`) → manual
(`quickstart.md`).

- **Unitário**: `classifier.test.ts` (`tvg-logo` capturado como `iconUrl`,
  ausente quando o atributo não existe); `xtreamConnector.test.ts`
  (`mapVodEntry` lê `stream_icon`, `mapSeriesEntry` lê `cover`, `mapLiveEntry`
  nunca ganha o campo); `m3uSeriesGrouping.test.ts` (série sintética herda
  `iconUrl` do primeiro episódio; episódios seguintes não recriam a série).
- **Integração**: `categoryLoader.test.ts` (`toItemRecord` propaga
  `iconUrl` no caminho `on_demand`); `importPipeline.test.ts`
  (`toStoredRecord` propaga `iconUrl` no caminho `stored`); `catalogApi.test.tsx`
  (`toItemOut` expõe `icon_url`).
- **Componente**: `PosterArt.test.tsx` (novo) — renderiza `<img>` quando
  `url` é uma string não vazia; nunca monta `<img>` para `undefined`/string
  vazia/URL inválida (FR-008); some a `<img>` e revela o placeholder ao
  disparar `onError` (FR-007), sem re-tentativa; card permanece com a
  classe de placeholder por baixo em qualquer caso; `<img>` sempre recebe
  `loading="lazy"` e `decoding="async"` (D-007). `MoviesScreen.test.tsx`/
  `SeriesScreen.test.tsx`: item com `icon_url` renderiza `PosterArt` com a
  URL certa; item sem `icon_url` continua no placeholder puro (sem
  regressão dos testes existentes de foco/seleção/favorito); **teste novo
  específico de D-007**: com uma lista de centenas de itens com `icon_url`
  e a janela de virtualização/`jsdom` simulando um viewport pequeno, contar
  quantos elementos `<img>` existem no DOM de uma vez — tem de ficar preso
  ao tamanho da janela virtual (visível + overscan de
  `@tanstack/react-virtual`), nunca ao total de itens da lista.
- **E2E** (`e2e/capa-real.mjs`, servidor HTTP local com PNGs fictícios,
  contador de requisições por caminho — mesmo padrão de
  `e2e/m3u-sob-demanda.mjs`): importar uma fonte cujo M3U declara
  `tvg-logo` para um filme e uma série; a grade de Filmes/Séries mostra
  `<img>` com a URL certa; um item com `tvg-logo` apontando para um
  caminho inexistente do mesmo servidor cai no placeholder, sem ícone de
  imagem quebrada no DOM; Live TV, na mesma fonte, permanece com o
  placeholder de sempre mesmo que a entrada correspondente tenha
  `tvg-logo` (FR-009). **Cenário específico de D-007**: fonte com uma
  categoria de dezenas de filmes com `tvg-logo` distintos; sem rolar a
  grade, o contador do servidor fictício registra só as requisições de
  imagem dos itens visíveis (bem menos que o total da categoria); rolar a
  grade até o fim faz o contador crescer conforme novos itens entram na
  janela — nunca todas de uma vez no carregamento inicial.
- **Manual** (`quickstart.md`): os mesmos cenários no navegador, mais a
  verificação visual de que a rolagem da grade não trava.

Comandos-base (em `tv-web/`):

```powershell
npm run test -- src/lib/catalog/classifier.test.ts src/lib/catalog/xtreamConnector.test.ts src/lib/catalog/m3uSeriesGrouping.test.ts
npm run test
npm run lint
npm run build
npm run dev            # outro terminal, antes do E2E
npm run test:e2e
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída. Fixtures de imagem prontas; M3U movido para inline no E2E (ajuste registrado em `tasks.md`). |
| Foundational (Fase 2) | Concluída. `PosterArt.tsx` (com `children` pra overlay, acréscimo em relação ao plano), schema (`CatalogRecord.iconUrl`), DTO (`CatalogItemOut.icon_url`), CSS (`.poster-box-art`). 38/38 testes, lint/build limpos. |
| US1 — capa real | Concluída. Captura nos dois caminhos de importação (Xtream `on_demand`, M3U `stored`), série sintética herda do 1º episódio, telas ligadas a `PosterArt`, E2E cenário 1 verde (3 rodadas). |
| US2 — nunca imagem quebrada | Não iniciada. |
| Polish | Não iniciada. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nenhum painel Xtream real foi consultado durante o planejamento — `stream_icon`/`cover` são os nomes de campo padrão do protocolo, mas um painel específico pode variar. | SC-001 pode não bater 100% numa lista real | Verificação manual (`quickstart.md`) com a lista real do usuário, se ela for painel Xtream; achado vira nota em Execution Notes, não suposição escondida. |
| R-002 | `docs/iptvnator/08-tela-filmes.md` documenta detecção de "blank icon" (URL válida que aponta para imagem genérica) como prática madura — deliberadamente fora de escopo desta feature (spec, Clarifications). | Algumas capas podem aparecer como imagem cinza/vazia em vez do placeholder | Aceito pela spec; registrado no backlog (item 8) como melhoria futura, não repetir a decisão aqui. |
| R-003 | Série sintética M3U (D-003) herda a capa do primeiro episódio processado — se os episódios de uma série tiverem capas diferentes entre si (raro, mas possível em listas mal padronizadas), a escolhida é arbitrária (ordem de aparição no arquivo, não a "melhor"). | Baixo — visual, não funcional | Aceito, documentado; mesma classe de aproximação que a spec 012 já aceitou para o agrupamento em si. |
| R-004 | Achado durante US1 (E2E, `capa-real.mjs`): entrar numa tela de categoria (Live/Filmes/Séries) e pressionar `ArrowRight` pra "entrar" na categoria focada da trilha é uma corrida real — se disparado antes de `useCategoryList` resolver, a trilha só tem "★ Favoritos" (vazia), e o `ArrowRight` entra nela em vez da categoria real. Não é um bug de produto (o app sempre soube que "Favoritos" é a posição 0 da trilha) — é um cuidado de teste E2E que faltava. | Só afeta scripts E2E que navegam rápido demais entre "entrar na tela" e "entrar na categoria" | Resolvido: `capa-real.mjs` agora espera `.live-item:not(.live-item-favorites)` (uma categoria real já na trilha) antes de cada `ArrowRight` que entra numa categoria. Vale para qualquer E2E futuro que repita esse padrão de navegação — `m3u-sob-demanda.mjs`/`favoritos.mjs` não apresentaram o sintoma nas rodadas já feitas, mas usam o mesmo padrão arriscado; não alterados aqui por estarem fora do escopo desta feature. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-24 | Setup (T001) | Fixtures de imagem (`capa-filme.png`, `capa-serie.png`) criadas em `tv-web/e2e/fixtures/capa-real/`. Ajuste: `lista.m3u` não virou arquivo estático — as URLs de `tvg-logo` precisam ser buscáveis pelo navegador de verdade, e a porta do servidor E2E só existe em runtime; o M3U é montado inline em `capa-real.mjs` (T019), interpolando a porta. | Fase 2 (Foundational) |
| 2026-09-24 | Foundational (T002–T005) | `PosterArt.tsx` (D-005/D-006/D-007): estado `failedUrl` (não boolean) compara com a `url` atual, pra uma URL nova depois de falha tentar carregar de novo sem `useEffect`; ganhou prop `children` (não estava no plano original) pra `MoviesScreen`/`SeriesScreen` sobreporem o `.fav-star`, já que o componente passou a ser dono do `.poster-box` inteiro. `db.ts`: `CatalogRecord.iconUrl` (sem bump de versão, D-009 confirmado). `catalogApi.ts`: `CatalogItemOut.icon_url`/`toItemOut`. `screens.css`: `.poster-box-art`. Achado nos testes (corrigido, não é bug do componente): `getByText` quebrava pelo `<br/>` do label (virou regex); `alt=""` faz o navegador computar `role="presentation"`, não `"img"` (troquei `getByRole` por `querySelector('img')` nos testes). | Fase 3 (US1) |

| 2026-09-24 | US1 (T006–T019) | Captura completa nos dois caminhos (Xtream/M3U) e nas duas telas. Achado corrigido durante o E2E (R-004): `ArrowRight` pra entrar numa categoria é uma corrida com `useCategoryList` — script corrigido pra esperar uma categoria real na trilha antes de entrar, aplicado aos três blocos (Live/Filmes/Séries); a asserção de Live TV também ficou mais forte (conteúdo real, não só contagem). Estável em 3 rodadas. `npm run test` completo 663/666 (3 falhas do padrão flaky pré-existente, 43/43 confirmadas isoladas). | Fase 4 (US2) |

**PRÓXIMO**: Fase 4 (User Story 2) — provar com teste o fallback de falha e a janela virtualizada (D-007)

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/fixtures/capa-real/capa-filme.png`, `capa-serie.png` (novos) — imagens fictícias consumidas pelo E2E (T019).
- `tv-web/src/components/PosterArt.tsx` (novo) — capa real + fallback, dono do `.poster-box` inteiro.
- `tv-web/src/lib/catalog/db.ts` — `CatalogRecord.iconUrl` (sem bump de versão).
- `tv-web/src/features/catalog/catalogApi.ts` — `CatalogItemOut.icon_url`, `toItemOut`.
- `tv-web/src/features/screens.css` — `.poster-box-art`.
- `tv-web/src/lib/catalog/classifier.ts` — `normalizeIconUrl` (D-001b), `classifyEntry` captura `tvg-logo`.
- `tv-web/src/lib/catalog/xtreamConnector.ts` — `mapVodEntry`/`mapSeriesEntry` capturam `stream_icon`/`cover`.
- `tv-web/src/lib/catalog/m3uSeriesGrouping.ts` — série sintética herda `iconUrl` do 1º episódio.
- `tv-web/src/lib/catalog/categoryLoader.ts`, `importPipeline.ts` — propagam `iconUrl` (`on_demand`/`stored`).
- `tv-web/src/features/movies/MoviesScreen.tsx`, `series/SeriesScreen.tsx` — usam `<PosterArt>`.
- `tv-web/e2e/capa-real.mjs` (novo) — cenário 1 (US1), 8 verificações.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Em `e2e/capa-real.mjs` (e em qualquer E2E futuro que navegue Live TV/
  Filmes/Séries): depois de "Enter" numa tela de categoria, **sempre**
  espere `.live-item:not(.live-item-favorites)` (uma categoria real já na
  trilha) antes do próximo `ArrowRight` que entra numa categoria. Entrar
  cedo demais pousa em "★ Favoritos" (vazia, posição 0 da trilha) em vez
  da categoria real — intermitente, não decorre nunca do primeiro run
  (ver R-004). `m3u-sob-demanda.mjs`/`favoritos.mjs` usam o padrão antigo
  sem essa espera; não foram alterados por estarem fora do escopo desta
  feature, mas correm o mesmo risco se ficarem mais lentos algum dia.
