# Cards, selos e expansão no foco (feature 060)

Cobre US2 (P2): FR-008..FR-011, FR-024, FR-028, SC-002, SC-003.

## 1. Medidas — fonte única

`features/home/homeRowFormats.ts` (mesmo papel de `features/vod/vodRowFormats.ts`): o `Rail` precisa de px fixos e o CSS
lê as mesmas medidas por variáveis inline. Nenhum px literal no CSS da Home fora de `var(...)`.

| Formato | Card (L × A) | Expandido (L × A) | Usado em |
| --- | --- | --- | --- |
| `poster` | 250 × 375 | 667 × 375 | Filmes/Séries adicionados, Dica, Porque você assistiu, Minha Lista |
| `rank` | numeral 160 + pôster 250 × 375 (recuo −44) | numeral + 667 × 375 | Em alta (Top 10) |
| `continue` | 480 × 270 | 600 × 338 | Continuar assistindo |
| `live` | 480 × 270 | — (não expande) | Ao vivo agora |
| `ai` | 860 × 170 | — | Curadoria por IA |

Gap entre cards = `--space-3` (24 px). Altura da fileira = título (52) + respiro + maior altura do formato + legenda.

## 2. `Rail` — largura variável só para o focado

Duas props **opcionais** (sem elas o `Rail` é idêntico ao de hoje — Live, Busca, Filmes/Séries não mudam):

```ts
focusedItemWidth?: number        // largura do item em focusedIndex; os demais usam itemWidth
align?: 'auto' | 'start'         // 'start': o item focado vira o 1º visível (FR-019), limitado ao fim do trilho
```

- `estimateSize(i) = i === focusedIndex && focusedItemWidth ? focusedItemWidth : itemWidth`; `virtualizer.measure()`
  quando `focusedIndex` ou `focusedItemWidth` mudam (já remede quando `itemWidth` muda).
- `.rail-item` usa a largura de `estimateSize(i)`; `transform: translateX(start)` ganha `transition` de
  `--home-expand-duration` (token novo, padrão `var(--duration-standard)`) **só dentro de `.home-content`**.
- `align: 'start'` → `scrollToIndex(focusedIndex, { align: 'start' })` (o fim do trilho não deixa espaço vazio: o
  virtualizador já limita ao `scrollWidth`).
- FR-028 (TV lenta): zerar `--home-expand-duration` (e a transição de largura do card) — decisão na passada da TV.

## 3. `HomeTitleCard` (apresentação)

```tsx
<div className="home-card home-card--{format}{expanded ? ' is-expanded' : ''}{focused ? ' tv-focus' : ''}"
     data-item-id={item.id} style={{ '--home-card-w', '--home-card-h' }}>
  <PosterArt url={poster} title={item.name} />              // retrato (ou 16:9 no continue)
  <span className="home-card-title">{item.name}</span>       // nome sobre a arte, até 2 linhas
  <HomeCardBadges ... />                                      // §4
  {progress && <div className="home-card-progress" role="progressbar" aria-hidden ... />}
  {expanded && <HomeCardExpanded ... />}                      // §5 — montado só no foco
</div>
```

- `data-item-id` na raiz e `tv-focus` na raiz (contrato 060 lê `closest('[data-item-id]')`).
- O focado é o **único** com `is-expanded`; a camada expandida só monta com o foco (nada de 2 imagens por card).
- `rank`: numeral `aria-hidden` à esquerda (`content-card-rank` hoje), posição NA fileira (1, 2, 3… — regra 057).
- Nome acessível do card = nome do título (+ "Assistido"/"Na Minha Lista" quando o selo existe, em texto `sr-only`).

## 4. Selos — regra pura

`features/home/cardBadges.ts`:

```ts
export interface CardBadgeInput { addedAt?: number | null; providerRating?: number | null; watched: boolean; favorite: boolean }
export function cardBadges(input: CardBadgeInput, now: number): { isNew: boolean; rating: number | null; watched: boolean; favorite: boolean }
  isNew  = addedAt != null && now - addedAt <= 7 * 24 h && addedAt <= now + 1 dia (relógio fora: não marca)
  rating = providerRating > 0 ? providerRating : null      // mesma regra do RatingBadge (055)
```

- `watched`: `useWatchedIds(sourceId, 'movie')` (filme). Série: `useSeriesWatchedSummary` → `upToDate` (série em dia).
- `favorite`: `useFavoriteIds(sourceId, kind)`. Tudo local (IndexedDB), lido uma vez por tela, nunca por foco.
- Visual: `NOVO` (accent, canto sup. esq.), `★ 7,9` (`RatingBadge`, canto sup. dir.), `✓`/`♥` (círculos, canto inf. dir.).
  Cor nunca é o único sinal: texto/glifo + `sr-only`.

## 5. Card expandido

```
imagem16x9 = imageOf(item)   // logic/fileiras-e-dados.md §1 — só local
expandido:
  se imagem16x9: <img> 16:9 cobrindo o card + scrim
  senão:         pôster à esquerda (altura cheia) + fundo --home-card-ambient (cor da capa) ou gradiente neutro
  info: título (2 linhas) · meta (ano · duração|temporadas · gêneros · ★) · sinopse 2 linhas (se local) · "OK Detalhes"
```

- Sinopse: `titleMetadata` em cache (provider ou TMDB `matched`) ou `overview` do `TmdbTitleRef` que trouxe o item à
  fileira ("Porque você assistiu"). Sem nenhuma: a linha não existe.
- Duração do filme / gêneros: mesmo cache. Ausente = omitido (nunca "—").
- A cor da capa do card expandido usa `useCoverColor` com o pôster do card focado (só depois do atraso de §6 de
  `billboard-e-navegacao.md`), regra "sem risco" da 059.
- Continuar: 480×270 → 600×338; a legenda (`T1:E3 · faltam 26 min`) continua embaixo.

## 6. Continuar assistindo (FR-010)

Hook local `useContinueProgress(sourceId, items)` em `features/catalog/catalogApi.ts`:

```
para cada item da fileira:
  filme: position = userState.progressSeconds; duration = titleMetadata (cache) durationSeconds
  série: o episódio em andamento mais recente da série (userStates kind 'episode' com progressSeconds);
         code = `T${s}:E${e}` (do stableId); duration = registro do episódio no aparelho, se houver
  progress = primaryProgress(position, duration)   // null sem os dois — sem barra, sem "faltam"
  caption  = [code, progress && `faltam ${formatRemaining}`].filter(Boolean).join(' · ')
```

Sem rede. A legenda pode ficar vazia (filme sem duração conhecida): então não há legenda.
