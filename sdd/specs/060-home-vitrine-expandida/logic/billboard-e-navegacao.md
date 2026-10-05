# Billboard, fileiras e navegação do Início (feature 060)

Cobre US1 (P1): FR-001..FR-007, FR-016, FR-017, FR-019, FR-020, FR-022, FR-023, FR-027. Referência visual: função `home()` do
protótipo v13_2 (`.hb*`) e a seção "Home" da Spec V14.

## 1. Estrutura de tela

```
.screen.home-screen
└── AppShell (backdrop = <HomeAmbient/>)          ← camada de fundo nova, 1º filho de .app-shell (D-004)
    ├── HomeAmbient (absolute, inset 0, atrás da topbar)
    ├── TopBar
    └── main.app-shell-content
        └── .home-content[data-mode="billboard"|"rows"]
            ├── p.home-status-line                 (038, igual a hoje)
            ├── section.home-hero[data-state]      ← o billboard (classe mantida por compatibilidade)
            │   ├── dock (.home-dock, canto superior direito)
            │   └── info: eyebrow, título, meta, chips, sinopse, ações
            └── .home-rows (viewport, overflow hidden)
                └── section.home-row[aria-label] × N   (ordem de §3)
```

- `section.home-hero[data-state="expanded"]` com o foco no billboard ou no dock; `"collapsed"` com o foco em qualquer
  fileira (contrato 060). Recolhido = altura 0, `visibility: hidden`, sem focáveis no fluxo.
- **Nada de fundo no `.screen`**: o plano de hardware do player esconde os filhos do `.screen` (`player.css`); a camada
  `HomeAmbient` está dentro de `.app-shell`, que é filho do `.screen` — some junto (FR-027).
- `AppShell` ganha `backdrop?: ReactNode` (opcional; sem ele, nada muda nas outras telas). Renderiza antes da `topBar`,
  `position: absolute; inset: 0; z-index: var(--z-background)`; topbar, banner e conteúdo ficam acima.

## 2. Billboard

Dados (todos já existentes):

| Campo | Origem |
| --- | --- |
| item, ação primária | `useHomeHero` (026) — regra continue → favorito → boas-vindas **inalterada** |
| backdrop, sinopse, gêneros, duração (filme) | `useTitleMetadata(hero.item.id)` — consulta ao **abrir** a Home, a mesma do detalhe; nunca por foco |
| cor da capa | `useCoverColor(icon_url, usePanelHosts())` (059) |
| ano, categoria da lista, nota do provedor | `CatalogItemOut` |
| progresso | posição: `primary.startAtMs`; duração: filme = metadata `durationSeconds`; série = duração do episódio **só se o registro do episódio já estiver no aparelho** (leitura local; sem ele, sem barra — FR-004) |
| trailer | `trailerActionState({ metadata, checking, tmdbState })` + `TrailerLayer` (033), igual ao detalhe |

- Primária: rótulo atual (`home.hero.continue`/`home.hero.watch`) como **nó de texto direto** do botão focável. O
  contrato travado da 026 exige o nome acessível EXATO `/^(▶\s*)?Continuar$/`: o "faltam X" fica num `span`
  `aria-hidden="true"` ligado ao botão por `aria-describedby` (lido como descrição, fora do nome), e a barra é um
  elemento `role="progressbar"` `aria-hidden` dentro do botão — só quando `primaryProgress(...)` ≠ `null`
  (`features/vod/detailProgress.ts`). Nada disso muda o texto "Continuar"/"Assistir" do nome.
- `useTitleMetadata(hero.item.id)` precisa tolerar id não numérico/inexistente (o contrato 026 usa `'movie-7'` com o
  `catalogApi` real): erro ou `undefined` = billboard sem backdrop/sinopse, nunca exceção na tela.
- Ações: `primary · details · mylist · trailer` (ids atuais de `HomeFocus.hero`). Trailer deixa de ser soft-disabled
  fixo: soft-disabled só nos estados `checking`/`unavailable`, com o rótulo/toast de `trailerAction.ts`. Remover
  `home-trailer` de `comingSoon.ts` (+ catálogo `comingSoon.*`).
- Boas-vindas: mesmo billboard com `home.welcome.*`, atalhos de hoje (`shortcut-live`, `shortcut-movies`), fundo neutro.
- Meta: `ano · duração|temporadas · RatingBadge(showSource)`. Chips: `DetailChips` (059) — categoria da lista em chip
  próprio + gêneros com origem. **Sem** classificação indicativa nem nota TMDB (fora de escopo).

