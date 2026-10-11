# Execução fase 2 — fundação

## T008

AES-GCM 256/nonce96bits/AAD vinculada, JWS ES256 raw64bytes/kid/issuer/audience/destino, keyring privado e rotação, JWKS público sem material privado. Testes de tamper/nonce/AAD/outro destino/algoritmo/rotação/má configuração aprovados.

`api/.venv/Scripts/python.exe -m pytest tests/portal/test_crypto.py tests/portal/test_bootstrap.py -q -o cache_dir=../.cache/pytest-portal`: **11/11 PASS**. Ruff nos arquivos de crypto/settings/test: PASS após ajuste de imports. Bootstrap de sanitização foi isolado de dist local (antes mascarava a rota de teste com StaticFiles e retornava404); repetição aprovou500 sanitizado. Nenhum contrato congelado editado.

Factory criptográfica exige chaves privadas explícitas; sem geração automática no servidor. Nenhuma chave real criada/lida. Validação comercial de claims/tempo é T032/T035. T008 concluída, T050 permanece aberta até testes de agente.

## T005/T010 — validação

`PORTAL_TEST_FIRESTORE=1` + `api/.venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`: **18/18 PASS**, incluindo 3 testes de integração reais com Firestore Emulator Standard/Native loopback/demo. Cadastro concorrente reserva uma identidade/um device; trial imutável, escritas exigem leitura anterior, leases compartilhados têm um vencedor e checkpoint do dono antigo é recusado. Emulator não prova IAM/produção.

Migração Dexie v22 somente aditiva, seis tabelas de controle via portalTables, sem alterar v21/PIN ou criar sourceFiles. `npm.cmd run test -- src/lib/portal/portalTables.test.ts src/lib/catalog/db.test.ts`: **11/11 PASS**, incluindo preservação fontes/favoritos/PIN e rollback conjunto/outbox após reabrir. A005 encerramento Vite continua aberto. TypeScript, lint/arquitetura e build/check-no-demux: PASS. E2E histórico/configurações/sonda: **3/3 PASS em 91s**. T046 ainda deve validar a migração integrada na TV; pacote restaurado no aparelho antecede v22.

## T023 concluída

Journal allowlist/source_deleted/access_revoked/license_revoked, objeto determinístico, GCS ifGenerationMatch=0, leitura apenas para conferir idempotência, retry/timeout limitados. MemoryJournal restrito a environment=test; não prova GCS/IAM real. Serviço de exclusão reserva tombstone/fence e intenção antes de I/O externo, expurga versões/cancela create-update em páginas limitadas, mantém delete sem expiry até ACK, job durável para retomada. Testes de falha/crash/concorrência aprovados; T023 concluída. Retomada do job pelo executor será integrada em T009. Índices preparados para consulta sourceId/action/state, a validar em homologação T052.


Validação estreita journal/exclusões: **5/5 PASS**. Repetição completa inicial: **21/23 PASS**, duas falhas intermitentes de contenção no cadastro/lease. SDK repete ABORTED de commit, mas não de leitura; repetição imediata também podia manter lockstep. Repositório passou a ordenar leituras e repetir a transação inteira até cinco vezes, jitter exponencial, prazo total de 30s e erro sanitizado ao esgotar; erros de negócio não são repetidos. Três regressões adicionais cobrem leitura/commit abortados e esgotamento/erro de negócio.

Comando: `PORTAL_TEST_FIRESTORE=1` + `api/.venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`: **26/26 PASS em 35,96s**. `api/.venv/Scripts/ruff.exe check app/portal tests/portal`: **PASS**. Mock GCS não comprova IAM/create-only/restore em produção; T039/T052 permanecem abertas. Nenhum teste congelado alterado.

## T006 em execução — núcleo de autenticação

Núcleo/rotas de convite, troca QR, login manual e logout implementados. Tokens aleatórios 256bits, hashes por finalidade/keyring, identidade antiga consultável durante rotação; sessões CAS/epoch global e por TV, cookie HttpOnly/SameSite/Origin/CSRF, validade lógica 30min/8h, convite5min/uso único, JSON64KiB. Rate limits Firestore compartilhados por par/IP/device/global e 30forms/min/sessão; Retry-After em 429. Jobs não monta rotas públicas. Nenhuma credencial permanente em URL; campos secretos ocultos em repr/erros.

`PORTAL_TEST_FIRESTORE=1` + `api/.venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`: **35/35 PASS em 40,03s**, incluindo concorrência QR, expiração exata, revalidação epoch/fence, nullOrigin/CSRF, limite entre duas instâncias, cooldown, janela lógica após TTL e transporte HTTP. Ruff PASS após corrigir variável não usada no teste HTTP.

