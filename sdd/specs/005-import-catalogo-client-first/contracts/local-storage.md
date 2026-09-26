# Contrato — superfície local que as telas consomem

Substitui a superfície HTTP (`/sources`, `/catalog-items`,
`/import-jobs`) que as telas usam hoje. Nenhuma tela fala com IndexedDB
nem com Dexie diretamente (D-001): tudo passa por aqui.

O objetivo deste contrato é que a migração das telas seja uma troca de
origem de dados, não uma reescrita de tela — e que trocar a camada de
armazenamento depois não alcance nenhuma tela.

## 1. Fontes (`sourceRepository`)

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Listar | — | Fontes sem credencial | **Nunca** devolve usuário/senha. O endereço do servidor é devolvido (é o que permite editar sem redigitar credencial). |
| Obter uma | id | Fonte sem credencial | Idem. |
| Criar | tipo, nome, e URL **ou** credencial | id criado | Normaliza o endereço antes de gravar; recusa credencial embutida na URL. |
| Atualizar | id + campos parciais | Fonte atualizada | Campo ausente ou vazio mantém o valor atual — nunca apaga. Alterar credencial invalida a marca de migração (FR-020). |
| Remover | id | — | Remove fonte, catálogo de todas as gerações e execuções associadas. |
| Marcar sincronização | id, instante, modo | — | Só é chamada no sucesso; falha não avança a marca (FR-016). |

**Acesso à credencial**: existe uma operação separada e de uso restrito,
consumida **apenas** pelo conector e pela montagem de URL de reprodução.
Não é exposta às telas, não retorna em listagem e não aparece em nenhum
objeto que a interface renderize (FR-009, D-005).

## 2. Catálogo (`catalogRepository`)

**Atualização (feature 010, 2026-09-23):** "Listar categorias" abaixo
descreve a forma original, onde a categoria era um número derivado das
chaves únicas de `channels`. Isso mudou — categoria virou entidade própria
numa coleção `categories`, com estrutura obtida separadamente dos itens.
Ver `sdd/specs/010-catalogo-sob-demanda/contracts/catalog-on-demand.md` §1
para a forma atual; o restante desta tabela (paginação de canais, contagem,
publicação/descarte de geração) continua válido sem alteração.

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Listar categorias | sourceId | Categorias na ordem declarada pela fonte | Lê da geração ativa. Ordem vem de `groupOrder`, nunca de ordenação alfabética imposta. |
| Listar canais de uma categoria | sourceId, categoria, deslocamento, limite | Página de canais | **Paginado por contrato** (FR-005): a tela pede uma janela, não o catálogo. |
| Contar canais | sourceId, categoria? | número | Usado para estados vazios; nunca para prometer completude do catálogo da fonte. |
| Obter canal | id | Canal | Para resolver reprodução. |
| Gravar lote | sourceId, geração, canais | — | Escrita em lote, dentro de transação. Rejeição por falta de espaço é sinalizada ao chamador, não engolida (FR-018). |
| Publicar geração | sourceId, geração | — | Troca o ponteiro da fonte e descarta as gerações anteriores — nesta ordem (D-004). |
| Descartar geração | sourceId, geração | — | Usado para limpar uma importação que falhou, sem tocar na ativa. |

**Leitura sempre da geração ativa**: quem chama não informa geração. Isso
impede uma tela de ler acidentalmente um catálogo pela metade que ainda
está sendo escrito.

## 3. Importação (`importPipeline`)

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Iniciar | sourceId | id da execução | Recusa se já existir execução ativa para a fonte (FR-017). |
| Acompanhar | id da execução | Etapa, contadores, status | É o que a tela de progresso consome. Contadores são reais; sem denominador confiável, não há percentual. |
| Cancelar | id da execução | — | Cancelamento cooperativo: descarta a geração em escrita, preserva a ativa. |

**Resultado de erro é categoria, não mensagem**: o pipeline devolve qual
das quatro situações de FR-011 ocorreu — credencial recusada, assinatura
expirada, conexão direta recusada, falha de rede. A tela escolhe o texto;
o pipeline nunca entrega a mensagem crua da rede, que carrega a URL
completa.

## 4. Reprodução (`playbackUrl`)

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Resolver | id do canal | URL de reprodução | Monta na hora a partir do identificador do provedor + credencial + formato permitido. Para fonte por URL M3U, devolve a URL gravada (ver `data-model.md` §4). |

**Não é cacheável e não é estado de tela**: cada tentativa de reproduzir
resolve de novo — a URL é sensível e pode expirar. É a mesma regra que a
feature 003 já aplica hoje ao não tratar isso como consulta de tela.

## 5. Frescor (`freshness`)

| Operação | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| Decidir ao abrir | sourceId, instante atual | Ação: nada / migrar / atualizar por idade | Porta a decisão que hoje vive no backend. O instante é **injetado**, não lido do relógio dentro da função — é o que torna a regra testável e imune a relógio errado do aparelho. |

Fonte que nunca sincronizou com sucesso não tem idade a comparar: é
tratada como pendente de importação, nunca como "velha".

## 6. O que deixa de existir

Com esta superfície no lugar, nenhuma tela precisa mais de
`VITE_API_URL`, `fetch` para `/sources`, `/catalog-items` ou
`/import-jobs`, nem de invalidação de consulta remota após importar. O
caminho HTTP continua existindo no repositório (backend congelado), mas
não é mais o que as telas consomem.
