# Implementation Plan: Séries — Episódios e Temporadas

**Slug**: `012-series-episodios-temporadas` | **Date**: 2026-09-24 | **Spec**: `sdd/specs/012-series-episodios-temporadas/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Hoje uma série abre um detalhe que declara "episódios ainda não
disponíveis": `fetchSeriesInfo` existe e nunca é chamado, e numa fonte M3U os
episódios nem chegam à tela Séries (são gravados como `kind: 'episode'` sem
categoria). A abordagem é tratar o **episódio como item de catálogo de
primeira classe, ligado à sua série por `seriesId`**, nos dois tipos de fonte:

1. **Provedor Xtream** — um carregador por série (`seriesLoader.ts`), gêmeo
   do `categoryLoader.ts` da feature 010: obtém `get_series_info` só na
   entrada do detalhe, grava os episódios na geração ativa, carimba o
   instante no registro da série e serve do disco dentro da janela de
   frescor. Mesmos quatro desfechos (`fresh`/`fetched`/`stale-served`/
   `failed`).
2. **Fonte M3U (e "Modo limitado")** — na importação integral, cada entrada
   com padrão `SxxEyy` gera, na primeira vez que o par (grupo, título-base)
   aparece, um registro sintético `kind: 'series'` na categoria de séries
   daquele grupo; os episódios apontam para ele pelo mesmo `seriesId`
   sintético (`m3u:<grupo>|<título-base>`). Nada é obtido depois — a fonte já
   veio inteira.

A tela de detalhe passa a ter o layout do protótipo (cabeçalho → abas de
temporada → lista vertical de episódios), reproduz pelo `PlayerLayer` que a
011 já compartilha, e grava retomada + "assistido" por identidade estável que
**inclui temporada/episódio** — hoje o `PlayerLayer` não passa esses campos e
gravaria todo episódio como `s0|e0`. O autoplay é orquestrado pela tela, não
pelo player: a camada sinaliza conclusão, fecha, e a tela decide entre
contagem regressiva e voltar à lista.

## Technical Context

**Language/Version**: TypeScript 5.9 / React 19.2, Vite com alvo `chrome108`
(engine da TV de referência — não remover de `vite.config.ts`).

**Primary Dependencies**: nenhuma nova. `dexie` ^4.4.6 (IndexedDB),
`@tanstack/react-query` ^5 (estado servidor), `@tanstack/react-virtual`
(lista de episódios — mesmo padrão da feature 009).

**Storage**: IndexedDB via Dexie. **Schema sobe de v7 para v8**: índice
composto novo `[sourceId+generation+seriesId]` em `channels`. Campos novos
não indexados (sem exigir versão, mas declarados no tipo): `CatalogRecord.
episodesFetchedAt` (só em registro `kind: 'series'`) e `UserStateRecord.
completedAt`. Ver `data-model.md`.

**Testing**: `vitest` + `@testing-library/react` + `fake-indexeddb`, no
padrão de `categoryLoader.test.ts`, `MovieDetailScreen.test.tsx`,
`PlayerLayer.test.tsx` e `progressRecorder.test.ts`. Temporizador do
autoplay com `vi.useFakeTimers()`.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108, motor
`webapis.avplay`; adaptador `<video>` só para desenvolvimento.

**Performance Goals**: entrar numa série já obtida não toca rede (FR-002/
FR-008). A lista de episódios é virtualizada — uma temporada de anime pode
ter centenas de itens. A importação M3U ganha no máximo um registro extra
por série (não por episódio) e nenhuma consulta extra ao banco por entrada
(mapa em memória, como `categoryIdsByKey`).

**Constraints**: Direct Play; nenhum backend (ADR-008); credencial nunca
gravada em `channels` nem em mensagem de erro; controles refletem
capacidade real (episódio já é `FULL` em `capabilities.ts`); todo estado
com saída focável **e ativável por SELECT** (constitution v1.3.0).

**Scale/Scope**: uma série por vez, uma sessão de reprodução por vez, um
aparelho. Fonte de referência tem ~311 mil entradas; séries M3U reais
(ex.: "Os Simpsons", 34 temporadas) cabem no mesmo fluxo em lote.

## Decisões Invariantes

- **D-001 — Episódio é registro de `channels` com `kind: 'episode'` e
  `seriesId` apontando para a série.** Não existe tabela nova de episódios.
  É o que deixa `getChannel`/`resolvePlaybackUrl`/`fetchPlayback`
  funcionarem para episódio sem nenhum caminho paralelo (`playbackUrl.ts`
  já monta `/series/` para `kind: 'episode'`).

- **D-002 — A série é localizada pelo par (`sourceId`, `seriesId`) na
  geração ativa, pelo índice novo `[sourceId+generation+seriesId]`.** O
  registro da própria série compartilha o mesmo `seriesId`; toda leitura e
  toda substituição de episódios filtra `kind === 'episode'` — apagar
  episódios nunca apaga a série.

- **D-003 — `seriesId` de série M3U é sintético e determinístico:
  `m3u:<grupo>|<título-base normalizado>`.** Grupo entra na chave de
  propósito (Fora de Escopo da spec: mesma série em dois `group-title`
  permanece separada). Normalização = a do classificador (`seriesKey`,
  minúsculas e aparado) — sem Unicode, sem aproximação.

- **D-004 — Provedor nunca grava URL de episódio.** `fetchSeriesInfo` deixa
  de montar `url` (hoje monta com credencial embutida e o valor nunca é
  usado); a URL continua sendo montada na hora por `resolvePlaybackUrl`,
  como em canal e filme. Extensão ausente fica ausente — sem o `'mp4'`
  presumido de hoje (vira `no_container_extension`, a mensagem de "sem
  fonte de reprodução" já existente).

- **D-005 — Frescor de episódios reusa `STALE_AFTER_MS` (24 h) e a mesma
  semântica de desfecho do `categoryLoader`.** O carimbo mora no registro
  da série (`episodesFetchedAt`), não numa coleção nova. Série cuja
  categoria é `eager` (M3U, modo limitado) nunca toca rede.

- **D-006 — Identidade estável de reprodução vem de um único helper
  (`stableIdOf`) que inclui `series_id`, `season_number` e
  `episode_number`.** Usado pela camada de reprodução (quem grava) e pela
  lista de episódios (quem lê). Nunca lança: sem identidade, `null` (D-010
  da 011).

- **D-007 — "Assistido" é `UserStateRecord.completedAt`, gravado pelo mesmo
  gatilho que hoje apaga a retomada** (conclusão real do motor, ou cruzar
  `RESUME_MAX_RATIO`), **só para `kind: 'episode'`** nesta feature. Filme
  continua exatamente como a 011 deixou — "assistido" de filme a ~90% é o
  item 13 do backlog, e gravar agora anteciparia essa decisão. O selo é
  persistente: reassistir e parar no meio mostra "assistido" **e** a
  posição de retomada.

- **D-008 — Autoplay é decisão da tela, nunca da camada de reprodução.**
  `PlayerLayer` ganha uma prop opcional `onCompleted`; quando presente, a
  conclusão chama ela em vez de `onClose`. A tela desmonta a camada
  (fecha a sessão — FR-013) **antes** de mostrar a contagem, e monta uma
  camada nova (chaveada pelo id do próximo episódio) quando ela expira.
  Live TV e Filmes não passam `onCompleted` e não mudam.

- **D-009 — Contagem regressiva de 10 s, com uma única ação focada:
  "Cancelar".** SELECT ou RETURN cancelam; expirar inicia o próximo. O
  número exibido é o tempo real restante, não um percentual.

- **D-010 — Próximo episódio = seguinte na mesma temporada pela ordem de
  exibição; se for o último, o primeiro da temporada seguinte existente;
  senão, nenhum.** Função pura, sobre a lista já carregada — o autoplay
  nunca consulta rede nem outra série (FR-017 por construção).

- **D-011 — Ordem de exibição: temporadas por número crescente; episódios
  por `episodeNumber` crescente, empate/ausência pela ordem em que a fonte
  declarou (id local crescente).** Episódio sem temporada **identificável
  na fonte M3U** vai para um grupo rotulado "Episódios", nunca para uma
  "Temporada 1" inventada; a FR-019 (sem temporada → Temporada 1) vale para
  o Xtream, onde a temporada é a chave do JSON e o conector já cai em 1.

- **D-012 — No "Modo limitado", `/series/` na URL é episódio, não série.**
  `refineFromUrl` hoje traduz o segmento `/series/` para `kind: 'series'`,
  fazendo cada arquivo de episódio virar um cartão de série sem reprodução.
  O segmento identifica o stream de um episódio (`buildSeriesUrl` monta
  exatamente esse caminho para episódio).

- **D-013 — Foco do detalhe em duas linhas: abas de temporada (esquerda/
  direita) e lista de episódios (cima/baixo).** BAIXO nas abas entra na
  lista; CIMA no primeiro episódio volta às abas. Mover o foco entre abas
  troca a temporada exibida (dado local, sem rede). Foco na lista é por id
  de episódio, nunca por índice. É o `handleSeriesDetailKey` do protótipo,
  portado para `useRemoteNav`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada novo de conta. Série M3U e Xtream abrem do estado local já sincronizado. |
| Segredos Fora dos Clientes e dos Logs | ⚠️ | ✅ | Pré: `fetchSeriesInfo` monta URL com credencial num objeto que circularia até a gravação. Pós: D-004 remove a URL do mapeamento; `seriesLoader` devolve só desfecho, nunca mensagem de rede (FR-023); `seriesId` sintético M3U é grupo+título, sem credencial. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | A série M3U entra na categoria do próprio `group-title` declarado; título-base vem do nome da entrada. Nenhuma taxonomia externa. |
| IA e Classificação Nunca Inventam Dados | ⚠️ | ✅ | Pré: o conector presume `'mp4'` sem extensão e `0` para `episode_num` em texto; agrupar M3U poderia virar "hierarquia fictícia". Pós: D-004 (sem extensão presumida), número em texto é lido como número (`logic` §1), agrupamento só com evidência explícita `SxxEyy` (D-003), e sem temporada identificável não se inventa "Temporada 1" (D-011). |
| Comandos Locais Independem de Rede | ✅ | ✅ | Trocar de temporada e navegar episódios é local (FR-008). Cancelar autoplay é local. |
| Trailers e Metadados Não Alteram o Estado | ✅ | ✅ | Sem trailer nesta tela (Fora de Escopo). |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Abas, lista, reprodução e cancelamento por setas+SELECT+RETURN. RETURN fecha primeiro a contagem (camada), depois sai do detalhe. |
| Lista de Catálogo ≠ Manifesto de Streaming | ✅ | ✅ | Não toca o parser nem a detecção de HLS. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Carregando/vazio/erro/contagem com elemento focado **e roteado em `onSelect`** (v1.3.0 — o bug R-011 da 010 não se repete aqui, mesmo tratamento local da 011 R-005). Focar aba não dispara rede. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Player e contagem são camadas sobre o detalhe montado: ao fechar, foco volta ao episódio que tocou por último (por id). Voltar do detalhe para a grade continua sujeito ao bug pré-existente registrado no backlog — não introduzido nem corrigido aqui (Fora de Escopo). |
| Identidade de Reprodução Não Depende da URL | ⚠️ | ✅ | Pré: `PlayerLayer.computeIdentity` omite temporada/episódio → todo episódio colidiria em `s0|e0`. Pós: D-006, helper único com os três campos, testado contra `buildStableId`. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Episódio já é `FULL` em `capabilities.ts`. Série vencida/sem atualização sinaliza "mostrando o que já estava salvo" (FR-004). Contagem mostra segundos reais. |
| Documentação do Repositório É Canônica | ✅ | ✅ | `CLAUDE.md` (regra de plano de hardware e gap de séries), backlog (item 9) e comentário de `SeriesDetailScreen` atualizados na Polish. |

Nenhuma violação não justificável. `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/012-series-episodios-temporadas/
├── spec.md
├── plan.md                       # Este arquivo
├── data-model.md                 # Schema v8, campos novos, seriesId sintético
├── contracts/
│   └── series-episodes.md        # seriesLoader + repositório + catalogApi
├── logic/
│   └── episodios-autoplay.md     # Mapeamento Xtream, agrupamento M3U, ordem, próximo, selo, contagem
├── quickstart.md                 # Verificação manual (navegador + TV física)
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/src/
├── App.tsx                                  # rota series-detail (sem mudança de assinatura)
├── components/
│   ├── PlayerLayer.tsx                      # + prop onCompleted, identidade via stableIdOf
│   └── PlayerLayer.test.tsx
├── features/
│   ├── catalog/catalogApi.ts                # + stableIdOf, useSeriesEpisodes, useUserStates, campos de série/episódio
│   ├── screens.css                          # + .series-detail-*, raiz na regra de plano de hardware
│   └── series/
│       ├── SeriesDetailScreen.tsx           # reescrita: abas + lista + player + autoplay
│       ├── SeriesDetailScreen.test.tsx      # novo
│       ├── NextEpisodeCountdown.tsx         # novo: camada de contagem
│       ├── NextEpisodeCountdown.test.tsx    # novo
│       ├── episodeNavigation.ts             # novo: groupBySeason, nextEpisode, episodeBadge (puras)
│       └── episodeNavigation.test.ts        # novo
└── lib/
    ├── catalog/
    │   ├── db.ts                            # v8 + campos novos
    │   ├── catalogRepository.ts             # + listEpisodes, storeSeriesEpisodes
    │   ├── seriesLoader.ts                  # novo: ensureSeriesEpisodes
    │   ├── seriesLoader.test.ts             # novo
    │   ├── m3uSeriesGrouping.ts             # novo: série sintética por grupo+título
    │   ├── m3uSeriesGrouping.test.ts        # novo
    │   ├── importPipeline.ts                # consumeM3u usa o agrupador; refineFromUrl /series/ → episode
    │   ├── xtreamConnector.ts               # fetchSeriesInfo sem URL, números em texto
    │   └── userStateRepository.ts           # + markCompleted, getUserStates
    └── player/
        └── progressRecorder.ts              # + opção recordCompletion
