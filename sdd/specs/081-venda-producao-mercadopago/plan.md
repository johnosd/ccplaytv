# Implementation Plan: Venda em produção com Mercado Pago

**Slug**: `081-venda-producao-mercadopago` | **Date**: 2026-10-17 | **Spec**: `sdd/specs/081-venda-producao-mercadopago/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Hoje não há como vender: a configuração recusa checkout fora da homologação, `portal.ccplaytv.com` é o serviço de
homologação e a chave de assinatura dele vazou duas vezes. A feature cria uma produção separada num projeto GCP novo,
com chaves novas e o domínio. Libera no código a venda em modo real **só** em produção, com uma checagem prévia das
credenciais que imprime só booleanos. O pacote comercial da TV passa a confiar só na chave de produção e recusa a
chave revogada sob qualquer `kid`. A venda é homologada com duas compras reais estornadas. Por fim: backup com
restore ensaiado, alertas e redução da homologação a custo zero. A integração com o Mercado Pago (Checkout Pro, Pix,
webhook, conciliação, estorno) já existe e **não é reescrita**: só ganha campos de qualidade na preferência e o estado
`pix_disabled` (FR-010).

## Technical Context

**Language/Version**: Python 3.13 (serviço do portal, `api/app/portal/`, `uv`); TypeScript 5 + React 19 (TV em
`tv-web/`, portal em `portal-web/`); PowerShell 5.1/7 (scripts em `infra/portal/`).

**Primary Dependencies**: FastAPI, pydantic-settings, httpx (serviço); Vite/Vitest/Playwright (TV e portal);
`gcloud` CLI (infra). Nenhuma dependência nova.

**Storage**: Firestore Native (projeto novo, database `(default)`, `us-central1`); bucket Cloud Storage do journal;
IndexedDB na TV (sem mudança).

**Testing**: `uv run pytest` (portal; testes com Firestore exigem o emulador e `PORTAL_TEST_FIRESTORE=1`),
`uv run ruff check .`; `npm run test` em `tv-web/` (projetos `dom`/`node`; `scripts/**/*.test.mjs` roda no `node`);
Playwright do portal (`portal-web/e2e`, dev server em 5174) e E2E da TV (`tv-web/e2e`).

**Target Platform**: Cloud Run (público + jobs) num projeto GCP novo; TV Samsung de referência (Tizen 9) com o
pacote `build:tizen:commercial`; navegador para o portal.

**Performance Goals**: N/A (piloto de 10–50 TVs; carga 069/T043 é risco aceito, R-003).

**Constraints**: nenhum segredo em log, saída de script, argumento de CLI, evidência ou commit (constitution;
memória `nunca-ler-staging-env-yaml`); sem KMS/Secret Manager (decisão da 069: arquivo de ambiente privado
ignorado); sem consulta automática da TV ao serviço (ADR-016); toda ação em nuvem real e todo pagamento real é
feito ou autorizado pelo usuário na hora.

**Scale/Scope**: 1 projeto GCP, 2 serviços Cloud Run, 1 conta Mercado Pago (CPF), 2 compras reais de teste.

## Decisões Invariantes

- **D-001 Projeto próprio**: produção num projeto GCP novo (ID escolhido pelo usuário em T012), região
  `us-central1`, database `(default)`. Os serviços mantêm os nomes `ccplaytv-portal` e `ccplaytv-portal-jobs`
  dentro do projeto novo; o que separa os ambientes é o projeto. Scripts de infra recebem `-ProjectId` e
  `-SourceEnv` **obrigatórios**, sem padrão apontando para a homologação (`ccplaytv-511322`).
- **D-002 Chaves novas**: AES, ES256, HMACs e `SERVICE_RECOVERY_EPOCH` gerados para a produção, nunca copiados da
  homologação. `kid` de assinatura da produção = `prod1`. Arquivo `infra/portal/production.env.yaml`, ignorado pelo
  Git, gerado por script que **não imprime valores**. Cópia protegida fora do repositório fica com o usuário.
- **D-003 Matriz de liberação** (`settings.py`):
  - `production` + checkout ⇒ exige `mercadopago_live_mode=true` (`live_mode_required`) e token, merchant e
    segredo do webhook (`checkout_credentials_required`).
  - `staging` + checkout ⇒ exige modo teste (`checkout_not_released`, como hoje).
  - `development`/`test` + checkout ⇒ `checkout_not_released`.
  - `allow_test_live_mode` e `pix_test_payer_email` continuam proibidos fora da homologação.
  - Produção com venda fechada pode ter `live_mode=true` sem credenciais (US1).
- **D-004 Pix opcional (FR-010)**: Pix ligado ⇔ `CCPLAY_PORTAL_PIX_PAYER_DOMAIN` presente (semântica atual).
  Com venda aberta e Pix desligado, `POST /device/orders/pix` responde **409 `pix_disabled`** (estado, não pane).
  Venda fechada continua 503 `service_unavailable`. A TV lê `pix_disabled` do corpo (como `recovery_required`) e
  mostra QR + endereço do site para pagar com cartão, sem "Tentar novamente". É o que o FR-001 diz desde a
  emenda de 2026-10-17 (Analyze A1): o domínio do pagador só é exigido quando o Pix é oferecido.
- **D-005 Checagem prévia**: `api/app/portal/providers/mercadopago_preflight.py` (`logic/preflight.md`) devolve
  quatro booleanos. Roda pelo wrapper `infra/portal/preflight-mercadopago.ps1`, que carrega só três variáveis de
  linha única no processo filho. A venda só abre com os quatro `true`. Exceção: `pix_enabled=false` é aceitável se
  a decisão for lançar sem Pix (D-004).
- **D-006 Ordem de abertura**:
  1. Deploy com `CHECKOUT_ENABLED=false`.
  2. Smokes, domínio e pacote da TV.
  3. Credenciais reais e checagem prévia.
  4. `CHECKOUT_ENABLED=true`.
  5. Compras reais e estornos.
  6. A venda fica aberta.
  Fechar a venda = `CHECKOUT_ENABLED=false` nos dois serviços (runbook).
- **D-007 Revogação da chave da homologação**: a TV comercial confia só nas chaves do mapa embutido. O build
  recusa, sob qualquer `kid`, as chaves públicas de `tv-web/scripts/revokedLicenseKeys.mjs`. A chave pública da
  homologação vem do JWKS **público** (`GET https://portal.ccplaytv.com/portal/v1/license-keys` enquanto o domínio
  ainda é da homologação, ou do `run.app` dela depois). **Nunca** de `staging.env.yaml`.
