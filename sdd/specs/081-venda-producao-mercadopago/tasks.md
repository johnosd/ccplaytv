---
description: "Tasks da feature 081 — venda em produção com Mercado Pago"
---

# Tasks: Venda em produção com Mercado Pago

**Input**: Documentos de design de `sdd/specs/081-venda-producao-mercadopago/`

**Prerequisites**: plan.md, spec.md, research.md, logic/preflight.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- **[USUÁRIO]**: ação que só o usuário faz ou autoriza na hora (painel do Mercado Pago, pagamento, nuvem real,
  comando destrutivo). O executor prepara, pede e registra; nunca executa sem a confirmação.

## Path Conventions

- Serviço do portal: `api/app/portal/`; testes em `api/tests/portal/` (rodar da raiz com `uv --directory api run …`).
- TV: `tv-web/src/` (React), `tv-web/scripts/` (scripts de build, testes `*.test.mjs` no projeto `node` do Vitest),
  `tv-web/e2e/`.
- Portal web: `portal-web/src/`, `portal-web/e2e/`.
- Infra: `infra/portal/*.ps1` (dry-run por padrão, `-Apply` para executar).
- Documentação: `docs/portal/`, `sdd/adr/`, `sdd/specs/081-venda-producao-mercadopago/evidencias/`.
- **Regra de segredo (R-002)**: nunca `Get-Content`/`Read`/`cat` de `infra/portal/*.env.yaml`. Para saber se uma
  chave existe: `Select-String -Path <arquivo> -Pattern '^CCPLAY_PORTAL_X:' -Quiet`.

---

## Phase 1: Setup

**Purpose**: Pré-requisitos externos e proteção do arquivo de segredos novo.

- [X] T001 [USUÁRIO] Conta Mercado Pago em CPF: identidade verificada, chave Pix cadastrada, banco de saque,
  credenciais de produção da aplicação ativadas e webhook do **modo produtivo** apontando para
  `https://portal.ccplaytv.com/portal/v1/payments/mercadopago/webhook`. Registrar em
  `sdd/specs/081-venda-producao-mercadopago/evidencias/mercadopago.md` só "feito/não feito" e datas, nunca valores
  (research R4).
  - Progresso (2026-10-17): credenciais de produção no `.env` da raiz (ignorado, nunca commitado):
    `MP_ACCESS_TOKEN_PRODUCTION`, `MP_CLIENT_ID_PRODUCTION`, `MP_CLIENT_SECRET_PRODUCTION`. A integração usa só o
    access token; client ID/secret não são usados. Faltam: segredo do webhook produtivo
    (`MP_WEBHOOK_SECRET_PRODUCTION`), confirmação de chave Pix e banco. O `MERCHANT_ID` sai do `/users/me` do
    token (a checagem prévia confere). T025 copia do `.env` para `production.env.yaml` por script, sem imprimir.
  - Concluída (2026-10-17): usuário confirmou webhook produtivo configurado com `MP_WEBHOOK_SECRET_PRODUCTION` no `.env` (presença conferida por `Select-String -Quiet`), chave Pix e banco cadastrados. Recomendado ao usuário renovar o client secret (parte dele foi colada na conversa; não é usado pela integração).
- [X] T002 [P] Acrescentar `infra/portal/production.env.yaml` e `infra/portal/jobs.env.yaml` ao `.gitignore`
  (confirmar com `git check-ignore -v`).

---

## Phase 2: Foundational (código e scripts, sem nuvem)

**Purpose**: Tudo que a produção precisa e que se prova localmente.

**⚠️ CRITICAL**: A US1 não pode tocar a nuvem antes desta fase terminar.

### Contrato da Fase

- `test_production_releases_checkout_only_live_and_complete_and_refuses_test_options` — FR-001–003
- `test_pix_off_with_sale_open_is_pix_disabled_and_closed_sale_stays_unavailable` — FR-010
- `test_preflight_reports_only_booleans_and_never_leaks_the_token` — FR-004, SC-006
- Comando: `uv --directory api run pytest tests/portal/test_venda_producao_contract.py -q`

### Implementation

- [X] T003 [US1] Matriz de liberação D-003 em `api/app/portal/settings.py` (`live_mode_required`;
  `checkout_not_released` só para staging em modo real e para development/test) → contrato:
  `test_production_releases_checkout_only_live_and_complete_and_refuses_test_options`
