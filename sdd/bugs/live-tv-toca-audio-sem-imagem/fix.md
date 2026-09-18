# Bug Fix: Live TV toca áudio sem imagem na TV física

- **Slug**: live-tv-toca-audio-sem-imagem
- **Corrigido**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A camada de reprodução passa a liberar a área do vídeo — `:root` e
`.player-overlay` ficam transparentes — enquanto o motor ativo pinta num
plano de hardware e a sessão está exibindo. Sem isso, o preto opaco da camada
web cobria o plano do AVPlay e o canal tocava só com áudio.

A informação chega à UI como **capacidade do adaptador**
(`rendersOnHardwarePlane`), não como identidade do motor: a tela continua sem
saber se está falando com AVPlay ou com `<video>`, preservando D-007 do plano
da 003.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/player/PlayerService.ts` | modified | `rendersOnHardwarePlane` no contrato `PlayerAdapter` e em `PlayerSession`; a sessão copia o valor na construção, porque `adapter` é anulado no `close()` e a camada ainda precisa desmontar o fundo depois disso |
| `tv-web/src/lib/player/avplayAdapter.ts` | modified | Declara `rendersOnHardwarePlane: true` |
| `tv-web/src/lib/player/htmlVideoAdapter.ts` | modified | Declara `false` — no navegador o vídeo é nó do DOM e o fundo opaco continua correto |
| `tv-web/src/features/live/PlayerOverlay.tsx` | modified | Guarda a capacidade em estado ao criar a sessão e alterna `video-plane-visible` em `document.documentElement` apenas nos estados `buffering`/`playing`; remoção no cleanup do efeito |
| `tv-web/src/index.css` | modified | `:root.video-plane-visible { background: transparent }` + comentário explicando por que o fundo some |
| `tv-web/src/features/screens.css` | modified | `:root.video-plane-visible .player-overlay { background: transparent }`; o comentário do bloco original foi corrigido — ele justificava o fundo opaco citando o plano de hardware, que é exatamente o motivo para liberá-lo |
| `tv-web/src/features/live/PlayerOverlay.test.tsx` | modified | `fakeFactory(rendersOnHardwarePlane)` + 4 casos novos |
| `tv-web/src/lib/player/PlayerService.test.ts` | modified | Dois adaptadores falsos passaram a declarar a capacidade (exigência do contrato) |

## Tests Added or Updated

- `PlayerOverlay.test.tsx::com motor de plano de hardware, libera a área do
  vídeo ao reproduzir` — inclui a asserção de que em "preparando" o fundo
  **ainda é preto**, porque não há vídeo para revelar.
- `PlayerOverlay.test.tsx::com o motor <video> do desktop, o fundo preto
  permanece` — garante que a correção é específica do plano de hardware.
- `PlayerOverlay.test.tsx::ao desmontar, devolve o fundo` — cobre o risco
  principal levantado no assessment (classe esquecida deixaria o app inteiro
  transparente na TV).
- `PlayerOverlay.test.tsx::ao cair em erro durante a reprodução, devolve o
  fundo` — a tela de erro precisa continuar legível.

## Local Verification

- `npx vitest run src/features/live/PlayerOverlay.test.tsx` → 13 testes, todos passando.
- `npx tsc -b` → exit 0 (na primeira passada acusou os dois adaptadores falsos de `PlayerService.test.ts` sem a nova propriedade; corrigidos).
- `npm run lint` (oxlint) → sem apontamentos.
- `npm run test` (suite completa) → 10 arquivos, 57 testes (eram 53), todos passando.
- Checagens manuais: **nenhuma ainda no aparelho**. O sintoma só existe em
  hardware; a verificação que vale é da fase Test.

## Deviations from Assessment

Nenhum desvio de arquivos: as mudanças ficaram exatamente nos sete arquivos
previstos, mais `PlayerService.test.ts`, que o assessment não listou. Essa
adição não é escolha de design — tornar `rendersOnHardwarePlane` obrigatório
no contrato quebra qualquer adaptador falso existente, e os dois desse
arquivo precisavam declarar o valor para o type-check passar. Registrado aqui
por transparência, não por ter mudado a abordagem.

## Follow-ups

- A pergunta aberta do assessment continua: contêiner e codec do canal
  testado não foram registrados. Se a fase Test mostrar que a imagem ainda
  não aparece, esse dado passa a ser o caminho principal (hipótese de codec)
  e vira outro bug.
- ADR-007 descreve o palco com fundo escuro permanente. Agora existe um
  estado em que ele não é pintado. É restrito à camada de reprodução, mas se
  a ideia se espalhar (por exemplo, para trailers em segundo plano), vira
  assunto de emenda à ADR-007.
- `FULLSCREEN_REGION` é sempre 1920×1080. Quando existir player em janela
  (PiP, preview no catálogo), a área liberada terá de acompanhar a região do
  `setDisplayRect` em vez de ser a tela inteira.
