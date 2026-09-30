# Data Model — 036 Limpar histórico

## §1 `UserStateRecord` (`tv-web/src/lib/catalog/db.ts`) — campo novo

| Campo | Tipo | Índice | Significado |
| --- | --- | --- | --- |
| `historyHiddenAt` | `number?` (epoch ms) | não | Instante em que a pessoa tirou o item do `↺ Histórico`. O item está no Histórico só quando `lastWatched > historyHiddenAt` (ou o campo está ausente). |

- **Dexie continua na v12** — campo de valor, sem índice, sem `.upgrade()`.
  Registros antigos não têm o campo = "nunca escondido" (comportamento de hoje).
- Chave continua sendo o `stableId` (fonte + tipo + id estável + T/E) —
  constitution "Identidade de Reprodução Não Depende da URL".
- Campos que esta feature **nunca** escreve: `isFavorite`, `favoritedAt`,
  `completedAt`, `lastWatched`.
- Campo que ela pode apagar: `progressSeconds` (só no modo "apagar progresso").

## §2 O que cada leitura passa a ver

| Leitura | Muda? | Regra |
| --- | --- | --- |
| `listPlayed` → `loadHistory` → `↺ Histórico` | sim | filtra `isInHistory` |
| `getContinueWatching` → Continuar / herói / "Continuar de" | não | `lastWatched` + `progressSeconds > 0` |
| `listWatched` / selo "Assistido" | não | `completedAt` |
| `listFavorites` | não | `favoritedAt` |

## §3 Remoção da fonte

`deleteUserStatesForSource` já apaga o registro inteiro — o campo novo vai
junto. Nada a mudar.