## 3. Fileiras — existência e ordem (FR-018)

Função pura `buildHomeRows(input): HomeRowKey[]` em `features/home/homeRows.ts`:

```
ORDER = ['continue', 'top10-movies', 'added-movies', 'tip-movies', 'because', 'channels',
         'mylist', 'top10-series', 'added-series', 'tip-series', 'ai']
buildHomeRows(has) = ORDER.filter(key => key === 'ai' || has[key])
```

- `channels` é a "Ao vivo agora" (a chave do `HomeFocus` não muda — restauração antiga continua valendo).
- Enquanto uma fileira carrega, ela **não existe** (sem skeleton — FR-018). Exceção: nenhuma. (Os skeletons de hoje para
  continue/mylist/channels saem.)
- `ai` sempre existe (soft-disabled "Em breve", `home-ai-curation`).

## 4. Linhas de foco (FR-019)

```
lines = ['dock', 'hero', ...buildHomeRows(...)]      // 'dock' só existe com o billboard (sempre existe hoje)
↑ em 'dock'  → onExitUp()  (topbar, como hoje para o hero)
↑ em 'hero'  → 'dock' (último ícone focado; 1º na primeira vez)
↓ em 'dock'  → 'hero' (última ação focada)
↓ em 'hero'  → 1ª fileira existente (último card focado nela)
↑ na 1ª fileira → 'hero' (última ação focada)
←/→ dentro da linha: clamp nas pontas (nunca sai da linha)
```

- Memória por linha: `useIdFocus` por fileira, como hoje (id, nunca índice). A linha que deixa de existir cai na
  anterior que existe (regra atual de `effectiveRow`).
- **Um** `useRemoteNav` em `HomeContent` (regra da 040). Os componentes novos são só apresentação.

## 5. Rolagem vertical e estados

```
mode = effectiveRow in {'dock','hero'} ? 'billboard' : 'rows'
billboard: .home-hero expandido; .home-rows começa abaixo dele (a 1ª fileira aparece no rodapé — "peek")
rows:      .home-hero recolhido; .home-rows ocupa a área do conteúdo;
           rowsViewport.scrollTop = focusedRowElement.offsetTop   (fileira focada no topo)
           fileiras ANTES da focada: classe is-above (opacity 0)
```

- Efeito único que reage a `effectiveRow` (substitui o `scrollIntoView` atual de `HomeContent`).
- **Primeira sincronização** depois de montar (inclusive a restauração por `initialFocus`): sem animação —
  `data-instant` no `.home-content` durante 1 frame, CSS desliga `transition`/`scroll-behavior` (FR-020). Depois,
  transições normais. `prefers-reduced-motion`: sempre instantâneo.

## 6. Fundo ambiente (FR-007)

`HomeAmbient({ item, imageUrl, coverUrl })` — só apresentação:

```
ambientTarget =
  mode === 'billboard' ? heroItem (imediato)
  : focusedCardItem, publicado só depois de HOME_AMBIENT_DELAY_MS = 250 ms sem mudar
    (canal: a arte/logo do canal não vira fundo — mantém o último alvo)
layers (filhas do .home-ambient):
  1. cor: --home-ambient = useCoverColor(target.icon_url) ou gradiente neutro de token
  2. <img src={imageUrl}> só se houver imagem 16:9 local (logic/fileiras-e-dados.md §1); troca com fade de opacidade
  3. vinheta (scrim) — mais forte em mode 'rows' (fundo esmaecido)
```

- Nunca `filter: blur`. Uma `<img>` visível por vez (a anterior sai depois do fade).
- Seta segurada (key repeat): o atraso de 250 ms faz o fundo só mudar quando o foco para (edge case da spec).
- Nenhuma requisição de API ao focar; ler a cor da capa baixa a imagem da capa (só capa "sem risco", regra da 059) — ver
  R-003 do `plan.md`.

## 7. Dock

- Mesmos ícones e comportamento de hoje (`DOCK_ICONS`, TMDB real, 3 "Em breve"), agora dentro do billboard, canto
  superior direito; some com ele (`visibility: hidden` no modo rows).

## 8. Player

- `onPlay` igual a hoje (`HomeScreen` monta `PlayerLayer` como filho direto do `.screen`). Ao fechar, as invalidações de
  hoje + `['title-metadata', heroId]` não precisa (metadata não muda com o progresso).