- [X] T004 [US2] `pix_disabled` no servidor: `AUTH_CODES` em `api/app/portal/auth.py`. Em
  `api/app/portal/pix_orders.py`, com venda aberta e sem `payer_domain`/`test_payer_email`, levantar
  `AuthError("pix_disabled", 409)`; venda fechada continua `service_unavailable` 503 → contrato:
  `test_pix_off_with_sale_open_is_pix_disabled_and_closed_sale_stays_unavailable`
- [X] T005 [US2] Implementar `preflight()` e o CLI `python -m app.portal.providers.mercadopago_preflight` em
  `api/app/portal/providers/mercadopago_preflight.py` conforme `logic/preflight.md` → contrato:
  `test_preflight_reports_only_booleans_and_never_leaks_the_token`
- [X] T006 [P] [US2] `infra/portal/preflight-mercadopago.ps1 -SourceEnv <arquivo>`: lê com regex só as três chaves de
  linha única (`^CCPLAY_PORTAL_(MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_MERCHANT_ID|PUBLIC_ORIGIN):\s*"?([^"\r\n]+)"?$`),
  injeta-as no ambiente **do processo filho** (`uv --directory api run python -m …`), repassa só o JSON de booleanos
  e o código de saída. Nunca ecoa valores nem o caminho do token.
- [X] T007 [P] [US1] `infra/portal/bootstrap-gcp.ps1` e `infra/portal/deploy-jobs-env.ps1`: `-ProjectId` e
  `-SourceEnv` obrigatórios, sem padrão `ccplaytv-511322`/`staging.env.yaml` (D-001). `deploy-jobs-env.ps1` ganha
  `-Create` (primeiro `gcloud run deploy` do jobs, sem acesso público, com `--service-account` do runtime) além do
  `update` atual. Atualizar quem cita os comandos antigos (`docs/portal/deploy-staging.md`, `infra/portal/README.md`).
- [X] T008 [US1] `infra/portal/provision-production.ps1 -ProjectId <id> [-Apply]`, dry-run padrão, só com
  executável + argumentos (nunca `Invoke-Expression`):
  - bucket do journal privado, uniforme, com prevenção de acesso público e `journal-lifecycle.json`;
  - papel custom `journal-writer-role.json` ligado ao runtime só no bucket;
  - conta `portal-scheduler` com `run.invoker` só no jobs e job do Scheduler OIDC (`scheduler.json`);
  - agenda de backup (`backup/manage-backup.ps1 -Action schedule`);
  - orçamento (`budget.json`).
  Saída JSON sem segredos.
- [X] T009 [US1] `infra/portal/new-production-env.ps1 -ProjectId <id> -PublicOrigin <url> -OutFile
  infra/portal/production.env.yaml`:
  - gera AES (32 bytes Base64URL), PEM PKCS8 P-256, HMACs e `SERVICE_RECOVERY_EPOCH`;
  - `SIGNING_KID: prod1`, `ENVIRONMENT: production`, `SERVICE_ROLE: public`, `CHECKOUT_ENABLED: "false"`,
    `MERCADOPAGO_LIVE_MODE: "true"`;
  - recusa sobrescrever arquivo existente;
  - imprime **só** os nomes das chaves geradas e o JWKS **público** (`kid=prod1`, `x`/`y`) para o build da TV;
  - formatos em `docs/portal/operacao.md` §"Formatos privados".

### Testes da Fase

- [X] T010 [P] Ajustar testes antigos à nova regra:
  - `api/tests/portal/test_pix.py`, ~linha 73: domínio ausente com venda aberta → 409 `pix_disabled`;
  - `api/tests/portal/test_bootstrap.py`: se algum assert divergir do D-003, mudar só o assert, sem relaxar o
    que é recusado.
- [X] T011 [P] Teste do CLI do preflight em `api/tests/portal/test_mercadopago_preflight_cli.py`:
  - config ausente → só `{"code": "preflight_unavailable"}`;
  - saída 0 só com quatro `true`;
  - nenhum valor das variáveis na saída.

**Critério de Conclusão**: `uv --directory api run pytest tests/portal/test_venda_producao_contract.py -q` → 3/3
verdes e `check-contract-tests.ps1 -Slug 081-venda-producao-mercadopago` íntegro. Também:
- `uv --directory api run pytest tests/portal -q` sem regressão (com emulador para os testes Firestore);
- `ruff` limpo;
- os quatro scripts rodam em dry-run e imprimem só nomes e comandos;
- `git status` não mostra `*.env.yaml`.

**Checkpoint**: Fundação pronta.

**Registro da Fase**:

