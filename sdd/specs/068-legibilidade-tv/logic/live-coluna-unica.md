# Lógica — TV ao vivo em coluna única, sem cabeçalho (068, US2)

## 1. O que já existe (não reescrever)

A Live já tem as duas camadas que a US2 pede, em `features/live/useLiveKeyboard.ts`:

- `effectiveCol === 0` → trilha de categorias; `1` → lista de canais.
- OK na trilha (`enterFocusedTrailItem` → `enterCategory`/`enterFavorites`/`enterAll`) → `setCol(1)`.
- RETURN na lista de canais → `setCol(0)`; o foco da trilha é por **identidade**
  (`focusedIdentity.trailKey`), então volta à categoria de onde veio.
- RETURN na trilha → `onBack()` (o `App` faz `goBack`, que volta ao Início).
- ←/→ paginam (049), nunca trocam de coluna.

A US2 é, portanto, **apresentação**: mostrar só a coluna ativa e tirar o topo.
Nenhuma regra de teclado muda, exceto o "↑ no topo da trilha sobe à topbar", que
some sozinho porque não haverá `shell`.

## 2. Mostrar só a coluna ativa

- As três colunas continuam no DOM (`.live-column-groups`, `.live-column-channels`,
  `.live-preview-panel`) — vários contratos travados (018/024/030/031/048/049/
  memória de foco) consultam essas classes, inclusive a lista de canais vazia com
  a trilha focada.
- `.live-body` ganha `data-live-view="categories"` quando `effectiveCol === 0` e
  `"channels"` quando `1` (fixado pelo contrato `LiveScreen.legibilidade-tv`).
- CSS esconde a coluna inativa (`.live-body[data-live-view="categories"]
  .live-column-channels { display: none }` e o inverso). `display: none` tira do
  layout e da árvore de acessibilidade no navegador real; no jsdom o DOM continua lá.
- Larguras: a coluna visível ocupa ~1/3 da largura útil (≈ 576 px de 1728 px);
  o destaque (`.live-preview-panel`) ocupa o resto. Valores em tokens de espaço.
- Com a coluna de canais escondida e a trilha focada, o destaque mostra o mesmo
  de hoje para a trilha (categoria/estado vazio); com a lista de canais, o canal
  focado (nome, número, EPG). Focar continua sem tocar nada.

## 3. Sem topbar e sem bloco de título

- `App.tsx` (`case 'live'`) **deixa de passar `shell`** para `LiveScreen`. O tipo
  `LiveShellProps`/prop `shell` continuam existindo: o contrato travado da 024
  (`LiveScreen.live-tv-ds-v14`) monta a Live **com** `shell` e espera a topbar.
- Sem `shell`, `renderLiveShell` hoje devolve só os filhos — e perderia o rodapé
  de dicas (HintBar). Seguir o precedente da grade de Filmes/Séries sem topbar
  (`VodCategoryScreen.tsx`: `<AppShell topBar={null}>`): manter `AppShell` com
  `topBar={null}` e as mesmas `hints`.
- O bloco `.live-header` (título "TV ao vivo", subtítulo e os `Chip`s de
  categoria/contagem) **sai** — o contrato confere que `.live-header` não existe e
  que não há heading "TV ao vivo".
- A contagem vai para o cabeçalho da lista de canais
  (`.live-column-channels .live-panel-head`): nome da entrada + `t('live.channelCount', { n })`
  ("N canais"). Mesmo texto que o selo já usava; sem chave nova.
- `initialTopbarItem`/`topbarFocus` da Live ficam sem efeito quando não há `shell`.

## 4. "Gerenciar categorias" sem topbar (D-010 da 067)

Hoje o vazio "todas escondidas" só oferece "Gerenciar categorias" quando há
`shell.onOpenSettings` (`LiveScreen.tsx`: `onManage: shell?.onOpenSettings && …`,
em dois lugares). Sem `shell`, o botão viraria "Voltar" — regressão da 066/067.

- Prop nova `onManageCategories?: () => void` (stub já criado).
- Regra: `onManage = shell?.onOpenSettings ? () => shell.onOpenSettings('parental') : onManageCategories`.
- `App.tsx` passa `onManageCategories={() => openListSettings(dispatch, source.id, { name: 'live' }, { tab: 'parental' })}`
  — o mesmo destino que o `shell` usava (tela da lista ativa, aba Categorias).

## 5. Tetos e cuidados

- `LiveScreen.tsx` está em **349/349** linhas: tirar o `.live-header` (≈10 linhas)
  dá a folga para o `data-live-view`, o `AppShell` e o `onManage`.
- `liveColumns.tsx` em 510/511: o cabeçalho com a contagem precisa compensar.
- `App.tsx` 565/625: tirar o objeto `shell` (≈16 linhas) dá folga.
- E2E que usam a topbar dentro da Live ou o título (`live-tv-ds-v14.mjs`,
  `live-paridade-v14.mjs`, `zapping-live-tv.mjs`, `navegacao-por-pagina.mjs`,
  `memoria-foco-key-repeat.mjs`, `epg-*`, `categorias-controle-parental.mjs`
  — este usa a topbar a partir do **Início**, que continua) precisam de ajuste.
