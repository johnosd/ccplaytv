# Prova de plataforma 069 — em execução

Sonda opt-in em tv-web/src/lib/portal/platformProbe.ts, ativada somente por VITE_CCPLAY_PLATFORM_PROBE=1. Build normal elimina sua chamada. Relatório só contém resultados/tempos; DUID bruto/digest não são exportados. Digest local ocupa namespace isolado, sem tocar catálogo. Coletor aceita schema allowlist e IP esperado, sem logs de corpo/erros.

SDB observou a TV QN50Q60DAGXZD conectada e platform_version 9.0; isso não comprova que a sonda rodou. Usar tizen-tv somente após E2E. Declarar cada cenário separadamente.

| Cenário | Estado |
| --- | --- |
| ES256/AES e tamper em Node | 3/3 testes Node aprovados (inclui restrição do coletor); não é prova de TV |
| DUID/ES256/AES file:// na TV | Aprovado por sonda real via SDB/CDP: DUID estável, ES256 assinatura 64 bytes/tamper e AES-GCM/AAD tamper aprovados |
| Persistência/reabertura no aparelho | Aprovado: usuário confirmou dados preservados após reabertura; sonda confirmou persistência e estabilidade DUID entre execuções |
| Suspend/retorno/relógio no aparelho | Medido: retorno/dados confirmados; contexto JS preservado, wall/monotonic +33.468 ms, zero visibilitychange |
| Reinstalação em laboratório | Pendente: usuário só dispõe da TV atual; proibido apagar dados/desinstalar para este teste |

Relógio offline sem atestação não prova tempo civil durante desligamento/adulteração. Implementação deverá usar high-watermark/monotonic/serverTime e caracterizar limitações em T035 antes de cobrar. Esta evidência não promete DRM inviolável nem recovery por DUID isolado.

## Instalação de diagnóstico — 2026-10-11

Atualização assinada com perfil existente concluída e lançamento confirmado pelo CLI/SDB (debug 0). Não houve desinstalação. Usuário foi consultado para confirmar abertura e preservação dos dados; resposta pendente. Coletor LAN ativo, mas nenhum relatório físico recebido até este checkpoint; identidade/crypto/persistência continuam não comprovados no aparelho.

A primeira tentativa de empacotamento foi interrompida porque o sandbox impediu log do CLI em C:/tizen-studio-data. Repetição com execução ampliada autorizada concluiu instalação normalmente.

Confirmação do usuário (2026-10-11): app abriu após atualização e listas/favoritos continuam presentes. Aceite visual e preservação de dados confirmados pelo usuário; não equivalem à prova de identidade/crypto/tempo.

Diagnóstico do coletor: nenhuma observação recebida. Reiniciado fora do isolamento de rede; regra existente de entrada Node permite o executável instalado em perfis Private/Public. Nenhuma regra de firewall alterada. Pacote instalado contém o endpoint público de diagnóstico esperado. Coletor passou `node --check` e passou a registrar apenas estágio de recusa/preflight, sem corpo, identificadores ou valores de headers. Reabertura pelo usuário solicitada para nova tentativa e persistência.

Usuário confirmou em 2026-10-11: fechou pela opção de sair, reabriu e listas/favoritos continuam presentes. Persistência visual dos dados locais após reabertura aprovada pelo usuário. Isso não comprova estabilidade DUID ou crypto, pois relatório da sonda ainda ausente.

## Relatório físico via SDB/CDP — 2026-10-11

Coleta direta pelo inspetor da TV (debug 1 / porta encaminhada em localhost), somente window.__ccplayPlatformProbe. Relatório em platform-probe-observations.jsonl: protocolo file:, DUID/stability/persistence PASS, ES256/assinatura de 64 bytes/tamper PASS, AES-GCM/AAD tamper PASS, observedWallRollback=false. Nenhum DUID/digest/catálogo foi lido ou exportado. Coleta HTTP continua sem entrega; transporte de diagnóstico substituído por SDB/CDP, sem modificar firewall.

Comando de depuração conferido no código oficial Samsung Wits: https://raw.githubusercontent.com/Samsung/Wits/master/lib/appLaunchHelper.js (launchDebugMode). Playwright connectOverCDP não é compatível com Browser.setDownloadBehavior desse alvo; coleta feita diretamente com Runtime.evaluate usando transporte WebSocket já instalado.

Baseline de lifecycle registrado em memória da sonda; standby/retorno ainda pendente. Não houve alteração do relógio da TV.

Ao encerrar o coletor, sua saída confirmou uma recusa por origem. Isso explica a ausência de entrega HTTP dessa tentativa; o valor do header não foi coletado. Allowlist não foi relaxada. Medições válidas vieram pelo canal SDB/CDP. Coletor encerrado.

## Standby/retorno — T003 concluída

Usuário confirmou standby de cerca de 15 s, retorno ao app e dados preservados. Entre baseline e primeira coleta: wallDeltaMs=33468, monotonicDeltaMs=33468; mesmo contexto JS, visibilityState=visible e zero visibilitychange. O intervalo inclui interação/coleta, não mede a duração exata do standby.

**Limitação para T009/T035:** esse standby não produziu evento de visibilidade nem interrompeu relógio monotônico; não usar visibilitychange como prova de suspensão/retorno. Usar deadlines absolutos e reconciliação de tempo. Desligamento completo, adulteração de relógio, reinstalação e resistência a fraude não comprovados; caracterizar high-watermark/monotonic/serverTime antes de cobrar. Reinstalação de laboratório indisponível, não executada; TV atual preservada. T003 prova capacidades e caracteriza limites, não valida fluxo comercial ainda inexistente.

Encerramento: build normal sem endpoint/ativação da sonda verificado, sincronizado e instalado com mesmo certificado; CLI confirmou lançamento debug 0. Nenhuma desinstalação. Coletor encerrado e socket CDP fechado. Comando de remoção do forward informou listener inexistente; verificar porta local na retomada.

Porta localhost:9229 deixou de responder após instalação normal; encaminhamento de diagnóstico encerrado.