- Status: Concluída (2026-10-17).
- Feito: T003 matriz D-003 (live_mode_required); T004 `pix_disabled` 409 (`AUTH_CODES` + `pix_orders.py`); T005 `preflight()` + CLI (lê só 3 variáveis); T006 `preflight-mercadopago.ps1` (regex de 3 chaves, ambiente só do processo filho, limpa ao sair); T007 `-ProjectId`/`-SourceEnv` obrigatórios e `deploy-jobs-env.ps1 -Create` (privado, dimensionamento de `services.json`), docs atualizadas; T008 `provision-production.ps1` com passos `journal`/`scheduler`/`backup`/`budget` (dry-run padrão, idempotente com `-Apply`); T009 gerador em Python `app/portal/production_env.py` (o 5.1 não exporta PKCS8) + wrapper `new-production-env.ps1`: grava 16 variáveis, `kid` `prod1`, recusa sobrescrever, imprime só nomes e JWKS público; T010 `test_pix.py` 503→409 (`test_bootstrap.py` sem mudança: asserts antigos continuam válidos); T011 `test_mercadopago_preflight_cli.py`.
- Contrato: `uv --directory api run pytest tests/portal/test_venda_producao_contract.py -q` → 3/3 verdes; trava íntegra.
- Testes executados: `PORTAL_TEST_FIRESTORE=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 uv --directory api run pytest tests/portal -q` → 179 passed (emulador com o Java do `JAVA_HOME`); `ruff check .` limpo; `test_production_env.py` 2/2 (o arquivo gerado sobe `PortalSettings`/`PortalCrypto`/`AuthTokens`/`RecoveryCodes` de produção); dry-run dos 4 passos de `provision-production.ps1`; wrapper do preflight com fixture fictícia → só `preflight_configuration_missing`/`preflight_unavailable`; wrapper do gerador fora do repo → 16 nomes, segunda execução `env_file_exists`; parse dos `.ps1` sem erros.
- Pendências: nenhuma da fase. Observado fora do fluxo: `.env.example` (versionado) foi alterado pelo usuário com os trechos truncados das credenciais de produção (não commitado) — reportado ao usuário.

---

## Phase 3: User Story 1 - Produção isolada no ar, com venda fechada (Priority: P1) 🎯 MVP

**Objetivo**: Projeto novo com portal em `portal.ccplaytv.com`, chaves novas e TV comercial confiando só em `prod1`.

**Independent Test**: TV com o pacote novo pareia pelo QR, usa o teste de 7 dias, recebe lista pelo portal;
"Comprar licença" informa venda indisponível sem chamar o provedor.

### Contrato da Fase

- `build comercial recusa chave pública revogada sob qualquer kid e aceita uma chave nova` — FR-007, US1/AC2
- Comando: `cd tv-web; npx vitest run scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs`

### Implementation

- [X] T012 [USUÁRIO] [US1] Criar o projeto GCP (ID definido pelo usuário), vincular à conta de faturamento e rodar
  `infra/portal/bootstrap-gcp.ps1 -ProjectId <id> -Apply`. Registrar ID, região e horário em
  `evidencias/infra.md`.
  - Progresso (2026-10-17): APIs `cloudresourcemanager`/`cloudbilling` habilitadas no projeto de cota (`ccplaytv-511322`); projeto `ccplaytv-prod` **criado**. Vínculo ao faturamento `019D1E-9F4271-E5FBF5` (o mesmo da homologação, único aberto) **recusado: cota de projetos por conta de faturamento** (5 vinculados: `cv2000-0`, `ccplaytv-511322`, `cv20-staging`, `neoreader-494513`, `pocanalytics1`). Aguardando decisão do usuário (R-011).
- [X] T013 [US1] `new-production-env.ps1` (T009) para `infra/portal/production.env.yaml`. O usuário guarda a cópia
  protegida fora do repositório; registrar só "cópia guardada: sim" e a data.
- [X] T014 [USUÁRIO] [US1] `provision-production.ps1 -ProjectId <id> -Apply`; acrescentar
  `CCPLAY_PORTAL_JOURNAL_BUCKET` ao arquivo de ambiente sem abrir o arquivo (append de linha).
- [X] T015 [USUÁRIO] [US1] Build remoto (`infra/portal/cloudbuild.yaml`) e deploy:
  - público com `--env-vars-file=infra/portal/production.env.yaml`;
  - jobs com `deploy-jobs-env.ps1 -Create`.
  `CHECKOUT_ENABLED=false`. Smokes (`smoke-staging.ps1 -BaseUrl <run.app>`, `smoke-enrollment.ps1`) e tick OIDC
  aprovados.
