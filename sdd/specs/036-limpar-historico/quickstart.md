# Quickstart — 036 Limpar histórico

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando (porta 5173).
- Uma lista importada com pelo menos 2 filmes e 1 série com episódios em 2
  temporadas (lista real via `.env` da raiz — `CCPLAY_PROBE_*` — ou a fonte
  falsa dos E2E).
- Estado inicial: reproduzir 2 filmes (um até o meio, um até o fim) e 2
  episódios de temporadas diferentes da mesma série (um até o meio); favoritar
  um dos filmes.

## Checagens automatizadas

```powershell
# em tv-web/
npx vitest run src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx
npm run test
npx tsc -b
npm run lint
npm run build:tizen
npm run test:e2e          # com npm run dev recém-iniciado

# na raiz
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 036-limpar-historico
```

## Cenário ponta a ponta (navegador, 1920×1080)

1. Filmes › `↺ Histórico`: os dois filmes aparecem. No DevTools, disparar
   `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ColorF0Red'}))`
   com o filme pela metade focado → confirmação com **Cancelar focado** e três
   ações. RETURN → nada muda, foco no mesmo filme.
2. De novo, "Remover do histórico" → some da grade, foco no vizinho, toast. Em
   Início, ele **continua** em "Continuar assistindo"; no detalhe, "Continuar
   de mm:ss".
3. Filme concluído → confirmação só com "Remover do histórico" e "Cancelar".
   Removido: continua em `★ Favoritos` (se era) e com "✓ Assistido".
4. Séries › `↺ Histórico`: abrir a série, ação **"Remover do histórico"** por
   último nas ações, "Assistir/Continuar" continua no índice 0. "Remover e
   apagar progresso" → voltar: a série não está na grade, o foco está num
   vizinho; nenhum episódio dela em "Continuar assistindo"; o episódio
   concluído continua marcado.
5. Reproduzir de novo um filme removido → volta ao `↺ Histórico`.
6. Configurações › **Privacidade**: nome da lista ativa, contagens por Filmes
   e Séries. "Limpar histórico de Filmes" → "Limpar e apagar progresso" → os
   dois Históricos de Filmes vazios, Séries intacta, foco fica na linha (agora
   desabilitada, com "histórico vazio" no nome). SELECT nela → toast, nenhum
   modal.
7. Perfis › "Gerenciar listas" (sem lista ativa) › Privacidade → explicação e
   "Voltar às abas" focável.
8. Com uma segunda lista com histórico: limpar ambos na lista ativa não muda o
   `↺ Histórico` da outra.

## Itens cross-cutting (constitution)

- Todo estado com foco visível e ativável por SELECT (modal, erro, vazio, sem
  lista).
- Nenhuma chamada de rede ao remover/limpar (aba Network vazia durante 1–6).
- Tokens V14 apenas (nenhuma cor/raio/fonte literal no CSS novo).
- Dica "● Remover do histórico" **ausente** no navegador (tecla não
  registrada) — só aparece com `tizen.tvinputdevice` real ou falso (E2E).

## TV física (recomendado, não gate)

Com a skill `tizen-tv`: a tecla vermelha do controle chega como `ColorF0Red`
/ `keyCode` 403? `getSupportedKeys()` a lista? A dica aparece? (R-002; entra na
passada do item 58 do backlog.)
