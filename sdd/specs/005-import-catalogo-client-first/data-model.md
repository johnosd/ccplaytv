# Data Model — 005-import-catalogo-client-first

Schema do armazenamento local no aparelho (IndexedDB via Dexie). Substitui
o PostgreSQL como fonte de verdade das telas; o banco do backend continua
existindo para o caminho congelado, sem relação com este.

Três coleções, com fronteiras deliberadas: **fonte** (durável, guarda
credencial), **catálogo** (substituível, descartável) e **execução de
importação** (observável, efêmera).

## 1. `sources` — o que a pessoa cadastrou

Durável. Nunca é apagada por uma troca de geração de catálogo (D-005).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Gerado no aparelho na criação. Chave primária. |
| `type` | `'m3u_url' \| 'provider_credentials'` | Mesmos dois tipos de hoje. |
| `displayName` | string | Nome exibido nas listas. |
| `m3uUrl` | string? | Só para `m3u_url`. |
| `providerDns` | string? | Endereço normalizado do painel. Sozinho não autentica. |
| `providerUsername` | string? | **Credencial.** Ver §4. |
| `providerPassword` | string? | **Credencial.** Ver §4. |
| `providerAllowedFormats` | string[]? | Formatos que a conta declara permitir. `undefined` = ainda não consultado; lista vazia = consultado e nada declarado. |
| `providerImportMode` | `'xtream_api' \| 'legacy_m3u'`? | Como a fonte foi de fato importada. `legacy_m3u` é o modo limitado. |
| `providerMigratedAt` | number? | Epoch ms. `undefined` = ainda não passou pelo conector novo. |
| `connectionState` | `'never_synced' \| 'synced' \| 'error'` | Reflete o resultado da última consulta de status. |
| `lastSuccessfulSyncAt` | number? | Epoch ms. Base da decisão por idade (FR-013). |
| `activeGeneration` | number? | Ponteiro para a geração publicada do catálogo (D-004). `undefined` = nenhuma ainda. |
| `createdAt` / `updatedAt` | number | Epoch ms. |

**Índices**: `id` (primária). O volume aqui é de unidades a dezenas — não
justifica índice secundário.

## 2. `channels` — o catálogo

Substituível. Só canais são gravados (D-006/FR-008); entradas de outros
tipos são classificadas e descartadas sem tocar o disco.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | number | Auto-incremento local. |
| `sourceId` | string | Fonte de origem. |
| `generation` | number | Geração da importação que gravou este item (D-004). |
| `name` | string | Nome exibido. |
| `originalName` | string | Como a fonte declarou, preservado. |
| `group` | string? | Categoria **como a fonte declarou**, em nome e ordem (FR-002). `null`/ausente é um estado legítimo, nunca preenchido com rótulo inventado. |
| `groupOrder` | number | Posição da categoria na ordem declarada pela fonte — é o que permite exibir na ordem certa sem reordenar por texto. |
| `providerStreamId` | string? | Identificador estável do provedor, quando existir. Ausente não impede o canal de existir. |
| `providerCategoryId` | string? | Categoria do provedor, quando existir. |
| `directUrl` | string? | **Só para fonte `m3u_url`** — ver §4. |

**Índices**:
- `[sourceId+generation]` — base de toda leitura e da limpeza de geração.
- `[sourceId+generation+groupOrder]` — leitura paginada por categoria, na
  ordem declarada, sem carregar o catálogo inteiro (FR-005).

**Por que `generation` em vez de apagar e regravar**: apagar antes de
gravar deixaria a pessoa sem catálogo durante toda a importação e
destruiria o que era utilizável se a importação falhasse no meio. Com
geração, a anterior continua sendo lida até a nova estar completa; então
o ponteiro da fonte troca e a antiga é descartada. É a publicação em duas
fases da feature 004, portada (FR-007).

## 3. `importRuns` — a importação como algo observável