- [X] T016 [P] [US1] `tv-web/scripts/revokedLicenseKeys.mjs` com a chave pública da homologação (`kid` `v1`, só
  `kty/crv/x/y`), copiada do JWKS público da homologação (D-007). `tv-web/scripts/commercialConfig.mjs` recusa
  qualquer chave cujo par `x`+`y` esteja na lista → contrato:
  `build comercial recusa chave pública revogada sob qualquer kid e aceita uma chave nova`
- [X] T017 [USUÁRIO] [US1] Migrar o domínio na ordem do `operacao.md` (R-005):
  1. Mapeamento `portal.ccplaytv.com` removido da homologação e criado na produção; certificado ativo.
  2. CNAME `portal → ghs.googlehosted.com` conferido.
  3. `PUBLIC_ORIGIN=https://portal.ccplaytv.com` nos dois serviços da produção.
  4. `PUBLIC_ORIGIN` da homologação de volta ao `run.app` dela.
  Smokes no domínio.
- [X] T018 [USUÁRIO] [US1] `npm run build:tizen:commercial` com `VITE_PORTAL_ORIGIN`/`VITE_PORTAL_SITE_URL` =
  `https://portal.ccplaytv.com` e `VITE_LICENSE_PUBLIC_KEYS` = `{"prod1": <JWK público>}`. Instalar na TV pelo skill
  `tizen-tv`. Roteiro SC-001: pareia, teste de 7 dias, lista pelo portal, compra indisponível com foco.
  Registrar em `evidencias/tv.md`. Isso também cumpre 078/T054 (anotar lá).

### Testes da Fase

- [X] T019 [P] [US1] Em `tv-web/scripts/commercialConfig.test.mjs` (não é contrato), caso de lista de revogadas com
  mais de uma chave e chave revogada misturada a uma válida. Smokes `smoke-sources.ps1` e `smoke-configuration.ps1`
  no domínio, registrados em `evidencias/infra.md`.

**Critério de Conclusão**: `npx vitest run scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs`
→ 1/1 verde, trava íntegra. Também:
- smokes da produção aprovados no domínio;
- TV física com o pacote novo cumprindo US1/AC1–AC3;
- serviço sobe recusando configuração incompleta (US1/AC4, coberto pelo contrato da Fase 2).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-17).
- Feito: T016 chave `v1` da homologação revogada no build comercial (`revokedLicenseKeys.mjs` + `commercialConfig.mjs`); T012 projeto `ccplaytv-prod` (APIs de gestão habilitadas no projeto de cota; cota de faturamento resolvida desvinculando `pocanalytics1` por decisão do usuário); T013 `production.env.yaml` com `kid` `prod1`; T014 journal, **índices do Firestore** (passo novo — sem eles o tick dava 500), backup diário 7 dias, orçamento, Scheduler; T015 build `bf7309f8` + público `00001-7lz` + jobs `00001-fmj`, tick 200; T017 domínio `portal.ccplaytv.com` movido para a produção (REST de domain mappings), origem da homologação no `run.app` dela; T018 pacote comercial (árvore atual, com a 079 em andamento — decisão do usuário) na TV; troca de pareamento por Desvincular; T019 testes extras do `commercialConfig` e lista pelo portal validada na TV. Tasks novas registradas: T044 (US2, pedido do usuário), T045/T046 (Fase 5b).
- Contrato: `npx vitest run scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs` → 1/1 verde; trava íntegra.
- Testes executados: `npx vitest run scripts/commercialConfig` → 5/5; smokes no `run.app` e no domínio (`smoke-staging.ps1` passed, `smoke-enrollment.ps1` 200, jobs anônimo 403, `license-keys` só `prod1`); tick forçado 200; conferência do pacote (origem de produção, `prod1`, sem `v1`, sem `d`); roteiro SC-001 na TV física observado pelo usuário: chave nova, QR abre o portal conectado, lista incluída/excluída pelo portal chega no Atualizar, teste de 7 dias, compra fechada com "indisponível".
- Pendências: cópia protegida de `production.env.yaml` (usuário: "vou guardar depois"); `[Bug]` do Desvincular com `AbortError` registrado no backlog (fora do escopo, 072); a TV está com um pacote de diagnóstico (inofensivo), substituído no próximo build da Fase 4; bugs de script do PowerShell 5.1 achados e corrigidos (ver Cuidados para Retomada).

---

## Phase 4: User Story 2 - Venda real liberada e homologada (Priority: P2)