```

**Structure Decision**: frontend único em `tv-web/` (o `api/` está congelado
pela ADR-008 e não é tocado). Segue a fronteira já em uso: telas falam só com
`features/catalog/catalogApi.ts`; `lib/catalog/` não importa UI; `lib/player/`
não importa `lib/catalog/` exceto o que já importa hoje (`progressRecorder` →
`userStateRepository`, precedente da 011).

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário puro**: `episodeNavigation.ts` (agrupamento/ordem/próximo/selo),
  `m3uSeriesGrouping.ts`, mapeamento de `fetchSeriesInfo`, `stableIdOf`
  (inclusive equivalência com `buildStableId` para filme — nada muda para a
  011).
- **Integração com `fake-indexeddb`**: `seriesLoader` (quatro desfechos,
  single-flight, eager nunca toca rede, substituição integral sem apagar a
  série), `importPipeline` M3U (um cartão por série, episódios ligados,
  duas fontes não se misturam, modo limitado `/series/` → episódio),
  `progressRecorder` (selo de assistido só para episódio), migração v7→v8.
- **Componente**: `SeriesDetailScreen` (estados, foco, OK reproduz com
  retomada, selo), `NextEpisodeCountdown` (fake timers), `PlayerLayer`
  (`onCompleted` substitui `onClose` só na conclusão; Live/Filme intactos).
- **Manual**: `quickstart.md` — navegador para A–F, TV física para G–I
  (AVPlay: conclusão real de episódio e troca de sessão no autoplay só se
  provam no hardware).

Comandos-base (a partir de `tv-web/`):

```powershell
npx vitest run src/features/series src/lib/catalog/seriesLoader.test.ts
npx vitest run
npx tsc -b
npm run lint
npm run build:tizen
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída. Schema v8 em `db.ts`. |
| Fase 2 (Foundational) | Concluída. `listEpisodes`/`storeSeriesEpisodes`, `stableIdOf` (D-006), `groupBySeason`, `PlayerLayer` usando a identidade nova. Suíte completa e `tsc` limpos. |
| Fase 3 (US1) | Concluída. Série Xtream: obtém episódios sob demanda, navega temporada/episódio, reproduz e retoma. Suíte completa e `tsc`/`lint` limpos. |
| Fase 4 (US2) | Concluída. Séries M3U agrupadas por título; correção do bug pré-existente do Modo limitado (R-004/D-012). Suíte completa e `tsc`/`lint` limpos. |
| Fase 5 (US3) | Concluída. Selo "✓ Assistido" por episódio, convivendo com retomada. Suíte completa e `tsc`/`lint` limpos. |
| Fase 6 (US4) | Concluída. Autoplay do próximo episódio com contagem cancelável, atravessando temporada. Suíte completa e `tsc`/`lint` limpos. |
| Fase 7 (Polish) | Parcial, sem bloqueio. `CLAUDE.md`/backlog atualizados, segredos e tokens CSS revisados, suíte completa limpa (478/478). Verificação manual no navegador feita parcialmente (sem fonte real disponível — dados sintéticos inseridos direto no IndexedDB, limpos ao final). TV física (T044) e `npm run build:tizen` não executados nesta sessão. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `PlayerLayer.computeIdentity` não passa temporada/episódio a `buildStableId` — todo episódio gravaria retomada em `…\|s0\|e0` | **Alto** — retomada e "assistido" de episódios distintos se sobrescreveriam (quando o `providerStreamId` faltar) e a lista nunca acharia o estado | D-006: helper único `stableIdOf`, com teste que grava pela camada e lê pela lista com o mesmo id |
| R-002 | Painel Xtream real devolve `episode_num` como texto em parte dos casos; hoje vira `0` | **Alto** — ordem e "próximo episódio" quebram | `logic` §1: número em texto é convertido; não numérico → ausente (ordem cai na ordem declarada, D-011). Teste com as duas formas |
| R-003 | `fetchSeriesInfo` presume `'mp4'` sem `container_extension` | Médio — URL chutada falha na TV como se fosse codec | D-004: sem presunção; cai no `no_container_extension` já tratado como "sem fonte de reprodução" |
| R-004 | Modo limitado grava cada `/series/` como `kind: 'series'` (achado nesta exploração, pré-existente) | Médio — cartões de série que não reproduzem nada | **Resolvido**: D-012, `kindFromUrlSegment` em `importPipeline.ts` — `/series/` agora vira `kind:'episode'`, agrupado como qualquer outro (feature 012, Fase 4). Testado |
| R-005 | Conclusão real de episódio e troca de sessão no autoplay só se provam no AVPlay | Médio | `quickstart.md` G–I na TV física. **Não** elevado a gate obrigatório: toda a superfície de VOD do AVPlay já foi provada na 011 (Cenários F/G/H); o que é novo aqui é orquestração de tela, coberta por teste de componente |
| R-006 | Nova tela que monta `PlayerLayer` precisa da raiz na regra de plano de hardware (lição da 011) | Médio — episódio tocaria sem imagem na TV | Task explícita em `screens.css` + item de verificação G no `quickstart.md` |
| R-007 | Duas obras M3U diferentes com mesmo título-base no mesmo grupo se unem | Baixo | Aceito na spec (Fora de Escopo). Sem heurística adicional |
| R-008 | Resync troca os ids locais das séries; registros de episódio de gerações antigas saem no `publishGeneration` | Baixo | Esperado: episódio é reobtível; estado do usuário é por identidade estável e sobrevive (D-006) |
| R-009 | Achado na Fase 2: gravar em `db.userStates` (IndexedDB real, via fake-indexeddb) dentro de um teste que roda sob `vi.useFakeTimers()` nunca completa — a conclusão da transação é agendada por um `setTimeout` interno que fica órfão quando `vi.useRealTimers()` troca a implementação de volta. Em `PlayerLayer.test.tsx`, isso é pré-existente (a suíte "interação dos controles (filme)" já escreve progresso sob fake timers) — inofensivo até um teste desta feature tentar ler `db.userStates` de verdade depois, quando vira timeout/`TransactionInactiveError` não tratado | Médio — quebra teste novo, não a aplicação | **Resolvido para esta feature**: T006 usa `vi.mock('.../userStateRepository', ...)` (só `updateProgress`/`clearProgress` viram espiã) em vez de gravação real, evitando o IndexedDB por completo nesse arquivo. A escrita de verdade já está coberta por `progressRecorder.test.ts`, que não usa fake timers. **Não corrigido na origem** (a suíte "interação dos controles" continua escrevendo sob fake timers) — armadilha registrada em `Cuidados para Retomada` para quem tocar `PlayerLayer.test.tsx` de novo |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-24 | Fase 1 (Setup) | Schema v8: índice `[sourceId+generation+seriesId]` em `channels`, `episodesFetchedAt`/`completedAt` novos, sem `.upgrade()` (D-002/D-005/D-007). Testes de migração v7→v8. | Nenhuma. |
| 2026-09-24 | Fase 2 (Foundational) | `listEpisodes`/`storeSeriesEpisodes` (espelho de `storeCategoryItems`, nunca apaga o registro da série). `stableIdOf` centraliza identidade estável (D-006) — `PlayerLayer.computeIdentity` trocado por ele, corrigindo R-001 (episódio não gravava mais em `s0\|e0`). `groupBySeason`/`EpisodeOut`/`Season` em `episodeNavigation.ts`. Achado de teste (R-009, ver Riscos): gravação real em `db.userStates` sob `vi.useFakeTimers()` nunca completa — contornado em `PlayerLayer.test.tsx` mockando `userStateRepository.updateProgress`/`clearProgress` em vez de gravar de verdade. | Nenhuma — suíte completa (409/409) e `tsc -b` limpos. |
| 2026-09-24 | Fase 3 (US1) | `fetchSeriesInfo` sem URL/extensão presumida, números em texto tratados. `seriesLoader.ts` (`ensureSeriesEpisodes`) + `getCategory` novo em `catalogRepository.ts` (não previsto no contrato original — necessário pra saber se a categoria da série é `eager`). `useSeriesEpisodes`/`useUserStates`/`invalidateUserStates` em `catalogApi.ts`; `EpisodeOut` migrou de `episodeNavigation.ts` (onde tinha nascido na Fase 2, provisório) pra `catalogApi.ts` (onde `data-model.md` já mandava) — `episodeNavigation.ts` reexporta. `SeriesDetailScreen.tsx` reescrito: cabeçalho + abas de temporada + lista virtualizada de episódios + retomada, todos os estados com saída focável ativável por OK. As classes CSS `.series-detail-*`/`.season-tab`/`.episode-row` já existiam prontas em `screens.css` (extraídas do protótipo antes desta feature, nunca consumidas) — só ajustadas pra virtualização. Raiz da tela ficou `.screen` (reuso), não um `.series-detail-layout` novo — já coberta pela regra de plano de hardware existente, sem editar `screens.css` para R-006. | `quickstart.md` A–C ainda não rodado manualmente no navegador (fica para a Polish, T043) — suíte automatizada e `tsc`/`lint` limpos (437/437). |

