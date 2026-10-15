# Lógica: hero "Cinema" (filme e série)

Referência visual: `details()` do protótipo v13_2 e Spec V14, "Detalhe de filme e de série". Este arquivo fixa o **como** onde um executor erraria.

## 1. Estrutura (um componente de apresentação, duas telas)

`tv-web/src/features/vod/DetailHero.tsx` (novo) — **só apresentação**, sem estado de foco, sem `useRemoteNav`, sem dado buscado. As duas telas continuam donas da máquina de foco (`row`, `actionFocus`, `activeTab`, `panelFocusKey`) e passam tudo por props.

```tsx
interface DetailHeroProps {
  eyebrow: string                       // t('detail.eyebrow.movie' | 'detail.eyebrow.series')
  title: string
  posterUrl?: string                    // icon_url do catálogo
  backdropUrl?: string                  // metadata.backdropUrl.value
  backdropOrigin?: MetadataOrigin
  watched?: boolean                     // selo "✓ Assistido" sobre a capa (só filme)
  meta: ReactNode                       // linha ano · duração/temporadas · nota · assistido
  chips: ReactNode                      // <DetailChips/> (§5)
  synopsis: ReactNode                   // <SynopsisBlock/> existente, inalterado
  actions: ReactNode                    // primária + ícones (§3, §4)
}
```

Árvore (classes que E2E e testes existentes usam ficam — `vod-detail-hero`, `vod-detail-title`, `vod-detail-synopsis`, `vod-detail-origin`):

```
div.screen.vod-detail.no-scrollbar            ← raiz e contêiner de rolagem (inalterada, §6)
└─ div.vod-detail-hero                        ← sangra o padding do .screen (margens negativas com --safe-x/--safe-y)
   ├─ div.vod-detail-ambient  style={{'--detail-ambient': cor}}  aria-hidden   ← SEMPRE presente; gradiente neutro sem cor
   ├─ DetailBackdrop (existente)              ← <img> filho do hero; some se falhar
   ├─ div.vod-detail-scrim  aria-hidden       ← vinheta esquerda + base (tokens)
   ├─ div.vod-detail-poster  → PosterArt (filme E série — a série deixa de usar ContentCard aqui)
   └─ div.vod-detail-info → eyebrow, .vod-detail-title, meta, chips, synopsis, actions
```

**Nunca** pôr `background`/`style` de cor no `.screen`: a regra `:root.video-plane-visible .screen > *:not(.player-overlay)` (player.css) só esconde FILHOS do `.screen`. Fundo no próprio `.screen` pintaria por cima do vídeo (FR-025). Ambiente, backdrop e vinheta vivem dentro do `.vod-detail-hero`.

Medidas (custom properties locais no bloco novo de `vod.css`, valores de layout, não de tema):
`--detail-cover-width: 400px; --detail-cover-height: 600px; --detail-hero-height: 860px`. A altura do hero é escolhida para a fileira de abas cair inteira acima de 1080 sem rolar (FR-011) — o executor confere no E2E e ajusta só esse valor se preciso.

## 2. Fundo: backdrop → cor da capa → neutro

1. Com `backdropUrl` carregado: backdrop por cima do ambiente (o ambiente fica escondido atrás, sem custo visível).
2. Sem backdrop (ou `<img>` com erro): o ambiente aparece — `radial-gradient` usando `var(--detail-ambient, <token neutro>)`.
3. `--detail-ambient` vem de `useCoverColor(posterUrl)` (`logic/cor-da-capa.md`). `null` ⇒ a propriedade não é definida ⇒ o fallback neutro do CSS vale.
4. O brilho da capa (`box-shadow` com a mesma variável) segue a mesma regra.

## 3. Ação primária com progresso

`primaryProgress(progressSeconds, durationSeconds)` em `features/vod/detailProgress.ts` (contrato travado):

- `null` se `!isResumable(progress)` (abaixo de `RESUME_MIN_SECONDS`), se a duração é ausente/≤0, ou se `progress >= duration`.
- `percent = clamp(round(progress / duration × 100), 1, 99)`; `remainingSeconds = duration − progress`.

Fontes:
- **Filme**: `progress = userState.progressSeconds`; `duration = metadata.durationSeconds?.value` (fonte ou TMDB — qualquer origem vale).
- **Série**: só quando `primary.kind === 'resume'`: `progress = primary.resumeSeconds`; `duration = primary.episode.duration_seconds`. Nunca a duração "por episódio" da metadata da série.

Marcação (o contrato depende disto — o `getByText` do Testing Library só lê os nós de texto **diretos** do elemento):

```tsx
<div className="vod-detail-action vod-detail-action--primary tv-focus?">
  {label /* nó de texto DIRETO: "▶ Continuar de 42:10" */}
  {progress && (
    <span className="vod-detail-progress">
      <span className="vod-detail-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
        <span className="vod-detail-progress-fill" style={{ width: `${progress.percent}%` }} />
      </span>
      <span className="vod-detail-remaining">{t('detail.remaining', { time: formatDurationMinutes(progress.remainingSeconds) })}</span>
    </span>
  )}
</div>
```

`detail.remaining` = "faltam {time}" (pt) / "{time} left" (en) / "quedan {time}" (es). `formatDurationMinutes` já existe em `detailMetadataFormat.ts` ("1 h 25 min", "20 min").

