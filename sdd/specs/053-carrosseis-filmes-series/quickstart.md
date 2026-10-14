# Quickstart: verificação da feature 053

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` na porta 5173 (conferir quem escuta antes do E2E).
- Uma lista real carregada (credenciais em `.env` da raiz, `CCPLAY_PROBE_*`; nunca em log/commit). Ideal: lista com dezenas/centenas de categorias, algum histórico e favoritos.

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts src/features/vod/vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx   # 5/5
npx tsc -b
npm run lint
npm run test
npm run build
npm run test:e2e
```

Da raiz: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` íntegro para `053-carrosseis-filmes-series`, `052-vitrine-filmes-series` (regravada), 018, 019, 022, 023, 024, 026, 046, 049.

## Cenário ponta a ponta (localhost, depois TV física se possível)

1. Abrir **Filmes**. Conferir sob o hero, em ordem: Continue assistindo (se houver) → Top 10 filmes da semana (**Em breve**) → ★ Favoritos → Adicionados recentemente → Bem avaliados (**Em breve**) → Porque você assistiu (**Em breve**) → um carrossel por categoria na ordem da fonte.
2. ↓ por todas as fileiras: o foco nunca some; o hero acompanha o card focado; nada toca a rede ao focar (aba Network do navegador).
3. Num carrossel de categoria com itens: OK abre o detalhe; RETURN volta ao mesmo card. Ir ao último cartão ("Ver tudo"): abre a **grade** da categoria (2×6, igual à 052); RETURN volta ao mesmo carrossel.
4. Categoria ainda não obtida: mostra esqueleto + "Ver tudo" focável; ao parar nela por ~300 ms, a pré-carga a traz e o carrossel se preenche sozinho (sem recarregar).
5. Slot "Em breve": focar → anel visível; OK → anúncio "Em breve — …", nada abre; ↑/↓ continuam andando.
6. Foco na lista lateral: ← recolhe (faixa de ícones/iniciais, carrosséis ganham largura); ← de novo expande; reabrir o app mantém a escolha. Em **Séries** repetir 1–6 (Top 10 **séries** da semana).
7. Medidas: em 1920×1080 e 2200×1000 pelo menos o 1º carrossel inteiro aparece sob o hero; anel de foco completo em cada formato (pôster grande, compacto, Top 10).
8. Regressão: grade de categoria, detalhe, player, Live, Configurações e Busca idênticos (capturas).

## Pre-acceptance (constitution)

- Foco visível em loading/vazio/erro/pendente/slot/lista recolhida; voltar restaura por id; nenhum segredo/URL em log ou DOM; nada inventado (slots sem dado, números do Top 10 só layout).
