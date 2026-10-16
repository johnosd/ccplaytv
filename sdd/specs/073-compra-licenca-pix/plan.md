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
| Execução | Implementada: 51/51 tasks (Fases 1–7, incluindo a Phase 7 de convergência). Próximo: `sdd-converge`. |
| Gates finais | API `pytest tests/portal` 167/167 + ruff; portal unit 8/8, lint, build, E2E 19/19; TV `npm run test` 3421/3421, tsc, lint, `node e2e/run.mjs` 51/51, `consulta-sob-demanda` PASS; contratos 5/5, trava íntegra. |
| TV física (T034) | Aprovada pelo usuário com cartão no portal (licença até 15/10/2027; 2ª compra +12 meses). QR do Pix do sofá não executado (R-001, risco aceito). `evidencias/tv.md`. |
| Staging | `ccplaytv-portal-00022-c55` / jobs `00021-4f6`, `CHECKOUT_ENABLED=false`. Endurecimento T036 do portal ainda não publicado (equivalente ao publicado). |
| Conciliação (R-018) | `/session/device` e Atualizar da TV conciliam o pedido em aberto (≤ 1 consulta/10 s por pedido); webhook do Mercado Pago segue 401 (069/T036). |
| Segredos | `evidencias/segredos.md` cobre copia-e-cola, escrow e a sessão do portal na aba (só ID/CSRF/validade). |
| Abertos | R-001 (Pix na conta vendedora), R-015 (E2E do portal instável), R-016 (rotacionar chave do staging), branch `backup/pre-rewrite-073` (não fazer push; apagar). |
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
| R-018 | Decisão da T034 (extensão da D-004), registrada pelo converge (C3): com o webhook do Mercado Pago recusado (401, 069/T036), o cartão pago no portal só virava licença quando alguém lia `GET /orders/<id>` | Alto (pagou e não recebeu) | Resolvido: `reconcile_open_order` (`api/app/portal/pix_orders.py`) concilia o pedido em aberto da TV em `GET /session/device` (abrir/atualizar o portal) e em `POST /device/entitlement/refresh` (Atualizar da TV) — mesma consulta autenticada do `read_order`, no máximo uma ao provedor a cada 10 s por pedido (`reconcile_after`), provedor fora do ar/não configurado não derruba a resposta. ADR-016 intacta: só por ação da pessoa, nenhum timer na TV. Na TV, "Licença atualizada." passou a comparar situação + validade (o JWS é reassinado a cada Atualizar); sem mudança: "A licença não mudou…". Pedido de checkout abandonado segue aberto e consultado só nessas ações (baixo custo, sem expiração própria — herdado da 069). Testes: `test_pix.py::test_tv_refresh_reconciles_open_card_order_without_webhook`, `useRefreshAction.test.tsx`; validado na TV física (T034). |

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

| 2026-10-16 | T034 (TV física, em andamento) | Rodada 1: pacote sem config comercial (botões inertes) → refeito. Rodada 2 (usuário): QR e Comprar OK; compra por cartão falhou em 3 pontos — portal voltava ao login (sessão só em memória), pedido não conciliado (webhook 401), TV dizia "Licença atualizada" sem mudança. Corrigido: sessão na aba + retorno abre a compra; `/session/device` e Atualizar da TV conciliam o pedido em aberto; impressão da licença por situação/validade. pytest portal 166/166, ruff, portal 8/8 + E2E 19/19, TV 3421/3421, tsc, lint, travas OK. Staging `ccplaytv-portal-00021-wmg` / jobs `00020-5d5`; TV reinstalada. Detalhes em `evidencias/tv.md`. | Reteste do usuário (cartão no portal → Atualizar na TV). |

