# Lógica: "↺ Histórico" de Filmes e Séries

Feature 025 — FR-007, FR-009..FR-015, US2. Contrato travado:
`tv-web/src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts`.
Stub: `tv-web/src/lib/catalog/history.ts` (`loadHistory`).

## 1. O que conta como "reproduzido"

Um `UserStateRecord` com `lastWatched` definido. Hoje só `updateProgress`
grava `lastWatched` (`userStateRepository.ts`), e só o `progressRecorder`
chama `updateProgress`, durante a reprodução real. Por isso:

- filme marcado como assistido à mão, sem nunca ter sido reproduzido, **não**
  tem `lastWatched` e fica fora (FR-011) — `setWatchedManually` →
  `markCompleted` não toca `lastWatched`;
- filme concluído depois de reproduzido tem `lastWatched` da última gravação
  de progresso e entra, com o selo de assistido (FR-009);
- `clearProgress`/`markCompleted` não apagam `lastWatched`: o item continua
  no Histórico depois de concluído.

**Não mudar** `markCompleted` para gravar `lastWatched`: isso colocaria no
Histórico o filme marcado à mão (viola FR-011). O comentário de
`markCompleted` que diz "atualiza `lastWatched`" está errado desde a 012;
corrigir o comentário, não o comportamento (T040 em `tasks.md`).

## 2. Leitura dos estados

Nova função em `userStateRepository.ts`:

```ts
/** Estados reproduzidos de uma fonte e tipo, do mais recente para o mais antigo. */
export async function listPlayed(
  sourceId: string,
  kind: 'movie' | 'episode',
  database: CatalogDb = db,
): Promise<UserStateRecord[]>
// database.userStates.orderBy('lastWatched').reverse()  — índice já existe
//   .filter(s => s.sourceId === sourceId && s.stableId.startsWith(`${sourceId}|${kind}|`))
```

Mesmo padrão de `getContinueWatching`, sem o filtro de `progressSeconds`.
O prefixo do `stableId` separa filme de episódio; nunca `split` à mão fora
de `userStateRepository.ts` (regra da 013).

## 3. `loadHistory(sourceId, 'movie')`

```
states  = listPlayed(sourceId, 'movie')
parts   = states.map(parseStableId).filter(não nulo)      // inválido conta como não resolvido
{records, unresolved} = resolveFavorites(sourceId, 'movie', parts)   // lote, mantém a ordem
return { records, unresolved: unresolved + (states.length - parts.length) }
```

`resolveFavorites` já devolve os registros na ordem de entrada, pulando os
não resolvidos. É o mesmo núcleo que Favoritos e "Continuar assistindo" usam
(id do painel por índice; nome por uma varredura que para cedo).

## 4. `loadHistory(sourceId, 'series')`

O dado é por episódio; o card é por série.

```
states = listPlayed(sourceId, 'episode')                  // mais recente primeiro
parts  = states.map(parseStableId).filter(não nulo)
{records: episodes} = resolveFavorites(sourceId, 'episode', parts)
```

**Atenção**: `resolveFavorites` pula os não resolvidos sem dizer quais. Para
contar episódio a episódio e manter a ordem, resolva **um estado por vez**
(como `resolveContinueWatching`) ou estenda `resolveFavorites` para devolver
também o mapeamento — a escolha é do executor, desde que:

```
seen = Set<seriesId>()
out  = []
unresolved = 0
para cada estado, na ordem (mais recente primeiro):
  episódio = registro resolvido deste estado
  se não há episódio ou episódio.seriesId ausente: unresolved += 1; continue
  se seen.has(episódio.seriesId): continue            // já entrou numa posição mais recente
  série = channels [sourceId+generation+seriesId] com kind 'series' (cache por seriesId)
  se não há série: unresolved += 1; continue
  seen.add(seriesId); out.push(série)
return { records: out, unresolved }
```

- Uma série aparece uma vez, na posição da reprodução mais recente de
  qualquer episódio dela (FR-010).
- `unresolved` conta **episódios** sem série exibível. Não dá para saber a
  série de um episódio que saiu do catálogo, e o identificador do episódio no
  `stableId` é o id do próprio episódio. A mensagem da tela diz isso
  ("N episódios assistidos não puderam ser associados a uma série desta
  lista"), nunca "N séries".
- Episódio de série cujos episódios ainda não foram obtidos nesta geração
  (fonte ressincronizada, série nunca aberta de novo) não resolve. É a mesma
  limitação do "Continuar assistindo" da 019 (R-004 do plano).
- Nunca chama `ensureSeriesEpisodes` nem rede: só lê o que está gravado.

## 5. Hook e contagem (FR-007)

`catalogApi.ts` ganha:

```ts
export function useHistoryContent(sourceId: string | null, kind: 'movie' | 'series', enabled: boolean)
// queryKey ['history-content', sourceId, kind]
// queryFn: loadHistory → { items: CatalogItemOut[] (toItemOut), unresolved }
// gcTime: Infinity (a contagem vale pela sessão)
```

`enabled` = a pessoa entrou em "↺ Histórico" agora **ou** já entrou antes
nesta sessão (`isHistoryKnown(sourceId, section)`, `vodSessionMemory.ts`).
Ao entrar pela primeira vez, a tela chama `markHistoryKnown`.

- Contagem na side nav: `data.items.length` quando `data` existe; senão, sem
  número (FR-007). Nada é resolvido só por abrir a tela antes da primeira
  entrada.
- Invalidação: `invalidateUserState` e `invalidateUserStates` (os dois pontos
  que o fechamento do player já chama) passam a invalidar também
  `['history-content']` (prefixo), e `useToggleWatched` também (o selo muda).
  Como a consulta fica habilitada depois da primeira entrada, a contagem se
  atualiza sozinha ao voltar do player.

## 6. Tela

- Entrada `history` na side nav, logo depois de "★ Favoritos", ícone
  `history` (novo em `iconPaths.ts`), `pinned`, sem selo ★.
- Vazio (`items.length === 0` e sem erro): `EmptyState` com "Os filmes e
  séries reproduzidos neste perfil aparecerão aqui." e ação focável "Voltar"
  (volta à side nav). Título "Seu histórico está vazio".
- Com `unresolved > 0`: nota sob a grade, no padrão de
  `FavoritesUnresolvedNote` (texto de §4 para Séries; para Filmes, "N filmes
  assistidos não estão mais nesta lista.").
- Sem "Ordenar" (FR-022). "Pesquisar" vale como em qualquer entrada com
  itens (filtra o que está no Histórico).
- Card: mesmo card da grade (estrela, selo assistido, resumo "Em dia" da
  série). OK abre o detalhe, com o snapshot de volta (FR-031).
- Nada de remover/limpar (FR-014).
