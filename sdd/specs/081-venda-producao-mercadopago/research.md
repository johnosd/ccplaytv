# Research: 081 — Venda em produção com Mercado Pago

Itens a confirmar em fonte oficial **durante a execução**, antes da task que depende deles. Nenhum foi
confirmado no sdd-plan (sem consulta à documentação do Mercado Pago nesta sessão); cada um tem decisão
provisória e o que fazer se a fonte disser outra coisa.

## R1 — Campos de qualidade da preferência (FR-008) — **resolvido em 2026-10-17**

- **Confirmado**: `GET https://api.mercadopago.com/item_categories` (com o token de produção, só leitura) lista `art, baby, coupons, donations, computing, cameras, video_games, television, car_electronics, electronics, automotive, entertainment, fashion, games, home, musical, phones, services, learnings, tickets, travels, virtual_goods, others` → `virtual_goods`. `statement_descriptor` = `CCPLAYTV` (8 caracteres; o limite exato não foi achado na documentação, mas 8 cabe em qualquer limite citado). Implementado em T024.

- **Decisão provisória**: `statement_descriptor: "CCPLAYTV"`; no item, `category_id: "virtual_goods"` e
  `description: "Licença anual do app CCPlayTV para uma TV"`. Nenhum dado de `payer`.
- **Justificativa**: o painel "Qualidade da integração" do Checkout Pro cobra descrição na fatura, categoria e
  descrição do item. Dados do pagador não são coletados pelo produto (constitution, segredos/dados pessoais).
- **Confirmar**: lista oficial de `category_id` (`GET /item_categories`) e limite de caracteres do
  `statement_descriptor`. Se `virtual_goods` não existir, usar `services`; se nenhum servir, `others`.
- **Alternativas rejeitadas**: mandar e-mail/nome do comprador (exigiria coletar dado pessoal).

## R2 — Pix em produção com pagador sintético (073 R-001)

- **Decisão provisória**: manter o e-mail sintético `tv-<hash>@pagamentos.ccplaytv.com`. A prova é a compra real
  por Pix da US2 (T028). Se o provedor recusar, aplicar FR-010 (D-004): tirar `CCPLAY_PORTAL_PIX_PAYER_DOMAIN`
  da produção e a TV encaminha para o cartão no site.
- **Alternativas rejeitadas**: coletar e-mail/CPF na TV (decisão do usuário: não coletar sem nova decisão).

## R3 — Alerta de backup com mais de 24 h (FR-012) — **resolvido em 2026-10-17**

- **Fato confirmado**:
  - A [documentação de backups do Firestore](https://docs.cloud.google.com/firestore/native/docs/backups) não
    descreve log, métrica nem alerta de sucesso ou falha do backup agendado; o horário diário nem é configurável.
  - A [de audit logging](https://docs.cloud.google.com/firestore/docs/audit-logging) registra só criar/alterar/apagar
    agenda, apagar backup e restore (Admin Activity), e listar/ler (Data Access). Não há método de criação de backup
    pela agenda.
  - Não existe sinal nativo de "backup não rodou".
- **Decisão (usuário)**: aceitar o risco. Sem alerta automático de backup. `manage-backup.ps1 -Action inspect`
  semanal no runbook (plano R-006, FR-012 emendado). Os alertas automáticos ficam para webhook e conciliação.
- **Alternativa rejeitada pelo usuário**: o tick horário listar os backups com papel de leitura de metadados e
  registrar `backup_stale` para um alerta baseado em log (código + ajuste de IAM).

## R4 — Credenciais de produção da aplicação Mercado Pago

- **Fato do repositório**: o webhook é configurado por aplicação, com segredo próprio por modo (teste/produtivo);
  o `merchant_id` é o `collector_id` do dono do token (`deploy-staging.md`).
- **Confirmar no painel (usuário)**: ativação das credenciais de produção em conta CPF e o que o painel pede
  (dados do negócio, site `https://portal.ccplaytv.com`, política de privacidade). O sdd-execute não preenche nada
  no painel; só registra o que o usuário informar.