T006/T049 continuam abertas: cadastro inicial, revoke/rotação e recuperação precisam T007/journal; retenção/expurgo precisam executor T009. Serviço não autentica sem chaves privadas/epoch explícitos. Secure de staging/produção precisa teste específico e homologação real; proxy/IP real será validado em T038/T052. Nenhum endpoint comercial liberado.

## T007 em execução — código e persistência local

Código privado: 16bytes aleatórios/128bits, 26símbolos Crockford Base32 + checksum10bits, formato de sete grupos de quatro. Checksum detecta erros de digitação, não autentica; HMAC SHA256 com chave distinta/versionada faz verificação. Servidor só conserva HMAC, nunca aceita digest como código. Rotação mantém keyring limitado a cinco versões.

TV: nonce256bits persistido antes de bootstrap, credenciais e pendência de ACK no mesmo commit Dexie, allowlist de emissão, monotonicidade/destino e ACK antigo recusados; bootstrap e device usam chaves discriminadas na tabela portalDevice, sem nova migração. DUID só lido para trânsito e nunca gravado. Fonte existente preservada no teste. Código local valida formato; checksum/verificador no servidor.

API completa: **39/39 PASS em 41,83s**, após allowlist de erros/invariante de rotação e testes do código. TV identity/tabelas: **5/5 PASS**; A005 aviso de encerramento Vite continua pendente em T041. TypeScript/lint/build em validação. Job delete passou a carregar deviceId explícito para que T009 retome sem busca ambígua; regressão estreita sendo repetida.

T007 permanece aberta: protocolo completo desafio/confirm/journal/rotação/resultado5min/ACK/retomada24h e integração do cadastro ainda não implementados. T006/T049/T050 igualmente abertas. Nenhum segredo real lido/gerado, venda desligada.

Atualização de checks: API **40/40 PASS em 39,56s** e Ruff **PASS**, incluindo cookie Secure de produção (teste de transporte, não homologação). Regressão estreita após incluir deviceId no job: **10/10 PASS em 4,88s**. TV TypeScript/lint/arquitetura/build/check-no-demux **PASS**; lint só avisos existentes.

## T009 em execução — executor privado

Executor --once/tick privado implementado para delete_finalize: consulta indexada até cinco jobs, lease compartilhado240s, orçamento total180s, checkpoint/retry durável, finalização aguardada e nenhuma BackgroundTask/loop residente. Factories não usam journal fake automaticamente; apenas teste injeta MemoryJournal. Serviço público recusa tick mesmo com executor injetado; serviço privado depende de IAM/OIDC Cloud Run ainda não ensaiado. Bootstrap privado agora retorna503 sem journal configurado, em vez de404 de rota ainda inexistente; teste não congelado atualizado para refletir nova implementação. Clientes Firestore fechados no shutdown.

Testes de lote/lease/retomada e regressão completa em execução. T009 continua aberta: agente TV, lifecycle/24h/10s/retries/outbox e handlers de retenção/access ainda pendentes.

## T006/T007 — cadastro e rotação em execução

Vínculo inicial CAS implementado: identidade em HMAC, nonce privado256bits, replay da mesma emissão5min, credenciais/código só em envelope AES, ACK autenticado expurga envelope. DUID existente com nonce diferente exige recuperação, não devolve credenciais/trial. Emissão revalida bearer corrente antes de entregar. API **47/47 PASS em 44,93s** (inclui 4 testes cadastro e 3 executor).

AccessRotation implementada no núcleo: fence antes de journal, CAS da epoch/código/bearer/key e índice consumido, trial/generation preservados, resultado cifrado/prova exclusivaTV, ACK elimina envelope; executor privado retoma access_finalize. Testes iniciais do núcleo/cadastro/hashes **11/11 PASS em 2,93s**; suíte completa **49/49 PASS em 42,19s** e Ruff PASS antes da extensão da retomada.

Retomada de emissão expirada com prova privada da mesma operação agora prepara novo nonce/código/chaves e floor de epoch/versão maior; journal por operação+rodada e janela24h ancorada, sem criar concessão. Nova rodada não estende a janela. Testes concorrentes/expiração em validação. Rotas públicas revoke/result ainda não montadas; não declarar recovery entregue. Recuperação web por código+desafio, reenlace após perder claim e limpeza física de envelopes/verificadores ainda pendentes.

TV persiste prova privada de rotação antes da rede; ACK pendente inclui authEpoch, para ACK atrasado da mesma operação não apagar rodada mais recente. Seis testes identity/tabelas e regressões TypeScript/lint/build em validação. T006/T007/T009/T049/T050 permanecem abertas.

## Checkpoint T006 concluída

