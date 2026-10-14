# Lógica delimitada — operações, exclusão e licença

Revisão 2026-10-11. D-001–D-015 do plano são invariantes. Interfaces congeladas permanecem compatíveis; comportamentos adicionais ficam em novos colaboradores, sem editar contratos.

## 1. Aplicação de configuração

`applyRemoteMutation(mutation, { deviceId, database, importSource })` mantém assinatura do stub. Canal autenticado valida schema/prazo/epoch antes da chamada; executor combina envelope HTTP com esse núcleo. Resultado público congelado applied/conflict/wrong_device; erros de protocolo/confirmation/expiry ficam no adaptador, sem tornar um conflito applied.

```text
se destino != TV: wrong_device, zero escrita/efeito
transação Dexie (sources, credentials, revisions, receipts, importOutbox, deletes):
  se recibo existente: retornar mesmo resultado
  se tombstone ou pendingPortalDelete da fonte: conflict
  se expectedRevision != revisão atual: conflict
  create: usar sourceId explícito e revisão 0→1
  update: preservar campos secretos ausentes/vazios e identidade estável
  delete: remover fonte e dependências pelo repositório; gravar tombstone
  gravar revisão/recibo e outbox de import para create/update
commit
drenar importOutbox fora da transação; nunca iniciar rede/import dentro dela
retornar applied com revisão confirmada
```

Importação usa importRunner/importWorker/importPipeline existentes, nunca catálogo servidor. `importSource` é colaborador idempotente por sourceId/configRevision. Deduplicar aceitação e serializar dreno; crash entre início do efeito e marca final pode exigir repetir tentativa de import, mas não criar segunda geração/import concorrente nem duplicar lista. Contrato C1 prova replay normal; T020 prova janelas de crash e retomada. Não alegar exatamente uma chamada externa sob crash sem protocolo no executor de importação.

Confirmação de alteração destrutiva em fonte ativa ocorre antes do commit, com revisão revalidada no momento de aplicar. Salvar retomada suportada/encerrar PlayerService de modo controlado. Cancelar não aplica. Falha de importação preserva geração anterior e informa importState separado.

## 2. Revisões e retenção no servidor

Separar `configVersion` desejada imutável, `expectedRevision` da TV e `appliedRevision` confirmada. Edição concorrente com local ou outra operação pendente exige CAS/conflito; não enfileirar updates sucessivos presumindo revisões futuras. Reenvio explícito usa novo operationId, mesma configuração corrente ou nova versão, revisão local confirmada e prazo renovado.

```text
receber formulário autorizado → validar limites/epoch/Idempotency-Key
ler configuração corrente e revisão-base; campo secreto vazio preserva
cifrar payload com nonce/AAD/versão novos fora do callback
transação Firestore:
  reler epoch/revisão/fence/claim (todas leituras antes das escritas)
  se conflito: abortar, nunca revelar segredo anterior
  gravar configuração/versão imutável/operação/job/claim
```

ACK/aplicado ou entrega cancelada/expirada não apagam configuração corrente. Expurgo remove versões órfãs. Expiry lógico validado no acesso mesmo se TTL atrasar. Allowlist `toPortalSourceView`: id/type/displayName/connectionState/updatedAt; revisão/capturedAt em envelope separado. Nunca spread de SourceView, DNS, URL, usuário, segredo ou novas propriedades.

## 3. Exclusão bidirecional e prioridade na sincronização

### Remoção diretamente na TV

```text
transação local:
  remover lista com confirmação/limpeza existentes
  incrementar revisão; gravar tombstone(sourceId)
  gravar pendingPortalDeletes(deletionId) sem credenciais
  cancelar outbox de import/comandos locais referentes
sincronização (inclusive primeira após restart):
  enviar pendingPortalDeletes ANTES de buscar comandos
  cada exclusão só sai da outbox após serverAck com mesmo deletionId
  falha → conservar outbox; tombstone continua vetando comandos dessa fonte
  buscar/aplicar comandos restantes; publicar snapshot allowlist
```