- **D-008 Vendedor e reembolso**:
  - Vendedor exibido: "CCPlayTV" + `ccplaytv@gmail.com`; sem CPF e sem endereço (risco aceito, R-007).
  - Reembolso em até 7 dias, pedido por esse e-mail e estornado à mão no painel do Mercado Pago.
  - O serviço revoga a concessão pelo webhook ou pela conciliação já existentes (069/073); nenhum código novo de
    reembolso.
  - Textos em pt/en/es: tela de Pix da TV, aba Licença do portal ("Antes de pagar") e FAQ do portal. Não criar
    página de termos separada.
- **D-009 Preferência**: só os campos de qualidade de `research.md` R1; preço, prazo, moeda, `external_reference`,
  `back_urls`, `notification_url` e exclusões de meio de pagamento ficam como estão.
- **D-010 Homologação reduzida**: depois da migração, na homologação (`ccplaytv-511322`):
  - apagar o job do Scheduler, a agenda de backup e os backups, e o bucket do journal;
  - `CHECKOUT_ENABLED=false`, `PUBLIC_ORIGIN` = URL `run.app`;
  - serviços em min 0;
  - Firestore e Artifact Registry mantidos (só a imagem mais recente).
  Cada comando destrutivo é confirmado pelo usuário na hora.
- **D-011 Dados**: nada migra da homologação. A TV do usuário reinstala o pacote novo e se recadastra (ADR-015
  devolve o mesmo ID se a origem for `mac`/`derived`). Listas locais ficam.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Exceção comercial da 069 já cobre licença. Abertura, listas, configuração e compra continuam sem conta; a venda fechada mostra estado honesto. |
