# Bug Assessment: Série — fim do episódio não chama o próximo; controles somem no 2º episódio

- **Slug**: serie-sem-proximo-episodio-controles-somem
- **Criado**: 2026-10-09
- **Origem**: texto colado (conversa) + entrada em `.planning/backlog.md` → `## Ideias Futuras` ("quando termina um capitulo de uma serie, não aparece contador e nem inicia o proximo capitulo")
- **Veredito**: valid (itens 1 e 2 reproduzidos no navegador; item 2 confirmado na TV pelo build de diagnóstico)
- **Severidade**: high

## Report

> "As séries, quando eu estou assistindo, tem alguns problemas. Um deles é que quando termina um episódio, ele não entra o
> contador para dizer que vai iniciar o próximo capítulo, caso exista. E não vai para o próximo capítulo também. Fica parado.
> Também percebi que quando entro manualmente em um segundo capítulo, os menus de controle de vídeo somem e só funciona o pause."

Observado pelo usuário na TV de referência (QN50Q60DAGXZD, AVPlay), com a lista IPTV real.

## Symptom

1. **Fim do episódio**: o player fica parado no fim; não aparece a contagem "Próximo episódio" (`NextEpisodeCountdown`) nem
   abre o seguinte. Esperado: contagem e, sem cancelar, o próximo episódio (feature 012, FR-014/D-008).
2. **2º episódio aberto à mão**: os controles do player somem e só o pause responde. Esperado: chrome completo (voltar/avançar
   10 s, episódio anterior/próximo, faixas…) como no 1º episódio.

## Reproduction

**Item 1 — reproduzido no navegador (2026-10-09)**, com uma cópia temporária de `e2e/serie-foco-episodios.mjs` (série fictícia
de 14 episódios, adaptador `<video>` do `npm run dev`):

1. Abrir a série, OK na ação primária (episódio 1), `playing` + progresso 590/600 s.
2. Disparar só `ended` → aparece o diálogo "Próximo episódio" (é o que os testes/E2E atuais fazem).
3. Disparar `pause` e depois `ended` — **a ordem real** de um `<video>` que chega ao fim (especificação HTML: ao terminar,
   `paused` vira true e o elemento dispara `pause` antes de `ended`) → o diálogo continua "Reproduzindo Episodio 1"; nenhuma
   contagem, nada avança.

**Item 2 — não reproduz no navegador.** Mesma sonda: OK em "Próximo episódio" no chrome abre o episódio 2 com os 9 controles;
o chrome some sozinho após 5 s (comportamento normal) e volta com ↑; → percorre os controles. O sintoma só foi visto na TV.

- **Resposta do usuário (2026-10-09)**: na TV, estando num episódio e passando para o próximo, os controles de voltar/avançar
  10 s somem; perguntado quais botões ficam na linha, respondeu **"não aparece linha"** — nenhuma linha de controles com as
  setas, só o pause do controle remoto funciona. Pela regra (`chromeControls.ts`), os botões de 10 s só somem com `canSeek`
  falso (o que também tiraria o pause) ou no chrome "ao vivo" (sem 10 s nem pause); como nenhuma linha aparece e a pausa age,
  o indício é o chrome não ser desenhado: `PlayerLayer.tsx:209-210` exige `phase.kind === 'session'`, sem painel, sem
  `topLayer` e sem tela de erro, enquanto a tecla de pause (`usePlayerKeyboard.ts` → `onMediaKey`) só exige a sessão existir.
  [NEEDS CLARIFICATION: qual estado a camada tem na TV nesse momento — só observável com um build de diagnóstico.]

## Suspected Code Paths

- `tv-web/src/lib/player/PlayerService.ts:278-288` (`ALLOWED_NEXT`) — `completed` só é alcançável a partir de `playing`;
  `paused → completed` e `buffering → completed` são proibidos.
- `tv-web/src/lib/player/PlayerService.ts:668-676` (`applyCompleted`) — com `canTransition` falso o fim é **descartado em
  silêncio** (`return`), sem erro nem conclusão: a sessão fica viva e parada.
- `tv-web/src/lib/player/htmlVideoAdapter.ts:144,154` — `pause` → `onStateChange('paused')` antes de `ended` → `onCompleted`.
- `tv-web/src/lib/player/avplayAdapter.ts:361-362,372` — no AVPlay o estado só vira `playing` em `onbufferingcomplete`; um
  `onbufferingstart` perto do fim (comum em fluxo progressivo/HLS) deixa a sessão em `buffering` quando `onstreamcompleted` chega
  → mesmo descarte.
