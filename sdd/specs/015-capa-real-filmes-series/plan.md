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
| US2 — nunca imagem quebrada | Concluída. Cenário 2 (capa quebrada) verde sem código novo; cenário 3 (D-007, janela virtualizada) revelou e fechou um bug pré-existente sério (R-005 — conteúdo `stored` sumindo sozinho ~300ms após entrar), corrigido com aprovação do usuário. E2E 11/11, 3 rodadas. |
| Polish | Concluída. Documentação (`CLAUDE.md`), segredos (T024, limpo), regressão (T022 — achado de flakiness pré-existente em `m3u-sob-demanda.mjs`, investigado e não relacionado a esta feature, R-006), gates (`test`/`lint`/`build` limpos, `capa-real.mjs` isolado 11/11), `quickstart.md` mapeado contra cobertura já existente. Feature código-completa. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nenhum painel Xtream real foi consultado durante o planejamento — `stream_icon`/`cover` são os nomes de campo padrão do protocolo, mas um painel específico pode variar. | SC-001 pode não bater 100% numa lista real | Verificação manual (`quickstart.md`) com a lista real do usuário, se ela for painel Xtream; achado vira nota em Execution Notes, não suposição escondida. |
| R-002 | `docs/iptvnator/08-tela-filmes.md` documenta detecção de "blank icon" (URL válida que aponta para imagem genérica) como prática madura — deliberadamente fora de escopo desta feature (spec, Clarifications). | Algumas capas podem aparecer como imagem cinza/vazia em vez do placeholder | Resolvido: aceito pela spec; confirmado pela auditoria do `sdd-converge` (2026-09-25) que o código não tenta detectar/tratar isso — comportamento como documentado, não uma lacuna esquecida. Registrado no backlog (item 8) como melhoria futura. |
| R-003 | Série sintética M3U (D-003) herda a capa do primeiro episódio processado — se os episódios de uma série tiverem capas diferentes entre si (raro, mas possível em listas mal padronizadas), a escolhida é arbitrária (ordem de aparição no arquivo, não a "melhor"). | Baixo — visual, não funcional | Resolvido: aceito, documentado; confirmado pela auditoria do `sdd-converge` (`m3uSeriesGrouping.ts` implementa exatamente D-003, com teste cobrindo o caso). Mesma classe de aproximação que a spec 012 já aceitou para o agrupamento em si. |
| R-004 | Achado durante US1 (E2E, `capa-real.mjs`): entrar numa tela de categoria (Live/Filmes/Séries) e pressionar `ArrowRight` pra "entrar" na categoria focada da trilha é uma corrida real — se disparado antes de `useCategoryList` resolver, a trilha só tem "★ Favoritos" (vazia), e o `ArrowRight` entra nela em vez da categoria real. Não é um bug de produto (o app sempre soube que "Favoritos" é a posição 0 da trilha) — é um cuidado de teste E2E que faltava. | Só afeta scripts E2E que navegam rápido demais entre "entrar na tela" e "entrar na categoria" | Resolvido: `capa-real.mjs` agora espera `.live-item:not(.live-item-favorites)` (uma categoria real já na trilha) antes de cada `ArrowRight` que entra numa categoria. Vale para qualquer E2E futuro que repita esse padrão de navegação — `m3u-sob-demanda.mjs`/`favoritos.mjs` não apresentaram o sintoma nas rodadas já feitas, mas usam o mesmo padrão arriscado; não alterados aqui por estarem fora do escopo desta feature. |
| R-005 | **Achado fora do escopo desta feature, com aprovação explícita do usuário antes de corrigir** (AskUserQuestion, 2026-09-24: "Corrigir agora, junto com a 015"): entrar numa categoria M3U `stored` (features 010/014) grande o bastante e **não fazer nada** já bastava pro conteúdo sumir sozinho da tela ~300ms depois, mostrando "O conteúdo desta lista não está mais no aparelho" — reproduzido de forma determinística durante o T021 (E2E), sem rolar nada. Causa raiz: `useCategoryFocusPrefetch` (feature 010, R-013) mantém um timer de pré-busca amarrado à categoria em foco na trilha mesmo depois de já ter entrado nela (o cálculo de `focusedCategory` não olha `col`); o timer usa o snapshot de categoria de `useCategoryList`, nunca invalidado depois que a entrada real consome os blocos de `storedEntries` (D-007 da 014) — o prefetch, ao disparar, vê `itemsFetchedAt` ainda `undefined` no snapshot antigo, tenta `readStored` de novo, acha vazio, devolve `source_missing`, e escreve isso por cima do cache que `useCategoryContent` já tinha com o conteúdo certo (mesma `queryKey`). | Alto — qualquer categoria `stored` real (M3U avulsa, painel não confirmado, Modo limitado) podia perder o conteúdo já exibido sem nenhuma ação do usuário, sempre que ficasse tempo suficiente com o cursor na trilha antes ou logo depois de entrar | Resolvido: `useCategoryFocusPrefetch` (`catalogApi.ts`) ganhou um terceiro parâmetro, `enteredCategoryId?: number`, na lista de dependências do `useEffect` — quando a categoria focada é a já entrada, o efeito nunca agenda um timer novo e cancela um já agendado (a função de limpeza do efeito anterior roda antes do corpo novo). `LiveScreen.tsx`/`MoviesScreen.tsx`/`SeriesScreen.tsx` passam `entered?.kind === 'category' ? entered.id : undefined`. 3 testes novos em `catalogApi.test.tsx` cobrem: nunca prefetcha já entrada; cancela timer pendente ao entrar; categoria diferente da entrada continua prefetchando normal. `node e2e/capa-real.mjs` 3x seguidas depois da correção, sem nenhuma flutuação pra `source_missing`. |
| R-006 | Achado durante T022 (Polish, regressão): `node e2e/m3u-sob-demanda.mjs` (script da feature 014, intocado nesta sessão) falhou de forma intermitente em pontos diferentes a cada rodada — investigado a fundo (zero sobreposição de arquivo com esta feature; uma rodada isolada com debug confirmou o dado real correto, só a asserção correu antes de tempo; falhas em pontos diferentes do script entre rodadas, não sempre o mesmo assert). | Não bloqueia esta feature (seu próprio E2E, `capa-real.mjs`, ficou estável 11/11 em todas as rodadas); só afeta a confiança no `m3u-sob-demanda.mjs` sob sessões de carga alta | Não corrigido (fora do escopo — script de outra feature). Registrado como achado, não como regressão; candidato a `sdd-bugfix` (tornar as esperas do script mais robustas, mesmo padrão do R-004) se reaparecer fora de uma sessão excepcionalmente longa como esta. |

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

