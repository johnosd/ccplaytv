# Lógica — destaque, programação, trilha e foco (feature 048)

Escopo: o "como" que um executor erraria sem saber. Seletores fixados pelo
contrato travado estão no cabeçalho de
`tv-web/src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx`;
este documento não os repete além do necessário.

## 1. Estrutura do painel de preview (`liveColumns.tsx`, só com `withPreview`)

```text
.live-preview-panel                      ← classe mantida (contratos 024/030/031)
├── .live-hero                           ← painel de destaque (grid row "1fr")
│   ├── .live-hero-art                   ← SEMPRE presente (contrato); aria-hidden
│   │   └── <img src={logo} alt="">      ← só com icon_url e sem falha de carga
│   ├── .live-hero-copy
│   │   ├── .live-hero-eyebrow           ← texto normal; caixa alta por CSS
│   │   ├── .live-hero-name              ← nome, máx. 2 linhas (line-clamp); `--fs-display`/800 Poppins (Spec §6 Display) — título dominante do destaque
│   │   ├── .live-hero-number (opcional) ← channelNumberOf, só se derivável
│   │   ├── .live-hero-live              ← ver §1.2
│   │   ├── (progresso + horário do atual, .live-epg-progress/.live-epg-time, só com EPG atual)
│   │   └── .live-epg-description        ← sinopse real do atual, 2 linhas (já existe, feature 030)
│   └── .live-preview-actions            ← em linha (flex-direction: row)
│       └── button.live-preview-action ×3
└── .live-schedule                       ← só se upcoming.length > 0
    └── .live-schedule-card ×(1..3)
        ├── .live-schedule-label         ← "A seguir" | "Depois" | "Mais tarde" (texto normal)
        ├── .live-schedule-title
        └── .live-schedule-time          ← formatEpgClock(start) (só início; lib/epg/formatEpgTime.ts)
```

### 1.1 Rótulo (eyebrow)

| Entrada exibida | Texto (`textContent`) |
| --- | --- |
| categoria | `groupLabel(activeChannel.original_group)` |
| ★ Favoritos | `★ Favoritos • ${groupLabel(original_group)}` |
| Todos | `Todos • ${groupLabel(original_group)}` |

Caixa alta e espaçamento de letras **só por CSS** (`text-transform`), para o
texto do DOM continuar legível pelos testes. Spec §6 só permite caixa alta em
"kicker/status curto" — o rótulo e os rótulos dos cartões são exatamente isso;
nada mais no destaque vai em caixa alta. Tamanho `--fs-caption` (16px, o
mínimo de produto da §6), peso 600, cor `--accent`.

### 1.2 Linha "ao vivo" (`.live-hero-live`)

- Indicador: `<i className="live-hero-dot" aria-hidden="true" />` com `--live`.
- Com `activeNowNext.now`: `<b>{now.title}</b><span> • ao vivo agora</span>`.
- Sem: `<span>Ao vivo</span>`. Nunca "Agora:" vazio, nunca título inventado.
- Atenção a `e2e/epg-dados-agora.mjs:290`: para canal sem EPG o texto do
  painel não pode conter `/Agora/` (maiúsculo) — "Ao vivo" e "ao vivo agora"
  (minúsculo) são seguros; não escrever "Agora" com A maiúsculo no destaque.
- O bloco "A seguir" que hoje existe dentro do preview **sai**: o próximo
  programa passa a ser o 1º cartão (§2). O `e2e/epg-dados-agora.mjs` continua
  achando "A seguir" + título no texto do painel, porque os cartões estão
  dentro de `.live-preview-panel`.

### 1.3 Ações

- Textos **exatos** de hoje: `Assistir`, `Favoritar`/`Favorito`,
  `Guia completo` (`e2e/live-tv-ds-v14.mjs` compara `textContent ===`).
- Símbolos como **SVG local** (Spec §15 proíbe glifo de sistema como
  elemento principal): `<Icon name="play" />` em `Assistir`,
  `<Icon name="favorite" />` em `Favoritar`/`Favorito` (preenchido via CSS
  `fill: currentColor` quando favorito, só contorno quando não). O `<svg>` não
  tem texto, então o `textContent` do botão continua exato. `Guia completo`
  pode usar `<Icon name="guide" />`.
- Visual (Spec §31.1, plan D-016): `Assistir` primário (`--accent`, texto
  `--accent-ink`, altura de referência 64px, pill; foco `--accent-light` +
  anel); os outros dois secundários (`--bg-elevated`, borda `--bg-hover`,
  texto `--text-primary`, pill). Botões **sem escala** não é exigido — são
  botões, escala do anel V14 vale (§11.1).
