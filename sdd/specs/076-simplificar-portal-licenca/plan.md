# Implementation Plan: Simplificar Portal & licença — ações raras e código de recuperação em Avançado

**Slug**: `076-simplificar-portal-licenca` | **Date**: 2026-10-16 | **Spec**: `sdd/specs/076-simplificar-portal-licenca/spec.md`

## Summary

Continuação da 075 (mesma tela, mesmos componentes). A tela principal de Configurações → Portal & licença perde o olho e o código e fica com os cartões **Acessar o portal** e **Licença** (este só no build comercial), uma linha lembrando de guardar o código de recuperação e o botão **Avançado**. O menu modal "Mais opções" vira uma **subtela dentro da aba** (`PortalAdvanced`) com quatro itens — Código de recuperação (com olho), Gerar nova chave e código, Recuperar pelo site, Desvincular esta TV — cada um com um texto fixo de "para que serve / quando usar". "Código da licença" passa a "código de recuperação" em toda a UI e na documentação canônica. Só frontend (`tv-web/`) mais 4 textos i18n do `portal-web`; nenhuma capacidade nova nem removida. A aba precisa tratar RETURN para fechar a subtela, então `SettingsTabHandle` ganha `onBack?: () => boolean`, consultado pela `SettingsScreen`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Vite 8, build `chrome108`)

**Primary Dependencies**: as da 075 (Dexie `liveQuery`, `FixedQr`, i18n próprio `lib/i18n` pt/en/es, foco próprio `useRemoteNav`); nada novo

**Storage**: IndexedDB já existente (`portalDevice`); nada novo

**Testing**: Vitest (projeto `dom`), E2E Playwright (`tv-web/e2e/*.mjs`), auditoria `e2e/legibilidade-tv.mjs`

**Target Platform**: Samsung Tizen 9 / Chromium 120, origem `file://`; palco 1920×1080

**Performance Goals**: N/A (tela estática); zero requisições ao abrir com TV cadastrada (herdado da 075, SC-005)

**Constraints**: só tokens V14; arquivo de produção ≤ 300 linhas (ratchet `scripts/architecture.mjs`; `messages/portal.ts` está em 297 → textos novos em área nova); `features/settings` não importa `features/portal`; um `useRemoteNav` por tela (a `SettingsScreen` encaminha teclas à aba pelo handle); textos novos nos três idiomas

**Scale/Scope**: 1 aba alterada, 1 subtela nova, ~9 arquivos de produção, 3 constantes de doc (constitution/ADR/CLAUDE.md), ~6 roteiros E2E ajustados

## Decisões Invariantes

