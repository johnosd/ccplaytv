# Quickstart — 040 Dividir PlayerLayer e LiveScreen

## Pré-requisitos

- Árvore limpa: o trabalho do item 63 + feature 036 já commitado (D-008).
- `tv-web/`: `npm install` feito; `npm run dev` rodando (porta 5173) para os E2E.
- `baseline.md` gravado na Fase 1 (D-004) — tudo abaixo se compara com ele.

## Checagens automatizadas

```powershell
# em tv-web/
npx vitest run                       # mesmos totais/falhas de baseline.md
npx tsc -b --noEmit
npx oxlint                           # mesmos avisos de baseline.md, nenhum erro
npm run build:tizen                  # nenhum arquivo emitido novo; o guard do sync não acusa nada
npm run test:e2e                     # com npm run dev recém-iniciado; mesma contagem de ✓ de baseline.md

# na raiz — travas que montam os dois componentes
foreach ($s in '018-busca-por-categoria','020-ciclo-vida-player','024-live-tv-ds-v14','026-home-busca-configuracoes-ds-v14','027-player-chrome-ds-v14','029-audio-legendas-info-player','030-epg-dados-agora','031-epg-guia-completo') { .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug $s }

# na raiz — SC-002: nenhuma asserção de teste mudou (saída vazia)
git diff -U0 -- 'tv-web/src/*.test.ts' 'tv-web/src/*.test.tsx' | Select-String '^[+-][^+-]' | Where-Object { $_.Line -notmatch '^[+-]\s*(import\b|vi\.mock\(|\}\s*from\b|$)' }
```

## Conferência estrutural (SC-003)

Para cada linha das tabelas §2/§3 de `logic/divisao.md`: a responsabilidade
está no módulo dela, e `PlayerLayer.tsx`/`LiveScreen.tsx` só criam refs/estado
de topo, chamam os hooks na ordem e desenham. Conferir também:

- um único `useRemoteNav(` em `PlayerLayer` + `components/player/` e um único
  na Live (`Grep "useRemoteNav\("`);
- nenhum `createContext` novo;
- `renderLiveColumns`/`renderLiveShell` chamados como função, não como `<Componente/>`.

## Cenário ponta a ponta (navegador, 1920×1080)

1. Filme: Assistir → chrome aparece e some em 5 s → ←/→ salta 10 s → ↑ na
   barra → painel "Áudio e legendas" e "Info do stream" abrem e fecham com
   RETURN → RETURN fecha o player e o detalhe mostra "Continuar".
2. Episódio: "Próximo episódio" no chrome; concluir → contagem do autoplay.
3. Canal: faixa no início; ↑/↓ trocam de canal; ←/→ abrem a linha; OK na
   faixa abre o zapping; trocar de canal pelo zapping; "Guia" abre o guia
   por cima do vídeo; OK num programa atual toca o canal.
4. Live parada: busca dentro de uma categoria, "★ Favoritos", "Todos",
   segurar OK favorita, guia completo pela preview.

## TV física (recomendada, não gate)

Com a skill `tizen-tv`: o mesmo roteiro 1–3 com o controle real, mais teclas
de mídia (Play/Pause, ⏪/⏩, Stop, CH±) e ↑/↓ segurado no zapping — a classe
de corrida do R-001 só aparece com timing real.
