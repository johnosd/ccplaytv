# Handoff — 078-prontidao-publicacao-samsung

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca` (worktree com muitas mudanças de outras features — não as toque).
- Stack desta feature: scripts Node ESM em `tv-web/scripts/release/` (Vitest projeto `node`), XML/YAML do projeto Tizen em `CCPlayTv/`, HTML estático em `bridge/`.
- Próximo comando: `/sdd-execute 078-prontidao-publicacao-samsung`. Backlog: **Planejada**, 0/53 (conta tasks + checklist de release).
- A spec foi revisada nesta sessão contra o Launch Checklist oficial (seção "Revisão 2026-10-16" em Clarifications) — releia-a, não confie em resumo antigo.
- `reports/samsung-launch-checklist-2026-10-16.md` (não versionado) é uma análise anterior útil: `.wgt` atual diverge de 11 assets, 3 entradas obsoletas no yaml, `build_type: Debug`.

## O que a feature entrega

- US1 (P1) candidato identificado por revisão/árvore/variante/versão/hash; árvore suja bloqueia.
- US2 (P1) gate técnico do pacote **e** correções do pacote: `required_version` 2.3→**8.0**, `<name>` →**CCPlayTV**, `build_type` →**Release**, entradas obsoletas fora de `files:`. Nenhum privilégio novo; `productinfo` **fica** (uso real), com confirmação registrada no ledger.
- US3 (P1) matriz só com alvo visto na TV (inicial: BR · QN50Q60DAGXZD).
- US4 (P1) kit versionado em `release/samsung/kit/`; artes **não** são criadas — ficam `Pending` com dono.
- US5 (P1) política de privacidade em `bridge/privacidade/index.html` → `https://johnosd.github.io/ccplaytv/privacidade/` (decisão do usuário: GitHub Pages + nota na ADR-012).
- US6 (P1) evidências por ambiente; **TV física é gate obrigatório**; emulador é dispensável (bloqueado `118, -4`).
- US7 (P2) rerodar marca o relatório anterior obsoleto.
- Primeira distribuição prevista: variante **base** (o comercial não tem licença de teste para o revisor, R-004).

## Leitura obrigatória, em ordem

1. `spec.md` — FRs revisados (FR-003a/b/c, FR-005, FR-007a, FR-014a/b, SC-010).
2. `plan.md` — Decisões D-001…D-011, riscos R-001…R-008, tabela de contratos.
3. `logic/gate.md` — regra exata de cada verificação; o contrato segue isto à risca.
4. `data-model.md` — formato de cada arquivo em `release/samsung/`.
5. `tasks.md` — 9 fases, T001–T041.
6. `quickstart.md` — empacotar, rodar o gate, TV física sem desinstalar, conferir a página.
7. `.planning/memory/constitution.md` v1.15.0 — Segredos; "Validação em hardware real" (exceção de gate obrigatório).

## Testes de contrato

- `tv-web/scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs` — 5 testes, travado: decisão (Fase 2), candidato (Fase 3), pacote + privilégios (Fase 4), kit (Fase 5).
- Rodar: `cd tv-web; npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs` (filtro por fase com `-t "decisão"`, `-t "candidato"`, `-t "pacote|privilégios"`, `-t "kit"`).
- Integridade: `powershell -NoProfile -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 078-prontidao-publicacao-samsung` (da raiz).
- Outras travas que esta feature pode quebrar: `tv-web/scripts/pacoteTizen.fundacao-visual.contract.test.mjs` (feature 021) importa `findUnlistedFiles` de `tizenFiles.mjs` — não mude a assinatura dela, só **adicione** `findStaleDeclared`.

## Stubs criados

- `tv-web/scripts/release/checklist.mjs` — **final**, não stub: `STATUS`, `CHECKLIST` (33 itens com `klass/blocker/waivable/ref`), `checklistItem`. Os contratos iteram o `CHECKLIST`; mudar IDs ou `waivable` quebra o teste de decisão.
- `candidate.mjs`, `packageChecks.mjs`, `privileges.mjs`, `kit.mjs`, `decision.mjs` — assinaturas com JSDoc e `throw new Error('not implemented')`.
- A criar: `wgt.mjs`, `report.mjs`, `release-gate.mjs` (T003, T004, T008).

## Armadilhas já mapeadas

- Comparação de versão é **numérica** por componente (`0.10.0 > 0.9.0`); o contrato testa isso.
- `SAM-CFG-TITLE` compara com caixa: `CCPlayTv` ≠ `CCPlayTV`.
- `network.public` sem `usedBy.base` bloqueia a base — no ledger real a base **usa** (`lib/portal/platformProbe.ts` chama `getMac`/`getDuid` em toda inicialização, `main.tsx`).
- Resultados nunca ecoam conteúdo (o contrato do kit procura o segredo no `JSON.stringify` do resultado).
- `config.xml` lido pelo gate é o **de dentro do `.wgt`** (D-003); o do disco só entra no inventário.
- PowerShell: `npm run x -- --flag` perde o `--`; chame `node scripts/release/release-gate.mjs ...` direto.
- Não leia `.env`, `docs/m3u/dados.md` nem o perfil de certificado no gate; do certificado, só `issuer` e `fingerprint256` do X509 público em `author-signature.xml`.
- `tizen-tv`: nunca desinstalar (apaga IndexedDB); o nome do perfil não leva o `O` da coluna `[Active]`.
- `findStaleDeclared` deve ignorar `icon.png`, `favicon.svg`, `icons.svg` (vêm do projeto Tizen, não do `dist/`) — confirme quais o `dist/` emite de fato antes de fixar a lista.
- E-mail VOC/contato: **perguntar ao usuário** (T021). Não usar o e-mail da conta do usuário sem resposta explícita.
- A página só é publicada no merge em `main` (`bridge-pages.yml`); até lá `SAM-KIT-PRIVACY` fica `Pending`.

## Pendências do Analyze

- A-01 MEDIUM — `SAM-REG-PACKAGENAME`/`SAM-REG-APPID` não têm task explícita no CLI; ligar em T016 a partir de `published.json` (`packageNameChecked`, `appId`; `null` → `Pending`).
- A-02 MEDIUM — FR-010a/`SAM-KIT-LISTING` exige título **e** descrição em cada idioma; `logic/gate.md` §5 só valida hash/segredo. Em T020/T023, exigir artefato por idioma de `pt/en/es` com título e descrição não vazios.
- A-03 MEDIUM — FR-012 (validade do acesso cobre a janela de revisão; licença no comercial) não tem verificação; em T022/T023, `demo-access.md` com campos `validUntil`/`variant` e `SAM-KIT-TESTACCESS` `Blocked` para `commercial` enquanto R-004 existir.
- A-04 LOW — contagem do backlog (53) inclui o Checklist de Release; esperado.

## Gate de pronto

- 5/5 contratos verdes e trava íntegra; `npx vitest run scripts` verde (inclui contrato da 021).
- `npm run lint`, `npm run test`, `npm run build:tizen` verdes; `npm run test:e2e` antes da TV.
- `quickstart.md` §2–§7; relatório `release/samsung/reports/<version>-base.*` commitado com o veredito real.
- Docs no Polish: `docs/guia-praticas-app-tv/10_checklist_de_lancamento.md`, uma linha em `CLAUDE.md` Commands, ideias no backlog, nota na ADR-012.
- TV física é **gate obrigatório** desta feature; fechar sem ela exige decisão explícita do usuário registrada em Riscos e Decisões.