| 2026-10-16 | T034 (concluída) | Reteste do usuário: Atualizar trouxe a licença paga (validade 15/10/2027); nova compra voltou à aba de compra e somou +12 meses. QR Pix do sofá não executado (R-001, risco aceito). Staging com `CHECKOUT_ENABLED=false` (`ccplaytv-portal-00022-c55`, jobs `00021-4f6`, conferido em `/offer`); `CCPlayTv/assets` de volta ao build comum. 47/47, status Implementada. | `sdd-converge`. |

| 2026-10-16 | Phase 7 (Convergence) | T035 teste código do portal → recuperação após reinstalar; T036 segredos da sessão na aba (+ `rememberSession` só com 3 campos); T037 R-018; T038 gate E2E. pytest 167/167, ruff, portal 8/8 + E2E 19/19, TV E2E 51/51, `consulta-sob-demanda` PASS, trava íntegra. 51/51 tasks. | `sdd-converge`. |

**PRÓXIMO**: `/sdd-converge 073-compra-licenca-pix`. Abertos: R-001 (Pix real na conta vendedora), webhook 401 do Mercado Pago (069/T036), R-015 (E2E do portal instável), R-016 (rotacionar a chave de assinatura antes de produção); apagar a branch `backup/pre-rewrite-073` sem push; publicar o endurecimento T036 do portal no próximo deploy.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `api/app/portal/pix_orders.py` (`reconcile_open_order`), `api/app/portal/routes/licensing.py` (`reconcile_open`)
- `portal-web/src/main.tsx`, `portal-web/src/App.tsx`, `portal-web/src/features/api.ts` (sessão na aba, retorno do checkout)
- `tv-web/src/lib/portal/useRefreshAction.ts` (impressão da licença), `tv-web/src/lib/i18n/messages/portal.ts`
- `api/tests/portal/test_pix.py`, `api/tests/portal/test_recovery_escrow.py`, `portal-web/e2e/{licenca,configuracao}.spec.ts`
- `sdd/specs/073-compra-licenca-pix/evidencias/{tv,segredos}.md`
## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- TV física (T034, 2026-10-15): o primeiro pacote instalado saiu **sem** `VITE_PORTAL_ORIGIN` (build não comercial em `CCPlayTv/`; `deploy-tv.ps1 -SkipBuild` empacota o que estiver lá). Sintoma na TV: QR não aparece e nenhum botão de Portal & licença responde (`getPortalConnection()` = `undefined` → tudo soft-disabled). Antes do `-SkipBuild`, rodar `npm run build:tizen:commercial` com as duas variáveis no **mesmo processo** e conferir `portal.ccplaytv.com` em `CCPlayTv/assets/index.js` (e ausência de `"d":"`).
- pytest do portal: emulador via `cloud_firestore_emulator.cmd start --host=127.0.0.1 --port=8085` (gcloud SDK em `G:\Users\johns\AppData\Local\Google\Cloud SDK\...\platform\cloud-firestore-emulator\`) com `JAVA_HOME` do Android Studio; `tmp_path` exige `"--basetemp=<scratchpad>\pytest"` (o `pytest-of-johns` do Temp nega acesso).
- `seeded()` cria um `AuthService` com época própria: para testar "outra TV", use um segundo `prepared()` (pedido de outra TV), não um bearer de outro `seeded()` — senão a recusa vem da época, não do dono do pedido.
- Em PowerShell, `[IO.File]` não segue o `cd` do shell: use caminho absoluto.
- `logs/tizen-simulator-mcp.log` fica travado por outro processo: `git stash`/`git worktree add`/`git checkout HEAD -- …` falham ao resetar o índice. Para comparar com a base, exporte com `git archive` e extraia com `C:\Windows\System32\tar.exe` (o `tar` do Git trata `C:` como host).
- `e2e/consulta-sob-demanda.mjs` e `e2e/portal-*` sobem o próprio emulador na 8085: pare o emulador avulso antes (TaskStop) e religue depois para o pytest.
- `messages/portal.ts` está perto do teto de 300 linhas: texto novo da compra vai em `messages/purchase.ts`.