| Segredos Fora dos Clientes e dos Logs | ⚠️ | ✅ | Risco real: o incidente de 2026-10-17. Mitigado por D-002, D-005, D-007 e T043. Contrato do preflight cobre o vazamento do token. Token MP só no arquivo privado e no serviço; nunca no pacote da TV nem no portal. |
| Categorias da Fonte São Preservadas | N/A | N/A | Não toca catálogo. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede | ✅ | ✅ | A decisão de licença continua local; compra e Atualizar só por ação da pessoa (ADR-016). |
| Trailers e Metadados | N/A | N/A | — |
| Caminho Completo por Controle Remoto | ✅ | ✅ | O estado `pix_disabled` tem Voltar focável. O cartão no site já é exceção aceita (069), com QR e endereço na TV. |
| Lista ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Contrato 4 exige Voltar ativável no estado novo. |
| Voltar Restaura Foco | ✅ | ✅ | O chamador já devolve o foco a "Comprar licença" (073), sem mudança. |
| Identidade de Reprodução | N/A | N/A | — |
| Progresso e Capacidades São Reais | ✅ | ✅ | "Pix indisponível, pague com cartão" é estado real. Nenhum preço ou prazo inventado (oferta fixa da 069). |
| Documentação É Canônica | ✅ | ✅ | Runbook, ADR-013, gates da 069, 078/T054 e scripts com novo parâmetro são atualizados na mesma tarefa (T037–T039). |
| Restrição: backend client-first / exceção 069 | ⚠️ | ✅ | A exceção diz que "não autoriza lançamento comercial" sem validação própria. Esta feature **é** essa validação (restore, TV física, compras reais). Ok, desde que US3 e o roteiro na TV não sejam pulados. |
| Validação em hardware real | ✅ | ✅ | **Gate obrigatório desta feature**: compra real na TV física (Pix ou o caminho FR-010) e o roteiro SC-001. Fechar sem ele exige decisão explícita do usuário. |
| Fluxo: testes, E2E, revisão de segredos | ✅ | ✅ | T040–T043. |

Sem violação não justificável; Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/081-venda-producao-mercadopago/
├── spec.md
├── plan.md                 # este arquivo
├── research.md             # R1–R4: itens a confirmar em fonte oficial durante a execução
├── logic/preflight.md      # algoritmo da checagem prévia
├── quickstart.md           # verificação manual (nuvem, Mercado Pago, TV)
├── tasks.md
├── handoff.md
├── contract-tests.lock
└── evidencias/             # criado no execute (só booleanos, revisões, horários; nunca valores)
```

### Source Code (repository root)

```text
api/
├── app/portal/
│   ├── settings.py                      # D-003 (matriz de liberação)
│   ├── auth.py                          # AUTH_CODES += "pix_disabled"
│   ├── pix_orders.py                    # D-004 (409 pix_disabled)
│   ├── routes/licensing.py              # sem mudança de rota esperada
│   └── providers/
│       ├── mercadopago.py               # D-009 (campos de qualidade)
│       └── mercadopago_preflight.py     # NOVO (stub do plan) — D-005
└── tests/portal/
    ├── test_venda_producao_contract.py  # CONTRATO (3 testes, travado)
    ├── test_bootstrap.py                # ajustar ao D-003 se algum assert antigo divergir
    ├── test_pix.py                      # assert 503→409 do domínio ausente (linha ~73)
    └── test_mercadopago.py              # + campos de qualidade
