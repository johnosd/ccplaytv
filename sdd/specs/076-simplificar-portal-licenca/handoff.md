# Handoff — 076-simplificar-portal-licenca

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca` (muitas mudanças não commitadas de outras features — não reverter nada fora desta; `portal-web/src/lib/i18n/index.ts` está entre elas).
- Stack: `tv-web/` React 19 + TypeScript + Vite, Dexie, Vitest/Playwright; foco próprio (`useRemoteNav`).
- Próximo comando: `/sdd-execute 076-simplificar-portal-licenca`. Backlog: **Planejada**, 0/37.
- Continua a **075** (Portal & licença em dois cartões + "Mais opções", já Implementada). A decisão do usuário: "Esconder em Avançado" e explicar cada item em linguagem simples, porque nem ele entendeu o fluxo. Releia `.planning/memory/constitution.md` item (f) e a ADR-019 antes de mexer no que fica à vista.

## O que a feature entrega

- **US1 (P1)**: tela principal enxuta — cartão Acessar o portal (QR/site/ID/chave à vista), cartão Licença **só no build comercial** (Comprar/Renovar licença + Atualizar), linha "Guarde seu código de recuperação em Avançado.", botão **Avançado**. **Sem olho e sem código** (nem a máscara). Foco inicial: Comprar (teste/vencida/sem), Atualizar (ativa), **Avançado** (não comercial).
- **US2 (P1)**: **Avançado = subtela dentro da aba (não Modal, `role="region"`)** com 4 itens (Código de recuperação com olho, Gerar nova chave e código, Recuperar pelo site, Desvincular esta TV), cada um com texto de "para que serve / quando usar" sempre visível. RETURN fecha a subtela com foco em Avançado.
- **US3 (P2)**: as ações funcionam como na 075; confirmar rotação/Desvincular e escolher Recuperar **voltam à tela principal** (Recuperar mostra o QR temporário lá).
- "Código da licença" vira **código de recuperação** em toda a UI e documentação (ele nunca foi licença comprada).
- Fora: `api/`, lógica do `portal-web` (só 4 textos i18n), aba Backup, Adicionar lista, bloqueio, Pix, TV física.

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FR-001..017, SC-001..006, Clarifications.
2. `plan.md` — D-001..D-009, Constitution Check, R-001..R-008.
3. `logic/avancado-foco.md` — visões/ações por id, tabela de transições, olho, **DOM da subtela**, **textos (pt) e as substrings que o contrato fixa**.
4. `tasks.md` — T001..T027 por fase.
5. `quickstart.md` — comandos e cenário.
6. `sdd/specs/075-redesenho-portal-licenca/logic/foco-portal.md` — o que continua valendo (mapa de teclas da principal, olho, segundo plano).
7. `.planning/memory/constitution.md` — "Segredos…" item (f), "Foco Visível…", "Voltar Restaura Foco".

## Testes de contrato

- `tv-web/src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx` — 5 testes (Fase 3: 2; Fase 4: 2; Fase 5: 1). Todos vermelhos hoje por asserção (confirmado).
- Rodar (de `tv-web/`): `npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx` (use `-t "US1"` / `"US2"` / `"US3"` por fase).
- Trava (da raiz): `powershell -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 076-simplificar-portal-licenca`
- **Outra trava afetada (075)**: `PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx` tem 2 testes que esta feature invalida de propósito (olho na principal; menu "Mais opções"). **Emenda aprovada (FR-016, T009)**: apagar só esses dois `it` + imports que ficarem sem uso e regravar com `check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca -Write` (3/3). Faça isso na mesma fase em que o olho sai da principal (Fase 3). Os 3 testes restantes da 075 devem continuar verdes.
- A trava da 067 e a da 070 (`PortalPairingPanel…contract`) não podem quebrar — não mexa na chave de Adicionar lista.

## Stubs criados

- `tv-web/src/features/settings/tabs/settingsTab.ts`: `SettingsTabHandle.onBack?: () => boolean` (só o tipo, opcional). A `SettingsScreen` ainda **não** consulta (T001 liga e tira o aviso "STUB" do comentário).

## Armadilhas já mapeadas

- **Contrato é DOM puro**: região `aria-label="Avançado"`; 4 `h3` (nível 3) com os títulos exatos; botões exatos `Mostrar código de recuperação`/`Ocultar código de recuperação`, `Gerar nova chave e código`, `Recuperar pelo site`, `Desvincular esta TV` (na subtela **só esses 4 botões**, sem Voltar); na principal os botões (comercial) são exatamente `Comprar licença`, `Atualizar`, `Avançado` nessa ordem de DOM, e no não comercial só `Avançado`. Sem `role="dialog"` na subtela.
- **Substrings de texto travadas** (pt): `não é uma licença comprada`, `sessões abertas no site são encerradas`, `perdeu o acesso ao portal`, `sem apagar listas e dados`, e a frase `Guarde seu código de recuperação em Avançado.`; cada uma deve casar **um** elemento dentro da subtela.
- **RETURN**: o `Modal` das confirmações captura RETURN antes de tudo (a aba não vê). Para a subtela, só vale `SettingsTabHandle.onBack` consultado pela `SettingsScreen` com `zone === 'panel'` (T001). Sem isso, RETURN sai de Configurações.
- **`commercialBuild` lido no render** (o contrato mocka por getter); `licenseMonitor` também vem de `lib/licensing/licenseRuntime`; `getPortalConnection()` é o único caminho da conexão.
- **Olho**: o `activate('eye')` chega pelo painel, então o hook fica no painel (`useCodeReveal.ts`) e ganha `hide()` ao voltar para `main` (o contrato reabre o Avançado e espera o código oculto).
- **Chave num único nó de texto** (`formatDeviceKey`): `getByText('173 204 9818')`. QR fixo e chave não somem em segundo plano; só o código e o convite de recuperação.
- **Ratchet**: `messages/portal.ts` está em 297/300 → textos novos em `messages/portalAdvanced.ts` (registrar em `pt.ts`/`en.ts`/`es.ts` e na lista `AREAS` de `areas.test.ts`); `messages/settings.ts` está no teto de 470 (não pôr nada lá); arquivo de produção ≤ 300 linhas; `features/settings` não importa `features/portal`.
- **Texto do código**: use "permite recuperar a sua licença e o seu backup" (não "traz de volta"): a TV física e o identificador depois de formatar não foram verificados (R-006).
- **portal-web (R-003)**: `index.ts` já está modificado por outra feature; troque só as 4 linhas de texto, confira `git diff` antes/depois e não commite o resto.
- **E2E**: no PowerShell `npm run x -- --flag` perde o `--`: use `node e2e/run.mjs --only a,b`. `portal-mais-opcoes.mjs` (SUITE, porta 5180) vira `portal-avancado.mjs` (atualizar `e2e/run.mjs`). O helper `e2e/lib/portal.mjs` hoje exporta `abrirMaisOpcoes`/`gerarNovaChave` (cliques em "Mais opções"); a legibilidade (`auditPortalScreens`, Vite comercial na porta 5177) abre as abas **por clique** e usa o botão `.portal-license-panel > .portal-card-actions button` — vai mudar (T025). `npm run dev:portal` já está corrigido para saída colorida (`e2e/lib/portalStack.mjs`).
- **Flake conhecido**: `carrosseis-filmes-series` falhou uma vez na suíte completa da 075 (passou isolado) — reexecute isolado antes de contar (R-008).

## Pendências do Analyze

- A1 (MEDIUM) — `spec.md` §Assumptions traz rascunhos de texto em pt que diferem do texto final de `logic/avancado-foco.md` §5 (que inclui "Guarde fora da TV…"). A fonte da verdade é o `logic/`; alinhar a spec no Polish (sem mudar requisitos).
- A2 (MEDIUM) — R-006: o texto promete recuperar licença/backup depois de formatar; não verificado na TV. Mitigado com "permite recuperar" e passada na TV recomendada (não gate).
- A3 (LOW) — FR-014 (falhas só com código não secreto) não tem teste novo: herda `usePortalAccess`/`PortalAccessCard` da 075 (já testados). Conferir que a subtela não cria mensagem nova de falha.
- A4 (LOW) — A tela principal mantém as mensagens de resultado (`portal.changed`, desvinculada, falhas) abaixo dos cartões; como as ações agora acontecem na subtela, confirmar no quickstart que o resultado é visível ao voltar à principal.

## Gate de pronto

- Contratos 076 5/5 verdes + trava íntegra; contrato da 075 emendado 3/3 + trava regravada e íntegra.
- De `tv-web/`: `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`, `node e2e/run.mjs` (com `npm run dev`), `node e2e/legibilidade-tv.mjs`.
- `quickstart.md` executado no navegador.
- Polish: constitution 1.14.1 (terminologia + esclarecimento do item (f)), nota na ADR-019/ADR-016, `CLAUDE.md` (versão e linha da ADR-019), `plan.md` Estado Atual/Execution Notes, backlog via script.
- TV física: **recomendação, não gate**.