| 2026-09-24 | US2 (T020–T021) | Cenário 2 (capa quebrada) verde sem código novo, confirma `PosterArt` por construção. Cenário 3 (D-007) precisou de `MANY_COUNT` 60→500 (navegador real mostra ~60 cards de uma vez, mesmo headless) e revelou um bug pré-existente fora do escopo (R-005): categoria `stored` grande perdia o conteúdo sozinha ~300ms após entrar, por uma corrida entre `useCategoryFocusPrefetch` (timer de prefetch que não sabe que a categoria já foi entrada) e a leitura real de `storedEntries` (consumível uma vez só). Usuário aprovou corrigir agora; `useCategoryFocusPrefetch` ganhou `enteredCategoryId` como guarda + gatilho de cancelamento do timer pendente, aplicado nas três telas. 3 testes novos comprovam a correção sem desligar o prefetch para categorias realmente não-entradas. E2E 11/11, 3 rodadas estáveis. | Fase 5 (Polish) |

| 2026-09-25 | Polish (T022–T026) | `CLAUDE.md` atualizado (parágrafo novo da 015 + correção do parágrafo da 014, que ainda dizia "In execution" após convergir). Segredos limpos (T024). `quickstart.md` mapeado contra a cobertura automatizada já existente (T026). T022 (regressão) achou flakiness intermitente em `e2e/m3u-sob-demanda.mjs` (script da 014, intocado) — investigado a fundo, sem sobreposição de código com esta feature, registrado como R-006, não corrigido (fora do escopo). Gates: `test` 665/666 (flaky pré-existente confirmado isolado), `lint`/`build` limpos, `test:e2e` trava em R-009 (esperado), `capa-real.mjs` isolado 11/11. Achado à parte, sem relação com código: 2 commits do usuário (`images`/`imagens`) apareceram no histórico durante a investigação, capturando o estado da árvore de trabalho desta sessão — sem perda de conteúdo, usuário avisado em tempo real. | Nenhuma — feature código-completa |

**PRÓXIMO**: feature código-completa (Fase 5 fechada). Falta só decidir com o usuário se roda `sdd-converge` agora

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
- `tv-web/src/features/movies/MoviesScreen.tsx`, `series/SeriesScreen.tsx`, `live/LiveScreen.tsx` — usam `<PosterArt>` (Movies/Series) e/ou passam `enteredCategoryId` pro prefetch (as três).
- `tv-web/e2e/capa-real.mjs` (novo) — cenários 1–3 (US1/US2), 11 verificações.
- `tv-web/src/features/catalog/catalogApi.ts` — `useCategoryFocusPrefetch` ganhou `enteredCategoryId?` (R-005, correção do bug de prefetch vs. leitura `stored`).

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
- Se `useCategoryFocusPrefetch` ganhar mais parâmetros/lógica no futuro,
  lembrar do R-005: o timer de prefetch precisa saber quando a categoria
  focada na trilha já foi **entrada** (`col === 1`), não só focada — senão
  a mesma classe de corrida volta (timer agendado antes de entrar dispara
  depois, relê uma categoria `stored` já consumida).
