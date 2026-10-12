

### TV e T043/T052 — 2026-10-12

TV atualizada via deploy-tv.ps1 com mesmo perfil, instalação e lançamento confirmados; veredito visual pendente do usuário. Sem desinstalação.

Medições preliminares: 100 health HTTP200, p50=302.28ms/p95=312.54ms; 100 jobs sem autenticação HTTP403, p50=300.39ms/p95=399.83ms. Isto mede somente superfície HTTP, não alterações/ativações exigidas por T043.

T052: Scheduler atualizado para URL canônico regional; journal bucket regional criado com lifecycle30dias; papel custom create/get/list aplicado; env do journal adicionada; público revisão00004-tnk/jobs00002-7lq. Tick real retornou500 após resolver configuração do journal; índice composto jobs(kind,nextDueAt) criado e ainda CREATING. Repetir tick após índice READY.

### Medição sintética T043 — 2026-10-12

Foi criado `infra/portal/measure-staging.ps1` para criar um dispositivo sintético, criar uma configuração `m3u_url` e executar alterações `source.update` com ACK `applied` pela API de dispositivo, calculando p50/p95 sem registrar tokens ou URLs privadas. A primeira tentativa confirmou o limite de mutações do formulário (30/min por sessão); o script foi ajustado para aguardar 2,2 s entre amostras. A execução seguinte foi interrompida antes da medição porque o limite de enrollment por IP (20/h) já estava consumido pelas rodadas de smoke. Portanto, nenhuma amostra foi contada como resultado de T043 e não há aceite de latência/carga nesta etapa. Reexecutar após a janela do limitador, preferencialmente reutilizando uma sessão sintética autorizada.

### T043 — nova tentativa bloqueada antes da primeira amostra — 2026-10-12

`infra/portal/measure-staging.ps1 -Samples 100` foi executado novamente. O primeiro enrollment respondeu `code=rate_limited` e a medição terminou antes de iniciar qualquer amostra. Não há p50/p95, ativações ou custo inferidos; T043 permanece pendente até liberar uma janela controlada do limitador ou usar uma identidade de teste autorizada.