- **D-001 — Dono da visão e do foco é a aba.** `PortalLicenseTab` guarda `{ view: 'main' | 'advanced', focusedId }` (por **id**, nunca índice) e passa ao painel; o painel só compõe e expõe `{ activate, actions, initial }` da visão atual. Transições em `logic/avancado-foco.md` §2.
- **D-002 — RETURN fecha a subtela via handle.** `SettingsTabHandle.onBack?: () => boolean` (já criado como stub). A `SettingsScreen` chama `tabHandle.current?.onBack?.()` **só com `zone === 'panel'`**; `true` consome (a tela não sai), ausente/`false` segue para `onBack` da tela. Aditivo e opcional: nenhuma outra aba muda.
- **D-003 — Avançado não é `Modal`.** É uma `<section aria-label="Avançado">` (região) dentro do painel, sem `role="dialog"`. Só as confirmações de rotação e Desvincular continuam `PortalConfirmDialog` (Modal). RETURN dentro de um Modal é do Modal.
- **D-004 — Ações e foco.** Principal: `[retry?] → purchase* → refresh* → advanced`; foco inicial Comprar/Atualizar (comercial) ou Avançado. Subtela: `eye → rotate → recover → unlink`, foco de entrada `eye`; ↑/↓ param nas pontas (a saída é Voltar/←).
- **D-005 — Código só na subtela.** O hook do olho (`useCodeReveal`, agora em `useCodeReveal.ts`) ganha `hide()`; o painel o chama ao voltar para `main`. A tela principal nunca renderiza o código nem a máscara (o contrato proíbe `••••` ali). Regra de exibição da ADR-019/constitution (f) inalterada: oculto ao abrir, SELECT, sem prazo, oculta ao sair/segundo plano/regenerar.
- **D-006 — Cartão Licença só no build comercial.** Fora dele o cartão não é renderizado e `.portal-cards` vira uma coluna. `commercialBuild` e `licenseMonitor` continuam lidos **na renderização** (R-004 da 075).
- **D-007 — Fluxos preservados.** Rotação = `connection.rotate('revoke')` com confirmação; Recuperar = `connection.recovery()` + `usePortalRecovery` (QR temporário substitui o fixo **na principal**, por isso escolher Recuperar volta à principal); Desvincular = fluxo 072. Tudo isso continua em `usePortalAccess.ts` sem mudança de comportamento. Depois de confirmar rotação ou Desvincular, a visão volta a `main` com foco em Avançado e a mensagem de resultado.
- **D-008 — Textos.** Chaves novas numa área nova `messages/portalAdvanced.ts` (registrada em `pt.ts`, `en.ts`, `es.ts` e `areas.test.ts`); `portal.more`, `portal.moreUnavailable`, `portal.codePrivateHint` saem de `portal.ts`; `portal.showCode`/`hideCode`/`codeLabel`/`rotateAllHint`/`changed` trocam "licença" por "recuperação". Texto de referência e substrings travadas pelo contrato: `logic/avancado-foco.md` §5.
- **D-009 — Terminologia fora da TV.** O `portal-web` já usa "Código de recuperação" nos rótulos principais; só 4 textos ainda dizem "código da licença/license code" (`recoveryHint` pt/en/es, `recoveryCode` en, FAQ en) e a dica manda "escolher Recuperar pelo site" (agora **Avançado → Recuperar pelo site**). Ajuste só de i18n, sem tocar em lógica nem em testes funcionais.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Portal continua opcional; sem configuração a tela mostra estado honesto e as listas seguem locais. |
| Segredos Fora dos Clientes e dos Logs (1.14.0, item (f) e parágrafo do código) | ✅ | ✅ | O código sai da tela principal e só aparece na subtela, oculto por padrão, por SELECT no olho, reoculto ao sair/segundo plano/regenerar (D-005). QR/ID/chave à vista continuam permitidos em Portal & licença (ADR-019). "Na própria tela" da emenda é lido como "na própria aba": esclarecimento PATCH (T022). Falhas só com código não secreto. |
| Categorias da Fonte São Preservadas | N/A | N/A | — |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Abrir a aba e o Avançado não exige rede com TV cadastrada (contrato T1). |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Tudo por setas + SELECT; RETURN: confirmação → subtela → principal → sai da tela (D-001/D-002). |
| Lista de Catálogo ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Subtela e todos os estados (sem portal, sem vínculo, falha) têm focável; itens indisponíveis soft-disabled **com motivo visível**; focar o olho não revela. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Ações por id; Voltar da subtela → `advanced`; cancelar confirmação → o mesmo item; retorno do Pix → `purchase`. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais | ✅ | ✅ | Sem venda, sem Comprar/preço; textos explicativos descrevem o que a ação realmente faz (nada prometido: o texto do código diz "traz de volta a licença e o backup" só no sentido de o serviço guardá-los; a TV física segue sem prova — R-006). |
| Documentação do Repositório É Canônica | ✅ | ✅ | ADR-019/constitution/CLAUDE.md/quickstart e comentários que citam "Mais opções" ou "código da licença" atualizados na mesma feature (T022–T024). |
| Restrição: Design system de TV | ✅ | ✅ | Só tokens; fonte mínima 20 px; subtela e principal na auditoria de legibilidade (FR-015). |
| Fluxo: E2E antes de TV física | ✅ | ✅ | `npm run test:e2e` + legibilidade no Polish; TV física fora do gate (herdado da 075). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/076-simplificar-portal-licenca/
├── spec.md
├── plan.md
├── logic/avancado-foco.md      # visões, transições, olho, DOM da subtela, textos
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/i18n/messages/            portal.ts (renomeia/remove), portalAdvanced.ts (novo), pt.ts, en.ts, es.ts, areas.test.ts
└── features/settings/
    ├── PortalLicensePanel.tsx        (view principal/avançado; sem olho)
    ├── PortalLicenseCard.tsx         (sem código; só Licença)
    ├── PortalAdvanced.tsx            (novo: subtela + confirmações; substitui PortalMoreOptions.tsx)
    ├── PortalMoreOptions.tsx         (REMOVIDO) + PortalMoreOptions.test.tsx → PortalAdvanced.test.tsx
    ├── useCodeReveal.ts              (novo: extraído de PortalLicenseCard, + hide())
    ├── portalActions.ts              (visões e ações por id)
    ├── usePortalAccess.ts            (inalterado)
    ├── portalLicense.css             (itens do Avançado, coluna única sem Licença)
    ├── SettingsScreen.tsx            (consulta tab.onBack antes de onBack)
    └── tabs/
        ├── PortalLicenseTab.tsx      (view + focusedId + onBack)
        ├── PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx   (075; EMENDA: remove 2 testes, regrava trava)
        ├── PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx (076; TRAVADO)
        └── settingsTab.ts            (onBack?: () => boolean)
