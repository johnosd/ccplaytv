# Implementation Plan: Prontidão para publicação do app Samsung TV

**Slug**: `078-prontidao-publicacao-samsung` | **Date**: 2026-10-16 | **Spec**: `sdd/specs/078-prontidao-publicacao-samsung/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Um gate local, repetível e auditável que transforma o Launch Checklist do Samsung TV Seller Office
em verificações com ID estável. É um conjunto de módulos Node puros em
`tv-web/scripts/release/` e um CLI (`release-gate.mjs`) que lê git, o `.wgt` assinado e os dados
versionados em `release/samsung/` (ledger de privilégios, matriz de alvos, custódia do certificado,
evidências, kit) e grava um relatório `Ready for submission`/`Blocked` por variante. A feature também
corrige o que o gate já sabe que bloqueia hoje: `required_version` `2.3` → `8.0`, `build_type` `Debug`
→ `Release`, `<name>` `CCPlayTv` → `CCPlayTV`, inventário Tizen com entradas obsoletas. Publica a
política de privacidade como página estática em `bridge/privacidade/` (GitHub Pages, nota na ADR-012)
e monta o kit com textos e referências sanitizadas; artes ficam `Pending` com dono. O Seller Office
continua manual.

## Technical Context

**Language/Version**: JavaScript ESM (Node 24, `@types/node` ^24) para o gate; XML/YAML do projeto Tizen; HTML/CSS estático para a página de privacidade.

**Primary Dependencies**: só `node:` (`crypto` com `X509Certificate`, `zlib.inflateRawSync`, `fs`, `child_process` para git). **Nenhuma dependência nova** — o `.wgt` é zip e é lido por um leitor mínimo de diretório central.

**Storage**: arquivos JSON/Markdown versionados em `release/samsung/` (data-model.md). `.wgt` fora do git (`*.wgt`, `.buildResult/`).

**Testing**: Vitest projeto `node` (`scripts/**/*.test.mjs`, `tv-web/vite.config.ts`); E2E Playwright existente (`npm run test:e2e`) só como evidência de não-regressão; TV física pela skill `tizen-tv`.

**Target Platform**: máquina de desenvolvimento Windows (PowerShell 5.1/7, Tizen Studio CLI) gerando pacote para Samsung Tizen TV (`tv-samsung`, referência QN50Q60DAGXZD, Tizen 9.0 / Chromium 120; build `chrome108`).

**Performance Goals**: N/A (o gate roda em segundos sobre um `.wgt` de ~1 MB).

**Constraints**: nada de login/upload no Seller Office; nenhum segredo em kit/relatório/log; código do app fora de escopo (só `config.xml`, `tizen_web_project.yaml` e scripts de pacote); `docs/m3u/dados.md` e `.env` nunca lidos pelo gate.

**Scale/Scope**: 1 Tizen ID, 2 variantes (base, comercial), ~33 itens de checklist, matriz inicial de 1 país × 1 modelo.

## Decisões Invariantes

- **D-001** O gate é código puro + dados versionados. Módulos de `tv-web/scripts/release/` recebem dados prontos; só `release-gate.mjs` toca git, disco e `.wgt`. Regras exatas em `logic/gate.md`.
- **D-002** IDs do checklist são os de `checklist.mjs` (`SAM-*` obrigatório Samsung, nunca dispensável; `INT-*` interno). Mudar um ID exige reabrir o design (os contratos dependem deles).
- **D-003** Os arquivos de configuração e o certificado de autor lidos pelo gate vêm de **dentro do `.wgt`**, não do disco; o disco só entra na comparação de inventário.
- **D-004** `required_version="8.0"` (decisão do usuário, 2026-10-16): piso do build `chrome108`. O piso do gate (`runtimeFloor`) é `8.0` e vive no CLI como constante ao lado do alvo do `vite.config.ts`.
- **D-005** Uma variante distribuída por Tizen ID (`distribution.json`). Primeira distribuição prevista: **base** — o comercial não tem como dar licença de teste a um revisor (R-004).
- **D-006** Política de privacidade = `bridge/privacidade/index.html` (pt/en/es numa só página), publicada pelo `bridge-pages.yml` em `https://johnosd.github.io/ccplaytv/privacidade/` (decisão do usuário). O app nunca carrega essa página. Uma página cobre as duas variantes.
- **D-007** Título de loja = `CCPlayTV`; `config.xml` `<name>` passa a `CCPlayTV` (só caixa). `SAM-CFG-TITLE` compara exatamente.
- **D-008** `productinfo` e `network.public` ficam (uso real em `lib/portal/platformProbe.ts` e `lib/portal/portalRuntime.ts`). `productinfo` entra no ledger com `confirmation` apontando a doc Samsung ProductInfo (nível Public); `SAM-PRV` só passa com essa confirmação registrada.
- **D-009** Emulador é o único gate de ambiente dispensável (`INT-EVD-EMULATOR`, `waivable`); TV física (`INT-EVD-TV`) é **gate obrigatório** desta feature (exceção da constitution "Validação em hardware real").
- **D-010** Relatórios sobrescrevem `release/samsung/reports/<version>-<variant>.{json,md}`; histórico = git. Evidência com hash de `.wgt` diferente do candidato não conta.
- **D-011** Contatos (VOC e e-mail da política) **não são inventados**: o executor pergunta ao usuário antes de escrever qualquer e-mail público (R-005).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ N/A | ✅ N/A | Nenhuma mudança de comportamento do app. |
| Segredos Fora dos Clientes e dos Logs | ⚠️ risco | ✅ | Kit/relatório podem receber credencial de demo ou trecho do `.wgt`. Mitigado: `INT-KIT-SECRETS` (contrato 4 prova que o segredo não é ecoado), demo só como referência sanitizada, gate não lê `.env`/`docs/m3u/dados.md`, fingerprint público do certificado e nunca chave/senha. |
| Categorias da Fonte São Preservadas | ✅ N/A | ✅ N/A | — |
| IA e Classificação Nunca Inventam Dados | ✅ N/A | ✅ | Análogo: o gate nunca marca `Pass` sem evidência (item ausente = `Pending`, contrato 5). |
| Comandos Locais Independem de Rede | ✅ N/A | ✅ N/A | Página de privacidade não é carregada pelo app. |
| Trailers e Metadados | ✅ N/A | ✅ N/A | — |
| Caminho Completo por Controle Remoto | ✅ N/A | ✅ N/A | Sem tela nova. |
| Lista ≠ Manifesto de Streaming | ✅ N/A | ✅ N/A | — |
| Foco Visível e Sem Becos Sem Saída | ✅ N/A | ✅ N/A | Sem tela nova; roteiro de TV (quickstart §4) reconfere RETURN em cada camada. |
| Voltar Restaura Foco e Posição | ✅ N/A | ✅ N/A | — |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Atualização preserva favoritos/histórico/retomada (INT-UPD-PRESERVE), verificada sem desinstalar. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Análogo: matriz não anuncia alvo sem evidência de TV (contrato 5). |
| Documentação do Repositório É Canônica | ✅ | ✅ | ADR-012 ganha nota de atualização (privacidade); CLAUDE.md não ganha parágrafo de status; `release/samsung/README.md` documenta o gate. |
| Restrição: Plataforma-alvo | ⚠️ | ✅ | `required_version` 8.0 declara Tizen 8.0+ enquanto só Tizen 9.0 foi medido. Mitigado: Seller Office/matriz limitam aos modelos comprovados (FR-006); R-001. |
| Restrição: Uso pessoal com intenção comercial | ⚠️ | ✅ | Esta feature prepara, não autoriza, distribuição; a decisão `Ready for submission` é do gate + pessoa. Licenças de terceiros (TMDB atribuição) entram no texto da listagem (T022). |
| Fluxo: testes automatizados / E2E antes de TV / revisão de segredos | ✅ | ✅ | Vitest `node` por task; `npm run test:e2e` antes da passada na TV; revisão de segredos no kit é o próprio `INT-KIT-SECRETS`. |

