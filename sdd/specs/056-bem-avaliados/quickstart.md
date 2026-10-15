# Quickstart — Fileira "Bem avaliados" (feature 056)

## Pré-requisitos

- `cd tv-web; npm install` feito; `npm run dev` no ar em http://localhost:5173 para o E2E.
- Para a medição (SC-004) e a conferência com dados reais: `.env` da raiz com `CCPLAY_PROBE_*` (nunca imprimir os valores).
- Uma lista Xtream já importada **depois da feature 055** (notas gravadas). Lista importada antes: abrir as categorias (ou esperar a
  pré-carga) para o refresh normal regravar as notas.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx   # 5/5
npx vitest run src/features/vod src/features/catalog src/lib/comingSoon.test.ts
npx tsc -b
npm run lint
npm run test
npm run test:e2e -- --only bem-avaliados,carrosseis-filmes-series,vitrine-filmes-series
npm run test:e2e
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 056-bem-avaliados
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 052-vitrine-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series
```

## Cenário ponta a ponta (navegador, com o dev server)

1. Abrir **Filmes** numa lista com notas já obtidas. A fileira **Bem avaliados** aparece entre "Adicionados recentemente" e
   "Porque você assistiu", com até 12 cards em ordem de nota decrescente e o selo `★ 8,4` em cada um.
2. Focar um card: o destaque mostra `★ 8,4 Provedor`. Nada é consultado ao focar (aba de rede vazia).
3. Enquanto houver categorias não obtidas: o cabeçalho mostra "Com base em X de Y categorias". Quando todas forem obtidas, o
   texto some.
4. OK num card abre o detalhe; voltar devolve o foco ao mesmo card.
5. Ir até o fim da fileira e OK em **Ver tudo**: abre "Todos" já ordenado por nota (maior → menor), com selos; no botão Ordenar
   aparece "Nota". Abrir o modal de Ordenar: **não** há "Nota" na lista de opções.
6. Repetir em **Séries**: só séries, mesmas regras.
7. Lista sem notas (ou M3U): a fileira não existe e a tela navega normalmente por todas as fileiras (sem "Em breve" no lugar).
8. Trocar o idioma do app (Configurações): título "Top rated"/"Mejor valoradas", aviso de cobertura e rótulo "Nota"/"Rating" traduzidos.

## Itens cross-cutting da constitution

- Foco: cada estado (com fileira, sem fileira, fileira que some) tem pelo menos um elemento focável; selo e aviso não são focáveis.
- Voltar restaura por id; o foco da fileira que sumiu cai numa vizinha.
- Nenhuma credencial, URL de provedor ou chave em tela, log ou commit.
- Nenhuma requisição externa causada pela fileira.

## TV física (recomendado, não gate)

Instalar com a skill `tizen-tv` e conferir, vendo na tela: a fileira aparece e rola sem engasgo; o foco entra e sai dela sem se perder;
"Ver tudo" abre ordenado; o aviso de cobertura cabe no cabeçalho a 1920×1080; a abertura da tela não ficou mais lenta que antes.
Cenário não observado é "não executado", nunca "aprovado".
