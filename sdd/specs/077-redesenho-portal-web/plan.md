# Implementation Plan: Redesenho do portal web mobile-first — listas, licença, chave TMDB e backup

**Slug**: `077-redesenho-portal-web` | **Date**: 2026-10-16 | **Spec**: `sdd/specs/077-redesenho-portal-web/spec.md`

## Summary

O `portal-web` (React 19 + Vite, sem rotas, sem biblioteca de UI) troca as abas do topo por uma **casca mobile-first**: um `<nav aria-label="Principal">` com Listas, Licença e Ajustes (barra inferior abaixo de 960 px, menu lateral a partir daí) e um **resumo fixo da TV**. Listas viram cartões com selo de estado e ações só quando precisam; a Licença vira um cartão com um botão; Ajustes concentra Chave TMDB, Backup, Código de recuperação, Recuperar acesso, Ajuda e Sair. A entrada passa a **lembrar o último ID**. A única capacidade nova é a **chave TMDB pelo portal**: o navegador envia a chave ao serviço (cifrada em repouso), a TV a busca no Atualizar de listas, a aplica pelo caminho normal (`saveTmdbKey`, que testa no TMDB) e devolve só o resultado; o portal mostra o estado real e nunca a chave. Isso toca três projetos — `portal-web/` (quase tudo), `api/` (serviço da chave) e `tv-web/` (aplicação na TV) — e exige **ADR-020 + emenda MINOR da constitution** antes da US4.

## Technical Context

**Language/Version**: TypeScript 6 / React 19.2 / Vite 8 (`portal-web`); TypeScript 5 / React 19 (`tv-web`); Python 3.13 / FastAPI / Firestore (`api`)

**Primary Dependencies**: nenhuma nova. Navegação por estado + `history.pushState` (sem router); CSS puro com tokens do DS V14 (já em `styles.css`); i18n próprio (`lib/i18n`, idioma por `navigator.language`, sem seletor)

**Storage**: Firestore (`devices/{id}/integrations/tmdb`, novo documento); `localStorage` do navegador só para o ID lembrado; `sessionStorage` da sessão (inalterado); IndexedDB da TV (inalterado)

**Testing**: Vitest (`portal-web`: ambiente `node`, **sem jsdom** → UI só por Playwright; `tv-web`: projetos `dom`/`node`); pytest com emulador Firestore (`PORTAL_TEST_FIRESTORE=1`, `api/tests/portal`); Playwright em `portal-web/e2e` (servidor já no ar: `npm run dev`, porta 5174); `tv-web/e2e` para a TV

**Target Platform**: navegadores de celular e de PC (portal); TV Samsung Tizen 9 / Chromium 120 (só a aplicação da chave)

**Performance Goals**: sem rolagem horizontal desde 320 px; interações do portal ≤ 1 requisição de leitura por refresh (um `useDashboard`/`useTvSummary` compartilhado, 10 s só com a aba visível)

**Constraints**: só tokens do DS (nenhuma cor/raio/espaço/fonte literal nova); alvos ≥ 44 px; campos ≥ 16 px; mobile-first (`min-width`); textos pt/en/es; arquivo ≤ ~300 linhas por convenção (o ratchet existe só em `tv-web`, que ganha ≈ 120 linhas novas); a TV só fala com o serviço por ação da pessoa (ADR-016); chave TMDB nunca em log, URL, erro, resposta ao navegador, `localStorage` ou ack

**Scale/Scope**: ≈ 25 arquivos novos/reescritos no `portal-web`, 4 no `api`, 4 na `tv-web`; 5 roteiros E2E do portal reescritos; 1 ADR e 1 emenda da constitution

## Decisões Invariantes