Nenhuma violação não justificável.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/078-prontidao-publicacao-samsung/
├── spec.md
├── plan.md               # este arquivo
├── data-model.md         # arquivos de release/samsung/
├── logic/gate.md         # regras exatas de cada verificação
├── quickstart.md         # verificação manual, TV física, privacidade
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
CCPlayTv/
├── config.xml                    # T: required_version 8.0, <name> CCPlayTV
└── tizen_web_project.yaml        # T: build_type Release, entradas obsoletas fora
bridge/
├── trailer/index.html            # existente (ADR-012)
└── privacidade/index.html        # NOVO — política pt/en/es
.github/workflows/bridge-pages.yml  # existente, publica bridge/ (sem mudança)
release/samsung/                  # NOVO — dados do gate e kit (data-model.md)
tv-web/scripts/
├── sync-tizen.mjs                # T: recusa entrada declarada obsoleta
├── tizenFiles.mjs                # T: findStaleDeclared
└── release/                      # NOVO
    ├── checklist.mjs             # catálogo (pronto, do plan)
    ├── candidate.mjs             # stub
    ├── packageChecks.mjs         # stub
    ├── privileges.mjs            # stub
    ├── kit.mjs                   # stub
    ├── decision.mjs              # stub
    ├── wgt.mjs                   # T: leitor zip mínimo
    ├── report.mjs                # T: Markdown do relatório
    ├── release-gate.mjs          # T: CLI
    └── releaseGate.prontidao-publicacao.contract.test.mjs   # TRAVADO
