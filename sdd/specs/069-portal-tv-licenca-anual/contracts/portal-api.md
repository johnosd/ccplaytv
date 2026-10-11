# API HTTP — /portal/v1

Revisão 2026-10-11. JSON UTF-8, UTC ISO-8601, IDs opacos; erros allowlist `{code,retryable,operationId?}`, nunca body/input/exception/URL secreta. Pydantic estrito/sanitizado. Servidor não baixa IPTV, M3U, catálogo ou vídeo.

## Autorização e limites

TV: bearer exclusivo com deviceId/authEpoch, sem cookies; `Origin:null` somente rotas device e nunca como autorização. Browser: cookie HttpOnly/Secure/SameSite=Strict, CSRF e Origin exato; null recusado. Convite 256 bits/5 min/uso único; sessão 30 min inativa/8 h absoluta. QR efêmero no fragmento, remover antes da primeira rede e POST no corpo; sem terceiros/analytics, Referrer-Policy:no-referrer/Cache-Control:no-store. Formalizado na constitution 1.8.0/T001; implementação ainda precisa comprovar conformidade.

Limites iniciais testáveis: formulário JSON 64 KiB; nome 120 caracteres, URL/DNS/EPG 4096 cada, usuário/senha 1024 cada; UTF-8/tipo/URL válidos, sem caracteres de controle. TV pode acessar HTTP do provedor já suportado; browser→controle sempre HTTPS. Create/update até 5 pendentes/TV e 7 dias; exclusões não expiram enquanto sem ACK. Autenticação manual: 5 falhas/15 min por par device/IP, cooldown 15 min e resposta uniforme; IP com retenção mínima/hash e limite global para evitar brute force distribuído. Implementar contador compartilhado durável, não só memória de instância. Sync rápido no máximo 1/10 s por TV; forms 30/min/sessão, pedidos 5/10 min/TV. Retornar 429/Retry-After; calibrar em T043 sem remover proteção.

## Identidade/sessão

| Método/rota | Entrada/saída e semântica |
| --- | --- |
| POST /devices/enroll | Nonce e identificador de plataforma em trânsito HTTPS, HMAC calculado somente pelo servidor e sem log/persistência de DUID bruto; limitar abuso. Novas credenciais únicas; ID/DUID existente não devolve acesso automaticamente. |
| POST /device/invites | Bearer; purpose manage/buy, token temporário/expiry, não deviceKey em URL. |
| POST /sessions/exchange | Convite no corpo; consumo transacional de uso único, cookie/destino/expiração. |
| POST /sessions/manual | deviceId+deviceKey no corpo, hash verificado/rate limit, cookie. |
| DELETE /session | Cookie/CSRF; encerrar sessão atual. |
| POST /device/revoke | Bearer/confirmação local; journal write-ahead, epoch++, novas key/sessões revogadas, licença/trial/configurações preservados. |
| POST /devices/recovery/challenges | Bootstrap limitado por identidade/IP; desafio 256 bits/5 min e claimSecret somente TV. Identidade existente não cria novo trial. |
| POST /recoveries/exchange | Convite recover no corpo, Origin exato; consumo CAS, cookie HttpOnly restrito recovery e CSRF com limite do desafio5min. Não abre sessão comum. |
| POST /recoveries/confirm | Browser, sessão de desafio/Origin/CSRF, código no corpo HTTPS + destino confirmado + Idempotency-Key. Código ativo e identidade correspondente; fence/journal/CAS, nenhuma concessão nova. |
| POST /devices/recovery/result | claimSecret no bearer exclusivo; body claimId ou par deviceId/operationId (mutuamente exclusivos), operação/destino vinculados; entrega HTTPS idempotente de credenciais e novo código à TV, envelope cifrado 5 min. |
| POST /devices/recovery/ack | Novas credenciais + operação; persistência local antes do ACK, expurgo envelope. |
| POST /device/recovery-code/rotate | Bearer TV vigente, ação explícita confirmada; código novo entregue uma vez/idempotente, journal e revogação do anterior. |

Recuperação é autoatendimento no próprio site conforme logic §7, sem CLI administrativa ou canal de atendimento. Código inválido/usado/outra TV recebe resposta uniforme; 5 falhas/15 min por claim/IP/hash e cooldown 15 min, contador compartilhado. Retomada por código consumido só da mesma operação pendente/mesma TV, até 24 h, sem sessão comum. Rotação pelo portal exige sessão vigente e confirmação, resultado entregue à TV vinculada; browser recebe estado, nunca código salvo. Rotas autenticadas fixam device pelo principal; desafio público não autoriza leitura de configurações/licença.

