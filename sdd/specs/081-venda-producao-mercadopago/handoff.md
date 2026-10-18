# Handoff — 081-venda-producao-mercadopago

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. Stack tocada: serviço do portal Python/FastAPI
  (`api/app/portal/`), TV React/Vite (`tv-web/`), portal React (`portal-web/`), scripts PowerShell + `gcloud`
  (`infra/portal/`).
- Próximo comando: `/sdd-execute 081-venda-producao-mercadopago`.
- Backlog: **Planejada** (0/52; o script conta também o Checklist de Release).
- Havia mudanças não commitadas de outras frentes no início desta sessão (079 e assessment do Stripe). Não são
  desta feature; não mexer.

## O que a feature entrega

- **P1 (US1)**: produção num **projeto GCP novo** com `portal.ccplaytv.com`, chaves novas (`kid=prod1`), **venda
  fechada**. Pacote comercial da TV confiando só em `prod1`, recusando a chave da homologação sob qualquer `kid`.
- **P2 (US2)**: venda aberta em modo real; vendedor "**CCPlayTV**" + `ccplaytv@gmail.com` (sem CPF/endereço, risco
  aceito); reembolso de 7 dias **manual** no painel; duas compras reais (cartão + Pix) **ambas estornadas**. Se o Pix
  com pagador sintético for recusado, lançar só com cartão no portal (409 `pix_disabled` → TV mostra QR do site).
- **P3 (US3)**: restore ensaiado com conciliação, alertas, homologação **mantida mínima** (serviços em min 0;
  apaga Scheduler, backups e bucket do journal) — não é encerrar o projeto.

## Leitura obrigatória, em ordem

1. `spec.md`: FRs, decisões do usuário em Clarifications.
2. `plan.md`: Decisões Invariantes D-001–D-011 (a D-004 reinterpreta o FR-001), riscos R-001–R-009.
3. `tasks.md`: tasks `[USUÁRIO]` exigem confirmação na hora.
4. `logic/preflight.md`: algoritmo e CLI da checagem prévia.
5. `research.md`: R1–R4, a confirmar em fonte oficial antes da task que depende.
6. `quickstart.md`.
7. `.planning/memory/constitution.md` (1.15.0), em especial "Segredos".

## Testes de contrato

- Arquivos travados:
  - `api/tests/portal/test_venda_producao_contract.py` (3 testes, Fase 2);
  - `tv-web/scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs` (1, Fase 3);
  - `tv-web/src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx` (1, Fase 4).
- **Total 5.** O lock diz "2" porque o script não conta `def test_`.
- Rodar:
  ```powershell
  uv --directory api run pytest tests/portal/test_venda_producao_contract.py -q
  cd tv-web; npx vitest run src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs
  ```
- Trava: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 081-venda-producao-mercadopago`.
- Outra trava afetada: `sdd/specs/073-compra-licenca-pix/contract-tests.lock` cobre
  `LicensePixScreen.compra-licenca-pix.contract.test.tsx`. Esses 3 testes precisam continuar verdes depois de T021/T022.

## Stubs criados

- `api/app/portal/providers/mercadopago_preflight.py`: `CHECKS` e `preflight()` com `NotImplementedError`; falta
  o CLI `__main__`.
- `tv-web/scripts/revokedLicenseKeys.mjs`: `revokedLicenseKeys = []`. T016 coloca a chave pública da homologação.

## Armadilhas já mapeadas

- **Nunca ler `infra/portal/*.env.yaml`** (nem "listar os nomes" com split): o PEM multilinha vazou a chave de
  assinatura da homologação em 2026-10-15 e de novo em 2026-10-17. Teste de existência: `Select-String -Quiet`.
  A chave pública da homologação vem do endpoint **público** `/portal/v1/license-keys`.
- `PortalSettings()` em produção exige todas as chaves privadas. Por isso o CLI do preflight lê só três variáveis,
  e o wrapper ignora o bloco PEM.
- `portalClient.ts` normaliza qualquer código desconhecido para `service_unavailable` e só lê o corpo em 401/409
  (`BODY_CODES`). `pix_disabled` precisa entrar nos dois conjuntos, senão o contrato 5 nunca passa.
- `AuthError` com código fora de `AUTH_CODES` vira `unauthorized` 401 silenciosamente: incluir `pix_disabled`.
- `api/tests/portal/test_pix.py` (~linha 73) espera 503 com domínio ausente: muda para 409 (T010); o caso de
  venda fechada continua 503.
- `deploy-jobs-env.ps1` só faz `services update`: no projeto novo o jobs ainda não existe (T007 `-Create`).
- Ordem do domínio (R-005): certificado da produção ativo **antes** de trocar `PUBLIC_ORIGIN`; a homologação volta
  ao `run.app` dela, senão o portal dela recusa a origem.
- `tv-web` tem catraca de 300 linhas por arquivo (`npm run lint`); `purchase.ts` existe porque `portal.ts` está no
  teto.
- PowerShell: `npm run x -- --flag` perde o `--`; chamar `node scripts/...` direto. Array em `-Paths` do script de
  trava só funciona via `-Command "& ... -Paths 'a','b'"`.
- Suíte do portal com Firestore exige o emulador em `127.0.0.1:8085` e `PORTAL_TEST_FIRESTORE=1`.

## Pendências do Analyze

- A1: resolvido em 2026-10-17. FR-001 emendado (o domínio do pagador só é exigido com o Pix oferecido), coerente
  com a D-004.
- A2: resolvido em 2026-10-17. A documentação oficial confirma que não há sinal de backup agendado. O usuário
  aceitou o risco: sem alerta de backup, só checagem semanal no runbook (FR-012 emendado, R-006 aceito, T032/T037
  ajustadas). **Não** implementar alerta de backup.
- A3 (LOW, aberto por natureza): SC-005 só se verifica depois do fechamento do mês seguinte à redução da
  homologação. Fica como pendência datada (T035); não bloqueia o fechamento das fases.

## Gate de pronto

- 5/5 contratos verdes e travas da 081 e da 073 íntegras.
- `pytest tests/portal` (com emulador) + `ruff`.
- `tv-web`: `npm run test`/`lint`/`build`, `node e2e/compra-licenca-pix.mjs`, `node e2e/legibilidade-tv.mjs`,
  `npm run test:e2e` com `npm run dev` no ar.
- `portal-web`: `lint`/`build`/Playwright.
- `quickstart.md` executado.
- Docs: `operacao.md` (runbook), `deploy-staging.md`, `infra/portal/README.md`, ADR-013 (emenda inline), gates da
  069, 078/T054 e backlog.
- **TV física é gate obrigatório** desta feature (T018, T028); fechar sem ela exige decisão explícita do usuário.