sdd/adr/ADR-012-pagina-ponte-estatica-https-embeds-terceiro.md  # T: nota de atualização
```

**Structure Decision**: o gate fica junto dos outros guardas de pacote (`tv-web/scripts/`, mesma convenção de `tizenFiles.mjs`/`commercialConfig.mjs`, testados pelo projeto `node` do Vitest). Dados de release ficam fora de `tv-web/` porque descrevem o produto publicado, não o código web; `release/samsung/` na raiz deixa espaço para outras lojas. A página de privacidade usa a hospedagem estática já existente (`bridge/`).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Uso de `bridge/` (ADR-012) para uma página que não é ponte de embed | Seller Office exige URL pública HTTPS; é a única hospedagem estática gratuita já operando | Portal (Cloud Run) amarraria o build base ao serviço do portal; ADR nova seria desproporcional — nota de atualização na ADR-012, decidida pelo usuário |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
cd tv-web
npx vitest run scripts/release
npx vitest run scripts
npm run lint
npm run test
npm run build:tizen
node scripts/release/release-gate.mjs --variant base
cd ..
powershell -NoProfile -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 078-prontidao-publicacao-samsung
```

E2E: `npm run test:e2e` com `npm run dev` rodando — não há fluxo novo, mas é o gate da constitution antes da TV e vira evidência `INT-EVD-E2E`.

Manual: TV física (quickstart §4) é gate obrigatório; emulador (§5) é dispensável com justificativa.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tv-web/scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs`

Comando: `cd tv-web; npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| candidato registra revisão/versão/hash, árvore suja bloqueia e mudança de hash torna o anterior obsoleto | US1 · FR-001 · SC-009 | Fase 3 | `Error: not implemented` (candidate.mjs) |
| pacote: arquivos de assinatura, faixa de versão, required_version contra o piso, título, debug e inventário nos dois sentidos | US2 · FR-003/003a/003b/004 · FR-010a | Fase 4 | `Error: not implemented` (packageChecks.mjs) |
| privilégios: productinfo sem Checkout só passa com confirmação registrada; … | FR-005 | Fase 4 | `Error: not implemented` (privileges.mjs) |
| kit: hash, quatro JPEG …, logo com alfa, Not Applicable justificado e segredo bloqueado sem ser ecoado | US4 · FR-008/010/016 · Constitution: Segredos | Fase 5 | `Error: not implemented` (kit.mjs) |
| decisão: item ausente é pendência, Waived só em critério interno dispensável e só alvo com evidência de TV entra no conjunto aprovado | FR-006 · FR-014/014a · SC-001/003/008 · US3 · US6 | Fase 2 | `Error: not implemented` (decision.mjs) |