- Soft disabled de `Assistir` sem fonte reproduzível: inalterado
  (`is-soft-disabled` + `aria-disabled`).

### 1.4 Fundo com o logo

- `<img>` com `object-fit: contain`, alinhada à direita do destaque, ampliada
  (largura ~45% do destaque), `opacity` baixa, sob um degradê
  `linear-gradient(90deg, var(--bg-base) 0%, transparent 70%)` em `::after`.
- **Sem `filter: blur()`** (R-002: custo de GPU no Tizen a cada troca de
  canal focado). Esmaecer = opacidade + degradê.
- Falha de carga: mesmo padrão de `PosterArt` (estado `failedUrl`; uma URL que
  falhou não é tentada de novo até mudar). Sem logo ou falhou → só o degradê
  de superfície.
- `loading="lazy"` não serve aqui (está sempre visível); `decoding="async"` sim.
  Nenhuma requisição além do mesmo URL que a linha já pede (cache do navegador).

## 2. `upcomingAfterNow` (`lib/epg/upcoming.ts`)

Mesma semântica de `nowAndNext` (`lib/epg/nowNext.ts`, contrato travado da 030
— **não alterar assinatura nem comportamento**):

```ts
shifted = programs.map(toSlot(offsetMs)).sort(start asc, end asc)
current = (mesma regra de sobreposição de nowAndNext)
after   = current ? current.end : now
rest    = shifted.filter(s => current ? s.start >= after : s.start > after)
return rest.slice(0, limit)
```

- O 1º item precisa ser igual (`toEqual`) ao `next` de `nowAndNext` para o
  mesmo input — é o que o contrato confere. Jeito mais seguro: extrair o
  cálculo de `shifted`/`current` de `nowNext.ts` para uma função interna
  compartilhada (não exportada pelo índice público, sem mudar `nowAndNext`).
- `toSlot` copia `description` só quando definida (igual a `nowNext.ts`), ou o
  `toEqual` com `next` falha.
- `upcomingForChannel(lookup, id, now, limit)`: `[]` para lookup ausente, id
  nulo/vazio ou id desconhecido; senão `upcomingAfterNow(programs, now, lookup.offsetMs, limit)`.
- O relógio é o `epgNow` (`useNow`) que `useLiveCatalog` já usa — por isso os
  cartões avançam sozinhos (FR-010) sem timer novo.
- `useLiveCatalog` expõe `activeUpcoming = upcomingForChannel(epgLookup, activeChannel?.epg_channel_id, epgNow)`
  ao lado de `activeNowNext` (mesmo padrão; nenhuma consulta nova).

## 3. Tile da trilha (`SideCategoryNav`, opt-in)

- Desenho: `{entry.tile !== undefined && <span className="side-category-nav-tile" aria-hidden="true">{entry.tile}</span>}`
  **antes** do `Icon`/label e **fora** de `.side-category-nav-label`.
- `tile: ''` (nome só com símbolos) ainda desenha o tile vazio — mantém o
  alinhamento. `undefined` = nenhum tile (Filmes/Séries/Configurações).
- Na Live (`liveColumns.tsx`, `sideEntries`):
  - Favoritos: `tile: '★'` e **sem** `icon` (o tile substitui a estrela do ícone).
  - Todos: `tile: '∞'`.
  - Categoria: `tile: initials(groupLabel(category.name))`, até 2 caracteres.
- Iniciais: mover `listInitials` de `features/profiles/listAvatar.ts` para
  `src/lib/initials.ts` (mesma implementação: code points, `pt-BR`), e
  `listAvatar.ts` re-exporta (`export { listInitials } from '../../lib/initials'`)
  para não tocar nos testes da 037. "Notícias" → `NO`; "Telecine Premium" → `TP`.
- Iniciais vêm só do nome **declarado pela fonte** (constitution: categorias
  da fonte preservadas) — nenhum ícone inferido por tema.

## 4. Teclado (`useLiveKeyboard.handleTrailDirection`)

Única mudança: dentro de `if (dir === 'right')`, antes do ramo de col 1:

```ts
if (effectiveCol === 2) {
  setPreviewAction((prev) => clamp(prev + 1, 0, PREVIEW_ACTION_COUNT - 1))
  return
}
```

`←` continua `setCol(1)` de qualquer ação (contratos 024/031). `↑/↓` continuam.
`↑` na 1ª ação não sobe para a topbar (comportamento atual: clamp).

## 5. Foco sem corte e painéis

- `.live-channel-list` (o elemento com `overflow: auto` e o `ref` do
  virtualizador): `padding: var(--space-2)` + `margin: calc(-1 * var(--space-2))`
  (receita da feature 036 em `settings.css`). As linhas absolutas ficam dentro
  de `.live-channel-list-inner` (relativo), então o padding não desloca o
  cálculo do virtualizador. `LIVE_ITEM_ROW_HEIGHT` (84) **não muda**.