## Configuração permanente e entrega

| Método/rota | Contrato |
| --- | --- |
| GET /session/device | TV de destino/sessão/licença/último contato, sem segredo. |
| GET /snapshot | capturedAt/revisão/allowlist de fontes e estado aplicado; stale explícito. |
| GET /configurations | Metadados/configVersion/appliedRevision/estado, sem DNS/URL/usuário/senha. |
| POST /operations | Cookie/CSRF/Idempotency-Key, action source.create/update/delete, sourceId/expectedRevision/input. 202 recebido, 409 conflito, 413 limite, 429 limite. Versão/operação imutáveis. |
| POST /configurations/{id}/resend | Novo operationId, revisão aplicada fresca; usa segredo salvo sem devolvê-lo ao browser. Tombstone retorna 410, exige recriação explícita com novo ID. |
| DELETE /configurations/{id} | Exclusão permanente idempotente; reserva fence/journal, remove segredo/cancela entregas, retorna serviceState e deviceState separados. Pode retornar 202 pending_journal; não afirmar confirmado antes da gravação externa durável. |
| GET /operations | Estados sem payload secreto; received/applied/confirmation/conflict/expired/importState distintos. |
| DELETE /operations/{id} | CAS/cancelamento de create/update, não exclui configuração corrente. Se aplicação já confirmada, retornar resultado efetivo. |
| POST /device/deletions | Bearer, lote até 20 `{deletionId,sourceId,revision,createdAt}` sem segredo; aceita origem TV offline/ACK perdido. Retorna acks somente após journal/finalização. Retry idempotente; delete domina comandos antigos. |
| GET /device/operations | Bearer, primeiro intenções de delete depois até 5 create/update válidos; lease/epoch/expectedRevision/configVersion/prazo. Payload de configuração só à TV autorizada via HTTPS/no-store. |
| POST /device/operations/{id}/ack | Bearer, receipt/revision/importState; idempotente. Delete ACK confirma remoção local; snapshot não substitui ACK. ACK antigo não reativa fonte. |
| PUT /device/snapshot | Allowlist estrita/revisões/capturedAt; recusar segredo/propriedades desconhecidas. Ausência de fonte não apaga automaticamente configuração. |

Configuração: tipos provider_credentials/m3u_url e campos complementares locais suportados (inclusive EPG aplicável). Segredo omitido/vazio mantém; `clearFields` explícito para campos opcionais, campos obrigatórios não podem ficar sem autenticação válida. Não confundir limpar campo e remover fonte. Servidor cifra permanentemente e decifra transitoriamente autorizado; não há envelope E2E opaco. Cancel/expiry/ACK não removem corrente. Excluir elimina corrente/versões e cancela fila; tombstone não contém segredo. Delete em fonte ativa aguarda confirmação local. Não há upload/multipart/chunks/m3u_file.

Idempotency-Key escopada por device/rota; mesmo corpo retorna mesmo operationId/resultado, digest divergente 409. Metadados 30 dias, chave antiga fora da janela não é reutilizada como criação nova. IDs de operação do cliente têm createdAt/nonce vinculados e expiração lógica; validate replay antes de expurgar recibos.

## Compra/licença

| Método/rota | Contrato |
| --- | --- |
| POST /device/trial | Bearer, início elegível idempotente 7 dias consecutivos; recovery/revoke não reiniciam. |
| GET /device/entitlement | Bearer, JWS ES256 iss/aud/deviceId/kid/state/startsAt/expiresAt/generation/serverTime. Falha de rede não revoga cache vigente. |
| POST /device/entitlement/refresh | Bearer, JWS anterior opcional verificado server-side para recuperar floor monotônico após restore; nunca aceitar contador livre do cliente. Novo token reflete ledger/revogações atuais, não direitos do token antigo. |
| GET /offer | Cookie, priceMinor=3500/currency=BRL/termMonths=12/deviceCount=1/renewal=manual, checkoutEnabled conforme gates, preço já definido. |
| POST /orders | Cookie/CSRF/Idempotency-Key; servidor fixa preço/destino; pedido pendente existente retornado, sem nova cobrança automática. Checkout Pro permitido. |
| GET /orders/{id} | Mesma TV; status confiável, reconciliação limitada; nenhum cartão ou segredo IPTV. |
| POST /payments/mercadopago/webhook | Assinatura oficial, evento mínimo durável, lookup autenticado valida merchant/amount/currency/reference/status. Duplicação/out-of-order não concedem duas vezes. |