- `tv-web/src/components/player/usePlayerSession.ts:415-427` — só chama `onCompleted` quando a sessão chega a `completed`.
- `tv-web/src/features/series/SeriesDetailScreen.tsx:472-483,986-1018` — `handlePlayerCompleted` → contagem; está correto, mas
  nunca é chamado.
- Item 2 (hipóteses, sem prova): `PlayerService.ts:444-458` (`jumpBy` descarta tudo enquanto `seekInFlight` — um salto cujo
  callback o AVPlay nunca devolve trava avançar/voltar para sempre, e só pause/play continuam); `avplayAdapter.ts:391-411`
  (sessão presa em `buffering` se o `onbufferingcomplete` não vier após a busca de retomada antes do `play()`).

## Root Cause Hypothesis

**Item 1 (confiança alta)**: a máquina de estados do `PlayerService` só aceita o fim de mídia vindo de `playing`. No navegador o
`<video>` sempre passa por `pause` antes de `ended`, então o fim é sempre descartado (reproduzido). No AVPlay o mesmo descarte
acontece se o motor estiver em `buffering` (ou pausado) quando dispara `onstreamcompleted` — e a sessão fica viva, parada no
último quadro, sem chamar `onCompleted`: nem contagem, nem próximo episódio, nem volta à lista. Os testes não pegaram porque
disparam `ended` sozinho, sem o `pause` que o navegador real emite.

**Item 2 (confiança baixa)**: não reproduz fora da TV. Hipóteses: (a) consequência do item 1 — o episódio 1 fica preso no fim
num estado intermediário e o AVPlay (singleton) abre o episódio 2 a partir dele; (b) um salto (`jumpForward/Backward`) cujo
callback não volta deixa `seekInFlight` verdadeiro e todos os saltos seguintes são descartados, sobrando só pause/play; (c) a
sessão do episódio 2 fica em `buffering` (sem `onbufferingcomplete` depois da busca de retomada).

## Proposed Remediation

**Preferida (item 1)**: aceitar `completed` também a partir de `buffering` e `paused` em `ALLOWED_NEXT` — fim de mídia relatado
pelo motor é fato, venha de onde vier (D-008 da 011 já diz que a tradução depende só da capacidade da mídia). Canal ao vivo não
muda: `applyCompleted` sem `reportsDuration` continua virando erro `stream_completed`. `completed` segue terminal (só →
`closed`), preservando a proteção contra callback atrasado.

**Item 2**: não corrigir às cegas. Depois de instalar o item 1 na TV, o usuário refaz o cenário; se persistir, voltar ao Assess
com a resposta da [NEEDS CLARIFICATION] acima. Se a hipótese (b) se confirmar, a remediação provável é um prazo de segurança
para liberar `seekInFlight` quando o motor não responde.

**Alternativas** (item 1):
- Ignorar o `pause` do `<video>` quando `video.ended` é verdadeiro (só no adaptador do navegador) — resolve o navegador, mas não o
  caso AVPlay em `buffering`; descartada como solução única.
- Fallback por posição (≥ duração − 1 s sem progresso por N s ⇒ concluído) — cobre motor que nunca dispara o fim, mas inventa
  conclusão por heurística; fica para uma segunda rodada se a TV mostrar que `onstreamcompleted` não chega.

**Files likely to change**:
- `tv-web/src/lib/player/PlayerService.ts`
- `tv-web/src/lib/player/PlayerService.test.ts` (ou o teste de estados existente)
- `tv-web/e2e/serie-foco-episodios.mjs` (ou outro E2E de série: concluir com `pause` + `ended`, como o navegador real)

**Tests to add or update**:
- Unitário: fim de mídia em `paused` e em `buffering` (VOD) leva a `completed`; em canal ao vivo segue `error stream_completed`;
  `completed` continua só → `closed`.
- E2E: concluir o episódio com `pause` + `ended` mostra "Próximo episódio" e, ao expirar, abre o episódio 2.

## Risks & Considerations

- Um `onstreamcompleted` atrasado de um item anterior já é barrado: troca de item cria uma sessão nova (o adaptador da sessão
  velha está fechado), e `completed` continua terminal.
