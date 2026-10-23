# Bug Assessment: "Sincronizar agora" do EPG fica "Sincronizando" sem terminar na lista real da TV

- **Slug**: sincronizar-agora-epg-fica-sincronizando-sem
- **Criado**: 2026-10-20
- **Origem**: medição da 082 no app real (texto do usuário, 2026-10-20); entrada `[Bug]` do backlog
- **Veredito**: likely valid, needs reproduction
- **Severidade**: medium

## Report

Na TV física, com a lista real ativa: Ajustes → EPG → **Sincronizar agora** deixa o botão em "Sincronizando" sem terminar. Em ~25
minutos o canal de métricas (build de medição) não recebeu a linha `epg` que `requestEpgSync` emite ao resolver. O usuário disse que
"antes demorava também", ou seja, não é regressão da 085. O resto do app seguiu funcionando (linhas `frames` a cada 5 s).

## Symptom

A sincronização do guia não termina (ou demora além de qualquer limite razoável) e a interface não mostra falha nem permite
cancelar. Esperado: terminar em segundos (a 082 mediu 1,07 s no Worker para 10 122 programas) ou falhar com uma causa.

## Reproduction

1. Lista real (provedor Xtream com `xmltv.php`), TV de referência QN50Q60DAGXZD, app instalado.
2. Ajustes → EPG da lista ativa → Sincronizar agora.
3. Esperar: o estado fica "Sincronizando" por mais de 10 minutos. (Reproduzido uma vez na TV; **não** reproduz no PC.)

## O que foi medido no PC (mesma lista, mesmo código)

- Download do `xmltv.php` do painel: 1º byte em 0,37 s, total 1,75 s, 15,07 MB (gzip), status 200. O provedor **não** é lento.
- `syncEpg` real contra um banco novo, com o corpo já baixado: **0,38 s**, 11 467 programas gravados (parse puro 0,2 s).
- O `CCPLAY_PROBE_EPG` do `.env` devolve 404 (endereço antigo; o app usa o endereço da própria lista, não esse).
  Isso falharia rápido (`network`), nunca ficaria "Sincronizando".

Logo, o tempo não está no provedor nem no processamento do PC. A TV é ~4× mais lenta em CPU, o que daria segundos, não minutos.

## Suspected Code Paths

- `tv-web/src/lib/epg/epgRunner.ts:39` `runInWorker`: a promessa só resolve em `onmessage` ou `onerror`. Um Worker **encerrado pela TV**
  (pressão de memória) ou travado não dispara nenhum dos dois, e `inFlight` nunca é limpo: o botão fica "Sincronizando" para sempre.
- `tv-web/src/lib/epg/epgSync.ts:76` `doFetch(...)` sem `signal`/limite de tempo: se o servidor ou a rede da TV pararem no meio do
  download (corpo que nunca fecha), `for await` nunca termina.
- `tv-web/src/lib/epg/epgSync.ts:88-90` `guideStoredBytes` + `makeRoomFor` + `writeEpgPrograms`: rodam no app real, cujo banco é muito
  maior que o do PC. A 085 mediu `makeRoomFor` em ~1,8 s por chamada no app real, mas isso é finito.
- `tv-web/src/lib/epg/epgRepository.ts:81-101` `writeEpgPrograms` acumula **todos** os programas em um `Map` na memória antes de gravar
  (11 mil na janela; 41 mil no XML). Na memória do Worker da TV isso pode ser relevante.

## Root Cause Hypothesis

Confiança **baixa**. A hipótese mais forte é estrutural, não de algoritmo: não há nenhum limite de tempo nem vigia no Worker do EPG, então
qualquer parada (download que não fecha, Worker encerrado, gravação bloqueada) vira "Sincronizando" eterno. O que **trava** de fato na TV não
está identificado, porque o PC não reproduz e a TV não entrega console. Para achar a etapa, falta instrumento: o Worker não reporta onde está.

## Proposed Remediation

**Preferida (duas partes, nesta ordem):**
1. **Vigia e limite**: em `runInWorker`, um limite de tempo total (ex.: 120 s) que encerra o Worker e resolve `{ outcome: 'failed',
   errorKind: 'network' }` (ou um novo `timeout` rotulado, se o tipo permitir); `doFetch` com `AbortSignal.timeout` para o download. O
   estado nunca mais fica preso, e a pessoa vê "falhou, tentar novamente".
2. **Fases no canal de métricas**: o Worker posta mensagens `progress` (`fetch`, `parsed`, `room`, `written`, só rótulos fixos) e a thread da
   interface emite `epg` com `phase` + `ms` a cada uma, só no build de medição. Reinstalar a medição mostra **qual etapa** parou.

**Alternativas**:
- Só a parte 1: resolve o "preso", mas esconde a causa (o guia nunca sincroniza na lista real, só falha mais cedo).
- Gravar por canal sem o `Map` completo (menos memória): só vale se a fase 2 mostrar que a falha é de memória.

**Files likely to change**:
- `tv-web/src/lib/epg/epgRunner.ts`, `tv-web/src/lib/epg/epgWorker.ts`, `tv-web/src/lib/epg/epgSync.ts`
- `tv-web/src/lib/perf/metricsChannel.ts` (rótulos de fase, se necessário)

**Tests to add or update**:
- `epgRunner.test.ts`: um Worker falso que nunca responde faz o pedido resolver como `failed` ao passar do limite (relógio falso), e `isEpgSyncing`
  volta a `false`.
- `epgSync.extra.test.ts`: um `fetch` cujo corpo nunca fecha é abortado pelo limite e vira falha, sem gravar nada.

## Risks & Considerations

- O limite não pode cortar um guia legítimo e grande numa TV lenta: usar um teto largo (≥ 2 min) e medir antes de afinar.
- A mensagem de falha não pode ecoar endereço (ADR-010): só o rótulo de categoria.
- Fora do escopo da 085/082: não toca em orçamento, catálogo nem em licença.
- A reprodução só existe na TV; o veredito final do fix depende de uma passada com o build de medição (autorização por instalação).

## Open Questions

- [NEEDS CLARIFICATION: a lista usa o endereço padrão do painel ou um EPG separado configurado na tela de EPG? Isso define a URL que a TV baixa.]
- [NEEDS CLARIFICATION: quanto tempo "demorava antes" — segundos, minutos ou também nunca terminava?]
