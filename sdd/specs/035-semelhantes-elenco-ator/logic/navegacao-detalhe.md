# Lógica — Pilha detalhe ⇄ semelhante ⇄ ator (FR-019)

Arquivos: `tv-web/src/navigation/appNav.ts`, `tv-web/src/App.tsx`,
`features/vod/detailSnapshot.ts` (stub), `features/person/personSnapshot.ts`.

## 1. Reducer — nada de ação nova

A pilha já existe (`history: AppScreen[]`, sem limite). Tudo é `open` com
`from` carregando o snapshot da tela que sai, e `back` desempilha:

```ts
// detalhe → outro detalhe (cartão encontrado)
dispatch({ type: 'open',
  screen: t.kind === 'movie' ? { name: 'movie-detail', movieId: t.itemId }
                             : { name: 'series-detail', seriesId: t.itemId },
  from: { ...screen, restore: from } })

// detalhe → ator
dispatch({ type: 'open', screen: { name: 'person', personId, personName }, from: { ...screen, restore: from } })

// detalhe → Configurações › Integrações & BYOK ("Configurar TMDB")
dispatch({ type: 'open', screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations' } },
  from: { ...screen, restore: from } })

// ator → detalhe
dispatch({ type: 'open', screen: <detalhe>, from: { ...screen, restore: from } })
```

`screen` é a tela atual (`movie-detail`/`series-detail`/`person`); o
`restore` antigo dela é substituído pelo novo. Nenhuma outra tela muda.
Tipos novos em `AppScreen`: `restore?` nos dois detalhes e a tela `person`.

## 2. Montagem com `restore`

Detalhe (`MovieDetailScreen`/`SeriesDetailScreen`):

```text
activeTab inicial = restore?.tab ?? padrão ('details' filme, 'episodes' série)
restore.focusKey presente → row = 'panel', panelFocusKey = focusKey
senão restore presente    → row = 'tabs', focusedTabId = restore.tab
linha efetiva: row 'panel' e a chave não está nos itens atuais do painel
               → fileira 'tabs' na aba ativa (nunca foco invisível)
```

Os itens podem chegar depois (metadata/resolução assíncronas): como a linha
é derivada, o foco "pousa" no cartão quando ele aparece, sem efeito extra.

`PersonScreen`: `restore.focusKey` → rail e item com essa chave; ausente da
lista → primeiro item do primeiro rail.

## 3. Garantias

- Cada RETURN volta exatamente uma tela (SC-003: detalhe → semelhante →
  detalhe → ator → detalhe → 4 RETURN → detalhe de origem, aba e cartão).
- Restauração por **chave** (`tmdb:<kind>:<id>` / `person:<id>`), nunca por
  índice — a ordem pode mudar entre a ida e a volta (categorias abertas no
  meio do caminho mudam quem é "encontrado").
- O detalhe do mesmo título pode aparecer duas vezes na pilha (A → B → A):
  permitido; cada entrada tem o próprio snapshot.
- Nenhuma tela desta feature tem topbar; `go-home` não é afetado.