**Atualização 2026-10-13 (T057, decisão do usuário):** a pendência na outbox não espera o ciclo de 24 h. O agente observa `pendingPortalDeletes` (visível/online, após qualquer ciclo em andamento, sem sobrepor) e envia imediatamente **somente** `flushDeletions` seguido de `publishSnapshot`; não faz pull de comandos, não consulta licença e não liga o polling de 10 s. O snapshot é necessário para o portal parar de listar a fonte como "Somente na TV". Falha reaproveita o backoff do ciclo (1/5/15 min), a outbox permanece e o prazo normal de 24 h não é adiado.

Endpoint de exclusão aceita sourceId conhecido ou ainda não observado no snapshot, desde que bearer vinculado à mesma TV; isso cobre create aplicado com ACK perdido. Não depender de configuração ainda existir para aceitar tombstone. Delete é idempotente, domina todas versões antigas do mesmo sourceId; criação voluntária posterior usa novo sourceId.

### Exclusão pelo portal

Validar autorização e reservar `deletionIntent`/fence transacional. Cancelar entregas e impedir novas leituras/decrypt daquela fonte imediatamente. Gravar evento write-ahead no journal independente, depois eliminar ciphertext/versões e confirmar exclusão do serviço. TV offline: manter intenção `pending_device` sem expiry de sete dias até ACK. Canal device devolve delete prioritário sem payload secreto; a TV confirma uso ativo e aplica, ou informa `awaiting_confirmation`. Portal distingue exclusão do serviço e exclusão local pendente. Não afirmar remoção local a partir de snapshot ausente.

Concorrência: ACK antigo/create antigo não remove tombstone nem reativa configuração. Expurgo de operação não remove tombstone. Sessão revogada não entrega comando; após recovery nova sessão pode receber pendência de exclusão existente e nunca reenvio de fonte tombstonada.

### Journal write-ahead

`reserveIntent → append(eventId, ifGenerationMatch=0) → finalizeIntent` com retries/checkpoints. Evento sem segredo contém intenção autorizada, não ciphertext. Crash após append antes de finalize é completado por jobs ou restore. Falha antes de append conserva fence e retorna pending/503, sem ACK remoto confirmado. Não fazer Cloud Storage dentro de callback Firestore. Evento repetido de digest diferente é incidente, não overwrite. As mesmas regras valem para access/license revocation.

## 4. Agente e lifecycle

Agente único montado no App, deadline 24 h persistido. Sucesso de sync atualiza prazo; excluir outbox só com ACK. Abrir QR/configuração/compra visível consulta imediatamente e a cada 10 s; falha usa jitter/backoff até 60 s. Sair para navegação/player interrompe rápido. Suspend/background cancela timers; resume/reconnect normal só consulta se vencido. Retry diário em 1/5/15 min, máximo 3 por ciclo; depois reagenda ciclo e informa falha sem loop infinito. Um mutex evita overlap e múltiplos agentes. Foco não cria consultas.

## 5. Tempo, licença e playback

`evaluatePlaybackAccess` permanece pura: assinatura inválida/destino errado/ausente/início futuro/revogada/now>=expiry negam; trial/active vigente permitem offline. Sem fetch, limpeza ou player nesse núcleo.

`trustedNow = max(highWatermark, signedServerTime + sessionElapsedMonotonic, wallClock)`; persistir avanço em checkpoints e lifecycle, nunca retroceder. JWS ES256 contém iss/aud/deviceId/kid/generation/state/startsAt/expiresAt/serverTime, validação estrita; só chave pública no cliente. Geração recebida menor que já observada não autoriza. Rotação publica chaves antigas enquanto tokens válidos dependerem delas.

Sem relógio atestado, desligamento offline com alteração de relógio permanece limite conhecido, não garantia inviolável. T003 mede plataforma e T035 prova modelo; cobrança exige limite explícito aceito, sem inventar sucesso do spike.