portal-web/src/lib/i18n/          index.ts, faq.ts (4 textos)
tv-web/e2e/                       lib/portal.mjs, portal-mais-opcoes.mjs→portal-avancado.mjs, portal-configuracao.mjs, portal-dev-server.mjs,
                                  portal-pacote-file.mjs, entrada-listas-gerenciador.mjs, consulta-sob-demanda.mjs, desvincular-backup.mjs, legibilidade-tv.mjs, run.mjs
```

**Structure Decision**: tudo em `tv-web/`, na pasta da 075; `features/settings` não importa `features/portal`.

## Complexity Tracking

Sem violações. A única mudança em componente compartilhado é aditiva e opcional (`SettingsTabHandle.onBack`).

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/settings
npm run lint
npx tsc -b
npm run test
npm run build
npm run test:e2e        # com `npm run dev` rodando; no PowerShell use: node e2e/run.mjs [--only a,b]
node e2e/legibilidade-tv.mjs
```

### Testes de Contrato

Arquivo travado em `contract-tests.lock`: `tv-web/src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx` (5 testes)

Comando (de `tv-web/`): `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx`

| Teste | Origem | Fase | Vermelho confirmado (antes do execute) |
| --- | --- | --- | --- |
| US1-AC1/AC2/AC4/FR-001/FR-002/SC-001: build comercial — só Comprar, Atualizar e Avançado… | US1, FR-001/002, SC-001 | Fase 3 | `AssertionError: expected [ 'Mostrar código da licença', …(3) ] to deeply equal [ Array(3) ]` |
| US1-AC3/FR-003/FR-004: build não comercial — sem cartão Licença, foco em Avançado | US1, FR-003/004 | Fase 3 | `expected document not to contain element, found <h3>` |
| US2-AC1/AC5/FR-005/FR-006/SC-002: Avançado abre subtela com 4 itens e textos | US2, FR-005/006, SC-002 | Fase 4 | `Unable to find an accessible element with the role "button" and name "Avançado"` |
| US2-AC2/AC3/AC4/FR-007/FR-008/SC-004: olho; Voltar fecha com foco em Avançado | US2, FR-007/008, SC-004, Constitution: Segredos / Voltar Restaura Foco | Fase 4 | idem |
| US3-AC1/FR-010: gerar nova chave só após confirmar, volta à principal com a nova chave | US3, FR-010 | Fase 5 | idem |

Os testes mockam colaboradores (`getPortalConnection`, `commercialBuild` por getter, `licenseMonitor`), nunca a unidade. O stub `SettingsTabHandle.onBack?` já existe (só tipo) e não quebrou nenhum teste da área (`src/features/settings`: 161 verdes + os 5 vermelhos).

