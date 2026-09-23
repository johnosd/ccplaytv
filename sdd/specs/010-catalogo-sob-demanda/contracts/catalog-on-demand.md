# Contrato — superfície local com carga sob demanda

Delta sobre `sdd/specs/005-import-catalogo-client-first/contracts/local-storage.md`.
Tudo que não aparece aqui continua como aquele contrato define.

Regra herdada e mantida: **nenhuma tela fala com Dexie direto.** Tudo passa
pelos repositórios.

## 1. Catálogo (`catalogRepository`) — operações novas e alteradas

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Listar categorias | sourceId, tipo | Categorias da geração ativa, na ordem declarada | **Alterada**: passa a ler da coleção `categories`, não a derivar de chaves únicas de `channels`. Devolve `fetchMode`, `declaredCount`, `itemsFetchedAt` e `itemsCount` junto. **Caminho único para todo tipo de fonte** — não há derivação alternativa para fonte sem estrutura gravada. |
| Gravar estrutura | sourceId, geração, categorias | ids locais criados | **Nova**. Escrita em lote, em transação. Usada pelos **dois** caminhos de importação: o de provedor grava tudo de uma vez antes dos itens; o integral cria cada categoria quando o grupo aparece pela primeira vez, porque os itens dela são gravados antes de a lista de grupos terminar. |
| Carimbar obtenção | categoria, instante, contagem | — | **Nova**. Fecha `itemsFetchedAt`/`itemsCount` de uma categoria `eager` no fim da importação integral, quando o total passa a ser conhecido. |
| Gravar itens de uma categoria | categoria, itens | — | **Nova**. Substitui **integralmente** os itens daquela categoria naquela geração, dentro de uma transação, e carimba `itemsFetchedAt`/`itemsCount`. Substituição parcial deixaria item órfão de uma obtenção anterior. |
| Listar itens de uma categoria | sourceId, categoria, deslocamento, limite | Página de itens | Mantém a assinatura paginada de hoje (FR-005 da 005). |
| Contar itens | sourceId, categoria?, tipo? | número | Contagem **real do disco**. Nunca confundida com `declaredCount`. |

**Leitura continua sempre da geração ativa**, e quem chama continua não
informando geração.

## 2. Obtenção sob demanda (`categoryLoader`) — superfície nova

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Garantir categoria | sourceId, categoria | Estado: `fresh` / `fetched` / `stale-served` / `failed` | Ponto único de entrada das telas. Decide sozinho se serve do disco ou busca. |

**Categoria `eager` sai sempre como `fresh`, sem tocar a rede.** Os itens
dela já vieram na importação, e não existe `providerCategoryId` por onde
perguntar. Isso é o que permite às telas chamarem esta operação sempre,
sem saber de que tipo é a fonte — a uniformidade que a D-004 exige. Uma
fonte `eager` se atualiza reimportando a fonte inteira, como hoje, nunca
categoria a categoria.

Estados devolvidos, e o que cada um significa para a tela:

| Estado | Significa | O que a tela mostra |
| --- | --- | --- |
| `fresh` | Obtida dentro do prazo, ou categoria `eager`; nada foi à rede | Os itens, direto |
| `fetched` | Estava ausente ou vencida; a busca concluiu | Carregando → itens |
| `stale-served` | Vencida, a busca falhou, o que havia no disco continua servindo | Os itens, com a limitação declarada |
| `failed` | Nunca obtida e a busca falhou | Estado de erro com ação de tentar de novo |

Regras invioláveis desta superfície:

1. **Só é chamada na entrada da categoria**, nunca ao mover o foco sobre
   ela (FR-004; constitution, "focar um item NÃO DEVE disparar consulta a
   serviço externo").
2. **Chamadas concorrentes para a mesma categoria compartilham uma
   obtenção só.** Entrar, sair e entrar de novo antes da primeira terminar
   não dispara duas buscas nem grava duas vezes.
3. **Falha nunca remove a categoria** da estrutura nem invalida as demais
   (FR-009).
4. **Vencida com disco disponível serve o disco primeiro.** O catálogo
   antigo não é escondido enquanto o novo não chega (FR-007) — é a mesma
   regra que a geração aplica na importação.
5. **Erro sai como categoria, nunca como mensagem de rede** — a mensagem
   crua carrega a URL com credencial. Mesma disciplina do `importPipeline`.

## 3. Importação (`importPipeline`) — o que muda

| Tipo de fonte | Categorias | Itens | `fetchMode` |
| --- | --- | --- | --- |
| Provedor, protocolo JSON | Das três seções, com nome, ordem e contagem declarada | Nenhum | `on_demand` |
| Provedor, modo limitado (`legacy_m3u`) | Dos grupos encontrados no M3U, na ordem de aparição | Todos, em fluxo | `eager` |
| URL M3U | Idem | Todos, em fluxo | `eager` |

O comportamento observável das duas últimas é o de hoje — importam a lista
inteira, e a tela de progresso conta entradas. **O que muda é que elas
passam a gravar também a estrutura**, para `listCategories` ter um caminho
de leitura só. Sem isso, a mudança de leitura da operação §1 deixaria toda
fonte M3U sem categoria nenhuma.

A tela de progresso passa a contar **categorias** na fonte de provedor, e
continua contando entradas no caminho M3U. Em nenhum dos dois há
percentual (FR-013).

Seção que o painel não sirva continua declarada em `unavailableSections`,
como hoje — a diferença é que agora a ausência é detectada ao buscar as
**categorias** daquela seção, não os itens.

## 4. O que esta feature deliberadamente não cobre

- **Política de descarte quando o espaço acaba** durante a navegação —
  item 51 do backlog. Aqui vale o comportamento atual: para de gravar e
  declara (FR-018 da 005).
- **Virtualização da grade** — feature 009. Este contrato entrega páginas;
  quem as desenha sem travar a TV é aquela.
- **Pré-busca de categorias vizinhas.** Seria otimização plausível, e é
  exatamente o tipo de coisa que transforma "focar não dispara rede" numa
  regra que o código contorna. Fica fora por decisão, não por esquecimento.