Rotas de cadastro/revoke/rotate/result/ACK integradas e testadas; corpo de confirmação explícita, provas distintas TVbearer versus claimSecret, código novo só à TV vinculada. Retomada privada da mesma emissão expirada aprovada em concorrência (2/2), sem estender24h; recuperação via novo desafio/código ainda é T007.

API completa: **50/50 PASS em 46,71s**, Ruff **PASS**. Guarda de restore adicional impede mudar recoveryEpoch e preservar hashes antigos sem fence/rotação; `pytest tests/portal/test_control_repository.py tests/portal/test_auth_tokens.py -q`: **8/8 PASS em 4,66s**, Ruff **PASS**.

TV: `npm.cmd run test -- src/lib/portal/deviceIdentity.test.ts src/lib/portal/portalTables.test.ts` **6/6 PASS**; `npm.cmd run build` (tsc/Vite/check-no-demux) e `npm.cmd run lint` **PASS**, avisos herdados. A005 permanece em T041. Cinco contratos069 íntegros, `git diff --check` PASS. Progresso13/63; Fase2 ainda aberta.


## Checkpoint T007 — recuperação pelo site

`PORTAL_TEST_FIRESTORE=1 .venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal` (em api/): **59/59 PASS, 51,74 s**. Ruff app/portal tests/portal PASS após ordenar imports. Rodada estreita HTTP/recovery/rotação: 10/10 PASS, 9,99 s.

Desafio ligado à identidade existente e nonce privado; QR de uso único só abre sessão recover isolada (cookie/namespace HMAC/CSRF/Origin). Código/destino validados, fence antes de journal, resultado sem credenciais no browser; claimSecret exclusivo da TV entrega e ACK apaga envelope. Concorrência mesma confirmação idempotente, dois desafios um vencedor, código de outra TV recusado, código consumido só retoma operação original antes de24h, limites compartilhados entre instâncias. Falha de journal mantém fence; mudança global de epoch não reativa bearer antigo e recuperação preserva trial/generation.

`npx.cmd vitest run src/lib/portal/deviceIdentity.test.ts src/lib/portal/portalTables.test.ts`: **7/7 PASS, 14,81 s**; A005 de encerramento permanece. Prova persistida antes da rede/QR, rejeição de resposta velha/outra TV, credenciais atuais preservadas até commit da emissão. T007 concluída para núcleo/HTTP/persistência; tela de recuperação/E2E T024/T025 e expurgo físico T009 continuam pendentes. Não houve reinstalação ou mudança na TV física.


## Fundação T009/T049/T050 — checkpoint local

API: `.venv/Scripts/ruff.exe check app/portal tests/portal --fix` corrigiu ordem de imports; import FieldPath inicialmente apontava ao namespace não exportado do SDK e coleta falhou. Corrigido para firestore_v1.field_path. Reprodução completa com `PORTAL_TEST_FIRESTORE=1 .venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`: **63/63 PASS, 54,30 s**.

TV: `npx.cmd vitest run src/lib/portal/portalClient.test.ts src/lib/portal/portalAgent.test.ts src/lib/portal/usePortalAgent.test.tsx`: **9/9 PASS, 16,46 s**, seguido de `npx.cmd tsc -b` PASS. Rodada anterior transporte/agente7/7; `npm.cmd run build` PASS. Construtores inicialmente usaram parameter properties proibidas por erasableSyntaxOnly, corrigidos sem afrouxar compilador. A005 encerramento Vitest segue aberto em T041; resultado não é fechamento desse desvio.

Agente único por banco, prioridade delete→pull→snapshot, sucesso persiste24h, retries1/5/15min persistidos (máximo3), rápido imediato/10s e falha até60s com jitter, respeito Retry-After, mutex, abort background/offline e deadlines absolutos. Hook real cobre mounts compartilhados/reconnect/foco sem rede. Transporte exige HTTPS (loopback HTTP só opt-in), origem/rota fixas, sem query/redirect/cookies; timeout10s e resposta<=1MiB, erros allowlist sem URL/corpo remoto. Não integrado ao App atéT018.

Retenção: páginas20/cursor durável/lease compartilhado no tick privado, sem loop após resposta; expire create/update aos7dias libera referência uma única vez; corrente mesmo sem referência preservada, orphan removida, delete100dias permanece. Cipher pendente expurgado não é ressuscitado por journal tardio; código consumido sai após24h. Físico depende da cadência/backlog, validade lógica sempre no acesso. Floors/intents/digests preservados; compactação30dias com claims emT013/T022. Cloud/IAM/OIDC/índices/custo reais e integração no standby não comprovados por emulator.

Lint TV final PASS (arquitetura406arquivos, avisos existentes) e `git -c core.safecrlf=false diff --check` PASS. Script oficial confirma18/63 itens, incluindo checklist de fundação; cinco contratos069 íntegros.
