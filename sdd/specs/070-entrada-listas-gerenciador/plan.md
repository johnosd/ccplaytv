# Implementation Plan: Entrada de listas estilo gerenciador

**Slug**: `070-entrada-listas-gerenciador` | **Date**: 2026-10-13 | **Spec**: `sdd/specs/070-entrada-listas-gerenciador/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Torna a entrada de listas igual à de um gerenciador de playlists: a tela "Conecte sua lista IPTV" (já com duas colunas desde a 037) troca o mock "Em breve" do celular por um painel real com **ID do dispositivo no formato MAC**, **chave numérica de 10 dígitos sempre visível**, endereço do painel, QR e Recarregar; o formulário ganha campos grandes, texto visível por padrão com um olho e, na edição, os **valores salvos**. O painel web passa a entrar por ID + chave, mostra ID/status/validade/pagamento e exibe os valores salvos na edição. RETURN no Início leva à tela de listas, a única que pede para sair.

Abordagem: evoluir as superfícies existentes (sem tela nova de cadastro), reaproveitando a infraestrutura da 069 (identidade, rotação write-ahead `revoke`, convites, sincronização, staging). Três decisões do usuário contrariam a constitution 1.9.0; a **Fase 1 é a emenda 1.10.0 + ADR-014**, e nenhum código de tela começa antes dela.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, alvo `chrome108`) em `tv-web/` e `portal-web/`; Python 3.13 + FastAPI (async) em `api/` (`app/portal/`, isolado do fallback).

**Primary Dependencies**: Dexie (IndexedDB) e `useRemoteNav`/`useTvKeyNav` na TV; Firestore (google-cloud-firestore) + `cryptography` (AES-GCM, HMAC) no portal; `webapis.productinfo`/`webapis.network` do Tizen.

**Storage**: TV — `db.sources` (credenciais locais, ADR-008/010) e `portalDevice` (identidade). Portal — Firestore `devices`, `identityClaims`, `configurations`/`configurationVersions` (cifradas), novo `displayIdClaims`.

**Testing**: Vitest (projetos `dom`/`node`), Playwright E2E (`tv-web/e2e/*.mjs`, `portal-web/e2e/*.spec.ts`), pytest + emulador Firestore (`PORTAL_TEST_FIRESTORE=1`), Ruff; pilha local `npm run dev:portal`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, origem `file://`); portal em Cloud Run (staging `ccplaytv-511322`).

**Performance Goals**: tela Adicionar com ID/chave/QR em ≤2 s online (QR depende do convite); Recarregar aplica em ≤10 s respeitando o limite de pull de 1/10 s (SC-005).

**Constraints**: textos ≥20 px e tokens V14; todo estado focável; ratchet de arquitetura (sem import feature→feature novo, teto de linhas); contratos travados de 023/037/045/069 preservados (037 com emenda autorizada); segredo nunca em log/URL/QR/erro; `config.xml` só muda pelo privilégio de rede validado (FR-025).

**Scale/Scope**: 1 TV por chave; dezenas a centenas de TVs no staging/produção inicial (069).

## Decisões Invariantes

- **D-001 — Gate normativo**: constitution 1.10.0 e ADR-014 aprovados antes de qualquer task de US1–US3. Escopo da emenda: (a) chave do dispositivo exibida o tempo todo **somente na tela Adicionar** da TV; (b) painel autenticado daquela TV recebe os valores salvos das listas; (c) a TV mostra credenciais locais na edição da própria lista, com olho. Nada mais é relaxado (logs, URL, QR, cards, erros, exportação continuam proibidos).
- **D-002 — ID do dispositivo (`displayId`)**: formato `XX:XX:XX:XX:XX:XX` em maiúsculas. Fonte: MAC lido na TV e normalizado por `displayIdFromMac` (recusa zerado, broadcast, multicast e inválido). Sem MAC útil, ou se o ID já pertence a outra TV, o **servidor** gera um ID aleatório *localmente administrado* (bit 0x02 do 1º octeto ligado, unicast) — nunca colide com MAC real de fabricante. Unicidade por documento `displayIdClaims/{hmac(displayId)}` na mesma transação do cadastro. Não é segredo e não autentica sozinho; `deviceId` interno não muda.
- **D-003 — Chave do dispositivo**: 10 dígitos de CSPRNG (`secrets.randbelow(10**10)`, zeros à esquerda), gerada pelo servidor no cadastro e em cada rotação `revoke`; servidor guarda só HMAC (`device_key_hash`); a TV guarda em claro no IndexedDB (já hoje). O campo continua `deviceKey`; o formato muda de token 256 bits para `^\d{10}$`.
- **D-004 — Upgrade de TV já cadastrada**: registro local sem `displayId` ou com chave fora do formato dispara **uma** rotação `revoke` (fluxo write-ahead existente) quando a tela Adicionar abre online; nunca re-enrollment, nunca apaga listas/licença.
- **D-005 — Entrada manual no painel**: somente `displayId` + chave. Limites por par (displayId+IP), por dispositivo, por IP e global, chaveados pelo HMAC do `displayId`; recusa uniforme `401 invalid_credentials` (não revela se o ID existe). Nova chave (`revoke`) eleva `authEpoch` e derruba sessões.
- **D-006 — Valores salvos no painel**: rota nova `GET /portal/v1/configurations/{sourceId}/values`, só para sessão `manage` válida **da mesma TV**; decifra transitoriamente a versão corrente (mesma rotina de `configuration_delivery.pull`); allowlist de campos do tipo; 404 para fonte excluída/tombstone; `Cache-Control: no-store` (middleware); nunca logado. Salvar continua pelo protocolo de operações da 069.
- **D-007 — Formulário da TV**: evolui `AddSourceScreen` (sem tela nova). Rótulos atuais preservados (contratos 037/045): Nome da lista, Servidor, Usuário, Senha, URL M3U. **Um único olho do formulário** ("Ocultar dados"/"Mostrar dados") alterna Servidor/URL, Usuário e Senha; padrão visível. Edição pré-preenche com os valores locais de `db.sources`. "Como funciona" sai; a coluna da esquerda vira o slot do celular.
- **D-008 — Composição sem import cruzado**: `AddSourceScreen` (features/import) recebe o painel do celular como `phonePanel?: ReactNode`; quem monta `PortalPairingPanel` (features/portal) é o `App`. Sem portal configurado, a coluna mostra estado honesto e focável (sem ID/chave/QR inventados).
- **D-009 — Entrada única**: o canto "Adicionar pelo site" sai dos perfis; "Adicionar lista" é o caminho. Configurações → "Portal & licença" permanece para licença, revogar e código de recuperação.
- **D-010 — Saída**: ação nova `leave-list` no `appNav` (Início → perfis como base, foco por id na lista que estava aberta, `activeSource` nulo). `back` na base continua no-op (contrato 023). `ExitModal` só nos perfis base.
- **D-011 — Recarregar**: dispara um ciclo imediato do agente (`syncNow`), com o mesmo mutex e respeitando `Retry-After`/limite de pull; mostra resultado ou código de erro. Não liga polling contínuo fora da tela.
- **D-012 — QR**: convite efêmero/uso único da 069, gerado ao abrir a tela e renovado só enquanto ela está aberta; nunca contém chave, ID ou credencial.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | ID + chave são da TV, não conta pessoal; listas locais continuam sem portal. |
| Segredos Fora dos Clientes e dos Logs | **VIOLA** (3 cláusulas) | Condicionado a 1.10.0 | Chave sempre visível (FR-004), painel recebe segredo salvo (FR-015), credencial visível na TV (FR-010/011). Decisão explícita do usuário em 2026-10-13; tratada como Fase 1 bloqueante (D-001), Complexity Tracking e R-001. |
| Categorias da Fonte Preservadas | OK | OK | Não toca catálogo. |
| IA/Classificação não inventam | OK | OK | — |
| Comandos Locais Independem de Rede | OK | OK | Formulário, olho e RETURN são locais; Recarregar é ação explícita. |
| Trailers/Metadados | N/A | N/A | — |
| Caminho Completo por Controle Remoto | OK | OK | Tela Adicionar e formulário 100% por setas/OK/RETURN; RETURN fecha camada (IME/confirmação) antes de sair. |
| Lista ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos | Atenção | OK | Estados sem portal/offline/erro do painel do celular têm Voltar/Recarregar focáveis (D-008). |
| Voltar Restaura Foco | Atenção | OK | `leave-list` foca a lista por id (C3). |
| Identidade de Reprodução | N/A | N/A | — |
| Progresso/Capacidades Reais | OK | OK | Sem portal: estado honesto, nunca dado inventado; Recarregar mostra resultado real. |
| Documentação Canônica | OK | OK | Emenda, ADR-014, docs/portal e README atualizados no Polish. |
| Restrições: plataforma/hardware | Atenção | OK | MAC depende de privilégio e da TV física (FR-025): sonda T003 e fallback D-002. |
| Fluxo: E2E antes da TV, revisão de segredos | OK | OK | E2E no dev server e no pacote `file://` antes da TV; revisão de segredos em T037. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/070-entrada-listas-gerenciador/
├── spec.md
├── plan.md                 # este arquivo
├── research.md             # MAC no Tizen, privilégio, formato da chave
├── data-model.md           # displayId, chave, claims
├── contracts/portal-api-070.md
├── logic/pareamento.md     # geração/normalização de ID, upgrade, limites
├── quickstart.md
├── contract-tests.lock
├── tasks.md
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── App.tsx                                   # monta PortalPairingPanel no slot; wiring leave-list
├── navigation/appNav.ts                      # ação leave-list (stub)
├── components/TextField.tsx                  # reveal controlado pelo formulário
├── features/import/AddSourceScreen.tsx       # 421/421 linhas: extrair campos
├── features/import/SourceFormFields.tsx      # novo (extração)
├── features/portal/PortalPairingPanel.tsx    # novo (stub)
├── features/profiles/ProfilesScreen.tsx      # remove canto "Adicionar pelo site"
├── features/home/HomeScreen.tsx              # RETURN → onLeaveList
├── features/settings/PortalLicensePanel.tsx  # permanece (licença/revogar/código)
├── lib/catalog/sourceRepository.ts           # leitura de valores para edição
├── lib/portal/{displayId.ts,deviceIdentity.ts,portalTables.ts,portalConnection.ts,portalAgent.ts}
└── lib/i18n/messages/{portal.ts,sources.ts}
tv-web/e2e/{portal-dev-server.mjs,portal-pacote-file.mjs,entrada-listas-gerenciador.mjs,legibilidade-tv.mjs}
portal-web/src/features/{SessionPage.tsx,SourceManager.tsx,SourceForm.tsx,LicensePage.tsx,api.ts}
portal-web/e2e/gerenciador.spec.ts
api/app/portal/{models.py,display_id.py,enrollment.py,access_rotation.py,auth.py,configuration_delivery.py,routes/auth.py,routes/operations.py}
api/tests/portal/{test_pairing.py,test_configuration_values.py}
CCPlayTv/config.xml                           # privilégio de rede (após T003)
.planning/memory/constitution.md · sdd/adr/ADR-014-*.md
```

**Structure Decision**: monorepo real com TV (`tv-web/` → `CCPlayTv/`), portal web (`portal-web/`) e API do portal (`api/app/portal/`). A feature toca os três; o fallback `api/main.py` e o catálogo não mudam.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Chave do dispositivo permanente e sempre visível (Segredos) | Decisão do usuário: entrada estilo gerenciador, digitável no celular sem ação extra | PIN efêmero e chave revelada por ação foram oferecidos e recusados em 2026-10-13 |
| Painel recebe credenciais salvas (Segredos, exceção remota da 069) | Decisão do usuário: editar no painel vendo a senha, como no app de referência | "Em branco preserva" foi oferecido e recusado |
| Credencial visível na TV (Segredos, exceção ADR-008/010) | Digitar com o controle sem ver o texto causa erro; edição precisa mostrar o que está salvo | Mascarado por padrão foi oferecido e recusado |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
# TV
cd tv-web; npx tsc -b; npm run lint; npx vitest run <arquivos>; npm run test; npm run build; npm run build:tizen
npm run dev:portal                       # pilha local (emulador + API + portal-web + TV commercial) em :5173
node e2e/portal-dev-server.mjs           # E2E dev server real (opt-in)
node e2e/portal-pacote-file.mjs          # E2E do pacote file:// contra staging (após build:tizen:commercial)
npm run test:e2e                         # gate final com `npm run dev` ativo
# API
cd api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider --basetemp=<dir acessível>; .venv\Scripts\ruff.exe check app/portal tests/portal
# Portal
cd portal-web; npm run lint; npm run test; npm run build; npm run test:e2e
# Travas
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador
```

Regras críticas do servidor (sessão manual por displayId, devolução de valores só à própria TV) **não** cabem na trava (ela conta só `it`/`test` JS/TS): viram tasks de pytest obrigatórias (T009, T031) com o mesmo peso de pronto.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tv-web/src/features/portal/PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx`, `tv-web/src/features/import/AddSourceScreen.entrada-listas-gerenciador.contract.test.tsx`, `tv-web/src/navigation/appNav.entrada-listas-gerenciador.contract.test.ts`, `tv-web/src/lib/portal/pairingIdentity.entrada-listas-gerenciador.contract.test.ts`

Comando (em `tv-web/`): `npx vitest run src/features/portal/PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx src/features/import/AddSourceScreen.entrada-listas-gerenciador.contract.test.tsx src/navigation/appNav.entrada-listas-gerenciador.contract.test.ts src/lib/portal/pairingIdentity.entrada-listas-gerenciador.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `mostra ID no formato MAC, chave de 10 dígitos, endereço do painel e QR…` | US1/AC1, FR-002/003/004/023 | Fase 3 | `Error: invalid_device_identity` (validação atual de 43 caracteres) |
| C2 `editar lista Xtream mostra servidor, usuário e senha salvos…` | US2/AC1-AC3, FR-010/011 | Fase 4 | asserção `toHaveValue(senha-secreta-123)` |
| C3 `RETURN no Início sai da lista para a tela de listas…` | US4/AC1-AC2, FR-018/019 | Fase 6 | `Error: not implemented` |
| C4 `normaliza variantes de MAC…` | FR-003, edge case MAC | Fase 2 | `Error: not implemented` |
| C5 `persiste ID exibido e chave numérica de 10 dígitos…` | FR-003/004, Constitution: Segredos | Fase 2 | `Error: invalid_device_identity` |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/portal/displayId.ts` (`displayIdFromMac`, `DISPLAY_ID_PATTERN`), `tv-web/src/features/portal/PortalPairingPanel.tsx` (props + throw), `tv-web/src/navigation/appNav.ts` (ação `leave-list` + `case` que lança), `tv-web/src/lib/portal/portalTables.ts` (`displayId?`), `tv-web/src/lib/portal/deviceIdentity.ts` (`displayId` no `CredentialIssuance`).

Travas de outras features afetadas: **037** (`AddSourceScreen.entrada-listas.contract.test.tsx` teste 2 — emenda autorizada, T014), **045** e **023/037** de perfis/appNav (devem continuar verdes sem edição), **069** (intocada).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Normas | Constitution 1.10.0 e ADR-014 aplicadas (exceção de pareamento a/b/c). |
| Plataforma | Sonda mede o MAC; execução na TV física pendente (T003). |
| Identidade | Fase 2 concluída: ID formato MAC + chave de 10 dígitos no servidor e na TV; upgrade D-004; sessão manual por ID. API 117/117, TV lib/portal 57/57. |
| Tela Adicionar (US1) | Fase 3 concluída: coluna real "Pelo celular" (ID/chave/URL/QR, Recarregar, nova chave), cadastro em duas colunas, canto do portal removido dos perfis, emenda 037 aplicada. E2E da US1 PASS. |
| Próximas fases | US2 (formulário/olho/valores salvos), US3 (painel web), US4 (saída) e Polish — não iniciadas. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Três cláusulas de Segredos violadas por decisão do usuário (2026-10-13) | Crítico (normativo) | Fase 1 bloqueante: constitution 1.10.0 + ADR-014 com risco aceito e mitigações (D-001). |
| R-002 | Contrato travado 037 (teste 2) exige mock "Em breve" | Bloqueia US1 | Emenda mínima **autorizada pelo usuário em 2026-10-13**: o teste passa a exigir estado honesto sem portal; regravar só a trava 037 (T014). |
| R-003 | MAC indisponível no Tizen 9, exige privilégio ou varia por modelo | Médio | Sonda na TV física (T003) antes de mudar `config.xml`; fallback D-002 sempre presente. |
| R-004 | Chave numérica permanente exposta em foto/tela (risco aceito) | Alto | 10 dígitos, limites por ID/IP/global, recusa uniforme, "Gerar nova chave" (revoke), sessão curta. |
| R-005 | Credenciais salvas trafegam ao navegador (risco aceito) | Alto | Só sessão `manage` da mesma TV, no-store, sem log, allowlist de campos; teste de dono (T031). |
| R-006 | Upgrade da TV do usuário (registro antigo) | Médio | D-004: uma rotação `revoke`; listas/licença preservadas; validar na TV física (T042). |
| R-007 | `AddSourceScreen`/`ProfilesScreen` no teto de 421 linhas | Médio | Extrair `SourceFormFields.tsx`; remover canto do portal nos perfis libera linhas. |
| R-008 | Ratchet proíbe `features/import` → `features/portal` | Médio | Slot `phonePanel` montado pelo `App` (D-008). |
| R-009 | `HomeScreen.test.tsx` (não travado) espera "Sair" no Início | Baixo | Atualizar para `leave-list` (T034); contrato 023 do redutor continua verde. |
| R-011 | `licenseRuntime.test.ts` falha sob carga na suíte completa (timeout de 5 s no `import()` dinâmico) e passa isolado | Baixo (teste instável, não tocado pela 070) | Aberto: acompanhar no gate final (T039); se repetir, investigar via `sdd-bugfix` em vez de afrouxar timeout. |
| R-010 | TV nova falando com serviço anterior à 070 (staging atual) receberia chave longa | Médio | Decidido na Fase 2: a TV aceita chave de 10 dígitos **ou** o token legado; o legado dispara o upgrade D-004 quando o serviço novo estiver publicado (T041). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-13 | Fase 1 | Constitution 1.10.0 + ADR-014 + CLAUDE.md; sonda do MAC 4/4. | T003 na TV física (build de diagnóstico não autorizado ainda). |
| 2026-10-13 | Fase 2 | ID/chave/upgrade/sessão manual no servidor e na TV; C4/C5 2/2; API 117/117. | Staging ainda emite chave longa até T041 (R-010). |
| 2026-10-13 | Fase 3 (US1) | Painel real + syncNow + AddSourceScreen em duas colunas + emenda 037; C1 verde; suíte 3319/3323; E2E US1/portal/licença PASS. | Instabilidade de licenseRuntime.test.ts sob carga (R-011); T003/T017 na TV. |

**PRÓXIMO**: Fase 4 (US2) — T020 olho único do formulário em TextField/SourceFormFields (contrato C2), T021 valores salvos na edição, T022 campos grandes. Execução contínua parou ao fim da Fase 3, como pedido.

## Arquivos Principais

- tv-web/src/features/portal/{PortalPairingPanel.tsx,portalPairing.css} · tv-web/src/lib/portal/{portalAgent.ts,portalRuntime.ts,portalConnection.ts,displayId.ts}
- tv-web/src/features/import/{AddSourceScreen.tsx,SourceFormFields.tsx} · tv-web/src/App.tsx · tv-web/src/features/profiles/ProfilesScreen.tsx
- api/app/portal/{display_id.py,enrollment.py,access_rotation.py,auth.py} · api/tests/portal/test_pairing.py
- tv-web/e2e/{entrada-listas-gerenciador.mjs,lib/portalStack.mjs,lib/portal.mjs}

## Cuidados para Retomada

- Arquivos da TV usam LF ou CRLF misturados: substituições por PowerShell com `\n` podem não casar — prefira o Edit.
- pytest do portal: emulador com Java 21 (`JAVA_HOME`) e `--basetemp` num diretório acessível; os E2E de pilha local exigem as portas 8085/3001/5174/5176 livres (matar o emulador avulso antes).
- **Ordem de publicação**: publicar a API da 070 no staging (T041) ANTES de instalar na TV um pacote com a 070. Com o serviço antigo, `ensurePairing()` recebe de novo a chave longa sem `displayId` e faria uma rotação `revoke` a cada abertura da tela Adicionar.
- Abrir o painel de licença nos E2E agora é por `e2e/lib/portal.mjs` (Configurações → Portal & licença); o canto "Adicionar pelo site" não existe mais.