Claims/ledger/grant transacionais, consulta externa fora do callback; reconciliação limitada por requisição e lote horário durável. Pix/cartão em ambiente de teste separados de fake. Fechar checkout não perde concessão. Consulta normal 24 h, rápido imediato/10 s só tela aberta. Renovação 12 meses calendário/clamp, estorno específico preserva outros direitos.

## Operação privada

`POST /internal/portal/jobs/tick` somente no serviço Cloud Run privado, IAM/OIDC autoriza identidade Scheduler com audience do serviço. API pública não monta executor e recusa tick, mesmo com cookie/bearer TV. Sem cron token/query estático. CLI local `uv run python -m app.portal.worker --once` em ambiente explícito. Lote limitado/lease/timeout/checkpoint, sem processamento durável após resposta; SPA não captura /portal/v1, /internal ou webhook. `/health` não devolve configuração/segredos.

### Detalhes implementados em T013

Idempotency-Key browser: `op-<13 dígitos Unix ms>-<nonce256bits Base64URL43>`, idade máxima7dias/tolerância futura60s. Claim consultada antes do merge; ID fora da janela409. DELETE /configurations/{id}: body {expectedRevision}. GET /operations e /configurations: array e nextAfter, cursor after opaco/páginas99. GET /snapshot: {snapshot,stale}, epoch antigo não é corrente. PUT /device/snapshot recebe capturedAt/sources/revisions/imports; servidor fixa epoch/receivedAt/revisão.

GET /device/operations: {operations}, ações source.create/update/delete; adaptador TV remove prefixo e valida envelope antes do núcleo. input só à TV, type apenas em create. Limite compartilhado1/10s/TV/Retry-After. Lease60s é recebimento, não ACK; replay pode repetir comando. Delete awaiting_confirmation conserva intenção; applied exige ACK específico. POST /device/deletions: {deletions:[...]}, retorna {acks:[deletionId]}, até20; horário journal observado pelo servidor para retenção.

### Complementos do adaptador US1 (execução 2026-10-11)

`POST /device/invites` retorna `qrDataUrl` PNG inline gerado no serviço com o endereço público e convite efêmero; nenhuma consulta a gerador de terceiros. Chave permanente e código privado não entram no QR. A TV invalida a imagem ao ocultar/sair, inclusive resposta atrasada.

ACK de delete aceita `conflict` sem confirmar remoção: permanece consultável sem prazo de sete dias, preserva journal/tombstone, e só `applied` confirma o dispositivo. Nova tentativa exige ação explícita/revisão fresca; snapshot ausente não confirma. Tombstone local com revisão suficiente e fonte ausente permite ACK de pendência antiga sem reaplicar exclusão.

Adaptador TV valida lote/destino/epoch/prazo antes dos efeitos; epoch é revalidado na transação local. Publicação de snapshot ocorre após exclusões/pull; conclusão de importação tem ACK separado e deduplicado localmente.

### Complemento executado US2: reenvio e recuperação

- POST /configurations/{sourceId}/resend: cookie normal + Origin exata + CSRF + Idempotency-Key. Corpo somente expectedRevision. Exige snapshot recebido há menos de24h no epoch corrente, revisão coincidente e corrente cifrada disponível; ausência confirmada permite create explícito, presença gera update. Nova versão/prazo; replay do mesmo pedido retorna operação anterior. Fence/tombstone veda recriação. Resposta contém apenas metadados públicos, nunca payload cifrado ou conexão salva.
- POST /devices/recovery/challenges retorna à TV token/claimSecret/claimId/deviceId/expiresAt e qrDataUrl PNG inline. QR referencia somente #recovery=token temporário; não contém código de licença, bearer ou chave permanente. TV persiste nonce antes de pedir e prova privada antes de mostrar QR.
- Browser remove fragmento antes da primeira rede e troca uma única vez mesmo em StrictMode. Sessão recovery não acessa listas nem sessão normal. Confirmar exige código privado + confirmedDeviceId e Idempotency-Key de256bits. Resposta ready autoriza entrega à TV, sem declarar recebimento confirmado.
- TV consulta resultado serialmente a cada10s apenas na tela de recuperação visível/online, com backoff até60s. Persiste novas credenciais antes do ACK; pendingAck.purpose=recovery permite retomar após reinício ou resposta perdida sem reenrollment. Pagehide oculta QR/aborta consulta; nenhum dado de catálogo é removido pela recuperação.
