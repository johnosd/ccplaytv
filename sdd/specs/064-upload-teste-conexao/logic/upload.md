# Etapa de upload e composição do teste (US1)

Implementação: `tv-web/src/lib/network/connectionTest.ts` (`runConnectionTest`). Contrato: `connectionTest.upload-teste-conexao.contract.test.ts` (U1–U4). Persistência: `data-model.md`.

## 1. Composição

`runConnectionTest(options)` tem a **mesma assinatura** de `runSpeedTest` (`SpeedTestOptions` → `SpeedTestOutcome`), então `useSpeedTest` só troca a função padrão.

```text
se signal já abortado: cancelled (zero rede)
se há um teste em andamento (flag próprio do módulo): failed/busy (zero rede)
travar a flag; startedAt = relógio monotônico
primeira = runSpeedTest({ ...options, limits: { maxBytes: 75_000_000, maxMs: 30_000 } })
se primeira não é "completed" (cancelled ou failed): devolve primeira, SEM tentar upload
se signal abortou entre as etapas: cancelled
up = etapa de upload
se up foi cancelada: cancelled
resultado = { ...primeira.result, + campos de upload, status, reason, durationMs }
finally: soltar a flag
```

A flag do módulo existe porque entre as duas etapas o `running` do `runSpeedTest` fica livre por um instante: sem ela, um SELECT repetido nesse intervalo abriria um segundo teste.

## 2. Limites

| | Teste inteiro | Download (+ latência) | Upload |
| --- | --- | --- | --- |
| Bytes de carga útil | 150 000 000 | 75 000 000 | 75 000 000 |
| Tempo | 60 000 ms | 30 000 ms | 30 000 ms |

O teto do teste inteiro **é a soma dos tetos das etapas**, então nenhum relógio extra é necessário: 30 s + 30 s. `PHASE_MAX_*` e `CONNECTION_TEST_MAX_*` já estão no stub. Os 62 `SPEED_TEST_MAX_*` seguem como padrão de `runSpeedTest` quando chamado sozinho (o app não o chama sozinho).

`runSpeedTest` honra `limits` trocando as constantes por `options.limits?.maxBytes ?? SPEED_TEST_MAX_BYTES` (idem tempo) em 5 pontos; sem `limits`, o comportamento é idêntico ao da 062 (C1–C3 provam).

## 3. Etapa de upload

```text
controller interno; abort externo = cancelled; timer de PHASE_MAX_MS = time_limit
payload = Uint8Array(20_000_000), preenchido uma vez (research R-004)
tamanhos: 1 MB, 5 MB, 20 MB, depois blocos de 20 MB limitados ao que resta do orçamento
laço:
  se signal abortado: parar como cancelled
  se tempo da etapa >= 30 s: parar como time_limit
  se orçamento restante == 0: reason = byte_limit; parar
  bytes = min(próximo tamanho, restante)
  requested += bytes                              // reservar ANTES; nunca devolver
  t0 = agora
  fetch(UPLOAD_DESTINATION, { method: 'POST', body: payload.subarray(0, bytes),
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal })
  resposta não-ok: erro de medição (para a etapa; o que já foi medido fica)
  cancelar o corpo da resposta (vazio)
  duração = agora - t0
  sent += bytes
  se duração é finita e > 0: okBytes += bytes; okMs += duração; samples += 1
  se requested == orçamento: reason = byte_limit; parar
  se samples >= 3 e okMs >= 3000: parar            // fim normal
catch (não-abort): reason = measurement_error; se parou por time_limit, reason = time_limit
finally: limpar timer e listener; abortar o controller
upload_mbps = okBytes >= 1_000_000 e okMs >= 200 ? 8 * okBytes / (okMs * 1000) : null
```

- Corpo **sempre** `Uint8Array`; **nenhum header** (requisição simples, sem preflight); sem query na URL.
- Uma resposta que falhou ou foi abortada **não** entra no cálculo de velocidade, mas continua contando em `requested` (mesma regra do download na 062).
- Uma falha do upload nunca vira `failed`: a etapa devolve o que mediu e `uploadMbps: null`. `failed` só existe quando a **primeira** etapa não mediu nada (rede fora), e então nem se tenta o upload.

## 4. Montagem do resultado

```text
upload completo = upload_mbps != null
status  = complete se download, latência, jitter e upload_mbps são válidos; senão partial
reason  = primeira.reason se != completed; senão a reason do upload
durationMs = agora - startedAt   (as duas etapas)
campos novos: uploadMbps, uploadSamples = samples, uploadRequestedBytes = requested, uploadSentBytes = sent
measuredAt = relógio civil no fim, como a 062
```

Nunca entra URL, mensagem de erro ou cabeçalho no resultado: só o nome do código de `reason`.

## 5. Progresso

`SpeedTestProgress` ganha a etapa `'upload'` e o campo opcional `sentBytes`. Durante o upload: `stage: 'upload'`, `elapsedMs` desde o início do teste inteiro, `requestedBytes`/`receivedBytes` da etapa de download (congelados) e `sentBytes` com os bytes já confirmados. **Nunca se publica progresso depois de resolver o resultado** (U4 confere).

O diálogo mostra "Medindo upload…" (`settings.speed.uploadStage`) e `{seconds} s · {mb} MB enviados` (`settings.speed.trafficUp`) durante a etapa. Sem percentual (062 FR-014).

## 6. Ciclo de vida e UI

- `useSpeedTest` só troca `runSpeedTest` por `runConnectionTest` como padrão. Hold de mídia, visibilidade, saída, `cancel()` e a serialização da gravação **não mudam**: já valem para o teste inteiro porque passam pelo `signal`.
- `SpeedTestMetrics` (componente novo em `features/settings/`) mostra as quatro métricas e é usado pelo diálogo e pelo card. Foco e navegação não mudam: o componente não é focável.
- A grade `.speed-test-metrics` passa de 3 para 4 colunas; conferir no navegador que o rótulo "Latência HTTP" cabe no diálogo (largura de ~640 px) e, se não couber, usar 2×2 só no diálogo.
- A Home **não muda** (spec: o dock continua com o download).
