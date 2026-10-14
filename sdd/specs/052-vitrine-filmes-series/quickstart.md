# Quickstart: Vitrine de Filmes e Séries e tela de categoria (052)

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando na **5173** (confirme: `Get-NetTCPConnection -LocalPort 5173 -State Listen` — um 2º Vite empurra o seu para 5174 e o E2E roda no código errado).
- Uma lista de teste com Filmes e Séries (credenciais do `.env` da raiz, `CCPLAY_PROBE_*` — nunca exibidas), com algumas capas, ao menos 1 favorito e 1 item no histórico, e itens com data de inclusão da fonte.

## Verificações automatizadas (de `tv-web/`)

```powershell
npx tsc -b
npm run lint
npx vitest run src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx   # 5/5
npx vitest run src/features/vod src/features/movies src/features/series src/features/home src/navigation src/components
npm run test
node e2e/run.mjs --only vitrine-filmes-series --jobs 1
npm run test:e2e
npm run build
```

Da raiz, travas íntegras: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` para `052-vitrine-filmes-series`, `025-filmes-series-ds-v14`, `036-limpar-historico`, `049-navegacao-por-pagina`, `050-filmes-series-paridade-v14` (as quatro regravadas na T030) e `018`, `019`, `022`, `023`, `024`, `026`, `046`.

## Cenário ponta a ponta (navegador 1920×1080 e 2200×1000, `http://localhost:5173`)

1. Abrir **Filmes**. Conferir: **topbar** no alto (sem rodapé de dicas); à esquerda a **lista lateral** (título "Filmes", ★ Favoritos, ↺ Histórico, Todos e as categorias, sem o prefixo "Filmes |"); à direita o hero (`CCPLAY CINEMA`) e as fileiras **Continue assistindo**, **★ Favoritos**, **Adicionados recentemente** (cada uma só com dado real).
2. Mover o foco por cartões e fileiras: a hero acompanha; **nada** é reproduzido nem consultado (aba Network quieta); o anel de foco aparece inteiro; fileiras compridas esmaecem só nas bordas com itens ocultos. ← no 1º cartão vai à lista lateral; → volta às fileiras; ↑ do alto sobe à topbar (← → trocam de destino, OK abre).
3. No fim de uma fileira de itens, OK em **Ver tudo**: Continue assistindo → ↺ Histórico; ★ Favoritos → ★ Favoritos; Adicionados → **Todos** já por Recém-adicionados.
4. OK numa **categoria da lista**: tela com título da seção, barra **Pesquisar/Ordenar** e a grade — **6 colunas coladas, 2 linhas inteiras** (a 3ª nunca aparece), pôster preenchendo o card com o título sobre ele, foco por dentro do pôster. ↓ por várias linhas mantém sempre 2 linhas inteiras.
5. Na grade: pesquisa inline (≥ 3 letras), Ordenar (modal, vale pela sessão), favoritar (OK longo/amarela), ★/↺ sem Ordenar, remover do histórico; ← na 1ª coluna não faz nada; ↑ da 1ª linha vai à barra e dali à topbar.
6. OK num card → detalhe; RETURN → grade no **mesmo card**; RETURN → vitrine **no item da lista** de onde saiu.
7. Repetir em **Séries** (`CCPLAY SÉRIES`; Continue assistindo = uma entrada por série).
8. Sem histórico/favoritos/datas: só a lista lateral, com o foco nela. ★ Favoritos e ↺ Histórico vazios: estado vazio com ação focável.
9. No **Início**, "Filmes (N)" abre a grade de ★ Favoritos e RETURN volta ao Início; trocar Filmes ↔ Séries ↔ TV ao vivo pela topbar funciona direto da vitrine.
10. **Live**, **Configurações**, **Busca**, **detalhes** de filme/série e **player** não mudam (SC-004 — verificado por escopo e pelos E2E dessas telas).

## Cross-cutting (constitution)

- Todo estado (carregando, vazio, erro, sem fonte) tem elemento focável nas duas telas; focar nunca inicia reprodução ou consulta.
- Nenhum valor visual de **cor** literal fora dos tokens (geometria fixa da grade segue o padrão dos 205px da 009); fontes e imagens locais, nada de CDN.
- Nenhuma URL de stream/credencial em DOM novo, log ou erro; categorias só com nomes declarados pela fonte.

## Fora da automação

Passada na TV física **não** é obrigatória (como 048/050); se feita, validar a abertura da vitrine em lista grande (custo de "Adicionados recentemente", R-002), a rolagem das fileiras com o D-pad e o foco sobre capas claras.