- Linhas de canal ganham `.no-scale` (§11: linhas não escalam) — sem escala, o
  anel (4px + 3px de offset + halo de 8px ≈ 15px) cabe no padding de 16px. O
  `--focus-glow` (40px de blur) pode esmaecer na borda; o anel e o halo não.
- A trilha (`.live-column-groups`, também `overflow: auto`) recebe a mesma
  receita.
- Painéis: as próprias `.live-column-groups`/`.live-column-channels` ganham a
  aparência de painel (`--bg-base`, borda `--bg-elevated`, `--radius-lg`,
  padding) e um cabeçalho `.live-panel-head` (título + `.live-panel-sub`,
  divisória inferior). Na coluna de canais, o cabeçalho é a `.category-title-row`
  existente (mantém a lupa da 018), com o subtítulo "Canais" acrescentado.
- Estados de carregando/vazio/erro continuam como filhos da coluna — portanto
  dentro do painel — e com a ação focável de hoje (FR-020).

## 5.0 Indicador de continuação (FR-021, plan D-018)

```ts
// tv-web/src/lib/focus/useOverflowEdges.ts
export function useOverflowEdges(ref: RefObject<HTMLElement | null>, deps?: unknown): { above: boolean; below: boolean }
// above = scrollTop > 1
// below = scrollTop + clientHeight < scrollHeight - 1
// recalcula em: scroll (passivo), ResizeObserver do contêiner, mudança de `deps` (ex.: items.length)
// setState só quando algum booleano muda
```

- Lista de canais: o contêiner rolável é `.live-channel-list` (mesmo `ref` do
  virtualizador). Envolver em `<div className="live-scroll-frame">` com
  `is-more-above`/`is-more-below`; os degradês são `::before` (topo) e
  `::after` (base) do invólucro, `position: absolute`, `pointer-events: none`,
  altura `--space-5`, de `--bg-surface` (cor do painel) para transparente.
- Virtualizador: `scrollPaddingStart`/`scrollPaddingEnd` = 48 (igual a
  `--space-5`; declarar a constante junto de `LIVE_ITEM_ROW_HEIGHT` em
  `liveTrail.ts` com comentário apontando o token) — `scrollToIndex` do
  `useVirtualFocusSync` deixa o item focado fora da faixa esmaecida.
- Trilha: o contêiner rolável é `.live-column-groups`; mesma moldura e
  `scroll-padding-block: var(--space-5)` no contêiner.
- Zapping (`.player-zap-columns`): mesmo comportamento (as colunas são as
  mesmas funções).
- O anel de foco é desenhado **por cima** do degradê? Não precisa: com o
  scroll-padding o item focado nunca está na faixa. Não usar `z-index` para
  isso.

## 5.1 Itens da trilha e linhas de canal (Spec §11.2/§25/§31.1, Lab `#categoriesv131`)

- Item da trilha (escopado `.live-column-groups`): repouso `--bg-elevated`,
  `--radius-md`, altura mínima 48px, texto `--text-secondary`; selecionado
  (`.is-selected`) = tint + texto `--accent` + borda `--accent-tint-border`
  (§31.1 Seleção); foco = anel V14 **sem escala** (`transform: none`).
  Favoritos: tile em `--warning`, fundo "fixo" distinto (`--bg-hover` em repouso).
- Tile: 34px, `--radius-sm`, fundo `--bg-hover`, `--fs-caption`, peso 700.
  Iniciais de palavra única viram 2 letras ("Notícias" → "NO", regra de
  `listInitials`/037); o Lab mostra "N" — divergência aceita (Lab é
  ilustrativo e o contrato travado fixa `NO`).
- Linha de canal: número `--fs-caption` (nunca abaixo de 16px, §6) em
  `--text-annotation` com `font-variant-numeric: tabular-nums`; logo no tamanho atual (`--space-6`);
  nome `--fs-body` 600; "Agora: …" `--fs-caption` `--text-secondary`;
  progresso 4px `--accent` (§31.1); estrela `--warning`; foco sem escala.

## 6. Escopo do CSS (FR-017)

Tudo novo vai em `styles/live.css`, sob `.live-screen` ou `.player-zap-columns`
ou classes `live-*`. **Proibido** alterar as regras-base de `.side-category-nav-*`,
`.channel-row*`, `.poster-box*`, `.live-state*`, `.live-truncated-note` em
`components.css`/`shared.css` — elas servem Filmes, Séries, Configurações,
detalhes de série e favoritos. A única regra nova em `components.css` é a do
`.side-category-nav-tile` (que só aparece quando alguém passa `tile`).
