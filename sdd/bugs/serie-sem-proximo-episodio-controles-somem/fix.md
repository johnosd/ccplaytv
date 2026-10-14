# Bug Fix: Série — fim do episódio não chama o próximo; controles somem no 2º episódio

- **Slug**: serie-sem-proximo-episodio-controles-somem
- **Corrigido**: 2026-10-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

(1) A sessão do player passa a aceitar o fim de mídia também a partir de `paused` e `buffering` — o `<video>` dispara `pause`
antes de `ended` e o AVPlay pode avisar o fim em `buffering`; antes o aviso era descartado e o episódio ficava parado, sem a
contagem. (2) A camada do player (`.player-overlay`, usada também pela contagem) passa a `position: fixed`, presa à tela em vez
de rolar junto com a página do detalhe, e o detalhe da série deixa de rolar a página enquanto o player está aberto.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/player/PlayerService.ts` | modified | `ALLOWED_NEXT`: `buffering → completed` e `paused → completed`; `completed` segue terminal (só → `closed`); canal ao vivo segue virando erro `stream_completed` em `applyCompleted` |
| `tv-web/src/styles/player.css` | modified | `.player-overlay` de `absolute` para `fixed` (bloco de contenção = palco `Stage`, que tem `transform`; sem escala, a própria janela 1920×1080) |
| `tv-web/src/features/series/SeriesDetailScreen.tsx` | modified | efeito de `scrollIntoView` do foco só com `mode.kind === 'browsing'`; `mode.kind` nas dependências traz o episódio focado à vista ao voltar do player |
| `tv-web/src/lib/player/PlayerService.test.ts` | modified | transições novas e fim vindo de `paused`/`buffering` |
| `tv-web/e2e/serie-foco-episodios.mjs` | modified | 3 cenários do bug (abaixo) |
| `tv-web/e2e.mjs`, `tv-web/e2e/idioma-do-app.mjs`, `tv-web/e2e/metadata-tmdb.mjs` | modified | sobras do commit `3f8d2d6` (Início sem lupa nem dock) achadas na suíte E2E completa desta fase — ver Deviations |

## Tests Added or Updated

- `PlayerService.test.ts::canTransition › permite as transições novas de pausa e conclusão` — inclui `paused/buffering → completed`.
- `PlayerService.test.ts::tradução de onCompleted › episódio: fim de mídia vindo de paused|buffering também conclui`.
- `e2e/serie-foco-episodios.mjs` — "Próximo episódio" no chrome abre o episódio 2 com a camada em `top 0` e o chrome dentro da
  tela; episódio aberto pela lista com a página rolada (1520 px) idem; fim real (`pause` + `ended`) mostra a contagem "Próximo
  episódio", também presa à tela. **Sem a correção os três falham** (camada em −344 e −1520 px; contagem não aparece) — rodado
  com `git stash` dos 3 arquivos de produção e restaurado em seguida.

## Local Verification

- `npx tsc -b` → limpo.
- `npm run lint` → ok, catraca ok (comentários enxugados para `SeriesDetailScreen.tsx` ≤ 1021 e `PlayerService.ts` ≤ 744).
- `npx vitest run src/lib/player src/features/series scripts/architecture.codigo-saudavel.contract.test.mjs` → 335/335.
- `npm test` → 3061/3069; as 8 falhas são da feature 066 em andamento (contratos `categoryAccess`/`PinPrompt`, `fachada.test.ts`,
  2 de Configurações) e a catraca antes do enxugamento (depois: passa).
- `npm run build` → ok.
- `node e2e/run.mjs --retry 1` (suíte completa, 43 scripts) → 39 na 1ª rodada; das 4 falhas, 3 eram sobras do `3f8d2d6`
  (corrigidas, 4/4 depois, junto com `serie-foco-episodios`) e `teste-conexao-tv`, que falha em `NET-W-QUOTA` também com a
  versão do HEAD (anterior a esta sessão, não relacionada).
- TV física: build de diagnóstico (temporário, revertido — não está no diff) confirmou o item 2 (`vis=1 phase=session:playing
  lvl=full`, chrome fora da tela). Validação da correção na TV fica para a fase Test.

## Deviations from Assessment

- A suíte E2E completa mostrou 3 roteiros ainda presos ao Início antigo (lupa da busca global e dock de serviços), removidos no
  commit `3f8d2d6` desta mesma sessão: `e2e.mjs` (abria a Busca pela lupa; da engrenagem ao indicador agora é uma seta),
  `e2e/idioma-do-app.mjs` (varria a tela de Busca) e `e2e/metadata-tmdb.mjs` (conferia o ícone TMDB do dock). Ajustados aqui
  por bloquearem o gate de E2E desta fase; não tocam código de produção.

- **Segunda rodada (2026-10-09), depois de a TV mostrar tela preta no fim do episódio.** Novo build de diagnóstico: o AVPlay
  avisou o fim em `playing` (`av streamCompleted` → `svc fim recebido em playing` → `sess completed -> onCompleted`), mas a tela
  da série nunca recebeu `onCompleted`: `usePlayerSession` esperava `recorder.onExit('completed')` (escrita de "concluído" no
  IndexedDB) **sem prazo e só no sucesso**, e na TV essa escrita não voltou. Mudanças além do assessment:
  - `tv-web/src/lib/player/progressRecorder.ts` — `settleWithin(promise, ms, onGiveUp?)` e `COMPLETION_WRITE_TIMEOUT_MS`
    (1,5 s): a navegação segue quando a escrita termina, falha ou passa do prazo; e, passado o limiar final, `apply` grava
    "concluído" **uma vez** (antes cada tique de progresso enfileirava outra transação no IndexedDB, lento na TV).
  - `tv-web/src/components/player/usePlayerSession.ts` — usa `settleWithin` no lugar de `onExit('completed').then` (comentário
    condensado para caber no teto da catraca, 592).
  - `tv-web/src/lib/player/progressRecorder.test.ts` — 2 testes (uma gravação só depois do limiar; `settleWithin` com sucesso,
    falha e prazo).
  Na TV (build com a correção + diagnóstico) a contagem apareceu e o episódio seguinte (S01E36) começou. Diagnóstico revertido
  depois (só as linhas `diag`, sem `git checkout` nos arquivos com correção; `lib/diag.tsx` apagado).

## Follow-ups

- A linha que diria se a escrita de "concluído" **falhou** ou só **demorou** na TV ficou fora da foto: vale conferir se o selo
  "assistido" de episódios está sendo salvo na TV (se não estiver, é outro bug, no IndexedDB do aparelho).

- Fase Test na TV: (1) deixar um episódio terminar → contagem e próximo; (2) "Próximo episódio" no chrome → abre o seguinte com o
  chrome visível; (3) abrir um episódio pela lista com a página rolada → chrome visível.
- Se na TV o fim ainda não chamar a contagem, o AVPlay pode não disparar `onstreamcompleted` para esse conteúdo — aí entra o
  fallback por posição (alternativa registrada no assessment).
