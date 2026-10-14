# Algoritmo de medição e ciclo de vida

## Interface e limites

`runSpeedTest(options): Promise<SpeedTestOutcome>` tem assinatura executável no stub. `signal` é obrigatório; `fetchImpl`, `monotonicNow`, `wallClockNow` e `onProgress` permitem provas determinísticas. Produção usa `fetch`, `performance.now()` e `Date.now()`. Não aceita URL, credencial, fonte, chave, orçamento ampliável ou catálogo.

Limites fixos: **30.000 ms** e **100.000.000 bytes**. Iniciar relógio/timer antes da primeira requisição. Reservar tamanho do corpo antes de cada fetch e não devolver reserva após aborto/falha: uma resposta parcialmente recebida não libera orçamento para tráfego adicional. Todos os corpos, inclusive aquecimento/sondas, contam; headers ficam fora.

Requisições sequenciais para o destino fixo, GET com `credentials: 'omit'`, `cache: 'no-store'`, sem body/headers privados. Não seguir redirecionamentos para outro destino (`redirect: 'error'`). Conferir `Content-Length` quando disponível e tamanho recebido. O endpoint precisa respeitar `bytes`: resposta incompatível encerra com erro, sem esconder excedentes no contador. Essa dependência de protocolo deve ser comprovada na TV; o limite não promete contar overhead de protocolo ou retransmissões.

```text
se signal já abortado: cancelled (zero rede)
se execução global ocupada: failed/busy (zero rede)
adquirir execução global; instalar abort externo e deadline
tentar aquecimento, sondas e download, verificando prazo/orçamento a cada início
ao terminar/limitar/falhar: abortar transferências; aguardar limpeza
montar outcome apenas de amostras válidas; liberar execução global em finally
```

Deadline aborta a requisição e leitura do corpo pendentes. Verificar relógio entre requisições além do timer. A duração registrada é a observada; atraso do event loop não deve ser disfarçado como exatamente 30 segundos. TV precisa demonstrar responsividade compatível com o teto.

Cancelar/sair/ocultar/suspender: `cancelled`, sem resultado persistível. Tempo/bytes: parcial se houver métrica válida, senão `failed/insufficient_samples`. Falha de transporte após métricas: parcial com `measurement_error`; sem métricas: código sanitizado. Nenhuma requisição de analytics/reporte no encerramento.

## Latência e jitter HTTP

1. Aquecimento GET de 1 byte, excluído das métricas mas incluído nos orçamentos.
2. Até oito GETs de 1 byte. Medir do instante anterior ao fetch até consumir todo o corpo, com relógio monotônico. Inclui efeitos HTTP/TLS/navegador/servidor; não rotular ping ICMP.
3. Aceitar apenas corpo correto, resposta bem-sucedida e duração finita positiva.
4. Com **pelo menos cinco** amostras válidas, latência é mediana em ms; quantidade par usa média dos dois valores centrais.
5. Com o mesmo mínimo, jitter é média de `abs(t[i] - t[i-1])` entre amostras consecutivas válidas na **ordem de medição**, em ms. Não ordenar para calcular jitter. Zero real é válido.
6. Abaixo desse mínimo, latência/jitter são `null`.

## Download

Solicitar 1 MB, 5 MB, 20 MB, depois blocos de até 20 MB limitados ao orçamento restante. MB é decimal. Ler `Response.body` por reader; contar e descartar blocos sem montar array/buffer integral. Sem suporte a stream: `stream_unsupported`.

Somar bytes e duração de solicitações **concluídas**, bem-sucedidas e de tamanho esperado. Resposta interrompida só entra no tráfego recebido/reservado; não entra no cálculo de velocidade.

Métrica válida com ao menos **1.000.000 bytes concluídos** e **200 ms** de duração agregada. Fórmula: `Mbps = 8 * completedBytes / (sumDurationMs * 1000)`. Não fazer média simples das velocidades de corpos diferentes.

Amostra normal termina com ao menos **três solicitações válidas** e **3.000 ms agregados** de download; senão continua até primeiro teto. O mínimo de exibição não altera esse critério normal. `complete` depende das três métricas, independentemente de motivo de encerramento.

## Limpeza, corridas e integração

Em `finally`, abortar controller interno, cancelar/liberar reader, remover listeners/timer e aguardar término do transporte antes de liberar mutex. Não publicar progresso depois de resolver outcome. Um transporte cooperativo precisa honrar `signal`; browser/Tizen é validado no gate físico.

`useSpeedTest` verifica hold real de mídia no gate existente antes de iniciar, e cancela se ele surgir durante a medição. Não adquirir hold de mídia fictício nem alterar scheduler. Checar offline/visibilidade; escutar `visibilitychange`, saída/desmontagem e ciclo de suspensão usado pelo app. A UI permanece responsiva enquanto aguarda aborto. Fechar dialog pelo mouse, SELECT/Cancelar ou RETURN passa pelo mesmo caminho. Não há auto-reinício.

Ao fechar, invalidar id para callbacks e gravações futuras. Só guardar outcome persistível do id ainda ativo. Definir o começo da persistência como compromisso do resultado concluído: se fechamento vencer antes, não guardar; uma gravação já concluída pertence à medição concluída, não a uma tentativa cancelada. Serializar compromissos para impedir que uma escrita antiga termine depois da nova. Repetir exige execução/limpeza anteriores encerradas.

Usar `Modal` para capturar RETURN/SELECT sem propagar à tela inferior. A aba mantém foco por id do card `speedtest` e conserva scroll; `SettingsFocus` recebe `service?: 'speedtest'` no ramo `panel`, compatível com consumidores existentes. A entrada pelo dock foca card/aba, sem abrir/iniciar automaticamente. O dialog tem Iniciar/Fechar, Cancelar na execução, Repetir/Fechar após resultado/erro, Fechar no bloqueio por mídia; uma ação é sempre inicial/focada.

## Erros e feedback

Códigos fechados no tipo público: `busy`, `playback_active`, `offline`, `rate_limited`, `destination_unavailable`, `stream_unsupported`, `insufficient_samples`, `storage_unavailable`. HTTP 429 vira `rate_limited`; desconhecido vira `destination_unavailable`. Nunca renderizar/logar `error.message`, URLs, headers ou corpos.

Progresso por etapa real (`warmup`, `latency`, `download`, `stopping`), tempo e bytes contados; indicação indeterminada, sem percentual. Resultado antigo identificado como Último teste, com data; sem nota, recomendação de resolução ou garantia IPTV.
