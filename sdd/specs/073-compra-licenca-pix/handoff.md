# Handoff — 073 (execução em outra sessão)

## Contexto

Repositório `ccplayTv`, branch `feature/licenca`. Stack: TS/React 19 (TV `tv-web/`, portal `portal-web/`) +
Python/FastAPI (`api/app/portal/`, Cloud Run/Firestore — **não** é o fallback congelado da ADR-008). Próximo comando:
`/sdd-execute 073-compra-licenca-pix` (pausa por fase por padrão). Backlog: **Planejada**. A 069 está "Encerrada com
riscos aceitos" com **venda desligada**; 070/071/072 mudaram ID, chave, Atualizar e desvincular — esta feature não
desfaz nada disso.

## O que a feature entrega

- **P1 / US1** — Botão **Comprar licença** no bloqueio e em Portal & licença abre tela com **Pix dinâmico** (QR +
  copia-e-cola) gerado pelo serviço no Mercado Pago; pagar no banco; **Atualizar** recebe a licença e entra na lista.
- **P2 / US2** — Portal: aba Ativar vira **Renovar licença**/**Comprar licença**, avisa Pix pendente da TV, mantém
  checkout (Pix e cartão).
- **P3 / US3** — Portal mostra o **código de recuperação** por ação explícita, de uma cópia cifrada enviada pela TV.
- Decisões do usuário contra a expectativa óbvia: **nada automático** — nem polling na tela de Pix (só Atualizar,
  ADR-016 intacta); **só Pix na TV** (cartão pelo portal); Pix pendente **reaproveitado**, novo só por "Gerar novo
  Pix"; o serviço **passa a guardar cópia decifrável** do código (risco aceito, exige constitution 1.13.0); venda real
  **fora** (gates R-022–R-026 da 069).

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001..FR-015, SC-001..SC-007, clarificações (contexto do que já existe).
2. `plan.md` — D-001..D-013, Constitution Check (emenda 1.13.0), R-001..R-011, estratégia de testes.
3. `tasks.md` — T001..T034 por fase.
4. `logic/pix-e-codigo.md` — §1 serviço Pix, §2 cliente TV, §3 estados/textos exatos da tela, §4 escrow, §5
   pagamento excedente, §6 integração (gate, painel, portal).
5. `contracts/portal-api-073.md` — rotas novas, `PixView`, `PixCharge`, limites, `no-store`.
6. `data-model.md` — campos novos de `OrderDocument`, `RecoveryEscrowDocument`, `escrowedCodeVersion`.
7. `research.md` — por que Payments API, e-mail sintético, reaproveitamento, excedente, escrow pela TV.
8. `quickstart.md` — comandos, cenário ponta a ponta, TV física.
9. `.planning/memory/constitution.md` (1.12.0 hoje) e ADR-013/016/017.

## Testes de contrato (5, travados)

- `tv-web/src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx` (3) — Fase 3
- `tv-web/src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts` (1) — Fase 3
- `tv-web/src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts` (1) — Fase 5

Comando (em `tv-web/`): `npx vitest run src/features/portal/LicensePixScreen.compra-licenca-pix.contract.test.tsx src/lib/licensing/pixPurchase.compra-licenca-pix.contract.test.ts src/lib/portal/recoveryEscrow.compra-licenca-pix.contract.test.ts`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 073-compra-licenca-pix`. Hoje 5/5
**vermelhos** (3 por texto ausente — stub renderiza `null` —, 2 por `not implemented`).

Travas que esta feature pode quebrar: **069** (C1–C5), **070**, **071**, **072**, **026**. Rodar
`check-contract-tests.ps1` de todas em cada gate. O script só conta `it`/`test` do Vitest: os invariantes do serviço
estão como pytest **obrigatório** (T010, T022, T027), não como contrato.

## Stubs criados

- `tv-web/src/lib/licensing/pixPurchase.ts` — tipos `PixState`/`PixCharge`/`PixPurchasePort`/`PixPurchaseDeps`
  fixados; `createPixPurchase` com `throw` (T011).
- `tv-web/src/features/portal/LicensePixScreen.tsx` — props `{ purchase, onLicensed, onBack }`; corpo `return null`
  (T013).
- `tv-web/src/lib/portal/recoveryEscrow.ts` — `escrowRecoveryCode(db, transport, signal)` com `throw` (T024).

## Armadilhas já mapeadas

- **Modal singleton** (`components/Modal.tsx`): um segundo `Modal` montado com outro ativo **não renderiza**. O gate
  tem de desmontar o seu antes de mostrar a tela de Pix (R-006).
- **Ratchet**: `features/settings` → `features/portal` seria import feature→feature novo e **falha** `npm run lint`.
  Painel abre a tela por `lib/licensing/pixPurchaseRuntime.ts`; quem renderiza é `usePortalIntegration.tsx` (D-010).
- **Índices do painel**: `PortalLicensePanel` usa 0–5 + 6 (Atualizar) + 7–10 (backup); a ação nova entra no 7 e o
  backup vai para 8 — `PORTAL_ACTION_COUNT`, `PortalLicenseTab.tsx` e testes juntos (R-007).
- **Código de recuperação no serviço** hoje é só HMAC (`recovery_codes.py`, `DeviceDocument.recovery_code_hmac`): não
  tente "ler" o código no servidor; a cópia vem da TV e só é mostrada se o HMAC bater com o corrente (D-008).
- **Textos do contrato** (pt, exatos): "Pagamento ainda não confirmado.", "Sem conexão com o serviço.", "Este Pix
  venceu.", botões "Atualizar", "Voltar", "Tentar novamente", "Gerar novo Pix"; prazo "… 30 min"; nunca "recusad…" em
  erro. `useT()` sem provider cai em pt (como no `LicenseGate.test.tsx`).
- **Tela sem pausa própria no Atualizar**: o contrato aperta Atualizar duas vezes seguidas; a pausa de 10 s fica no
  agente (`refreshPortal('license')`), dentro da porta, não na tela.
- **`approve` hoje trava** com segundo pagamento no mesmo pedido (`try_again` eterno) — D-005 resolve; não "corrigir"
  bloqueando o checkout do portal.
- **Notificação de tentativa antiga** não pode cancelar o pedido corrente (D-006) — senão o Pix recém-gerado some.
- **Testes de API pulam** sem `PORTAL_TEST_FIRESTORE=1` e emulador em `127.0.0.1:8085`; pulado ≠ verde.
- **Mercado Pago Pix** exige `payer.email` e chave Pix na conta: se o sandbox recusar o e-mail sintético, **parar e
  perguntar** (R-001), não coletar e-mail na TV.
- **Venda**: `checkout_enabled` falso fora do staging de teste; a rota de Pix respeita a mesma flag (D-012).
- **Publicação**: API no staging antes do pacote na TV; staging e TV física só com confirmação do usuário.
- **Emulador**: `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'` ou `npm run dev:portal`.

## Pendências do Analyze

| ID | Sev. | Resumo | Recomendação |
| --- | --- | --- | --- |
| A001 | HIGH | Constitution 1.13.0 (exceção (i), cópia decifrável do código) ainda não aprovada; sem ela a US3 viola "Segredos". | T001 primeiro; não iniciar a Fase 5 sem aprovação explícita. |
| A002 | MEDIUM | O usuário escolheu "serviço guarda cópia ao gerar"; o plano faz a TV enviar a cópia no Atualizar (D-008, research §5). Efeito visível: logo após rotação o portal pede "aperte Atualizar na TV". | Confirmar com o usuário na T001; se ele exigir gravação no ato da geração, reabrir o design (4 fluxos write-ahead). |
| A003 | LOW | US1/AC5: após o provedor cancelar o Pix vencido, reabrir gera Pix novo sem a mensagem "venceu" (R-005). | Aceitar (reabrir já é ação explícita) ou emendar a spec. |
| A004 | LOW | FR-003 pede orientação de cartão "com o QR fixo existente"; a tela de Pix só cita o site (o QR fixo fica no bloqueio, ao lado) para não pôr dois QRs na mesma tela. | Confirmar com o usuário ou adicionar o QR fixo pequeno na tela de Pix. |
| A005 | LOW | Spec (Assumptions) diz que mostrar o código no portal amplia a constitution; na verdade 1.8.0 já permite revelar no portal — o que é novo é a cópia no serviço. | Ajustar a redação da Assumption na T001. |

## Gate de pronto

Contratos 5/5 verdes e travas 073/072/071/070/069/026 íntegras; TV `npx tsc -b`, `npm run lint`, `npm run test`,
`npm run build`, `npm run build:tizen`; `node e2e/compra-licenca-pix.mjs`, `node e2e/legibilidade-tv.mjs` e
`npm run test:e2e` com `npm run dev`; API `pytest tests/portal` com emulador (sem `skipped` nos arquivos da feature) +
`ruff`; portal lint/test/build/E2E; revisão de segredos (T032); quickstart §3 (T033); docs no Polish (T029);
constitution 1.13.0 e nota na ADR-013. **Staging de teste e TV física exigem confirmação do usuário**; a passada na
TV física (QR lido do sofá, SC-007) é **gate** desta feature; venda real continua desligada.