**Emenda da 075 (R-001)**: o contrato travado da 075 (`PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx`) tem dois testes que a 076 invalida de propósito — o do olho na tela principal (`US2-AC3/AC4/FR-007/FR-008/FR-009`) e o do menu "Mais opções" (`US3-AC1/AC2/FR-010/FR-011/FR-012`); os 3 restantes (US1-AC1, US2-AC1/AC2 comercial, FR-004 sem portal) **continuam valendo** e devem seguir verdes. A emenda (T009) só remove esses dois `it` (e imports que ficarem sem uso) e regrava a trava da 075 (`-Slug 075-redesenho-portal-licenca -Write`, 3/3). Aprovada na spec (FR-016).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fundação (Fase 2) | Concluída: `SettingsScreen` consulta `tab.onBack`; área i18n `portalAdvanced.ts` + renomes para "código de recuperação"; `portalActions.ts` com visões (legado da 075 mantido até T007); `useCodeReveal.ts` (+`hide`); CSS do Avançado |
| Tela principal (US1, Fase 3) | Concluída: cartões (Licença só no comercial), lembrete do código, botão Avançado; contratos US1 2/2 verdes |
| Avançado (US2, Fase 4) | Concluída: subtela `PortalAdvanced`, olho (`useCodeReveal(device, active)`), Voltar via `onBack`; contratos US2 2/2 verdes |
| Ações do Avançado (US3, Fase 5) | Concluída: confirmações, rotação, Recuperar e Desvincular a partir da subtela; `PortalMoreOptions` removido; contratos 076 5/5 verdes |
| Polish (Fase 6) | Concluído: terminologia (constitution 1.14.1, ADR-019/016, CLAUDE.md, portal-web i18n), E2E reescritos (portal-avancado.mjs no SUITE), legibilidade 123 telas/0 achados, rolagem da subtela corrigida (T028) |
| Gates | `npm run test` 616 arquivos / 3476 verdes; lint + ratchet, `tsc` e build limpos; `node e2e/run.mjs` 52/52; travas 076 (5), 075 (3) e 067 íntegras |
| Roteiros opt-in | Executados com a pilha local livre e **verdes**: `entrada-listas-gerenciador`, `desvincular-backup`, `consulta-sob-demanda`, `portal-dev-server` (T029) |
| Não verificado | `portal-pacote-file` (exige `build:tizen:commercial` sincronizado; só sintaxe) e TV física (fora do gate) |
| Contrato da 075 | Emendado (T009): 3/3 verdes, trava regravada e íntegra |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Emenda do contrato travado da 075 (remove 2 de 5 testes) | Sem ela a suíte fica vermelha quando o olho sair da principal | Resolvido: Aprovada na spec (FR-016); só apagar os dois `it` e imports sem uso; regravar a trava da 075 (T009) e registrar nas Execution Notes. |
| R-002 | `SettingsScreen` passa a consultar `tabHandle.current?.onBack?.()` | Risco de mudar o RETURN das outras abas | Resolvido: Opcional e só com `zone === 'panel'`; as outras abas não definem `onBack`; rodar `src/features/settings` inteiro (contratos 026/028/067 ficam verdes). |
| R-003 | `portal-web/src/lib/i18n/index.ts` já tem mudanças não commitadas de outra feature | Misturar edições | Resolvido: T025 só troca 4 linhas de texto; **não** reverter nem commitar o resto; conferir `git diff` do arquivo antes e depois. |
| R-004 | `messages/portal.ts` está em 297/300 linhas | Ratchet quebra com chaves novas | Resolvido: Chaves novas em `portalAdvanced.ts` (D-008); as renomeações trocam texto em linha, as remoções (3 chaves × 3 idiomas) liberam espaço. |
| R-005 | Constitution (f) diz "na própria tela" para o olho; agora ele fica numa subtela da mesma aba | Leitura literal poderia sugerir violação | Resolvido: PATCH 1.14.1 de esclarecimento ("na própria aba, nunca em modal de aviso") e nota na ADR-019 (T022/T023); a regra não é enfraquecida. |
| R-006 | O texto do código promete "traz de volta a licença e o backup" após formatar | Prometer além do provado (a TV pode ter outro identificador depois de formatar; não verificado em hardware) | Texto descreve a função do código, não garante o resultado em toda TV; passada na TV física segue recomendada, fora do gate. |
| R-007 | Roteiros E2E acionam "Mais opções" e o olho na principal | `test:e2e` quebra | Resolvido: T026/T027 reescrevem `lib/portal.mjs` e os roteiros; rodar `--only` antes da suíte. |
| R-008 | `carrosseis-filmes-series` já falhou uma vez em suíte completa na 075 (flake suspeito, R-007 daquela) | Pode reaparecer no gate | Reexecutar isolado (`--jobs 1`) antes de contar como falha desta feature. Nesta feature passou: 52/52 na suíte completa. |
| R-009 | `src/lib/catalog/blockMemo.test.ts` falhou numa suíte completa e passou isolado e na 2ª rodada completa (616/616) | Flake de suíte cheia em área não tocada por esta feature | Registrado como flake suspeito; não investigado. |
| R-010 | Roteiros opt-in dependem da pilha local e o `dev:portal` do usuário estava no ar | Mudanças do Avançado nesses 4 roteiros sem execução | Resolvido: rodados com a pilha livre, os 4 passaram (T029). |
| R-011 | O `scrollIntoView({ block: 'nearest' })` no botão focado existe também nas outras abas de Configurações (o usuário relatou o mesmo corte) | Título/texto acima do botão focado ficam cortados ao subir | **Fora do escopo desta feature**: só `PortalLicenseTab` foi corrigida (T028). A correção genérica fica para decisão do usuário. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-16 | Fase 2 (Foundational) | T001–T005: RETURN da aba na `SettingsScreen`, i18n (área nova + renomes; remoção de `portal.more/moreUnavailable/codePrivateHint` adiada p/ T007/T018 por causa do `tsc`), `portalActions.ts`+teste, `useCodeReveal.ts`, CSS | Fase 3 (US1): cartão Licença, painel principal, aba, emenda T009 |
| 2026-10-16 | Fase 3 (US1) | T006–T011: cartão Licença sem olho; painel principal (`view`, Avançado, lembrete); aba com `{view, focusedId}` + teclas da subtela + `onBack`; legado da 075 removido; emenda T009 (075 → 3 testes, trava regravada); testes novos/reescritos; `PortalMoreOptions.test.tsx` apagado (volta em T019) | Fase 4: `PortalAdvanced`, olho, `hide()` |
| 2026-10-16 | Fase 4 (US2) | T012–T016: `PortalAdvanced.tsx`; painel na visão `advanced` + olho (`useCodeReveal(device, active)` no lugar de `hide()`); testes de `PortalAdvanced`, de textos nos 3 idiomas, de `SettingsScreen` ↔ `tab.onBack` e da navegação da subtela | Fase 5: confirmações e fluxos de rotação/Recuperar/Desvincular |
| 2026-10-16 | Fase 5 (US3) | T017–T019: confirmações (`PortalConfirmDialog`) e fluxos de rotação/Recuperar/Desvincular a partir do Avançado; `PortalMoreOptions.tsx` e chaves órfãs removidos; `PortalAdvanced.flows.test.tsx` (5) | Fase 6 (Polish) |
| 2026-10-16 | Fase 6 (Polish) | T020–T028: terminologia (comentários, constitution 1.14.1, ADR-019 nota/título, ADR-016, CLAUDE.md, 7 textos i18n do portal-web); helper E2E `abrirAvancado`/`gerarNovaChave`; `portal-mais-opcoes.mjs` → `portal-avancado.mjs`; opt-in atualizados; legibilidade; **T028**: rolagem da subtela (relato do usuário) com teste unitário e verificação de layout que reproduz o defeito sem a correção; gates | Opt-in com pilha local por rodar (R-010); rolagem parecida nas outras abas (R-011) |

