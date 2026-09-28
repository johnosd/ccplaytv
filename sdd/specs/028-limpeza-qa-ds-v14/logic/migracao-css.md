# Lógica: eliminar `features/screens.css` sem mudar nenhuma tela (feature 028)

Fonte da verdade para o "como" da US5 (FR-018–FR-022, FR-024) e da prova de
paridade. O risco não é apagar regra morta — é **mover regra viva e mudar
quem vence a cascata**.

## 1. Ordem de import hoje (`tv-web/src/main.tsx`)

```
fonts → index → utilities → components → live → vod → [screens] → player
      → shell → home → profiles → onboarding → settings → search
```

Com especificidade igual, vence o arquivo importado **depois**. Então hoje:

- uma regra de `screens.css` **ganha** de `utilities`, `components`, `live`,
  `vod` (e de `index`) quando o seletor/especificidade empata;
- e **perde** de `player`, `shell`, `home`, `profiles`, `onboarding`,
  `settings`, `search`.

Classes declaradas em `screens.css` **e** em outro arquivo (inventário do
plan, confirmar com grep): `.live-column*`, `.live-state*`,
`.live-truncated-note`, `.category-title-row`, `.search-*`, `.screen-title`,
`.screen-subtitle`, `.poster-box*`, `.fav-star`, `.fav-hint`,
`.watched-badge`, `.field-box`, `.toast`, `.channel-row`.

## 2. Regra de destino (D-003)

1. **Novo `tv-web/src/styles/shared.css`, importado exatamente no slot do
   `screens.css`** (entre `vod.css` e `player.css`). Mover para ele nunca
   muda a cascata. É o destino padrão de tudo que é compartilhado por mais
   de uma tela/componente.
2. **Início de `tv-web/src/styles/player.css`** — vem logo depois do slot,
   sem nada entre os dois: mover para o topo dele também não muda a
   cascata. Destino da camada de reprodução.
3. **Qualquer outro arquivo (anterior ou posterior ao slot)**: só se a
   classe **não** aparece em nenhum arquivo entre o destino e o slot. Se
   aparece, ou vai para `shared.css`, ou as declarações são **mescladas** na
   regra que vence hoje, preservando o valor efetivo de cada propriedade.
4. Nunca mudar seletor, especificidade, valor ou ordem relativa das regras
   dentro do bloco movido. Só se removem regras sem uso (§4).

## 3. Mapa inicial (o executor confirma cada linha com grep e paridade)

| Bloco em `screens.css` | Destino |
| --- | --- |
| `.screen`, `.screen-title`, `.screen-subtitle`, `@keyframes ccp-fade/ccp-pop/ccp-toast` | `shared.css` |
| `.field-box`(+`:focus`), `.form-error`, `.field-label` (se vivo) | `shared.css` (Live, Filmes/Séries e Adicionar lista usam) |
| `.limited-mode-notice*` | arquivo da tela que monta `LimitedModeNotice` se a regra 3 permitir; senão `shared.css` |
| `.live-column*`, `.live-state*`, `.live-truncated-note`, `.category-title-row*`, `.search-icon-button`, `.search-field-row`, `.search-field`, `.search-status`, `.search-coverage` | `shared.css` (Live, Filmes/Séries, detalhes e Favoritos) |
| `.player-overlay`, `:root.video-plane-visible …` (as duas regras), `.player-surface`, `.player-video`, `.player-status*`, `.player-message*`, `.player-actions`, `.player-action*`, `.player-zap-scrim` | topo de `player.css`, na mesma ordem |
| `.poster-box*` (`PosterArt`) | `shared.css` (declarada também em `components`/`live`/`vod`/`home`/`player`) |
| `.toast` | `shared.css` (declarada também em `utilities.css`) |
| `.fav-star`, `.poster-box .fav-star`, `.poster-box .watched-badge`, `.fav-hint` | `shared.css` |

## 4. Sem uso (candidatos a remoção, FR-020)

Nenhuma referência no código fora de comentários, no inventário do plan:
`.screen-row`, `.screen-eyebrow`, `.home-empty*`, `.tabs-row`, `.tab-pill`,
`.field-group` (+ `label`), `.submit-button`, `.live-item` (+ `.tv-focus`),
`.live-item-favorites`, `.live-item-all`, `.live-state-actions`,
`.player-controls`, `.player-time*`, `.player-buttons`,
`.player-control-button` (o `PlayerControls` saiu na 027) e
`.confirm-dialog*`.

