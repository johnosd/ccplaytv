# Research — 011 Assistir Filme, com Retomada

Fase 0 do `sdd-plan`. Só entram aqui incertezas técnicas **genuínas** — coisas
que, resolvidas errado, levariam a um design que não funciona no aparelho.
Formato por item: Decisão / Justificativa / Alternativas consideradas.

---

## R0-1 — Superfície real da API AVPlay para VOD

**Decisão**: o adaptador AVPlay passa a usar `pause()`, `seekTo(ms, ok, err)`,
`jumpForward(ms, ok, err)`, `jumpBackward(ms, ok, err)`, `getCurrentTime()`,
`getDuration()` e o callback `oncurrentplaytime(currentTimeMs)`. Os estados do
motor relevantes são `READY`, `PLAYING` e `PAUSED`.

**Justificativa**: confirmado na referência oficial da Samsung (AVPlay API
Reference e "Playback Using AVPlay"), consultada em 23/09/2026:

| Chamada | Estados permitidos | Observação que afeta o design |
| --- | --- | --- |
| `pause()` | `READY`, `PLAYING`, `PAUSED` | Ao pausar, as atualizações de tempo param — a UI não pode esperar `oncurrentplaytime` enquanto pausado |
| `seekTo(ms, ok, err)` | durante reprodução | O tempo novo precisa ser positivo e menor que a duração |
| `jumpForward/Backward(ms, ok, err)` | `READY`, `PLAYING`, `PAUSED` | **Outras chamadas à API ficam restritas durante a operação assíncrona** |
| `getCurrentTime()` | `NONE`, `IDLE`, `READY`, `PLAYING`, `PAUSED` | Síncrona, devolve ms |
| `oncurrentplaytime(ms)` | callback do grupo `playCallback` | Empurra a posição periodicamente |
| `onstreamcompleted()` | callback do grupo `playCallback` | Fim de mídia — hoje o adaptador o traduz para **erro** |

