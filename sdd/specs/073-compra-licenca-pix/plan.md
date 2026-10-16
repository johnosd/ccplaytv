# Implementation Plan: Compra de licença por Pix na TV e renovação pelo portal

**Slug**: `073-compra-licenca-pix` | **Date**: 2026-10-15 | **Spec**: `sdd/specs/073-compra-licenca-pix/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

A TV ganha **Comprar licença** (bloqueio e Configurações → Portal & licença), que abre uma tela com um **Pix
dinâmico** de R$ 35 gerado pelo serviço no Mercado Pago (API de pagamentos, não o Checkout Pro), desenhado na TV
como QR a partir do copia-e-cola. A licença chega **só pelo Atualizar** (ADR-016 intacta): o Atualizar da tela
concilia o pedido com o provedor e, aprovado, busca o JWS como o bloqueio já faz. O Pix pendente é reaproveitado no
pedido pendente que a 069 já mantém por TV; um segundo pagamento aprovado no mesmo pedido vira concessão extra em
vez de travar a conciliação. O portal renomeia a aba Ativar para **Renovar licença**/**Comprar licença**, avisa Pix
pendente e mostra o **código de recuperação** por ação explícita, a partir de uma cópia cifrada que a TV envia ao
serviço (conferida por HMAC). Venda real continua desligada (gates da 069).

## Technical Context

**Language/Version**: TypeScript 5/6 + React 19 (TV `tv-web/`, portal `portal-web/`); Python 3.13 + FastAPI
(`api/app/portal/`, Cloud Run).

**Primary Dependencies**: Dexie (IndexedDB da TV), `qrcode-generator` (já usado por `components/FixedQr.tsx`),
`httpx` (provedor), Pydantic 2, `google-cloud-firestore` (async), `cryptography` (via `PortalCrypto`). Nenhuma
dependência nova.

**Storage**: Firestore (pedidos, grants, `devices/{id}/recoveryEscrow/current` novo); IndexedDB na TV
(`portalDevice.escrowedCodeVersion`, sem versão nova de schema).

**Testing**: Vitest (projetos `dom` `*.test.tsx` e `node` `*.test.ts`), pytest com emulador do Firestore
(`PORTAL_TEST_FIRESTORE=1`), Playwright E2E (`tv-web/e2e/*.mjs` via `run.mjs`, `portal-web/e2e/*.spec.ts`).

**Target Platform**: Samsung Tizen 9 / Chromium 120, origem `file://` (build `chrome108`); portal em navegador
móvel/desktop; API no Cloud Run (staging `ccplaytv-511322`).

**Performance Goals**: abrir a tela de Pix até QR visível ≤ 3 s com serviço quente (medir, não prometer: Cloud Run
frio pode passar disso — cold start registrado na 069). Nenhuma requisição fora de ação da pessoa (SC-004).

**Constraints**: ADR-016 (só ação da pessoa fala com o serviço); constitution "Segredos" (copia-e-cola, ids de
pagamento e código de recuperação fora de logs/erros/URL/cache); um `Modal` ativo por vez; ratchet de arquitetura
(feature→feature proibido, arquivo de produção ≤ 300 linhas); tokens V14 e `--fs-*` ≥ 20 px; i18n pt/en/es;
venda desligada (`checkout_enabled`).

**Scale/Scope**: piloto 10–50 TVs (069); 1 pedido pendente por TV; Pix de 30 min.

## Decisões Invariantes

- **D-001 Pix pela API de pagamentos do Mercado Pago**, no **mesmo** `OrderDocument` da 069: `POST /v1/payments`
  (`payment_method_id: "pix"`, `external_reference = order.reference`, webhook existente, `X-Idempotency-Key =
  sha256(orderId/attempt)`). Guarda só `id`, prazo e copia-e-cola. Conciliação, aprovação e estorno continuam os
  da 069 (`reconcile_payment` → `approve`/`refund`). Research §1.
- **D-002 Prazo e reaproveitamento**: Pix vale 30 min (prazo do provedor/serviço). Reabrir com ≥ 60 s de folga
  (relógio do serviço) devolve o mesmo Pix sem chamar o provedor; vencido devolve `expired` sem criar nada; só
  `renew: true` ("Gerar novo Pix") cria nova tentativa no mesmo pedido. A TV nunca decide validade pelo próprio
  relógio além de exibir a contagem.
- **D-003 QR desenhado na TV** com `FixedQr` a partir do copia-e-cola; o serviço não manda PNG. O copia-e-cola sai só
  nas rotas da TV (`no-store`), nunca em `order_view`, logs, erros, journal ou portal; é apagado do pedido quando ele
  sai de `created`/`pending`.
- **D-004 Recebimento só pelo Atualizar** (ADR-016): o Atualizar da tela de Pix chama `POST
  /device/orders/pix/refresh` (concilia sob demanda, independente do worker/webhook) e, se `approved`, o mesmo
  `refreshPortal('license')` do bloqueio. Nenhum timer, polling ou consulta por foco/abertura do app.
- **D-005 Pagamento excedente concede**: segundo pagamento aprovado num pedido já aprovado vira pedido derivado
  `surplus` com grant próprio (+12 meses), idempotente por `paymentClaims/{paymentId}`. Nunca `try_again` eterno.
- **D-006 Tentativa antiga não cancela o pedido**: `refused`/`cancelled` de um pagamento Pix que não é o
  `pix_payment_id` corrente só fecha o evento; o da tentativa corrente segue a regra da 069.
- **D-007 Portal**: a aba `activate` vira "Renovar licença" (licença paga) / "Comprar licença" (teste ou sem licença),
  sempre visível; mantém o checkout Mercado Pago (Pix e cartão) no mesmo pedido pendente; `GET /session/device` ganha
  `pendingOrder` para o aviso de Pix pendente, sem copia-e-cola.
- **D-008 Cópia cifrada do código de recuperação enviada pela TV**: `PUT /device/recovery-code/escrow` com o código
  só no corpo, quando `escrowedCodeVersion !== recoveryCodeVersion`, como passo do Atualizar (licença e listas). O
  serviço aceita só se o HMAC e a versão batem com o dispositivo, cifra com `PortalCrypto` (`CipherContext(deviceId,
  "recovery-code", version)`) e revela no portal (`POST /session/recovery-code`, CSRF, `no-store`, limite) só se o
  HMAC guardado ainda é o corrente. Research §5 explica por que não é gravado no ato da geração.
- **D-009 Falha do passo de cópia não derruba o Atualizar**: a licença/listas são o que a pessoa pediu; a cópia é
  tentada de novo no próximo Atualizar.
- **D-010 Integração sem import feature→feature**: o gate monta `LicensePixScreen` (mesma feature `portal`); o painel
  de Configurações abre a tela por um registro em `lib/licensing/pixPurchaseRuntime.ts`, renderizado por
  `usePortalIntegration.tsx`. A tela é um `Modal` próprio: quem a abre desmonta o seu antes.
- **D-011 Ordem e rótulos na TV**: bloqueio = Comprar licença (foco inicial), Atualizar, Voltar; painel = nova ação no
  índice 7 ("Renovar licença" se `license.state === 'active'`, senão "Comprar licença"), backup/Desvincular passam
  para 8–11. Textos exatos da tela em `logic/pix-e-codigo.md` §3.
- **D-012 Venda desligada**: a rota de Pix respeita `checkout_enabled` (503 → "A compra está indisponível no
  momento."). Só staging de teste liga.
- **D-013 Pagador sintético**: `payer.email` não pessoal derivado do `deviceId` + domínio configurado (research §2);
  nenhum dado pessoal ou credencial IPTV chega ao provedor.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | PASS | PASS | Sem conta; compra continua opcional; bloqueio só da entrada (exceção comercial 069/1.9.0 inalterada); dados locais intocados. |
| Segredos Fora dos Clientes e dos Logs | **Emenda necessária** | PASS com emenda 1.13.0 (T001) | Revelar o código no portal por ação explícita já é permitido (1.8.0). **Novo**: a TV enviar o código ao serviço e o serviço guardar cópia decifrável → exceção (i) delimitada, decisão do usuário com risco explicado (2026-10-15). Copia-e-cola/ids de pagamento tratados como dado sensível (D-003). |
| Categorias da Fonte São Preservadas | N/A | N/A | Não toca catálogo. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede | PASS | PASS | Só ação da pessoa fala com o serviço (D-004); contagem do prazo é relógio local de exibição; decisão de licença segue local. |
| Trailers e Metadados | N/A | N/A | — |
| Toda Ação Essencial por Controle Remoto | PASS | PASS | Pagar acontece no celular (exceção 069 "compra pode exigir celular"); abrir, atualizar, gerar novo e voltar por setas/SELECT/RETURN. |
| Lista de Catálogo ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | Todo estado da tela tem ação focável (tabela §3); contrato C3 cobre erro/vencido; focar não consulta (C1). |
| Voltar Restaura Foco e Posição | PASS | PASS | RETURN volta à origem com foco em Comprar licença (gate índice 0, painel índice 7). |
| Identidade de Reprodução | N/A | N/A | — |
| Progresso e Capacidades São Reais | PASS | PASS | Sem barra de progresso inventada; "Gerando o Pix…" indeterminado; estados reais do provedor. |
| Documentação Canônica | PASS | PASS | ADR-013 nota 073, constitution 1.13.0, `docs/portal/operacao.md`/FAQ atualizados no Polish. |
| Restrição: serviço central (exceção 069) | PASS | PASS | Pagamento/licença já são escopo do serviço; Direct Play/catálogo na TV. |
| Restrição: design system / plataforma | PASS | PASS | Tokens V14, `--fs-*`, legibilidade auditada; QR na TV física como gate (SC-007). |
| Fluxo: testes automatizados, E2E antes da TV, revisão de segredos | PASS | PASS | Tasks exigem pytest+ruff / vitest por task, E2E novo antes do `tizen-tv`, revisão de segredos T032. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/073-compra-licenca-pix/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/portal-api-073.md
├── logic/pix-e-codigo.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
api/app/portal/
├── commercial_models.py        # OrderDocument + pix_* / parent_order_id
├── models.py                   # RecoveryEscrowDocument (novo)
├── payments.py                 # D-006 no ramo else de reconcile_payment
├── pix_orders.py               # NOVO: PaymentService.pix / refresh_pix / pix_view
├── recovery_escrow.py          # NOVO: RecoveryEscrowService (put / reveal)
├── repositories/licensing_repository.py  # approve_surplus (D-005)
├── licensing.py                # refund acha pedido pelo paymentClaim (surplus)
├── providers/{base,fake,mercadopago}.py  # PixCharge + pix()
├── retention.py                # limpeza do escrow
├── settings.py                 # pix_payer_domain
└── routes/licensing.py (+ routes/recovery_escrow.py)  # rotas novas; application.py registra
api/tests/portal/test_pix.py, test_recovery_escrow.py   # NOVOS

tv-web/src/
├── lib/licensing/pixPurchase.ts (+ .compra-licenca-pix.contract.test.ts)   # stub → T011
├── lib/licensing/pixPurchaseRuntime.ts                                     # NOVO (registro do abridor)
├── lib/portal/recoveryEscrow.ts (+ .compra-licenca-pix.contract.test.ts)    # stub → T024
├── lib/portal/portalAgent.ts, portalTables.ts                               # passo escrow / campo novo
├── lib/i18n/messages/portal.ts                                               # textos pt/en/es
├── features/portal/LicensePixScreen.tsx (+ .compra-licenca-pix.contract.test.tsx, .css)  # stub → T013
├── features/portal/LicenseGate.tsx, usePortalIntegration.tsx
└── features/settings/PortalLicensePanel.tsx, tabs/PortalLicenseTab.tsx
tv-web/e2e/compra-licenca-pix.mjs (NOVO), run.mjs, legibilidade-tv.mjs

portal-web/src/
├── App.tsx, features/LicensePage.tsx, features/api.ts
├── features/RecoveryCodeCard.tsx (NOVO)
└── lib/i18n/index.ts, lib/i18n/faq.ts
portal-web/e2e/licenca.spec.ts (+ caso do código)

.planning/memory/constitution.md (1.13.0), sdd/adr/ADR-013-*.md (nota 073), docs/portal/operacao.md
```

**Structure Decision**: monorepo existente — serviço em `api/app/portal/` (Cloud Run, não o fallback congelado do
ADR-008), TV em `tv-web/`, portal em `portal-web/`. Nenhum diretório novo de topo.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Serviço passa a guardar cópia decifrável do código de recuperação (exceção (i), constitution 1.13.0) | Pedido explícito do usuário: consultar e guardar o código pelo portal para reinstalar a TV. O serviço só tinha HMAC. | "Portal gera código novo a cada consulta" (rejeitada pelo usuário); "só validade no portal" (não atende US3). |
| Pedido derivado `surplus` | Spec SC-002/edge case: cada pagamento confirmado soma 12 meses; hoje o 2º pagamento trava a conciliação. | Bloquear cartão com Pix pendente contraria FR-009; estorno automático é fora de escopo. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso). **Orçamento** (lição da 071): um teste
por unidade alterada além dos contratos; um E2E novo da TV (`compra-licenca-pix.mjs`) e casos novos no
`portal-web/e2e/licenca.spec.ts`; suíte completa só no Polish.

Comandos-base:

```powershell
# TV
cd tv-web; npx tsc -b; npm run lint; npx vitest run <arquivos>; npm run test; npm run build; npm run build:tizen
# API (emulador em 127.0.0.1:8085)
cd api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal/test_pix.py tests/portal/test_recovery_escrow.py -q -p no:cacheprovider; .venv\Scripts\python.exe -m ruff check .
# Portal
cd portal-web; npm run lint; npm run test; npm run build; npm run test:e2e
# E2E TV (npm run dev em outro terminal)
cd tv-web; node e2e/compra-licenca-pix.mjs; npm run test:e2e
```

Emulador: `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'` (ou `npm run dev:portal`). Testes de API
**pulam** sem `PORTAL_TEST_FIRESTORE=1` — pulado não conta como verde.

Testes obrigatórios fora do contrato (pytest, porque o script de trava só conta `it`/`test` do Vitest): reaproveitar
Pix sem chamar o provedor; `expired` sem criar; `renew` cria tentativa nova; venda desligada → 503; refresh concilia e
não concede sem lookup; D-006 tentativa antiga; D-005 dois pagamentos → dois grants, notificação repetida não soma;
estorno do excedente; escrow aceita só HMAC/versão corretos; revelar só sessão da mesma TV, `no-store`, `409
not_escrowed` com escrow velho; nenhum copia-e-cola/código em `repr`/erro/log.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx` (3),
`tv-web/src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts` (1),
`tv-web/src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts` (1).

Comando (em `tv-web/`): `npx vitest run src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 073-compra-licenca-pix`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| abre com um único pedido de Pix e mostra copia-e-cola, R$ 35, 12 meses, ID da TV e prazo; setas não consultam | US1/AC1, FR-002, FR-003, SC-004 | Fase 3 | `Unable to find an element with the text: 000201…` (stub renderiza `null`) |
| Atualizar com Pix pendente explica e mantém o QR; Atualizar com pagamento aprovado chama onLicensed uma vez | US1/AC2–AC3, FR-005–FR-007 | Fase 3 | `Unable to find an element with the text: 000201…` |
| falha de rede tem Tentar novamente e Voltar sem falar em recusa; Pix vencido só é trocado por Gerar novo Pix | US1/AC5–AC7, FR-004, FR-007, FR-013, Constitution: Foco Visível | Fase 3 | `Unable to find an element with the text: Sem conexão com o serviço.` |
| abre e atualiza pelas rotas fixas, só busca a licença quando aprovado e recusa resposta adulterada sem ecoar | FR-002, FR-005, FR-006, FR-008, FR-012 | Fase 3 | `Error: not implemented` |
| envia o código de recuperação só no corpo, uma vez por versão, e reenvia só quando a versão muda | FR-011, FR-012, D-008, Constitution: Segredos (i), ADR-016 | Fase 5 | `expected Error: not implemented to match object { code: 'network_error' }` |

Saída vermelha confirmada em 2026-10-15: 5/5 falhando pelos motivos acima; `npx tsc -b` limpo.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/licensing/pixPurchase.ts`,
`tv-web/src/lib/portal/recoveryEscrow.ts`, `tv-web/src/features/portal/LicensePixScreen.tsx`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Execução | Em Execução, modo pausado. Fases 1–5 e Polish automatizado concluídos (T001–T029, T031–T033 + T019a). Abertos só T030 (staging) e T034 (TV física), ambos com confirmação do usuário. |
| Gates (T031) | TV: `tsc`/lint/`npm run test` 3370/3370/`build`/`build:tizen`/`npm run test:e2e` **50/50**; API pytest 163/163 + ruff; portal lint/test 7/7/build/E2E 18/18 (2 de 3 rodadas; R-015); contratos 5/5; travas 073/072/071/070/069/026 íntegras. |
| Código de recuperação (Fase 5) | Cópia cifrada enviada pela TV no Atualizar (HMAC conferido); portal revela por ação explícita (POST + CSRF, `no-store`). Contratos 5/5 verdes; pytest 163/163; portal E2E 18/18; `consulta-sob-demanda` PASS na pilha real. |
| Portal (Fase 4) | Aba Comprar/Renovar licença, aviso de Pix pendente sem nova cobrança, FAQ; `/session/device` com `pendingOrder`. Portal E2E 17/17. |
| TV (Fase 3) | Comprar licença no bloqueio e em Portal & licença; tela de Pix; contratos 4/5 verdes (o 5º é da Fase 5); E2E `compra-licenca-pix` e legibilidade (96 telas, 0 achados) verdes. |
| Serviço (Fase 2) | Pix dinâmico (`pix_orders.py`), D-005 excedente, D-006, rotas da TV `no-store`. pytest do portal 158/158 com emulador, 0 skipped; ruff limpo. |
| Normativo | Constitution 1.13.0 aplicada (exceção (i), aprovada pelo usuário em 2026-10-15); nota 073 na ADR-013; `CLAUDE.md` aponta 1.13.0. |
| Decisões do usuário (sdd-execute) | A002: cópia enviada pela TV no Atualizar (D-008 mantida). A003/R-005: aceito. A004: só texto com o site para cartão. |
| Serviço | `pix_payer_domain` em `settings.py` (opcional; ausente → Pix da TV 503); documentado em `docs/portal/deploy-staging.md`. |
| Contratos | 5/5 vermelhos (esperado), trava íntegra. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Mercado Pago exigir dado do pagador (e-mail/CPF) ou chave Pix cadastrada que o sandbox não simula igual à produção | Alto (US1 não fecha) | T005 valida no sandbox antes da UI; se o e-mail sintético for recusado, **parar e perguntar** (não coletar e-mail na TV sem decisão). Chave Pix da conta é pré-requisito operacional (quickstart §1). **Atualização (T030, 2026-10-15):** o sandbox recusa `POST /v1/payments` Pix com HTTP 401 causa 7 "Unauthorized use of live credentials" — com o e-mail sintético e também com o comprador de teste (`pix_test_payer_email`, criado a pedido do usuário, só staging/test). Causa confirmada: o token é do vendedor de teste certo (`users/me`), mas **o Pix não aparece em `/v1/payment_methods` dessa conta** (sem chave Pix cadastrada nela). **Aberto: o usuário cadastra uma chave Pix na conta vendedora de teste.** Ver `evidencias/staging.md`. |
| R-002 | Pix da TV + cartão do portal pagos no mesmo pedido | Alto (dinheiro sem licença) | D-005 + testes pytest; quickstart §3 passo 11. |
| R-003 | Cópia decifrável do código no serviço: quem tiver a chave de 10 dígitos (sempre visível em Adicionar/bloqueio) abre o portal e lê o código | Alto (aceito pelo usuário, 2026-10-15) | Ação explícita + aviso, CSRF, `no-store`, limite 5/10 min, nunca em URL/log; constitution 1.13.0 (i) registra o risco. "Gerar nova chave" continua invalidando sessões. |
| R-004 | Webhook atrasado/perdido ou worker parado | Médio | D-004: o Atualizar concilia sob demanda (`reconcile_order`), sem depender do worker. |
| R-005 | Spec US1/AC5 ("aberta ou atualizada → venceu"): depois que o provedor cancela o Pix vencido (webhook), o pedido some e reabrir gera Pix novo direto, sem a mensagem "venceu" | Baixo | Resolvido: aceito pelo usuário em 2026-10-15 (Clarifications da spec); dentro da tela aberta a mensagem aparece. |
| R-006 | `Modal` singleton: abrir a tela de Pix com o gate montado não renderiza nada | Médio | D-010; teste de componente do gate abrindo a tela. |
| R-007 | Mudar índices do painel Portal & licença quebra navegação/testes do `PortalLicenseTab` | Médio | D-011; atualizar testes do painel e da aba juntos; E2E de Configurações na suíte. |
| R-008 | Constitution 1.13.0 não aprovada | Bloqueia US3 | Resolvido: aprovada e aplicada em 2026-10-15 (T001). |
| R-009 | Ligar a venda por engano | Alto | D-012; `checkout_enabled` falso fora do staging de teste; gates R-022–R-026 da 069. |
| R-010 | QR Pix denso (≈150–250 caracteres) ilegível do sofá | Médio | QR grande na tela (≥ 480 px no palco), nível de correção M; SC-007 na TV física é gate. |
| R-012 | Decisão de execução: `renew: true` com Pix ainda pagável (≥ 60 s) devolve o mesmo Pix em vez de criar outro | Baixo | Evita dois Pix válidos no mesmo pedido (pagamento duplo); a tela só oferece "Gerar novo Pix" quando venceu. Coberto em `test_pix.py`. |
| R-013 | Bug achado na Fase 3: o `licenseMonitor` fechava o bloqueio assim que a licença chegava, desmontando a tela de Pix antes do `onLicensed` — a lista negada não era retomada | Médio | Resolvido: com a tela de Pix aberta o bloqueio não se fecha sozinho (`buyingRef`); quem fecha é o `onLicensed`. Coberto em `LicenseGate.test.tsx` e no E2E `compra-licenca-pix`. |
| R-014 | `e2e/consulta-sob-demanda.mjs` (071, fora do `run.mjs`) falha no passo 4 por "Transaction lock timeout" do emulador quando o portal dispara `/session/device` em paralelo | Médio (gate E2E da 071; não é regressão da 073) | Resolvido (T019a, desvio aprovado pelo usuário): cada GET do painel lia e gravava a sessão numa transação, e `/session/device` gravava a geração da licença — em rajada, travas cruzadas até "Transaction lock timeout" (~2–4 s por requisição). Agora a sessão é validada por leitura e `lastSeenAt` é tocado com escrita otimista serializada por sessão no processo; `/session/device` calcula a licença sem gravar (`persist=False`). Rajada de 8: 2,02 s → 0,02 s; pytest 160/160; `consulta-sob-demanda` 3/3 (antes 0/4; base 1/3). Semântica do prazo ocioso preservada (testes da 069 intactos). Em produção, duas instâncias ainda podem tocar a mesma sessão ao mesmo tempo — a pré-condição faz uma desistir, sem erro. |
| R-015 | `portal-web/e2e/configuracao.spec.ts:123` ("M3U somente URL e falha de resposta reutiliza o mesmo pedido") falhou 1 vez em 3 rodadas da suíte completa do portal; isolado passa 7/7 | Baixo (teste pré-existente, não alterado pela 073) | Aberto: instabilidade a investigar com `sdd-bugfix` se repetir; não contado como verde no gate. |
| R-016 | Incidente na execução (2026-10-15): ao listar só os nomes das chaves de `infra/portal/staging.env.yaml`, o corpo PEM de `CCPLAY_PORTAL_SIGNING_KEY` (assinatura ES256 das licenças do **staging**) foi impresso na conversa da sessão | Médio (staging; venda desligada; permite forjar licença para TVs que confiam nesse `kid`) | **Aceito pelo usuário em 2026-10-15** ("assumo o risco, pode manter"); chave mantida. Rotacionar (novo `kid`, nova pública no build da TV) antes de qualquer uso além do teste, e obrigatoriamente antes de produção (que já usa chaves separadas). Leitura desse arquivo daqui em diante só por chave específica. |
| R-017 | Achado na T030 (anterior à 073): o commit local `c1315fb` ("logs") versionou `infra/portal/staging.env.yaml` (chaves do staging e token de teste do Mercado Pago) e 711 arquivos de `.cache/` (JRE, ~458 MB), ambos no `.gitignore`; ainda não estava no remoto | Alto se fosse enviado | Resolvido (a pedido do usuário, 2026-10-15): histórico local reescrito só com objetos novos (`commit-tree`), sem tocar a árvore de trabalho — `c1315fb`→`56c1922` e o merge `9fe7249`→`6937eaa` (autor, datas e mensagens preservados); `git rm --cached` dos caminhos; nenhum commit de `feature/licenca` os contém. Backup em `backup/pre-rewrite-073` (ainda TEM os segredos: **não fazer push dela**; apagar depois de conferir). Os objetos antigos continuam no reflog local até expirar/`gc`. |
| R-011 | Travas de outras features (069 C1–C5, 070, 071, 072, 026) quebradas por mudanças em gate/painel/agente | Médio | Rodar `check-contract-tests.ps1` dessas features em todo gate; nenhuma edição em contrato alheio sem aprovação. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-15 | Fase 1 (Setup) | Constitution 1.13.0 (exceção (i)) aprovada e aplicada; nota 073 na ADR-013; `pix_payer_domain`; spec com clarificações do execute (A002–A005). | Fase 2 (serviço: Pix, D-005/D-006, rotas TV). |
| 2026-10-15 | Fase 2 (Foundational) | Pix pela API de pagamentos, reaproveitamento/expiração/renew, D-005 (pedido excedente + estorno pelo claim), D-006, rotas da TV. pytest 158/158 (emulador), ruff limpo. | Fase 3 (US1 na TV, contratos 4/5). |
| 2026-10-15 | Fase 3 (US1) | Cliente Pix, tela de Pix, textos (área `purchase.ts`), bloqueio e painel; R-013 corrigido; E2E novo + legibilidade verdes; contratos 4/4. | R-014 (E2E da 071 instável também na base) aguarda decisão; depois Fase 4 (US2, portal). |

| 2026-10-15 | Desvio T019a (R-014) | Disputa de trava nas leituras concorrentes do portal corrigida (sessão por leitura + toque otimista serializado; `/session/device` sem gravação). pytest 160/160, ruff limpo, `consulta-sob-demanda` 3/3, runner portal-* 4/4. | Fase 4 (US2). |

| 2026-10-15 | Fase 4 (US2) | `pendingOrder` em `/session/device` (leitura pura); portal com aba Comprar/Renovar, aviso de Pix pendente e FAQ. pytest 19/19 afetados, portal lint/build/test/E2E 17/17. | Fase 5 (US3: cópia do código de recuperação). |

| 2026-10-15 | Fase 5 (US3) | Escrow do código (serviço + rotas), envio no Atualizar (TV), cartão "Mostrar código" (portal). Contratos 5/5, pytest 163/163, portal E2E 18/18, `consulta-sob-demanda` PASS. Retenção não precisou mudar (documento único sobrescrito). | Polish (T029–T034; staging e TV física com confirmação). |

| 2026-10-15 | Polish (automatizado) | Docs (`docs/portal/operacao.md`), suítes completas (TV 3370/3370 e E2E 50/50; API 163/163; portal 18/18), revisão de segredos e quickstart registrados em `evidencias/`. Teste antigo do bloqueio ajustado ao foco inicial em Comprar licença (D-011). | T030 staging e T034 TV física (confirmação do usuário); R-015 instabilidade do portal. |

| 2026-10-15 | T030 (staging, parcial) | Histórico local reescrito para tirar `staging.env.yaml` e `.cache` (R-017); build `80164b62` e deploy (`ccplaytv-portal-00020-nzt`, jobs `00019-sk9`) com `CHECKOUT_ENABLED=true` só no staging; cópia/revelação do código validadas no staging; Pix recusado pelo Mercado Pago (401 causa 7) mesmo com comprador de teste (`pix_test_payer_email` criado, pytest 165/165). | R-001: liberar a credencial do vendedor no Mercado Pago. |

| 2026-10-15 | T030 (staging, concluída com ressalva) | Pix não validável (conta vendedora de teste sem Pix; usuário decidiu validar com cartão). Cobrança direta pela API recusada (401 causa 7) também com cartão; Checkout Pro sandbox pago pelo usuário (comprador de teste) → pedido `approved` pela consulta autenticada, Atualizar da TV recebeu licença `active` de 365 dias, portal `active`, `pendingOrder` limpo. | T034 (TV física) e decisão sobre `CHECKOUT_ENABLED` do staging. |

**PRÓXIMO**: T034 (TV física, gate SC-007) com confirmação do usuário — atenção: o QR do Pix na TV não terá Pix real para gerar no staging (R-001); decidir o que a passada na TV valida. Decidir se `CHECKOUT_ENABLED` do staging volta a `false`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `api/app/portal/recovery_escrow.py`, `api/app/portal/routes/recovery_escrow.py`, `api/app/portal/models.py`
- `tv-web/src/lib/portal/recoveryEscrow.ts`, `tv-web/src/lib/portal/portalAgent.ts`, `features/portal/usePortalIntegration.tsx`
- `portal-web/src/features/RecoveryCodeCard.tsx`, `features/LicensePage.tsx`, `features/api.ts`, `lib/i18n/{index,faq}.ts`
- `api/tests/portal/test_recovery_escrow.py`, `tv-web/src/lib/portal/portalAgent.test.ts`, `portal-web/e2e/licenca.spec.ts`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- pytest do portal: emulador via `cloud_firestore_emulator.cmd start --host=127.0.0.1 --port=8085` (gcloud SDK em `G:\Users\johns\AppData\Local\Google\Cloud SDK\...\platform\cloud-firestore-emulator\`) com `JAVA_HOME` do Android Studio; `tmp_path` exige `"--basetemp=<scratchpad>\pytest"` (o `pytest-of-johns` do Temp nega acesso).
- `seeded()` cria um `AuthService` com época própria: para testar "outra TV", use um segundo `prepared()` (pedido de outra TV), não um bearer de outro `seeded()` — senão a recusa vem da época, não do dono do pedido.
- Em PowerShell, `[IO.File]` não segue o `cd` do shell: use caminho absoluto.
- `logs/tizen-simulator-mcp.log` fica travado por outro processo: `git stash`/`git worktree add`/`git checkout HEAD -- …` falham ao resetar o índice. Para comparar com a base, exporte com `git archive` e extraia com `C:\Windows\System32\tar.exe` (o `tar` do Git trata `C:` como host).
- `e2e/consulta-sob-demanda.mjs` e `e2e/portal-*` sobem o próprio emulador na 8085: pare o emulador avulso antes (TaskStop) e religue depois para o pytest.
- `messages/portal.ts` está perto do teto de 300 linhas: texto novo da compra vai em `messages/purchase.ts`.
