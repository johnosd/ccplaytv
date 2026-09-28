# Lógica — Navegação (Busca, Configurações, canal direto)

Feature `026-home-busca-configuracoes-ds-v14`. Estende
`tv-web/src/navigation/appNav.ts` (redutor puro da 023,
`sdd/specs/023-shell-navegacao-entrada-ds-v14/logic/navegacao-app.md`).

**Travas de outras features que este desenho respeita** (nenhuma pode ser
editada):

- `appNav.shell-navegacao.contract.test.ts` (023) — usa `HomeFocus`
  `{zone:'shortcuts'}` e `{zone:'topbar'}`, `open`/`back`/`open-profiles`.
- `appNav.live-tv-ds-v14.contract.test.ts` (024) — `switch-top` + `back`
  sempre voltando ao Início.
- `LiveScreen.live-tv-ds-v14.contract.test.tsx` (024) e
  `MoviesScreen.filmes-series-ds-v14.contract.test.tsx` (025) montam
  `LiveShellProps`/`VodShellProps` com **exatamente 4 campos** — todo campo
  novo nessas interfaces é **opcional**, senão o `tsc -b` quebra nos arquivos
  travados.

## 1. Telas novas em `AppScreen`

```ts
| { name: 'search'; restore?: SearchSnapshot }
| { name: 'settings'; restore?: SettingsFocus; standalone?: boolean }   // standalone = sem lista ativa, sem topbar
```

E campos opcionais novos nas existentes:

```ts
| { name: 'live'; initialChannel?: { channelId: string; entry: 'favorites' | 'category' }; openFavorites?: boolean; topbarFocus?: TopbarItem }
| { name: 'movies'; restore?: CategoryScreenSnapshot; topbarFocus?: TopbarItem; openFavorites?: boolean }
| { name: 'series'; restore?: CategoryScreenSnapshot; topbarFocus?: TopbarItem; openFavorites?: boolean }
```

- `topbarFocus`: a tela remonta com a topbar ativa nesse item (volta de
  Busca/Configurações com o foco na lupa/engrenagem, FR-034/FR-044).
- `openFavorites` (Filmes/Séries): abre direto em `★ Favoritos` (FR-014). Pode
  ser implementado montando um `restore` sintético
  (`{ trailKey:{kind:'favorites'}, entered:{kind:'favorites'}, col:1,
  focusedItemId:null, searchTerm:'', searchActive:false }`) em vez de prop nova.
- `initialChannel` (Live): §3.

## 2. Ações

| De | Gesto | Ação |
| --- | --- | --- |
| Início / Live / Filmes / Séries | lupa ou engrenagem na topbar | `open` `search`/`settings` com `from` = tela atual **+ `topbarFocus`** (Filmes/Séries: com o snapshot atual em `restore`; Live: **sem** `initialChannel`) |
| Busca ⇄ Configurações | lupa/engrenagem na topbar da outra | `switch-top` (troca sem empilhar) |
| Busca / Configurações | Início / TV ao vivo / Filmes / Séries na topbar | `go-home` (Início) ou `switch-top` (destinos) |
| Live / Filmes / Séries | "Início" na topbar | **`go-home`** (antes: `back`) |
| Perfis | "Gerenciar listas" | `open` `settings` com `standalone: true` |
| Configurações | Editar / Adicionar / Ressincronizar | `open` `edit-source` / `add-source` / `progress`, com `from: { name:'settings', restore: foco, standalone }` |
| Início | card de canal | `open` `live` com `initialChannel {entry:'favorites'}` |
| Início | "Ver todos (N)" de canais / "Filmes (N)" / "Séries (N)" | `open` `live`/`movies`/`series` com `openFavorites: true` |
| Busca | resultado canal | `open` `live` com `initialChannel {entry:'category'}` |

**`go-home`** (ação nova): se houver uma tela `home` na pilha, volta até ela
(descarta tudo acima, mantendo o `focus` que ela guardou); senão, troca a
tela atual por `{ name: 'home' }` com pilha vazia. Necessária porque a Live
agora pode ser aberta a partir da Busca — "Início" como `back` voltaria à
Busca.

`back`, `open`, `switch-top`, `open-profiles`, `source-removed`,
`import-back`, `choose-source`: **inalterados**.

## 3. Live com canal inicial

`LiveScreen` ganha props opcionais `initialChannel?: { channelId: string;
entry: 'favorites' | 'category' }`, `openFavorites?: boolean` (para "Ver
todos" sem canal) e `initialTopbarItem?: TopbarItem`:

1. `entry: 'favorites'` (ou `openFavorites`) → entra em `★ Favoritos`
   (mesmo caminho de `enterFavorites`). `entry: 'category'` → entra na
   categoria do canal: lê o registro (`useCatalogItem(channelId)`) e usa o
   `category_id` dele.
2. Quando o conteúdo carregar, foca o canal **por id** e, **uma única vez**
   (ref de "já consumido"), chama o mesmo caminho do OK que abre a
   reprodução (`setPlaying(channel)`).
3. Canal não encontrado (saiu da fonte, categoria falhou) → fica na entrada,
   sem reprodução e sem mensagem de erro inventada.
4. RETURN do player → lista da Live com o canal focado (comportamento
   existente); RETURN de novo → `back` (volta à origem: Início ou Busca).

Por isso, ao empilhar a Live como `from` (abrir Busca a partir da Live), o
`App` grava `{ name: 'live', topbarFocus: 'search' }` — **nunca** com
`initialChannel`, senão voltar tocaria o canal de novo.

## 4. Configurações e fonte ativa

- `settings` com shell: `activeSourceId = state.activeSource.id`.
- `standalone`: sem topbar; `activeSourceId = state.activeSource?.id ?? null`
  (abrir pela tela de perfis em modo `switch` ainda marca a ativa).
- Excluir a lista ativa → `source-removed` (já existe) → perfis como base,
  pilha zerada (FR-028). Excluir outra lista → nada muda na navegação.
- Ressincronizar → tela de progresso; "Abrir lista" = `choose-source`
  (Início da lista, pilha zerada — comportamento atual); "Voltar" da tela de
  progresso = `import-back` (perfis como base — comportamento atual).
