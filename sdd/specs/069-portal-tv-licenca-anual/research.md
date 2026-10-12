# Research — 069

Revisão 2026-10-11. Decisões do usuário/ADR-013 são base; incertezas remanescentes são provas de plataforma/operação, não novas escolhas de produto.

## R0 — Runtime e dados

**Decisão:** FastAPI isolado no pacote Python atual, React/Vite próprio servido na mesma origem Cloud Run, Firestore Standard/Native via ADC. Região us-central1 proposta; min 0/request billing, tamanho medido antes da venda.

**Justificativa:** preserva stack escolhida e client-first, concentra operação no Google Cloud. Claims/IDs determinísticos e transações substituem constraints SQL; callbacks podem repetir, portanto I/O externo fica fora.

**Alternativas:** Workers/D1 exigiria mudar FastAPI; Supabase/PostgreSQL contraria Firestore; fallback SQL só permanece para seu caso existente de CORS.

Fontes: [Cloud Run](https://cloud.google.com/run/pricing), [Firestore transações](https://cloud.google.com/firestore/native/docs/manage-data/transactions).

## R1 — Cifragem sem cofres

**Decisão:** cryptography AES-256-GCM/ES256 no servidor; env privado/versões/chaves por finalidade e cópia protegida fora do banco, sem KMS/Secret Manager. Biblioteca/versões fixadas em T004.

**Justificativa:** escolha explícita de simplificação; protege dump do banco, não runtime comprometido. Configuração permanece após ACK; servidor pode decifrar para TV autorizada, browser não pode ler salvo. Segredos exclusivos da TV não são exportados.

**Alternativas:** KMS/cofre dispensados pelo usuário; payload efêmero E2E impede gestão permanente escolhida; texto claro remoto não atende FR-015. [WebCrypto](https://www.w3.org/TR/WebCryptoAPI/) precisa prova ES256 em file:// na TV (T003), sem pressupor suporte só pela versão do Chromium.

## R2 — Exclusão e restore

**Decisão:** outbox/tombstone local atômico; exclusões enviadas antes dos comandos; delete remoto sem expirar até ACK. Journal de intenções autorizadas em bucket privado separado do restore, sem credenciais, create-only/digest/`ifGenerationMatch=0`, retenção 30 dias.

**Justificativa:** restaurar banco de ontem perde tombstones de hoje; cópia diária sozinha não cumpre SC-012. Journal write-ahead registra exclusão/revogação antes da confirmação remota e permite replay seguro sobre nova base. Cloud Storage suporta criação condicional e consistência forte de leitura/listagem, fundamentos do protocolo; não oferece transação distribuída com Firestore.

**Alternativas:** tombstone na mesma base restaurada é insuficiente; segunda base Firestore acrescenta cobrança sem franquia para ela; reter arquivos M3U não tem relação com o problema. Bucket é para metadados de recuperação, não dados IPTV. Falha do journal bloqueia confirmação/reabertura, nunca apaga outbox local.

Fontes verificadas em 2026-10-11: [precondições](https://docs.cloud.google.com/storage/docs/request-preconditions), [consistência](https://docs.cloud.google.com/storage/docs/consistency), [restore em nova base](https://cloud.google.com/firestore/docs/backups), [uma base gratuita/backup cobrado](https://cloud.google.com/firestore/pricing). Provar protocolo/retentativas/falhas reais em T039/T052.

## R3 — Identidade, relógio e recovery

**Decisão:** DUID como correlação HMAC, não autenticação. Credenciais aleatórias distintas/epoch; recovery pelo próprio site com código privado >=128 bits e desafio atual da mesma TV, rotação, rate limit e entrega recuperável (logic §7). Trial/ledger preservados. Tempo máximo de high-watermark/serverTime+monotonic/wallClock, assinatura ES256 local.

**Justificativa:** reinstalação não pode criar nova licença/trial por ID público; licença válida não depende de consulta online. T003 deve medir getDuid/privilégio/crypto/persistência/suspend no aparelho, T035 caracteriza rollback; tempo offline durante desligamento adulterado não tem atestação.

**Alternativas:** DUID sozinho não prova titularidade; exigir servidor a cada play viola offline; transferência entre aparelhos e painel administrativo não fazem parte do piloto; autoatendimento foi solicitado nesta revisão. [Samsung ProductInfo](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/productinfo-api.html). Reinstalar somente unidade de laboratório, nunca apagar dados do usuário para testar.

## R4 — Pagamento

**Decisão:** Checkout Pro Pix/cartão, BRL 3500/12 meses/uma TV/manual; webhook assinado + lookup autenticado, claims/ledger idempotentes, reconciliação de pedidos pendentes sem recomprar automaticamente.

**Justificativa:** preço R$35 aprovado; redirect não é confirmação. Renovação acumula calendário, refund recalcula compra específica. Fake só dev/test, pagamento de teste/TV real são gates distintos.

**Alternativas:** assinatura recorrente e cartão na TV fora do escopo; confiar em retorno/screenshot dá concessão indevida. [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview), [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks). T027/T034 verificam contrato oficial na implementação.

## R5 — Custo e operação

**Decisão atualizada:** 10–50 TVs, R$10/mês de referência com alertas 50/90/100/150% e previsão, manter serviço ativo. Jobs privados OIDC/Scheduler horário, mesma imagem, leases/outbox. Backup diário 7 dias, RPO nominal <=24 h monitorado/RTO medido; chaves separadas. Sem mínimo de instâncias/PITR/load balancer/NAT/domínio por padrão.

**Justificativa:** rotina 24 h reduz tráfego, polling 10 s limitado à tela; runtime gratuito não cobre necessariamente backup, imagens/builds/logs/journal/restore/câmbio/impostos. Medições frias não podem ser omitidas para atender p95.

**Alternativas:** teto US$0/corte automático foram superados pelo aceite; loop residente/keep-alive aumenta custo; min 1 só após revisão baseada em medição. [Scheduler](https://cloud.google.com/scheduler/pricing), [Storage](https://cloud.google.com/storage/pricing), [Firestore](https://cloud.google.com/firestore/pricing).

## R6 — Compatibilização normativa

**Decisão:** T001 concluída: constitution 1.8.0 formaliza emenda restrita da constitution para controle/credenciais fornecidas no portal/backup cifrado/QR efêmero/licenciamento/checkout externo, antes de fluxos sensíveis. ADR-013 não sobrepõe norma superior.

**Justificativa:** escolhas de produto estão autorizadas, mas normas foram compatibilizadas, mas implementação ainda precisa evidência. Uso local/configuração/dados preservados, sem exportar exceções BYOK/M3U local por inferência.

**Alternativas:** declarar PASS antecipado ou reabrir escolhas já respondidas não resolve conflito documental. Não há nova decisão de produto pendente; a formalização foi concluída e restam provas técnicas obrigatórias.

## Consulta oficial durante execute (2026-10-11)

Preparação US3, sem integração real: documentação oficial [Checkout Pro Preferences API](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post) e [Webhooks](https://www.mercadopago.com.br/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks), além do [validador oficial Python](https://github.com/mercadopago/sdk-python/blob/master/mercadopago/webhook/validator.py). Validar HMAC com data.id/x-request-id/ts e consultar pagamento pela API autenticada; preferências/redirect não provam concessão. Não copiar SDK completo, respostas com dados pessoais ou exemplos de credenciais. A documentação usa Preferences e Orders como caminhos distintos; este incremento mantém Preferences escolhido no plano. Ensaios reais e conta permanecem em gates posteriores.