| 2026-09-24 | Fase 4 (US2) | `m3uSeriesGrouping.ts` (`createSeriesGrouper`, D-003). Integrado em `consumeM3u`: episódio nunca ganha categoria própria (D-001), a série sintética sim. `refineFromUrl` corrigido (D-012): `/series/` na URL vira `episode`, fechando o R-004 (Modo limitado gravava `kind:'series'` órfão). `enqueue()` extraído de `accept()` pra série sintética não contar como `entriesRead`. Três testes pré-existentes em `importPipeline.test.ts` ajustados (não eram bugs — invariantes que só valiam antes do agrupamento existir: "episódio nunca cria categoria", "stored ≤ read"). | Nenhuma — suíte completa (445/445) e `tsc`/`lint` limpos. |

| 2026-09-24 | Fase 5 (US3) | `markCompleted` (D-007). `recordCompletion` em `progressRecorder.ts` — conclusão real e limiar final gravam conclusão em vez de só limpar, só quando ligado; `PlayerLayer` liga só para episódio. `episodeBadge`/selo "✓ Assistido" na lista. | Nenhuma — suíte completa (459/459) e `tsc`/`lint` limpos. |

| 2026-09-24 | Fase 6 (US4) | `nextEpisode` (D-010). `PlayerLayer.onCompleted` (D-008). `NextEpisodeCountdown.tsx` (D-009), reusa CSS de diálogo existente, `setInterval` único (mais robusto que `setTimeout` reagendado por efeito sob relógio falso — achado ao escrever o teste). `SeriesDetailScreen` ganhou a máquina `Mode` unificando `playing`/`countdown`/`browsing`. | Nenhuma — suíte completa (478/478) e `tsc`/`lint` limpos. |

