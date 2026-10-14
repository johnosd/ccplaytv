

### TV e T043/T052 — 2026-10-12

TV atualizada via deploy-tv.ps1 com mesmo perfil, instalação e lançamento confirmados; veredito visual pendente do usuário. Sem desinstalação.

Medições preliminares: 100 health HTTP200, p50=302.28ms/p95=312.54ms; 100 jobs sem autenticação HTTP403, p50=300.39ms/p95=399.83ms. Isto mede somente superfície HTTP, não alterações/ativações exigidas por T043.

T052: Scheduler atualizado para URL canônico regional; journal bucket regional criado com lifecycle30dias; papel custom create/get/list aplicado; env do journal adicionada; público revisão00004-tnk/jobs00002-7lq. Tick real retornou500 após resolver configuração do journal; índice composto jobs(kind,nextDueAt) criado e ainda CREATING. Repetir tick após índice READY.

### Medição sintética T043 — 2026-10-12

Foi criado `infra/portal/measure-staging.ps1` para criar um dispositivo sintético, criar uma configuração `m3u_url` e executar alterações `source.update` com ACK `applied` pela API de dispositivo, calculando p50/p95 sem registrar tokens ou URLs privadas. A primeira tentativa confirmou o limite de mutações do formulário (30/min por sessão); o script foi ajustado para aguardar 2,2 s entre amostras. A execução seguinte foi interrompida antes da medição porque o limite de enrollment por IP (20/h) já estava consumido pelas rodadas de smoke. Portanto, nenhuma amostra foi contada como resultado de T043 e não há aceite de latência/carga nesta etapa. Reexecutar após a janela do limitador, preferencialmente reutilizando uma sessão sintética autorizada.

### T043 — nova tentativa bloqueada antes da primeira amostra — 2026-10-12

`infra/portal/measure-staging.ps1 -Samples 100` foi executado novamente. O primeiro enrollment respondeu `code=rate_limited` e a medição terminou antes de iniciar qualquer amostra. Não há p50/p95, ativações ou custo inferidos; T043 permanece pendente até liberar uma janela controlada do limitador ou usar uma identidade de teste autorizada.

### T043 — alterações com ACK da TV simulada — 2026-10-13

**Decisão do usuário (2026-10-13):** 20 amostras bastam; o piso de ≥100 de T043/quickstart fica reduzido para 20 nesta medição (R-018 em `plan.md`). Com 20 amostras o p95 é o 19º valor ordenado — evidência de ordem de grandeza, não estatística robusta.

**Diagnóstico corrigido.** Em 2026-10-13 uma execução parou em `GET /portal/v1/device/operations` com `429 Retry-After: 8`, não no enrollment: o servidor limita o pull da TV a 1 por 10 s por dispositivo (`routes/operations.py`, `RateConstraint(..., 1, 10)`), e o script antigo consultava a cada 100 ms. A atribuição da nota de 2026-10-12 ao limite de enrollment (20/h por IP) não foi reproduzida; uma sonda de enrollment no mesmo dia retornou 200. O script agora simula a TV real (pull a cada ≥10,2 s, fase de envio aleatória dentro da janela, respeita o limite) e imprime rota/status/`Retry-After` em falha, sem corpo nem cabeçalhos de autenticação.

**Resultado** (`infra/portal/measure-staging.ps1 -Samples 20`, staging `ccplaytv-511322`, dispositivo e fonte M3U sintéticos `source.update` → pull → ACK `applied`):

| Amostras | Sucesso | p50 | p95 | mín | máx | ≤30 s |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 20 | 6.633 ms | 9.423 ms | 1.567 ms | 10.031 ms | 100% (0 acima) |

Nenhuma amostra descartada; `secretsPrinted=false`. A latência é dominada pelo intervalo de polling de 10 s da tela rápida (máx ≈ 1 intervalo); a meta SC-003 (≥95% em 30 s) é atendida para alterações com TV na tela rápida, importação medida à parte. Limites desta medição: uma TV simulada, rede do operador, sem amostra fria deliberada (instância provavelmente quente), sem 10–50 TVs nem margem de 100. **Não cobre** ativações de licença (SC-006) nem custo; T043 permanece aberta por isso.

### T043 — ativação de teste (trial), em andamento — 2026-10-13

Escolha do usuário: medir a **ativação de teste** (enroll → `POST /device/trial` → `GET /device/entitlement`) em dispositivos sintéticos, com 15 dispositivos (piso reduzido por decisão do usuário; R-018). Isto **não** é ativação paga: SC-006 pago segue sem medição automatizada (checkout desligado; compra sandbox só manual). Script: `infra/portal/measure-activation.ps1` (sem segredo, lê só `state`/`deviceId` do JWS, não valida a assinatura no cliente).

- 1ª e 2ª execuções (20 dispositivos) não geraram resultado: a 1ª falhou por defeito do script (`GET` com `-Body` vazio, status 0 = erro do cliente), corrigido; a 2ª foi interrompida a pedido do usuário após ~20 min aguardando a janela do limitador de enrollment (20/h por IP, 100/h global) e, como só imprimia ao final, perdeu os resultados parciais. O script agora emite uma linha de progresso por dispositivo e espera 30 s entre sondas quando a rota não devolve `Retry-After`.
- 3ª execução (15 dispositivos, iniciada 10:55 UTC) concluída em 8,5 min, dos quais 8,2 min aguardando a janela do limitador de enrollment; os 15 dispositivos foram cadastrados em sequência depois disso.

**Resultado** (`measure-activation.ps1 -Devices 15`, staging, dispositivos sintéticos, trial de 7 dias; **não é ativação paga**):

| Dispositivos | Estado observado | Trial p50/p95 | Entitlement p50/p95 | Total p50/p95/máx | ≤60 s |
| --- | --- | --- | --- | --- | --- |
| 15 | `trial` ×15 | 359 / 563 ms | 334 / 485 ms | 675 / 1.048 / 1.048 ms | 100% |

Cada dispositivo teve `deviceId` do JWS igual ao do enrollment. A assinatura ES256 **não** foi verificada pelo script (essa verificação é do cliente TV, coberta pelos testes de `verifyEntitlement` e pela sonda T003). Limites: 15 amostras (piso reduzido, R-018), uma origem de rede, sem amostra fria deliberada, sem fluxo de pagamento — SC-006 pago (compra → TV em ≤60 s) **continua sem medição automatizada** e depende de compra sandbox manual com checkout ligado. T043 segue aberta por isso, por carga de 10–50 TVs e por custo.
