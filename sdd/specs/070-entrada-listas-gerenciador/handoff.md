# Handoff — 070 (para continuar a execução em outra sessão/modelo)

Atualizado em 2026-10-13, ao fim da Fase 3. Substitui o handoff do `sdd-plan` (o de planejamento está no histórico do git, commit `360f3ba`).

## Contexto

- Repositório ccplayTv, branch `feature/designWave2`. TV React/TS (Vite, alvo `chrome108`, Tizen `file://`), portal-web React, API FastAPI + Firestore em `api/app/portal/`.
- Commits desta etapa: `360f3ba` (docs: constitution 1.10.0, ADR-014, specs), `c3cc8ea` (API: ID/chave/sessão), `4dc8d3b` (infra dev + portal-web), `3653bcb` (TV: painel do celular, agente, E2E, travas).
- Backlog: **Em Execução, 21/56**. Próximo comando: `/sdd-execute 070-entrada-listas-gerenciador` a partir da **Fase 4 (US2)**. Peça modo contínuo se quiser seguir sem pausas.
- **Não commitar**: `CCPlayTv/assets/*` (pacote comercial sincronizado), `logs/*`, `tv-web/test-results/*.png`. **Não mexer** em `sdd/bugs/botoes-gerar-qr-code-portal-nao/` (não pertence a esta feature).

## Estado

| Fase | Estado |
| --- | --- |
| 1 — normas/plataforma | Constitution 1.10.0 + ADR-014 aplicadas. **T003 aberta**: sonda do MAC pronta (`lib/portal/platformProbe.ts`), não executada na TV física (exige instalar build de diagnóstico — só com autorização do usuário). |
| 2 — ID + chave | Concluída. API 117/117. Contratos C4/C5 verdes. |
| 3 — US1 tela Adicionar | Concluída. C1 verde. E2E `entrada-listas-gerenciador.mjs` PASS. **T017 aberta** (privilégio de rede no `config.xml`, depende da T003). |
| 4 — US2 formulário | **Próxima.** Contrato C2 vermelho (esperado). |
| 5 — US3 painel web | Não iniciada. |
| 6 — US4 saída | Não iniciada. Contrato C3 vermelho (esperado, `not implemented`). |
| 7 — Polish | Não iniciada. |

## Leitura obrigatória, em ordem

1. `tasks.md` — fonte da verdade; Registros das Fases 1–3 dizem o que foi feito e testado.
2. `plan.md` — D-001..D-012, R-001..R-011, **Cuidados para Retomada**.
3. `spec.md` — FR-008..FR-020 para as fases restantes.
4. `logic/pareamento.md`, `contracts/portal-api-070.md`, `data-model.md` — Fase 5.
5. `quickstart.md` — roteiro de validação final.

## Testes de contrato (travados — nunca editar)

`contract-tests.lock` (5/5). Rodar em `tv-web/`:

```
npx vitest run src/features/portal/PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx src/features/import/AddSourceScreen.entrada-listas-gerenciador.contract.test.tsx src/navigation/appNav.entrada-listas-gerenciador.contract.test.ts src/lib/portal/pairingIdentity.entrada-listas-gerenciador.contract.test.ts
```

Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador`. Também precisam continuar íntegras e verdes **sem edição**: 037 (já emendada e regravada com autorização), 045, 023, 024, 069.

| Contrato | Fase | Estado |
| --- | --- | --- |
| C1 PortalPairingPanel | 3 | verde |
| C4/C5 pairingIdentity | 2 | verdes |
| **C2** AddSourceScreen edição (valores salvos + olho) | 4 | vermelho: `toHaveValue(senha-secreta-123)` |
| **C3** appNav `leave-list` | 6 | vermelho: `not implemented` |

## Como fazer a Fase 4 (C2) sem errar

O C2 renderiza `AddSourceScreen` em edição de uma lista Xtream gravada em `db.sources` e exige:

- `Servidor`, `Usuário` e `Senha` **pré-preenchidos** com os valores locais (`providerDns`, `providerUsername`, `providerPassword` de `db.sources`), e **visíveis** (`input.type !== 'password'`).
- **Um único** botão cujo nome começa por `Ocultar` (e depois por `Mostrar`) que alterna os **três** campos para `type="password"` e de volta. `getByRole('button', { name: /^Ocultar/ })` falha se houver dois botões — por isso o olho por campo da senha (`revealable` no `TextField`, rótulos "Mostrar senha"/"Ocultar senha") **tem de sair** de `SourceFormFields.tsx` e virar um olho do formulário ("Ocultar dados"/"Mostrar dados", pt/en/es em `lib/i18n/messages/sources.ts`).
- Sugestão de forma: `TextField` ganha uma prop opcional (ex.: `masked?: boolean`) que força `type="password"` em qualquer `purpose`, sem quebrar o `revealable` usado por outras telas (BYOK). Ler os valores via um acessor novo em `lib/catalog/sourceRepository.ts` (teto 409 linhas) e um hook em `features/import/`; **não** ler `db.sources` direto dentro do componente se houver acessor.
- Testes não travados que vão mudar (ajuste-os, não os contratos): `AddSourceScreen.test.tsx` linha ~180 ("deixe em branco… usuário/senha seguem em branco", D-013 — agora os valores aparecem; os hints "Deixe em branco para manter…" deixam de fazer sentido na edição) e linha ~236 (ordem de foco com `'Mostrar'` — passa a ser o botão do olho do formulário, que nasce como "Ocultar dados").
- Contrato 045 continua valendo: nenhum segredo no `textContent`/`aria-label` (valor de `<input>` não conta; não ecoar URL/usuário em texto auxiliar). Contrato 037 teste 1: título "Conecte sua lista IPTV", Xtream por padrão **em foco**, rótulos `Nome da lista`/`Servidor`/`Usuário`/`Senha`/`URL M3U`/`Conectar e sincronizar`.
- `AddSourceScreen.tsx` tem 354 linhas (teto da ratchet 421) — cabe, mas prefira pôr lógica nova em `SourceFormFields.tsx`/hook.

## Fase 6 (C3)

- `appNav.ts`: `case 'leave-list'` hoje lança `not implemented`. Deve devolver os perfis como base com foco na lista ativa: `profilesAsBase(state.activeSource?.id)` (pilha vazia, `activeSource: null`). **Não** mudar `back` (contrato 023: `back` na base é no-op).
- `HomeScreen.tsx`: RETURN (`onBack` em duas chamadas, linhas ~159/173) passa a chamar uma prop nova `onLeaveList` em vez de abrir `ExitModal`; remover o `ExitModal` da Home (o import herdado da ratchet vira aviso de exceção obsoleta — ok, ou `node scripts/architecture.mjs --prune`). `App.tsx` despacha `{ type: 'leave-list' }`. Atualizar `HomeScreen.test.tsx` (teste FR-019 "RETURN abre Sair do CCPlayTV?").
- Conferir no `App.tsx` o `leaveSource` (linha ~63, usa `import-back`) para não duplicar a saída da lista; o player aberto é fechado pela pilha antes de chegar ao Início.

## Fase 5 (servidor + portal-web) — pontos-chave

- Rota nova `GET /portal/v1/configurations/{sourceId}/values` em `api/app/portal/routes/operations.py`, reusando a decifragem de `configuration_delivery.py` (linha ~78), só para sessão `manage` da **mesma TV**, 404 para fonte excluída/de outra TV, nunca logar. `Cache-Control: no-store` já é global no middleware.
- `GET /portal/v1/session/device` deve devolver `displayId` e licença.
- portal-web: `SessionPage.tsx` ainda mostra os rótulos antigos "ID da TV"/"Chave da TV" (a T044 só trocou o campo enviado para `displayId`). Ao trocar os rótulos (T027), **atualizar** os E2E que usam esses rótulos: `portal-web/e2e/configuracao.spec.ts` e `tv-web/e2e/entrada-listas-gerenciador.mjs`.

## Ambiente e armadilhas já mapeadas

- **Ordem de publicação (crítica)**: publicar a API da 070 no staging (T041, **pedir confirmação do usuário**) ANTES de instalar na TV um pacote com a 070 — com o serviço antigo, `ensurePairing()` recebe de novo a chave longa sem `displayId` e faria uma rotação `revoke` a cada abertura da tela Adicionar. A TV aceita a chave legada (R-010) só para não quebrar.
- Arquivos com LF e CRLF misturados: substituição por PowerShell com `` `n `` pode não casar e salvar só metade — **use o Edit**. Mensagens de commit: escreva num arquivo e use `git commit -F <arquivo>` (here-string via pipe não funciona no PowerShell).
- pytest do portal: `$env:PORTAL_TEST_FIRESTORE='1'`, emulador do gcloud com **Java 21** (o `java` do PATH é 17; use `$env:JAVA_HOME\bin`, JBR do Android Studio) e `--basetemp` num diretório acessível (o `%TEMP%\pytest-of-johns` dá Access denied). Comando: `.venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider --basetemp=<dir>`.
- E2E de pilha local (`e2e/lib/portalStack.mjs`: emulador + API + portal-web + TV commercial) exigem as portas 8085/3001/5174/5176 livres; matar emulador avulso antes. Opt-in, fora do `SUITE` do runner: `node e2e/entrada-listas-gerenciador.mjs`, `node e2e/portal-dev-server.mjs`, `node e2e/portal-integrado-local.mjs`. Uso manual: `npm run dev:portal` (abre a TV em `http://localhost:5173`; pare o `npm run dev` antes).
- O canto "Adicionar pelo site" não existe mais nos perfis; para abrir o painel de licença nos E2E use `abrirPortalLicenca(page)` de `tv-web/e2e/lib/portal.mjs`.
- `npm run test` completo leva ~9 min. **Instabilidade aberta (R-011)**: `src/lib/licensing/licenseRuntime.test.ts` falhou 2 casos sob carga (timeout de 5 s no `import()` dinâmico) e passa isolado; não é da 070 — registre se repetir, nunca afrouxe timeout.
- Nunca desinstalar o app da TV do usuário; reinstalar com `deploy-tv.ps1` preserva dados.

## Pendências

- T003/T017: sonda do MAC na TV física e privilégio no `config.xml` (precisa autorização).
- A003 (Analyze): SC-002/SC-003 são observações manuais com pessoas — encaixar na T042.
- T041/T042: staging e TV física exigem confirmação/observação do usuário.

## Gate de pronto

Contratos 5/5 verdes e travas 070/037/045/023/024/069 íntegras; TV `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `build:tizen`; API pytest (emulador) + Ruff; portal-web lint/test/build/E2E; E2E de pilha local e `npm run test:e2e` com `npm run dev`; revisão de segredos (T037); docs (T038); staging (T041) e TV física (T042) só com o usuário.