tv-web/
├── scripts/
│   ├── commercialConfig.mjs             # D-007 (recusa chave revogada)
│   ├── revokedLicenseKeys.mjs           # NOVO (stub vazio do plan)
│   └── commercialConfig.venda-producao-mercadopago.contract.test.mjs  # CONTRATO (1, travado)
├── src/lib/portal/portalClient.ts       # pix_disabled em errorCodes/BODY_CODES
├── src/features/portal/
│   ├── LicensePixScreen.tsx             # estado pix_disabled + vendedor/reembolso
│   └── LicensePixScreen.venda-producao-mercadopago.contract.test.tsx  # CONTRATO (1, travado)
├── src/lib/i18n/messages/purchase.ts    # textos pt/en/es
└── e2e/compra-licenca-pix.mjs, e2e/legibilidade-tv.mjs
portal-web/
├── src/features/license/LicenseCard.tsx # vendedor/contato/reembolso em "Antes de pagar"
├── src/lib/i18n/index.ts, faq.ts        # textos pt/en/es
└── e2e/licenca.spec.ts
infra/portal/
├── bootstrap-gcp.ps1, deploy-jobs-env.ps1   # -ProjectId/-SourceEnv obrigatórios; jobs: primeiro deploy
├── provision-production.ps1             # NOVO: bucket/role/scheduler/backup/budget, dry-run padrão
├── new-production-env.ps1               # NOVO: gera production.env.yaml sem imprimir valores
├── preflight-mercadopago.ps1            # NOVO: wrapper da checagem prévia
├── alerts-production.ps1                # NOVO: métricas/políticas de alerta, dry-run padrão
└── README.md
docs/portal/operacao.md, docs/portal/deploy-staging.md   # runbook de produção; homologação reduzida
sdd/adr/ADR-013-portal-controle-serverless-google-cloud.md  # emenda inline (081)
.gitignore                               # production.env.yaml
```

**Structure Decision**: monorepo existente. O serviço do portal fica em `api/app/portal/`, a TV em `tv-web/`, o
portal web em `portal-web/` e a infra como scripts PowerShell em `infra/portal/`. Nenhum diretório novo de código;
só arquivos novos nos lugares listados acima.

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso). A parte de nuvem e de pagamento real
só é verificável manualmente (`quickstart.md`); o código que a sustenta (matriz, preflight, `pix_disabled`,
revogação de chave) é coberto por contrato.

Comandos-base:

```powershell
# serviço (da raiz)
uv --directory api run pytest tests/portal -q          # com emulador: $env:PORTAL_TEST_FIRESTORE='1'
uv --directory api run ruff check .
# TV
cd tv-web; npm run test; npm run lint; npm run build
node e2e/compra-licenca-pix.mjs; node e2e/legibilidade-tv.mjs   # com npm run dev no ar
# portal
cd portal-web; npm run lint; npm run build; npx playwright test e2e/licenca.spec.ts   # dev server em 5174
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
- `api/tests/portal/test_venda_producao_contract.py`
- `tv-web/src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx`
- `tv-web/scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs`

**Total real: 5 testes.** O script de trava conta só `it(`/`test(` e por isso registra "2/5": as três funções
`def test_` do arquivo Python não entram na contagem dele.

Comandos:

```powershell
uv --directory api run pytest tests/portal/test_venda_producao_contract.py -q
cd tv-web; npx vitest run src/features/portal/LicensePixScreen.venda-producao-mercadopago.contract.test.tsx scripts/commercialConfig.venda-producao-mercadopago.contract.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 081-venda-producao-mercadopago
```

