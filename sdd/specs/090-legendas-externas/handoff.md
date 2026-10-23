# Handoff — 090-legendas-externas (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca` (no fim do plano havia mudanças não commitadas de outras frentes
  — backlog, `sdd/bugs/*`, screenshots — que não são desta feature).
- Stack: `tv-web/` React 19 + TS + Vite (TV Tizen, IndexedDB/Dexie) e `api/app/portal/` FastAPI + Firestore (Cloud Run).
- Próximo comando: `/sdd-execute 090-legendas-externas`. Backlog: **Planejada**.
- Origem: assessment `sdd/assessments/opensubtitles-legendas-externas` (veredito **needs-clarification**); o usuário
  decidiu especificar com gates (G-1 cota/termos, G-2 TV, G-3 constitution, G-4 BYOK). ADR-021 é a decisão de
  arquitetura.
- A `spec.md` foi alterada **durante o plano** (pedido do usuário): FR-025, SC-009 e G-2 agora incluem desempenho.
  Releia-a.

## O que a feature entrega

- **US1 (P1)**: no painel "Áudio e legendas" do player (filme/episódio), "Buscar legenda online" → diálogo com
  idioma (pt-BR/en/es, começa no do app) → resultados → OK aplica. O **app desenha** a legenda pelo tempo da mídia
  (driver + `SubtitleOverlay` da 029), **não** o `setExternalSubtitlePath` do AVPlay. Uma legenda por vez.
- **US2 (P2)**: memória por item (identidade lógica) no IndexedDB, reaplicada ao retomar **sem rede**; no próximo
  episódio só aparece um **atalho**, nunca busca sozinha.
- **US3 (P3)**: chave pessoal do OpenSubtitles e/ou do SubDL na aba Integrações, direto da TV para aquele
  fornecedor — **implementar** (Fase 5); só a oferta na loja depende do G-4.
- Serviço: duas rotas novas (`device/subtitles/search|download`) que consultam **OpenSubtitles e SubDL** em paralelo,
  chaves padrão só no servidor, só TV com licença/teste vigente, **10 downloads/dia (somando os dois) e 60 buscas/h
  por TV** (provisórios, configuráveis).
- **Desempenho (pedido explícito do usuário):** nenhuma lentidão. Nada da 090 fora do player e nada antes do primeiro
  `playing`; regressão medida na TV reprova.

## Leitura obrigatória, em ordem

1. `spec.md` — requisitos, gates, FR-025/SC-009 (desempenho).
2. `plan.md` — decisões D-001…D-012, Constitution Check, riscos R-001…R-009.
3. `tasks.md` — fases; a T001 vem antes de tudo que chama o serviço.
4. `logic/emenda-constitution.md` — texto exato da emenda 1.15.0 → 1.16.0 que a T001 aplica **só com aprovação do
   usuário**.
5. `logic/legenda-externa.md` — parse (§1), driver (§2), alvo/pedido (§3), painel (§4), hook (§5), memória (§6),
   cliente (§7), **tetos do ratchet (§8)**, **desempenho (§9)**.
6. `contracts/servico-legendas.md` — rotas, corpo, códigos de erro, regra de host, limites.
7. `data-model.md` — tabela `externalSubtitles` (v27), configuração do serviço.
8. `quickstart.md` — A (automático), B (navegador), C (TV, G-2/SC-009).
9. `.planning/memory/constitution.md` — em especial "Comandos Locais…" (lista fechada da 071) e "Segredos".

## Testes de contrato

Travados em `sdd/specs/090-legendas-externas/contract-tests.lock` (5/5):

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/subtitles/subtitleFile.legendas-externas.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/subtitles/externalCueDriver.legendas-externas.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/subtitles/subtitleTarget.legendas-externas.contract.test.ts` | 1 | 2 |
| `tv-web/src/components/PlayerLayer.legendas-externas.contract.test.tsx` | 2 | 3 |

- Rodar: `cd tv-web; npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx src/lib/subtitles`
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 090-legendas-externas`
- Travas de outras features que esta pode quebrar: **029** (`PlayerLayer.audio-legendas-info.contract.test.tsx` —
  sem a prop nova, "Áudio e legendas — indisponível" num motor sem faixas), **041** e **042** (player). Rodar
  `check-contract-tests.ps1 -Slug 029-audio-legendas-info-player` (e 041, 042) em toda fase que toca o player.

