# Quickstart: Paridade visual de Filmes e Séries (050)

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando na **5173** (confirme: `Get-NetTCPConnection -LocalPort 5173 -State Listen` — um 2º Vite empurra o seu para 5174 e o E2E roda no código errado).
- Uma lista de teste com Filmes e Séries (credenciais do `.env` da raiz, `CCPLAY_PROBE_*` — nunca exibidas), com algumas capas, favoritos e histórico.

## Verificações automatizadas (de `tv-web/`)

```powershell
npx tsc -b
npm run lint
npx vitest run src/features/vod src/features/movies src/features/series src/components src/lib/focus
npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx   # 2/2
npm run test
node e2e/run.mjs --only filmes-series-paridade-v14,filmes-series-ds-v14,capa-real,busca-por-categoria,paridade-visual --jobs 1
npm run test:e2e
npm run build
```

Da raiz, travas íntegras: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` para
`050-filmes-series-paridade-v14`, `025-filmes-series-ds-v14`, `049-navegacao-por-pagina`, `018-busca-por-categoria`,
`046-memoria-foco-key-repeat`, `048-live-paridade-v14`.

## Cenário ponta a ponta (navegador 1920×1080, `http://localhost:5173`)

1. Abrir **Filmes**, entrar numa categoria com capas. Conferir: sidebar em painel de 280px com cabeçalho
   "Categorias", blocos "Sua biblioteca"/"Catálogo", item selecionado em tom de destaque; toolbar com Pesquisar
   (lupa + "OK") e Ordenar (rótulo + opção ▾); hero com rótulo `CCPLAY CINEMA`, título do card focado e capa ao
   fundo.
2. Mover o foco entre cards com e sem capa: a hero troca título/metadados e fica só em degradê sem capa; **nada**
   é reproduzido nem consultado (aba Network quieta).
3. Focar o 1º e o último item visível da sidebar e da grade: anel de foco **inteiro** nos quatro lados; só a borda
   com itens ocultos esmaece (topo → só embaixo; meio → as duas; fim → só em cima; lista curta → nenhuma).
4. Abrir **Ordenar** (OK na toolbar): lista V14 com a opção atual marcada; RETURN fecha e volta o foco ao botão.
5. Ativar **Pesquisar**: campo inline como antes (mín. 3 letras), mesmo visual de altura/raio do repouso.
6. Repetir em **Séries** (`CCPLAY SÉRIES`), em **★ Favoritos** (`★ SEUS FAVORITOS`) e em **↺ Histórico**
   (`↺ VISTOS RECENTEMENTE`); ★/↺ vazios mostram o estado vazio com ação focável.
7. Voltar do detalhe de um filme: foco e rolagem restaurados no mesmo card (por id).
8. Medir: ≥ 1 linha inteira de cards visível sob a hero; sem scroll horizontal na grade.
9. Capturas de **Live**, **Configurações** e dos **detalhes** de filme e série idênticas às de antes (SC-004).

## Cross-cutting (constitution)

- Todo estado (carregando, vazio, erro, sem fonte) tem elemento focável; focar nunca inicia reprodução ou consulta.
- Nenhum valor visual literal fora dos tokens; fontes e imagens locais, nada de CDN.
- Sem segredo (URL de stream/credencial) em DOM novo, log ou erro.

## Fora da automação

Passada na TV física **não** é obrigatória (como na 048); se feita, validar foco/rolagem e o custo de trocar a capa
da hero a cada foco em uma categoria grande.