- **D-001 — Casca única e responsiva.** Um só `<nav aria-label="Principal">` (Listas, Licença, Ajustes), barra inferior `< 960 px` e menu lateral `≥ 960 px`, só por CSS (`logic/shell-responsivo.md` §1). Sem terceiro layout.
- **D-002 — Navegação sem router.** Estado em memória espelhado em `history.pushState` **sem mudar a URL**; `popstate` restaura; Voltar do celular fecha editor/sub-tela. Retorno do Checkout (`?checkout=return`) abre Licença (§2).
- **D-003 — Um só ponto de leitura.** `useDashboard` (listas/operações/snapshot) e `useTvSummary` (dispositivo/licença/último contato) substituem os timers de `SourceManager` e `LicensePage`; resumo e telas leem do mesmo estado.
- **D-004 — Estado de lista derivado.** `listStatus()` (módulo puro) decide o selo: pendente > com problema > no snapshot ("Na TV") > salva sem snapshot ("Aguardando a TV"); **Reenviar** só com "Erro", **Cancelar envio** só com pendente, **Editar/Excluir** sempre (§4).
- **D-005 — Excluir com confirmação própria.** Diálogo `<dialog>` com **Cancelar** e **Sim, excluir** (já existe o padrão em `SourceManager`/`BackupCard`); a exclusão continua `source.delete` via `POST /operations`.
- **D-006 — Compra em um passo.** Um cartão; o aceite é a frase com o **ID da TV** ao lado do botão, no lugar da caixa; validações de oferta, `safeCheckoutUrl` e idempotência de tentativa intactas. O código de recuperação sai da Licença e vai para Ajustes.
- **D-007 — Chave TMDB: recurso próprio, não operação de lista.** Documento `devices/{id}/integrations/tmdb` (uma pendente por TV, substitui a anterior), rotas `/integrations/tmdb` (navegador) e `/device/integrations/tmdb` (+ `/ack`) para a TV (`contracts/portal-api-tmdb.md`). **Não** reutiliza `OperationDocument`/versões de lista (revisão por lista, janela de 7 dias por versão e `pending_operation_count` não se aplicam). Cifra com `PortalCrypto` (`CipherContext(device_id, "tmdb-key", operation_id)`).
- **D-008 — A TV aplica no Atualizar de listas.** Novo passo `'integrations'` em `PortalAgent.execute` (`deletions → uploads → escrow → pull → integrations → snapshot → backup`), porta opcional `applyIntegrations` em `PortalAgentPorts`; `applyRemoteTmdb` usa `saveTmdbKey`/`removeTmdbKey` existentes e devolve só `applied | rejected | retry`. O snapshot que sai logo depois informa `integrations.tmdb` (`none|configured`).
- **D-009 — Estado exibido derivado.** `resolveTmdbView` (puro; `logic/tmdb-estado.md`) junta pendência, último resultado e `tvReported`; o valor da chave não existe nesses tipos.
- **D-010 — ID lembrado.** `localStorage["ccplay-portal-last-device"]` só com o ID normalizado, gravado só após sessão obtida (manual ou QR); `Usar outra TV` apaga; Sair não apaga (`features/session/lastDevice.ts`).
- **D-011 — Ajustes por registro.** `SETTINGS_ITEMS` na ordem do §5; a chave TMDB só é registrada na US4, então as fases 3–5 entregam sem item morto.
- **D-012 — CSS por camadas.** `styles/tokens.css` (reaproveita os tokens atuais, sobe `--control-h` para 44 px), `base.css`, `shell.css`, `lists.css`, `license.css`, `settings.css`, todos mobile-first; `styles.css` legado vai encolhendo tela a tela e é **apagado** no Polish.
- **D-013 — Sem dependência nova.** Nada de jsdom/testing-library, router, UI kit ou biblioteca de ícones (ícones SVG inline, como `EyeIcon`); a UI é verificada por Playwright e a lógica por Vitest `node`.
- **D-014 — Revendedores e Recarregar saem.** `SellersPage` e as chaves `sellers*`, `comingSoon`, `reload` são removidas (sem código morto).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | O portal continua opcional e sem conta; só o ID (não secreto) é lembrado no navegador. |
| Segredos Fora dos Clientes e dos Logs (1.14.1) | ⚠️ exceção nova | ✅ após T025 | A chave TMDB digitada **no navegador** passa pelo serviço (cifrada, só entregue à mesma TV, apagada ao aplicar) e só a TV a usa contra o TMDB. Isso é uma **exceção nova (item (j))**, decidida pelo usuário na spec (Clarifications e FR-019), formalizada por **ADR-020 + constitution 1.15.0 (MINOR) antes de qualquer código da US4** (T024/T025). Mantém: chave nunca em log, URL, erro, resposta ao navegador, `localStorage`, ack, backup em claro ou exportação; limite de tentativas; uma pendente por TV. Chave de **desenvolvedor/compartilhada** continua proibida. |
| Categorias da Fonte São Preservadas | N/A | N/A | — |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | A TV só consulta por ação da pessoa (Atualizar); o passo `integrations` roda dentro dele. Sem chamada na abertura. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | A chave TMDB aplicada/recusada não altera catálogo, favoritos nem reprodução. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Nenhuma tela nova na TV; o resultado aparece no portal. A ação continua sendo o botão Atualizar já existente. |
| Lista de Catálogo ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | O portal usa foco visível (`:focus-visible`), ordem lógica, foco movido para o título ao trocar de tela e devolvido ao controle de origem; todo estado (carregando, vazio, erro) tem ação. Na TV nada muda. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | `popstate` + `data-focus-key` (padrão existente) no portal; sem mudança na TV. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais | ✅ | ✅ | "Aguardando a TV" só enquanto há operação pendente de fato; "Aplicada" só quando a TV confirma e o snapshot concorda (`logic/tmdb-estado.md`); "Recusada" vem do TMDB real. Nada de sucesso inventado ao enviar. |
| Documentação do Repositório É Canônica | ✅ | ✅ | ADR-020, constitution, `docs/portal/operacao.md`, README do `portal-web`, CLAUDE.md (tabela de ADRs) e FAQ atualizados no Polish; mudanças de comportamento do portal registradas. |
| Restrição: Design system | ✅ | ✅ | Tokens do DS V14 já usados pelo portal; sem valores novos fixos; contraste AA; alvos ≥ 44 px. |
| Fluxo: E2E antes de TV física | ✅ | ✅ | Roteiros Playwright do portal em 360/768/1280 + `npm run test:e2e` da TV; TV física fora do gate (a TV não tem tela nova). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/077-redesenho-portal-web/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/portal-api-tmdb.md
├── logic/shell-responsivo.md      # layout, navegação, resumo, estados, Ajustes, login, licença, textos
├── logic/tmdb-estado.md           # regra de estado e formato da chave
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
portal-web/
├── e2e/                          *.contract.spec.ts (2, TRAVADOS) + specs antigos reescritos (bootstrap, configuracao, gerenciador, licenca, recuperacao) + layout.spec.ts (novo)
├── playwright.config.ts          (+ projetos mobile 360 / tablet 768 / desktop 1280)
└── src/
    ├── main.tsx, App.tsx         (App compõe a casca)
    ├── styles/                   tokens.css, base.css, shell.css, lists.css, license.css, settings.css  (styles.css legado some no Polish)
    ├── lib/i18n/                 index.ts + areas/novoPortal.ts (chaves novas pt/en/es) ; faq.ts atualizado
    └── features/
        ├── api.ts                (+ tmdb: status/set/remove/cancel; snapshot.integrations)
        ├── shell/                PortalShell.tsx, NavBar.tsx, TvSummary.tsx, navigation.ts, useTvSummary.ts, useDashboard.ts
        ├── session/              SessionPage.tsx (ID lembrado), lastDevice.ts (+contrato)
        ├── lists/                ListsPage.tsx, ListCard.tsx, ListEditor.tsx (de SourceForm), DeleteDialog.tsx, listStatus.ts
        ├── license/              LicenseCard.tsx (de LicensePage), safeCheckoutUrl mantido
        └── settings/             SettingsPage.tsx, items.ts, TmdbPage.tsx, tmdbStatus.ts (+contrato), BackupPage.tsx, RecoveryPage (existente), FaqPage (existente)