## Stubs criados

- `tv-web/src/lib/subtitles/types.ts` — tipos e portas **definitivos** (o contrato importa); só
  `subtitleLanguageForApp` é stub.
- `tv-web/src/lib/subtitles/subtitleFile.ts` — `ExternalCue`, `SubtitleFileError` reais; `parseSubtitleFile` stub.
- `tv-web/src/lib/subtitles/externalCueDriver.ts` — interface real; `createExternalCueDriver` stub.
- `tv-web/src/lib/subtitles/subtitleTarget.ts` — `BuiltSearchRequest` real; `buildSearchRequest` e
  `resolveSubtitleTarget` stubs.
- `tv-web/src/components/player/playerLayerTypes.ts` — prop `externalSubtitles?: ExternalSubtitlesDeps | null`
  declarada e **ainda não lida**; tirar a nota "STUB" na T023.

## Armadilhas já mapeadas

- **Constitution primeiro**: sem a T001 aprovada, não escreva T010/T014/T015 nem a Fase 3 — é violação (R-001).
  Mostre o texto ao usuário; nenhum skill edita a constitution sem aprovação.
- **Tetos do ratchet** (`npm run lint`): `PlayerLayer.tsx` 325, `usePlayerPanels.ts` 367, `usePlayerKeyboard.ts`
  406, `usePlayerSession.ts` 592, `db.ts` 854, `MovieDetailScreen` 662, `SeriesDetailScreen` 1005 — todos no limite.
  Extraia (`PlayerPanelsView.tsx`, `panelControls.ts`) em vez de crescer; **nunca** suba o baseline. Não toque
  `usePlayerSession.ts`, `db.ts` nem as telas (D-009/D-010).
- **Desempenho (D-012, `logic §9`)**: alvo e memória lidos **num único passo ocioso depois do primeiro `playing`**
  (`requestIdleCallback` com timeout 1500; sem a API — jsdom —, `setTimeout(…, 0)`: o contrato espera com `waitFor`
  de 1 s, então **não** use 1000 ms no fallback). Driver com um timer, `driver.update` sem `setState`. Nenhum import
  de `lib/subtitles` em `features/`.
- **`entitlement()` do serviço grava** (inicia teste, gira geração): use um método só de leitura (R-007).
- **`portalClient`** só lê o `code` do corpo em 401/409/503 — a 090 precisa de 429 também, e os códigos novos têm de
  entrar na lista fechada, senão viram `service_unavailable`.
- **Ajuste da externa (ampliado a pedido do usuário)**: com a externa ativa, uma linha só `delay:external`
  (`role="slider"`), ←/→ ±500 ms grampeado em **±10 s**, OK volta a 0, gravação adiada 800 ms (`logic §4.1`, T032 na
  Fase 3). O painel de faixas hoje **ignora ←/→** — libere só nessa linha. As cinco opções da 029 continuam iguais
  para a embutida (contrato travado da 029). O overlay recebe `delayMs = 0` quando a fonte é o driver; não grave o
  ajuste da externa em `TrackChoice`.
- **SubDL (incluído em 2026-10-22, depois do plano inicial)**: dois fornecedores numa lista única; resultado com
  `id` opaco (`os:…`/`sd:…`) e `provider` — os tipos e o contrato do player foram **retravados** por isso
  (`fileId: number` → `id: string`, `search` devolve `{ results, unavailable }`). A busca do SubDL **devolve a URL de
  download com a chave padrão embutida** (`?api_key=`): o adaptador do serviço extrai só `<a>-<b>` e descarta a URL —
  nunca para a TV, nunca em log (R-012). Download do SubDL é **ZIP** (pacotes de temporada aparecem na busca de
  episódio): extração em memória com limites (contrato §3). Doc oficial do SubDL dá 403 para ferramentas: confira no
  navegador antes da T014b (R-017); a prova do PC está em `evidencias/subdl-prova-pc.json`.
- **BYOK dos dois é P3 implementada** (Fase 5, T043–T053): chaves pessoais em tabela própria `subtitleCredentials`
  (não em `integrations`), aba Integrações, uso direto só para aquele fornecedor, "Usar o padrão do ccplayTv" só por
  ação. A emenda agora tem a exceção (l). Anunciar na loja depende do G-4 (o usuário informou que o OpenSubtitles
  aceita; o fórum dizia o contrário — anexar a evidência).