| 2026-10-16 | Fase 7 (Convergence) | T029–T030: os 4 roteiros opt-in rodaram verdes com a pilha local livre (nenhum ajuste necessário); nota de textos da spec alinhada ao `logic/` e ao `portalAdvanced.ts` | `portal-pacote-file` só sintaxe; rolagem das outras abas (R-011) |

**PRÓXIMO**: `sdd-converge` 076-simplificar-portal-licenca (deve fechar limpo); decidir sobre a rolagem das demais abas (R-011).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/settings/`: `SettingsScreen.tsx`, `portalActions.ts` (+test), `useCodeReveal.ts`, `portalLicense.css`, `PortalLicenseCard.tsx`, `PortalLicensePanel.tsx`, `tabs/PortalLicenseTab.tsx`, `tabs/settingsTab.ts`
- `tv-web/src/lib/i18n/messages/`: `portalAdvanced.ts` (novo), `portal.ts`, `pt.ts`/`en.ts`/`es.ts`, `areas.test.ts`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- O olho oculta ao sair do Avançado por `useCodeReveal(device, active)` (`active = view === 'advanced'`), não por `hide()`. Em teste da aba, releia `handleRef.current` a cada tecla (o handle é recriado a cada render).
- A mensagem `portal.recoveryNeeded` também dizia "código da licença": já corrigida nos 3 idiomas, com "Em Avançado, use Recuperar pelo site…".

## Resultado Final

*Convergência de 2026-10-16: sem achado acionável; contratos 076 5/5 e 075 3/3 verdes, travas íntegras.*

**O que foi construído.** A tela Configurações → Portal & licença ficou enxuta: cartão Acessar o portal (QR, site, ID e chave agrupada à vista), cartão Licença só no build comercial (estado, validade, oferta, Comprar/Renovar licença e Atualizar), uma linha lembrando de guardar o código de recuperação e o botão **Avançado**, sem olho nem código na tela principal. **Avançado** é uma subtela dentro da aba (`PortalAdvanced`, região "Avançado", não `Modal`) com quatro itens — Código de recuperação (oculto por padrão, olho), Gerar nova chave e código, Recuperar pelo site e Desvincular esta TV — cada um com texto fixo de "para que serve / quando usar". RETURN fecha a subtela por `SettingsTabHandle.onBack`, consultado pela `SettingsScreen` só com o foco no painel. Confirmar rotação/Desvincular e escolher Recuperar voltam à tela principal. O "código da licença" passou a "código de recuperação" em toda a interface (pt/en/es), no `portal-web` (7 textos i18n), na constitution (1.14.1, PATCH), nas ADR-019/016 e no CLAUDE.md.

**Desvios em relação ao plano.**
- `useCodeReveal(device, active)` em vez de `hide()` (D-005): com `active = view === 'advanced'` o código oculta ao sair da subtela sem efeito no painel.
- A aba (T008) já tratava as teclas da subtela e o `onBack`; a T014 só confirmou por testes.
- `PortalMoreOptions.test.tsx` foi apagado na Fase 3 e seus casos voltaram em `PortalAdvanced.flows.test.tsx` (Fase 5); as chaves `portal.more`/`portal.moreUnavailable` saíram junto com `PortalMoreOptions.tsx`.
- Emenda aprovada (R-001): dois testes do contrato da 075 (olho na principal; menu "Mais opções") foram removidos e a trava da 075 regravada com 3 testes.
- Textos novos em área própria (`messages/portalAdvanced.ts`) por causa do teto de 300 linhas de `portal.ts`; texto do código usa "permite recuperar" (R-006).
- **Task ad-hoc T028** (relato do usuário): a rolagem da subtela cortava título e texto do primeiro item; corrigida em `PortalLicenseTab` (primeira ação rola ao topo, demais mostram o bloco do item) com teste unitário e verificação de layout no `e2e/portal-avancado.mjs`, que reproduz o defeito sem a correção.
- Roteiro de teclado `portal-mais-opcoes.mjs` virou `portal-avancado.mjs` (no SUITE).

**Verificação.** `npm run test` 616 arquivos / 3476 verdes; lint com ratchet, `tsc` e build limpos; `node e2e/run.mjs` 52/52; legibilidade 123 telas e 0 achados (pt/en/es); roteiros opt-in com a pilha local (`entrada-listas-gerenciador`, `desvincular-backup`, `consulta-sob-demanda`, `portal-dev-server`) verdes.

**Continua aberto (fora do gate ou fora do escopo).** TV física não feita (R-006: identificador do aparelho depois de formatar não verificado); `portal-pacote-file.mjs` só com sintaxe checada (exige `build:tizen:commercial`); rolagem do mesmo tipo nas outras abas de Configurações (R-011, decisão do usuário); flakes suspeitos sem relação com a feature (R-008, R-009).