api/app/portal/
├── tmdb_integration.py           TmdbIntegrationService (cifra, substitui, entrega, ack, expira)
├── routes/integrations.py        rotas do navegador e da TV (D-007)
├── models.py                     TmdbIntegrationDocument; SnapshotDocument.integrations
├── repositories/control.py       coleção `integrations` permitida
├── retention.py                  apagar junto com o aparelho
└── application.py                registra o router

tv-web/src/
├── lib/portal/tmdbRemote.ts      applyRemoteTmdb (+contrato) e cliente HTTP do passo
├── lib/portal/portalAgent.ts     passo `integrations` + porta `applyIntegrations`
├── lib/portal/portalSync.ts      publishSnapshot inclui `integrations.tmdb`
└── features/portal/usePortalIntegration.tsx   liga a porta

sdd/adr/ADR-020-chave-tmdb-pelo-portal.md        (novo)
.planning/memory/constitution.md                 (1.15.0)
docs/portal/operacao.md, CLAUDE.md, portal-web/README.md
```

**Structure Decision**: tudo o que é visual fica em `portal-web/src/features/*` por destino; lógica pura (`lastDevice`, `tmdbStatus`, `listStatus`, `navigation`) em módulos separados, testáveis em Vitest `node`. O serviço e a TV só recebem o necessário para a chave TMDB.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Exceção nova de segredos (chave TMDB passa pelo serviço) | É o que o usuário pediu ("adicionar/editar chave TMDB" no portal); a chave é BYOK da própria pessoa e o fluxo reaproveita o modelo cifrado das credenciais de lista (exceção (d)) | "Só orientar" não permite editar pelo celular; "fora da feature" foi recusado pelo usuário. Mitigação: uma pendente por TV, apagada ao aplicar, nunca devolvida ao navegador (ADR-020). |
| Três projetos tocados por uma feature de "portal" | A chave TMDB só chega à TV pelo serviço | Dividir em duas features (portal vs. chave TMDB) duplicaria a casca; a US4 é P3 e o resto entrega antes sem tocar `api/` nem `tv-web/`. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (cada projeto no seu diretório):

```powershell
# portal-web
cd portal-web; npx vitest run; npm run lint; npx tsc --noEmit; npm run build
cd portal-web; npm run dev            # outro terminal (porta 5174)
cd portal-web; npx playwright test    # todos os projetos de viewport
# api (emulador Firestore em 127.0.0.1:8085)
cd api; $env:PORTAL_TEST_FIRESTORE='1'; uv run pytest tests/portal -q; uv run ruff check .
# tv-web
cd tv-web; npx vitest run src/lib/portal; npm run lint; npx tsc -b; npm run test; npm run build
cd tv-web; node e2e/run.mjs --only <nomes>      # com `npm run dev` rodando
```

### Testes de Contrato

Todos em TS (o script de trava só conta `it(`/`test(`; testes Python do serviço **não** podem ser travados e entram como testes da fase). 5 de 5 casos usados:

| # | Arquivo travado | Origem | Fase | Vermelho confirmado |
| --- | --- | --- | --- | --- |
| 1 | `portal-web/src/features/session/lastDevice.redesenho-portal-web.contract.test.ts` | US1-AC1/AC2, FR-003 | 3 | `Error: not implemented` |
| 2 | `portal-web/e2e/shell.redesenho-portal-web.contract.spec.ts` | US1-AC1..AC5, FR-001/002/003/015/016, SC-006/007 | 3 | `locator('a, button')` resolveu 0 elementos (não há `nav` "Principal") |
| 3 | `portal-web/e2e/listas.redesenho-portal-web.contract.spec.ts` | US2-AC1..AC6, FR-005/006/007, SC-001 | 4 | `Expected substring "Na TV"; Received "LALista AM3U por URL · Salva no portal"` |
| 4 | `portal-web/src/features/settings/tmdbStatus.redesenho-portal-web.contract.test.ts` | US4, FR-011 | 6 | `Error: not implemented` |
| 5 | `tv-web/src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts` | US4-AC2/AC3/AC4, Constitution: Segredos | 6 | `Error: not implemented` |

Comandos de execução: 1 e 4 → `cd portal-web; npx vitest run src/features/session src/features/settings`; 2 e 3 → `cd portal-web; npx playwright test e2e/shell.redesenho-portal-web.contract.spec.ts e2e/listas.redesenho-portal-web.contract.spec.ts` (com `npm run dev`); 5 → `cd tv-web; npx vitest run src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts`. Integridade: `check-contract-tests.ps1 -Slug 077-redesenho-portal-web`.

Os contratos 2 e 3 usam rótulos que **já existem** (`Endereço MAC da TV`, `Chave do dispositivo`, `Conectar`, `Adicionar lista`, `Nome da lista`, `Tipo de lista` / `M3U por URL`, `URL da lista M3U`, `Enviar para a TV`) e os novos de `logic/shell-responsivo.md` §8 (`Listas`, `Licença`, `Ajustes`, `Resumo da TV`, `Principal`, `Na TV`, `Aguardando a TV`, `Erro`, `Excluir`, `Sim, excluir`, `Cancelar envio`, `Reenviar`, `Usar outra TV`, `Sair…`, lista `Ajustes`). Os contratos fixam **nomes acessíveis e papéis**, não classes CSS.

**Testes da fase que NÃO são contrato** (o executor escreve): `listStatus` (Vitest), serviço da chave (pytest com emulador: cifrado em repouso, só a mesma TV lê, substitui pendente, ack idempotente, expira, nunca em log/resposta, época diferente descartada), passo `integrations` do agente da TV, `layout.spec.ts` (alvos ≥ 44 px, sem overflow em 320/360/768/1280, nomes acessíveis), E2E da compra, Backup e TMDB com fixtures.

**Stubs criados pelo plan** (não travados): `portal-web/src/features/session/lastDevice.ts`, `portal-web/src/features/settings/tmdbStatus.ts`, `tv-web/src/lib/portal/tmdbRemote.ts` — corpos `throw new Error('not implemented')`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fundação (Fase 2) | Concluída: tokens/base mobile-first, textos novos (`areas/novoPortal.ts`), navegação por estado + `history`, `useTvData`/`summaryState`, projetos Playwright por largura |
| Casca e entrada (US1, Fase 3) | Concluída: `lastDevice`, SessionPage com ID lembrado, `NavBar`/`TvSummary`/`PortalShell`, `App` sem Revendedores/Recarregar, `SettingsPage` com os itens atuais; contratos `lastDevice` e `shell` verdes |
| Listas (US2, Fase 4) | Concluída: `ListsPage`/`ListCard`/`ListEditor`/`DeleteDialog`/`listStatus`, `styles/lists.css`; `SourceManager`/`SourceForm`/`ConfigurationManager`/`OperationStatus` removidos; contrato `listas` verde; `configuracao`/`gerenciador` reescritos e verdes |
| Licença (US3, Fase 5) | Concluída: `LicenseCard` (um botão Comprar/Renovar, frase com o ID, pedido reaproveitado, venda desabilitada com motivo), `license.css`, `LicensePage` removido; `licenca.spec.ts` 7/7 |
| Ajustes (US5, Fase 7) | Concluída: `BackupPage` (Excluir backup com confirmação), FAQ sem Revendedores e com a estrutura nova, `faq.css`; `ajustes.spec.ts` 5; `BackupCard` removido |
| Polish (Fase 8) | Concluída: `styles.css` apagado (classes presas migradas para `standalone.css`), `layout.spec.ts` (360/768/1280 + 320, pt/en/es), docs, gates do portal/serviço/TV, revisão de segredos e roteiro ponta a ponta na pilha local real (`chave-tmdb-pelo-portal.mjs`); 4 defeitos visuais corrigidos |
| Chave TMDB (US4, Fase 6) | Concluída: ADR-020 Aceita + constitution 1.15.0 (j); serviço (modelo, `tmdb_integration.py`, rotas), TV (`tmdbRemote.ts`, passo `integrations`, snapshot `integrations.tmdb`), portal (`TmdbPage`, `resolveTmdbView`, `api.tmdb`); contratos `tmdbStatus` e `tmdbRemote` verdes; `pytest tests/portal` 172, `tmdb.spec.ts` 6 |
| Convergência (Fase 9) | Concluída: sessão inválida volta à entrada com ID lembrado; campos permanecem acima da barra de ações com teclado; títulos de lista quebram em duas linhas; mudança real para `onTv` anuncia “Aplicado na TV”; pares de tokens têm contraste automatizado |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Exceção nova de segredos (chave TMDB pelo navegador → serviço → TV) | Constitution 1.14.1 não prevê; implementar antes seria violação | Resolvido: ADR-020 + constitution 1.15.0 (item (j)) foram aceitas antes do código da US4; contratos e revisão de segredos confirmam o fluxo delimitado. |
| R-002 | Dois documentos de verdade para "tem chave na TV" (portal vs. TV) | Mostrar "Aplicada" quando a pessoa já tirou a chave na TV | Resolvido: `tvReported` vem do snapshot; regra de prioridade em `logic/tmdb-estado.md` é coberta pelo contrato 4. TV antiga sem `integrations` = desconhecido. |
| R-003 | Remover a caixa de confirmação da compra tira a conferência do ID da TV | Comprar licença para a TV errada | Resolvido: a frase junto ao botão inclui o **ID da TV**, que também fica no resumo fixo; `licenseDevice` amarra o pedido ao `deviceId` da sessão. |
| R-004 | `portal-web` sem jsdom: UI só por Playwright (precisa do servidor no ar, lento) | Poucos testes de componente | Resolvido: lógica em módulos puros testados em Vitest; contratos de UI e rotas principais em Playwright; sem dependência adicional (D-013). |
| R-005 | `styles.css` (≈ 37 KB, 205 regras) misturado com o layout antigo | Regressão visual ao migrar | Resolvido: migração para `styles/*.css` concluída e legado apagado; `layout.spec.ts` audita quatro larguras e os três idiomas. |
| R-006 | 5 specs E2E do portal e `LicensePage.test.ts` dependem da estrutura antiga (abas, Revendedores, Recarregar, local do backup) | Suíte vermelha no meio | Resolvido: specs foram reescritas por fase; `safeCheckoutUrl` e seu teste foram mantidos; 50 Playwright verdes na auditoria final. |
| R-007 | A TV só aplica a chave no **Atualizar de listas** | O usuário espera efeito imediato | Resolvido: o portal mostra o próximo passo e o estado real “Aguardando a TV”; sem polling novo (ADR-016), com contrato e E2E do fluxo. |
| R-008 | A TV aplica a chave sem confirmar com a pessoa na TV | Troca silenciosa de chave | Resolvido: a chave é BYOK da pessoa autenticada pela chave da TV; a TV só substitui após testar no TMDB, e o resultado é visível no portal. Registrado na ADR-020. |
| R-009 | Teclado virtual cobre barra inferior/botões | Formulário inutilizável no celular | Resolvido: `--action-bar-safe-bottom` soma controle, espaçamento e área segura em `scroll-padding-bottom`/`scroll-margin-bottom`; roteiro mobile com viewport reduzido cobre editor e TMDB. |
| R-010 | Testes Python do serviço não podem ser travados | Invariantes do serviço sem trava | Resolvido: testes da fase (T034), contrato 5 do lado da TV e revisão de segredos no gate cobrem as invariantes do serviço. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-16 | Fases 2–3 (Foundational + US1) | T001–T011: tokens/base, i18n novo, navegação, `useTvData`, Playwright por largura; ID lembrado; casca (nav inferior/lateral + resumo); App e Ajustes sem Revendedores/Recarregar | Fase 4: Listas (cartões, selos, editor, excluir) |
| 2026-10-16 | Fase 4 (US2) | T012–T018: `lists/*` (cartões com selo, Editar/Excluir sempre, Cancelar envio/Reenviar contextuais, editor em coluna única com ações fixas, diálogo de exclusão), `lists.css`, `data-view` na casca; legado de listas removido; `configuracao`/`gerenciador` reescritos | Fase 5: cartão de licença (`LicensePage` antigo e `licenca.spec.ts` vermelho) |
| 2026-10-16 | Fase 5 (US3) | T019–T023: `license/LicenseCard.tsx` (um botão, frase com o ID, sem caixa de seleção), `license.css`; `LicensePage` e CSS legado removidos; `licenca.spec.ts` reescrito (7) | Fase 6: chave TMDB — **gate** ADR-020 + constitution 1.15.0 antes de qualquer código (T024/T025) |
| 2026-10-16 | Fase 6, gate (T024/T025) | `sdd/adr/ADR-020-chave-tmdb-pelo-portal.md` (Proposta), constitution 1.14.1 -> 1.15.0 (exceção (j), relatório de impacto, histórico), notas "Atualização (ADR-020)" nas ADR-013/016, `CLAUDE.md` (versão e linha da ADR-020) | **Revisão do usuário do texto da ADR-020 e da exceção (j) (Analyze A3)** antes de T026 |
| 2026-10-16 | Fase 6 (US4) | T026–T036: serviço (`tmdb_integration.py`, rotas, snapshot), TV (`tmdbRemote.ts`, passo `integrations`), portal (`TmdbPage`, `tmdbStatus`, `api.tmdb`, `settings.css`); ADR-020 aceita pelo usuário; emulador Firestore + `pytest tests/portal` 172; `tmdb.spec.ts` 6 | Fase 7: Backup e Ajustes (BackupPage, FAQ sem "Revendedores"), T037–T040 |
| 2026-10-16 | Fase 7 (US5) | T037–T040: `settings/BackupPage.tsx` (Excluir backup), FAQ pt/en/es sem Revendedores e com a estrutura nova, `faq.css`, `ajustes.spec.ts` (5); `BackupCard` removido | Fase 8: Polish (apagar `styles.css`, layout em 4 larguras, docs, gates, segredos, quickstart) |
| 2026-10-16 | Fase 8 (Polish) | T041–T048: `styles.css` apagado; `layout.spec.ts`; docs (`operacao.md`, README do portal, CLAUDE.md); gates: portal 45 Playwright/25 Vitest, serviço 172 pytest + ruff, TV 3484 testes + 52 E2E; 5 roteiros de portal na pilha local real (1 novo); capturas de tela acharam e corrigiram 4 defeitos (marca na barra inferior, botão cobrindo texto no PC, foco no carregamento, alvos de 34–36 px) | Nenhuma: converge |
| 2026-10-16 | Ajustes pós-uso | (1) A chave do dispositivo colada como a TV a mostra ("370 362 8660") é aceita (`session/deviceKey.ts`). (2) O selo da lista ignora a carga do catálogo: operação aplicada = "Na TV", sem esperar o snapshot e sem "Importação em andamento"/erro de importação (`listStatus.ts`, `ListCard.tsx`), porque o portal só entrega os dados à TV; a confirmação tardia da importação continua só no próximo Atualizar (ADR-016) e não aparece mais no portal | — |
| 2026-10-16 | Ajustes pós-uso (2) | (1) Exclusão enviada/aplicada não vira cartão na tela de Listas (só a que falhou, "Exclusão não concluída"). (2) Em dev, `localhost:5174` redireciona para `127.0.0.1:5174` (o serviço só aceita a origem oficial; antes dava 403 `invalid_origin` = "Acesso inválido"); portas dos roteiros E2E configuráveis por `E2E_*`. (3) A aba Configurações → Integrações & BYOK da TV ganhou **Atualizar** próprio (escopo `tmdb` do agente: só `integrations` + `snapshot`), com linha de resultado; os textos do portal e do FAQ apontam para ele; `chave-tmdb-pelo-portal.mjs` passa por esse botão | — |
| 2026-10-16 | Ajustes pós-uso (3) | Botão manual **Atualizar estado** devolvido no resumo fixo da TV (relê painel e dispositivo na hora; a leitura automática de 10 s continua) — `shell/TvSummary.tsx`, teste em `gerenciador.spec.ts` | — |
| 2026-10-16 | Ajustes pós-uso (4) | Entrar numa lista vinda do portal enquanto o catálogo ainda carrega: a TV decidia só pela marca em memória (`remoteImportsInFlight`), que some se a página da TV é recarregada (a importação é interrompida) e a pessoa caía numa lista vazia ("Nenhum canal nesta lista"). Agora a decisão também olha o registro durável da importação (`lib/portal/remoteImportEntry.ts`): pendente, interrompida ou com erro → tela de progresso (interrompida após 60 s sem sinal, com Tentar novamente); aceita e ainda não iniciada → inicia e mostra o progresso. `App.tsx` `chooseSource` ficou assíncrona (testes de `App.licensing` passaram a aguardar a abertura). Roteiros de portal usam a origem da pilha (`consulta-sob-demanda.mjs`) | — |
| 2026-10-16 | Fase 9 (Convergência) | T049–T053: guarda de sessão; área segura para teclado; títulos sem truncamento horizontal; anúncio “Aplicado na TV” na transição confirmada; auditoria de contraste de tokens | Rodar `sdd-converge` novamente |

**PRÓXIMO**: todas as tasks de `tasks.md` estão marcadas; rodar `/sdd-converge 077-redesenho-portal-web` novamente (conferir spec x código, FR-001–FR-020, e fechar a feature como Convergida). Passada em TV física é recomendação, não gate.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `portal-web/src/features/lists/ListsPage.tsx` e `ListCard.tsx`: anúncio de aplicação confirmada e título em duas linhas
- `portal-web/src/styles/{tokens,base,lists}.css`: espaço seguro da barra de ações, reflow do título e tokens auditados
- `portal-web/e2e/{layout,gerenciador}.spec.ts`: viewport reduzido, texto cortado e transição `waiting` → `onTv`
- `portal-web/src/styles/tokens.contrast.test.ts`: cálculo de contraste dos pares de tokens

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Servidor de dev do portal**: os contratos/specs de UI exigem `cd portal-web; npm run dev` (5174). Se a porta estiver ocupada pelo `dev:portal` do usuário, não encerre o processo dele.
- **Heredoc com `/**` em `Set-Content` junto de `Remove-Item` é bloqueado** pela ferramenta; escreva arquivos com a ferramenta Write e apague com `Remove-Item -LiteralPath` em chamada separada.
- **Emulador Firestore para o pytest**: `$env:PATH="C:\Program Files\Android\Android Studio\jbr\bin;$env:PATH"; cmd /c "<sdk gcloud>\platform\cloud-firestore-emulator\cloud_firestore_emulator.cmd" start --host=127.0.0.1 --port=8085` (em segundo plano; Java 21 do Android Studio) e `$env:PORTAL_TEST_FIRESTORE='1'`. Não rode junto da pilha `dev:portal`.
- **E2E de integração da TV com o portal** (`tv-web/e2e/{consulta-sob-demanda,entrada-listas-gerenciador,portal-dev-server,desvincular-backup,chave-tmdb-pelo-portal}.mjs`) sobem a pilha local inteira e exigem as portas 8085/3001/5174/5176 livres (ou `E2E_PORTAL_PORT`/`E2E_TV_PORT`/`E2E_EMULATOR_PORT` no `chave-tmdb-pelo-portal.mjs`); o título do portal que eles procuram é `Listas` (nível 1), e `consulta-sob-demanda.mjs` mantém uma lista de rotas que a TV pode chamar: rota nova da TV precisa entrar nela.
- **Arquivos do repositório estão em CRLF**: edição por `.Replace` em PowerShell precisa normalizar `\r\n` (ou use a ferramenta Edit).
- **`Remove-Item` com `/>` no comando** também é bloqueado (a ferramenta lê `/>` como caminho do sistema): troque trechos de JSX com a ferramenta Edit, não por `.Replace` no mesmo comando de remoção.
- `useRef` em React 19 pede valor inicial (`useRef<T | undefined>(undefined)`).
- Toda chave nova em `areas/novoPortal.ts` vale nos 3 idiomas e **não pode repetir** uma de `lib/i18n/index.ts` (o `index.test.ts` falha); por exemplo `lastContact` já existe ("Último estado recebido"), por isso o resumo usa `summaryLastContact`.

## Resultado Final

**Convergida em 2026-10-16.** O portal web agora entrega a casca mobile-first com Listas, Licença e Ajustes, ID lembrado sem guardar a chave, gestão de listas com estados confirmados pela TV, compra de licença simplificada, chave TMDB protegida no percurso portal → serviço → TV e backup administrável. As correções pós-convergência completaram o encerramento seguro de sessão, a visibilidade de campos com teclado virtual, o reflow de nomes de lista, o aviso de aplicação real e a auditoria de contraste.

Os desvios acumulados ficaram registrados nas Execution Notes: a leitura compartilhada é composta em `useTvData`, a exclusão aplicada não gera cartão de atividade, e a TV expõe Atualizar próprio para Integrações & BYOK. Nenhum deles contradiz a spec, o plano ou a constitution. A auditoria final confirmou os cinco contratos travados, 28 testes Vitest do portal, lint, TypeScript, build e 50 testes Playwright (quatro cenários deliberadamente exclusivos do projeto mobile).