- **Casos de uso do usuário (2026-10-22)**: filme em inglês → escolher o idioma da legenda; alternar português ↔
  inglês; ativar e desativar. Memória por **item + idioma** (até 3, uma ativa), cada idioma vira uma opção
  "Externa — <idioma>"; reativar/alternar **sem rede**; só a ativa em RAM. **Condicional ao custo** (R-011,
  `logic §5.7`): > 60 KB por legenda gravada, troca > 100 ms na TV ou efeito no SC-009 ⇒ voltar a uma legenda por
  item. O `SubtitleStorePort` ganhou `list?` e `update(…, language?)` **opcionais** de propósito: o fake do contrato
  travado não os tem e precisa continuar satisfazendo o tipo — o hook cai para `load`/texto da sessão sem eles.
- **Descarte por `seq`** (FR-010): o serviço falso do contrato ignora `signal` — o descarte não pode depender de
  `abort` lançar.
- **IndexedDB**: `gunzipText` sempre fora de transação (regra da 082); a tabela nova não entra no backup 072
  (que enumera tabelas) mas entra em `sourceDeletionTables`.
- **Build base** (sem `VITE_PORTAL_ORIGIN`): a opção não existe — nada de "em breve" (feature 078).
- **Chave real**: está no `.env` da raiz como `OPEN_SUBTITLES_API_KEY`; nunca imprimir, nunca em teste
  automatizado (use `httpx.MockTransport`). Testes do portal precisam do emulador Firestore e
  `PORTAL_TEST_FIRESTORE=1`.
- **TV física**: pedir autorização **antes** de cada instalação (T002 e T042). A T002 ("antes") precisa vir antes da
  Fase 3 mudar o player; se negada, use as evidências da 089 e diga isso no G-2.
- **Sonda** (regra da 089): roteiro só com `→`/`↓`, senão mede a lista lateral.
- **E2E**: siga o padrão de `tv-web/e2e/legibilidade-tv.mjs` (~l.400–440): segundo Vite com `VITE_PORTAL_ORIGIN` de
  fixture + `context.route` para `/devices/enroll`, `/devices/recovery/ack` e `/device/subtitles/*`.

## Pendências do Analyze

- A1 (MEDIUM) — SC-001 (≤ 4 OK do painel até a legenda) não tem verificação explícita → contar as teclas no E2E da
  T036.
- A2 (MEDIUM) — a T011 cita "acesso local de licença" sem a função exata → usar a decisão do `licenseMonitor`
  (`lib/licensing/licenseRuntime.ts`); se não houver leitura síncrona barata, deixar `access` ausente (sempre
  "allowed") e confiar na recusa 409 do serviço, registrando em Riscos.
- A3 (MEDIUM) — edge case da spec "TV nunca pareada → soft disabled" contradiz o desenho: `connection.ready()`
  cadastra a TV na primeira busca (é ação da pessoa). Aceitar o cadastro implícito ou deixar soft disabled sem
  identidade — confirmar com o usuário na Fase 3 e registrar.
- A4 (LOW) — SC-003 (≤ 2 s para reaplicar) com o passo ocioso de até 1,5 s mais o parse é apertado → medir na T042.
- A5 (LOW) — T002 depende de autorização de instalação na TV antes da Fase 3 → se não houver, usar a 089 como base
  (registrado).

## Gate de pronto

- Contratos 5/5 verdes + travas íntegras (090, 029, 041, 042).
- `cd tv-web; npm run test; npm run lint; npm run build; npm run test:e2e` (com `npm run dev`) — inclui
  `legendas-externas` e `legibilidade-tv`.
- `cd api; uv run pytest tests/portal/test_subtitles.py` (emulador) e `uv run ruff check .`.
- `quickstart.md` A e B; revisão de segredos (T040).
- Docs no Polish: `CLAUDE.md` (versão da constitution + regra curta da 090), ADR-021 (nota), `docs/portal/operacao.md`.
- **TV física é gate obrigatório** (G-2 + SC-009, T042), não recomendação: sem a medição de desempenho dentro do
  ruído, a feature não fecha. G-1 (planos/cotas do OpenSubtitles **e do SubDL**) fica como pendência de oferta em produção; G-4
  (evidência de aceitação do BYOK de cada fornecedor) fica como pendência de anúncio na loja.