| Teste | Origem | Fase | Vermelho confirmado (2026-10-17) |
| --- | --- | --- | --- |
| `test_production_releases_checkout_only_live_and_complete_and_refuses_test_options` | FR-001–003, SC-003 | Fase 2 | `ValidationError: checkout_not_released` na configuração de produção válida |
| `test_pix_off_with_sale_open_is_pix_disabled_and_closed_sale_stays_unavailable` | FR-010 | Fase 2 | `assert ('service_unavailable', 503) == ('pix_disabled', 409)` |
| `test_preflight_reports_only_booleans_and_never_leaks_the_token` | FR-004, SC-006, Constitution: Segredos | Fase 2 | `NotImplementedError: 081: preflight` |
| `build comercial recusa chave pública revogada sob qualquer kid e aceita uma chave nova` | FR-007, US1/AC2 | Fase 3 | `expected 0 to be greater than 0` (lista de revogadas vazia) |
| `Pix desligado com venda aberta mostra QR e endereço do site para pagar com cartão, sem Tentar novamente; Voltar sai` | FR-010, US2/AC5, Constitution: Foco | Fase 4 | `Unable to find an element with the text: /portal\.fixture\.test/` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
- `api/app/portal/providers/mercadopago_preflight.py`: `preflight()` levanta `NotImplementedError`.
- `tv-web/scripts/revokedLicenseKeys.mjs`: `revokedLicenseKeys = []`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Concluída: T001 (conta MP, webhook produtivo, Pix e banco; credenciais no `.env` da raiz) e T002 |
| Foundational | Concluída: matriz D-003, `pix_disabled` 409, preflight + CLI + wrapper, scripts de infra com parâmetros obrigatórios, `provision-production.ps1`, gerador `production_env.py`; 3/3 contratos Python verdes |
| US1 | **Concluída**: `ccplaytv-prod` no domínio `portal.ccplaytv.com` com venda fechada, tick 200, chave `prod1`; TV física repareada na produção (SC-001 aprovado pelo usuário) |
| US2 | Código pronto e publicado (`:081-us2`; TV com a tela nova): `pix_disabled`/`pix_failed` com o site, vendedor/reembolso na TV e no portal, preferência com `virtual_goods`/`CCPLAYTV`; credenciais reais na produção e checagem prévia 4/4. Falta: T026 abrir a venda, T027–T029 compras reais e estornos (usuário) |
| 5b | **Concluída e publicada**: campo MAC do portal (não reescreve durante a digitação) e 10 tentativas antes do bloqueio; público `00002-98z`, jobs `00002-dkl` |
| US3 | Não iniciada |
| Nuvem | Produção `ccplaytv-prod` no domínio; homologação `ccplaytv-511322` no `run.app` dela (ainda com Scheduler/backup/journal — reduzir na T034); `pocanalytics1` sem faturamento |
## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Pix com pagador sintético recusado pelo provedor real (073 R-001) | Médio: lançamento sem Pix na TV | D-004/FR-010: lançar só com cartão no portal; prova na compra real (T028). |
| R-002 | Vazamento de segredo durante a execução (já ocorreu duas vezes com `staging.env.yaml`) | Alto: forja de licença / uso indevido da conta MP | D-002, D-005; memória `nunca-ler-staging-env-yaml`; nunca `Get-Content` de arquivo `*.env.yaml`; só testes booleanos por chave (`Select-String -Quiet`); T043 revisa o diff. A chave da homologação fica revogada (D-007). |
| R-003 | Carga não medida (069/T043) | Baixo no piloto | Risco aceito pelo usuário (2026-10-17); max 2 instâncias, alertas de orçamento. |
| R-004 | Venda fora do Samsung Checkout questionada na revisão da loja (078 R-006) | Rejeição da variante comercial | Risco aceito na 078; fora do escopo. |
| R-005 | Troca do domínio derruba o portal entre o fim da homologação e a produção responder com TLS | Portal fora do ar por minutos/horas | Ordem do `operacao.md`: mapeamento + certificado na produção antes de trocar `PUBLIC_ORIGIN`. Só a TV do usuário usa hoje. Rollback documentado. |
| R-006 | Sem sinal nativo de "backup não rodou" no Firestore (research R3) | Backup velho sem alerta | **Aceito pelo usuário (2026-10-17, Analyze A2)**: confirmado na documentação oficial que o backup agendado não emite log/métrica/alerta (`research.md` R3). Sem alerta automático; `manage-backup.ps1 -Action inspect` semanal no runbook (T037). Um backup velho pode passar até 7 dias sem ser notado. FR-012 emendado. |
| R-007 | Identificação do vendedor fica aquém do Decreto 7.962 (só "CCPlayTV" + e-mail) | Jurídico | Risco aceito pelo usuário (2026-10-17). |
| R-008 | Tarifa do Mercado Pago pode não voltar no estorno das duas compras de teste | ~R$ 2–4 | Aceito (spec, Assumptions). |
| R-010 | Trecho de 28 caracteres do client secret de produção colado na conversa e escrito no `.env.example` versionado (2026-10-17) | Baixo: a integração não usa client ID/secret (só access token + segredo do webhook) | `.env.example` voltou a placeholders vazios antes de qualquer commit. **Risco aceito pelo usuário: não renovar o client secret.** Se um dia o OAuth/client credentials for usado, renovar antes. |
| R-011 | Conta de faturamento `019D1E-9F4271-E5FBF5` no limite de projetos vinculados (5); `ccplaytv-prod` criado mas sem faturamento (2026-10-17) | Bloqueia T012 e toda a nuvem da US1 | Decisão do usuário: desvincular um projeto alheio, pedir aumento de cota ao Google, ou outra conta de faturamento. Não desvincular a homologação antes da troca do domínio (T017). |
| R-012 | (T018, usuário) Falha ao gerar o Pix com a venda aberta mostrava só "indisponível": a pessoa desistiria sem saber que pode comprar no site | Venda perdida | T044: código `pix_failed` 503 para falha do provedor (venda fechada segue `service_unavailable` e Pix desligado `pix_disabled`, preservando o contrato travado), e a TV oferece QR/endereço do site + Tentar novamente. FR-010 emendado. |
| R-013 | (T027) A volta do Checkout no celular cai numa aba nova; a sessão ficava só no `sessionStorage` da aba (069/T034) → login | Compra abandonada | Decisão da 081 (T047): sessão (deviceId, CSRF, validade) e pedido conhecido no `localStorage`. O CSRF sozinho não autoriza nada sem o cookie HttpOnly/SameSite=Strict; a retomada confere no servidor; validade ≤ 8 h; Sair apaga. Risco residual: o CSRF fica no navegador até expirar mesmo com a aba fechada (XSS já o leria em qualquer dos dois armazenamentos). |
| R-014 | (T027, 2026-10-17/18) Compra aprovada e concessão válida no servidor (portal mostra "Active license" até 17/10/2027), mas a TV não grava a licença: `sync_error` = `AbortError` com `QuotaExceededError` no IndexedDB (armazenamento do app cheio, mesmo com `unlimitedstorage`). Mesma causa provável do `AbortError` do Desvincular (T018). | **Bloqueia** T027–T029: cliente com listas grandes pode pagar e não receber a licença | Decisão do usuário: corrigir agora via `sdd-bugfix` (fora do escopo da 081: catálogo/pré-carga) e só então retomar T027. Diagnóstico temporário em `tv-web/src/lib/portal/portalAgent.ts` (`sync_error \| …`) instalado na TV — **reverter antes de commit**. |
| R-009 | Pacote comercial antigo (homologação) na TV do usuário depois da troca do domínio | A TV deixa de achar o serviço | T018 reinstala o pacote novo antes de reduzir a homologação. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-17 | Setup | T002: `.gitignore` com `infra/portal/production.env.yaml` e `jobs.env.yaml` (conferido com `git check-ignore -v`). Trava íntegra. | T001 com o usuário (conta MP em CPF, Pix, credenciais e webhook de produção) |