- `paused → completed`: pausar perto do fim e o motor reportar o fim mesmo assim conclui o episódio — é o fato real (a mídia
  acabou), e o progresso gravado já estaria além do limiar de conclusão.
- Item 2 pode não ter relação com o item 1; o veredito dele fica em aberto até a TV.

## Open Questions

- Item 2 respondido em parte (ver Reproduction): nenhuma linha aparece, só o pause age. Falta saber o estado interno da camada na
  TV — a fase Fix do item 1 não depende disso; se o item 2 persistir depois dela, um build de diagnóstico (estado da camada e
  da sessão na tela) decide a causa antes de qualquer correção.
- **Roteiro exato do usuário (2026-10-09)**: entrar num episódio → OK em "Próximo episódio" no player → **volta para a tela de
  detalhes da série** (não abre o seguinte) → entrar em outro episódio pela lista → nenhuma linha de controles aparece; só o OK
  pausa. No navegador o mesmo "Próximo episódio" abre o episódio 2 normalmente. Hipótese (não provada): um aviso de fim atrasado
  do AVPlay do episódio 1 chega à sessão do 2 e abre a contagem, que o OK/repetição de tecla cancela → detalhes; o motor fica num
  estado ruim e a sessão seguinte não chega a `phase.kind === 'session'`.
- **Build de diagnóstico instalado na TV (2026-10-09, temporário, fora do repositório)**: sobreposição no canto superior direito
  com os eventos do AVPlay (`av …`), as transições da sessão (`svc …`, marcando RECUSADO/DESCARTADO), o ciclo da sessão (`sess …`),
  a visibilidade do chrome (`vis=… phase=… lvl=…`) e as decisões da tela da série (`serie …`). Aguardando foto do usuário
  repetindo o roteiro.

## Atualização (2026-10-09) — item 2 com causa comprovada

**Evidência da TV (foto do build de diagnóstico)**: no episódio aberto depois do "Próximo episódio", a camada estava
`vis=1 phase=session:playing lvl=full media=vod panel=0 err=0 top=0 sess=1` e cada OK alternava `playing↔paused`. Ou seja, o
player estava ativo e o chrome **existia, completo e com foco em "Pausar"**, mas fora da tela.

**Reprodução no navegador**: depois de OK em "Próximo episódio", a `.screen.vod-detail` ficou rolada (`scrollTop` 344) e a
`.player-overlay` ficou em `top = -344` — chrome no meio da tela, lista de episódios por baixo (captura no scratchpad da sessão).

**Causa raiz (confiança alta)**:
- `tv-web/src/styles/player.css:13-24` — `.player-overlay` é `position: absolute; inset: 0` e, no detalhe da série/filme, fica
  DENTRO de `.screen.vod-detail`, que é o próprio elemento que rola (`styles/vod.css:711-716`, `overflow: auto`, feature 059).
  Qualquer rolagem da página desloca a camada junto: o chrome (e a contagem, que usa a mesma classe) sai da tela; na TV o resto do
  detalhe fica `visibility: hidden` sobre o plano de vídeo, então sobra só o vídeo, e o OK pausa (foco em "Pausar").
- `tv-web/src/features/series/SeriesDetailScreen.tsx:436-441` — o efeito que traz `.tv-focus` à vista roda também com o player
  aberto: "Próximo episódio" (`switchEpisode`) muda `row`/`episodeIdx` e o `scrollIntoView` rola a página até o novo episódio
  na lista — a camada rola junto.
- O mesmo vale para abrir um episódio **pela lista** com a página já rolada (o caso "entro em outro capítulo e o menu some").

**Remediação adicional (item 2)**: `.player-overlay` com `position: fixed` (o palco `Stage` tem `transform`, então o bloco de
contenção é o palco 1920×1080, fora da área que rola — a camada fica presa à tela em qualquer rolagem); e o efeito de rolagem do
detalhe da série só roda com `mode.kind === 'browsing'` (com o modo nas dependências, ao voltar do player o episódio focado é
trazido à vista). **Files likely to change** (somam-se aos do item 1): `tv-web/src/styles/player.css`,
`tv-web/src/features/series/SeriesDetailScreen.tsx`, `tv-web/e2e/serie-foco-episodios.mjs`.

