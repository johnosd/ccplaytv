# Modelo de dados — estrutura e carga sob demanda

Delta sobre `sdd/specs/005-import-catalogo-client-first/data-model.md`, que
continua valendo em tudo que não é contrariado aqui.

## 1. O que muda de conceito

Hoje `channels` é o catálogo inteiro de uma geração, escrito de uma vez. A
categoria existe só como um número derivado (`groupOrder`) dentro de cada
item — não há linha que represente uma categoria.

Passa a existir uma **categoria como entidade própria**, e os itens passam
a ser um preenchimento incremental dela. A consequência estrutural: *saber
que uma categoria existe* deixa de depender de *ter os itens dela*.

## 2. Nova coleção: `categories`

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | number (auto) | Chave local. |
| `sourceId` | string | Fonte a que pertence. |
| `generation` | number | Geração da estrutura. Troca atômica (D-004 da 005). |
| `kind` | `'channel' \| 'movie' \| 'series'` | Seção do painel de onde veio. |
| `fetchMode` | `'on_demand' \| 'eager'` | Como os itens desta categoria chegam. Ver §2.1. |
| `providerCategoryId` | string? | Identificador declarado pelo provedor. É por ele que a busca sob demanda pergunta. `undefined` em categoria `eager`, que não tem o que perguntar. |
| `name` | string? | Como o provedor declarou. **Vazio é estado legítimo** — nunca substituído por rótulo externo. |
| `order` | number | Posição na ordem declarada. Nunca ordenação alfabética imposta. |
| `declaredCount` | number? | Contagem que o provedor declara. `undefined` = a fonte não declarou nada; a interface não inventa um número no lugar. Sempre `undefined` em categoria `eager`, porque um M3U não declara contagem. |
| `itemsFetchedAt` | number? | Instante da última obtenção dos itens. `undefined` = nunca obtida. |
| `itemsCount` | number? | Quantos itens de fato entraram na última obtenção. É o que permite declarar divergência contra `declaredCount` (FR-015). |

Índices necessários: `[sourceId+generation+kind+order]` — caminho de
leitura quente, usado por `listCategories` a cada tela — e `sourceId`
sozinho, **como índice de verdade, não como prefixo do composto** — usado
para limpar todas as categorias de uma fonte (troca de geração,
`deleteAllForSource`). Consultar um prefixo de índice composto cai na
camada de emulação "virtual index" do Dexie 4, que se mostrou frágil neste
ambiente de teste (Dexie + fake-indexeddb) até para tabela vazia — mesma
razão pela qual `channels` já usa `[sourceId+generation]` explícito em vez
de depender de prefixo de `[sourceId+generation+groupOrder]`.

**Atualização (sdd-execute, Fase 1):** um segundo índice
`[sourceId+generation+kind+providerCategoryId]`, para "localizar a
categoria que a tela abriu", estava previsto aqui e foi **removido antes
de qualquer código consumidor existir**. Não há caminho de código que
precise dele: quem abre uma categoria já recebe o objeto `CatalogCategory`
inteiro — com o `id` local e o `providerCategoryId` juntos — na resposta de
`listCategories`; `providerCategoryId` só é usado para montar a URL de
busca no painel, nunca para procurar a categoria de volta no banco. Um
índice sem consumidor seria peso sem uso, e a implementação expôs um
segundo motivo prático: com `providerCategoryId` opcional como último
componente, esse índice quebrava até uma consulta em tabela vazia sob
Dexie 4 + fake-indexeddb (camada de "virtual index"), no ambiente de
teste. Coberto por `db.test.ts`.

### 2.1. `fetchMode` — por que toda fonte grava estrutura

**Toda fonte grava linhas em `categories`, inclusive as que importam a
lista inteira.** Só o preenchimento dos itens difere.

| `fetchMode` | Quem produz | Itens | Quando são obtidos |
| --- | --- | --- | --- |
| `on_demand` | Fonte de provedor pelo protocolo JSON | Vazios na importação | Ao entrar na categoria, por `providerCategoryId` |
| `eager` | Fonte por URL M3U e provedor em modo limitado (`legacy_m3u`) | Já gravados pela importação | Todos de uma vez, na importação |

Sem isso, `listCategories` — que passa a ler desta coleção — devolveria
lista vazia para toda fonte M3U, e a Live TV abriria sem categoria nenhuma
numa fonte que hoje funciona. Seria uma regressão invisível para os testes
atuais, porque nenhum deles lê categorias de uma fonte M3U depois da
migração.

