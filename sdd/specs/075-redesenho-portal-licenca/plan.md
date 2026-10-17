# Implementation Plan: Redesenho da tela Portal & licença e item Backup

**Slug**: `075-redesenho-portal-licenca` | **Date**: 2026-10-16 | **Spec**: `sdd/specs/075-redesenho-portal-licenca/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Recompor Configurações → Portal & licença (hoje uma fileira de 12 botões em `PortalLicensePanel.tsx` + `PortalBackupActions.tsx`) em dois cartões — **Acessar o portal** (QR fixo, site, ID, chave agrupada, à vista via `usePairingCredentials`) e **Licença** (estado, validade, oferta, código com olho, Comprar/Renovar, Atualizar) — mais um botão **Mais opções** que abre um menu modal com Gerar nova chave e código (rotação única `revoke`), Recuperar pelo site e Desvincular. Backup vira a aba própria **Backup** no registro `SETTINGS_TABS`. Só frontend (`tv-web/`); serviço e `portal-web` intocados. Regra de exibição: ADR-019 / constitution 1.14.0.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Vite 8, build `chrome108`)

**Primary Dependencies**: Dexie (`liveQuery` dos registros do portal), `qrcode-generator` via `components/FixedQr.tsx`, i18n próprio (`lib/i18n`, pt/en/es), foco próprio (`useRemoteNav`, ADR-009)

**Storage**: IndexedDB já existente (`portalDevice`: `device`, `bootstrap`, `backup`); nada novo

**Testing**: Vitest (projeto `dom`, jsdom + Testing Library), E2E Playwright (`tv-web/e2e/*.mjs`, `npm run test:e2e`), auditoria `e2e/legibilidade-tv.mjs`

**Target Platform**: Samsung Tizen 9 / Chromium 120, origem `file://`; palco 1920×1080

**Performance Goals**: N/A (tela estática); zero requisições ao abrir com TV cadastrada (SC-005)

**Constraints**: só tokens V14 (`tv-web/src/index.css`); arquivo de produção ≤ 300 linhas (ratchet `scripts/architecture.mjs`); sem import feature→feature (não importar `features/portal/*` de `features/settings/*`); um `useRemoteNav` por tela (a `SettingsScreen` encaminha teclas à aba via `SettingsTabHandle`); textos novos em `messages/*.ts` nos 3 idiomas

**Scale/Scope**: 1 aba redesenhada + 1 aba nova; ~10 arquivos de produção, ~9 roteiros E2E ajustados

## Decisões Invariantes

- **D-001 — Contrato público é a aba.** `PortalLicenseTab` continua com `SettingsTabProps`/`SettingsTabHandle` (`onEnter`/`onDirection`/`onSelect`); o contrato travado dirige a tela só por ele e pelo DOM. A API interna do painel é livre, mas **por id de ação, não por índice** (o conjunto de ações muda com estado da licença/build/falha; constitution "Voltar Restaura Foco": reconciliar por id).
- **D-002 — Ações focáveis e ordem.** Tela principal: `[retry?] → eye → purchase* → refresh* → more` (`*` só no build comercial; `retry` só com falha de pareamento). Mapa de foco em `logic/foco-portal.md`. No estado normal do build comercial são 4 (SC-003).
- **D-003 — Foco inicial (FR-009).** `onEnter`: build comercial → `purchase` se `license.state !== 'active'`, senão `refresh`; não comercial → `eye`. Se a ação inicial não existe (sem conexão), cai na primeira disponível.
- **D-004 — Olho.** Estado local do cartão Licença: `revealedVersion?: number`; revelado ⇔ `revealedVersion === device.recoveryCodeVersion` (regenerar oculta sozinho). Zera em `visibilitychange` oculto e `pagehide`; desmontar a aba zera por construção. Sem timer, sem modal. Rótulo do botão = `portal.showCode` / `portal.hideCode` (nome e texto mudam, nunca só cor). Máscara fixa (`•••• •••• ••••`), nunca derivada do comprimento do código. Sem device → olho soft-disabled.
- **D-005 — Chave agrupada.** `formatDeviceKey(key)` (novo, `lib/portal/displayId.ts`) devolve **uma string** `"173 204 9818"` renderizada num único nó de texto (o contrato usa `getByText`). Só visual: QR (`buildFixedQrUrl`) e valor guardado não mudam. Adicionar lista/bloqueio não usam (contrato 070).
- **D-006 — Rotação unificada.** "Gerar nova chave e código" chama `connection.rotate('revoke')` (envia o MAC; cobre o upgrade de ID da 070). `rotate('rotate')` deixa de ter chamador na UI (não remover do `PortalConnection`). Confirmação via `PortalConfirmDialog` existente.
- **D-007 — Um diálogo por vez.** Escolher um item do menu fecha o menu e abre a confirmação (ou, em Recuperar, executa direto como hoje). Voltar/Cancelar devolve o foco a `more`. Retorno da compra Pix devolve a `purchase` (padrão `onActionFocus` atual).
- **D-008 — QR de recuperação.** Convite da 069 (`connection.recovery()` + `usePortalRecovery`) substitui o QR fixo no cartão Acessar o portal enquanto válido, com `portal.expiry` e rótulo de recuperação; expirado/concluído/segundo plano/sair → volta o QR fixo. O QR fixo e a chave **não** somem em segundo plano (ADR-019: permitidos à vista).
- **D-009 — Backup é aba.** `SettingsTab` ganha `'backup'`, entrada em `SETTINGS_TABS` logo após `'portal'`, rótulo `settings.tab.backup` (pt "Backup", en "Backup", es "Copia de seguridad"), ícone existente. `PortalBackupActions` perde Desvincular (3 ações) e passa a ser montado por `tabs/BackupTab.tsx`.
- **D-010 — Sem rede nova.** Nenhuma chamada a serviço por foco ou montagem além do `ensurePairing` já existente em `usePairingCredentials` (que não consulta com TV cadastrada).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Portal continua opcional; sem configuração a aba mostra estado honesto e as listas seguem locais. |
| Segredos Fora dos Clientes e dos Logs (1.14.0, item (f) emendado) | ✅ | ✅ | Chave/QR à vista só em Portal & licença (permitido pela emenda ADR-019); código oculto por padrão, olho por SELECT, reoculta ao sair/segundo plano/regenerar (D-004). Mensagens de falha só com código não secreto (FR-018). Contrato T1/T2/T4 checam ausência do código no DOM. |
| Categorias da Fonte São Preservadas | N/A | N/A | — |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Abrir a aba não exige rede com TV cadastrada (SC-005, contrato T1). |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Toda ação alcançável por setas + SELECT; RETURN fecha confirmação → menu → aba (D-007; `logic/foco-portal.md`). |
| Lista de Catálogo ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Todo estado tem focável (`more` sempre existe); focar o olho não revela; foco inicial definido (D-003). Contrato T2/T5. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Ações por id (D-001); volta de Pix/menus ao elemento de origem (D-007). |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais | ✅ | ✅ | Sem venda, não mostra Comprar/preço (FR-006); ações indisponíveis soft-disabled com motivo (FR-017); contagem regressiva do convite é real. |
| Documentação do Repositório É Canônica | ✅ | ✅ | Comentários que citam "Revogar acessos ao portal" (`PortalPairingPanel.tsx`) e roteiros E2E atualizados na mesma tarefa (T024–T026). |
| Restrição: Design system de TV | ✅ | ✅ | Só tokens; fonte mínima 20 px; auditoria de legibilidade das duas abas (FR-019). |
| Fluxo: E2E antes de TV física | ✅ | ✅ | `npm run test:e2e` no Polish; TV física fora do gate por decisão do usuário (R-003). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/075-redesenho-portal-licenca/
├── spec.md
├── plan.md
├── logic/foco-portal.md      # mapa de foco, foco inicial, olho, diálogos
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── components/               FixedQr.tsx, Button.tsx, Modal.tsx, RefreshButton.tsx (reuso)
│   ├── lib/
│   │   ├── portal/               usePairingCredentials.ts, displayId.ts (+formatDeviceKey), portalConnection.ts, unlink.ts
│   │   ├── licensing/            licenseRuntime.ts (commercialBuild, licenseMonitor), pixPurchaseRuntime.ts
│   │   └── i18n/messages/        portal.ts, settings.ts
│   └── features/settings/
│       ├── PortalLicensePanel.tsx        (reescrito: composição)
│       ├── PortalAccessCard.tsx          (novo)
│       ├── PortalLicenseCard.tsx         (novo)
│       ├── PortalMoreOptions.tsx         (novo: menu + confirmações)
│       ├── PortalBackupActions.tsx       (sem Desvincular)
│       ├── PortalConfirmDialog.tsx       (reuso)
│       ├── PortalPrivateDialog.tsx       (removido)
│       ├── portalLicense.css             (reescrito)
│       ├── usePortalRecovery.ts          (reuso)
│       └── tabs/
│           ├── PortalLicenseTab.tsx      (navegação por id)
│           ├── PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx  (TRAVADO)
│           ├── BackupTab.tsx             (novo)
│           ├── settingsTab.ts            (+'backup')
│           └── settingsTabs.ts           (+entrada Backup)
└── e2e/                          lib/portal.mjs, portal-*.mjs, consulta-sob-demanda.mjs, entrada-listas-gerenciador.mjs,
                                  licenca-anual.mjs, desvincular-backup.mjs, configuracoes-lista-global.mjs, legibilidade-tv.mjs
```

**Structure Decision**: tudo em `tv-web/`. A UI nova fica em `features/settings/` (sem importar `features/portal/`, regra do ratchet); lógica reaproveitada vem de `lib/portal`, `lib/licensing`, `lib/backup` e de `components/`.

## Complexity Tracking

Sem violações.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/settings
npm run lint
npx tsc -b
npm run test
npm run build
npm run test:e2e        # com `npm run dev` rodando
node e2e/legibilidade-tv.mjs
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tv-web/src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx`

Comando (de `tv-web/`): `npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| US1-AC1/FR-002/FR-003/FR-016/SC-005: QR, ID e chave agrupada à vista… | US1, FR-002/003/016, SC-005 | Fase 3 | `Unable to find role="img" and name "QR de acesso ao portal desta TV"` |
| US2-AC3/AC4/FR-007/FR-008/FR-009: …olho… | US2, FR-007/008/009 | Fase 4 | idem (QR ausente antes do olho) |
| US2-AC1/AC2/FR-009: build comercial… | US2, FR-005/009 | Fase 4 | idem |
| US3-AC1/AC2/FR-010/FR-011/FR-012: Mais opções… | US3, FR-010/011/012 | Fase 5 | `Unable to find an element with the text: 173 204 9818` |
| FR-004/FR-017/SC-003/Constitution: Foco Visível… | FR-004/017, SC-003, Constitution | Fase 3 | `expected document not to contain element` (botão "Gerar QR para o portal") |

Os testes mockam colaboradores, não a unidade: `getPortalConnection` (partial mock de `lib/portal/portalRuntime`) e `commercialBuild`/`licenseMonitor` (partial mock de `lib/licensing/licenseRuntime`, `commercialBuild` como getter — o painel deve **ler `commercialBuild` na renderização**, não copiá-lo para uma constante de módulo própria).

A trava da **067** (`SettingsScreen.configuracoes-lista-global.contract.test.tsx`, lista exata de abas) é emendada nesta feature com aprovação do usuário (spec FR-020): acrescentar `'Backup'` ao fim do array e regravar com `check-contract-tests.ps1 -Slug 067-configuracoes-lista-global -Write` (T021).

Stubs criados pelo plan: nenhum (os contratos usam apenas interfaces já existentes).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Portal & licença (US1–US3) | Implementada: dois cartões, olho, Mais opções; contratos 075 5/5 verdes, trava íntegra |
| Aba Backup (US4) | Implementada; `BackupTab` após `portal`; trava da 067 regravada pela emenda R-001 |
| Testes unitários | `src/features/settings` + `src/lib/portal` + `src/components` verdes; `tsc` e `lint` (ratchet) limpos |
| E2E / legibilidade | Concluídos: roteiros reescritos, `portal-mais-opcoes.mjs` novo no SUITE; `npm run test:e2e` 51/51 na 2ª rodada completa; legibilidade 123 telas, 0 achados (pt/en/es, inclui Portal & licença com código revelado, Mais opções, confirmação e Backup) |
| Polish | Concluído: comentário, chaves i18n mortas, spec alinhada (A1–A3), gates (lint, tsc, 3451 testes, build, E2E) e quickstart por scripts de teclado. Fora do gate e não feito: TV física (R-003) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Emenda da trava da 067 (lista de abas) | Sem ela a suíte fica vermelha | Aprovada na spec (FR-020); só acrescentar `'Backup'`; regravar a trava da 067 (T021). |
| R-002 | ~9 roteiros E2E dirigem os botões antigos por nome/ordem | `test:e2e` quebra | Fase 7 (T025–T026) reescreve o helper `e2e/lib/portal.mjs` e cada roteiro; rodar com `--only` antes da suíte. |
| R-003 | Sem passada na TV física (decisão do usuário) | Leitura real do QR e segundo plano Tizen sem prova | Registrado; `quickstart.md` traz o roteiro manual opcional. |
| R-004 | `commercialBuild` é constante de módulo (`MODE === 'commercial'`) | Teste comercial depende do mock por getter | Ler `commercialBuild` no render (não cachear em outra constante). |
| R-005 | `rotate('rotate')` fica sem chamador na UI | Código morto aparente | Manter no `PortalConnection` (write-ahead/retomada usa `purpose`); não remover nesta feature. |
| R-007 | `carrosseis-filmes-series` falhou uma vez na 1ª rodada completa (`Maximum update depth exceeded` no virtualizador de Filmes, 6 jobs em paralelo) | Gate E2E | Passou isolado (`--jobs 1`, 22 s) e a 2ª rodada completa fechou 51/51. Área sem relação com esta feature (nenhum arquivo de Filmes mudou); causa não investigada — taxa observada 1 falha em 2 rodadas completas. Fica registrado como flake suspeito, não como `ok` provado. |
| R-006 | QR fixo deixa de sumir em segundo plano (mudança do comportamento 071) | Teste antigo `PortalLicensePanel.test.tsx` contradiz | Reescrever esse teste (T014); o convite de recuperação continua sumindo. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-16 | Fases 2–6 (US1–US4) | Foundational + painel em cartões (`PortalAccessCard`/`PortalLicenseCard`/`PortalMoreOptions`), hooks `usePortalAccess`/`useCodeReveal`, aba Backup; contratos 075 5/5, emenda da trava 067 (`'Backup'`) regravada; `PortalPrivateDialog` removido; i18n morto limpo | Fase 7: reescrever E2E (9 roteiros), legibilidade, gates completos |
| 2026-10-16 | Fase 7 (Polish) | T024–T031: roteiros E2E e helper `e2e/lib/portal.mjs` (`abrirBackup`, `abrirMaisOpcoes`, `irParaFoco`, `gerarNovaChave`) reescritos; `portal-mais-opcoes.mjs` novo; legibilidade com 5 telas novas × 3 idiomas; gates: lint/ratchet ok, `tsc` limpo, `npm run test` 610 arquivos / 3451 verdes, build ok, E2E 51/51 (2ª rodada), opt-in `entrada-listas-gerenciador`, `desvincular-backup`, `consulta-sob-demanda`, `portal-dev-server` verdes contra a pilha local | `portal-pacote-file.mjs` atualizado e só checado por sintaxe (exige `build:tizen:commercial` sincronizado); TV física não feita (R-003) |

**PRÓXIMO**: `sdd-converge` 075-redesenho-portal-licenca; depois, opcional, passada na TV física (`quickstart.md` § TV física).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/settings/`: `PortalLicensePanel.tsx` (composição), `PortalAccessCard.tsx`, `PortalLicenseCard.tsx` (+`useCodeReveal`), `PortalMoreOptions.tsx`, `usePortalAccess.ts`, `portalActions.ts`, `PortalBackupActions.tsx` (3 ações), `portalLicense.css`
- `tv-web/src/features/settings/tabs/`: `PortalLicenseTab.tsx` (foco por id), `BackupTab.tsx`, `settingsTab.ts`, `settingsTabs.ts`
- `tv-web/src/lib/portal/displayId.ts` (`formatDeviceKey`), `components/iconPaths.ts` (`eye`, `eyeOff`), `lib/i18n/messages/portal.ts`
- `tv-web/e2e/`: `portal-mais-opcoes.mjs` (novo), `lib/portal.mjs`, `portal-*.mjs`, `consulta-sob-demanda.mjs`, `entrada-listas-gerenciador.mjs`, `licenca-anual.mjs`, `desvincular-backup.mjs`, `configuracoes-lista-global.mjs`, `legibilidade-tv.mjs`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- O painel é dono de `usePairingCredentials` e expõe `{ activate, actions, initial }` no handle: a aba lê `panel.current` a cada tecla (o handle é recriado a cada render) — em teste, releia `handleRef.current` a cada tecla, nunca guarde o handle.
- `settings.tab.backup` mora em `messages/portal.ts` de propósito: `messages/settings.ts` está no teto de 470 linhas do ratchet.
- Estado "TV desvinculada" mostra `Vincular de novo` (`pairing.retry` → `ensurePairing`, que religa com o lembrete da 072): sem ele o cartão ficaria sem focável fora do build comercial.
