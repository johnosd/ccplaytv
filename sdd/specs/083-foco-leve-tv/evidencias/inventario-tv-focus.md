# Inventário de `tv-focus` (T001 antigo, 2026-10-18)

Movido do fim do `quickstart.md` no re-plano de 2026-10-19, sem alterar os números.

A auditoria encontrou `tv-focus` em 214 arquivos de `tv-web/src/`. Distribuição por área:

| Área | Arquivos |
| --- | --- |
| raiz de `src/` | 1 |
| `components` | 46 |
| `components/player` | 1 |
| `features/favorites` | 2 |
| `features/history` | 1 |
| `features/home` | 12 |
| `features/live` | 14 |
| `features/live/guide` | 6 |
| `features/movies` | 10 |
| `features/person` | 2 |
| `features/portal` | 3 |
| `features/profiles` | 5 |
| `features/radio` | 4 |
| `features/search` | 1 |
| `features/series` | 11 |
| `features/settings` | 27 |
| `features/settings/list` | 3 |
| `features/settings/parental` | 3 |
| `features/settings/tabs` | 7 |
| `features/shell` | 6 |
| `features/sources` | 3 |
| `features/splash` | 2 |
| `features/vod` | 29 |
| `lib/focus` | 2 |
| `styles` | 13 |

Consumidores centrais revisados: `src/index.css`, `components/PosterArt.tsx`, `Button.tsx`, `Chip.tsx`,
`ContentCard.tsx`, `ChannelRow.tsx`, `PlayerChrome.tsx`, `PlayerLayer.tsx`, `features/home/`, `features/live/` e
`features/vod/`. Nenhum consumidor exigiu estado novo; `.no-scale` aparece em controles que não podem alterar geometria.

## Complemento do re-plano (2026-10-19)

- Declarações que animam `box-shadow`: `src/index.css:258` (receita global) e `src/styles/vod.css:1574`
  (`.vod-detail-icon`). Nenhum `backdrop-filter` nem `@keyframes` com sombra.
- Cópias locais da receita: `vod.css` `.vod-detail-icon-action.tv-focus .vod-detail-icon` e `onboarding.css`
  `.source-setup .text-field:focus-within` (só halo).
- Exceções de geometria: anel interno da vitrine (`vod.css` `.vod-grid-cell .poster-box.tv-focus::before`), pôster da
  Rádio (`radio.css`), `.no-scale` (`utilities.css`).