Guarda local ao entrar na lista: escolha, abertura após importação/verificação do provedor e RETURN do seletor. Validada a entrada, navegação e qualquer reprodução/retomada continuam até sair para o seletor ou fechar o app, mesmo se a licença vencer; configurações abertas dentro da sessão não a encerram. Não persistir autorização de sessão. Vencimento só bloqueia a próxima entrada; player/trailer não revalidam vencimento. Revogação confirmada recebida encerra a lista ativa controladamente. Rede indisponível não bloqueia licença vigente. Modo pessoal preservado; build comercial sem bypass público editável pelo usuário.

## 6. Pagamento e calendário

Oferta servidor: `priceMinor=3500`, `currency=BRL`, `termMonths=12`, uma TV, manual. Pedido pendente existente é reutilizado/mostrado; nunca recomprar automaticamente. Checkout Pro hospedado, dados de cartão apenas no provedor.

Webhook autentica assinatura oficial, persiste evento mínimo e consulta API autenticada fora da transação. Validar merchant/reference/device/order/amount/currency/status. API indisponível mantém reconcile job; redirect/recibo/pix emitido não concedem. Claims paymentId/orderId e concessão/ledger são um commit transacional, com callback puro. Tick horário, consulta limitada do próprio pedido e evento webhook antecipam reconciliação, sem worker permanente.

Ordenar compras válidas por confirmedAt e desempate orderId estável. Para cada compra: start=max(confirmedAt, fim anterior válido), expiry=addCalendarMonths(start,12), UTC com clamp (29/fev→28/fev, nunca 365 dias fixos). Trial é 7×24 h consecutivas desde início elegível imutável. Estorno retira só compra correspondente e recalcula posteriores válidas pelo mesmo algoritmo, generation++; journal de revogação durável antes de confirmar estado final. Falha de consulta não significa estorno. T034 cobre fora de ordem/concorrência e compras independentes.

## 7. Recuperação pelo site e restore

O número da licença apresentado ao usuário é um **código privado de recuperação**, distinto de deviceId/orderId e da credencial IPTV. Emitir no vínculo inicial, inclusive trial, permitindo guardar antes de uma reinstalação. Usar aleatório com pelo menos 128 bits, Base32 legível e checksum; não sequencial nem derivado do DUID. Renovação não muda o código. Servidor conserva apenas HMAC por finalidade/versão e índice de lookup; TV guarda a cópia local protegida pela mesma política de credenciais. Exibir somente após ação explícita “Mostrar código da licença”, com orientação para guardar/fotografar. Nunca incluir em URL, QR de navegação, checkout, logs ou snapshot. Sessão autorizada pode solicitar regeneração explícita se perdeu a anotação; não lê o código antigo do servidor.

Fluxo de autoatendimento, sem operador/CLI/canal de suporte:

1. Instalação sem credencial reconhece identityClaim existente e oferece recuperar, sem criar deviceId/trial novos. TV cria desafio aleatório 256 bits/5 min, limitado por identidade/IP, e recebe claimSecret exclusivo para polling. QR leva somente convite efêmero à página de recuperação; usuário também pode digitar o endereço público.
2. Site coleta código no corpo HTTPS, usa Origin/CSRF e confirma TV de destino com identificador público mostrado nos dois lados. Validar código ativo, desafio vigente da mesma identityHmac e ausência de fence; DUID sozinho não autoriza. Limitar 5 falhas/15 min por IP/claim/hash do código, cooldown 15 min, contadores compartilhados e resposta uniforme. Não prometer atestação do hardware: T003 prova limites da identidade na TV.
3. Reservar fence transacional com claimId/operationId/idempotencyDigest. Gravar journal write-ahead access_revoked com novo authEpoch e recoveryCodeVersion, nunca código/hash utilizável. Só então finalizar troca por CAS: preservar deviceId/trial/ledger/configurações, invalidar acessos/código anteriores e gerar novo código e bearer/key distintos. Duas recuperações concorrentes têm somente um vencedor. Nenhuma concessão é criada pela recuperação.
4. Guardar resultado de emissão cifrado por no máximo 5 min, vinculado ao claimSecret/purpose/operationId, para entregar à TV via HTTPS. Retry idempotente recupera o mesmo resultado, sem nova rotação. ACK da TV remove envelope; o browser recebe apenas estado. TV persiste novas credenciais antes do ACK e exibe novo código para guardar. Envelope expirado sem recebimento mantém o vínculo bloqueado: o código anterior pode SOMENTE retomar a mesma operação de recuperação, na mesma TV e com novo desafio, por até 24 h; nunca autentica sessão comum ou inicia outra troca. Após esse prazo, expurgar esse verificador de retomada. Testar perda de resposta/ACK e explicar limite ao usuário.
5. Configuração não excluída pode ser reenviada explicitamente com revisão nova. Código perdido com acesso ainda válido permite regeneração protegida; perda conjunta do código e acessos impede recuperação automática. Identificador público, recibo/screenshot e referência de pagamento não substituem código. Não reiniciar trial, transferir TV nem prometer catálogo apagado; reinstalação somente laboratório autorizado.

Journal também registra versão/operationId da rotação, verificador HMAC corrente/keyVersion e estado de recuperação pendente, permitindo bloquear código antigo após restore mesmo quando a atualização ocorreu depois do backup. Antes de tráfego, impor floor de authEpoch/recoveryCodeVersion e cancelar desafios/envelopes antigos; reconstituir o índice pelo verificador HMAC do journal permite aceitar o código corrente guardado pelo usuário, sem recuperar seu texto claro. HMAC não é aceito pela API como credencial. Se o verificador não for recuperável, bloquear o fluxo, sem reativar código antigo. Sem prova suficiente, não reativar código revogado por conveniência. T025/T039/T052 ensaiam essa situação.

Restore: manutenção bloqueia escritas; inventariar backup <=7 dias/journal 30 dias/chaves antigas; restaurar em **nova base isolada**; aplicar todos eventos relevantes do journal antes de publicar; reconciliar pedidos/concessões com Mercado Pago; invalidar sessões/invites e elevar epoch/generation acima do estado pré-incidente, não emitir token com geração retrocedida. Epoch utiliza identificador aleatório de recuperação global do serviço, substituído em todo restore, além do contador por TV: acesso antigo não volta a valer mesmo se contador restaurado for menor. Entitlement usa geração monotônica por TV; `POST /device/entitlement/refresh` recebe JWS anterior opcional e só usa seu contador após verificar assinatura/destino/issuer, calculando `max(geração restaurada, floor do journal, geração comprovada do JWS anterior)+1` em transação. Browser não escolhe floor livremente. Registrar journal de revogações antes do novo token; cache com geração maior solicita refresh e nunca aceita retrocesso. Não retomar comandos de configuração automaticamente após restore: reenviar exige revisão fresca e ação explícita; conservar/aplicar intenções de exclusão. Ensaio demonstra configuração apagada após backup permanecendo apagada e compra não duplicada. Journal indisponível/incompleto ou chaves perdidas bloqueiam reabertura, com recuperação manual e risco registrado. RPO<=24 h é objetivo nominal monitorado, não garantia em falha generalizada.

> **Atualização (070, 2026-10-13):** a feature 070 alterou o descrito neste documento quanto a: ID exibido no formato MAC (imutável, ADR-015), chave do dispositivo numérica de 10 dígitos, sessão manual por ID + chave e rota de valores salvos para a própria TV (`values`). O contrato e a lógica vigentes estão em `sdd/specs/070-entrada-listas-gerenciador/` (`contracts/portal-api-070.md`, `logic/pareamento.md`, `data-model.md`) e nas invariantes I-1…I-10 do `plan.md`. Não reverter.