**Objetivo**: Venda aberta em produção, com textos de vendedor/reembolso, homologada com cartão e Pix e estornada.

**Independent Test**: duas compras reais (cartão no portal, Pix na TV) ativam 12 meses no Atualizar; estornadas, as
concessões são revogadas.

### Contrato da Fase

- `Pix desligado com venda aberta mostra QR e endereço do site para pagar com cartão, sem Tentar novamente; Voltar sai`
  — FR-010, US2/AC5
- Comando: `cd tv-web; npx vitest run src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx`

### Implementation

- [X] T020 [US2] `tv-web/src/lib/portal/portalClient.ts`: `pix_disabled` em `errorCodes` e em `BODY_CODES` (lido do
  corpo de 409) → contrato: `Pix desligado com venda aberta …`
- [X] T021 [US2] `tv-web/src/features/portal/LicensePixScreen.tsx`: com `pix_disabled`, a view nova
  - mostra `FixedQr` do `site` e o texto `portal.pix.cardOnly` (com `{site}`);
  - tem só a ação Voltar;
  - não chama `refresh`.
  Sem `site`, mostra o texto sem QR e mantém Voltar. Textos pt/en/es em `tv-web/src/lib/i18n/messages/purchase.ts`.
  → contrato: `Pix desligado com venda aberta …`
- [X] T044 [US2] (descoberta na T018, pedido do usuário em 2026-10-17) Compra na TV não termina em beco sem saída
  quando o site pode vender (FR-010 emendado, R-012):
  - `api/app/portal/pix_orders.py`: falha do provedor ao **gerar** o Pix passa de `service_unavailable` para
    `pix_failed` 503 (retryable); `AUTH_CODES` em `auth.py`. Venda fechada continua `service_unavailable` 503 e
    Pix desligado `pix_disabled` 409 (contrato travado intacto). Ajustar o assert de provedor fora em
    `api/tests/portal/test_pix.py`.
  - `tv-web/src/lib/portal/portalClient.ts`: `pix_failed` em `errorCodes`; ler código do corpo também em 503 (só
    `pix_failed`, mesmo limite de 512 bytes).
  - `tv-web/src/features/portal/LicensePixScreen.tsx`: `pix_failed` (ou erro inesperado) → "Não foi possível gerar
    o Pix agora" + `FixedQr`/endereço do `site` como alternativa + Tentar novamente + Voltar;
    `service_unavailable` → "A compra está indisponível no momento. Tente mais tarde." (venda fechada:
    manutenção/antes da abertura), sem mandar ao site; offline segue "Sem conexão" (073).
  - Textos pt/en/es em `purchase.ts`; teste de componente fora dos arquivos de contrato. Contratos da 073 e da
    081 continuam verdes.
- [X] T047 [US2] (descoberta na T027, pedido do usuário em 2026-10-17) Volta do Checkout e compra não paga:
  - no celular o Mercado Pago abre no app/aba dele e a volta (paga ou cancelada) caía numa **aba nova** sem a sessão
    (`sessionStorage`) → login. Sessão e pedido conhecido passam ao `localStorage` (mesma validade ≤ 8 h, conferida no
    servidor, apagada em Sair) em `portal-web/src/features/api.ts` e `license/LicenseCard.tsx` (R-013);
  - cancelar/desistir deixa o pedido `pending` com o mesmo link, reaproveitado sem cobrança nova (comportamento
    correto). Os textos "Pagamento pendente"/"Há um pagamento… continue por ele" enganavam (não havia pagamento, e dava a
    entender que só o aparelho original continuava): agora "Aguardando pagamento" e "compra iniciada e ainda não paga.
    Toque no botão abaixo para continuar daqui mesmo, de qualquer celular ou computador" (pt/en/es);
  - E2E: volta numa aba nova retoma a sessão e abre Licença; compra iniciada continua de outro aparelho pelo mesmo
    pedido (fixture com rotas no contexto). Publicado em `:081-t047` (público `00006-pv7`, jobs `00006-x56`).