A restrição de `jumpForward/Backward` ("outras chamadas restritas durante a
operação assíncrona") é a mais importante para o design: ela proíbe disparar
um segundo salto enquanto o primeiro não chamou de volta. Sem uma porta, uma
sequência rápida de setas no controle — que é o uso normal para avançar um
filme — emite chamadas sobrepostas. Ver `logic/reproducao-vod.md` §3.

**Alternativas consideradas**:

- *Polling de `getCurrentTime()` com `setInterval`*: descartado. O motor já
  empurra a posição por `oncurrentplaytime`; um intervalo próprio somaria um
  segundo relógio, dessincronizado do motor, que continuaria rodando com a
  mídia pausada.
- *Usar só `seekTo` e calcular o destino*: mantido como **fallback**, não como
  caminho principal. `jumpForward/Backward` é a primitiva que a referência
  associa a "saltos", e trata timestamp inválido em streaming HTTP
  automaticamente. `seekTo` é usado onde há um destino absoluto (retomada).

**Não verificado em hardware**: nada disto foi exercitado na QN50Q60DAGXZD —
o adaptador atual só usa `open`/`prepareAsync`/`play`/`stop`/`close`. É a
razão do gate de TV física desta feature (`quickstart.md`, Cenários F–I).

---

## R0-2 — Onde as capacidades são resolvidas

**Decisão**: capacidade é resolvida **por sessão**, como a interseção de duas
coisas distintas — o que o **motor** sabe fazer e o que a **mídia** permite:

```
capacidadesDaSessão = capacidadesDoMotor ∩ capacidadesDoTipoDeMídia
```

**Justificativa**: o mesmo adaptador (AVPlay) serve canal ao vivo e filme. Se
a capacidade fosse propriedade estática do adaptador, ou o canal ao vivo
ganharia barra de busca (violando FR-003 e o critério P02 do guia 06), ou o
filme a perderia. A natureza da mídia vem do `kind` que `fetchPlayback` já
devolve — o comentário nele (`catalogApi.ts:309`) antecipa exatamente este
uso: *"é ele que decide o caminho da URL no painel e o que a camada de
reprodução pode oferecer"*.

**Alternativas consideradas**:

- *Capacidade como método opcional no adaptador, inferida por presença
  (`if (adapter.seekTo)`)*: descartado. Presença de método é declaração
  implícita, e o precedente do repositório é explícito — `rendersOnHardwarePlane`
  é um booleano declarado, justamente para a UI ler capacidade sem saber qual
  motor está ativo (D-007 do plano da 003). Além disso, "o motor sabe buscar"
  e "esta mídia pode ser buscada" são fatos diferentes que a presença de um
  método não distingue.
- *A tela decidir pelos controles a partir do `kind`*: descartado. Espalharia
  a regra por cada tela e deixaria a UI oferecer busca num motor que não a
  suporta — o inverso do que FR-002 pede.

---

## R0-3 — Como a posição chega à interface

**Decisão**: o adaptador empurra posição e duração por um callback novo
(`onProgress`), a sessão guarda o último valor, e a interface se inscreve no
mesmo `subscribe()` que já existe para estado.

**Justificativa**: os dois motores empurram — AVPlay por `oncurrentplaytime`,
`<video>` por `timeupdate`. Reaproveitar o mecanismo de notificação existente
da `PlayerServiceSession` mantém um só caminho de atualização e evita um
segundo relógio. A frequência é definida pelo motor (na ordem de 1 s), o que é
suficiente para uma barra de progresso de filme.

**Alternativas consideradas**:

- *A tela chamar `getCurrentTime()` num `requestAnimationFrame`*: descartado.
  Redesenharia a barra a 60 fps para um dado que muda uma vez por segundo, num
  aparelho onde o guia Samsung pede parcimônia com animação.

---

## R0-4 — Cadência de gravação do progresso

**Decisão**: gravar a cada **5 segundos de avanço da mídia**, usando as
atualizações de posição como relógio, **mais** uma gravação em cada evento de
saída: pausar, encerrar (RETURN) e concluir.

**Justificativa**: o SC-002 da spec exige retomar "a menos de 10 segundos do
ponto em que parou", inclusive após encerramento abrupto — o único caso em que
a gravação de saída não acontece. Uma cadência de 10 s tocaria exatamente o
limite; 5 s fica confortavelmente dentro. O custo é um `put` por chave
primária a cada 5 s numa transação curta, desprezível ao lado da decodificação
de vídeo. Usar a posição como relógio (em vez de um `setInterval`) faz a
gravação parar sozinha quando a mídia pausa, que é o comportamento correto.

O guia 06 §"Retorno e interrupção" é normativo aqui: *"Salvar progresso em
pontos intermediários, não apenas no encerramento."*

**Alternativas consideradas**:

- *Só ao encerrar*: descartado — contraria FR-012 e o guia 06 diretamente, e
  perde tudo num desligamento na tomada.
- *A cada atualização do motor (~1 s)*: descartado. Multiplicaria por cinco as
  escritas sem ganho perceptível para o usuário, que não distingue 1 s de 5 s
  de retomada.

---

## R0-5 — O limiar final exige persistir a duração?

**Decisão**: **não**. Ao cruzar o limiar final (95 % da duração) durante a
reprodução, o progresso salvo é **apagado**, em vez de guardado junto com uma
duração para ser reavaliado depois. O schema do IndexedDB **não muda** nesta
feature.

**Justificativa**: `UserStateRecord` (`db.ts:50`) guarda `progressSeconds`,
mas não a duração. Avaliar "passou de 95 %" na tela de detalhe — com o player
já fechado — exigiria o denominador, logo uma versão v8 do schema. Apagar no
momento em que o limiar é cruzado move a decisão para onde a duração já está
disponível (dentro da sessão) e torna a regra da tela de detalhe trivial e
única: **existe `progressSeconds` > 0 → "Retomar"; não existe → "Assistir"**.

É também o mesmo mecanismo que FR-020 pede na conclusão, então os dois
requisitos passam a ser uma linha de código só, não duas regras paralelas que
podem divergir.

**Consequência assumida**: quem assistiu a 96 % de um filme e quer rever os
últimos minutos recomeça do início. É exatamente o que a clarificação de
23/09 decidiu ("passando de ~95 % trata como terminado").

**Quando a duração não é conhecida** (FR-004): a regra de proporção não pode
ser avaliada e **não é** — o progresso só é apagado por conclusão real
(`onstreamcompleted`). Nada é estimado.

**Alternativas consideradas**:

- *Persistir `durationSeconds` no registro (schema v8)*: adiada, não rejeitada
  em definitivo. Os itens 13 (histórico, "concluído a 90 %") e 16 (barra de
  progresso no pôster) provavelmente vão precisar dela. Acrescentar um campo
  opcional depois é uma migração aditiva sem perda de dado — barato de fazer
  quando houver um consumidor real, caro de manter agora sem nenhum.
- *Guardar um sinalizador `nearComplete` em vez da duração*: descartado.
  Guardaria uma conclusão derivada em vez do fato, e envelheceria mal se o
  limiar mudar.

---

## R0-6 — Modelo de interação dos controles

**Decisão**: seguir o guia Samsung `docs/guia-praticas-app-tv/06` §1, que é
normativo para o que é enviado a uma TV:

- Controles começam visíveis e **somem após 5 s** sem interação.
- **SELECT, cima ou baixo revelam** os controles.
- **Com os controles visíveis**: esquerda/direita **navegam entre as ações**.
- **Com os controles ocultos**: esquerda/direita **executam o salto** e
  exibem a barra.
- Saltos de **10 s**.

**Justificativa**: o guia é a orientação oficial da plataforma e o repositório
já o trata como normativo (`CLAUDE.md`, "Normativo para anything shipped to a
TV"). Ele é mais específico do que a spec conseguia ser: a spec dizia apenas
que os controles somem e que qualquer direcional os traz de volta; o guia
distingue o comportamento da esquerda/direita **conforme os controles estejam
visíveis ou não**. Essa distinção é o que permite avançar o filme sem primeiro
ter de revelar a barra — e é a razão de o salto existir como primitiva
separada da navegação entre botões.

**Divergência registrada frente à spec**: FR-008 diz "reaparecem ao acionar
qualquer direcional ou SELECT". O guia manda esquerda/direita **saltarem** (e
só então exibirem a barra), não meramente revelarem. Não é contradição de
resultado — a barra aparece nos dois casos — mas o salto acontece junto. Está
travado em D-006 do `plan.md` e é o comportamento que `tasks.md` implementa.

**Alternativas consideradas**:

- *Qualquer tecla apenas revela, sem agir*: descartado por contrariar o guia
  e por exigir duas ações do usuário para avançar 10 s.
- *Manter os controles sempre visíveis*: descartado na clarificação com o
  usuário (23/09) — cobriria a imagem o filme inteiro.

---

## R0-7 — Onde mora a camada de reprodução compartilhada

**Decisão**: `tv-web/src/components/PlayerLayer.tsx`, junto de `Toast.tsx` e
`ConfirmDialog.tsx`. O `PlayerOverlay.tsx` de `features/live/` é **movido**
para lá e generalizado, não duplicado.

**Justificativa**: o componente passa a ser consumido por duas features
(`live` e `movies`). O item 49 do backlog propõe a fronteira "`features/` não
importa de outro `features/`, usa `lib/`" — e `lib/` não hospeda componentes
de UI pela mesma proposta. `src/components/` já é, de fato, o lugar de UI
compartilhada entre telas neste repositório (`ConfirmDialog` é usado por
`HomeScreen`). Seguir o que já existe evita inventar uma pasta nova e evita a
importação cruzada entre features.

**Alternativas consideradas**:

- *Duplicar um `MoviePlayerOverlay` em `features/movies/`*: descartado. Dois
  componentes com a mesma máquina de estados divergem — e o cuidado com o
  plano de hardware (`video-plane-visible`), que custou um bug na TV física
  (`sdd/bugs/live-tv-toca-audio-sem-imagem`), passaria a existir em dois
  lugares.
- *Deixar em `features/live/` e importar de `features/movies/`*: descartado
  por criar exatamente a dependência cruzada que o item 49 quer proibir, e por
  deixar o nome mentindo sobre o escopo.