A alternativa considerada era manter a derivação por `uniqueKeys()` como
caminho de leitura alternativo quando não houvesse linha de categoria.
**Rejeitada**: criaria dois caminhos de leitura no repositório, que é
exatamente o que a D-004 do `plan.md` promete não fazer, e deixaria as
telas sem poder contar com a existência dos metadados da categoria.

Para a categoria `eager`, a importação já sabe o que gravar: o nome e a
ordem vêm da ordem de aparição dos grupos no M3U (o mesmo mapa
`groupOrders` que o pipeline já mantém), `itemsFetchedAt` é o instante da
importação, e `itemsCount` é a contagem real do que entrou. `declaredCount`
fica ausente porque **um M3U não declara contagem** — e inventar uma a
partir do que foi contado transformaria um fato do disco numa promessa da
fonte, apagando a distinção que a D-005 existe para manter.

**`declaredCount` e `itemsCount` são campos distintos de propósito.** Um é
promessa da fonte, o outro é fato do disco. Fundi-los num só faria a
interface perder a única forma de dizer "o provedor disse 1.240 e entregou
1.198" — que é o que FR-015 exige e o que a constitution chama de não
inventar dado.

## 3. Mudança em `channels`

Um campo novo, e nenhuma remoção:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `categoryId` | number? | Chave local da categoria a que o item pertence. Preenchido nos dois caminhos — o integral também grava categorias (§2.1). `undefined` só para item cujo grupo não pôde ser resolvido. |

**A ordem de escrita importa no caminho integral.** Os itens são gravados
em lotes *durante* o fluxo do M3U, antes de a lista de grupos estar
completa — então a linha da categoria precisa existir antes do primeiro
lote dela, ou não há `categoryId` para apontar. A categoria é criada no
momento em que o grupo aparece pela primeira vez (o mesmo ponto onde o
pipeline hoje atribui `groupOrder`), e `itemsFetchedAt`/`itemsCount` são
carimbados no fim, quando o total é conhecido. Gravar as categorias só no
fim obrigaria a uma segunda passada sobre centenas de milhares de linhas
para preencher `categoryId` — exatamente o custo de escrita que esta
feature existe para evitar.

`groupOrder` **permanece**, e continua sendo o que ordena a leitura
paginada. Não é substituído por `categoryId`: o índice composto
`[sourceId+generation+kind+groupOrder]` já existe, já é testado, e trocá-lo
por outro eixo seria uma migração sem ganho dentro desta feature.

## 4. Versão do schema

Uma versão nova do banco Dexie (v7), criando `categories` e o índice do
campo novo em `channels`. **Sem migração de dados**: uma fonte de provedor
importada pelo modelo antigo tem itens sem `categoryId` e nenhuma linha em
`categories`. Ela é tratada como fonte a re-sincronizar — o mesmo caminho
que FR-020 já dispara por idade —, não como dado a converter. Converter
exigiria adivinhar `providerCategoryId` a partir de `groupOrder`, que é
exatamente o tipo de reconstrução por aproximação que a constitution
proíbe.

## 5. O que a troca de geração toca — e o que não toca

Publicar uma geração nova descarta, da anterior: as linhas de `categories`
e as linhas de `channels`.

**Nunca toca `userStates`.** Favoritos e posição de retomada são chaveados
por identidade lógica estável (fonte + tipo + id estável +
temporada/episódio), vivem em coleção própria e sobrevivem a qualquer
número de ressincronizações. FR-010 descarta catálogo; não descarta o que
a pessoa marcou. Esta é a leitura literal do princípio "Identidade de
Reprodução Não Depende da URL", que exige que o resync reconcilie o estado
do usuário — e reconciliar pressupõe que ele continue existindo.

## 6. Fronteiras de segredo

Inalteradas, e uma reafirmação que a feature torna mais fácil de violar:
cada abertura de categoria monta uma URL de `player_api.php` **com usuário
e senha na query**. Essa URL é construída, usada e descartada. Não vai para
`categories`, não vai para `channels`, não vai para log, não vira mensagem
de erro. Com a busca deixando de acontecer uma vez por importação e
passando a acontecer a cada categoria aberta, o número de lugares onde ela
existe cresce — e por isso FR-017 é explícito.