| 2026-10-17 | Fase 2 | T003–T011: matriz de liberação, `pix_disabled`, preflight (CLI + wrapper), scripts de produção (provisionamento, gerador de ambiente, jobs `-Create`). Contratos Python 3/3; `pytest tests/portal` 179 passed com emulador; ruff limpo. | Fase 3 exige o usuário: criar o projeto GCP (T012) |

| 2026-10-17 | Fase 3 (parcial) | T016 revogação da chave `v1`; T012 projeto criado (cota de faturamento resolvida desvinculando `pocanalytics1`); T013 env de produção (`prod1`); T014 journal/backup/orçamento/Scheduler; T015 build + deploy (smokes ok, jobs 403 anônimo). Bugs de script achados e corrigidos: `$PSScriptRoot` vazio em default de param (5.1), `ConvertFrom-Json '[]'` (5.1), aspas no `SERVICE_ROLE`, orçamento não idempotente. | Tick do Scheduler sem prova; T017 domínio e T018 TV dependem do usuário |

| 2026-10-17 | Fase 3 (fechada) | Índices do Firestore faltando na produção (tick 500) → passo `indexes`; domínio movido; TV reinstalada e repareada (Desvincular falhou 2× com `AbortError`, depois funcionou; `[Bug]` no backlog). SC-001 aprovado pelo usuário. Tasks novas T044, T045, T046. | Cópia protegida das chaves (usuário) |

