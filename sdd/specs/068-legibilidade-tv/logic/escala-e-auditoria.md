# Lógica — escala tipográfica e auditoria de legibilidade (068, US1)

## 1. Onde a escala mora (não inventar outro lugar)

O app já tem um botão central: `tv-web/src/styles/font-scale.css` define os tokens
**efetivos** `--fs-*` como `calc(Npx * var(--font-scale))` com `--font-scale: 1`,
sobrescrevendo os valores base de `tv-web/src/index.css` (que o
`styles/tokens.test.ts` confere). Todas as telas consomem `--fs-*`.

| Token | Antes | Depois (068) | Papel |
|---|---|---|---|
| `--fs-display` | 64 | 64 | destaque/hero |
| `--fs-h1` | 40 | **48** | título de tela |
| `--fs-h2` | 28 | **32** | título de seção/card |
| `--fs-body-lg` | 24 | **28** | nome de item (canal, filme, série, episódio), sinopse |
| `--fs-body` | 20 | **24** | texto padrão: rótulos, botões, itens de lista, **metadados auxiliares** |
| `--fs-caption` | 16 | **20** | micro: contadores, horários, selos curtos |

- Mudar os **dois** arquivos (base e efetivo) — o contrato `escala.legibilidade-tv`
  confere os dois; `--font-scale` continua **1** (não usar a escala uniforme: os
  degraus não são proporcionais).
- Alinha o app à **ADR-007 §7** (título 40–48; nome/ação 28–32; metadado 24–28),
  que tem precedência sobre a Spec V14 §6 (que dizia 16 mínimo). Não é emenda de
  ADR; a Spec V14 ganha uma nota de emenda (Polish).
- **Metadados auxiliares** (programa "Agora", ano, duração, gênero, sinopse curta)
  usam `--fs-body` (24), não `--fs-caption`: a ADR pede 24–28 para metadado.
  `--fs-caption` (20) só para micro (contagem, horário, selo).

## 2. Tamanhos literais que sobram (o contrato #2 pega)

Há `font:` com px fixo (`calc(15px|16px|18px|20px|28px|34px * var(--font-scale))`)
em `styles/player.css`, `styles/shared.css` e `index.css` (raiz, 18px). Regra:
trocar cada um pelo **token do papel** (não por outro número):

| Literal hoje | Vira |
|---|---|
| 15, 16, 18 px | `--fs-caption` (micro) ou `--fs-body` (texto) — pelo papel |
| 20 px | `--fs-body` |
| 28 px | `--fs-h2` |
| 34 px (título do player) | `--fs-h2` ou `--fs-h1` — pelo papel |
| 40 px | `--fs-h1` |

Depois disso, `grep -rnE "font(-size)?: .*[0-9]+px" src` só deve achar valores ≥ 20.

## 3. Alturas fixas em JS que precisam acompanhar o texto

Listas virtualizadas e paginação usam constantes; com a letra maior elas
**precisam** crescer junto (senão o texto vaza ou a paginação erra):

| Constante | Arquivo | Hoje | Diretriz |
|---|---|---|---|
| `LIVE_ITEM_ROW_HEIGHT` | `features/live/liveTrail.ts` | 84 | **108** (linha 96 px no CSS + 12 de espaço). Travado pelo contrato emendado da 049 (`PAGE = 5`). |
| `GUIDE_ROW_HEIGHT` | `features/live/guide/EpgGuide.tsx` | 84 | medir; subir só se vazar (contrato 031 não fixa o número) |
| `EPISODE_ROW_HEIGHT` | `features/series/SeriesDetailScreen.tsx` | 196 | medir; subir se título/sinopse vazarem |
| `CARD_HEIGHT` | `features/search/SearchScreen.tsx`, `features/person/PersonScreen.tsx` | 370 | medir |
| `TRAIL_ROW_PITCH_FALLBACK` | `lib/focus/paging.ts` | 56 | acompanhar a altura real dos itens de trilha (só reserva) |
| `HOME_ROW_FORMATS` / `HOME_CHANNELS_VISIBLE` | `features/home/homeRowFormats.ts` | — | medir a fileira de canais e os cards |
| `ROW_FORMATS[*].rowHeight` | vitrine de Filmes/Séries (`VodShowcaseScreen`) | — | medir |

"Medir" = rodar a auditoria (§5) e ajustar só o que vazar. Ícones e capas
**mantêm** o tamanho (FR-006).

## 4. Nomes longos (FR-005)

- Fora de foco: uma linha, `text-overflow: ellipsis` (como hoje).
- **No item focado, o nome aparece inteiro**: rolagem horizontal do texto
  (marquee) só no elemento focado — um por vez, em `transform`, barato no
  hardware (ADR-007 §8). Começa depois de ~1 s parado no item, volta ao início
  ao perder o foco. Com **"Reduzir movimento"** ligado não anima: o nome cabe em
  até 2 linhas onde a caixa tiver altura livre, ou fica inteiro no
  destaque/título da tela (Live: painel à direita; detalhe: título).
- Uma utilidade só (classe/componente), aplicada aos nomes de: linha de canal,
  item de trilha, card de filme/série, episódio. Nunca muda a altura da linha.

## 5. Auditoria automática (E2E `e2e/legibilidade-tv.mjs`)

Roteiro novo (entra no `SUITE` de `e2e/run.mjs`), lista fictícia com nomes longos
e acentuados, em **pt, en e es**, a 1920×1080, percorrendo: perfis, cadastro (com
IME), Início, TV ao vivo (categorias e canais, "Todos"), guia, vitrine e grade de
Filmes/Séries, detalhe de filme e de série, player (chrome, faixas), Configurações
(cada aba) e a tela da lista (067). Em cada tela:

```
para cada elemento visível com texto próprio (nó de texto não vazio):
  tamanho = getComputedStyle(el).fontSize
  falha se tamanho < 20px                                    # SC-001
para cada caixa de uma lista de seletores (linha de canal, item de trilha,
  card, botão, chip, aba, linha de Configurações, cartão de perfil):
  para cada descendente com texto: falha se o retângulo dele sair da caixa
  na vertical (topo < caixa.topo - 0,5 ou base > caixa.base + 0,5)   # SC-002
```

Saída: lista "tela: seletor: problema" — vazia = passa. O executor usa este
roteiro para **guiar** os ajustes (rodar, corrigir, rodar de novo), não só no fim.
