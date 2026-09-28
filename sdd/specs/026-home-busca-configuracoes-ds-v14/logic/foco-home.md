# Lógica — Foco e rails do Início

Feature `026-home-busca-configuracoes-ds-v14`, US1 (FR-009..FR-020).
Contrato travado: `tv-web/src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`.

## 1. Composição

```text
<div class="screen home-screen">                 ← raiz .screen (plano de hardware, D-008)
  <AppShell topBar={<TopBar currentItem="home" …/>} hints=…>
    <HomeContent …/>                             ← novo: hero + rails + mocks
  </AppShell>
  {playing && <PlayerLayer …/>}
  {showExit && <ExitModal …/>}
</div>
```

`HomeScreen.tsx` continua dono dos dois escopos de teclado (`zone: 'topbar' |
'content'`, feature 023, `logic/foco-shell.md` da 023) e passa a ser dono de
`playing`. `HomeContent.tsx` (novo, `features/home/`) substitui
`ListHomeScreen` como escopo `content`, com a mesma interface de escopo:
`active`, `onExitUp`, `initialFocus`, `onBack`.

## 2. Linhas navegáveis (ordem vertical)

| Linha | Existe quando | Itens (LEFT/RIGHT) |
| --- | --- | --- |
| `hero` | sempre | ações do hero (`logic/hero-home.md` §4) |
| `continue` | "Continuar assistindo" tem ≥ 1 item | cards portrait (sem "Ver todos") |
| `mylist` | "Minha Lista" tem ≥ 1 item | cards portrait + `Filmes (N)` se N>0 + `Séries (N)` se N>0 |
| `channels` | "Canais favoritos" tem ≥ 1 item | cards de canal + `Ver todos (N)` |
| `ai` | sempre | um único card `ComingSoon` ("Curadoria IA") |
| `dock` | sempre | ícones soft disabled: TMDB, IA, Clima, Teste de velocidade |

- Linha que não existe **não é renderizada** e é pulada pelo UP/DOWN
  (FR-010). Enquanto a consulta carrega, a linha mostra `Skeleton` com a
  geometria do card e **não é focável** (é pulada).
- UP na linha `hero` → `onExitUp()` (topbar em "Início", como a 023).
- DOWN na última linha: nada. LEFT/RIGHT com `clamp` nas pontas.
- Cada linha lembra seu item focado **por id** (`itemId` do card, ou os ids
  sentinela `__see-all__`, `__movies__`, `__series__`), não por índice.
- **Linha efetiva** (padrão da 023 em `ListHomeScreen`): se a linha em foco
  deixa de existir com a tela montada (último favorito removido, item
  concluído), o foco cai na linha existente mais próxima **acima** (em último
  caso `hero`), nunca em nada (FR-018). O mesmo vale para o item: id sumiu →
  mesmo índice clampado na linha.

## 3. Foco inicial e restauração (FR-004, FR-017)

- Sem `initialFocus`: `hero`, índice 0 (ação primária).
- `initialFocus` (`HomeFocus`, ver §5) é aplicado quando a linha dele terminar
  de carregar (mesmo mecanismo `pendingRestoreIdRef` do `ListHomeScreen`
  antigo). Id que não existe mais → vizinho (mesmo índice clampado) na mesma
  linha; linha inexistente → `hero` índice 0.
- Fechar o player do hero → `hero` índice 0 (o `HomeScreen` não é remontado,
  só troca `playing`).

## 4. Ações

| Linha | OK |
| --- | --- |
| `continue`, `mylist` (card) | `onOpenItem(item, from)` — episódio já vem como série (`useContinueWatchingContent`) |
| `mylist` `Filmes (N)` / `Séries (N)` | `onOpenFavorites('movies' \| 'series', from)` |
| `channels` (card) | `onOpenChannel(channel, from)` |
| `channels` `Ver todos (N)` | `onOpenFavorites('live', from)` |
| `ai`, `dock` | anúncio "Em breve — {message}" (registro único) |

`from` é o `HomeFocus` da posição atual (para o RETURN devolver).

**Contagens N** (FR-014): número de itens **resolvidos** que a pessoa verá ao
abrir `★ Favoritos` daquele tipo — nunca a contagem bruta de favoritos
gravados (os não resolvidos já são omitidos em `★ Favoritos`, feature 013).

## 5. `HomeFocus` (em `navigation/appNav.ts`)

```ts
export type HomeFocus =
  | { zone: 'topbar'; item: TopbarItem }
  | { zone: 'shortcuts'; destination: TopDestination }     // ações do hero de boas-vindas (mantida: contrato 023)
  | { zone: 'hero'; action: 'primary' | 'details' | 'mylist' | 'trailer' }
  | { zone: 'rail'; rail: 'continue' | 'mylist' | 'channels' | 'ai'; itemId: string }
  | { zone: 'dock'; service: string }
```

A variante `{ zone: 'continue' }` da 023 pode ser removida (nenhum contrato a
usa); `topbar` e `shortcuts` **não** podem (contratos travados 023/024).

## 6. Dados das rails

- `continue`: `useContinueWatchingContent(sourceId)` (existe).
- `mylist`: **novo** `useMyListContent(sourceId)` em `catalogApi.ts`, chave
  `['my-list-content', sourceId]`: favoritos de filme **e** série da lista,
  na ordem `favoritedAt` desc entre os dois tipos (`getGlobalFavorites` +
  filtro de fonte/tipo + `resolveFavorites` por item, como
  `resolveContinueWatching`), devolvendo `{ items, movieCount, seriesCount }`.
- `channels`: `useFavoritesContent(sourceId, 'channel', true)` (existe).

Montar o Início e ler essas consultas locais **não** viola "focar nunca
dispara consulta" — é renderização de tela, não foco, e nenhuma é externa.

## 7. Geometria (Rail da feature 022)

`Rail` exige `itemWidth` **e** `itemHeight` (R-007 da 022 — sem altura a rail
colapsa). Cards de capa: `ContentCard` `portrait` (205×302 + título). Cards de
canal: logo + nome + slot "Agora" vazio (FR-015), na mesma altura da rail de
capa ou numa rail própria mais baixa — decidir no execute, sempre por token.
Os itens "Ver todos"/"Filmes (N)"/"Séries (N)" ocupam o mesmo slot do card da
rail (mesma largura), para o `Rail` continuar com tamanho fixo.