Efêmera: existe para a tela de progresso mostrar contagem real e para
impedir duas importações simultâneas da mesma fonte (FR-017).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Gerado no aparelho. |
| `sourceId` | string | Fonte sendo importada. |
| `generation` | number | Geração que esta execução está escrevendo. |
| `status` | `'running' \| 'completed' \| 'failed' \| 'cancelled'` | Uma execução `running` por fonte é o que bloqueia uma segunda. |
| `step` | `'fetching' \| 'parsing' \| 'storing' \| 'done'` | Etapa atual, distinta do status — mesma separação que o backend já faz. |
| `entriesRead` | number | Total de entradas **lidas** (inclui as descartadas). |
| `channelsStored` | number | Quantos canais foram de fato gravados. |
| `discardedByType` | number | Entradas válidas que não eram canais — é o que sustenta dizer "não é o catálogo completo" sem inventar número. |
| `invalidCount` | number | Entradas que não puderam ser interpretadas. |
| `truncatedByStorage` | boolean | `true` quando a gravação parou por falta de espaço (FR-018). |
| `errorKind` | string? | Categoria do erro, nunca a mensagem crua da rede — ver §4. |
| `startedAt` / `finishedAt` | number | Epoch ms. Base das medições da US1. |

**Índices**: `[sourceId+status]` — encontrar execução ativa de uma fonte.

**Contadores têm unidades diferentes e não se somam**: `entriesRead` conta
linhas da fonte; `channelsStored` conta itens gravados. Apresentá-los
somados seria inventar um total — o mesmo cuidado que a ADR-004 §5 já
exigia da tela de progresso.

## 4. Fronteiras de segredo

**Credencial de provedor vive apenas em `sources`.** Nunca é copiada para
`channels` nem para `importRuns`. Uma troca de geração descarta catálogo;
não pode descartar nem duplicar credencial (D-005).

**A URL de reprodução é montada na hora, não guardada** — para fonte de
provedor. O catálogo guarda `providerStreamId`; a URL é construída no
momento de reproduzir, combinando o identificador com a credencial e o
formato permitido (FR-010). Isso mantém a identidade do item independente
da URL, como a constitution exige, e evita espalhar a credencial por
milhares de registros.

**Atualização (modo limitado, `legacy_m3u`).** Uma fonte de provedor cujo
painel não fala o protocolo JSON cai no caminho M3U, onde a entrada só traz
a URL pronta — que embute a credencial. Guardá-la copiaria a senha para
milhares de registros, contra a regra acima; não guardar nada deixava todo
item inabrível. A saída é reconstruir: a URL de um painel Xtream é montada
a partir de `(tipo, identificador, extensão)`, então esses três pedaços são
extraídos de volta (`parseXtreamStreamUrl`) e gravados no lugar da URL. O
item continua reproduzível, a credencial continua morando só em `sources`,
e o segmento de tipo (`/live/`, `/movie/`, `/series/`) — o painel declarando
o que o item é — tem precedência sobre a heurística de nome do
classificador. Entrada cuja URL não tem essa forma continua sem
identificador e é marcada como não reproduzível, em vez de virar exceção
silenciosa à fronteira de segredo.

**Exceção declarada: fonte por URL M3U.** Ali a URL de reprodução **é** o
dado que a lista fornece — não existe identificador separado a partir do
qual reconstruí-la, e essa URL pode conter credencial embutida no próprio
caminho. Para esse tipo de fonte, `directUrl` é gravado como veio. Isso
não é uma decisão nova desta feature: é a mesma situação que o backend já
tem hoje em `playback_url`, apenas mudando de lugar. O tratamento
continua o mesmo: não é exibida, não é registrada em diagnóstico e não
sai por canal de exportação (FR-009).

**Erros guardam categoria, não texto cru.** `errorKind` distingue as
quatro situações de FR-011 (credencial recusada, assinatura expirada,
conexão direta recusada, falha de rede). A mensagem de rede original
nunca é persistida nem exibida, porque costuma carregar a URL completa —
a mesma armadilha que o backend evita ao não interpolar o erro do cliente
HTTP.

## 5. Migração a partir do estado atual

Não há migração de dados (decidido na spec): o catálogo hoje no PostgreSQL
não é copiado. A pessoa importa novamente, porque a fonte é re-obtenível e
não existe preferência de usuário a preservar — favoritos e histórico
ainda não foram construídos.

O schema nasce na versão 1. Quando VOD e séries entrarem (itens 9 e 10 do
backlog), a mudança será uma versão nova do schema, com a migração
declarada — que é justamente a capacidade pela qual Dexie foi escolhida
(research.md R1).
