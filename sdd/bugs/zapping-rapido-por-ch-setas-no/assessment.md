# Bug Assessment: Zapping rápido por CH±/↑/↓ para no próximo canal

- **Slug**: zapping-rapido-por-ch-setas-no
- **Criado**: 2026-10-14
- **Origem**: texto colado (relato do usuário, via `/sdd-adhoc` redirecionado para cá)
- **Veredito**: valid
- **Severidade**: medium

## Report

> "quando uso o botao de canais para cima ou para baixo quando estou assistindo um canal ele move para o
> proximo canal corretamente mas ele nao permite passar varios canais, ele para no proximo e carrega, ele
> deveria mover e so carregar quando parar em um canal"

## Symptom

No player da Live, cada toque em CH±/↑/↓ troca o canal **e já começa a carregá-lo**; enquanto o canal novo
prepara, um novo CH± é ignorado — não dá para atravessar vários canais seguidos. Esperado: a faixa acompanha
os toques e só o canal em que a pessoa parar é carregado.

Contraria a spec da 016 (Edge Cases: "Trocar de canal repetidamente antes de qualquer um terminar de
carregar: só a última escolha sobrevive"; **SC-003**), que a 027 (US2, ↑/↓/CH± no chrome) herdou.

## Reproduction

1. Live TV → entrar numa categoria com vários canais → OK num canal; esperar tocar.
2. Apertar CH+ (ou ↓) três vezes seguidas, rápido.
3. Observado: o 1º toque troca e começa a carregar o vizinho; os toques seguintes durante o "Preparando…"
   (CH±) não têm efeito; cada canal intermediário que chega a ser trocado é aberto no AVPlay.
4. Esperado: a faixa mostra o 3º vizinho e só ele é carregado.

Reprodução por leitura de código (abaixo) e automatizável em jsdom (`fetchPlayback` chamado para cada canal
intermediário). Ainda não reproduzido na TV física nesta fase.

## Suspected Code Paths

- `tv-web/src/features/live/useLiveZapping.ts:109` (`stepChannel`) — chama `setPlaying(target)` a cada toque;
  `PlayerLayer` recebe `itemId={playing.id}` (`LiveScreen.tsx:286`), e a mudança de `itemId` derruba a sessão
  e abre a do vizinho na hora (`usePlayerSession.ts`, efeito `[itemId, …]`) — sem janela de espera.
- `tv-web/src/components/player/usePlayerKeyboard.ts:322` (`onMediaKey`) — `return` com sessão em
  `idle`/`preparing` **antes** do ramo de CH±: durante o carregamento do canal novo, CH± é descartado.
  (↑/↓, em `onDirection`, só param com sessão nula ou em erro — por isso o efeito é mais visível no CH±.)
- `tv-web/src/features/live/useLiveZapping.ts:120` — `lastGoodChannelRef = playing` a cada passo: com
  passos seguidos, o "último canal bom" do D-008 (027) viraria um canal intermediário que nunca tocou.

## Root Cause Hypothesis

A troca por ↑/↓/CH± foi desenhada como "um toque = uma sessão": o estado `playing` é ao mesmo tempo o canal
mostrado na faixa e o canal que o player abre, então não há como mover sem carregar. Somado a isso, o guard de
`onMediaKey` bloqueia CH± enquanto a sessão nova prepara. Confiança: **high**.

## Proposed Remediation

**Preferida**: separar "canal escolhido" de "canal sintonizado" só na troca por passo, dentro da Live:

1. `useLiveZappingState` ganha `heldChannel` (o canal que o player continua tocando enquanto a pessoa navega).
   `stepChannel` atualiza `playing` (faixa, número, EPG, foco — FR-014) a cada toque, mas na 1ª etapa de uma
   rajada guarda o canal sintonizado em `heldChannel` e (re)inicia um temporizador curto
   (`ZAP_SETTLE_MS`, ~600 ms); ao vencer, `heldChannel = null` e o player abre o canal final.
2. `LiveScreen` passa ao `PlayerLayer` `itemId` do canal sintonizado (`heldChannel ?? playing`) — exceto com
   arquivo ativo, que sempre segue `playing`.
3. `lastGoodChannelRef` só é gravado no início da rajada (o canal que de fato tocava).
4. Qualquer outro caminho que troca/fecha (OK no zapping, fechar, erro de sessão) zera a espera na hora.
5. Do arquivo (058, FR-018), CH± continua imediato (`hold: false`): manter o canal antigo sintonizado sem o
   arquivo reabriria o ao vivo dele.
6. `usePlayerKeyboard.onMediaKey`: CH± no Live deixa de esperar o fim do `preparing` (igual ao ↑/↓).

**Alternativas**:
- Atrasar o início da sessão dentro de `usePlayerSession` (o player derruba o canal antigo na hora e espera
  antes de abrir o novo). Descartada: `usePlayerSession.ts`/`PlayerLayer.tsx` estão no teto de linhas do
  ratchet de arquitetura, e a decisão "isto é uma rajada de passos" pertence à Live, não ao player genérico
  (que também serve a filmes/episódios).
- Só destravar CH± durante o `preparing`. Insuficiente: cada canal intermediário continuaria sendo aberto.

**Files likely to change**:
- `tv-web/src/features/live/useLiveZapping.ts`
- `tv-web/src/features/live/useLiveArchive.ts`
- `tv-web/src/features/live/LiveScreen.tsx`
- `tv-web/src/components/player/usePlayerKeyboard.ts`

**Tests to add or update**:
- Novo `tv-web/src/features/live/LiveScreen.zapping-rapido.test.tsx`: três ↓ seguidos no player → a faixa
  mostra o 3º vizinho, `fetchPlayback` nunca é chamado para os intermediários e é chamado para o final depois
  da espera; erro no canal final volta ao canal que tocava antes da rajada.
- `tv-web/src/components/PlayerLayer.test.tsx`: CH± durante `preparing` do Live chama `onChannelStep`.
- Rodar os existentes: `LiveScreen.archive.test.tsx` (CH± do arquivo), `LiveScreen.memoria-foco.contract`,
  `PlayerLayer.player-chrome.contract` (travado), E2E `player-chrome.mjs` e `zapping-live-tv.mjs`.

## Risks & Considerations

- Durante a espera, a faixa mostra o canal escolhido sobre o vídeo do canal antigo (comportamento comum de
  set-top box). O EPG "agora" da faixa já é o do canal escolhido.
- `ZAP_SETTLE_MS` é um valor de produto; muito curto volta a carregar intermediários num controle lento,
  muito longo atrasa um toque único. 600 ms é o ponto de partida; afinar na TV física.
- Contratos travados (027 `PlayerLayer.player-chrome.contract`, 046 `memoria-foco.contract`) não podem ser
  editados — precisam continuar passando.
- Arquivos no teto do ratchet (`usePlayerKeyboard.ts` 406 linhas): a mudança ali não pode aumentar o total.
- Validação final de tempo/sensação só na TV física (AVPlay).

## Open Questions

- Nenhuma bloqueante. O valor da espera (600 ms) fica para conferência na TV.