## 4. Ações secundárias em ícone

Componente `DetailIconAction` (em `features/vod/DetailActions.tsx`, novo):

```tsx
<div role="button" className={`vod-detail-action vod-detail-icon-action${focused ? ' tv-focus' : ''}${soft ? ' is-soft-disabled' : ''}`}
     aria-disabled={soft ? 'true' : undefined}>
  <span className="vod-detail-icon" aria-hidden="true"><svg …/></span>
  {label /* nó de texto DIRETO — é o nome acessível e o rótulo visível no foco */}
</div>
```

- O **rótulo é o texto atual do catálogo, sem mudança** ("↺ Reiniciar", "+ Minha Lista", "▶ Trailer"/"Trailer…"/"Trailer — indisponível", "☰ Semelhantes", "✓ Marcar como assistido"/"✗ Desmarcar assistido", "Remover do histórico"). Contratos 032/033 e muitos testes procuram esses textos e leem `className` do MESMO elemento.
- Visual: o elemento é uma coluna (círculo + rótulo). O círculo é o `span.vod-detail-icon`; o rótulo fica com `color: transparent` sem foco e cor normal com `.tv-focus`. O anel de foco global (`.tv-focus` em `index.css`) é anulado no elemento e reaplicado no círculo (`.vod-detail-icon-action.tv-focus .vod-detail-icon { outline…; box-shadow… }`), com `scale` só no círculo. Tudo com tokens.
- Ícones: SVG inline local (§15 da Spec), traço `currentColor`, um por ação: restart, plus/check, trailer, grid (semelhantes), eye/check (assistido), trash.
- Ordem (FR-009) e condições: exatamente as de `buildActions` de hoje em cada tela. Filme: `[primária][Reiniciar?][Minha Lista][Trailer][Semelhantes][Assistido][Remover?]`. Série: `[primária][Minha Lista][Trailer][Semelhantes][Remover?]`. A primária continua índice 0 e foco inicial.
- `vod-detail-action` fica em TODAS (primária e ícones): os E2E existentes a usam.

## 5. Chips e linha de metadata

`DetailChips({ category, genres })`:

```tsx
<ul className="vod-detail-chips" aria-label={t('detail.chips')}>   {/* "Categoria e gêneros" */}
  <li className="vod-detail-chip vod-detail-chip--category">{category}</li>
  {genreList.map((g) => <li key={g} className="vod-detail-chip">{g}</li>)}
</ul>
<OriginTag origin={genres.origin} />   {/* FORA da lista — o contrato conta 3 itens */}
```

- `category = groupLabelDisplay(item.original_group, t)` (texto da fonte, nunca traduzido).
- `genreList = genres.value.split(/\s*,\s*/).filter(Boolean)`, sem repetir a categoria se o texto for idêntico.
- Sem gêneros: só o chip da categoria.
- O item da categoria **não** leva um rótulo "CATEGORIA" dentro do `<li>` (o contrato lê o texto); a diferença é visual (classe `--category`, tom de acento).

Linha de metadata (a categoria SAI daqui — vai para o chip):
- Filme: `ano · duração (formatDurationMinutes) · RatingBadge · ✓ Assistido`.
- Série: `ano · {n} temporadas (detail.meta.seasons) · progresso x/y ou "em dia" (como hoje) · RatingBadge`.
Itens ausentes simplesmente não aparecem.

## 7. Cartões da aba Detalhes e a origem de cada fato

A aba continua sendo um `<dl className="vod-detail-facts">` com um `<div className="vod-detail-fact">` por fato (só o CSS vira grade de cartões). Cada cartão mostra a origem no canto. **Só aqui** a fonte também é sinalizada — no hero e na sinopse continua a regra da 032 (só TMDB).

| Fato | Origem exibida |
| --- | --- |
| Gênero, Duração, Direção, País, Elenco (`metadataFactRows`) | `row.origin`: `tmdb` → "Dados: TMDB"; `provider` → "Dados: fonte" |
| Categoria, Ano, Adicionado em, Disponível (filme) | "Dados: fonte" (vêm do catálogo da lista) |
| Temporadas conhecidas, Episódios conhecidos (série) | "Dados: fonte" |
| Tipo (filme) | sem selo (é o próprio tipo do item) |
| Progresso (série) | sem selo (estado do usuário) |

- Chave nova `detail.origin.source`: "Dados: fonte" / "Data: source" / "Datos: fuente". "Dados: TMDB" continua a chave atual `detail.origin.tmdb`.
- Implementação: um componente `FactOrigin({ origin })` (ou um parâmetro em `MetadataFacts`) usado **só** dentro dos cartões — **não** mudar o `OriginTag` global, que o hero, a sinopse, o Elenco e a `PersonScreen` usam com a regra da 032.
- Compatibilidade: testes existentes que conferem a ausência de `/Dados: TMDB/` para dado do provedor continuam válidos, porque o texto da fonte é outro.

## 6. Rolagem

A raiz `.vod-detail` é o contêiner de rolagem. Efeito em cada tela: quando `row` vira `'more' | 'actions' | 'tabs'`, `root.scrollTop = 0` (FR-017). No painel, os cartões já se trazem à vista por `scrollIntoView({block:'nearest'})` (Cast/Similar) e a lista de episódios pelo virtualizador — sem mudança.