Vermelho confirmado em 2026-10-16: 5/5 falham por `not implemented`; `npx vitest run scripts` (demais 15 arquivos, 67 testes) verde.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/scripts/release/{candidate,packageChecks,privileges,kit,decision}.mjs`. `checklist.mjs` já é o catálogo final (dados, não stub).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — Setup | Concluída: `release/samsung/` com README e arquivos-base |
| Fase 2 — Foundational | Concluída: `decision.mjs`, `wgt.mjs`, `report.mjs`; contrato "decisão" verde |
| Fase 3 — US1 | Concluída: `candidate.mjs` e CLI `release-gate.mjs` (git, `.wgt`, `INT-DIST-VARIANT`, relatório, obsolescência); contrato "candidato" verde |
| Fase 4 — US2 | Concluída: `packageChecks`, `privileges`, `author`, ledger `privileges.json`, `findStaleDeclared`; CLI com pacote, inventário, privilégios, autor, custódia e `SAM-REG-*`; contratos pacote e privilégios verdes |
| Fase 5 — US4 | Concluída: `kit.mjs` (mídia, hash, segredos, listagem por idioma, VOC, acesso de teste) e kit real em `release/samsung/kit/`; CLI com `kitReader`; contrato kit verde — **5/5 contratos verdes** |
| Kit | `SAM-KIT-LISTING`, `VOC`, `LOGO`, `ICONBG`, `SHOTS`, `PRIVACY`, `INT-KIT-SECRETS`, `SAM-CFG-TITLE` Pass — mas capturas, privacidade e UI Description descrevem a **base**; com R-015 (comercial) são refeitas em T051–T053. `SAM-KIT-UIDESC` voltou a Pending (o pptx da T045 é da base e serve de molde) |
| Variante distribuída | **Comercial** (R-015, decisão da pessoa): mesmo app na loja e na TV dela; envio só depois de a pessoa habilitar a venda em produção (T055, já testada em homologação). T046 (portal escondido sem endereço) e T047 ("Agora:") ficam no código e entram no `.wgt` comercial (T048) |
| Fase 6 — US5 | Concluída: página publicada após o merge em `main` (200, idêntica ao repositório), `evidence/privacy-2026-10-17.json`, `SAM-KIT-PRIVACY` `Pass` |
| Fase 7 — US3+US6 | T030 E2E, T031 emulador `Waived` por `118, -4` e T032 TV física concluídos; TV QN50Q60DAGXZD aprovada pelo usuário |
| Fase 8 — US7 | Concluída: obsolescência por candidato, kit e `config.xml` do disco ≠ pacote; `release-gate.test.mjs` roda o CLI como processo |
| App sem "IPTV" | Textos trocados (T042, R-012), commitados e no `.wgt` candidato (`bc864e…`), validado na TV |
| Fase 9 | T036–T047 feitos; T048 aberta (novo candidato com T046/T047); quickstart §2–§6 verdes (§6 200 após o merge), §7 manual |
| Candidato | `CCPlayTV.wgt` 0.2.1, SHA-256 `bc864e…`, **anterior a T046/T047** — vai ser substituído em T048; com ele, o gate tinha 5 bloqueios da pessoa (agora 4: `INT-SEC-CUSTODY`, `SAM-REG-PACKAGENAME`, `SAM-REG-APPID`, `SAM-KIT-TESTACCESS`); E2E/TV/atualização valem só para esse hash |
| Pacote Tizen | `required_version` 8.0, `<name>CCPlayTV</name>`, `build_type: Release`, yaml sem obsoletas (inclui `EmptyState.js`, T043); `build:tizen` reproduzível |
| Custódia / registro | `custody.json` e `published.json` ainda vazios: `INT-SEC-CUSTODY` Blocked; `SAM-REG-*` Pending (dependem da pessoa) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `required_version` 8.0 oferece o app a TVs Tizen 8.0 (2024) que nunca foram testadas | Revisor/cliente em modelo não comprovado | Seleção de modelos no Seller Office restrita à matriz aprovada (FR-006); ampliar só com evidência |
| R-002 | Regra do checklist põe `productinfo` na lista do Samsung Checkout | Bloqueio no pré-teste | D-008: confirmação registrada no ledger (doc ProductInfo, nível Public); se o pré-teste recusar, nova decisão (remover uso do DUID no build base) |
| R-003 | Emulador bloqueado (`118, -4`) | `INT-EVD-EMULATOR` nunca passa | D-009: dispensável com dono e justificativa |
| R-004 | Build comercial sem mecanismo de licença/voucher de teste para o revisor (trial de 7 dias, sem cortesia no serviço) | `SAM-KIT-TESTACCESS` `Blocked` para o comercial | D-005: primeira distribuição é a base; mecanismo de licença de teste é feature futura (backlog) |
| R-005 | E-mail VOC/contato da política não definido | Kit e página incompletos | Resolvido: a pessoa respondeu `ccplaytv@gmail.com` para VOC e política (2026-10-16, T021); `SAM-KIT-VOC` `Pass` |
| R-006 | Venda de licença fora do Samsung Checkout pode ser questionada na revisão (fora do Launch Checklist) | Rejeição da variante comercial | Registrado na spec (Assumptions); só relevante quando o comercial for distribuído |
| R-007 | Mudar `<name>` para `CCPlayTV` altera o nome exibido no launcher da TV | Visível ao usuário (só caixa) | D-007; reconferido no roteiro da TV |
| R-009 | `application.launch` está no `config.xml` sem uso comprovado: o código só chama `getCurrentApplication().exit()` (`lib/tizenExit.ts`), que a doc Samsung não diz exigir privilégio. O ledger o registra com essa ressalva (privilégio mínimo é princípio, mas a spec proibiu mudar privilégios sem decisão) | Revisor pode estranhar privilégio sem uso | Decisão da pessoa: manter até a passada na TV (Fase 7) ou removê-lo e validar o botão Voltar/Sair na TV. Não removido nesta fase |
| R-008 | Remover entradas obsoletas de `files:` pode esconder um chunk que voltaria a ser emitido | `.wgt` sem arquivo, só falha na TV | `sync-tizen` passa a recusar tanto não listado quanto obsoleto: qualquer volta é pega no build |
| R-012 | Pedido do usuário (2026-10-16): nada de "IPTV" no kit, na página de privacidade nem no app — "playlists Xtream/M3U" nos textos, aba "Fontes IPTV" → "Playlists", título "Conecte sua lista IPTV" → "Conecte sua playlist" (pt/en/es), dicas e teste de conexão acompanhando | Toca contratos travados das features 026, 037 e 067 | Resolvido: emenda aprovada pelo usuário — só o texto esperado mudou nos 3 contratos, travas regravadas, R-0xx anotado em cada `plan.md`; testes e E2E que citavam os textos acompanharam. Exige reempacotar o `.wgt` (o candidato atual tem os textos antigos) |
| R-011 | Gravar evidência ou a linha da matriz depois do empacotamento sujaria a árvore e bloquearia `INT-CAND-TREE` do próprio candidato | Candidato nunca ficaria limpo depois de validado | `release/samsung/evidence/`, `reports/` e `target-matrix.json` não contam na árvore suja (saídas da validação); kit, ledger, `published.json` e `custody.json` continuam contando |
| R-013 | Duas sessões rodaram a 078 ao mesmo tempo (2026-10-17): `--record-local` de uma regravou `build-<data>-base.json` (mesmo nome de arquivo) com `Blocked` por cima do `Pass` commitado da outra, e o relatório também; as falhas do `npm run test` vieram da carga concorrente (a suíte passa sozinha) | Evidência e relatório corretos podem ser trocados por outros, de outro momento | Resolvido: arquivos restaurados do commit; evidências e relatório só são gravados por uma sessão — ver Cuidados |
| R-010 | `core.autocrlf=true` sem `.gitattributes`: no checkout os `.md` do kit voltariam com CRLF e o SHA-256 do manifest não bateria | Kit inteiro `Blocked` noutra máquina ou depois de um clone | `release/samsung/kit/.gitattributes` com `* -text` (bytes intactos); hash recalculado sempre que um artefato muda |
| R-014 | As capturas em inglês da UI Description (T045) mostraram, na variante base, a aba "Pelo site" como **aba inicial** do cadastro e as abas "Portal & licença"/"Backup", todas com "o portal ainda não está disponível" — recurso visível que não funciona, motivo comum de reprovação | Revisor cai num recurso morto logo no primeiro passo | Decisão do usuário (2026-10-17): esconder na base. `portalSurfacesVisible()` = `VITE_PORTAL_ORIGIN` presente **ou** `!PROD`: some só no build de loja sem portal; dev, E2E e testes (PROD falso) continuam com o estado honesto, e os contratos 067/070 (7 abas, aba do site) seguem verdes sem emenda. Custo: novo `.wgt` e evidências refeitas (T048). Ficam visíveis, sem decisão: itens desativados em Integrations (AI assistant, Weather) e Accessibility. **Atualização (2026-10-17):** superado por R-015 — a variante distribuída passa a ser a comercial (portal com endereço de produção), então nada fica escondido no pacote enviado; `portalSurfacesVisible` segue só para builds sem endereço do portal (pessoal/dev). A 080 (base com portal) foi cancelada antes do plano |
| R-015 | Decisão da pessoa (2026-10-17): **um app só** — a loja e a TV dela recebem a mesma versão, a **comercial completa** (portal, licença, teste local de 7 dias, compra por Pix); compra mantida e declarada à Samsung. Substitui D-005 ("primeira distribuição é a base"). A pessoa **não envia ainda**: prepara tudo e habilita a venda no serviço (`checkout_enabled`) antes da submissão | Reabre R-004 (acesso do revisor) e R-006 (venda fora do Samsung Checkout, risco de reprovação aceito); kit, privacidade, UI Description e capturas da loja precisam descrever o comercial; novo `.wgt` com `build:tizen:commercial` | T049–T055; R-006 aceito pela pessoa; R-004 tratado pelo teste local de 7 dias (o revisor instala do zero e ganha o teste), registrado em `demo-access.md` |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-16 | Fases 1–2 | Estrutura `release/samsung/`; decisão, leitor de `.wgt` e relatório; contrato "decisão" 1/1 verde, trava íntegra | Fase 3 (US1): `candidate.mjs` + CLI `release-gate.mjs` |
| 2026-10-16 | Fase 3 (US1) | `describeCandidate`/`compareWithPrevious`, CLI `release-gate.mjs` e `candidate.test.mjs`; contrato "candidato" 1/1 verde, trava íntegra | Fase 4 (US2): T010 `packageChecks.mjs` |
| 2026-10-16 | Fase 4 (US2) | Gate do pacote e privilégios; `findStaleDeclared` + guarda no `sync-tizen`; `config.xml` 8.0/CCPlayTV, yaml Release sem obsoletas; `author.mjs`; ledger; `.wgt` novo passa nos itens de pacote; contratos pacote+privilégios 2/2 verdes, trava íntegra | Fase 5 (US4): T020 `kit.mjs`, T021 perguntar e-mail VOC ao usuário |
| 2026-10-16 | Fase 5 (US4) | `kit.mjs` completo (A-02 e A-03 cobertos), kit real (manifest, listagem pt/en/es, UI Description, demo sanitizado), `kitReader` no CLI, `kit.test.mjs`; e-mail VOC respondido; contratos 5/5 verdes, trava íntegra | Fase 6 (US5): T025 página de privacidade |
| 2026-10-16 | Fase 6 (US5) | Página de privacidade pt/en/es (destinos de rede conferidos no código), nota na ADR-012, `privacy.mjs` + CLI + `privacy.test.mjs`; contratos 5/5 verdes, trava íntegra | Publicar via merge em `main` e gravar `evidence/privacy-*.json` |
| 2026-10-17 | T030/T031 + evidências | E2E 52/52; STATIC/BUILD `Pass`; emulador iniciou e confirmou `tv-samsung`, mas instalação falhou em `installing[9]` com `118, -4`; DUID estava no certificado e `sdb root on` deu `Permission denied`; `INT-EVD-EMULATOR` `Waived` | T032 TV física, T036 preservar relatório do novo hash e T041 quickstart |
| 2026-10-17 | T032/T036 fechamento | `deploy-tv.ps1 -SkipBuild` encontrou `192.168.0.2`, instalou por cima com o certificado Samsung, lançou `8tZqMtwANL.CCPlayTv` e `applist` confirmou `CCPlayTV`; usuário confirmou funcionamento correto; `INT-EVD-TV` e `INT-UPD-PRESERVE` `Pass`, matriz BR/QN50Q60DAGXZD `allowed`; relatório final preservado | T041 quickstart; itens externos de publicação |
| 2026-10-16 | T042 + Fase 8 (US7) | App, kit e privacidade sem "IPTV" (emenda 026/037/067 aprovada, travas regravadas, E2E afetados 4/4); obsolescência por kit e `config.xml`; `release-gate.test.mjs`; testes do gate 31/31 | Commit → `build:tizen` + reempacotar → T030–T032 |
| 2026-10-16 | Fase 9 (parcial) | T037–T040 + T043 (ad-hoc: yaml com `EmptyState.js` obsoleto travava o `sync-tizen` após `37e068a`); `build:tizen` ok sem "IPTV"; varredura de segredos limpa | Commit dos não rastreados + `CCPlayTv/` → reempacotar → T030–T032, T036, T041 |

| 2026-10-17 | T041 + revisão | Quickstart §2 (release 31, scripts 101, unit 3542, lint, build reproduzível, trava), §3 (gate `Blocked` só por externos; SC-009 provado com `config.xml` 0.2.2 e revertido), §6 `404` esperado; segredos limpos em 14 JSON/MD; E2E do cenário 9 (botão Atualizar da 077) e dois testes instáveis corrigidos; evidência/relatório sobrescritos por sessão concorrente restaurados (R-013) | Itens externos: merge em `main` + `evidence/privacy-*.json`, artes, UI Description, acesso de teste, `custody.json`, Seller Office, R-009 |

| 2026-10-17 | Fase 6 + T044 | Página de privacidade publicada (200, idêntica ao repo) e evidência gravada; logo/fundo/ícone no kit; `store-screenshots.mjs` gera as 4 capturas com catálogo fictício (revisadas imagem a imagem); `SAM-KIT-LOGO/ICONBG/SHOTS/PRIVACY` `Pass`; gate com 5 bloqueios, todos da pessoa | UI Description, acesso de teste, `custody.json`, Seller Office, R-009 |

| 2026-10-17 | T045–T047 | UI Description oficial preenchida (pptx 34 slides, capturas do build de produção em inglês, revisado slide a slide no PowerPoint), `SAM-KIT-UIDESC` `Pass`; portal escondido no build de loja sem portal (R-014) e "Agora:" traduzido; testes das áreas 523/523, tsc, lint e build ok | T048: novo `.wgt` e evidências, depois de R-009 e do nome do pacote |

| 2026-10-17 | R-015 | Pessoa decidiu enviar e instalar a **comercial completa** (mesmo app na loja e na TV), compra mantida e declarada; não envia ainda — habilita a venda antes. 080 cancelada. Tarefas T049–T055 abertas; `SAM-KIT-UIDESC` volta a Pending (o pptx descrevia a base) | T049–T055, depois T048 com `build:tizen:commercial` |

| 2026-10-17 | T049/T050 | Variante distribuída `commercial`; acesso de teste do comercial pelo teste local de 7 dias declarado em `demo-access.md`; testes do gate 32/32, trava íntegra | T051 privacidade, T052/T053 capturas e UI Description do comercial |

| 2026-10-17 | T051 (parcial) | Política de privacidade reescrita para a comercial (portal, licença, Mercado Pago, cookie/armazenamento do site, retenção), fatos conferidos no código | Publicar no merge em `main` e regravar a evidência |

| 2026-10-17 | T051 | Privacidade comercial publicada (PR #10, 200, idêntica ao repo) e evidência regravada | T052/T053 |

| 2026-10-17 | T052/T053 | Capturas da loja e UI Description do comercial (portal, teste, Pix, bloqueio) com `fakeCommercial.mjs`; pptx 40 slides; `SAM-KIT-UIDESC` `Pass` | T054 build comercial (chaves públicas de produção) |

**PRÓXIMO**: o build comercial com o portal e as chaves públicas de produção (T054, a pessoa confirma as chaves). Da pessoa: R-009, nome do pacote, App ID, `custody.json`, `validUntil` do acesso de teste e, **antes de enviar**, habilitar a venda no serviço (T055). T048 por último, num reempacote só, instalado por cima na TV dela.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `release/samsung/kit/ui-description/` + `kit/ui-description.md` — pptx oficial, capturas por tela e como refazer
- `tv-web/scripts/release/{ui-description-shots.mjs,ui-description-pptx.py,fakePanel.mjs}` — capturas do build de produção e montagem do pptx
- `tv-web/src/lib/portal/portalRuntime.ts` (`portalSurfacesVisible`), `features/settings/tabs/settingsTabs.ts`, `App.tsx` — portal fora da base (T046)
- `tv-web/scripts/release/release-gate.mjs` — CLI; `--record-local` gravou STATIC/BUILD e o gate consumiu E2E
- `release/samsung/evidence/` — evidências `static/build/e2e-2026-10-17-base.json`, amarradas ao hash do candidato **antigo** (`bc864e…`)
- `release/samsung/reports/0.2.1-base.{json,md}` — relatório final local, decisão `Blocked` honesta
- `tv-web/e2e/run.mjs` — runner E2E (T030); skills `tizen-emulator` (T031) e `tizen-tv` (T032)
- `bridge/privacidade/index.html` — política publicada no merge em `main`
- `tv-web/scripts/release/{kit,privacy,candidate,decision,wgt,report,packageChecks,privileges,author}.mjs` — prontos

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- O `.wgt` agora se chama `CCPlayTV.wgt` (segue o `<name>`); o gate acha o único `.wgt` de `CCPlayTv/.buildResult`. Para reempacotar: apagar a pasta `.buildResult`, `tizen build-web -e "Debug/*"`, `tizen package -t wgt -s <perfil>` (quickstart §2; perfil ativo = linha sem o `O` final da coluna `[Active]`).
- O gate reescreve `release/samsung/reports/<versão>-<variante>.{json,md}` a cada execução; relatórios de teste devem ser apagados antes do commit — só o de T036 é versionado. Esses arquivos não contam na árvore suja do candidato.
- `npm run build:tizen` regrava `CCPlayTv/assets/*` e `index.html` (rastreados): rodar o gate depois de um build sem reempacotar mostra `INT-PKG-INVENTORY` Blocked por divergência com o `.wgt`.
- Evidência só vale para o `.wgt` cujo hash ela registra: gravar E2E/TV antes do commit final e do reempacotamento desperdiça o roteiro. `--record-local` leva ~5 min (roda `npm run test` inteiro).
- Uma sessão só por vez grava evidência e relatório (R-013): `--record-local` regrava `static|build-<data>-<variante>.json` com o mesmo nome e o gate regrava o relatório. Antes de rodar, `git log -3` e `git status`; se o arquivo já está commitado com `Pass` para o mesmo hash, rode o gate **sem** `--record-local`. Para provas que alteram o disco (SC-009), restaure o relatório com `git restore -- release/samsung/reports` depois.
- Capturas da UI Description vêm do **build de produção** (`npm run build` + `npx vite preview --port 4173`), nunca do dev server: em dev o portal aparece de propósito (R-014) e há dicas de desenvolvimento na tela. O pptx não é reproduzível byte a byte: cada novo build pede hash novo no manifest.
- Mudou um artefato de `release/samsung/kit/`? Recalcule o hash (`Get-FileHash -Algorithm SHA256 <arquivo>`, em minúsculas) no `manifest.json`, senão o item vira `Blocked` por hash divergente. Um `.md` novo do kit não pode ter `password=`, `token=`, 32 hex isolados etc.: o próprio gate o bloqueia (`INT-KIT-SECRETS`).
