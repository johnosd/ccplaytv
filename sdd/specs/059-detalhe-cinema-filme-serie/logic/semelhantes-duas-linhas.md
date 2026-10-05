# Lógica: Semelhantes em duas linhas e navegação do painel

## 1. Linhas

A partir de `similar.titles` (já na ordem do TMDB, encontrados primeiro — feature 035):

```ts
const found = titles.filter((t) => t.localItemId !== undefined)
const missing = titles.filter((t) => t.localItemId === undefined)
```

Renderização em `SimilarPanel` (estado `ready`):

```
p.similar-coverage                      ← inalterado, acima das linhas
section.similar-section[aria-label]     ← "Na sua lista"
  h3.similar-section-title  "Na sua lista"                 (person.inList, já existe)
  found.length ? div.similar-row … : p.similar-empty "Nenhum título semelhante está na sua lista."   (detail.similar.noneInList, novo, NÃO focável)
section.similar-section                 ← só se missing.length > 0
  h3.similar-section-title  "Não encontrados na sua lista"  (detail.similar.missingRow, novo)
  div.similar-row …
OriginTag tmdb                          ← inalterado
```

- As duas fileiras mantêm `div.similar-row`, `div.similar-card[data-similar-key]` e o `scrollIntoView` atual (E2E e rolagem dependem deles).
- Cartões **sem selo visível** (decisão do usuário). Nos não encontrados, o texto `t(NOT_FOUND_KEY)` continua no DOM dentro do cartão, como `<span className="sr-only">` — nome acessível (FR-014) e o contrato da 035 (`getAllByText('Não encontrado na sua lista')` com 1 item) dependem dele. Os encontrados não levam texto extra.
- Cartões da linha "Não encontrados" ficam com opacidade reduzida até o foco (CSS, token de opacidade/`--text-secondary` — nada literal).
- `PersonScreen` também usa `.similar-chip`: **não** remover a regra CSS nem a constante `NOT_FOUND_KEY`.
- Os títulos de linha são `h3` (o contrato procura `role=heading` pelo nome exato, sem contagem entre parênteses).

## 2. Grade de foco do painel

Hoje as telas têm `panelKeys: string[]` (uma linha). Passa a ser `panelRows: string[][]`:

| Aba | `panelRows` |
| --- | --- |
| Elenco (com pessoas) | `[castKeys]` |
| Semelhantes `ready` | `[foundKeys, missingKeys].filter((r) => r.length > 0)` |
| Semelhantes `no_key` | `[[CONFIGURE_KEY]]` |
| demais | `[]` |

Helper puro novo em `tv-web/src/features/vod/detailPanelGrid.ts`, usado pelas DUAS telas:

```ts
export type PanelMove = { kind: 'focus'; key: string } | { kind: 'exit-up' } | { kind: 'stay' }

export function movePanelFocus(rows: string[][], key: string, dir: 'left' | 'right' | 'up' | 'down'): PanelMove {
  const r = rows.findIndex((row) => row.includes(key)); const i = rows[r].indexOf(key)
  if (dir === 'left' || dir === 'right') {
    const next = clamp(i + (dir === 'left' ? -1 : 1), 0, rows[r].length - 1)      // para na ponta, nunca dá a volta
    return next === i ? { kind: 'stay' } : { kind: 'focus', key: rows[r][next] }
  }
  if (dir === 'up') return r === 0 ? { kind: 'exit-up' } : { kind: 'focus', key: rows[r - 1][Math.min(i, rows[r - 1].length - 1)] }
  return r === rows.length - 1 ? { kind: 'stay' } : { kind: 'focus', key: rows[r + 1][Math.min(i, rows[r + 1].length - 1)] }
}
```

- Mesma regra de índice da `PersonScreen` (troca de linha mantém a coluna, limitada ao tamanho da linha).
- `exit-up` ⇒ a tela faz o que já faz hoje no ↑ do painel: `setFocusedTabId(activeTab); setRow('tabs')`.
- `panelKeys` continua existindo como `panelRows.flat()` para: validar a chave restaurada (D-008 da 035), `useEnterSimilarPanel` (primeiro título = `flat()[0]`, que é o 1º encontrado, ou o 1º não encontrado quando não há encontrados — FR-018), e o ↓ das abas (`panelKeys[0]` quando não há chave válida).
- Restauração por identidade (`restore.focusKey`) segue funcionando porque a chave é procurada em qualquer linha.
- Na série, a aba Episódios **não** usa esta grade (tem `season`/`episodes` próprios — inalterados).
