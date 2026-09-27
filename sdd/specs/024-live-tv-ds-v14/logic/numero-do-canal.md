# Lógica: número do canal

Feature 024 — FR-030, FR-031, SC-005, ADR-011 §6. Implementação:
`tv-web/src/features/live/channelNumber.ts` (`channelNumberOf`,
`knownCategoryCount`). Contrato travado:
`channelNumber.live-tv-ds-v14.contract.test.ts`.

## 1. O que o número é

- **Exibição, nunca identidade.** Favoritos, retomada e foco continuam pela
  chave estável (`stableIdOf`) ou pelo id local. Nada grava, compara ou
  indexa pelo número.
- **O mesmo em qualquer entrada.** Categoria, "Todos", "★ Favoritos" e
  zapping chamam a mesma função com o mesmo registro e a mesma lista de
  categorias. Por isso o número vive no registro (posição) mais nas
  categorias (contagens), nunca no índice da lista exibida.
- **Nunca inventado.** Quando falta dado, a função devolve `null` e a linha
  não mostra número. Um número errado é pior que nenhum.

## 2. Regra

```ts
function channelNumberOf(item, categories): string | null {
  if (item.source_number != null) return format(item.source_number)   // R1 do research.md, só se confirmado
  if (item.category_id == null || item.category_position == null) return null
  const own = categories.find((c) => c.id === item.category_id)
  if (!own) return null
  let offset = 0
  for (const c of categories) {                    // ordem do array é irrelevante
    if (c.order >= own.order) continue
    const known = knownCategoryCount(c)
    if (known === undefined) return null           // uma anterior desconhecida basta
    offset += known
  }
  return format(offset + item.category_position + 1)
}

const format = (n: number) => String(n).padStart(3, '0')   // 7 → "007", 1234 → "1234"
```

`categories` é a lista de categorias **de canal** da fonte ativa, a mesma de
`useCategoryList(sourceId, 'channel')` que a Live já carrega. Nenhuma leitura
nova.

## 3. Contagem conhecida (`knownCategoryCount`)

Uma só definição, usada pelo número (acima) e pela contagem da coluna de
categorias (FR-008). Assim os dois nunca discordam.

| `fetchMode` | Contagem conhecida | Por quê |
|---|---|---|
| `stored` (M3U, feature 014) | `declaredCount` | A importação grava a contagem real da varredura (D-011 da 014), antes de a categoria ser lida. |
| `eager` (M3U legado) | `count` | Os itens já estão todos gravados. |
| `on_demand` (provedor) | `count` **se** `itemsFetchedAt !== undefined`, senão `undefined` | Antes de ler, `count` é `0` por padrão e não significa "vazia". `declaredCount` do painel é ignorado aqui: ele pode divergir do entregue (aviso de divergência da feature 010) e o número tem de bater com o que existe. |

`undefined` = desconhecida. Nunca vira `0`.

## 4. `category_position`

Posição 0-based do item dentro da categoria, na ordem em que a fonte o
entregou. Gravada por `storeCategoryItems` (provedor) e `storeStoredCategory`
(M3U) — as duas funções que escrevem uma categoria inteira de uma vez, na
ordem recebida — como o índice do item no array. Nenhuma outra escrita
precisa dela.

Registros gravados antes desta feature não a têm: sem número até a categoria
ser relida (janela de frescor da feature 010) ou a fonte ressincronizada.
Fontes M3U `eager` (anteriores à feature 014) nunca a ganham sem
ressincronizar. Isso é aceito (R-004).

## 5. Estabilidade

Enquanto a fonte não muda, o número não muda. Duas coisas podem mudá-lo, e
as duas são mudança real da fonte:

- o painel reordenou ou mudou a quantidade de canais de uma categoria
  anterior (a releitura atualiza `count`);
- uma ressincronização trocou a geração.

Ler uma categoria **posterior** nunca muda o número de um canal anterior.
Ler uma categoria **anterior** que estava desconhecida só faz números que
eram `null` aparecerem — nunca troca um número já exibido.