| 2026-10-17 | Fase 5b | T046 campo MAC (formatador comia o 3º caractere e reescrevia o valor durante a composição do teclado do celular) e T045 limite 10/15 min; publicado `:081-5b`. | Usuário confirmar no celular |

| 2026-10-17 | Fase 4 (código + T025) | T020–T024, T044, T030, T031: TV e portal; E2E Pix (desligado/falhou/feliz) PASS; legibilidade 129 telas 0 achados; portal 16/16 + layout 11/11; categorias oficiais do MP confirmadas. T025: credenciais do `.env` por script, checagem prévia 4/4; imagem `:081-us2` publicada com venda fechada; TV com o pacote novo. | T026 (abrir a venda) aguarda confirmação do usuário |

| 2026-10-18 | Fase 4 (T027) | Cartão: 1ª tentativa em revisão foi recusada (titular = vendedor), 2ª aprovada (pedido `approved`, concessão `valid` 18/10/2026–18/10/2027, portal "Active license"). TV não recebe: `QuotaExceededError` no IndexedDB (R-014). T047 publicada (volta numa aba nova, textos de compra não paga). Notificações IPN legadas recusadas (401) — decisão do usuário pendente. | Bugfix da quota na TV antes de seguir |

**PRÓXIMO**: `sdd-bugfix` da quota do IndexedDB na TV (R-014); depois retomar T027 (Atualizar na TV recebe a licença), T028 (Pix), T029 (estornos). Reverter o diagnóstico de `portalAgent.ts` antes de commitar.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->



- `infra/portal/provision-production.ps1` (passo `indexes`), `deploy-jobs-env.ps1`, `new-production-env.ps1`
- `tv-web/scripts/revokedLicenseKeys.mjs`, `commercialConfig.mjs`
- `sdd/specs/081-venda-producao-mercadopago/evidencias/infra.md`, `tv.md`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Emulador do Firestore para `pytest tests/portal`: o `java` do PATH é 17; subir com `JAVA_HOME` (Android Studio jbr, 21) no PATH do processo: `cmd /c <sdk>\platform\cloud-firestore-emulator\cloud_firestore_emulator.cmd start --host=127.0.0.1 --port=8085`, depois `PORTAL_TEST_FIRESTORE=1` + `FIRESTORE_EMULATOR_HOST`.
- Credenciais de produção do Mercado Pago estão no `.env` da **raiz** como `MP_ACCESS_TOKEN_PRODUCTION`/`MP_WEBHOOK_SECRET_PRODUCTION` (não `CCPLAY_PORTAL_*`); T025 copia por script, sem ler na conversa.
- A homologação teve `PUBLIC_ORIGIN` trocado por `--update-env-vars` para o `run.app` dela; o `infra/portal/staging.env.yaml` local ainda diz `portal.ccplaytv.com`: um redeploy da homologação com esse arquivo quebraria a origem dela (não abrir o arquivo; passar `--update-env-vars` de novo ou ajustar a linha por regex).
- Domain mappings do Cloud Run: o gcloud desta máquina não tem o componente `beta`; usar a API REST `https://us-central1-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/<projeto>/domainmappings` com token só em variável.
- Trocar a TV de ambiente (homologação → produção) **não** recadastra: a reinstalação preserva o pareamento antigo e o QR leva uma chave que o novo serviço não conhece. É preciso **Desvincular** (Portal & licença) e abrir Adicionar lista; o backup falha nesse passo (bearer antigo), os dados locais ficam. Registrar no runbook (T037).
- **Nunca** `git stash push -- <caminho>` neste repositório para comparar com a base: ele levou junto arquivos *staged* de outras frentes (079, backlog) e o `pop` parou num arquivo reescrito pelo Playwright (`test-results/.last-run.json`); recuperado sem perda. Para comparar com a base, usar `git worktree`.
- `portal-web/e2e/gerenciador.spec.ts:95` falha em paralelo também no código base (corrida com a consulta periódica; 073 R-015); em série passa.
- Scripts `.ps1` rodam no Windows PowerShell 5.1: com `ErrorActionPreference=Stop`, stderr de executável nativo vira exceção — baixar para `Continue` em volta de chamadas como `git check-ignore`.