- [X] T022 [US2] Vendedor e reembolso na tela de Pix da TV (D-008): linha
  `portal.pix.seller` ("Vendido por CCPlayTV · ccplaytv@gmail.com") e `portal.pix.refund` ("Reembolso em até 7
  dias pelo e-mail …"), pt/en/es, em `LicensePixScreen.tsx`/`purchase.ts`. Respeitar a catraca de 300 linhas
  (`npm run lint`).
- [X] T023 [P] [US2] Portal: vendedor, contato e regra de reembolso em "Antes de pagar"
  (`portal-web/src/features/license/LicenseCard.tsx`, `portal-web/src/lib/i18n/index.ts`), mais perguntas no FAQ
  (`portal-web/src/lib/i18n/faq.ts`: quem vende, como pedir reembolso, contato), pt/en/es. Conferir se
  `bridge/privacidade/index.html` usa o mesmo contato.
- [X] T024 [P] [US2] Campos de qualidade da preferência (D-009, `research.md` R1, confirmar na fonte oficial) em
  `api/app/portal/providers/mercadopago.py`, com teste em `api/tests/portal/test_mercadopago.py`: campos presentes,
  sem `payer`, preço e moeda inalterados.
- [X] T025 [USUÁRIO] [US2] O usuário acrescenta ao `production.env.yaml` token, `MERCHANT_ID` e segredo do webhook
  de produção, sem colar valores na conversa. Rodar `infra/portal/preflight-mercadopago.ps1 -SourceEnv
  infra/portal/production.env.yaml`. Exigir os quatro `true` (ou `pix_enabled=false` com a decisão D-004). Registrar
  só os booleanos.
- [X] T026 [USUÁRIO] [US2] Redeploy (público + jobs) com o código das fases 2–4 e `CHECKOUT_ENABLED=true`; conferir
  `GET /portal/v1/offer` → `checkoutEnabled: true` (sessão do portal).
- [ ] T027 [USUÁRIO] [US2] Compra real por **cartão** no portal (Checkout Pro). Conferir:
  - pedido `approved` só pela consulta autenticada;
  - Atualizar na TV mostra licença de 12 meses;
  - `pendingOrder` limpo no portal;
  - chegada do webhook assinado, pelo log de requisição: status 200 na rota, sem corpo.
  Registrar em `evidencias/producao.md` (ID do pedido truncado, horários, estados).
- [ ] T028 [USUÁRIO] [US2] Compra real por **Pix** na TV (R-001). Se o provedor recusar, o caminho FR-010:
  1. tirar `CCPLAY_PORTAL_PIX_PAYER_DOMAIN` da produção;
  2. redeploy;
  3. a TV mostra "pague com cartão no site" com QR.
  Registrar qual caminho valeu.
- [ ] T029 [USUÁRIO] [US2] Estornar as duas compras no painel do Mercado Pago. Conferir revogação na TV (Atualizar)
  e `order_refunded` no portal (US2/AC3). Registrar.

### Testes da Fase

- [X] T030 [P] [US2] TV:
  - teste de componente dos textos de vendedor/reembolso (`LicensePixScreen.test.tsx` ou arquivo novo não-contrato);
  - teste do `portalClient` lendo `pix_disabled` de 409;
  - cenário `pix_disabled` em `tv-web/e2e/compra-licenca-pix.mjs`;
  - estado novo incluído em `tv-web/e2e/legibilidade-tv.mjs` (pt/en/es).
- [X] T031 [P] [US2] Portal: `portal-web/e2e/licenca.spec.ts` confere vendedor/contato/reembolso antes de pagar e
  no FAQ; `layout.spec.ts` continua verde nos três tamanhos.

**Critério de Conclusão**: `npx vitest run src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx`
→ 1/1 verde, trava íntegra. Também:
- checagem prévia aprovada;
- duas compras reais ativando e depois revogadas (SC-002);
- textos visíveis em pt/en/es na TV e no portal;
- E2E da TV e do portal verdes.

**Checkpoint**: User Story 2 funcional.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - Operação segura e homologação a custo zero (Priority: P3)

**Objetivo**: Restore ensaiado com conciliação, alertas e homologação sem custo recorrente.

**Independent Test**: restore do backup da produção numa base isolada reproduz as compras estornadas conciliadas;
homologação sem Scheduler, backups nem bucket.

### Implementation

- [ ] T032 [US3] Criar `infra/portal/alerts-production.ps1 -ProjectId <id> [-Apply]`.
  - Métricas baseadas em log das requisições Cloud Run (5xx em `/portal/v1/payments/mercadopago/webhook`, falha do
    tick `/internal/portal/jobs/tick`).
  - Canal de e-mail do mantenedor (confirmar o endereço com o usuário).
  - O filtro nunca usa corpo nem query.
  Aplicar com `-Apply` [USUÁRIO]. **Sem alerta de backup** (R3 resolvido, R-006 aceito): a idade do backup é a
  checagem semanal do runbook (T037).
- [ ] T033 [USUÁRIO] [US3] Ensaio de restore (FR-011):
  1. `manage-backup.ps1 -Action inspect` com snapshot READY posterior às compras de T027–T029;
  2. `-Action restore` para `portal-restore-081-<data>`;
  3. `restore_replay` + conciliação dos pagamentos com o provedor contra a base restaurada;
  4. conferir pedidos `refunded` e concessões revogadas, sem segredo ressuscitado; medir o RTO;
  5. apagar a base de ensaio.
  Registrar em `evidencias/restore.md`.
- [ ] T034 [USUÁRIO] [US3] Reduzir a homologação (D-010, FR-013), cada comando confirmado na hora:
  - apagar o job do Scheduler;
  - apagar a agenda de backup e os backups;
  - apagar o bucket do journal;
  - `CHECKOUT_ENABLED=false` nos dois serviços;
  - limpar imagens antigas do Artifact Registry (manter a última).
  Registrar o que foi apagado.
- [ ] T035 [US3] Anotar no `plan.md` a data para conferir SC-005 (fatura do mês seguinte da homologação); a
  conferência em si fica como pendência datada se o mês não tiver fechado.

### Testes da Fase

- [ ] T036 [P] [US3] `alerts-production.ps1` e o filtro: teste de dry-run (saída sem segredos, filtros sem
  query/corpo) registrado em `evidencias/infra.md`. Disparo de teste de um alerta (ex.: tick com falha
  provocada no ensaio) quando possível.

**Critério de Conclusão**: restore ensaiado com conciliação e RTO medido (SC-004), alertas de webhook/conciliação
aplicados, homologação reduzida com lista do que foi apagado, data de conferência do SC-005 registrada.

**Checkpoint**: User Story 3 concluída.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5b: Ajustes do portal pedidos na T018 (usuário, 2026-10-17)

**Purpose**: Dois problemas que o usuário encontrou ao parear a TV de produção pelo celular. Independentes das
stories; podem rodar a qualquer momento depois da Fase 2.

- [X] T045 [P] Aumentar as tentativas da entrada manual no portal antes do bloqueio: em
  `api/app/portal/auth.py` (`_manual_limits`), falhas por par ID+IP passam de **5 para 10** em 15 min (cooldown de
  15 min mantido); demais limites (25/ID, 25/IP, 100 global por 15 min) e a recusa uniforme continuam. Ajustar
  `api/tests/portal/test_auth.py`/`test_pairing.py` onde contam o 5º/6º pedido e o texto de `docs/portal/operacao.md`
  ("cinco falhas"). Origem: o celular bloqueou (429) após poucas tentativas com a chave antiga da homologação.
- [X] T046 [P] Corrigir o campo de ID (MAC) da entrada manual em `portal-web/src/features/session/SessionPage.tsx`:
  `formatDisplayIdInput` agrupa só pares completos (`compact.match(/../g)`), então o 3º caractere digitado some
  (`"A0C"` → `"A0"`) e o campo trava em 2 caracteres. Agrupar também o par incompleto (`/.{1,2}/g`) e manter o
  limite de 12 dígitos hexadecimais. Teste unitário em `portal-web` (digitação caractere a caractere, colar com `:`
  ou `-`, minúsculas) e caso no Playwright `portal-web/e2e` digitando o ID.
**Registro da Fase**:

- Status: Concluída (2026-10-17).
- Feito: T046 — causa real era dupla: o formatador descartava o 3º caractere **e** reescrevia o valor a cada tecla (maiúsculas + hífens), o que apaga a composição dos teclados de celular ("não aparece nada"). Lógica movida para `portal-web/src/features/session/displayId.ts`: durante a digitação só descarta o que não vale num MAC (`typedDisplayId`), formata ao sair do campo (`onBlur`) e normaliza no envio; campo com `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`. T045 — `MANUAL_PAIR_ATTEMPTS = 10` em `api/app/portal/auth.py` (era 5), testes usam a constante; `operacao.md` atualizado.
- Contrato: sem contrato nesta fase; trava da 081 íntegra.
- Testes executados: `npx vitest run src/features/session` (portal-web) 6/6, incluindo `displayId.test.ts` (digitação caractere a caractere); Playwright `bootstrap.spec.ts` + `ajustes.spec.ts` 8/8 (caso novo com `pressSequentially`, que o `.fill()` antigo não pegava); `layout.spec.ts` 11 passed/4 skipped; `pytest tests/portal` com emulador 179 passed; ruff limpo; lint do portal sem achados.
- Publicação: imagem `:081-5b` (build SUCCESS), público `ccplaytv-portal-00002-98z` e jobs `ccplaytv-portal-jobs-00002-dkl`, venda ainda fechada; `smoke-staging.ps1` no domínio `passed`.
- Pendências: confirmação do usuário no celular (digitar o MAC).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentação canônica, gates herdados e verificação final.

- [ ] T037 [P] Runbook de produção em `docs/portal/operacao.md`:
  - ambientes;
  - deploy e rollback por revisão;
  - abrir/fechar venda;
  - checagem prévia;
  - estorno manual e reembolso de 7 dias;
  - rotação de chave (publicar `kid` novo na TV antes de assinar com ele);
  - restore;
  - alertas;
  - checagem **semanal** da idade do backup com `backup/manage-backup.ps1 -Action inspect -ProjectId <prod>
    -Apply` (único controle de backup, R-006).
  Também `docs/portal/deploy-staging.md` (homologação reduzida, como religar para sandbox) e
  `infra/portal/README.md` (scripts novos e parâmetros obrigatórios).
- [ ] T038 [P] Emenda inline `**Atualização (081):**` em `sdd/adr/ADR-013-portal-controle-serverless-google-cloud.md`:
  projeto de produção separado, homologação reduzida, venda aberta em modo real.
- [ ] T039 Gates herdados:
  - em `sdd/specs/069-portal-tv-licenca-anual/plan.md`/`tasks.md`, anotar que T039/T046/T047 foram cumpridos pela
    081 (com links para as evidências) e que T043 é risco aceito;
  - em `sdd/specs/078-prontidao-publicacao-samsung/tasks.md`, anotar T054 cumprida por T018;
  - em `.planning/backlog.md`, a ideia "gate de venda" sai das Ideias Futuras quando a 081 fechar;
  - 073 R-001/R-016 com o desfecho.
- [ ] T040 Checagens automatizadas completas:
  - `uv --directory api run pytest tests/portal -q` (com emulador) e `ruff`;
  - `tv-web`: `npm run test`, `npm run lint`, `npm run build`;
  - `portal-web`: `npm run lint`, `npm run build`, Playwright.
- [ ] T041 E2E da TV com `npm run dev` no ar: `node e2e/compra-licenca-pix.mjs`, `node e2e/legibilidade-tv.mjs`,
  `npm run test:e2e`.
- [ ] T042 Executar `quickstart.md` e registrar o resultado.
- [ ] T043 Revisão de segredos antes de cada commit:
  - `git diff --cached` sem `APP_USR`, `TEST-`, `BEGIN PRIVATE KEY`, `access_token` com valor nem e-mail de
    comprador;
  - `git status` sem `*.env.yaml`;
  - evidências só com booleanos/IDs truncados.

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída, incluindo TV física
- [ ] Fase 4 (User Story 2) concluída, com compras reais e estornos
- [ ] Fase 5 (User Story 3) concluída
- [ ] Testes de contrato todos verdes (5/5) na suíte completa e `check-contract-tests.ps1` íntegro
- [ ] Serviço de produção no domínio, smokes aprovados, venda aberta e checagem prévia aprovada
- [ ] Pacote comercial da TV com só `prod1` instalado e validado na TV física (gate obrigatório)
- [ ] Homologação reduzida e nenhum `*.env.yaml` versionado
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: T001 é pré-requisito de T025 (não bloqueia a Fase 2 nem a US1).
- **Foundational**: bloqueia a US1.
- **US1**: T012 → T013 → T014 → T015 → T017 → T018 (sequencial, nuvem real). T016 é paralela a tudo.
- **US2**: T020–T024 em paralelo com a US1. T025 → T026 → T027/T028 → T029 dependem da US1 concluída e de T001.
- **US3**: T033 depende de T029 (precisa das compras no backup). T034 depende de T018 (a TV já no pacote novo,
  R-009) e de T017.
- **Polish**: depois das stories.

### Parallel Opportunities

- T002, T006, T007 em paralelo; T016, T020–T024 em paralelo ao trabalho de nuvem da US1.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 2 (código provado localmente).
2. US1: produção no domínio com venda fechada e TV no pacote novo; a chave comprometida sai de circulação.
3. **PARAR E VALIDAR** na TV física.

### Incremental Delivery

1. US1 → MVP sem venda.
2. US2 → venda aberta e homologada.
3. US3 → operação e redução de custo.

## Notes

- Toda task `[USUÁRIO]` termina com uma linha em `evidencias/` e no `Registro da Fase`; nenhuma é marcada sem a
  confirmação do usuário.
- Commitar após cada task ou grupo coerente, sempre depois de T043.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
