# Bug Verification: Série — fim do episódio não chama o próximo; controles somem no 2º episódio

- **Slug**: serie-sem-proximo-episodio-controles-somem
- **Testado**: 2026-10-09
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Os três sintomas foram reproduzidos antes da correção e não reproduzem mais — no navegador sobre o código final, e na TV física
(QN50Q60DAGXZD, AVPlay, lista real) pelo usuário. Sem regressão nos testes do player, das séries e da suíte E2E; as únicas falhas
restantes são da feature 066 em andamento e do `teste-conexao-tv` (`NET-W-QUOTA`), que já falhava no HEAD anterior.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) — navegador | `node e2e/serie-foco-episodios.mjs` (3 cenários do bug) | pass | Com a correção desfeita por `git stash`, os 3 falham (camada em −344 e −1520 px; contagem não aparece) |
| TV — "Próximo episódio" no chrome abre o seguinte com o chrome visível | usuário, build do Fix | pass | resposta "1 sim" |
| TV — episódio aberto pela lista com a página rolada mostra o chrome | usuário, build do Fix | pass | resposta "2 sim" |
| TV — fim do episódio mostra a contagem e abre o próximo | usuário, build da 2ª rodada (código final + linhas de diagnóstico) | pass | foto: "contagem desenhada" → "serie trocar -> S01E36" → sessão do novo episódio em `playing`. Antes: tela preta |
| TV — build final sem diagnóstico | `deploy-tv.ps1` | instalado; não reobservado | diferença para o build verificado: só as linhas `diag` removidas |
| Testes novos/atualizados | `npx vitest run src/lib/player` | pass (219/219) | `PlayerService.test.ts` (transições, fim em paused/buffering), `progressRecorder.test.ts` (uma gravação; `settleWithin`) |
| Suite de regressão | `npm test` | pass com ressalva | 3064/3071; 7 falhas só da 066 (contratos `categoryAccess`/`PinPrompt`, `fachada.test.ts`, 2 de Configurações) |
| E2E do player | `node e2e/run.mjs --only serie-foco-episodios,player-chrome,historico-continuar-assistindo,filmes-series-ds-v14,ciclo-vida-player,zapping-live-tv,live-tv-ds-v14,home-busca-configuracoes,rede-lifecycle-erros` | pass (7/7) | suíte E2E completa na fase Fix: só `teste-conexao-tv` falha (pré-existente) |
| Lint / type-check / build | `npm run lint`, `npx tsc -b`, `npm run build` | pass | catraca ok (tetos de `SeriesDetailScreen`, `PlayerService`, `usePlayerSession` respeitados) |

## Output Excerpts

```
=== "Próximo episódio" no player troca de episódio sem tirar o chrome da tela ===
  ✓ episódio 2: camada no topo e chrome dentro da tela (camada 0, chrome 941–1016 de 1080)
=== Episódio aberto pela lista com a página rolada: chrome na tela ===
  ✓ episódio da lista: camada no topo e chrome dentro da tela (camada 0, chrome 941–1016)
=== Fim real do vídeo (pause antes de ended) chama a contagem do próximo ===
  ✓ a contagem "Próximo episódio" apareceu
```

TV (foto do diagnóstico, 2ª rodada): `107.6–110.6 contagem desenhada` → `110.6 serie trocar -> S01E36` → `116.1 svc
buffering->playing`.

## Residual Risks

- O build final (sem as linhas de diagnóstico) foi instalado mas não reobservado na TV; o comportamento verificado foi o do mesmo
  código com registro na tela.
- Não se sabe se a escrita de "concluído" na TV falhou ou só demorou (a linha ficou fora da foto). A navegação já não depende
  dela; se o selo "assistido" de episódios não estiver sendo salvo na TV, é outro bug.
- `.player-overlay` com `position: fixed` vale para todas as telas que usam o player (Live, Filmes, Séries, Início) — coberto
  pelos E2E do player e pela suíte completa, mas na TV só a série foi observada nesta passada.

## Recommendation

Fechar — os três sintomas foram reproduzidos, corrigidos e verificados no navegador sobre o código final e na TV pelo usuário.
Na próxima passada pela TV, conferir de relance o player da TV ao vivo e de um filme (mesma camada) e se o episódio terminado
ganha o selo "assistido".