| 2026-09-24 | Fase 7 (Polish) | `CLAUDE.md` e backlog atualizados (gap de séries fechado, item 9). Segredos e tokens CSS revisados, limpos. Verificação manual real no navegador (Playwright): schema v8 abre sobre dado existente do usuário sem erro; um cartão por série; layout do protótipo; foco/ADR-007; erro de stream tratado; foco restaurado ao fechar a camada. Achado fora de escopo, não corrigido: `avplayAdapter`/`htmlVideoAdapter` sempre dizem "canal" na mensagem genérica de erro, mesmo para filme/episódio — registrado como `[Bug]` no backlog. | `quickstart.md` B/C/E/F (retomada/stale-served/selo/autoplay num navegador real) ficam para quando houver fonte Xtream ou M3U real disponível — cobertos pela suíte automatizada nesse meio-tempo. TV física (G–I) e `npm run build:tizen` não executados (R-005, não é gate). |

**PRÓXIMO**: feature código-completa nas 4 user stories, com pendência apenas de verificação manual mais ampla (fonte real + TV física) quando disponível. Rodar `sdd-converge` para fechar a convergência formal.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/catalog/db.ts` — schema v8.
- `tv-web/src/lib/catalog/catalogRepository.ts` — `listEpisodes`/`storeSeriesEpisodes`.
- `tv-web/src/features/catalog/catalogApi.ts` — `stableIdOf`, campos novos em `CatalogItemOut`/`CatalogItemPlayback`.
- `tv-web/src/features/series/episodeNavigation.ts` — `groupBySeason`, `EpisodeOut`, `Season`.
- `tv-web/src/components/PlayerLayer.tsx` — `computeIdentity` via `stableIdOf`.
- `tv-web/src/lib/catalog/xtreamConnector.ts` — `fetchSeriesInfo` sem URL/extensão presumida.
- `tv-web/src/lib/catalog/seriesLoader.ts` — `ensureSeriesEpisodes`.
- `tv-web/src/features/series/SeriesDetailScreen.tsx` — tela reescrita (US1).
- `tv-web/src/features/screens.css` — CSS de série adaptado pra virtualização.
- `tv-web/src/lib/catalog/m3uSeriesGrouping.ts` — agrupamento M3U (US2).
- `tv-web/src/lib/catalog/importPipeline.ts` — integração do agrupador + `enqueue()` + D-012.
- `tv-web/src/lib/catalog/userStateRepository.ts` — `markCompleted`.
- `tv-web/src/lib/player/progressRecorder.ts` — opção `recordCompletion`.
- `tv-web/src/features/series/NextEpisodeCountdown.tsx` — camada de autoplay (US4).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Nunca grave em `db.userStates` (ou qualquer tabela Dexie) dentro de um
  teste rodando sob `vi.useFakeTimers()`** — a transação do fake-indexeddb
  não completa (agenda a conclusão por `setTimeout` real), e o teste ou um
  posterior trava ou estoura `TransactionInactiveError` como rejeição não
  tratada quando o relógio real volta. Ver R-009. Em
  `PlayerLayer.test.tsx`, a suíte "interação dos controles (filme)" já
  fazia isso antes desta feature — inofensivo até agora porque nada lia
  `db.userStates` depois dela no mesmo arquivo. Ao testar escrita de
  progresso/estado do usuário puro (sem depender do React), prefira o
  padrão de `progressRecorder.test.ts` (chama o gravador direto, sem fake
  timers). Ao testar através de `PlayerLayer` (com fake timers em algum
  teste do mesmo arquivo), mocke `userStateRepository` em vez de gravar de
  verdade.