- Sessão excepcionalmente longa: `node e2e/m3u-sob-demanda.mjs` ficou
  intermitente sob a carga acumulada de hoje (R-006) sem nenhuma relação
  com o código desta feature. Se voltar a falhar numa sessão normal (não
  maratona), aí sim vale investigar como bug real, não como ambiente.
- Se `git status`/`git log` mostrar commits que você não fez nesta sessão,
  não assuma perda de trabalho — `git commit` nunca apaga o que está na
  árvore de trabalho, só grava um snapshot. Confira `git show --stat
  <hash>` pra ver o que entrou antes de reagir; avise o usuário do achado
  e siga (não desfaça nem re-commite por conta própria).

## Resultado Final

<!-- Anexado pelo sdd-converge em 2026-09-25. Convergência limpa — zero achados. -->

Auditoria do `sdd-converge` (2026-09-25): mapeei cada FR/SC/Decisão
Invariante contra o código real — `PosterArt.tsx` (D-005/D-006/D-007),
`classifier.ts` (`normalizeIconUrl`/D-001b, captura de `tvg-logo` nunca
para canal), `xtreamConnector.ts` (`mapVodEntry`/`mapSeriesEntry`
capturam `stream_icon`/`cover`, `mapLiveEntry` intocado), `m3uSeriesGrouping.ts`
(série sintética herda `iconUrl` do 1º episódio, D-003),
`categoryLoader.ts`/`importPipeline.ts` (propagação nos caminhos
`on_demand`/`stored`), `db.ts` (`CatalogRecord.iconUrl`, ainda na v10 —
D-009 confirmado, sem bump de versão), `catalogApi.ts`
(`CatalogItemOut.icon_url`, `useCategoryFocusPrefetch` com a correção do
R-005), as três telas (`LiveScreen.tsx`/`MoviesScreen.tsx`/
`SeriesScreen.tsx`, wiring de `PosterArt` e `enteredCategoryId`),
`CLAUDE.md` e `.planning/backlog.md`. **Zero achados** — nenhuma lacuna
`missing`, `partial`, `contradicts` ou `unrequested`. O código entregue é
fiel ao que `spec.md`, `plan.md` e `data-model.md` descrevem.

**O que foi de fato construído**: as duas user stories (capa real nas
grades de Filmes/Séries, carregamento sempre com fallback seguro e
sempre dentro da janela virtualizada) estão código-completas, com a
suíte automatizada (unitário + integração + componente + os três
cenários E2E de `e2e/capa-real.mjs`, 11/11) verde, e a documentação
canônica (`CLAUDE.md`, backlog) sincronizada com o estado real.

**Desvios acumulados nas Execution Notes, confirmados nesta auditoria**:
- R-004: corrida de navegação no próprio E2E desta feature, corrigida
  dentro do script — sem impacto em código de produto.
- R-005: bug pré-existente e fora do escopo (features 010/014,
  `useCategoryFocusPrefetch` vs. leitura `stored` de `storedEntries`)
  corrigido dentro desta feature, com aprovação explícita do usuário.
  Confirmado no código: `enteredCategoryId` cancela o timer de prefetch
  pendente ao entrar na categoria.
- R-006: flakiness intermitente em `e2e/m3u-sob-demanda.mjs` (script da
  feature 014), investigada a fundo e não relacionada ao código desta
  feature — não corrigida, por estar fora do escopo. Continua em aberto,
  registrada como achado, não como regressão desta feature.
- `MANY_COUNT` (fixture do cenário 3, E2E) subiu de 60 para 500 durante a
  execução — um navegador real, mesmo headless, mostra ~60 cards de uma
  vez, então 60 não bastava para provar a janela virtualizada. Ajuste de
  fixture, não uma mudança de decisão.

**Decisões técnicas que ficaram diferentes do plano original**: a única
foi o próprio R-005 — não estava previsto no plano original (que
presumia, corretamente, que `PosterArt` e a virtualização já bastariam
para o cenário 3 "por construção"), mas o teste desse mesmo cenário foi o
que revelou a lacuna real numa camada vizinha (prefetch). Tratado com o
mesmo rigor de qualquer achado fora do escopo — parado, perguntado,
aprovado, corrigido e testado antes de prosseguir.

**Pendências que seguem em aberto, fora do gate de convergência**:
- R-001: SC-001 (nenhuma capa some/inventa numa lista real de painel
  Xtream) segue sem verificação manual com um painel real — bloqueada em
  você, mesmo critério de segredo já usado nas features 010/013/014 (o
  agente nunca insere uma URL/credencial real em lugar nenhum).
- R-006 (acima): flakiness de `m3u-sob-demanda.mjs`, fora do escopo,
  candidata a `sdd-bugfix` se reaparecer fora de uma sessão excepcional.

**README.md do projeto**: não existe um na raiz do repositório (só
`tv-web/README.md`, o boilerplate padrão do template Vite) — nada para
atualizar, conforme o escopo deste skill.
