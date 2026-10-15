# Quickstart — Nota, gênero e fundo da listagem (feature 055)

## Pré-requisitos

- `npm run dev` em `tv-web/` (E2E em :5173).
- Uma lista Xtream de teste: o painel real do `.env` da raiz (`CCPLAY_PROBE_DNS/USER/PASS`, nunca exibidos) **ou** o servidor falso do E2E (`e2e/campos-da-listagem.mjs`).
- Navegador com DevTools aberto na aba Network (para contar requisições).

## Checagens automatizadas (em `tv-web/`)

```powershell
npx tsc -b
npm run lint
npx vitest run src/lib/catalog src/features/catalog src/features/vod src/features/movies src/features/series src/components
npm run test
npm run test:e2e -- --only campos-da-listagem,capa-real,carrosseis-filmes-series,vitrine-filmes-series,catalogo-em-blocos
npm run build:tizen     # nenhum arquivo novo emitido; confira findUnlistedFiles
```

Contratos: `npx vitest run src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts src/components/RatingBadge.campos-da-listagem.contract.test.tsx`
e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream`.

## Cenário ponta a ponta (navegador)

1. Importar a lista Xtream (ou abrir uma já importada e **entrar numa categoria de filmes que ainda não foi renovada hoje** — a categoria precisa passar pelo refresh normal, D-006/R-002).
2. **Grade de filmes**: cards com nota válida mostram `★ 7,4` no canto superior esquerdo; cards sem nota **não mostram nada** (nem "0", nem "sem nota"). Favoritar um card e assistir outro: estrela (superior direito), "Assistido" (inferior esquerdo) e nota convivem sem sobreposição.
3. **Destaque (vitrine)**: focar um filme com nota → `★ 7,4 Provedor` ao lado do ano. Focar um filme sem nota → nada de nota.
4. **Séries**: focar uma série → destaque com o **gênero** (ex.: "Comédia, Drama") e o **fundo** da listagem. Aba Network: **nenhuma** chamada `get_series_info`, `get_vod_info` ou ao TMDB só por focar (FR-013).
5. **Detalhe**: abrir um filme e uma série → `★ 7,4 Provedor` junto ao resumo; gênero/fundo do detalhe vêm do provedor/TMDB como antes (FR-008). Trocar o idioma do app (pt/en/es): `7,4`/`7.4` e "Provedor/Provider/Proveedor".
6. **Navegação por controle remoto** (setas/OK/Voltar): ordem de foco, restauração de foco e de scroll idênticas às de antes; o selo nunca recebe foco (SC-006).
7. **Lista antiga**: com um perfil IndexedDB importado antes da feature, abrir o app → tudo funciona como antes, sem erro; depois do refresh da categoria, as notas aparecem sem reimportar (US3).
8. **Fonte só M3U** (M3U avulsa): nenhuma nota, gênero ou fundo, nada quebra. **M3U que aponta para painel Xtream confirmado**: recebe os campos como uma fonte Xtream (FR-016).

## Medições (SC-003, SC-004) — com a lista real

1. Antes de importar: `await navigator.storage.estimate()` no console (anote `usage`).
2. Importar a lista (≈43 mil filmes, ≈9,7 mil séries) e anotar o tempo até a fonte ficar utilizável e o tempo de entrada numa categoria grande.
3. Depois: `storage.estimate()` de novo. Meta: acréscimo < 1,5 MB e tempos < 10% acima da linha de base (rode a linha de base **no commit anterior** ou com os campos desligados).
4. Registre só números (nenhum DNS/usuário/senha/URL) em `Execution Notes` do `plan.md`.

## TV física (recomendada, não bloqueante) — R-005/R-006

- Os três selos legíveis a 1920×1080; o `★ 7,4` não cobre a estrela nem o "Assistido".
- Destaque de série com fundo 16:9 sem recorte estranho.
- Importar uma lista grande sem travar.

## Itens cross-cutting da constituição

- [ ] Nenhum segredo em log, erro, toast ou UI (URL de fundo e credenciais).
- [ ] Focar não dispara consulta externa; selo não focável.
- [ ] Categorias da fonte intactas (gênero do provedor não vira categoria nem filtro).
- [ ] Nota nunca rotulada como IMDb/TMDB; `0`/inválida nunca aparece.
- [ ] E2E (`npm run test:e2e`) verde antes de pedir passada na TV.