Antes de remover cada uma: `Grep` pelo nome exato **e** por montagem
dinâmica (`` `${...}` ``, `className={cond ? 'x' : ''}`). Se não der para
provar nem refutar o uso, a regra fica (em `shared.css`) e é registrada.

`.confirm-dialog*` só é usada por `components/ConfirmDialog.tsx`, que nenhum
arquivo do app importa (só o próprio teste). O `Modal` (022) o substituiu. O
componente e o teste saem junto com o CSS (D-006).

## 5. Paridade (FR-022, SC-006) — `tv-web/e2e/paridade-limpeza.mjs`

Três modos:

```
node e2e/paridade-limpeza.mjs antes     # ANTES de qualquer mudança de CSS/TSX da 028
node e2e/paridade-limpeza.mjs depois
node e2e/paridade-limpeza.mjs comparar  # sai 1 se houver diferença não listada
```

- Saída: `sdd/specs/028-limpeza-qa-ds-v14/evidencias/paridade/{antes,depois}/NN-nome.png`.
- Palco 1920×1080, headless **com** o `--hide-scrollbars` padrão do
  Playwright (a remoção de barras é medida à parte, §6 — aqui a paridade
  isola a mudança de CSS).
- Determinismo: reduzir movimento ligado antes do primeiro load (chave de
  `lib/motionPreference.ts`), fontes carregadas (`document.fonts.ready`),
  foco em estado conhecido, e `mask` do Playwright em qualquer conteúdo
  que muda sozinho (relógio/data, se houver).
- Rede: servidor HTTP local da fixture. Interceptar **só o host fictício**
  (`http://<host>.e2e.test/**` ou o `127.0.0.1:<porta>` do servidor),
  **nunca** `**/live/**`/`**/vod/**`/`**/series/**`: esses globs casam com os
  módulos do Vite dev server (`/src/features/live/*.tsx`) e derrubam o app
  (achado da 027, T040). O `e2e/paridade-visual.mjs` da 021 tem exatamente
  esse glob — não copiar.
- Telas/estados mínimos (um PNG cada): Perfis sem lista, Adicionar lista,
  Importação concluída, Perfis com uma lista, Perfis › modal excluir,
  Início, Início › modal sair, Busca com resultados, Busca sem resultado,
  Configurações › Fontes, › Acessibilidade, › aba "Em breve", Live
  (categoria), Live (★ Favoritos vazio), Filmes (grade), Filmes (busca na
  categoria), Séries (grade), detalhe de filme, detalhe de série,
  detalhe de série › modal de temporada, player VOD com chrome, player
  Live com faixa, tela de erro do player. O Splash fica fora (animação por
  tempo) — coberto na matriz.
- `comparar`: carrega cada par de PNG numa página em branco, compara
  pixel a pixel via `canvas.getImageData` (sem dependência nova), e
  imprime por tela: pixels diferentes e o retângulo que os contém. Uma
  constante `INTENTIONAL` no script lista tela → motivo (US1 no Início,
  ícones do FR-023, correções da matriz). Diferença fora dela → exit 1.
  A mesma lista vai para `matriz-qa.md`.

## 6. Barras de rolagem (US1) — `tv-web/e2e/limpeza-qa.mjs`

- Lançar o Chromium com `ignoreDefaultArgs: ['--hide-scrollbars']` — sem
  isso o headless nunca desenha barra, e é por isso que nenhum E2E pegou o
  bug.
- Para cada elemento rolável visível da tela (`overflow` `auto`/`scroll`
  num eixo **e** conteúdo maior que a caixa): largura/altura da barra
  = `offsetWidth − clientWidth − bordas` (e o equivalente vertical) **= 0**.
- O Chromium 108 da TV **não suporta** `scrollbar-width` (chegou no 121).
  Esconder a barra exige `::-webkit-scrollbar { display: none }`;
  `scrollbar-width: none` pode ir junto, mas sozinho não resolve na TV.
- Fixture com categorias e filmes suficientes para a trilha e a grade de
  Filmes transbordarem, e com conteúdo real no Início.
