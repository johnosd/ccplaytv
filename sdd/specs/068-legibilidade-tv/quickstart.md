# Quickstart — verificação da feature 068

## Pré-requisitos

- `tv-web/`: `npm install`; `npm run dev` rodando para E2E e conferência no navegador.
- TV física na LAN (Developer Mode), para o gate final (`deploy-tv.ps1`).

## Checagens automatizadas (em `tv-web/`)

```bash
npx vitest run src/styles/escala.legibilidade-tv.contract.test.ts src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx
npx tsc -b && npm run lint && npm run test && npm run build && npm run build:tizen
node e2e/legibilidade-tv.mjs          # 0 texto < 20 px, 0 texto vazando, em pt/en/es
node e2e/legibilidade-tv.mjs --quickstart # inclui marquee real, movimento reduzido, coluna única e memória de foco
npm run test:e2e
```

Travas (raiz): `check-contract-tests.ps1 -Slug 068-legibilidade-tv` e `-Slug 049-navegacao-por-pagina` íntegras.

## Navegador (1920×1080)

1. Percorrer: perfis, cadastro (com o teclado da tela), Início, TV ao vivo, guia, vitrine e grade de Filmes/Séries, detalhe de filme e de série, player, Configurações (todas as abas) e a tela da lista. Nada vaza, nada some, o anel de foco aparece inteiro.
2. Nomes longos: fora de foco com "…"; no foco, o nome rola até o fim. Com "Reduzir movimento" ligado, não rola.
3. TV ao vivo: sem topbar e sem "TV ao vivo" no topo; só a lista de categorias; OK numa categoria mostra os canais (cabeçalho "Categoria · N canais"); RETURN volta à mesma categoria focada; RETURN de novo vai ao Início.
4. TV ao vivo com todas as categorias escondidas (066): "Gerenciar categorias" focado e abre a tela da lista na aba Categorias.
5. Paginação (← →) na lista de canais anda uma página (menos canais por página que antes) e para nas pontas.
6. Trocar o idioma para en e es e repetir 1 e 3.

## TV física — gate (SC-005)

Instalar (`.\.planning\scripts\powershell\deploy-tv.ps1`) e, **de onde a pessoa costuma sentar**, conferir e aprovar: Início, TV ao vivo (categorias e canais), Filmes/Séries (vitrine e grade), detalhe de filme e série, player (controles e faixas), Configurações e tela de perfis. Registrar quem viu e o que reprovou.
